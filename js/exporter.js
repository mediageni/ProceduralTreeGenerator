// Export the generated car as .glb (binary glTF) or .obj.
import { GLTFExporter } from 'three/addons/GLTFExporter.js';
import { OBJExporter } from 'three/addons/OBJExporter.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportGLB(object3d, name = 'car') {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      object3d,
      (result) => {
        download(new Blob([result], { type: 'model/gltf-binary' }), `${name}.glb`);
        resolve();
      },
      (err) => reject(err),
      { binary: true },
    );
  });
}

export function exportOBJ(object3d, name = 'car') {
  const text = new OBJExporter().parse(object3d);
  download(new Blob([text], { type: 'text/plain' }), `${name}.obj`);
}
