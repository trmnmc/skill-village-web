import chokidar, { type FSWatcher } from 'chokidar';
import type { VillagePaths } from '../config/paths.js';

export interface Watcher {
  close(): Promise<void>;
}

export interface WatcherOptions {
  paths: VillagePaths;
  /** Called after changes settle. The caller rescans and reconciles. */
  onChange: () => void;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 250;

/**
 * Watches the user's (and project's) skill and agent directories.
 *
 * Deliberately dumb: it never inspects what changed, only that something did.
 * Deciding what a change means is `reconcile`'s job, and keeping that split is
 * what lets the interesting logic be tested without touching a filesystem.
 */
export function createWatcher(options: WatcherOptions): Watcher {
  const { paths, onChange } = options;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const targets = [
    paths.userSkillsDir,
    paths.userAgentsDir,
    paths.projectSkillsDir,
    paths.projectAgentsDir,
  ].filter((dir): dir is string => dir !== null);

  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!closed) onChange();
    }, debounceMs);
  };

  const watcher: FSWatcher = chokidar.watch(targets, {
    ignoreInitial: true,
    // A file being written by an editor can fire several times; wait for it to settle.
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
  });

  watcher.on('add', schedule);
  watcher.on('change', schedule);
  watcher.on('unlink', schedule);
  watcher.on('addDir', schedule);
  watcher.on('unlinkDir', schedule);
  // A watched directory disappearing is normal, not fatal.
  watcher.on('error', () => {});

  return {
    async close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await watcher.close();
    },
  };
}
