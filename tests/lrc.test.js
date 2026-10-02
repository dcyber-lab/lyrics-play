import { describe, it, expect } from 'vitest';
import { parseLrc, estimateTimeline, songTimeline } from '../src/lib/lrc.js';

describe('parseLrc', () => {
  it('parses timestamps, metadata and sorts', () => {
    const { meta, lines } = parseLrc(
      '[ti:Yellow]\n[ar:Coldplay]\n[00:33.50]Look at the stars\n[00:10.1]\n[01:02.345]Look how they shine'
    );
    expect(meta).toEqual({ ti: 'Yellow', ar: 'Coldplay' });
    expect(lines.map((l) => l.t)).toEqual([10.1, 33.5, 62.345]);
    expect(lines[0].text).toBe('');
  });

  it('expands multi-stamp lines and strips word timings', () => {
    const { lines } = parseLrc('[00:05.00][01:00.00]<00:05.00>Hey <00:05.50>you');
    expect(lines).toEqual([
      { t: 5, text: 'Hey you' },
      { t: 60, text: 'Hey you' },
    ]);
  });

  it('applies offset', () => {
    const { lines } = parseLrc('[offset:500]\n[00:10.00]a');
    expect(lines[0].t).toBeCloseTo(9.5);
  });
});

describe('estimateTimeline', () => {
  it('spreads lines inside the song duration', () => {
    const lines = estimateTimeline('one\ntwo\n\nthree', 100);
    expect(lines).toHaveLength(3);
    expect(lines[0].t).toBeCloseTo(8);
    expect(lines.at(-1).t).toBeLessThan(92);
  });

  it('falls back to plain lyrics when synced text has no stamps', () => {
    const tl = songTimeline({ synced: true, lyrics: 'a\nb', duration: 60 });
    expect(tl.synced).toBe(false);
    expect(tl.lines).toHaveLength(2);
  });
});
