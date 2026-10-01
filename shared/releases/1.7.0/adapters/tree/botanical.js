import * as THREE from "three";
import { ProceduralTree } from "three/addons/proctree.js";
import { makeRng } from "@engine/rng.js";
import { shapeSegments } from "@engine/finish.js";
import { part, mesh, tube, mergePart, finishModel } from "@engine/geometry.js";
import { treeShape } from "./details.js";
import { canopyGeometry } from "./canopy.js";

// proctree supplies a connected, tapering fork mesh. Species envelopes, actual
// folded leaves, flowers, whorls and fronds are authored here, with no textures.
const Y = new THREE.Vector3(0, 1, 0);
const V = (a) => new THREE.Vector3(...a);
const clamp = THREE.MathUtils.clamp;
const SPECIES = {
  deciduous: { width: 0.38, clear: 0.34 },
  oak: { width: 0.49, clear: 0.25 },
  bush: { width: 0.48, clear: 0.12 },
  aspen: { width: 0.18, clear: 0.48 },
  birch: { width: 0.28, clear: 0.4, white: true },
  sakura: { width: 0.51, clear: 0.3 },
  japaneseMaple: { width: 0.59, clear: 0.22 },
  willow: { width: 0.5, clear: 0.29, weeping: true },
  bonsai: { width: 0.67, clear: 0.19, gnarl: true },
  pine: { width: 0.29 },
  spruce: { width: 0.36 },
  cypress: { width: 0.12 },
  palm: { width: 0.4 },
};
function leafGeometry(length, width, lobed = false) {
  const outline = lobed
    ? [
        [0, 0],
        [0.38, -0.25],
        [0.52, -0.7],
        [0.65, -0.34],
        [1, 0],
        [0.65, 0.34],
        [0.52, 0.7],
        [0.38, 0.25],
      ]
    : [
        [0, 0],
        [0.46, -0.5],
        [1, 0],
        [0.46, 0.5],
      ];
  const positions = outline.map(([x, z]) => [x * length, 0, z * width]).flat(),
    indices = [];
  const top = outline.length,
    bottom = top + 1;
  positions.push(
    length * 0.46,
    length * 0.055,
    0,
    length * 0.46,
    -length * 0.012,
    0,
  );
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    indices.push(top, j, i, bottom, i, j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.userData.smoothSurface = true;
  return g;
}
export function buildBotanicalTree(input, mats) {
  const p = treeShape(input),
    spec = SPECIES[p.archetype] || SPECIES.deciduous,
    H = p.height,
    R = p.trunkRadius,
    r = makeRng(p.seed ^ 0x623e2ab1),
    root = new THREE.Group();
  root.name = "tree";
  const branches = part(root, "Branches"),
    twigs = part(root, "Twigs"),
    foliage = part(root, "Foliage"),
    tips = [],
    shoots = [],
    crown = [];
  const bark = mats.trunk.clone();
  bark.name =
    spec.white || p.archetype === "aspen" ? "birch-bark" : "tree-bark";
  if (spec.white || p.archetype === "aspen") bark.color.set("#dddacb");
  const shades = [-0.04, 0, 0.035].map((d, i) => {
    const m = mats.foliage.clone();
    m.name = "foliage-" + i;
    const hsl = m.color.getHSL({});
    if (
      hsl.s > 0.2 &&
      hsl.h < 0.19 &&
      p.archetype !== "japaneseMaple" &&
      (p.season === "summer" || p.kind === "pine" || p.kind === "palm")
    )
      m.color.setHSL(
        0.29 + (p.seed % 17) * 0.002,
        0.45,
        clamp(hsl.l, 0.32, 0.44),
      );
    if (p.season === "autumn" && p.kind !== "pine" && p.kind !== "palm")
      m.color.set("#bd7030");
    if (p.season === "blossom") m.color.set("#e7a8be");
    if (p.season === "winter") m.color.lerp(new THREE.Color("#d2ded8"), 0.22);
    m.color.offsetHSL(0, 0, d);
    return m;
  });
  const leafy =
    p.foliageOn &&
    (p.season !== "winter" ||
      p.kind === "pine" ||
      p.kind === "palm" ||
      spec.gnarl);
  const twigRadius = Math.max(H * 0.0008, R * 0.019),
    leafLength = H * 0.048 * p.foliageSize,
    leafGeo = leafGeometry(
      leafLength,
      leafLength * 0.56,
      p.archetype === "japaneseMaple",
    ),
    needleGeo = leafGeometry(leafLength * 0.72, leafLength * 0.16),
    bloomGeo = new THREE.IcosahedronGeometry(H * 0.014 * p.foliageSize, 0);
  let leafCount = 0,
    branchCount = 0;
  const leafBudget = 2400;
  function leafAt(anchor, direction, scale = 1, needle = false, bloom = false) {
    if (!leafy || leafCount >= leafBudget) return;
    const dir = direction.clone().normalize();
    const node = mesh(
      foliage,
      bloom ? bloomGeo.clone() : (needle ? needleGeo : leafGeo).clone(),
      shades[leafCount++ % 3],
      anchor.toArray(),
    );
    node.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    const roll = r();
    node.rotateX(p.kind === "palm" ? (roll - 0.5) * 0.18 : roll * Math.PI);
    node.scale.setScalar(scale);
  }
  function clusterAt(anchor, radius) {
    if (!leafy || leafCount >= leafBudget) return;
    crown.push({
      center: anchor.toArray(),
      radii: [radius, radius * (spec.gnarl ? 0.4 : 0.75), radius * 0.9],
    });
    leafCount++;
  }
  function shoot(from, to, needle = false) {
    if (leafy) shoots.push([from.clone(), to.clone(), needle]);
  }
  function renderShoot(from, to, needle = false) {
    if (!leafy) return;
    const delta = to.clone().sub(from),
      axis = delta.clone().normalize(),
      side = new THREE.Vector3()
        .crossVectors(
          axis,
          Math.abs(axis.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0),
        )
        .normalize(),
      other = new THREE.Vector3().crossVectors(axis, side).normalize(),
      count = Math.max(
        1,
        Math.min(
          clamp(Math.round(p.blobsPerCluster * (needle ? 0.9 : 2.3)), 3, 16),
          Math.floor(
            leafBudget / (shoots.length * (p.season === "blossom" ? 3 : 1)),
          ),
        ),
      );
    if (p.foliageMode === "clusters") {
      const radius = H * clamp(p.foliageSize * 0.115, 0.065, 0.2);
      clusterAt(from.clone().lerp(to, 0.65), radius);
      clusterAt(to, radius * 0.83);
      return;
    }
    for (let i = 0; i < count; i++) {
      const t = 0.22 + (0.78 * (i + 0.5)) / count,
        at = from.clone().addScaledVector(delta, t),
        angle = i * 2.39996 + r() * 0.38;
      const dir = side
        .clone()
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(other, Math.sin(angle))
        .addScaledVector(axis, 0.18)
        .normalize();
      const end = at
        .clone()
        .addScaledVector(dir, leafLength * (0.11 + 0.13 * r()));
      tube(
        twigs,
        bark,
        at.toArray(),
        end.toArray(),
        twigRadius,
        4,
        twigRadius * 0.62,
      );
      const scale = 0.7 + r() * 0.52;
      if (p.season === "blossom") {
        leafAt(end, dir, scale, false, true);
        for (let k = 0; k < 2; k++)
          leafAt(
            end.clone().addScaledVector(dir, H * 0.009 * (k + 1)),
            dir,
            scale * 0.72,
            false,
            true,
          );
      } else leafAt(end, dir, scale, needle);
    }
  }
  const skeleton = [];
  let trunkAt;
  if (p.kind === "pine" || p.kind === "palm") {
    const palm = p.kind === "palm",
      curve = palm ? 0.085 : 0.013;
    const spine = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12,
        point = new THREE.Vector3(
          H * curve * t * t,
          H * t,
          Math.sin(t * 2) * H * curve * 0.24,
        ),
        radius = R * (palm ? 1 - t * 0.38 : 1 - t * 0.93);
      spine.push({ point, radius });
      if (i)
        tube(
          branches,
          bark,
          spine[i - 1].point.toArray(),
          point.toArray(),
          spine[i - 1].radius,
          7,
          radius,
        );
    }
    trunkAt = (y) => {
      const t = clamp(y / H, 0, 0.999) * 12,
        i = Math.floor(t);
      return {
        point: spine[i].point.clone().lerp(spine[i + 1].point, t - i),
        radius: THREE.MathUtils.lerp(
          spine[i].radius,
          spine[i + 1].radius,
          t - i,
        ),
      };
    };
    if (palm) {
      const origin = spine.at(-1).point,
        count = 11;
      for (let i = 0; i < count; i++) {
        const az = (i * Math.PI * 2) / count + r() * 0.18,
          dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)),
          length = H * (0.27 + r() * 0.07);
        let previous = origin.clone();
        for (let j = 1; j <= 18; j++) {
          const t = j / 18,
            point = origin.clone().addScaledVector(dir, length * t);
          point.y += H * (0.12 * Math.sin(t * Math.PI) - 0.08 * t * t);
          tube(
            branches,
            bark,
            previous.toArray(),
            point.toArray(),
            R * 0.085 * (1 - (j - 1) / 18),
            5,
            Math.max(twigRadius, R * 0.085 * (1 - t)),
          );
          for (const side of [-1, 1]) {
            const anchor = previous.clone().lerp(point, 0.6),
              leafDir = new THREE.Vector3(-dir.z, 0, dir.x)
                .multiplyScalar(side)
                .addScaledVector(dir, 0.26)
                .add(new THREE.Vector3(0, -0.16, 0))
                .normalize();
            leafAt(
              anchor,
              leafDir,
              7 * (0.2 + 0.75 * Math.sin(t * Math.PI)),
              true,
            );
          }
          previous = point;
        }
        tips.push(previous);
      }
    } else {
      const tiers = clamp(Math.round(p.pineTiers), 3, 12),
        width = Math.min(p.crownWidth, H * spec.width),
        phase = r() * Math.PI * 2;
      for (let tier = 0; tier < tiers; tier++) {
        const t = tier / tiers,
          y = H * (0.17 + t * 0.78),
          base = trunkAt(y),
          length = width * Math.pow(1 - t, 0.85),
          count = 5 + (tier % 3);
        for (let i = 0; i < count; i++) {
          const angle = phase + (i * Math.PI * 2) / count + tier * 1.38,
            dir = new THREE.Vector3(
              Math.cos(angle),
              p.archetype === "spruce" ? -0.17 : 0.08,
              Math.sin(angle),
            );
          const end = base.point.clone().addScaledVector(dir, length),
            middle = base.point.clone().lerp(end, 0.52);
          middle.y += H * 0.018;
          tube(
            branches,
            bark,
            base.point.toArray(),
            middle.toArray(),
            base.radius * 0.48,
            5,
            base.radius * 0.24,
          );
          tube(
            branches,
            bark,
            middle.toArray(),
            end.toArray(),
            base.radius * 0.24,
            5,
            twigRadius,
          );
          if (leafy && p.foliageMode === "clusters") {
            for (const t of [0.35, 0.72, 0.94]) {
              const anchor = base.point.clone().lerp(end, t);
              crown.push({
                center: anchor.toArray(),
                radii: [
                  length * (0.46 - t * 0.17),
                  H * (0.04 + (1 - tier / tiers) * 0.025),
                  length * (0.46 - t * 0.17),
                ],
              });
              leafCount++;
            }
          }
          for (let k = 0; k < 5; k++) {
            if (p.foliageMode === "clusters") break;
            const t = 0.25 + k * 0.14,
              at =
                t <= 0.52
                  ? base.point.clone().lerp(middle, t / 0.52)
                  : middle.clone().lerp(end, (t - 0.52) / 0.48),
              cross = new THREE.Vector3(-dir.z, 0.12, dir.x);
            for (const side of [-1, 1]) {
              const tip = at
                .clone()
                .addScaledVector(cross, side * length * (0.18 - k * 0.018))
                .addScaledVector(dir, length * 0.1);
              tube(
                twigs,
                bark,
                at.toArray(),
                tip.toArray(),
                twigRadius * 1.6,
                4,
                twigRadius * 0.7,
              );
              shoot(at, tip, true);
            }
          }
          tips.push(end);
          branchCount++;
        }
      }
      if (leafy && p.foliageMode === "clusters")
        crown.push({
          center: trunkAt(H * 0.96).point.toArray(),
          radii: [width * 0.12, H * 0.065, width * 0.12],
        });
      else shoot(trunkAt(H * 0.9).point, spine.at(-1).point, true);
    }
  } else {
    const tree = new ProceduralTree({
      seed: p.seed,
      segments: 2 * Math.ceil(shapeSegments(6) / 2),
      levels: clamp(Math.round(p.levels) + 1, 2, 4),
      treeSteps: spec.gnarl || p.archetype === "japaneseMaple" ? 1 : 3,
      maxRadius: R,
      trunkLength: H * spec.clear,
      initalBranchLength: H * 0.32,
      lengthFalloffFactor: 0.8,
      lengthFalloffPower: 1,
      radiusFalloffRate: clamp(p.branchRadRatio, 0.5, 0.78),
      taperRate: 0.84,
      climbRate: H * 0.075,
      clumpMin: spec.gnarl ? 0.5 : 0.65,
      clumpMax: spec.gnarl ? 0.8 : 0.85,
      branchFactor: 2,
      trunkKink: H * (spec.gnarl ? 0.105 : 0.013),
      growAmount: spec.gnarl ? 0.02 : 0.65,
      dropAmount: spec.weeping ? -0.025 : 0,
      sweepAmount: 0,
      twistRate: 3.02,
      twigScale: 0.001,
    });
    function visit(b) {
      for (const index of [
        ...(b.ring0 || []),
        ...(b.ring1 || []),
        ...(b.ring2 || []),
      ])
        owners[index] = V(b.head);
      if (b.end !== undefined) owners[b.end] = V(b.head);
      if (b.parent) skeleton.push([V(b.parent.head), V(b.head), !b.child0]);
      if (b.child0) {
        visit(b.child0);
        visit(b.child1);
      }
    }
    const owners = [];
    visit(tree.root);
    for (const index of tree.root.root) owners[index] = new THREE.Vector3();
    const bounds = new THREE.Box3().setFromPoints(tree.verts.map(V)),
      size = bounds.getSize(new THREE.Vector3()),
      sy = H / size.y,
      desired =
        H *
        spec.width *
        clamp(p.branchAngle / 0.75, 0.55, 1.3) *
        (p.crownType === "column" ? 0.65 : 1),
      sx =
        desired /
        Math.max(
          0.01,
          Math.abs(bounds.min.x),
          Math.abs(bounds.max.x),
          Math.abs(bounds.min.z),
          Math.abs(bounds.max.z),
        );
    const transform = (v) =>
      new THREE.Vector3(v.x * sx, (v.y - bounds.min.y) * sy, v.z * sx);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        tree.verts
          .map((v, i) => {
            const center = owners[i],
              offset = V(v).sub(center),
              radius = offset.length();
            offset.multiply(new THREE.Vector3(sx, sy, sx));
            if (offset.lengthSq() > 0) offset.setLength(radius);
            return transform(center).add(offset).toArray();
          })
          .flat(),
        3,
      ),
    );
    // Upstream leaves the ground ring open. Cap it for complete model exports.
    const baseCenter = tree.verts.length,
      positions = [
        ...geometry.attributes.position.array,
        ...transform(new THREE.Vector3()).toArray(),
      ],
      faces = tree.faces.flat();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    for (let i = 0; i < tree.root.root.length; i++)
      faces.push(
        baseCenter,
        tree.root.root[i],
        tree.root.root[(i + 1) % tree.root.root.length],
      );
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    geometry.userData.smoothSurface = true;
    const wood = mesh(branches, geometry, bark);
    wood.name = "Connected fork skin";
    const centerLine = [
      new THREE.Vector3(0, 0, 0),
      transform(V(tree.root.head)),
    ];
    let b = tree.root;
    while (b.child0?.type === "trunk") {
      b = b.child0;
      centerLine.push(transform(V(b.head)));
    }
    trunkAt = (y) => {
      let lo = centerLine[0],
        hi = centerLine[1];
      for (let i = 1; i < centerLine.length; i++) {
        hi = centerLine[i];
        if (hi.y >= y) break;
        lo = hi;
      }
      const t = clamp((y - lo.y) / Math.max(0.001, hi.y - lo.y), 0, 1);
      return {
        point: lo.clone().lerp(hi, t),
        radius: R * (1 - clamp(y / H, 0, 1) * 0.8),
      };
    };
    for (const [from, to, terminal] of skeleton) {
      branchCount++;
      if (!terminal) continue;
      const a = transform(from),
        b = transform(to);
      tips.push(b);
      if (spec.weeping) {
        if (p.foliageMode === "clusters") continue;
        for (let k = 0; k < 3; k++) {
          const origin = a.clone().lerp(b, 0.45 + k * 0.22),
            end = origin
              .clone()
              .add(
                new THREE.Vector3(
                  (r() - 0.5) * H * 0.055,
                  -H * (0.17 + r() * 0.17),
                  (r() - 0.5) * H * 0.055,
                ),
              );
          end.y = Math.max(H * 0.13, end.y);
          if (leafy && p.foliageMode === "clusters") {
            crown.push({
              center: origin.clone().lerp(end, 0.45).toArray(),
              radii: [
                H * 0.062 * p.foliageSize,
                Math.abs(origin.y - end.y) * 0.6,
                H * 0.062 * p.foliageSize,
              ],
            });
            leafCount++;
          }
          let prev = origin;
          for (let j = 1; j <= 5; j++) {
            const next = origin.clone().lerp(end, j / 5);
            next.x += Math.sin((j / 5) * Math.PI) * H * 0.025;
            tube(
              twigs,
              bark,
              prev.toArray(),
              next.toArray(),
              twigRadius * 1.8,
              4,
              twigRadius * 0.8,
            );
            if (p.foliageMode !== "clusters") shoot(prev, next, true);
            prev = next;
          }
        }
      } else if (spec.gnarl) {
        if (p.foliageMode === "clusters") clusterAt(b, H * 0.11);
        else {
          for (let k = 0; k < 3; k++) {
            const t = 0.4 + k * 0.25,
              at = a.clone().lerp(b, t);
            shoot(
              at,
              at.clone().add(new THREE.Vector3(H * 0.04, H * 0.035, H * 0.04)),
              true,
            );
          }
        }
      } else if (p.foliageMode !== "clusters") shoot(a, b);
    }
    if (leafy && !spec.gnarl) {
      // Crown attractors fill the species envelope. Fine supporting shoots grow
      // from the nearest existing fork; every leaf mass has a physical branch.
      // This supplements proctree's trunk/forks rather than changing its mesh.
      const narrow = p.archetype === "aspen" || p.archetype === "birch",
        umbrella = p.archetype === "japaneseMaple" || p.archetype === "sakura",
        crownBase =
          p.archetype === "bush"
            ? 0.28
            : narrow
              ? 0.52
              : umbrella
                ? 0.74
                : spec.weeping
                  ? 0.7
                  : 0.7,
        crownTop = 0.94,
        sourcePoints = skeleton.map(([, to]) => transform(to)),
        phase = r() * Math.PI * 2;
      if (p.foliageMode === "clusters") crown.length = 0;
      const rings = narrow ? 5 : 3;
      for (let ring = 0; ring < rings; ring++) {
        const t = ring / (rings - 1),
          y = H * (crownBase + (crownTop - crownBase) * t),
          ringWidth =
            desired *
            (narrow
              ? 0.4 + 0.47 * Math.sin(t * Math.PI)
              : ring === 2
                ? 0.45
                : ring === 0
                  ? 0.73
                  : 0.87),
          count = ring === rings - 1 ? 5 : clamp(p.blobsPerCluster + 4, 5, 11);
        for (let i = 0; i < count; i++) {
          const angle = phase + (i * Math.PI * 2) / count + ring * 1.3,
            target = new THREE.Vector3(
              Math.cos(angle) * ringWidth * (0.92 + r() * 0.14),
              y + (r() - 0.5) * H * 0.06,
              Math.sin(angle) * ringWidth * (0.92 + r() * 0.14),
            ),
            source = sourcePoints.reduce((best, v) =>
              v.distanceToSquared(target) < best.distanceToSquared(target)
                ? v
                : best,
            ),
            mid = source.clone().lerp(target, 0.55);
          mid.y += H * 0.025;
          tube(
            twigs,
            bark,
            source.toArray(),
            mid.toArray(),
            R * 0.07,
            5,
            twigRadius * 1.8,
          );
          tube(
            twigs,
            bark,
            mid.toArray(),
            target.toArray(),
            twigRadius * 1.8,
            5,
            twigRadius,
          );
          branchCount += 2;
          if (p.foliageMode === "clusters") {
            const radius =
              H *
              (narrow ? 0.105 : 0.145) *
              clamp(p.foliageSize, 0.65, 1.4) *
              clamp(Math.sqrt(p.blobsPerCluster / 4), 0.7, 1.2) *
              (p.archetype === "japaneseMaple" ? 1.25 : 1);
            crown.push({
              center: target.toArray(),
              radii: [
                radius * (umbrella ? 1.2 : 1),
                radius * (umbrella ? 0.98 : 1.15),
                radius,
              ],
            });
            if (spec.weeping && ring < 2) {
              const end = target
                .clone()
                .add(
                  new THREE.Vector3(
                    H * 0.025 * Math.cos(angle),
                    -H * (0.27 + r() * 0.12),
                    H * 0.025 * Math.sin(angle),
                  ),
                );
              tube(
                twigs,
                bark,
                target.toArray(),
                end.toArray(),
                twigRadius * 1.7,
                5,
                twigRadius * 0.5,
              );
              crown.push({
                center: target.clone().lerp(end, 0.5).toArray(),
                radii: [
                  radius * 0.6,
                  Math.abs(end.y - target.y) * 0.62,
                  radius * 0.6,
                ],
              });
            }
            leafCount++;
          } else {
            shoot(mid, target);
            for (let k = 0; k < 3; k++) {
              const end = target
                .clone()
                .add(
                  new THREE.Vector3(
                    (r() - 0.5) * H * 0.14,
                    (r() - 0.35) * H * 0.12,
                    (r() - 0.5) * H * 0.14,
                  ),
                );
              tube(
                twigs,
                bark,
                target.toArray(),
                end.toArray(),
                twigRadius,
                4,
                twigRadius * 0.5,
              );
              shoot(target, end);
            }
          }
        }
      }
      if (p.foliageMode === "clusters" && umbrella)
        for (const [x, y, z] of [
          [0, 0.87, 0],
          [-0.11, 0.82, 0.07],
          [0.12, 0.83, -0.08],
        ]) {
          const center = new THREE.Vector3(x * H, y * H, z * H),
            source = sourcePoints.reduce((best, v) =>
              v.distanceToSquared(center) < best.distanceToSquared(center)
                ? v
                : best,
            );
          tube(
            twigs,
            bark,
            source.toArray(),
            center.toArray(),
            twigRadius * 2,
            5,
            twigRadius,
          );
          crown.push({
            center: center.toArray(),
            radii: [H * 0.22, H * 0.15, H * 0.21],
          });
          leafCount++;
        }
    }
  }
  for (const shoot of shoots) renderShoot(...shoot);
  if (crown.length) {
    const canopy = mesh(foliage, canopyGeometry(crown, H), shades[1]);
    canopy.name = "Continuous foliage canopy";
  }
  // Bark shading is part of the wood, not separate raised shapes.
  if (p.barkOn)
    branches.traverse((n) => {
      if (!n.isMesh) return;
      const g = n.geometry,
        pos = g.attributes.position,
        colors = [];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          y = pos.getY(i),
          z = pos.getZ(i),
          mark =
            spec.white || p.archetype === "aspen"
              ? Math.sin((y / H) * 145 + Math.atan2(z, x) * 2) > 0.74
              : Math.sin(Math.atan2(z, x) * 9 + (y / H) * 13) > 0.67;
        colors.push(
          ...bark.color
            .clone()
            .lerp(mats.bark.color, mark ? (spec.white ? 0.65 : 0.12) : 0)
            .toArray(),
        );
      }
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      n.material = bark;
    });
  if (p.barkOn) bark.vertexColors = true;
  if (p.rootsOn) {
    const roots = part(root, "Roots");
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      tube(
        roots,
        bark,
        [0, R * 0.55, 0],
        [Math.cos(a) * R * 2.2, R * 0.12, Math.sin(a) * R * 2.2],
        R * 0.5,
        6,
        R * 0.14,
      );
    }
  }
  if (p.fruitOn && leafy && p.kind === "broadleaf" && p.season !== "blossom") {
    const fruit = part(root, "Fruit");
    for (const at of tips.filter((_, i) => i % 4 === 0).slice(0, 14)) {
      const end = at.clone().add(new THREE.Vector3(0, -H * 0.016, 0));
      tube(fruit, bark, at.toArray(), end.toArray(), twigRadius, 4);
      mesh(
        fruit,
        new THREE.IcosahedronGeometry(H * 0.012, 1),
        mats.fruit,
        end.toArray(),
      );
    }
  }
  if (p.groundOn) {
    const ground = part(root, "Ground");
    mesh(
      ground,
      new THREE.CylinderGeometry(H * 0.24, H * 0.26, 0.07, 12),
      mats.ground,
      [0, -0.025, 0],
    );
  }
  for (const group of root.children) mergePart(group);
  for (const mat of shades)
    if (!foliage.children.some((n) => n.material === mat)) mat.dispose();
  leafGeo.dispose();
  needleGeo.dispose();
  bloomGeo.dispose();
  root.userData.botany = {
    branchCount,
    leafCount,
    species: p.archetype,
    method: p.kind === "broadleaf" ? "proctree" : "radial",
  };
  return finishModel(root);
}
