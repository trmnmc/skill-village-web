import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface ParsedDocument {
  frontmatter: Record<string, unknown>;
  body: string;
  /** False when the document had no frontmatter, or it was malformed. */
  hadFrontmatter: boolean;
}

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split a markdown document into YAML frontmatter and body.
 *
 * Malformed frontmatter is reported as absent rather than thrown, because the
 * caller's next move is the same either way: refuse to treat this as a valid
 * skill or agent. Validation belongs in skill.ts and agent.ts, not here.
 */
export function parseFrontmatter(source: string): ParsedDocument {
  const text = source.replace(/^﻿/, '');
  const match = FENCE.exec(text);
  if (!match) return { frontmatter: {}, body: normalizeNewlines(text), hadFrontmatter: false };

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]!);
  } catch {
    return { frontmatter: {}, body: normalizeNewlines(text), hadFrontmatter: false };
  }

  const isMap = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  if (!isMap) return { frontmatter: {}, body: normalizeNewlines(text), hadFrontmatter: false };

  const body = normalizeNewlines(text.slice(match[0].length)).replace(/^\n+/, '');
  return { frontmatter: parsed as Record<string, unknown>, body, hadFrontmatter: true };
}

export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined) clean[key] = value;
  }
  const yaml = stringifyYaml(clean).trimEnd();
  const trimmedBody = normalizeNewlines(body).replace(/\n+$/, '');
  return `---\n${yaml}\n---\n\n${trimmedBody}\n`;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}
