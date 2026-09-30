import { buildTree } from "./builder.js";
import {
  ARCHETYPES,
  SLIDERS,
  paramsFromSeed,
  getDerived,
  setDerived,
} from "./params.js";
import { STYLES } from "./styles.js";
import { schemaFromSamples } from "@engine/state.js";
const samples = Object.keys(ARCHETYPES).flatMap((key) =>
  [0, 1, 42, 12345, 4294967295].map((seed) => paramsFromSeed(seed, key)),
);
export const adapter = {
  id: "tree",
  path: "procedural-tree-generator",
  label: "Procedural Tree",
  noun: "tree",
  filePrefix: "tree",
  defaultLook: "meadow",
  defaultType: null,
  colorKey: "foliage",
  colorLabel: "Hue",
  archetypes: ARCHETYPES,
  sliders: SLIDERS,
  styles: STYLES,
  paramsFromSeed,
  getDerived,
  setDerived,
  schema: schemaFromSamples(samples, SLIDERS),
  build: buildTree,
  materials: (style, params) => style.materials(params),
  paletteSlots: { foliage: "foliage", trunk: "trunk" },
  camera: {
    fov: 42,
    near: 0.1,
    far: 500,
    min: 2,
    max: 80,
    direction: [0.55, 0.25, 1],
  },
};
