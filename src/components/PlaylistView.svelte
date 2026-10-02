<script>
  import { lib, playlistById, renamePlaylist, deletePlaylist, moveSong, removeSong } from '../lib/store.svelte.js';
  import { coverStyle } from '../lib/color.js';
  import AddSongs from './AddSongs.svelte';
  import Icon from './Icon.svelte';

  let { id } = $props();

  const playlist = $derived(playlistById(id));
  const songs = $derived(playlist ? playlist.songIds.map((sid) => lib.songs[sid]).filter(Boolean) : []);
  const totalMin = $derived(Math.round(songs.reduce((a, s) => a + (s.duration || 0), 0) / 60));

  let editing = $state(false);

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

    {#if editing}
      <button class="btn danger delete" onclick={remove}><Icon name="trash" size={18} />删除这个歌单</button>
    {:else}
      <AddSongs pid={id} />
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
  .delete {
    width: 100%;
    margin-top: 32px;
    background: color-mix(in srgb, var(--danger) 14%, transparent);
  }
</style>
