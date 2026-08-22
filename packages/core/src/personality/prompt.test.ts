import { describe, it, expect } from 'vitest';
import { chatSystemPrompt, personalityCardPrompt, interviewSystemPrompt, moodWord } from './prompt.js';
import type { Creature } from '../types.js';

const creature: Creature = {
  id: 'skill:code-review',
  kind: 'skill',
  name: 'code-review',
  nickname: 'Nit',
  appearance: {
    body: 'round', crown: 'ears', winged: false, restPosture: null,
    palette: { hue: '#9dba77', lite: '#c0d6a0', dark: '#7c9a58' },
  },
  stats: { mood: 82, energy: 60, bond: 45, xp: 300 },
  stage: 'adult',
  personality: {
    temperament: 'a fastidious detective',
    voice: 'clipped, faintly smug',
    quirks: ['counts things aloud', 'hates unexplained magic numbers'],
    likes: ['small diffs'],
    dislikes: ['force pushes'],
  },
  sourcePath: '/home/u/.claude/skills/code-review/SKILL.md',
  friendships: {},
  lastSeenAt: 0,
};

describe('chatSystemPrompt', () => {
  it('includes the nickname, temperament and voice', () => {
    const prompt = chatSystemPrompt(creature);
    expect(prompt).toContain('Nit');
    expect(prompt).toContain('fastidious detective');
    expect(prompt).toContain('clipped, faintly smug');
  });

  it('includes quirks, likes and dislikes', () => {
    const prompt = chatSystemPrompt(creature);
    expect(prompt).toContain('counts things aloud');
    expect(prompt).toContain('small diffs');
    expect(prompt).toContain('force pushes');
  });

  it('describes the current mood in words, not numbers', () => {
    const prompt = chatSystemPrompt(creature);
    expect(prompt).toMatch(/cheerful|content|flat|glum/);
    expect(prompt).not.toContain('82');
  });

  it('tells the creature what it actually does for a living', () => {
    expect(chatSystemPrompt(creature)).toContain('code-review');
  });

  it('falls back to the file name when there is no nickname yet', () => {
    const nameless = { ...creature, nickname: '' };
    expect(chatSystemPrompt(nameless)).toContain('code-review');
  });

  it('still produces a usable prompt with no personality card', () => {
    const blank = { ...creature, personality: null };
    const prompt = chatSystemPrompt(blank);
    expect(prompt.length).toBeGreaterThan(50);
    expect(prompt).toContain('code-review');
  });

  it('asks for short spoken replies, since these land in speech bubbles', () => {
    expect(chatSystemPrompt(creature)).toMatch(/short|brief|sentence/i);
  });
});

describe('personalityCardPrompt', () => {
  it('asks for the fields a card needs and names the skill', () => {
    const prompt = personalityCardPrompt({
      kind: 'skill', name: 'code-review',
      description: 'Reviews diffs.', body: '# Code Review\nRead the diff.',
    });
    expect(prompt).toContain('code-review');
    expect(prompt).toContain('temperament');
    expect(prompt).toContain('nickname');
    expect(prompt).toMatch(/json/i);
  });

  it('truncates a very long body so the prompt stays cheap', () => {
    const prompt = personalityCardPrompt({
      kind: 'skill', name: 'x', description: 'd', body: 'y'.repeat(20_000),
    });
    expect(prompt.length).toBeLessThan(6_000);
  });
});

describe('personalityCardPrompt — canned pool', () => {
  const prompt = personalityCardPrompt({
    kind: 'skill', name: 'code-review', description: 'Reviews diffs', body: '# Code Review',
  });

  it('asks for the canned-line pool in the same JSON reply', () => {
    expect(prompt).toContain('"lines"');
    expect(prompt).toContain('twenty');
  });

  it('still asks for every card field', () => {
    for (const field of ['"nickname"', '"temperament"', '"voice"', '"quirks"', '"likes"', '"dislikes"']) {
      expect(prompt).toContain(field);
    }
  });
});

describe('interviewSystemPrompt', () => {
  it('differs between skills and agents', () => {
    expect(interviewSystemPrompt('skill')).not.toBe(interviewSystemPrompt('agent'));
  });

  it('tells the hatchling to ask one question at a time', () => {
    expect(interviewSystemPrompt('skill')).toMatch(/one question/i);
  });
});

describe('moodWord', () => {
  it.each([[95, 'cheerful'], [70, 'content'], [40, 'flat'], [10, 'glum']])(
    'describes %i as %s', (mood, word) => {
      expect(moodWord(mood as number)).toBe(word);
    });
});
