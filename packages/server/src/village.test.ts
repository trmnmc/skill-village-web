import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { readArchived } from './bridge/archive.js';
import { readEvents } from './state/events.js';
import { makeSandbox, skillFixture, agentFixture, type Sandbox } from './testing/sandbox.js';
import { createVillage, type Village } from './village.js';
import { MS_PER_HOUR } from './sim/tick.js';

let sandbox: Sandbox | null = null;
let village: Village | null = null;

afterEach(async () => {
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

/** A controllable clock, so tests never wait on real time. */
function clock(start = 1_000) {
  let current = start;
  return { now: () => current, advance(ms: number) { current += ms; } };
}

describe('createVillage', () => {
  it('imports existing skills and agents on first run', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('code-review', skillFixture('code-review'));
    await sandbox.writeAgent('web-research', agentFixture('web-research'));

    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    const ids = Object.keys(village.getState().creatures).sort();
    expect(ids).toEqual(['agent:web-research', 'skill:code-review']);
  });

  it('persists across restarts, keeping bond and xp', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('persistent', skillFixture('persistent'));

    const first = await createVillage({ paths: sandbox.paths, now: clock().now });
    await first.care('skill:persistent', 'play');
    const bondAfterCare = first.getState().creatures['skill:persistent']!.stats.bond;
    await first.close();

    village = await createVillage({ paths: sandbox.paths, now: clock(2_000).now });
    expect(village.getState().creatures['skill:persistent']!.stats.bond).toBe(bondAfterCare);
  });

  it('records a startup note when the save had to be recovered', async () => {
    sandbox = await makeSandbox();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(sandbox.paths.statePath, 'not json', 'utf8');
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    expect(village.startupNote).toMatch(/fresh|backup/i);
  });

  it('has no startup note on a clean first run', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    expect(village.startupNote).toBeNull();
  });

  it('lists files it could not import without failing', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('fine', skillFixture('fine'));
    await sandbox.writeSkill('broken', 'no frontmatter here\n');
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    expect(Object.keys(village.getState().creatures)).toEqual(['skill:fine']);
    expect(village.getState().problems).toHaveLength(1);
  });
});

describe('refresh', () => {
  it('moves in a skill added after startup', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    expect(Object.keys(village.getState().creatures)).toEqual([]);

    await sandbox.writeSkill('latecomer', skillFixture('latecomer'));
    await village.refresh();
    expect(Object.keys(village.getState().creatures)).toEqual(['skill:latecomer']);
  });

  it('auto-releases a deleted skill and archives its last-known copy', async () => {
    sandbox = await makeSandbox();
    const body = skillFixture('doomed', 'These are its last words.');
    const file = await sandbox.writeSkill('doomed', body);
    village = await createVillage({ paths: sandbox.paths, now: clock().now });

    await rm(file, { recursive: true });
    await village.refresh();

    expect(village.getState().creatures['skill:doomed']).toBeUndefined();
    expect(await readArchived(sandbox.paths, 'skill', 'doomed')).toBe(body);
  });

  it('writes events to the log', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('logged', skillFixture('logged'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    const events = await readEvents(sandbox.paths);
    expect(events.map((e) => e.type)).toContain('moved-in');
  });

  it('notifies subscribers', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    let notified = 0;
    village.subscribe(() => { notified += 1; });

    await sandbox.writeSkill('noisy', skillFixture('noisy'));
    await village.refresh();
    expect(notified).toBeGreaterThan(0);
  });
});

describe('care', () => {
  it('raises bond and mood', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('petted', skillFixture('petted'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });

    const before = village.getState().creatures['skill:petted']!.stats;
    await village.care('skill:petted', 'pet');
    const after = village.getState().creatures['skill:petted']!.stats;
    expect(after.bond).toBeGreaterThan(before.bond);
    expect(after.mood).toBeGreaterThan(before.mood);
  });

  it('rejects an unknown creature', async () => {
    sandbox = await makeSandbox();
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    await expect(village.care('skill:ghost', 'pet')).rejects.toThrow(/not found|unknown/i);
  });

  it('refuses verbs that need the language model, which arrives in M4', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('x', skillFixture('x'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    // 'chat' is a real CareVerb — the type system allows it and the runtime refuses it.
    await expect(village.care('skill:x', 'chat')).rejects.toThrow(/not available|M4|language/i);
  });

  it('logs a cared-for event', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('y', skillFixture('y'));
    village = await createVillage({ paths: sandbox.paths, now: clock().now });
    await village.care('skill:y', 'play');
    const events = await readEvents(sandbox.paths);
    expect(events.map((e) => e.type)).toContain('cared-for');
  });
});

describe('tick', () => {
  it('decays creatures as the clock advances', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('waiting', skillFixture('waiting'));
    const time = clock();
    village = await createVillage({ paths: sandbox.paths, now: time.now });

    const before = village.getState().creatures['skill:waiting']!.stats.mood;
    time.advance(24 * MS_PER_HOUR);
    await village.tick();
    expect(village.getState().creatures['skill:waiting']!.stats.mood).toBeLessThan(before);
  });

  it('applies away-time on restart, so a village left alone comes back scruffy', async () => {
    sandbox = await makeSandbox();
    await sandbox.writeSkill('abandoned', skillFixture('abandoned'));
    const first = await createVillage({ paths: sandbox.paths, now: clock(0).now });
    const fresh = first.getState().creatures['skill:abandoned']!.stats.mood;
    await first.close();

    village = await createVillage({ paths: sandbox.paths, now: clock(72 * MS_PER_HOUR).now });
    await village.tick();
    expect(village.getState().creatures['skill:abandoned']!.stats.mood).toBeLessThan(fresh);
  });
});
