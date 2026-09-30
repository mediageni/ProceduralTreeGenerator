import * as THREE from "three";
import { makeRng } from "@engine/rng.js";
import { part, mesh, tube, mergePart, finishModel } from "@engine/geometry.js";
import { treeShape, foliageShades, addTreeDetails } from "./details.js";

// Branch structure determines the crown. Every foliage cluster contains a twig;
// there is no detached random dome added above the branch skeleton.
export function buildNaturalTree(input, mats) {
  const p = treeShape(input),
    root = new THREE.Group();
  root.name = "tree";
  const branches = part(root, "Branches"),
    foliage = part(root, "Foliage");
  const r = makeRng(p.seed ^ 0x713ee51a),
    H = p.height,
    R = p.trunkRadius;
  const trunkMat = p.archetype === "aspen" ? mats.trunk.clone() : mats.trunk;
  if (p.archetype === "aspen") {
    trunkMat.color.set("#d8daca");
    trunkMat.name = "aspen-bark";
  }
  const leafy =
    p.foliageOn !== false && (p.season !== "winter" || p.kind === "pine");
  const shades = leafy ? foliageShades(p, mats.foliage) : [];
  const tips = [],
    trunk = [],
    phase = r() * Math.PI * 2;
  const trunkHeight =
    H * (p.archetype === "bush" ? 0.5 : p.archetype === "oak" ? 0.76 : 0.97);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const point = new THREE.Vector3(
      Math.sin(t * 2.1 + phase) * t * H * 0.018,
      trunkHeight * t,
      Math.cos(t * 1.7 + phase) * t * H * 0.012,
    );
    const radius = Math.max(R * 0.1, R * (1 - t * 0.89));
    trunk.push({ point, radius });
    if (i)
      tube(
        branches,
        trunkMat,
        trunk[i - 1].point.toArray(),
        point.toArray(),
        trunk[i - 1].radius,
        7,
        radius,
      );
  }
  function trunkAt(y) {
    const t = Math.max(0, Math.min(1, y / trunkHeight)) * 8,
      i = Math.min(7, Math.floor(t)),
      f = t - i;
    return {
      point: trunk[i].point.clone().lerp(trunk[i + 1].point, f),
      radius: THREE.MathUtils.lerp(trunk[i].radius, trunk[i + 1].radius, f),
    };
  }
  let clusters = 0;
  const budget = 100 + p.blobsPerCluster * 60;
  function cluster(center, size, direction, pine = false) {
    if (!leafy || clusters >= budget) return;
    const geo = new THREE.IcosahedronGeometry(1, 1),
      positions = geo.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      const variation =
        1 + 0.055 * Math.sin(x * 4.1 + y * 6.3 + z * 5.2 + phase);
      positions.setXYZ(i, x * variation, y * variation, z * variation);
    }
    geo.computeVertexNormals();
    const node = mesh(
      foliage,
      geo,
      shades[clusters++ % shades.length],
      center.toArray(),
    );
    node.scale.set(...size);
    if (pine)
      node.quaternion.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        direction.clone().normalize(),
      );
    else node.rotation.y = r() * Math.PI * 2;
  }
  if (p.kind === "pine") {
    const tiers = Math.round(p.pineTiers),
      width = Math.min(p.crownWidth, H * 0.36);
    for (let tier = 0; tier < tiers; tier++) {
      const t = tier / tiers,
        y = H * (0.2 + t * 0.69),
        base = trunkAt(y);
      const length = width * Math.pow(1 - t, 0.8) * (0.88 + 0.18 * r());
      const count = 5 + (tier % 3);
      for (let i = 0; i < count; i++) {
        const angle =
          phase + tier * 0.83 + (i * Math.PI * 2) / count + (r() - 0.5) * 0.18;
        const dir = new THREE.Vector3(
          Math.cos(angle),
          -0.11 - r() * 0.09,
          Math.sin(angle),
        );
        const end = base.point.clone().addScaledVector(dir, length);
        tube(
          branches,
          trunkMat,
          base.point.toArray(),
          end.toArray(),
          Math.max(0.012, base.radius * 0.4),
          5,
          0.007,
        );
        const center = base.point.clone().lerp(end, 0.62);
        cluster(
          center,
          [length * 0.59, Math.max(H * 0.027, length * 0.18), length * 0.3],
          dir,
          true,
        );
        tips.push(end);
      }
    }
    // A short leader crown closes the tip instead of an unsupported needle cone.
    if (leafy)
      mesh(
        foliage,
        new THREE.ConeGeometry(width * 0.17, H * 0.17, 7),
        shades[0],
        [trunk.at(-1).point.x, H * 0.925, trunk.at(-1).point.z],
      );
  } else {
    const bush = p.archetype === "bush",
      oak = p.archetype === "oak",
      aspen = p.archetype === "aspen";
    const clear =
      H * (bush ? 0.12 : oak ? Math.min(p.trunkFrac, 0.32) : p.trunkFrac);
    let width = H * (bush ? 0.42 : oak ? 0.34 : aspen ? 0.13 : 0.23);
    width *= Math.max(0.45, Math.min(1.5, p.branchAngle / (oak ? 0.8 : 0.6)));
    if (p.crownType === "column") width *= 0.78;
    if (p.crownType === "round") width *= 1.15;
    const leafSize =
      Math.min(p.foliageSize * 0.53, H * 0.13) *
      (0.75 + p.blobsPerCluster * 0.055);
    let limbs = 0;
    function branch(start, end, radius, depth) {
      if (limbs++ > 240) return;
      const middle = start.clone().lerp(end, 0.52);
      middle.y += H * p.curve * 0.08;
      tube(
        branches,
        trunkMat,
        start.toArray(),
        middle.toArray(),
        radius,
        6,
        radius * 0.74,
      );
      tube(
        branches,
        trunkMat,
        middle.toArray(),
        end.toArray(),
        radius * 0.74,
        5,
        Math.max(0.006, radius * 0.45),
      );
      if (depth <= 0 || radius < R * 0.12) {
        tips.push(end.clone());
        const size = leafSize * (0.82 + r() * 0.35);
        const scale =
          aspen || p.crownType === "column"
            ? [0.77, 1.22, 0.77]
            : [oak ? 1.22 : 1, bush ? 0.78 : 0.88, 1.04];
        cluster(
          end,
          scale.map((v) => v * size),
          end.clone().sub(start),
        );
        if (p.blobsPerCluster > 4) {
          const second = end.clone().lerp(start, 0.24);
          cluster(
            second,
            scale.map((v) => v * size * 0.72),
            end.clone().sub(start),
          );
        }
        return;
      }
      const direction = end.clone().sub(start),
        length = direction.length();
      const angle = Math.atan2(direction.z, direction.x);
      const children = Math.min(3, Math.round(p.splits));
      for (let i = 0; i < children; i++) {
        const az = angle + (i - (children - 1) / 2) * (0.75 + r() * 0.2);
        const next = end
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(az) * length * 0.4,
              length * (0.18 + p.upBias * 0.17),
              Math.sin(az) * length * 0.4,
            ),
          );
        branch(end, next, radius * p.branchRadRatio, depth - 1);
      }
    }
    const tiers = Math.round(p.levels) + 2;
    for (let tier = 0; tier < tiers; tier++) {
      const t = (tier + 0.2) / tiers;
      const y = clear + (H * 0.77 - clear) * t;
      const origin = bush
        ? new THREE.Vector3(0, H * 0.08, 0)
        : trunkAt(y).point;
      const count = bush ? 3 : oak ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const az = phase + tier * 1.72 + (i * Math.PI * 2) / count;
        const spread =
          width * Math.sin(Math.PI * (t * 0.73 + 0.12)) * (0.85 + r() * 0.2);
        const end = new THREE.Vector3(
          origin.x + Math.cos(az) * spread,
          bush ? H * (0.37 + t * 0.25) : y + H * 0.075,
          origin.z + Math.sin(az) * spread,
        );
        branch(
          origin,
          end,
          R * (bush ? 0.53 : 0.52 * (1 - t * 0.58)),
          Math.min(2, Math.max(0, Math.round(p.levels) - 1)),
        );
      }
    }
    const leader = trunkAt(trunkHeight).point;
    tips.push(leader);
    cluster(
      leader,
      [leafSize * 0.8, leafSize, leafSize * 0.8],
      new THREE.Vector3(0, 1, 0),
    );
  }
  mergePart(branches);
  mergePart(foliage);
  for (const mat of shades)
    if (!foliage.children.some((n) => n.material === mat)) mat.dispose();
  addTreeDetails(root, input, { ...mats, trunk: trunkMat }, tips, { trunkAt });
  return finishModel(root);
}
