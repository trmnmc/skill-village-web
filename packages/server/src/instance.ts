import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VillagePaths } from './config/paths.js';

export interface RunningInstance {
  pid: number;
  port: number;
}

/** Signal 0 tests for existence without actually signalling. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the running instance, or null. A pid file left behind by a crash is
 * treated as null and quietly overwritten — the alternative is a game that
 * refuses to start until the player deletes a file they have never heard of.
 */
export async function readInstance(paths: VillagePaths): Promise<RunningInstance | null> {
  let raw: string;
  try {
    raw = await readFile(paths.pidPath, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as RunningInstance;
    if (typeof parsed?.pid !== 'number' || typeof parsed?.port !== 'number') return null;
    if (!isAlive(parsed.pid)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeInstance(paths: VillagePaths, instance: RunningInstance): Promise<void> {
  await mkdir(dirname(paths.pidPath), { recursive: true });
  await writeFile(paths.pidPath, JSON.stringify(instance), 'utf8');
}

export async function clearInstance(paths: VillagePaths): Promise<void> {
  await rm(paths.pidPath, { force: true });
}

/**
 * Asks whether a village is actually serving on a port.
 *
 * `isAlive` alone is not enough to decide the game is already running. On
 * Windows a just-terminated pid keeps answering signal 0 for a while, and pids
 * are recycled aggressively, so an unrelated process can inherit the number in
 * the pid file. Both cases make the guard refuse to boot and tell the player to
 * open a village that isn't there. Asking the port directly answers the
 * question we actually care about: is someone serving this village right now?
 */
export async function isVillageServing(port: number, timeoutMs = 500): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown };
    return body?.ok === true;
  } catch {
    return false;
  }
}
