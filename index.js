import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------- Scene / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);
scene.fog = new THREE.FogExp2(0x0a0a0c, 0.012);

new THREE.TextureLoader().load('./assets/stage-bg.png', (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  scene.background = texture;
  scene.backgroundIntensity = 1.05;
});

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 9, 20);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const root = document.getElementById('root') ?? document.body;
root.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const clock = new THREE.Clock();

// ---------- Lighting ----------
const ambient = new THREE.AmbientLight(0x1a2340, 0.78);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0x6fd8ff, 1.4);
keyLight.position.set(10, 15, 10);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x39ff9d, 0.5);
fillLight.position.set(-8, 6, 8);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x3355ff, 0.55);
rimLight.position.set(-12, -6, -10);
scene.add(rimLight);

const hubLight = new THREE.PointLight(0x66e0ff, 24, 40, 2);
hubLight.position.set(0, 0, 0);
scene.add(hubLight);

// ---------- Starfield backdrop ----------
function createStarfield() {
  const count = 1800;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 60 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xa8c8ff,
    size: 0.34,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'starfield';
  return points;
}
const starfield = createStarfield();
scene.add(starfield);

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const glowTexture = createGlowTexture();

function createNumberTexture(number) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const text = String(number);
  const fontSize = text.length > 1 ? 220 : 280;
  ctx.font = `${fontSize}px "GFS Didot", Didot, "Bodoni MT", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = text.length > 1 ? '-0.04em' : '0';
  }

  ctx.fillStyle = '#0a0c10';
  ctx.fillText(text, size / 2, size / 2 + 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

try {
  await Promise.race([
    document.fonts.load('280px "GFS Didot"').then(() => document.fonts.ready),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
} catch {
  /* labels fall back to system serif if Didot is slow */
}

// ---------- Network group (idle float) ----------
const networkGroup = new THREE.Group();
networkGroup.name = 'networkGroup';
scene.add(networkGroup);

// ---------- Hub sphere ----------
const hubGeo = new THREE.IcosahedronGeometry(2.1, 4);
const hubMat = new THREE.MeshPhysicalMaterial({
  color: 0x0d1a2b,
  emissive: 0x2fd7ff,
  emissiveIntensity: 1.6,
  metalness: 0.45,
  roughness: 0.22,
  clearcoat: 0.85,
  clearcoatRoughness: 0.18,
  transparent: true,
  opacity: 0.96,
});
const hub = new THREE.Mesh(hubGeo, hubMat);
hub.name = 'hubSphere';
networkGroup.add(hub);

const hubWireGeo = new THREE.IcosahedronGeometry(2.28, 2);
const hubWireMat = new THREE.MeshBasicMaterial({
  color: 0x8be9ff,
  wireframe: true,
  transparent: true,
  opacity: 0.35,
});
const hubWire = new THREE.Mesh(hubWireGeo, hubWireMat);
hubWire.name = 'hubWireframe';
networkGroup.add(hubWire);

const hubRings = new THREE.Group();
hubRings.name = 'hubRings';
networkGroup.add(hubRings);

function makeHubRing(radius, color, tilt) {
  const geo = new THREE.TorusGeometry(radius, 0.016, 8, 160);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = tilt;
  return mesh;
}
const hubRingA = makeHubRing(3.05, 0x33e6ff, Math.PI / 2.12);
const hubRingB = makeHubRing(3.48, 0x39ff9d, Math.PI / 2.55);
const hubRingC = makeHubRing(2.62, 0x7aa8ff, Math.PI / 1.82);
hubRings.add(hubRingA, hubRingB, hubRingC);

const packetGroup = new THREE.Group();
packetGroup.name = 'packetGroup';
networkGroup.add(packetGroup);

// ---------- Clusters ----------
const CLUSTER_NAMES = [
  "Atlas", "Nova", "Helix", "Nexus", "Prism",
  "Orbit", "Flux", "Echo", "Apex", "Drift",
  "Halo", "Quanta", "Spark", "Tide", "Core",
  "Wave", "Iris", "Volt", "Glyph", "Loom",
];
let CLUSTER_COUNT = 0;

function clusterName(index) {
  return CLUSTER_NAMES[index] ?? `Node ${index + 1}`;
}

function formatWeight(weight) {
  const w = Math.max(0, Number(weight) || 0);
  return w.toFixed(2);
}

function updateClusterMeta(cluster) {
  if (!cluster || typeof cluster.number !== "number") return false;
  const mesh = clusters.find((c) => c.userData.id === cluster.number);
  if (!mesh) return false;
  const teamName = cluster.team?.teamName?.trim() ?? "";
  mesh.userData.displayName = teamName;
  mesh.userData.hasTeam = Boolean(teamName);
  if (typeof cluster.weight === "number") {
    updateClusterWeight(cluster.number, cluster.weight);
  }
  return true;
}
const clusters = [];
const clusterGroup = new THREE.Group();
clusterGroup.name = 'clusterGroup';
networkGroup.add(clusterGroup);

const edgeGroup = new THREE.Group();
edgeGroup.name = 'edgeGroup';
networkGroup.add(edgeGroup);

const NEON_A = new THREE.Color(0x33e6ff);
const NEON_B = new THREE.Color(0x39ff9d);

function fibonacciSphere(samples, index, radius) {
  if (samples <= 1) return new THREE.Vector3(0, 0, radius);
  const y = 1 - (index / (samples - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const theta = goldenAngle * index;
  const x = Math.cos(theta) * r;
  const z = Math.sin(theta) * r;
  return new THREE.Vector3(x * radius, y * radius, z * radius);
}

const baseGeo = new THREE.SphereGeometry(0.55, 32, 32);

function clearClusters() {
  for (const mesh of clusters.splice(0)) {
    const halo = mesh.userData.halo;
    const label = mesh.userData.label;
    if (halo) {
      halo.material.dispose();
      mesh.remove(halo);
    }
    if (label) {
      label.material.map?.dispose();
      label.material.dispose();
      mesh.remove(label);
    }
    mesh.material.dispose();
    clusterGroup.remove(mesh);
  }
  while (edgeGroup.children.length) {
    const edge = edgeGroup.children[0];
    edge.geometry.dispose();
    edge.material.dispose();
    edgeGroup.remove(edge);
  }
  clearPackets();
}

function clearPackets() {
  while (packetGroup.children.length) {
    const packet = packetGroup.children[0];
    packet.material.dispose();
    packetGroup.remove(packet);
  }
}

function rebuildPackets() {
  clearPackets();
  for (const mesh of clusters) {
    const count = 2;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: mesh.userData.neonColor,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.5, 0.5, 1);
      sprite.userData = {
        clusterId: mesh.userData.id,
        t: i / count + Math.random() * 0.35,
        baseSpeed: 0.22 + Math.random() * 0.18,
        speed: 0.22 + Math.random() * 0.18,
      };
      packetGroup.add(sprite);
    }
  }
}

function rebuildClusters(count) {
  const parsed = Number(count);
  const next = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  if (next === CLUSTER_COUNT && clusters.length === next) return;
  CLUSTER_COUNT = next;
  clearClusters();
  if (CLUSTER_COUNT === 0) {
    renderLeaderboard();
    return;
  }

  for (let i = 0; i < CLUSTER_COUNT; i++) {
    const id = i + 1;
    const radius = 9.5;
    const basePos = fibonacciSphere(CLUSTER_COUNT, i, radius);
    basePos.y *= 0.55;
    basePos.y += (Math.random() - 0.5) * 1.5;

    const t = CLUSTER_COUNT === 1 ? 0 : i / (CLUSTER_COUNT - 1);
    const neonColor = NEON_A.clone().lerp(NEON_B, t);

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x0a1420,
      emissive: neonColor.clone(),
      emissiveIntensity: 1.1,
      metalness: 0.25,
      roughness: 0.12,
      transmission: 0.55,
      thickness: 0.65,
      ior: 1.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.92,
    });

    const mesh = new THREE.Mesh(baseGeo, mat);
    mesh.name = `Cluster_${id}`;
    mesh.position.copy(basePos);
    mesh.userData = {
      id,
      clusterId: `Cluster_${id}`,
      displayName: "",
      hasTeam: false,
      baseY: basePos.y,
      weight: 1,
      fromWeight: 0,
      displayWeight: 0,
      animStart: clock.getElapsedTime() + i * 0.055,
      animDuration: 0.72,
      burst: 0,
      floatOffset: Math.random() * Math.PI * 2,
      floatSpeed: 0.4 + Math.random() * 0.3,
      neonColor,
    };
    clusterGroup.add(mesh);
    clusters.push(mesh);
    mesh.scale.setScalar(0);

    const haloMat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: neonColor,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(0.01, 0.01, 1);
    halo.name = `Cluster_${id}_halo`;
    mesh.add(halo);

    const labelMat = new THREE.SpriteMaterial({
      map: createNumberTexture(id),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const label = new THREE.Sprite(labelMat);
    label.name = `Cluster_${id}_label`;
    label.scale.set(1.35, 1.35, 1);
    label.center.set(0.5, 0.5);
    mesh.add(label);

    mesh.userData.halo = halo;
    mesh.userData.label = label;

    const edgeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      basePos.clone(),
    ]);
    const baseEdge = visualsFromWeight(1);
    const edgeMat = new THREE.LineBasicMaterial({
      color: neonColor,
      transparent: true,
      opacity: baseEdge.edgeOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edge = new THREE.Line(edgeGeo, edgeMat);
    edge.name = `Edge_${id}`;
    edge.userData = {
      clusterId: id,
      targetOpacity: baseEdge.edgeOpacity,
      displayOpacity: baseEdge.edgeOpacity,
      baseColor: neonColor.clone(),
    };
    edgeGroup.add(edge);
  }

  rebuildPackets();
  renderLeaderboard();
}

rebuildClusters(0);

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

/** Size, glow, and link strength track the cluster's live AdaBoost weight. */
function visualsFromWeight(weight) {
  const w = Math.max(0, Number(weight) || 0);
  // AdaBoost weights are multiplicative (w *= exp(alpha*y)), so the RIGHT transform is
  // logarithmic: it's perceptually uniform (Weber-Fechner), meaning equal ratios map to
  // equal visual steps. A node twice as heavy looks exactly one step bigger whether the
  // field sits at weight 2 or 2,000 — which is what lets the audience compare at a glance.
  // (An adaptive "normalize to live max" map is rejected on purpose: it would resize a
  // node when OTHER nodes change, which is confusing and unreadable on a live projector.)
  //
  //   w:  0.25  0.5   1    2    5   10   50   100  500  1e3  2e3   1e4   1e5  162755
  //   t:  0.32 0.58   1  1.58 2.58 3.46 5.67 6.66 8.97 9.97 11.0 13.29 16.61 17.31
  const t = Math.log2(1 + w);
  return {
    // SIZE is the only cue geometry limits (a node must not overrun the hub). Rather than
    // stretch it thinly across all six orders of magnitude — which made each doubling a
    // barely-visible ~10% — we spend the size budget on the range games actually reach
    // (~1..2000): a punchy +0.28 per doubling (~28% radius) that the back row can read.
    // It hits the 3.8 clamp near weight 2000 (radius 0.55·3.8 ≈ 2.1, still clearing the
    // hub); beyond that the glow/link cues below carry the distinction.
    scale: THREE.MathUtils.clamp(0.72 + 0.28 * t, 0.42, 3.8),
    // GLOW (emissive) is unconstrained and, under ACES tonemapping, blooms toward
    // white-hot as it climbs — so heavy nodes keep separating brightly even past the
    // size clamp, all the way through the six-figure ceiling.
    emissive: THREE.MathUtils.clamp(0.8 + 0.6 * t, 0.4, 14),
    haloOpacity: THREE.MathUtils.clamp(0.22 + 0.12 * t, 0.12, 0.98),
    // Halo RADIUS is the primary tail cue: additive glow has no collision cost, so it
    // keeps widening long after opacity pins at 1 — this is what visibly separates, e.g.,
    // weight 10k from 100k once node size has clamped.
    haloWorld: THREE.MathUtils.clamp(1.5 + 0.7 * t, 1.3, 16),
    edgeOpacity: THREE.MathUtils.clamp(0.22 + 0.13 * t, 0.16, 0.98),
    // Link brightness keeps climbing past the opacity ceiling for the same reason.
    edgeBoost: THREE.MathUtils.clamp(0.6 + 0.3 * t, 0.45, 7),
    packetSpeed: THREE.MathUtils.clamp(0.18 + 0.08 * t, 0.14, 2.0),
    packetSize: THREE.MathUtils.clamp(0.85 + 0.16 * t, 0.75, 3.6),
  };
}

/**
 * Smoothly scale and glow a cluster by weight.
 * @param {number|string} clusterId  1–N or "Cluster_1" … "Cluster_N"
 * @param {number} newWeight         actual AdaBoost weight (1 at start)
 */
function updateClusterWeight(clusterId, newWeight) {
  const numericId =
    typeof clusterId === 'string'
      ? Number(String(clusterId).replace(/^\D+/g, ''))
      : clusterId;

  const mesh = clusters.find((c) => c.userData.id === numericId);
  if (!mesh) {
    console.warn(`updateClusterWeight: Cluster_${clusterId} not found`);
    return false;
  }

  const w = Math.max(0, Number(newWeight) || 0);
  const ud = mesh.userData;
  const changed = Math.abs((ud.weight ?? 0) - w) > 0.0005;

  ud.fromWeight = ud.displayWeight ?? ud.weight ?? 0;
  ud.weight = w;
  ud.animStart = clock.getElapsedTime();
  ud.animDuration = 0.55;
  ud.burst = changed ? 0.35 : 0;

  const edge = edgeGroup.children.find((e) => e.userData.clusterId === numericId);
  if (edge) {
    const vis = visualsFromWeight(w);
    edge.userData.targetOpacity = vis.edgeOpacity;
    edge.userData.targetBoost = vis.edgeBoost;
  }

  renderLeaderboard();

  return true;
}

function getLeaderboard() {
  return clusters
    .filter((mesh) => mesh.userData.hasTeam && String(mesh.userData.displayName ?? "").trim())
    .map((mesh) => {
      const { id, displayName, weight } = mesh.userData;
      return {
        number: id,
        name: displayName,
        weight: Number(weight) || 0,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.number - b.number);
}

let lastMiniSig = "";
const lastMiniWeights = new Map();

function renderMiniLeaderboard() {
  const body = document.getElementById("lb-body");
  if (!body) return;
  const top = getLeaderboard().slice(0, 5);
  if (!top.length) {
    lastMiniSig = "";
    lastMiniWeights.clear();
    body.innerHTML = `<li class="lb-empty">Waiting for teams</li>`;
    return;
  }
  const sig = top.map((row) => `${row.number}:${row.name}`).join("|");
  const animateIn = sig !== lastMiniSig;
  lastMiniSig = sig;
  body.innerHTML = top
    .map((row, index) => {
      const prev = lastMiniWeights.get(row.number);
      const changed = prev !== undefined && Math.abs(prev - row.weight) > 0.0005;
      lastMiniWeights.set(row.number, row.weight);
      const cls = `lb-row${changed ? " weight-up" : ""}${animateIn ? "" : " no-enter"}`;
      return `
      <li class="${cls}" style="--i:${index}">
        <span class="rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="lb-num">${row.number}</span>
        <span class="lb-name">${row.name}</span>
        <span class="weight">${formatWeight(row.weight)}</span>
      </li>`;
    })
    .join("");
  const present = new Set(top.map((row) => row.number));
  for (const key of [...lastMiniWeights.keys()]) {
    if (!present.has(key)) lastMiniWeights.delete(key);
  }
}

function renderFullLeaderboard() {
  const body = document.getElementById("lb-full-body");
  if (!body) return;
  const rows = getLeaderboard();
  if (!rows.length) {
    body.innerHTML = `<tr class="lb-empty-row"><td colspan="4">Waiting for teams</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (row, index) => `
      <tr style="--i:${index}">
        <td class="rank">${String(index + 1).padStart(2, "0")}</td>
        <td class="num">${row.number}</td>
        <td>${row.name}</td>
        <td class="weight">${formatWeight(row.weight)}</td>
      </tr>`
    )
    .join("");
}

