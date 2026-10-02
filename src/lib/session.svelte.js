// Player state that must survive moving to the next song (the player
// component is re-created per song): stage mode and the live camera.

export const view = $state({
  stage: false,
  camera: false,
  facing: 'environment', // or 'user' (selfie)
});

let stream = null;

export const cameraStream = () => stream;

export async function startCamera(facing = view.facing) {
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false, // iOS screen recording captures the mic itself
  });
  view.facing = facing;
  view.camera = true;
  return stream;
}

export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  view.camera = false;
}

export function leavePlayer() {
  stopCamera();
  view.stage = false;
}
