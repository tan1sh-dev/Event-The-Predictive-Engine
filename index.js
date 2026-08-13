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
  scene.backgroundIntensity = 0.85;
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
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const root = document.getElementById('root') ?? document.body;
root.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const clock = new THREE.Clock();

// ---------- Lighting ----------
const ambient = new THREE.AmbientLight(0x1a2340, 0.55);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0x6fd8ff, 1.15);
keyLight.position.set(10, 15, 10);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x39ff9d, 0.35);
fillLight.position.set(-8, 6, 8);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x3355ff, 0.55);
rimLight.position.set(-12, -6, -10);
scene.add(rimLight);

const hubLight = new THREE.PointLight(0x66e0ff, 18, 36, 2);
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
    color: 0x88aaff,
    size: 0.28,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'starfield';
  return points;
}
scene.add(createStarfield());

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

function clusterScore(weight) {
  return Math.round(Math.max(0, Number(weight) || 0) * 1000);
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
      displayName: clusterName(i),
      baseY: basePos.y,
      currentScale: 1,
      targetScale: 1,
      currentEmissive: 1.1,
      targetEmissive: 1.1,
      weight: 0.5,
      animStart: 0,
      animDuration: 0.5,
      fromScale: 1,
      fromEmissive: 1.1,
      floatOffset: Math.random() * Math.PI * 2,
      floatSpeed: 0.4 + Math.random() * 0.3,
      neonColor,
    };
    clusterGroup.add(mesh);
    clusters.push(mesh);

    const haloMat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: neonColor,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(2.2, 2.2, 1);
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
    const edgeMat = new THREE.LineBasicMaterial({
      color: neonColor,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edge = new THREE.Line(edgeGeo, edgeMat);
    edge.name = `Edge_${id}`;
    edge.userData = { clusterId: id, targetOpacity: 0.45 };
    edgeGroup.add(edge);
  }

  renderLeaderboard();
}

rebuildClusters(0);

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Smoothly scale and glow a cluster by weight.
 * @param {number|string} clusterId  1–N or "Cluster_1" … "Cluster_N"
 * @param {number} newWeight         typically 0–1 (values up to 2 are allowed)
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

  const w = Math.max(0, Math.min(2, Number(newWeight)));
  const ud = mesh.userData;

  ud.fromScale = ud.currentScale;
  ud.fromEmissive = ud.currentEmissive;
  ud.targetScale = 0.7 + w * 0.9;
  ud.targetEmissive = 0.4 + w * 2.6;
  ud.animStart = clock.getElapsedTime();
  ud.animDuration = 0.5;
  ud.weight = w;

  const edge = edgeGroup.children.find((e) => e.userData.clusterId === numericId);
  if (edge) {
    edge.userData.targetOpacity = 0.25 + w * 0.65;
  }

  renderLeaderboard();

  return true;
}

function getLeaderboard() {
  return clusters
    .map((mesh) => {
      const { id, displayName, weight } = mesh.userData;
      return {
        number: id,
        name: displayName,
        weight,
        score: clusterScore(weight),
      };
    })
    .sort((a, b) => b.score - a.score || a.number - b.number);
}

function renderMiniLeaderboard() {
  const body = document.getElementById("lb-body");
  if (!body) return;
  const top = getLeaderboard().slice(0, 5);
  if (!top.length) {
    body.innerHTML = `<li class="lb-empty">Waiting for nodes</li>`;
    return;
  }
  body.innerHTML = top
    .map(
      (row, index) => `
      <li class="lb-row">
        <span class="rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="num">${String(row.number).padStart(2, "0")}</span>
        <span class="lb-name">${row.name}</span>
        <span class="score">${row.score.toLocaleString("en-US")}</span>
      </li>`
    )
    .join("");
}

function renderFullLeaderboard() {
  const body = document.getElementById("lb-full-body");
  if (!body) return;
  const rows = getLeaderboard();
  if (!rows.length) {
    body.innerHTML = `<tr class="lb-empty-row"><td colspan="4">Waiting for nodes</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (row, index) => `
      <tr>
        <td class="rank">${String(index + 1).padStart(2, "0")}</td>
        <td class="num">${row.number}</td>
        <td>${row.name}</td>
        <td class="score">${row.score.toLocaleString("en-US")}</td>
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
    title: "Warm-up",
    body: "This round teaches the vote + wager flow. Your cluster's weight will not carry forward.",
  },
  R1: {
    title: "Image clue",
    body: "A projected purchase history (tech, fitness, skincare, late-night food). Anchor your first read on the volunteer's lifestyle.",
    media: { type: "image", src: "/media/r1-purchases.png", caption: "Last purchases" },
  },
  R2: {
    title: "Audio clue",
    body: "A voice-note clip of the volunteer submitting copied code without understanding it.",
    media: { type: "audio", src: "/media/r2-vibe.mp3", caption: "Voice note" },
  },
  R3: {
    title: "Search history",
    body: "A screenshot of 1 A.M. search history. Decide which data points actually move the profile.",
    media: { type: "screenshot", src: "/media/r3-search.png", caption: "1 A.M. searches" },
  },
  R4: {
    title: "Two truths, one lie",
    body: "Three stated facts from the volunteer. One is fabricated.",
  },
  R5: {
    title: "Conflicting artifacts",
    body: "Browser tabs showing startup / Figma / YC ambition next to a wall of failing GitHub CI runs.",
    media: { type: "screenshot", src: "/media/r5-tabs.png", caption: "Vision vs. CI" },
  },
};

