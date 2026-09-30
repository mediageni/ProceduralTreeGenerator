import * as THREE from "three";
export const PALETTES = {
  original: { label: "Original colors" },
  cozy: {
    label: "Cozy Village",
    sky: "#c7ddeb",
    body: ["#eee0c9", "#e1c9a5", "#c3d0ba"],
    roof: "#9e5644",
    trim: "#f9efd9",
    accent: "#517366",
    glass: "#a6d1da",
    foliage: "#60784c",
    trunk: "#6e4e37",
    ground: "#97ad75",
    rock: "#9f9686",
    water: "#619caf",
  },
  modern: {
    label: "Modern City",
    sky: "#d4e2ea",
    body: ["#e8e5de", "#b4c6ce", "#d0d4d3"],
    roof: "#465666",
    trim: "#f8faf9",
    accent: "#cf805a",
    glass: "#80b1c5",
    foliage: "#456e61",
    trunk: "#68594c",
    ground: "#b4bcb2",
    rock: "#89969e",
    water: "#639eaf",
  },
  winter: {
    label: "Winter World",
    sky: "#d2e3ef",
    body: ["#d9e5ec", "#e9cfb9", "#a4bec6"],
    roof: "#f2f7fc",
    trim: "#fbfdff",
    accent: "#8f4d49",
    glass: "#afd4e5",
    foliage: "#6c8f8e",
    trunk: "#687875",
    ground: "#edf4f9",
    rock: "#afbfcc",
    water: "#8bb6cc",
  },
};
export function applyPalette(materials, slots, key, seed) {
  const palette = PALETTES[key];
  if (!palette || key === "original") return materials;
  for (const [slot, role] of Object.entries(slots)) {
    const list = Array.isArray(materials[slot])
      ? materials[slot]
      : [materials[slot]];
    list.forEach((mat, i) => {
      if (!mat?.color || !palette[role]) return;
      const value = Array.isArray(palette[role])
        ? palette[role][(seed + i) % palette[role].length]
        : palette[role];
      mat.color.set(value);
      if (mat.userData.windowGrid) {
        mat.userData.windowGrid.color = mat.color.clone();
        mat.userData.windowGrid.win = new THREE.Color(palette.glass);
      }
    });
  }
  return materials;
}
export function paletteEnvironment(scene, rig, key, water = false) {
  const palette = PALETTES[key];
  if (!palette || key === "original") return;
  scene.background = new THREE.Color(palette.sky);
  scene.fog = null;
  rig.traverse((node) => {
    if (node.name === "environment-ground")
      node.material.color.set(water ? palette.water : palette.ground);
  });
}
