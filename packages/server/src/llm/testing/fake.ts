import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));

/** A command vector that runs the fake CLI with the given behaviour. */
export function fakeCliCommand(behaviour: string): string[] {
  return [process.execPath, join(here, 'fake-claude.mjs'), behaviour];
}

/** card-broken-once keeps one bit of state on disk; reset it between tests. */
export async function resetFakeCli(): Promise<void> {
  await rm(join(here, '.broken-once'), { force: true });
}
