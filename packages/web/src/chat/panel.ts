import { openLog, receiveError, receiveReply, sendMessage, type ChatLog } from './log.js';

export interface ChatPanel {
  open(creature: { id: string; label: string }): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * A plain DOM side panel — deliberately not KAPLAY. Text input, scrollback,
 * focus management and IME behaviour are what the DOM is good at; the canvas
 * stays a place where creatures live. The panel talks to the server directly
 * and hands each creature reply to the scene through onBubble so it can float
 * over the villager's head as well.
 */
export function createChatPanel(opts: {
  onBubble(creatureId: string, text: string): void;
  /** A message is in flight — the scene shows a thought bubble. */
  onThinking(creatureId: string): void;
  /** The flight ended without a line to speak — retire the thought bubble. */
  onThinkingDone(creatureId: string): void;
}): ChatPanel {
  const root = document.createElement('aside');
  root.id = 'chat-panel';
  root.hidden = true;
  root.innerHTML = `
    <header><span id="chat-title"></span><button id="chat-close" type="button" aria-label="Close">×</button></header>
    <ol id="chat-entries"></ol>
    <form id="chat-form">
      <input id="chat-input" type="text" maxlength="4000" autocomplete="off" placeholder="Say something…" />
    </form>
  `;
  document.body.appendChild(root);

  const title = root.querySelector<HTMLSpanElement>('#chat-title')!;
  const entriesEl = root.querySelector<HTMLOListElement>('#chat-entries')!;
  const form = root.querySelector<HTMLFormElement>('#chat-form')!;
  const input = root.querySelector<HTMLInputElement>('#chat-input')!;

  let log: ChatLog | null = null;

  const render = () => {
    if (!log) return;
    entriesEl.replaceChildren(
      ...log.entries.map((entry) => {
        const li = document.createElement('li');
        li.dataset.who = entry.who;
        li.textContent = entry.source === 'canned' ? `${entry.text} (canned)` : entry.text;
        return li;
      }),
    );
    if (log.pending) {
      // The first exchange writes the creature's whole personality before it
      // answers, which takes long enough to read as a hang without this.
      const li = document.createElement('li');
      li.dataset.who = 'creature';
      li.className = 'thinking';
      li.textContent = '· · ·';
      entriesEl.appendChild(li);
    }
    input.disabled = log.pending;
    if (!log.pending) input.focus();
    entriesEl.scrollTop = entriesEl.scrollHeight;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!log || log.pending || text === '') return;
    const target = log.creatureId;
    log = sendMessage(log, text);
    input.value = '';
    render();
    opts.onThinking(target);

    void fetch(`/api/creatures/${encodeURIComponent(target)}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { reply: { text: string; source: 'llm' | 'canned' } };
        if (log && log.creatureId === target) {
          log = receiveReply(log, body.reply.text, body.reply.source);
          // The spoken bubble replaces the thought bubble in one move.
          opts.onBubble(target, body.reply.text);
          render();
        } else {
          opts.onThinkingDone(target);
        }
      })
      .catch(() => {
        opts.onThinkingDone(target);
        if (log && log.creatureId === target) {
          log = receiveError(log);
          render();
        }
      });
  });

  root.querySelector('#chat-close')!.addEventListener('click', () => {
    root.hidden = true;
    log = null;
  });

  return {
    open(creature) {
      log = openLog(creature.id);
      title.textContent = creature.label;
      root.hidden = false;
      render();
      // Prefetch: start writing the personality card while the player is
      // still typing their first message. Best-effort — the chat path
      // regenerates the card itself, and the server single-flights the two.
      void fetch(`/api/creatures/${encodeURIComponent(creature.id)}/persona`, { method: 'POST' }).catch(
        () => {},
      );
    },
    close() {
      root.hidden = true;
      log = null;
    },
    isOpen: () => !root.hidden,
  };
}
