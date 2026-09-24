// Fixed orthographic registration of the Dyer M4A2(76)W drawing (1200 × 1800).
// Keep these values identical for every capture from the baseline onward.
export type View = {name: string, left: number, top: number, width: number, height: number, ppm: number, origin: [number, number], position: [number, number, number], up: [number, number, number]};
export const VIEWS: View[] = [
  {name: 'side', left: 0, top: 0, width: 1200, height: 650, ppm: 150, origin: [668, 577], position: [20, 0, 0], up: [0, 1, 0]},
  {name: 'top', left: 0, top: 650, width: 1200, height: 520, ppm: 150, origin: [659, 230], position: [0, 20, 0], up: [-1, 0, 0]},
  {name: 'front', left: 0, top: 1170, width: 620, height: 630, ppm: 150, origin: [316, 549], position: [0, 0, 20], up: [0, 1, 0]},
  {name: 'rear', left: 620, top: 1170, width: 580, height: 630, ppm: 150, origin: [279, 550], position: [0, 0, -20], up: [0, 1, 0]},
];
export const VERTEX_PARTS = ['m4a2-large-hatch-welded-hull', 't23-single-cast-shell', 'rounded-differential-housing'];
export const view = (name: string) => VIEWS.find(v => v.name === name)!;
// Full-image pixel of a world point (metres), per the projections in
// docs/tank-proportion-calibration.md section 4.
export function project(name: string, p: [number, number, number]): [number, number] {
  const v = view(name), [x, y, z] = p, s = v.ppm, [ox, oy] = v.origin;
  const local: [number, number] = name === 'side' ? [ox - z * s, oy - y * s]
    : name === 'top' ? [ox - z * s, oy + x * s]
    : name === 'front' ? [ox + x * s, oy - y * s]
    : [ox - x * s, oy - y * s];
  return [local[0] + v.left, local[1] + v.top];
}
