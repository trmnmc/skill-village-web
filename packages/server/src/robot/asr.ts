/**
 * Local speech-to-text against a whisper.cpp server. Voice audio never leaves
 * the PC (spec §6): the only network hop here is loopback to whisper. Uses the
 * global fetch/FormData/Blob from Node 20+ — no extra dependencies.
 */

export interface Transcriber {
  transcribe(wav: Buffer): Promise<string>;
  healthy(): Promise<boolean>;
}

/**
 * whisper.cpp server contract: `POST {serverUrl}/inference` as
 * multipart/form-data, WAV under field `file`, response `{ text }`.
 */
export function createWhisperTranscriber(opts: { serverUrl: string; fetchImpl?: typeof fetch }): Transcriber {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.serverUrl.replace(/\/+$/, '');

  return {
    async transcribe(wav) {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
      form.append('temperature', '0');
      form.append('response_format', 'json');
      const res = await doFetch(`${base}/inference`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`whisper server answered ${res.status}`);
      const body = (await res.json()) as { text?: unknown };
      if (typeof body.text !== 'string') throw new Error('whisper response has no text field');
      return body.text.trim();
    },

    async healthy() {
      // Any HTTP answer (even a 404) means the server process is up.
      try {
        await doFetch(base);
        return true;
      } catch {
        return false;
      }
    },
  };
}
