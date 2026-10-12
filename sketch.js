/*
  YOU BRIGHTEN MY DAY
  ==================

  IMAGENS:
    mascote1.png ... mascote5.png
    together1.png ... together5.png

  SONS:
    music.mp3   - música de fundo
    mascot.wav  - nova mascote
    hands.wav   - mãos dadas
    fast.wav    - movimento acelerado
    ending.wav  - imagem final

  CONTROLOS:
    D = Mostrar debug
    R = Reiniciar
    T = Adicionar amigo de teste
    C = Comparar webcam original / iluminada
    M = Ativar ou silenciar som

  FUNCIONAMENTO:
    1 pessoa escolhe mascote levantando o braço.
    3 amigos aproximam-se e recebem novas mascotes.
    As mascotes dançam e evitam os rostos.
    A escuridão desaparece progressivamente.
    Depois da quarta mascote aparecer, aguardam-se
    mais 5 segundos antes da imagem final.
*/

// ====================================================
// CONFIGURAÇÕES
// ====================================================

const CFG = {
  totalMascots: 5,
  peopleToFinish: 4,

  // Escolha
  selectionMs: 1500,
  selectionGraceMs: 450,

  // Entrada de amigos
  closeFactor: 2.2,
  closeMin: 120,
  closeMax: 320,
  closeTime: 1000,
  closeGraceMs: 700,
  closeCooldownMs: 2200,
  closeHysteresis: 1.3,

  // Tracking
  trackDistance: 135,
  trackMaxDistance: 480,
  trackSmoothingStill: 0.18,
  trackSmoothingMoving: 0.55,
  trackDeadzone: 1.6,
  hostReclaimMs: 4000,
  friendReclaimMs: 15000,

  // BodyPose
  poseStaleMs: 2500,
  poseRestartMs: 8000,

  // Mãos
  handDistance: 50,
  handSizeFactor: 0.5,
  handHysteresis: 1.6,
  handEngageMs: 250,
  handGraceMs: 600,

  // Iluminação
  darkBrightness: 0.12,
  darkSaturation: 0.15,

  lightRadiusX: [0.23, 0.43, 0.75, 2.0],
  lightRadiusY: [0.66, 0.95, 1.35, 2.8],

  feather: 0.30,
  lightSmoothing: 0.055,

  // 1.0 = webcam original
  // 1.5 = imagem mais luminosa

  cameraBrightness: 1.62,
  exposureGamma: 0.56,
  exposureGain: 1.16,
  exposureRefreshFrames: 2,
  cameraSaturation: 1.08,

  finalBrightness: 1.88,
  finalExposureGamma: 0.48,
  finalExposureGain: 1.20,
  finalSaturation: 1.14,

  // Mascotes
  mascotSize: 145,

  minSpeed: 1.25,
  maxSpeed: 5.0,
  maxStep: 8.0,

  mascotFollowSmoothing: 0.24,

  spawnDuration: 1500,
  finalWaitMs: 5000,

  // Partículas
  burstCount: 50,
  maxParticles: 280,

  // Som
  musicVolume: 0.42,
  effectsVolume: 0.72,
  fastVolume: 0.45,

  fastOnThreshold: 0.43,
  fastOffThreshold: 0.24,

  // Testes
  testKey: true
};

// ====================================================
// VARIÁVEIS
// ====================================================

let video;
let bodyPose;

let poses = [];
let detections = [];

let mascotImages = [];
let togetherImages = [];

let phase = "choose";

let debug = false;
let compareOriginal = false;

let poseStatus = "Loading BodyPose...";
let poseError = "";

let lastPoseUpdate = 0;
let lastPoseRestart = -Infinity;
let poseRestartCount = 0;

let cards = [];

let selectionHand = null;
let lastSelectionHandAt = -Infinity;

let selectedCard = -1;
let selectionStarted = 0;

let participants = [];
let unusedMascots = [0, 1, 2, 3, 4];
let nextPersonId = 1;

let friendCandidate = null;
let friendCooldownUntil = 0;

let handLinks = new Map();
let handConnections = [];

let handPower = 0;
let handSoundActive = false;
let lastHandSound = -Infinity;

let movers = new Map();
let homePoint = null;

let particles = [];
let lightRings = [];
let ambientStars = [];

let movementClock = 0;
let movementPower = 0;
let movingSpeed = CFG.minSpeed;

let exposureCanvas = null;
let exposureCtx = null;
let exposureLUT = null;
let exposureLastFrame = -999;
let exposureMode = "";
let lightLayer = null;
let lightState = null;

let finalStarted = 0;

// ====================================================
// AUDIO VARIABLES
// ====================================================

const AUDIO_FILES = {
  music: "music.wav",
  mascot: "mascot.mp3",
  hands: "hands.wav",
  fast: "fast.wav",
  ending: "ending.wav"
};

let musicAudio = null;
let fastAudio = null;
let effects = {};

let audioUnlocked = false;
let audioMuted = false;

let audioButton = null;
let audioStatusBox = null;

let audioFileStatus = {};

let fastAudioActive = false;
let activeEffectSounds = new Set();

// ====================================================
// PRELOAD
// ====================================================

function preload() {
  bodyPose = ml5.bodyPose();

  for (let i = 0; i < CFG.totalMascots; i++) {
    mascotImages[i] = loadImage(
      `mascote${i + 1}.png`
    );
  }

  for (let i = 1; i <= CFG.totalMascots; i++) {
    togetherImages[i] = loadImage(
      `together${i}.png`
    );
  }
}

// ====================================================
// SETUP
// ====================================================

function setup() {
  const canvas = createCanvas(
    windowWidth,
    windowHeight
  );

  canvas.position(0, 0);

  canvas.style("position", "fixed");
  canvas.style("z-index", "1");
  canvas.style("display", "block");

  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";

  document.documentElement.style.margin = "0";
  document.documentElement.style.overflow = "hidden";

  pixelDensity(1);
  frameRate(30);

  lightLayer = createGraphics(width, height);
  lightLayer.pixelDensity(1);

  setupExposure();
  setupAudio();

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  try {
    bodyPose.detectStart(video, gotPoses);

    lastPoseUpdate = millis();
    poseStatus = "BodyPose started";
  } catch (error) {
    poseError = String(error.message || error);
    console.error(error);
  }

  window.addEventListener(
    "unhandledrejection",
    event => {
      console.warn(
        "Unhandled promise:",
        event.reason
      );
    }
  );

  layoutCards();
  createAmbientStars();
}

// ====================================================
// AUDIO: CARREGAMENTO
// ====================================================

function makeAudio(name, looping = false) {
  const filename = AUDIO_FILES[name];

  const audio = document.createElement("audio");

  audio.preload = "auto";
  audio.loop = looping;
  audio.volume = 0;

  audioFileStatus[name] = "loading";

  audio.addEventListener("canplay", () => {
    audioFileStatus[name] = "ready";
  });

  audio.addEventListener("error", () => {
    audioFileStatus[name] = "ERROR";

    console.error(
      "Não foi possível carregar:",
      filename
    );

    showAudioStatus(
      `Erro: não foi possível carregar ${filename}`,
      true
    );
  });

  audio.src = filename;
  audio.load();

  return audio;
}

function setupAudio() {
  musicAudio = makeAudio("music", true);
  fastAudio = makeAudio("fast", true);

  effects.mascot = makeAudio("mascot");
  effects.hands = makeAudio("hands");
  effects.ending = makeAudio("ending");

  // Botão HTML independente do p5.js.
  // Fica acima do canvas e recebe o clique
  // diretamente através do navegador.

  audioButton = document.createElement("button");

  audioButton.id = "enable-audio-button";
  audioButton.textContent = "🔊 CLICK TO ENABLE SOUND";

  Object.assign(audioButton.style, {
    position: "fixed",
    left: "20px",
    bottom: "20px",

    zIndex: "2147483647",

    padding: "16px 24px",
    border: "2px solid #ffffff",
    borderRadius: "12px",

    background: "#ffffff",
    color: "#111111",

    fontFamily: "Arial, sans-serif",
    fontSize: "15px",
    fontWeight: "bold",

    cursor: "pointer",
    pointerEvents: "auto",

    boxShadow: "0 4px 25px rgba(0,0,0,0.45)",

    touchAction: "manipulation"
  });

  document.body.appendChild(audioButton);

  // addEventListener em vez de mousePressed do p5.
  // É chamado diretamente pelo clique.

  audioButton.addEventListener(
    "click",
    enableAudio
  );

  audioStatusBox = document.createElement("div");

  audioStatusBox.id = "audio-status";

  Object.assign(audioStatusBox.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",

    zIndex: "2147483646",

    padding: "10px 14px",
    borderRadius: "10px",

    background: "rgba(0,0,0,0.72)",
    color: "white",

    fontFamily: "Arial, sans-serif",
    fontSize: "13px",

    pointerEvents: "none",
    display: "none",
    maxWidth: "340px"
  });

  document.body.appendChild(audioStatusBox);
}

