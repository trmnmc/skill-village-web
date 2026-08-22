import { spawn } from 'node:child_process';

export interface CliCall {
  prompt: string;
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
 * (probed contract, claude 2.1.239): failure is `is_error: true`, which the
 * real binary emits even with `subtype: "success"`, so only `is_error`
 * decides. An unauthenticated CLI is its own failure kind because it decides
 * the village's whole mode, not just this call's outcome.
 *
 * Note for anyone running the server from inside a Claude Code session: a
 * nested `claude` reports "Not logged in" by design, and the village boots
 * into silent-movie mode. Develop chat from a plain terminal.
 */
export function runCli(command: readonly string[], call: CliCall): Promise<CliResult> {
  return new Promise((resolve) => {
    const args = [
      ...command.slice(1),
      '-p',
      '--output-format', 'json',
      '--max-turns', '1',
      ...(call.model ? ['--model', call.model] : []),
    ];

    // shell:true for the bare `claude` name, and for any .cmd/.bat shim: on
    // Windows those resolve through cmd.exe, which plain spawn cannot
    // execute — and since Node's CVE-2024-27980 fix, spawning a .cmd/.bat
    // directly without shell:true throws EINVAL *synchronously*, before any
    // event fires. Args carry no user content (the prompt is on stdin), so
    // the shell sees only fixed flags.
    const useShell =
      process.platform === 'win32' &&
      (command[0] === 'claude' || /\.(cmd|bat)$/i.test(command[0] ?? ''));

    let child;
    try {
      child = spawn(command[0]!, args, {
        shell: useShell,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      // A synchronous throw (e.g. EINVAL spawning a .cmd/.bat without
      // shell:true) never fires an 'error' event, so it must be caught here
      // — otherwise it would reject the promise instead of yielding a typed
      // CliResult. No timer exists yet, so there's nothing to clear.
      resolve({ ok: false, reason: 'missing', detail: String(error) });
      return;
    }

    let out = '';
    let err = '';
    let settled = false;
    const settle = (result: CliResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
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

    child.stdin.write(call.prompt);
    child.stdin.end();
  });
}
