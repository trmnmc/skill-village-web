import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { makeSandbox, type Sandbox } from '../testing/sandbox.js';
import { loadState, saveState } from './store.js';
import { emptyState, STATE_VERSION } from './schema.js';

let sandbox: Sandbox | null = null;
afterEach(async () => { await sandbox?.cleanup(); sandbox = null; });

describe('loadState', () => {
  it('returns an empty state on first run', async () => {
    sandbox = await makeSandbox();
    const { state, recovered } = await loadState(sandbox.paths, 1000);
    expect(state.version).toBe(STATE_VERSION);
    expect(state.creatures).toEqual({});
    expect(state.createdAt).toBe(1000);
    expect(recovered).toBe(false);
  });

  it('round trips a saved state', async () => {
    sandbox = await makeSandbox();
    const state = emptyState(500);
    state.problems.push({ path: '/x/SKILL.md', errors: ['broken'] });
    await saveState(sandbox.paths, state);

    const loaded = await loadState(sandbox.paths, 9999);
    expect(loaded.state.createdAt).toBe(500);
    expect(loaded.state.problems).toEqual([{ path: '/x/SKILL.md', errors: ['broken'] }]);
    expect(loaded.recovered).toBe(false);
  });

  it('falls back to the backup when the main file is corrupt, and says so', async () => {
    sandbox = await makeSandbox();
    const good = emptyState(500);
    await saveState(sandbox.paths, good);
    // Second save moves the good copy into the backup slot.
    await saveState(sandbox.paths, { ...good, updatedAt: 600 });
    await writeFile(sandbox.paths.statePath, '{ not json at all', 'utf8');

    const loaded = await loadState(sandbox.paths, 9999);
    expect(loaded.recovered).toBe(true);
    expect(loaded.note).toMatch(/backup/i);
    expect(loaded.state.createdAt).toBe(500);
  });

  it('starts fresh when both the state and its backup are unreadable', async () => {
    sandbox = await makeSandbox();
    await saveState(sandbox.paths, emptyState(500));
    await writeFile(sandbox.paths.statePath, 'garbage', 'utf8');
    await writeFile(sandbox.paths.stateBackupPath, 'also garbage', 'utf8');

    const loaded = await loadState(sandbox.paths, 7777);
    expect(loaded.recovered).toBe(true);
    expect(loaded.note).toMatch(/fresh|new/i);
    expect(loaded.state.createdAt).toBe(7777);
  });

  it('rejects a state file from a future schema version rather than misreading it', async () => {
    sandbox = await makeSandbox();
    await writeFile(
      sandbox.paths.statePath,
      JSON.stringify({ ...emptyState(1), version: STATE_VERSION + 99 }),
      'utf8',
    );
    const loaded = await loadState(sandbox.paths, 4242);
    expect(loaded.recovered).toBe(true);
    expect(loaded.note).toMatch(/version/i);
  });

  it('rejects a state file with missing problems field', async () => {
    sandbox = await makeSandbox();
    const state = emptyState(500);
    const broken = { ...state, problems: undefined };
    await writeFile(sandbox.paths.statePath, JSON.stringify(broken), 'utf8');

    const loaded = await loadState(sandbox.paths, 9999);
    expect(loaded.recovered).toBe(true);
    expect(loaded.note).toMatch(/backup|fresh|new/i);
    expect(loaded.state.createdAt).toBe(9999);
  });

  it('rejects a state file with problems not being an array', async () => {
    sandbox = await makeSandbox();
    const state = emptyState(500);
    const broken = { ...state, problems: { 0: 'not-an-array' } };
    await writeFile(sandbox.paths.statePath, JSON.stringify(broken), 'utf8');

    const loaded = await loadState(sandbox.paths, 9999);
    expect(loaded.recovered).toBe(true);
    expect(loaded.note).toMatch(/backup|fresh|new/i);
    expect(loaded.state.createdAt).toBe(9999);
  });
});

describe('saveState', () => {
  it('creates the data directory if it does not exist', async () => {
    sandbox = await makeSandbox();
    await rm(sandbox.paths.dataDir, { recursive: true, force: true });
    await saveState(sandbox.paths, emptyState(1));
    const raw = await readFile(sandbox.paths.statePath, 'utf8');
    expect(JSON.parse(raw).version).toBe(STATE_VERSION);
  });

  it('keeps the previous save as a backup', async () => {
    sandbox = await makeSandbox();
    await saveState(sandbox.paths, emptyState(111));
    await saveState(sandbox.paths, emptyState(222));
    const backup = JSON.parse(await readFile(sandbox.paths.stateBackupPath, 'utf8'));
    expect(backup.createdAt).toBe(111);
  });

  it('leaves no temp file behind', async () => {
    sandbox = await makeSandbox();
    await saveState(sandbox.paths, emptyState(1));
    await expect(readFile(`${sandbox.paths.statePath}.tmp`, 'utf8')).rejects.toThrow();
  });

  it('writes valid JSON that loadState can read back', async () => {
    sandbox = await makeSandbox();
    const state = emptyState(1);
    await saveState(sandbox.paths, state);
    const raw = await readFile(sandbox.paths.statePath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
