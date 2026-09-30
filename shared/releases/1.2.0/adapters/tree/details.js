import * as THREE from "three";
import { makeRng } from "@engine/rng.js";
import { part, mesh, cylinder, tube, mergePart } from "@engine/geometry.js";
import {
  detailOption,
  detailRule,
  booleanRule,
  detailed,
  choices,
  toggle,
} from "@engine/options.js";
export function enrichTree(params, legacy = false) {
  return {
    ...params,
    detailVersion: legacy ? 0 : 1,
    crownType: params.archetype === "aspen" ? "column" : "natural",
    season: "summer",
    foliageOn: true,
    rootsOn: true,
    barkOn: true,
    fruitOn: false,
    groundOn: false,
  };
}
export const TREE_SCHEMA = {
  detailVersion: detailRule,
  crownType: { type: "enum", values: ["natural", "round", "column"] },
  season: { type: "enum", values: ["summer", "autumn", "blossom", "winter"] },
  ...Object.fromEntries(
    ["foliageOn", "rootsOn", "barkOn", "fruitOn", "groundOn"].map((key) => [
      key,
      booleanRule,
    ]),
  ),
};
export const TREE_OPTIONS = [
  detailOption,
  choices(
    "crownType",
    "Crown shape",
    [
      ["natural", "Natural"],
      ["round", "Rounded"],
      ["column", "Column"],
    ],
    (p) => detailed(p) && p.kind !== "pine",
  ),
  choices(
    "season",
    "Season",
    [
      ["summer", "Summer"],
      ["autumn", "Autumn"],
      ["blossom", "Blossom"],
      ["winter", "Winter"],
    ],
    detailed,
  ),
  toggle("foliageOn", "Foliage", () => true),
  toggle("rootsOn", "Root flares"),
  toggle("barkOn", "Bark detail"),
  toggle(
    "fruitOn",
    "Fruit",
    (p) =>
      detailed(p) && p.kind !== "pine" && p.foliageOn && p.season !== "winter",
  ),
  toggle("groundOn", "Ground patch"),
];
export function treeShape(p) {
  if (!detailed(p)) return p;
  if (p.crownType === "column")
    return {
      ...p,
      branchAngle: p.branchAngle * 0.55,
      upBias: Math.max(p.upBias, 0.65),
      foliageSize: p.foliageSize * 0.8,
    };
  if (p.crownType === "round")
    return {
      ...p,
      branchAngle: Math.max(p.branchAngle, 0.72),
      upBias: 0.17,
      foliageSize: p.foliageSize * 1.12,
    };
  return p;
}
export function foliageShades(p, mat) {
  if (!detailed(p)) return [mat];
  const base = mat.clone();
  base.name = "foliage";
  if (p.season === "autumn") base.color.set("#c98236");
  if (p.season === "blossom") base.color.set("#e4a0b6");
  if (p.season === "winter") base.color.set("#e9f2f6");
  const shades = [-0.04, 0, 0.06].map((light, i) => {
    const result = base.clone();
    result.name = "foliage-" + i;
    result.color.offsetHSL(i * 0.015, 0, light);
    return result;
  });
  base.dispose();
  return shades;
}
export function addTreeDetails(root, p, mats, tips) {
  if (!detailed(p)) return;
  const r = makeRng(p.seed ^ 0xe10af777),
    R = p.trunkRadius;
  if (p.rootsOn) {
    const group = part(root, "Roots");
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + r() * 0.2;
      tube(
        group,
        mats.trunk,
        [0, R * 0.85, 0],
        [Math.cos(a) * R * 3.4, 0.025, Math.sin(a) * R * 3.4],
        R * 0.48,
        6,
        R * 0.12,
      );
    }
    mergePart(group);
  }
  if (p.barkOn) {
    const group = part(root, "Bark"),
      end = p.height * p.trunkFrac;
    for (let i = 0; i < 9; i++) {
      const y = ((i + 0.5) * end) / 10,
        a = r() * Math.PI * 2;
      const patch = mesh(
        group,
        new THREE.IcosahedronGeometry(1, 0),
        mats.bark,
        [Math.cos(a) * R * 0.96, y, Math.sin(a) * R * 0.96],
      );
      patch.scale.set(
        R * 0.18,
        R * (p.archetype === "aspen" ? 0.08 : 0.32),
        R * 0.1,
      );
      patch.rotation.y = -a;
    }
    mergePart(group);
  }
  if (p.fruitOn && p.kind !== "pine" && p.foliageOn && p.season !== "winter") {
    const group = part(root, "Fruit");
    for (const tip of tips.filter((_, i) => i % 3 === 0).slice(0, 16)) {
      const apple = mesh(
        group,
        new THREE.IcosahedronGeometry(p.foliageSize * 0.095, 1),
        mats.fruit,
        [
          tip.x + p.foliageSize * 0.3,
          tip.y - p.foliageSize * 0.5,
          tip.z + p.foliageSize * 0.25,
        ],
      );
      apple.scale.y = 1.1;
    }
    mergePart(group);
  }
  if (p.groundOn) {
    const group = part(root, "Ground");
    cylinder(
      group,
      mats.ground,
      Math.max(R * 5, p.height * 0.23),
      0.07,
      [0, -0.025, 0],
      12,
    );
  }
}
