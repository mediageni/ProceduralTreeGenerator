import * as THREE from "three";

export const FINISHES = {
  angular: { label: "Angular" },
  soft: { label: "Soft edges" },
};
let activeFinish = "angular";
// Builders are synchronous. Restore the context even if a model cannot be built.
export function withShapeFinish(key, build) {
  const previous = activeFinish;
  activeFinish = key;
  try {
    return build();
  } finally {
    activeFinish = previous;
  }
}
export function boxGeometry(w, h, d, key = activeFinish) {
  if (key !== "soft") return new THREE.BoxGeometry(w, h, d);
  const half = [w / 2, h / 2, d / 2],
    bevel = Math.min(w, h, d) * 0.12;
  const vertices = [],
    faces = [],
    ids = new Map();
  function vertex(axis, signs) {
    const key = axis + ":" + signs.join(",");
    if (!ids.has(key)) {
      ids.set(key, vertices.length);
      vertices.push(
        half.map((v, i) => signs[i] * (v - (i === axis ? 0 : bevel))),
      );
    }
    return ids.get(key);
  }
  for (let axis = 0; axis < 3; axis++)
    for (const side of [-1, 1]) {
      const other = [0, 1, 2].filter((i) => i !== axis);
      faces.push(
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map((pair) => {
          const signs = [0, 0, 0];
          signs[axis] = side;
          other.forEach((i, k) => (signs[i] = pair[k]));
          return vertex(axis, signs);
        }),
      );
    }
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 3; b++) {
      const other = [0, 1, 2].find((i) => i !== a && i !== b);
      for (const sa of [-1, 1])
        for (const sb of [-1, 1]) {
          const signs = [0, 0, 0];
          signs[a] = sa;
          signs[b] = sb;
          signs[other] = -1;
          const va = vertex(a, signs),
            vb = vertex(b, signs);
          signs[other] = 1;
          faces.push([va, vb, vertex(b, signs), vertex(a, signs)]);
        }
    }
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        faces.push([0, 1, 2].map((axis) => vertex(axis, [x, y, z])));
  const positions = [];
  for (const face of faces) {
    const points = face.map((i) => new THREE.Vector3(...vertices[i]));
    const normal = points[1]
      .clone()
      .sub(points[0])
      .cross(points[2].clone().sub(points[0]));
    const center = points
      .reduce((v, p) => v.add(p), new THREE.Vector3())
      .divideScalar(points.length);
    if (normal.dot(center) < 0) face.reverse();
    for (let i = 1; i < face.length - 1; i++)
      for (const k of [face[0], face[i], face[i + 1]])
        positions.push(...vertices[k]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.type = "BeveledBoxGeometry";
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}
function creaseNormals(input) {
  const geometry = input.index ? input.toNonIndexed() : input;
  const position = geometry.getAttribute("position"),
    normals = new Float32Array(position.count * 3),
    incident = new Map(),
    faces = [];
  const key = (i) =>
    [position.getX(i), position.getY(i), position.getZ(i)]
      .map((v) => Math.round(v * 100000))
      .join(",");
  for (let i = 0; i < position.count; i += 3) {
    const points = [0, 1, 2].map((k) =>
      new THREE.Vector3().fromBufferAttribute(position, i + k),
    );
    const n = points[1]
      .sub(points[0])
      .cross(points[2].sub(points[0]))
      .normalize();
    faces.push(n);
    for (let k = 0; k < 3; k++) {
      const id = key(i + k);
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id).push(n);
    }
  }
  const threshold = Math.cos(THREE.MathUtils.degToRad(50));
  for (let i = 0; i < position.count; i++) {
    const face = faces[Math.floor(i / 3)],
      sum = new THREE.Vector3();
    for (const normal of incident.get(key(i)))
      if (face.dot(normal) > threshold) sum.add(normal);
    sum.normalize().toArray(normals, i * 3);
  }
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geometry;
}
export function applyShapeFinish(root, key) {
  if (key !== "soft") return root;
  const replacements = new Map(),
    processed = new Set(),
    disposed = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const old = node.geometry;
    if (!replacements.has(old)) {
      let geometry = old;
      if (old.type === "BoxGeometry" && !node.material?.userData.windowGrid) {
        const { width, height, depth } = old.parameters;
        old.computeBoundingBox();
        const center = old.boundingBox.getCenter(new THREE.Vector3());
        geometry = boxGeometry(width, height, depth, "soft");
        geometry.translate(...center.toArray());
      }
      if (!processed.has(geometry)) {
        processed.add(geometry);
        const before = geometry;
        geometry = creaseNormals(geometry);
        if (before !== geometry) disposed.add(before);
      }
      replacements.set(old, geometry);
      if (old !== geometry) disposed.add(old);
    }
    node.geometry = replacements.get(old);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material]) {
      if (material.flatShading) {
        material.flatShading = false;
        material.needsUpdate = true;
      }
    }
  });
  for (const geometry of disposed) geometry.dispose();
  return root;
}
