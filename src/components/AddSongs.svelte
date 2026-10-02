<script>
  import { addSong } from '../lib/store.svelte.js';
  import { searchLyrics, setlistLineToQuery } from '../lib/lrclib.js';
  import { importTracks } from '../lib/importer.js';
  import { parseLrc } from '../lib/lrc.js';

  let { pid } = $props();

  let tab = $state('search');

  // search
  let query = $state('');
  let results = $state([]);
  let searching = $state(false);
  let searchError = $state('');
  let added = $state(new Set());
  let controller;

  async function search(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    controller?.abort();
    controller = new AbortController();
    searching = true;
    searchError = '';
    try {
      results = await searchLyrics(query.trim(), { signal: controller.signal });
      if (!results.length) searchError = '没找到';
    } catch (err) {
      if (err.name !== 'AbortError') searchError = `搜索失败：${err.message}`;
    } finally {
      searching = false;
    }
  }

  function add(r) {
    addSong(pid, r);
    added = new Set(added).add(r.lrclibId);
  }

  // batch
  let artist = $state('');
  let setlist = $state('');
  let batch = $state(null); // { done, total, failed: [] }

  async function runBatch() {
    const lines = setlist.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    batch = { done: 0, total: lines.length, failed: [] };
    const tracks = lines.map((line) => ({ line, query: setlistLineToQuery(line, artist.trim()) }));
    const failed = await importTracks(pid, tracks, (done) => (batch.done = done));
    batch.failed = failed.map((t) => t.line);
    setlist = batch.failed.join('\n');
  }

  // manual
  let mTitle = $state('');
  let mArtist = $state('');
  let mLyrics = $state('');
  let mError = $state('');

  async function loadFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    mLyrics = await file.text();
    const { meta } = parseLrc(mLyrics);
    if (!mTitle) mTitle = meta.ti ?? file.name.replace(/\.lrc$/i, '');
    if (!mArtist && meta.ar) mArtist = meta.ar;
  }

  function addManual(e) {
    e.preventDefault();
    if (!mTitle.trim() || !mLyrics.trim()) {
      mError = '标题和歌词都要填';
      return;
    }
    const synced = parseLrc(mLyrics).lines.length > 0;
    addSong(pid, {
      title: mTitle.trim(),
      artist: mArtist.trim(),
      lyrics: mLyrics,
      synced,
      duration: null,
      source: 'manual',
    });
    mTitle = mArtist = mLyrics = mError = '';
  }

  function fmt(sec) {
    const s = Math.round(sec || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

<div class="section">
  <div class="tabs">
    <button class:on={tab === 'search'} onclick={() => (tab = 'search')}>搜索</button>
    <button class:on={tab === 'batch'} onclick={() => (tab = 'batch')}>批量 setlist</button>
    <button class:on={tab === 'manual'} onclick={() => (tab = 'manual')}>导入 LRC</button>
  </div>

  {#if tab === 'search'}
    <form class="row" onsubmit={search}>
      <input bind:value={query} placeholder="歌名 + 歌手，比如 yellow coldplay" enterkeyhint="search" />
      <button class="primary" type="submit" disabled={searching}>{searching ? '…' : '搜'}</button>
    </form>
    {#if searchError}<p class="error">{searchError}</p>{/if}
    {#if results.length}
      <ul class="list results">
        {#each results as r (r.lrclibId)}
          <li>
            <div class="grow">
              <div class="title">{r.title}</div>
              <div class="muted row">
                <span class="title">{r.artist}{r.album ? ` · ${r.album}` : ''}</span>
                <span>{fmt(r.duration)}</span>
                {#if r.synced}<span class="badge ok">同步</span>{:else}<span class="badge warn">无时间轴</span>{/if}
              </div>
            </div>
            <button class="small" disabled={added.has(r.lrclibId)} onclick={() => add(r)}>
              {added.has(r.lrclibId) ? '已加' : '＋'}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if tab === 'batch'}
    <p class="muted">每行一首，比如从 setlist.fm 复制过来。会自动选第一个带时间轴的结果，之后可以在列表里删掉选错的。</p>
    <input bind:value={artist} placeholder="歌手（可选，会加到每行的搜索里）" />
    <textarea bind:value={setlist} rows="8" placeholder={'Yellow\nViva la Vida\nFix You'}></textarea>
    <div class="row">
      <button class="primary" onclick={runBatch} disabled={batch && batch.done < batch.total}>批量添加</button>
      {#if batch}
        <span class="muted">
          {batch.done}/{batch.total}
          {#if batch.done === batch.total && batch.failed.length}· {batch.failed.length} 首没找到，留在输入框里了{/if}
        </span>
      {/if}
    </div>
  {:else}
    <form class="manual" onsubmit={addManual}>
      <div class="row">
        <input bind:value={mTitle} placeholder="歌名" />
        <input bind:value={mArtist} placeholder="歌手" />
      </div>
      <textarea bind:value={mLyrics} rows="8" placeholder="粘贴 LRC（[00:12.34]歌词）或纯文本歌词"></textarea>
      <div class="row">
        <label class="file">选 .lrc 文件<input type="file" accept=".lrc,.txt,text/plain" onchange={loadFile} /></label>
        <button class="primary" type="submit">添加</button>
      </div>
      {#if mError}<p class="error">{mError}</p>{/if}
    </form>
  {/if}
</div>

<style>
  .section > :global(* + *) {
    margin-top: 10px;
  }
  .tabs {
    display: flex;
    gap: 6px;
  }
  .tabs button {
    flex: 1;
    padding: 8px;
    font-size: 14px;
    color: var(--dim);
  }
  .tabs button.on {
    color: var(--fg);
    border-color: var(--accent);
  }
  .manual > :global(* + *) {
    margin-top: 10px;
  }
  .file {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 14px;
    cursor: pointer;
    white-space: nowrap;
  }
  .file input {
    display: none;
  }
</style>
