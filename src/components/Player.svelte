<script>
  import { onMount, tick } from 'svelte';
  import { lib, playlistById } from '../lib/store.svelte.js';
  import { songTimeline } from '../lib/lrc.js';
  import { SyncClock, activeIndex, MIN_RATE, MAX_RATE } from '../lib/clock.js';
  import { wakeLock } from '../lib/wakelock.svelte.js';
  import { hueOf } from '../lib/color.js';
  import { ensureArt } from '../lib/artwork.js';
  import { view, cameraStream, startCamera, stopCamera } from '../lib/session.svelte.js';
  import Icon from './Icon.svelte';
  import Cover from './Cover.svelte';

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
  let stageIdle = $state(false);
  let holding = $state(false);
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
  let holdTimer;
  let idleTimer;

  function sync() {
    pos = clock.position;
    running = clock.running;
    rate = clock.rate;
  }

  onMount(() => {
    if (song && !song.artChecked) ensureArt([song.id]);
    const t = setInterval(sync, 100);
    centerOn(0, false);
    return () => {
      clearInterval(t);
      clearTimeout(manualTimer);
      clearTimeout(toastTimer);
      clearTimeout(holdTimer);
      clearTimeout(idleTimer);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  });

  function centerOn(i, smooth = true) {
    const el = lineEls[Math.max(i, 0)];
    if (!el || !scroller) return;
    const top = el.offsetTop - scroller.clientHeight * (view.camera ? 0.66 : 0.36) + el.offsetHeight / 2;
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

  function say(msg, ms = 1600) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), ms);
  }

  // Camera mode (live video behind the lyrics, for the iOS screen recorder).
  let videoEl = $state();
  let cameraBusy = $state(false);

  $effect(() => {
    // (re)attach after a song change re-creates the <video>
    if (view.camera && videoEl && videoEl.srcObject !== cameraStream()) {
      videoEl.srcObject = cameraStream();
      videoEl.play().catch(() => {});
    }
  });

  // The focus line sits lower over video, like subtitles.
  $effect(() => {
    view.camera;
    tick().then(() => centerOn(active, false));
  });

  async function toggleCamera(facing = view.facing) {
    if (view.camera && facing === view.facing) {
      stopCamera();
      return;
    }
    cameraBusy = true;
    try {
      await startCamera(facing);
      if (!view.stage) enterStage();
      say('相机已开 · 从控制中心点「屏幕录制」就能录下来', 3500);
    } catch (err) {
      say(err.name === 'NotAllowedError' ? '没有相机权限：设置 → Safari → 相机' : `相机打不开：${err.message}`, 3500);
    } finally {
      cameraBusy = false;
    }
  }

  function tapLine(i) {
    if (locked) return;
    wakeLock.enable(); // retry inside a user gesture, iOS likes that
    const learned = clock.tap(lines[i].t + TAP_LEAD);
    tapped = i;
    setTimeout(() => tapped === i && (tapped = -1), 450);
    manual = false;
    clearTimeout(manualTimer);
    sync();
    if (learned) say(`已校准速度 ${clock.rate.toFixed(2)}×`);
  }

  // Stage mode. iPhone Safari has no Fullscreen API for pages (the home-screen
  // app is already full screen); elsewhere we ask for real fullscreen too.
  function enterStage() {
    wakeLock.enable();
    view.stage = true;
    tuning = false;
    poke();
    document.documentElement.requestFullscreen?.().catch(() => {});
    say('演出模式 · 点歌词照样能校准');
  }
  function exitStage() {
    view.stage = false;
    stopCamera();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  // Stage controls fade out when untouched for a bit.
  function poke() {
    stageIdle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (stageIdle = true), 3000);
  }

  // Lock = a shield over the whole screen; only a long press on the lock
  // badge gets you out, so pockets and crowds can't change anything.
  function lock() {
    wakeLock.enable();
    locked = true;
    tuning = false;
    say('已锁定 · 长按锁图标解锁');
  }
  function startHold(e) {
    e.preventDefault();
    holding = true;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holding = false;
      locked = false;
      navigator.vibrate?.(15);
      poke();
      say('已解锁');
    }, 800);
  }
  function endHold() {
    holding = false;
    clearTimeout(holdTimer);
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

<!-- touch/mouse only wake the faded stage controls -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="player"
  class:stage={view.stage}
  class:camera={view.camera}
  style="--h: {hue}"
  ontouchstart={view.stage ? poke : undefined}
  onmousemove={view.stage ? poke : undefined}
>
  {#if view.camera}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video class="cam" class:mirror={view.facing === 'user'} bind:this={videoEl} autoplay playsinline muted></video>
    <div class="cam-scrim" aria-hidden="true"></div>
  {/if}
  <div class="ambient" class:dim={song?.art?.cover} aria-hidden="true"></div>
  {#if song?.art?.cover}
    <!-- blurred album art as the backdrop, Apple Music style -->
    <div class="art-bg" style="background-image: url('{song.art.cover}')" aria-hidden="true"></div>
  {/if}

  <header>
    <div class="actions">
      <a href="#/p/{pid}" class="icon-btn glass" aria-label="返回歌单"><Icon name="back" /></a>
      <Cover src={song?.art?.cover} seed={song?.title ?? ''} size={40} radius={8} />
    </div>
    <div class="meta">
      <div class="title ellipsis">{song?.title ?? '找不到这首歌'}</div>
      <div class="sub ellipsis">
        {song?.artist ?? ''}
        {#if song && !timeline.synced}<span class="tag warn">估算时间轴</span>{/if}
      </div>
    </div>
    <div class="actions">
      <button class="icon-btn glass" onclick={() => toggleCamera()} aria-label="相机模式"><Icon name="camera" size={18} /></button>
      <button class="icon-btn glass" onclick={enterStage} aria-label="演出模式"><Icon name="expand" size={18} /></button>
      <button class="icon-btn glass" onclick={lock} aria-label="锁屏防误触"><Icon name="lock" size={18} /></button>
    </div>
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

  {#if view.stage && !locked}
    <div class="stage-bar" class:idle={stageIdle}>
      <button class="icon-btn glass" onclick={toggle} aria-label={running ? '暂停' : '播放'}>
        <Icon name={running ? 'pause' : 'play'} size={18} />
      </button>
      <button
        class="icon-btn glass"
        class:on={view.camera}
        onclick={() => toggleCamera()}
        disabled={cameraBusy}
        aria-label={view.camera ? '关闭相机' : '打开相机'}
      >
        <Icon name={view.camera ? 'camera-off' : 'camera'} size={18} />
      </button>
      {#if view.camera}
        <button
          class="icon-btn glass"
          onclick={() => toggleCamera(view.facing === 'user' ? 'environment' : 'user')}
          disabled={cameraBusy}
          aria-label="切换前后摄像头"
        >
          <Icon name="flip" size={18} />
        </button>
      {/if}
      <button class="icon-btn glass" onclick={lock} aria-label="锁屏防误触"><Icon name="lock" size={18} /></button>
      <button class="icon-btn glass" onclick={exitStage} aria-label="退出演出模式"><Icon name="shrink" size={18} /></button>
    </div>
  {/if}

  {#if locked}
    <!-- swallows every touch (taps, scrolls) until the badge is long-pressed -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="shield" onclick={() => say('长按锁图标解锁')} ontouchmove={(e) => e.preventDefault()}></div>
    <button
      class="unlock"
      class:holding
      onpointerdown={startHold}
      onpointerup={endHold}
      onpointerleave={endHold}
      onpointercancel={endHold}
      oncontextmenu={(e) => e.preventDefault()}
      aria-label="长按解锁"
    >
      <svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" /></svg>
      <Icon name="lock" size={18} />
      <span>长按解锁</span>
    </button>
  {/if}

  <footer>
    {#if ended && next}
      <button class="next-up" onclick={() => go(index + 1)}>
        <Cover src={next.art?.cover} seed={next.title} size={36} radius={7} />
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
        <span class="wake {wakeLock.status}" role="img" aria-label="屏幕常亮" title={wakeLock.status === 'on' || wakeLock.status === 'fallback' ? '屏幕常亮已开启' : '点一下歌词或播放键开启常亮'}>
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
  .ambient.dim {
    opacity: 0.35;
  }
  .art-bg {
    position: absolute;
    inset: -15%;
    background-size: cover;
    background-position: center;
    filter: blur(48px) saturate(1.5) brightness(0.42);
    animation: drift 30s ease-in-out infinite alternate;
    pointer-events: none;
  }
  .stage .art-bg {
    filter: blur(56px) saturate(1.4) brightness(0.38);
  }
  .player > :not(.ambient):not(.art-bg) {
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
  .actions {
    display: flex;
    gap: 8px;
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

  /* Stage mode: chrome slides away, lyrics get bigger. */
  header,
  .progress,
  footer {
    transition:
      transform 0.35s ease,
      opacity 0.35s ease;
  }
  .stage header {
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
  }
  .stage .progress {
    opacity: 0;
  }
  .stage footer {
    position: absolute !important;
    left: 0;
    right: 0;
    bottom: 0;
    transform: translateY(110%);
    opacity: 0;
    pointer-events: none;
  }
  .stage .line {
    font-size: clamp(32px, 9.5vw, 48px);
  }
  .stage .overlay {
    top: calc(var(--safe-top) + 16px);
  }
  .stage-bar {
    position: absolute !important;
    left: 50%;
    bottom: calc(var(--safe-bottom) + 18px);
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
    padding: 8px;
    border-radius: 999px;
    background: rgba(22, 22, 28, 0.5);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    z-index: 4;
    transition: opacity 0.6s;
  }
  .stage-bar.idle {
    opacity: 0.25;
  }
  /* nothing on screen but video + lyrics while the screen recorder runs */
  .camera .stage-bar.idle {
    opacity: 0;
  }

  /* Camera mode: live video as the backdrop, lyrics as lower-third subtitles. */
  .cam {
    position: absolute !important;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #000;
  }
  .cam.mirror {
    transform: scaleX(-1);
  }
  .cam-scrim {
    position: absolute !important;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.15) 0%, transparent 35%, rgba(0, 0, 0, 0.55) 100%);
    pointer-events: none;
  }
  .camera .ambient,
  .camera .art-bg {
    display: none;
  }
  .camera .lyrics {
    -webkit-mask-image: linear-gradient(180deg, transparent 0, transparent 42%, #000 56%, #000 88%, transparent 100%);
    mask-image: linear-gradient(180deg, transparent 0, transparent 42%, #000 56%, #000 88%, transparent 100%);
  }
  .camera .lyrics::before {
    height: 66vh;
  }
  .camera .line {
    font-size: clamp(26px, 7.6vw, 38px);
    color: rgba(255, 255, 255, 0.6);
    text-shadow: 0 2px 14px rgba(0, 0, 0, 0.75);
    filter: none;
  }
  .camera .line.active {
    color: #fff;
    text-shadow:
      0 2px 18px rgba(0, 0, 0, 0.8),
      0 0 2px rgba(0, 0, 0, 0.6);
  }
  .camera .line.past,
  .camera .line.far {
    opacity: 0;
  }

  .shield {
    position: absolute !important;
    inset: 0;
    z-index: 10;
    touch-action: none;
  }
  .unlock {
    position: absolute !important;
    left: 50%;
    bottom: calc(var(--safe-bottom) + 18px);
    transform: translateX(-50%);
    z-index: 11;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    padding: 0 18px 0 6px;
    border-radius: 999px;
    background: rgba(22, 22, 28, 0.72);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
    font-size: 14px;
    font-weight: 600;
    color: var(--dim);
    -webkit-touch-callout: none;
    touch-action: none;
  }
  /* lock icon sits centred inside the progress ring */
  .unlock :global(svg:not(.ring)) {
    position: absolute;
    left: 16px;
    color: var(--fg);
  }
  .ring {
    width: 38px;
    height: 38px;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke: var(--fg);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 126;
    stroke-dashoffset: 126;
  }
  .unlock.holding .ring circle {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 0.8s linear;
  }
  .unlock.holding {
    color: var(--fg);
  }

  .next-up {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 8px;
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
  .wake.fallback {
    color: var(--ok);
    opacity: 0.7;
  }
  .wake.unsupported {
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
