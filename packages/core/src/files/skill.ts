import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js';
import { describeNameProblem } from './names.js';

/**
 * The only frontmatter keys we are allowed to emit.
 *
 * claude.ai uploads, the Skills API and `package_skill.py` accept exactly this
 * set and treat any other key as a hard packaging error — so a skill the game
 * writes must never carry more than this, or it stops being shareable.
 */
export const PORTABLE_SKILL_FIELDS = [
  'name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools',
] as const;

export interface SkillFile {
  name: string;
  description: string;
  license?: string;
  compatibility?: unknown;
  metadata?: unknown;
  allowedTools?: unknown;
  body: string;
  /** Non-portable keys found on read. Preserved so a rewrite does not lose them. */
  extra: Record<string, unknown>;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function parseSkill(source: string, directoryName: string): ParseResult<SkillFile> {
  const doc = parseFrontmatter(source);
  const errors: string[] = [];

  if (!doc.hadFrontmatter) {
    errors.push('Skill has no readable YAML frontmatter.');
  }

  const rawName = typeof doc.frontmatter.name === 'string' ? doc.frontmatter.name : directoryName;
  const nameProblem = describeNameProblem(rawName);
  if (nameProblem) errors.push(`Invalid skill name "${rawName}": ${nameProblem}`);

  const description = doc.frontmatter.description;
  if (typeof description !== 'string' || description.trim() === '') {
    errors.push('Skill needs a non-empty description; it is what tells Claude when to use it.');
  }

  if (doc.body.trim() === '') {
    errors.push('Skill body is empty; there are no instructions to follow.');
  }

  if (errors.length > 0) return { ok: false, errors };

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.frontmatter)) {
    if (!(PORTABLE_SKILL_FIELDS as readonly string[]).includes(key)) extra[key] = value;
  }

  return {
    ok: true,
    value: {
      name: rawName,
      description: (description as string).trim(),
      license: typeof doc.frontmatter.license === 'string' ? doc.frontmatter.license : undefined,
      compatibility: doc.frontmatter.compatibility,
      metadata: doc.frontmatter.metadata,
      allowedTools: doc.frontmatter['allowed-tools'],
      body: doc.body,
      extra,
    },
  };
}

/** Emits portability-safe frontmatter only. `extra` is deliberately dropped. */
export function serializeSkill(skill: SkillFile): string {
  return serializeFrontmatter(
    {
      name: skill.name,
      description: skill.description,
      license: skill.license,
      compatibility: skill.compatibility,
      metadata: skill.metadata,
      'allowed-tools': skill.allowedTools,
    },
    skill.body,
  );
}
