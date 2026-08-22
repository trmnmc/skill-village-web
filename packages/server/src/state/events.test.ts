import { describe, it, expect, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { makeSandbox, type Sandbox } from '../testing/sandbox.js';
import { appendEvents, readEvents } from './events.js';

let sandbox: Sandbox | null = null;
afterEach(async () => { await sandbox?.cleanup(); sandbox = null; });

describe('event log', () => {
  it('returns nothing before anything is logged', async () => {
    sandbox = await makeSandbox();
    expect(await readEvents(sandbox.paths)).toEqual([]);
  });

  it('appends and reads back in order', async () => {
    sandbox = await makeSandbox();
    await appendEvents(sandbox.paths, [{ at: 1, type: 'moved-in', creatureId: 'skill:a' }]);
    await appendEvents(sandbox.paths, [{ at: 2, type: 'moved-in', creatureId: 'skill:b' }]);
    const events = await readEvents(sandbox.paths);
    expect(events.map((e) => e.creatureId)).toEqual(['skill:a', 'skill:b']);
  });

  it('appends a batch in one call', async () => {
    sandbox = await makeSandbox();
    await appendEvents(sandbox.paths, [
      { at: 1, type: 'moved-in', creatureId: 'skill:a' },
      { at: 1, type: 'moved-in', creatureId: 'skill:b' },
    ]);
    expect(await readEvents(sandbox.paths)).toHaveLength(2);
  });

  it('does nothing when given an empty batch', async () => {
    sandbox = await makeSandbox();
    await appendEvents(sandbox.paths, []);
    expect(await readEvents(sandbox.paths)).toEqual([]);
  });

  it('filters to events at or after a timestamp', async () => {
    sandbox = await makeSandbox();
    await appendEvents(sandbox.paths, [
      { at: 10, type: 'moved-in', creatureId: 'a' },
      { at: 20, type: 'moved-in', creatureId: 'b' },
      { at: 30, type: 'moved-in', creatureId: 'c' },
    ]);
    const recent = await readEvents(sandbox.paths, { since: 20 });
    expect(recent.map((e) => e.creatureId)).toEqual(['b', 'c']);
  });

  it('returns the most recent events when limited', async () => {
    sandbox = await makeSandbox();
    await appendEvents(sandbox.paths, [1, 2, 3, 4, 5].map((n) => ({
      at: n, type: 'moved-in' as const, creatureId: `c${n}`,
    })));
    const last2 = await readEvents(sandbox.paths, { limit: 2 });
    expect(last2.map((e) => e.creatureId)).toEqual(['c4', 'c5']);
  });

  it('skips corrupt lines rather than failing the whole read', async () => {
    sandbox = await makeSandbox();
    await appendEvents(sandbox.paths, [{ at: 1, type: 'moved-in', creatureId: 'good' }]);
    await writeFile(sandbox.paths.eventLogPath, await readRaw(sandbox) + 'not json\n', 'utf8');
    await appendEvents(sandbox.paths, [{ at: 2, type: 'moved-in', creatureId: 'also-good' }]);

    const events = await readEvents(sandbox.paths);
    expect(events.map((e) => e.creatureId)).toEqual(['good', 'also-good']);
  });
});

async function readRaw(sandbox: Sandbox): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(sandbox.paths.eventLogPath, 'utf8');
}
