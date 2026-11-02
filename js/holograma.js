// Partes em 3D da tela, desenhadas como holograma: linhas finas acesas, miolo quase transparente e brilho
// espalhado (bloom). O canvas é desenhado sobre fundo preto e entra na página com "mix-blend-mode: screen",
// então o preto some e só a luz aparece por cima da interface.
//
// Modelos (créditos no README):
//   DamagedHelmet  -> a máscara da IA anterior
//   LeePerrySmith  -> o rosto genérico (quando a IA não tem foto)
//   (o celular é montado em código: criarCelular)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Os modelos vêm direto dos repositórios de origem (pelo jsDelivr), assim o site fica leve.
const MODELOS = {
  capacete: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  cabeca: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb',
};

const carregador = new GLTFLoader();
const carregar = (url) => carregador.loadAsync(url);

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- utilidades de geometria ----------

// Congela o modelo (inclusive personagens com esqueleto) numa pose e devolve geometrias soltas, no espaço do mundo.
function congelar(raiz, animacao, instante) {
  if (animacao) {
    const mixer = new THREE.AnimationMixer(raiz);
    mixer.clipAction(animacao).play();
    mixer.update(instante || 0);
  }
  raiz.updateMatrixWorld(true);
  const saida = [];
  const v = new THREE.Vector3();
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) o.skeleton.update();
    const pos = o.geometry.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.computeVertexNormals();
    saida.push(g);
  });
  return saida;
}

