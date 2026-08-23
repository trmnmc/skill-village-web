# Robot Embodiment R1+R2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The M5StackChan robot on the desk becomes a house: drag a creature onto the robot-house in the web village and the physical robot answers voice conversations as that creature.

**Architecture:** The robot runs XiaoZhi-compatible open firmware pointed at a self-hosted voice gateway (xiaozhi-esp32-server, Docker on the user's PC) which does local speech-to-text and TTS. The gateway's "LLM" is a new OpenAI-chat-compatible shim inside skill-village-server that looks up the persisted `robot.residentId` per turn and routes through the existing M4 chat pipeline (`village.chat`) with a spoken-mode system prompt. The web village gains a robot-house building with drag-and-drop.

**Tech Stack:** TypeScript workspaces (Node 22, `"type": "module"`), Fastify + @fastify/websocket (server), KAPLAY + Vite (web), vitest, fake claude CLI for all model paths. Gateway is external open-source (Docker), not vendored.

**Spec:** `docs/superpowers/specs/2026-08-23-robot-embodiment-design.md`

**Not planned here:** R3 (move-in greeting, idle canned lines, per-creature voices, mood→face). Its tasks depend on facts only R1 can produce — whether the gateway supports server-initiated speech and per-request TTS voice parameters. Plan R3 after Task 13's fixtures and notes exist.

## Global Constraints

- **Privacy invariants (spec §3):** the user's voice audio never leaves the PC — ASR is local; robot firmware points only at the LAN gateway, never xiaozhi.me. Only text leaves: conversation text to Anthropic (claude CLI), reply text to OpenAI TTS.
- **Never write under `~/.claude`** (standing rule; unchanged by this plan).
- **One ledger:** robot turns spend the same M4 interactive budget as the chat panel (`kind: 'chatter'`, `budget: 'interactive'`, haiku).
- **Never mute:** every shim response returns speakable text — LLM reply, canned line, or a fixed house line. No empty 200s.
- **Kind-agnostic:** nothing added may branch on `CreatureKind`; any creature can be resident (the M5 remap's project creatures included, unseen).
- **CI spends no tokens and needs no hardware:** all tests use `fakeCliCommand(...)` and `app.inject(...)`; the physical robot appears only in manual checkpoints (Task 13).
- **Spoken replies are short:** the spoken-mode prompt demands one to three short sentences, no markdown, no lists.
- Ports: server `8262` (`DEFAULT_PORT`), Vite `5173`. Data dir `~/.skill-village`.
- Run tests from the repo root: `npx vitest run <file>` (workspace-aware). Typecheck: `npm run typecheck`.
- Commit after every green test cycle; message style follows the repo (`feat:`/`fix:`/plain sentence, lower-case).

---

### Task 1: Branch off current main and pin the baseline

The spec brainstorm ran in a worktree forked before M4 merged. Execution starts from **current main**.

**Files:** none created; this is git + verification only.

- [ ] **Step 1: Create the branch from main**

```bash
git fetch origin && git checkout -b robot-embodiment origin/main && npm install
```

- [ ] **Step 2: Verify the baseline is green**

Run: `npx vitest run` and `npm run typecheck`
Expected: all tests pass, no type errors. If main is red, STOP and report — do not build on a red base.

- [ ] **Step 3: Check the state-version collision**

Run: `grep -n "STATE_VERSION" packages/server/src/state/schema.ts`
Expected: `export const STATE_VERSION = 2;`
If it already says `3` (the M5 remap landed first), every "3" in Task 3 becomes "4" and its migration adds the robot block on top of v3 instead of v2. Note the substitution in the task's commit message.

- [ ] **Step 4: Confirm the two symbols this plan builds on exist**

Run: `grep -n "chatSystemPrompt" packages/core/src/personality/prompt.ts && grep -n "async chat(" packages/server/src/village.ts`
Expected: both found. If `village.chat`'s signature already takes a third argument, STOP and report (a concurrent track got there first).

---

### Task 2: `spokenSystemPrompt` (core)

The system prompt a creature speaks with through the robot. Same personality card as `chatSystemPrompt`, different framing: out loud, short, no markup.

**Files:**
- Modify: `packages/core/src/personality/prompt.ts`
- Test: `packages/core/src/personality/prompt.test.ts` (exists — add cases)

**Interfaces:**
- Consumes: `Creature`, `PersonalityCard`, `moodWord` (all already in the file).
- Produces: `spokenSystemPrompt(creature: Creature): string` — exported from `@village/core` via the existing `export * from './personality/prompt.js'`. Task 4 imports it by this exact name.

- [ ] **Step 1: Write the failing tests** (append to the existing describe blocks in `prompt.test.ts`, using whatever creature fixture helper the file already uses — read the file first and reuse its fixture)

```ts
describe('spokenSystemPrompt', () => {
  it('frames the creature as speaking aloud through a robot, not a bubble', () => {
    const text = spokenSystemPrompt(creatureFixture());
    expect(text).toContain('speaking aloud');
    expect(text).toContain('one to three short sentences');
    expect(text).not.toContain('speech bubble');
  });

  it('carries the personality card when present', () => {
    const c = creatureFixture();
    c.personality = {
      temperament: 'a fastidious detective',
      voice: 'clipped and faintly smug',
      quirks: ['squints at diffs'],
      likes: ['small commits'],
      dislikes: ['force pushes'],
    };
    const text = spokenSystemPrompt(c);
    expect(text).toContain('a fastidious detective');
    expect(text).toContain('clipped and faintly smug');
  });

  it('forbids markup a robot voice cannot say', () => {
    const text = spokenSystemPrompt(creatureFixture());
    expect(text).toContain('No markdown');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/personality/prompt.test.ts`
Expected: FAIL — `spokenSystemPrompt` is not exported.

- [ ] **Step 3: Implement**

In `prompt.ts`, first extract the card block shared with `chatSystemPrompt` (behaviour-preserving refactor), then add the new function:

```ts
/** The personality-card lines shared by every system prompt a creature speaks with. */
function personaLines(card: PersonalityCard | null): string[] {
  if (!card) return [];
  return [
    `Temperament: ${card.temperament}.`,
    `Voice: ${card.voice}.`,
    card.quirks.length ? `Quirks: ${card.quirks.join('; ')}.` : '',
    card.likes.length ? `You like: ${card.likes.join(', ')}.` : '',
    card.dislikes.length ? `You dislike: ${card.dislikes.join(', ')}.` : '',
    '',
  ];
}

/**
 * The system prompt a creature speaks with through the physical robot (spec
 * §5). Same card, different mouth: the words come out of a small speaker, so
 * they must be short, plain, and speakable.
 */
export function spokenSystemPrompt(creature: Creature): string {
  const called = creature.nickname || creature.name;

  const lines = [
    `You are ${called}, a small creature from a village game, and right now you are`,
    `speaking aloud through a little desktop robot body on your player's desk.`,
    `You are the living embodiment of a Claude Code ${creature.kind} called "${creature.name}".`,
    `That is your job and your whole sense of self: it is what you are for, and you are proud of it.`,
    '',
    ...personaLines(creature.personality),
    `Right now you feel ${moodWord(creature.stats.mood)}.`,
    '',
    'You are speaking aloud: reply in one to three short sentences of plain spoken words.',
    'No markdown, no lists, no stage directions, no emoji — only words a small robot can',
    'say with its voice. Never mention that you are an AI, a file, or a language model.',
    'You are a creature.',
  ];

  return lines.filter((line) => line !== '').join('\n');
}
```

Replace the inlined card block inside `chatSystemPrompt` with `...personaLines(card)` so the two never drift. `chatSystemPrompt`'s output must remain byte-identical (its existing tests are the proof).

- [ ] **Step 4: Run the core test suite**

Run: `npx vitest run packages/core`
Expected: PASS — including every pre-existing `chatSystemPrompt` test, untouched.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/personality/prompt.ts packages/core/src/personality/prompt.test.ts
git commit -m "feat(core): spoken-mode system prompt for the robot mouth"
```

