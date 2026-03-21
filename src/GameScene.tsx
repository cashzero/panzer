import { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Environment, OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Tank } from './Tank';
import { Terrain } from './Terrain';
import { ProjectileManager } from './ProjectileManager';
import { Particles } from './Particles';
import { EnemyAI } from './EnemyAI';
import { useGameStore, AmmoType } from './store';
import { useShallow } from 'zustand/react/shallow';
import { initEngineSound, updateEngineSound } from './audio';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { resolveTankCollision, resolveTreeCollision } from './collision';
import { MapCameraController } from './MapMode';
import { MapMarker } from './MapMarker';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, updateGunSway, computeEngineState, computeBodyRock } from './tankPhysics';
import { useInput } from './useInput';
import { fireTank, updatePlayerBurst } from './firing';
import { computeTurretAiming } from './turretAiming';
import { computeAimPoint } from './aimPoint';
import { updateCamera } from './CameraController';
import { Trees } from './TreeRenderer';
import { generateTrees } from './trees';

function EnemyTank({ id }: { id: string }) {
  const tankType = useGameStore(state => state.enemies.find(e => e.id === id)?.tankType ?? 'tiger');
  return <Tank id={id} tankType={tankType} />;
}

function PlayerTank() {
  const tankType = useGameStore(state => state.playerTank.tankType);
  return <Tank id="player" tankType={tankType} />;
}

function GunAimPoint() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const player = useGameStore.getState().playerTank;
    if (player.destroyed || !groupRef.current) return;

    // Read the aim point computed by PlayerController (same direction as gunner camera)
    groupRef.current.position.copy(player.gunSightAimPoint);
  });

  return (
    <group ref={groupRef}>
      <Html center zIndexRange={[100, 0]}>
        <div className="w-8 h-8 border-2 border-yellow-400 rounded-full flex items-center justify-center opacity-70 pointer-events-none">
          <div className="w-1 h-1 bg-yellow-400 rounded-full" />
        </div>
      </Html>
    </group>
  );
}

