import * as THREE from 'three';

// One direction drives the visible sun, reflections, direct shadows and the
// aerial-perspective glow. About 35 degrees up: long enough shadows to model
// hulls and terrain relief.
export const SUN_DIRECTION = new THREE.Vector3(-0.62, 0.52, -0.48).normalize();
