// Partes em 3D da tela, desenhadas como holograma: linhas finas acesas, miolo quase transparente e brilho
// espalhado (bloom). O canvas é desenhado sobre fundo preto e entra na página com "mix-blend-mode: screen",
// então o preto some e só a luz aparece por cima da interface.
//
// Tudo é montado em código (sem modelos baixados): o rack de servidores, à esquerda, e o iPhone, à direita.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function compositor(renderer, cena, camera, L, A, forca) {
  const c = new EffectComposer(renderer);
  c.setPixelRatio(renderer.getPixelRatio());
  c.setSize(L, A);
  c.addPass(new RenderPass(cena, camera));
  c.addPass(new UnrealBloomPass(new THREE.Vector2(L, A), forca, 0.3, 0.12));
  return c;
}

function criarRenderer(canvas, L, A, guardarQuadro) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: !!guardarQuadro });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.setSize(L, A, false);
  r.setClearColor(0x000000, 1);
  return r;
}

// ---------- materiais de holograma ----------

// Linhas: cor A embaixo do "corte", cor B acima dele (é assim que a armadura troca de cor de cima para baixo).
function materialLinhas(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying float vY;
      void main() {
        vY = (modelMatrix * vec4(position, 1.0)).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLinhaA;
      uniform vec3 uLinhaB;
      uniform float uCorte;
      uniform float uAlfa;
      uniform float uOpacidade;
      varying float vY;
      void main() {
        float novo = smoothstep(uCorte - 0.02, uCorte + 0.02, vY);
        vec3 c = mix(uLinhaA, uLinhaB, novo);
        float faixa = smoothstep(0.035, 0.0, abs(vY - uCorte));
        c += vec3(0.9, 1.0, 1.0) * faixa * 2.0;
        gl_FragColor = vec4(c, uOpacidade * uAlfa);
      }`,
  });
}

// Miolo: quase invisível, acende só nas bordas (fresnel).
function materialMiolo(u) {
  return new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vY = mundo.y;
        vec4 mv = viewMatrix * mundo;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMioloA;
      uniform vec3 uMioloB;
      uniform vec3 uBorda;
      uniform float uCorte;
      uniform float uAlfa;
      uniform float uBordaForca;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
        float novo = smoothstep(uCorte - 0.02, uCorte + 0.02, vY);
        vec3 c = mix(uMioloA, uMioloB, novo) * (0.025 + 0.32 * f);
        c += uBorda * pow(f, 4.0) * uBordaForca;
        float linha = 0.8 + 0.2 * step(0.5, fract(gl_FragCoord.y / 3.0));
        gl_FragColor = vec4(c * uAlfa * linha, 1.0);
      }`,
  });
}

