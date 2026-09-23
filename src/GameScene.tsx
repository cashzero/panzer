import { useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Tank } from './Tank';
import { BattlefieldLighting } from './rendering/BattlefieldLighting';
import { BattlefieldPostProcessing } from './rendering/BattlefieldPostProcessing';
import { Terrain } from './Terrain';
import { ProjectileManager } from './ProjectileManager';
import { Particles } from './Particles';
import { FlashLights } from './rendering/FlashLights';
import { ImpactDecals } from './rendering/ImpactDecals';
import { TrackMarks } from './rendering/TrackMarks';
import { EnemyAI } from './EnemyAI';
import { AllyAI } from './AllyAI';
import { useGameStore, AmmoType } from './store';
import { useShallow } from 'zustand/react/shallow';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { resolveTankCollision, resolveTreeCollision, resolveBuildingCollision } from './collision';
import { MapCameraController } from './MapMode';
import { MapMarker } from './MapMarker';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, updateGunSway, computeEngineState, computeBodyRock, computeTrackTargets, accelerateTrackSpeeds } from './tankPhysics';
import { useInput } from './useInput';
import { fireTank, updatePlayerBurst } from './firing';
import { computeTurretAiming } from './turretAiming';
import { computeAimGunPivotWorld, computeAimPoint } from './aimPoint';
import { updateCamera } from './CameraController';
import { Trees, Understory } from './TreeRenderer';
import { WorldDressing } from './rendering/WorldDressing';
import { HorizonSkirt } from './rendering/HorizonSkirt';
import { Buildings } from './BuildingRenderer';
import { BurningWrecks } from './BurningWrecks';
import { WaypointMarkers } from './WaypointMarker';
import { audioManager, toAudioVec3 } from './audio';
import { resolveDesignatedAimTarget } from './designatedAimTarget';
import { collectVisibleTargetIds } from './spotting';

function EnemyTank({ id }: { id: string }) {
  const tankType = useGameStore(state => state.enemies.find(e => e.id === id)?.tankType ?? 'tiger');
  return <Tank id={id} tankType={tankType} />;
}

function AllyTank({ id }: { id: string }) {
  const tankType = useGameStore(state => state.allies.find(a => a.id === id)?.tankType ?? 'sherman');
  return <Tank id={id} tankType={tankType} />;
}

function PlayerTank({ visible }: { visible: boolean }) {
  const tankType = useGameStore(state => state.playerTank.tankType);
  return <Tank id="player" tankType={tankType} visible={visible} />;
}

function GunAimPoint() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const player = useGameStore.getState().playerTank;
    if (player.destroyed || !groupRef.current) return;
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

function AudioSync() {
  const { camera } = useThree();
  const forwardRef = useRef(new THREE.Vector3());
  const upRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const state = useGameStore.getState();
    const viewMode = state.isMapMode ? 'map' : state.viewMode;
    const playerDef = getTankDef(state.playerTank.tankType);

    camera.getWorldDirection(forwardRef.current);
    upRef.current.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    audioManager.setListenerPose({
      position: toAudioVec3(camera.position),
      forward: toAudioVec3(forwardRef.current),
      up: toAudioVec3(upRef.current),
      viewMode,
    });

    audioManager.syncPlayerEngine({
      position: toAudioVec3(state.playerTank.position),
      rpm: state.playerTank.destroyed ? 0 : state.playerTank.engineRPM,
      gear: state.playerTank.destroyed ? 0 : state.playerTank.gear,
      speed: state.playerTank.destroyed ? 0 : state.playerTank.speed,
      maxSpeed: playerDef.maxSpeed,
      leftTrackSpeed: state.playerTank.destroyed ? 0 : state.playerTank.leftTrackSpeed,
      rightTrackSpeed: state.playerTank.destroyed ? 0 : state.playerTank.rightTrackSpeed,
      destroyed: state.playerTank.destroyed,
      viewMode,
    });
  });

  return null;
}

