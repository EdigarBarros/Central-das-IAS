// Partes em 3D da tela, desenhadas como holograma: linhas finas acesas, miolo quase transparente e brilho
// espalhado (bloom). O canvas é desenhado sobre fundo preto e entra na página com "mix-blend-mode: screen",
// então o preto some e só a luz aparece por cima da interface.
//
// Modelos (créditos no README):
//   DamagedHelmet  -> a máscara da IA anterior
//   LeePerrySmith  -> o rosto genérico (quando a IA não tem foto)
//   BrainStem      -> o corpo

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Os modelos vêm direto dos repositórios de origem (pelo jsDelivr), assim o site fica leve.
const MODELOS = {
  capacete: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  cabeca: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb',
  corpo: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/BrainStem/glTF-Binary/BrainStem.glb',
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

function criarRenderer(canvas, L, A) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
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
    const l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
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
  const renderer = criarRenderer(canvasGL, L, A);
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
// CORPO
// ============================================================
export async function criarCorpo(canvas) {
  const L = canvas.width, A = canvas.height;
  const renderer = criarRenderer(canvas, L, A);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, L / A, 0.1, 50);
  camera.position.set(0, 0.9, 5.6);
  camera.lookAt(0, 0.9, 0);
  const comp = compositor(renderer, cena, camera, L, A, 0.55);

  const gltf = await carregar(MODELOS.corpo);
  const geos = congelar(gltf.scene, gltf.animations[0], 0);
  const caixa = ajustarAltura(geos, 1.82, true);

  const uniLinhas = {
    uLinhaA: { value: new THREE.Color('#ff6a2a') }, uLinhaB: { value: new THREE.Color('#38c8ff') },
    uCorte: { value: 9 }, uAlfa: { value: 1 }, uOpacidade: { value: 0.2 },
  };
  const uniMiolo = {
    uMioloA: { value: new THREE.Color('#ff3a14') }, uMioloB: { value: new THREE.Color('#1f8fff') },
    uBorda: { value: new THREE.Color('#ffd27a') }, uCorte: uniLinhas.uCorte, uAlfa: { value: 0.7 }, uBordaForca: { value: 0.4 },
  };
  const modelo = new THREE.Group();
  geos.forEach((g) => {
    modelo.add(new THREE.Mesh(g, materialMiolo(uniMiolo)));
    modelo.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), materialLinhas(uniLinhas)));
  });
  cena.add(modelo);

  // reator no peito
  const brilho = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texturaBrilho(), color: new THREE.Color('#ffd9a0'), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  brilho.scale.set(0.16, 0.16, 1);
  brilho.position.set(0, caixa.max.y * 0.7, caixa.max.z * 0.7);
  modelo.add(brilho);

  const borda = uniMiolo.uBorda.value;
  const relogio = new THREE.Clock();
  let troca = null;
  function quadro() {
    requestAnimationFrame(quadro);
    const seg = relogio.getElapsedTime();
    modelo.rotation.y = -0.28 + Math.sin(seg * 0.35) * 0.08;
    modelo.position.y = Math.sin(seg * 1.1) * 0.006;
    if (troca) {
      const k = Math.min(1, (performance.now() - troca.inicio) / troca.duracao);
      const e = k * k * (3 - 2 * k);
      uniLinhas.uCorte.value = caixa.max.y + 0.05 - e * (caixa.max.y + 0.15);
      if (k >= 1) troca = null;
    }
    const ciano = uniLinhas.uCorte.value < caixa.max.y * 0.7;
    brilho.material.color.set(ciano ? '#9ff8ec' : '#ffd9a0');
    borda.set(ciano ? '#bff4ff' : '#ffd27a');
    brilho.material.opacity = 0.8 + 0.2 * Math.sin(seg * 4);
    comp.render();
  }
  quadro();

  return {
    paraCiano(duracao) { troca = { inicio: performance.now(), duracao }; },
    paraLaranja() { troca = null; uniLinhas.uCorte.value = 9; },
  };
}
