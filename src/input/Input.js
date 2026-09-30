const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
export class Input {
  constructor(canvas, onAction, onBlur) {
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, active: false };
    window.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const focused = document.activeElement === canvas;
      if (movementKeys.has(event.code) && focused) {
        event.preventDefault(); this.keys.add(event.code);
      }
      const action = { Escape: 'pause', KeyP: 'pause', Space: 'snap', KeyR: 'reset', KeyH: 'handoff', KeyJ: 'juke', KeyF: 'fieldGoal', KeyK: 'punt', KeyQ: 'audiblePrevious', KeyE: 'audibleNext' }[event.code];
      if (action && (focused || action === 'pause')) {
        event.preventDefault();
        if (!event.repeat) onAction(action);
      }
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.clear(); onBlur(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); onBlur(); } });
    canvas.addEventListener('blur', () => this.clear());
    const point = event => {
      const rect = canvas.getBoundingClientRect();
      this.pointer = { x: event.clientX - (this.drag?.left ?? rect.left), y: event.clientY - (this.drag?.top ?? rect.top), active: true };
    };
    this.drag = null;
    canvas.addEventListener('pointermove', point);
    canvas.addEventListener('pointerleave', () => { if (!this.drag) this.pointer.active = false; });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.drag) return;
      canvas.focus({ preventScroll: true }); point(event);
      if (!onAction('aimStart')) return;
      const rect = canvas.getBoundingClientRect();
      this.drag = { x: this.pointer.x, y: this.pointer.y, id: event.pointerId, left: rect.left, top: rect.top };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener('pointerup', event => {
      if (!this.drag || event.pointerId !== this.drag.id || event.button !== 0) return;
      point(event); onAction('throw'); this.cancelDrag();
    });
    this.cancelDrag = () => {
      const id = this.drag?.id; this.drag = null;
      if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    canvas.addEventListener('pointercancel', () => this.cancelDrag());
    canvas.addEventListener('lostpointercapture', () => { this.drag = null; });
    window.addEventListener('resize', () => this.cancelDrag());
  }
  clear() { this.keys.clear(); this.cancelDrag?.(); }

  get movement() {
    const has = (...codes) => codes.some(code => this.keys.has(code));
    let x = Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft'));
    let y = Number(has('KeyS', 'ArrowDown')) - Number(has('KeyW', 'ArrowUp'));
    const length = Math.hypot(x, y);
    if (length) { x /= length; y /= length; }
    return { x, y, sprint: has('ShiftLeft', 'ShiftRight') };
  }
}
