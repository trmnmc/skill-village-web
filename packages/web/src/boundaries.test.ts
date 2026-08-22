import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The web package renders what the server sends and holds no game truth of
 * its own, so two imports must never appear anywhere under `src/`:
 *
 *  - `@village/server` — server code has no business in a browser bundle.
 *  - the bare `@village/core` barrel — its `index.ts` also re-exports
 *    `appearance/dna.ts` (Node's `crypto`) and the file/personality modules
 *    (`yaml`, filesystem parsing). Vite happily transforms those imports,
 *    but the moment a browser evaluates them it throws "Module 'node:crypto'
 *    has been externalized for browser compatibility" and the whole page
 *    goes blank — see task-9-report.md for the incident that prompted this
 *    test. `@village/core/visual` is the browser-safe subpath and the only
 *    one this package may import.
 *
 * This walks the real source tree with `node:fs` rather than mocking
 * anything, so a violation anywhere in the package fails it — not just in
 * files someone remembered to add a check to.
 */

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const SELF_FILENAME = 'boundaries.test.ts';

const BARE_CORE_IMPORT = /(?:from\s+|import\(\s*)['"]@village\/core['"]/;
const SERVER_IMPORT = /(?:from\s+|import\(\s*)['"]@village\/server(?:\/[^'"]*)?['"]/;

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(join(dir, entry.name)));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && entry.name !== SELF_FILENAME) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

describe('package boundaries', () => {
  const files = collectSourceFiles(SRC_DIR);

  it('actually walked the source tree (sanity check for the check itself)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never imports the bare @village/core barrel — only @village/core/visual', () => {
    const offenders = files
      .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
      .filter(({ text }) => BARE_CORE_IMPORT.test(text))
      .map(({ f }) => relative(SRC_DIR, f));
    expect(offenders).toEqual([]);
  });

  it('never imports @village/server', () => {
    const offenders = files
      .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
      .filter(({ text }) => SERVER_IMPORT.test(text))
      .map(({ f }) => relative(SRC_DIR, f));
    expect(offenders).toEqual([]);
  });
});