function renderLeaderboard() {
  renderMiniLeaderboard();
  renderFullLeaderboard();
}

const hud = document.getElementById("hud");
const leaderboard = document.getElementById("leaderboard");

function setHudHidden(hidden) {
  hud.classList.toggle("hidden", hidden);
  leaderboard?.classList.toggle("hidden", hidden);
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (demoOpen) closeDemo();
  else if (clueOpen) closeClue();
  else if (lbOpen) closeLeaderboard();
});

const ROUND_CLUES = {
  R0: {
    title: "Viral clip",
    body: [
      "Watch the clip on the projector.",
      "",
      "Practice round — weights do not carry forward.",
    ].join("\n"),
    media: { type: "video", src: "/media/r0-ravi-kishan.mp4", caption: "Viral clip", autoplay: false },
  },
  R1: {
    title: "Last purchases",
    body: [
      "A mix of fitness, tech, skincare, and late-night food:",
      "",
      "• ESP32 microcontroller",
      "• ChatGPT Plus / Claude Premium subscription",
      "• USB-C to USB-A cable",
      "• 100-pack of copper wires",
      "• Elite gym membership renewal",
      "• Premium hair/skin serum",
      "• Late-night Blinkit order — Buldak spicy Korean noodles",
      "• Zomato order from California Burrito",
    ].join("\n"),
    media: { type: "image", src: "/media/r1-purchases.png", caption: "Personal ledger · last 7 days" },
  },
  R2: {
    title: "Voice note",
    body: [
      "Played at 1:30 AM.",
      "",
      'Volunteer: "Hey bro, I know it\'s important to learn it, but don\'t waste time starting that lab code from scratch. I found a random solution online that passes the two basic sample tests on the assignment sheet."',
      "",
      'The other person: "Oh wait really? Do you know how it works?"',
      "",
      'Volunteer: "Dude I honestly have zero clue how the code works, but it showed \'Output: Success\' once on my screen, so I\'m submitting it right now and going to sleep."',
    ].join("\n"),
    media: { type: "video", src: "/media/r2-sip.mov", caption: "SIP video · 1:30 AM", autoplay: false },
  },
  R3: {
    title: "Search history",
    body: [
      "Recent mobile search history, timestamped at 1 A.M.:",
      "",
      "• how to fix posture after 14 hours sitting",
      "• how much electricity is my gaming PC secretly eating",
      "• can I pull an all nighter and finish my entire syllabus",
      "• best playlist for pretending I'm productive",
      "• dominos cheese burst near me open late",
      "• C pointers explained like I'm five before I lose my mind",
    ].join("\n"),
    media: { type: "screenshot", src: "/media/r3-search.png", caption: "1 A.M. searches" },
  },
  R4: {
    title: "Two truths, one lie",
    body: [
      "Three stated facts from the mystery volunteer. Two are absolute facts. One is a complete fabrication.",
      "",
      '1. "I managed an 8.2 CGPA last semester despite not even solving previous-year papers."',
      '2. "I haven\'t used a calendar or planner for my academic deadlines since the first week of the semester."',
      '3. "I can work anywhere; I never waste time setting up a comfortable vibe or putting on some music, I just sit in silence and grind."',
    ].join("\n"),
    media: { type: "image", src: "/media/r4-lie.png", caption: "Three claims · find the lie" },
  },
  R5: {
    title: "Open tabs",
    body: [
      "Watch the screen recording on the projector. Click to play — it will not start on its own.",
      "",
      'Tab 1 — The Big Pitch: A polished Canva presentation titled "PhysioTracker AI – Pitch Deck (Final Draft)" with sleek mockups and a projected ₹10 crore valuation slide.',
      "",
      'Tab 2 — The High Hopes: A Google search for "how to apply for Shark Tank India as a college student".',
      "",
      "Tab 3 — The Broken Reality: An active VS Code / terminal screen filled with red error text:",
      "FATAL ERROR: Server crashed. Database connection failed.",
    ].join("\n"),
    media: {
      type: "video",
      src: "/media/r5-tabs.mp4",
      caption: "Screen recording · pitch deck vs crashing server",
      autoplay: false,
    },
  },
  FINAL: {
    title: "Latent space",
    body: "Three candidate deep-work environments. One is the volunteer's real setup. Two are decoys.",
    media: {
      type: "image",
      src: "/media/final-latent.png",
      caption: "Three candidate environments — one real, two decoys",
    },
  },
};

