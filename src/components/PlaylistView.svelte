<script>
  import { tick } from 'svelte';
  import {
    lib,
    playlistById,
    renamePlaylist,
    deletePlaylist,
    moveSong,
    removeSong,
    addSong,
    dropMissing,
  } from '../lib/store.svelte.js';
  import { findTrack, cleanTitle } from '../lib/lrclib.js';
  import { fillPreset } from '../lib/importer.js';
  import { coverStyle } from '../lib/color.js';
  import { presets } from '../presets.js';
  import AddSongs from './AddSongs.svelte';
  import Icon from './Icon.svelte';

  let { id } = $props();

  const playlist = $derived(playlistById(id));
  const songs = $derived(playlist ? playlist.songIds.map((sid) => lib.songs[sid]).filter(Boolean) : []);
  const totalMin = $derived(Math.round(songs.reduce((a, s) => a + (s.duration || 0), 0) / 60));

  const missing = $derived(playlist?.missing ?? []);
  const preset = $derived(playlist?.presetId && presets.find((x) => x.id === playlist.presetId));
  // Older imports didn't record misses; offer to re-check against the preset.
  const presetGap = $derived(preset ? preset.tracks.length - songs.length - missing.length : 0);

  let editing = $state(false);
  let retrying = $state(new Set());
  let filling = $state(null); // { done, total }
  let target = $state(null); // search pre-fill for AddSongs: { query, at, missingIndex }
  let addEl = $state();

  async function retry(i) {
    const m = missing[i];
    retrying = new Set(retrying).add(m.title);
    try {
      const hit = await findTrack(m);
      if (hit) {
        addSong(id, hit, m.at);
        dropMissing(id, i);
      } else {
        alert(`还是没找到「${m.title}」，试试手动搜，或者导入 LRC`);
      }
    } catch (err) {
      alert(`搜索失败：${err.message}`);
    } finally {
      const next = new Set(retrying);
      next.delete(m.title);
      retrying = next;
    }
  }

  async function searchFor(i) {
    const m = missing[i];
    target = { query: m.query ?? `${m.artist ?? ''} ${cleanTitle(m.title)}`.trim(), at: m.at, missingIndex: i };
    await tick();
    addEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function fill() {
    filling = { done: 0, total: preset.tracks.length };
    await fillPreset(id, preset.tracks, (done) => (filling.done = done));
    filling = null;
  }

  function rename() {
    const name = prompt('歌单名', playlist.name);
    if (name) renamePlaylist(id, name);
  }

  function remove() {
    if (!confirm(`删除歌单「${playlist.name}」？`)) return;
    deletePlaylist(id);
    location.hash = '#/';
  }

  function fmt(sec) {
    if (!sec) return '';
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

<div class="page">
  {#if !playlist}
    <div class="nav"><a class="icon-btn" href="#/" aria-label="返回"><Icon name="back" /></a></div>
    <p class="muted">歌单不存在。</p>
  {:else}
    <div class="nav">
      <a class="icon-btn" href="#/" aria-label="返回"><Icon name="back" /></a>
      {#if songs.length}
        <button class="btn small" class:primary={editing} onclick={() => (editing = !editing)}>
          {editing ? '完成' : '编辑'}
        </button>
      {/if}
    </div>

    <header class="hero">
      <div class="cover big" style={coverStyle(playlist.name)}><Icon name="music" size={44} /></div>
      <div class="hero-text">
        {#if editing}
          <button class="name editable" onclick={rename}>{playlist.name}</button>
        {:else}
          <h1 class="name">{playlist.name}</h1>
        {/if}
        <div class="muted">{songs.length} 首{totalMin ? ` · 约 ${totalMin} 分钟` : ''}</div>
      </div>
    </header>

    {#if songs.length && !editing}
      <a class="btn primary play" href="#/play/{id}/0"><Icon name="play" size={18} />从第一首开始</a>
    {/if}

    {#if songs.length}
      <ul class="rows songs" style="--rule-inset: 40px">
        {#each songs as song, i (i + song.id)}
          <li>
            <span class="idx">{i + 1}</span>
            {#if editing}
              <div class="grow">
                <div class="title ellipsis">{song.title}</div>
                <div class="sub ellipsis">{song.artist}</div>
              </div>
              <button class="icon-btn" disabled={i === 0} onclick={() => moveSong(id, i, -1)} aria-label="上移"><Icon name="up" size={20} /></button>
              <button class="icon-btn" disabled={i === songs.length - 1} onclick={() => moveSong(id, i, 1)} aria-label="下移"><Icon name="down" size={20} /></button>
              <button class="icon-btn danger" onclick={() => removeSong(id, i)} aria-label="移除"><Icon name="x" size={20} /></button>
            {:else}
              <a class="grow" href="#/play/{id}/{i}">
                <div class="title ellipsis">{song.title}</div>
                <div class="sub">
                  <span class="ellipsis">{song.artist}</span>
                  {#if song.duration}<span class="dot">·</span><span>{fmt(song.duration)}</span>{/if}
                  {#if !song.synced}<span class="tag warn">估算</span>{/if}
                </div>
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted empty">还是空的。下面搜歌，或者把整场 setlist 一次粘进来。</p>
    {/if}

    {#if !editing && (missing.length || presetGap > 0)}
      <section class="missing card">
        <div class="missing-head">
          <span>没找到的歌</span>
          {#if presetGap > 0 && !missing.length}
            <span class="muted">比预设少 {presetGap} 首</span>
          {/if}
        </div>
        {#if presetGap > 0}
          <button class="btn small fill" onclick={fill} disabled={!!filling}>
            {#if filling}正在核对 {filling.done}/{filling.total}{:else}<Icon name="sparkle" size={16} />对照预设补全{/if}
          </button>
        {/if}
        <ul class="rows">
          {#each missing as m, i (m.title + m.at)}
            <li>
              <div class="grow">
                <div class="title ellipsis">{m.title}</div>
                <div class="sub">{m.artist ?? ''}{m.at != null ? ` · 第 ${m.at + 1} 首` : ''}</div>
              </div>
              <button class="icon-btn" onclick={() => retry(i)} disabled={retrying.has(m.title)} aria-label="重试">
                {#if retrying.has(m.title)}<span class="spinner"></span>{:else}<Icon name="rewind" size={19} />{/if}
              </button>
              <button class="icon-btn" onclick={() => searchFor(i)} aria-label="手动搜"><Icon name="search" size={19} /></button>
              <button class="icon-btn" onclick={() => dropMissing(id, i)} aria-label="不要了"><Icon name="x" size={19} /></button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if editing}
      <button class="btn danger delete" onclick={remove}><Icon name="trash" size={18} />删除这个歌单</button>
    {:else}
      <div bind:this={addEl}>
        <AddSongs
          pid={id}
          {target}
          onTargetDone={(added) => {
            if (added && target) dropMissing(id, target.missingIndex);
            target = null;
          }}
        />
      </div>
    {/if}
  {/if}
</div>

<style>
  .hero {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin-top: 4px;
  }
  .cover.big {
    width: 112px;
    height: 112px;
    border-radius: 18px;
    box-shadow:
      0 18px 40px -12px rgba(0, 0, 0, 0.7),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.15);
  }
  .hero-text {
    min-width: 0;
    padding-bottom: 4px;
  }
  .name {
    display: block;
    margin: 0 0 4px;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
    text-align: left;
    white-space: normal;
    word-break: break-word;
  }
  .name.editable {
    text-decoration: underline dashed var(--faint);
    text-underline-offset: 6px;
  }

  .play {
    width: 100%;
    height: 50px;
    margin-top: 20px;
    font-size: 16px;
  }

  .songs {
    margin-top: 12px;
  }
  .idx {
    width: 24px;
    flex: none;
    text-align: right;
    color: var(--faint);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .dot {
    color: var(--faint);
  }
  .icon-btn.danger {
    color: var(--danger);
  }
  .empty {
    margin-top: 24px;
  }
  .missing {
    margin-top: 24px;
    padding: 14px 14px 4px;
    border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
    background: color-mix(in srgb, var(--warn) 6%, transparent);
  }
  .missing-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: 700;
    color: var(--warn);
  }
  .fill {
    margin: 10px 0 4px;
  }
  .spinner {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--faint);
    border-top-color: var(--fg);
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .delete {
    width: 100%;
    margin-top: 32px;
    background: color-mix(in srgb, var(--danger) 14%, transparent);
  }
</style>