function showAudioStatus(message, isError = false) {
  if (!audioStatusBox) return;

  audioStatusBox.textContent = message;
  audioStatusBox.style.display = "block";

  audioStatusBox.style.color =
    isError ? "#ffaaaa" : "#ffffff";
}

// ====================================================
// AUDIO: ATIVAR
// ====================================================

function enableAudio() {
  if (audioUnlocked) return;

  // Chamar play() diretamente no evento de clique.

  musicAudio.volume = CFG.musicVolume;
  fastAudio.volume = 0;

  const musicPromise = musicAudio.play();
  const fastPromise = fastAudio.play();

  if (fastPromise && fastPromise.catch) {
    fastPromise.catch(error => {
      audioFileStatus.fast = "PLAY ERROR";

      console.error(
        "Erro ao reproduzir fast.wav:",
        error
      );
    });
  }

  if (musicPromise && musicPromise.then) {
    musicPromise.then(() => {
      audioUnlocked = true;

      audioFileStatus.music = "playing";

      showAudioStatus("🔊 Som ativado");

      audioButton.remove();
      audioButton = null;

    }).catch(error => {
      audioFileStatus.music = "PLAY ERROR";

      console.error(
        "Erro ao reproduzir music.mp3:",
        error
      );

      // O botão permanece disponível,
      // permitindo tentar novamente.

      audioButton.textContent =
        "⚠️ SOUND ERROR — CLICK TO RETRY";

      showAudioStatus(
        "Não foi possível tocar music.mp3. Verifica o ficheiro e a consola.",
        true
      );
    });
  }
}

// ====================================================
// AUDIO: EFEITOS
// ====================================================

function playEffect(name, relativeVolume = 1) {
  if (!audioUnlocked || audioMuted) {
    return;
  }

  const original = effects[name];

  if (!original) return;

  const sound = original.cloneNode(true);

  sound.volume = constrain(
    CFG.effectsVolume * relativeVolume,
    0,
    1
  );

  activeEffectSounds.add(sound);

  const cleanup = () => {
    activeEffectSounds.delete(sound);
  };

  sound.addEventListener(
    "ended",
    cleanup,
    { once: true }
  );

  sound.addEventListener(
    "error",
    cleanup,
    { once: true }
  );

  const attempt = sound.play();

  if (attempt && attempt.catch) {
    attempt.catch(error => {
      audioFileStatus[name] = "PLAY ERROR";

      console.error(
        `Erro ao reproduzir ${AUDIO_FILES[name]}:`,
        error
      );

      cleanup();
    });
  }
}

// ====================================================
// AUDIO: ATUALIZAÇÃO
// ====================================================

function updateAudio() {
  if (!audioUnlocked) return;

  const musicTarget = audioMuted
    ? 0
    : CFG.musicVolume;

  musicAudio.volume = constrain(
    lerp(
      musicAudio.volume,
      musicTarget,
      0.055
    ),
    0,
    1
  );

  const playingGame =
    phase === "playing" ||
    phase === "finalTransition";

  const level = playingGame
    ? movementPower
    : 0;

  if (
    !fastAudioActive &&
    level >= CFG.fastOnThreshold
  ) {
    fastAudioActive = true;
  }

  if (
    fastAudioActive &&
    level <= CFG.fastOffThreshold
  ) {
    fastAudioActive = false;
  }

  const fastTarget =
    fastAudioActive && !audioMuted
      ? CFG.fastVolume
      : 0;

  fastAudio.volume = constrain(
    lerp(
      fastAudio.volume,
      fastTarget,
      fastAudioActive ? 0.12 : 0.07
    ),
    0,
    1
  );
}

function toggleAudioMute() {
  if (!audioUnlocked) {
    enableAudio();
    return;
  }

  audioMuted = !audioMuted;

  if (audioMuted) {
    for (const sound of activeEffectSounds) {
      sound.volume = 0;
    }
  }

  showAudioStatus(
    audioMuted
      ? "🔇 Som desligado — prime M para ativar"
      : "🔊 Som ativado"
  );
}

// ====================================================
// CÂMARA
// ====================================================

function videoAvailable() {
  return (
    video &&
    video.elt &&
    video.elt.readyState >= 2 &&
    video.elt.videoWidth > 0
  );
}

function cameraGeometry() {
  const vw = video ? video.width : 640;
  const vh = video ? video.height : 480;

  const s = min(
    width / vw,
    height / vh
  );

  return {
    x: (width - vw * s) / 2,
    y: (height - vh * s) / 2,
    w: vw * s,
    h: vh * s,
    s
  };
}

function screenPoint(x, y) {
  const g = cameraGeometry();

  return {
    x: width - (g.x + x * g.s),
    y: g.y + y * g.s
  };
}

function drawCamera(
  brightness = 1,
  saturation = 1
) {
  if (!videoAvailable()) return;

  const g = cameraGeometry();
  const ctx = drawingContext;

  ctx.save();

  ctx.translate(width, 0);
  ctx.scale(-1, 1);

  ctx.filter =
    `brightness(${brightness}) ` +
    `saturate(${saturation})`;

  ctx.drawImage(
    video.elt,
    g.x,
    g.y,
    g.w,
    g.h
  );

  ctx.restore();
}

// ====================================================
// EXPOSIÇÃO REAL DA WEBCAM (GAMMA, SEM FILTRO PRETO)
// ====================================================

function setupExposure() {
  exposureCanvas = document.createElement("canvas");
  exposureCanvas.width = 320;
  exposureCanvas.height = 240;
  exposureCtx = exposureCanvas.getContext("2d", {
    willReadFrequently: true
  });
  exposureLUT = new Uint8ClampedArray(256);
  exposureLastFrame = -999;
  exposureMode = "";
}

function updateExposure(finalMode = false) {
  if (!videoAvailable()) return false;
  if (!exposureCtx) setupExposure();

  const mode = finalMode ? "final" : "light";
  if (
    exposureMode === mode &&
    frameCount - exposureLastFrame < CFG.exposureRefreshFrames
  ) return true;

  exposureLastFrame = frameCount;
  exposureMode = mode;

  const gamma = finalMode
    ? CFG.finalExposureGamma
    : CFG.exposureGamma;
  const gain = finalMode
    ? CFG.finalExposureGain
    : CFG.exposureGain;

  for (let v = 0; v < 256; v++) {
    exposureLUT[v] = Math.min(
      255,
      Math.round(255 * gain * Math.pow(v / 255, gamma))
    );
  }

  const w = exposureCanvas.width;
  const h = exposureCanvas.height;
  exposureCtx.filter = "none";
  exposureCtx.drawImage(video.elt, 0, 0, w, h);

  try {
    const image = exposureCtx.getImageData(0, 0, w, h);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = exposureLUT[pixels[i]];
      pixels[i + 1] = exposureLUT[pixels[i + 1]];
      pixels[i + 2] = exposureLUT[pixels[i + 2]];
    }
    exposureCtx.putImageData(image, 0, 0);
    return true;
  } catch (error) {
    console.warn("Correção de exposição indisponível:", error);
    return false;
  }
}

function drawExposedCamera(finalMode = false) {
  if (!videoAvailable()) return;
  if (!updateExposure(finalMode)) {
    drawCamera(1, 1);
    return;
  }

  const g = cameraGeometry();
  const ctx = drawingContext;
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.filter = "none";
  ctx.drawImage(exposureCanvas, g.x, g.y, g.w, g.h);
  ctx.restore();
}

// ====================================================
// ILUMINAÇÃO
// ====================================================

function lightingTarget() {
  const stage = constrain(
    participants.length - 1,
    0,
    CFG.peopleToFinish - 1
  );

  const host = participants[0];

  return {
    x: host ? host.x : width / 2,

    y: host
      ? host.y + height * 0.06
      : height * 0.52,

    rx:
      width * CFG.lightRadiusX[stage],

    ry:
      height * CFG.lightRadiusY[stage]
  };
}

