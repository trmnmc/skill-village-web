import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { runCli, defaultCliCommand } from './cli.js';
import { fakeCliCommand, resetFakeCli } from './testing/fake.js';

beforeEach(resetFakeCli);

describe('runCli', () => {
  it('returns the reply text and both token counts', async () => {
    const result = await runCli(fakeCliCommand('ok'), { prompt: 'hello village' });
    expect(result).toEqual({
      ok: true,
      text: 'echo:hello village',
      inputTokens: 120,
      outputTokens: 45,
    });
  });

  it('delivers the prompt over stdin, not argv', async () => {
    // The fake echoes the prompt back; a prompt with quotes and newlines
    // survives intact, which argv quoting on Windows would not guarantee.
    const tricky = `"quoted" & piped\nsecond line`;
    const result = await runCli(fakeCliCommand('ok'), { prompt: tricky });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe(`echo:${tricky.slice(0, 40)}`);
  });

  it('maps is_error to unauthenticated when the CLI says it is not logged in', async () => {
    const result = await runCli(fakeCliCommand('unauthenticated'), { prompt: 'hi' });
    expect(result).toMatchObject({ ok: false, reason: 'unauthenticated' });
  });

  it('maps a missing binary to missing, not a crash', async () => {
    const result = await runCli(['definitely-not-a-real-binary-4471'], { prompt: 'hi' });
    expect(result).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('resolves rather than throwing for a nonexistent .cmd/.bat shim path', async () => {
    // On win32 this path takes the shell:true branch (shell reports a
    // nonzero exit, mapped to 'error'); elsewhere it takes the non-shell
    // branch (spawn emits 'error', mapped to 'missing'). Either way it must
    // resolve to a typed CliResult, never reject the promise — that was the
    // bug: spawning a .cmd without shell:true throws EINVAL synchronously.
    const result = await runCli(['C:/definitely/not/here/claude-shim.cmd'], { prompt: 'hi' });
    expect(result.ok).toBe(false);
  });

  it('maps non-JSON stdout to malformed', async () => {
    const result = await runCli(fakeCliCommand('garbage'), { prompt: 'hi' });
    expect(result).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('maps a nonzero exit with no JSON to error', async () => {
    const result = await runCli(fakeCliCommand('exit-2'), { prompt: 'hi' });
    expect(result).toMatchObject({ ok: false, reason: 'error' });
  });

  it('kills a hung child and reports timeout', async () => {
    const started = Date.now();
    const result = await runCli(fakeCliCommand('hang'), { prompt: 'hi', timeoutMs: 300 });
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('passes the slim transport flags and a scrubbed environment', async () => {
    // A server started from inside a Claude Code session leaks the nested-
    // session markers into the child, which made the CLI refuse with "Not
    // logged in"; scrubbing them is what lets the village chat from anywhere.
    const before = process.env.CLAUDECODE;
    process.env.CLAUDECODE = '1';
    try {
      const result = await runCli(fakeCliCommand('inspect'), { prompt: 'hi' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const seen = JSON.parse(result.text);
      expect(seen.argv).toEqual(expect.arrayContaining(['--tools=', '--setting-sources=', '--no-session-persistence']));
      expect(seen.env.CLAUDECODE).toBeNull();
      expect(seen.env.CLAUDE_CODE_ENTRYPOINT).toBeNull();
      expect(seen.env.CLAUDE_CODE_SSE_PORT).toBeNull();
      expect(seen.env.MAX_THINKING_TOKENS).toBe('0');
    } finally {
      if (before === undefined) delete process.env.CLAUDECODE;
      else process.env.CLAUDECODE = before;
    }
  });

  it('carries the system prompt in a temp file and removes it afterwards', async () => {
    const system = 'You are Finch.\nSpeak in "short" sentences & stay in character.';
    const result = await runCli(fakeCliCommand('inspect'), { prompt: 'hi', system });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seen = JSON.parse(result.text);
    expect(seen.system).toBe(system);
    expect(seen.prompt).toBe('hi');
    expect(existsSync(seen.systemFile)).toBe(false);
  });

  it('omits --system-prompt-file when no system prompt is given', async () => {
    const result = await runCli(fakeCliCommand('inspect'), { prompt: 'hi' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seen = JSON.parse(result.text);
    expect(seen.systemFile).toBeNull();
    expect(seen.argv).not.toContain('--system-prompt-file');
  });
});

describe('defaultCliCommand', () => {
  it('is the plain claude binary by default', () => {
    delete process.env.SKILL_VILLAGE_CLAUDE;
    expect(defaultCliCommand()).toEqual(['claude']);
  });

  it('honours the SKILL_VILLAGE_CLAUDE override', () => {
    process.env.SKILL_VILLAGE_CLAUDE = 'C:/tools/claude-shim.cmd';
    expect(defaultCliCommand()).toEqual(['C:/tools/claude-shim.cmd']);
    delete process.env.SKILL_VILLAGE_CLAUDE;
  });
});
