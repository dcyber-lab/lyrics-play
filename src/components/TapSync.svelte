<script>
  // 打轴: play the original song elsewhere (Spotify, Apple Music), tap once
  // as each line starts, and get a real synced LRC out of it.
  import { lib, playlistById, setSongLyrics } from '../lib/store.svelte.js';
  import { songTimeline } from '../lib/lrc.js';
  import Icon from './Icon.svelte';

  let { pid, index } = $props();

  // People tap a beat after they hear the line start.
  const LEAD = 0.25;
  // If the user never marked "music started", put the first line here.
  const DEFAULT_INTRO = 8;

  const playlist = $derived(playlistById(pid));
  const song = $derived(playlist && lib.songs[playlist.songIds[index]]);
  const texts = $derived(song ? songTimeline(song).lines.map((l) => l.text).filter(Boolean) : []);

  let t0 = $state(null); // ms timestamp of "music started"
  let marks = $state([]); // seconds since t0, one per line
  let listEl = $state();
  const k = $derived(marks.length); // next line to mark
  const done = $derived(texts.length > 0 && k >= texts.length);

  $effect(() => {
    const el = listEl?.children[Math.min(k, texts.length - 1)];
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  function startMusic() {
    t0 = Date.now();
    marks = [];
  }

  function mark() {
    if (done) return;
    const now = Date.now();
    if (t0 == null) t0 = now - DEFAULT_INTRO * 1000; // skipped the start button
    marks = [...marks, Math.max(0, (now - t0) / 1000 - LEAD)];
    navigator.vibrate?.(8);
  }

  function undo() {
    marks = marks.slice(0, -1);
  }

  function restart() {
    t0 = null;
    marks = [];
  }

  const stamp = (s) => {
    const cs = Math.round(s * 100);
    return `[${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}]`;
  };

  function save() {
    const lrc = [
      song.title && `[ti:${song.title}]`,
      song.artist && `[ar:${song.artist}]`,
      ...texts.map((t, i) => `${stamp(marks[i])}${t}`),
    ]
      .filter(Boolean)
      .join('\n');
    setSongLyrics(song.id, lrc);
    location.replace(`#/play/${pid}/${index}`);
  }

  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') mark();
    else if (e.key === 'Backspace') undo();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="tap">
  <header>
    <a class="icon-btn" href="#/p/{pid}" aria-label="返回"><Icon name="back" /></a>
    <div class="meta">
      <div class="title ellipsis">打轴 · {song?.title ?? ''}</div>
      <div class="sub">{Math.min(k, texts.length)} / {texts.length} 句</div>
    </div>
    <button class="icon-btn" onclick={undo} disabled={!k} aria-label="撤销上一句"><Icon name="rewind" size={20} /></button>
  </header>

  {#if !song}
    <p class="muted pad">找不到这首歌。</p>
  {:else if !texts.length}
    <p class="muted pad">这首歌没有歌词文本，先去导入一份。</p>
  {:else}
    {#if t0 == null && !k}
      <div class="howto">
        <b>怎么打轴</b>
        <ol>
          <li>在 Spotify / Apple Music 里把这首歌<b>暂停在开头</b>，回到这里</li>
          <li>用控制中心播放音乐，同时点「音乐开始了」（不准也没关系，可以跳过）</li>
          <li>每句歌词<b>开口唱的那一刻</b>，点一下下面的大按钮</li>
        </ol>
      </div>
    {/if}

    <ol class="lines" bind:this={listEl}>
      {#each texts as text, i}
        <li class:done={i < k} class:next={i === k} class:soon={i === k + 1}>
          {#if i < k}<span class="ts">{stamp(marks[i]).slice(1, -1)}</span>{/if}
          {text}
        </li>
      {/each}
    </ol>

    <footer>
      {#if done}
        <div class="row">
          <button class="btn" onclick={restart}>重来</button>
          <button class="btn primary grow" onclick={save}><Icon name="check" size={18} />保存时间轴</button>
        </div>
      {:else}
        {#if t0 == null && !k}
          <button class="btn start" onclick={startMusic}><Icon name="play" size={16} />音乐开始了</button>
        {:else if t0 != null && !k}
          <div class="running"><span class="pulse"></span>计时中，等第一句开口</div>
        {/if}
        <button class="hit" onclick={mark}>
          <span class="hit-label">{k === 0 ? '第一句开始' : '下一句开始'}</span>
          <span class="hit-line ellipsis">{texts[k]}</span>
        </button>
      {/if}
    </footer>
  {/if}
</div>

<style>
  .tap {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    -webkit-user-select: none;
    user-select: none;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: calc(var(--safe-top) + 8px) 10px 8px;
    border-bottom: 0.5px solid var(--border);
  }
  .meta {
    flex: 1;
    min-width: 0;
    text-align: center;
  }
  .meta .title {
    font-weight: 700;
  }
  .meta .sub {
    font-size: 13px;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .pad {
    padding: 24px 16px;
  }
  .howto {
    margin: 12px 16px 0;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    font-size: 14px;
    line-height: 1.5;
    color: var(--dim);
  }
  .howto b {
    color: var(--fg);
  }
  .howto ol {
    margin: 6px 0 0;
    padding-left: 20px;
  }

  .lines {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0 20px;
    list-style: none;
  }
  /* spacers, not padding: padding would stop the list from shrinking and
     push the tap button off screen */
  .lines::before,
  .lines::after {
    content: '';
    display: block;
    height: 18vh;
  }
  .lines li {
    padding: 8px 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--faint);
    transition: color 0.2s;
  }
  .lines li.done {
    color: rgba(235, 235, 245, 0.45);
    font-weight: 500;
    font-size: 17px;
  }
  .lines li.next {
    color: var(--fg);
    font-size: 26px;
  }
  .lines li.soon {
    color: var(--dim);
  }
  .ts {
    display: inline-block;
    min-width: 64px;
    margin-right: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ok);
    font-variant-numeric: tabular-nums;
  }

  footer {
    padding: 12px 12px calc(var(--safe-bottom) + 12px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 0.5px solid var(--border);
  }
  .row {
    display: flex;
    gap: 10px;
  }
  .grow {
    flex: 1;
  }
  .start {
    align-self: center;
  }
  .running {
    align-self: center;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--dim);
  }
  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
  }
  .hit {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34vh;
    min-height: 160px;
    padding: 0 20px;
    border-radius: 28px;
    background: var(--accent);
    color: #fff;
    transition: transform 0.08s;
  }
  .hit:active {
    transform: scale(0.97);
    background: color-mix(in srgb, var(--accent) 85%, #000);
  }
  .hit-label {
    font-size: 22px;
    font-weight: 800;
  }
  .hit-line {
    max-width: 100%;
    font-size: 15px;
    opacity: 0.85;
  }
</style>
