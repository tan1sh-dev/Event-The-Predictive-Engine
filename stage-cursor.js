const TEAL_PALETTE = ["#4abeb6", "#407e8c", "#5cc4bc", "#356b78", "#1f3d4d", "#dff5f3"];
const TEAL_RIPPLES = [
  [74, 190, 182],
  [64, 126, 140],
  [31, 61, 77],
];

function initStageCursor() {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  if (!finePointer.matches || mediaQuery.matches) return;

  const style = document.createElement("style");
  style.textContent = `
    html, body, button, a, input, select, textarea, [role="button"], label, .btn {
      cursor: none !important;
    }
    .stage-cursor-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99999;
    }
    .stage-cursor-trail {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
    }
    .stage-glow-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 32px;
      height: 32px;
      margin-left: -16px;
      margin-top: -16px;
      opacity: 0;
      transform: scale(0.92);
      transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease;
      will-change: transform, left, top, opacity;
    }
    .stage-glow-cursor.is-visible { opacity: 1; transform: scale(1); }
    .stage-glow-cursor.is-down { transform: scale(0.88); }
    .stage-glow-orb {
      position: relative;
      width: 100%;
      height: 100%;
    }
    .stage-glow-halo {
      position: absolute;
      inset: -45%;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        rgba(74, 190, 182, 0.58) 0%,
        rgba(64, 126, 140, 0.32) 38%,
        rgba(31, 61, 77, 0.14) 58%,
        transparent 74%
      );
      filter: blur(7px);
      animation: stageTealGlowPulse 3.2s ease-in-out infinite;
    }
    .stage-glow-core {
      position: absolute;
      inset: 16%;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 38%, #4abeb6 0%, #407e8c 54%, #1f3d4d 100%);
      box-shadow:
        0 0 14px rgba(74, 190, 182, 0.9),
        0 0 28px rgba(64, 126, 140, 0.5),
        0 0 44px rgba(74, 190, 182, 0.22);
    }
    @keyframes stageTealGlowPulse {
      0%, 100% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.1); }
    }
    @media (prefers-reduced-motion: reduce) {
      html, body, button, a, input, * { cursor: auto !important; }
      .stage-cursor-root { display: none !important; }
      .stage-glow-halo { animation: none !important; }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.className = "stage-cursor-root";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <canvas class="stage-cursor-trail"></canvas>
    <div class="stage-glow-cursor">
      <div class="stage-glow-orb">
        <span class="stage-glow-halo"></span>
        <span class="stage-glow-core"></span>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const canvas = root.querySelector(".stage-cursor-trail");
  const glow = root.querySelector(".stage-glow-cursor");
  const ctx = canvas.getContext("2d");
  let particles = [];
  let rafId = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  function place(x, y) {
    glow.style.left = `${x}px`;
    glow.style.top = `${y}px`;
  }

  function spawnParticles(x, y, count = 1) {
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
        color: TEAL_PALETTE[Math.floor(Math.random() * TEAL_PALETTE.length)],
        life: 0,
        maxLife: 30 + Math.floor(Math.random() * 25),
        twinkleSpeed: 0.15 + Math.random() * 0.25,
        twinklePhase: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.08,
      });
    }
  }

  function onMouseMove(e) {
    glow.classList.add("is-visible");
    place(e.clientX, e.clientY);
    spawnParticles(e.clientX, e.clientY, Math.random() < 0.65 ? 2 : 1);
  }

  function onMouseDown() {
    glow.classList.add("is-down");
  }

  function onMouseUp() {
    glow.classList.remove("is-down");
  }

  function onMouseLeave() {
    glow.classList.remove("is-visible");
  }

  function onMouseEnter() {
    glow.classList.add("is-visible");
  }

  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mouseleave", onMouseLeave);
  document.addEventListener("mouseenter", onMouseEnter);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.r * 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -p.r);
      ctx.quadraticCurveTo(0, 0, p.r, 0);
      ctx.quadraticCurveTo(0, 0, 0, p.r);
      ctx.quadraticCurveTo(0, 0, -p.r, 0);
      ctx.quadraticCurveTo(0, 0, 0, -p.r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.4, p.r * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    rafId = requestAnimationFrame(draw);
  }
  rafId = requestAnimationFrame(draw);

  mediaQuery.addEventListener("change", (e) => {
    if (e.matches) {
      particles = [];
      glow.classList.remove("is-visible", "is-down");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(rafId);
      root.remove();
      style.remove();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initStageCursor);
} else {
  initStageCursor();
}