function updateLightPosition() {
  const target = lightingTarget();

  if (!lightState) {
    lightState = { ...target };
    return;
  }

  for (const key of [
    "x",
    "y",
    "rx",
    "ry"
  ]) {
    lightState[key] = lerp(
      lightState[key],
      target[key],
      CFG.lightSmoothing
    );
  }
}

function drawProgressiveLighting() {
  updateLightPosition();

  if (compareOriginal) {
    drawCamera(1, 1);
    return;
  }

  // 4/4: webcam totalmente visível; NÃO desenhar
  // fundo escuro nem máscara por cima da imagem.
  if (participants.length >= CFG.peopleToFinish) {
    drawExposedCamera(true);
    return;
  }

  // Apenas o exterior da luz é escuro.
  drawCamera(CFG.darkBrightness, CFG.darkSaturation);
  if (!videoAvailable()) return;
  if (!updateExposure(false)) return;

  const ctx = lightLayer.drawingContext;
  const g = cameraGeometry();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.clearRect(0, 0, width, height);

  // Interior: vídeo com exposição recuperada, em vez
  // de brightness() sobre uma imagem subexposta.
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(exposureCanvas, g.x, g.y, g.w, g.h);
  ctx.restore();

  const { x, y, rx, ry } = lightState;
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.translate(x, y);
  ctx.scale(rx, ry);

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1 - CFG.feather, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-x / rx, -y / ry, width / rx, height / ry);
  ctx.restore();

  push();
  imageMode(CORNER);
  image(lightLayer, 0, 0);
  pop();
}

// ====================================================
// BODYPOSE: KEYPOINTS
// ====================================================

function normalizeKeyName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getKeypoint(
  pose,
  name,
  minimum = 0.10
) {
  if (!pose) return null;

  const wanted = normalizeKeyName(name);

  let point = null;

  if (Array.isArray(pose.keypoints)) {
    point = pose.keypoints.find(
      k =>
        normalizeKeyName(
          k.name || k.part
        ) === wanted
    );
  }

  if (!point) {
    for (const key of Object.keys(pose)) {
      if (
        normalizeKeyName(key) === wanted
      ) {
        point = pose[key];
        break;
      }
    }
  }

  if (!point) return null;

  const x = point.x ?? point.position?.x;
  const y = point.y ?? point.position?.y;

  const confidence =
    point.confidence ?? point.score ?? 1;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    confidence < minimum
  ) {
    return null;
  }

  return { x, y, confidence };
}

function screenKey(pose, name) {
  const point = getKeypoint(pose, name);

  return point
    ? screenPoint(point.x, point.y)
    : null;
}

function gotPoses(results) {
  poses = Array.isArray(results)
    ? results
    : [];

  lastPoseUpdate = millis();

  poseStatus = poses.length
    ? `${poses.length} people detected`
    : "Searching for people";
}

function poseInfo(pose, index) {
  const left = getKeypoint(
    pose,
    "left_shoulder",
    0.2
  );

  const right = getKeypoint(
    pose,
    "right_shoulder",
    0.2
  );

  const id = pose?.id ?? null;

  if (left && right) {
    const size = dist(
      left.x,
      left.y,
      right.x,
      right.y
    );

    if (size >= 20) {
      return {
        index,
        id,

        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2,

        size,
        solid: true
      };
    }
  }

  const nose = getKeypoint(
    pose,
    "nose",
    0.3
  );

  if (nose) {
    return {
      index,
      id,

      x: nose.x,
      y: nose.y + 75,

      size: 0,
      solid: false
    };
  }

  return null;
}

function refreshDetections() {
  detections = [];

  for (let i = 0; i < poses.length; i++) {
    const info = poseInfo(
      poses[i],
      i
    );

    if (info) {
      detections.push(info);
    }
  }
}

function primaryPoseIndex() {
  let best = Infinity;
  let selected = -1;

  for (const d of detections) {
    const p = screenPoint(d.x, d.y);

    const distance = dist(
      p.x,
      p.y,
      width / 2,
      height / 2
    );

    if (distance < best) {
      best = distance;
      selected = d.index;
    }
  }

  return selected;
}

// ====================================================
// BODYPOSE WATCHDOG
// ====================================================

function checkPoseWatchdog() {
  if (
    !bodyPose ||
    !videoAvailable() ||
    poseError
  ) {
    return;
  }

  const now = millis();
  const silent = now - lastPoseUpdate;

  if (
    silent > CFG.poseStaleMs &&
    poses.length > 0
  ) {
    poses = [];
  }

  if (
    silent > CFG.poseRestartMs &&
    now - lastPoseRestart >
      CFG.poseRestartMs
  ) {
    lastPoseRestart = now;
    poseRestartCount++;

    try {
      bodyPose.detectStop();
      bodyPose.detecting = false;

      bodyPose.detectStart(
        video,
        gotPoses
      );
    } catch (error) {
      console.warn(
        "BodyPose restart error:",
        error
      );
    }
  }
}

// ====================================================
// TRACKING
// ====================================================

function makePerson(options) {
  const now = millis();

  return {
    id: nextPersonId++,
    mascot: options.mascot,

    cameraX: options.cameraX,
    cameraY: options.cameraY,
    size: options.size || 0,

    x: options.screen.x,
    y: options.screen.y,

    poseIndex: options.poseIndex ?? -1,
    poseId: options.poseId ?? null,

    seenAt: options.seenAt ?? now,

    spawnStart: now,

    danceUntil:
      now + (options.danceMs || 1600),

    isTest: !!options.isTest
  };
}

function smoothCoordinate(
  previous,
  measured
) {
  const difference = abs(
    measured - previous
  );

  if (
    difference < CFG.trackDeadzone
  ) {
    return previous;
  }

  const amount = constrain(
    difference / 35,
    0,
    1
  );

  const factor = lerp(
    CFG.trackSmoothingStill,
    CFG.trackSmoothingMoving,
    amount
  );

  return lerp(
    previous,
    measured,
    factor
  );
}

function applyDetection(
  person,
  detection,
  now
) {
  const missing = now - person.seenAt;

  if (missing > 500) {
    person.cameraX = detection.x;
    person.cameraY = detection.y;
  } else {
    person.cameraX = smoothCoordinate(
      person.cameraX,
      detection.x
    );

    person.cameraY = smoothCoordinate(
      person.cameraY,
      detection.y
    );
  }

  if (detection.size > 0) {
    person.size = person.size
      ? lerp(
          person.size,
          detection.size,
          0.18
        )
      : detection.size;
  }

  const p = screenPoint(
    person.cameraX,
    person.cameraY
  );

  person.x = p.x;
  person.y = p.y;

  person.poseIndex = detection.index;
  person.poseId = detection.id;
  person.seenAt = now;
}

function updateTrackedPeople() {
  const now = millis();
  const host = participants[0];

  const possibleMatches = [];

  for (const person of participants) {
    if (person.isTest) {
      person.poseIndex = -1;
      continue;
    }

    const missing = now - person.seenAt;

    if (
      person !== host &&
      missing > CFG.friendReclaimMs
    ) {
      person.poseIndex = -1;
      continue;
    }

    const base = max(
      CFG.trackDistance,
      person.size * 1.3
    );

    let reach = min(
      CFG.trackMaxDistance,
      base + missing * 0.12
    );

    if (
      person === host &&
      missing > CFG.hostReclaimMs
    ) {
      reach = Infinity;
    }

    for (const detection of detections) {
      const gap = dist(
        person.cameraX,
        person.cameraY,
        detection.x,
        detection.y
      );

      const sameId =
        detection.id != null &&
        detection.id === person.poseId;

      if (
        gap > reach &&
        !(sameId && gap < reach * 2)
      ) {
        continue;
      }

      possibleMatches.push({
        person,
        detection,

        score:
          gap * (sameId ? 0.4 : 1) -
          (person === host ? 6 : 0)
      });
    }
  }

  possibleMatches.sort(
    (a, b) => a.score - b.score
  );

  const usedPeople = new Set();
  const usedDetections = new Set();

  for (const match of possibleMatches) {
    if (
      usedPeople.has(match.person) ||
      usedDetections.has(
        match.detection.index
      )
    ) {
      continue;
    }

    usedPeople.add(match.person);

    usedDetections.add(
      match.detection.index
    );

    applyDetection(
      match.person,
      match.detection,
      now
    );
  }

  for (const person of participants) {
    if (!usedPeople.has(person)) {
      person.poseIndex = -1;
    }
  }
}

