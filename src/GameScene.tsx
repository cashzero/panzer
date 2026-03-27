import { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Environment, OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Tank } from './Tank';
import { Terrain } from './Terrain';
import { ProjectileManager } from './ProjectileManager';
import { Particles } from './Particles';
import { EnemyAI } from './EnemyAI';
import { AllyAI } from './AllyAI';
import { useGameStore, AmmoType } from './store';
import { useShallow } from 'zustand/react/shallow';
import { initEngineSound, updateEngineSound } from './audio';
import { GAME_CONFIG } from './config';
import { getTerrainHeight, raycastTerrain } from './Terrain';
import { resolveTankCollision, resolveTreeCollision } from './collision';
import { MapCameraController } from './MapMode';
import { MapMarker } from './MapMarker';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, updateGunSway, computeEngineState, computeBodyRock, computeTrackTargets, accelerateTrackSpeeds } from './tankPhysics';
import { useInput } from './useInput';
import { fireTank, updatePlayerBurst } from './firing';
import { computeTurretAiming } from './turretAiming';
import { computeAimPoint } from './aimPoint';
import { updateCamera } from './CameraController';
import { Trees } from './TreeRenderer';
import { BurningWrecks } from './BurningWrecks';
import { WaypointMarkers } from './WaypointMarker';
import { generateTrees } from './trees';
import { MAP_SIZE_VALUES } from './store';

function EnemyTank({ id }: { id: string }) {
  const tankType = useGameStore(state => state.enemies.find(e => e.id === id)?.tankType ?? 'tiger');
  return <Tank id={id} tankType={tankType} />;
}

function AllyTank({ id }: { id: string }) {
  const tankType = useGameStore(state => state.allies.find(a => a.id === id)?.tankType ?? 'sherman');
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

    // Raycast aimDir against terrain to find the concrete world hit point.
    // A fixed world point projects consistently from any camera position/FOV.
    const hit = raycastTerrain(player.aimGunPivotWorld, player.aimDir, 2000);
    if (hit) {
      groupRef.current.position.copy(hit);
    } else {
      // Aiming at sky — fallback to a point within camera far plane
      groupRef.current.position.copy(
        player.aimGunPivotWorld.clone().add(player.aimDir.clone().multiplyScalar(800))
      );
    }
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

function PlayerSky() {
  const groupRef = useRef<THREE.Group>(null!);
  const { camera } = useThree();
  useFrame(() => {
    groupRef.current.position.copy(camera.position);
  });
  return (
    <group ref={groupRef}>
      <Sky sunPosition={[100, 20, 100]} distance={50000} />
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

    const throttle = (input.keys.current['KeyW'] ? 1 : 0) - (input.keys.current['KeyS'] ? 1 : 0);
    const steering = (input.keys.current['KeyA'] ? 1 : 0) - (input.keys.current['KeyD'] ? 1 : 0);

    const trackTargets = computeTrackTargets({
      throttle, steering,
      maxSpeed: playerDef.maxSpeed,
      maxReverseSpeed: playerDef.maxReverseSpeed,
      currentLeftTrackSpeed: player.leftTrackSpeed || 0,
      currentRightTrackSpeed: player.rightTrackSpeed || 0,
      trackDestroyed: player.trackDestroyed ?? { left: false, right: false },
    });

    const trackSpeeds = accelerateTrackSpeeds({
      currentLeft: player.leftTrackSpeed || 0,
      currentRight: player.rightTrackSpeed || 0,
      targetLeft: trackTargets.left,
      targetRight: trackTargets.right,
      acceleration: playerDef.acceleration,
      deceleration: playerDef.deceleration,
      delta,
    });

    const leftSpeed = trackSpeeds.left;
    const rightSpeed = trackSpeeds.right;

    // Calculate tank movement from track speeds
    const prevRotSpeed = ((player.rightTrackSpeed || 0) - (player.leftTrackSpeed || 0)) / playerDef.trackWidth;
    const movement = computeTrackMovement(leftSpeed, rightSpeed, player.position, player.rotation, delta, playerDef.trackWidth, playerDef.turnRateLimit, prevRotSpeed, playerDef.rotationalInertia);
    const { forwardSpeed, rotationSpeed } = movement;
    let newRot = movement.rotation;
    let newPos = movement.position;

    // Compensate camera yaw so hull rotation doesn't drag the viewpoint
    const rotDelta = newRot - player.rotation;
    input.cameraYaw.current -= rotDelta;

    // Snap to terrain
    newPos.y = getTerrainHeight(newPos.x, newPos.z);

    // Tank-tank collision
    const allTanks = [player, ...useGameStore.getState().enemies, ...useGameStore.getState().allies];
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
    const bodyRock = computeBodyRock(forwardSpeed, playerDef.maxSpeed, rotationSpeed, state.clock.elapsedTime);
    const pitch = orientation.pitch + bodyRock.pitchOffset;
    const roll = orientation.roll + bodyRock.rollOffset;
    newPos.y = orientation.adjustedY + bodyRock.yOffset;

    // Engine Simulation
    const engine = computeEngineState(
      forwardSpeed, playerDef.maxSpeed,
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
      hullRotation: newRot,
      hullPitch: pitch,
      hullRoll: roll,
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
      forwardSpeed, rotationSpeed, maxSpeed: playerDef.maxSpeed,
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
      gunnerZoom: useGameStore.getState().gunnerZoom,
    });

    // Update direction indicator with actual camera yaw
    const actualCamYaw = viewMode === 'gunner'
      ? Math.atan2(aimResult.aimDir.x, aimResult.aimDir.z)
      : camYawAbs;
    useGameStore.getState().setCameraYawAbs(actualCamYaw);

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
      aimDir: aimResult.aimDir,
      aimGunPivotWorld: aimResult.aimGunPivotWorld,
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
  const allyIds = useGameStore(useShallow((state) => state.allies.map(a => a.id)));
  const isMapMode = useGameStore((state) => state.isMapMode);
  useEffect(() => {
    const mapScale = MAP_SIZE_VALUES[useGameStore.getState().mapSize] / 1000;
    // Initialize trees
    if (useGameStore.getState().trees.length === 0) {
      useGameStore.getState().initTrees(generateTrees(mapScale));
    }
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas shadows camera={{ position: [0, 5, -10], fov: 60 }}>
        <Suspense fallback={null}>
          <PlayerSky />
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
              {allyIds.map((id) => (
                <MapMarker key={id} id={id} isAlly />
              ))}
              <WaypointMarkers />
              <MapCameraController />
            </>
          ) : (
            <>
              <PlayerTank />
              {enemyIds.map((id) => (
                <EnemyTank key={id} id={id} />
              ))}
              {allyIds.map((id) => (
                <AllyTank key={id} id={id} />
              ))}
              <GunAimPoint />
            </>
          )}

          <ProjectileManager />
          <Particles />
          <BurningWrecks />
          <EnemyAI />
          <AllyAI />
        </Suspense>
      </Canvas>
    </div>
  );
}
