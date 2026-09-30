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
import { std } from "@engine/materials.js";
import { enrichTree, TREE_SCHEMA, TREE_OPTIONS } from "./details.js";
const samples = Object.keys(ARCHETYPES).flatMap((key) =>
  [0, 1, 42, 12345, 4294967295].map((seed) => paramsFromSeed(seed, key)),
);
export const adapter = {
  id: "tree",
  path: "procedural-tree-generator",
  label: "Tree",
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
  schema: schemaFromSamples(samples, SLIDERS, TREE_SCHEMA),
  enrich: enrichTree,
  legacyConfig: (params) => params?.detailVersion === undefined,
  options: TREE_OPTIONS,
  optionsLabel: "Crown & parts",
  firstType: "oak",
  build: buildTree,
  materials: (style, params) => ({
    ...style.materials(params),
    bark: std({ color: 0x4b4132, roughness: 1 }),
    fruit: std({ color: 0xb74f36, roughness: 0.85 }),
    ground: std({ color: 0x879465, roughness: 1 }),
  }),
  paletteSlots: { foliage: "foliage", trunk: "trunk", ground: "ground" },
  camera: {
    fov: 42,
    near: 0.1,
    far: 500,
    min: 2,
    max: 80,
    direction: [0.55, 0.25, 1],
  },
};