let currentRoundId = "R0";
let currentClue = ROUND_CLUES.R0;

function roundLabel(roundId) {
  if (!roundId) return "Round 0";
  if (roundId === "FINAL") return "Final testing";
  const n = String(roundId).replace(/^R/i, "");
  return `Round ${n}`;
}

function setRoundLabel(text) {
  const el = document.getElementById("round-label");
  if (!el) return;
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("tick");
  void el.offsetWidth;
  el.classList.add("tick");
}

function isMediaFolderSrc(src) {
  if (typeof src !== "string" || !src) return false;
  const path = src.split("?")[0];
  return path.startsWith("/media/") || path.startsWith("./media/") || path.startsWith("media/");
}

let clueMediaToken = "";
let lastClueMediaKey = "";
let mediaArmed = false;

function notifyClueEnded() {
  if (typeof window.__notifyClueEnded === "function") window.__notifyClueEnded();
}

function armStageMedia() {
  if (mediaArmed) return;
  mediaArmed = true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    const ctx = new AC();
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    /* gesture still counts as a user activation for later play() */
  }
}

["pointerdown", "keydown", "touchstart"].forEach((type) => {
  window.addEventListener(type, armStageMedia, { capture: true });
});

function setMediaMuted(el, muted) {
  el.muted = muted;
  el.defaultMuted = muted;
  if (muted) el.setAttribute("muted", "");
  else el.removeAttribute("muted");
}

