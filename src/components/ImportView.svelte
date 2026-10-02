<script>
  import { onMount } from 'svelte';
  import { createPlaylist, playlistById } from '../lib/store.svelte.js';
  import { decodePayload } from '../lib/share.js';
  import { importTracks } from '../lib/importer.js';
  import { ensureArt } from '../lib/artwork.js';
  import Cover from './Cover.svelte';
  import Icon from './Icon.svelte';

  let { code } = $props();

  let data = $state(null); // { name, tracks }
  let error = $state('');
  let job = $state(null); // { done, total }

  onMount(async () => {
    try {
      data = await decodePayload(code);
    } catch {
      error = '这个分享链接打不开，可能复制的时候被截断了';
    }
  });

  async function run() {
    const pid = createPlaylist(data.name);
    job = { done: 0, total: data.tracks.length };
    await importTracks(pid, data.tracks, (done) => (job.done = done));
    ensureArt(playlistById(pid)?.songIds ?? []);
    location.replace(`#/p/${pid}`);
  }

  const fmt = (sec) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}` : '');
</script>

<div class="page">
  <div class="nav"><a class="icon-btn" href="#/" aria-label="返回"><Icon name="back" /></a></div>

  {#if error}
    <p class="error">{error}</p>
  {:else if data}
    <header class="hero">
      <Cover seed={data.name} size={96} radius={16} icon="list" />
      <div>
        <div class="eyebrow">朋友分享的歌单</div>
        <h1>{data.name}</h1>
        <div class="muted">{data.tracks.length} 首 · 歌词会在你手机上重新获取</div>
      </div>
    </header>

    <button class="btn primary go" onclick={run} disabled={!!job}>
      {#if job}
        正在找歌词 {job.done}/{job.total}
      {:else}
        <Icon name="download" size={18} />导入到我的歌单
      {/if}
    </button>

    <ul class="rows">
      {#each data.tracks as t, i}
        <li>
          <span class="idx">{i + 1}</span>
          <div class="grow">
            <div class="title ellipsis">{t.title}</div>
            <div class="sub">{t.artist}{t.duration ? ` · ${fmt(t.duration)}` : ''}</div>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">读取中…</p>
  {/if}
</div>

<style>
  .hero {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  .eyebrow {
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.04em;
  }
  h1 {
    margin: 2px 0 4px;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .go {
    width: 100%;
    height: 50px;
    margin: 20px 0 8px;
  }
  .idx {
    width: 24px;
    text-align: right;
    color: var(--faint);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
</style>
