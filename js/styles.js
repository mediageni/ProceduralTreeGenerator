// Selectable visual styles: a rig (ground + lights with shadows), a sky, and a
// material set (trunk + foliage) for the low-poly tree.

import * as THREE from 'three';

const col = (hsl) => new THREE.Color().setHSL((hsl.h % 1 + 1) % 1, hsl.s, hsl.l);
const std = (o) => new THREE.MeshStandardMaterial({ flatShading: true, ...o });

function gradientSky(stops) {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [t, c] of stops) grad.addColorStop(t, c);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rig({ ground, hemi, sun, sunColor = 0xffffff, sunInt = 1.6, grid = null }) {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(hemi[0], hemi[1], 0.75));
  const key = new THREE.DirectionalLight(sunColor, sunInt);
  key.position.set(sun[0], sun[1], sun[2]); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 1; key.shadow.camera.far = 80;
  key.shadow.camera.left = key.shadow.camera.bottom = -16;
  key.shadow.camera.right = key.shadow.camera.top = 16; key.shadow.bias = -0.0004;
  g.add(key);
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), std({ color: ground, roughness: 1.0 }));
  gp.rotation.x = -Math.PI / 2; gp.receiveShadow = true; g.add(gp);
  if (grid) {
    const gh = new THREE.GridHelper(300, 120, grid[0], grid[1]);
    gh.material.transparent = true; gh.material.opacity = 0.25; gh.position.y = 0.01; g.add(gh);
  }
  return g;
}

function mats(p, opts = {}) {
  return {
    trunk: std({ color: col(p.color.trunk), roughness: 0.9 }),
    foliage: std({ color: col(p.color.foliage), roughness: 0.85, ...(opts.foliage || {}) }),
  };
}

// --- Meadow: sunny day, green grass ------------------------------------------
const meadow = {
  label: 'Meadow',
  background: gradientSky([[0, '#7cb8e8'], [0.55, '#aed4ef'], [1, '#dcecf6']]),
  exposure: 1.0,
  rig() { return rig({ ground: 0x86a25a, hemi: [0xffffff, 0x6f8a4a], sun: [-22, 38, 26], sunColor: 0xfff4e0, sunInt: 1.7 }); },
  materials(p) { return mats(p); },
};

// --- Dusk: golden hour --------------------------------------------------------
const dusk = {
  label: 'Dusk',
  background: gradientSky([[0, '#3a2a66'], [0.45, '#8a4a72'], [0.78, '#d8806a'], [1, '#f4c486']]),
  exposure: 1.15,
  rig() { return rig({ ground: 0x4a3b4a, hemi: [0x6a4f7a, 0x2a2030], sun: [-26, 24, 22], sunColor: 0xffb070, sunInt: 1.9 }); },
  materials(p) { return mats(p); },
};

// --- Studio: clean neutral showroom ------------------------------------------
const studio = {
  label: 'Studio',
  background: new THREE.Color('#e9edf2'),
  exposure: 1.0,
  rig() { return rig({ ground: 0xeef2f6, hemi: [0xffffff, 0xc4ccd4], sun: [-18, 40, 28], sunColor: 0xffffff, sunInt: 1.8, grid: [0xc0c8d0, 0xd8dee6] }); },
  materials(p) { return mats(p); },
};

export const STYLES = { meadow, dusk, studio };
export const STYLE_KEYS = Object.keys(STYLES);