function clueSoundGate() {
  return document.getElementById("clue-sound-gate");
}

function showClueGate(label) {
  const holder = document.getElementById("clue-media");
  if (!holder) return;
  let gate = clueSoundGate();
  if (!gate) {
    gate = document.createElement("button");
    gate.id = "clue-sound-gate";
    gate.type = "button";
    holder.appendChild(gate);
  }
  gate.textContent = label;
  gate.hidden = false;
}

function hideClueGate() {
  const gate = clueSoundGate();
  if (gate) gate.hidden = true;
}

function enableSound(el) {
  armStageMedia();
  setMediaMuted(el, false);
  el.volume = 1;
  const play = el.play();
  if (play && typeof play.then === "function") {
    play
      .then(() => {
        if (!el.paused && !el.muted) hideClueGate();
        else if (el.paused) {
          setMediaMuted(el, true);
          el.play()?.catch(() => {});
          showClueGate("Click for sound");
        }
      })
      .catch(() => {
        setMediaMuted(el, true);
        el.play()?.catch(() => {});
        showClueGate("Click for sound");
      });
    return;
  }
  if (!el.muted && !el.paused) hideClueGate();
}

function bindClueHolderClicks(holder) {
  if (!holder || holder.dataset.soundBound === "1") return;
  holder.dataset.soundBound = "1";
  holder.addEventListener("click", () => {
    const media = holder.querySelector("video, audio");
    if (!media || media.autoplay === false) return;
    enableSound(media);
  });
}

