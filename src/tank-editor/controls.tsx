import { useEffect, useState, type ReactNode } from 'react';

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fieldShell(label: string, children: ReactNode, hint?: string) {
  return (
    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[var(--editor-muted)]">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-[10px] normal-case tracking-normal text-[#8d866f]">{hint}</span> : null}
    </label>
  );
}

export function PanelSection({title, subtitle, children}: {title: string; subtitle?: string; children: ReactNode}) {
  return (
    <section className="editor-panel-inset p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm tracking-[0.24em] uppercase text-[var(--editor-brass)]">{title}</h3>
        {subtitle ? <p className="text-xs text-[var(--editor-muted)] leading-relaxed">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function FieldGrid({children, columns = 2}: {children: ReactNode; columns?: 1 | 2 | 3}) {
  const columnClass = columns === 1 ? 'md:grid-cols-1' : columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return <div className={`grid gap-3 ${columnClass}`}>{children}</div>;
}

export function ReadOnlyField({label, value, hint}: {label: string; value: string; hint?: string}) {
  return fieldShell(
    label,
    <div className="editor-input text-[var(--editor-text)]/90 truncate">{value}</div>,
    hint,
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return fieldShell(
    label,
    <input
      className="editor-input"
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.currentTarget.value)}
    />,
    hint,
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  hint?: string;
}) {
  return fieldShell(
    label,
    <input
      className="editor-input"
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      onChange={(event) => onChange(toNumber(event.currentTarget.value))}
    />,
    hint,
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 5,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  hint?: string;
}) {
  return fieldShell(
    label,
    <textarea
      className="editor-textarea"
      rows={rows}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />,
    hint,
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{value: T; label: string}>;
  hint?: string;
}) {
  return fieldShell(
    label,
    <select className="editor-select" value={value} onChange={(event) => onChange(event.currentTarget.value as T)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>,
    hint,
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 text-xs uppercase tracking-[0.16em] text-[var(--editor-muted)]">
      <input
        className="mt-1 h-4 w-4 accent-[var(--editor-olive)]"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="flex flex-col gap-1">
        <span>{label}</span>
        {hint ? <span className="text-[10px] normal-case tracking-normal text-[#8d866f]">{hint}</span> : null}
      </span>
    </label>
  );
}

export function ColorField({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) {
  return fieldShell(
    label,
    <div className="flex items-center gap-2">
      <input
        className="h-11 w-12 border border-[var(--editor-border)] bg-transparent p-1"
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <input
        className="editor-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>,
  );
}

export function Vec3Field({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: [number, number, number];
  onChange: (value: [number, number, number]) => void;
  step?: number;
}) {
  return fieldShell(
    label,
    <div className="grid grid-cols-3 gap-2">
      {(['X', 'Y', 'Z'] as const).map((axis, index) => (
        <label key={axis} className="flex flex-col gap-1 text-[10px] text-[#8d866f] tracking-[0.16em] uppercase">
          <span>{axis}</span>
          <input
            className="editor-input"
            type="number"
            value={Number.isFinite(value[index]) ? value[index] : 0}
            step={step}
            onChange={(event) => {
              const next = [...value] as [number, number, number];
              next[index] = toNumber(event.currentTarget.value);
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>,
  );
}

export function JsonField({
  label,
  value,
  onCommit,
  rows = 8,
}: {
  label: string;
  value: unknown;
  onCommit: (value: unknown) => void;
  rows?: number;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(serialized);
    setError(null);
  }, [serialized]);

  const commit = () => {
    try {
      onCommit(JSON.parse(text));
      setError(null);
    } catch (nextError) {
      setError((nextError as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-[var(--editor-muted)]">
        <span>{label}</span>
        <button className="editor-button px-3 py-2" type="button" onClick={commit}>
          Apply JSON
        </button>
      </div>
      <textarea
        className="editor-textarea"
        rows={rows}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      {error ? <p className="text-xs text-[var(--editor-red)]">{error}</p> : null}
    </div>
  );
}
