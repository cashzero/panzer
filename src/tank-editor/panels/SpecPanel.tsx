import type { TankAmmoSpec, TankSpec } from '../../tanks/core/types';
import { CheckboxField, ColorField, FieldGrid, NumberField, PanelSection, ReadOnlyField, TextAreaField, TextField, Vec3Field } from '../controls';

function cloneAmmoSpec(base: TankAmmoSpec): TankAmmoSpec {
  return {...base};
}

export function SpecPanel({spec, folderName, onChange}: {spec: TankSpec; folderName: string; onChange: (next: TankSpec) => void}) {
  const patch = (mutate: (next: TankSpec) => void) => {
    const next = structuredClone(spec);
    mutate(next);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <PanelSection title="Identity" subtitle="Folder name stays authoritative for v1. Tank id is shown for reference and kept read-only.">
        <FieldGrid>
          <ReadOnlyField label="Folder" value={folderName} />
          <ReadOnlyField label="Tank ID" value={spec.id} hint="Change the folder manually if you ever need to rename the tank." />
          <TextField label="Display Name" value={spec.meta.displayName} onChange={(value) => patch((next) => { next.meta.displayName = value; })} />
          <TextField label="Nationality" value={spec.meta.nationality} onChange={(value) => patch((next) => { next.meta.nationality = value; })} />
          <NumberField label="Year" value={spec.meta.year} onChange={(value) => patch((next) => { next.meta.year = value; })} />
          <ColorField label="Base Color" value={spec.appearance.baseColor} onChange={(value) => patch((next) => { next.appearance.baseColor = value; })} />
        </FieldGrid>
        <TextAreaField
          label="Description"
          value={spec.meta.description}
          rows={5}
          onChange={(value) => patch((next) => { next.meta.description = value; })}
        />
      </PanelSection>

      <PanelSection title="Durability">
        <FieldGrid>
          <NumberField label="Health" value={spec.durability.health} onChange={(value) => patch((next) => { next.durability.health = value; })} />
          <NumberField label="Track Health" value={spec.durability.trackHealth} onChange={(value) => patch((next) => { next.durability.trackHealth = value; })} />
          <NumberField label="Front Armor" value={spec.durability.armorSummary.front} onChange={(value) => patch((next) => { next.durability.armorSummary.front = value; })} />
          <NumberField label="Side Armor" value={spec.durability.armorSummary.side} onChange={(value) => patch((next) => { next.durability.armorSummary.side = value; })} />
          <NumberField label="Rear Armor" value={spec.durability.armorSummary.rear} onChange={(value) => patch((next) => { next.durability.armorSummary.rear = value; })} />
          <NumberField label="Turret Armor" value={spec.durability.armorSummary.turret} onChange={(value) => patch((next) => { next.durability.armorSummary.turret = value; })} />
        </FieldGrid>
      </PanelSection>

      <PanelSection title="Mounts">
        <FieldGrid>
          <Vec3Field label="Turret Offset" value={spec.mounts.turretOffset} onChange={(value) => patch((next) => { next.mounts.turretOffset = value; })} />
          <Vec3Field label="Gun Pivot Offset" value={spec.mounts.gunPivotOffset} onChange={(value) => patch((next) => { next.mounts.gunPivotOffset = value; })} />
          <NumberField label="Muzzle Distance" step={0.01} value={spec.mounts.muzzleDistance} onChange={(value) => patch((next) => { next.mounts.muzzleDistance = value; })} />
          <NumberField label="Broad Phase Radius" step={0.01} value={spec.mounts.broadPhaseRadius} onChange={(value) => patch((next) => { next.mounts.broadPhaseRadius = value; })} />
        </FieldGrid>
      </PanelSection>

      <PanelSection title="Mobility">
        <FieldGrid columns={3}>
          <NumberField label="Horsepower" value={spec.mobility.horsepower} onChange={(value) => patch((next) => { next.mobility.horsepower = value; })} />
          <NumberField label="Weight" step={0.1} value={spec.mobility.weight} onChange={(value) => patch((next) => { next.mobility.weight = value; })} />
          <NumberField label="Max Speed" step={0.1} value={spec.mobility.maxSpeed} onChange={(value) => patch((next) => { next.mobility.maxSpeed = value; })} />
          <NumberField label="Reverse Speed" step={0.1} value={spec.mobility.maxReverseSpeed} onChange={(value) => patch((next) => { next.mobility.maxReverseSpeed = value; })} />
          <NumberField label="Acceleration" step={0.01} value={spec.mobility.acceleration} onChange={(value) => patch((next) => { next.mobility.acceleration = value; })} />
          <NumberField label="Deceleration" step={0.01} value={spec.mobility.deceleration} onChange={(value) => patch((next) => { next.mobility.deceleration = value; })} />
          <NumberField label="Track Width" step={0.01} value={spec.mobility.trackWidth} onChange={(value) => patch((next) => { next.mobility.trackWidth = value; })} />
          <NumberField label="Turn Rate Limit" step={0.01} value={spec.mobility.turnRateLimit} onChange={(value) => patch((next) => { next.mobility.turnRateLimit = value; })} />
          <NumberField label="Rotational Inertia" step={0.01} value={spec.mobility.rotationalInertia} onChange={(value) => patch((next) => { next.mobility.rotationalInertia = value; })} />
        </FieldGrid>
      </PanelSection>

      <PanelSection title="Traverse">
        <FieldGrid>
          <NumberField label="Turret Speed" step={0.01} value={spec.traverse.turretSpeed} onChange={(value) => patch((next) => { next.traverse.turretSpeed = value; })} />
          <NumberField label="Gun Speed" step={0.01} value={spec.traverse.gunSpeed} onChange={(value) => patch((next) => { next.traverse.gunSpeed = value; })} />
          <NumberField label="Max Elevation" value={spec.traverse.maxElevationDeg} onChange={(value) => patch((next) => { next.traverse.maxElevationDeg = value; })} hint="Degrees above horizontal" />
          <NumberField label="Max Depression" value={spec.traverse.maxDepressionDeg} onChange={(value) => patch((next) => { next.traverse.maxDepressionDeg = value; })} hint="Degrees below horizontal" />
          <NumberField label="Traverse Limit" value={spec.traverse.limitDeg ?? 0} onChange={(value) => patch((next) => { if (value > 0) next.traverse.limitDeg = value; else delete next.traverse.limitDeg; })} hint="Degrees each side of the hull centreline; 0 for a full turret" />
        </FieldGrid>
      </PanelSection>

      <PanelSection title="Weapon System">
        <FieldGrid>
          <NumberField label="Caliber" value={spec.weapons.caliber} onChange={(value) => patch((next) => { next.weapons.caliber = value; })} />
          <NumberField label="Reload Time" value={spec.weapons.reloadTime} onChange={(value) => patch((next) => { next.weapons.reloadTime = value; })} hint="Milliseconds" />
        </FieldGrid>

        <CheckboxField
          label="Burst Fire"
          checked={Boolean(spec.weapons.burst)}
          onChange={(checked) => patch((next) => {
            if (checked) {
              next.weapons.burst = next.weapons.burst ?? {count: 3, interval: 120};
            } else {
              delete next.weapons.burst;
            }
          })}
        />

        {spec.weapons.burst ? (
          <FieldGrid>
            <NumberField label="Burst Count" value={spec.weapons.burst.count} onChange={(value) => patch((next) => { if (next.weapons.burst) next.weapons.burst.count = value; })} />
            <NumberField label="Burst Interval" value={spec.weapons.burst.interval} onChange={(value) => patch((next) => { if (next.weapons.burst) next.weapons.burst.interval = value; })} hint="Milliseconds" />
          </FieldGrid>
        ) : null}

        <div className="editor-gradient-bar" />

        <FieldGrid>
          <CheckboxField
            label="APC Round"
            checked={Boolean(spec.weapons.ammo.APC)}
            onChange={(checked) => patch((next) => {
              if (checked) next.weapons.ammo.APC = next.weapons.ammo.APC ?? cloneAmmoSpec(next.weapons.ammo.AP);
              else delete next.weapons.ammo.APC;
            })}
          />
          <CheckboxField
            label="HE Round"
            checked={Boolean(spec.weapons.ammo.HE)}
            onChange={(checked) => patch((next) => {
              if (checked) next.weapons.ammo.HE = next.weapons.ammo.HE ?? cloneAmmoSpec(next.weapons.ammo.AP);
              else delete next.weapons.ammo.HE;
            })}
          />
        </FieldGrid>

        {([
          ['AP', spec.weapons.ammo.AP],
          ['APC', spec.weapons.ammo.APC],
          ['HE', spec.weapons.ammo.HE],
        ] as const).map(([ammoKey, ammo]) => {
          if (!ammo) return null;

          return (
            <PanelSection key={ammoKey} title={`${ammoKey} Round`}>
              <FieldGrid columns={3}>
                <NumberField label="Penetration" value={ammo.penetration} onChange={(value) => patch((next) => { next.weapons.ammo[ammoKey]!.penetration = value; })} />
                <NumberField label="Velocity" value={ammo.velocity} onChange={(value) => patch((next) => { next.weapons.ammo[ammoKey]!.velocity = value; })} />
                <NumberField label="Damage" value={ammo.damage} onChange={(value) => patch((next) => { next.weapons.ammo[ammoKey]!.damage = value; })} />
                <NumberField label="Drop" step={0.001} value={ammo.drop} onChange={(value) => patch((next) => { next.weapons.ammo[ammoKey]!.drop = value; })} />
                <NumberField label="Dispersion" step={0.0001} value={ammo.dispersion} onChange={(value) => patch((next) => { next.weapons.ammo[ammoKey]!.dispersion = value; })} />
              </FieldGrid>
            </PanelSection>
          );
        })}
      </PanelSection>
    </div>
  );
}
