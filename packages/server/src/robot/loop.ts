import type { ChatTurn, Village } from '../village.js';
import { PlaybackInterruptedError, type RobotDevice } from './device.js';
import type { Transcriber } from './asr.js';
import type { Speaker } from './tts.js';
import { wavToPcm16, pcm16ToWav, trimSilence } from './audio.js';
import { hasVoicedSpeech, looksLikeSpeech } from './speech-guard.js';
import { CANNED_LINES, type CannedAudio, type CannedKind } from './canned.js';
import { EMPTY_HOUSE_LINE, MOVED_AWAY_LINE } from './lines.js';

/**
 * The pull-model conversation loop (spec §4): the PC drives everything, the
 * robot only ever answers. One timer chain, so at most one poll — and one
 * turn — is ever in flight; a slow turn simply delays the next poll rather
 * than stacking a second one on top.
 *
 * Rules folded in from the reconciliation delta (plan Task 10.5):
 * - He speaks only in answer to a deliberate act. A capture that holds no
 *   speech never reaches the brain; after a tap he says he did not catch
 *   it, inside the follow-up window he stays quiet.
 * - Never mute. When the whole voice chain is gone, the canned rung plays.
 * - A tap mid-reply ends the reply, not one sentence of it.
 * - He remembers the last few turns of this conversation, and forgets them
 *   when the resident changes or the window passes.
 * - The resident's persona is written at move-in, not on the first word.
 */
export interface RobotLoopDeps {
  device: RobotDevice;
  asr: Transcriber;
  tts: Speaker;
  /** The bottom rung of never-mute: plays when the whole TTS chain is gone. */
  canned: CannedAudio;
  village: Pick<Village, 'chat' | 'getState' | 'ensurePersona'>;
  log: (line: string) => void;
  pollMs?: number;
  followUpMs?: number;
  /** Cap on the brain per turn; the village answers canned past it, and the loop gives up at twice it. */
  brainTimeoutMs?: number;
  /** How many earlier turns ride along as memory. */
  historyTurns?: number;
  /** How long a turn stays in memory. */
  historyWindowMs?: number;
}

export interface RobotLoopHandle {
  stop(): void;
  snapshot(): { deviceReachable: boolean; lastTurnAt: number | null };
}

const DEFAULT_POLL_MS = 250;
const DEFAULT_FOLLOW_UP_MS = 20_000;
const DEFAULT_BRAIN_TIMEOUT_MS = 15_000;
const DEFAULT_HISTORY_TURNS = 6;
const DEFAULT_HISTORY_WINDOW_MS = 10 * 60_000;

type SpeakOutcome = 'spoken' | 'interrupted' | 'canned' | 'silent';

