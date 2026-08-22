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
export function createChatPanel(opts: { onBubble(creatureId: string, text: string): void }): ChatPanel {
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
          opts.onBubble(target, body.reply.text);
          render();
        }
      })
      .catch(() => {
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
    },
    close() {
      root.hidden = true;
      log = null;
    },
    isOpen: () => !root.hidden,
  };
}
