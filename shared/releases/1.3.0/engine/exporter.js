import * as THREE from "three";
import { GLTFExporter } from "three/addons/GLTFExporter.js";
import { OBJExporter } from "three/addons/OBJExporter.js";
function exportGeometry(model) {
  // glTF/OBJ have no flatShading flag. Bake the preview's angular face normals
  // into a detached snapshot; keep the live preview and shared materials intact.
  const root = model.clone(true),
    owned = new Set();
  root.traverse((node) => {
    if (!node.isMesh || !node.material.flatShading) return;
    const geometry = node.geometry.index
      ? node.geometry.toNonIndexed()
      : node.geometry.clone();
    geometry.computeVertexNormals();
    node.geometry = geometry;
    owned.add(geometry);
  });
  root.updateMatrixWorld(true);
  return {
    root,
    dispose: () => {
      for (const geometry of owned) geometry.dispose();
    },
  };
}
export function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return blob;
}
export async function glbBlob(model) {
  model.updateMatrixWorld(true);
  const snapshot = exportGeometry(model);
  try {
    const binary = await new GLTFExporter().parseAsync(snapshot.root, {
      binary: true,
      onlyVisible: true,
    });
    return new Blob([binary], { type: "model/gltf-binary" });
  } finally {
    snapshot.dispose();
  }
}
export function objFiles(model, name) {
  const snapshot = exportGeometry(model);
  try {
    return objFilesFromModel(snapshot.root, name);
  } finally {
    snapshot.dispose();
  }
}
function objFilesFromModel(model, name) {
  model.updateMatrixWorld(true);
  // OBJ has no material payload: provide its MTL beside the original OBJ download.
  const materials = new Map(),
    original = [];
  model.traverse((node) => {
    if (!node.isMesh) return;
    if (Array.isArray(node.material))
      throw new Error("OBJ export requires one material per mesh.");
    const material = node.material;
    if (!materials.has(material))
      materials.set(material, `material_${materials.size + 1}`);
    original.push([material, material.name]);
    material.name = materials.get(material);
  });
  let obj;
  try {
    obj = new OBJExporter().parse(model);
  } finally {
    for (const [material, oldName] of original.reverse())
      material.name = oldName;
  }
  // The pinned OBJExporter writes mesh positions without their vertex colours.
  // Add the widely supported RGB vertex extension in export order, in sRGB.
  const vertexColors = [];
  let coloured = false;
  model.traverse((node) => {
    if (!node.isMesh && !node.isLine && !node.isPoints) return;
    const positions = node.geometry.getAttribute("position");
    const colors = node.geometry.getAttribute("color");
    for (let i = 0; i < (positions?.count ?? 0); i++) {
      const color = colors
        ? new THREE.Color()
            .fromBufferAttribute(colors, i)
            .convertLinearToSRGB()
            .toArray()
        : null;
      vertexColors.push(color);
      if (color) coloured = true;
    }
  });
  if (coloured) {
    let index = 0;
    obj = obj.replace(/^v [^\n]+/gm, (line) => {
      const color = vertexColors[index++];
      return color
        ? `${line.split(/\s+/).slice(0, 4).join(" ")} ${color.join(" ")}`
        : line;
    });
  }
  const rgb = (color) =>
    color
      .clone()
      .convertLinearToSRGB()
      .toArray()
      .map((n) => n.toFixed(6))
      .join(" ");
  const mtl = [];
  for (const [material, id] of materials) {
    mtl.push(
      `newmtl ${id}`,
      `Kd ${rgb(material.color ?? new THREE.Color(1, 1, 1))}`,
      `Ke ${rgb((material.emissive ?? new THREE.Color()).clone().multiplyScalar(material.emissiveIntensity ?? 1))}`,
      `d ${material.opacity ?? 1}`,
      `Ns ${Math.round((1 - (material.roughness ?? 1)) * 200)}`,
      `Pr ${material.roughness ?? 1}`,
      `Pm ${material.metalness ?? 0}`,
      "illum 2",
      "",
    );
  }
  return [
    { name: `${name}.obj`, data: `mtllib ${name}.mtl\n${obj}` },
    { name: `${name}.mtl`, data: mtl.join("\n") },
  ];
}
export async function exportGLB(model, name) {
  return download(await glbBlob(model), `${name}.glb`);
}
export function exportOBJ(model, name) {
  const files = objFiles(model, name);
  for (const file of files)
    download(new Blob([file.data], { type: "text/plain" }), file.name);
  return files;
}
