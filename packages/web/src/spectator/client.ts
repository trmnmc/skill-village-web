// packages/web/src/spectator/client.ts
import { parseShowroomMessage, toShowroomView, type ShowroomView } from './protocol.js';

export interface ShowroomHandlers {
  onView(view: ShowroomView): void;
  onHatch(slug: string, name: string): void;
  onStatus(status: 'connecting' | 'live' | 'offline'): void;
}

const RETRY_MS = 2000;
/** Spec §8: while the socket is down, spectators lose only immediacy. */
const FALLBACK_POLL_MS = 60_000;

export function connectShowroom(handlers: ShowroomHandlers): { close(): void } {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let fallback: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const fetchOnce = () =>
    fetch('/api/village')
      .then((res) => res.json())
      .then((payload) => {
        const view = toShowroomView(payload);
        if (view && !closed) handlers.onView(view);
      })
      .catch(() => handlers.onStatus('offline'));

  void fetchOnce(); // first paint before the socket lands

  const stopFallback = () => {
    if (fallback) { clearInterval(fallback); fallback = null; }
  };

  const open = () => {
    if (closed) return;
    handlers.onStatus('connecting');
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      handlers.onStatus('live');
      stopFallback();
    });
    socket.addEventListener('message', (event) => {
      const frame = parseShowroomMessage(String(event.data));
      if (!frame) return;
      if (frame.type === 'village') handlers.onView(frame.view);
      else handlers.onHatch(frame.slug, frame.name);
    });
    socket.addEventListener('close', () => {
      if (closed) return;
      handlers.onStatus('offline');
      if (!fallback) fallback = setInterval(() => void fetchOnce(), FALLBACK_POLL_MS);
      retry = setTimeout(open, RETRY_MS);
    });
    socket.addEventListener('error', () => socket?.close());
  };

  open();

  return {
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      stopFallback();
      socket?.close();
    },
  };
}
