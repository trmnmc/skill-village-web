import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRobotLoop, type RobotLoopDeps } from './loop.js';
import { createFakeDevice } from './testing/fake-device.js';
import { fakeTranscriber } from './testing/fake-asr.js';
import { fakeSpeaker } from './testing/fake-tts.js';
import { pcm16ToWav } from './audio.js';
import { EMPTY_HOUSE_LINE, MOVED_AWAY_LINE } from './lines.js';
import type { Speaker } from './tts.js';

const POLL_MS = 100;
const FOLLOW_UP_MS = 5_000;

/** A short 16 kHz WAV with real energy in it, so trimming keeps it. */
function speechWav(): Buffer {
  const pcm = new Int16Array(16_000); // 1 s
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 8) * 12_000);
  return pcm16ToWav(pcm, 16_000);
}

function villageStub(residentId: string | null, replyText = 'Hi there!') {
  const chat = vi.fn(async () => ({ text: replyText, source: 'llm' as const }));
  return {
    chat,
    getState: () => ({ robot: { residentId } }),
  } as unknown as RobotLoopDeps['village'] & { chat: typeof chat };
}

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
      log: (line) => logs.push(line),
      pollMs: POLL_MS,
      followUpMs: FOLLOW_UP_MS,
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

    expect(village.chat).toHaveBeenCalledWith('c1', 'hello robot', 'spoken');
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
    (village.chat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Creature not found: gone'));
    begin({ device, village, tts });

    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(tts.spoken).toEqual([MOVED_AWAY_LINE]);
  });

  it('never crashes when both voices fail: pouty face, error logged, keeps polling', async () => {
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

    // The loop survived: a second utterance gets through.
    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(flaky.spoken).toEqual(['Hi there!']);
  });

  it('treats an empty transcript as silence: no chat, mic re-armed', async () => {
    const device = createFakeDevice();
    const village = villageStub('c1');
    begin({ device, village, asr: fakeTranscriber('') });

    device.pushRecording(speechWav());
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(village.chat).not.toHaveBeenCalled();
    expect(device.playedPcm.length).toBe(0);
    expect(device.armedLog.at(-1)).toBe(true);
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
});
