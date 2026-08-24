import { useEffect, useMemo, useRef } from "react";

const STARS = Array.from({ length: 86 }, (_, i) => ({
  id: i,
  left: `${(i * 17 + 11) % 100}%`,
  top: `${(i * 29 + 7) % 100}%`,
  size: 1 + (i % 3),
  delay: `${(i % 8) * 0.35}s`,
  duration: `${2.8 + (i % 5) * 0.4}s`,
}));

export default function CosmicBackdrop() {
  const stars = useMemo(() => STARS, []);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;
    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    function onMove(e: MouseEvent | TouchEvent) {
      const p = "touches" in e ? e.touches[0] : e;
      if (!p) return;
      tx = p.clientX;
      ty = p.clientY;
    }
    function frame() {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      if (el) el.style.transform = `translate(${cx - 220}px, ${cy - 220}px)`;
      raf = requestAnimationFrame(frame);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const surface = canvas;
    const brush = ctx;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    type Shooter = { x: number; y: number; dx: number; dy: number; len: number; alpha: number; decay: number };
    let shooters: Shooter[] = [];
    let raf = 0;

    function resize() {
      surface.width = window.innerWidth;
      surface.height = window.innerHeight;
    }
    function spawn() {
      const angle = Math.PI / 5 + Math.random() * (Math.PI / 8);
      const speed = 6 + Math.random() * 5;
      shooters.push({
        x: Math.random() * surface.width,
        y: Math.random() * surface.height * 0.4,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        len: 60 + Math.random() * 70,
        alpha: 0.85,
        decay: 0.012 + Math.random() * 0.008,
      });
    }
    function draw() {
      brush.clearRect(0, 0, surface.width, surface.height);
      if (!prefersReduced) {
        if (Math.random() < 0.008 && shooters.length < 2) spawn();
        shooters = shooters.filter((s) => s.alpha > 0.02);
        for (const s of shooters) {
          const grad = brush.createLinearGradient(s.x - s.dx * (s.len / 8), s.y - s.dy * (s.len / 8), s.x, s.y);
          grad.addColorStop(0, "rgba(92,239,255,0)");
          grad.addColorStop(0.6, `rgba(155,123,255,${s.alpha * 0.55})`);
          grad.addColorStop(1, `rgba(246,239,228,${s.alpha})`);
          brush.beginPath();
          brush.moveTo(s.x - s.dx * (s.len / 8), s.y - s.dy * (s.len / 8));
          brush.lineTo(s.x, s.y);
          brush.strokeStyle = grad;
          brush.lineWidth = 1.4;
          brush.stroke();
          s.x += s.dx;
          s.y += s.dy;
          s.alpha -= s.decay;
        }
      }
      raf = requestAnimationFrame(draw);
    }
    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="animate-drift absolute -left-1/4 -top-1/4 h-[70%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(155,123,255,0.28),transparent_64%)] blur-3xl" />
      <div className="animate-drift absolute -right-1/5 top-1/4 h-[60%] w-[60%] rounded-full bg-[radial-gradient(circle,rgba(92,239,255,0.18),transparent_62%)] blur-3xl [animation-delay:-7s]" />
      <div className="animate-drift absolute bottom-[-10%] left-1/4 h-[50%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(255,90,168,0.16),transparent_60%)] blur-3xl [animation-delay:-12s]" />
      <div className="orig-pointer-glow" ref={glowRef} />
      <div className="orig-graph-grid" />
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