function texturaBrilho() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.16, 'rgba(255,255,255,0.95)');
  r.addColorStop(0.26, 'rgba(255,255,255,0.15)');
  r.addColorStop(0.38, 'rgba(255,255,255,0.7)');
  r.addColorStop(0.46, 'rgba(255,255,255,0.05)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- foto da IA em holograma (quando a IA tem imagem) ----------
function carregarImagem(src) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = erro;
    img.src = src;
  });
}
async function fotoHolograma(src, L, A) {
  const img = await carregarImagem(src);
  const c = document.createElement('canvas');
  c.width = L; c.height = A;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // Imagem com fundo transparente: entra inteira (sem cortar) e com as cores originais.
  // Foto comum (fundo opaco): preenche a janela e vira holograma ciano.
  const teste = document.createElement('canvas');
  teste.width = 32; teste.height = 32;
  const tctx = teste.getContext('2d', { willReadFrequently: true });
  tctx.drawImage(img, 0, 0, 32, 32);
  const amostra = tctx.getImageData(0, 0, 32, 32).data;
  let transparentes = 0;
  for (let i = 3; i < amostra.length; i += 4) if (amostra[i] < 250) transparentes++;
  const temFundoTransparente = transparentes > 32;

  const esc = temFundoTransparente
    ? Math.min(L / img.width, A / img.height) * 0.94
    : Math.max(L / img.width, A / img.height);
  const w = img.width * esc, h = img.height * esc;
  ctx.drawImage(img, (L - w) / 2, (A - h) / 2 - (temFundoTransparente ? A * 0.03 : 0), w, h);
  const d = ctx.getImageData(0, 0, L, A);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const x = (i / 4) % L, y = Math.floor(i / 4 / L);
    const borda = suave(0, 30, x) * suave(0, 30, L - x) * suave(0, 24, y) * suave(0, 40, A - y);
    if (temFundoTransparente) {
      // mantém a transparência original: traços pretos continuam pretos e cobrem o fundo
      p[i + 3] *= borda;
    } else {
      const l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
      p[i] = 40 + 200 * Math.pow(l, 1.5);
      p[i + 1] = 170 + 85 * l;
      p[i + 2] = 230 + 25 * l;
      p[i + 3] = 255 * suave(0.1, 0.65, l) * borda;
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

// ============================================================
// SERVIDOR: rack que guarda as IAs. A gaveta da IA escolhida acende, desliza para fora,
// solta rastros de energia (como fumaça) e o rosto se materializa no meio deles.
// ============================================================

// ruído suave (value noise) para a fumaça e para o rosto se materializar
function criarRuido(L, A, escala, oitavas = 4) {
  const tam = 64;
  const base = new Float32Array(tam * tam).map(() => Math.random());
  const amostra = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v = (i, j) => base[((j & (tam - 1)) * tam) + (i & (tam - 1))];
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const saida = new Float32Array(L * A);
  let min = 9, max = -9;
  for (let y = 0; y < A; y++) {
    for (let x = 0; x < L; x++) {
      let v = 0, amp = 1, f = escala, soma = 0;
      for (let o = 0; o < oitavas; o++) { v += amostra(x * f, y * f) * amp; soma += amp; amp *= 0.5; f *= 2; }
      v /= soma;
      saida[y * L + x] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  for (let i = 0; i < saida.length; i++) saida[i] = (saida[i] - min) / (max - min);
  return { mapa: saida, amostra };
}

function hexParaRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// "rosto" de reserva para uma IA sem imagem: a inicial do nome, acesa
function rostoReserva(ia, L, A) {
  const c = document.createElement('canvas');
  c.width = L; c.height = A;
  const g = c.getContext('2d');
  g.font = `700 ${L * 0.6}px Rajdhani, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = ia.cor || '#3fd0ff';
  g.shadowBlur = 40;
  g.fillStyle = ia.cor || '#3fd0ff';
  g.fillText((ia.nome || '?').trim()[0], L / 2, A / 2);
  return c;
}

export async function criarServidor(canvasGL, canvas2D) {
  const L = canvas2D.width, A = canvas2D.height;
  const ctx = canvas2D.getContext('2d');
  const renderer = criarRenderer(canvasGL, L, A, true);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, L / A, 0.1, 100);
  camera.position.set(0, 0.9, 6.4);
  camera.lookAt(0, -0.05, 0);
  const comp = compositor(renderer, cena, camera, L, A, 0.7);

  const BRANCO = new THREE.Color('#e9f1fa');
  const uniLinhas = {
    uLinhaA: { value: BRANCO.clone() }, uLinhaB: { value: BRANCO.clone() },
    uCorte: { value: 99 }, uAlfa: { value: 1 }, uOpacidade: { value: 0.7 },
  };
  const uniFinas = { ...uniLinhas, uOpacidade: { value: 0.28 } };
  const uniMiolo = {
    uMioloA: { value: new THREE.Color('#8fb4d8') }, uMioloB: { value: new THREE.Color('#8fb4d8') },
    uBorda: { value: new THREE.Color('#ffffff') }, uCorte: { value: 99 }, uAlfa: { value: 0.8 }, uBordaForca: { value: 0.5 },
  };
  const matLinha = materialLinhas(uniLinhas);
  const matFina = materialLinhas(uniFinas);
  const matMiolo = materialMiolo(uniMiolo);

  // --- rack ---
  const W = 1.2, H = 2.3, D = 1.0, UNIDADES = 9;
  const rack = new THREE.Group();
  const caixa = new THREE.BoxGeometry(W, H, D);
  rack.add(new THREE.Mesh(caixa, matMiolo));
  rack.add(new THREE.LineSegments(new THREE.EdgesGeometry(caixa), matLinha));
  // trilhos e pés
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, -H / 2 + 0.05, D / 2), new THREE.Vector3(x, H / 2 - 0.05, D / 2)]);
    rack.add(new THREE.Line(g, matFina));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pe = new THREE.BoxGeometry(0.1, 0.06, 0.1);
    pe.translate(x * (W / 2 - 0.08), -H / 2 - 0.03, z * (D / 2 - 0.08));
    rack.add(new THREE.LineSegments(new THREE.EdgesGeometry(pe), matFina));
  }
  // grade de ventilação no topo
  for (let i = 1; i < 8; i++) {
    const x = -W / 2 + (W / 8) * i;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, H / 2 + 0.001, -D / 2 + 0.1), new THREE.Vector3(x, H / 2 + 0.001, D / 2 - 0.1)]);
    rack.add(new THREE.Line(g, matFina));
  }

  // --- gavetas (servidores 2U) ---
  const altU = (H - 0.3) / UNIDADES;
  const gavetas = [];
  for (let u = 0; u < UNIDADES; u++) {
    const y = H / 2 - 0.15 - altU * (u + 0.5);
    const grupo = new THREE.Group();
    grupo.position.set(0, y, D / 2 - 0.04);
    const corpoG = new THREE.BoxGeometry(W - 0.14, altU - 0.035, 0.9);
    corpoG.translate(0, 0, -0.45 + 0.04);
    grupo.add(new THREE.LineSegments(new THREE.EdgesGeometry(corpoG), matFina));
    const frente = new THREE.BoxGeometry(W - 0.14, altU - 0.035, 0.03);
    grupo.add(new THREE.LineSegments(new THREE.EdgesGeometry(frente), matLinha));
    // ranhuras de ventilação
    for (let k = 0; k < 6; k++) {
      const x = -W / 2 + 0.16 + k * 0.045;
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, -altU * 0.28, 0.02), new THREE.Vector3(x, altU * 0.28, 0.02)]);
      grupo.add(new THREE.Line(g, matFina));
    }
    // baias de disco
    for (let k = 0; k < 4; k++) {
      const bx = 0.02 + k * 0.1;
      const g = new THREE.BufferGeometry().setFromPoints(
        [[-0.04, -0.045], [0.04, -0.045], [0.04, 0.045], [-0.04, 0.045], [-0.04, -0.045]].map(([a, b]) => new THREE.Vector3(bx + a, b, 0.02))
      );
      grupo.add(new THREE.Line(g, matFina));
    }
    // LEDs (piscam sozinhos)
    const leds = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), new THREE.MeshBasicMaterial({
        color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.position.set(W / 2 - 0.13 - k * 0.04, altU * 0.18, 0.021);
      grupo.add(m);
      leds.push(m);
    }
    // faixa de luz da gaveta (acende com a cor da IA)
    const faixa = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, altU - 0.06), new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    faixa.position.z = 0.022;
    grupo.add(faixa);
    rack.add(grupo);
    gavetas.push({ grupo, leds, faixa, y, fase: Math.random() * 10 });
  }

  // --- as IAs em forma de energia, circulando por dentro do rack ---
  const texturaPonto = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const gavetaDaIA = (i) => Math.min(UNIDADES - 1, 1 + i * 3);
  const frenteDaGaveta = (i) => new THREE.Vector3(0, gavetas[gavetaDaIA(i)].y, D / 2 + 0.02);
  const TAM_RASTRO = 60;
  const energias = (window.IAS || []).map((ia, i) => {
    const cor = new THREE.Color(ia.cor || '#3fd0ff');
    const pts = [];
    const n = 10;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i * 2.1;
      pts.push(new THREE.Vector3(
        Math.cos(a) * (0.34 + 0.1 * Math.sin(k * 2.3 + i * 1.3)),
        Math.sin(a * 2 + i * 1.9) * (H / 2 - 0.32) * (0.55 + 0.45 * Math.cos(k * 1.7 + i)),
        Math.sin(a) * 0.3 + 0.08 * Math.cos(k * 3 + i),
      ));
    }
    const curva = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const cabeca = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texturaPonto, color: cor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    cabeca.scale.setScalar(0.2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAM_RASTRO * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TAM_RASTRO * 3), 3));
    const rastro3d = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.17, map: texturaPonto, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: true,
    }));
    rastro3d.frustumCulled = false;
    rack.add(cabeca, rastro3d);
    return { cor, curva, cabeca, rastro3d, historico: [], u: Math.random(), vel: 0.055 + 0.012 * i, alfa: 1, alfaAlvo: 1, voo: null };
  });

  // move cada energia: pelo caminho dela ou num voo até um ponto (ex.: a gaveta)
  function moverEnergias(dt, seg) {
    const agora = performance.now();
    for (const e of energias) {
      let p;
      if (e.voo) {
        const k = Math.min(1, (agora - e.voo.inicio) / e.voo.dur);
        const q = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        p = e.voo.de.clone().lerp(e.voo.para, q);
        p.y += Math.sin(k * Math.PI) * 0.25;
        p.x += Math.sin(k * Math.PI * 2) * 0.12;
      } else {
        e.u = (e.u + e.vel * dt) % 1;
        p = e.curva.getPointAt(e.u);
      }
      e.alfa += (e.alfaAlvo - e.alfa) * Math.min(1, dt * 5);
      e.cabeca.position.copy(p);
      e.cabeca.material.opacity = e.alfa;
      e.cabeca.scale.setScalar(0.3 + 0.06 * Math.sin(seg * 6 + e.vel * 100));
      e.historico.unshift(p.clone());
      if (e.historico.length > TAM_RASTRO) e.historico.length = TAM_RASTRO;
      const pos = e.rastro3d.geometry.attributes.position, cor = e.rastro3d.geometry.attributes.color;
      for (let k = 0; k < TAM_RASTRO; k++) {
        const h = e.historico[Math.min(k, e.historico.length - 1)];
        pos.setXYZ(k, h.x, h.y, h.z);
        const f = Math.pow(1 - k / TAM_RASTRO, 1.6) * e.alfa;
        cor.setXYZ(k, e.cor.r * f, e.cor.g * f, e.cor.b * f);
      }
      pos.needsUpdate = true;
      cor.needsUpdate = true;
    }
  }

  // --- base de projeção ---
  const base = new THREE.Group();
  const matBase = materialLinhas({ ...uniLinhas, uOpacidade: { value: 0.3 } });
  for (const r of [0.95, 0.85, 0.55]) {
    const anel = new THREE.Line(linhaCirculo(r, 0, 0, 0, 96), matBase);
    anel.rotation.x = Math.PI / 2;
    base.add(anel);
  }
  base.position.y = -H / 2 - 0.12;

  const grupo = new THREE.Group();
  grupo.add(rack, base);
  cena.add(grupo);

  // ---------- fumaça de energia (2D, por cima) ----------
  const rastro = document.createElement('canvas');
  rastro.width = L; rastro.height = A;
  const rctx = rastro.getContext('2d');
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  let particulas = [];
  let corRgb = [63, 208, 255];
  function pintarSprite() {
    const g = sprite.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [cr, cg, cb] = corRgb;
    r.addColorStop(0, `rgba(${Math.min(255, cr + 80)},${Math.min(255, cg + 80)},${Math.min(255, cb + 80)},0.7)`);
    r.addColorStop(0.3, `rgba(${cr},${cg},${cb},0.25)`);
    r.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  pintarSprite();
  const ruidoFluxo = criarRuido(8, 8, 1, 1);

  // ---------- rosto que se materializa ----------
  let rosto = null;          // canvas do rosto (pré-multiplicado sobre preto)
  let rostoDados = null;     // ImageData do rosto
  let alvos = [];            // pontos claros do rosto (para a fumaça se juntar)
  const ruido = criarRuido(L, A, 1 / 46, 4).mapa;
  const saidaImg = ctx.createImageData(L, A);
  const saidaCanvas = document.createElement('canvas');
  saidaCanvas.width = L; saidaCanvas.height = A;
  const sctx = saidaCanvas.getContext('2d');

  function materializar(r, brilhoBorda) {
    const src = rostoDados.data, dst = saidaImg.data;
    const [cr, cg, cb] = corRgb;
    for (let i = 0, p = 0; i < ruido.length; i++, p += 4) {
      const dif = r - ruido[i];
      const k = dif <= 0 ? 0 : dif >= 0.14 ? 1 : dif / 0.14;
      const alfa = src[p + 3] / 255;
      const borda = dif > 0 && dif < 0.05 ? (1 - dif / 0.05) * brilhoBorda * alfa : 0;
      const forca = (src[p] + src[p + 1] + src[p + 2]) / 765;
      const b = Math.min(1, borda * (0.3 + forca * 1.2));
      // a borda que está "nascendo" brilha na cor da IA
      dst[p] = src[p] + ((cr + 120 > 255 ? 255 : cr + 120) - src[p]) * b;
      dst[p + 1] = src[p + 1] + ((cg + 120 > 255 ? 255 : cg + 120) - src[p + 1]) * b;
      dst[p + 2] = src[p + 2] + ((cb + 120 > 255 ? 255 : cb + 120) - src[p + 2]) * b;
      dst[p + 3] = 255 * Math.min(1, alfa * k + b);
    }
    sctx.putImageData(saidaImg, 0, 0);
    ctx.drawImage(saidaCanvas, 0, 0);
  }

  function desenharRostoPronto(alfa) {
    if (!rosto || alfa <= 0) return;
    ctx.save();
    ctx.globalAlpha = alfa * (0.94 + 0.06 * Math.random());
    ctx.drawImage(rosto, 0, 0);
    if (Math.random() < 0.05) {
      const y = Math.random() * A, h = 4 + Math.random() * 18, dx = (Math.random() - 0.5) * 24;
      ctx.drawImage(rosto, 0, y, L, h, dx, y, L, h);
    }
    ctx.restore();
  }

  function telaDe(obj, local) {
    const v = local.clone();
    obj.localToWorld(v);
    v.project(camera);
    return [(v.x + 1) / 2 * L, (1 - v.y) / 2 * A];
  }

  function fumaca(t, dt, origem, emitir, juntar) {
    // apaga devagar o rastro (é isso que dá o ar de fumaça)
    rctx.save();
    rctx.globalCompositeOperation = 'destination-out';
    rctx.fillStyle = 'rgba(0,0,0,0.16)';
    rctx.fillRect(0, 0, L, A);
    rctx.restore();
    // novas partículas saindo da gaveta
    const novas = Math.random() < emitir * 9 % 1 ? Math.ceil(emitir * 9) : Math.floor(emitir * 9);
    for (let i = 0; i < novas; i++) {
      const lado = Math.random() < 0.5 ? -1 : 1;
      const ang = (lado > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.3;
      const vel = 70 + Math.random() * 120;
      particulas.push({
        x: origem[0] + (Math.random() - 0.5) * 120, y: origem[1] + (Math.random() - 0.5) * 16,
        vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel * 0.5 - 40 - Math.random() * 60,
        vida: 0, max: 0.9 + Math.random() * 1.1, tam: 3 + Math.random() * 7,
        alvo: alvos.length ? alvos[Math.floor(Math.random() * alvos.length)] : null,
      });
    }
    rctx.save();
    rctx.globalCompositeOperation = 'lighter';
    const vivas = [];
    for (const p of particulas) {
      p.vida += dt;
      if (p.vida > p.max) continue;
      const ang = ruidoFluxo.amostra(p.x * 0.012, p.y * 0.012 + t * 0.4) * Math.PI * 4;
      p.vx += Math.cos(ang) * 260 * dt;
      p.vy += Math.sin(ang) * 260 * dt - 30 * dt;
      if (juntar > 0 && p.alvo) {
        p.vx += (p.alvo[0] - p.x) * 7 * juntar * dt;
        p.vy += (p.alvo[1] - p.y) * 7 * juntar * dt;
      }
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.vida / p.max;
      const tam = p.tam * (0.6 + k * 1.6);
      rctx.globalAlpha = Math.sin(k * Math.PI) * 0.16;
      rctx.drawImage(sprite, p.x - tam, p.y - tam, tam * 2, tam * 2);
      vivas.push(p);
    }
    rctx.restore();
    particulas = vivas;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(rastro, 0, 0);
    ctx.restore();
  }

  let modo = 'vazio';
  let inicio = 0;
  let escolhida = -1;      // gaveta da IA escolhida
  let iaEscolhida = -1;    // índice da IA (e da energia dela)
  let aoTerminar = null;
  let anterior = performance.now();

  function luzes(seg, destaque, fator = 1) {
    const corIA = `rgb(${corRgb.join(',')})`;
    gavetas.forEach((g, i) => {
      g.leds.forEach((led, k) => {
        const pisca = Math.sin(seg * (2 + k) + g.fase * (k + 1)) > 0.3 ? 1 : 0.25;
        led.material.opacity = (i === escolhida ? 1 : 0.35 + 0.5 * pisca) * fator;
        led.material.color.set(i === escolhida ? corIA : '#ffffff');
      });
      g.faixa.material.color.set(corIA);
      g.faixa.material.opacity = (i === escolhida ? destaque * 0.6 : 0) * fator;
    });
  }

  const FORA = 0.55;   // quanto a gaveta desliza para fora
  const fechada = D / 2 - 0.04;

  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dt = Math.min(0.05, (agora - anterior) / 1000);
    anterior = agora;
    const t = agora - inicio;
    const seg = agora / 1000;
    ctx.clearRect(0, 0, L, A);
    canvasGL.style.visibility = modo === 'vazio' ? 'hidden' : 'visible';
    if (modo === 'vazio') return;

    if (modo === 'mascara') {
      grupo.rotation.set(0, 0.55 + Math.sin(seg * 0.5) * 0.35, 0);
      grupo.position.x = 0;
      uniLinhas.uAlfa.value = 1; uniMiolo.uAlfa.value = 0.8;
      gavetas.forEach((g) => { g.grupo.position.z = fechada; });
      energias.forEach((e) => { e.alfaAlvo = 1; });
      moverEnergias(dt, seg);
      luzes(seg, 0);
      base.rotation.y = seg * 0.3;
      comp.render();
      return;
    }

    if (modo === 'transformando') {
      // 1) o rack vira de frente; a energia da IA voa até a gaveta dela e entra
      const vira = suave(0, 1100, t);
      grupo.rotation.set(0, (0.55 + Math.sin(t / 600) * 0.2) * (1 - vira), 0);
      const tremor = suave(1000, 1400, t) * (1 - suave(1800, 2200, t));
      grupo.position.x = (Math.random() - 0.5) * 0.06 * tremor;
      const g = gavetas[escolhida];
      const apaga = 1 - 0.8 * suave(1600, 2400, t) - 0.2 * suave(2900, 3500, t);
      energias.forEach((e, i) => {
        if (i === iaEscolhida) e.alfaAlvo = t < 700 ? 1 : 0;
        else e.alfaAlvo = 0.7 * Math.max(0, (apaga - 0.2) / 0.8);
      });
      moverEnergias(dt, seg);
      // 2) a gaveta acende e desliza para fora
      g.grupo.position.z = fechada + FORA * suave(800, 1500, t);
      luzes(seg, 0.2 + 0.55 * suave(600, 1000, t) + 0.25 * Math.sin(seg * 18) * suave(1000, 1500, t), Math.max(0, (apaga - 0.2) / 0.8));
      // 3) o rack se apaga devagar enquanto o rosto aparece
      uniLinhas.uAlfa.value = apaga; uniMiolo.uAlfa.value = 0.8 * apaga;
      base.rotation.y = seg * 0.3;
      comp.render();

      // 4) fumaça de energia saindo da gaveta e se juntando no rosto
      const origem = telaDe(g.grupo, new THREE.Vector3(0, 0, 0.05));
      const emitir = suave(1000, 1300, t) * (1 - suave(2700, 3300, t));
      const juntar = suave(1800, 3000, t);
      fumaca(seg, dt, origem, emitir, juntar);

      // 5) o rosto se materializa no meio da fumaça, com a borda acesa
      const r = -0.05 + 1.25 * suave(1700, 3600, t);
      if (r > 0) materializar(Math.min(1.2, r), 1 - suave(3400, 3900, t));
      if (t > 4000) {
        modo = 'rosto';
        grupo.position.x = 0;
        if (aoTerminar) { aoTerminar(); aoTerminar = null; }
      }
      return;
    }

    if (modo === 'rosto') {
      uniLinhas.uAlfa.value = 0; uniMiolo.uAlfa.value = 0;
      energias.forEach((e) => { e.alfaAlvo = 0; });
      moverEnergias(dt, seg);
      comp.render();
      fumaca(seg, dt, [L / 2, A / 2], 0, 0);
      desenharRostoPronto(1);
      return;
    }

    if (modo === 'voltando') {
      // a IA volta do celular: o rack reaparece, a energia entra na gaveta e ela se fecha
      grupo.rotation.set(0, 0, 0);
      grupo.position.x = 0;
      const aparece = suave(0, 500, t);
      uniLinhas.uAlfa.value = aparece; uniMiolo.uAlfa.value = 0.8 * aparece;
      const g = gavetas[escolhida];
      g.grupo.position.z = fechada + FORA * (1 - suave(1000, 1600, t));
      energias.forEach((e, i) => {
        if (i === iaEscolhida) e.alfaAlvo = t < 1000 ? 1 : 0;
        else e.alfaAlvo = suave(500, 1400, t);
      });
      moverEnergias(dt, seg);
      luzes(seg, 0.75 * (1 - suave(1200, 1700, t)), aparece);
      base.rotation.y = seg * 0.3;
      comp.render();
      fumaca(seg, dt, [L / 2, A / 2], 0, 0);
      if (t > 1800) {
        modo = 'mascara';
        inicio = performance.now();
        escolhida = -1;
        if (iaEscolhida >= 0 && energias[iaEscolhida]) {
          const e = energias[iaEscolhida];
          e.voo = null;
          e.historico = [];
          e.alfa = 0;
        }
        iaEscolhida = -1;
        if (aoTerminar) { aoTerminar(); aoTerminar = null; }
      }
    }
  }
  requestAnimationFrame(quadro);

  return {
    retrato() { return rosto; },
    vazio() { modo = 'vazio'; },
    mascara() {
      modo = 'mascara';
      inicio = performance.now();
      escolhida = -1;
      iaEscolhida = -1;
      energias.forEach((e) => { e.voo = null; });
      particulas = [];
      rctx.clearRect(0, 0, L, A);
    },
    // a IA sai do celular e volta para o servidor
    recolher() {
      return new Promise((ok) => {
        if (escolhida < 0) { ok(); return; }
        modo = 'voltando';
        inicio = performance.now();
        aoTerminar = ok;
        const e = energias[iaEscolhida];
        if (e) {
          e.historico = [];
          e.alfa = 1;
          e.voo = { de: new THREE.Vector3(1.7, 1.5, 1.4), para: frenteDaGaveta(iaEscolhida).add(new THREE.Vector3(0, 0, FORA)), inicio: performance.now() + 150, dur: 900 };
        }
      });
    },
    async preparar(ia) {
      corRgb = hexParaRgb(ia.cor || '#3fd0ff');
      pintarSprite();
      const lista = window.IAS || [];
      const i = Math.max(0, lista.indexOf(ia));
      // espalha as IAs pelas gavetas do rack
      iaEscolhida = i;
      escolhida = gavetaDaIA(i);
      rosto = null;
      if (ia.rosto) {
        try { rosto = await fotoHolograma(ia.rosto, L, A); } catch (e) { console.warn('Não consegui abrir o rosto de', ia.nome, e); }
      }
      if (!rosto) rosto = rostoReserva(ia, L, A);
      rostoDados = rosto.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, L, A);
      alvos = [];
      const d = rostoDados.data;
      for (let y = 0; y < A; y += 3) {
        for (let x = 0; x < L; x += 3) {
          const k = (y * L + x) * 4;
          if (d[k + 3] > 120 && (d[k] + d[k + 1] + d[k + 2]) / 765 > 0.3) alvos.push([x, y]);
        }
      }
      particulas = [];
      rctx.clearRect(0, 0, L, A);
    },
    transformar() {
      return new Promise((ok) => {
        modo = 'transformando';
        inicio = performance.now();
        aoTerminar = ok;
        const e = energias[iaEscolhida];
        if (e) e.voo = { de: e.cabeca.position.clone(), para: frenteDaGaveta(iaEscolhida), inicio: performance.now(), dur: 750 };
      });
    },
  };
}

// ============================================================
// CELULAR (no lugar do corpo): iPhone 17 Pro Max em holograma
// Medidas reais: 163,4 x 78 x 8,75 mm (1 unidade = 100 mm).
// ============================================================
const ALT = 1.634, LARG = 0.78, ESP = 0.0875, RAIO = 0.125;

function retanguloArredondado(l, a, r) {
  const s = new THREE.Shape();
  const x = -l / 2, y = -a / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + l - r, y);
  s.quadraticCurveTo(x + l, y, x + l, y + r);
  s.lineTo(x + l, y + a - r);
  s.quadraticCurveTo(x + l, y + a, x + l - r, y + a);
  s.lineTo(x + r, y + a);
  s.quadraticCurveTo(x, y + a, x, y + a - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// contorno de um retângulo arredondado, desenhado como linha, numa profundidade z
function linhaContorno(l, a, r, z, cx = 0, cy = 0) {
  const pts = retanguloArredondado(l, a, r).getPoints(24).map((p) => new THREE.Vector3(p.x + cx, p.y + cy, z));
  return new THREE.BufferGeometry().setFromPoints(pts);
}
function linhaCirculo(raio, x, y, z, segs = 64) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(new THREE.Vector3(x + Math.cos(a) * raio, y + Math.sin(a) * raio, z));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}
// botão lateral: caixinha arredondada saindo da lateral
function botao(lado, y, comp, saliencia = 0.008) {
  const g = new THREE.BoxGeometry(saliencia * 2, comp, ESP * 0.42);
  g.translate(lado * (LARG / 2), y, 0);
  return g;
}

// tela do celular: canvas desenhado a cada quadro
function criarTelaCanvas() {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 1040;
  return c;
}

export async function criarCelular(canvas) {
  const L = canvas.width, A = canvas.height;
  const renderer = criarRenderer(canvas, L, A);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, L / A, 0.1, 50);
  camera.position.set(0, -0.02, 5.0);
  camera.lookAt(0, -0.02, 0);
  const comp = compositor(renderer, cena, camera, L, A, 0.7);

  const uniLinhas = {
    uLinhaA: { value: new THREE.Color('#e9f1fa') }, uLinhaB: { value: new THREE.Color('#3fd0ff') },
    uCorte: { value: 9 }, uAlfa: { value: 1 }, uOpacidade: { value: 0.75 },
  };
  const uniFinas = { ...uniLinhas, uOpacidade: { value: 0.32 } };
  const uniMiolo = {
    uMioloA: { value: new THREE.Color('#8fb4d8') }, uMioloB: { value: new THREE.Color('#1f8fff') },
    uBorda: { value: new THREE.Color('#ffffff') }, uCorte: uniLinhas.uCorte, uAlfa: { value: 0.9 }, uBordaForca: { value: 0.6 },
  };
  const matLinha = materialLinhas(uniLinhas);
  const matFina = materialLinhas(uniFinas);
  const matMiolo = materialMiolo(uniMiolo);

  const celular = new THREE.Group();
  const linha = (g, fina) => celular.add(new THREE.Line(g, fina ? matFina : matLinha));
  const arestas = (g, ang = 30, fina = false) => celular.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, ang), fina ? matFina : matLinha));
  const miolo = (g) => celular.add(new THREE.Mesh(g, matMiolo));

  // --- corpo: alumínio com cantos arredondados ---
  const bisel = 0.016;
  const corpoGeo = new THREE.ExtrudeGeometry(retanguloArredondado(LARG - bisel * 2, ALT - bisel * 2, RAIO - bisel), {
    depth: ESP - bisel * 2, bevelEnabled: true, bevelThickness: bisel, bevelSize: bisel, bevelSegments: 4, curveSegments: 20,
  });
  corpoGeo.translate(0, 0, -(ESP - bisel * 2) / 2);
  corpoGeo.computeVertexNormals();
  miolo(corpoGeo);
  // contornos do aro (frente, meio e trás)
  linha(linhaContorno(LARG - 0.01, ALT - 0.01, RAIO - 0.005, ESP / 2));
  linha(linhaContorno(LARG, ALT, RAIO, 0), true);
  linha(linhaContorno(LARG - 0.01, ALT - 0.01, RAIO - 0.005, -ESP / 2));
  linha(linhaContorno(LARG, ALT, RAIO, ESP * 0.28), true);
  linha(linhaContorno(LARG, ALT, RAIO, -ESP * 0.28), true);

  // --- frente: tela e Dynamic Island ---
  const zf = ESP / 2 + 0.002;
  const larguraTela = LARG - 0.05, alturaTela = ALT - 0.05;
  linha(linhaContorno(larguraTela, alturaTela, RAIO - 0.022, zf));
  linha(linhaContorno(0.2, 0.056, 0.028, zf + 0.001, 0, ALT / 2 - 0.085), true);

  const telaCanvas = criarTelaCanvas();
  const tctx = telaCanvas.getContext('2d');
  const textura = new THREE.CanvasTexture(telaCanvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  const telaGeo = new THREE.ShapeGeometry(retanguloArredondado(larguraTela, alturaTela, RAIO - 0.022), 16);
  // UV de 0 a 1 na tela inteira
  const uv = telaGeo.attributes.uv, pos = telaGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / larguraTela + 0.5, pos.getY(i) / alturaTela + 0.5);
  const telaMesh = new THREE.Mesh(telaGeo, new THREE.MeshBasicMaterial({
    map: textura, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  telaMesh.position.z = zf + 0.0005;
  telaMesh.renderOrder = 2;
  const fundoTela = new THREE.Mesh(telaGeo, new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
  fundoTela.position.z = zf - 0.004;
  fundoTela.renderOrder = -1;
  celular.add(fundoTela, telaMesh);

  // --- traseira: platô de câmeras de ponta a ponta ---
  const zt = -ESP / 2;
  const platoAlt = 0.36, platoY = ALT / 2 - 0.02 - platoAlt / 2, platoEsp = 0.022;
  const platoGeo = new THREE.ExtrudeGeometry(retanguloArredondado(LARG - 0.04, platoAlt, RAIO - 0.02), {
    depth: platoEsp, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 16,
  });
  platoGeo.translate(0, platoY, zt - platoEsp);
  miolo(platoGeo);
  linha(linhaContorno(LARG - 0.04, platoAlt, RAIO - 0.02, zt - platoEsp - 0.006, 0, platoY));
  linha(linhaContorno(LARG - 0.03, platoAlt + 0.01, RAIO - 0.015, zt - 0.001, 0, platoY), true);

  // três lentes em triângulo + flash, LiDAR e microfone
  const zLente = zt - platoEsp - 0.006;
  const lentes = [[-0.215, platoY + 0.083], [-0.215, platoY - 0.083], [-0.06, platoY]];
  for (const [x, y] of lentes) {
    const anel = new THREE.CylinderGeometry(0.078, 0.078, 0.02, 48, 1, true);
    anel.rotateX(Math.PI / 2);
    anel.translate(x, y, zLente - 0.01);
    miolo(anel);
    linha(linhaCirculo(0.078, x, y, zLente - 0.02));
    linha(linhaCirculo(0.078, x, y, zLente));
    linha(linhaCirculo(0.058, x, y, zLente - 0.021), true);
    linha(linhaCirculo(0.036, x, y, zLente - 0.022), true);
    linha(linhaCirculo(0.016, x, y, zLente - 0.023), true);
  }
  linha(linhaCirculo(0.026, 0.19, platoY + 0.085, zLente - 0.002));        // flash
  linha(linhaCirculo(0.03, 0.19, platoY - 0.075, zLente - 0.002));         // LiDAR
  linha(linhaCirculo(0.009, 0.1, platoY + 0.13, zLente - 0.002), true);    // microfone
  // logotipo discreto no meio das costas (só um círculo fino)
  linha(linhaCirculo(0.07, 0, -0.08, zt - 0.002), true);

  // --- botões laterais ---
  arestas(botao(-1, ALT / 2 - 0.33, 0.07));           // botão de ação
  arestas(botao(-1, ALT / 2 - 0.46, 0.1));            // volume +
  arestas(botao(-1, ALT / 2 - 0.59, 0.1));            // volume -
  arestas(botao(1, ALT / 2 - 0.5, 0.16));             // lateral
  arestas(botao(1, -0.28, 0.11, 0.004));              // controle da câmera

  // --- embaixo: USB-C e alto-falantes ---
  const yb = -ALT / 2 - 0.001;
  const usb = new THREE.BufferGeometry().setFromPoints(
    retanguloArredondado(0.09, 0.03, 0.015).getPoints(12).map((p) => new THREE.Vector3(p.x, yb, p.y))
  );
  linha(usb, true);
  for (let i = 0; i < 6; i++) {
    linha(linhaCirculo(0.006, -0.12 - i * 0.022, 0, 0, 12).rotateX(Math.PI / 2).translate(0, yb, 0), true);
    linha(linhaCirculo(0.006, 0.12 + i * 0.022, 0, 0, 12).rotateX(Math.PI / 2).translate(0, yb, 0), true);
  }

  cena.add(celular);

  // --- base do holograma: anéis girando embaixo do celular ---
  const base = new THREE.Group();
  const matBase = materialLinhas({ ...uniLinhas, uOpacidade: { value: 0.35 } });
  for (const [r, op] of [[0.55, 1], [0.48, 0.6], [0.3, 0.8]]) {
    const anel = new THREE.Line(linhaCirculo(r, 0, 0, 0, 96), matBase);
    anel.rotation.x = Math.PI / 2;
    anel.scale.setScalar(op === 0.6 ? 1 : 1);
    base.add(anel);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), new THREE.Vector3(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55),
    ]);
    base.add(new THREE.Line(g, matBase));
  }
  base.position.y = -ALT / 2 - 0.14;
  cena.add(base);

  // ---------- conteúdo da tela ----------
  let estadoTela = { modo: 'repouso', inicio: 0, rosto: null, nome: '' };
  const TW = telaCanvas.width, TH = telaCanvas.height;

  function ilha(ctx) {
    ctx.fillStyle = '#000';
    const w = 0.2 / larguraTela * TW, h = 0.056 / alturaTela * TH;
    const y = (0.085 - 0.025) / alturaTela * TH;
    ctx.beginPath();
    ctx.roundRect(TW / 2 - w / 2, y - h / 2 + h / 2, w, h, h / 2);
    ctx.fill();
  }

  function grade(ctx, cor, alfa) {
    ctx.save();
    ctx.strokeStyle = cor;
    ctx.globalAlpha = alfa;
    ctx.lineWidth = 1;
    for (let x = 0; x <= TW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TH); ctx.stroke(); }
    for (let y = 0; y <= TH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TW, y); ctx.stroke(); }
    ctx.restore();
  }

  function desenharRosto(ctx, img, alfa, revela, escala, brilhoVarredura, dy = 0) {
    if (!img) return;
    const w = TW * 0.8 * escala, h = w * (img.height / img.width);
    const x = (TW - w) / 2, y = TH * 0.33 - h / 2 + dy;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, TW, y + h * revela);
    ctx.clip();
    ctx.globalAlpha = alfa;
    ctx.drawImage(img, x, y, w, h);
    if (Math.random() < 0.08) {
      const fy = y + Math.random() * h * revela, fh = 6 + Math.random() * 20;
      ctx.drawImage(img, 0, ((fy - y) / h) * img.height, img.width, (fh / h) * img.height, x + (Math.random() - 0.5) * 30, fy, w, fh);
    }
    ctx.restore();
    if (brilhoVarredura > 0 && revela < 1) {
      const yv = y + h * revela;
      const g = ctx.createLinearGradient(0, yv - 30, 0, yv + 4);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(235,245,255,${0.9 * brilhoVarredura})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, yv - 30, TW, 34);
    }
  }

  function texto(ctx, t, x, y, tam, cor, peso = 600, espac = 2) {
    ctx.font = `${peso} ${tam}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillStyle = cor;
    ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = espac + 'px';
    ctx.fillText(t, x, y);
  }

  const LOGS = ['núcleo de linguagem', 'personalidade', 'memória de contexto', 'voz e estilo', 'protocolos de segurança'];

  function desenharTela(agora) {
    const ctx = tctx;
    ctx.clearRect(0, 0, TW, TH);
    const t = (agora - estadoTela.inicio) / 1000;
    const ativa = estadoTela.modo !== 'repouso';
    const [cr, cg, cb] = ativa ? estadoTela.rgb : [225, 236, 248];
    const claro = (a) => `rgba(${Math.min(255, cr + 110)},${Math.min(255, cg + 110)},${Math.min(255, cb + 110)},${a})`;
    const tom = (a) => `rgba(${cr},${cg},${cb},${a})`;
    const cor = tom(1);

    // fundo suave
    const fundo = ctx.createLinearGradient(0, 0, 0, TH);
    fundo.addColorStop(0, `rgba(${cr * 0.3 | 0},${cg * 0.3 | 0},${cb * 0.3 | 0},0.4)`);
    fundo.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, TW, TH);
    grade(ctx, cor, 0.07);

    if (estadoTela.modo === 'repouso') {
      const pisca = 0.55 + 0.45 * Math.sin(agora / 400);
      texto(ctx, '09:41', TW / 2, TH * 0.24, 110, claro(0.6), 500, 0);
      texto(ctx, 'AGUARDANDO IA', TW / 2, TH * 0.62, 30, claro(0.5 * pisca));
      ctx.strokeStyle = tom(0.35);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(TW / 2, TH * 0.75, 46, agora / 500, agora / 500 + 1.2); ctx.stroke();
    } else if (estadoTela.modo === 'instalando') {
      // 1) o rosto entra na tela, de cima para baixo
      const revela = suave(0, 0.9, t);
      const escala = 1.25 - 0.25 * suave(0, 1.0, t);
      const alfaRosto = t < 1.0 ? 1 : 0.45 + 0.1 * Math.sin(agora / 90);
      desenharRosto(ctx, estadoTela.rosto, alfaRosto, revela, escala, 1);
      // 2) carregamento
      if (t > 0.9) {
        const k = suave(0.9, 2.9, t);
        const cx = TW / 2, cy = TH * 0.71, r = 58;
        ctx.lineWidth = 6;
        ctx.strokeStyle = tom(0.18);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = claro(1);
        ctx.shadowColor = cor; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = tom(0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r + 14, agora / 300, agora / 300 + 0.9); ctx.stroke();
        texto(ctx, Math.floor(k * 100) + '%', cx, cy + 12, 38, claro(1), 700, 0);
        texto(ctx, 'INTEGRANDO ' + estadoTela.nome, cx, TH * 0.61, 30, claro(0.9));
        const feitos = Math.floor(k * LOGS.length);
        const atual = LOGS[Math.min(feitos, LOGS.length - 1)];
        ctx.font = '500 19px "Barlow Condensed", sans-serif';
        ctx.fillStyle = claro(0.7);
        ctx.textAlign = 'center';
        ctx.fillText('› ' + atual + (k >= 1 ? '  ok' : '...'), TW / 2, TH * 0.81);
      }
    } else if (estadoTela.modo === 'saindo') {
      // a IA sai do celular: o rosto é puxado para cima e se desfaz, o anel esvazia
      const sobe = suave(0.15, 1.3, t);
      const ondula = Math.sin(agora / 40) * 6 * sobe;
      desenharRosto(ctx, estadoTela.rosto, (1 - suave(0.4, 1.3, t)) * (0.85 + 0.15 * Math.random()),
        1 - suave(0.2, 1.25, t), 1 + 0.12 * sobe, 1, -TH * 0.22 * sobe + ondula);
      const k = 1 - suave(0.2, 1.6, t);
      const cx = TW / 2, cy = TH * 0.71, r = 58;
      ctx.lineWidth = 6;
      ctx.strokeStyle = tom(0.18);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = claro(1);
      ctx.shadowColor = cor; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.shadowBlur = 0;
      texto(ctx, Math.floor(k * 100) + '%', cx, cy + 12, 38, claro(1), 700, 0);
      texto(ctx, t < 1.6 ? 'DESCONECTANDO ' + estadoTela.nome : 'IA DESCONECTADA', cx, TH * 0.61, 30, claro(0.9));
      ctx.font = '500 19px "Barlow Condensed", sans-serif';
      ctx.fillStyle = claro(0.7);
      ctx.textAlign = 'center';
      ctx.fillText(t < 0.9 ? '› salvando contexto...' : t < 1.6 ? '› liberando memória...' : '› pronto', TW / 2, TH * 0.81);
    } else if (estadoTela.modo === 'pronto') {
      desenharRosto(ctx, estadoTela.rosto, 0.92 + 0.08 * Math.random(), 1, 1, 0);
      texto(ctx, estadoTela.nome, TW / 2, TH * 0.66, 64, claro(1), 700, 6);
      ctx.fillStyle = '#5fffc8';
      ctx.beginPath(); ctx.arc(TW / 2 - 52, TH * 0.71 - 8, 6, 0, Math.PI * 2); ctx.fill();
      texto(ctx, 'ONLINE', TW / 2 + 10, TH * 0.71, 28, 'rgba(160,255,220,0.85)');
    }
    // linhas de varredura
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < TH; y += 4) ctx.fillRect(0, y, TW, 1);
    ilha(ctx);
    textura.needsUpdate = true;
  }

  // ---------- movimento ----------
  const relogio = new THREE.Clock();
  let giro = -0.5;              // rotação atual em y
  let girando = true;
  let volta = null;             // { de, para, inicio, dur }
  let troca = null;
  let versao = 0;
  const BRANCO_BORDA = new THREE.Color('#ffffff');
  const bordaIA = new THREE.Color('#bff4ff');

  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dt = Math.min(0.05, relogio.getDelta());
    const seg = relogio.elapsedTime;
    if (volta) {
      const k = Math.min(1, (performance.now() - volta.inicio) / volta.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      giro = volta.de + (volta.para - volta.de) * e;
      if (k >= 1) volta = null;
    } else if (girando) {
      giro += dt * 0.22;
    }
    celular.rotation.y = giro;
    const tilt = girando ? Math.sin(seg * 0.4) * 0.08 : 0;
    celular.rotation.x += (tilt - celular.rotation.x) * 0.05;
    celular.position.y = Math.sin(seg * 0.9) * 0.012;
    base.rotation.y = seg * 0.3;

    if (troca) {
      const k = Math.min(1, (performance.now() - troca.inicio) / troca.duracao);
      const e = k * k * (3 - 2 * k);
      uniLinhas.uCorte.value = troca.volta
        ? -ALT / 2 - 0.3 + e * (ALT + 0.6)        // volta ao branco, de baixo para cima
        : ALT / 2 + 0.05 - e * (ALT + 0.4);
      if (k >= 1) troca = null;
    }
    const trocou = uniLinhas.uCorte.value < 0;
    uniMiolo.uBorda.value.copy(trocou ? bordaIA : BRANCO_BORDA);
    desenharTela(agora || performance.now());
    comp.render();
  }
  requestAnimationFrame(quadro);

  return {
    // volta a tela de frente (giro múltiplo de 2π mais próximo, sempre pra frente)
    paraFrente(dur = 1500) {
      girando = false;
      const alvo = Math.ceil((giro - 0.15) / (Math.PI * 2)) * Math.PI * 2;
      volta = { de: giro, para: alvo, inicio: performance.now(), dur };
    },
    // o rosto entra na tela e carrega; resolve quando termina
    instalar(rosto, nome, corIA = '#3fd0ff') {
      const c = new THREE.Color(corIA);
      uniLinhas.uLinhaB.value.copy(c);
      uniMiolo.uMioloB.value.copy(c).multiplyScalar(0.7);
      bordaIA.copy(c).lerp(new THREE.Color('#ffffff'), 0.55);
      const v = ++versao;
      estadoTela = { modo: 'instalando', inicio: performance.now(), rosto, nome: nome.toUpperCase(), rgb: hexParaRgb(corIA) };
      setTimeout(() => { if (v === versao) troca = { inicio: performance.now(), duracao: 1800 }; }, 900);
      return new Promise((ok) => setTimeout(() => {
        if (v === versao) estadoTela = { ...estadoTela, modo: 'pronto' };
        ok();
      }, 3100));
    },
    // a IA sai do celular; resolve quando terminar
    desinstalar() {
      const v = ++versao;
      if (estadoTela.modo === 'repouso') return Promise.resolve();
      estadoTela = { ...estadoTela, modo: 'saindo', inicio: performance.now() };
      setTimeout(() => { if (v === versao) troca = { inicio: performance.now(), duracao: 1300, volta: true }; }, 450);
      return new Promise((ok) => setTimeout(ok, 1900));
    },
    repouso() {
      versao++;
      estadoTela = { modo: 'repouso', inicio: performance.now(), rosto: null, nome: '' };
      troca = null;
      uniLinhas.uCorte.value = 9;
      volta = null;
      girando = true;
    },
  };
}
