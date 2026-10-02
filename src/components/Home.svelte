<script>
  import { lib, createPlaylist, deletePlaylist, exportLibrary, importLibrary } from '../lib/store.svelte.js';

  let name = $state('');
  let message = $state('');

  const standalone =
    typeof navigator !== 'undefined' &&
    (navigator.standalone || matchMedia('(display-mode: standalone)').matches);

  function create(e) {
    e.preventDefault();
    const id = createPlaylist(name);
    name = '';
    location.hash = `#/p/${id}`;
  }

  function remove(p) {
    if (confirm(`删除歌单「${p.name}」？`)) deletePlaylist(p.id);
  }

  async function doExport() {
    const json = exportLibrary();
    const file = new File([json], `lyrics-live-${new Date().toISOString().slice(0, 10)}.json`, {
      type: 'application/json',
    });
    // iOS: share sheet lets you save to Files; elsewhere fall back to a download.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      importLibrary(await file.text());
      message = '已导入';
    } catch (err) {
      message = err.message;
    }
  }
</script>

<div class="page">
  <div class="topbar"><h1>Lyrics Live</h1></div>

  {#if lib.playlists.length}
    <ul class="list">
      {#each lib.playlists as p (p.id)}
        <li>
          <a class="grow" href="#/p/{p.id}">
            <div class="title">{p.name}</div>
            <div class="muted">{p.songIds.length} 首</div>
          </a>
          <button class="small ghost" onclick={() => remove(p)} aria-label="删除">✕</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">还没有歌单。按演唱会建一个，把 setlist 加进去，进场前打开一次，歌词就缓存在本地了。</p>
  {/if}

  <form class="row section" onsubmit={create}>
    <input bind:value={name} placeholder="新歌单名，比如 Coldplay 上海 D2" />
    <button class="primary" type="submit">新建</button>
  </form>

  {#if !standalone}
    <div class="section tip muted">
      在 Safari 里点「分享 → 添加到主屏幕」，之后就能全屏、离线使用了。场馆里通常没信号。
    </div>
  {/if}

  <div class="section">
    <h2>备份</h2>
    <div class="row">
      <button onclick={doExport}>导出</button>
      <label class="file">
        导入
        <input type="file" accept="application/json,.json" onchange={doImport} />
      </label>
      {#if message}<span class="muted">{message}</span>{/if}
    </div>
  </div>
</div>

<style>
  a {
    color: inherit;
    text-decoration: none;
  }
  .tip {
    border: 1px dashed var(--line);
    border-radius: 12px;
    padding: 12px;
  }
  .file {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 14px;
    cursor: pointer;
  }
  .file input {
    display: none;
  }
</style>
