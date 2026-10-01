import * as THREE from "three";
import { MarchingCubes } from "three/addons/MarchingCubes.js";
import { MeshoptSimplifier } from "three/addons/meshopt_simplifier.js";
import { mergeVertices } from "@engine/geometry.js";
import { shapeFinish } from "@engine/finish.js";

await MeshoptSimplifier.ready;

// Meshing and simplification use the same maintained, licensed libraries as the
// animal skin. The field merges branch-supported leaf masses, keeping gaps and
// scalloped edges rather than overlapping independent primitive balls.
export function canopyGeometry(lobes, height) {
  const bounds = new THREE.Box3();
  for (const { center, radii } of lobes) {
    bounds.expandByPoint(
      new THREE.Vector3(...center).sub(new THREE.Vector3(...radii)),
    );
    bounds.expandByPoint(
      new THREE.Vector3(...center).add(new THREE.Vector3(...radii)),
    );
  }
  // MarchingCubes omits its outer two voxel layers. Leave enough air around the
  // blended field so even wide crowns remain closed at the grid boundary.
  bounds.expandByScalar(height * 0.18);
  const center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3()),
    resolution = 38,
    material = new THREE.MeshBasicMaterial(),
    surface = new MarchingCubes(resolution, material, false, false, 25000);
  surface.isolation = 0;
  const blend = height * 0.022;
  const sdf = (x, y, z) => {
    let distance = Infinity;
    for (const lobe of lobes) {
      const [cx, cy, cz] = lobe.center,
        [rx, ry, rz] = lobe.radii,
        d =
          (Math.sqrt(
            ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2,
          ) -
            1) *
          Math.min(rx, ry, rz),
        h = Math.max(blend - Math.abs(distance - d), 0) / blend;
      distance = Math.min(distance, d) - h * h * blend * 0.25;
    }
    return -distance;
  };
  for (let z = 0; z < resolution; z++)
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++)
        surface.field[x + resolution * (y + resolution * z)] = sdf(
          center.x + (x / resolution - 0.5) * size.x,
          center.y + (y / resolution - 0.5) * size.y,
          center.z + (z / resolution - 0.5) * size.z,
        );
  surface.update();
  const geometry = new THREE.BufferGeometry(),
    positions = surface.geometry.attributes.position.array.slice(
      0,
      surface.count * 3,
    );
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = positions[i] * size.x * 0.5 + center.x;
    positions[i + 1] = positions[i + 1] * size.y * 0.5 + center.y;
    positions[i + 2] = positions[i + 2] * size.z * 0.5 + center.z;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const result = mergeVertices(geometry, 1e-6),
    p = result.attributes.position,
    indices = [],
    normals = [],
    epsilon = height * 0.0004;
  for (let i = 0; i < result.index.count; i += 3) {
    const face = [0, 1, 2].map((k) => result.index.getX(i + k));
    if (new Set(face).size === 3) indices.push(...face);
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      n = new THREE.Vector3(
        sdf(x - epsilon, y, z) - sdf(x + epsilon, y, z),
        sdf(x, y - epsilon, z) - sdf(x, y + epsilon, z),
        sdf(x, y, z - epsilon) - sdf(x, y, z + epsilon),
      ).normalize();
    normals.push(n.x, n.y, n.z);
  }
  result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  result.setIndex(indices);
  const closed = (list) => {
    const edges = new Map();
    for (let i = 0; i < list.length; i += 3)
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ]) {
        const u = list[i + a],
          v = list[i + b],
          key = u < v ? u + "," + v : v + "," + u;
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    return [...edges.values()].every((count) => count === 2);
  };
  if (MeshoptSimplifier.supported) {
    const [reduced] = MeshoptSimplifier.simplifyWithAttributes(
      new Uint32Array(indices),
      p.array,
      3,
      result.attributes.normal.array,
      3,
      [0.1, 0.1, 0.1],
      null,
      Math.min(
        indices.length,
        { angular: 1400, shaped: 2400, soft: 3200 }[shapeFinish()] * 3,
      ),
      0.012,
      ["LockBorder", "RegularizeLight"],
    );
    if (closed(reduced)) result.setIndex(Array.from(reduced));
  }
  result.userData.smoothSurface = true;
  geometry.dispose();
  surface.geometry.dispose();
  material.dispose();
  return result;
}
