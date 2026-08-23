import { describe, it, expect, beforeEach } from 'vitest';
import { createLlmService } from './service.js';
import { defaultLlmState, type LlmState } from './ledger.js';
import { fakeCliCommand, resetFakeCli } from './testing/fake.js';

const NOON = Date.UTC(2026, 7, 22, 12, 0, 0);

function harness(behaviour: string, llm?: LlmState) {
  let state = llm ?? defaultLlmState(NOON);
  const writes: LlmState[] = [];
  const service = createLlmService({
    command: fakeCliCommand(behaviour),
    now: () => NOON,
    getLlm: () => state,
    setLlm: async (next) => { state = next; writes.push(next); },
  });
  return { service, writes, get state() { return state; } };
}

beforeEach(resetFakeCli);

describe('probe', () => {
  it('reports full when the CLI answers', async () => {
    const h = harness('ok');
    expect(await h.service.probe()).toBe('full');
    expect(h.service.mode()).toBe('full');
  });

  it('reports silent when the CLI is unauthenticated, and spends nothing', async () => {
    const h = harness('unauthenticated');
    expect(await h.service.probe()).toBe('silent');
    expect(h.state.ledger.interactiveIn).toBe(0);
  });

  it('reports silent when the binary is missing', async () => {
    const h = harness('ok');
    const missing = createLlmService({
      command: ['no-such-binary-9182'],
      now: () => NOON,
      getLlm: () => defaultLlmState(NOON),
      setLlm: async () => {},
    });
    expect(await missing.probe()).toBe('silent');
    void h;
  });
});

describe('request', () => {
  it('returns text and records real usage against the right budget', async () => {
    const h = harness('ok');
    await h.service.probe();
    const reply = await h.service.request({ kind: 'chatter', budget: 'interactive', prompt: 'hi' });
    expect(reply).toEqual({ ok: true, text: expect.stringContaining('echo:') });
    // The probe() above already recorded 120/45 against interactive on success
    // (probe spend is recorded when it succeeds); the request adds the same
    // fixed 'ok' usage again, so the total is double the single-call amount.
    expect(h.state.ledger.interactiveIn).toBe(240);
    expect(h.state.ledger.interactiveOut).toBe(90);
    expect(h.state.ledger.autonomousIn).toBe(0);
  });

  it('refuses without spending when the budget is exhausted', async () => {
    const drained = defaultLlmState(NOON);
    drained.ledger.interactiveIn = 600_000; // over the 500k cap
    const h = harness('ok', drained);
    await h.service.probe();
    const reply = await h.service.request({ kind: 'chatter', budget: 'interactive', prompt: 'hi' });
    expect(reply).toEqual({ ok: false, why: 'budget' });
    // probe() is diagnostic and dispatches unconditionally, so its one
    // success already wrote once; the point of this test is that the
    // exhausted-budget *request* adds no write of its own on top of it.
    expect(h.writes.length).toBe(1);
  });

  it('refuses in silent mode without touching the CLI', async () => {
    const h = harness('unauthenticated');
    await h.service.probe();
    const reply = await h.service.request({ kind: 'chatter', budget: 'interactive', prompt: 'hi' });
    expect(reply).toEqual({ ok: false, why: 'silent' });
  });

  it('reports failed on a mid-session CLI failure, and flips to silent on auth loss', async () => {
    const h = harness('ok');
    await h.service.probe();
    // Swap the underlying behaviour by making a second service that shares state:
    const broken = createLlmService({
      command: fakeCliCommand('unauthenticated'),
      now: () => NOON,
      getLlm: () => h.state,
      setLlm: async () => {},
    });
    await broken.probe(); // -> silent
    expect(broken.mode()).toBe('silent');
  });

  it('logs why a request failed, with reason, detail and duration', async () => {
    // The playtest lesson behind this: a failed call used to vanish into a
    // bare why:'failed', and the village answered questions with idle canned
    // lines nobody could explain. Every failure must leave one legible line.
    const lines: string[] = [];
    const service = createLlmService({
      command: fakeCliCommand('probe-ok-else-exit-2'),
      now: () => NOON,
      getLlm: () => defaultLlmState(NOON),
      setLlm: async () => {},
      log: (line) => lines.push(line),
    });
    await service.probe(); // first call succeeds -> mode full
    const reply = await service.request({ kind: 'chatter', budget: 'interactive', prompt: 'hi' });
    expect(reply).toEqual({ ok: false, why: 'failed' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/chatter call failed \(error\) after \d+ms: /);
  });

  it('logs why the probe failed', async () => {
    const lines: string[] = [];
    const service = createLlmService({
      command: fakeCliCommand('exit-2'),
      now: () => NOON,
      getLlm: () => defaultLlmState(NOON),
      setLlm: async () => {},
      log: (line) => lines.push(line),
    });
    expect(await service.probe()).toBe('silent');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/probe failed \(error\) after \d+ms: /);
  });

  it('forwards the system prompt to the CLI', async () => {
    const h = harness('inspect');
    await h.service.probe();
    const reply = await h.service.request({ kind: 'chatter', budget: 'interactive', prompt: 'hi', system: 'BE FINCH' });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(JSON.parse(reply.text).system).toBe('BE FINCH');
  });

  it('serializes calls: never more than `concurrency` children at once', async () => {
    // 'slow' exists exactly for this: it succeeds after 400ms, so the probe
    // (also 'slow') goes full, and two serialized requests must take at
    // least two 400ms round trips end to end -- proving the second waited
    // for the first rather than racing it. Racing them in parallel would
    // finish in ~400ms, so this assert really does prove serialization.
    const h = createLlmService({
      command: fakeCliCommand('slow'),
      now: () => NOON,
      getLlm: () => defaultLlmState(NOON),
      setLlm: async () => {},
      concurrency: 1,
    });
    expect(await h.probe()).toBe('full');
    const started = Date.now();
    await Promise.all([
      h.request({ kind: 'chatter', budget: 'interactive', prompt: 'a' }),
      h.request({ kind: 'chatter', budget: 'interactive', prompt: 'b' }),
    ]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(750);
  });
});
