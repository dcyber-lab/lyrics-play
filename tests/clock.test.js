import { describe, it, expect } from 'vitest';
import { SyncClock, activeIndex } from '../src/lib/clock.js';

function fakeClock() {
  let t = 0;
  const clock = new SyncClock({ now: () => t });
  return { clock, advance: (s) => (t += s) };
}

describe('SyncClock', () => {
  it('advances only while running', () => {
    const { clock, advance } = fakeClock();
    advance(5);
    expect(clock.position).toBe(0);
    clock.play();
    advance(3);
    expect(clock.position).toBe(3);
    clock.pause();
    advance(10);
    expect(clock.position).toBe(3);
  });

  it('nudges and seeks', () => {
    const { clock, advance } = fakeClock();
    clock.play();
    advance(10);
    clock.nudge(-0.5);
    expect(clock.position).toBeCloseTo(9.5);
    clock.seek(42);
    advance(1);
    expect(clock.position).toBeCloseTo(43);
  });

  it('learns a slower live tempo from two taps', () => {
    const { clock, advance } = fakeClock();
    // Band plays 10% slower: 30s of lyrics take 33s.
    clock.tap(20);
    advance(33);
    const learned = clock.tap(50);
    expect(learned).toBe(true);
    expect(clock.rate).toBeLessThan(1);
    expect(clock.rate).toBeGreaterThan(0.9);
    expect(clock.position).toBe(50);
  });

  it('ignores taps that look like jumps, not tempo', () => {
    const { clock, advance } = fakeClock();
    clock.tap(20);
    advance(10);
    expect(clock.tap(80)).toBe(false); // skipped ahead
    advance(10);
    expect(clock.tap(30)).toBe(false); // repeated chorus
    expect(clock.rate).toBe(1);
  });

  it('forgets the last tap across a pause', () => {
    const { clock, advance } = fakeClock();
    clock.tap(20);
    advance(30);
    clock.pause();
    advance(120);
    clock.play();
    expect(clock.tap(50)).toBe(false);
  });
});

describe('activeIndex', () => {
  const lines = [{ t: 5 }, { t: 10 }, { t: 15 }];
  it('finds the current line', () => {
    expect(activeIndex(lines, 0)).toBe(-1);
    expect(activeIndex(lines, 5)).toBe(0);
    expect(activeIndex(lines, 12)).toBe(1);
    expect(activeIndex(lines, 99)).toBe(2);
  });
});
