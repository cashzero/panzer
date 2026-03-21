import { useMemo } from 'react';
import * as THREE from 'three';

export function getTerrainHeight(x: number, z: number): number {
  const scale1 = 0.02;
  const scale2 = 0.05;
  const scale3 = 0.005;
  
  let y = Math.sin(x * scale1) * Math.cos(z * scale1) * 2.0;
  y += Math.sin(x * scale2 + 1.0) * Math.cos(z * scale2 + 2.0) * 0.5;
  y += Math.sin(x * scale3) * Math.cos(z * scale3) * 10.0;
  
  // Flatten out the center area so the spawn point is relatively flat
  const distFromCenter = Math.sqrt(x * x + z * z);
  const flattenFactor = Math.min(1, distFromCenter / 50);
  
  return y * flattenFactor;
}

export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1000, 1000, 200, 200);
    geo.rotateX(-Math.PI / 2);
    
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z);
      pos.setY(i, y);
    }
    
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial 
        color="#556b2f" 
        roughness={1} 
        metalness={0} 
        flatShading
      />
    </mesh>
  );
}
