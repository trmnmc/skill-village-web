import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseTranscript } from './transcripts.js';

const fixture = () =>
  readFile(new URL('./testing/fixtures/session.jsonl', import.meta.url), 'utf8');

describe('parseTranscript', () => {
  it('collects every helper mention — skills by input.skill, agents by any subagent_type', async () => {
    const facts = parseTranscript(await fixture());
    expect(facts.helperMentions).toEqual([
      'brainstorming',
      'code-reviewer',
      'anthropic-skills:xlsx',
      'general-purpose',
    ]);
  });

  it('the newest cwd wins', async () => {
    const facts = parseTranscript(await fixture());
    expect(facts.cwd).toBe('C:\\Users\\dev\\Projects\\my-project');
  });

  it('skips malformed lines without losing the rest', async () => {
    // pinned shapes stop parsing, THIS file fails loudly — remap spec §3.
    // format-drift alarm: if the fixture's line shapes ever stop matching
    // Claude Code's real transcript format, this test (and the fixture note
    // above it) is where a maintainer should look first.
    const facts = parseTranscript(await fixture());
    expect(facts.helperMentions.length).toBe(4);
  });

  it('an empty or all-junk file yields empty facts', () => {
    expect(parseTranscript('')).toEqual({ cwd: null, helperMentions: [] });
    expect(parseTranscript('not json\n{"also":')).toEqual({ cwd: null, helperMentions: [] });
  });

  it('dedupes repeated mentions, keeping first-seen order', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'brainstorming' } }] },
    });
    expect(parseTranscript(`${line}\n${line}`).helperMentions).toEqual(['brainstorming']);
  });
});
