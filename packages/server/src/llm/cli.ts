import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CliCall {
  prompt: string;
  /**
   * The voice the model speaks with (persona card, game rules). Travels via
   * --system-prompt-file so it replaces the CLI's own ~30k-token Claude Code
   * preamble instead of being buried under it.
   */
  system?: string;
  /** Omit for the session-default model; 'haiku' for chatter. */
  model?: 'haiku';
  timeoutMs?: number;
}

export type CliResult =
  | { ok: true; text: string; inputTokens: number; outputTokens: number }
  | { ok: false; reason: 'unauthenticated' | 'missing' | 'malformed' | 'timeout' | 'error'; detail: string };

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * The binary to run: the player's `claude` on PATH, or whatever
 * SKILL_VILLAGE_CLAUDE points at (a shim, a copy in an odd location, or a
 * test fake). The command is a vector so tests can inject
 * [node, fake-claude.mjs, behaviour] with no PATH games.
 */
export function defaultCliCommand(): string[] {
  const override = process.env.SKILL_VILLAGE_CLAUDE;
  return override ? [override] : ['claude'];
}

/**
 * One headless CLI call. The prompt travels on stdin — never argv — so there
 * is no quoting surface and no length limit. Output is ONE JSON object
 * (probed contract, claude 2.1.239, re-verified 2.1.241): failure is
 * `is_error: true`, which the real binary emits even with
 * `subtype: "success"`, so only `is_error` decides. An unauthenticated CLI
 * is its own failure kind because it decides the village's whole mode, not
 * just this call's outcome.
 *
 * The call is deliberately slim (measured against 2.1.241): `--tools=` and
 * `--setting-sources=` drop the ~30k tokens of tool schemas and preamble the
 * CLI otherwise ships with every -p call, MAX_THINKING_TOKENS=0 stops the
 * model spending hundreds of thinking tokens on a one-line quip, and
 * --no-session-persistence keeps village chatter out of the player's session
 * history. Together they took a real chat call from ~7.5s/$0.023 to
 * ~2.5s/$0.0016. The `=` forms matter: under shell:true a bare empty-string
 * arg would be lost when Node joins argv with spaces.
 *
 * The child's environment is scrubbed of nested-session markers — with them
 * present, a `claude` spawned from inside a Claude Code session refuses with
 * "Not logged in" and the village boots into silent-movie mode even though
 * the player is logged in.
 */
export async function runCli(command: readonly string[], call: CliCall): Promise<CliResult> {
  // The system prompt travels in a file, not argv: the card text is
  // model-written content, and argv must stay quoting-safe under shell:true.
  let systemFile: string | undefined;
  if (call.system !== undefined) {
    systemFile = join(tmpdir(), `skill-village-system-${randomUUID()}.txt`);
    try {
      await writeFile(systemFile, call.system, 'utf8');
    } catch (error) {
      return { ok: false, reason: 'error', detail: `system prompt file: ${String(error)}` };
    }
  }

  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, MAX_THINKING_TOKENS: '0' };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_SSE_PORT;

    // shell:true for the bare `claude` name, and for any .cmd/.bat shim: on
    // Windows those resolve through cmd.exe, which plain spawn cannot
    // execute — and since Node's CVE-2024-27980 fix, spawning a .cmd/.bat
    // directly without shell:true throws EINVAL *synchronously*, before any
    // event fires. Args carry no user content (the prompt is on stdin and
    // the system prompt in a file), so the shell sees only fixed flags and
    // one path of our own making — quoted, in case the temp dir has spaces.
    const useShell =
      process.platform === 'win32' &&
      (command[0] === 'claude' || /\.(cmd|bat)$/i.test(command[0] ?? ''));

    const args = [
      ...command.slice(1),
      '-p',
      '--output-format', 'json',
      '--max-turns', '1',
      '--tools=',
      '--setting-sources=',
      '--no-session-persistence',
      ...(systemFile ? ['--system-prompt-file', useShell ? `"${systemFile}"` : systemFile] : []),
      ...(call.model ? ['--model', call.model] : []),
    ];

    // The file must be gone by the time the promise resolves — a caller (or
    // test) observing the result must never see the prompt still on disk.
    const cleanup = async () => {
      if (systemFile) await unlink(systemFile).catch(() => {});
    };

    let child;
    try {
      child = spawn(command[0]!, args, {
        shell: useShell,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      // A synchronous throw (e.g. EINVAL spawning a .cmd/.bat without
      // shell:true) never fires an 'error' event, so it must be caught here
      // — otherwise it would reject the promise instead of yielding a typed
      // CliResult. No timer exists yet, so there's nothing to clear.
      void cleanup().then(() => resolve({ ok: false, reason: 'missing', detail: String(error) }));
      return;
    }

    let out = '';
    let err = '';
    let settled = false;
    const settle = (result: CliResult) => {
      if (!settled) {
        settled = true;
        void cleanup().then(() => resolve(result));
      }
    };

    const timer = setTimeout(() => {
      child.kill();
      settle({ ok: false, reason: 'timeout', detail: `no reply within ${call.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` });
    }, call.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      settle({ ok: false, reason: 'missing', detail: String(error) });
    });

    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });

    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed: unknown;
      try {
        parsed = JSON.parse(out);
      } catch {
        // Windows `shell: true` reports a missing binary as exit code 1 with
        // nothing useful on stdout rather than an 'error' event; treat
        // no-JSON-at-all + nonzero exit as the binary's absence or failure.
        settle(
          code === 0
            ? { ok: false, reason: 'malformed', detail: out.slice(0, 200) || err.slice(0, 200) }
            : { ok: false, reason: 'error', detail: err.slice(0, 200) || `exit ${code}` },
        );
        return;
      }

      const frame = parsed as {
        is_error?: unknown; result?: unknown;
        usage?: { input_tokens?: unknown; output_tokens?: unknown };
      };

      if (frame.is_error === true) {
        const text = typeof frame.result === 'string' ? frame.result : '';
        settle({
          ok: false,
          reason: /not logged in|\/login/i.test(text) ? 'unauthenticated' : 'error',
          detail: text.slice(0, 200),
        });
        return;
      }

      if (typeof frame.result !== 'string') {
        settle({ ok: false, reason: 'malformed', detail: 'no result field' });
        return;
      }

      settle({
        ok: true,
        text: frame.result,
        inputTokens: typeof frame.usage?.input_tokens === 'number' ? frame.usage.input_tokens : 0,
        outputTokens: typeof frame.usage?.output_tokens === 'number' ? frame.usage.output_tokens : 0,
      });
    });

    // A child that dies before stdin drains (a real claude failing at
    // startup, or our own timeout kill racing a buffered write) turns the
    // write below into an EPIPE 'error' event; the 'close' handler already
    // classifies the failure, so this must swallow it rather than let it
    // become an uncaught exception that takes the whole server down.
    child.stdin.on('error', () => {});
    child.stdin.write(call.prompt);
    child.stdin.end();
  });
}
