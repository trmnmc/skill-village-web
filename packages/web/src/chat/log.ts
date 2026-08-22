export interface ChatEntry {
  who: 'player' | 'creature';
  text: string;
  source?: 'llm' | 'canned';
}

export interface ChatLog {
  creatureId: string;
  entries: ChatEntry[];
  pending: boolean;
}

export function openLog(creatureId: string): ChatLog {
  return { creatureId, entries: [], pending: false };
}

/** One message in flight at a time; a second send while pending is a no-op. */
export function sendMessage(log: ChatLog, text: string): ChatLog {
  if (log.pending) return log;
  return { ...log, entries: [...log.entries, { who: 'player', text }], pending: true };
}

export function receiveReply(log: ChatLog, text: string, source: 'llm' | 'canned'): ChatLog {
  return { ...log, entries: [...log.entries, { who: 'creature', text, source }], pending: false };
}

/** Network failure: the player's message stands, the creature just didn't hear. */
export function receiveError(log: ChatLog): ChatLog {
  return { ...log, pending: false };
}
