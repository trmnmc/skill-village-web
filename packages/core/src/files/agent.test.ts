import { describe, it, expect } from 'vitest';
import { parseAgent, serializeAgent, AGENT_COLORS } from './agent.js';
import { parseFrontmatter } from './frontmatter.js';

const VALID = `---
name: web-research
description: Use when the user needs information from the open web.
tools: Read, WebFetch
model: haiku
color: blue
---

You are a research agent. Cite your sources.
`;

describe('parseAgent', () => {
  it('reads a valid agent', () => {
    const result = parseAgent(VALID, 'web-research');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('web-research');
    expect(result.value.tools).toBe('Read, WebFetch');
    expect(result.value.model).toBe('haiku');
    expect(result.value.color).toBe('blue');
    expect(result.value.body).toContain('Cite your sources.');
  });

  it('requires a name, since Claude Code silently skips files without one', () => {
    const result = parseAgent('---\ndescription: d\n---\nbody\n', 'stem');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/name/i);
  });

  it('warns when the frontmatter name disagrees with the filename', () => {
    const result = parseAgent('---\nname: other\ndescription: d\n---\nbody\n', 'stem');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/filename/i);
  });

  it('requires a description', () => {
    const result = parseAgent('---\nname: a\n---\nbody\n', 'a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/description/i);
  });

  it('rejects a body-less agent, since the body is the system prompt', () => {
    const result = parseAgent('---\nname: a\ndescription: d\n---\n\n', 'a');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/body|prompt/i);
  });

  it('drops an unrecognised colour rather than failing the whole file', () => {
    const src = '---\nname: a\ndescription: d\ncolor: chartreuse\n---\nbody\n';
    const result = parseAgent(src, 'a');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.color).toBeUndefined();
  });

  it.each(AGENT_COLORS)('accepts the %s colour', (color) => {
    const result = parseAgent(`---\nname: a\ndescription: d\ncolor: ${color}\n---\nbody\n`, 'a');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.color).toBe(color);
  });

  it('preserves unknown keys in extra', () => {
    const src = '---\nname: a\ndescription: d\nmaxTurns: 5\n---\nbody\n';
    const result = parseAgent(src, 'a');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.extra).toEqual({ maxTurns: 5 });
  });
});

describe('serializeAgent', () => {
  const agent = {
    name: 'web-research',
    description: 'Use for web research.',
    tools: 'Read, WebFetch',
    model: 'haiku',
    color: 'blue' as const,
    body: 'You are a research agent.',
    extra: { maxTurns: 5 },
  };

  it('round trips through parseAgent', () => {
    const result = parseAgent(serializeAgent(agent), 'web-research');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe(agent.name);
    expect(result.value.tools).toBe(agent.tools);
    expect(result.value.color).toBe('blue');
    expect(result.value.body.trim()).toBe(agent.body);
  });

  it('keeps extra keys, unlike skills — agent files are not upload-constrained', () => {
    expect(serializeAgent(agent)).toContain('maxTurns');
  });

  it('omits optional fields that are not set', () => {
    const out = serializeAgent({ name: 'a', description: 'd', body: 'b', extra: {} });
    const { frontmatter } = parseFrontmatter(out);
    expect(Object.keys(frontmatter).sort()).toEqual(['description', 'name']);
  });
});
