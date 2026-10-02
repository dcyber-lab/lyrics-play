// Lyric clock: maps wall time to a position on the song's lyric timeline.
//
// It runs at `rate` × real time. Every time the user taps a line we get a
// ground-truth observation "the singer is at X right now"; two such taps far
// enough apart tell us the band's actual tempo relative to the studio LRC,
// so the clock learns rate from calibration instead of asking for it.

export const MIN_RATE = 0.8;
export const MAX_RATE = 1.2;
const MIN_LEARN_SPAN = 12; // seconds of lyric time between taps before we trust a rate estimate
const MAX_RATE_JUMP = 0.12; // bigger disagreements are probably a skipped/repeated section, not tempo

const clamp = (r) => Math.min(MAX_RATE, Math.max(MIN_RATE, r));

export class SyncClock {
  constructor({ now = () => performance.now() / 1000, rate = 1 } = {}) {
    this.now = now;
    this.running = false;
    this.anchorPos = 0;
    this.anchorWall = 0;
    this.rate = clamp(rate);
    this.lastTap = null;
  }

  get position() {
    return this.running
      ? this.anchorPos + (this.now() - this.anchorWall) * this.rate
      : this.anchorPos;
  }

  #reanchor(pos) {
    this.anchorPos = Math.max(0, pos);
    this.anchorWall = this.now();
  }

  play() {
    if (this.running) return;
    this.anchorWall = this.now();
    this.running = true;
  }

  pause() {
    if (!this.running) return;
    this.#reanchor(this.position);
    this.running = false;
    // Wall time spent paused would poison the next tempo estimate.
    this.lastTap = null;
  }

  toggle() {
    this.running ? this.pause() : this.play();
  }

  seek(pos) {
    this.#reanchor(pos);
  }

  nudge(delta) {
    this.#reanchor(this.position + delta);
  }

  setRate(rate) {
    this.#reanchor(this.position);
    this.rate = clamp(rate);
    this.lastTap = null;
  }

  // "The singer is at `pos` right now." Seeks, starts the clock, and maybe
  // learns tempo. Returns true when the rate was updated.
  tap(pos) {
    const wall = this.now();
    let learned = false;

    if (this.running && this.lastTap) {
      const dPos = pos - this.lastTap.pos;
      const dWall = wall - this.lastTap.wall;
      if (dPos >= MIN_LEARN_SPAN && dWall > 0) {
        const measured = dPos / dWall;
        if (
          measured >= MIN_RATE &&
          measured <= MAX_RATE &&
          Math.abs(measured - this.rate) <= MAX_RATE_JUMP
        ) {
          const w = Math.min(0.6, dPos / 60);
          this.rate = clamp(this.rate * (1 - w) + measured * w);
          learned = true;
        }
      }
    }

    this.#reanchor(pos);
    this.running = true;
    this.lastTap = { pos, wall };
    return learned;
  }
}

// Index of the last line whose time has been reached, -1 before the first.
export function activeIndex(lines, pos) {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= pos) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
