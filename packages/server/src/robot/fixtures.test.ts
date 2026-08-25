import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { makeSandbox, skillFixture, type Sandbox } from '../testing/sandbox.js';
import { createVillage, type Village } from '../village.js';
import { defaultLlmState } from '../llm/ledger.js';
import { createLlmService } from '../llm/service.js';
import { fakeCliCommand } from '../llm/testing/fake.js';
import { createApp } from '../api/app.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let files: string[] = [];
try {
  files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
} catch {
  files = [];
}

let sandbox: Sandbox | null = null;
let village: Village | null = null;

afterEach(async () => {
  await village?.close();
  village = null;
  await sandbox?.cleanup();
  sandbox = null;
});

/** Boots a village with a real (fake-CLI-backed) llm service, already probed. */
async function bootWithLlm(skills: string[], behaviour: string) {
  sandbox = await makeSandbox();
  for (const name of skills) await sandbox.writeSkill(name, skillFixture(name));
  let llmState = defaultLlmState(1_000);
  const llm = createLlmService({
    command: fakeCliCommand(behaviour),
    now: () => 1_000,
    getLlm: () => llmState,
    setLlm: async (next) => { llmState = next; },
  });
  await llm.probe();
  village = await createVillage({ paths: sandbox.paths, now: () => 1_000, llm });
  return createApp(village);
}

describe('recorded gateway requests', () => {
  it.skipIf(files.length === 0)('every recorded request parses and gets a speakable reply', async () => {
    const app = await bootWithLlm(['code-review'], 'ok');
    await village!.setRobotResident('skill:code-review');
    for (const file of files) {
      const body = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      const res = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload: body });
      expect(res.statusCode, file).toBe(200);
      const raw = res.body;
      // streaming or not, the reply must carry words
      expect(raw.length, file).toBeGreaterThan(0);
      expect(raw, file).not.toContain('invalid_request_error');
    }
  });
});
