import { describe, it, expect } from 'vitest';
import { parseChatRequest, lastUserMessage, chatCompletionJson, sseFrames } from './openai.js';

const META = { id: 'chatcmpl-test', created: 1_756_000_000, model: 'skill-village-resident' };

describe('parseChatRequest', () => {
  it('accepts the plain shape and reads the stream flag', () => {
    const req = parseChatRequest({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        { role: 'system', content: 'be nice' },
        { role: 'user', content: 'hello?' },
      ],
    });
    expect(req).not.toBe(null);
    expect(req!.stream).toBe(true);
    expect(req!.model).toBe('gpt-4o-mini');
    expect(req!.messages).toEqual([
      { role: 'system', content: 'be nice' },
      { role: 'user', content: 'hello?' },
    ]);
  });

  it('flattens content-parts arrays to their text', () => {
    const req = parseChatRequest({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'part one' }, { type: 'text', text: 'part two' }] }],
    });
    expect(req!.messages[0]!.content).toBe('part one\npart two');
  });

  it('skips messages with unspeakable content rather than failing the request', () => {
    const req = parseChatRequest({
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] },
        { role: 'user', content: 'the real question' },
      ],
    });
    expect(req!.messages).toHaveLength(1);
  });

  it('rejects non-objects, missing messages, and malformed entries', () => {
    expect(parseChatRequest(null)).toBe(null);
    expect(parseChatRequest('hi')).toBe(null);
    expect(parseChatRequest({})).toBe(null);
    expect(parseChatRequest({ messages: [{ content: 'no role' }] })).toBe(null);
  });
});

describe('lastUserMessage', () => {
  it('takes the newest non-empty user turn', () => {
    const req = parseChatRequest({
      messages: [
        { role: 'user', content: 'old question' },
        { role: 'assistant', content: 'old answer' },
        { role: 'user', content: 'new question' },
      ],
    })!;
    expect(lastUserMessage(req)).toBe('new question');
  });

  it('null when there is no user turn at all', () => {
    const req = parseChatRequest({ messages: [{ role: 'system', content: 'x' }] })!;
    expect(lastUserMessage(req)).toBe(null);
  });
});

describe('responses', () => {
  it('chatCompletionJson matches the OpenAI non-streaming shape', () => {
    const body = chatCompletionJson('Hello there.', META) as Record<string, any>;
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message).toEqual({ role: 'assistant', content: 'Hello there.' });
    expect(body.choices[0].finish_reason).toBe('stop');
  });

  it('sseFrames carries the whole text and terminates with [DONE]', () => {
    const frames = sseFrames('Hello there.', META);
    expect(frames.at(-1)).toBe('data: [DONE]\n\n');
    for (const frame of frames) expect(frame.endsWith('\n\n')).toBe(true);
    const deltas = frames.slice(0, -1).map((f) => JSON.parse(f.slice('data: '.length)));
    expect(deltas[0].choices[0].delta.role).toBe('assistant');
    expect(deltas.map((d) => d.choices[0].delta.content ?? '').join('')).toBe('Hello there.');
    expect(deltas.at(-1).choices[0].finish_reason).toBe('stop');
  });
});
