import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSandbox, type Sandbox } from '../testing/sandbox.js';
import {
  collectFacts, emptyScanCache, loadScanCache, saveScanCache, type ScanCache,
} from './scan-cache.js';

const SKILL_LINE = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'brainstorming' } }] },
  cwd: '/home/dev/proj',
});

describe('scan cache', () => {
  let sandbox: Sandbox;
  beforeEach(async () => { sandbox = await makeSandbox(); });
  afterEach(async () => { await sandbox.cleanup(); });

  it('a missing or corrupt cache file loads as empty — insurance, not a prerequisite', async () => {
    expect(await loadScanCache(sandbox.paths)).toEqual(emptyScanCache());
    await writeFile(sandbox.paths.scanCachePath, '{not json', 'utf8');
    expect(await loadScanCache(sandbox.paths)).toEqual(emptyScanCache());
  });

  it('round-trips through save and load', async () => {
    const file = join(sandbox.home, 't.jsonl');
    await writeFile(file, SKILL_LINE, 'utf8');
    const { cache } = await collectFacts([file], emptyScanCache());
    await saveScanCache(sandbox.paths, cache);
    expect(await loadScanCache(sandbox.paths)).toEqual(cache);
  });

  it('parses fresh files and records size/mtime facts', async () => {
    const file = join(sandbox.home, 't.jsonl');
    await writeFile(file, SKILL_LINE, 'utf8');
    const { byFile } = await collectFacts([file], emptyScanCache());
    const facts = byFile.get(file)!;
    expect(facts.cwd).toBe('/home/dev/proj');
    expect(facts.helperMentions).toEqual(['brainstorming']);
    expect(facts.lastActivityMs).toBeGreaterThan(0);
  });

  it('an unchanged file is NOT reparsed — the cached facts are trusted verbatim', async () => {
    const file = join(sandbox.home, 't.jsonl');
    await writeFile(file, SKILL_LINE, 'utf8');
    const first = await collectFacts([file], emptyScanCache());
    // Poison the cached facts: if collectFacts reparses, the sentinel vanishes.
    const poisoned: ScanCache = structuredClone(first.cache);
    poisoned.files[file]!.facts.helperMentions = ['sentinel'];
    const second = await collectFacts([file], poisoned);
    expect(second.byFile.get(file)!.helperMentions).toEqual(['sentinel']);
  });

  it('a changed file (different size) is reparsed', async () => {
    const file = join(sandbox.home, 't.jsonl');
    await writeFile(file, SKILL_LINE, 'utf8');
    const first = await collectFacts([file], emptyScanCache());
    await writeFile(file, `${SKILL_LINE}\n${SKILL_LINE}`, 'utf8');
    const second = await collectFacts([file], first.cache);
    expect(second.byFile.get(file)!.helperMentions).toEqual(['brainstorming']);
    expect(second.cache.files[file]!.size).not.toBe(first.cache.files[file]!.size);
  });

  it('the next cache is pruned to the files actually seen', async () => {
    const a = join(sandbox.home, 'a.jsonl');
    const b = join(sandbox.home, 'b.jsonl');
    await writeFile(a, SKILL_LINE, 'utf8');
    await writeFile(b, SKILL_LINE, 'utf8');
    const both = await collectFacts([a, b], emptyScanCache());
    const onlyA = await collectFacts([a], both.cache);
    expect(Object.keys(onlyA.cache.files)).toEqual([a]);
  });

  it('a file that vanishes mid-scan is skipped, not fatal', async () => {
    const ghost = join(sandbox.home, 'ghost.jsonl');
    const { byFile, cache } = await collectFacts([ghost], emptyScanCache());
    expect(byFile.size).toBe(0);
    expect(cache.files).toEqual({});
  });
});