---

### Task 3: State schema v3 — the robot block

One persisted field: who lives in the robot. Ships with the version bump and in-place migration (M4's own pattern).

**Files:**
- Modify: `packages/server/src/state/schema.ts`
- Modify: `packages/server/src/state/store.ts`
- Test: `packages/server/src/state/store.test.ts` (exists — add cases)

**Interfaces:**
- Produces: `RobotState { residentId: string | null }`; `VillageState.robot: RobotState`; `STATE_VERSION = 3`; `migrateState` handling v1/v2 → v3. Tasks 4, 6, 7 read `state.robot.residentId`.

(If Task 1 Step 3 found version 3 taken: use 4 here, and the migration below gains a `parsed.version === 3` branch that only adds the robot block.)

- [ ] **Step 1: Write the failing tests** (append to `store.test.ts`, following its existing fixture style — it already writes versioned JSON files into a sandbox and calls `loadState`)

```ts
describe('robot block (v3)', () => {
  it('a fresh state carries an empty robot house', async () => {
    // however the file's existing tests obtain a fresh state via loadState
    // on an empty dir — mirror that setup exactly
    const { state } = await loadState(paths, NOW);
    expect(state.version).toBe(3);
    expect(state.robot).toEqual({ residentId: null });
  });

  it('migrates a v2 save in place, preserving everything else', async () => {
    // write a valid v2 state file (creatures + llm block, version: 2) the way
    // the existing migration test writes a v1 file, then:
    const { state, recovered } = await loadState(paths, NOW);
    expect(recovered).toBe(false);
    expect(state.version).toBe(3);
    expect(state.robot).toEqual({ residentId: null });
    expect(state.llm.config.interactiveCap).toBe(500_000); // v2 content survived
  });

  it('a v3 file without a robot block is invalid, and the backup is used', async () => {
    // write main state: version 3, llm present, robot missing
    // write backup: a valid v2 state
    const { state, recovered } = await loadState(paths, NOW);
    expect(recovered).toBe(true);
    expect(state.robot).toEqual({ residentId: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/state/store.test.ts`
Expected: FAIL — `robot` does not exist on `VillageState` / version is 2.

- [ ] **Step 3: Implement schema.ts**

```ts
/** Who lives in the physical robot (R-track). Null: the house stands empty. */
export interface RobotState {
  residentId: string | null;
}
```

- `STATE_VERSION` → `3`.
- `VillageState` gains `robot: RobotState;` (place it after `llm`).
- `emptyState` gains `robot: { residentId: null },`.
- Replace `migrateState`:

```ts
/**
 * Upgrade an older on-disk state in memory. v1 -> v2 added the llm block;
 * v2 -> v3 adds the robot house. Called only after the caller has validated
 * `parsed` as a known-version state shape — never with an arbitrary unknown.
 */
export function migrateState(
  parsed: VillageState & { llm?: LlmState; robot?: RobotState },
  now: number,
): VillageState {
  if (parsed.version === 3) return parsed as VillageState;
  if (parsed.version === 2) return { ...parsed, version: 3, robot: { residentId: null } };
  // parsed.version === 1: everything v1 validated still holds.
  return { ...parsed, version: 3, llm: defaultLlmState(now), robot: { residentId: null } };
}
```

- [ ] **Step 4: Implement store.ts validation**

In `readStateFile`, the current-version block gains the robot check:

```ts
    // A file already at the current version must carry its llm and robot
    // blocks; older versions are missing them by definition and pick up
    // defaults on migration.
    if (parsed.version === STATE_VERSION) {
      if (typeof parsed.llm !== 'object' || parsed.llm === null) {
        return { ok: false, reason: 'invalid' };
      }
      if (typeof parsed.robot !== 'object' || parsed.robot === null) {
        return { ok: false, reason: 'invalid' };
      }
    }
```

- [ ] **Step 5: Run the server state tests, then the whole suite**

Run: `npx vitest run packages/server/src/state` then `npx vitest run`
Expected: PASS. (Any test elsewhere that hand-builds a `VillageState` literal will now fail to typecheck — extend those literals with `robot: { residentId: null }`; that is part of this task.)

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add -A packages
git commit -m "feat(server): state v3 carries the robot house resident"
```

---

### Task 4: Village runtime — resident, events, spoken chat

The village learns who lives in the robot and how to speak out loud.

**Files:**
- Modify: `packages/server/src/village.ts`
- Modify: `packages/server/src/state/events.ts`
- Test: `packages/server/src/village.test.ts` (exists — add cases)

**Interfaces:**
- Consumes: `spokenSystemPrompt` from `@village/core` (Task 2), `state.robot` (Task 3).
- Produces (Tasks 6 and 7 call these exact members on `Village`):
  - `chat(creatureId: string, message: string, style?: 'bubble' | 'spoken'): Promise<ChatReply>` — third param new, default `'bubble'`.
  - `setRobotResident(creatureId: string | null): Promise<void>` — throws `Error("Creature not found: <id>")` for an unknown non-null id; same-id set is a no-op.
  - `robotActivityAt(): number | null` — epoch millis of the last spoken turn this process served, in-memory only.
  - Event types `'robot-moved-in'` and `'robot-moved-out'`.

- [ ] **Step 1: Extend the event union** in `events.ts`:

```ts
export type VillageEventType =
  | 'moved-in'
  | 'resynced'
  | 'auto-released'
  | 'cared-for'
  | 'stage-changed'
  | 'import-failed'
  | 'persona-written'
  | 'persona-failed'
  | 'chatted'
  | 'robot-moved-in'
  | 'robot-moved-out';
```

- [ ] **Step 2: Write the failing tests** (append to `village.test.ts`; reuse its `makeSandbox` + `writeSkill` + `skillFixture` setup and its fake-CLI wiring — the file already builds villages with `llmFactory: (hooks) => createLlmService({ command: fakeCliCommand('...'), ...hooks })`. Two constraints the snippets below assume: the resident/persistence tests need no LLM at all (omit `llm`/`llmFactory` — the village defaults to silent); the two chat tests build with behaviour `'inspect'` and MUST `await village.probeLlm()` before chatting, because the service boots in silent mode and refuses every request until the probe lands)

```ts
describe('the robot house', () => {
  it('sets, persists, and evicts a resident, with events', async () => {
    // build a village with one skill 'code-review' and behaviour 'card'
    await village.setRobotResident('skill:code-review');
    expect(village.getState().robot.residentId).toBe('skill:code-review');

    await village.setRobotResident(null);
    expect(village.getState().robot.residentId).toBe(null);

    const events = await readEvents(sandbox.paths, {});
    const types = events.map((e) => e.type);
    expect(types).toContain('robot-moved-in');
    expect(types).toContain('robot-moved-out');
  });

  it('refuses an unknown resident', async () => {
    await expect(village.setRobotResident('skill:nobody')).rejects.toThrow('Creature not found');
  });

  it('the resident survives a reload', async () => {
    await village.setRobotResident('skill:code-review');
    await village.close();
    const reopened = await createVillage({ paths: sandbox.paths, now: NOW }); // no llm: defaults silent
    expect(reopened.getState().robot.residentId).toBe('skill:code-review');
    await reopened.close();
  });

  it('spoken chat sends the spoken system prompt to the CLI', async () => {
    // behaviour 'inspect': the reply text is JSON describing what the child saw
    const reply = await village.chat('skill:code-review', 'hello robot', 'spoken');
    expect(reply.source).toBe('llm');
    const seen = JSON.parse(reply.text);
    expect(seen.system).toContain('speaking aloud');
    expect(seen.system).not.toContain('speech bubble');
  });

  it('spoken chat stamps robot activity; bubble chat does not', async () => {
    expect(village.robotActivityAt()).toBe(null);
    await village.chat('skill:code-review', 'hi', 'bubble');
    expect(village.robotActivityAt()).toBe(null);
    await village.chat('skill:code-review', 'hi', 'spoken');
    expect(village.robotActivityAt()).toBe(NOW_MS); // the injected clock's value
  });
});
```

Note on the `inspect` test: `ensurePersona` runs before the chat call and will also hit the fake CLI; the `inspect` behaviour answers every call with its inspection JSON, which `parsePersona` rejects, so the creature simply stays card-less — harmless here. The chat reply itself is the last `inspect` output.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/village.test.ts`
Expected: FAIL — `setRobotResident` / `robotActivityAt` do not exist; `chat` takes two args.

- [ ] **Step 4: Implement in `village.ts`**

Interface additions (to the `Village` interface, with doc comments in the file's voice):

```ts
  chat(creatureId: string, message: string, style?: 'bubble' | 'spoken'): Promise<ChatReply>;
  /** Move a creature into (or out of, with null) the physical robot. */
  setRobotResident(creatureId: string | null): Promise<void>;
  /** When the robot last spoke through this process, or null. In-memory only. */
  robotActivityAt(): number | null;
```

Implementation, inside `createVillage` (import `spokenSystemPrompt` alongside `chatSystemPrompt` from `@village/core`):

```ts
  /** Epoch millis of the last spoken (robot) turn this process served. */
  let robotLastTurnAt: number | null = null;
```

In `chat(creatureId, message, style = 'bubble')`:
- system prompt: `const system = style === 'spoken' ? spokenSystemPrompt(fresh) : chatSystemPrompt(fresh);`
- the prompt's closing line becomes style-aware:

```ts
      const prompt = [
        `The player says to you: "${message}"`,
        '',
        style === 'spoken'
          ? 'Reply as yourself, out loud, in one to three short sentences.'
          : 'Reply as yourself, in one or two short sentences.',
      ].join('\n');
```

- just before the `return { text, source: ... }`: `if (style === 'spoken') robotLastTurnAt = at;`

New members on the returned object:

```ts
    async setRobotResident(creatureId) {
      if (creatureId === state.robot.residentId) return;
      const at = now();
      const events: VillageEvent[] = [];
      const previous = state.robot.residentId;
      if (previous !== null) {
        const old = state.creatures[previous];
        events.push({ at, type: 'robot-moved-out', creatureId: previous, detail: old ? old.nickname || old.name : previous });
      }
      if (creatureId !== null) {
        const creature = state.creatures[creatureId];
        if (!creature) throw new Error(`Creature not found: ${creatureId}`);
        events.push({ at, type: 'robot-moved-in', creatureId, detail: creature.nickname || creature.name });
      }
      await commit({ ...state, updatedAt: at, robot: { residentId: creatureId } }, events);
    },

    robotActivityAt() {
      return robotLastTurnAt;
    },
```

- [ ] **Step 5: Run the village tests, then the whole suite**

Run: `npx vitest run packages/server/src/village.test.ts` then `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/village.ts packages/server/src/village.test.ts packages/server/src/state/events.ts
git commit -m "feat(server): village knows its robot resident and can speak aloud"
```

---

### Task 5: OpenAI wire format (`robot/openai.ts`)

Pure functions for the shim: parse what an OpenAI-compatible client sends, build what it expects back — including fake streaming (whole reply chunked into SSE frames).

**Files:**
- Create: `packages/server/src/robot/openai.ts`
- Test: `packages/server/src/robot/openai.test.ts`

**Interfaces:**
- Produces (Task 6 imports all of these):
  - `parseChatRequest(body: unknown): OpenAiChatRequest | null` where `OpenAiChatRequest = { messages: { role: string; content: string }[]; stream: boolean; model: string | null }`
  - `lastUserMessage(req: OpenAiChatRequest): string | null`
  - `chatCompletionJson(text: string, meta: CompletionMeta): object` where `CompletionMeta = { id: string; created: number; model: string }`
  - `sseFrames(text: string, meta: CompletionMeta): string[]` — each element a complete `data: ...\n\n` frame, last one `data: [DONE]\n\n`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/robot/openai.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `openai.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/robot/openai.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/robot
git commit -m "feat(server): OpenAI chat-completions wire format for the robot shim"
```

---

### Task 6: The shim routes

`POST /v1/chat/completions` and `GET /v1/models` on the existing Fastify app, plus the fixture recorder and the LAN-binding env override.

**Files:**
- Modify: `packages/server/src/api/app.ts`
- Modify: `packages/server/src/main.ts` (one line: host binding)
- Test: `packages/server/src/api/app.test.ts` (exists — add cases)

**Interfaces:**
- Consumes: Task 4's `village.chat(id, msg, 'spoken')` and `village.getState().robot.residentId`; Task 5's four functions.
- Produces: the HTTP surface the gateway is configured against — `POST /v1/chat/completions` (JSON or SSE), `GET /v1/models`. Env vars: `SKILL_VILLAGE_ROBOT_FIXTURES` (dir path — record request bodies), `VILLAGE_HOST` (server bind address, default `127.0.0.1`).

- [ ] **Step 1: Write the failing tests** (append to `app.test.ts`, reusing its village-building pattern; use fake behaviour `'ok'` so the reply text is predictable `echo:...`, and `await village.probeLlm()` after construction — the service boots silent and would answer every chat with a canned line otherwise)

```ts
describe('the robot shim', () => {
  it('answers as the resident when one is set', async () => {
    await village.setRobotResident('skill:code-review');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { model: 'anything', messages: [{ role: 'user', content: 'who are you?' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.content).toContain('echo:');
  });

  it('an empty house still speaks', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { messages: [{ role: 'user', content: 'hello?' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().choices[0].message.content).toContain('Nobody lives in me yet');
  });

  it('a resident whose creature has left the village gets the moved-away line', async () => {
    await village.setRobotResident('skill:code-review');
    // remove the skill file and refresh, the way the file's release tests do
    await sandbox.removeSkill('code-review');
    await village.refresh();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { messages: [{ role: 'user', content: 'hello?' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().choices[0].message.content).toContain('moved away');
  });

  it('stream: true returns SSE frames ending in [DONE]', async () => {
    await village.setRobotResident('skill:code-review');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { stream: true, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('chat.completion.chunk');
    expect(res.body.trimEnd().endsWith('data: [DONE]')).toBe(true);
  });

  it('malformed requests get an OpenAI-style 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload: { nope: true } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.type).toBe('invalid_request_error');
  });

  it('/v1/models lists the one model the gateway can pick', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/models' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].id).toBe('skill-village-resident');
  });
});
```

(If `sandbox.removeSkill` does not exist, use whatever removal helper the release/refresh tests in the server suite already use — `rm` on the skill dir path is the fallback; read those tests first.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/api/app.test.ts`
Expected: FAIL — 404 on `/v1/chat/completions`.

- [ ] **Step 3: Implement the routes in `app.ts`**

Imports to add: `mkdir, writeFile` from `node:fs/promises`, `join` from `node:path`, and from `../robot/openai.js`: `parseChatRequest, lastUserMessage, chatCompletionJson, sseFrames`.

```ts
/** Spec §5: the house is never mute, even with nobody home. */
const EMPTY_HOUSE_LINE =
  'Nobody lives in me yet. Open the village and drag a villager onto my little house, and I will be them.';
const MOVED_AWAY_LINE =
  'The villager who lived in me seems to have moved away. Drag someone new onto my house in the village.';

  // ---- The robot shim: an OpenAI-compatible brain for the voice gateway ----
  // The gateway is configured with this server as its one "LLM provider"; it
  // never knows claude exists. Which creature answers is looked up per turn,
  // so a drag-and-drop swap changes the speaker mid-conversation (spec §5).

  app.get('/v1/models', async () => ({
    object: 'list',
    data: [{ id: 'skill-village-resident', object: 'model', created: 0, owned_by: 'skill-village' }],
  }));

  app.post('/v1/chat/completions', async (request, reply) => {
    // R1 fixture capture (spec §11): with the env set, every request body the
    // real gateway sends is kept verbatim, to be committed as test fixtures.
    const fixtureDir = process.env.SKILL_VILLAGE_ROBOT_FIXTURES;
    if (fixtureDir) {
      await mkdir(fixtureDir, { recursive: true });
      await writeFile(
        join(fixtureDir, `chat-${Date.now()}.json`),
        JSON.stringify(request.body, null, 2),
        'utf8',
      );
    }

    const parsed = parseChatRequest(request.body);
    const message = parsed ? lastUserMessage(parsed) : null;
    if (!parsed || message === null) {
      return reply
        .code(400)
        .send({ error: { message: 'Expected an OpenAI chat request with at least one user message.', type: 'invalid_request_error' } });
    }

    const residentId = village.getState().robot.residentId;
    let text: string;
    if (residentId === null) {
      text = EMPTY_HOUSE_LINE;
    } else {
      try {
        // Never mute (spec §5): chat() itself falls back to canned lines on
        // model failure or budget exhaustion, so every path out of here talks.
        text = (await village.chat(residentId, message, 'spoken')).text;
      } catch {
        // The resident's creature left the village while it lived here.
        text = MOVED_AWAY_LINE;
      }
    }

    const meta = {
      id: `chatcmpl-${Date.now().toString(36)}`,
      created: Math.floor(Date.now() / 1000),
      model: parsed.model ?? 'skill-village-resident',
    };

    if (parsed.stream) {
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      for (const frame of sseFrames(text, meta)) reply.raw.write(frame);
      reply.raw.end();
      return;
    }
    return chatCompletionJson(text, meta);
  });
```

- [ ] **Step 4: The host binding** — in `main.ts`, replace the listen line:

```ts
  // 127.0.0.1 unless the player opts the server onto the LAN. The Docker-run
  // voice gateway reaches the host via host.docker.internal, which needs a
  // non-loopback bind on some setups; docs/robot/SETUP.md says when to set it.
  const host = process.env.VILLAGE_HOST ?? '127.0.0.1';
  await app.listen({ port, host });
```

- [ ] **Step 5: Run the api tests, then the whole suite; typecheck**

Run: `npx vitest run packages/server/src/api/app.test.ts` then `npx vitest run` and `npm run typecheck`
Expected: PASS. (If `app.inject` does not surface hijacked SSE bodies in the installed Fastify version, assert on the non-hijacked fields first and adapt: light-my-request buffers raw writes — check its actual output before fighting it.)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/api/app.ts packages/server/src/api/app.test.ts packages/server/src/main.ts
git commit -m "feat(server): OpenAI-compatible robot shim rides the village chat pipeline"
```

---

### Task 7: The robot HTTP API and presence stamp

The web (and curl) can read and set the resident; every state frame carries robot activity for the house's presence glow.

**Files:**
- Modify: `packages/server/src/api/app.ts`
- Test: `packages/server/src/api/app.test.ts` (add cases)

**Interfaces:**
- Consumes: Task 4's `setRobotResident` / `robotActivityAt`.
- Produces: `GET /api/robot` → `{ residentId: string | null, resident: Creature | null, lastTurnAt: number | null }`; `PUT /api/robot/resident` body `{ creatureId: string | null }` → same snapshot (404 unknown id, 400 malformed). State frames (`/api/state` and `/ws`) gain top-level `robotLastTurnAt: number | null` (the persisted `robot` block is already inside the state payload). Task 8's protocol code reads `robot.residentId` and `robotLastTurnAt` by these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
describe('the robot api', () => {
  it('round-trips the resident', async () => {
    const empty = await app.inject({ method: 'GET', url: '/api/robot' });
    expect(empty.json()).toEqual({ residentId: null, resident: null, lastTurnAt: null });

    const set = await app.inject({
      method: 'PUT', url: '/api/robot/resident', payload: { creatureId: 'skill:code-review' },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().residentId).toBe('skill:code-review');
    expect(set.json().resident.id).toBe('skill:code-review');

    const evict = await app.inject({ method: 'PUT', url: '/api/robot/resident', payload: { creatureId: null } });
    expect(evict.json().residentId).toBe(null);
  });

  it('404s an unknown creature and 400s a malformed body', async () => {
    const unknown = await app.inject({ method: 'PUT', url: '/api/robot/resident', payload: { creatureId: 'skill:nobody' } });
    expect(unknown.statusCode).toBe(404);
    const bad = await app.inject({ method: 'PUT', url: '/api/robot/resident', payload: {} });
    expect(bad.statusCode).toBe(400);
  });

  it('state frames carry the robot block and activity stamp', async () => {
    const state = (await app.inject({ method: 'GET', url: '/api/state' })).json();
    expect(state.robot).toEqual({ residentId: null });
    expect(state.robotLastTurnAt).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/api/app.test.ts`
Expected: FAIL — 404 on `/api/robot`.

- [ ] **Step 3: Implement**

Extend `withMode` (both `/api/state` and the `/ws` frames flow through it):

```ts
  const withMode = (state: ReturnType<Village['getState']>) => ({
    ...state,
    llm: { ...state.llm, mode: village.llmMode() },
    // In-memory, not persisted: the presence glow wants "is he talking right
    // now", which a saved timestamp from last week must never answer.
    robotLastTurnAt: village.robotActivityAt(),
  });
```

Routes:

```ts
  const robotSnapshot = () => {
    const s = village.getState();
    const residentId = s.robot.residentId;
    return {
      residentId,
      resident: residentId ? s.creatures[residentId] ?? null : null,
      lastTurnAt: village.robotActivityAt(),
    };
  };

  app.get('/api/robot', async () => robotSnapshot());

  app.put<{ Body: { creatureId?: unknown } }>('/api/robot/resident', async (request, reply) => {
    const creatureId = request.body?.creatureId;
    if (creatureId !== null && typeof creatureId !== 'string') {
      return reply.code(400).send({ error: 'creatureId must be a creature id string, or null to move the resident out' });
    }
    try {
      await village.setRobotResident(creatureId);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
    return robotSnapshot();
  });
```

- [ ] **Step 4: Run the tests, then the whole suite**

Run: `npx vitest run packages/server/src/api/app.test.ts` then `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/app.ts packages/server/src/api/app.test.ts
git commit -m "feat(server): robot resident API and presence stamp on state frames"
```

---

### Task 8: Web protocol and client helper

The renderer's view learns who lives in the robot; one function sets it.

**Files:**
- Modify: `packages/web/src/net/protocol.ts`
- Modify: `packages/web/src/net/client.ts`
- Test: `packages/web/src/net/protocol.test.ts` (exists — add cases)

**Interfaces:**
- Consumes: Task 7's payload fields (`robot.residentId`, `robotLastTurnAt`).
- Produces: `VillageView.robotResidentId: string | null` and `VillageView.robotLastTurnAt: number | null` (Task 11 reads both); `setRobotResident(creatureId: string | null): Promise<boolean>` exported from `client.ts` (Task 12 wires it).

- [ ] **Step 1: Write the failing tests** (append to `protocol.test.ts`, following its existing payload-fixture style)

```ts
describe('robot fields', () => {
  it('reads the resident and activity stamp when present', () => {
    const view = toView({ ...validPayload(), robot: { residentId: 'skill:x' }, robotLastTurnAt: 123 });
    expect(view!.robotResidentId).toBe('skill:x');
    expect(view!.robotLastTurnAt).toBe(123);
  });

  it('defaults both to null on older or partial payloads', () => {
    const view = toView(validPayload());
    expect(view!.robotResidentId).toBe(null);
    expect(view!.robotLastTurnAt).toBe(null);
  });

  it('a malformed robot block reads as empty, never crashes the frame', () => {
    const view = toView({ ...validPayload(), robot: 'garbage', robotLastTurnAt: 'soon' });
    expect(view!.robotResidentId).toBe(null);
    expect(view!.robotLastTurnAt).toBe(null);
  });
});
```

(`validPayload()` stands for whatever minimal-valid-payload helper the file already uses — reuse it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/web/src/net/protocol.test.ts`
Expected: FAIL — property does not exist on `VillageView`.

- [ ] **Step 3: Implement**

`VillageView` gains:

```ts
  /** Who lives in the physical robot, or null. Drawn at the robot-house porch. */
  robotResidentId: string | null;
  /** When the robot last spoke (server process memory), for the presence glow. */
  robotLastTurnAt: number | null;
```

In `toView`, before the return:

```ts
  let robotResidentId: string | null = null;
  const rawRobot = (p as { robot?: unknown }).robot;
  if (typeof rawRobot === 'object' && rawRobot !== null) {
    const r = rawRobot as { residentId?: unknown };
    if (typeof r.residentId === 'string') robotResidentId = r.residentId;
  }
  const rawTurn = (p as { robotLastTurnAt?: unknown }).robotLastTurnAt;
  const robotLastTurnAt = typeof rawTurn === 'number' ? rawTurn : null;
```

…and both fields in the returned object.

In `client.ts`:

```ts
/**
 * Move a creature into (or out of, with null) the robot. True on success;
 * false is "the server said no or is away", which the caller treats as
 * "nothing happened" — the next state frame is the truth either way.
 */
export async function setRobotResident(creatureId: string | null): Promise<boolean> {
  try {
    const res = await fetch('/api/robot/resident', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creatureId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run web tests; typecheck**

Run: `npx vitest run packages/web` and `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/net
git commit -m "feat(web): state view carries the robot resident; client can set it"
```

---

### Task 9: Robot-house placement (`layout/robot.ts`)

Where the robot-house stands, its drop hit-box, and the porch spot the resident stands on. Pure data + one predicate, so the drop logic is testable without a canvas.

**Files:**
- Create: `packages/web/src/layout/robot.ts`
- Test: `packages/web/src/layout/robot.test.ts`

**Interfaces:**
- Consumes: `ZONES`, `GROUND_Y`, `Spot` from `./zones.js`.
- Produces (Tasks 11 uses all): `ROBOT_HOUSE_X`, `ROBOT_HOUSE_Y` (numbers, world px), `ROBOT_HOUSE_BOX: { x: number; y: number; w: number; h: number }`, `inRobotHouse(worldX: number, worldY: number): boolean`, `PORCH_SPOT: Spot`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { ROBOT_HOUSE_BOX, ROBOT_HOUSE_X, inRobotHouse, PORCH_SPOT } from './robot.js';
import { ZONES, GROUND_Y } from './zones.js';

describe('the robot-house plot', () => {
  it('stands inside the Homes zone', () => {
    const homes = ZONES.find((z) => z.id === 'homes')!;
    expect(ROBOT_HOUSE_X).toBeGreaterThan(homes.x);
    expect(ROBOT_HOUSE_X + ROBOT_HOUSE_BOX.w).toBeLessThan(homes.x + homes.w);
  });

  it('the hit box accepts its centre and rejects the field beside it', () => {
    const cx = ROBOT_HOUSE_BOX.x + ROBOT_HOUSE_BOX.w / 2;
    const cy = ROBOT_HOUSE_BOX.y + ROBOT_HOUSE_BOX.h / 2;
    expect(inRobotHouse(cx, cy)).toBe(true);
    expect(inRobotHouse(cx + 400, cy)).toBe(false);
    expect(inRobotHouse(cx, GROUND_Y + 200)).toBe(false);
  });

  it('the porch stands on the ground, beside the house, outside the drop box', () => {
    expect(PORCH_SPOT.y).toBe(GROUND_Y);
    expect(inRobotHouse(PORCH_SPOT.x, PORCH_SPOT.y - 34)).toBe(false); // body midpoint clear of the box
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/web/src/layout/robot.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `robot.ts`**

```ts
import { GROUND_Y, ZONES, type Spot } from './zones.js';

/**
 * The robot-house plot (spec §4). Placed in the clear stretch of Homes
 * between the decor house at homes.x+900 and the tree at homes.x+1240, so it
 * reads as one of the buildings rather than furniture in the crowd.
 */
const HOMES = ZONES.find((z) => z.id === 'homes')!;

export const ROBOT_HOUSE_X = HOMES.x + 1040;
/** Same baseline the decor houses sit on. */
export const ROBOT_HOUSE_Y = GROUND_Y - 30;

/**
 * The drop target. Wider and taller than the drawn building on purpose: a
 * drag is a gross gesture, and "close enough to the house" must count.
 */
export const ROBOT_HOUSE_BOX = Object.freeze({
  x: ROBOT_HOUSE_X - 16,
  y: ROBOT_HOUSE_Y - 118,
  w: 130,
  h: 130,
});

export function inRobotHouse(worldX: number, worldY: number): boolean {
  return (
    worldX >= ROBOT_HOUSE_BOX.x &&
    worldX <= ROBOT_HOUSE_BOX.x + ROBOT_HOUSE_BOX.w &&
    worldY >= ROBOT_HOUSE_BOX.y &&
    worldY <= ROBOT_HOUSE_BOX.y + ROBOT_HOUSE_BOX.h
  );
}

/**
 * Where the resident stands: on the front row beside the house, visible at a
 * glance (spec §4: the creature is shown at the house, never hidden inside).
 */
export const PORCH_SPOT: Spot = Object.freeze({ x: ROBOT_HOUSE_X + 150, y: GROUND_Y });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/web/src/layout/robot.test.ts`
Expected: PASS. If the porch/hit-box assertion fails on the numbers, adjust `PORCH_SPOT.x` outward (not the box inward) until it passes — the box is the contract.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/layout/robot.ts packages/web/src/layout/robot.test.ts
git commit -m "feat(web): robot-house plot, drop box, and porch spot"
```

---

### Task 10: Drag gesture tracker (`input/drag.ts`)

A pure state machine deciding click vs drag vs drop, so the scene's messy DOM listeners stay one-line thin and the logic is unit-tested. Mirrors the click-slop semantics already living in `village.ts` (CLICK_SLOP = 6 client px).

**Files:**
- Create: `packages/web/src/input/drag.ts`
- Test: `packages/web/src/input/drag.test.ts`

**Interfaces:**
- Produces (Task 11 consumes):

```ts
export type GestureEnd =
  | { type: 'none' }
  | { type: 'click'; targetId: string }
  | { type: 'drop'; targetId: string };
export interface DragTracker {
  press(clientX: number, clientY: number, targetId: string | null): void;
  move(clientX: number, clientY: number): void;
  release(clientX: number, clientY: number): GestureEnd;
  cancel(): void;
  /** Null when no creature-press is live; `dragging` once past the slop. */
  current(): { targetId: string; dragging: boolean } | null;
}
export function createDragTracker(slop?: number): DragTracker;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createDragTracker } from './drag.js';

describe('drag tracker', () => {
  it('a press that barely moves is a click', () => {
    const t = createDragTracker(6);
    t.press(100, 100, 'skill:x');
    t.move(103, 102);
    expect(t.release(103, 102)).toEqual({ type: 'click', targetId: 'skill:x' });
    expect(t.current()).toBe(null);
  });

  it('a press that travels past the slop becomes a drag and ends in a drop', () => {
    const t = createDragTracker(6);
    t.press(100, 100, 'skill:x');
    expect(t.current()).toEqual({ targetId: 'skill:x', dragging: false });
    t.move(140, 100);
    expect(t.current()).toEqual({ targetId: 'skill:x', dragging: true });
    expect(t.release(300, 200)).toEqual({ type: 'drop', targetId: 'skill:x' });
  });

  it('once dragging, snapping back under the slop stays a drag', () => {
    const t = createDragTracker(6);
    t.press(100, 100, 'skill:x');
    t.move(140, 100);
    t.move(101, 100);
    expect(t.release(101, 100)).toEqual({ type: 'drop', targetId: 'skill:x' });
  });

  it('a press on empty ground is nobody\'s gesture', () => {
    const t = createDragTracker(6);
    t.press(100, 100, null);
    t.move(200, 200);
    expect(t.current()).toBe(null);
    expect(t.release(200, 200)).toEqual({ type: 'none' });
  });

  it('cancel forgets everything', () => {
    const t = createDragTracker(6);
    t.press(100, 100, 'skill:x');
    t.move(200, 200);
    t.cancel();
    expect(t.current()).toBe(null);
    expect(t.release(200, 200)).toEqual({ type: 'none' });
  });

  it('release without press is none', () => {
    const t = createDragTracker(6);
    expect(t.release(1, 1)).toEqual({ type: 'none' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/web/src/input/drag.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `drag.ts`**

```ts
/**
 * Click vs drag vs drop, decided in the events' own client coordinates —
 * the same slop-in-client-pixels rule the village's click handler has always
 * used (see the long comment on the mousedown block in scene/village.ts for
 * why client coordinates and not k.mousePos()).
 *
 * The tracker only ever owns a press that started on a creature; a press on
 * empty ground stays the camera-pan's business and reads as no gesture here.
 */
export type GestureEnd =
  | { type: 'none' }
  | { type: 'click'; targetId: string }
  | { type: 'drop'; targetId: string };

export interface DragTracker {
  press(clientX: number, clientY: number, targetId: string | null): void;
  move(clientX: number, clientY: number): void;
  release(clientX: number, clientY: number): GestureEnd;
  cancel(): void;
  current(): { targetId: string; dragging: boolean } | null;
}

const DEFAULT_SLOP = 6;

export function createDragTracker(slop: number = DEFAULT_SLOP): DragTracker {
  let live: { targetId: string; fromX: number; fromY: number; dragging: boolean } | null = null;

  const past = (x: number, y: number) =>
    live !== null && Math.hypot(x - live.fromX, y - live.fromY) >= slop;

  return {
    press(clientX, clientY, targetId) {
      live = targetId === null ? null : { targetId, fromX: clientX, fromY: clientY, dragging: false };
    },
    move(clientX, clientY) {
      // One-way: a drag that wanders back near its origin is still a drag.
      if (live && !live.dragging && past(clientX, clientY)) live.dragging = true;
    },
    release(clientX, clientY) {
      const ended = live;
      live = null;
      if (!ended) return { type: 'none' };
      if (ended.dragging || past(clientX, clientY)) return { type: 'drop', targetId: ended.targetId };
      return { type: 'click', targetId: ended.targetId };
    },
    cancel() {
      live = null;
    },
    current() {
      return live ? { targetId: live.targetId, dragging: live.dragging } : null;
    },
  };
}
```

(Note `past` in `release`: a fast one-frame flick can reach release before any `move` fired; measuring again at release keeps that a drop, mirroring how the old code measured slop at release.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/web/src/input/drag.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/input
git commit -m "feat(web): pure click/drag/drop gesture tracker"
```

---

### Task 11: The robot-house in the scene

Draw the house, wire the tracker into the scene's input, stand the resident at the porch, glow with presence. This task is scene code — the repo deliberately keeps KAPLAY scene files untested (the logic they call is what Tasks 9–10 tested); the gates here are typecheck, the full suite staying green, and Task 12's live smoke.

**Files:**
- Create: `packages/web/src/scene/robotHouse.ts`
- Modify: `packages/web/src/scene/village.ts`

**Interfaces:**
- Consumes: Task 9's `ROBOT_HOUSE_X/Y`, `inRobotHouse`, `PORCH_SPOT`; Task 10's `createDragTracker`; Task 8's `VillageView.robotResidentId` / `robotLastTurnAt`; `displayName` from `../render/label.js`.
- Produces: `createRobotHouse(k, fonts)` returning `{ setPresence(p: 'dark' | 'lit' | 'talking'): void; setResidentLabel(label: string | null): void }`; `VillageOptions` gains `onRobotDrop?(creatureId: string): void` and `onRobotEvict?(creatureId: string): void` (Task 12 wires both).

- [ ] **Step 1: Implement `robotHouse.ts`**

```ts
import type { KAPLAYCtx } from 'kaplay';
import { TEXT_SS, THEME } from '../theme.js';
import { ROBOT_HOUSE_X, ROBOT_HOUSE_Y } from '../layout/robot.js';
import type { CreatureFonts } from './creature.js';

/** 'dark': robot silent a long while. 'lit': a resident is home. 'talking': words are flowing. */
export type RobotPresence = 'dark' | 'lit' | 'talking';

export interface RobotHouse {
  setPresence(presence: RobotPresence): void;
  setResidentLabel(label: string | null): void;
}

/**
 * The robot-house (spec §4): visually the physical M5StackChan as a
 * building — a squat body with a screen for a face — distinct from the decor
 * houses. Flat rectangles only, like every prop (spec §4.1 of the village
 * design). Presence is three pre-built screen fills toggled by `hidden`,
 * because KAPLAY colour mutation is a documented trap in this repo.
 */
export function createRobotHouse(k: KAPLAYCtx, fonts: CreatureFonts): RobotHouse {
  const hex = (v: string) => k.Color.fromHex(v);
  const x = ROBOT_HOUSE_X;
  const y = ROBOT_HOUSE_Y;
  const block = (bx: number, by: number, w: number, h: number, colour: string, z: number) =>
    k.add([k.rect(w, h), k.pos(bx, by), k.color(hex(colour)), k.z(z)]);

  // Body: a squat white-cream shell, wider than tall, like the robot itself.
  block(x, y - 78, 98, 78, THEME.signCream, 1);
  // Antenna nub.
  block(x + 42, y - 92, 14, 14, THEME.ink, 1);
  // Feet pads.
  block(x + 8, y, 26, 8, THEME.ink, 1);
  block(x + 64, y, 26, 8, THEME.ink, 1);
  // The face-screen bezel.
  block(x + 12, y - 66, 74, 44, THEME.ink, 2);

  // Three screen fills, one per presence, toggled by `hidden`.
  const screen = (colour: string) => block(x + 16, y - 62, 66, 36, colour, 3);
  const dark = screen(THEME.wood);
  const lit = screen(THEME.sky);
  const talking = screen(THEME.accent);

  // Two eyes so the screen reads as a face whenever it is lit at all.
  const eye = (ex: number) => block(ex, y - 52, 8, 12, THEME.ink, 4);
  const eyes = [eye(x + 32), eye(x + 58)];

  // The resident's name on a sign under the house, same build as zone signs.
  block(x + 20, y + 10, 58, 18, THEME.signCream, 3);
  const label = k.add([
    k.text('', { size: 12 * TEXT_SS, font: fonts.mono }),
    k.scale(1 / TEXT_SS),
    k.pos(x + 49, y + 19),
    k.anchor('center'),
    k.color(hex(THEME.ink)),
    k.z(4),
  ]);

  const apply = (presence: RobotPresence) => {
    dark.hidden = presence !== 'dark';
    lit.hidden = presence !== 'lit';
    talking.hidden = presence !== 'talking';
    for (const e of eyes) e.hidden = presence === 'dark';
  };
  apply('dark');

  return {
    setPresence: apply,
    setResidentLabel(text) {
      label.text = text ?? 'for rent';
    },
  };
}
```

(`CreatureFonts` is exported from `./creature.js` — `{ pixel: string; mono: string }`. If a `THEME` key used above does not exist in `theme.ts`, substitute the nearest existing key rather than adding new theme entries; check `theme.ts` first.)

- [ ] **Step 2: Wire the scene** — in `village.ts`:

Imports:

```ts
import { createRobotHouse } from './robotHouse.js';
import { PORCH_SPOT, inRobotHouse } from '../layout/robot.js';
import { createDragTracker } from '../input/drag.js';
import { displayName } from '../render/label.js';
```

`VillageOptions` gains (below `onCreatureClick`, same comment style):

```ts
  /** A villager was dropped onto the robot-house. */
  onRobotDrop?(creatureId: string): void;
  /** The current resident was dragged off the robot-house and let go elsewhere. */
  onRobotEvict?(creatureId: string): void;
```

After the decor houses/trees are added:

```ts
  const robotHouse = createRobotHouse(k, { pixel: pixelFont, mono: monoFont });
```

State the input needs, near `hoveredId`:

```ts
  const tracker = createDragTracker(CLICK_SLOP);
  let residentId: string | null = null;
```

**Pan arming:** the existing `k.onMouseDown('left', ...)` becomes conditional — a press the tracker owns must not pan:

```ts
  k.onMouseDown('left', () => {
    if (tracker.current() === null) panning = true;
  });
```

(`k.onMouseDown` fires every held frame, but the tracker's press ran synchronously in the DOM mousedown below, so the guard is already answerable on the first frame; once a creature-press is live the guard holds for the whole gesture.)

**Replace the `pressedAt` click block** (the `let pressedAt`, its `canvas.addEventListener('mousedown', ...)` and `window.addEventListener('mouseup', ...)`) with — keeping the existing long comment about client coordinates and canvas-vs-window scoping, which is all still true:

```ts
  k.canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    tracker.press(event.clientX, event.clientY, hoveredId);
  });

  window.addEventListener('mousemove', (event) => {
    tracker.move(event.clientX, event.clientY);
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    const gesture = tracker.release(event.clientX, event.clientY);
    if (gesture.type === 'click') {
      const creature = known.get(gesture.targetId);
      if (creature) opts.onCreatureClick?.(creature);
      return;
    }
    if (gesture.type === 'drop') {
      const rect = k.canvas.getBoundingClientRect();
      const worldX = event.clientX - rect.left + k.getCamPos().x - k.width() / 2;
      const worldY = event.clientY - rect.top + k.getCamPos().y - k.height() / 2;
      if (inRobotHouse(worldX, worldY)) {
        opts.onRobotDrop?.(gesture.targetId);
      } else if (gesture.targetId === residentId) {
        opts.onRobotEvict?.(gesture.targetId);
      }
    }
  });
```

Extend the existing cancel paths: inside `stopPanning` (or beside its three `window.addEventListener` registrations) add `tracker.cancel()` for `'pointercancel'` and `'blur'` only — a plain `mouseup` already reaches the tracker's own release handler. Concretely: register `window.addEventListener('pointercancel', () => tracker.cancel())` and `window.addEventListener('blur', () => tracker.cancel())` alongside the existing stop-panning listeners.

**Drag ghost** — a marker following the cursor while dragging. Add after the `k.onUpdate` hover block, inside the same callback (so it runs every frame):

```ts
    // The drag ghost: a small accent square with the dragged villager's name,
    // riding the cursor while a drag is live. Created and destroyed here so
    // there is nothing to leak when the gesture ends off-canvas.
    const drag = tracker.current();
    if (drag?.dragging && lookAt !== null && cursorY !== null) {
      if (!ghost) {
        ghost = k.add([k.rect(18, 18), k.color(hex(k, THEME.accent)), k.pos(0, 0), k.anchor('center'), k.z(60)]);
        ghostLabel = k.add([
          k.text('', { size: 12 * TEXT_SS, font: monoFont }),
          k.scale(1 / TEXT_SS),
          k.pos(0, 0),
          k.anchor('center'),
          k.color(hex(k, THEME.ink)),
          k.z(61),
        ]);
      }
      ghost.pos = k.vec2(lookAt, cursorY);
      ghostLabel.pos = k.vec2(lookAt, cursorY - 20);
      const dragged = known.get(drag.targetId);
      ghostLabel.text = dragged ? displayName(dragged) : '';
    } else if (ghost) {
      ghost.destroy();
      ghostLabel?.destroy();
      ghost = null;
      ghostLabel = null;
    }
```

with declarations near the other scene-state `let`s (typed loosely, like the scene's other KAPLAY handles):

```ts
  let ghost: ReturnType<typeof k.add> | null = null;
  let ghostLabel: ReturnType<typeof k.add> | null = null;
```

**`setView` additions** — after `const spots = placeCreatures(...)` and before `placements = spots;`:

```ts
      // The resident stands at the robot-house porch, not its hashed spot
      // (spec §4: a glance at the house says who the robot is).
      residentId = view.robotResidentId;
      if (residentId && spots.has(residentId)) spots.set(residentId, { ...PORCH_SPOT });

      const resident = residentId ? view.creatures.find((c) => c.id === residentId) : undefined;
      robotHouse.setResidentLabel(resident ? displayName(resident) : null);
      const active = view.robotLastTurnAt !== null && Date.now() - view.robotLastTurnAt < 15_000;
      robotHouse.setPresence(residentId === null ? 'dark' : active ? 'talking' : 'lit');
```

- [ ] **Step 3: Typecheck and run the whole suite**

Run: `npm run typecheck` and `npx vitest run`
Expected: both clean. Type errors about KAPLAY component properties (`.hidden`, `.pos`, `.text`) mean the loose `ReturnType<typeof k.add>` needs the same typing dodge the scene already uses elsewhere — imitate `creature.ts`, do not fight the types with `any` unless `creature.ts` itself does.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/scene packages/web/src/layout packages/web/src/input
git commit -m "feat(web): the robot-house — drag a villager in, presence glow, porch"
```

---

### Task 12: Wire main.ts and smoke the whole software path

**Files:**
- Modify: `packages/web/src/main.ts`

**Interfaces:**
- Consumes: Task 11's `onRobotDrop`/`onRobotEvict`; Task 8's `setRobotResident`.

- [ ] **Step 1: Wire the callbacks** — in `main.ts`, import `setRobotResident` from `./net/client.js` and extend the `startVillage` call:

```ts
const scene = await startVillage({
  onCreatureClick: (creature) => panel.open({ id: creature.id, label: displayName(creature) }),
  // Fire-and-forget: the next state frame moves the creature to the porch,
  // which is the only confirmation that means anything.
  onRobotDrop: (creatureId) => void setRobotResident(creatureId),
  onRobotEvict: () => void setRobotResident(null),
});
```

- [ ] **Step 2: Typecheck + full suite**

Run: `npm run typecheck` and `npx vitest run`
Expected: clean.

- [ ] **Step 3: Boot and smoke over HTTP** (no browser needed — this environment cannot composite KAPLAY; the visual pass is the user's, in Task 13)

Run: `npm run dev:server` in the background, wait for "Skill Village is awake", then:

```bash
curl -s http://127.0.0.1:8262/api/robot
curl -s -X PUT http://127.0.0.1:8262/api/robot/resident -H "content-type: application/json" -d "{\"creatureId\": \"<any id from /api/creatures>\"}"
curl -s -X POST http://127.0.0.1:8262/v1/chat/completions -H "content-type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"hello?\"}]}"
curl -s http://127.0.0.1:8262/api/robot
```

Expected: first call `residentId: null`; second echoes the resident; third returns a `chat.completion` whose content is a real reply (or, if this terminal's claude CLI is unauthenticated — the known dev-environment condition — a canned line from the creature's pool or the stock wiggle line, never an error); fourth still shows the resident. Kill the server after.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/main.ts
git commit -m "feat(web): drag-to-robot wired end to end"
```

---

### Task 13: R1 bring-up — gateway, firmware, fixtures, exit tests **[HUMAN IN THE LOOP]**

Everything in this task that touches hardware, money, or ears is the user's; the agent's share is the documentation and the fixture plumbing check. Execute this task interactively with the user present — it cannot be dispatched to a lone subagent.

**Files:**
- Create: `docs/robot/SETUP.md`
- Create: `docs/robot/PLAYTEST.md`

- [ ] **Step 1: Write `docs/robot/SETUP.md`** with exactly these sections, in this order, expanding each with the concrete values below and correcting any key names against the gateway's own shipped config template during the install (their config schema is authoritative; note in the doc any place it diverged):

1. **What talks to what** — the spec §2 diagram in prose: robot → gateway (Docker, this PC) → shim (`http://host.docker.internal:8262/v1`) → claude. Voice audio never leaves the PC; text goes to Anthropic and OpenAI TTS only.
2. **Prerequisites** — Docker Desktop (WSL2 backend) on Windows 10; an OpenAI API key with billing (user creates it; it lives ONLY in the gateway config file on this PC — never committed, never in the repo); the robot and PC on the same 2.4 GHz-capable Wi-Fi.
3. **The village server** — run with the LAN binding and fixture capture on first bring-up:
   `VILLAGE_HOST=0.0.0.0 SKILL_VILLAGE_ROBOT_FIXTURES=packages/server/src/robot/fixtures npm run dev:server` (PowerShell: `$env:VILLAGE_HOST='0.0.0.0'; $env:SKILL_VILLAGE_ROBOT_FIXTURES='packages\server\src\robot\fixtures'; npm run dev:server`). Run from a **plain terminal, not inside a Claude Code session** — the CLI reports "Not logged in" when nested (the repo's known M4 lesson) and the robot would speak only canned lines. Firewall: allow inbound 8262 on the private network profile only.
4. **The voice gateway** — clone `https://github.com/xinnan-tech/xiaozhi-esp32-server`, follow its Docker deployment doc (its non-Docker Python deployment is the fallback if Docker Desktop misbehaves on Windows 10 — spec §12). Config (their `config.yaml` schema; verify key names against their shipped template): ASR = the local SenseVoice module (no cloud ASR); LLM = the `openai`-type provider with `url: http://host.docker.internal:8262/v1`, `api_key: skill-village` (the shim ignores it), `model_name: skill-village-resident`; TTS = the `openai`-type TTS with the user's key (default voice fine for R1) — and note Piper/Edge fallback options in a comment. Record in the doc the exact ports the gateway ended up on.
5. **The firmware** — per M5Stack's StackChan docs (`https://docs.m5stack.com/en/StackChan` and `https://github.com/m5stack/StackChan`): flash a XiaoZhi-compatible build for the CoreS3-based StackChan via M5Burner, then point its server address at this PC's gateway (the firmware's network-config flow; the doc records the exact menu path once the user has walked it). **Recovery:** M5Burner can always restore the factory firmware — write this in bold in the doc.
6. **Rollback / stock mode** — how to put the factory firmware back and return the robot to its out-of-the-box state.

- [ ] **Step 2 [HUMAN]: Stand up the gateway** — user (with agent guidance) installs Docker Desktop if needed, deploys the gateway, starts it. Expected: gateway logs show it listening; `docker ps` shows the container healthy.

- [ ] **Step 3 [HUMAN]: Flash and point the robot** — user flashes the firmware and configures it to the PC's LAN address. Expected: the robot connects to the gateway (gateway logs show a device session).

- [ ] **Step 4 [HUMAN]: The first conversation** — with the village server running (Step 1's env), user sets a resident (drag in the browser at `http://localhost:5173`, or the Task 12 curl), says the wake word, and asks the robot who he is. Expected: the robot answers **in the resident creature's personality**, and the server console shows the turn.

- [ ] **Step 5: Commit the captured fixtures** — `packages/server/src/robot/fixtures/*.json` now holds the gateway's real request bodies. Strip nothing; they contain only conversation text. Run `npx vitest run packages/server/src/robot` (Task 14's replay test, if landed first, now runs them; otherwise they wait). Commit:

```bash
git add packages/server/src/robot/fixtures docs/robot/SETUP.md
git commit -m "chore(robot): R1 bring-up notes and recorded gateway fixtures"
```

- [ ] **Step 6 [HUMAN]: Exit tests** — record all three in `docs/robot/PLAYTEST.md` (create it with these headings): **(a) Privacy check** — with the conversation running, confirm the firmware's configured server is the LAN address and nothing else (firmware config screen), and spot-check the gateway container's outbound traffic (`docker exec` + `netstat`, or the router's client page): no `xiaozhi.me`, no unknown hosts; expected outbound from the PC only: Anthropic (claude) and `api.openai.com` (TTS). **(b) Latency baseline** — stopwatch five turns, end-of-speech → first sound; record each and the median (spec §9 expects ~3–5 s). **(c) Swap test** — mid-conversation, drag a different creature onto the robot-house; the next reply must be the new personality with no restart. Then commit `PLAYTEST.md`.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin robot-embodiment
```

---

### Task 14: Fixture replay hardening

The recorded gateway requests become a regression suite: whatever the gateway actually sends must parse and get a speakable reply, forever.

**Files:**
- Create: `packages/server/src/robot/fixtures.test.ts`
- Modify (only if a fixture fails): `packages/server/src/robot/openai.ts`

**Interfaces:**
- Consumes: Task 13's committed `fixtures/*.json`; Task 6's route.

- [ ] **Step 1: Write the replay test** (this file is committed BEFORE fixtures exist and must pass with zero fixtures — `skipIf` keeps CI honest either way)

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
// reuse the exact app-building setup from app.test.ts (sandbox village +
// fake CLI 'ok' + createApp) — import the same helpers it uses

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let files: string[] = [];
try {
  files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
} catch {
  files = [];
}

describe('recorded gateway requests', () => {
  it.skipIf(files.length === 0)('every recorded request parses and gets a speakable reply', async () => {
    // build village + app; set a resident first so replies are in-character
    for (const file of files) {
      const body = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      const res = await app.inject({ method: 'POST', url: '/v1/chat/completions', payload: body });
      expect(res.statusCode, file).toBe(200);
      const raw = res.body;
      // streaming or not, the reply must carry words
      expect(raw.length, file).toBeGreaterThan(0);
      expect(raw, file).not.toContain('invalid_request_error');
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run packages/server/src/robot/fixtures.test.ts`
Expected: before Task 13, SKIPPED (0 fixtures). After Task 13: PASS — and if any fixture FAILS, that is the task's real work: adjust `parseChatRequest` (and only it) until the gateway's actual dialect parses, keeping every Task 5 unit test green.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/robot/fixtures.test.ts packages/server/src/robot/openai.ts
git commit -m "test(server): replay recorded gateway requests through the shim"
```

---

## After the plan

- Merge: rebase `robot-embodiment` onto main first — other tracks (palettes, M5 remap) are landing concurrently; expect small conflicts in `schema.ts` (version number) and `scene/village.ts`.
- R3 planning: with the R1 fixtures and bring-up notes in hand (push channel? per-request TTS voice?), write the R3 plan (greeting on swap, idle lines, per-creature voices, mood→face).
- The user decides when the robot playtest verdict is in — their ears are the gate.
