import { describe, it, expect, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { makeSandbox, skillFixture, type Sandbox } from '../testing/sandbox.js';
import { createWatcher, type Watcher } from './watcher.js';

let sandbox: Sandbox | null = null;
let watcher: Watcher | null = null;

afterEach(async () => {
  await watcher?.close();
  watcher = null;
  await sandbox?.cleanup();
  sandbox = null;
});

/** Wait until `predicate` holds, or fail after `timeoutMs`. */
async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for watcher');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('createWatcher', () => {
  it('fires when a skill is added', async () => {
    sandbox = await makeSandbox();
    let fired = 0;
    watcher = createWatcher({ paths: sandbox.paths, onChange: () => { fired += 1; }, debounceMs: 20 });
    // Let chokidar's async initial scan of the (empty) directories finish before writing.
    // Writing immediately races chokidar's readdir; with ignoreInitial: true a file that
    // lands mid-scan is bucketed as pre-existing and never gets an 'add' event.
    await new Promise((resolve) => setTimeout(resolve, 200));

    await sandbox.writeSkill('appears', skillFixture('appears'));
    await waitFor(() => fired > 0);
    expect(fired).toBeGreaterThan(0);
  });

  it('fires when a skill is deleted', async () => {
    sandbox = await makeSandbox();
    const file = await sandbox.writeSkill('doomed', skillFixture('doomed'));
    let fired = 0;
    watcher = createWatcher({ paths: sandbox.paths, onChange: () => { fired += 1; }, debounceMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 200)); // let the initial scan settle

    fired = 0;
    await rm(file);
    await waitFor(() => fired > 0);
    expect(fired).toBeGreaterThan(0);
  });

  it('collapses a burst of changes into few callbacks', async () => {
    sandbox = await makeSandbox();
    let fired = 0;
    watcher = createWatcher({ paths: sandbox.paths, onChange: () => { fired += 1; }, debounceMs: 120 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    fired = 0;
    for (let i = 0; i < 8; i++) {
      await sandbox.writeSkill(`burst-${i}`, skillFixture(`burst-${i}`));
    }
    await waitFor(() => fired > 0);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fired).toBeLessThan(8);
  });

  it('stops firing once closed', async () => {
    sandbox = await makeSandbox();
    let fired = 0;
    watcher = createWatcher({ paths: sandbox.paths, onChange: () => { fired += 1; }, debounceMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await watcher.close();
    watcher = null;
    fired = 0;
    await sandbox.writeSkill('after-close', skillFixture('after-close'));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fired).toBe(0);
  });

  it('closes cleanly even when the watched directories never existed', async () => {
    sandbox = await makeSandbox();
    const { resolvePaths } = await import('../config/paths.js');
    const paths = resolvePaths({ home: `${sandbox.home}-nonexistent` });
    watcher = createWatcher({ paths, onChange: () => {}, debounceMs: 20 });
    await expect(watcher.close()).resolves.toBeUndefined();
    watcher = null;
  });
});