// ====================================================
// SELEÇÃO COM O BRAÇO
// ====================================================

function raisedHand() {
  const index = primaryPoseIndex();

  if (index < 0) return null;

  const pose = poses[index];
  const candidates = [];

  for (const side of [
    "left",
    "right"
  ]) {
    const shoulder = screenKey(
      pose,
      side + "_shoulder"
    );

    const elbow = screenKey(
      pose,
      side + "_elbow"
    );

    const wrist = screenKey(
      pose,
      side + "_wrist"
    );

    if (!shoulder) continue;

    if (
      wrist &&
      wrist.y < shoulder.y + 40
    ) {
      candidates.push({
        x: wrist.x,
        y: wrist.y,
        lift: shoulder.y - wrist.y
      });

    } else if (
      !wrist &&
      elbow &&
      elbow.y < shoulder.y + 20
    ) {
      const dx = elbow.x - shoulder.x;
      const dy = elbow.y - shoulder.y;

      candidates.push({
        x: constrain(
          elbow.x + dx * 1.25,
          0,
          width
        ),

        y: constrain(
          elbow.y + dy * 1.25,
          0,
          height
        ),

        lift: shoulder.y - elbow.y
      });
    }
  }

  candidates.sort(
    (a, b) => b.lift - a.lift
  );

  return candidates[0] || null;
}

// ====================================================
// ESCOLHA: LAYOUT
// ====================================================

function layoutCards() {
  cards = [];

  if (width >= 750) {
    const size = min(
      185,
      (width - 80) / 5.35,
      height * 0.29
    );

    const gap = min(
      18,
      size * 0.12
    );

    const totalWidth =
      size * 5 + gap * 4;

    for (let i = 0; i < 5; i++) {
      cards.push({
        x:
          (width - totalWidth) / 2 +
          i * (size + gap),

        y:
          height * 0.45 -
          size / 2,

        w: size,
        h: size
      });
    }

  } else {
    const size = min(
      (width - 55) / 3,
      height * 0.20,
      150
    );

    const gap = 12;

    for (let i = 0; i < 5; i++) {
      const first = i < 3;
      const count = first ? 3 : 2;
      const index = first ? i : i - 3;

      const totalWidth =
        count * size +
        (count - 1) * gap;

      cards.push({
        x:
          (width - totalWidth) / 2 +
          index * (size + gap),

        y:
          height *
          (first ? 0.34 : 0.59),

        w: size,
        h: size
      });
    }
  }
}

// ====================================================
// TEXTO
// ====================================================

function centerText(
  message,
  y,
  fontSize = 24
) {
  push();

  textFont("Arial");
  textStyle(BOLD);
  textAlign(CENTER, CENTER);

  textSize(
    min(
      fontSize,
      max(13, width / 18)
    )
  );

  fill(255);

  drawingContext.shadowColor =
    "rgba(0,0,0,0.95)";

  drawingContext.shadowBlur = 12;

  text(
    String(message),
    width * 0.03,
    y - 36,
    width * 0.94,
    72
  );

  pop();
}

// ====================================================
// ECRÃ DE ESCOLHA
// ====================================================

function drawChoose() {
  drawCamera(0.78, 0.88);

  push();
  noStroke();
  fill(0, 85);

  rect(0, 0, width, height);

  pop();

  const now = millis();
  const detected = raisedHand();

  if (detected) {
    selectionHand = detected;
    lastSelectionHandAt = now;

  } else if (
    now - lastSelectionHandAt >
      CFG.selectionGraceMs
  ) {
    selectionHand = null;
  }

  if (selectionHand) {
    const g = cameraGeometry();

    const ratio = constrain(
      (selectionHand.x - g.x) / g.w,
      0,
      0.999
    );

    const option = floor(
      ratio * CFG.totalMascots
    );

    if (option !== selectedCard) {
      selectedCard = option;
      selectionStarted = now;
    }

    if (
      detected &&
      now - selectionStarted >=
        CFG.selectionMs
    ) {
      confirmMascot(option);
    }

  } else {
    selectedCard = -1;
    selectionStarted = 0;
  }

  centerText(
    "YOU BRIGHTEN MY DAY",
    40,
    20
  );

  centerText(
    "Choose your mascot!",
    height * 0.16,
    36
  );


  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const active = selectedCard === i;

    push();

    stroke(
      active
        ? color(255, 235, 130)
        : color(160)
    );

    strokeWeight(
      active ? 4 : 1.5
    );

    fill(20, 20, 30, 220);

    rect(
      card.x,
      card.y,
      card.w,
      card.h,
      17
    );

    imageMode(CENTER);

    image(
      mascotImages[i],

      card.x + card.w / 2,

      card.y + card.h / 2 +
        sin(
          frameCount * 0.045 + i
        ) * 4,

      card.w * 0.79,
      card.h * 0.79
    );

    if (active) {
      const amount = constrain(
        (now - selectionStarted) /
          CFG.selectionMs,
        0,
        1
      );

      noFill();

      stroke(255, 230, 120);
      strokeWeight(6);

      arc(
        card.x + card.w / 2,
        card.y + card.h / 2,
        card.w * 0.94,
        card.h * 0.94,
        -HALF_PI,
        -HALF_PI + TWO_PI * amount
      );
    }

    pop();
  }

  if (selectionHand) {
    push();

    noFill();
    stroke(255, 245, 150);
    strokeWeight(3);

    circle(
      selectionHand.x,
      selectionHand.y,
      34
    );

    pop();
  }

  let status = "Raise your arm";

  if (poseError) {
    status = "BodyPose error";

  } else if (!poses.length) {
    status = "Waiting for person";

  } else if (selectionHand) {
    status = "Hold your arm to select";
  }

  centerText(
    status,
    height * 0.83,
    18
  );
}

// ====================================================
// PRIMEIRA MASCOTE
// ====================================================

function confirmMascot(index) {
  if (
    phase !== "choose" ||
    index < 0 ||
    index >= CFG.totalMascots
  ) {
    return;
  }

  const poseIndex = primaryPoseIndex();

  if (poseIndex < 0) return;

  const info = detections.find(
    d => d.index === poseIndex
  );

  if (!info) return;

  const position = screenPoint(
    info.x,
    info.y
  );

  participants = [
    makePerson({
      mascot: index,

      cameraX: info.x,
      cameraY: info.y,

      size: info.size,
      screen: position,

      poseIndex,
      poseId: info.id,

      danceMs: 1400
    })
  ];

  unusedMascots = [
    0, 1, 2, 3, 4
  ].filter(i => i !== index);

  phase = "playing";

  selectedCard = -1;
  selectionHand = null;

  friendCandidate = null;
  friendCooldownUntil = 0;

  handLinks.clear();
  handConnections = [];
  handPower = 0;

  movers.clear();
  homePoint = null;

  lightState = null;

  particles = [];
  lightRings = [];

  createSpawnEffect(
    position.x,
    position.y
  );

  playEffect("mascot");
}

// ====================================================
// AMIGOS: DETEÇÃO DE PROXIMIDADE
// ====================================================

