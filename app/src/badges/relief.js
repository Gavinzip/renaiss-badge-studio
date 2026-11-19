import { ShapeGeometry } from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const resolution = 160;
const crownHeight = .095;
const crownCurvature = 1.35;

export function analyzeRelief(image) {
  const scale = resolution / Math.max(image.width, image.height);
  const width = Math.max(1, Math.round(image.width * scale)) + 2;
  const height = Math.max(1, Math.round(image.height * scale)) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 1, 1, width - 2, height - 2);
  const rgba = context.getImageData(0, 0, width, height).data;
  const distance = silhouetteDistance(rgba, width, height);
  const features = new Float32Array(width * height);
  let edgeLight = 0, edgeChroma = 0, edgeCount = 0;

  for (let index = 0; index < distance.length; index++) {
    if (distance[index] < 1 || distance[index] > 3) continue;
    const offset = index * 4;
    const r = rgba[offset] / 255, g = rgba[offset + 1] / 255, b = rgba[offset + 2] / 255;
    edgeLight += .2126 * r + .7152 * g + .0722 * b;
    edgeChroma += Math.max(r, g, b) - Math.min(r, g, b);
    edgeCount++;
  }
  // Dark symbols on a pale background are raised in the opposite direction.
  const darkOnLight = edgeCount > 0 && edgeLight / edgeCount > .76 && edgeChroma / edgeCount < .13;
  for (let index = 0; index < features.length; index++) {
    if (!distance[index]) continue;
    const offset = index * 4;
    const r = rgba[offset] / 255, g = rgba[offset + 1] / 255, b = rgba[offset + 2] / 255;
    const luma = .2126 * r + .7152 * g + .0722 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const paleDetail = smooth(.62, .88, Math.min(r, g, b));
    features[index] = darkOnLight ? smooth(.35, .78, 1 - luma)
      : Math.max(paleDetail, .2 * smooth(.22, .72, luma) * (1 - chroma * .45));
  }
  const softened = soften(soften(features, width, height), width, height);
  for (let index = 0; index < softened.length; index++) {
    softened[index] *= smooth(2, 9, distance[index]);
  }
  return { width, height, features: softened };
}

export function createFrontSurface(shapes, width, height, frontZ, analysis) {
  const initial = new ShapeGeometry(shapes, 5);
  const detailed = new TessellateModifier(.015, 16).modify(initial);
  initial.dispose();
  const geometry = mergeVertices(detailed, .00001);
  detailed.dispose();
  const { position, normal, uv } = geometry.attributes;
  const crowns = new Float32Array(position.count);
  const baseSlopeX = new Float32Array(position.count);
  const baseSlopeY = new Float32Array(position.count);
  const features = new Float32Array(position.count);
  const gradientX = new Float32Array(position.count);
  const gradientY = new Float32Array(position.count);
  const stepX = width / (analysis.width - 2), stepY = height / (analysis.height - 2);
  const slope = -2 * crownHeight * crownCurvature;

  for (let index = 0; index < position.count; index++) {
    const u = .5 + position.getX(index) / width;
    const v = .5 + position.getY(index) / height;
    uv.setXY(index, u, v);
    const x = 1 + u * (analysis.width - 2), y = 1 + (1 - v) * (analysis.height - 2);
    crowns[index] = frontCrown(position.getX(index), position.getY(index), width, height);
    baseSlopeX[index] = slope * position.getX(index) / (width * width);
    baseSlopeY[index] = slope * position.getY(index) / (height * height);
    features[index] = sample(analysis.features, analysis.width, analysis.height, x, y);
    gradientX[index] = (sample(analysis.features, analysis.width, analysis.height, x + 1, y)
      - sample(analysis.features, analysis.width, analysis.height, x - 1, y)) / (2 * stepX);
    gradientY[index] = (sample(analysis.features, analysis.width, analysis.height, x, y - 1)
      - sample(analysis.features, analysis.width, analysis.height, x, y + 1)) / (2 * stepY);
  }
  let currentHeight, currentCurvature;
  function setHeight(reliefHeight, curvature = 1) {
    if (reliefHeight === currentHeight && curvature === currentCurvature) return;
    currentHeight = reliefHeight;
    currentCurvature = curvature;
    for (let index = 0; index < position.count; index++) {
      position.setZ(index, frontZ + .0004 + crowns[index] * curvature + features[index] * reliefHeight);
      const dx = baseSlopeX[index] * curvature + gradientX[index] * reliefHeight;
      const dy = baseSlopeY[index] * curvature + gradientY[index] * reliefHeight;
      const length = Math.hypot(dx, dy, 1);
      normal.setXYZ(index, -dx / length, -dy / length, 1 / length);
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  setHeight(0);
  return { geometry, setHeight };
}

export function frontCrown(x, y, width, height) {
  return crownHeight * (1 - crownCurvature * ((x / width) ** 2 + (y / height) ** 2));
}

function sample(values, width, height, x, y) {
  const left = Math.max(0, Math.min(width - 2, Math.floor(x)));
  const top = Math.max(0, Math.min(height - 2, Math.floor(y)));
  const dx = Math.max(0, Math.min(1, x - left)), dy = Math.max(0, Math.min(1, y - top));
  const start = top * width + left;
  return (values[start] * (1 - dx) + values[start + 1] * dx) * (1 - dy)
    + (values[start + width] * (1 - dx) + values[start + width + 1] * dx) * dy;
}

function silhouetteDistance(rgba, width, height) {
  const distances = new Float32Array(width * height);
  for (let index = 0; index < distances.length; index++) distances[index] = rgba[index * 4 + 3] > 112 ? 320 : 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      distances[p] = Math.min(distances[p], distances[p - 1] + 1, distances[p - width] + 1,
        distances[p - width - 1] + Math.SQRT2, distances[p - width + 1] + Math.SQRT2);
    }
  }
  for (let y = height - 2; y > 0; y--) {
    for (let x = width - 2; x > 0; x--) {
      const p = y * width + x;
      distances[p] = Math.min(distances[p], distances[p + 1] + 1, distances[p + width] + 1,
        distances[p + width - 1] + Math.SQRT2, distances[p + width + 1] + Math.SQRT2);
    }
  }
  return distances;
}

function soften(values, width, height) {
  const horizontal = new Float32Array(values.length);
  const result = new Float32Array(values.length);
  const weights = [1, 4, 6, 4, 1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let tap = -2; tap <= 2; tap++) {
        horizontal[y * width + x] += values[y * width + Math.max(0, Math.min(width - 1, x + tap))] * weights[tap + 2] / 16;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let tap = -2; tap <= 2; tap++) {
        result[y * width + x] += horizontal[Math.max(0, Math.min(height - 1, y + tap)) * width + x] * weights[tap + 2] / 16;
      }
    }
  }
  return result;
}

function smooth(minimum, maximum, value) {
  const t = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return t * t * (3 - 2 * t);
}
