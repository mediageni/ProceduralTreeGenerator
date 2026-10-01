// Tree parameters: archetype presets + seed -> params, URL (de)serialization.
// Pure data, no Three.js. Legacy growth and connected botanical growth share
// these deterministic dimensions. New species never change untyped old seeds.

import { makeRng, rng } from "@engine/rng.js";

const r2 = (v) => Math.round(v * 1000) / 1000;

const BASE = {
  kind: "broadleaf", // 'broadleaf' | 'pine' | 'palm'
  height: [4.5, 7],
  trunkFrac: [0.32, 0.44], // first trunk segment as a fraction of height
  trunkRadius: [0.13, 0.2],
  trunkTaper: [0.74, 0.86], // child/parent radius falloff
  levels: [2, 3], // branch recursion depth (kept calm)
  splits: [2, 3], // child branches per node
  branchAngle: [0.4, 0.65], // spread from the parent (radians)
  branchLenRatio: [0.62, 0.78],
  branchRadRatio: [0.62, 0.74],
  upBias: [0.3, 0.5], // upward pull on child branches
  curve: [0.0, 0.14], // per-branch bend
  foliageSize: [1.0, 1.4], // big chunks (a few overlap into a crown)
  blobsPerCluster: [3, 5], // extra fill chunks in the dome
  crownWidth: [1.3, 2.0], // pine cone base radius
  pineTiers: [6, 9],
};

export const ARCHETYPES = {
  deciduous: {
    label: "Deciduous",
    height: [5, 7],
    levels: [2, 3],
    splits: [2, 3],
    branchAngle: [0.4, 0.6],
    upBias: [0.3, 0.5],
    foliageSize: [1.05, 1.5],
  },
  pine: {
    label: "Pine",
    kind: "pine",
    height: [6, 9],
    trunkRadius: [0.12, 0.18],
    crownWidth: [1.4, 2.2],
    pineTiers: [6, 10],
  },
  bush: {
    label: "Bush",
    height: [1.8, 3.0],
    trunkFrac: [0.1, 0.18],
    trunkRadius: [0.08, 0.13],
    levels: [2, 2],
    splits: [3, 4],
    branchAngle: [0.6, 0.9],
    upBias: [0.15, 0.35],
    foliageSize: [0.85, 1.2],
    blobsPerCluster: [4, 6],
  },
  oak: {
    label: "Oak",
    height: [4.5, 6.5],
    trunkRadius: [0.2, 0.28],
    trunkFrac: [0.26, 0.34],
    levels: [2, 3],
    splits: [3, 3],
    branchAngle: [0.65, 0.9],
    branchLenRatio: [0.6, 0.72],
    upBias: [0.12, 0.3],
    foliageSize: [1.3, 1.8],
    blobsPerCluster: [4, 6],
  },
  aspen: {
    label: "Aspen",
    height: [6, 9],
    trunkRadius: [0.1, 0.15],
    trunkFrac: [0.46, 0.6],
    levels: [2, 2],
    splits: [2, 2],
    branchAngle: [0.3, 0.48],
    branchLenRatio: [0.66, 0.8],
    upBias: [0.45, 0.62],
    foliageSize: [0.75, 1.05],
    blobsPerCluster: [3, 4],
  },
  birch: {
    label: "Birch",
    height: [6, 9],
    trunkRadius: [0.1, 0.16],
    trunkFrac: [0.38, 0.48],
    levels: [3, 3],
    branchAngle: [0.48, 0.65],
    foliageSize: [0.7, 1],
  },
  willow: {
    label: "Weeping willow",
    height: [5.5, 8],
    trunkRadius: [0.22, 0.3],
    trunkFrac: [0.22, 0.3],
    levels: [3, 4],
    branchAngle: [0.8, 1.1],
    foliageSize: [0.75, 1.1],
  },
  sakura: {
    label: "Sakura",
    height: [4, 6.5],
    trunkRadius: [0.14, 0.22],
    trunkFrac: [0.28, 0.38],
    levels: [3, 3],
    branchAngle: [0.75, 1],
    foliageSize: [0.8, 1.2],
    blobsPerCluster: [4, 6],
  },
  japaneseMaple: {
    label: "Japanese maple",
    height: [3, 5],
    trunkRadius: [0.12, 0.2],
    trunkFrac: [0.2, 0.3],
    levels: [3, 3],
    branchAngle: [0.8, 1.1],
    foliageSize: [0.8, 1.1],
  },
  bonsai: {
    label: "Bonsai pine",
    height: [1.5, 2.4],
    trunkRadius: [0.14, 0.23],
    trunkFrac: [0.18, 0.26],
    levels: [2, 3],
    branchAngle: [0.9, 1.1],
    foliageSize: [0.7, 1],
    curve: [0.15, 0.25],
  },
  spruce: {
    label: "Spruce",
    kind: "pine",
    height: [6, 9],
    trunkRadius: [0.13, 0.19],
    crownWidth: [1.6, 2.4],
    pineTiers: [8, 11],
  },
  cypress: {
    label: "Cypress",
    kind: "pine",
    height: [7, 10],
    trunkRadius: [0.12, 0.19],
    crownWidth: [0.8, 1.1],
    pineTiers: [8, 10],
  },
  palm: {
    label: "Palm",
    kind: "palm",
    height: [5, 8],
    trunkRadius: [0.14, 0.2],
    trunkFrac: [0.76, 0.86],
    levels: [1, 1],
    foliageSize: [0.8, 1.2],
  },
};
export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);
// Untyped old seeds keep selecting among the original five presets.
export const LEGACY_KEYS = ["deciduous", "pine", "bush", "oak", "aspen"];

