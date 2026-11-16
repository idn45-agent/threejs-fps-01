// input.js — keyboard and mouse, nothing else. It tracks which keys are
// held and how far the mouse moved since the last frame; player.js turns
// that into movement, weapon.js into firing. Pointer lock lives here too.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    firing: false,
    locked: false,
    // edge-triggered actions, consumed by whoever reads them
    jumpQueued: false,
    reloadQueued: false,

    lock() {
      canvas.requestPointerLock();
    },
    unlock() {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    // Call once per simulation step: mouse deltas are consumed, not kept.
    consumeMouse() {
      const dx = this.mouseDX;
      const dy = this.mouseDY;
      this.mouseDX = 0;
      this.mouseDY = 0;
      return { dx, dy };
    },
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    if (e.code === 'Space') {
      input.jumpQueued = true;
      e.preventDefault();
    }
    if (e.code === 'KeyR') input.reloadQueued = true;
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.firing = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });
  // Losing the pointer (Esc, alt-tab) stops firing and clears held keys.
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) {
      input.firing = false;
      input.keys.clear();
    }
  });

  return input;
}

// Movement intent for one step, in the player's local frame:
// forward +1, strafe +1 (right), walk/crouch flags.
export function moveIntent(input) {
  const k = input.keys;
  return {
    forward: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
    strafe: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
    walk: k.has('ShiftLeft') || k.has('ShiftRight'),
    crouch: k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight'),
  };
}
