import type { Village } from '../village.js';
import type { RobotDevice } from './device.js';
import type { Transcriber } from './asr.js';
import type { Speaker } from './tts.js';
import { wavToPcm16, pcm16ToWav, trimSilence } from './audio.js';
import { EMPTY_HOUSE_LINE, MOVED_AWAY_LINE } from './lines.js';

/**
 * The pull-model conversation loop (spec §4): the PC drives everything, the
 * robot only ever answers. One timer chain, so at most one poll — and one
 * turn — is ever in flight; a slow turn simply delays the next poll rather
 * than stacking a second one on top.
 */
export interface RobotLoopDeps {
  device: RobotDevice;
  asr: Transcriber;
  tts: Speaker;
  village: Pick<Village, 'chat' | 'getState'>;
  log: (line: string) => void;
  pollMs?: number;
  followUpMs?: number;
}

export interface RobotLoopHandle {
  stop(): void;
  snapshot(): { deviceReachable: boolean; lastTurnAt: number | null };
}

const DEFAULT_POLL_MS = 250;
const DEFAULT_FOLLOW_UP_MS = 20_000;

export function startRobotLoop(deps: RobotLoopDeps): RobotLoopHandle {
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const followUpMs = deps.followUpMs ?? DEFAULT_FOLLOW_UP_MS;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let deviceReachable = false;
  let lastTurnAt: number | null = null;
  // Non-null while the mic is being held open for a follow-up question; when
  // the clock passes it with no new speech, the mic goes cold (privacy rule:
  // an open ear is never left open indefinitely).
  let followUpDeadline: number | null = null;

  /** A face change must never take the loop down with it. */
  async function face(name: string): Promise<void> {
    try {
      await deps.device.setFace(name);
    } catch {
      /* cosmetic; the turn goes on */
    }
  }

  function decideReply(residentId: string | null, transcript: string): Promise<string> {
    if (residentId === null) return Promise.resolve(EMPTY_HOUSE_LINE);
    return deps.village
      .chat(residentId, transcript, 'spoken')
      .then((r) => r.text)
      // The resident's creature left the village while it lived here.
      .catch(() => MOVED_AWAY_LINE);
  }

  async function runTurn(): Promise<void> {
    const t0 = Date.now();
    const wav = await deps.device.pullRecording();
    const tPull = Date.now();
    if (wav === null) return;

    await face('thinking');

    // Trim dead air before ASR; garbage bytes from the wire are silence too.
    let transcript = '';
    let tAsr = tPull;
    try {
      const { pcm, sampleRate } = wavToPcm16(wav);
      const trimmed = trimSilence(pcm, { sampleRate });
      if (trimmed.length > 0) {
        transcript = await deps.asr.transcribe(pcm16ToWav(trimmed, sampleRate));
      }
      tAsr = Date.now();
    } catch (error) {
      deps.log(`robot asr failed: ${String(error)}`);
    }

    if (transcript === '') {
      // Heard nothing worth answering: hold the ear open and say so to no one.
      await face('calm');
      await arm();
      return;
    }

    const residentId = deps.village.getState().robot.residentId;
    const reply = await decideReply(residentId, transcript);
    const tBrain = Date.now();
    lastTurnAt = tBrain;

    let tFirstAudio: number | null = null;
    try {
      await face('happy');
      const speak = deps.tts.synthesize(reply);
      // Stamp the moment the first chunk exists — that is the latency the
      // user hears — while passing the stream through untouched.
      async function* stamped(): AsyncIterable<Buffer> {
        for await (const chunk of speak) {
          if (tFirstAudio === null) tFirstAudio = Date.now();
          yield chunk;
        }
      }
      await deps.device.playPcm(stamped());
    } catch (error) {
      // Never-mute already fell back inside the speaker chain; landing here
      // means every voice is gone. The face carries the apology.
      deps.log(`robot speech failed: ${String(error)}`);
      await face('pouty');
      return;
    }

    const tEnd = Date.now();
    deps.log(
      `robot turn: pull=${tPull - t0}ms asr=${tAsr - tPull}ms brain=${tBrain - tAsr}ms ` +
        `tts_first=${(tFirstAudio ?? tEnd) - tBrain}ms total=${tEnd - t0}ms`,
    );

    await face('calm');
    await arm();
  }

  async function arm(): Promise<void> {
    try {
      await deps.device.arm();
      followUpDeadline = Date.now() + followUpMs;
    } catch (error) {
      deps.log(`robot mic arm failed: ${String(error)}`);
    }
  }

  async function tick(): Promise<void> {
    try {
      const status = await deps.device.status();
      deviceReachable = status.reachable;
      if (status.reachable) {
        if (status.recordingReady) {
          followUpDeadline = null;
          await runTurn();
        } else if (followUpDeadline !== null && Date.now() > followUpDeadline) {
          followUpDeadline = null;
          await deps.device.disarm();
        }
      }
    } catch (error) {
      deps.log(`robot loop tick failed: ${String(error)}`);
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), pollMs);
    }
  }

  timer = setTimeout(() => void tick(), pollMs);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    snapshot() {
      return { deviceReachable, lastTurnAt };
    },
  };
}
