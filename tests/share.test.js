import { describe, it, expect } from 'vitest';
import { playlistPayload, encodePayload, decodePayload } from '../src/lib/share.js';

describe('share payload', () => {
  const songs = Array.from({ length: 40 }, (_, i) => ({
    title: `Song number ${i} (feat. Someone)`,
    artist: 'The Weeknd',
    duration: 200.4 + i,
  }));

  it('round-trips through the compressed form', async () => {
    const code = await encodePayload(playlistPayload('The Weeknd 上海', songs));
    expect(code[0]).toBe('z');
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodePayload(code);
    expect(back.name).toBe('The Weeknd 上海');
    expect(back.tracks).toHaveLength(40);
    expect(back.tracks[3]).toEqual({ title: 'Song number 3 (feat. Someone)', artist: 'The Weeknd', duration: 203 });
  });

  it('keeps a 40-song playlist small enough for a QR code', async () => {
    const code = await encodePayload(playlistPayload('x', songs));
    expect(code.length).toBeLessThan(1200);
  });

  it('rejects garbage', async () => {
    await expect(decodePayload('xabc')).rejects.toThrow();
    await expect(decodePayload('j' + btoa('{"a":1}'))).rejects.toThrow();
  });
});
