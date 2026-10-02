<script>
  import { onMount, onDestroy } from 'svelte';
  import qrcode from 'qrcode-generator';
  import { lib, playedOn, updatePlaylist, today } from '../lib/store.svelte.js';
  import { playlistPayload, encodePayload, shareUrl } from '../lib/share.js';
  import { renderCard, canvasToFile, saveFile } from '../lib/card.js';
  import { playlistArt, primaryArtist, artistPhoto } from '../lib/artwork.js';
  import Icon from './Icon.svelte';

  let { playlist, onclose } = $props();

  const songs = $derived(playlist.songIds.map((id) => lib.songs[id]).filter(Boolean));
  let tab = $state('link');

  // --- link + QR ---
  let url = $state('');
  let qrSvg = $state('');
  let copied = $state(false);

  onMount(async () => {
    url = shareUrl(await encodePayload(playlistPayload(playlist.name, songs)));
    const qr = qrcode(0, 'L');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    qrSvg = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      prompt('复制这个链接', url);
    }
  }

  async function shareLink() {
    try {
      await navigator.share({ title: playlist.name, text: `歌单「${playlist.name}」，打开就能导入`, url });
    } catch {}
  }

  // --- card ---
  let date = $state(today()); // local date, same as the played-songs log
  // svelte-ignore state_referenced_locally
  let venue = $state(playlist.venue ?? ''); // initial value only; saved back on export
  const played = $derived(playedOn(playlist.id, date));
  let onlyPlayed = $state(true);
  let canvas = $state();

  // Your own photo on the card: picked/taken here, kept in memory only.
  let photoUrl = $state(null);
  let photoStyle = $state('hero'); // 'hero' | 'polaroid'
  let photoY = $state(0.4);
  function pickPhoto(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(file);
  }
  function dropPhoto() {
    URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }
  onDestroy(() => photoUrl && URL.revokeObjectURL(photoUrl));
  let rendering = $state(false);
  let saving = $state(false);

  const cardSongs = $derived(
    onlyPlayed && played.length ? played.map((id) => lib.songs[id]).filter(Boolean) : songs
  );

  let renderTimer;
  $effect(() => {
    if (tab !== 'card' || !canvas) return;
    const data = {
      title: playlist.name,
      eyebrow: `Live · ${date.replace(/-/g, '.')}`,
      subtitle: venue.trim(),
      hero: heroFor(),
      photo: photoUrl,
      photoStyle,
      photoY,
      caption: date.replace(/-/g, '.'), // venue is already in the title block
      songs: cardSongs.map((s) => ({ title: s.title, artist: s.artist, cover: s.art?.cover })),
    };
    clearTimeout(renderTimer);
    renderTimer = setTimeout(async () => {
      rendering = true;
      await renderCard(canvas, data);
      rendering = false;
    }, 250);
  });

  function heroFor() {
    const art = playlistArt(playlist.songIds);
    if (art.photo) return art.photo;
    const first = songs[0];
    return (first && artistPhoto(primaryArtist(first.artist))) ?? first?.art?.cover ?? null;
  }

  async function saveCard() {
    saving = true;
    try {
      updatePlaylist(playlist.id, { venue: venue.trim() });
      const file = await canvasToFile(canvas, `${playlist.name}-${date}.png`.replace(/[\\/:*?"<>|]/g, '_'));
      await saveFile(file);
    } catch (err) {
      alert(`图片导出失败：${err.message}`);
    } finally {
      saving = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-label="分享">
  <div class="grab"></div>
  <div class="head">
    <div class="segmented">
      <button class:on={tab === 'link'} onclick={() => (tab = 'link')}><Icon name="qr" size={16} />分享歌单</button>
      <button class:on={tab === 'card'} onclick={() => (tab = 'card')}><Icon name="image" size={16} />演出卡片</button>
    </div>
    <button class="icon-btn filled" onclick={onclose} aria-label="关闭"><Icon name="x" size={18} /></button>
  </div>

  {#if tab === 'link'}
    <div class="body center">
      <div class="qr">{#if qrSvg}{@html qrSvg}{/if}</div>
      <p class="muted">朋友扫码，或者打开链接，就能导入「{playlist.name}」的 {songs.length} 首歌。<br />歌词会在他的手机上重新获取。</p>
      <div class="actions">
        <button class="btn" onclick={copy} disabled={!url}><Icon name={copied ? 'check' : 'link'} size={18} />{copied ? '已复制' : '复制链接'}</button>
        {#if navigator.share}
          <button class="btn primary" onclick={shareLink} disabled={!url}><Icon name="share" size={18} />分享</button>
        {/if}
      </div>
    </div>
  {:else}
    <div class="body">
      <div class="fields">
        <input bind:value={venue} placeholder="场馆 / 城市（可选）" />
        <input type="date" bind:value={date} />
      </div>
      {#if photoUrl}
        <div class="photo-row">
          <img class="thumb" src={photoUrl} alt="" />
          <div class="segmented mini">
            <button class:on={photoStyle === 'hero'} onclick={() => (photoStyle = 'hero')}>全幅</button>
            <button class:on={photoStyle === 'polaroid'} onclick={() => (photoStyle = 'polaroid')}>拍立得</button>
          </div>
          <button class="icon-btn filled" onclick={dropPhoto} aria-label="去掉照片"><Icon name="x" size={16} /></button>
        </div>
        <label class="slider">
          <span>上</span>
          <input type="range" min="0" max="1" step="0.01" bind:value={photoY} aria-label="照片位置" />
          <span>下</span>
        </label>
      {:else}
        <label class="btn photo-btn">
          <Icon name="camera" size={18} />拍一张 / 选一张自己的照片
          <input type="file" accept="image/*" onchange={pickPhoto} hidden />
        </label>
      {/if}
      {#if played.length}
        <label class="toggle">
          <input type="checkbox" bind:checked={onlyPlayed} />
          只放这天唱过的 {played.length} 首（否则是整个歌单 {songs.length} 首）
        </label>
      {:else}
        <p class="muted small">这天还没有播放记录，卡片会列出整个歌单。演出时在播放页点过的歌会被自动记下来。</p>
      {/if}
      <div class="preview" class:busy={rendering}>
        <canvas bind:this={canvas}></canvas>
      </div>
      <button class="btn primary save" onclick={saveCard} disabled={saving || rendering}>
        <Icon name="download" size={18} />{saving ? '导出中…' : '保存图片'}
      </button>
    </div>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 20;
    animation: fade 0.2s;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 92vh;
    overflow-y: auto;
    z-index: 21;
    padding: 8px 16px calc(var(--safe-bottom) + 16px);
    border-radius: 24px 24px 0 0;
    background: #141418;
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
    animation: up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @media (min-width: 640px) {
    .sheet {
      left: 50%;
      width: 600px;
      transform: translateX(-50%);
    }
  }
  @keyframes up {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .grab {
    width: 36px;
    height: 5px;
    margin: 0 auto 10px;
    border-radius: 3px;
    background: var(--surface-press);
  }
  .head {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .segmented {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 3px;
    border-radius: 12px;
    background: var(--surface);
  }
  .segmented button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 600;
    color: var(--dim);
  }
  .segmented button.on {
    background: var(--surface-press);
    color: var(--fg);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 16px;
  }
  .center {
    align-items: center;
    text-align: center;
  }
  .qr {
    width: min(72vw, 300px);
    aspect-ratio: 1;
    border-radius: 18px;
    overflow: hidden;
    background: #fff;
  }
  .qr :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .muted {
    line-height: 1.5;
    margin: 0;
  }
  .small {
    font-size: 13px;
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  .fields {
    display: flex;
    gap: 8px;
  }
  .fields input[type='date'] {
    width: auto;
    flex: none;
  }
  .photo-btn {
    width: 100%;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .photo-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .thumb {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    object-fit: cover;
  }
  .segmented.mini button {
    height: 30px;
  }
  .slider {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--dim);
  }
  .slider input {
    flex: 1;
    padding: 0;
    background: none;
    accent-color: var(--accent);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--dim);
  }
  .toggle input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
  .preview {
    align-self: center;
    width: min(62vw, 320px);
    aspect-ratio: 9 / 16;
    border-radius: 14px;
    overflow: hidden;
    background: #000;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
    transition: opacity 0.2s;
  }
  .preview.busy {
    opacity: 0.6;
  }
  .preview canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .save {
    height: 50px;
  }
</style>
