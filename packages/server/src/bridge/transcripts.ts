/**
 * Per-file facts from one Claude Code session transcript (remap spec §3).
 *
 * Pure text in, facts out — no fs, no clock. The shapes this keys on are
 * Claude Code's internal transcript format: `cwd` as a top-level field, and
 * tool calls as `message.content[]` items of `{ type: 'tool_use', name,
 * input }`. That fragility is owned: the pinned fixture in
 * testing/fixtures/session.jsonl fails loudly when the format drifts,
 * instead of the village quietly starving.
 */
export interface TranscriptFacts {
  /** The last `cwd` value seen in the file — the newest wins. Null if none. */
  cwd: string | null;
  /**
   * Deduped helper mentions, first-seen order: every Skill call's
   * `input.skill` and every tool_use's `input.subagent_type`.
   */
  helperMentions: string[];
}

export function parseTranscript(text: string): TranscriptFacts {
  let cwd: string | null = null;
  const mentions = new Set<string>();

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // a half-written line from a crash; the rest is still good
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const entry = parsed as { cwd?: unknown; message?: { content?: unknown } };

    if (typeof entry.cwd === 'string' && entry.cwd !== '') cwd = entry.cwd;

    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (typeof item !== 'object' || item === null) continue;
      const call = item as {
        type?: unknown;
        name?: unknown;
        input?: { skill?: unknown; subagent_type?: unknown } | null;
      };
      if (call.type !== 'tool_use' || typeof call.input !== 'object' || call.input === null) continue;
      if (call.name === 'Skill' && typeof call.input.skill === 'string') {
        mentions.add(call.input.skill);
      }
      if (typeof call.input.subagent_type === 'string') {
        mentions.add(call.input.subagent_type);
      }
    }
  }

  return { cwd, helperMentions: [...mentions] };
}
