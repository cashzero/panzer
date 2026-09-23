import * as THREE from 'three';

export const grassWind = { value: 0 };
export const grassShader: THREE.MeshStandardMaterial['onBeforeCompile'] = (shader) => {
  shader.uniforms.grassTime = grassWind;
  shader.vertexShader = 'uniform float grassTime;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    #ifdef USE_INSTANCING
      vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      // Each tuft fades at its own distance, so the cover thins out instead of
      // ending in a visible ring at the edge of the camera-centred grid.
      float fadeStart = 24.0 + fract(sin(dot(root.xz, vec2(12.9898, 78.233))) * 43758.5453) * 12.0;
      float visibility = 1.0 - smoothstep(fadeStart, fadeStart + 6.0, distance(root.xz, cameraPosition.xz));
      float breeze = sin(grassTime * 1.6 + root.x * 0.38 + root.z * 0.23);
      transformed.x += breeze * position.y * position.y * 0.42;
      transformed.z += sin(grassTime * 1.1 + root.z * 0.42) * position.y * position.y * 0.25;
      transformed *= visibility;
    #endif
  `);
};
