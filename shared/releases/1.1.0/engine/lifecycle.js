export function disposeTree(root) {
  if (!root) return;
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of node.material
      ? Array.isArray(node.material)
        ? node.material
        : [node.material]
      : [])
      materials.add(material);
    if (node.isLight) node.shadow?.dispose();
  });
  for (const material of materials)
    for (const value of Object.values(material))
      if (value?.isTexture) textures.add(value);
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
export function disposeMaterials(materials) {
  for (const m of Object.values(materials).flat()) m?.dispose?.();
}
