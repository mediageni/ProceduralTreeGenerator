// Procedural Tree Generator — scene, state, render loop.
// Builds a real flat-shaded 3D low-poly tree (builder.js) you can orbit + export.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { buildTree } from './builder.js';
import { STYLES } from './styles.js';
import { paramsFromSeed, setDerived, encodeConfig, decodeConfig } from './params.js';
import { randomSeed, seedToString, stringToSeed } from './rng.js';
import { exportGLB, exportOBJ } from './exporter.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;
controls.minDistance = 2;
controls.maxDistance = 80;
controls.maxPolarAngle = Math.PI * 0.495;
controls.addEventListener('start', () => { controls.autoRotate = false; });

let styleRig = null;
let tree = null;

const app = {
  params: null,
  styleKey: 'meadow',

  setStyle(key) { if (!STYLES[key]) return; this.styleKey = key; applyStyle(); rebuild(); this.sync(); },
  reroll() { this.params = paramsFromSeed(randomSeed(), null); rebuild(true); this.sync(); },
  setArchetype(key) { this.params = paramsFromSeed(this.params.seed, key); rebuild(true); this.sync(); },
  setSlider(key, value) { setDerived(this.params, key, value); rebuild(); this.sync(); },
  setHue(h) { this.params.color = { ...this.params.color, foliage: { ...this.params.color.foliage, h } }; rebuild(); this.sync(); },
  loadConfig(p) { this.params = p; rebuild(true); this.sync(); },
  exportGLB() { return exportGLB(tree, `tree-${seedToString(this.params.seed)}`); },
  exportOBJ() { exportOBJ(tree, `tree-${seedToString(this.params.seed)}`); },
  shareURL() { const u = new URL(location.href); u.search = '?c=' + encodeConfig(this.params); return u.toString(); },
  get car() { return tree; },
  sync() {},
};

function applyStyle() {
  const style = STYLES[app.styleKey];
  scene.background = style.background;
  renderer.toneMappingExposure = style.exposure ?? 1;
  if (styleRig) { scene.remove(styleRig); disposeTree(styleRig); }
  styleRig = style.rig();
  scene.add(styleRig);
}

function rebuild(reframe = false) {
  const style = STYLES[app.styleKey];
  const m = style.materials(app.params);
  if (tree) { scene.remove(tree); disposeTree(tree); }
  tree = buildTree(app.params, m);
  scene.add(tree);
  const c = tree.userData.center;
  controls.target.set(0, c.y, 0);
  if (reframe) frameCamera(tree.userData.size, c);
  updateURL();
}

function frameCamera(size, center) {
  const d = Math.max(size.y, size.x, size.z) * 1.5;
  camera.position.set(d * 0.55, center.y + size.y * 0.18, d);
  controls.update();
}

function updateURL() { history.replaceState(null, '', '?c=' + encodeConfig(app.params)); }

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

function initParams() {
  const q = new URLSearchParams(location.search);
  const c = q.get('c');
  if (c) { const p = decodeConfig(c); if (p) return p; }
  const seed = stringToSeed(q.get('seed'));
  return paramsFromSeed(seed != null ? seed : randomSeed(), q.get('type'));
}

app.params = initParams();
applyStyle();
rebuild(true);
createUI(app);
app.sync();

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// expose for smoke tests
window.__app = app;
window.__rig = { camera, controls, scene, renderer };
