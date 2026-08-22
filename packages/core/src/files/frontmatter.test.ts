import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('splits frontmatter from body', () => {
    const src = '---\nname: code-review\ndescription: Reviews code\n---\n\n# Heading\n\nText.\n';
    const doc = parseFrontmatter(src);
    expect(doc.hadFrontmatter).toBe(true);
    expect(doc.frontmatter).toEqual({ name: 'code-review', description: 'Reviews code' });
    expect(doc.body).toBe('# Heading\n\nText.\n');
  });

  it('handles a document with no frontmatter', () => {
    const doc = parseFrontmatter('# Just a heading\n');
    expect(doc.hadFrontmatter).toBe(false);
    expect(doc.frontmatter).toEqual({});
    expect(doc.body).toBe('# Just a heading\n');
  });

  it('reads nested maps and lists, which real skills use', () => {
    const src = '---\nname: x\nmetadata:\n  author: someone\ntools:\n  - Read\n  - Grep\n---\nbody\n';
    const doc = parseFrontmatter(src);
    expect(doc.frontmatter.metadata).toEqual({ author: 'someone' });
    expect(doc.frontmatter.tools).toEqual(['Read', 'Grep']);
  });

  it('tolerates CRLF line endings', () => {
    const doc = parseFrontmatter('---\r\nname: x\r\n---\r\nbody\r\n');
    expect(doc.frontmatter).toEqual({ name: 'x' });
    expect(doc.body.trim()).toBe('body');
  });

  it('tolerates a leading byte order mark', () => {
    expect(parseFrontmatter('﻿---\nname: x\n---\nbody\n').frontmatter).toEqual({ name: 'x' });
  });

  it('treats malformed YAML as absent frontmatter rather than throwing', () => {
    const doc = parseFrontmatter('---\nname: [unclosed\n---\nbody\n');
    expect(doc.hadFrontmatter).toBe(false);
    expect(doc.frontmatter).toEqual({});
  });

  it('treats an unterminated fence as no frontmatter', () => {
    const doc = parseFrontmatter('---\nname: x\nbody with no closing fence\n');
    expect(doc.hadFrontmatter).toBe(false);
  });

  it('treats a non-map document as absent frontmatter', () => {
    expect(parseFrontmatter('---\n- a\n- b\n---\nbody\n').hadFrontmatter).toBe(false);
  });
});

describe('serializeFrontmatter', () => {
  it('round trips through parse', () => {
    const fm = { name: 'code-review', description: 'Reviews code', 'allowed-tools': ['Read'] };
    const doc = parseFrontmatter(serializeFrontmatter(fm, '# Body\n'));
    expect(doc.frontmatter).toEqual(fm);
    expect(doc.body).toBe('# Body\n');
  });

  it('always ends the body with exactly one newline', () => {
    expect(serializeFrontmatter({ name: 'x' }, 'body')).toMatch(/body\n$/);
    expect(serializeFrontmatter({ name: 'x' }, 'body\n\n\n')).toMatch(/body\n$/);
  });

  it('omits keys whose value is undefined', () => {
    const out = serializeFrontmatter({ name: 'x', license: undefined }, 'b');
    expect(out).not.toContain('license');
  });
});
