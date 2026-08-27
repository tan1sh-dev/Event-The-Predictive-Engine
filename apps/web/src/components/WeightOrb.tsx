import { useEffect, useRef, type CSSProperties } from "react";

const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform float uTime;
uniform float uVisual;
uniform float uPulse;
uniform vec2 uRes;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(uv);
  float sphereR = 0.30;
  float t = uTime;

  vec3 cyan = vec3(0.361, 0.937, 1.0);
  vec3 violet = vec3(0.608, 0.482, 1.0);
  vec3 magenta = vec3(1.0, 0.353, 0.659);
  vec3 cream = vec3(0.965, 0.937, 0.894);
  vec3 deep = vec3(0.055, 0.028, 0.13);

  float d = max(r - sphereR, 0.0);
  float glow = exp(-d * 11.5) * (0.46 + 0.38 * uVisual);
  glow *= 0.88 + 0.12 * sin(t * 1.5);
  float bloom = exp(-d * 5.8) * (0.22 + 0.16 * uVisual);
  float wash = exp(-d * 3.6) * 0.1;

  vec3 col = cyan * glow + violet * bloom + magenta * wash;
  float alpha = clamp(glow * 0.9 + bloom * 0.7 + wash * 0.45, 0.0, 0.88);

  if (r < sphereR + 0.012) {
    float z = sqrt(max(sphereR * sphereR - r * r, 0.0));
    vec3 N = normalize(vec3(uv, z));
    vec2 p = uv / sphereR;

    float ang = t * 0.28;
    float ca = cos(ang);
    float sa = sin(ang);
    vec2 pr = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);

    vec2 q = pr * 2.15;
    q += 0.45 * vec2(fbm(pr * 1.6 + t * 0.12), fbm(pr * 1.6 + 4.0 - t * 0.1));
    float n = fbm(q);
    float n2 = fbm(pr * 3.2 - t * 0.18 + q * 0.4);

    vec3 plasma = mix(deep, violet, smoothstep(0.15, 0.5, n));
    plasma = mix(plasma, cyan, smoothstep(0.42, 0.72, n));
    plasma = mix(plasma, magenta, smoothstep(0.55, 0.9, n2) * 0.75);
    plasma = mix(plasma, cream, pow(smoothstep(0.62, 1.0, n), 2.0) * 0.55);
    plasma = mix(plasma, vec3(1.0, 0.827, 0.416), uVisual * n * 0.14);

    float filaments = smoothstep(0.38, 0.52, n2) * (1.0 - smoothstep(0.52, 0.7, n2));
    plasma += cyan * filaments * 0.55;

    float core = exp(-dot(p, p) * 6.4) * (0.55 + 0.55 * uVisual);
    core *= mix(0.78, 1.0, uPulse) * (0.72 + 0.28 * sin(t * 2.1));
    plasma += cream * core * 1.05 + cyan * core * 0.55;

    vec3 L = normalize(vec3(-0.48, 0.62, 0.58));
    vec3 L2 = normalize(vec3(0.55, -0.25, 0.35));
    float diff = 0.38 + 0.62 * max(dot(N, L), 0.0);
    float fill = 0.28 * max(dot(N, L2), 0.0);
    float fres = pow(1.0 - max(N.z, 0.0), 2.35);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(N, H), 0.0), 44.0);
    float specBroad = pow(max(dot(N, H), 0.0), 7.0);

    vec2 spUv = pr * 22.0;
    vec2 spId = floor(spUv);
    vec2 spF = fract(spUv) - 0.5;
    float sparkN = hash(spId + floor(t * 2.5));
    float spark = smoothstep(0.22, 0.0, length(spF)) * step(0.955, sparkN);
    plasma += cream * spark * 0.85 * (1.0 - length(p) * 0.45);

    vec3 lit = plasma * (diff + fill);
    lit += cream * spec * 0.95;
    lit += cyan * specBroad * 0.18;
    lit += mix(cyan, violet, 0.35) * fres * 0.9;
    lit *= mix(0.62, 1.0, 0.55 + 0.45 * N.z);

    float edge = smoothstep(sphereR + 0.004, sphereR - 0.006, r);
    col = mix(col, lit, edge);
    alpha = max(alpha, edge);
  }

  float rim = smoothstep(0.014, 0.0, abs(r - sphereR));
  col += mix(cyan, cream, 0.35) * rim * 0.85;
  alpha = max(alpha, rim * 0.9);

  float a = clamp(alpha, 0.0, 1.0);
  /* Premultiplied so Safari/iOS composites without a dark square. */
  gl_FragColor = vec4(col * a, a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function startOrbGL(
  canvas: HTMLCanvasElement,
  getVisual: () => number,
  getPulse: () => boolean,
  reduced: boolean,
) {
  const attrs: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  };
  const glOrNull = canvas.getContext("webgl", attrs);
  if (!glOrNull) return null;
  const gl: WebGLRenderingContext = glOrNull;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }

  const buf = gl.createBuffer();
  if (!buf) {
    gl.deleteProgram(program);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, "uTime");
  const uVisual = gl.getUniformLocation(program, "uVisual");
  const uPulse = gl.getUniformLocation(program, "uPulse");
  const uRes = gl.getUniformLocation(program, "uRes");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(program);

  let raf = 0;
  let stopped = false;
  const t0 = performance.now();
  const frozenT = 1.4;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  function draw(now: number) {
    if (stopped) return;
    resize();
    const t = reduced ? frozenT : (now - t0) / 1000;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, t);
    gl.uniform1f(uVisual, getVisual());
    gl.uniform1f(uPulse, getPulse() ? 1 : 0);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduced && !document.hidden) raf = requestAnimationFrame(draw);
  }

  function onVis() {
    if (stopped || reduced) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(draw);
  }

  document.addEventListener("visibilitychange", onVis);
  draw(performance.now());

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVis);
    cancelAnimationFrame(raf);
    gl.deleteBuffer(buf);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  };
}

