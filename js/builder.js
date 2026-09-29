// Pure builder: params -> THREE.Group (a real, flat-shaded low-poly 3D tree).
// Broadleaf trees: a recursive run of tapered branch cylinders with faceted
// foliage blobs at the tips. Pines: a straight trunk with stacked cones.
// No UI, no globals. Deterministic from the seed.

import * as THREE from 'three';
import { makeRng } from './rng.js';

const Y = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function segment(group, start, end, r0, r1, mat, radial) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len < 1e-4) return;
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial || 6, 1);
  geo.translate(0, len / 2, 0);                 // pivot at the base
  const m = new THREE.Mesh(geo, mat);
  m.quaternion.setFromUnitVectors(Y, dir.normalize());
  m.position.copy(start);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
}

// one CLEAN faceted foliage chunk — a rounded icosahedron (detail 1), gently
// squashed + rotated. No per-vertex jitter (that was the spiky-mess culprit).
function blob(group, center, radius, mat, r) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), mat);
  m.position.copy(center);
  m.scale.set(0.82 + 0.36 * r(), 0.82 + 0.36 * r(), 0.82 + 0.36 * r());
  m.rotation.set(r() * 6.2832, r() * 6.2832, r() * 6.2832);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
}

// a tidy rounded crown: a handful of big overlapping chunks filling a dome
function canopyDome(group, center, R, count, mat, r) {
  for (let i = 0; i < count; i++) {
    const a = r() * 6.2832, rr = R * 0.7 * Math.sqrt(r());
    const off = v(Math.cos(a) * rr, (r() - 0.32) * R * 0.8, Math.sin(a) * rr);
    blob(group, center.clone().add(off), R * (0.46 + 0.3 * r()), mat, r);
  }
}

// a direction at `ang` from `dir`, swung around it by azimuth `az`
function swing(dir, az, ang) {
  const d = dir.clone().normalize();
  const up = Math.abs(d.y) < 0.99 ? Y : v(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(d, up).normalize();
  const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
  const perp = t1.multiplyScalar(Math.cos(az)).add(t2.multiplyScalar(Math.sin(az)));
  return d.multiplyScalar(Math.cos(ang)).add(perp.multiplyScalar(Math.sin(ang))).normalize();
}

function grow(group, p, mats, r, start, dir, len, rad, depth, leaves, splits) {
  // a slightly curved branch, built from 2 sub-segments so bends read
  const mid = start.clone().add(dir.clone().multiplyScalar(len * 0.5));
  const bentDir = dir.clone(); bentDir.y += p.curve; bentDir.normalize();
  const end = mid.clone().add(bentDir.clone().multiplyScalar(len * 0.5));
  segment(group, start, mid, rad, rad * 0.92, mats.trunk, depth > 2 ? 7 : 5);
  segment(group, mid, end, rad * 0.92, rad * p.trunkTaper, mats.trunk, depth > 2 ? 7 : 5);

  if (depth <= 0 || rad < p.trunkRadius * 0.16) {
    leaves.push(end.clone());
    return;
  }
  const n = splits;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r() * 1.2;
    const ang = p.branchAngle * (0.7 + 0.55 * r());
    const child = swing(bentDir, az, ang);
    child.y += p.upBias; child.normalize();
    grow(group, p, mats, r, end, child,
      len * p.branchLenRatio * (0.85 + 0.3 * r()), rad * p.branchRadRatio, depth - 1, leaves, splits);
  }
}

function buildPine(group, p, mats, r) {
  const h = p.height;
  segment(group, v(0, 0, 0), v(0, h * 0.96, 0), p.trunkRadius, p.trunkRadius * 0.35, mats.trunk, 7);
  const tiers = Math.round(p.pineTiers);
  const base = h * 0.16, top = h * 1.0;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = base + (top - base) * t;
    const rad = p.crownWidth * (1 - t) * (0.92 + 0.16 * r()) + 0.12;
    const ch = (top - base) / tiers * (1.9 + 0.3 * r());
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, ch, 7, 1), mats.foliage);
    cone.position.set((r() * 2 - 1) * 0.05, y + ch * 0.18, (r() * 2 - 1) * 0.05);
    cone.castShadow = true; cone.receiveShadow = true;
    group.add(cone);
  }
}

export function buildTree(p, mats) {
  const g = new THREE.Group();
  g.name = 'tree';
  const r = makeRng((p.seed ^ 0x1234abcd) >>> 0);

  if (p.kind === 'pine') {
    buildPine(g, p, mats, r);
  } else {
    const leaves = [];
    const splits = Math.round(p.splits);
    grow(g, p, mats, r, v(0, 0, 0), v(0, 1, 0),
      p.height * p.trunkFrac, p.trunkRadius, Math.round(p.levels), leaves, splits);
    // size a crown from the branch tips, then fill it with a few clean chunks
    let cy = 0, maxR = 0;
    for (const t of leaves) { cy += t.y; maxR = Math.max(maxR, Math.hypot(t.x, t.z)); }
    cy = leaves.length ? cy / leaves.length : p.height * p.trunkFrac;
    const crownR = Math.max(p.height * 0.24, maxR + p.foliageSize * 0.7);
    const center = v(0, cy + crownR * 0.12, 0);
    for (const t of leaves) blob(g, t, p.foliageSize * (0.85 + 0.4 * r()), mats.foliage, r);
    const fill = Math.min(16, Math.max(4, Math.round(crownR * 1.4 + p.blobsPerCluster) - leaves.length));
    canopyDome(g, center, crownR, fill, mats.foliage, r);
  }

  const box = new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  g.userData.size = size; g.userData.center = center;
  return g;
}