export function startRobotLoop(deps: RobotLoopDeps): RobotLoopHandle {
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const followUpMs = deps.followUpMs ?? DEFAULT_FOLLOW_UP_MS;
  const brainTimeoutMs = deps.brainTimeoutMs ?? DEFAULT_BRAIN_TIMEOUT_MS;
  const historyTurns = deps.historyTurns ?? DEFAULT_HISTORY_TURNS;
  const historyWindowMs = deps.historyWindowMs ?? DEFAULT_HISTORY_WINDOW_MS;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let deviceReachable = false;
  let lastTurnAt: number | null = null;
  // Non-null while the mic is being held open for a follow-up question; when
  // the clock passes it with no new speech, the mic goes cold (privacy rule:
  // an open ear is never left open indefinitely).
  let followUpDeadline: number | null = null;
  // undefined until the first poll, so the first resident seen is a change.
  let knownResident: string | null | undefined = undefined;
  let turns: Array<ChatTurn & { at: number }> = [];

  /** A face change must never take the loop down with it. */
  async function face(name: string): Promise<void> {
    try {
      await deps.device.setFace(name);
    } catch {
      /* cosmetic; the turn goes on */
    }
  }

  /**
   * Open the ear. With `deadline` given, the existing window keeps its
   * clock — noise inside it does not earn more listening time.
   */
  async function arm(deadline: number | null = null): Promise<void> {
    try {
      await deps.device.arm();
      followUpDeadline = deadline ?? Date.now() + followUpMs;
    } catch (error) {
      deps.log(`robot mic arm failed: ${String(error)}`);
    }
  }

  function recentTurns(): ChatTurn[] {
    const cutoff = Date.now() - historyWindowMs;
    turns = turns.filter((turn) => turn.at >= cutoff).slice(-historyTurns);
    return turns.map(({ player, you }) => ({ player, you }));
  }

  function remember(player: string, you: string): void {
    turns.push({ player, you, at: Date.now() });
    turns = turns.slice(-historyTurns);
  }

  /** A new resident starts with a blank memory and a persona already written. */
  function watchResident(): void {
    const residentId = deps.village.getState().robot.residentId;
    if (residentId === knownResident) return;
    knownResident = residentId;
    turns = [];
    if (residentId !== null) {
      // One model call at move-in, so the first spoken turn does not pay for two.
      void deps.village
        .ensurePersona(residentId)
        .catch((error) => deps.log(`robot persona warm-up failed: ${String(error)}`));
    }
  }

  /**
   * Speak through the voice chain. When every voice is gone, the face
   * carries the apology and the canned rung carries the sound. Never throws.
   */
  async function speak(text: string, fallback: CannedKind): Promise<{ outcome: SpeakOutcome; firstAudioAt: number | null }> {
    let firstAudioAt: number | null = null;
    try {
      const speech = deps.tts.synthesize(text);
      // Stamp the moment the first chunk exists — that is the latency the
      // user hears — while passing the stream through untouched.
      async function* stamped(): AsyncIterable<Buffer> {
        for await (const chunk of speech) {
          if (firstAudioAt === null) firstAudioAt = Date.now();
          yield chunk;
        }
      }
      await deps.device.playPcm(stamped());
      return { outcome: 'spoken', firstAudioAt };
    } catch (error) {
      if (error instanceof PlaybackInterruptedError) {
        // The owner tapped: the rest of the reply is dropped, the TTS
        // iterator is closed by the for-await above, nothing else to do.
        deps.log('robot interrupted by tap; the rest of the reply is dropped');
        return { outcome: 'interrupted', firstAudioAt };
      }
      // Never-mute already fell back inside the speaker chain; landing here
      // means every voice is gone.
      deps.log(`robot speech failed: ${String(error)}`);
    }
    await face('pouty');
    try {
      await deps.device.playPcm(deps.canned.play(fallback));
      return { outcome: 'canned', firstAudioAt: firstAudioAt ?? Date.now() };
    } catch (error) {
      deps.log(`robot canned audio failed too: ${String(error)}`);
      return { outcome: 'silent', firstAudioAt };
    }
  }

  /** What to say back, and whether the exchange is worth remembering. */
  async function decideReply(residentId: string | null, transcript: string): Promise<{ reply: string; remembered: boolean }> {
    if (residentId === null) return { reply: EMPTY_HOUSE_LINE, remembered: false };

    // The village caps the model at brainTimeoutMs and answers canned past
    // it. This race is the belt for those braces — a persona still being
    // written, a wedged commit — so the robot never waits forever.
    const hardCapMs = brainTimeoutMs * 2;
    let capTimer: NodeJS.Timeout | null = null;
    const hardCap = new Promise<'timeout'>((resolve) => {
      capTimer = setTimeout(() => resolve('timeout'), hardCapMs);
    });
    const chat = deps.village
      .chat(residentId, transcript, 'spoken', { timeoutMs: brainTimeoutMs, history: recentTurns() })
      .then((reply) => reply.text);
    // A late rejection after the cap fired must not surface as unhandled.
    chat.catch(() => {});

    try {
      const outcome = await Promise.race([chat, hardCap]);
      if (outcome === 'timeout') {
        deps.log(`robot brain timed out after ${hardCapMs}ms; speaking the lost-thought line`);
        return { reply: CANNED_LINES.lost_thought, remembered: false };
      }
      return { reply: outcome, remembered: true };
    } catch {
      // The resident's creature left the village while it lived here.
      return { reply: MOVED_AWAY_LINE, remembered: false };
    } finally {
      if (capTimer) clearTimeout(capTimer);
    }
  }

  /**
   * One capture, start to finish. `windowDeadline` is the follow-up clock
   * that was running when the capture arrived, or null when a tap opened
   * the ear — the difference decides what a silent capture earns.
   */
  async function runTurn(windowDeadline: number | null): Promise<void> {
    const fromTap = windowDeadline === null;
    const t0 = Date.now();
    const wav = await deps.device.pullRecording();
    const tPull = Date.now();
    if (wav === null) return;

    await face('thinking');

    // The guard (delta R4): enough voiced audio first, then a transcript
    // that reads like words. Garbage bytes from the wire count as silence.
    let transcript = '';
    let tAsr = tPull;
    try {
      const { pcm, sampleRate } = wavToPcm16(wav);
      const trimmed = trimSilence(pcm, { sampleRate });
      if (hasVoicedSpeech(trimmed, { sampleRate })) {
        transcript = await deps.asr.transcribe(pcm16ToWav(trimmed, sampleRate));
      }
      tAsr = Date.now();
    } catch (error) {
      deps.log(`robot asr failed: ${String(error)}`);
    }

    if (!looksLikeSpeech(transcript)) {
      if (fromTap) {
        // The owner asked and nothing came through: say so, then listen again.
        await face('shy');
        await speak(CANNED_LINES.didnt_catch, 'didnt_catch');
        await face('calm');
        await arm();
      } else {
        // A door, a cough: not a deliberate act. Same clock, not a word.
        await face('calm');
        await arm(windowDeadline);
      }
      return;
    }

    const residentId = deps.village.getState().robot.residentId;
    const { reply, remembered } = await decideReply(residentId, transcript);
    const tBrain = Date.now();
    lastTurnAt = tBrain;

    await face('happy');
    const { outcome, firstAudioAt } = await speak(reply, 'stuck');
    const tEnd = Date.now();
    if (remembered) remember(transcript, reply);

    if (outcome === 'interrupted') {
      // Tap = interrupt / talk-now: the ear opens for what comes next.
      await face('calm');
      await arm();
      return;
    }

    deps.log(
      `robot turn: pull=${tPull - t0}ms asr=${tAsr - tPull}ms brain=${tBrain - tAsr}ms ` +
        `tts_first=${(firstAudioAt ?? tEnd) - tBrain}ms total=${tEnd - t0}ms`,
    );

    await face('calm');
    await arm();
  }

  async function tick(): Promise<void> {
    try {
      watchResident();
      const status = await deps.device.status();
      deviceReachable = status.reachable;
      if (status.reachable) {
        if (status.recordingReady) {
          const windowDeadline = followUpDeadline;
          followUpDeadline = null;
          await runTurn(windowDeadline);
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
