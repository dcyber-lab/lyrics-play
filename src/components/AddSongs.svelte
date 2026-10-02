<script>
  import { untrack } from 'svelte';
  import { addSong } from '../lib/store.svelte.js';
  import { searchByFields, setlistLineToQuery } from '../lib/lrclib.js';
  import { importTracks } from '../lib/importer.js';
  import { parseLrc } from '../lib/lrc.js';
  import Icon from './Icon.svelte';

  // target: optional { title, artist, at } pre-fill from a missing track; the next
  // song added from search goes into slot `at` and onTargetDone(true) fires;
  // cancelling fires onTargetDone(false).
  let { pid, target = null, onTargetDone = () => {} } = $props();

  const TABS = [
    ['search', '搜索'],
    ['batch', '批量'],
    ['manual', 'LRC'],
  ];
  let tab = $state('search');

  // search — artist is remembered across searches (usually one act per show)
  const ARTIST_KEY = 'lyrics-live:artist';
  const readArtist = () => {
    try {
      return localStorage.getItem(ARTIST_KEY) ?? '';
    } catch {
      return '';
    }
  };
  let qTitle = $state('');
  let qArtist = $state(readArtist());
  let results = $state([]);
  let searching = $state(false);
  let searchError = $state('');
  let added = $state(new Set());
  let controller;

  async function search(e) {
    e?.preventDefault();
    if (!qTitle.trim() && !qArtist.trim()) return;
    try {
      localStorage.setItem(ARTIST_KEY, qArtist.trim());
    } catch {}
    controller?.abort();
    controller = new AbortController();
    searching = true;
    searchError = '';
    try {
      results = await searchByFields({ title: qTitle, artist: qArtist }, { signal: controller.signal });
      if (!results.length) searchError = '没找到。检查一下拼写，或者先把歌手清空再搜';
    } catch (err) {
      if (err.name !== 'AbortError') searchError = `搜索失败：${err.message}`;
    } finally {
      searching = false;
    }
  }

  $effect(() => {
    const t = target;
    if (!t) return;
    untrack(() => {
      tab = 'search';
      qTitle = t.title ?? '';
      qArtist = t.artist ?? '';
      search();
    });
  });

  function add(r) {
    if (target) {
      addSong(pid, r, target.at);
      onTargetDone(true);
    } else {
      addSong(pid, r);
    }
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
    const tracks = lines.map((line) => ({ title: line, query: setlistLineToQuery(line, artist.trim()) }));
    const failed = await importTracks(pid, tracks, (done) => (batch.done = done));
    batch.failed = failed.map((t) => t.title);
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
      mError = '歌名和歌词都要填';
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

<section class="section">
  <h2 class="section-title">添加歌曲</h2>
  {#if target}
    <div class="target">
      <span>给第 {target.at + 1} 首找歌词</span>
      <button class="btn small" onclick={() => onTargetDone(false)}>取消</button>
    </div>
  {/if}

  <div class="segmented" role="tablist">
    {#each TABS as [key, label]}
      <button role="tab" aria-selected={tab === key} class:on={tab === key} onclick={() => (tab = key)}>{label}</button>
    {/each}
  </div>

  <div class="panel">
    {#if tab === 'search'}
      <form class="fields" onsubmit={search}>
        <label class="field">
          <Icon name="music" size={17} />
          <input bind:value={qTitle} placeholder="歌名" enterkeyhint="search" type="search" autocomplete="off" />
        </label>
        <label class="field">
          <Icon name="user" size={17} />
          <input bind:value={qArtist} placeholder="歌手（可选）" enterkeyhint="search" type="search" autocomplete="off" />
          {#if qArtist}
            <button type="button" class="clear" onclick={() => (qArtist = '')} aria-label="清空歌手"><Icon name="x" size={14} /></button>
          {/if}
        </label>
        <button class="btn primary" type="submit" disabled={searching || (!qTitle.trim() && !qArtist.trim())}>
          {#if searching}<span class="spinner"></span>{:else}<Icon name="search" size={18} />{/if}搜索
        </button>
      </form>
      {#if searchError}<p class="error">{searchError}</p>{/if}
      {#if results.length}
        <ul class="rows">
          {#each results as r (r.lrclibId)}
            {@const isAdded = added.has(r.lrclibId)}
            <li>
              <div class="grow">
                <div class="title ellipsis">{r.title}</div>
                <div class="sub">
                  <span class="ellipsis">{r.artist}{r.album ? ` · ${r.album}` : ''}</span>
                  <span>{fmt(r.duration)}</span>
                  {#if !r.synced}<span class="tag warn">无时间轴</span>{/if}
                </div>
              </div>
              <button class="icon-btn add" class:done={isAdded} disabled={isAdded} onclick={() => add(r)} aria-label="添加">
                <Icon name={isAdded ? 'check' : 'plus'} size={20} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if tab === 'batch'}
      <p class="muted hint">每行一首，比如从 setlist.fm 复制过来。自动挑带时间轴的版本，选错了在上面的列表里删掉就行。</p>
      <input bind:value={artist} placeholder="歌手（可选，会加到每一行）" />
      <textarea bind:value={setlist} rows="7" placeholder={'Starboy\nBlinding Lights\nSave Your Tears'}></textarea>
      <div class="actions">
        {#if batch}
          <span class="muted">
            {batch.done}/{batch.total}
            {#if batch.done === batch.total && batch.failed.length}· {batch.failed.length} 首没找到，留在框里了{/if}
          </span>
        {/if}
        <button class="btn primary" onclick={runBatch} disabled={!setlist.trim() || (batch && batch.done < batch.total)}>
          <Icon name="list" size={18} />批量添加
        </button>
      </div>
    {:else}
      <form class="stack" onsubmit={addManual}>
        <div class="two">
          <input bind:value={mTitle} placeholder="歌名" />
          <input bind:value={mArtist} placeholder="歌手" />
        </div>
        <textarea bind:value={mLyrics} rows="7" placeholder="粘贴 LRC（[00:12.34] 歌词）或纯文本歌词"></textarea>
        {#if mError}<p class="error">{mError}</p>{/if}
        <div class="actions">
          <label class="btn">
            <Icon name="file" size={18} />选 .lrc 文件
            <input type="file" accept=".lrc,.txt,text/plain" onchange={loadFile} hidden />
          </label>
          <button class="btn primary" type="submit"><Icon name="plus" size={18} />添加</button>
        </div>
      </form>
    {/if}
  </div>
</section>

<style>
  .target {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    padding: 8px 8px 8px 14px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
  }
  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 3px;
    border-radius: 12px;
    background: var(--surface);
  }
  .segmented button {
    height: 34px;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 600;
    color: var(--dim);
    transition:
      background 0.2s,
      color 0.2s;
  }
  .segmented button.on {
    background: var(--surface-press);
    color: var(--fg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .panel {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .two {
    display: flex;
    gap: 10px;
  }
  .hint {
    margin: 0;
    line-height: 1.5;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .actions .muted {
    margin-right: auto;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border-radius: 12px;
    background: var(--surface);
    color: var(--faint);
    border: 1px solid transparent;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .field:focus-within {
    background: var(--surface-2);
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    color: var(--dim);
  }
  .field input {
    flex: 1;
    min-width: 0;
    padding: 12px 0;
    background: none;
    border: 0;
  }
  .field input:focus {
    background: none;
    border: 0;
  }
  .field input::-webkit-search-cancel-button {
    display: none;
  }
  .clear {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface-press);
    color: var(--fg);
  }
  .fields .btn {
    width: 100%;
  }
  .fields .spinner {
    border-color: rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
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

  .add {
    background: var(--accent-soft);
    color: var(--accent);
    width: 34px;
    height: 34px;
  }
  .add.done {
    background: color-mix(in srgb, var(--ok) 16%, transparent);
    color: var(--ok);
    opacity: 1;
  }
</style>
