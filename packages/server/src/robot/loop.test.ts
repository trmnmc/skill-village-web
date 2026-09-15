import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRobotLoop, type RobotLoopDeps } from './loop.js';
import { createFakeDevice } from './testing/fake-device.js';
import { fakeTranscriber } from './testing/fake-asr.js';
import { fakeSpeaker } from './testing/fake-tts.js';
import { pcm16ToWav } from './audio.js';
import { EMPTY_HOUSE_LINE, MOVED_AWAY_LINE } from './lines.js';
import { CANNED_LINES, chirpPcm24k, createCannedAudio } from './canned.js';
import type { Speaker } from './tts.js';

const POLL_MS = 100;
const FOLLOW_UP_MS = 5_000;
const BRAIN_TIMEOUT_MS = 1_000;

/** A short 16 kHz WAV with real energy in it, so trimming keeps it. */
function speechWav(): Buffer {
  const pcm = new Int16Array(16_000); // 1 s
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 8) * 12_000);
  return pcm16ToWav(pcm, 16_000);
}

/** A second of nothing: the mic triggered on a door, not a person. */
function silenceWav(): Buffer {
  return pcm16ToWav(new Int16Array(16_000), 16_000);
}

function villageStub(residentId: string | null, replyText = 'Hi there!') {
  const chat = vi.fn(async () => ({ text: replyText, source: 'llm' as const }));
  const ensurePersona = vi.fn(async () => {});
  const stub = {
    residentId,
    chat,
    ensurePersona,
    getState: () => ({ robot: { residentId: stub.residentId } }),
  };
  return stub as unknown as RobotLoopDeps['village'] & {
    chat: typeof chat;
    ensurePersona: typeof ensurePersona;
    residentId: string | null;
  };
}

/** What the loop hands the brain on a first turn. */
const FIRST_TURN = { timeoutMs: BRAIN_TIMEOUT_MS, history: [] };

