import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box, Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from './store';
import { GAME_CONFIG } from './config';

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
  isPlayer?: boolean;
}

const DetailedHull = ({ color, destroyedColor, destroyed }: { color: string, destroyedColor: string, destroyed: boolean }) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Central Block */}
      <Box args={[2.8, 0.8, 3.6]} position={[0, 0.6, 0]} castShadow receiveShadow>{mat}</Box>
      
      {/* Upper Glacis (Front slope) */}
      <Box args={[2.8, 0.2, 1.8]} position={[0, 0.75, 1.8]} rotation={[0.35, 0, 0]} castShadow receiveShadow>{mat}</Box>
      
      {/* Lower Glacis */}
      <Box args={[2.8, 0.2, 1.2]} position={[0, 0.25, 2.1]} rotation={[-0.4, 0, 0]} castShadow receiveShadow>{mat}</Box>
      
      {/* Engine Deck (Rear top) */}
      <Box args={[2.8, 0.2, 1.6]} position={[0, 0.95, -1.6]} rotation={[-0.05, 0, 0]} castShadow receiveShadow>{mat}</Box>
      
      {/* Rear Plate */}
      <Box args={[2.8, 0.8, 0.5]} position={[0, 0.5, -2.2]} rotation={[-0.2, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Side Skirts (Armor over tracks) */}
      <Box args={[0.9, 0.6, 5.2]} position={[1.9, 0.8, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.9, 0.6, 5.2]} position={[-1.9, 0.8, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Grilles */}
      <Box args={[1.8, 0.05, 1.0]} position={[0, 1.06, -1.6]} rotation={[-0.05, 0, 0]} castShadow receiveShadow>{grilleMat}</Box>
      
      {/* Exhaust Pipes */}
      <Cylinder args={[0.1, 0.1, 0.4]} position={[1.2, 1.1, -2.0]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.1, 0.1, 0.4]} position={[-1.2, 1.1, -2.0]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      
      {/* Front Lights */}
      <Box args={[0.2, 0.15, 0.2]} position={[1.2, 0.7, 2.2]} rotation={[0.35, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.2, 0.15, 0.2]} position={[-1.2, 0.7, 2.2]} rotation={[0.35, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
    </group>
  );
};

const DetailedTracks = ({ isLeft, trackMat, destroyedColor, destroyed }: { isLeft: boolean, trackMat: THREE.Material, destroyedColor: string, destroyed: boolean }) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 1.9;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;
  
  const roadWheels = [];
  for (let i = 0; i < 6; i++) {
    const z = 1.8 - i * 0.72;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.3, z]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.3, 0.3, 0.6, 16]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.2, 0.2, 0.62, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
        <Cylinder args={[0.08, 0.08, 0.65, 8]} castShadow receiveShadow>{rubberMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Track Belt */}
      <Box args={[0.8, 0.05, 4.6]} position={[xPos, 0.65, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.8, 0.05, 3.6]} position={[xPos, 0.0, -0.2]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.8, 0.05, 1.2]} position={[xPos, 0.35, 2.1]} rotation={[0.7, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.8, 0.05, 1.0]} position={[xPos, 0.35, -2.2]} rotation={[-0.9, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>

      {/* Drive Sprocket (Rear) */}
      <group position={[xPos, 0.45, -2.2]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.35, 0.35, 0.6, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
      
      {/* Idler Wheel (Front) */}
      <group position={[xPos, 0.45, 2.3]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.3, 0.3, 0.6, 16]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {roadWheels}
    </group>
  );
};

const DetailedTurret = ({ color, destroyedColor, destroyed }: { color: string, destroyedColor: string, destroyed: boolean }) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} />;
  
  return (
    <group>
      {/* Turret Base */}
      <Box args={[2.2, 0.8, 2.5]} position={[0, 0.4, -0.2]} castShadow receiveShadow>{mat}</Box>
      
      {/* Left Cheek */}
      <Box args={[1.1, 0.8, 1.5]} position={[-0.55, 0.4, 1.2]} rotation={[0, -0.5, 0]} castShadow receiveShadow>{mat}</Box>
      
      {/* Right Cheek */}
      <Box args={[1.1, 0.8, 1.5]} position={[0.55, 0.4, 1.2]} rotation={[0, 0.5, 0]} castShadow receiveShadow>{mat}</Box>
      
      {/* Turret Bustle */}
      <Box args={[2.2, 0.7, 1.2]} position={[0, 0.45, -1.8]} castShadow receiveShadow>{mat}</Box>
      
      {/* Commander's Cupola */}
      <Cylinder args={[0.35, 0.35, 0.2, 16]} position={[0.6, 0.9, -0.5]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.3, 0.3, 0.05, 16]} position={[0.6, 1.0, -0.5]} rotation={[0.2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      
      {/* Loader's Hatch */}
      <Cylinder args={[0.3, 0.3, 0.05, 16]} position={[-0.6, 0.82, -0.5]} castShadow receiveShadow>{mat}</Cylinder>
      
      {/* Roof Machine Gun */}
      <group position={[0.6, 1.1, -0.2]}>
        <Box args={[0.1, 0.15, 0.4]} position={[0, 0, 0]} castShadow receiveShadow>{darkMat}</Box>
        <Cylinder args={[0.02, 0.02, 0.6]} position={[0, 0.05, 0.4]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Box args={[0.08, 0.15, 0.15]} position={[-0.1, 0, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={destroyed ? destroyedColor : '#455a64'} />
        </Box>
      </group>

      {/* Smoke Grenade Launchers */}
      <group position={[-1.15, 0.5, 0.5]} rotation={[0, -Math.PI/4, 0]}>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[-0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>
      <group position={[1.15, 0.5, 0.5]} rotation={[0, Math.PI/4, 0]}>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[-0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>

      {/* Antennas */}
      <Cylinder args={[0.01, 0.02, 2.0]} position={[-0.8, 1.8, -1.5]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.01, 0.02, 2.0]} position={[0.8, 1.8, -1.5]} castShadow receiveShadow>{darkMat}</Cylinder>
      
      {/* Storage Baskets */}
      <Box args={[2.0, 0.4, 0.3]} position={[0, 0.4, -2.5]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} wireframe={true} />
      </Box>
    </group>
  );
};

const DetailedGun = ({ destroyedColor, destroyed }: { destroyedColor: string, destroyed: boolean }) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;
  
  return (
    <group>
      {/* Mantlet */}
      <Box args={[0.8, 0.6, 0.8]} position={[0, 0, 0.2]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />
      </Box>
      
      {/* Main Barrel */}
      <Cylinder args={[0.12, 0.15, 3.8]} position={[0, 0, 1.9]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>
      
      {/* Bore Evacuator */}
      <Cylinder args={[0.18, 0.18, 0.8]} position={[0, 0, 2.0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>
      
      {/* Muzzle Brake */}
      <Cylinder args={[0.16, 0.16, 0.4]} position={[0, 0, 3.8]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
      <Box args={[0.35, 0.1, 0.3]} position={[0, 0, 3.8]} castShadow receiveShadow>
        {darkMat}
      </Box>
    </group>
  );
};

export function Tank({ id, isPlayer }: TankProps) {
  const groupRef = useRef<THREE.Group>(null);
  const turretRef = useRef<THREE.Group>(null);
  const gunRef = useRef<THREE.Group>(null);
  const gunBarrelRef = useRef<THREE.Group>(null);
  
  const lastDustSpawn = useRef<number>(0);

  const leftTrackTexture = useMemo(() => createTrackTexture(), []);
  const rightTrackTexture = useMemo(() => createTrackTexture(), []);

  const color = isPlayer ? GAME_CONFIG.tank.colors.player : GAME_CONFIG.tank.colors.enemy;
  const destroyedColor = GAME_CONFIG.tank.colors.destroyed;

  // Subscribe ONLY to the destroyed state to trigger a re-render when destroyed
  const destroyed = useGameStore(state => 
    isPlayer ? state.playerTank.destroyed : state.enemies.find(e => e.id === id)?.destroyed
  ) || false;

  const leftTrackMat = useMemo(() => new THREE.MeshStandardMaterial({ 
    map: leftTrackTexture, 
    color: destroyed ? destroyedColor : '#aaaaaa',
    roughness: 0.9
  }), [leftTrackTexture, destroyed, destroyedColor]);
  
  const rightTrackMat = useMemo(() => new THREE.MeshStandardMaterial({ 
    map: rightTrackTexture, 
    color: destroyed ? destroyedColor : '#aaaaaa',
    roughness: 0.9
  }), [rightTrackTexture, destroyed, destroyedColor]);

  useFrame(() => {
    const data = isPlayer 
      ? useGameStore.getState().playerTank 
      : useGameStore.getState().enemies.find(e => e.id === id);

    if (!data) return;

    if (groupRef.current) {
      groupRef.current.position.copy(data.position);
      
      const pitch = data.pitch || 0;
      const roll = data.roll || 0;
      const targetRotation = new THREE.Euler(pitch, data.rotation, roll, 'YXZ');
      groupRef.current.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetRotation), 0.2);
    }
    if (turretRef.current) {
      turretRef.current.rotation.y = data.turretRotation + (data.turretSwayOffset || 0);
    }
    if (gunRef.current) {
      gunRef.current.rotation.x = data.gunElevation + (data.gunSwayOffset || 0);
    }
    
    const now = Date.now();

    if (gunBarrelRef.current) {
      const timeSinceFire = now - (data.lastFireTime || 0);
      
      let recoilOffset = 0;
      if (timeSinceFire < 50) {
        // Recoil back
        recoilOffset = -(timeSinceFire / 50) * 0.8;
      } else if (timeSinceFire < 500) {
        // Return forward
        recoilOffset = -0.8 * (1 - (timeSinceFire - 50) / 450);
      }
      
      gunBarrelRef.current.position.z = recoilOffset;
    }

    if (data.leftTrackSpeed) {
      leftTrackMat.map!.offset.y -= data.leftTrackSpeed * 0.01;
    }
    if (data.rightTrackSpeed) {
      rightTrackMat.map!.offset.y -= data.rightTrackSpeed * 0.01;
    }

    // Spawn dust particles
    const speed = Math.abs(data.speed || 0);
    const turnSpeed = Math.abs((data.leftTrackSpeed || 0) - (data.rightTrackSpeed || 0));
    
    // Only spawn dust if moving fast enough or turning fast enough
    if (speed > 4 || turnSpeed > 6) {
      // Dynamic spawn rate based on speed (faster = more dust)
      const spawnInterval = Math.max(30, 150 - (speed * 10));
      
      if (now - lastDustSpawn.current > spawnInterval) {
        lastDustSpawn.current = now;
        const spawnParticle = useGameStore.getState().spawnParticle;
        
        // Left track dust
        const leftDustPos = data.position.clone().add(
          new THREE.Vector3(
            -GAME_CONFIG.tank.trackWidth / 2 + (Math.random() - 0.5) * 0.5, 
            (Math.random() * 0.5), 
            -2 + (Math.random() - 0.5)
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation)
        );
        spawnParticle('dust', leftDustPos, new THREE.Vector3(0, 1, 0));

        // Right track dust
        const rightDustPos = data.position.clone().add(
          new THREE.Vector3(
            GAME_CONFIG.tank.trackWidth / 2 + (Math.random() - 0.5) * 0.5, 
            (Math.random() * 0.5), 
            -2 + (Math.random() - 0.5)
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation)
        );
        spawnParticle('dust', rightDustPos, new THREE.Vector3(0, 1, 0));
      }
    }
  });

  return (
    <group ref={groupRef} name={`tank-${id}`}>
      <DetailedHull color={color} destroyedColor={destroyedColor} destroyed={destroyed} />
      <DetailedTracks isLeft={true} trackMat={leftTrackMat} destroyedColor={destroyedColor} destroyed={destroyed} />
      <DetailedTracks isLeft={false} trackMat={rightTrackMat} destroyedColor={destroyedColor} destroyed={destroyed} />

      {/* Turret Group */}
      <group ref={turretRef} position={[0, 1.2, 0.2]}>
        <DetailedTurret color={color} destroyedColor={destroyedColor} destroyed={destroyed} />

        {/* Gun Group */}
        <group ref={gunRef} position={[0, 0.4, 1.5]}>
          <group ref={gunBarrelRef}>
            <DetailedGun destroyedColor={destroyedColor} destroyed={destroyed} />
          </group>
        </group>
      </group>
    </group>
  );
}