function bindCluePlayback(el, { autoplay = true } = {}) {
  el.playsInline = true;
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  el.preload = "auto";
  el.volume = 1;
  el.addEventListener("ended", notifyClueEnded);
  el.addEventListener("play", () => {
    if (!el.muted) hideClueGate();
  });
  el.addEventListener("error", () => {
    el.parentElement && (el.parentElement.innerHTML = "");
  });

  if (!autoplay) {
    el.autoplay = false;
    el.removeAttribute("autoplay");
    el.controls = true;
    el.setAttribute("controls", "");
    setMediaMuted(el, false);
    hideClueGate();
    return;
  }

  el.autoplay = true;
  setMediaMuted(el, true);
  const start = () => {
    if (el.dataset.clueStarted === "1") return;
    el.dataset.clueStarted = "1";
    const play = el.play();
    const afterPlay = () => {
      if (el.paused) {
        showClueGate("Click to play");
        return;
      }
      if (mediaArmed || navigator.userActivation?.hasBeenActive) {
        enableSound(el);
        return;
      }
      showClueGate("Click for sound");
    };
    if (play && typeof play.then === "function") {
      play.then(afterPlay).catch(() => {
        showClueGate("Click to play");
      });
    } else {
      afterPlay();
    }
  };

  if (el.readyState >= 2) start();
  else el.addEventListener("canplay", start, { once: true });
}

function renderClueMedia(media) {
  const holder = document.getElementById("clue-media");
  if (!holder) return;
  bindClueHolderClicks(holder);
  const key = `${clueMediaToken}|${media?.type ?? ""}|${media?.src ?? ""}`;
  if (key === lastClueMediaKey && holder.querySelector("video, audio, img")) return;
  lastClueMediaKey = key;
  holder.innerHTML = "";
  if (!media?.src || !isMediaFolderSrc(media.src)) return;
  if (media.type === "audio") {
    holder.innerHTML = `<audio muted playsinline autoplay preload="auto" src="${media.src}"></audio>`;
    const audio = holder.querySelector("audio");
    if (audio) bindCluePlayback(audio);
    return;
  }
  if (media.type === "video") {
    const autoplay = media.autoplay !== false;
    const attrs = autoplay
      ? "muted playsinline autoplay preload=\"auto\""
      : "playsinline preload=\"auto\" controls";
    holder.innerHTML = `<video ${attrs} src="${media.src}"></video>`;
    const video = holder.querySelector("video");
    if (video) bindCluePlayback(video, { autoplay });
    return;
  }
  holder.innerHTML = `<img src="${media.src}" alt="" />`;
  const img = holder.querySelector("img");
  img?.addEventListener("error", () => {
    holder.innerHTML = "";
  });
}

function renderClueScreen() {
  const label = roundLabel(currentRoundId);
  setRoundLabel(label);
  const roundEl = document.getElementById("clue-round");
  if (roundEl) roundEl.textContent = label;
  if (inLobby || stagePhase !== "clue") return;
  renderClueMedia(currentClue?.media);
}

const clueScreen = document.getElementById("clue-screen");
const clueBtn = document.getElementById("clue-btn");
const clueBack = document.getElementById("clue-back");
let clueOpen = false;

function openClue() {
  if (inLobby || stagePhase !== "clue") return;
  if (demoOpen) closeDemo();
  if (lbOpen) closeLeaderboard();
  renderClueScreen();
  clueOpen = true;
  clueScreen.classList.add("open");
  clueScreen.setAttribute("aria-hidden", "false");
  setHudHidden(true);
}

function closeClue() {
  clueOpen = false;
  clueScreen.classList.remove("open");
  clueScreen.setAttribute("aria-hidden", "true");
  setHudHidden(false);
  for (const el of clueScreen.querySelectorAll("audio, video")) {
    el.pause();
    el.currentTime = 0;
  }
  const holder = document.getElementById("clue-media");
  if (holder) holder.innerHTML = "";
  lastClueMediaKey = "";
}

clueBtn.addEventListener("click", openClue);
clueBack.addEventListener("click", closeClue);

const clueTimerEl = document.getElementById("clue-timer");
const finalScreen = document.getElementById("final-screen");
const finalTimerEl = document.getElementById("final-timer");
const finalGrid = document.getElementById("final-grid");
const finalWord = document.getElementById("final-word");
const finalVerdict = document.getElementById("final-verdict");
const finalCalculating = document.getElementById("final-calculating");
let stagePhase = "lobby";
let stageClock = null;
let finalOpen = false;
let lastFinalGridKey = "";

