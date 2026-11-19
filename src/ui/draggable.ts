/**
 * Make elements draggable
 */

/**
 * Make an element draggable by a handle
 * @param element The element to make draggable (absolutely positioned in page coordinates)
 * @param handle The drag handle element
 */
export function makeDraggable(element: HTMLElement, handle: HTMLElement): void {
  let startX = 0;
  let startY = 0;
  let pointerX = 0;
  let pointerY = 0;

  const drag = (e: PointerEvent) => {
    e.preventDefault();
    element.style.left = `${startX + e.clientX - pointerX}px`;
    element.style.top = `${startY + e.clientY - pointerY}px`;
  };

  const dragEnd = (e: PointerEvent) => {
    handle.releasePointerCapture(e.pointerId);
    handle.removeEventListener('pointermove', drag);
    handle.removeEventListener('pointerup', dragEnd);
    handle.removeEventListener('pointercancel', dragEnd);
  };

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    // Don't start dragging if pressing a control in the handle
    const target = e.target as HTMLElement;
    if (e.button !== 0 || target.closest('button, select')) {
      return;
    }

    // offsetLeft/Top are page coordinates, matching how the popup is positioned
    startX = element.offsetLeft;
    startY = element.offsetTop;
    pointerX = e.clientX;
    pointerY = e.clientY;

    // Pointer capture keeps move/up events on the handle, so nothing listens on document
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener('pointermove', drag);
    handle.addEventListener('pointerup', dragEnd);
    handle.addEventListener('pointercancel', dragEnd);
    e.preventDefault();
  });
}
