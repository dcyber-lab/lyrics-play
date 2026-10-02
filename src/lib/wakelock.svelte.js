// Keep the screen on while the player is open. iOS Safari supports this
// from 16.4 (home-screen apps from 18.4); the lock drops whenever the page
// is hidden, so we re-request on visibility change.

const state = $state({ status: 'off' }); // off | on | unsupported | error
let sentinel = null;
let wanted = false;

async function acquire() {
  if (!('wakeLock' in navigator)) {
    state.status = 'unsupported';
    return;
  }
  if (sentinel && !sentinel.released) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    state.status = 'on';
    sentinel.addEventListener('release', () => {
      state.status = 'off';
    });
  } catch {
    state.status = 'error';
  }
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
    state.status = 'off';
  },
};