let currentRoundId = "R0";
let currentClue = ROUND_CLUES.R0;

function roundLabel(roundId) {
  if (!roundId) return "Round 0";
  if (roundId === "FINAL") return "Final";
  const n = String(roundId).replace(/^R/i, "");
  return `Round ${n}`;
}

function renderClueMedia(media) {
  const holder = document.getElementById("clue-media");
  if (!holder) return;
  holder.innerHTML = "";
  if (!media?.src) return;
  if (media.type === "audio") {
    holder.innerHTML = `<audio controls src="${media.src}"></audio>${
      media.caption ? `<figcaption>${media.caption}</figcaption>` : ""
    }`;
    return;
  }
  holder.innerHTML = `<img src="${media.src}" alt="${media.caption ?? "Clue"}" />${
    media.caption ? `<figcaption>${media.caption}</figcaption>` : ""
  }`;
}

function renderClueScreen() {
  const label = roundLabel(currentRoundId);
  document.getElementById("round-label").textContent = label;
  document.getElementById("clue-round").textContent = label;
  document.getElementById("clue-title").textContent = currentClue?.title ?? "Clue";
  document.getElementById("clue-text").textContent = currentClue?.body ?? "";
  renderClueMedia(currentClue?.media);
}

const clueScreen = document.getElementById("clue-screen");
const clueBtn = document.getElementById("clue-btn");
const clueBack = document.getElementById("clue-back");
let clueOpen = false;

function openClue() {
  if (inLobby) return;
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
  const audio = clueScreen.querySelector("audio");
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

clueBtn.addEventListener("click", openClue);
clueBack.addEventListener("click", closeClue);

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
}

function openLeaderboard() {
  if (inLobby) return;
  if (demoOpen) closeDemo();
  if (clueOpen) closeClue();
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
  else if (ROUND_CLUES[currentRoundId]) currentClue = ROUND_CLUES[currentRoundId];
  if (typeof snap.phase === "string") {
    setLobbyMode(snap.phase === "lobby");
  }
  if (typeof snap.clusterCount === "number") {
    rebuildClusters(snap.clusterCount);
  } else if (Array.isArray(snap.clusters)) {
    rebuildClusters(snap.clusters.length);
  }
  renderClueScreen();
  renderLeaderboard();
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
  networkGroup.rotation.y += delta * 0.03;

  const hubPulse = 1 + Math.sin(elapsed * 1.2) * 0.03;
  hub.scale.setScalar(hubPulse);
  hubWire.rotation.y -= delta * 0.08;
  hubWire.rotation.x += delta * 0.04;
  hubMat.emissiveIntensity = 1.6 + Math.sin(elapsed * 1.5) * 0.25;
  hubLight.intensity = 16 + Math.sin(elapsed * 1.5) * 3;

  for (const mesh of clusters) {
    const ud = mesh.userData;
    const animT = ud.animDuration > 0 ? Math.min(1, (elapsed - ud.animStart) / ud.animDuration) : 1;
    const eased = easeOutCubic(animT);
    ud.currentScale = THREE.MathUtils.lerp(ud.fromScale, ud.targetScale, eased);
    ud.currentEmissive = THREE.MathUtils.lerp(ud.fromEmissive, ud.targetEmissive, eased);

    mesh.position.y = ud.baseY + Math.sin(elapsed * ud.floatSpeed + ud.floatOffset) * 0.15;
    mesh.scale.setScalar(ud.currentScale);
    mesh.material.emissiveIntensity = ud.currentEmissive;

    const halo = ud.halo;
    if (halo) {
      halo.material.opacity = 0.2 + Math.min(1, ud.currentEmissive / 3) * 0.45;
      const haloScale = 1.8 + ud.currentScale * 0.9;
      halo.scale.set(haloScale, haloScale, 1);
    }

    if (ud.label) {
      const inv = 1 / Math.max(ud.currentScale, 0.001);
      ud.label.scale.set(1.35 * inv, 1.35 * inv, 1);
    }
  }

  for (const edge of edgeGroup.children) {
    const cluster = clusters.find((c) => c.userData.id === edge.userData.clusterId);
    if (cluster) {
      const positions = edge.geometry.attributes.position;
      positions.setXYZ(1, cluster.position.x, cluster.position.y, cluster.position.z);
      positions.needsUpdate = true;
    }
    if (edge.userData.targetOpacity !== undefined) {
      edge.material.opacity = THREE.MathUtils.lerp(
        edge.material.opacity,
        edge.userData.targetOpacity,
        0.08
      );
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
