/**
 * The OpenAI chat-completions wire format, as spoken by the voice gateway
 * (spec §5). Pure functions only: the shim route in app.ts does the wiring.
 * Written against the published OpenAI shape; Task 13 records what the real
 * gateway actually sends, and Task 14 replays those recordings through here.
 */

export interface ChatMessage {
  role: string;
  content: string;
}

export interface OpenAiChatRequest {
  messages: ChatMessage[];
  stream: boolean;
  model: string | null;
}

export interface CompletionMeta {
  id: string;
  created: number;
  model: string;
}

/** A message's speakable text: a plain string, or its text parts joined. */
function contentText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (typeof part !== 'object' || part === null) continue;
      const p = part as Record<string, unknown>;
      if (p.type === 'text' && typeof p.text === 'string') parts.push(p.text);
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }
  return null;
}

export function parseChatRequest(body: unknown): OpenAiChatRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages)) return null;

  const messages: ChatMessage[] = [];
  for (const raw of b.messages) {
    if (typeof raw !== 'object' || raw === null) return null;
    const m = raw as Record<string, unknown>;
    if (typeof m.role !== 'string') return null;
    const text = contentText(m.content);
    // Tool calls and images have no speakable text; skipping one message is
    // recoverable, a request with no readable structure is not.
    if (text === null) continue;
    messages.push({ role: m.role, content: text });
  }

  return {
    messages,
    stream: b.stream === true,
    model: typeof b.model === 'string' ? b.model : null,
  };
}

export function lastUserMessage(req: OpenAiChatRequest): string | null {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i]!;
    if (m.role === 'user' && m.content.trim() !== '') return m.content;
  }
  return null;
}

export function chatCompletionJson(text: string, meta: CompletionMeta): object {
  return {
    id: meta.id,
    object: 'chat.completion',
    created: meta.created,
    model: meta.model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    // The real spend is booked in the village ledger; this shape is for
    // clients that expect the field to exist, not an accounting.
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/**
 * Fake streaming: the reply is already complete, so it goes out as one role
 * chunk, one content chunk, one stop chunk, then [DONE]. Clients that demand
 * `stream: true` get well-formed SSE without the shim ever holding a
 * connection open against a model.
 */
export function sseFrames(text: string, meta: CompletionMeta): string[] {
  const chunk = (delta: object, finish: string | null) =>
    `data: ${JSON.stringify({
      id: meta.id,
      object: 'chat.completion.chunk',
      created: meta.created,
      model: meta.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  return [chunk({ role: 'assistant' }, null), chunk({ content: text }, null), chunk({}, 'stop'), 'data: [DONE]\n\n'];
}
