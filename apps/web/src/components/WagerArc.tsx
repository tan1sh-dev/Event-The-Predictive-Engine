import { HIGH_WAGER, LOW_WAGER, WAGER_STEP, type Wager } from "@engine/shared";

export default function WagerArc({
  value,
  onChange,
  disabled = false,
}: {
  value: Wager;
  onChange: (w: Wager) => void;
  disabled?: boolean;
}) {
  const pct = ((value - LOW_WAGER) / (HIGH_WAGER - LOW_WAGER)) * 100;

  function handleChange(raw: string) {
    const w = parseFloat(raw) as Wager;
    onChange(w);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(4);
  }

  return (
    <div className={`wager-slider-wrap ${disabled ? "is-disabled" : ""}`}>
      <input
        type="range"
        className="wager-slider"
        min={LOW_WAGER}
        max={HIGH_WAGER}
        step={WAGER_STEP}
        value={value}
        disabled={disabled}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        onChange={(e) => handleChange(e.target.value)}
        onInput={(e) => handleChange(e.currentTarget.value)}
        aria-label="Confidence wager"
        aria-valuemin={LOW_WAGER}
        aria-valuemax={HIGH_WAGER}
        aria-valuenow={value}
        aria-valuetext={`alpha ${value.toFixed(1)}`}
      />
      <div className="wager-slider-labels" aria-hidden>
        <span className="wager-slider-label mint">{LOW_WAGER.toFixed(1)}</span>
        <span className="wager-slider-label">1.0</span>
        <span className="wager-slider-label magenta">{HIGH_WAGER.toFixed(1)}</span>
      </div>
    </div>
  );
}
