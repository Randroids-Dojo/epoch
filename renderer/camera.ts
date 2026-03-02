/** Camera state: describes how world-space maps to canvas CSS-pixel space. */
export interface Camera {
  /** World-space origin in canvas CSS pixels. */
  x: number;
  y: number;
  /** Scale: canvas_css_px = world_px * zoom. */
  zoom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3.0;
export const DEFAULT_ZOOM = 1.0;

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/**
 * Zoom toward a fixed screen-space anchor point (e.g. mouse cursor).
 * The anchor stays at the same canvas position before and after zooming.
 */
export function zoomToward(
  cam: Camera,
  factor: number,
  anchorX: number,
  anchorY: number,
): Camera {
  const newZoom = clampZoom(cam.zoom * factor);
  const scale = newZoom / cam.zoom;
  return {
    x: anchorX - scale * (anchorX - cam.x),
    y: anchorY - scale * (anchorY - cam.y),
    zoom: newZoom,
  };
}

/** World-space → canvas CSS-pixel space. */
export function worldToCanvas(
  wx: number,
  wy: number,
  cam: Camera,
): { x: number; y: number } {
  return { x: cam.x + wx * cam.zoom, y: cam.y + wy * cam.zoom };
}

/** Canvas CSS-pixel space → world-space. */
export function canvasToWorld(
  cx: number,
  cy: number,
  cam: Camera,
): { x: number; y: number } {
  return { x: (cx - cam.x) / cam.zoom, y: (cy - cam.y) / cam.zoom };
}
