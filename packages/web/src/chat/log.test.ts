import { describe, it, expect } from 'vitest';
import { openLog, sendMessage, receiveReply, receiveError } from './log.js';

describe('chat log', () => {
  it('opens empty and not pending', () => {
    const log = openLog('skill:tdd');
    expect(log).toEqual({ creatureId: 'skill:tdd', entries: [], pending: false });
  });

  it('sending appends the player entry and goes pending', () => {
    const log = sendMessage(openLog('skill:tdd'), 'hello');
    expect(log.entries).toEqual([{ who: 'player', text: 'hello' }]);
    expect(log.pending).toBe(true);
  });

  it('a reply appends and clears pending', () => {
    const log = receiveReply(sendMessage(openLog('x'), 'hi'), 'well hello', 'llm');
    expect(log.entries[1]).toEqual({ who: 'creature', text: 'well hello', source: 'llm' });
    expect(log.pending).toBe(false);
  });

  it('an error clears pending without inventing an entry', () => {
    const log = receiveError(sendMessage(openLog('x'), 'hi'));
    expect(log.entries.length).toBe(1);
    expect(log.pending).toBe(false);
  });

  it('refuses to send while pending', () => {
    const log = sendMessage(openLog('x'), 'first');
    expect(sendMessage(log, 'second')).toBe(log);
  });

  it('is pure', () => {
    const log = openLog('x');
    sendMessage(log, 'hi');
    expect(log.entries.length).toBe(0);
  });
});
