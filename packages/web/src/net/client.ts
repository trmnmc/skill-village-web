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

/**
 * Park a villager where the player dropped it. True on success; false is "the
 * server said no or is away", which the caller treats as "nothing happened" —
 * the spot already moved locally and the next state frame is the truth.
 */
export async function pinCreature(creatureId: string, x: number, y: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/creatures/${encodeURIComponent(creatureId)}/pin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Release every hand-placed villager back to automatic placement. */
export async function resetLayout(): Promise<boolean> {
  try {
    const res = await fetch('/api/layout/reset', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
