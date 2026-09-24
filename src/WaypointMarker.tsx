import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from './store';
import { MAP_COLOURS, symbolScale } from './rendering/mapSymbols';

export function WaypointMarkers() {
  const allyIds = useGameStore(useShallow(state => state.allies.map(a => a.id)));
  return (
    <>
      {allyIds.map(id => <WaypointMarker key={`wp-${id}`} allyId={id} />)}
    </>
  );
}

const arrowGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(-0.9, -2.2); shape.lineTo(0.9, -2.2); shape.closePath();
  return new THREE.ShapeGeometry(shape);
})();

/**
 * A move order as drawn in grease pencil: a dashed line from the tank to its
 * objective, ending in an arrowhead. The selected ally's order is brass.
 */
function WaypointMarker({ allyId }: { allyId: string }) {
  const { line, arrow } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: MAP_COLOURS.friendly, depthTest: false, dashSize: 6, gapSize: 4 }));
    line.renderOrder = 9;
    const arrow = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({ color: MAP_COLOURS.friendly, side: THREE.DoubleSide, depthTest: false }));
    arrow.renderOrder = 9;
    return { line, arrow };
  }, []);

  useFrame(({ camera, size }) => {
    const state = useGameStore.getState();
    const wp = state.allyWaypoints[allyId];
    const ally = state.allies.find(a => a.id === allyId);
    const show = !!wp && !!ally && !ally.destroyed;
    line.visible = arrow.visible = show;
    if (!show) return;
    const colour = state.selectedAllyId === allyId ? MAP_COLOURS.selected : MAP_COLOURS.friendly;
    (line.material as THREE.LineDashedMaterial).color.set(colour);
    (arrow.material as THREE.MeshBasicMaterial).color.set(colour);

    const from = new THREE.Vector3(ally!.position.x, ally!.position.y + 3, ally!.position.z);
    const to = new THREE.Vector3(wp!.x, wp!.y + 3, wp!.z);
    // Dashes keep a constant screen length at every zoom.
    const scale = symbolScale(camera, to, size.height, 1);
    const material = line.material as THREE.LineDashedMaterial;
    material.dashSize = scale * 9 * 3.4;
    material.gapSize = scale * 6 * 3.4;
    const position = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0, from.x, from.y, from.z);
    position.setXYZ(1, to.x, to.y, to.z);
    position.needsUpdate = true;
    line.computeLineDistances();
    line.geometry.computeBoundingSphere();

    arrow.position.copy(to);
    // Local +y is the tip; after the flat X rotation it points along (-sin, -cos) of Z.
    arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-(to.x - from.x), -(to.z - from.z)));
    arrow.scale.setScalar(scale * 12);
  });

  return (
    <>
      <primitive object={line} />
      <primitive object={arrow} />
    </>
  );
}
