import { MathUtils } from 'three';

const { clamp, lerp, damp } = MathUtils;
export const introTiming = { cast: 1.93, artwork: 2.53, wall: 3.98, controls: 4.73, end: 5.32 };
export const maximumVisibleBadges = 31 * 15;

function easeOut(progress) {
  return 1 - (1 - clamp(progress, 0, 1)) ** 3;
}

function smooth(progress) {
  const t = clamp(progress, 0, 1);
  return t * t * (3 - 2 * t);
}

export function layoutBadges(width, height, visibleHeight, cameraDepth) {
  const stride = visibleHeight / (height < 560 ? 5.75 : 6.6);
  const viewWidth = visibleHeight * width / height;
  const radiusX = Math.max(17, viewWidth * 1.15, .053 * viewWidth ** 2);
  const radiusY = 17;
  const horizontalArc = Math.acos(radiusX / (radiusX + cameraDepth));
  const verticalArc = Math.acos(radiusY / (radiusY + cameraDepth));
  const halfColumns = clamp(Math.ceil(viewWidth / stride * .76) + 2, 3, 15);
  const halfRows = 7;
  const badges = [];
  for (let row = -halfRows; row <= halfRows; row++) {
    for (let column = -halfColumns; column <= halfColumns; column++) {
      badges.push({
        row, column, central: column === 0 && row === 0, source: 0, visible: false,
        x: 0, y: 0, z: 0, size: 0,
        delay: Math.hypot(column, row) * .065,
      });
    }
  }
  return { badges, stride, radiusX, radiusY, horizontalArc, verticalArc, viewWidth };
}

export function moveWall(rotation, distanceX, distanceY, elapsed, time, reduced) {
  rotation.x += distanceX;
  rotation.y += distanceY;
  rotation.held = true;
  rotation.updatedAt = time;
  const interval = Math.max(.008, elapsed, Math.hypot(distanceX, distanceY) / 32);
  const follow = 1 - Math.exp(-Math.min(interval, .12) * 32);
  rotation.speedX = reduced ? 0 : lerp(rotation.speedX, distanceX / interval, follow);
  rotation.speedY = reduced ? 0 : lerp(rotation.speedY, distanceY / interval, follow);
}

export function advanceWall(rotation, time, delta, reduced, glideDuration) {
  if (reduced || glideDuration === 0) rotation.speedX = rotation.speedY = 0;
  if (!rotation.held && (rotation.speedX || rotation.speedY)) {
    const friction = 5 / glideDuration;
    const remaining = Math.exp(-friction * delta);
    const travel = (1 - remaining) / friction;
    rotation.x += rotation.speedX * travel;
    rotation.y += rotation.speedY * travel;
    rotation.speedX *= remaining;
    rotation.speedY *= remaining;
    if (Math.hypot(rotation.speedX, rotation.speedY) < .03) rotation.speedX = rotation.speedY = 0;
  }
  const recentInput = rotation.held ? Math.exp(-Math.max(0, time - rotation.updatedAt - .045) * 10) : 1;
  const targetYaw = reduced ? 0 : clamp(-rotation.speedX * recentInput * .14, -1.14, 1.14);
  const targetPitch = reduced ? 0 : clamp(rotation.speedY * recentInput * .14, -1.14, 1.14);
  rotation.yaw = damp(rotation.yaw, targetYaw, 12, delta);
  rotation.pitch = damp(rotation.pitch, targetPitch, 12, delta);
}

export function poseBadge(badge, object, layout, rotation, face, sourceCount, intro, reduced) {
  const { row, column, central, delay } = badge;
  const { stride, radiusX, radiusY, horizontalArc, verticalArc } = layout;
  // Recycle only the outer slots. The logical column and its artwork travel
  // together, so crossing a column boundary cannot change a visible badge.
  const shiftX = Math.round(rotation.x), shiftY = Math.round(rotation.y);
  const relativeX = column + (rotation.x - shiftX), relativeY = row + (rotation.y - shiftY);
  const logical = column - shiftX - (row - shiftY) * (Math.ceil(sourceCount * .43) + 1);
  badge.source = ((logical % sourceCount) + sourceCount) % sourceCount;

  const angleX = relativeX * stride / radiusX, angleY = relativeY * stride / radiusY;
  const x = Math.sin(angleX) * radiusX, y = Math.sin(angleY) * radiusY + .45;
  const z = (Math.cos(angleX) - 1) * radiusX + (Math.cos(angleY) - 1) * radiusY;
  const size = clamp(1.11 - Math.hypot(relativeX, relativeY) * .045, .64, 1.11) * stride * .68;
  const yaw = angleX + rotation.yaw;
  const pitch = -angleY + rotation.pitch;
  const entrance = reduced || intro >= introTiming.end ? 1 : easeOut((intro - introTiming.wall - .82 * delay) / .84);

  badge.x = x;
  badge.y = y;
  badge.z = z;
  badge.size = size;
  object.position.set(x, y, z);
  object.rotation.set(pitch, yaw, Math.sin(logical * 1.31 + (row - shiftY) * 1.53) * .067);
  object.rotateX(face.pitch);
  object.rotateY(face.yaw);
  object.scale.setScalar(size);

  if (central && !reduced && intro < introTiming.end) {
    const settle = easeOut((intro - introTiming.wall) / 1.12);
    const cast = smooth((intro - introTiming.cast) / .69);
    const presentationTurn = Math.sin(Math.PI * clamp((intro - 2.52) / 1.74, 0, 1));
    object.position.set(lerp(0, x, settle), lerp(.43, y, settle), lerp(3.7, z, settle));
    object.rotation.set(lerp(.06 + .18 * presentationTurn, pitch, settle),
      lerp(.11 * cast - 1.03 * presentationTurn, yaw, settle), -.06 * (1 - settle));
    const scale = lerp(3.4, size, settle);
    object.scale.set(scale, scale, scale * lerp(.03, 1, cast));
    return intro >= introTiming.cast;
  }
  if (Math.abs(angleX) > horizontalArc || Math.abs(angleY) > verticalArc || entrance === 0) return false;
  if (entrance === 1) return true;
  object.position.set(x * lerp(.7, 1, entrance), y * lerp(.63, 1, entrance), lerp(-2.2, z, entrance));
  object.rotation.y += Math.sign(x || 1) * (1 - entrance) * 1.9;
  object.scale.multiplyScalar(lerp(.21, 1, entrance));
  return true;
}

export function outlinePose(intro) {
  return {
    reveal: smooth((intro + .09) / 1.45),
    opacity: smooth((intro + .09) / .42) * (1 - smooth((intro - introTiming.cast) / .54)),
  };
}
