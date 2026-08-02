"use client";

type CheckboxFieldProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Línea de ayuda debajo, para explicar qué produce el cambio. */
  hint?: string;
};

export default function CheckboxField({ label, checked, onChange, hint }: CheckboxFieldProps) {
  return (
    <div className="admin-field">
      <label className="admin-checkbox">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {hint && <p className="admin-field-hint">{hint}</p>}
    </div>
  );
}
