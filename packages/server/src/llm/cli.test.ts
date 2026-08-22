import { describe, it, expect, beforeEach } from 'vitest';
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
