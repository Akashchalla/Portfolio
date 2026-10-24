// Convert the model's 21 hand points into a deliberately simple drawing gesture.
export function classifyGesture(points, aspect = 1) {
  if (!points || points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    return {mode: 'missing', tip: null};
  }
  const distance = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const extended = tip => {
    const wrist = points[0], base = points[tip - 3], joint = points[tip - 2];
    return distance(points[tip], wrist) > distance(joint, wrist) * 1.12 &&
      distance(points[tip], base) > distance(joint, base) * 1.45;
  };
  const index = extended(8), middle = extended(12), ring = extended(16), pinky = extended(20);
  if (index && !middle && !ring && !pinky) return {mode: 'draw', tip: points[8]};
  if (pinky && !index && !middle && !ring) return {mode: 'erase', tip: points[20]};
  return {mode: 'pause', tip: null};
}

// Wait for a gesture to settle before marking the canvas. Never connect a stroke
// across a missing hand, a gesture change, a long gap, or a large tracking jump.
export class GestureStroke {
  constructor() { this.reset(); }
  reset() { this.mode = null; this.frames = 0; this.previous = null; this.time = 0; }
  update(gesture, time, width, height) {
    if (gesture.mode !== this.mode || time - this.time > 220) {
      this.frames = 0;
      this.previous = null;
    }
    this.mode = gesture.mode;
    this.time = time;
    this.frames++;
    if (!gesture.tip || this.frames < 3) { this.previous = null; return null; }
    const raw = {x: (1 - gesture.tip.x) * width, y: gesture.tip.y * height};
    const old = this.previous;
    const jump = old && Math.hypot(raw.x - old.x, raw.y - old.y) > Math.min(width, height) * .22;
    const point = old && !jump
      ? {x: old.x + (raw.x - old.x) * .55, y: old.y + (raw.y - old.y) * .55}
      : raw;
    this.previous = point;
    return {from: old && !jump ? old : point, to: point, mode: gesture.mode};
  }
}
