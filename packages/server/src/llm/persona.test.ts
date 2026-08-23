import { describe, it, expect, beforeEach } from 'vitest';
import { parsePersona, generatePersona } from './persona.js';
import { createLlmService } from './service.js';
import { defaultLlmState } from './ledger.js';
import { fakeCliCommand, resetFakeCli } from './testing/fake.js';

const NOON = Date.UTC(2026, 7, 22, 12, 0, 0);

const VALID = JSON.stringify({
  nickname: 'Nit',
  temperament: 'a fastidious detective',
  voice: 'clipped and faintly smug',
  quirks: ['squints at diffs'],
  likes: ['small commits'],
  dislikes: ['force pushes'],
  lines: Array.from({ length: 20 }, (_, i) => `line ${i}`),
});

function serviceWith(behaviour: string) {
  let state = defaultLlmState(NOON);
  return createLlmService({
    command: fakeCliCommand(behaviour),
    now: () => NOON,
    getLlm: () => state,
    setLlm: async (next) => { state = next; },
  });
}

beforeEach(resetFakeCli);

describe('parsePersona', () => {
  it('parses a clean JSON reply', () => {
    const persona = parsePersona(VALID)!;
    expect(persona.nickname).toBe('Nit');
    expect(persona.card.temperament).toBe('a fastidious detective');
    expect(persona.cannedLines.length).toBe(20);
  });

  it('strips a markdown fence, which models add even when told not to', () => {
    expect(parsePersona('```json\n' + VALID + '\n```')).not.toBeNull();
  });

  it('rejects prose, missing fields, and wrong types', () => {
    expect(parsePersona('I would love to help!')).toBeNull();
    expect(parsePersona('{"nickname":"X"}')).toBeNull();
    expect(parsePersona(VALID.replace('"quirks":["squints at diffs"]', '"quirks":"not a list"'))).toBeNull();
  });

  it('trims an absurd pool rather than rejecting it', () => {
    const big = JSON.parse(VALID);
    big.lines = Array.from({ length: 200 }, (_, i) => `l${i}`);
    expect(parsePersona(JSON.stringify(big))!.cannedLines.length).toBe(24);
  });

  it('rejects an empty nickname', () => {
    expect(parsePersona(VALID.replace('"Nit"', '"  "'))).toBeNull();
  });
});

describe('generatePersona', () => {
  const input = { kind: 'skill' as const, name: 'code-review', description: 'Reviews diffs', body: '# body' };

  it('returns a persona from a well-behaved model', async () => {
    const service = serviceWith('card');
    await service.probe();
    const persona = await generatePersona(service, input);
    expect(persona?.nickname).toBe('Nit');
  });

  it('retries once past a malformed reply', async () => {
    // The keyed marker belongs to this test alone; the probe burns one
    // broken call, the keyed reset re-arms it, and the two generatePersona
    // attempts then see broken-then-valid regardless of what parallel
    // workers' bare resetFakeCli() calls are doing.
    const service = serviceWith('card-broken-once:persona-retry');
    await service.probe();
    await resetFakeCli('persona-retry');
    const persona = await generatePersona(service, input);
    expect(persona?.nickname).toBe('Nit');
  });

  it('returns null, never throws, when the model is unavailable', async () => {
    const service = serviceWith('unauthenticated');
    await service.probe();
    expect(await generatePersona(service, input)).toBeNull();
  });

  it('sends its own small system prompt so the card call is slim too', async () => {
    // Without one, the CLI falls back to its full Claude Code preamble and
    // the card call pays the ~30k-token toll the chat calls just escaped.
    const seen: Array<{ system?: string }> = [];
    const capturing = {
      mode: () => 'full' as const,
      probe: async () => 'full' as const,
      request: async (req: { system?: string }) => {
        seen.push(req);
        return { ok: true as const, text: VALID };
      },
    };
    await generatePersona(capturing, input);
    expect(seen[0]!.system).toMatch(/village/i);
  });
});
