import { useEffect, useRef, useState } from "react";

type Kind = "star" | "spark" | "comet" | "ember";

interface Particle {
  kind: Kind;
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
  width: number;
}

interface Bloom {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  r: number;
  color: string;
}

interface Glyph {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  spin: number;
  hue: "cyan" | "violet" | "magenta";
}

interface Arc {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Finger {
  x: number;
  y: number;
  px: number;
  py: number;
  held: number;
  orbitPhase: number;
}

const PALETTE = ["#5cefff", "#7dffb0", "#ff5aa8", "#ffd36a", "#9b7bff", "#f6efe4"];
const RIPPLE_HUES: Ripple["hue"][] = ["cyan", "violet", "magenta"];
const MAX_PARTICLES = 220;

function TouchReticle() {
  return (
    <svg viewBox="0 0 72 72" className="orig-touch-svg" aria-hidden>
      <circle cx="36" cy="36" r="30" fill="none" stroke="#5cefff" strokeWidth="1" strokeOpacity="0.28" className="orig-touch-orbit" />
      <circle cx="36" cy="36" r="20" fill="none" stroke="#9b7bff" strokeWidth="1.15" strokeOpacity="0.5" strokeDasharray="4 6" className="orig-touch-orbit orig-touch-orbit-b" />
      <circle cx="36" cy="36" r="8" fill="#5cefff" fillOpacity="0.22" stroke="#5cefff" strokeWidth="1.2" className="orig-touch-core" />
      <circle cx="36" cy="36" r="2.4" fill="#fff" />
      <path d="M36 8 V16 M36 56 V64 M8 36 H16 M56 36 H64" stroke="#f6efe4" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function hueRgb(hue: Ripple["hue"], a: number) {
  if (hue === "cyan") return `rgba(92, 239, 255, ${a})`;
  if (hue === "violet") return `rgba(155, 123, 255, ${a})`;
  return `rgba(255, 90, 168, ${a})`;
}

function tapHaptic(kind: "tap" | "nova" | "release") {
  try {
    if (!navigator.vibrate) return;
    if (kind === "tap") navigator.vibrate(9);
    else if (kind === "nova") navigator.vibrate([12, 28, 16]);
    else navigator.vibrate(5);
  } catch {
    /* ignore */
  }
}

/** Touch-only FX for the mobile play screen. */
export default function SparkleCursor() {
  const touchRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [touchActive, setTouchActive] = useState(false);
  const [touchDown, setTouchDown] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touchEl = touchRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !touchEl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const surface = canvas;
    const brush = ctx;
    const reticle = touchEl;

    let rafId = 0;
    let particles: Particle[] = [];
    let ripples: Ripple[] = [];
    let blooms: Bloom[] = [];
    let glyphs: Glyph[] = [];
    let arcs: Arc[] = [];
    let isReduced = mediaQuery.matches;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTapAt = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    const fingers = new Map<number, Finger>();

    const handleMediaChange = (e: MediaQueryListEvent) => {
      isReduced = e.matches;
      if (isReduced) {
        particles = [];
        ripples = [];
        blooms = [];
        glyphs = [];
        arcs = [];
        fingers.clear();
        setTouchActive(false);
        brush.setTransform(1, 0, 0, 1, 0, 0);
        brush.clearRect(0, 0, surface.width, surface.height);
      }
    };
    mediaQuery.addEventListener("change", handleMediaChange);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.floor(window.innerWidth * dpr);
      surface.height = Math.floor(window.innerHeight * dpr);
      surface.style.width = `${window.innerWidth}px`;
      surface.style.height = `${window.innerHeight}px`;
      brush.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function place(x: number, y: number) {
      reticle.style.left = `${x}px`;
      reticle.style.top = `${y}px`;
    }

    function spawnParticles(x: number, y: number, count: number, kind: Kind, speedMin: number, speedMax: number) {
      if (isReduced) return;
      for (let i = 0; i < count; i++) {
        if (particles.length >= MAX_PARTICLES) return;
        const angle = Math.random() * Math.PI * 2;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        particles.push({
          kind,
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - (kind === "ember" ? 0.9 : 0.15),
          gravity: kind === "ember" ? -0.04 : kind === "comet" ? 0.01 : 0.035,
          r: kind === "star" ? 2.2 + Math.random() * 2.4 : 1 + Math.random() * 1.8,
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          life: 0,
          maxLife: (kind === "ember" ? 42 : 26) + Math.floor(Math.random() * 22),
          twinkleSpeed: 0.18 + Math.random() * 0.28,
          twinklePhase: Math.random() * Math.PI * 2,
          rotation: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 0.16,
        });
      }
    }

    function spawnRipple(x: number, y: number, extra = false) {
      if (isReduced) return;
      ripples.push({
        x,
        y,
        r: 6,
        maxR: (extra ? 90 : 54) + Math.random() * 24,
        life: 0,
        maxLife: (extra ? 48 : 34) + Math.floor(Math.random() * 10),
        hue: RIPPLE_HUES[Math.floor(Math.random() * RIPPLE_HUES.length)],
        width: extra ? 2.6 : 1.8,
      });
    }

    function spawnBloom(x: number, y: number, nova: boolean) {
      if (isReduced) return;
      blooms.push({
        x,
        y,
        life: 0,
        maxLife: nova ? 28 : 18,
        r: nova ? 78 : 42,
        color: nova ? "#9b7bff" : "#5cefff",
      });
    }

    function spawnGlyph(x: number, y: number) {
      if (isReduced) return;
      glyphs.push({
        x,
        y,
        life: 0,
        maxLife: 36,
        spin: Math.random() * Math.PI,
        hue: RIPPLE_HUES[Math.floor(Math.random() * RIPPLE_HUES.length)],
      });
    }

    function spawnArcs(x: number, y: number) {
      if (isReduced) return;
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const a1 = Math.random() * Math.PI * 2;
        const a2 = a1 + 0.7 + Math.random() * 1.4;
        const r1 = 10 + Math.random() * 16;
        const r2 = 18 + Math.random() * 28;
        arcs.push({
          ax: x + Math.cos(a1) * r1,
          ay: y + Math.sin(a1) * r1,
          bx: x + Math.cos(a2) * r2,
          by: y + Math.sin(a2) * r2,
          life: 0,
          maxLife: 12 + Math.floor(Math.random() * 8),
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        });
      }
    }

    function burst(x: number, y: number, nova: boolean) {
      spawnBloom(x, y, nova);
      spawnRipple(x, y, nova);
      spawnRipple(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, false);
      spawnGlyph(x, y);
      spawnArcs(x, y);
      spawnParticles(x, y, nova ? 18 : 10, "star", 1.2, 4.2);
      spawnParticles(x, y, nova ? 14 : 8, "spark", 0.6, 2.4);
      spawnParticles(x, y, nova ? 8 : 4, "ember", 0.2, 1.1);
    }

    function trail(x: number, y: number, dx: number, dy: number) {
      const speed = Math.hypot(dx, dy);
      if (speed < 0.6) {
        spawnParticles(x, y, 1, "spark", 0.15, 0.6);
        return;
      }
      spawnParticles(x, y, speed > 12 ? 3 : 2, "comet", 0.4, 1.8);
      if (Math.random() < 0.35) spawnParticles(x, y, 1, "star", 0.3, 1.2);
    }

    function scheduleHide() {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (fingers.size === 0) {
          setTouchActive(false);
          setTouchDown(false);
        }
      }, 420);
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse") return;
      if (isReduced) return;
      const x = e.clientX;
      const y = e.clientY;
      const now = performance.now();
      const isNova = now - lastTapAt < 280 && Math.hypot(x - lastTapX, y - lastTapY) < 52;
      lastTapAt = now;
      lastTapX = x;
      lastTapY = y;

      fingers.set(e.pointerId, { x, y, px: x, py: y, held: 0, orbitPhase: Math.random() * Math.PI * 2 });
      setTouchActive(true);
      setTouchDown(true);
      place(x, y);
      burst(x, y, isNova);
      tapHaptic(isNova ? "nova" : "tap");
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType === "mouse") return;
      const finger = fingers.get(e.pointerId);
      if (!finger || isReduced) return;
      const x = e.clientX;
      const y = e.clientY;
      trail(x, y, x - finger.px, y - finger.py);
      finger.px = finger.x;
      finger.py = finger.y;
      finger.x = x;
      finger.y = y;
      setTouchDown(true);
      setTouchActive(true);
      place(x, y);
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerType === "mouse") return;
      const finger = fingers.get(e.pointerId);
      fingers.delete(e.pointerId);
      if (finger && !isReduced) {
        spawnParticles(finger.x, finger.y, 8, "star", 1.4, 3.6);
        spawnRipple(finger.x, finger.y, false);
        tapHaptic("release");
      }
      if (fingers.size === 0) {
        setTouchDown(false);
        scheduleHide();
      }
    }

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });

    function drawStar(x: number, y: number, r: number, rot: number) {
      brush.save();
      brush.translate(x, y);
      brush.rotate(rot);
      brush.beginPath();
      brush.moveTo(0, -r);
      brush.quadraticCurveTo(0, 0, r, 0);
      brush.quadraticCurveTo(0, 0, 0, r);
      brush.quadraticCurveTo(0, 0, -r, 0);
      brush.quadraticCurveTo(0, 0, 0, -r);
      brush.closePath();
      brush.fill();
      brush.restore();
    }

    function drawHex(x: number, y: number, r: number) {
      brush.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) brush.moveTo(px, py);
        else brush.lineTo(px, py);
      }
      brush.closePath();
    }

    function draw() {
      brush.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (isReduced) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      for (const finger of fingers.values()) {
        finger.held += 1;
        finger.orbitPhase += 0.08;
        if (finger.held === 28) {
          spawnRipple(finger.x, finger.y, true);
          spawnGlyph(finger.x, finger.y);
        }
        const orbiters = 5;
        for (let i = 0; i < orbiters; i++) {
          const a = finger.orbitPhase + (i / orbiters) * Math.PI * 2;
          const rad = 16 + Math.sin(finger.held * 0.12 + i) * 4;
          const ox = finger.x + Math.cos(a) * rad;
          const oy = finger.y + Math.sin(a) * rad;
          if (finger.held % 2 === 0 && particles.length < MAX_PARTICLES) {
            particles.push({
              kind: "spark",
              x: ox,
              y: oy,
              vx: -Math.sin(a) * 0.4,
              vy: Math.cos(a) * 0.4,
              gravity: 0,
              r: 1.1,
              color: PALETTE[i % PALETTE.length],
              life: 0,
              maxLife: 16,
              twinkleSpeed: 0.4,
              twinklePhase: 0,
              rotation: a,
              vRot: 0.1,
            });
          }
        }
      }

      blooms = blooms.filter((b) => b.life < b.maxLife);
      for (const b of blooms) {
        b.life++;
        const t = b.life / b.maxLife;
        const a = Math.max(0, (1 - t) * 0.38);
        const rad = b.r * (0.35 + t * 0.75);
        const g = brush.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
        const rgb = b.color === "#9b7bff" ? "155, 123, 255" : "92, 239, 255";
        g.addColorStop(0, `rgba(${rgb}, ${a})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        brush.fillStyle = g;
        brush.beginPath();
        brush.arc(b.x, b.y, rad, 0, Math.PI * 2);
        brush.fill();
      }

      ripples = ripples.filter((r) => r.life < r.maxLife);
      for (const r of ripples) {
        r.life++;
        const t = r.life / r.maxLife;
        r.r = 8 + (r.maxR - 8) * t;
        const alpha = Math.max(0, 1 - t) * 0.58;
        brush.beginPath();
        brush.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        brush.strokeStyle = hueRgb(r.hue, alpha);
        brush.lineWidth = r.width;
        brush.stroke();
        brush.beginPath();
        brush.arc(r.x, r.y, r.r * 0.68, 0, Math.PI * 2);
        brush.strokeStyle = hueRgb(r.hue, alpha * 0.4);
        brush.lineWidth = 1;
        brush.stroke();
      }

      glyphs = glyphs.filter((g) => g.life < g.maxLife);
      for (const g of glyphs) {
        g.life++;
        g.spin += 0.05;
        const t = g.life / g.maxLife;
        const alpha = Math.max(0, 1 - t) * 0.7;
        const r = 12 + t * 22;
        brush.save();
        brush.translate(g.x, g.y);
        brush.rotate(g.spin);
        brush.strokeStyle = hueRgb(g.hue, alpha);
        brush.lineWidth = 1.3;
        drawHex(0, 0, r);
        brush.stroke();
        brush.strokeStyle = hueRgb(g.hue, alpha * 0.5);
        brush.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          brush.beginPath();
          brush.moveTo(Math.cos(a) * (r + 2), Math.sin(a) * (r + 2));
          brush.lineTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7));
          brush.stroke();
        }
        brush.restore();
      }

      arcs = arcs.filter((a) => a.life < a.maxLife);
      for (const a of arcs) {
        a.life++;
        const t = a.life / a.maxLife;
        brush.beginPath();
        brush.moveTo(a.ax, a.ay);
        const mx = (a.ax + a.bx) / 2 + Math.sin(t * 8) * 6;
        const my = (a.ay + a.by) / 2 + Math.cos(t * 7) * 6;
        brush.quadraticCurveTo(mx, my, a.bx, a.by);
        brush.strokeStyle = a.color;
        brush.globalAlpha = Math.max(0, 1 - t) * 0.75;
        brush.lineWidth = 1.4;
        brush.stroke();
        brush.globalAlpha = 1;
      }

      particles = particles.filter((p) => p.life < p.maxLife);
      for (const p of particles) {
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= p.kind === "comet" ? 0.94 : 0.985;
        p.rotation += p.vRot;
        const progress = p.life / p.maxLife;
        const alpha =
          Math.max(0, 1 - progress) *
          (0.6 + 0.4 * Math.sin(p.life * p.twinkleSpeed + p.twinklePhase));
        if (alpha <= 0.01) continue;
        brush.globalAlpha = Math.min(1, alpha);
        brush.fillStyle = p.color;
        brush.shadowColor = p.color;
        brush.shadowBlur = p.r * 2.8;
        if (p.kind === "comet") {
          brush.save();
          brush.translate(p.x, p.y);
          brush.rotate(Math.atan2(p.vy, p.vx));
          brush.beginPath();
          brush.ellipse(0, 0, p.r * 2.4, p.r * 0.55, 0, 0, Math.PI * 2);
          brush.fill();
          brush.restore();
        } else if (p.kind === "star") {
          drawStar(p.x, p.y, p.r, p.rotation);
          brush.fillStyle = "#FFFFFF";
          brush.shadowBlur = 0;
          brush.beginPath();
          brush.arc(p.x, p.y, Math.max(0.35, p.r * 0.26), 0, Math.PI * 2);
          brush.fill();
        } else {
          brush.beginPath();
          brush.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          brush.fill();
        }
        brush.shadowBlur = 0;
        brush.globalAlpha = 1;
      }

      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      mediaQuery.removeEventListener("change", handleMediaChange);
      if (hideTimer) clearTimeout(hideTimer);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="sparkle-cursor-container" aria-hidden="true">
      <canvas ref={canvasRef} className="sparkle-trail-canvas" />
      <div
        ref={touchRef}
        className={`orig-touch-probe ${touchDown ? "is-pressed" : ""} ${touchActive ? "is-visible" : ""}`}
      >
        <TouchReticle />
      </div>
    </div>
  );
}