function PlayerController() {
  const { camera } = useThree();
  const updatePlayer = useGameStore((state) => state.updatePlayer);
  const input = useInput(fireTank);

  useFrame((state, delta) => {
    const player = useGameStore.getState().playerTank;
    if (player.destroyed) return;

    // Skip all tank physics in map mode — MapCameraController handles camera
    if (useGameStore.getState().isMapMode) return;

    const playerDef = getTankDef(player.tankType);
    const maxSpeed = playerDef.maxSpeed;
    const maxReverseSpeed = playerDef.maxReverseSpeed;
    const acceleration = playerDef.acceleration;
    const deceleration = playerDef.deceleration;

    let throttle = (input.keys.current['KeyW'] ? 1 : 0) - (input.keys.current['KeyS'] ? 1 : 0);
    let steering = (input.keys.current['KeyA'] ? 1 : 0) - (input.keys.current['KeyD'] ? 1 : 0);

    let targetLeftSpeed = 0;
    let targetRightSpeed = 0;

    if (throttle !== 0) {
      const baseSpeed = throttle > 0 ? maxSpeed : -maxReverseSpeed;
      targetLeftSpeed = baseSpeed;
      targetRightSpeed = baseSpeed;

      if (steering > 0) {
        targetLeftSpeed *= 0.6;
      } else if (steering < 0) {
        targetRightSpeed *= 0.6;
      }
    } else if (steering !== 0) {
      const pivotSpeed = maxSpeed * 0.15;
      targetLeftSpeed = -steering * pivotSpeed;
      targetRightSpeed = steering * pivotSpeed;
    }

    // Track damage: destroyed tracks cannot move
    if (player.trackDestroyed?.left) targetLeftSpeed = 0;
    if (player.trackDestroyed?.right) targetRightSpeed = 0;

    // Accelerate tracks towards target speed
    const accelLeft = (targetLeftSpeed === 0) ? deceleration : acceleration;
    const accelRight = (targetRightSpeed === 0) ? deceleration : acceleration;

    let leftSpeed = player.leftTrackSpeed || 0;
    let rightSpeed = player.rightTrackSpeed || 0;

    if (leftSpeed < targetLeftSpeed) leftSpeed = Math.min(leftSpeed + accelLeft * delta, targetLeftSpeed);
    else if (leftSpeed > targetLeftSpeed) leftSpeed = Math.max(leftSpeed - accelLeft * delta, targetLeftSpeed);

    if (rightSpeed < targetRightSpeed) rightSpeed = Math.min(rightSpeed + accelRight * delta, targetRightSpeed);
    else if (rightSpeed > targetRightSpeed) rightSpeed = Math.max(rightSpeed - accelRight * delta, targetRightSpeed);

    // Calculate tank movement from track speeds
    const movement = computeTrackMovement(leftSpeed, rightSpeed, player.position, player.rotation, delta, playerDef.trackWidth);
    const { forwardSpeed, rotationSpeed } = movement;
    let newRot = movement.rotation;
    let newPos = movement.position;

    // Snap to terrain
    newPos.y = getTerrainHeight(newPos.x, newPos.z);

    // Tank-tank collision
    const allTanks = [player, ...useGameStore.getState().enemies];
    resolveTankCollision('player', newPos, allTanks);

    // Tree collision
    const treeResult = resolveTreeCollision(newPos, forwardSpeed, useGameStore.getState().trees);
    if (treeResult.knockedTreeIndex !== null) {
      const idx = treeResult.knockedTreeIndex;
      const tree = useGameStore.getState().trees[idx];
      const fallDir = Math.atan2(newPos.x - tree.position[0], newPos.z - tree.position[2]);
      useGameStore.getState().updateTree(idx, { fallen: true, fallDirection: fallDir, fallProgress: 0.01 });
      useGameStore.getState().spawnParticle('tree_hit', new THREE.Vector3(tree.position[0], tree.position[1] + 2, tree.position[2]), new THREE.Vector3(0, 1, 0));
    }

    newPos.y = getTerrainHeight(newPos.x, newPos.z);

    // Calculate pitch and roll based on terrain
    const orientation = computeTerrainOrientation(newPos, newRot, playerDef.trackWidth);
    const bodyRock = computeBodyRock(forwardSpeed, maxSpeed, rotationSpeed, state.clock.elapsedTime);
    const pitch = orientation.pitch + bodyRock.pitchOffset;
    const roll = orientation.roll + bodyRock.rollOffset;
    newPos.y = orientation.adjustedY + bodyRock.yOffset;

    // Engine Simulation
    const engine = computeEngineState(
      forwardSpeed, maxSpeed,
      player.engineRPM || GAME_CONFIG.tank.idleRPM,
      throttle !== 0 || steering !== 0, delta
    );
    initEngineSound();
    updateEngineSound(engine.rpm);

    // Camera direction
    const camYawAbs = newRot + input.cameraYaw.current;
    const camPitch = input.cameraPitch.current;

    const lookDir = new THREE.Vector3(
      Math.sin(camYawAbs) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(camYawAbs) * Math.cos(camPitch)
    ).normalize();

    // Turret aiming
    const ammoStats = playerDef.weapons[useGameStore.getState().ammoType]!;
    const aiming = computeTurretAiming({
      currentTurretRot: player.turretRotation,
      currentGunElev: player.gunElevation,
      cameraYaw: input.cameraYaw.current,
      cameraPitch: input.cameraPitch.current,
      isAiming: input.isAiming.current,
      arrowKeys: {
        left: !!input.keys.current['ArrowLeft'],
        right: !!input.keys.current['ArrowRight'],
        up: !!input.keys.current['ArrowUp'],
        down: !!input.keys.current['ArrowDown'],
      },
      calibrationDistance: useGameStore.getState().calibrationDistance,
      ammoVelocity: ammoStats.velocity,
      turretSpeed: playerDef.turretSpeed,
      gunSpeed: playerDef.gunSpeed,
      delta,
    });

    // Gun sway
    const { turretSwayOffset, gunSwayOffset } = updateGunSway(input.swayState.current, {
      forwardSpeed, rotationSpeed, maxSpeed,
      pitch, roll,
      prevPitch: input.swayPrev.current.pitch,
      prevRoll: input.swayPrev.current.roll,
      prevForwardSpeed: input.swayPrev.current.forwardSpeed,
      prevRotationSpeed: input.swayPrev.current.rotationSpeed,
      time: state.clock.getElapsedTime(), delta,
    });
    input.swayPrev.current = { pitch, roll, forwardSpeed, rotationSpeed };

    // Compute gun sight aim point
    const aimResult = computeAimPoint({
      position: newPos,
      rotation: newRot,
      pitch, roll,
      turretRotation: aiming.turretRotation,
      sightPitch: aiming.sightPitch,
      turretSwayOffset,
      gunSwayOffset,
      tankType: useGameStore.getState().playerTank.tankType,
    });

    // Camera shake decay
    useGameStore.getState().decayCameraShake(delta);

    // Camera placement
    const viewMode = useGameStore.getState().viewMode;
    const shakeIntensity = useGameStore.getState().cameraShake;
    updateCamera({
      camera, viewMode,
      playerPos: newPos,
      lookDir,
      aimGunPivotWorld: aimResult.aimGunPivotWorld,
      aimDir: aimResult.aimDir,
      shakeIntensity,
    });

    // Update burst fire (autocannon)
    updatePlayerBurst();

    updatePlayer({
      position: newPos,
      rotation: newRot,
      pitch,
      roll,
      turretRotation: aiming.turretRotation,
      gunElevation: aiming.gunElevation,
      turretSwayOffset,
      gunSwayOffset,
      gunSightAimPoint: aimResult.gunSightAimPoint,
      speed: forwardSpeed,
      leftTrackSpeed: leftSpeed,
      rightTrackSpeed: rightSpeed,
      engineRPM: engine.rpm,
      gear: engine.gear,
    });
  });

  return null;
}

