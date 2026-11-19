import {
  BufferGeometry, CanvasTexture, DynamicDrawUsage, ExtrudeGeometry, Float32BufferAttribute, Group,
  InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Points, PointsMaterial, ShapeGeometry,
} from 'three';
import { describeArtwork } from './outline.js';
import { maximumVisibleBadges } from './motion.js';
import { createBadgeEnamel, createBadgeMetal } from './surfaces.js';
import { analyzeRelief, createFrontSurface, frontCrown } from './relief.js';

const depth = .076;

export function createBadgeModel(source, artwork) {
  const { width, height, shapes } = describeArtwork(artwork);
  if (!shapes.length) throw new Error(`「${source.name}」的圖案太細，無法產生立體輪廓。`);

  const bevel = Math.min(.004, Math.min(width, height) * .02);
  const bodyGeometry = new ExtrudeGeometry(shapes, {
    depth, bevelThickness: bevel * .82, bevelSize: bevel, bevelSegments: 4, curveSegments: 4,
  });
  bodyGeometry.translate(0, 0, -depth / 2);
  const positions = bodyGeometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const z = positions.getZ(index);
    const bend = Math.max(0, Math.min(1, z / (depth / 2)));
    positions.setZ(index, z + bend * frontCrown(positions.getX(index), positions.getY(index), width, height));
  }
  bodyGeometry.computeVertexNormals();
  smoothBevelNormals(bodyGeometry);
  // All sides share one metal material, so the wall can batch them by artwork.
  bodyGeometry.clearGroups();
  const isProtocol = source.builtin === 'protocol';
  const bodyMaterial = createBadgeMetal();

  const group = new Group();
  const body = makeInstances(bodyGeometry, bodyMaterial);
  const face = createBadgeFace(artwork, shapes, width, height, bevel, isProtocol, bodyMaterial);
  group.add(body, face.mesh);
  let bodyCount = 0, faceCount = 0;
  return {
    group, shapes,
    setAppearance(color, roughness, preserve, reliefEnabled, reliefHeight) {
      bodyMaterial.color.set(color);
      bodyMaterial.roughness = roughness;
      face.setAppearance(color, roughness, preserve, reliefEnabled, reliefHeight);
    },
    draw(matrix, showArtwork) {
      body.setMatrixAt(bodyCount++, matrix);
      if (showArtwork || isProtocol) face.mesh.setMatrixAt(faceCount++, matrix);
    },
    flush() {
      body.count = bodyCount;
      if (bodyCount) body.instanceMatrix.needsUpdate = true;
      face.mesh.count = faceCount;
      if (faceCount) face.mesh.instanceMatrix.needsUpdate = true;
      bodyCount = faceCount = 0;
    },
    dispose() {
      group.removeFromParent();
      body.dispose();
      face.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
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
      // Join duplicate vertices on the same bevel without blending nearby features.
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

function createBadgeFace(artwork, shapes, width, height, bevel, isProtocol, bodyMaterial) {
  const analysis = analyzeRelief(artwork.canvas);
  const surface = createFrontSurface(shapes, width, height, depth / 2 + bevel * .82, analysis);
  const enamel = isProtocol ? null : createBadgeEnamel(artwork);
  const mesh = makeInstances(surface.geometry, enamel?.material ?? bodyMaterial);
  return {
    mesh,
    setAppearance(color, roughness, preserve, reliefEnabled, reliefHeight) {
      if (enamel) {
        enamel.metal.color.set(color);
        enamel.metal.roughness = roughness;
        mesh.material = preserve ? enamel.material : enamel.metal;
      }
      surface.setHeight(reliefEnabled && !isProtocol ? reliefHeight : 0);
    },
    dispose() {
      mesh.dispose();
      surface.geometry.dispose();
      enamel?.dispose();
    },
  };
}

function makeInstances(geometry, material) {
  const mesh = new InstancedMesh(geometry, material, maximumVisibleBadges);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

export function createBadgeOutline(shapes) {
  const segments = [];
  const anchors = [];
  for (const shape of shapes) {
    for (const contour of [shape, ...shape.holes]) {
      const points = contour.getPoints(5);
      let lastAnchor = points[0];
      anchors.push(lastAnchor.x, lastAnchor.y, .087);
      for (let index = 0; index < points.length; index++) {
        const start = points[index], end = points[(index + 1) % points.length];
        if (!start.equals(end)) segments.push(start.x, start.y, .087, end.x, end.y, .087);
        if (start.distanceTo(lastAnchor) < .078) continue;
        anchors.push(start.x, start.y, .087);
        lastAnchor = start;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(segments, 3));
  const material = new LineBasicMaterial({ color: '#b8d6fa', transparent: true, depthWrite: false });
  const line = new LineSegments(geometry, material);
  const anchorsGeometry = new BufferGeometry();
  anchorsGeometry.setAttribute('position', new Float32BufferAttribute(anchors, 3));
  const ring = createAnchorTexture();
  const pointMaterial = new PointsMaterial({
    map: ring, size: .17, transparent: true, depthWrite: false, alphaTest: .04,
  });
  const points = new Points(anchorsGeometry, pointMaterial);
  const base = new ShapeGeometry(shapes, 4);
  base.translate(0, 0, .084);
  const baseMaterial = new MeshBasicMaterial({
    color: '#283851', transparent: true, depthWrite: false,
  });
  const group = new Group();
  group.add(new Mesh(base, baseMaterial), line, points);
  return {
    group,
    draw(object, reveal, opacity) {
      group.visible = opacity > 0;
      if (!group.visible) return;
      group.position.copy(object.position);
      group.rotation.copy(object.rotation);
      group.scale.copy(object.scale);
      geometry.setDrawRange(0, Math.ceil(segments.length / 6 * reveal) * 2);
      anchorsGeometry.setDrawRange(0, Math.ceil(anchors.length / 3 * reveal));
      material.opacity = opacity;
      pointMaterial.opacity = opacity;
      baseMaterial.opacity = opacity * .58;
    },
    dispose() {
      group.removeFromParent();
      material.dispose();
      geometry.dispose();
      pointMaterial.dispose();
      anchorsGeometry.dispose();
      ring.dispose();
      base.dispose();
      baseMaterial.dispose();
    },
  };
}

function createAnchorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  context.fillStyle = '#101b2e';
  context.strokeStyle = '#5c96fd';
  context.lineWidth = 4;
  context.beginPath();
  context.arc(16, 16, 12, 0, 2 * Math.PI);
  context.fill();
  context.stroke();
  return new CanvasTexture(canvas);
}
