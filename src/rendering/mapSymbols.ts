import * as THREE from 'three';

/**
 * Situation-map symbols shared by the order-of-battle planning map and the
 * in-battle tactical map: the period armour symbol (a rectangle around a
 * track oval), a facing tick, a selection halo and a destroyed cross.
 * Geometry lies in the XY plane; lay it flat with a -90 degree X rotation.
 */

export const MAP_COLOURS = {
  friendly: '#40628e',
  enemy: '#b0372d',
  destroyed: '#57574f',
  selected: '#c9a760',
} as const;

function outlineShape(width: number, height: number, thickness: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2); shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2); shape.lineTo(-width / 2, height / 2); shape.closePath();
  const hole = new THREE.Path();
  const w = width / 2 - thickness, h = height / 2 - thickness;
  hole.moveTo(-w, -h); hole.lineTo(-w, h); hole.lineTo(w, h); hole.lineTo(w, -h); hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

function ovalShape(width: number, height: number, thickness: number, filled: boolean) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, width / 2, height / 2, 0, Math.PI * 2, false, 0);
  if (!filled) {
    const hole = new THREE.Path();
    hole.absellipse(0, 0, width / 2 - thickness, height / 2 - thickness, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
  }
  return new THREE.ShapeGeometry(shape, 24);
}

function bar(length: number, width: number, angle: number) {
  const geometry = new THREE.PlaneGeometry(width, length);
  geometry.rotateZ(angle);
  return geometry;
}

/** Symbol geometry in units where the frame is 5.2 x 3.4. */
export const MAP_SYMBOL = {
  frame: outlineShape(5.2, 3.4, 0.38),
  track: ovalShape(3.1, 1.5, 0.3, false),
  trackFilled: ovalShape(3.1, 1.5, 0.3, true),
  halo: outlineShape(6.6, 4.8, 0.3),
  tick: (() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.6, 0); shape.lineTo(0.6, 0); shape.lineTo(0, 1.4); shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.translate(0, 2.0, 0);
    return geometry;
  })(),
  cross: [bar(6.2, 0.45, Math.PI / 4), bar(6.2, 0.45, -Math.PI / 4)],
};

/** Symbol scale that keeps it about `pixels` tall (frame height) on screen. */
export function symbolScale(camera: THREE.Camera, position: THREE.Vector3, viewportHeight: number, pixels: number) {
  const orthographic = camera as THREE.OrthographicCamera;
  let worldPerPixel: number;
  if (orthographic.isOrthographicCamera) {
    worldPerPixel = (orthographic.top - orthographic.bottom) / orthographic.zoom / Math.max(1, viewportHeight);
  } else {
    const perspective = camera as THREE.PerspectiveCamera;
    const distance = camera.position.distanceTo(position);
    worldPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2)) / Math.max(1, viewportHeight);
  }
  return (worldPerPixel * pixels) / 3.4;
}
