/**
 * HTTP client for the hardened robot firmware (Task 5 contract). Every
 * request carries `X-Robot-Token`; the firmware answers 401 without it.
 * `status()` is the poll-loop heartbeat, so it never throws — an unreachable
 * or unauthorized robot reads as all-false rather than crashing the loop.
 * Everything else throws loudly: a failed play or arm is a bug to surface,
 * not a state to poll through.
 *
 * Every call has a deadline (delta gap 3): a robot that drops off the Wi-Fi
 * mid-request must not hang the loop, it must read as offline.
 */

export interface DeviceStatus {
  reachable: boolean;
  micArmed: boolean;
  recordingReady: boolean;
  playing: boolean;
}

export interface RobotDevice {
  status(): Promise<DeviceStatus>;
  pullRecording(): Promise<Buffer | null>; // WAV bytes or null
  playPcm(chunks: AsyncIterable<Buffer>): Promise<void>; // 24kHz mono PCM16
  setFace(name: string): Promise<void>;
  arm(): Promise<void>;
  disarm(): Promise<void>;
}

/**
 * The owner tapped the robot mid-reply: the firmware stopped the speaker
 * and refuses the rest of that session. The loop treats this as the end
 * of the turn, not as a failure (delta gap 1).
 */
export class PlaybackInterruptedError extends Error {
  constructor(message = 'the robot interrupted this reply') {
    super(message);
    this.name = 'PlaybackInterruptedError';
  }
}

export interface DeviceTimeouts {
  statusMs: number;
  pullMs: number;
  faceMs: number;
  chunkMs: number;
}

const DEFAULT_TIMEOUTS: DeviceTimeouts = { statusMs: 2_000, pullMs: 5_000, faceMs: 3_000, chunkMs: 10_000 };

const OFFLINE: DeviceStatus = { reachable: false, micArmed: false, recordingReady: false, playing: false };

let nextSessionSerial = 0;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function createDeviceClient(opts: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeouts?: Partial<DeviceTimeouts>;
}): RobotDevice {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  const timeouts: DeviceTimeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };

  async function request(
    method: string,
    path: string,
    timeoutMs: number,
    body?: Buffer | string,
    contentType?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = { 'X-Robot-Token': opts.token };
    if (contentType !== undefined) headers['content-type'] = contentType;
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (isTimeout(error)) throw new Error(`robot ${method} ${path} timed out after ${timeoutMs}ms`);
      throw error;
    }
    if (res.status === 401) {
      throw new Error(`unauthorized: robot rejected X-Robot-Token (401) for ${method} ${path}`);
    }
    return res;
  }

  /** Like request, but any non-2xx (past the 401 case above) is an error. */
  async function requestOk(
    method: string,
    path: string,
    timeoutMs: number,
    body?: Buffer | string,
    contentType?: string,
  ): Promise<Response> {
    const res = await request(method, path, timeoutMs, body, contentType);
    if (!res.ok) throw new Error(`robot ${method} ${path} failed: HTTP ${res.status}`);
    return res;
  }

  return {
    async status() {
      try {
        const res = await request('GET', '/audio/status', timeouts.statusMs);
        if (!res.ok) return OFFLINE;
        // Firmware speaks snake_case; the rest of the server never sees it.
        const raw = (await res.json()) as Record<string, unknown>;
        return {
          reachable: true,
          micArmed: raw.mic_armed === true,
          // Hardened firmware sends recording_ready; the stock field is
          // `ready` — accept either so a half-upgraded robot still reads.
          recordingReady: raw.recording_ready === true || raw.ready === true,
          playing: raw.playing === true,
        };
      } catch {
        return OFFLINE;
      }
    },

    async pullRecording() {
      const res = await request('GET', '/audio', timeouts.pullMs);
      // 204/404 both mean "nothing captured yet" across firmware revisions.
      if (res.status === 204 || res.status === 404) return null;
      if (!res.ok) throw new Error(`robot GET /audio failed: HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },

    async playPcm(chunks) {
      // The session id is minted HERE: /play/pcm only needs a stable string
      // to sequence chunks against, and the firmware has no other transport
      // to negotiate any more.
      const session = `pc-${Date.now().toString(36)}-${nextSessionSerial++}`;
      const post = async (seq: number, chunk: Buffer, final: boolean): Promise<void> => {
        const path = `/play/pcm?session=${encodeURIComponent(session)}&seq=${seq}&final=${final ? 1 : 0}`;
        const res = await request('POST', path, timeouts.chunkMs, chunk, 'application/octet-stream');
        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as { error?: unknown };
          if (body.error === 'interrupted') throw new PlaybackInterruptedError();
        }
        if (!res.ok) throw new Error(`robot POST /play/pcm failed: HTTP ${res.status}`);
      };

      // One chunk of lookahead: a chunk only ships once its successor exists,
      // so the last one — and only the last one — carries final=1. The
      // firmware needs that flag on the closing chunk to end the session.
      let seq = 0;
      let held: Buffer | null = null;
      for await (const chunk of chunks) {
        if (held !== null) await post(seq++, held, false);
        held = chunk;
      }
      // An empty stream still closes the session it opened.
      await post(seq, held ?? Buffer.alloc(0), true);
    },

    async setFace(name) {
      // The firmware's JSON key is `face` (calm/thinking/happy/sleepy/...).
      await requestOk('POST', '/face', timeouts.faceMs, JSON.stringify({ face: name }), 'application/json');
    },

    async arm() {
      await requestOk('POST', '/mic/arm', timeouts.faceMs);
    },

    async disarm() {
      await requestOk('POST', '/mic/disarm', timeouts.faceMs);
    },
  };
}
