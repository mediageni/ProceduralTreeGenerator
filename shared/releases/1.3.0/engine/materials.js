import * as THREE from "three";
export const col = (hsl) =>
  new THREE.Color().setHSL(((hsl.h % 1) + 1) % 1, hsl.s, hsl.l);
export const std = (options) =>
  new THREE.MeshStandardMaterial({ flatShading: true, ...options });
export function groundPlane(material, size = 600) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.name = "environment-ground";
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
export function gradientSky(stops) {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d"),
    gradient = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function sunRig({
  hemi,
  sun,
  sunColor = 0xffffff,
  sunInt = 1.6,
  ground,
  water,
  fill,
  grid,
  waterRough = 0.35,
  waterMetal = 0.1,
  size = 600,
  extent = 36,
  far = 160,
  hemiIntensity = 0.85,
  near = 1,
  point = null,
  gridDivisions = 120,
  gridOpacity = 0.25,
  gridY = 0.01,
  roughness = 0.97,
}) {
  const root = new THREE.Group();
  root.add(new THREE.HemisphereLight(hemi[0], hemi[1], hemiIntensity));
  const light = new THREE.DirectionalLight(sunColor, sunInt);
  light.position.set(...sun);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.near = near;
  light.shadow.camera.far = far;
  light.shadow.camera.left = light.shadow.camera.bottom = -extent;
  light.shadow.camera.right = light.shadow.camera.top = extent;
  light.shadow.bias = -0.0004;
  root.add(light);
  if (fill)
    root.add(new THREE.DirectionalLight(fill[0], fill[1]).translateX(-30));
  root.add(
    groundPlane(
      std({
        color: water ?? ground,
        roughness: water != null ? waterRough : roughness,
        metalness: water != null ? waterMetal : 0,
      }),
      size,
    ),
  );
  if (grid) {
    const mesh = new THREE.GridHelper(size, gridDivisions, grid[0], grid[1]);
    mesh.material.transparent = true;
    mesh.material.opacity = gridOpacity;
    mesh.position.y = gridY;
    root.add(mesh);
  }
  if (point) {
    const lamp = new THREE.PointLight(point, 0.7, 40);
    lamp.position.set(0, 4, 3);
    root.add(lamp);
  }
  return root;
}
// Window settings are consumed by real pane geometry, never a GPU-only shader.
export function makeWindowMaterial(options) {
  const material = std({
    color: options.color,
    roughness: options.kind === "tower" ? 0.74 : 0.85,
    metalness: options.kind === "tower" && !options.night ? 0.12 : 0,
  });
  material.userData.windowGrid = {
    ...options,
    color: options.color.clone(),
    win: options.win.clone(),
  };
  return material;
}
export function windowMaterials(settings, y = 0) {
  const tower = settings.kind === "tower",
    glass = new THREE.Color(
      tower ? 0.64 : 0.62,
      tower ? 0.78 : 0.76,
      tower ? 0.94 : 0.92,
    );
  const sheen =
    (tower ? 0.07 : 0.08) * ((((y * (tower ? 0.5 : 0.7)) % 1) + 1) % 1);
  const tint = glass.clone().addScalar(sheen);
  const material = std({
    color: settings.night
      ? settings.color
      : settings.color.clone().lerp(tint, tower ? 0.8 : 0.82),
    roughness: tower ? 0.32 : 0.1,
    metalness: settings.night ? 0 : tower ? 0.3 : 0.28,
    emissive: settings.night ? settings.win : glass,
    emissiveIntensity: settings.night
      ? tower
        ? 1.7
        : 1.8
      : tower
        ? 0.1
        : 0.12,
  });
  const unlit = material.clone();
  if (tower) {
    for (const pane of [material, unlit]) {
      pane.polygonOffset = true;
      pane.polygonOffsetFactor = -1;
      pane.polygonOffsetUnits = -1;
    }
  }
  unlit.emissiveIntensity = settings.night
    ? material.emissiveIntensity * (tower ? 0.04 : 0.05)
    : material.emissiveIntensity;
  return { lit: material, unlit };
}
const fract = (v) => v - Math.floor(v);
export function windowIsLit(cx, cy, settings) {
  return (
    fract(
      Math.sin(cx * 127.1 + cy * 311.7 + (settings.seed % 1000) * 0.1) *
        43758.5453,
    ) <= settings.litChance
  );
}
export function materializeWindows(root) {
  root.updateMatrixWorld(true);
  const walls = [];
  root.traverse((node) => {
    if (node.isMesh && node.material?.userData.windowGrid) walls.push(node);
  });
  const panes = new THREE.Group();
  panes.name = "Window panes";
  const pairs = new Map();
  for (const wall of walls) {
    const s = wall.material.userData.windowGrid,
      bounds = new THREE.Box3().setFromObject(wall);
    const tower = s.kind === "tower",
      offset = tower ? 0 : 0.4,
      low = tower ? 0.16 : 0.3,
      high = tower ? 0.84 : 0.82;
    let pair = pairs.get(wall.material);
    if (!pair) {
      pair = windowMaterials(s);
      pairs.set(wall.material, pair);
      pair.lit.name = "window-lit";
      pair.unlit.name = "window-unlit";
    }
    for (const face of ["x", "z"]) {
      const axis = face === "x" ? "z" : "x",
        min = bounds.min[axis],
        max = bounds.max[axis];
      for (
        let cx = Math.floor(min / s.colW);
        cx <= Math.floor(max / s.colW);
        cx++
      ) {
        const left = Math.max(
            min,
            cx * s.colW + (1 - s.winFill) * 0.5 * s.colW,
          ),
          right = Math.min(
            max,
            (cx + 1) * s.colW - (1 - s.winFill) * 0.5 * s.colW,
          );
        if (right - left < 0.015) continue;
        for (
          let cy = Math.floor((bounds.min.y - offset) / s.floorH);
          cy <= Math.floor((bounds.max.y - offset) / s.floorH);
          cy++
        ) {
          const bottom = Math.max(
              bounds.min.y,
              offset + (cy + low) * s.floorH,
              tower ? 0 : 0.4,
            ),
            top = Math.min(bounds.max.y, offset + (cy + high) * s.floorH);
          if (top - bottom < 0.015) continue;
          for (const sign of [-1, 1]) {
            const plane = new THREE.Mesh(
              new THREE.PlaneGeometry(right - left, top - bottom),
              windowIsLit(cx, cy, s) ? pair.lit : pair.unlit,
            );
            plane.name = "window-pane";
            plane.position.y = (top + bottom) / 2;
            plane.position[axis] = (left + right) / 2;
            const separation = tower
              ? Math.max(0.008, Math.min(s.colW, s.floorH) * 0.012)
              : 0.008;
            plane.position[face] =
              (sign > 0 ? bounds.max[face] : bounds.min[face]) +
              sign * separation;
            plane.rotation.y =
              face === "z"
                ? sign > 0
                  ? 0
                  : Math.PI
                : sign > 0
                  ? Math.PI / 2
                  : -Math.PI / 2;
            plane.receiveShadow = true;
            panes.add(plane);
          }
        }
      }
    }
  }
  if (panes.children.length) {
    mergeMeshes(panes);
    // Thin glass must not pick up unstable self-shadow samples from its own wall.
    if (
      walls.some((wall) => wall.material.userData.windowGrid.kind === "tower")
    )
      for (const pane of panes.children) pane.receiveShadow = false;
    root.add(panes);
  } else
    for (const pair of pairs.values()) {
      pair.lit.dispose();
      pair.unlit.dispose();
    }
  return root;
}

// Merge repeated architectural parts by material without merging component groups.
export function mergeMeshes(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(),
    buckets = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh || Array.isArray(mesh.material)) continue;
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    const list = buckets.get(mesh.material) ?? [];
    list.push(geometry);
    buckets.set(mesh.material, list);
    group.remove(mesh);
    mesh.geometry.dispose();
  }
  for (const [material, parts] of buckets) {
    const geometry = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      if (!parts.every((part) => part.getAttribute(name))) continue;
      const attrs = parts.map((part) => part.getAttribute(name)),
        count = attrs.reduce((sum, attr) => sum + attr.array.length, 0),
        array = new Float32Array(count);
      let at = 0;
      for (const attr of attrs) {
        array.set(attr.array, at);
        at += attr.array.length;
      }
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(array, attrs[0].itemSize),
      );
    }
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name || "architectural-parts";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
