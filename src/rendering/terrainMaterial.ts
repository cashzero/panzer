import * as THREE from 'three';

export const grassWind = { value: 0 };
export const grassShader: THREE.MeshStandardMaterial['onBeforeCompile'] = (shader) => {
  shader.uniforms.grassTime = grassWind;
  shader.vertexShader = 'uniform float grassTime;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    #ifdef USE_INSTANCING
      vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float visibility = 1.0 - smoothstep(32.0, 43.0, distance(root.xz, cameraPosition.xz));
      float breeze = sin(grassTime * 1.6 + root.x * 0.38 + root.z * 0.23);
      transformed.x += breeze * position.y * position.y * 0.42;
      transformed.z += sin(grassTime * 1.1 + root.z * 0.42) * position.y * position.y * 0.25;
      transformed *= visibility;
    #endif
  `);
};
