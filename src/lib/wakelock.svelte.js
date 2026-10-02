// Keep the screen on while the player is open.
//
// Preferred: the Screen Wake Lock API (iOS Safari 16.4+, home-screen apps
// reliably from 18.4). It drops whenever the page is hidden, so we
// re-request on visibility change. Fallback: a muted, inline, looping tiny
// video — iOS doesn't auto-lock while a video plays (NoSleep.js trick).
// The fallback needs a user gesture to start, so callers invoke enable()
// from tap handlers too.

const state = $state({ status: 'off' }); // off | on | fallback | unsupported
let sentinel = null;
let video = null;
let wanted = false;

function getVideo() {
  if (video) return video;
  video = document.createElement('video');
  // H.264 for Safari; WebM for browsers built without proprietary codecs.
  video.src = video.canPlayType('video/mp4; codecs="avc1.42E01E"') ? './nosleep.mp4' : './nosleep.webm';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  Object.assign(video.style, {
    position: 'fixed',
    width: '1px',
    height: '1px',
    opacity: '0.01',
    pointerEvents: 'none',
    left: '0',
    top: '0',
  });
  document.body.appendChild(video);
  return video;
}

async function startFallback() {
  try {
    await getVideo().play();
    state.status = 'fallback';
  } catch {
    // Not inside a user gesture yet; the next tap will retry.
    state.status = 'unsupported';
  }
}

async function acquire() {
  if (sentinel && !sentinel.released) return;
  if ('wakeLock' in navigator) {
    try {
      sentinel = await navigator.wakeLock.request('screen');
      state.status = 'on';
      video?.pause();
      sentinel.addEventListener('release', () => {
        if (state.status === 'on') state.status = 'off';
      });
      return;
    } catch {
      // fall through
    }
  }
  if (state.status !== 'fallback' || video?.paused) await startFallback();
}

function onVisible() {
  if (wanted && document.visibilityState === 'visible') acquire();
}

export const wakeLock = {
  get status() {
    return state.status;
  },
  enable() {
    if (!wanted) document.addEventListener('visibilitychange', onVisible);
    wanted = true;
    acquire();
  },
  disable() {
    wanted = false;
    document.removeEventListener('visibilitychange', onVisible);
    sentinel?.release().catch(() => {});
    sentinel = null;
    video?.pause();
    state.status = 'off';
  },
};
