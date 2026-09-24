// Fixed orthographic registration of the Bradford T-34/76 model 1943 drawing (1200 × 1600).
// Keep these values identical for every capture from the baseline onward.
// This drawing faces right: the side view shows the vehicle's right side (camera
// at -X), the plan has the vehicle's left (+X) at the top.
export type View = {name: string, left: number, top: number, width: number, height: number, ppm: number, origin: [number, number], position: [number, number, number], up: [number, number, number]};
export const PPM = 152;
export const VIEWS: View[] = [
  {name: 'side', left: 0, top: 0, width: 1200, height: 555, ppm: PPM, origin: [532, 511], position: [-20, 0, 0], up: [0, 1, 0]},
  {name: 'top', left: 0, top: 555, width: 1200, height: 535, ppm: PPM, origin: [538, 271], position: [0, 20, 0], up: [1, 0, 0]},
  {name: 'front', left: 0, top: 1090, width: 572, height: 510, ppm: PPM, origin: [294, 456.5], position: [0, 0, 20], up: [0, 1, 0]},
  {name: 'rear', left: 572, top: 1090, width: 628, height: 510, ppm: PPM, origin: [279.5, 455], position: [0, 0, -20], up: [0, 1, 0]},
];
export const VERTEX_PARTS = ['sloped-upper-hull', 'lower-hull-tub', 'model-1943-hexagonal-turret', 'left-continuous-track'];
export const view = (name: string) => VIEWS.find(v => v.name === name)!;
// Full-image pixel of a world point (metres) for the cameras above.
export function project(name: string, p: [number, number, number]): [number, number] {
  const v = view(name), [x, y, z] = p, s = v.ppm, [ox, oy] = v.origin;
  const local: [number, number] = name === 'side' ? [ox + z * s, oy - y * s]
    : name === 'top' ? [ox + z * s, oy - x * s]
    : name === 'front' ? [ox + x * s, oy - y * s]
    : [ox - x * s, oy - y * s];
  return [local[0] + v.left, local[1] + v.top];
}
