// Player state that must survive moving to the next song (the player
// component is re-created per song): stage mode and the live camera.

export const view = $state({
  stage: false,
  camera: false,
  facing: 'environment', // or 'user' (selfie)
  spec: '', // what the camera actually delivers, e.g. "1080p · 60fps"
});

let stream = null;

export const cameraStream = () => stream;

// Ask for 1080p at 60fps but only as "ideal": cameras that can't (often the
// front one) fall back to their best mode instead of failing.
const HD60 = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } };

export function describeSettings({ width, height, frameRate } = {}) {
  if (!width || !height) return '';
  const p = Math.min(width, height); // portrait streams report 1080×1920
  return frameRate ? `${p}p · ${Math.round(frameRate)}fps` : `${p}p`;
}

export async function startCamera(facing = view.facing) {
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, ...HD60 },
    audio: false, // iOS screen recording captures the mic itself
  });
  const track = stream.getVideoTracks()[0];
  // Some WebKit builds ignore frameRate in getUserMedia; nudge once more.
  if ((track?.getSettings().frameRate ?? 60) < 50) {
    await track.applyConstraints(HD60).catch(() => {});
  }
  view.facing = facing;
  view.spec = describeSettings(track?.getSettings());
  view.camera = true;
  return stream;
}

export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  view.camera = false;
  view.spec = '';
}

export function leavePlayer() {
  stopCamera();
  view.stage = false;
}
