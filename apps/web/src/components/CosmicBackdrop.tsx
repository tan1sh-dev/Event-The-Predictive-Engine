import { useMemo } from "react";

const STARS = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 11) % 100}%`,
  top: `${(i * 29 + 7) % 100}%`,
  size: 1 + (i % 3),
  delay: `${(i % 8) * 0.35}s`,
  duration: `${2.8 + (i % 5) * 0.4}s`,
}));

export default function CosmicBackdrop() {
  const stars = useMemo(() => STARS, []);
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="animate-drift absolute -left-1/4 -top-1/4 h-[70%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(155,123,255,0.28),transparent_64%)] blur-3xl" />
      <div className="animate-drift absolute -right-1/5 top-1/4 h-[60%] w-[60%] rounded-full bg-[radial-gradient(circle,rgba(92,239,255,0.18),transparent_62%)] blur-3xl [animation-delay:-7s]" />
      <div className="animate-drift absolute bottom-[-10%] left-1/4 h-[50%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(255,90,168,0.16),transparent_60%)] blur-3xl [animation-delay:-12s]" />
      {stars.map((s) => (
        <span
          key={s.id}
          className="animate-twinkle absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(7,6,15,0.72))]" />
    </div>
  );
}
