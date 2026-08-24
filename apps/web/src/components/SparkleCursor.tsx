import { useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
  twinkleSpeed: number;
  twinklePhase: number;
  rotation: number;
  vRot: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  hue: "cyan" | "violet" | "magenta";
}

const PALETTE = ["#5cefff", "#7dffb0", "#ff5aa8", "#ffd36a", "#9b7bff", "#f6efe4"];
const RIPPLE_HUES: Ripple["hue"][] = ["cyan", "violet", "magenta"];

function GalaxyCursorSvg() {
  return (
    <svg viewBox="0 0 48 48" className="orig-galaxy-svg" aria-hidden>
      <defs>
        <radialGradient id="galaxyCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="35%" stopColor="#ffd36a" />
          <stop offset="100%" stopColor="#5cefff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="galaxyHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9b7bff" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#5cefff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ff5aa8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="armGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5cefff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ff5aa8" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#galaxyHalo)" className="orig-galaxy-halo" />
      <ellipse
        cx="24"
        cy="24"
        rx="18"
        ry="7"
        fill="none"
        stroke="url(#armGrad)"
        strokeWidth="1.1"
        strokeDasharray="3 5"
        className="orig-galaxy-orbit orig-galaxy-orbit-a"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="14"
        ry="14"
        fill="none"
        stroke="#9b7bff"
        strokeWidth="0.9"
        strokeOpacity="0.75"
        className="orig-galaxy-orbit orig-galaxy-orbit-b"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="10"
        ry="16"
        fill="none"
        stroke="#5cefff"
        strokeWidth="1"
        strokeOpacity="0.85"
        className="orig-galaxy-orbit orig-galaxy-orbit-c"
      />
      <path
        d="M24 24 C18 14, 30 10, 34 18 C38 26, 30 34, 24 24 C20 30, 12 28, 10 20"
        fill="none"
        stroke="url(#armGrad)"
        strokeWidth="1.2"
        strokeLinecap="round"
        className="orig-galaxy-arm"
      />
      <circle cx="24" cy="24" r="4.2" fill="url(#galaxyCore)" />
      <circle cx="38" cy="20" r="1.6" fill="#5cefff" className="orig-galaxy-sat orig-galaxy-sat-a" />
      <circle cx="14" cy="32" r="1.3" fill="#ff5aa8" className="orig-galaxy-sat orig-galaxy-sat-b" />
      <circle cx="30" cy="34" r="1.1" fill="#ffd36a" className="orig-galaxy-sat orig-galaxy-sat-c" />
    </svg>
  );
}

function TouchProbeSvg() {
  return (
    <svg viewBox="0 0 56 56" className="orig-touch-svg" aria-hidden>
      <circle cx="28" cy="28" r="24" fill="none" stroke="#5cefff" strokeWidth="1" strokeOpacity="0.35" className="orig-touch-orbit" />
      <circle cx="28" cy="28" r="16" fill="none" stroke="#9b7bff" strokeWidth="1.2" strokeOpacity="0.55" className="orig-touch-orbit orig-touch-orbit-b" />
      <circle cx="28" cy="28" r="7" fill="#5cefff" className="orig-touch-core" />
      <circle cx="28" cy="28" r="2.5" fill="#fff" opacity="0.95" />
    </svg>
  );
}

