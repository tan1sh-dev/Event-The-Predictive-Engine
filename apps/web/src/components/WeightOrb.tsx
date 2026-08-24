export default function WeightOrb({
  visual,
  weight,
  pulse = false,
}: {
  visual: number;
  weight: number;
  pulse?: boolean;
}) {
  const scale = 0.72 + visual * 0.55;
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative grid place-items-center ${pulse ? "animate-pulseGlow" : ""}`}
        style={{ width: 148, height: 148 }}
      >
        <div
          className="absolute rounded-full bg-[radial-gradient(circle_at_35%_30%,#f6efe4,transparent_28%),radial-gradient(circle_at_50%_50%,#5cefff,#9b7bff_55%,#ff5aa8)]"
          style={{
            width: 110,
            height: 110,
            transform: `scale(${scale})`,
            transition: "transform 700ms cubic-bezier(0.2, 1.4, 0.3, 1)",
            boxShadow: `0 0 ${20 + visual * 40}px rgba(92,239,255,${0.25 + visual * 0.45})`,
          }}
        />
        <div className="absolute h-28 w-28 rounded-full bg-white/10 blur-xl" />
      </div>
      <p className="font-display text-3xl font-bold">{weight.toFixed(2)}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cream/50">
        Node weight
      </p>
    </div>
  );
}
