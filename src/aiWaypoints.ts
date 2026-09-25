import { GAME_CONFIG } from './config';
import { getMatchup } from './aiMatchup';
import type { TankData } from './store';

/**
 * Default waypoint for each enemy tank, set at deployment: the ground its
 * advance is pointed at before anyone has been seen. The force moves along
 * the line from its own centre to the centre of the other side's
 * deployment, keeping its spread across that line, and halts short of it:
 * `probeStandoff` short for attackers, the standoff range against the
 * player's tank for tanks in overwatch. A tank already that close holds
 * where it stands. Returns world XZ per tank id.
 */
export function planEnemyWaypoints(
  enemies: TankData[],
  friendlies: TankData[],
  player: TankData,
  halfMap: number,
): Record<string, [number, number]> {
  const waypoints: Record<string, [number, number]> = {};
  if (enemies.length === 0 || friendlies.length === 0) return waypoints;
  const centre = (tanks: TankData[]) => {
    let x = 0, z = 0;
    for (const tank of tanks) { x += tank.position.x; z += tank.position.z; }
    return [x / tanks.length, z / tanks.length];
  };
  const [fx, fz] = centre(friendlies);
  const [ex, ez] = centre(enemies);
  const length = Math.hypot(fx - ex, fz - ez);
  if (length < 1) return waypoints;
  const ax = (fx - ex) / length, az = (fz - ez) / length; // axis of advance
  const px = -az, pz = ax; // across it
  const edge = halfMap - 40;

  for (const enemy of enemies) {
    const matchup = getMatchup(enemy.id, enemy.tankType, player.tankType);
    const standoff = matchup.role === 'overwatch' ? matchup.preferredRange : GAME_CONFIG.ai.tactics.probeStandoff;
    const ox = enemy.position.x - fx, oz = enemy.position.z - fz;
    // Already within the standoff of the other side: hold here.
    if (-(ox * ax + oz * az) <= standoff) {
      waypoints[enemy.id] = [enemy.position.x, enemy.position.z];
      continue;
    }
    const lane = Math.max(-250, Math.min(250, (enemy.position.x - ex) * px + (enemy.position.z - ez) * pz));
    const x = fx - ax * standoff + px * lane;
    const z = fz - az * standoff + pz * lane;
    waypoints[enemy.id] = [Math.max(-edge, Math.min(edge, x)), Math.max(-edge, Math.min(edge, z))];
  }
  return waypoints;
}
