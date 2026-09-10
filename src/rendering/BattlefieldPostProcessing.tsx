import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { N8AOPass } from 'n8ao';
import { Vector2 } from 'three';

function disposeAO(pass: N8AOPass) {
  // n8ao 2.0.1 inherits the no-op Pass.dispose(). Release its owned targets,
  // noise texture and shader materials; leave shared fullscreen geometry alone.
  const disposed = new Set<unknown>();
  for (const resource of Object.values(pass)) {
    if (!resource || typeof resource !== 'object') continue;
    const owned = resource as {
      isWebGLRenderTarget?: boolean; isTexture?: boolean; isMaterial?: boolean;
      dispose?: () => void;
      material?: { isMaterial?: boolean; dispose: () => void };
    };
    const disposable = owned.isWebGLRenderTarget || owned.isTexture || owned.isMaterial
      ? owned : owned.material?.isMaterial ? owned.material : null;
    if (disposable && !disposed.has(disposable)) {
      disposable.dispose?.();
      disposed.add(disposable);
    }
  }
}

export function BattlefieldPostProcessing({ mapMode }: { mapMode: boolean }) {
  const { gl, scene, camera, size } = useThree();
  const pipeline = useRef<EffectComposer | null>(null);
  const sample = useRef({ seconds: 0, frames: 0 });

  useEffect(() => {
    if (mapMode) return;
    const composer = new EffectComposer(gl);
    const ao = new N8AOPass(scene, camera, 1, 1);
    ao.configuration.gammaCorrection = false;
    ao.configuration.aoRadius = 1.15;
    ao.configuration.distanceFalloff = 1;
    ao.configuration.intensity = 1.6;
    ao.configuration.halfRes = true;
    ao.setQualityMode('Medium');
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.08, 0.35, 12.0);
    const output = new OutputPass();
    const antialias = new SMAAPass();
    composer.addPass(ao);
    composer.addPass(bloom);
    composer.addPass(output);
    composer.addPass(antialias);
    composer.setSize(size.width, size.height);
    pipeline.current = composer;
    return () => {
      pipeline.current = null;
      disposeAO(ao);
      bloom.dispose();
      output.dispose();
      antialias.dispose();
      composer.dispose();
    };
    // Resize separately without reallocating passes or recompiling AO shaders.
  }, [gl, scene, camera, mapMode]);

  useEffect(() => {
    pipeline.current?.setPixelRatio(gl.getPixelRatio());
    pipeline.current?.setSize(size.width, size.height);
  }, [gl, size]);

  useFrame((_, delta) => {
    if (pipeline.current && !mapMode) pipeline.current.render(delta);
    else gl.render(scene, camera);
    if (import.meta.env.DEV && delta < 2) {
      sample.current.seconds += delta;
      sample.current.frames++;
      if (sample.current.seconds >= 2) {
        gl.domElement.dataset.renderFps = (sample.current.frames / sample.current.seconds).toFixed(1);
        gl.domElement.dataset.renderTextures = String(gl.info.memory.textures);
        sample.current = { seconds: 0, frames: 0 };
      }
    }
  }, 1);
  return null;
}
