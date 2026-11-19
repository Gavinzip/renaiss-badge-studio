import {
  BufferGeometry, CanvasTexture, DynamicDrawUsage, Float32BufferAttribute, Group,
  InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Points, PointsMaterial, ShapeGeometry,
} from 'three';
import { describeArtwork } from './outline.js';
import { createBadgeBody } from './body.js';
import { findDetailContours } from './detail-contours.js';
import { createMetalTrim } from './metal-trim.js';
import { maximumVisibleBadges } from './motion.js';
import { createBadgeEnamel, createBadgeMetal } from './surfaces.js';
import { analyzeRelief, createFrontSurface } from './relief.js';

const depth = .076;

export function createBadgeModel(source, artwork) {
  const { width, height, shapes } = describeArtwork(artwork);
  if (!shapes.length) throw new Error(`「${source.name}」的圖案太細，無法產生立體輪廓。`);

  const bevel = Math.min(.008, Math.min(width, height) * .02);
  const bodySurface = createBadgeBody(shapes, width, height, depth, bevel);
  const bodyGeometry = bodySurface.geometry;
  const isProtocol = source.builtin === 'protocol';
  const bodyMaterial = createBadgeMetal();
  const analysis = analyzeRelief(artwork.canvas);

  const group = new Group();
  const body = makeInstances(bodyGeometry, bodyMaterial);
  const face = createBadgeFace(artwork, shapes, width, height, bevel, isProtocol, bodyMaterial, analysis);
  const trimMaterial = createBadgeMetal();
  // Rounded polished inlay is isotropic; it has no brushed UV tangent frame.
  trimMaterial.anisotropy = 0;
  const frontZ = depth / 2 + bevel * .82 + .0006;
  const trimSurfaces = [
    createMetalTrim(shapes.flatMap(shape => [shape, ...shape.holes]), width, height, frontZ, analysis, .008),
    createMetalTrim(isProtocol ? [] : findDetailContours(analysis), width, height, frontZ, analysis, .0038),
  ];
  const trims = trimSurfaces.map(surface => makeInstances(surface.geometry, trimMaterial));
  group.add(body, face.mesh, ...trims);
  let curvature = 1, heightOffset = 0, trimStrength = 1;
  let bodyCount = 0, faceCount = 0;
  function updateTrim() {
    trimSurfaces.forEach(surface => surface.update(curvature, heightOffset, trimStrength));
  }
  return {
    group, shapes,
    setAppearance(color, roughness, preserve, reliefEnabled, reliefHeight) {
      bodyMaterial.color.set(color);
      bodyMaterial.roughness = roughness;
      face.setAppearance(color, roughness, preserve, reliefEnabled, reliefHeight);
      trimMaterial.color.set(color);
      trimMaterial.roughness = Math.max(.07, roughness * .5);
      heightOffset = reliefEnabled && !isProtocol ? reliefHeight : 0;
      updateTrim();
    },
    setCurvature(amount) {
      curvature = amount;
      bodySurface.setCurvature(amount);
      face.setCurvature(amount);
      updateTrim();
    },
    setMetalTrim(amount) {
      trimStrength = amount;
      updateTrim();
    },
    draw(matrix, showArtwork) {
      body.setMatrixAt(bodyCount, matrix);
      if (trimStrength > .001) trims[0].setMatrixAt(bodyCount, matrix);
      bodyCount++;
      if (showArtwork || isProtocol) {
        face.mesh.setMatrixAt(faceCount, matrix);
        if (trimStrength > .001) trims[1].setMatrixAt(faceCount, matrix);
        faceCount++;
      }
    },
    flush() {
      body.count = bodyCount;
      if (bodyCount) body.instanceMatrix.needsUpdate = true;
      face.mesh.count = faceCount;
      if (faceCount) face.mesh.instanceMatrix.needsUpdate = true;
      for (const [index, trim] of trims.entries()) {
        trim.count = trimStrength > .001 && trimSurfaces[index].geometry.index.count ? (index ? faceCount : bodyCount) : 0;
        if (trim.count) trim.instanceMatrix.needsUpdate = true;
      }
      bodyCount = faceCount = 0;
    },
    dispose() {
      group.removeFromParent();
      body.dispose();
      face.dispose();
      trims.forEach(mesh => mesh.dispose());
      trimSurfaces.forEach(surface => surface.geometry.dispose());
      trimMaterial.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
    },
  };
}

function createBadgeFace(artwork, shapes, width, height, bevel, isProtocol, bodyMaterial, analysis) {
  const surface = createFrontSurface(shapes, width, height, depth / 2 + bevel * .82, analysis);
  const enamel = isProtocol ? null : createBadgeEnamel(artwork);
  const mesh = makeInstances(surface.geometry, enamel?.material ?? bodyMaterial);
  let curvature = 1, heightOffset = 0;
  return {
    mesh,
    setCurvature(amount) {
      curvature = amount;
      surface.setHeight(heightOffset, curvature);
    },
    setAppearance(color, roughness, preserve, reliefEnabled, reliefHeight) {
      if (enamel) {
        enamel.metal.color.set(color);
        enamel.metal.roughness = roughness;
        enamel.material.roughness = roughness;
        enamel.material.clearcoatRoughness = roughness * .8;
        mesh.material = preserve ? enamel.material : enamel.metal;
      }
      heightOffset = reliefEnabled && !isProtocol ? reliefHeight : 0;
      surface.setHeight(heightOffset, curvature);
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
