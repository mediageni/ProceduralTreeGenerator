import * as THREE from 'three';

const SIZE = 400;
const FRAMES = 36;
const FRAME_DELAY = 100;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Record through the existing WebGL context without moving the live preview camera.
export async function exportRotationGIF({ scene, camera, controls, renderer, filename, onProgress, renderLoop }) {
  const { GIFEncoder, quantize, applyPalette } = await import('./vendor/gifenc.esm.js');
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true });
  target.texture.colorSpace = renderer.outputColorSpace;
  const captureCamera = camera.clone();
  captureCamera.aspect = 1;
  captureCamera.updateProjectionMatrix();
  const offset = camera.position.clone().sub(controls.target);
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const rgba = new Uint8Array(pixels.length);
  const rowBytes = SIZE * 4;
  const gif = GIFEncoder();
  const previousTarget = renderer.getRenderTarget();
  const previousAutoRotate = controls.autoRotate;
  const previousEnabled = controls.enabled;
  const previousDamping = controls.enableDamping;
  const previousPosition = camera.position.clone();
  const previousQuaternion = camera.quaternion.clone();
  controls.autoRotate = false;
  controls.enabled = false;
  renderer.setAnimationLoop(null);

  try {
    controls.enableDamping = false;
    controls.update(); // clear any pending drag motion before recording
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousQuaternion);
    for (let frame = 0; frame < FRAMES; frame++) {
      captureCamera.position.copy(controls.target).add(
        offset.clone().applyAxisAngle(Y_AXIS, (frame / FRAMES) * Math.PI * 2)
      );
      captureCamera.lookAt(controls.target);
      renderer.setRenderTarget(target);
      renderer.render(scene, captureCamera);
      renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
      renderer.setRenderTarget(previousTarget);

      // WebGL reads rows from the bottom; GIF frames start at the top.
      for (let row = 0; row < SIZE; row++) {
        const source = (SIZE - 1 - row) * rowBytes;
        rgba.set(pixels.subarray(source, source + rowBytes), row * rowBytes);
      }
      const palette = quantize(rgba, 128);
      const indexed = applyPalette(rgba, palette);
      gif.writeFrame(indexed, SIZE, SIZE, { palette, delay: FRAME_DELAY, repeat: 0 });
      onProgress?.(frame + 1, FRAMES);
      if (frame % 4 === 3) await new Promise(requestAnimationFrame);
    }

    gif.finish();
    const blob = new Blob([gif.bytes()], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return blob;
  } finally {
    renderer.setRenderTarget(previousTarget);
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousQuaternion);
    controls.enableDamping = previousDamping;
    controls.autoRotate = previousAutoRotate;
    controls.enabled = previousEnabled;
    target.dispose();
    renderer.setAnimationLoop(renderLoop);
  }
}
