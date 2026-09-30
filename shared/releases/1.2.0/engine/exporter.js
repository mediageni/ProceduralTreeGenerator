import * as THREE from "three";
import { GLTFExporter } from "three/addons/GLTFExporter.js";
import { OBJExporter } from "three/addons/OBJExporter.js";
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
  const binary = await new GLTFExporter().parseAsync(model, {
    binary: true,
    onlyVisible: true,
  });
  return new Blob([binary], { type: "model/gltf-binary" });
}
export function objFiles(model, name) {
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
