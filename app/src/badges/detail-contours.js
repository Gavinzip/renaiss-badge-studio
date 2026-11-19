import { ShapeUtils } from 'three';
import { describeArtwork } from './outline.js';

// Only large, clear light/dark symbols become inlay. Continuous gradients,
// tiny image details and the silhouette's antialiasing are deliberately ignored.
export function findDetailContours(analysis) {
  const canvas = document.createElement('canvas');
  canvas.width = analysis.width - 2;
  canvas.height = analysis.height - 2;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const feature = analysis.features[(y + 1) * analysis.width + x + 1];
      pixels.data[(y * canvas.width + x) * 4 + 3] = feature > .72 ? 255 : 0;
    }
  }
  context.putImageData(pixels, 0, 0);
  const { shapes } = describeArtwork({ canvas, transparent: true });
  return shapes.flatMap(shape => [shape, ...shape.holes])
    .filter(contour => Math.abs(ShapeUtils.area(contour.getPoints(6))) > .0025)
    .sort((a, b) => Math.abs(ShapeUtils.area(b.getPoints(6))) - Math.abs(ShapeUtils.area(a.getPoints(6))))
    .slice(0, 8);
}
