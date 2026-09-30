import * as THREE from "three";

// Fit the measured box for a full turn at the chosen elevation, rather than
// reserving an equally wide sphere for a tall, narrow tree or tower.
export function turntableDistance(size, direction, fov, aspect) {
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const elevation = direction.clone().normalize().y;
  const horizontal = Math.sqrt(Math.max(0, 1 - elevation * elevation));
  let distance = 0.1;
  for (let i = 0; i < 36; i++) {
    const angle = (i * Math.PI) / 18;
    const forward = new THREE.Vector3(
      Math.cos(angle) * horizontal,
      elevation,
      Math.sin(angle) * horizontal,
    );
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const corner = new THREE.Vector3(
            (size.x * sx) / 2,
            (size.y * sy) / 2,
            (size.z * sz) / 2,
          );
          distance = Math.max(
            distance,
            corner.dot(forward) +
              Math.max(
                Math.abs(corner.dot(right)) / (tangent * aspect),
                Math.abs(corner.dot(up)) / tangent,
              ),
          );
        }
  }
  return distance * 1.1;
}
