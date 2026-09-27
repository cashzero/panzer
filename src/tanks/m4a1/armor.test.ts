import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {testProjectileAgainstTank} from '../../armorModel';
import type {TankData} from '../../store';
import {validateTankDraft} from '../../tank-editor/validation';
import type {TankModelSpec, TankSpec} from '../core/types';

const spec: TankSpec = JSON.parse(readFileSync(new URL('./tank.json', import.meta.url), 'utf8'));
const model: TankModelSpec = JSON.parse(readFileSync(new URL('./model.json', import.meta.url), 'utf8'));

test('M4A1 armor and model remain valid', () => {
  assert.deepEqual(spec.durability.armorSummary, {front: 51, side: 38, rear: 38, turret: 76});
  assert.deepEqual(validateTankDraft(spec, model, 'm4a1').filter(i => i.severity === 'error'), []);
  const shield = model.slots.gun.find(n => n.id === 'm34a1-wide-rotor-shield');
  assert.ok(shield?.type === 'extrude');
  const points = shield.shape.outline;
  for (let i = 0; i < points.length / 2; i++) {
    const front = points[i], rear = points[points.length - 1 - i];
    assert.ok(Math.abs(Math.hypot(front[0] - rear[0], front[1] - rear[1]) - 0.089) < 0.000002);
  }
  const rotor = model.slots.gun.find(n => n.id === 'm34a1-rotor-behind-shield');
  assert.ok(rotor?.type === 'cylinder');
  assert.ok(rotor.radiusTop >= 0.231 && rotor.radiusTop < 0.24, 'Rotor must meet the inner shell without protruding through it');
  assert.deepEqual(rotor.position, [0, 0.01, -0.02]);
  assert.equal(model.slots.turret.find(n => n.id === 'front-cast-gun-mount')?.type, 'extrude', 'Fixed shield must not use the protruding spherical mount');
});

test('curved mantlet catches frontal shots across its width and elevation range', () => {
  const plates = spec.armorModel.plates.filter(p => p.parent === 'gunGroup');
  assert.equal(plates.length, 6);
  for (const elevation of [-25, 0, 12]) {
    const angle = THREE.MathUtils.degToRad(elevation);
    const rotation = new THREE.Matrix4().makeRotationX(angle);
    const tank = {position: new THREE.Vector3(), rotation: 0, turretRotation: 0, gunElevation: angle} as TankData;
    for (const x of [-0.5, 0, 0.5]) {
      for (let i = 0; i <= 50; i++) {
        const y = -0.275 + i * 0.011;
        const ray = new THREE.Ray(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1)).applyMatrix4(rotation);
        const hit = testProjectileAgainstTank(ray, 3, tank, {plates, broadPhaseRadius: 5}, [0, 0, 0], [0, 0, 0]);
        assert.ok(hit, `Missing mantlet at x=${x}, y=${y}, elevation=${elevation}`);
        assert.equal(hit.plateInfo.armorThickness, 89);
        assert.equal(hit.plateInfo.zone, 'gun');
      }
    }
  }
});
