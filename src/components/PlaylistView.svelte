<script>
  import { lib, playlistById, renamePlaylist, moveSong, removeSong } from '../lib/store.svelte.js';
  import AddSongs from './AddSongs.svelte';

  let { id } = $props();

  const playlist = $derived(playlistById(id));
  const songs = $derived(playlist ? playlist.songIds.map((sid) => lib.songs[sid]).filter(Boolean) : []);

  function rename() {
    const name = prompt('歌单名', playlist.name);
    if (name) renamePlaylist(id, name);
  }

  function fmt(sec) {
    if (!sec) return '';
    const s = Math.round(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

<div class="page">
  {#if !playlist}
    <p class="muted">歌单不存在。<a href="#/">返回</a></p>
  {:else}
    <div class="topbar">
      <a href="#/" class="back" aria-label="返回">‹</a>
      <h1><button class="name" onclick={rename}>{playlist.name}</button></h1>
      <a href="#/play/{id}/0" class="play" class:disabled={!songs.length}>▶ 开始</a>
    </div>

    {#if songs.length}
      <ul class="list">
        {#each songs as song, i (i + song.id)}
          <li>
            <span class="idx muted">{i + 1}</span>
            <a class="grow" href="#/play/{id}/{i}">
              <div class="title">{song.title}</div>
              <div class="muted row">
                <span class="title">{song.artist}</span>
                {#if song.duration}<span>{fmt(song.duration)}</span>{/if}
                {#if song.synced}
                  <span class="badge ok">同步</span>
                {:else}
                  <span class="badge warn">估算</span>
                {/if}
              </div>
            </a>
            <button class="small ghost" disabled={i === 0} onclick={() => moveSong(id, i, -1)} aria-label="上移">↑</button>
            <button class="small ghost" disabled={i === songs.length - 1} onclick={() => moveSong(id, i, 1)} aria-label="下移">↓</button>
            <button class="small ghost" onclick={() => removeSong(id, i)} aria-label="移除">✕</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">空歌单。下面搜歌，或者把整场 setlist 粘贴进来批量添加。</p>
    {/if}

    <AddSongs pid={id} />
  {/if}
</div>

<style>
  a {
    color: inherit;
    text-decoration: none;
  }
  .back {
    font-size: 32px;
    line-height: 1;
    padding: 0 8px 4px 0;
  }
  .play {
    background: var(--accent);
    color: #fff;
    border-radius: 12px;
    padding: 8px 14px;
    font-weight: 600;
    white-space: nowrap;
  }
  .play.disabled {
    opacity: 0.4;
    pointer-events: none;
  }
  .name {
    all: unset;
    cursor: pointer;
  }
  .idx {
    width: 1.5em;
    text-align: right;
  }
</style>
