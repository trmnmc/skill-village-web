import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js';
import { describeNameProblem } from './names.js';
import type { ParseResult } from './skill.js';

/** Claude Code's agent frontmatter `color` values. Doubles as the creature hue hint. */
export const AGENT_COLORS = [
  'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan',
] as const;
export type AgentColor = (typeof AGENT_COLORS)[number];

export interface AgentFile {
  name: string;
  description: string;
  tools?: unknown;
  model?: unknown;
  color?: AgentColor;
  /** The system prompt. */
  body: string;
  /** Any other frontmatter keys, preserved verbatim on rewrite. */
  extra: Record<string, unknown>;
}

const KNOWN_FIELDS = ['name', 'description', 'tools', 'model', 'color'];

export function parseAgent(source: string, fileStem: string): ParseResult<AgentFile> {
  const doc = parseFrontmatter(source);
  const errors: string[] = [];

  if (!doc.hadFrontmatter) {
    errors.push('Agent has no readable YAML frontmatter.');
  }

  const name = doc.frontmatter.name;
  if (typeof name !== 'string' || name.trim() === '') {
    errors.push('Agent needs a name; Claude Code silently skips agent files without one.');
  } else {
    const problem = describeNameProblem(name);
    if (problem) errors.push(`Invalid agent name "${name}": ${problem}`);
    else if (name !== fileStem) {
      errors.push(`Agent name "${name}" does not match its filename "${fileStem}.md".`);
    }
  }

  const description = doc.frontmatter.description;
  if (typeof description !== 'string' || description.trim() === '') {
    errors.push('Agent needs a non-empty description; it is what triggers delegation.');
  }

  if (doc.body.trim() === '') {
    errors.push('Agent body is empty; the body is the system prompt.');
  }

  if (errors.length > 0) return { ok: false, errors };

  const rawColor = doc.frontmatter.color;
  const color = typeof rawColor === 'string'
    && (AGENT_COLORS as readonly string[]).includes(rawColor)
    ? (rawColor as AgentColor)
    : undefined;

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.frontmatter)) {
    if (!KNOWN_FIELDS.includes(key)) extra[key] = value;
  }

  return {
    ok: true,
    value: {
      name: name as string,
      description: (description as string).trim(),
      tools: doc.frontmatter.tools,
      model: doc.frontmatter.model,
      color,
      body: doc.body,
      extra,
    },
  };
}

/**
 * Unlike skills, agent files are not constrained by an upload allowlist, so
 * unknown keys are preserved rather than dropped.
 */
export function serializeAgent(agent: AgentFile): string {
  return serializeFrontmatter(
    {
      name: agent.name,
      description: agent.description,
      tools: agent.tools,
      model: agent.model,
      color: agent.color,
      ...agent.extra,
    },
    agent.body,
  );
}
