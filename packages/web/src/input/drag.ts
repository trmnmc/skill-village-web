/**
 * Click vs drag vs drop, decided in the events' own client coordinates —
 * the same slop-in-client-pixels rule the village's click handler has always
 * used (see the long comment on the mousedown block in scene/village.ts for
 * why client coordinates and not k.mousePos()).
 *
 * The tracker only ever owns a press that started on a creature; a press on
 * empty ground stays the camera-pan's business and reads as no gesture here.
 */
export type GestureEnd =
  | { type: 'none' }
  | { type: 'click'; targetId: string }
  | { type: 'drop'; targetId: string };

export interface DragTracker {
  press(clientX: number, clientY: number, targetId: string | null): void;
  move(clientX: number, clientY: number): void;
  release(clientX: number, clientY: number): GestureEnd;
  cancel(): void;
  current(): { targetId: string; dragging: boolean } | null;
}

const DEFAULT_SLOP = 6;

export function createDragTracker(slop: number = DEFAULT_SLOP): DragTracker {
  let live: { targetId: string; fromX: number; fromY: number; dragging: boolean } | null = null;

  const past = (x: number, y: number) =>
    live !== null && Math.hypot(x - live.fromX, y - live.fromY) >= slop;

  return {
    press(clientX, clientY, targetId) {
      live = targetId === null ? null : { targetId, fromX: clientX, fromY: clientY, dragging: false };
    },
    move(clientX, clientY) {
      // One-way: a drag that wanders back near its origin is still a drag.
      if (live && !live.dragging && past(clientX, clientY)) live.dragging = true;
    },
    release(clientX, clientY) {
      const ended = live;
      live = null;
      if (!ended) return { type: 'none' };
      if (ended.dragging || past(clientX, clientY)) return { type: 'drop', targetId: ended.targetId };
      return { type: 'click', targetId: ended.targetId };
    },
    cancel() {
      live = null;
    },
    current() {
      return live ? { targetId: live.targetId, dragging: live.dragging } : null;
    },
  };
}
