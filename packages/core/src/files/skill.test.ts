import { describe, it, expect } from 'vitest';
import { parseSkill, serializeSkill, PORTABLE_SKILL_FIELDS } from './skill.js';
import { parseFrontmatter } from './frontmatter.js';

const VALID = `---
name: code-review
description: Use when reviewing a pull request or diff.
---

# Code Review

Read the diff first.
`;

describe('parseSkill', () => {
  it('reads a valid skill', () => {
    const result = parseSkill(VALID, 'code-review');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('code-review');
    expect(result.value.description).toMatch(/pull request/);
    expect(result.value.body).toContain('Read the diff first.');
  });

  it('falls back to the directory name when frontmatter omits one', () => {
    const src = '---\ndescription: Does a thing.\n---\nBody\n';
    const result = parseSkill(src, 'my-skill');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('my-skill');
  });

  it('rejects a skill with no description, since that drives invocation', () => {
    const result = parseSkill('---\nname: x\n---\nBody\n', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/description/i);
  });

  it('rejects a skill with no frontmatter at all', () => {
    const result = parseSkill('# Just markdown\n', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/frontmatter/i);
  });

  it('rejects an invalid name and says why', () => {
    const result = parseSkill('---\nname: Bad Name\ndescription: d\n---\nb\n', 'bad-name');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/lowercase/i);
  });

  it('rejects an empty body, since a skill with no instructions does nothing', () => {
    const result = parseSkill('---\nname: x\ndescription: d\n---\n\n', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/body/i);
  });

  it('keeps unknown frontmatter keys in `extra` rather than discarding them', () => {
    const src = '---\nname: x\ndescription: d\nmodel: haiku\neffort: low\n---\nBody\n';
    const result = parseSkill(src, 'x');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.extra).toEqual({ model: 'haiku', effort: 'low' });
  });

  it('reads allowed-tools into a camelCase field', () => {
    const src = '---\nname: x\ndescription: d\nallowed-tools: Read, Grep\n---\nBody\n';
    const result = parseSkill(src, 'x');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.allowedTools).toBe('Read, Grep');
  });

  it('collects every problem at once rather than stopping at the first', () => {
    const result = parseSkill('---\nname: Bad Name\n---\n\n', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('serializeSkill', () => {
  const skill = {
    name: 'code-review',
    description: 'Use when reviewing a diff.',
    license: 'MIT',
    body: '# Code Review\n\nRead the diff.',
    extra: { model: 'haiku', 'disable-model-invocation': true },
  };

  it('emits only portability-safe fields, dropping extras', () => {
    const out = serializeSkill(skill);
    const { frontmatter } = parseFrontmatter(out);
    for (const key of Object.keys(frontmatter)) {
      expect(PORTABLE_SKILL_FIELDS).toContain(key);
    }
    expect(out).not.toContain('disable-model-invocation');
  });

  it('round trips through parseSkill', () => {
    const result = parseSkill(serializeSkill(skill), 'code-review');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe(skill.name);
    expect(result.value.description).toBe(skill.description);
    expect(result.value.license).toBe('MIT');
    expect(result.value.body.trim()).toBe(skill.body.trim());
  });

  it('omits optional fields that are not set', () => {
    const out = serializeSkill({ name: 'x', description: 'd', body: 'b', extra: {} });
    expect(out).not.toContain('license');
    expect(out).not.toContain('compatibility');
  });
});
