import { Shape, ShapePath, Vector2 } from 'three';

const edgePairs = [
  [], [0, 3], [0, 1], [3, 1], [1, 2], [0, 3, 1, 2], [0, 2], [3, 2],
  [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [0, 3], [],
];

export function describeArtwork({ canvas, transparent }) {
  const span = Math.max(canvas.width, canvas.height);
  const width = canvas.width / span;
  const height = canvas.height / span;
  if (!transparent) return { width, height, shapes: [roundedPlate(width, height)] };

  const resolution = 160;
  const sample = document.createElement('canvas');
  const innerWidth = Math.max(1, Math.round(resolution * width));
  const innerHeight = Math.max(1, Math.round(resolution * height));
  sample.width = innerWidth + 2;
  sample.height = innerHeight + 2;
  const context = sample.getContext('2d');
  context.drawImage(canvas, 1, 1, innerWidth, innerHeight);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const loops = traceSilhouette(pixels, sample.width, sample.height);
  const shapePath = new ShapePath();
  // Alpha contours are undirected. Nesting, independent of traversal direction, defines holes.
  shapePath.userData.style = { fillRule: 'evenodd' };
  for (const loop of loops) {
    const contour = simplifyLoop(loop, .67).slice(0, -1);
    if (contour.length < 3) continue;
    const points = contour.map(({ x, y }) => new Vector2(
      ((x - .5) / innerWidth - .5) * width, (.5 - (y - .5) / innerHeight) * height,
    ));
    addContour(shapePath, points);
  }
  return { width, height, shapes: shapePath.toShapes() };
}

function addContour(path, points) {
  const corners = points.map((vertex, index) => {
    const previous = points.at(index - 1);
    const next = points[(index + 1) % points.length];
    const incoming = vertex.clone().sub(previous);
    const outgoing = next.clone().sub(vertex);
    const smoothCorner = incoming.normalize().dot(outgoing.normalize()) > .79;
    if (!smoothCorner) return { vertex, start: vertex, end: vertex };
    // Preserve the long straight edges while easing the joins along curved outlines.
    const reach = Math.min(vertex.distanceTo(previous), vertex.distanceTo(next)) * .46;
    return {
      vertex, start: vertex.clone().addScaledVector(incoming, -reach),
      end: vertex.clone().addScaledVector(outgoing, reach),
    };
  });
  const first = corners[0].start;
  path.moveTo(first.x, first.y);
  for (const { vertex, start, end } of corners) {
    if (start !== first) path.lineTo(start.x, start.y);
    if (start !== vertex) path.quadraticCurveTo(vertex.x, vertex.y, end.x, end.y);
  }
  path.lineTo(first.x, first.y);
}

function roundedPlate(width, height) {
  const x = width / 2, y = height / 2;
  const radius = Math.min(width, height) * .13;
  return new Shape()
    .moveTo(-x + radius, -y).lineTo(x - radius, -y)
    .quadraticCurveTo(x, -y, x, -y + radius).lineTo(x, y - radius)
    .quadraticCurveTo(x, y, x - radius, y).lineTo(-x + radius, y)
    .quadraticCurveTo(-x, y, -x, y - radius).lineTo(-x, -y + radius)
    .quadraticCurveTo(-x, -y, -x + radius, -y);
}

function traceSilhouette(pixels, width, height) {
  const nodes = new Map();
  const threshold = 112.5;
  const alpha = index => pixels[index * 4 + 3];
  function node(index, vertical) {
    const id = 2 * index + vertical;
    if (nodes.has(id)) return nodes.get(id);
    const value = alpha(index);
    const fraction = (threshold - value) / (alpha(index + (vertical ? width : 1)) - value);
    const x = index % width, y = Math.floor(index / width);
    const result = {
      point: new Vector2(x + (vertical ? 0 : fraction), y + (vertical ? fraction : 0)),
      neighbors: [],
      visited: false,
    };
    nodes.set(id, result);
    return result;
  }
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const top = y * width + x, bottom = top + width;
      const a = alpha(top), b = alpha(top + 1), c = alpha(bottom + 1), d = alpha(bottom);
      const mask = +(a > threshold) + 2 * (b > threshold) + 4 * (c > threshold) + 8 * (d > threshold);
      // Marching squares with sub-pixel interpolation across antialiased edges.
      const saddle = (mask === 5 || mask === 10) && (a + b + c + d) / 4 > threshold;
      const pairs = edgePairs[saddle ? 15 - mask : mask];
      if (!pairs.length) continue;
      const corners = [top, top + 1, bottom, top];
      for (let i = 0; i < pairs.length; i += 2) {
        const from = node(corners[pairs[i]], pairs[i] % 2);
        const to = node(corners[pairs[i + 1]], pairs[i + 1] % 2);
        from.neighbors.push(to);
        to.neighbors.push(from);
      }
    }
  }

  const loops = [];
  for (const first of nodes.values()) {
    if (first.visited) continue;
    const loop = [];
    let current = first;
    while (current) {
      current.visited = true;
      loop.push(current.point);
      current = current.neighbors.find(neighbor => !neighbor.visited);
    }
    if (loop.length >= 4) loops.push([...loop, first.point]);
  }
  return loops;
}

function simplifyLoop(points, tolerance) {
  const start = points[0], end = points.at(-1);
  const line = end.clone().sub(start);
  const scratch = new Vector2();
  const length = line.lengthSq();
  let split = 0;
  let maximum = tolerance ** 2;
  for (let index = 1; index < points.length - 1; index++) {
    const relative = scratch.copy(points[index]).sub(start);
    const progress = length ? Math.max(0, Math.min(1, relative.dot(line) / length)) : 0;
    const distance = relative.addScaledVector(line, -progress).lengthSq();
    if (distance <= maximum) continue;
    maximum = distance;
    split = index;
  }
  if (!split) return [start, end];
  return [...simplifyLoop(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplifyLoop(points.slice(split), tolerance)];
}
