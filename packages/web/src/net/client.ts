import { parseServerMessage, toView, type VillageView } from './protocol.js';

export interface ClientHandlers {
  onView(view: VillageView): void;
  onStatus(status: 'connecting' | 'live' | 'offline'): void;
}

const RETRY_MS = 2000;

/**
 * Fetch the village once so the first frame draws immediately, then follow the
 * socket for updates. A dropped socket retries forever: the server may simply
 * be restarting, and the village should reappear when it comes back.
 */
export function connect(handlers: ClientHandlers): { close(): void } {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  void fetch('/api/state')
    .then((res) => res.json())
    .then((payload) => {
      const view = toView(payload);
      if (view && !closed) handlers.onView(view);
    })
    .catch(() => handlers.onStatus('offline'));

  const open = () => {
    if (closed) return;
    handlers.onStatus('connecting');
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => handlers.onStatus('live'));
    socket.addEventListener('message', (event) => {
      const view = parseServerMessage(String(event.data));
      if (view) handlers.onView(view);
    });
    socket.addEventListener('close', () => {
      if (closed) return;
      handlers.onStatus('offline');
      retry = setTimeout(open, RETRY_MS);
    });
    socket.addEventListener('error', () => socket?.close());
  };

  open();

  return {
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    },
  };
}

/**
 * Throw out a sketch. A 409 means the cull was refused — a race with midnight
 * or a double click — and the socket's next frame re-syncs us, so there is
 * nothing to report and nothing to show the player.
 */
export async function postCull(sketchId: string): Promise<void> {
  try {
    await fetch('/api/gallery/cull', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sketchId }),
    });
  } catch {
    // Offline. The village keeps running; the case is unchanged.
  }
}

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