const FALLBACK_FINAL_ENV = [
  { optionId: "a", letter: "A", src: "/media/env-a-decoy.png", caption: "Image A" },
  { optionId: "b", letter: "B", src: "/media/env-b-real.png", caption: "Image B" },
  { optionId: "c", letter: "C", src: "/media/env-c-decoy.png", caption: "Image C" },
];

function isFinalStage(phase) {
  return (
    phase === "final_inference_open" ||
    phase === "final_inference_locked" ||
    phase === "ensemble" ||
    phase === "final_reveal"
  );
}

function formatVoteClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function paintTimer(el, ms) {
  if (!el) return;
  if (ms == null) {
    el.hidden = true;
    el.classList.remove("urgent");
    return;
  }
  el.hidden = false;
  el.textContent = ms <= 0 ? "0:00" : formatVoteClock(ms);
  el.classList.toggle("urgent", ms <= 5_000);
}

function renderStageTimer() {
  const clueMs = stagePhase === "clue" ? stageClock?.clueRemainingMs ?? null : null;
  const voteMs = stagePhase === "final_inference_open" ? stageClock?.voteRemainingMs ?? null : null;
  paintTimer(clueTimerEl, clueMs);
  paintTimer(finalTimerEl, voteMs);
}

function armClueTick(snap) {
  stagePhase = typeof snap?.phase === "string" ? snap.phase : stagePhase;
  if (snap) {
    stageClock = {
      voteDeadlineAt: snap.voteDeadlineAt ?? null,
      clueDeadlineAt: snap.clueDeadlineAt ?? null,
      voteRemainingMs:
        snap.voteDeadlineAt != null && snap.serverTime != null
          ? Math.max(0, snap.voteDeadlineAt - snap.serverTime)
          : null,
      clueRemainingMs:
        snap.clueDeadlineAt != null && snap.serverTime != null
          ? Math.max(0, snap.clueDeadlineAt - snap.serverTime)
          : null,
    };
  }
  renderStageTimer();
}

window.applyEngineClock = function applyEngineClock(clock) {
  stageClock = clock ?? null;
  renderStageTimer();
};

function finalPanelsFrom(snap) {
  const panels = Array.isArray(snap?.finalEnvironments) && snap.finalEnvironments.length
    ? snap.finalEnvironments
    : FALLBACK_FINAL_ENV;
  return panels.map((panel, i) => ({
    optionId: panel.optionId ?? ["a", "b", "c"][i],
    letter: panel.letter ?? String.fromCharCode(65 + i),
    src: panel.src,
    caption: panel.caption ?? `Image ${String.fromCharCode(65 + i)}`,
  }));
}

function ensureFinalGrid(snap) {
  if (!finalGrid) return [];
  const panels = finalPanelsFrom(snap);
  const key = panels.map((p) => `${p.optionId}:${p.src}`).join("|");
  if (key === lastFinalGridKey && finalGrid.childElementCount === panels.length) return panels;
  lastFinalGridKey = key;
  finalGrid.innerHTML = panels
    .map(
      (panel) => `
      <article class="final-card" data-option="${panel.optionId}">
        <span class="final-letter">${panel.letter}</span>
        <figure><img src="${panel.src}" alt="${panel.caption}" /></figure>
        <div class="final-meta">
          <span class="final-caption">${panel.caption}</span>
          <span class="final-pct" hidden>—</span>
        </div>
        <div class="final-bar" hidden><span></span></div>
      </article>`
    )
    .join("");
  return panels;
}

function renderFinalScreen(snap) {
  if (!finalScreen) return;
  const panels = ensureFinalGrid(snap);
  const calculating = snap.phase === "final_inference_locked";
  const result = snap.phase === "ensemble" || snap.phase === "final_reveal";
  finalScreen.classList.toggle("is-calculating", calculating);
  finalScreen.classList.toggle("is-result", result);
  if (finalCalculating) finalCalculating.hidden = !calculating;
  if (finalWord) {
    finalWord.textContent = calculating ? "Calculating" : result ? "Prediction" : "Test set";
  }
  const bars = Array.isArray(snap.ensemble) ? snap.ensemble : [];
  const ranked = [...bars].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const pick = result && ranked.some((b) => (b.score ?? 0) > 0) ? ranked[0] : null;
  if (finalVerdict) {
    if (pick) {
      const letter = panels.find((p) => p.optionId === pick.optionId)?.letter ?? pick.optionId;
      finalVerdict.hidden = false;
      finalVerdict.textContent = `Engine predicts  ${letter}`;
    } else {
      finalVerdict.hidden = true;
      finalVerdict.textContent = "";
    }
  }
  for (const panel of panels) {
    const card = finalGrid?.querySelector(`[data-option="${panel.optionId}"]`);
    if (!card) continue;
    const bar = bars.find((b) => b.optionId === panel.optionId);
    const pctEl = card.querySelector(".final-pct");
    const barWrap = card.querySelector(".final-bar");
    const barFill = barWrap?.querySelector("span");
    const showPct = result && bar;
    if (pctEl) {
      pctEl.hidden = !showPct;
      if (showPct) pctEl.textContent = `${Math.round((bar.pct ?? 0) * 100)}%`;
    }
    if (barWrap) {
      barWrap.hidden = !showPct;
      if (barFill) barFill.style.width = showPct ? `${Math.max(4, (bar.pct ?? 0) * 100)}%` : "0%";
    }
    card.classList.toggle("is-pick", Boolean(pick && pick.optionId === panel.optionId));
  }
}