function detectCloseFriend() {
  const now = millis();

  if (now < friendCooldownUntil) {
    friendCandidate = null;
    return;
  }

  if (
    participants.length >=
      CFG.peopleToFinish
  ) {
    return;
  }

  const anchors = participants.filter(
    person =>
      !person.isTest &&
      person.poseIndex >= 0
  );

  if (!anchors.length) {
    friendCandidate = null;
    return;
  }

  const assigned = new Set(
    anchors.map(
      person => person.poseIndex
    )
  );

  const candidates = [];

  for (const detection of detections) {
    if (
      assigned.has(detection.index) ||
      !detection.solid
    ) {
      continue;
    }

    let nearest = Infinity;
    let limit = 0;
    let duplicate = false;

    for (const anchor of anchors) {
      const distance = dist(
        detection.x,
        detection.y,
        anchor.cameraX,
        anchor.cameraY
      );

      const size =
        anchor.size ||
        detection.size;

      if (
        distance <
        max(
          40,
          0.55 * min(
            detection.size,
            size
          )
        )
      ) {
        duplicate = true;
        break;
      }

      if (distance < nearest) {
        nearest = distance;

        limit = constrain(
          CFG.closeFactor *
            (
              (size + detection.size) /
              2
            ),

          CFG.closeMin,
          CFG.closeMax
        );
      }
    }

    if (duplicate) continue;

    const hysteresis =
      friendCandidate
        ? CFG.closeHysteresis
        : 1;

    if (
      nearest >
      limit * hysteresis
    ) {
      continue;
    }

    candidates.push({
      info: detection,
      distance: nearest
    });
  }

  candidates.sort(
    (a, b) =>
      a.distance - b.distance
  );

  let selected = null;

  if (friendCandidate) {
    selected = candidates.find(
      candidate => {
        const sameId =
          candidate.info.id != null &&
          candidate.info.id ===
            friendCandidate.id;

        const gap = dist(
          candidate.info.x,
          candidate.info.y,
          friendCandidate.x,
          friendCandidate.y
        );

        return sameId || gap < 150;
      }
    );

  } else {
    selected = candidates[0] || null;
  }

  if (selected) {
    if (!friendCandidate) {
      friendCandidate = {
        x: selected.info.x,
        y: selected.info.y,

        id: selected.info.id,
        size: selected.info.size,

        since: now,
        lastSeen: now
      };

    } else {
      friendCandidate.x = selected.info.x;
      friendCandidate.y = selected.info.y;
      friendCandidate.id = selected.info.id;
      friendCandidate.size = selected.info.size;
      friendCandidate.lastSeen = now;
    }
  }

  if (
    friendCandidate &&
    now - friendCandidate.lastSeen >
      CFG.closeGraceMs
  ) {
    friendCandidate = null;
    return;
  }

  if (
    friendCandidate &&
    selected &&
    now - friendCandidate.since >=
      CFG.closeTime
  ) {
    registerFriend(selected.info);
  }
}

// ====================================================
// REGISTAR NOVO AMIGO
// ====================================================

function registerFriend(info) {
  if (
    participants.length >=
      CFG.peopleToFinish ||
    !unusedMascots.length
  ) {
    return;
  }

  const index = floor(
    random(unusedMascots.length)
  );

  const mascot = unusedMascots.splice(
    index,
    1
  )[0];

  const position = screenPoint(
    info.x,
    info.y
  );

  participants.push(
    makePerson({
      mascot,

      cameraX: info.x,
      cameraY: info.y,

      size: info.size,
      screen: position,

      poseIndex: info.index,
      poseId: info.id,

      danceMs: 2000
    })
  );

  createSpawnEffect(
    position.x,
    position.y
  );

  playEffect("mascot");

  friendCandidate = null;

  friendCooldownUntil =
    millis() + CFG.closeCooldownMs;

  for (const person of participants) {
    person.danceUntil =
      millis() + 1600;
  }

  if (
    participants.length >=
      CFG.peopleToFinish
  ) {
    phase = "finalTransition";
    finalStarted = millis();
  }
}

// ====================================================
// PROGRESSO DE PROXIMIDADE
// ====================================================

function drawCloseProgress() {
  if (
    phase !== "playing" ||
    !friendCandidate
  ) {
    return;
  }

  const amount = constrain(
    (millis() - friendCandidate.since) /
      CFG.closeTime,
    0,
    1
  );

  const p = screenPoint(
    friendCandidate.x,
    friendCandidate.y
  );

  const g = cameraGeometry();

  const radius = constrain(
    friendCandidate.size * g.s * 0.9,
    45,
    130
  );

  push();
  noFill();

  stroke(255, 235, 150, 70);
  strokeWeight(4);

  circle(
    p.x,
    p.y,
    radius * 2
  );

  stroke(255, 235, 150, 230);
  strokeWeight(6);

  arc(
    p.x,
    p.y,
    radius * 2,
    radius * 2,
    -HALF_PI,
    -HALF_PI + TWO_PI * amount
  );

  pop();
}

// ====================================================
// MÃOS DADAS
// ====================================================

function detectHandHolding() {
  const now = millis();
  const seen = new Set();

  const visible = participants.filter(
    person =>
      !person.isTest &&
      person.poseIndex >= 0 &&
      poses[person.poseIndex]
  );

  for (let i = 0; i < visible.length; i++) {
    for (
      let j = i + 1;
      j < visible.length;
      j++
    ) {
      const a = visible[i];
      const b = visible[j];

      const poseA = poses[a.poseIndex];
      const poseB = poses[b.poseIndex];

      let closest = null;
      let nearest = Infinity;

      for (const sideA of [
        "left",
        "right"
      ]) {
        const wristA = getKeypoint(
          poseA,
          sideA + "_wrist",
          0.15
        );

        if (!wristA) continue;

        for (const sideB of [
          "left",
          "right"
        ]) {
          const wristB = getKeypoint(
            poseB,
            sideB + "_wrist",
            0.15
          );

          if (!wristB) continue;

          const distance = dist(
            wristA.x,
            wristA.y,
            wristB.x,
            wristB.y
          );

          if (distance < nearest) {
            nearest = distance;

            closest = {
              a: wristA,
              b: wristB
            };
          }
        }
      }

      const key = `${a.id}-${b.id}`;
      const previous = handLinks.get(key);

      const size =
        (a.size + b.size) / 2;

      const engage = max(
        CFG.handDistance,
        CFG.handSizeFactor * size
      );

      const limit = previous
        ? engage * CFG.handHysteresis
        : engage;

      if (
        !closest ||
        nearest > limit
      ) {
        continue;
      }

      const pa = screenPoint(
        closest.a.x,
        closest.a.y
      );

      const pb = screenPoint(
        closest.b.x,
        closest.b.y
      );

      if (previous) {
        previous.a.x = lerp(
          previous.a.x,
          pa.x,
          0.25
        );

        previous.a.y = lerp(
          previous.a.y,
          pa.y,
          0.25
        );

        previous.b.x = lerp(
          previous.b.x,
          pb.x,
          0.25
        );

        previous.b.y = lerp(
          previous.b.y,
          pb.y,
          0.25
        );

        if (
          now - previous.lastSeen > 250
        ) {
          previous.since = now;
        }

        previous.lastSeen = now;

      } else {
        handLinks.set(key, {
          a: pa,
          b: pb,

          personA: a,
          personB: b,

          since: now,
          lastSeen: now,

          strength: 0
        });
      }

      seen.add(key);
    }
  }

  let strongest = 0;

  for (const [key, link] of handLinks) {
    const holding =
      seen.has(key) ||
      now - link.lastSeen <
        CFG.handGraceMs;

    const engaged =
      now - link.since >=
        CFG.handEngageMs;

    const target =
      holding && engaged ? 1 : 0;

    link.strength = lerp(
      link.strength,
      target,
      target ? 0.14 : 0.07
    );

    if (
      !holding &&
      link.strength < 0.03
    ) {
      handLinks.delete(key);
      continue;
    }

    if (link.strength > 0.35) {
      link.personA.danceUntil =
        now + 450;

      link.personB.danceUntil =
        now + 450;
    }

    if (
      link.strength > 0.5 &&
      frameCount % 4 === 0
    ) {
      spawnParticles(
        (link.a.x + link.b.x) / 2,
        (link.a.y + link.b.y) / 2,
        2,
        "hands"
      );
    }

    strongest = max(
      strongest,
      link.strength
    );
  }

  handConnections = Array.from(
    handLinks.values()
  ).filter(
    link => link.strength > 0.03
  );

  handPower = lerp(
    handPower,
    strongest,
    strongest > handPower
      ? 0.10
      : 0.05
  );

  const holdingNow = handConnections.some(
    link => link.strength > 0.55
  );

  if (
    holdingNow &&
    !handSoundActive &&
    now - lastHandSound > 1800
  ) {
    playEffect("hands", 0.85);
    lastHandSound = now;
  }

  handSoundActive = holdingNow;
}

function drawHandConnections() {
  for (const connection of handConnections) {
    const strength = constrain(
      connection.strength,
      0,
      1
    );

    push();

    drawingContext.shadowColor =
      "rgba(255,225,130,0.9)";

    drawingContext.shadowBlur =
      25 * strength;

    stroke(
      255,
      225,
      140,
      70 * strength
    );

    strokeWeight(16);

    line(
      connection.a.x,
      connection.a.y,
      connection.b.x,
      connection.b.y
    );

    stroke(
      255,
      237,
      176,
      210 * strength
    );

    strokeWeight(4);

    line(
      connection.a.x,
      connection.a.y,
      connection.b.x,
      connection.b.y
    );

    noStroke();

    fill(
      255,
      250,
      210,
      235 * strength
    );

    circle(
      (connection.a.x + connection.b.x) / 2,
      (connection.a.y + connection.b.y) / 2,
      12 * strength
    );

    pop();
  }
}