// `kinds` limits which tree kind shows the slider; omitted = always shown.
export const SLIDERS = [
  { key: "height", label: "Height", min: 1.5, max: 11, step: 0.1 },
  { key: "trunkRadius", label: "Trunk", min: 0.05, max: 0.34, step: 0.005 },
  {
    key: "levels",
    label: "Branching",
    min: 1,
    max: 5,
    step: 1,
    kinds: ["broadleaf"],
  },
  {
    key: "branchAngle",
    label: "Spread",
    min: 0.2,
    max: 1.3,
    step: 0.02,
    kinds: ["broadleaf"],
  },
  {
    key: "foliageSize",
    label: "Leaf size",
    min: 0.4,
    max: 1.6,
    step: 0.02,
    kinds: ["broadleaf"],
  },
  {
    key: "blobsPerCluster",
    label: "Leaf density",
    min: 1,
    max: 7,
    step: 1,
    kinds: ["broadleaf"],
  },
  {
    key: "crownWidth",
    label: "Pine width",
    min: 0.8,
    max: 2.6,
    step: 0.05,
    kinds: ["pine"],
  },
  {
    key: "pineTiers",
    label: "Pine layers",
    min: 3,
    max: 12,
    step: 1,
    kinds: ["pine"],
  },
];

function sample(r, spec) {
  if (Array.isArray(spec)) {
    if (
      spec.length === 2 &&
      typeof spec[0] === "number" &&
      typeof spec[1] === "number"
    )
      return r2(rng.range(r, spec[0], spec[1]));
    return rng.pick(r, spec);
  }
  return spec;
}
const PARAM_KEYS = Object.keys(BASE);

export function paramsFromSeed(seed, archetype) {
  const r = makeRng(seed);
  const key =
    archetype && ARCHETYPES[archetype] ? archetype : rng.pick(r, LEGACY_KEYS);
  const a = { ...BASE, ...ARCHETYPES[key] };
  const p = { seed: seed >>> 0, archetype: key };
  for (const k of PARAM_KEYS) p[k] = sample(r, a[k]);
  const autumn = r() < 0.16;
  p.color = {
    foliage: autumn
      ? {
          h: r2(rng.range(r, 0.04, 0.11)),
          s: r2(rng.range(r, 0.6, 0.85)),
          l: r2(rng.range(r, 0.42, 0.52)),
        }
      : {
          h: r2(rng.range(r, 0.24, 0.4)),
          s: r2(rng.range(r, 0.4, 0.68)),
          l: r2(rng.range(r, 0.32, 0.46)),
        },
    trunk: {
      h: r2(rng.range(r, 0.06, 0.1)),
      s: r2(rng.range(r, 0.35, 0.55)),
      l: r2(rng.range(r, 0.2, 0.3)),
    },
  };
  if (key === "sakura") p.color.foliage = { h: 0.3, s: 0.46, l: 0.44 };
  if (key === "japaneseMaple") p.color.foliage = { h: 0.015, s: 0.72, l: 0.32 };
  return p;
}

export function setDerived(p, key, value) {
  p[key] = value;
}
export const getDerived = (p, key) => p[key];

export { encodeConfig, decodeConfig } from "@engine/state.js";
