import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { N8AOPass } from 'n8ao';
import { createColorGradePass } from './colorGrade';
import { createShockwavePass, updateShockwavePass } from './shockwaves';
import { Vector2 } from 'three';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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
  const shockwaves = useRef<ShaderPass | null>(null);
  const battlePasses = useRef<{ ao: N8AOPass; bloom: UnrealBloomPass; plain: RenderPass } | null>(null);
  const bufferSize = useRef(new Vector2());
  const sample = useRef({ seconds: 0, frames: 0 });

  // The pipeline lives for the whole battle, map included. Tearing it down
  // for the map meant rebuilding it, AO shaders and all, on the way out; and
  // drawing the map straight to the screen compiled a second, tone-mapped
  // variant of every material on the first map frame (over a second). The
  // map draws through the same targets with a plain render pass instead of
  // AO and bloom.
  useEffect(() => {
    const composer = new EffectComposer(gl);
    const ao = new N8AOPass(scene, camera, 1, 1);
    ao.configuration.gammaCorrection = false;
    ao.configuration.aoRadius = 1.15;
    ao.configuration.distanceFalloff = 1;
    ao.configuration.intensity = 1.6;
    ao.configuration.halfRes = true;
    ao.setQualityMode('Medium');
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.08, 0.35, 12.0);
    // Blast waves bend the lit HDR image, ahead of tone mapping and grading.
    const shock = createShockwavePass();
    const output = new OutputPass();
    const grade = createColorGradePass();
    const antialias = new SMAAPass();
    const plain = new RenderPass(scene, camera);
    plain.enabled = false;
    composer.addPass(plain);
    composer.addPass(ao);
    composer.addPass(bloom);
    composer.addPass(shock);
    composer.addPass(output);
    composer.addPass(grade);
    composer.addPass(antialias);
    composer.setSize(size.width, size.height);
    pipeline.current = composer;
    shockwaves.current = shock;
    battlePasses.current = { ao, bloom, plain };
    return () => {
      pipeline.current = null;
      shockwaves.current = null;
      battlePasses.current = null;
      plain.dispose();
      shock.dispose();
      disposeAO(ao);
      bloom.dispose();
      output.dispose();
      grade.dispose();
      antialias.dispose();
      composer.dispose();
    };
    // Resize separately without reallocating passes or recompiling AO shaders.
  }, [gl, scene, camera]);

  useEffect(() => {
    pipeline.current?.setPixelRatio(gl.getPixelRatio());
    pipeline.current?.setSize(size.width, size.height);
  }, [gl, size]);

  // Dev-only frame benchmark, callable from the console or automation as
  // `await __panzerBench(60)`. It steps whole frames (game logic and every
  // render pass) synchronously and waits for the GPU after each, so it
  // measures the same in a background tab, where requestAnimationFrame stops.
  const advance = useThree((state) => state.advance);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const context = gl.getContext();
    const pixel = new Uint8Array(4);
    const bench = (frames = 60) => {
      const autoReset = gl.info.autoReset;
      gl.info.autoReset = false;
      const times: number[] = [];
      let calls = 0, triangles = 0;
      for (let frame = 0; frame < frames; frame++) {
        gl.info.reset();
        const start = performance.now();
        advance(start);
        // Reading a pixel back blocks until the GPU has finished the frame.
        context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
        times.push(performance.now() - start);
        calls += gl.info.render.calls;
        triangles += gl.info.render.triangles;
      }
      gl.info.autoReset = autoReset;
      times.sort((a, b) => a - b);
      const mean = times.reduce((sum, time) => sum + time, 0) / frames;
      return {
        meanMs: +mean.toFixed(2),
        medianMs: +times[Math.floor(frames / 2)].toFixed(2),
        p95Ms: +times[Math.min(frames - 1, Math.floor(frames * 0.95))].toFixed(2),
        drawCalls: Math.round(calls / frames),
        triangles: Math.round(triangles / frames),
        // Compiled shader programs so far: a jump means a compile stall.
        programs: gl.info.programs?.length ?? 0,
      };
    };
    const target = window as unknown as { __panzerBench?: typeof bench };
    target.__panzerBench = bench;
    return () => { if (target.__panzerBench === bench) delete target.__panzerBench; };
  }, [gl, advance]);

  useFrame((_, delta) => {
    const passes = battlePasses.current;
    if (pipeline.current && passes) {
      passes.ao.enabled = !mapMode;
      passes.bloom.enabled = !mapMode;
      passes.plain.enabled = mapMode;
      if (shockwaves.current) {
        if (mapMode) shockwaves.current.enabled = false;
        else {
          gl.getDrawingBufferSize(bufferSize.current);
          updateShockwavePass(shockwaves.current, camera, bufferSize.current.x, bufferSize.current.y);
        }
      }
      pipeline.current.render(delta);
    }
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
