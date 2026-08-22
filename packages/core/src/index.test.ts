import { describe, it, expect } from 'vitest';
import * as core from './index.js';

describe('public API', () => {
  it('exports the appearance system', () => {
    expect(typeof core.generateAppearance).toBe('function');
    expect(typeof core.derivePalette).toBe('function');
    expect(typeof core.dnaSeed).toBe('function');
    expect(core.BODIES).toBeDefined();
    expect(core.CROWNS).toBeDefined();
    expect(core.POSTURES).toBeDefined();
    expect(core.WING).toBeDefined();
    expect(core.INCOMPATIBLE).toBeDefined();
    expect(core.FLIGHT_UNDERSIDE).toBeDefined();
    expect(core.INK).toBeDefined();
    expect(core.HUES).toBeDefined();
  });

  it('exports the file format layer', () => {
    expect(typeof core.parseSkill).toBe('function');
    expect(typeof core.serializeSkill).toBe('function');
    expect(typeof core.parseAgent).toBe('function');
    expect(typeof core.serializeAgent).toBe('function');
    expect(typeof core.parseFrontmatter).toBe('function');
    expect(typeof core.isValidName).toBe('function');
    expect(typeof core.normalizeName).toBe('function');
    expect(core.PORTABLE_SKILL_FIELDS).toBeDefined();
  });

  it('exports the sim rules', () => {
    expect(typeof core.decayStats).toBe('function');
    expect(typeof core.applyCare).toBe('function');
    expect(typeof core.levelForXp).toBe('function');
    expect(typeof core.nextStage).toBe('function');
    expect(typeof core.recordCoUse).toBe('function');
    expect(typeof core.friendsOf).toBe('function');
  });

  it('exports the prompt builders', () => {
    expect(typeof core.chatSystemPrompt).toBe('function');
    expect(typeof core.personalityCardPrompt).toBe('function');
    expect(typeof core.interviewSystemPrompt).toBe('function');
  });

  it('exports the id lists that pin appearance ordering', () => {
    expect(core.BODY_IDS).toHaveLength(6);
    expect(core.CROWN_IDS).toHaveLength(5);
    expect(core.REST_POSTURE_IDS).toHaveLength(3);
  });

  it('can take a name all the way to an appearance through the public surface alone', () => {
    const appearance = core.generateAppearance({ kind: 'agent', name: 'web-research' });
    expect(core.BODIES[appearance.body]).toBeDefined();
    expect(core.CROWNS[appearance.crown]).toBeDefined();
    expect(appearance.winged).toBe(true);
  });
});
