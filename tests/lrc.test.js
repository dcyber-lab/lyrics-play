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

import { cleanTitle, pickBest, setlistLineToQuery } from '../src/lib/lrclib.js';

describe('lrclib helpers', () => {
  it('strips featured artists and version suffixes', () => {
    expect(cleanTitle('Timeless (feat Playboi Carti)')).toBe('Timeless');
    expect(cleanTitle("Creepin' (with The Weeknd & 21 Savage)")).toBe("Creepin'");
    expect(cleanTitle('The Abyss (feat. Lana Del Rey)')).toBe('The Abyss');
    expect(cleanTitle('Blinding Lights - Remastered 2020')).toBe('Blinding Lights');
    expect(cleanTitle('How Do I Make You Love Me?')).toBe('How Do I Make You Love Me?');
    expect(cleanTitle('House Of Balloons / Glass Table Girls')).toBe('House Of Balloons / Glass Table Girls');
  });

  it('prefers synced, then closest duration', () => {
    const rs = [
      { id: 'plain', synced: false, duration: 200 },
      { id: 'extended', synced: true, duration: 380 },
      { id: 'album', synced: true, duration: 201 },
    ];
    expect(pickBest(rs, 200).id).toBe('album');
    expect(pickBest(rs).id).toBe('extended');
    expect(pickBest([], 200)).toBe(null);
  });

  it('turns setlist lines into queries', () => {
    expect(setlistLineToQuery('3. The Weeknd - Starboy')).toBe('The Weeknd Starboy');
    expect(setlistLineToQuery('Starboy', 'The Weeknd')).toBe('The Weeknd Starboy');
  });
});

import { queriesFor } from '../src/lib/lrclib.js';

describe('queriesFor', () => {
  it('falls back to title-only and the first half of medley titles', () => {
    expect(queriesFor({ title: 'House Of Balloons / Glass Table Girls', artist: 'The Weeknd' })).toEqual([
      'The Weeknd House Of Balloons / Glass Table Girls',
      'House Of Balloons / Glass Table Girls',
      'The Weeknd House Of Balloons',
      'House Of Balloons',
    ]);
    expect(queriesFor({ title: 'Starboy', artist: 'The Weeknd' })).toEqual(['The Weeknd Starboy', 'Starboy']);
    expect(queriesFor({ query: 'raw text' })).toEqual(['raw text']);
  });
});

import { rankResults } from '../src/lib/lrclib.js';

describe('rankResults', () => {
  it('orders synced, then artist match, then exact title', () => {
    const rs = [
      { id: 'cover', title: 'Starboy', artist: 'Piano Covers', synced: true },
      { id: 'plain', title: 'Starboy', artist: 'The Weeknd', synced: false },
      { id: 'remix', title: 'Starboy (Remix)', artist: 'The Weeknd', synced: true },
      { id: 'album', title: 'Starboy', artist: 'The Weeknd, Daft Punk', synced: true },
    ];
    expect(rankResults(rs, { title: 'starboy', artist: 'weeknd' }).map((r) => r.id)).toEqual([
      'album',
      'remix',
      'cover',
      'plain',
    ]);
    expect(rankResults(rs).map((r) => r.id)).toEqual(['cover', 'remix', 'album', 'plain']);
  });
});

import { primaryArtist, isPlaceholder, pickDeezer } from '../src/lib/artwork.js';

describe('artwork helpers', () => {
  it('takes the lead artist', () => {
    expect(primaryArtist('Metro Boomin, The Weeknd, 21 Savage')).toBe('Metro Boomin');
    expect(primaryArtist('The Weeknd feat. Daft Punk')).toBe('The Weeknd');
    expect(primaryArtist('Florence + The Machine')).toBe('Florence + The Machine');
  });

  it('spots Deezer placeholder images', () => {
    expect(isPlaceholder('https://e-cdns-images.dzcdn.net/images/artist//500x500-000000-80-0-0.jpg')).toBe(true);
    expect(isPlaceholder('https://e-cdns-images.dzcdn.net/images/artist/abc123/500x500-000000-80-0-0.jpg')).toBe(false);
    expect(isPlaceholder(null)).toBe(true);
  });

  it('picks the right artist, then closest duration', () => {
    const rs = [
      { id: 'cover', artist: { name: 'Piano Tribute' }, duration: 230 },
      { id: 'live', artist: { name: 'The Weeknd' }, duration: 300 },
      { id: 'album', artist: { name: 'The Weeknd' }, duration: 231 },
    ];
    expect(pickDeezer(rs, { artist: 'The Weeknd', duration: 230 }).id).toBe('album');
  });
});