// ====================================================
// BRAÇOS ERGUIDOS
// ====================================================

function raisedArmsAmount() {
  let amount = 0;

  for (const person of participants) {
    if (person.poseIndex < 0) {
      continue;
    }

    const pose = poses[person.poseIndex];

    if (!pose) continue;

    for (const side of [
      "left",
      "right"
    ]) {
      const shoulder = screenKey(
        pose,
        side + "_shoulder"
      );

      const wrist = screenKey(
        pose,
        side + "_wrist"
      );

      if (shoulder && wrist) {
        amount = max(
          amount,
          constrain(
            (shoulder.y - wrist.y) / 100,
            0,
            1
          )
        );
      }
    }
  }

  return amount;
}

// ====================================================
// POSIÇÃO DE REFERÊNCIA
// ====================================================

function updateHomePoint(host, dt) {
  let target = {
    x: host.x,
    y: host.y
  };

  if (
    host.poseIndex < 0 &&
    millis() - host.seenAt > 6000
  ) {
    const others = participants.filter(
      person =>
        person !== host &&
        person.poseIndex >= 0
    );

    if (others.length) {
      target = {
        x:
          others.reduce(
            (sum, person) =>
              sum + person.x,
            0
          ) / others.length,

        y:
          others.reduce(
            (sum, person) =>
              sum + person.y,
            0
          ) / others.length
      };

    } else {
      target = {
        x: width / 2,
        y: height * 0.55
      };
    }
  }

  if (!homePoint) {
    homePoint = { ...target };

  } else {
    const factor = constrain(
      0.055 * dt,
      0,
      1
    );

    homePoint.x = lerp(
      homePoint.x,
      target.x,
      factor
    );

    homePoint.y = lerp(
      homePoint.y,
      target.y,
      factor
    );
  }

  return homePoint;
}

// ====================================================
// EVITAR ROSTOS
// ====================================================

function faceZones() {
  const zones = [];

  for (const pose of poses) {
    const nose = screenKey(
      pose,
      "nose"
    );

    if (!nose) continue;

    const left = screenKey(
      pose,
      "left_shoulder"
    );

    const right = screenKey(
      pose,
      "right_shoulder"
    );

    const shoulderWidth =
      left && right
        ? dist(
            left.x,
            left.y,
            right.x,
            right.y
          )
        : 120;

    zones.push({
      x: nose.x,

      y:
        nose.y -
        shoulderWidth * 0.12,

      rx:
        max(
          75,
          shoulderWidth * 0.58
        ) +
        CFG.mascotSize * 0.5 +
        22,

      ry:
        max(
          100,
          shoulderWidth * 0.75
        ) +
        CFG.mascotSize * 0.5 +
        22
    });
  }

  return zones;
}

function keepInsideScreen(x, y) {
  const margin = min(
    CFG.mascotSize * 0.58 + 12,
    width * 0.30,
    height * 0.30
  );

  const topMargin = min(
    height * 0.27,
    160 + margin
  );

  return {
    x: constrain(
      x,
      min(margin, width / 2),
      max(width - margin, width / 2)
    ),

    y: constrain(
      y,
      min(topMargin, height / 2),
      max(height - margin, height / 2)
    )
  };
}

function safetyPenalty(
  x,
  y,
  zones,
  occupied
) {
  let penalty = 0;

  for (const zone of zones) {
    const dx =
      (x - zone.x) /
      max(1, zone.rx);

    const dy =
      (y - zone.y) /
      max(1, zone.ry);

    const distance = sqrt(
      dx * dx + dy * dy
    );

    if (distance < 1.1) {
      penalty += pow(
        1.1 - distance,
        2
      ) * 12000;
    }
  }

  for (const other of occupied) {
    const distance = dist(
      x,
      y,
      other.x,
      other.y
    );

    const minimum =
      CFG.mascotSize * 0.88;

    if (distance < minimum) {
      penalty += pow(
        (minimum - distance) / minimum,
        2
      ) * 6000;
    }
  }

  return penalty;
}

