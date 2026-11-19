import { BufferGeometry, DynamicDrawUsage, Float32BufferAttribute } from 'three';
import { createSurfaceSampler } from './relief.js';

export function createMetalTrim(contours, width, height, frontZ, analysis, radius) {
  const geometry = new BufferGeometry();
  const coordinates = [], profiles = [], indices = [];
  const at = createSurfaceSampler(analysis, width, height);
  const radialSegments = 16;

  for (const contour of contours) {
    const points = sampleContour(contour);
    if (points.length < 3) continue;
    const start = profiles.length;
    for (let i = 0; i < points.length; i++) {
      const point = points[i], previous = points.at(i - 1), next = points[(i + 1) % points.length];
      const incoming = point.clone().sub(previous).normalize();
      const outgoing = next.clone().sub(point).normalize();
      const tangent = incoming.add(outgoing).normalize();
      for (let j = 0; j < radialSegments; j++) {
        const angle = j / radialSegments * Math.PI * 2;
        const x = tangent.y * Math.cos(angle), y = -tangent.x * Math.cos(angle);
        profiles.push({ x: point.x, y: point.y, offsetX: x * radius, offsetY: y * radius,
          offsetZ: Math.sin(angle) * radius * .8, normalX: x, normalY: y, normalZ: Math.sin(angle) / .8,
          center: at(point.x, point.y), edge: at(point.x + x * radius, point.y + y * radius) });
        coordinates.push(0, 0, 0);
        const a = start + i * radialSegments + j;
        const b = start + ((i + 1) % points.length) * radialSegments + j;
        const c = start + ((i + 1) % points.length) * radialSegments + (j + 1) % radialSegments;
        const d = start + i * radialSegments + (j + 1) % radialSegments;
        indices.push(a, b, c, a, c, d);
      }
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(coordinates, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('normal', new Float32BufferAttribute(coordinates, 3).setUsage(DynamicDrawUsage));
  geometry.setIndex(indices);
  let currentCurvature, currentHeight, currentStrength;

  function update(curvature, height, strength) {
    if (curvature === currentCurvature && height === currentHeight && strength === currentStrength) return;
    currentCurvature = curvature;
    currentHeight = height;
    currentStrength = strength;
    const { position, normal } = geometry.attributes;
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const x = p.x + p.offsetX * strength, y = p.y + p.offsetY * strength;
      const interpolate = key => p.center[key] + (p.edge[key] - p.center[key]) * strength;
      position.setXYZ(i, x, y, frontZ + interpolate('crown') * curvature + interpolate('feature') * height + p.offsetZ * strength);
      const nx = p.normalX - p.normalZ * (interpolate('slopeX') * curvature + interpolate('gradientX') * height);
      const ny = p.normalY - p.normalZ * (interpolate('slopeY') * curvature + interpolate('gradientY') * height);
      const length = Math.hypot(nx, ny, p.normalZ);
      normal.setXYZ(i, nx / length, ny / length, p.normalZ / length);
    }
    position.needsUpdate = normal.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  update(1, 0, 1);
  return { geometry, update };
}

function sampleContour(contour) {
  const source = contour.getPoints(8);
  if (source.length > 1 && source[0].distanceToSquared(source.at(-1)) < 1e-12) source.pop();
  const points = [];
  for (let i = 0; i < source.length; i++) {
    const a = source[i], b = source[(i + 1) % source.length];
    const length = a.distanceTo(b);
    if (length < 1e-7) continue;
    const count = Math.max(1, Math.ceil(length / .025));
    for (let step = 0; step < count; step++) points.push(a.clone().lerp(b, step / count));
  }
  return points;
}
