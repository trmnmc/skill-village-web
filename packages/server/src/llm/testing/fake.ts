import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));

/** A command vector that runs the fake CLI with the given behaviour. */
export function fakeCliCommand(behaviour: string): string[] {
  return [process.execPath, join(here, 'fake-claude.mjs'), behaviour];
}

/**
 * card-broken-once keeps one bit of state on disk; reset it between tests.
 * Pass the same key as the behaviour suffix (card-broken-once:key) to reset
 * only that test's marker — a bare reset touches only the bare marker, so
 * parallel workers cannot re-arm or disarm each other's in-flight tests.
 */
export async function resetFakeCli(key?: string): Promise<void> {
  await rm(join(here, key ? `.broken-once-${key}` : '.broken-once'), { force: true });
}
