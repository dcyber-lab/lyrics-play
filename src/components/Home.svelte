<script>
  import { tick, onMount } from 'svelte';
  import { lib, createPlaylist, exportLibrary, importLibrary, playlistById } from '../lib/store.svelte.js';
  import { importTracks } from '../lib/importer.js';
  import { coverStyle } from '../lib/color.js';
  import { ensureArt, ensureArtistPhotos, artistPhoto } from '../lib/artwork.js';
  import PlaylistCover from './PlaylistCover.svelte';
  import { presets } from '../presets.js';
  import Icon from './Icon.svelte';

  onMount(() => {
    ensureArtistPhotos(presets.map((p) => p.artist).filter(Boolean));
  });

  let creating = $state(false);
  let name = $state('');
  let nameInput = $state();
  let message = $state('');

  const standalone =
    typeof navigator !== 'undefined' &&
    (navigator.standalone || matchMedia('(display-mode: standalone)').matches);

  async function startCreate() {
    creating = true;
    await tick();
    nameInput?.focus();
  }

  function create(e) {
    e.preventDefault();
    const id = createPlaylist(name);
    name = '';
    creating = false;
    location.hash = `#/p/${id}`;
  }

  // presetId -> { done, total } while importing, { failed } after
  let presetJobs = $state({});

  async function importPreset(preset) {
    const pid = createPlaylist(preset.name, { presetId: preset.id });
    presetJobs[preset.id] = { done: 0, total: preset.tracks.length };
    const failed = await importTracks(pid, preset.tracks, (done) => (presetJobs[preset.id].done = done));
    presetJobs[preset.id] = { failed: failed.map((t) => t.title) };
    ensureArt(playlistById(pid)?.songIds ?? []);
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
  <header class="hero">
    <div class="eyebrow">Lyrics Live</div>
    <h1>今晚听什么</h1>
  </header>

  <section class="section">
    <div class="head">
      <h2 class="section-title">我的歌单</h2>
      {#if !creating}
        <button class="btn small" onclick={startCreate}><Icon name="plus" size={16} />新建</button>
      {/if}
    </div>

    {#if creating}
      <form class="create" onsubmit={create}>
        <input bind:this={nameInput} bind:value={name} placeholder="歌单名，比如 Coldplay 上海 D2" enterkeyhint="done" />
        <button type="button" class="btn small" onclick={() => (creating = false)}>取消</button>
        <button type="submit" class="btn small primary">创建</button>
      </form>
    {/if}

    {#if lib.playlists.length}
      <ul class="rows" style="--rule-inset: 72px">
        {#each lib.playlists as p (p.id)}
          <li>
            <a class="grow row-link" href="#/p/{p.id}">
              <PlaylistCover playlist={p} size={56} />
              <span class="grow">
                <span class="title ellipsis">{p.name}</span>
                <span class="sub">{p.songIds.length} 首</span>
              </span>
              <span class="chev"><Icon name="chevron" size={18} /></span>
            </a>
          </li>
        {/each}
      </ul>
    {:else if !creating}
      <button class="empty card" onclick={startCreate}>
        <Icon name="plus" size={22} />
        <span>按场次建一个歌单，进场前打开一次，歌词就缓存在手机里了</span>
      </button>
    {/if}
  </section>

  <section class="section">
    <h2 class="section-title">预设</h2>
    <div class="presets">
      {#each presets as preset (preset.id)}
        {@const job = presetJobs[preset.id]}
        {@const existing = lib.playlists.find((p) => p.presetId === preset.id)}
        {@const photo = preset.artist && artistPhoto(preset.artist)}
        <div class="preset" style={coverStyle(preset.name)}>
          {#if photo}<img class="preset-bg" src={photo} alt="" />{/if}
          <div class="preset-top">
            <Icon name="sparkle" size={18} />
            <span>{preset.tracks.length} 首</span>
          </div>
          <div class="preset-name">{preset.name}</div>
          <div class="preset-foot">
            <span class="preset-status">
              {#if job?.total}
                正在找歌词 {job.done}/{job.total}
              {:else if job?.failed?.length}
                {job.failed.length} 首没找到：{job.failed.join('、')}
              {:else if existing}
                已在歌单里
              {:else}
                歌词从 LRCLIB 拉取
              {/if}
            </span>
            {#if job?.total}
              <span class="progress"><span style="width:{(job.done / job.total) * 100}%"></span></span>
            {:else if existing}
              <a class="btn small light" href="#/p/{existing.id}">打开</a>
            {:else}
              <button class="btn small light" onclick={() => importPreset(preset)}>导入</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>

  {#if !standalone}
    <section class="section tip card">
      <span class="tip-icon"><Icon name="share" size={20} /></span>
      <div>
        <div class="tip-title">添加到主屏幕</div>
        <div class="muted">Safari 里点「分享 → 添加到主屏幕」，全屏、离线都能用。场馆里通常没信号。</div>
      </div>
    </section>
  {/if}

  <section class="section footer">
    <button class="btn small" onclick={doExport}><Icon name="download" size={16} />导出备份</button>
    <label class="btn small">
      <Icon name="upload" size={16} />导入备份
      <input type="file" accept="application/json,.json" onchange={doImport} hidden />
    </label>
    {#if message}<span class="muted">{message}</span>{/if}
  </section>
</div>

<style>
  .hero {
    padding-top: 28px;
  }
  .eyebrow {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
  }
  h1 {
    margin: 4px 0 0;
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.025em;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .head .section-title {
    margin: 0;
  }

  .create {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 12px 0;
  }
  .create input {
    flex: 1;
  }

  .row-link {
    display: flex !important;
    align-items: center;
    gap: 14px;
  }
  .row-link .grow {
    display: block;
  }
  .row-link .title {
    display: block;
  }
  .chev {
    color: var(--faint);
  }

  .empty {
    display: flex;
    gap: 14px;
    align-items: center;
    width: 100%;
    padding: 18px;
    margin-top: 8px;
    text-align: left;
    white-space: normal;
    color: var(--dim);
    font-size: 14px;
    line-height: 1.45;
    border: 1px dashed rgba(255, 255, 255, 0.14);
    background: transparent;
  }

  .presets {
    display: grid;
    gap: 12px;
  }
  .preset {
    position: relative;
    overflow: hidden;
    border-radius: 20px;
    padding: 16px 16px 14px;
    min-height: 168px;
    display: flex;
    flex-direction: column;
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.15);
  }
  .preset-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 25%;
  }
  .preset::after {
    /* darken the bottom so text stays readable on any hue */
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.1) 20%, rgba(0, 0, 0, 0.7));
    pointer-events: none;
  }
  .preset > :not(.preset-bg) {
    position: relative;
    z-index: 1;
  }
  .preset-top {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
  }
  .preset-name {
    margin-top: auto;
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .preset-foot {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
  }
  .preset-status {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.75);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .btn.light {
    background: rgba(255, 255, 255, 0.92);
    color: #000;
  }
  .progress {
    width: 80px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.25);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: #fff;
    transition: width 0.2s;
  }

  .tip {
    display: flex;
    gap: 14px;
    padding: 16px;
    line-height: 1.45;
  }
  .tip-icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tip-title {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .footer {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .footer .btn {
    background: var(--surface);
    color: var(--dim);
    font-weight: 500;
  }
</style>
