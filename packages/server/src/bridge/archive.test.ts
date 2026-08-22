import { describe, it, expect, afterEach } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { parseSkill } from '@village/core';
import { makeSandbox, skillFixture, type Sandbox } from '../testing/sandbox.js';
import { creatureFromSkill } from './creature.js';
import { updateShadow, archiveFromShadow, readArchived, shadowPathFor, archivePathFor } from './archive.js';

let sandbox: Sandbox | null = null;
afterEach(async () => { await sandbox?.cleanup(); sandbox = null; });

async function skillCreature(sandbox: Sandbox, name: string, body?: string) {
  const contents = body ?? skillFixture(name);
  const file = await sandbox.writeSkill(name, contents);
  const parsed = parseSkill(contents, name);
  if (!parsed.ok) throw new Error(parsed.errors.join(', '));
  return creatureFromSkill(parsed.value, file, 0);
}

describe('paths', () => {
  it('keeps shadow and archive apart', async () => {
    sandbox = await makeSandbox();
    expect(shadowPathFor(sandbox.paths, 'skill', 'x'))
      .not.toBe(archivePathFor(sandbox.paths, 'skill', 'x'));
  });

  it('separates skills from agents of the same name', async () => {
    sandbox = await makeSandbox();
    expect(shadowPathFor(sandbox.paths, 'skill', 'dup'))
      .not.toBe(shadowPathFor(sandbox.paths, 'agent', 'dup'));
  });
});

describe('updateShadow', () => {
  it('mirrors the file content verbatim', async () => {
    sandbox = await makeSandbox();
    const body = skillFixture('mirrored', 'A very specific description.');
    const creature = await skillCreature(sandbox, 'mirrored', body);
    await updateShadow(sandbox.paths, creature);
    const mirrored = await readFile(shadowPathFor(sandbox.paths, 'skill', 'mirrored'), 'utf8');
    expect(mirrored).toBe(body);
  });

  it('overwrites an older mirror', async () => {
    sandbox = await makeSandbox();
    const creature = await skillCreature(sandbox, 'changing', skillFixture('changing', 'First.'));
    await updateShadow(sandbox.paths, creature);
    await sandbox.writeSkill('changing', skillFixture('changing', 'Second.'));
    await updateShadow(sandbox.paths, creature);
    const mirrored = await readFile(shadowPathFor(sandbox.paths, 'skill', 'changing'), 'utf8');
    expect(mirrored).toContain('Second.');
  });

  it('does nothing when the source file has already vanished', async () => {
    sandbox = await makeSandbox();
    const creature = await skillCreature(sandbox, 'gone');
    await rm(creature.sourcePath);
    await expect(updateShadow(sandbox.paths, creature)).resolves.toBeUndefined();
  });
});

describe('archiveFromShadow', () => {
  it('moves the mirror into the archive and returns its path', async () => {
    sandbox = await makeSandbox();
    const body = skillFixture('doomed', 'Last known words.');
    const creature = await skillCreature(sandbox, 'doomed', body);
    await updateShadow(sandbox.paths, creature);
    await rm(creature.sourcePath);

    const archived = await archiveFromShadow(sandbox.paths, 'skill', 'doomed');
    expect(archived).toBe(archivePathFor(sandbox.paths, 'skill', 'doomed'));
    expect(await readFile(archived!, 'utf8')).toBe(body);
  });

  it('leaves nothing behind in the shadow directory', async () => {
    sandbox = await makeSandbox();
    const creature = await skillCreature(sandbox, 'doomed');
    await updateShadow(sandbox.paths, creature);
    await archiveFromShadow(sandbox.paths, 'skill', 'doomed');
    await expect(readFile(shadowPathFor(sandbox.paths, 'skill', 'doomed'), 'utf8')).rejects.toThrow();
  });

  it('returns null when there was never a mirror to archive', async () => {
    sandbox = await makeSandbox();
    expect(await archiveFromShadow(sandbox.paths, 'skill', 'never-existed')).toBeNull();
  });

  it('does not clobber an existing archive entry from an earlier release', async () => {
    sandbox = await makeSandbox();
    const first = await skillCreature(sandbox, 'twice', skillFixture('twice', 'First life.'));
    await updateShadow(sandbox.paths, first);
    await archiveFromShadow(sandbox.paths, 'skill', 'twice');

    await sandbox.writeSkill('twice', skillFixture('twice', 'Second life.'));
    const second = await skillCreature(sandbox, 'twice', skillFixture('twice', 'Second life.'));
    await updateShadow(sandbox.paths, second);
    await archiveFromShadow(sandbox.paths, 'skill', 'twice');

    const archived = await readArchived(sandbox.paths, 'skill', 'twice');
    expect(archived).toContain('Second life.');
  });
});

describe('readArchived', () => {
  it('returns null when nothing is archived under that name', async () => {
    sandbox = await makeSandbox();
    expect(await readArchived(sandbox.paths, 'agent', 'nobody')).toBeNull();
  });
});
