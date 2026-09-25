import { GAME_CONFIG } from './config';
import { getMatchup } from './aiMatchup';
import type { TankData } from './store';

/**
 * Default waypoint for each tank of a force that fights on its own (the
 * enemy, and friendly tanks the player does not command), set at
 * deployment: the ground its advance is pointed at before anyone has been
 * seen. The force moves along the line from its own centre to the centre of
 * the opponents' deployment, keeping its spread across that line, and halts
 * short of it: `probeStandoff` short for attackers, the standoff range
 * against `reference` (the opponent it expects to meet) for tanks in
 * overwatch. A tank already that close holds where it stands. Returns world
 * XZ per tank id.
 */
export function planForceWaypoints(
  force: TankData[],
  opponents: TankData[],
  reference: TankData,
  halfMap: number,
): Record<string, [number, number]> {
  const waypoints: Record<string, [number, number]> = {};
  if (force.length === 0 || opponents.length === 0) return waypoints;
  const centre = (tanks: TankData[]) => {
    let x = 0, z = 0;
    for (const tank of tanks) { x += tank.position.x; z += tank.position.z; }
    return [x / tanks.length, z / tanks.length];
  };
  const [fx, fz] = centre(opponents);
  const [ex, ez] = centre(force);
  const length = Math.hypot(fx - ex, fz - ez);
  if (length < 1) return waypoints;
  const ax = (fx - ex) / length, az = (fz - ez) / length; // axis of advance
  const px = -az, pz = ax; // across it
  const edge = halfMap - 40;

  for (const tank of force) {
    const matchup = getMatchup(tank.id, tank.tankType, reference.tankType);
    const standoff = matchup.role === 'overwatch' ? matchup.preferredRange : GAME_CONFIG.ai.tactics.probeStandoff;
    const ox = tank.position.x - fx, oz = tank.position.z - fz;
    // Already within the standoff of the other side: hold here.
    if (-(ox * ax + oz * az) <= standoff) {
      waypoints[tank.id] = [tank.position.x, tank.position.z];
      continue;
    }
    const lane = Math.max(-250, Math.min(250, (tank.position.x - ex) * px + (tank.position.z - ez) * pz));
    const x = fx - ax * standoff + px * lane;
    const z = fz - az * standoff + pz * lane;
    waypoints[tank.id] = [Math.max(-edge, Math.min(edge, x)), Math.max(-edge, Math.min(edge, z))];
  }
  return waypoints;
}
