import {
  CanvasTexture, Color, DirectionalLight, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry,
  PMREMGenerator, Scene, SRGBColorSpace,
} from 'three';

// A bright studio surrounds every badge. Broad panels add moving metal
// reflections without leaving the outer rows in a black environment.
const softboxes = [
  { at: [-5.5, 1.5, 7], size: [4, 15], angle: -.22, color: '#fff9f1', power: 2.0 },
  { at: [5.5, -1, 7], size: [5, 15], angle: .24, color: '#fff7ef', power: 1.55 },
  { at: [0, 7, 5], size: [19, 7], angle: -.12, color: '#ffffff', power: 1.25 },
  { at: [0, 0, 11], size: [17, 19], angle: -.24, color: '#fff9f2', power: 1.8, diffuser: true },
  { at: [8, 1, 0], size: [10, 19], angle: 0, color: '#eaf0fa', power: .85 },
  { at: [-8, -1, 0], size: [10, 19], angle: .12, color: '#fff1df', power: .85 },
  { at: [0, -7, 3], size: [19, 9], angle: .12, color: '#fff6e9', power: .8 },
  { at: [0, 0, -8], size: [19, 19], angle: 0, color: '#f5f6fa', power: .85 },
];

export function lightBadgeArtwork(scene) {
  const key = new DirectionalLight('#fff5e9', 1.0);
  key.position.set(-3.2, 4.5, 8);
  const fill = new DirectionalLight('#e7edfa', .8);
  fill.position.set(5, -3, 5);
  scene.add(key, fill);
}

export function createBadgeReflections(renderer) {
  const studio = new Scene();
  studio.background = new Color(.32, .32, .34);
  for (const { at, size, angle, color, power, diffuser } of softboxes) {
    const surface = new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(power), side: DoubleSide, toneMapped: false,
      map: diffuser ? createStudioDiffuser() : null,
    });
    const panel = new Mesh(new PlaneGeometry(...size), surface);
    panel.position.set(...at);
    panel.lookAt(0, 0, 0);
    panel.rotateZ(angle);
    studio.add(panel);
  }
  const pmrem = new PMREMGenerator(renderer);
  try {
    return pmrem.fromScene(studio, .01, .1, 50, { size: 192 });
  } finally {
    for (const panel of studio.children) {
      panel.geometry.dispose();
      panel.material.map?.dispose();
      panel.material.dispose();
    }
    pmrem.dispose();
  }
}

function createStudioDiffuser() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 4;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(.3, '#ffffff');
  gradient.addColorStop(.68, '#999999');
  gradient.addColorStop(1, '#999999');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