function openFinal(snap) {
  if (inLobby) return;
  if (demoOpen) closeDemo();
  if (lbOpen) closeLeaderboard();
  if (clueOpen) closeClue();
  renderFinalScreen(snap);
  finalOpen = true;
  finalScreen?.classList.add("open");
  finalScreen?.setAttribute("aria-hidden", "false");
  setHudHidden(true);
}

function closeFinal() {
  finalOpen = false;
  finalScreen?.classList.remove("open");
  finalScreen?.classList.remove("is-calculating", "is-result");
  finalScreen?.setAttribute("aria-hidden", "true");
  if (finalCalculating) finalCalculating.hidden = true;
  if (finalVerdict) {
    finalVerdict.hidden = true;
    finalVerdict.textContent = "";
  }
  lastFinalGridKey = "";
  if (finalGrid) finalGrid.innerHTML = "";
  setHudHidden(false);
}

const demoBtn = document.getElementById("demo-btn");
const demoScreen = document.getElementById("demo-screen");
const demoBack = document.getElementById("demo-back");
const demoVideo = document.getElementById("demo-video");
const demoFallback = document.getElementById("demo-fallback");
const lbBtn = document.getElementById("lb-btn");
const lbScreen = document.getElementById("leaderboard-screen");
const lbBack = document.getElementById("lb-back");
let demoOpen = false;
let lbOpen = false;
let inLobby = true;

function setLobbyMode(inLobbyNow) {
  inLobby = inLobbyNow;
  hud?.classList.toggle("in-lobby", inLobby);
  leaderboard?.classList.toggle("in-lobby", inLobby);
  demoBtn?.classList.toggle("hidden", !inLobby);
  lbBtn?.classList.toggle("hidden", inLobby);
  if (!inLobby && demoOpen) closeDemo();
  if (inLobby && lbOpen) closeLeaderboard();
  if (inLobby && clueOpen) closeClue();
  if (inLobby && finalOpen) closeFinal();
}

function openLeaderboard() {
  if (inLobby) return;
  if (demoOpen) closeDemo();
  if (clueOpen) closeClue();
  if (finalOpen) closeFinal();
  lbOpen = true;
  renderFullLeaderboard();
  lbScreen?.classList.add("open");
  lbScreen?.setAttribute("aria-hidden", "false");
  setHudHidden(true);
}

function closeLeaderboard() {
  lbOpen = false;
  lbScreen?.classList.remove("open");
  lbScreen?.setAttribute("aria-hidden", "true");
  setHudHidden(false);
}

lbBtn?.addEventListener("click", openLeaderboard);
lbBack?.addEventListener("click", closeLeaderboard);

function openDemo() {
  if (!inLobby) return;
  if (clueOpen) closeClue();
  if (finalOpen) closeFinal();
  if (lbOpen) closeLeaderboard();
  demoOpen = true;
  demoFallback?.classList.remove("show");
  demoScreen?.classList.add("open");
  demoScreen?.setAttribute("aria-hidden", "false");
  setHudHidden(true);
  if (demoVideo) {
    demoVideo.currentTime = 0;
    const play = demoVideo.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => demoFallback?.classList.add("show"));
    }
  }
}

function closeDemo() {
  demoOpen = false;
  demoScreen?.classList.remove("open");
  demoScreen?.setAttribute("aria-hidden", "true");
  if (demoVideo) {
    demoVideo.pause();
    demoVideo.currentTime = 0;
  }
  setHudHidden(false);
}

demoBtn?.addEventListener("click", openDemo);
demoBack?.addEventListener("click", closeDemo);
demoVideo?.addEventListener("error", () => demoFallback?.classList.add("show"));

window.applyEngineSnapshot = function applyEngineSnapshot(snap) {
  if (!snap) return;
  if (snap.roundId) currentRoundId = snap.roundId;
  else if (snap.phase === "lobby") currentRoundId = "R0";
  if (snap.clue) currentClue = snap.clue;
  else if (snap.phase === "clue" && ROUND_CLUES[currentRoundId]) {
    currentClue = ROUND_CLUES[currentRoundId];
  } else {
    currentClue = null;
  }
  if (typeof snap.phase === "string") {
    setLobbyMode(snap.phase === "lobby");
  }
  if (typeof snap.clusterCount === "number") {
    rebuildClusters(snap.clusterCount);
  } else if (Array.isArray(snap.clusters)) {
    rebuildClusters(snap.clusters.length);
  }
  if (Array.isArray(snap.clusters)) {
    for (const cluster of snap.clusters) {
      updateClusterMeta(cluster);
    }
  }
  clueMediaToken = `${snap.roundId ?? ""}:${snap.clueStartedAt ?? 0}`;
  renderLeaderboard();
  armClueTick(snap);
  const showClue = snap.phase === "clue";
  clueBtn?.classList.toggle("hidden", !showClue);
  if (showClue) {
    renderClueScreen();
    openClue();
  } else if (clueOpen) {
    closeClue();
  }
  if (isFinalStage(snap.phase)) {
    openFinal(snap);
  } else if (finalOpen) {
    closeFinal();
  }
};

renderClueScreen();
renderLeaderboard();

window.updateClusterWeight = updateClusterWeight;
window.getLeaderboard = getLeaderboard;

setTimeout(() => {
  if (window.__engineLive) return;
  for (let i = 1; i <= clusters.length; i++) {
    if (Math.random() > 0.55) {
      updateClusterWeight(i, Math.random() * 1.4 + 0.2);
    }
  }
}, 800);

setInterval(() => {
  if (window.__engineLive) return;
  if (!clusters.length) return;
  const id = 1 + Math.floor(Math.random() * clusters.length);
  updateClusterWeight(id, Math.random() * 1.6);
}, 2200);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
controls.maxDistance = 28;
controls.enablePan = false;
controls.minPolarAngle = Math.PI * 0.15;
controls.maxPolarAngle = Math.PI * 0.85;
controls.target.set(0, 0, 0);
controls.update();

