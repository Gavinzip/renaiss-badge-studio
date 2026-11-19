import {
  ACESFilmicToneMapping, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import { createBadgeReflections, lightBadgeArtwork } from './lighting.js';
import { createBadgeModel, createBadgeOutline } from './models.js';
import { advanceWall, introTiming, layoutBadges, moveWall, outlinePose, poseBadge } from './motion.js';
import { attachRotationInput } from './rotation-input.js';
import { defaultSettings, displayMetal } from './settings.js';

export function createBadgeScene(host, { select, graphicsError, settings: initialSettings }) {
  let settings = initialSettings ?? defaultSettings;
  const gl = host.ownerDocument.createElement('canvas');
  const context = gl.getContext('webgl2', { antialias: true, alpha: true });
  if (!context) throw new Error('此瀏覽器或裝置無法使用 WebGL 2。');
  const renderer = new WebGLRenderer({ canvas: gl, context, antialias: true, alpha: true });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));

  const scene = new Scene();
  const wall = host.closest('.badge-wall');
  const camera = new PerspectiveCamera(38, 1, .1, 80);
  camera.position.z = 17;
  const visibleHeight = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360);
  lightBadgeArtwork(scene);
  let environment = createBadgeReflections(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = .9;
  host.append(gl);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const object = new Object3D();
  const projected = new Vector3();
  const rotation = { x: 0, y: 0, speedX: 0, speedY: 0, yaw: 0, pitch: 0, held: false, updatedAt: 0 };
  const face = { yaw: 0, pitch: 0 };
  const initialCurvature = settings.curvedSurface ? 1 : 0;
  const curvature = { value: initialCurvature, from: initialCurvature, target: initialCurvature, started: 0 };
  let models = [], sources = [], layout, outline;
  let started = 0, previousFrame = 0, contextLost = false;
  let activeUntil = 0, needsPaint = true;
  let playingIntro;

  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    if (!(width && height)) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    layout = layoutBadges(width, height, visibleHeight, camera.position.z);
    needsPaint = true;
  }

  function render(now) {
    const time = now / 1000;
    const delta = previousFrame ? Math.min(.05, time - previousFrame) : 1 / 60;
    previousFrame = time;
    const moving = (!rotation.held && Boolean(rotation.speedX || rotation.speedY))
      || Math.hypot(rotation.yaw, rotation.pitch) > .001 || curvature.value !== curvature.target;
    if (document.hidden || contextLost || !models.length || !layout || (!needsPaint && !moving && time > activeUntil)) return;
    advanceWall(rotation, time, delta, reduced.matches, settings.glideDuration);
    if (curvature.value !== curvature.target) {
      const progress = reduced.matches ? 1 : Math.max(0, Math.min(1, (time - curvature.started) / .24));
      curvature.value = progress === 1 ? curvature.target
        : curvature.from + (curvature.target - curvature.from) * (1 - (1 - progress) ** 3);
      models.forEach(model => model.setCurvature(curvature.value));
    }
    const intro = reduced.matches ? introTiming.end : time - started;
    const introBeforeWall = intro < introTiming.controls;
    if (introBeforeWall !== playingIntro) {
      playingIntro = introBeforeWall;
      wall.dataset.intro = String(playingIntro);
    }
    for (const badge of layout.badges) {
      badge.visible = poseBadge(badge, object, layout, rotation, face, models.length, intro, reduced.matches);
      if (badge.visible) {
        const distance = 1 - object.position.z / camera.position.z;
        const padding = object.scale.x * .72;
        badge.visible = Math.abs(object.position.x) < .5 * layout.viewWidth * distance + padding
          && Math.abs(object.position.y) < .5 * visibleHeight * distance + padding;
        if (badge.visible) {
          object.updateMatrix();
          models[badge.source].draw(object.matrix, !badge.central || intro > introTiming.artwork);
        }
      }
      if (badge.central) {
        const { reveal, opacity } = outlinePose(intro);
        outline.draw(object, reveal, opacity);
      }
    }
    for (const model of models) model.flush();
    renderer.render(scene, camera);
    needsPaint = false;
  }

  function nearestBadge(event) {
    if (!layout || (!reduced.matches && performance.now() / 1000 - started < introTiming.controls)) return null;
    const rect = gl.getBoundingClientRect();
    let nearest = null, nearestDistance = Infinity;
    for (const badge of layout.badges) {
      if (!badge.visible) continue;
      projected.set(badge.x, badge.y, badge.z).project(camera);
      const x = rect.left + (.5 + projected.x * .5) * rect.width;
      const y = rect.top + (.5 - projected.y * .5) * rect.height;
      const distance = Math.hypot(event.clientX - x, event.clientY - y);
      const radius = Math.max(19, badge.size / visibleHeight * rect.height * .67);
      if (distance < radius && distance < nearestDistance) {
        nearest = badge;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function hoverAt(event) {
    host.dataset.hover = String(Boolean(nearestBadge(event)));
  }

  function selectAt(event) {
    const badge = nearestBadge(event);
    if (badge) select(badge.source);
  }

  function replay() {
    started = performance.now() / 1000;
    activeUntil = started + introTiming.end + .2;
    needsPaint = true;
    resetMotion();
    rotation.x = rotation.y = 0;
    face.yaw = face.pitch = 0;
  }

  function resetMotion() {
    input.reset();
    rotation.speedX = rotation.speedY = rotation.yaw = rotation.pitch = 0;
    rotation.held = false;
  }

  function hold() {
    rotation.held = true;
    rotation.speedX = rotation.speedY = 0;
  }

  function pan(dx, dy, elapsed) {
    if (!layout) return;
    const now = performance.now() / 1000;
    showCollection(now);
    const unit = visibleHeight / (gl.clientHeight * layout.stride);
    moveWall(rotation, dx * unit, -dy * unit, elapsed, now, reduced.matches);
    activeUntil = Math.max(activeUntil, now + .35);
    needsPaint = true;
  }

  function release(age, momentum) {
    rotation.held = false;
    const decay = reduced.matches || settings.glideDuration === 0 ? 0 : momentum * Math.exp(-age * 14);
    rotation.speedX *= decay;
    rotation.speedY *= decay;
  }

  function showCollection(now) {
    if (now - started < introTiming.end) started = now - introTiming.end;
  }

  function beginFlip() {
    hold();
    showCollection(performance.now() / 1000);
    needsPaint = true;
  }

  function dragFlip(dx, dy) {
    const radiansPerPixel = settings.rotationSensitivity * Math.PI / 18000;
    face.yaw += dx * radiansPerPixel;
    face.pitch += dy * radiansPerPixel;
    needsPaint = true;
  }

  function endFlip() {
    release(0, 0);
    needsPaint = true;
  }

  function flipWall() {
    input.reset();
    beginFlip();
    face.yaw += Math.PI;
    endFlip();
  }

  function turnWall() {
    input.reset();
    showCollection(performance.now() / 1000);
    if (reduced.matches) {
      rotation.x -= 2;
    } else {
      rotation.held = false;
      rotation.speedX = -9;
      rotation.speedY = 0;
    }
    needsPaint = true;
  }

  function prepareCollection(entries) {
    const next = [];
    let nextOutline;
    try {
      for (const { source, image } of entries) next.push(createBadgeModel(source, image));
      nextOutline = createBadgeOutline(next[0].shapes);
    } catch (error) {
      next.forEach(model => model.dispose());
      throw error;
    }
    return {
      commit(animation = false) {
        for (const model of models) model.dispose();
        outline?.dispose();
        models = next;
        sources = entries.map(({ source }) => source);
        outline = nextOutline;
        resetMotion();
        scene.add(outline.group, ...models.map(model => model.group));
        updateAppearance();
        resize();
        renderer.compile(scene, camera);
        if (animation) replay();
        else started = performance.now() / 1000 - introTiming.end;
        render(performance.now());
      },
      discard() {
        next.forEach(model => model.dispose());
        nextOutline.dispose();
      },
    };
  }

  function updateAppearance(nextSettings = settings, nextSources = sources) {
    settings = nextSettings;
    sources = nextSources;
    const nextCurvature = settings.curvedSurface ? 1 : 0;
    if (nextCurvature !== curvature.target) {
      curvature.from = curvature.value;
      curvature.target = nextCurvature;
      curvature.started = performance.now() / 1000;
      activeUntil = Math.max(activeUntil, curvature.started + (reduced.matches ? 0 : .24));
    }
    models.forEach((model, index) => {
      model.setAppearance(displayMetal(settings, sources[index], index), settings.roughness,
        settings.preserveArtwork, settings.reliefEnabled, settings.reliefHeight);
      model.setCurvature(curvature.value);
    });
    needsPaint = true;
  }

  function stop() {
    resetMotion();
    needsPaint = true;
  }

  function motionPreference() {
    started = performance.now() / 1000 - introTiming.end;
    resetMotion();
    needsPaint = true;
  }

  function resumeVisibleFrame() {
    if (document.hidden) return;
    previousFrame = 0;
    needsPaint = true;
  }

  const input = attachRotationInput(gl, host, {
    hold, pan, release, beginFlip, dragFlip, endFlip, hoverAt, selectAt,
  });
  gl.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    graphicsError('3D 繪圖連線中斷，正在等待瀏覽器恢復。');
  });
  gl.addEventListener('webglcontextrestored', () => {
    environment.dispose();
    environment = createBadgeReflections(renderer);
    scene.environment = environment.texture;
    contextLost = false;
    needsPaint = true;
    graphicsError('');
  });
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  reduced.addEventListener('change', motionPreference);
  document.addEventListener('visibilitychange', resumeVisibleFrame);
  renderer.setAnimationLoop(render);

  function dispose() {
    renderer.setAnimationLoop(null);
    input.dispose();
    observer.disconnect();
    reduced.removeEventListener('change', motionPreference);
    document.removeEventListener('visibilitychange', resumeVisibleFrame);
    models.forEach(model => model.dispose());
    outline?.dispose();
    environment.dispose();
    renderer.dispose();
    gl.remove();
  }
  return { prepareCollection, replay, turnWall, flipWall, updateAppearance, stop, dispose };
}