describe('startRobotLoop', () => {
  let logs: string[];
  let stopLoop: (() => void) | null;

  beforeEach(() => {
    vi.useFakeTimers();
    logs = [];
    stopLoop = null;
  });
  afterEach(() => {
    stopLoop?.();
    vi.useRealTimers();
  });

  function begin(deps: Partial<RobotLoopDeps> & Pick<RobotLoopDeps, 'device' | 'village'>) {
    const loop = startRobotLoop({
      asr: fakeTranscriber('hello robot'),
      tts: fakeSpeaker(),
      canned: createCannedAudio({ dir: null }),
      log: (line) => logs.push(line),
      pollMs: POLL_MS,
      followUpMs: FOLLOW_UP_MS,
      brainTimeoutMs: BRAIN_TIMEOUT_MS,
      ...deps,
    });
    stopLoop = loop.stop;
    return loop;
  }

  it('runs a full turn: pull, transcribe, chat as resident, speak, re-arm', async () => {
    const device = createFakeDevice();
    const tts = fakeSpeaker();
    const village = villageStub('c1');
    const loop = begin({ device, village, tts });

    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(village.chat).toHaveBeenCalledWith('c1', 'hello robot', 'spoken', FIRST_TURN);
    expect(tts.spoken).toEqual(['Hi there!']);
    expect(device.playedPcm.length).toBeGreaterThan(0);
    expect(device.faces).toContain('thinking');
    expect(device.faces).toContain('happy');
    expect(device.faces.at(-1)).toBe('calm');
    // Re-armed for the follow-up window after speaking.
    expect(device.armedLog.at(-1)).toBe(true);
    expect(loop.snapshot().lastTurnAt).not.toBeNull();
  });

  it('speaks the empty-house line without calling chat when nobody lives here', async () => {
    const device = createFakeDevice();
    const tts = fakeSpeaker();
    const village = villageStub(null);
    begin({ device, village, tts });

    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(village.chat).not.toHaveBeenCalled();
    expect(tts.spoken).toEqual([EMPTY_HOUSE_LINE]);
  });

  it('speaks the moved-away line when the resident vanished mid-conversation', async () => {
    const device = createFakeDevice();
    const tts = fakeSpeaker();
    const village = villageStub('gone');
    village.chat.mockRejectedValue(new Error('Creature not found: gone'));
    begin({ device, village, tts });

    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(tts.spoken).toEqual([MOVED_AWAY_LINE]);
  });

  it('logs one per-hop timing line per turn', async () => {
    const device = createFakeDevice();
    const village = villageStub('c1');
    begin({ device, village });

    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    const timing = logs.filter((l) => /robot turn: pull=\d+ms asr=\d+ms brain=\d+ms tts_first=\d+ms total=\d+ms/.test(l));
    expect(timing).toHaveLength(1);
  });

  it('disarms the mic after the follow-up window passes with no speech', async () => {
    const device = createFakeDevice();
    const village = villageStub('c1');
    begin({ device, village });

    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(device.armedLog.at(-1)).toBe(true);

    await vi.advanceTimersByTimeAsync(FOLLOW_UP_MS + POLL_MS * 2);
    expect(device.armedLog.at(-1)).toBe(false);
  });

  it('stop() halts polling for good', async () => {
    const device = createFakeDevice();
    const village = villageStub('c1');
    const loop = begin({ device, village });

    loop.stop();
    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);

    expect(device.playedPcm.length).toBe(0);
    expect(village.chat).not.toHaveBeenCalled();
  });

  it('reports an unreachable device in the snapshot and rides it out', async () => {
    const device = createFakeDevice();
    const brokenStatus = vi.spyOn(device, 'status').mockResolvedValue({
      reachable: false, micArmed: false, recordingReady: false, playing: false,
    });
    const village = villageStub('c1');
    const loop = begin({ device, village });

    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(loop.snapshot().deviceReachable).toBe(false);

    brokenStatus.mockRestore();
    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(loop.snapshot().deviceReachable).toBe(true);
  });

  describe('the speech guard (delta R4)', () => {
    it('a silent capture after a tap gets the didnt-catch line and the shy face, never the brain', async () => {
      const device = createFakeDevice();
      const tts = fakeSpeaker();
      const village = villageStub('c1');
      begin({ device, village, tts });

      device.pushRecording(silenceWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(village.chat).not.toHaveBeenCalled();
      expect(tts.spoken).toEqual([CANNED_LINES.didnt_catch]);
      expect(device.faces).toContain('shy');
      expect(device.armedLog.at(-1)).toBe(true);
    });

    it('a whisper ghost over real audio is not speech either', async () => {
      const device = createFakeDevice();
      const tts = fakeSpeaker();
      const village = villageStub('c1');
      begin({ device, village, tts, asr: fakeTranscriber('Thank you.') });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(village.chat).not.toHaveBeenCalled();
      expect(tts.spoken).toEqual([CANNED_LINES.didnt_catch]);
    });

    it('an empty transcript after a tap is the same story', async () => {
      const device = createFakeDevice();
      const tts = fakeSpeaker();
      const village = villageStub('c1');
      begin({ device, village, tts, asr: fakeTranscriber('') });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(village.chat).not.toHaveBeenCalled();
      expect(tts.spoken).toEqual([CANNED_LINES.didnt_catch]);
      expect(device.armedLog.at(-1)).toBe(true);
    });

    it('noise inside the follow-up window stays quiet and keeps the original deadline', async () => {
      const device = createFakeDevice();
      const tts = fakeSpeaker();
      const village = villageStub('c1');
      begin({ device, village, tts });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2); // turn done at ~100 ms; window closes at ~5100 ms
      const armsAfterTurn = device.armedLog.length;

      device.pushRecording(silenceWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2); // noise handled at ~300 ms

      expect(village.chat).toHaveBeenCalledTimes(1);
      expect(tts.spoken).toEqual(['Hi there!']); // no "didn't catch that" for a door slam
      expect(device.faces).not.toContain('shy');
      expect(device.armedLog.length).toBe(armsAfterTurn + 1); // re-armed once, quietly
      expect(device.armedLog.at(-1)).toBe(true);

      // Now at ~400 ms. Land at ~5250 ms: past the first deadline (~5100),
      // before an extended one (~5300) would have fired.
      await vi.advanceTimersByTimeAsync(FOLLOW_UP_MS - POLL_MS * 2 + POLL_MS / 2);
      expect(device.armedLog.at(-1)).toBe(false);
    });
  });

  describe('never mute (delta R1)', () => {
    it('plays the chirp when every voice is gone, keeps the pouty face, and survives', async () => {
      const device = createFakeDevice();
      let calls = 0;
      const flaky: Speaker & { spoken: string[] } = {
        spoken: [],
        // eslint-disable-next-line require-yield
        async *synthesize(text: string) {
          calls += 1;
          if (calls === 1) throw new Error('both voices down');
          flaky.spoken.push(text);
          yield Buffer.alloc(480);
        },
      };
      const village = villageStub('c1');
      begin({ device, village, tts: flaky });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(device.faces).toContain('pouty');
      expect(logs.some((l) => /both voices down/.test(l))).toBe(true);
      expect(device.playedPcm).toHaveLength(1);
      expect(device.playedPcm[0]!.equals(chirpPcm24k())).toBe(true);
      expect(device.armedLog.at(-1)).toBe(true);

      // The loop survived: a second utterance gets through with a real voice.
      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(flaky.spoken).toEqual(['Hi there!']);
    });

    it('a brain that never answers gets the lost-thought line, in time', async () => {
      const device = createFakeDevice();
      const tts = fakeSpeaker();
      const village = villageStub('c1');
      village.chat.mockImplementation(() => new Promise(() => {}));
      begin({ device, village, tts });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS + BRAIN_TIMEOUT_MS * 2 + POLL_MS);

      expect(tts.spoken).toEqual([CANNED_LINES.lost_thought]);
      expect(logs.some((l) => /brain/.test(l) && /timed out/.test(l))).toBe(true);
      expect(device.armedLog.at(-1)).toBe(true);
    });
  });

  describe('interrupt (gap 1)', () => {
    it('a tap mid-reply ends the whole reply: no more sentences, no pouty face, mic re-armed', async () => {
      const device = createFakeDevice();
      device.interruptAfterChunks(1);
      const tts = fakeSpeaker();
      const village = villageStub('c1', 'One thing. Two things. Three things.');
      begin({ device, village, tts });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(device.playedPcm).toHaveLength(1);
      expect(logs.some((l) => /interrupted/.test(l))).toBe(true);
      expect(device.faces).not.toContain('pouty');
      expect(device.faces.at(-1)).toBe('calm');
      expect(device.armedLog.at(-1)).toBe(true);
    });
  });

  describe('memory (gap 5)', () => {
    it('carries the last turns as history on the next turn within the window', async () => {
      const device = createFakeDevice();
      const village = villageStub('c1');
      begin({ device, village });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(village.chat).toHaveBeenCalledTimes(2);
      expect(village.chat).toHaveBeenNthCalledWith(2, 'c1', 'hello robot', 'spoken', {
        timeoutMs: BRAIN_TIMEOUT_MS,
        history: [{ player: 'hello robot', you: 'Hi there!' }],
      });
    });

    it('keeps only the last six turns', async () => {
      const device = createFakeDevice();
      const village = villageStub('c1');
      let n = 0;
      village.chat.mockImplementation(async () => ({ text: `reply ${++n}`, source: 'llm' as const }));
      begin({ device, village });

      for (let turn = 0; turn < 8; turn++) {
        device.pushRecording(speechWav());
        await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      }

      const lastCall = village.chat.mock.calls.at(-1) as unknown as [string, string, string, { history: Array<{ you: string }> }];
      expect(lastCall[3].history.map((t) => t.you)).toEqual(['reply 2', 'reply 3', 'reply 4', 'reply 5', 'reply 6', 'reply 7']);
    });

    it('forgets history once the window has passed', async () => {
      const device = createFakeDevice();
      const village = villageStub('c1');
      begin({ device, village, historyWindowMs: 60_000 });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      await vi.advanceTimersByTimeAsync(61_000);
      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(village.chat).toHaveBeenNthCalledWith(2, 'c1', 'hello robot', 'spoken', FIRST_TURN);
    });

    it('forgets history when the resident changes', async () => {
      const device = createFakeDevice();
      const village = villageStub('c1');
      begin({ device, village });

      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      village.residentId = 'c2';
      device.pushRecording(speechWav());
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(village.chat).toHaveBeenNthCalledWith(2, 'c2', 'hello robot', 'spoken', FIRST_TURN);
    });
  });

  describe('persona warm-up (gap 7)', () => {
    it('warms the resident at start and again when the resident changes, never for an empty house', async () => {
      const device = createFakeDevice();
      const village = villageStub('c1');
      begin({ device, village });

      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(village.ensurePersona).toHaveBeenCalledTimes(1);
      expect(village.ensurePersona).toHaveBeenCalledWith('c1');

      village.residentId = 'c2';
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(village.ensurePersona).toHaveBeenCalledTimes(2);
      expect(village.ensurePersona).toHaveBeenLastCalledWith('c2');

      village.residentId = null;
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(village.ensurePersona).toHaveBeenCalledTimes(2);
    });
  });
});
