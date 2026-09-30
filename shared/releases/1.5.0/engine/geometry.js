import * as THREE from "three";
import { boxGeometry, prepareShapeGeometry, shapeFinish } from "./finish.js";
export { mergeVertices } from "../vendor/BufferGeometryUtils.js";

// Exportable primitives and batching shared by the model adapters.
export function part(root, name) {
  const group = new THREE.Group();
  group.name = name;
  root.add(group);
  return group;
}
export function mesh(group, geometry, material, position = [0, 0, 0]) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...position);
  result.castShadow = result.receiveShadow = true;
  group.add(result);
  return result;
}
export function box(group, material, size, position) {
  return mesh(group, boxGeometry(...size), material, position);
}
export function chamferedBox(group, material, size, position, chamfer = 0.15) {
  const [w, h, d] = size,
    c = Math.min(w, h) * chamfer;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + c, -h / 2);
  for (const [x, y] of [
    [w / 2 - c, -h / 2],
    [w / 2, -h / 2 + c],
    [w / 2, h / 2 - c],
    [w / 2 - c, h / 2],
    [-w / 2 + c, h / 2],
    [-w / 2, h / 2 - c],
    [-w / 2, -h / 2 + c],
  ])
    shape.lineTo(x, y);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    steps: 1,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -d / 2);
  return mesh(group, geometry, material, position);
}
export function cylinder(
  group,
  material,
  radius,
  height,
  position,
  segments = 10,
  top = radius,
) {
  return mesh(
    group,
    new THREE.CylinderGeometry(top, radius, height, segments),
    material,
    position,
  );
}
export function tube(
  group,
  material,
  start,
  end,
  radius,
  segments = 7,
  tip = radius,
) {
  const a = new THREE.Vector3(...start),
    b = new THREE.Vector3(...end);
  const direction = b.sub(a),
    length = direction.length();
  if (length < 1e-6) return null;
  const result = cylinder(
    group,
    material,
    radius,
    length,
    a.clone().addScaledVector(direction, 0.5).toArray(),
    segments,
    tip,
  );
  result.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return result;
}
export function ring(
  group,
  material,
  radius,
  thickness,
  position,
  arc = Math.PI * 2,
) {
  return mesh(
    group,
    new THREE.TorusGeometry(radius, thickness, 4, 16, arc),
    material,
    position,
  );
}
export function finishModel(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  root.userData.size = bounds.getSize(new THREE.Vector3());
  root.userData.center = bounds.getCenter(new THREE.Vector3());
  return root;
}

// Collapse a semantic part into one draw per material, keeping its group name.
// Only leaf meshes are eligible; lines and nested interactive parts are retained.
export function mergePart(group) {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert(),
    batches = new Map(),
    disposed = new Set();
  const eligible = group.children.filter(
    (node) =>
      node.isMesh && !node.children.length && !Array.isArray(node.material),
  );
  for (const node of eligible) {
    const transform = inverse.clone().multiply(node.matrixWorld);
    const normal = new THREE.Matrix3().getNormalMatrix(transform);
    const prepared = prepareShapeGeometry(node.geometry);
    const geometry = prepared.index ? prepared.toNonIndexed() : prepared;
    const p = geometry.getAttribute("position"),
      n = geometry.getAttribute("normal"),
      c = geometry.getAttribute("color");
    if (!batches.has(node.material))
      batches.set(node.material, {
        positions: [],
        normals: [],
        colors: [],
        hasColors: false,
      });
    const batch = batches.get(node.material),
      point = new THREE.Vector3();
    batch.hasColors ||= !!c;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(transform);
      batch.positions.push(point.x, point.y, point.z);
      batch.colors.push(
        c ? c.getX(i) : 1,
        c ? c.getY(i) : 1,
        c ? c.getZ(i) : 1,
      );
      if (n) {
        point.fromBufferAttribute(n, i).applyNormalMatrix(normal);
        batch.normals.push(point.x, point.y, point.z);
      }
    }
    if (geometry !== node.geometry) geometry.dispose();
    if (prepared !== node.geometry && prepared !== geometry) prepared.dispose();
    disposed.add(node.geometry);
    group.remove(node);
  }
  for (const geometry of disposed) geometry.dispose();
  for (const [material, batch] of batches) {
    const geometry = new THREE.BufferGeometry();
    if (shapeFinish() === "soft") geometry.userData.finishPrepared = true;
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(batch.positions, 3),
    );
    if (batch.normals.length === batch.positions.length)
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(batch.normals, 3),
      );
    else geometry.computeVertexNormals();
    if (batch.hasColors)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(batch.colors, 3),
      );
    const result = mesh(group, geometry, material);
    result.name = material.name || group.name;
  }
  return group;
}