export function GameScene() {
  const enemyIds = useGameStore(useShallow((state) => state.enemies.map(e => e.id)));
  const isMapMode = useGameStore((state) => state.isMapMode);
  const spawnEnemy = useGameStore((state) => state.spawnEnemy);

  useEffect(() => {
    // Spawn some enemies only if none exist (prevents double spawn in Strict Mode)
    if (useGameStore.getState().enemies.length === 0) {
      spawnEnemy(new THREE.Vector3(40, getTerrainHeight(40, 150), 150), 'tiger');
      spawnEnemy(new THREE.Vector3(-60, getTerrainHeight(-60, 200), 200), 'panzer3');
      spawnEnemy(new THREE.Vector3(0, getTerrainHeight(0, 250), 250), 'panzer3');
      spawnEnemy(new THREE.Vector3(-30, getTerrainHeight(-30, 180), 180), 'panzer2');
    }
    // Initialize trees
    if (useGameStore.getState().trees.length === 0) {
      useGameStore.getState().initTrees(generateTrees());
    }
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas shadows camera={{ position: [0, 5, -10], fov: 60 }}>
        <Suspense fallback={null}>
          <Sky sunPosition={[100, 20, 100]} />
          <ambientLight intensity={0.3} />
          <directionalLight
            castShadow
            position={[100, 100, 50]}
            intensity={1.5}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={500}
            shadow-camera-left={-100}
            shadow-camera-right={100}
            shadow-camera-top={100}
            shadow-camera-bottom={-100}
          />

          <Terrain />
          <Trees />
          <PlayerController />

          {isMapMode ? (
            <>
              <MapMarker id="player" isPlayer />
              {enemyIds.map((id) => (
                <MapMarker key={id} id={id} />
              ))}
              <MapCameraController />
            </>
          ) : (
            <>
              <PlayerTank />
              {enemyIds.map((id) => (
                <EnemyTank key={id} id={id} />
              ))}
              <GunAimPoint />
            </>
          )}

          <ProjectileManager />
          <Particles />
          <EnemyAI />
        </Suspense>
      </Canvas>
    </div>
  );
}