function SpottingSystem() {
  const elapsedMs = useRef(Infinity);

  useFrame((_, delta) => {
    elapsedMs.current += delta * 1000;
    if (elapsedMs.current < GAME_CONFIG.ai.spottingIntervalMs) return;
    elapsedMs.current = 0;
    const state = useGameStore.getState();
    const now = Date.now();
    const playerSideVisible = collectVisibleTargetIds(
      [state.playerTank, ...state.allies],
      state.enemies,
      state.trees,
      state.buildings,
    );
    const enemySideVisible = collectVisibleTargetIds(
      state.enemies,
      [state.playerTank, ...state.allies],
      state.trees,
      state.buildings,
    );

    state.refreshSpotting('player', playerSideVisible, now);
    state.refreshSpotting('enemy', enemySideVisible, now);
  });

  return null;
}

function TrackRepairManager() {
  const updateTrackRepairs = useGameStore((state) => state.updateTrackRepairs);

  useFrame((_, delta) => {
    updateTrackRepairs(delta);
  });

  return null;
}

function PlayerController() {
  const { camera } = useThree();
  const updatePlayer = useGameStore((state) => state.updatePlayer);
  const input = useInput(fireTank);
  const previousViewMode = useRef<'third-person' | 'gunner'>(useGameStore.getState().viewMode);

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
    resolveBuildingCollision(newPos, useGameStore.getState().buildings);

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
    // Camera direction
    const camYawAbs = newRot + input.cameraYaw.current;
    const camPitch = input.cameraPitch.current;

    const lookDir = new THREE.Vector3(
      Math.sin(camYawAbs) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(camYawAbs) * Math.cos(camPitch)
    ).normalize();

    const viewMode = useGameStore.getState().viewMode;
    const aimingFromThirdPerson = viewMode === 'third-person' && input.isAiming.current;
    const preservedTransitionTarget = viewMode === 'gunner' && previousViewMode.current === 'third-person'
      ? player.designatedAimTarget.clone()
      : null;
    const cameraTargetPos = newPos.clone().add(new THREE.Vector3(0, GAME_CONFIG.camera.heightOffset, 0));
    const cameraPos = cameraTargetPos.clone().sub(lookDir.clone().multiplyScalar(GAME_CONFIG.camera.distance));
    const thirdPersonDesignatedTarget = viewMode === 'third-person'
      ? resolveDesignatedAimTarget(cameraPos, lookDir, 2000, 'player')
      : null;
    const designatedTargetForAiming = aimingFromThirdPerson
      ? thirdPersonDesignatedTarget?.point ?? null
      : preservedTransitionTarget;
    const currentAimOriginWorld = computeAimGunPivotWorld({
      position: newPos,
      rotation: newRot,
      pitch,
      roll,
      turretRotation: player.turretRotation,
      turretSwayOffset: 0,
      tankType: player.tankType,
    });

    // Turret aiming
    const ammoStats = playerDef.weapons[useGameStore.getState().ammoType]!;
    const now = performance.now();
    const aiming = computeTurretAiming({
      currentTurretRot: player.turretRotation,
      currentSightPitch: player.sightPitch,
      currentGunElev: player.gunElevation,
      cameraYaw: input.cameraYaw.current,
      cameraPitch: input.cameraPitch.current,
      hullRotation: newRot,
      hullPitch: pitch,
      hullRoll: roll,
      isAiming: input.isAiming.current,
      arrowKeys: {
        left: input.keys.current['ArrowLeft'] ? (now - input.arrowKeyPressStartedAt.current.left) / 1000 : 0,
        right: input.keys.current['ArrowRight'] ? (now - input.arrowKeyPressStartedAt.current.right) / 1000 : 0,
        up: input.keys.current['ArrowUp'] ? (now - input.arrowKeyPressStartedAt.current.up) / 1000 : 0,
        down: input.keys.current['ArrowDown'] ? (now - input.arrowKeyPressStartedAt.current.down) / 1000 : 0,
      },
      calibrationDistance: useGameStore.getState().calibrationDistance,
      ammoVelocity: ammoStats.velocity,
      turretSpeed: playerDef.turretSpeed,
      gunSpeed: playerDef.gunSpeed,
      minGunElevation: playerDef.minGunElevation,
      maxGunElevation: playerDef.maxGunElevation,
      designatedTarget: designatedTargetForAiming,
      aimOriginWorld: designatedTargetForAiming ? currentAimOriginWorld : undefined,
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

    const actualGunAimTarget = resolveDesignatedAimTarget(
      aimResult.aimGunPivotWorld,
      aimResult.aimDir,
      2000,
      'player',
    ).point;

    const hasManualGunnerAim = input.keys.current['ArrowLeft']
      || input.keys.current['ArrowRight']
      || input.keys.current['ArrowUp']
      || input.keys.current['ArrowDown'];

    let designatedAimTarget = thirdPersonDesignatedTarget?.point ?? player.designatedAimTarget;
    if (viewMode === 'gunner') {
      designatedAimTarget = hasManualGunnerAim
        ? actualGunAimTarget
        : (preservedTransitionTarget ?? player.designatedAimTarget);
    }

    // Camera placement
    const shakeIntensity = useGameStore.getState().cameraShake;
    updateCamera({
      camera, viewMode,
      playerPos: newPos,
      lookDir,
      aimGunPivotWorld: aimResult.aimGunPivotWorld,
      aimDir: aimResult.aimDir,
      designatedAimTarget,
      gunnerAimTarget: actualGunAimTarget,
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

    if (input.keys.current['Space'] || input.primaryFireHeld.current) {
      fireTank();
    }

    updatePlayer({
      position: newPos,
      rotation: newRot,
      pitch,
      roll,
      turretRotation: aiming.turretRotation,
      sightPitch: aiming.sightPitch,
      gunElevation: aiming.gunElevation,
      turretSwayOffset,
      gunSwayOffset,
      gunSightAimPoint: actualGunAimTarget,
      aimDir: aimResult.aimDir,
      aimGunPivotWorld: aimResult.aimGunPivotWorld,
      designatedAimTarget,
      speed: forwardSpeed,
      leftTrackSpeed: leftSpeed,
      rightTrackSpeed: rightSpeed,
      engineRPM: engine.rpm,
      gear: engine.gear,
    });

    previousViewMode.current = viewMode;
  });

  return null;
}

export function GameScene() {
  const enemyIds = useGameStore(useShallow((state) => state.enemies.map(e => e.id)));
  const spottedEnemyIds = useGameStore(useShallow((state) => state.enemies
    .filter((enemy) => state.playerSideSpotting[enemy.id]?.spotted)
    .map((enemy) => enemy.id)));
  const allyIds = useGameStore(useShallow((state) => state.allies.map(a => a.id)));
  const isMapMode = useGameStore((state) => state.isMapMode);
  const viewMode = useGameStore((state) => state.viewMode);

  return (
    <div className="battlefield-canvas">
      <Canvas
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ position: [0, 5, -10], fov: 60, near: 0.08, far: 3600 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
      >
        <Suspense fallback={null}>
          <BattlefieldLighting mapMode={isMapMode} />

          <Terrain showGroundCover={!isMapMode} />
          <Buildings />
          <Trees />
          <Understory />
          <WorldDressing />
          <HorizonSkirt />
          <TrackRepairManager />
          <PlayerController />
          <SpottingSystem />
          <AudioSync />

          {isMapMode ? (
            <>
              <MapMarker id="player" isPlayer />
              {spottedEnemyIds.map((id) => (
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
              <PlayerTank visible={viewMode !== 'gunner'} />
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
          <TrackMarks />
          <ImpactDecals />
          <Particles />
          <FlashLights />
          <BurningWrecks />
          <EnemyAI />
          <AllyAI />
          <BattlefieldPostProcessing mapMode={isMapMode} />
        </Suspense>
      </Canvas>
    </div>
  );
}
