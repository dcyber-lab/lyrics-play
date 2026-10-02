<script>
  import { onMount } from 'svelte';
  import { lib, playlistById } from '../lib/store.svelte.js';
  import { songTimeline } from '../lib/lrc.js';
  import { SyncClock, activeIndex, MIN_RATE, MAX_RATE } from '../lib/clock.js';
  import { wakeLock } from '../lib/wakelock.svelte.js';
  import { hueOf } from '../lib/color.js';
  import Icon from './Icon.svelte';

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
  const hue = $derived(hueOf(song?.title ?? ''));

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
  const progress = $derived(lastT ? Math.min(1, pos / (lastT + 4)) : 0);

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
    const top = el.offsetTop - scroller.clientHeight * 0.36 + el.offsetHeight / 2;
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
    if (locked) {
      say('已锁定，点右上角解锁');
      return;
    }
    wakeLock.enable(); // retry inside a user gesture, iOS likes that
    const learned = clock.tap(lines[i].t + TAP_LEAD);
    tapped = i;
    setTimeout(() => tapped === i && (tapped = -1), 450);
    manual = false;
    clearTimeout(manualTimer);
    sync();
    if (learned) say(`已校准速度 ${clock.rate.toFixed(2)}×`);
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

<div class="player" style="--h: {hue}">
  <div class="ambient" aria-hidden="true"></div>

  <header>
    <a href="#/p/{pid}" class="icon-btn glass" aria-label="返回歌单"><Icon name="back" /></a>
    <div class="meta">
      <div class="title ellipsis">{song?.title ?? '找不到这首歌'}</div>
      <div class="sub ellipsis">
        {song?.artist ?? ''}
        {#if song && !timeline.synced}<span class="tag warn">估算时间轴</span>{/if}
      </div>
    </div>
    <button
      class="icon-btn glass"
      class:on={locked}
      onclick={() => {
        locked = !locked;
        say(locked ? '歌词已锁定，防误触' : '已解锁');
      }}
      aria-label={locked ? '解锁歌词点击' : '锁定歌词点击'}
      aria-pressed={locked}
    >
      <Icon name={locked ? 'lock' : 'unlock'} size={19} />
    </button>
  </header>

  <div class="progress" aria-hidden="true"><span style="transform: scaleX({progress})"></span></div>

  <!-- touch handlers only pause auto-follow; the lines themselves are buttons -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="lyrics"
    class:manual
    bind:this={scroller}
    ontouchstart={holdScroll}
    ontouchend={releaseScroll}
    onwheel={() => {
      holdScroll();
      releaseScroll();
    }}
  >
    {#each lines as line, i}
      {@const d = i - active}
      <button
        bind:this={lineEls[i]}
        class="line"
        class:active={d === 0}
        class:past={d < 0}
        class:soon={d === 1}
        class:far={Math.abs(d) > 2}
        class:tapped={i === tapped}
        onclick={() => tapLine(i)}
      >
        {line.text || '♪'}
      </button>
    {:else}
      <p class="empty">这首歌没有歌词</p>
    {/each}
  </div>

  <div class="overlay">
    {#if !running && pos === 0 && lines.length}
      <div class="chip">歌手开口时，点那一行</div>
    {:else if running && intro > 0}
      <div class="chip"><span class="pulse"></span>前奏 {intro}s</div>
    {/if}
    {#if toast}<div class="chip strong">{toast}</div>{/if}
  </div>

  {#if manual}
    <button class="chip follow" onclick={() => { manual = false; centerOn(active); }}>
      <Icon name="down" size={16} />回到当前行
    </button>
  {/if}

  <footer>
    {#if ended && next}
      <button class="next-up" onclick={() => go(index + 1)}>
        <span class="next-label">下一首</span>
        <span class="next-title ellipsis">{next.title}</span>
        <span class="icon-btn small-play"><Icon name="play" size={16} /></span>
      </button>
    {/if}

    <div class="dock">
      <div class="status">
        <span class="time">{fmt(pos)}</span>
        <button class="pill" class:on={tuning || rate !== 1} onclick={() => (tuning = !tuning)} aria-expanded={tuning}>
          <Icon name="gauge" size={15} />{rate.toFixed(2)}×
        </button>
        <span class="wake {wakeLock.status}" title={wakeLock.status === 'on' ? '屏幕常亮已开启' : '屏幕可能自动锁定：设置 → 显示与亮度 → 自动锁定 → 永不'}>
          <Icon name="sun" size={15} />
        </span>
        <span class="count">{playlist ? `${index + 1} / ${playlist.songIds.length}` : ''}</span>
      </div>

      {#if tuning}
        <div class="tune">
          <span class="muted">慢</span>
          <input
            type="range"
            min={MIN_RATE}
            max={MAX_RATE}
            step="0.01"
            value={rate}
            oninput={(e) => setRate(Number(e.currentTarget.value))}
            aria-label="速度"
          />
          <span class="muted">快</span>
          <button class="btn small" onclick={() => setRate(1)}>重置</button>
        </div>
      {/if}

      <div class="controls">
        <button class="icon-btn ctl" disabled={index === 0} onclick={() => go(index - 1)} aria-label="上一首">
          <Icon name="prev" size={24} />
        </button>
        <button class="icon-btn ctl nudge" onclick={() => nudge(-NUDGE)} aria-label="歌词往回 0.5 秒">
          <Icon name="rewind" size={30} stroke-width="1.8" /><span>½</span>
        </button>
        <button class="play" onclick={toggle} aria-label={running ? '暂停' : '播放'}>
          <Icon name={running ? 'pause' : 'play'} size={28} />
        </button>
        <button class="icon-btn ctl nudge" onclick={() => nudge(NUDGE)} aria-label="歌词往前 0.5 秒">
          <Icon name="forward" size={30} stroke-width="1.8" /><span>½</span>
        </button>
        <button
          class="icon-btn ctl"
          disabled={!playlist || index >= playlist.songIds.length - 1}
          onclick={() => go(index + 1)}
          aria-label="下一首"
        >
          <Icon name="next" size={24} />
        </button>
      </div>
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
    overflow: hidden;
    -webkit-user-select: none;
    user-select: none;
  }

  /* Per-song colour wash behind everything. */
  .ambient {
    position: absolute;
    inset: -20%;
    background:
      radial-gradient(40% 35% at 20% 15%, hsl(var(--h) 85% 50% / 0.45), transparent 70%),
      radial-gradient(45% 40% at 85% 70%, hsl(calc(var(--h) + 60) 80% 45% / 0.35), transparent 70%),
      radial-gradient(50% 40% at 30% 100%, hsl(calc(var(--h) + 180) 70% 40% / 0.25), transparent 70%);
    filter: blur(40px);
    animation: drift 24s ease-in-out infinite alternate;
    pointer-events: none;
  }
  @keyframes drift {
    to {
      transform: translate3d(4%, -3%, 0) scale(1.08);
    }
  }
  .player > :not(.ambient) {
    position: relative;
  }

  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: calc(var(--safe-top) + 8px) 14px 10px;
    z-index: 2;
  }
  .glass {
    background: rgba(255, 255, 255, 0.1);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
  }
  .icon-btn.on {
    background: var(--fg);
    color: #000;
  }
  .meta {
    flex: 1;
    min-width: 0;
    text-align: center;
  }
  .meta .title {
    font-size: 16px;
    font-weight: 700;
  }
  .meta .sub {
    margin-top: 1px;
    font-size: 13px;
    color: var(--dim);
  }
  .meta .tag {
    margin-left: 4px;
    vertical-align: 1px;
  }

  .progress {
    height: 2px;
    margin: 0 18px;
    border-radius: 1px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: rgba(255, 255, 255, 0.7);
    transform-origin: left;
    transition: transform 0.1s linear;
  }

  .lyrics {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 24px;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 14%, #000 72%, transparent 100%);
    mask-image: linear-gradient(180deg, transparent 0, #000 14%, #000 72%, transparent 100%);
  }
  .lyrics::-webkit-scrollbar {
    display: none;
  }
  /* Spacers (not padding, which would stop the flex item from shrinking) so
     the first and last lines can still be scrolled to the focus point. */
  .lyrics::before,
  .lyrics::after {
    content: '';
    display: block;
    height: 36vh;
  }
  .lyrics::after {
    height: 60vh;
  }

  .line {
    display: block;
    width: 100%;
    margin: 0 -10px;
    padding: 10px;
    border-radius: 14px;
    text-align: left;
    white-space: normal;
    font-size: clamp(26px, 7.6vw, 36px);
    font-weight: 800;
    line-height: 1.18;
    letter-spacing: -0.018em;
    color: rgba(255, 255, 255, 0.3);
    transition:
      color 0.35s ease,
      filter 0.35s ease,
      opacity 0.35s ease,
      background 0.2s;
  }
  .line.soon {
    color: rgba(255, 255, 255, 0.45);
  }
  .line.past {
    color: rgba(255, 255, 255, 0.22);
  }
  .line.far {
    filter: blur(1.2px);
  }
  .lyrics.manual .line {
    filter: none;
  }
  .line.active {
    color: #fff;
    text-shadow: 0 0 32px hsl(var(--h) 90% 65% / 0.55);
  }
  .line.tapped {
    background: rgba(255, 255, 255, 0.12);
  }
  .empty {
    text-align: center;
    color: var(--dim);
  }

  .overlay {
    position: absolute !important;
    top: calc(var(--safe-top) + 74px);
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    z-index: 3;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    background: rgba(30, 30, 36, 0.7);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    font-size: 13px;
    font-weight: 600;
    color: var(--dim);
  }
  .chip.strong {
    color: var(--fg);
  }
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
  }
  .chip.follow {
    position: absolute !important;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(var(--safe-bottom) + 190px);
    color: var(--fg);
    z-index: 3;
  }

  footer {
    padding: 0 10px calc(var(--safe-bottom) + 10px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 2;
  }

  .next-up {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 16px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.92);
    color: #000;
    text-align: left;
    animation: rise 0.35s ease-out;
  }
  @keyframes rise {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
  }
  .next-label {
    font-size: 12px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.5);
  }
  .next-title {
    flex: 1;
    font-weight: 700;
  }
  .small-play {
    width: 34px;
    height: 34px;
    background: #000;
    color: #fff;
  }

  .dock {
    padding: 10px 12px 12px;
    border-radius: 28px;
    background: rgba(22, 22, 28, 0.62);
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    backdrop-filter: blur(28px) saturate(1.6);
    box-shadow:
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.1),
      0 20px 40px -20px rgba(0, 0, 0, 0.8);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px 6px;
    font-size: 13px;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .time {
    min-width: 40px;
  }
  .count {
    margin-left: auto;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--dim);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .pill.on {
    color: var(--fg);
    background: rgba(255, 255, 255, 0.16);
  }
  .wake {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    color: var(--faint);
  }
  .wake.on {
    color: var(--ok);
  }
  .wake.unsupported,
  .wake.error {
    color: var(--warn);
  }

  .tune {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 4px 10px;
  }
  .tune input {
    flex: 1;
    padding: 0;
    background: none;
    accent-color: var(--accent);
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ctl {
    width: 52px;
    height: 52px;
  }
  .nudge {
    position: relative;
  }
  .nudge span {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 800;
    padding-top: 1px;
  }
  .play {
    display: grid;
    place-items: center;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: var(--fg);
    color: #000;
    box-shadow: 0 8px 24px -6px hsl(var(--h) 90% 60% / 0.6);
    transition: transform 0.12s;
  }
  .play:active {
    transform: scale(0.92);
  }
</style>