// ---------- Animation loop ----------
function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  networkGroup.position.y = Math.sin(elapsed * 0.5) * 0.35;
  networkGroup.rotation.y += delta * 0.038;

  starfield.rotation.y += delta * 0.006;
  starfield.rotation.x = Math.sin(elapsed * 0.07) * 0.04;
  starfield.material.opacity = 0.26 + Math.sin(elapsed * 0.85) * 0.1;

  const hubPulse = 1 + Math.sin(elapsed * 1.2) * 0.045;
  hub.scale.setScalar(hubPulse);
  hubWire.rotation.y -= delta * 0.12;
  hubWire.rotation.x += delta * 0.055;
  hubWireMat.opacity = 0.28 + Math.sin(elapsed * 1.8) * 0.12;
  hubMat.emissiveIntensity = 1.85 + Math.sin(elapsed * 1.5) * 0.4;
  hubLight.intensity = 20 + Math.sin(elapsed * 1.5) * 6;

  hubRingA.rotation.z += delta * 0.42;
  hubRingB.rotation.z -= delta * 0.26;
  hubRingC.rotation.z += delta * 0.18;
  hubRingA.rotation.y = Math.sin(elapsed * 0.45) * 0.22;
  hubRingB.rotation.y = Math.cos(elapsed * 0.32) * 0.18;
  hubRingC.material.opacity = 0.32 + Math.sin(elapsed * 1.4) * 0.16;

  for (const mesh of clusters) {
    const ud = mesh.userData;
    const rawT = ud.animDuration > 0 ? (elapsed - ud.animStart) / ud.animDuration : 1;
    const animT = Math.min(1, Math.max(0, rawT));
    const eased = easeOutCubic(animT);
    ud.displayWeight = THREE.MathUtils.lerp(ud.fromWeight ?? 0, ud.weight ?? 1, eased);
    ud.burst = Math.max(0, (ud.burst ?? 0) - delta * 2.4);

    const vis = visualsFromWeight(ud.displayWeight);
    const nodeScale = vis.scale * (1 + ud.burst * 0.05);

    mesh.position.y = ud.baseY + Math.sin(elapsed * ud.floatSpeed + ud.floatOffset) * 0.22;
    mesh.scale.setScalar(nodeScale);
    mesh.material.emissiveIntensity = vis.emissive;

    const halo = ud.halo;
    if (halo) {
      halo.material.opacity = vis.haloOpacity;
      const localHalo = vis.haloWorld / Math.max(nodeScale, 0.001);
      halo.scale.set(localHalo, localHalo, 1);
    }

    if (ud.label) {
      const inv = 1 / Math.max(nodeScale, 0.001);
      ud.label.scale.set(1.35 * inv, 1.35 * inv, 1);
    }
  }

  for (const packet of packetGroup.children) {
    const cluster = clusters.find((c) => c.userData.id === packet.userData.clusterId);
    if (!cluster) continue;
    const vis = visualsFromWeight(cluster.userData.displayWeight ?? cluster.userData.weight ?? 1);
    const baseSpeed = packet.userData.baseSpeed ?? packet.userData.speed ?? 0.25;
    packet.userData.t += baseSpeed * vis.packetSpeed * 1.35 * delta;
    if (packet.userData.t > 1) packet.userData.t -= 1;
    const t = packet.userData.t;
    packet.position.set(
      cluster.position.x * t,
      cluster.position.y * t,
      cluster.position.z * t
    );
    const pulse = Math.sin(t * Math.PI);
    const size = (0.28 + pulse * 0.55) * vis.packetSize;
    packet.scale.set(size, size, 1);
    packet.material.opacity = Math.min(1, (0.18 + pulse * 0.82) * vis.edgeBoost);
  }

  for (const edge of edgeGroup.children) {
    const cluster = clusters.find((c) => c.userData.id === edge.userData.clusterId);
    if (cluster) {
      const positions = edge.geometry.attributes.position;
      positions.setXYZ(1, cluster.position.x, cluster.position.y, cluster.position.z);
      positions.needsUpdate = true;

      // Link strength follows the node’s live (animated) weight in real time.
      const vis = visualsFromWeight(cluster.userData.displayWeight ?? cluster.userData.weight ?? 1);
      edge.userData.targetOpacity = vis.edgeOpacity;
      edge.userData.targetBoost = vis.edgeBoost;
    }
    if (edge.userData.targetOpacity !== undefined) {
      edge.userData.displayOpacity = THREE.MathUtils.lerp(
        edge.userData.displayOpacity ?? edge.userData.targetOpacity,
        edge.userData.targetOpacity,
        0.1
      );
    }
    const boost = edge.userData.targetBoost ?? 1;
    edge.userData.displayBoost = THREE.MathUtils.lerp(
      edge.userData.displayBoost ?? boost,
      boost,
      0.1
    );
    const pulse = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(elapsed * 3.2 + (edge.userData.clusterId ?? 0)));
    edge.material.opacity = Math.min(1, (edge.userData.displayOpacity ?? 0.45) * pulse * edge.userData.displayBoost);
    if (edge.userData.baseColor) {
      // Brighter link as weight climbs.
      const lift = THREE.MathUtils.clamp(0.65 + 0.45 * (edge.userData.displayBoost ?? 1), 0.65, 1.6);
      edge.material.color.copy(edge.userData.baseColor).multiplyScalar(lift);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

function fitRenderer() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', fitRenderer);
if (typeof ResizeObserver === "function") {
  new ResizeObserver(fitRenderer).observe(document.documentElement);
}
fitRenderer();
