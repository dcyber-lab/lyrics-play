<script>
  import { onMount } from 'svelte';
  import { lib, playlistById } from '../lib/store.svelte.js';
  import { songTimeline } from '../lib/lrc.js';
  import { SyncClock, activeIndex } from '../lib/clock.js';
  import { wakeLock } from '../lib/wakelock.svelte.js';

  let { pid, index } = $props();

  // You tap when you *hear* the line start, which is a beat late.
  const TAP_LEAD = 0.3;
  const NUDGE = 0.5;
  const MANUAL_SCROLL_HOLD = 3500;

  const playlist = $derived(playlistById(pid));
  const song = $derived(playlist && lib.songs[playlist.songIds[index]]);
  const next = $derived(playlist && lib.songs[playlist.songIds[index + 1]]);
  const timeline = $derived(song ? songTimeline(song) : { lines: [], synced: false });
  const lines = $derived(timeline.lines);
  const lastT = $derived(lines.at(-1)?.t ?? 0);

  const clock = new SyncClock();
  let pos = $state(0);
  let running = $state(false);
  let rate = $state(1);
  let locked = $state(false);
  let tuning = $state(false);
  let toast = $state('');
  let tapped = $state(-1);

  const active = $derived(activeIndex(lines, pos));
  const intro = $derived(lines.length && pos < lines[0].t ? Math.ceil(lines[0].t - pos) : 0);
  const ended = $derived(lines.length > 0 && pos > lastT + 6);

  let scroller = $state();
  let lineEls = $state([]);
  let manual = $state(false);
  let manualTimer;
  let toastTimer;

  function sync() {
    pos = clock.position;
    running = clock.running;
    rate = clock.rate;
  }

  onMount(() => {
    const t = setInterval(sync, 100);
    centerOn(0, false);
    return () => {
      clearInterval(t);
      clearTimeout(manualTimer);
      clearTimeout(toastTimer);
    };
  });

  function centerOn(i, smooth = true) {
    const el = lineEls[Math.max(i, 0)];
    if (!el || !scroller) return;
    const top = el.offsetTop - scroller.clientHeight * 0.38 + el.offsetHeight / 2;
    scroller.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }

  // Follow the active line unless the user is scrolling to find one.
  $effect(() => {
    const i = active;
    if (!manual) centerOn(i);
  });

  function holdScroll() {
    manual = true;
    clearTimeout(manualTimer);
  }
  function releaseScroll() {
    clearTimeout(manualTimer);
    manualTimer = setTimeout(() => (manual = false), MANUAL_SCROLL_HOLD);
  }

  function say(msg) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 1600);
  }

  function tapLine(i) {
    if (locked) return;
    wakeLock.enable(); // retry inside a user gesture, iOS likes that
    const learned = clock.tap(lines[i].t + TAP_LEAD);
    tapped = i;
    setTimeout(() => tapped === i && (tapped = -1), 400);
    manual = false;
    clearTimeout(manualTimer);
    sync();
    if (learned) say(`速度 ${clock.rate.toFixed(2)}×`);
  }

  function toggle() {
    wakeLock.enable();
    clock.toggle();
    sync();
  }

  function nudge(d) {
    clock.nudge(d);
    sync();
  }

  function setRate(r) {
    clock.setRate(r);
    sync();
    say(`速度 ${clock.rate.toFixed(2)}×`);
  }

  function go(i) {
    if (!playlist || i < 0 || i >= playlist.songIds.length) return;
    location.replace(`#/play/${pid}/${i}`);
  }

  function onKey(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === ' ') toggle();
    else if (e.key === 'ArrowLeft') nudge(-NUDGE);
    else if (e.key === 'ArrowRight') nudge(NUDGE);
    else if (e.key === 'ArrowUp') active > 0 && tapLine(active - 1);
    else if (e.key === 'ArrowDown') active < lines.length - 1 && tapLine(active + 1);
    else return;
    e.preventDefault();
  }

  function fmt(sec) {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="player">
  <header>
    <a href="#/p/{pid}" class="back" aria-label="返回歌单">‹</a>
    <div class="meta">
      <div class="title">{song?.title ?? '找不到这首歌'}</div>
      <div class="sub">
        {song?.artist ?? ''}
        {#if playlist}· {index + 1}/{playlist.songIds.length}{/if}
        {#if song && !timeline.synced}<span class="badge warn">估算时间轴，多点几下</span>{/if}
      </div>
    </div>
    <span
      class="wake {wakeLock.status}"
      title={wakeLock.status === 'on' ? '屏幕常亮' : '屏幕可能会自动锁定，可在设置里把自动锁定改成永不'}
    >☀</span>
    <button class="ghost lock" class:on={locked} onclick={() => (locked = !locked)} aria-label="锁定歌词点击">
      {locked ? '🔒' : '🔓'}
    </button>
  </header>

  <!-- touch handlers only pause auto-follow; the lines themselves are buttons -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="lyrics"
    bind:this={scroller}
    ontouchstart={holdScroll}
    ontouchend={releaseScroll}
    onwheel={() => {
      holdScroll();
      releaseScroll();
    }}
  >
    {#each lines as line, i}
      <button
        bind:this={lineEls[i]}
        class="line"
        class:active={i === active}
        class:past={i < active}
        class:near={i === active + 1}
        class:tapped={i === tapped}
        onclick={() => tapLine(i)}
      >
        {line.text || '♪'}
      </button>
    {:else}
      <p class="muted empty">没有歌词</p>
    {/each}
  </div>

  {#if !running && pos === 0 && lines.length}
    <div class="hint">歌手开口时点那一行，或者点 ▶ 从头计时</div>
  {:else if running && intro > 0}
    <div class="hint">前奏 · {intro}s</div>
  {/if}
  {#if manual}
    <button class="hint follow" onclick={() => { manual = false; centerOn(active); }}>回到当前行</button>
  {/if}
  {#if toast}<div class="toast">{toast}</div>{/if}

  <footer>
    {#if ended && next}
      <button class="next-card" onclick={() => go(index + 1)}>
        下一首 · <b>{next.title}</b>
      </button>
    {/if}

    {#if tuning}
      <div class="tune">
        <button onclick={() => setRate(rate - 0.02)}>慢</button>
        <span class="rate">{rate.toFixed(2)}×</span>
        <button onclick={() => setRate(rate + 0.02)}>快</button>
        <button onclick={() => setRate(1)}>重置</button>
        <span class="time">{fmt(pos)}</span>
      </div>
    {/if}

    <div class="controls">
      <button class="ghost" disabled={index === 0} onclick={() => go(index - 1)} aria-label="上一首">⏮</button>
      <button onclick={() => nudge(-NUDGE)} aria-label="歌词往回 0.5 秒">−½s</button>
      <button class="primary big" onclick={toggle} aria-label={running ? '暂停' : '播放'}>
        {running ? '❚❚' : '▶'}
      </button>
      <button onclick={() => nudge(NUDGE)} aria-label="歌词往前 0.5 秒">+½s</button>
      <button
        class="ghost"
        disabled={!playlist || index >= playlist.songIds.length - 1}
        onclick={() => go(index + 1)}
        aria-label="下一首">⏭</button>
      <button class="ghost" class:on={tuning} onclick={() => (tuning = !tuning)} aria-label="速度">⚙</button>
    </div>
  </footer>
</div>

<style>
  .player {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    user-select: none;
    -webkit-user-select: none;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: calc(var(--safe-top) + 8px) 12px 8px;
    border-bottom: 1px solid var(--line);
  }
  .back {
    color: var(--fg);
    text-decoration: none;
    font-size: 32px;
    line-height: 1;
    padding: 0 8px 4px 0;
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .meta .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    color: var(--dim);
    font-size: 13px;
    display: flex;
    gap: 6px;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
  }
  .wake {
    font-size: 16px;
    color: var(--faint);
  }
  .wake.on {
    color: var(--ok);
  }
  .wake.unsupported,
  .wake.error {
    color: var(--warn);
  }
  .lock {
    padding: 6px;
    font-size: 18px;
  }

  .lyrics {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 20px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  /* Spacers (not padding, which would stop the flex item from shrinking) so
     the first and last lines can still be scrolled to the focus point. */
  .lyrics::before,
  .lyrics::after {
    content: '';
    display: block;
    height: 40vh;
  }
  .lyrics::after {
    height: 55vh;
  }
  .lyrics::-webkit-scrollbar {
    display: none;
  }

  .line {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 10px;
    padding: 10px 8% 10px 6px; /* room for the active line's scale-up */
    font-size: 24px;
    line-height: 1.3;
    font-weight: 700;
    color: var(--faint);
    transition:
      color 0.25s,
      transform 0.25s,
      opacity 0.25s;
    transform-origin: left center;
  }
  .line:active {
    transform: none;
  }
  .line.past {
    opacity: 0.55;
  }
  .line.near {
    color: var(--dim);
  }
  .line.active {
    color: var(--fg);
    transform: scale(1.08);
  }
  .line.tapped {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
  }

  .hint {
    position: absolute;
    left: 50%;
    top: calc(var(--safe-top) + 72px);
    transform: translateX(-50%);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 13px;
    color: var(--dim);
    white-space: nowrap;
  }
  .hint.follow {
    top: auto;
    bottom: calc(var(--safe-bottom) + 96px);
    color: var(--fg);
  }
  .toast {
    position: absolute;
    left: 50%;
    top: 40%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    padding: 10px 18px;
    border-radius: 12px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  footer {
    border-top: 1px solid var(--line);
    padding: 10px 12px calc(var(--safe-bottom) + 10px);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .controls button {
    min-width: 48px;
    min-height: 48px;
    font-variant-numeric: tabular-nums;
  }
  .controls .big {
    min-width: 64px;
    min-height: 56px;
    font-size: 20px;
    border-radius: 18px;
  }
  .controls .on {
    color: var(--accent);
  }
  .tune {
    display: flex;
    align-items: center;
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }
  .tune .rate {
    min-width: 4em;
    text-align: center;
  }
  .tune .time {
    margin-left: auto;
    color: var(--dim);
  }
  .next-card {
    border-color: var(--accent);
    text-align: left;
  }
  .empty {
    text-align: center;
  }
</style>