// Centraliza e escala um conjunto de geometrias para caber numa altura.
function ajustarAltura(geos, altura, pe) {
  const caixa = new THREE.Box3();
  geos.forEach((g) => { g.computeBoundingBox(); caixa.union(g.boundingBox); });
  const tam = caixa.getSize(new THREE.Vector3());
  const centro = caixa.getCenter(new THREE.Vector3());
  const k = altura / tam.y;
  const m = new THREE.Matrix4().makeScale(k, k, k).multiply(
    new THREE.Matrix4().makeTranslation(-centro.x, pe ? -caixa.min.y : -centro.y, -centro.z)
  );
  geos.forEach((g) => { g.applyMatrix4(m); g.computeBoundingBox(); });
  return new THREE.Box3().copy(caixa).applyMatrix4(m);
}

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
  const esc = Math.max(L / img.width, A / img.height);
  ctx.drawImage(img, (L - img.width * esc) / 2, (A - img.height * esc) / 2, img.width * esc, img.height * esc);
  const d = ctx.getImageData(0, 0, L, A);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255 * (p[i + 3] / 255);
    const x = (i / 4) % L, y = Math.floor(i / 4 / L);
    const borda = suave(0, 40, x) * suave(0, 40, L - x) * suave(0, 30, y) * suave(0, 50, A - y);
    const a = suave(0.1, 0.65, l) * borda;
    p[i] = (40 + 200 * Math.pow(l, 1.5)) * a;
    p[i + 1] = (170 + 85 * l) * a;
    p[i + 2] = (230 + 25 * l) * a;
    p[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

// ============================================================
// CABEÇA: capacete (IA anterior) -> partículas -> rosto (IA nova)
// ============================================================
export async function criarCabeca(canvasGL, canvas2D) {
  const L = canvas2D.width, A = canvas2D.height;
  const ctx = canvas2D.getContext('2d');
  const renderer = criarRenderer(canvasGL, L, A, true);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, L / A, 0.1, 100);
  camera.position.set(0, 1.0, 15);
  camera.lookAt(0, 1.0, 0);
  const comp = compositor(renderer, cena, camera, L, A, 0.6);

  const [gElmo, gRosto] = await Promise.all([carregar(MODELOS.capacete), carregar(MODELOS.cabeca)]);

  // --- capacete ---
  const geosElmo = congelar(gElmo.scene);
  ajustarAltura(geosElmo, 5.4, false);
  geosElmo.forEach((g) => g.translate(0, 1.2, 0));
  const uniElmoLinhas = {
    uLinhaA: { value: new THREE.Color('#ff5a3c') }, uLinhaB: { value: new THREE.Color('#ff5a3c') },
    uCorte: { value: 99 }, uAlfa: { value: 1 }, uOpacidade: { value: 0.26 },
  };
  const uniElmoMiolo = {
    uMioloA: { value: new THREE.Color('#ff2a1a') }, uMioloB: { value: new THREE.Color('#ff2a1a') },
    uBorda: { value: new THREE.Color('#5fe4ff') }, uCorte: { value: 99 }, uAlfa: { value: 1 }, uBordaForca: { value: 0.9 },
  };
  const elmo = new THREE.Group();
  geosElmo.forEach((g) => {
    elmo.add(new THREE.Mesh(g, materialMiolo(uniElmoMiolo)));
    elmo.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), materialLinhas(uniElmoLinhas)));
  });

  // --- rosto (cabeça humana, cortada no pescoço) ---
  let geoRosto = null;
  gRosto.scene.traverse((o) => { if (o.isMesh && !geoRosto) geoRosto = o.geometry; });
  geoRosto = geoRosto.clone();
  geoRosto.computeVertexNormals();
  const CORTE_PESCOCO = -1.3;
  const uniRosto = { uAlfa: { value: 0 }, uTempo: { value: 0 }, uPescoco: { value: CORTE_PESCOCO } };
  const rosto = new THREE.Mesh(geoRosto, new THREE.ShaderMaterial({
    uniforms: uniRosto,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlfa; uniform float uTempo; uniform float uPescoco;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec3 n = normalize(vN);
        float f = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
        float luz = pow(max(dot(n, normalize(vec3(0.0, 0.1, 1.0))), 0.0), 6.0);
        float b = luz * 0.55 + f * 0.3;
        vec3 c = mix(vec3(0.05, 0.45, 0.8), vec3(0.8, 0.97, 1.0), smoothstep(0.3, 0.9, b)) * b;
        float pesc = smoothstep(uPescoco - 0.6, uPescoco + 0.5, vP.y);
        float linha = 0.7 + 0.3 * step(0.5, fract(gl_FragCoord.y / 3.0));
        gl_FragColor = vec4(c * uAlfa * pesc * linha * (0.93 + 0.07 * sin(uTempo * 37.0)), 1.0);
      }`,
  }));

  // --- partículas: saem dos vértices do capacete e vão para os do rosto ---
  const posR = geoRosto.attributes.position;
  const fins = [];
  for (let i = 0; i < posR.count; i++) if (posR.getY(i) > CORTE_PESCOCO - 0.3) fins.push(i);
  const posE = [];
  geosElmo.forEach((g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) posE.push(p.getX(i), p.getY(i), p.getZ(i)); });
  const n = fins.length;
  const ini = new Float32Array(n * 3), fim = new Float32Array(n * 3), rnd = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = fins[k];
    fim.set([posR.getX(i), posR.getY(i), posR.getZ(i)], k * 3);
    const j = Math.floor(Math.random() * (posE.length / 3));
    ini.set([posE[j * 3], posE[j * 3 + 1], posE[j * 3 + 2]], k * 3);
    rnd[k] = Math.random();
  }
  const geoP = new THREE.BufferGeometry();
  geoP.setAttribute('position', new THREE.BufferAttribute(fim.slice(), 3));
  geoP.setAttribute('aIni', new THREE.BufferAttribute(ini, 3));
  geoP.setAttribute('aFim', new THREE.BufferAttribute(fim, 3));
  geoP.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  const uniP = { uProg: { value: 0 }, uAlfa: { value: 0 }, uTempo: { value: 0 }, uTam: { value: 2.0 * renderer.getPixelRatio() } };
  const particulas = new THREE.Points(geoP, new THREE.ShaderMaterial({
    uniforms: uniP,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aIni; attribute vec3 aFim; attribute float aRnd;
      uniform float uProg; uniform float uTempo; uniform float uTam;
      varying float vB;
      void main() {
        float k = clamp((uProg - aRnd * 0.45) / 0.55, 0.0, 1.0);
        k = k * k * (3.0 - 2.0 * k);
        vec3 p = mix(aIni, aFim, k);
        float voo = sin(k * 3.14159);
        p += vec3(sin(aRnd * 40.0 + uTempo * 2.0), cos(aRnd * 31.0 + uTempo * 1.6), sin(aRnd * 17.0)) * voo * 1.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uTam * (0.6 + aRnd) * (14.0 / -mv.z);
        vB = 0.4 + 0.6 * aRnd;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlfa; varying float vB;
      void main() {
        float d = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vec3(0.6, 0.92, 1.0) * vB * d * uAlfa, 1.0);
      }`,
  }));

  const grupo = new THREE.Group();
  grupo.add(elmo, rosto, particulas);
  cena.add(grupo);

  let modo = 'vazio';
  let inicio = 0;
  let foto = null;
  let aoTerminar = null;

  function faiscas(intensidade) {
    if (intensidade <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(190, 245, 255, 0.9)';
    ctx.shadowColor = '#7fe6ff';
    ctx.shadowBlur = 12;
    const qtd = Math.floor(4 + 12 * intensidade);
    for (let k = 0; k < qtd; k++) {
      const lado = Math.random() < 0.5 ? -1 : 1;
      let x = L / 2 + lado * (30 + Math.random() * 40);
      let y = A * 0.4 + (Math.random() - 0.5) * 40;
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const passos = 4 + Math.floor(Math.random() * 6);
      for (let s = 0; s < passos; s++) {
        x += lado * (8 + Math.random() * 22) * intensidade;
        y += (Math.random() - 0.6) * 26;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(L / 2, A * 0.4, 10, L / 2, A * 0.4, 180);
    g.addColorStop(0, `rgba(120, 230, 255, ${0.3 * intensidade})`);
    g.addColorStop(1, 'rgba(120, 230, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, A);
    ctx.restore();
  }

  function desenharFoto(alfa) {
    if (!foto || alfa <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alfa * (0.9 + 0.1 * Math.random());
    ctx.drawImage(foto, 0, 0);
    if (Math.random() < 0.05) {
      const y = Math.random() * A, h = 4 + Math.random() * 18, dx = (Math.random() - 0.5) * 24;
      ctx.drawImage(foto, 0, y, L, h, dx, y, L, h);
    }
    ctx.restore();
  }

  function estado(alfaElmo, prog, alfaPart, alfaRosto) {
    uniElmoLinhas.uAlfa.value = alfaElmo;
    uniElmoMiolo.uAlfa.value = alfaElmo;
    elmo.visible = alfaElmo > 0.005;
    uniP.uProg.value = prog;
    uniP.uAlfa.value = alfaPart;
    particulas.visible = alfaPart > 0.005;
    uniRosto.uAlfa.value = foto ? 0 : alfaRosto;
    rosto.visible = !foto && alfaRosto > 0.005;
  }

  function quadro(agora) {
    requestAnimationFrame(quadro);
    const t = agora - inicio;
    const seg = agora / 1000;
    uniRosto.uTempo.value = seg;
    uniP.uTempo.value = seg;
    ctx.clearRect(0, 0, L, A);
    canvasGL.style.visibility = modo === 'vazio' ? 'hidden' : 'visible';
    if (modo === 'vazio') return;

    if (modo === 'mascara') {
      grupo.position.x = 0;
      grupo.rotation.set(0.08, 0.6 + Math.sin(seg * 0.6) * 0.35, 0);
      estado(1, 0, 0, 0);
    } else if (modo === 'transformando') {
      // capacete gira até ficar de frente e treme
      const vira = suave(300, 1500, t);
      grupo.rotation.set(0.08 * (1 - vira), (0.6 + Math.sin(t / 420) * 0.25) * (1 - vira), 0);
      const tremor = suave(800, 1400, t) * (1 - suave(1700, 2000, t));
      grupo.position.x = (Math.random() - 0.5) * 0.18 * tremor;
      // vira partículas, que voam e montam o rosto
      const alfaElmo = 1 - suave(1450, 1900, t);
      const prog = suave(1500, 3500, t);
      const alfaPart = suave(1400, 1700, t) * (1 - 0.65 * suave(3300, 4000, t));
      const alfaRosto = suave(3000, 3900, t);
      estado(alfaElmo, prog, alfaPart, alfaRosto);
      comp.render();
      faiscas(suave(700, 1300, t) * (1 - suave(2100, 2700, t)));
      desenharFoto(alfaRosto);
      if (t > 4000) {
        modo = 'rosto';
        grupo.position.x = 0;
        if (aoTerminar) { aoTerminar(); aoTerminar = null; }
      }
      return;
    } else if (modo === 'rosto') {
      grupo.rotation.set(0, Math.sin(seg * 0.5) * 0.15, 0);
      grupo.position.x = Math.random() < 0.04 ? (Math.random() - 0.5) * 0.25 : 0;
      estado(0, 1, foto ? 0 : 0.35, 1);
    }
    comp.render();
    desenharFoto(modo === 'rosto' ? 1 : 0);
  }
  requestAnimationFrame(quadro);

  return {
    // imagem do rosto já formado, para levar até a tela do celular
    retrato() {
      if (foto) return foto;
      const c = document.createElement('canvas');
      c.width = L; c.height = A;
      c.getContext('2d').drawImage(canvasGL, 0, 0, L, A);
      return c;
    },
    vazio() { modo = 'vazio'; },
    mascara() { modo = 'mascara'; inicio = performance.now(); },
    async preparar(ia) {
      foto = null;
      if (ia.rosto) {
        try { foto = await fotoHolograma(ia.rosto, L, A); } catch (e) { console.warn('Não consegui abrir o rosto de', ia.nome, e); }
      }
    },
    transformar() {
      return new Promise((ok) => {
        modo = 'transformando';
        inicio = performance.now();
        aoTerminar = ok;
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
    uLinhaA: { value: new THREE.Color('#ff6a2a') }, uLinhaB: { value: new THREE.Color('#3fd0ff') },
    uCorte: { value: 9 }, uAlfa: { value: 1 }, uOpacidade: { value: 0.75 },
  };
  const uniFinas = { ...uniLinhas, uOpacidade: { value: 0.32 } };
  const uniMiolo = {
    uMioloA: { value: new THREE.Color('#ff3a14') }, uMioloB: { value: new THREE.Color('#1f8fff') },
    uBorda: { value: new THREE.Color('#ffd27a') }, uCorte: uniLinhas.uCorte, uAlfa: { value: 0.9 }, uBordaForca: { value: 0.6 },
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

  function desenharRosto(ctx, img, alfa, revela, escala, brilhoVarredura) {
    if (!img) return;
    const w = TW * 0.8 * escala, h = w * (img.height / img.width);
    const x = (TW - w) / 2, y = TH * 0.33 - h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, TW, y + h * revela);
    ctx.clip();
    ctx.globalAlpha = alfa;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img, x, y, w, h);
    if (Math.random() < 0.08) {
      const fy = y + Math.random() * h * revela, fh = 6 + Math.random() * 20;
      ctx.drawImage(img, 0, ((fy - y) / h) * img.height, img.width, (fh / h) * img.height, x + (Math.random() - 0.5) * 30, fy, w, fh);
    }
    ctx.restore();
    if (brilhoVarredura > 0 && revela < 1) {
      const yv = y + h * revela;
      const g = ctx.createLinearGradient(0, yv - 30, 0, yv + 4);
      g.addColorStop(0, 'rgba(120,230,255,0)');
      g.addColorStop(1, `rgba(200,250,255,${0.9 * brilhoVarredura})`);
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
    const ciano = estadoTela.modo !== 'repouso';
    const cor = ciano ? '#5fdcff' : '#ff8a4a';

    // fundo suave
    const fundo = ctx.createLinearGradient(0, 0, 0, TH);
    fundo.addColorStop(0, ciano ? 'rgba(20,90,140,0.35)' : 'rgba(140,50,20,0.3)');
    fundo.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, TW, TH);
    grade(ctx, cor, 0.07);

    if (estadoTela.modo === 'repouso') {
      const pisca = 0.55 + 0.45 * Math.sin(agora / 400);
      texto(ctx, '09:41', TW / 2, TH * 0.24, 110, 'rgba(255,190,150,0.55)', 500, 0);
      texto(ctx, 'AGUARDANDO MÓDULO', TW / 2, TH * 0.62, 30, `rgba(255,170,120,${0.5 * pisca})`);
      ctx.strokeStyle = 'rgba(255,150,100,0.35)';
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
        ctx.strokeStyle = 'rgba(95,220,255,0.18)';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#7fe6ff';
        ctx.shadowColor = '#7fe6ff'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(95,220,255,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r + 14, agora / 300, agora / 300 + 0.9); ctx.stroke();
        texto(ctx, Math.floor(k * 100) + '%', cx, cy + 12, 38, '#dff8ff', 700, 0);
        texto(ctx, 'INTEGRANDO ' + estadoTela.nome, cx, TH * 0.61, 30, '#9eeaff');
        const feitos = Math.floor(k * LOGS.length);
        const atual = LOGS[Math.min(feitos, LOGS.length - 1)];
        ctx.font = '500 19px "Barlow Condensed", sans-serif';
        ctx.fillStyle = 'rgba(170,240,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText('› ' + atual + (k >= 1 ? '  ok' : '...'), TW / 2, TH * 0.81);
      }
    } else if (estadoTela.modo === 'pronto') {
      desenharRosto(ctx, estadoTela.rosto, 0.92 + 0.08 * Math.random(), 1, 1, 0);
      texto(ctx, estadoTela.nome, TW / 2, TH * 0.66, 64, '#dff8ff', 700, 6);
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
      uniLinhas.uCorte.value = ALT / 2 + 0.05 - e * (ALT + 0.4);
      if (k >= 1) troca = null;
    }
    const ciano = uniLinhas.uCorte.value < 0;
    uniMiolo.uBorda.value.set(ciano ? '#bff4ff' : '#ffd27a');
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
    instalar(rosto, nome) {
      const v = ++versao;
      estadoTela = { modo: 'instalando', inicio: performance.now(), rosto, nome: nome.toUpperCase() };
      setTimeout(() => { if (v === versao) troca = { inicio: performance.now(), duracao: 1800 }; }, 900);
      return new Promise((ok) => setTimeout(() => {
        if (v === versao) estadoTela = { ...estadoTela, modo: 'pronto' };
        ok();
      }, 3100));
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
