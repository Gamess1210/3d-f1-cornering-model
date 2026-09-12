import type { ReactNode } from "react";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Renders the right-hand readout for the current value. */
  format?: (v: number) => string;
  /** Optional extra node rendered next to the value (e.g. a compass arrow). */
  adornment?: ReactNode;
  onChange: (v: number) => void;
}

/** Label + live value on one row, full-width range input beneath. */
export default function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  adornment,
  onChange,
}: SliderProps) {
  const text = format ? format(value) : value.toFixed(2);
  return (
    <div className="slider">
      <div className="slider-row">
        <span className="label">{label}</span>
        <span className="value">
          {text}
          {adornment}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? (max - min) / 200}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
