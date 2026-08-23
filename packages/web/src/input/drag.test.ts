import { describe, it, expect } from 'vitest';
import { createDragTracker } from './drag.js';

describe('drag tracker', () => {
  it('a press that barely moves is a click', () => {
    const t = createDragTracker(6);
    t.press(100, 100, 'skill:x');
    t.move(103, 102);
    expect(t.release(103, 102)).toEqual({ type: 'click', targetId: 'skill:x' });
    expect(t.current()).toBe(null);
  });

  it('a press that travels past the slop becomes a drag and ends in a drop', () => {
    const t = createDragTracker(6);
    t.press(100, 100, 'skill:x');
    expect(t.current()).toEqual({ targetId: 'skill:x', dragging: false });
    t.move(140, 100);
    expect(t.current()).toEqual({ targetId: 'skill:x', dragging: true });
    expect(t.release(300, 200)).toEqual({ type: 'drop', targetId: 'skill:x' });
  });

  it('once dragging, snapping back under the slop stays a drag', () => {
    const t = createDragTracker(6);
    t.press(100, 100, 'skill:x');
    t.move(140, 100);
    t.move(101, 100);
    expect(t.release(101, 100)).toEqual({ type: 'drop', targetId: 'skill:x' });
  });

  it('a press on empty ground is nobody\'s gesture', () => {
    const t = createDragTracker(6);
    t.press(100, 100, null);
    t.move(200, 200);
    expect(t.current()).toBe(null);
    expect(t.release(200, 200)).toEqual({ type: 'none' });
  });

  it('cancel forgets everything', () => {
    const t = createDragTracker(6);
    t.press(100, 100, 'skill:x');
    t.move(200, 200);
    t.cancel();
    expect(t.current()).toBe(null);
    expect(t.release(200, 200)).toEqual({ type: 'none' });
  });

  it('release without press is none', () => {
    const t = createDragTracker(6);
    expect(t.release(1, 1)).toEqual({ type: 'none' });
  });
});
