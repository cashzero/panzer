import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, Particle } from './store';
import * as THREE from 'three';
import { GAME_CONFIG } from './config';

// Create a procedural dust/smoke texture
const createDustTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
};
const dustTexture = createDustTexture();

// Create a spark texture (small bright circle)
const createSparkTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  
  const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 200, 1)');
  gradient.addColorStop(1, 'rgba(255, 200, 0, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 16);
  
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
};
const sparkTexture = createSparkTexture();

interface SubParticle {
  type: 'flash' | 'smoke' | 'fireball' | 'debris' | 'spark';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  color: string;
  life: number; // multiplier for config.lifetime
  rotSpeed?: number;
}

const ParticleEffect = ({ particle }: { particle: Particle }) => {
  const removeParticle = useGameStore((state) => state.removeParticle);
  const groupRef = useRef<THREE.Group>(null);
  
  const { type, position, normal, createdAt } = particle;
  
  // Configuration per type
  const config = useMemo(() => {
    switch (type) {
      case 'fire': return GAME_CONFIG.particles.fire;
      case 'hit_penetrate': return GAME_CONFIG.particles.hit_penetrate;
      case 'hit_bounce': return GAME_CONFIG.particles.hit_bounce;
      case 'hit_ground': return GAME_CONFIG.particles.hit_ground;
      case 'he_hit_ground': return GAME_CONFIG.particles.he_hit_ground;
      case 'he_hit_penetrate': return GAME_CONFIG.particles.he_hit_penetrate;
      case 'tank_explosion': return GAME_CONFIG.particles.tank_explosion;
      case 'dust': return GAME_CONFIG.particles.dust;
      case 'dust_low': return GAME_CONFIG.particles.dust_low;
      case 'burning_smoke': return GAME_CONFIG.particles.burning_smoke;
      case 'tree_hit': return GAME_CONFIG.particles.tree_hit;
      default: return GAME_CONFIG.particles.default;
    }
  }, [type]);

  const subParticles = useMemo(() => {
    const subs: SubParticle[] = [];
    const n = normal ? new THREE.Vector3(normal.x, normal.y, normal.z).normalize() : new THREE.Vector3(0, 1, 0);
    
    const randomConeVector = (spread: number) => {
      const dir = n.clone();
      const tangent = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const bitangent = dir.clone().cross(tangent).normalize();
      const realTangent = bitangent.clone().cross(dir).normalize();
      
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * spread;
      
      return dir.add(realTangent.multiplyScalar(Math.cos(angle) * radius)).add(bitangent.multiplyScalar(Math.sin(angle) * radius)).normalize();
    };

    if (type === 'hit_ground') {
      subs.push({ type: 'flash', pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 3.5, color: '#ffaa00', life: 0.15 });
      for (let i=0; i<6; i++) {
        subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: randomConeVector(1.2).multiplyScalar(2 + Math.random() * 3), scale: 2.0 + Math.random() * 2, color: '#6b5428', life: 1, rotSpeed: (Math.random() - 0.5) * 2 });
      }
      for (let i=0; i<15; i++) {
        subs.push({ type: 'debris', pos: new THREE.Vector3(), vel: randomConeVector(1.5).multiplyScalar(8 + Math.random() * 8), scale: 0.15 + Math.random() * 0.2, color: '#3d2e15', life: 0.8 });
      }
    } else if (type === 'hit_penetrate') {
      subs.push({ type: 'flash', pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 3.0, color: '#ffffff', life: 0.15 });
      for (let i=0; i<25; i++) {
        subs.push({ type: 'spark', pos: new THREE.Vector3(), vel: randomConeVector(1.5).multiplyScalar(12 + Math.random() * 12), scale: 0.5, color: '#ffdd44', life: 0.4 + Math.random() * 0.4 });
      }
      for (let i=0; i<5; i++) {
        subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: randomConeVector(0.8).multiplyScalar(1 + Math.random() * 2), scale: 1.5 + Math.random() * 1.5, color: '#444444', life: 1, rotSpeed: (Math.random() - 0.5) * 2 });
      }
    } else if (type === 'hit_bounce') {
      subs.push({ type: 'flash', pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 1.5, color: '#ffcc00', life: 0.15 });
      for (let i=0; i<15; i++) {
        subs.push({ type: 'spark', pos: new THREE.Vector3(), vel: randomConeVector(2.0).multiplyScalar(10 + Math.random() * 10), scale: 0.4, color: '#ffaa00', life: 0.3 + Math.random() * 0.3 });
      }
    } else if (type === 'he_hit_ground') {
      subs.push({ type: 'flash', pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 5.0, color: '#ffffff', life: 0.15 });
      for (let i=0; i<4; i++) {
        subs.push({ type: 'fireball', pos: new THREE.Vector3(), vel: randomConeVector(1.5).multiplyScalar(2 + Math.random() * 3), scale: 3.0 + Math.random() * 2, color: '#ff5500', life: 0.5, rotSpeed: (Math.random() - 0.5) * 2 });
      }
      for (let i=0; i<8; i++) {
        subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: randomConeVector(1.5).multiplyScalar(2 + Math.random() * 2), scale: 2.5 + Math.random() * 2.5, color: '#5a4020', life: 1, rotSpeed: (Math.random() - 0.5) * 2 });
      }
      for (let i=0; i<20; i++) {
        subs.push({ type: 'debris', pos: new THREE.Vector3(), vel: randomConeVector(2.0).multiplyScalar(10 + Math.random() * 8), scale: 0.2 + Math.random() * 0.25, color: '#3d2e15', life: 0.8 });
      }
    } else if (type === 'he_hit_penetrate') {
      subs.push({ type: 'flash', pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 5.0, color: '#ffffff', life: 0.15 });
      for (let i=0; i<3; i++) {
        subs.push({ type: 'fireball', pos: new THREE.Vector3(), vel: randomConeVector(1.2).multiplyScalar(2 + Math.random() * 2), scale: 2.5 + Math.random() * 2, color: '#ff4400', life: 0.5, rotSpeed: (Math.random() - 0.5) * 2 });
      }
      for (let i=0; i<15; i++) {
        subs.push({ type: 'spark', pos: new THREE.Vector3(), vel: randomConeVector(1.5).multiplyScalar(12 + Math.random() * 12), scale: 0.5, color: '#ffdd44', life: 0.4 + Math.random() * 0.4 });
      }
      for (let i=0; i<8; i++) {
        subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: randomConeVector(1.0).multiplyScalar(1 + Math.random() * 2), scale: 2.0 + Math.random() * 2, color: '#333333', life: 1, rotSpeed: (Math.random() - 0.5) * 2 });
      }
    } else if (type === 'tank_explosion') {
      subs.push({ type: 'flash', pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 8.0, color: '#ffffff', life: 0.2 });
      for (let i=0; i<8; i++) {
        subs.push({ type: 'fireball', pos: new THREE.Vector3(), vel: randomConeVector(2).multiplyScalar(3 + Math.random() * 5), scale: 4.5 + Math.random() * 4, color: '#ff5500', life: 0.5, rotSpeed: (Math.random() - 0.5) * 2 });
      }
      for (let i=0; i<15; i++) {
        subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: randomConeVector(2).multiplyScalar(5 + Math.random() * 6), scale: 5.0 + Math.random() * 5, color: '#222222', life: 1, rotSpeed: (Math.random() - 0.5) * 2 });
      }
      for (let i=0; i<25; i++) {
        subs.push({ type: 'debris', pos: new THREE.Vector3(), vel: randomConeVector(2.5).multiplyScalar(15 + Math.random() * 20), scale: 0.3 + Math.random() * 0.5, color: '#111111', life: 0.9 });
      }
    } else if (type === 'fire') {
      subs.push({ type: 'flash', pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 3.0, color: '#ffaa00', life: 0.2 });
      subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: n.clone().multiplyScalar(4), scale: 2.0, color: '#888888', life: 1, rotSpeed: (Math.random() - 0.5) * 2 });
    } else if (type === 'burning_smoke') {
      // Large black smoke column rising from destroyed tank
      for (let i = 0; i < 3; i++) {
        subs.push({ type: 'smoke', pos: new THREE.Vector3((Math.random()-0.5)*1.5, Math.random()*0.5, (Math.random()-0.5)*1.5), vel: new THREE.Vector3((Math.random()-0.5)*0.8, 2 + Math.random()*2, (Math.random()-0.5)*0.8), scale: config.size * (0.7 + Math.random()*0.6), color: config.color, life: 1, rotSpeed: (Math.random() - 0.5) * 1.5 });
      }
      // Occasional ember/fire glow
      if (Math.random() < 0.4) {
        subs.push({ type: 'fireball', pos: new THREE.Vector3((Math.random()-0.5)*0.8, 0.5, (Math.random()-0.5)*0.8), vel: new THREE.Vector3(0, 1 + Math.random(), 0), scale: 1.5 + Math.random(), color: '#ff3300', life: 0.4, rotSpeed: (Math.random() - 0.5) * 2 });
      }
    } else if (type === 'tree_hit') {
      // Wood debris and splinters
      subs.push({ type: 'flash', pos: new THREE.Vector3(), vel: new THREE.Vector3(), scale: 2.0, color: '#ffcc66', life: 0.15 });
      for (let i = 0; i < 10; i++) {
        subs.push({ type: 'debris', pos: new THREE.Vector3(), vel: randomConeVector(2.0).multiplyScalar(6 + Math.random() * 6), scale: 0.15 + Math.random() * 0.2, color: i < 5 ? '#8b6914' : '#5c3a1e', life: 0.8 });
      }
      for (let i = 0; i < 4; i++) {
        subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: randomConeVector(1.0).multiplyScalar(1 + Math.random() * 2), scale: 1.5 + Math.random(), color: '#2d5a1e', life: 0.8, rotSpeed: (Math.random() - 0.5) * 2 });
      }
    } else if (type === 'dust') {
      subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: new THREE.Vector3((Math.random()-0.5)*2, Math.random()*1.5+0.5, (Math.random()-0.5)*2), scale: config.size, color: config.color, life: 1, rotSpeed: (Math.random() - 0.5) * 2 });
    } else if (type === 'dust_low') {
      subs.push({ type: 'smoke', pos: new THREE.Vector3(), vel: new THREE.Vector3((Math.random()-0.5)*1, Math.random()*0.3+0.1, (Math.random()-0.5)*1), scale: config.size, color: config.color, life: 1, rotSpeed: (Math.random() - 0.5) * 1 });
    }
    
    return subs;
  }, [type, normal, config]);

  const subParticlesData = useRef(subParticles.map(sp => ({ ...sp, currentPos: sp.pos.clone(), currentVel: sp.vel.clone() })));

  useEffect(() => {
    const timer = setTimeout(() => {
      removeParticle(particle.id);
    }, config.lifetime);
    return () => clearTimeout(timer);
  }, [particle.id, config.lifetime, removeParticle]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    const age = Date.now() - createdAt;
    const children = groupRef.current.children;
    
    subParticlesData.current.forEach((sp, i) => {
      const child = children[i];
      if (!child) return;
      
      const spProgress = Math.min(age / (config.lifetime * sp.life), 1);
      
      // Update physics
      if (sp.type === 'debris' || sp.type === 'spark') {
        sp.currentVel.y -= 25 * delta; // gravity
      } else if (sp.type === 'smoke' || sp.type === 'fireball') {
        sp.currentVel.multiplyScalar(1 - 2 * delta); // drag
        sp.currentVel.y += 1.5 * delta; // buoyancy
      }
      
      sp.currentPos.add(sp.currentVel.clone().multiplyScalar(delta));
      child.position.copy(sp.currentPos);
      
      // Update visuals
      if (sp.type === 'flash') {
        const scale = sp.scale * (1 + spProgress * 1.5);
        child.scale.setScalar(scale);
        if ((child as any).material) (child as any).material.opacity = 1 - Math.pow(spProgress, 0.5);
      } else if (sp.type === 'smoke' || sp.type === 'fireball') {
        const scale = sp.scale * (1 + spProgress * 2);
        child.scale.setScalar(scale);
        if ((child as any).material) {
          (child as any).material.opacity = (1 - Math.pow(spProgress, 1.5)) * (sp.type === 'fireball' ? 1 : 0.6);
          (child as any).material.rotation += (sp.rotSpeed || 0) * delta;
        }
      } else if (sp.type === 'debris') {
        child.rotation.x += sp.currentVel.y * delta;
        child.rotation.y += sp.currentVel.x * delta;
        if ((child as any).material) (child as any).material.opacity = 1 - spProgress;
      } else if (sp.type === 'spark') {
        if ((child as any).material) (child as any).material.opacity = 1 - Math.pow(spProgress, 2);
      }
      
      child.visible = spProgress < 1;
    });
  });

  return (
    <group ref={groupRef} position={position}>
      {subParticles.map((sp, i) => {
        if (sp.type === 'flash' || sp.type === 'smoke' || sp.type === 'fireball') {
          return (
            <sprite key={i} scale={[sp.scale, sp.scale, 1]}>
              <spriteMaterial 
                map={dustTexture} 
                color={sp.color} 
                transparent 
                opacity={1} 
                depthWrite={false} 
                blending={sp.type === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending} 
              />
            </sprite>
          );
        } else if (sp.type === 'spark') {
          return (
            <sprite key={i} scale={[sp.scale, sp.scale, 1]}>
              <spriteMaterial 
                map={sparkTexture} 
                color={sp.color} 
                transparent 
                opacity={1} 
                depthWrite={false} 
                blending={THREE.AdditiveBlending} 
              />
            </sprite>
          );
        } else if (sp.type === 'debris') {
          return (
            <mesh key={i} scale={[sp.scale, sp.scale, sp.scale]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color={sp.color} roughness={0.9} transparent opacity={1} />
            </mesh>
          );
        }
        return null;
      })}
    </group>
  );
};

export function Particles() {
  const particles = useGameStore((state) => state.particles);
  
  return (
    <group>
      {particles.map((p) => (
        <ParticleEffect key={p.id} particle={p} />
      ))}
    </group>
  );
}
