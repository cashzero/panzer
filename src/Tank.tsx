import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store';
import { useShallow } from 'zustand/react/shallow';
import { GAME_CONFIG } from './config';
import { getTankDef } from './tanks/registry';
import { sampleGroundSurface, type GroundSurfaceKind } from './groundSurface';
import { estimateTrackFootprint } from './rendering/TrackMarks';

function createTrackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = GAME_CONFIG.tank.colors.trackDark;
  ctx.fillRect(0, 0, 64, 256);

  ctx.fillStyle = GAME_CONFIG.tank.colors.trackLight;
  for (let i = 0; i < 256; i += 32) {
    ctx.fillRect(0, i, 64, 16);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

interface TankProps {
  id: string;
  tankType: string;
  visible?: boolean;
}

export function Tank({ id, tankType, visible = true }: TankProps) {
  const def = getTankDef(tankType);
  const caliberScale = Math.max(0.65, (def.caliber || 75) / 75);
  const recoilScale = caliberScale * def.recoilAnimationScale;

  const groupRef = useRef<THREE.Group>(null);
  const turretRef = useRef<THREE.Group>(null);
  const gunRef = useRef<THREE.Group>(null);
  const gunBarrelRef = useRef<THREE.Group>(null);

  const lastDustSpawn = useRef<number>(0);
  const lastLowDustSpawn = useRef<number>(0);
  const lastTrackFxSpawn = useRef<number>(0);
  const lastSurfaceSample = useRef<number>(0);
  const surfaceKind = useRef<GroundSurfaceKind | null>(null);

  const leftTrackTexture = useMemo(() => createTrackTexture(), []);
  const rightTrackTexture = useMemo(() => createTrackTexture(), []);

  const color = def.color;
  const destroyedColor = GAME_CONFIG.tank.colors.destroyed;

  const isPlayer = id === 'player';

  // Subscribe to destroyed state and track destruction to trigger re-renders
  const destroyed = useGameStore(state =>
    isPlayer ? state.playerTank.destroyed : (state.enemies.find(e => e.id === id) ?? state.allies.find(a => a.id === id))?.destroyed
  ) || false;

  const trackDestroyed = useGameStore(useShallow(state => {
    const tank = isPlayer ? state.playerTank : (state.enemies.find(e => e.id === id) ?? state.allies.find(a => a.id === id));
    return tank?.trackDestroyed ?? { left: false, right: false };
  }));

  const leftTrackMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: leftTrackTexture,
    color: destroyed ? destroyedColor : trackDestroyed.left ? '#5a1a1a' : '#b7b4a9',
    roughness: 0.84,
    metalness: 0.42,
  }), [leftTrackTexture, destroyed, destroyedColor, trackDestroyed.left]);

  const rightTrackMat = useMemo(() => new THREE.MeshStandardMaterial({
    map: rightTrackTexture,
    color: destroyed ? destroyedColor : trackDestroyed.right ? '#5a1a1a' : '#b7b4a9',
    roughness: 0.84,
    metalness: 0.42,
  }), [rightTrackTexture, destroyed, destroyedColor, trackDestroyed.right]);

  const { HullComponent, TracksComponent, TurretComponent, GunComponent } = def;

  useFrame(({ camera }) => {
    const data = isPlayer
      ? useGameStore.getState().playerTank
      : (useGameStore.getState().enemies.find(e => e.id === id) ?? useGameStore.getState().allies.find(a => a.id === id));

    if (!data) return;

    const now = Date.now();

    if (groupRef.current) {
      const timeSinceFire = now - (data.lastFireTime || 0);
      let hullRecoil = 0;
      let hullBounce = 0;
      let recoilPitch = 0;

      if (timeSinceFire < 80) {
        const t = timeSinceFire / 80;
        hullRecoil = -0.32 * recoilScale * t;
        hullBounce = 0.08 * recoilScale * t;
        recoilPitch = 0.025 * recoilScale * t;
      } else if (timeSinceFire < 420) {
        const t = (timeSinceFire - 80) / 340;
        hullRecoil = -0.32 * recoilScale * (1 - t);
        hullBounce = 0.08 * recoilScale * (1 - t);
        recoilPitch = 0.025 * recoilScale * (1 - t);
      }

      groupRef.current.position.copy(data.position);
      if (hullRecoil !== 0 || hullBounce !== 0) {
        const recoilOffset = new THREE.Vector3(0, hullBounce, hullRecoil).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation);
        groupRef.current.position.add(recoilOffset);
      }

      const pitch = data.pitch || 0;
      const roll = data.roll || 0;
      const targetRotation = new THREE.Euler(pitch + recoilPitch, data.rotation, roll, 'YXZ');
      groupRef.current.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetRotation), 0.35);
    }
    if (turretRef.current) {
      turretRef.current.rotation.y = data.turretRotation + (data.turretSwayOffset || 0);
    }
    if (gunRef.current) {
      gunRef.current.rotation.x = data.gunElevation + (data.gunSwayOffset || 0);
    }

    if (gunBarrelRef.current) {
      const timeSinceFire = now - (data.lastFireTime || 0);

      let recoilOffset = 0;
      if (timeSinceFire < 50) {
        recoilOffset = -(timeSinceFire / 50) * 0.8 * def.recoilAnimationScale;
      } else if (timeSinceFire < 500) {
        recoilOffset = -0.8 * (1 - (timeSinceFire - 50) / 450) * def.recoilAnimationScale;
      }

      gunBarrelRef.current.position.z = recoilOffset;
    }

    if (data.leftTrackSpeed) {
      leftTrackMat.map!.offset.y -= data.leftTrackSpeed * 0.01;
    }
    if (data.rightTrackSpeed) {
      rightTrackMat.map!.offset.y -= data.rightTrackSpeed * 0.01;
    }

    if (data.destroyed) return;

    // Spawn dust particles
    const rawSpeed = data.speed || 0;
    const speed = Math.abs(rawSpeed);
    const isReversing = rawSpeed < 0;
    const turnSpeed = Math.abs((data.leftTrackSpeed || 0) - (data.rightTrackSpeed || 0));
    const dustCfg = GAME_CONFIG.particles.dust;

    // Off-road the tracks churn turf or mud instead of raising road dust.
    const trackFxCfg = GAME_CONFIG.trackEffects;
    const trackMotion = Math.max(speed, turnSpeed * 0.5);
    if (trackMotion > trackFxCfg.minSpeed && camera.position.distanceTo(data.position) < trackFxCfg.maxCameraDistance) {
      if (surfaceKind.current === null || now - lastSurfaceSample.current > trackFxCfg.surfaceSampleInterval) {
        lastSurfaceSample.current = now;
        const world = useGameStore.getState();
        surfaceKind.current = sampleGroundSurface(data.position.x, data.position.z, world.roadNetwork, world.farmlands, world.buildings).kind;
      }
    }
    if (surfaceKind.current && surfaceKind.current !== 'road' && trackMotion > trackFxCfg.minSpeed) {
      const intensity = Math.min(1, trackMotion / trackFxCfg.fullSpeed);
      const interval = trackFxCfg.maxSpawnInterval - (trackFxCfg.maxSpawnInterval - trackFxCfg.minSpawnInterval) * intensity;
      if (now - lastTrackFxSpawn.current > interval && camera.position.distanceTo(data.position) < trackFxCfg.maxCameraDistance) {
        lastTrackFxSpawn.current = now;
        const spawnParticle = useGameStore.getState().spawnParticle;
        const { gauge, halfContact } = estimateTrackFootprint(def.trackWidth);
        const fx = Math.sin(data.rotation);
        const fz = Math.cos(data.rotation);
        const type = surfaceKind.current === 'mud' ? 'track_mud' : 'track_grass';
        for (const [side, trackSpeed] of [[-1, data.leftTrackSpeed || 0], [1, data.rightTrackSpeed || 0]] as const) {
          if (Math.abs(trackSpeed) < trackFxCfg.minSpeed * 0.5) continue;
          // Material leaves the trailing end of the belt: the rear when driving forward.
          const dir = Math.sign(trackSpeed);
          const along = -dir * halfContact;
          const lateral = side * gauge / 2;
          const pos = new THREE.Vector3(
            data.position.x + fx * along + fz * lateral,
            data.position.y + 0.25,
            data.position.z + fz * along - fx * lateral,
          );
          const throwDir = new THREE.Vector3(-fx * dir * 0.8, 1, -fz * dir * 0.8).normalize();
          const trackIntensity = Math.max(0.3, Math.min(1.2, Math.abs(trackSpeed) / trackFxCfg.fullSpeed));
          spawnParticle(type, pos, throwDir, trackIntensity);
        }
      }
    }

    const canSpawnDust = surfaceKind.current === 'road' &&(!isReversing || dustCfg.allowReverse) &&
      (speed > dustCfg.speedThreshold || turnSpeed > dustCfg.turnSpeedThreshold);
    if (canSpawnDust) {
      const spawnInterval = Math.max(dustCfg.minSpawnInterval, dustCfg.maxSpawnInterval - ((speed - dustCfg.speedThreshold) * dustCfg.spawnSpeedScale));

      if (now - lastDustSpawn.current > spawnInterval) {
        lastDustSpawn.current = now;
        const spawnParticle = useGameStore.getState().spawnParticle;

        const leftDustPos = data.position.clone().add(
          new THREE.Vector3(
            -def.trackWidth / 2 + (Math.random() - 0.5) * 0.5,
            (Math.random() * 0.5),
            -2 + (Math.random() - 0.5)
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation)
        );
        spawnParticle('dust', leftDustPos, new THREE.Vector3(0, 1, 0));

        const rightDustPos = data.position.clone().add(
          new THREE.Vector3(
            def.trackWidth / 2 + (Math.random() - 0.5) * 0.5,
            (Math.random() * 0.5),
            -2 + (Math.random() - 0.5)
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation)
        );
        spawnParticle('dust', rightDustPos, new THREE.Vector3(0, 1, 0));
      }
    } else if (surfaceKind.current === 'road' && (speed > GAME_CONFIG.particles.dust_low.speedThreshold || turnSpeed > 1)) {
      // Low-speed track-level dust
      const dustLowCfg = GAME_CONFIG.particles.dust_low;
      if (now - lastLowDustSpawn.current > dustLowCfg.spawnInterval) {
        lastLowDustSpawn.current = now;
        const spawnParticle = useGameStore.getState().spawnParticle;
        const side = (Math.random() < 0.5 ? -1 : 1) * def.trackWidth / 2;
        const dustPos = data.position.clone().add(
          new THREE.Vector3(
            side + (Math.random() - 0.5) * 0.3,
            Math.random() * 0.2,
            -1.5 + (Math.random() - 0.5) * 0.5
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation)
        );
        spawnParticle('dust_low', dustPos, new THREE.Vector3(0, 1, 0));
      }
    }
  });

  return (
    <group ref={groupRef} name={`tank-${id}`} visible={visible}>
      <HullComponent color={color} destroyedColor={destroyedColor} destroyed={destroyed} merged />
      <TracksComponent isLeft={true} trackMat={leftTrackMat} destroyedColor={destroyedColor} destroyed={destroyed || trackDestroyed.left} merged />
      <TracksComponent isLeft={false} trackMat={rightTrackMat} destroyedColor={destroyedColor} destroyed={destroyed || trackDestroyed.right} merged />

      {/* Turret Group */}
      <group ref={turretRef} position={def.turretOffset}>
        <TurretComponent color={color} destroyedColor={destroyedColor} destroyed={destroyed} merged />

        {/* Gun Group */}
        <group ref={gunRef} position={def.gunPivotOffset}>
          <group ref={gunBarrelRef}>
            <GunComponent color={color} destroyedColor={destroyedColor} destroyed={destroyed} merged />
          </group>
        </group>
      </group>
    </group>
  );
}