function initialMascotPosition(
  anchor,
  id,
  zones,
  occupied
) {
  let best = null;
  let bestScore = Infinity;

  const radius =
    min(width, height) * 0.30;

  for (let i = 0; i < 72; i++) {
    const angle =
      i * TWO_PI / 72 +
      id * 0.9;

    const candidate = keepInsideScreen(
      anchor.x +
        cos(angle) * radius,

      anchor.y +
        sin(angle) * radius * 0.75
    );

    const score =
      safetyPenalty(
        candidate.x,
        candidate.y,
        zones,
        occupied
      ) +
      dist(
        candidate.x,
        candidate.y,
        anchor.x,
        anchor.y
      ) * 0.1;

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best || keepInsideScreen(
    anchor.x,
    anchor.y
  );
}

// ====================================================
// MOVIMENTO DAS MASCOTES
// ====================================================

function moveMascots(dt) {
  const host = participants[0];

  if (!host) return;

  const home = updateHomePoint(
    host,
    dt
  );

  const zones = faceZones();
  const occupied = [];

  // Se apenas uma pessoa estiver visível, todas as mascotes
  // seguem essa pessoa, mesmo que não seja a anfitriã.
  const visible = participants.filter(
    p => !p.isTest && p.poseIndex >= 0 &&
      millis() - p.seenAt < 600
  );
  const singleVisible = visible.length === 1 ? visible[0] : null;

  for (const person of participants) {
    const anchor = singleVisible
      ? { x: singleVisible.x, y: singleVisible.y }
      : person === host || person.poseIndex < 0
        ? home
        : { x: person.x, y: person.y };

    let mover = movers.get(person.id);

    if (!mover) {
      const initial = initialMascotPosition(
        anchor,
        person.id,
        zones,
        occupied
      );

      mover = {
        x: initial.x,
        y: initial.y,

        vx: 0,
        vy: 0,

        phase: person.id * 1.83,

        anchorX: anchor.x,
        anchorY: anchor.y
      };

      movers.set(person.id, mover);
    }

    // Suavizar a referência do movimento.
    // Evita que pequenas oscilações do BodyPose
    // se transformem em tremores das mascotes.

    mover.anchorX = lerp(
      mover.anchorX,
      anchor.x,
      CFG.mascotFollowSmoothing
    );

    mover.anchorY = lerp(
      mover.anchorY,
      anchor.y,
      CFG.mascotFollowSmoothing
    );

    const t =
      movementClock + mover.phase;

    const radius =
      min(width, height) *
      (
        0.28 +
        0.045 * sin(t * 0.37)
      );

    const target = keepInsideScreen(
      mover.anchorX +
        cos(
          t * 0.72 +
          sin(t * 0.19)
        ) * radius +
        sin(t * 0.29) * 32,

      mover.anchorY +
        sin(t * 0.58) *
          radius * 0.73 +
        cos(t * 0.41) * 28
    );

    const direction = atan2(
      target.y - mover.y,
      target.x - mover.x
    );

    const speed = constrain(
      movingSpeed * dt,
      0.1,
      CFG.maxStep
    );

    const angles = [
      0,
      0.3,
      -0.3,
      0.65,
      -0.65,
      1,
      -1,
      1.5,
      -1.5,
      PI
    ];

    let best = null;
    let bestScore = Infinity;

    for (const offset of angles) {
      const angle = direction + offset;

      const candidate = keepInsideScreen(
        mover.x +
          cos(angle) * speed,

        mover.y +
          sin(angle) * speed
      );

      const score =
        safetyPenalty(
          candidate.x,
          candidate.y,
          zones,
          occupied
        ) +
        dist(
          candidate.x,
          candidate.y,
          target.x,
          target.y
        ) * 0.7;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    const currentScore =
      safetyPenalty(
        mover.x,
        mover.y,
        zones,
        occupied
      ) +
      dist(
        mover.x,
        mover.y,
        target.x,
        target.y
      ) * 0.7;

    if (
      best &&
      bestScore <= currentScore + 4
    ) {
      mover.vx = lerp(
        mover.vx,
        best.x - mover.x,
        0.28
      );

      mover.vy = lerp(
        mover.vy,
        best.y - mover.y,
        0.28
      );

      const next = keepInsideScreen(
        mover.x + mover.vx,
        mover.y + mover.vy
      );

      mover.x = next.x;
      mover.y = next.y;

    } else {
      mover.vx *= 0.8;
      mover.vy *= 0.8;
    }

    occupied.push({
      x: mover.x,
      y: mover.y
    });

    if (frameCount % 5 === 0) {
      spawnParticles(
        mover.x,
        mover.y,
        1,
        "trail"
      );
    }
  }
}

// ====================================================
// DESENHAR MASCOTES
// ====================================================

function drawMascots() {
  const now = millis();

  for (const person of participants) {
    const mover = movers.get(person.id);

    const position = mover || {
      x: person.x,
      y: person.y
    };

    const age =
      now - person.spawnStart;

    const spawn = constrain(
      age / CFG.spawnDuration,
      0,
      1
    );

    const ease =
      1 - pow(1 - spawn, 3);

    const bounce =
      sin(spawn * PI * 3) *
      (1 - spawn) * 0.20;

    const scaleIn =
      0.15 + ease * 0.85 + bounce;

    const dancing =
      now < person.danceUntil;

    push();

    translate(
      position.x,
      position.y
    );

    drawingContext.globalAlpha =
      constrain(spawn * 2, 0, 1);

    noStroke();

    fill(
      255,
      240,
      170,
      dancing ? 45 : 20
    );

    circle(
      0,
      0,
      dancing ? 205 : 170
    );

    const floating = sin(
      frameCount *
        (dancing ? 0.10 : 0.05) +
      person.id
    ) * (dancing ? 10 : 5);

    translate(0, floating);

    rotate(
      sin(
        frameCount *
          (dancing ? 0.28 : 0.15) +
        person.id
      ) *
      (dancing ? 0.32 : 0.17)
    );

    const stretch =
      1 +
      sin(
        frameCount *
          (dancing ? 0.35 : 0.18) +
        person.id
      ) *
      (dancing ? 0.11 : 0.05);

    scale(
      scaleIn * stretch,
      scaleIn / stretch
    );

    imageMode(CENTER);

    image(
      mascotImages[person.mascot],
      0,
      0,
      CFG.mascotSize,
      CFG.mascotSize
    );

    pop();
  }
}

// ====================================================
// EFEITOS VISUAIS
// ====================================================

function createSpawnEffect(x, y) {
  lightRings.push({
    x,
    y,
    from: 20,
    to: 230,
    start: millis(),
    duration: 950
  });

  lightRings.push({
    x,
    y,
    from: 5,
    to: 150,
    start: millis() + 130,
    duration: 950
  });

  spawnParticles(
    x,
    y,
    CFG.burstCount,
    "burst"
  );
}

function spawnParticles(
  x,
  y,
  amount,
  type
) {
  for (let i = 0; i < amount; i++) {
    const angle = random(TWO_PI);

    const speed =
      type === "burst"
        ? random(2, 8)
        : random(0.2, 2.2);

    const life =
      type === "burst"
        ? random(35, 80)
        : random(15, 35);

    particles.push({
      x,
      y,

      vx: cos(angle) * speed,
      vy: sin(angle) * speed,

      size: random(2, 7),

      life,
      maxLife: life,

      rotation: random(TWO_PI)
    });
  }

  if (
    particles.length >
      CFG.maxParticles
  ) {
    particles.splice(
      0,
      particles.length -
        CFG.maxParticles
    );
  }
}

function updateParticles(dt) {
  for (
    let i = particles.length - 1;
    i >= 0;
    i--
  ) {
    const particle = particles[i];

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.vy -= 0.015 * dt;

    particle.rotation += 0.025 * dt;
    particle.life -= dt;

    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawStarShape(
  x,
  y,
  inner,
  outer,
  points
) {
  const step = TWO_PI / points;

  beginShape();

  for (
    let angle = -HALF_PI;
    angle < TWO_PI - HALF_PI;
    angle += step
  ) {
    vertex(
      x + cos(angle) * outer,
      y + sin(angle) * outer
    );

    vertex(
      x +
        cos(angle + step / 2) * inner,
      y +
        sin(angle + step / 2) * inner
    );
  }

  endShape(CLOSE);
}

function drawParticles() {
  push();
  noStroke();

  for (const particle of particles) {
    const opacity = constrain(
      particle.life / particle.maxLife,
      0,
      1
    );

    push();

    translate(
      particle.x,
      particle.y
    );

    rotate(particle.rotation);

    fill(
      255,
      240,
      175,
      opacity * 230
    );

    drawStarShape(
      0,
      0,
      particle.size * 0.4,
      particle.size,
      4
    );

    pop();
  }

  pop();
}

function drawLightRings() {
  const now = millis();

  for (
    let i = lightRings.length - 1;
    i >= 0;
    i--
  ) {
    const ring = lightRings[i];

    if (now < ring.start) {
      continue;
    }

    const amount = constrain(
      (now - ring.start) /
        ring.duration,
      0,
      1
    );

    const radius = lerp(
      ring.from,
      ring.to,
      1 - pow(1 - amount, 3)
    );

    push();
    noFill();

    stroke(
      255,
      230,
      150,
      245 * (1 - amount)
    );

    strokeWeight(
      lerp(9, 1.5, amount)
    );

    circle(
      ring.x,
      ring.y,
      radius * 2
    );

    pop();

    if (amount >= 1) {
      lightRings.splice(i, 1);
    }
  }
}

// ====================================================
// ESTRELAS AMBIENTE
// ====================================================

function createAmbientStars() {
  ambientStars = [];

  for (let i = 0; i < 120; i++) {
    ambientStars.push({
      x: random(width),
      y: random(height),

      size: random(1, 3.5),
      speed: random(0.15, 0.65),

      phase: random(TWO_PI),
      type: random()
    });
  }
}

function progress() {
  return constrain(
    (participants.length - 1) /
      (CFG.peopleToFinish - 1),
    0,
    1
  );
}

function drawAmbientStars() {
  const count = floor(
    ambientStars.length * progress()
  );

  push();
  noStroke();

  for (let i = 0; i < count; i++) {
    const star = ambientStars[i];

    star.y -= star.speed;

    if (star.y < -12) {
      star.y = height + 12;
      star.x = random(width);
    }

    const alpha =
      90 +
      (
        0.5 +
        0.5 * sin(
          frameCount * 0.04 +
          star.phase
        )
      ) * 130;

    fill(
      255,
      240,
      190,
      alpha
    );

    if (star.type > 0.82) {
      drawStarShape(
        star.x,
        star.y,
        star.size * 0.45,
        star.size * 2.4,
        4
      );

    } else {
      circle(
        star.x,
        star.y,
        star.size
      );
    }
  }

  pop();
}

// ====================================================
// HUD
// ====================================================

function drawHUD() {
  push();

  textFont("Arial");
  textStyle(BOLD);
  textAlign(LEFT, TOP);
  textSize(24);

  fill(255);

  drawingContext.shadowColor =
    "rgba(0,0,0,0.95)";

  drawingContext.shadowBlur = 12;

  text(
    `Mascots: ${participants.length} / ${CFG.peopleToFinish}`,
    30,
    20
  );

  pop();

  centerText(
    "YOU BRIGHTEN MY DAY",
    48,
    28
  );

  // Durante a transição final não mostrar mensagem secundária.
  if (phase !== "finalTransition") {
    let message = "Bring a friend";

    if (millis() < friendCooldownUntil) {
      message = "Bring another friend";
    } else if (poses.length >= 2) {
      message = "Stand close to unlock a friend";
    }

    centerText(message, 103, 25);
  }
}

// ====================================================
// ECRÃ FINAL
// ====================================================

function drawFinished() {
  if (compareOriginal) {
    drawCamera(1, 1);

  } else {
    drawExposedCamera(true);
  }

  drawAmbientStars();

  centerText(
    "YOU BRIGHTEN MY DAY",
    height * 0.14,
    30
  );

  const missingMascot =
    unusedMascots[0];

  const finalImage =
    missingMascot === undefined
      ? null
      : togetherImages[
          missingMascot + 1
        ];

  if (
    finalImage &&
    finalImage.width > 0
  ) {
    const factor = min(
      width * 0.75 /
        finalImage.width,

      height * 0.48 /
        finalImage.height
    );

    push();

    imageMode(CENTER);

    image(
      finalImage,
      width / 2,
      height * 0.47,

      finalImage.width * factor,
      finalImage.height * factor
    );

    pop();
  }

  centerText(
    "Better together.",
    height * 0.79,
    34
  );

  centerText(
    "Press R to restart",
    height * 0.90,
    16
  );
}

// ====================================================
// DEBUG
// ====================================================

function drawDebug() {
  push();

  noFill();
  strokeWeight(2);

  for (const pose of poses) {
    for (const side of [
      "left",
      "right"
    ]) {
      const shoulder = screenKey(
        pose,
        side + "_shoulder"
      );

      const elbow = screenKey(
        pose,
        side + "_elbow"
      );

      const wrist = screenKey(
        pose,
        side + "_wrist"
      );

      if (shoulder) {
        stroke(0, 255, 0);

        circle(
          shoulder.x,
          shoulder.y,
          13
        );
      }

      if (elbow) {
        stroke(255, 150, 0);

        circle(
          elbow.x,
          elbow.y,
          13
        );
      }

      if (wrist) {
        stroke(255, 0, 0);

        circle(
          wrist.x,
          wrist.y,
          13
        );
      }

      if (shoulder && elbow) {
        stroke(255, 230, 100);

        line(
          shoulder.x,
          shoulder.y,
          elbow.x,
          elbow.y
        );
      }

      if (elbow && wrist) {
        stroke(255, 230, 100);

        line(
          elbow.x,
          elbow.y,
          wrist.x,
          wrist.y
        );
      }
    }
  }

  for (const person of participants) {
    if (person.isTest) continue;

    stroke(
      person.poseIndex >= 0
        ? color(80, 255, 120)
        : color(255, 80, 80)
    );

    circle(
      person.x,
      person.y,
      28
    );
  }

  pop();

  const lines = [
    `FPS: ${frameRate().toFixed(0)}`,
    `BodyPose: ${poseStatus}`,
    `Detections: ${detections.length}`,
    `Mascots: ${participants.length}`,
    `Pose restarts: ${poseRestartCount}`,
    `Camera: ${compareOriginal ? "ORIGINAL" : "ILLUMINATED"}`,
    `Audio: ${audioUnlocked ? "ON" : "OFF"}`,
    `Muted: ${audioMuted}`
  ];

  for (const name of Object.keys(AUDIO_FILES)) {
    lines.push(
      `${AUDIO_FILES[name]}: ${audioFileStatus[name] || "unknown"}`
    );
  }

  if (musicAudio) {
    lines.push(
      `Music paused: ${musicAudio.paused}`
    );

    lines.push(
      `Music volume: ${musicAudio.volume.toFixed(2)}`
    );
  }

  if (phase === "finalTransition") {
    const remaining = max(
      0,
      CFG.spawnDuration +
      CFG.finalWaitMs -
      (millis() - finalStarted)
    );

    lines.push(
      `Final in: ${(remaining / 1000).toFixed(1)}s`
    );
  }

  const lineHeight = 19;
  const panelHeight =
    lines.length * lineHeight + 20;

  push();

  noStroke();
  fill(0, 220);

  rect(
    10,
    height - panelHeight - 10,
    480,
    panelHeight,
    10
  );

  fill(255);
  textFont("Arial");
  textStyle(NORMAL);
  textSize(13);
  textAlign(LEFT, TOP);

  lines.forEach((line, i) => {
    text(
      line,
      20,
      height - panelHeight +
        i * lineHeight
    );
  });

  pop();
}

// ====================================================
// DRAW PRINCIPAL
// ====================================================

function draw() {
  background(0);

  checkPoseWatchdog();
  refreshDetections();

  if (phase === "choose") {
    movementPower = 0;

    updateAudio();
    drawChoose();

    if (debug) {
      drawDebug();
    }

    return;
  }

  if (phase === "finished") {
    movementPower = 0;

    updateAudio();
    drawFinished();

    if (debug) {
      drawDebug();
    }

    return;
  }

  updateTrackedPeople();

  drawProgressiveLighting();
  drawAmbientStars();

  detectHandHolding();
  drawHandConnections();

  const dt = constrain(
    deltaTime / 16.67,
    0.4,
    1.6
  );

  const desiredMovement = max(
    raisedArmsAmount(),
    handPower * 0.75
  );

  movementPower = lerp(
    movementPower,
    desiredMovement,

    desiredMovement > movementPower
      ? 0.16
      : 0.07
  );

  movingSpeed = lerp(
    movingSpeed,

    lerp(
      CFG.minSpeed,
      CFG.maxSpeed,
      movementPower
    ),

    0.07
  );

  updateAudio();

  movementClock +=
    movingSpeed * 0.013 * dt;

  moveMascots(dt);

  drawLightRings();

  updateParticles(dt);
  drawParticles();

  drawMascots();

  if (phase === "playing") {
    detectCloseFriend();
  }

  drawCloseProgress();
  drawHUD();

  // Quarta mascote:
  // 1,5 s para terminar a animação,
  // depois mais 5 s antes da imagem final.

  if (
    phase === "finalTransition" &&
    millis() - finalStarted >=
      CFG.spawnDuration +
      CFG.finalWaitMs
  ) {
    phase = "finished";

    fastAudioActive = false;

    playEffect("ending", 0.9);
  }

  if (debug) {
    drawDebug();
  }
}

// ====================================================
// TESTE COM T
// ====================================================

function addTestFriend() {
  if (
    phase !== "playing" ||
    !participants.length ||
    !unusedMascots.length
  ) {
    return;
  }

  const host = participants[0];

  const position = keepInsideScreen(
    host.x + random(-150, 150),
    host.y + random(-100, 100)
  );

  const index = floor(
    random(unusedMascots.length)
  );

  const mascot = unusedMascots.splice(
    index,
    1
  )[0];

  participants.push(
    makePerson({
      mascot,

      cameraX: -10000,
      cameraY: -10000,

      size: 0,
      screen: position,

      poseIndex: -1,
      seenAt: -10000,

      isTest: true,
      danceMs: 2000
    })
  );

  createSpawnEffect(
    position.x,
    position.y
  );

  playEffect("mascot");

  for (const person of participants) {
    person.danceUntil =
      millis() + 1600;
  }

  if (
    participants.length >=
      CFG.peopleToFinish
  ) {
    phase = "finalTransition";
    finalStarted = millis();
  }
}

// ====================================================
// REINICIAR
// ====================================================

function restartGame() {
  phase = "choose";

  participants = [];
  unusedMascots = [0, 1, 2, 3, 4];

  nextPersonId = 1;

  selectionHand = null;
  selectedCard = -1;
  selectionStarted = 0;

  friendCandidate = null;
  friendCooldownUntil = 0;

  handLinks.clear();
  handConnections = [];

  handPower = 0;
  handSoundActive = false;

  movers.clear();
  homePoint = null;

  particles = [];
  lightRings = [];

  movementClock = 0;
  movementPower = 0;
  movingSpeed = CFG.minSpeed;

  lightState = null;
  finalStarted = 0;

  fastAudioActive = false;

  if (fastAudio) {
    fastAudio.volume = 0;
  }
}

// ====================================================
// TECLAS
// ====================================================

function keyPressed() {
  if (
    key === "d" ||
    key === "D"
  ) {
    debug = !debug;
  }

  if (
    key === "r" ||
    key === "R"
  ) {
    restartGame();
  }

  if (
    CFG.testKey &&
    (
      key === "t" ||
      key === "T"
    )
  ) {
    addTestFriend();
  }

  if (
    key === "c" ||
    key === "C"
  ) {
    compareOriginal = !compareOriginal;
  }

  if (
    key === "m" ||
    key === "M"
  ) {
    toggleAudioMute();
  }
}

// ====================================================
// REDIMENSIONAR
// ====================================================

function windowResized() {
  resizeCanvas(
    windowWidth,
    windowHeight
  );

  layoutCards();

  if (lightLayer) {
    lightLayer.remove();
  }

  lightLayer = createGraphics(
    width,
    height
  );

  lightLayer.pixelDensity(1);

  lightState = null;
  exposureLastFrame = -999;

  for (const mover of movers.values()) {
    const p = keepInsideScreen(
      mover.x,
      mover.y
    );

    mover.x = p.x;
    mover.y = p.y;
  }

  particles = [];
  lightRings = [];
}