const MOTES = [0, 1, 2, 3, 4, 5, 6];

export default function WeightOrb({
  visual,
  weight,
  pulse = false,
  fromWeight = null,
}: {
  visual: number;
  weight: number;
  pulse?: boolean;
  /** Weight at the start of the round. Shown as `from → to` under the orb. */
  fromWeight?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualRef = useRef(visual);
  const pulseRef = useRef(pulse);
  visualRef.current = visual;
  pulseRef.current = pulse;

  const scale = 0.82 + Math.max(0, Math.min(1, visual)) * 0.38;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = startOrbGL(
      canvas,
      () => visualRef.current,
      () => pulseRef.current,
      reduced,
    );
    if (stop) wrap.classList.add("has-gl");
    return () => {
      stop?.();
      wrap.classList.remove("has-gl");
    };
  }, []);

  return (
    <div className="weight-orb-block">
      <div className="weight-orb-stage">
        <div
          className="weight-orb"
          role="img"
          aria-label={`Node weight ${weight.toFixed(2)}`}
          style={{ "--orb-scale": scale, "--orb-visual": visual } as CSSProperties}
        >
          <div className="weight-orb-aura-wrap" aria-hidden>
            <div className="weight-orb-aura" />
            <div className="weight-orb-aura weight-orb-aura-b" />
          </div>
          {pulse && (
            <>
              <span className="weight-orb-sonar" aria-hidden />
              <span className="weight-orb-sonar weight-orb-sonar-b" aria-hidden />
            </>
          )}
          <svg className="weight-orb-ring weight-orb-ring-back" viewBox="0 0 200 200" aria-hidden>
            <ellipse cx="100" cy="100" rx="72" ry="22" fill="none" stroke="rgba(92,239,255,0.38)" strokeWidth="1.2" />
            <ellipse
              className="weight-orb-ring-dash"
              cx="100"
              cy="100"
              rx="64"
              ry="18"
              fill="none"
              stroke="rgba(155,123,255,0.42)"
              strokeWidth="1"
              strokeDasharray="2.5 6"
            />
          </svg>
          <div className="weight-orb-css" aria-hidden>
            <span className="weight-orb-css-swirl" />
            <span className="weight-orb-css-swirl weight-orb-css-swirl-b" />
            <span className="weight-orb-css-core" />
            <span className="weight-orb-css-spec" />
            <span className="weight-orb-css-rim" />
          </div>
          <canvas ref={canvasRef} className="weight-orb-canvas" />
          <svg className="weight-orb-ring weight-orb-ring-front" viewBox="0 0 200 200" aria-hidden>
            <defs>
              <clipPath id="weight-orb-ring-clip">
                <rect x="0" y="100" width="200" height="100" />
              </clipPath>
            </defs>
            <g clipPath="url(#weight-orb-ring-clip)">
              <ellipse cx="100" cy="100" rx="72" ry="22" fill="none" stroke="rgba(92,239,255,0.82)" strokeWidth="1.45" />
              <ellipse
                className="weight-orb-ring-dash"
                cx="100"
                cy="100"
                rx="64"
                ry="18"
                fill="none"
                stroke="rgba(246,239,228,0.42)"
                strokeWidth="1"
                strokeDasharray="2.5 6"
              />
            </g>
          </svg>
          <div className="weight-orb-motes" aria-hidden>
            {MOTES.map((i) => (
              <span key={i} style={{ "--i": i } as CSSProperties} />
            ))}
          </div>
        </div>
      </div>
      <div className="weight-orb-readout">
        <p className="weight-orb-value font-display text-4xl font-bold tabular-nums">{weight.toFixed(2)}</p>
        <p className="weight-orb-label">Node weight</p>
        {fromWeight != null && (
          <p className="weight-update-delta">
            {fromWeight.toFixed(2)} → {weight.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
