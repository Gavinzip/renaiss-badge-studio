const dragThreshold = 8;
const wheelIdleDelay = 120;

export function attachRotationInput(canvas, host, { hold, pan, release, beginFlip, dragFlip, endFlip, hoverAt, selectAt }) {
  const listeners = new AbortController();
  const { signal } = listeners;
  const pointers = new Map();
  let gesture;
  let tapPending = false;
  let wheel;
  let wheelTimer;

  function center() {
    let x = 0, y = 0;
    for (const point of pointers.values()) {
      x += point.x;
      y += point.y;
    }
    return { x: x / pointers.size, y: y / pointers.size };
  }

  function moveGesture(event) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture) return;
    const point = center();
    const dx = point.x - gesture.last.x, dy = point.y - gesture.last.y;
    if (!gesture.moved) {
      if (Math.hypot(dx, dy) < (gesture.flip ? 2 : dragThreshold)) return;
      gesture.moved = true;
      host.dataset.dragging = 'true';
      if (gesture.flip) {
        beginFlip();
      }
    }
    if (!(dx || dy)) return;
    const now = performance.now();
    if (gesture.flip) dragFlip(dx, dy);
    else pan(dx, dy, (now - gesture.at) / 1000);
    gesture.last = point;
    gesture.at = now;
  }

  function onMove(event) {
    if (pointers.has(event.pointerId)) moveGesture(event);
    if (event.pointerType === 'mouse' && !gesture?.moved) hoverAt(event);
  }

  function onDown(event) {
    if (event.button !== 0 || pointers.size >= 2 || (!event.isPrimary && event.pointerType !== 'touch')) return;
    if (pointers.size && event.pointerType !== 'touch') return;
    endWheel();
    hold();
    tapPending = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture = { flip: pointers.size === 2, last: center(), at: performance.now(), moved: false };
    canvas.setPointerCapture(event.pointerId);
  }

  function onRelease(event) {
    if (!pointers.has(event.pointerId)) return;
    const released = event.type === 'pointerup';
    if (released) moveGesture(event);
    pointers.delete(event.pointerId);
    const current = gesture;
    gesture = null;
    host.dataset.dragging = 'false';
    if (!current) return;

    if (current.flip && current.moved) endFlip();
    else release((performance.now() - current.at) / 1000, released && !current.flip ? 1 : 0);
    tapPending = released && !current.flip && !current.moved;
  }

  function onClick(event) {
    if (!tapPending) return;
    // Open on the tap's click so it cannot land on the newly opened editor.
    tapPending = false;
    selectAt(event);
  }

  function endWheel() {
    clearTimeout(wheelTimer);
    if (wheel) endFlip();
    wheel = null;
  }

  function onWheel(event) {
    if (event.ctrlKey || pointers.size) return;
    const { deltaMode, deltaX, deltaY, shiftKey } = event;
    const x = deltaX || (shiftKey ? deltaY : 0);
    const y = shiftKey ? 0 : deltaY;
    if (!(x || y)) return;
    if (event.cancelable) event.preventDefault();

    if (!wheel) {
      wheel = true;
      beginFlip();
    }
    const scale = deltaMode === 1 ? 16 : deltaMode === 2 ? canvas.clientHeight : 1;
    dragFlip(-x * scale, -y * scale);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(endWheel, wheelIdleDelay);
  }

  canvas.addEventListener('pointermove', onMove, { signal });
  canvas.addEventListener('pointerleave', () => { host.dataset.hover = 'false'; }, { signal });
  canvas.addEventListener('pointerdown', onDown, { signal });
  canvas.addEventListener('pointerup', onRelease, { signal });
  canvas.addEventListener('pointercancel', onRelease, { signal });
  canvas.addEventListener('lostpointercapture', onRelease, { signal });
  canvas.addEventListener('click', onClick, { signal });
  canvas.addEventListener('wheel', onWheel, { signal, passive: false });

  function reset() {
    const captured = Array.from(pointers.keys());
    pointers.clear();
    gesture = null;
    tapPending = false;
    host.dataset.dragging = 'false';
    for (const id of captured) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    clearTimeout(wheelTimer);
    wheel = null;
  }

  function cancel() {
    reset();
    release(0, 0);
  }
  window.addEventListener('blur', cancel, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel();
  }, { signal });

  return {
    reset,
    dispose() {
      reset();
      listeners.abort();
    },
  };
}