export default function SparkleCursor({ theme: _theme = "cosmic" }: { theme?: "cosmic" | "teal" }) {
  const galaxyRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [galaxyVisible, setGalaxyVisible] = useState(false);
  const [galaxyDown, setGalaxyDown] = useState(false);
  const [touchActive, setTouchActive] = useState(false);
  const [touchDown, setTouchDown] = useState(false);
  const [inputMode, setInputMode] = useState<"mouse" | "touch">("mouse");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const galaxyEl = galaxyRef.current;
    const touchEl = touchRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !galaxyEl || !touchEl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const surface: HTMLCanvasElement = canvas;
    const brush: CanvasRenderingContext2D = ctx;
    const galaxy: HTMLDivElement = galaxyEl;
    const touch: HTMLDivElement = touchEl;

    let rafId = 0;
    let particles: Particle[] = [];
    let ripples: Ripple[] = [];
    let isReduced = mediaQuery.matches;
    let touchHideTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMediaChange = (e: MediaQueryListEvent) => {
      isReduced = e.matches;
      if (isReduced) {
        particles = [];
        ripples = [];
        setGalaxyVisible(false);
        setTouchActive(false);
        brush.clearRect(0, 0, surface.width, surface.height);
      }
    };
    mediaQuery.addEventListener("change", handleMediaChange);

    function resize() {
      surface.width = window.innerWidth;
      surface.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function place(el: HTMLDivElement, x: number, y: number) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }

    function spawnParticles(x: number, y: number, count = 1) {
      if (isReduced) return;
      if (particles.length > 120) return;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.3 + Math.random() * 1.2;
        particles.push({
          x: x + (Math.random() - 0.5) * 4,
          y: y + (Math.random() - 0.5) * 4,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.2,
          gravity: 0.03,
          r: 1.2 + Math.random() * 2,
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          life: 0,
          maxLife: 30 + Math.floor(Math.random() * 25),
          twinkleSpeed: 0.15 + Math.random() * 0.25,
          twinklePhase: Math.random() * Math.PI * 2,
          rotation: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 0.08,
        });
      }
    }

    function spawnRipple(x: number, y: number) {
      if (isReduced) return;
      ripples.push({
        x,
        y,
        r: 8,
        maxR: 52 + Math.random() * 18,
        life: 0,
        maxLife: 38 + Math.floor(Math.random() * 12),
        hue: RIPPLE_HUES[Math.floor(Math.random() * RIPPLE_HUES.length)],
      });
    }

    function scheduleTouchHide() {
      if (touchHideTimer) clearTimeout(touchHideTimer);
      touchHideTimer = setTimeout(() => {
        setTouchActive(false);
        setTouchDown(false);
      }, 480);
    }

    function onMouseMove(e: MouseEvent) {
      if (isReduced) return;
      setInputMode("mouse");
      setGalaxyVisible(true);
      place(galaxy, e.clientX, e.clientY);
      spawnParticles(e.clientX, e.clientY, Math.random() < 0.65 ? 2 : 1);
    }

    function onMouseDown() {
      if (!isReduced) setGalaxyDown(true);
    }
    function onMouseUp() {
      setGalaxyDown(false);
    }
    function onMouseLeave() {
      setGalaxyVisible(false);
    }
    function onMouseEnter() {
      if (!isReduced) setGalaxyVisible(true);
    }

    function handleTouch(x: number, y: number, pressed: boolean, isStart: boolean) {
      if (isReduced) return;
      setInputMode("touch");
      setGalaxyVisible(false);
      setTouchActive(true);
      setTouchDown(pressed);
      place(touch, x, y);
      spawnParticles(x, y, isStart ? 6 : 3);
      if (isStart) spawnRipple(x, y);
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      handleTouch(t.clientX, t.clientY, true, true);
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      handleTouch(t.clientX, t.clientY, true, false);
    }
    function onTouchEnd() {
      setTouchDown(false);
      scheduleTouchHide();
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    function rippleColor(hue: Ripple["hue"], alpha: number) {
      if (hue === "cyan") return `rgba(92, 239, 255, ${alpha})`;
      if (hue === "violet") return `rgba(155, 123, 255, ${alpha})`;
      return `rgba(255, 90, 168, ${alpha})`;
    }

    function draw() {
      brush.clearRect(0, 0, surface.width, surface.height);

      if (!isReduced) {
        ripples = ripples.filter((r) => r.life < r.maxLife);
        for (const r of ripples) {
          r.life++;
          const t = r.life / r.maxLife;
          r.r = 8 + (r.maxR - 8) * t;
          const alpha = Math.max(0, 1 - t) * 0.55;
          brush.beginPath();
          brush.arc(r.x, r.y, r.r, 0, Math.PI * 2);
          brush.strokeStyle = rippleColor(r.hue, alpha);
          brush.lineWidth = 2;
          brush.stroke();
          brush.beginPath();
          brush.arc(r.x, r.y, r.r * 0.72, 0, Math.PI * 2);
          brush.strokeStyle = rippleColor(r.hue, alpha * 0.45);
          brush.lineWidth = 1;
          brush.stroke();
        }

        particles = particles.filter((p) => p.life < p.maxLife);
        for (const p of particles) {
          p.life++;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.vx *= 0.98;
          p.rotation += p.vRot;
          const progress = p.life / p.maxLife;
          const alpha =
            Math.max(0, 1 - progress) *
            (0.65 + 0.35 * Math.sin(p.life * p.twinkleSpeed + p.twinklePhase));
          if (alpha <= 0.01) continue;
          brush.save();
          brush.translate(p.x, p.y);
          brush.rotate(p.rotation);
          brush.globalAlpha = Math.min(1, alpha);
          brush.fillStyle = p.color;
          brush.shadowColor = p.color;
          brush.shadowBlur = p.r * 2.5;
          brush.beginPath();
          brush.moveTo(0, -p.r);
          brush.quadraticCurveTo(0, 0, p.r, 0);
          brush.quadraticCurveTo(0, 0, 0, p.r);
          brush.quadraticCurveTo(0, 0, -p.r, 0);
          brush.quadraticCurveTo(0, 0, 0, -p.r);
          brush.closePath();
          brush.fill();
          brush.fillStyle = "#FFFFFF";
          brush.beginPath();
          brush.arc(0, 0, Math.max(0.4, p.r * 0.28), 0, Math.PI * 2);
          brush.fill();
          brush.restore();
        }
      }

      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
      mediaQuery.removeEventListener("change", handleMediaChange);
      if (touchHideTimer) clearTimeout(touchHideTimer);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className={`sparkle-cursor-container mode-${inputMode}`} aria-hidden="true">
      <canvas ref={canvasRef} className="sparkle-trail-canvas" />
      <div
        ref={galaxyRef}
        className={`orig-galaxy-cursor ${galaxyDown ? "is-down" : ""} ${galaxyVisible ? "is-visible" : ""}`}
      >
        <GalaxyCursorSvg />
      </div>
      <div
        ref={touchRef}
        className={`orig-touch-probe ${touchDown ? "is-pressed" : ""} ${touchActive ? "is-visible" : ""}`}
      >
        <TouchProbeSvg />
      </div>
    </div>
  );
}
