import { DynamicDrawUsage, ExtrudeGeometry } from 'three';
import { frontCrown } from './relief.js';

export function createBadgeBody(shapes, width, height, depth, bevel) {
  const geometry = new ExtrudeGeometry(shapes, {
    depth, bevelThickness: bevel * .82, bevelSize: bevel, bevelSegments: 4, curveSegments: 4,
  });
  geometry.translate(0, 0, -depth / 2);
  const { position } = geometry.attributes;
  const flatZ = new Float32Array(position.count);
  for (let index = 0; index < position.count; index++) flatZ[index] = position.getZ(index);
  geometry.computeVertexNormals();
  smoothBevelNormals(geometry);
  const flatNormals = geometry.attributes.normal.array.slice();

  for (let index = 0; index < position.count; index++) {
    const blend = Math.max(0, Math.min(1, flatZ[index] / (depth / 2)));
    position.setZ(index, flatZ[index] + blend * frontCrown(position.getX(index), position.getY(index), width, height));
  }
  geometry.computeVertexNormals();
  smoothBevelNormals(geometry);
  const { normal } = geometry.attributes;
  const curvedNormals = normal.array.slice();
  const curvedZ = new Float32Array(position.count);
  for (let index = 0; index < position.count; index++) curvedZ[index] = position.getZ(index);
  // One metal material renders the entire body. Cache both profiles before
  // removing its extrusion groups so switching never changes bevel smoothing.
  geometry.clearGroups();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.boundingBox.getBoundingSphere(geometry.boundingSphere);
  position.setUsage(DynamicDrawUsage);
  normal.setUsage(DynamicDrawUsage);
  let current = 1;

  return {
    geometry,
    setCurvature(amount) {
      if (amount === current) return;
      current = amount;
      for (let index = 0; index < position.count; index++) {
        position.setZ(index, flatZ[index] + (curvedZ[index] - flatZ[index]) * amount);
        const offset = index * 3;
        const x = flatNormals[offset] + (curvedNormals[offset] - flatNormals[offset]) * amount;
        const y = flatNormals[offset + 1] + (curvedNormals[offset + 1] - flatNormals[offset + 1]) * amount;
        const z = flatNormals[offset + 2] + (curvedNormals[offset + 2] - flatNormals[offset + 2]) * amount;
        const length = Math.hypot(x, y, z);
        normal.setXYZ(index, x / length, y / length, z / length);
      }
      position.needsUpdate = normal.needsUpdate = true;
    },
  };
}

function smoothBevelNormals(geometry) {
  const { position, normal } = geometry.attributes;
  const vertices = new Map();
  const quantize = value => Math.round(value * 100000);
  for (const { start, count, materialIndex } of geometry.groups) {
    if (materialIndex !== 1) continue;
    for (let index = start; index < start + count; index++) {
      const key = [position.getX(index), position.getY(index), position.getZ(index)].map(quantize).join(',');
      const neighbors = vertices.get(key) ?? [];
      neighbors.push(index);
      vertices.set(key, neighbors);
    }
  }
  const original = normal.array.slice();
  for (const neighbors of vertices.values()) {
    for (const index of neighbors) {
      const i = index * 3;
      let x = 0, y = 0, z = 0;
      for (const neighbor of neighbors) {
        const n = neighbor * 3;
        const cosine = original[i] * original[n] + original[i + 1] * original[n + 1] + original[i + 2] * original[n + 2];
        if (cosine < .68) continue;
        x += original[n];
        y += original[n + 1];
        z += original[n + 2];
      }
      const length = Math.hypot(x, y, z);
      if (length > 0) normal.setXYZ(index, x / length, y / length, z / length);
    }
  }
}
