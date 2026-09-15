/**
 * In-memory RobotDevice for tests: no sockets, no timers, no hardware
 * (global constraint — CI needs no robot). Tests observe what the loop did
 * to the device through the extra surface: pushRecording seeds a "tap to
 * talk" capture, playedPcm/faces/armedLog record what the loop sent back,
 * interruptAfterChunks plays the owner tapping the robot mid-reply.
 */

import { PlaybackInterruptedError, type DeviceStatus, type RobotDevice } from '../device.js';

export function createFakeDevice(): RobotDevice & {
  pushRecording(wav: Buffer): void;
  /** The next playPcm accepts `n` chunks, then refuses the rest like a tapped robot. */
  interruptAfterChunks(n: number): void;
  playedPcm: Buffer[];
  faces: string[];
  armedLog: boolean[];
} {
  let recording: Buffer | null = null;
  let micArmed = false;
  let interruptAfter: number | null = null;
  const playedPcm: Buffer[] = [];
  const faces: string[] = [];
  const armedLog: boolean[] = [];

  return {
    playedPcm,
    faces,
    armedLog,

    pushRecording(wav: Buffer) {
      recording = wav;
    },

    interruptAfterChunks(n: number) {
      interruptAfter = n;
    },

    async status(): Promise<DeviceStatus> {
      return { reachable: true, micArmed, recordingReady: recording !== null, playing: false };
    },

    // Mirrors the firmware: a capture is handed over exactly once (audio
    // never persists — spec §6), so pulling clears it.
    async pullRecording() {
      const wav = recording;
      recording = null;
      return wav;
    },

    async playPcm(chunks: AsyncIterable<Buffer>) {
      let received = 0;
      for await (const chunk of chunks) {
        playedPcm.push(chunk);
        received++;
        if (interruptAfter !== null && received >= interruptAfter) {
          interruptAfter = null;
          throw new PlaybackInterruptedError();
        }
      }
    },

    async setFace(name: string) {
      faces.push(name);
    },

    async arm() {
      micArmed = true;
      armedLog.push(true);
    },

    async disarm() {
      micArmed = false;
      armedLog.push(false);
    },
  };
}
