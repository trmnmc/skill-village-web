/**
 * In-memory RobotDevice for tests: no sockets, no timers, no hardware
 * (global constraint — CI needs no robot). Tests observe what the loop did
 * to the device through the extra surface: pushRecording seeds a "tap to
 * talk" capture, playedPcm/faces/armedLog record what the loop sent back.
 */

import type { DeviceStatus, RobotDevice } from '../device.js';

export function createFakeDevice(): RobotDevice & {
  pushRecording(wav: Buffer): void;
  playedPcm: Buffer[];
  faces: string[];
  armedLog: boolean[];
} {
  let recording: Buffer | null = null;
  let micArmed = false;
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
      for await (const chunk of chunks) playedPcm.push(chunk);
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
