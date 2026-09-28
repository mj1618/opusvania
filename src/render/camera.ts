/** Reference resolution. Everything renders at this size and the canvas is CSS-scaled to fit. */
export const VIEW_W = 1920;
export const VIEW_H = 1080;

export interface Camera {
  /** World position of the view's top-left corner. */
  x: number;
  y: number;
}

/**
 * Centres the view on the focus point, clamped so it never shows outside the room.
 * If the room is smaller than the view on an axis, the room is centred on that axis.
 */
export function clampCamera(
  focusX: number,
  focusY: number,
  roomW: number,
  roomH: number,
  viewW = VIEW_W,
  viewH = VIEW_H,
): Camera {
  const axis = (focus: number, room: number, view: number) =>
    room <= view ? (room - view) / 2 : Math.min(Math.max(focus - view / 2, 0), room - view);
  return { x: Math.round(axis(focusX, roomW, viewW)), y: Math.round(axis(focusY, roomH, viewH)) };
}
