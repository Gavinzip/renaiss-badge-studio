import { AmbientLight, BackSide, DirectionalLight, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function lightBadgeArtwork(scene) {
  const key = new DirectionalLight('#fff9f2', 1.35);
  key.position.set(-4.5, 5.5, 8);
  const fill = new DirectionalLight('#e8eef8', .65);
  fill.position.set(5, -3, 4);
  scene.add(key, fill, new AmbientLight('#ffffff', .4));
}

export function createBadgeReflections(renderer) {
  // A room gives the metal broad, irregular reflections as it turns. It is
  // sampled only for surface lighting; the visible background stays uniform.
  const room = new RoomEnvironment();
  room.traverse(object => {
    if (object.isPointLight) object.intensity *= .65;
    const material = object.material;
    if (material?.isMeshLambertMaterial) material.emissiveIntensity *= .22;
    if (!material?.isMeshStandardMaterial) return;
    material.emissive.set('#ffffff');
    material.emissiveIntensity = material.side === BackSide ? .30 : .12;
  });
  const pmrem = new PMREMGenerator(renderer);
  try {
    return pmrem.fromScene(room, .06);
  } finally {
    room.dispose();
    pmrem.dispose();
  }
}
