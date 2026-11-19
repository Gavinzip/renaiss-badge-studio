import { CanvasTexture, MeshPhysicalMaterial, SRGBColorSpace } from 'three';
import { copper } from './settings.js';

export function createBadgeMetal() {
  return new MeshPhysicalMaterial({
    color: copper, roughness: .2,
    metalness: 1, anisotropy: .18, anisotropyRotation: .33,
    clearcoat: .08, clearcoatRoughness: .2,
  });
}

export function createBadgeEnamel(artwork) {
  const texture = new CanvasTexture(artwork.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshPhysicalMaterial({
    map: texture, metalness: .88, roughness: .23, clearcoat: .18, clearcoatRoughness: .22,
    envMapIntensity: 1, alphaTest: .33,
  });
  const metal = createBadgeMetal();
  return {
    material, metal,
    dispose() {
      texture.dispose();
      material.dispose();
      metal.dispose();
    },
  };
}
