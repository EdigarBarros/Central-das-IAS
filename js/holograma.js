// Partes em 3D da tela: a cabeça (máscara -> partículas -> rosto) e o corpo em holograma.
// Modelos: Xbot (Mixamo) e cabeça de Lee Perry-Smith (CC BY 3.0), ambos dos exemplos do three.js.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const carregador = new GLTFLoader();
const carregar = (url) => new Promise((ok, erro) => carregador.load(url, ok, undefined, erro));

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const LARANJA = new THREE.Color('#ff5a1f');
const DOURADO = new THREE.Color('#ffc46b');
const CIANO = new THREE.Color('#2fc8ff');
const CIANO_CLARO = new THREE.Color('#bff4ff');

// ============================================================
// CABEÇA
// ============================================================
const vertCabeca = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vP = position;
    gl_Position = projectionMatrix * mv;
  }`;

// modo 0 = máscara vermelha com borda ciano; modo 1 = holograma do rosto
const fragCabeca = /* glsl */ `
  uniform float uModo;
  uniform float uAlfa;
  uniform float uTempo;
  uniform float uOlhos;
  uniform float uCorteY;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec3 n = normalize(vN);
    float fres = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
    vec3 luz = normalize(vec3(0.15, 0.55, 1.0));
    float dif = max(dot(n, luz), 0.0);

    // máscara: vermelho escuro, contorno ciano, olhos acesos
    vec3 mascara = mix(vec3(0.32, 0.03, 0.03), vec3(0.55, 0.08, 0.06), dif);
    mascara = mix(mascara, vec3(0.35, 0.9, 1.0), smoothstep(0.35, 0.95, fres));
    float aMascara = 0.82 + 0.18 * fres;

    // holograma: rosto escuro com luz forte nos relevos (testa, sobrancelhas, nariz, boca)
    float dif2 = max(dot(n, normalize(vec3(0.0, 0.05, 1.0))), 0.0);
    float brilho = pow(dif2, 5.0) * 0.95 + fres * 0.3;
    vec3 holo = mix(vec3(0.05, 0.5, 0.75), vec3(0.85, 0.98, 1.0), smoothstep(0.35, 1.0, brilho)) * brilho;
    float linha = 0.78 + 0.22 * step(0.5, fract(gl_FragCoord.y / 3.0));
    float aHolo = clamp(brilho, 0.0, 1.0) * linha * (0.92 + 0.08 * sin(uTempo * 40.0));

    vec3 cor = mix(mascara, holo, uModo);
    float pescoco = smoothstep(uCorteY - 0.9, uCorteY + 0.3, vP.y);
    float a = mix(aMascara, aHolo, uModo) * uAlfa * pescoco;
    gl_FragColor = vec4(cor, a);
  }`;

const vertPontos = /* glsl */ `
  attribute vec3 aDir;
  attribute float aRand;
  uniform float uEspalhar;
  uniform float uTempo;
  uniform float uTam;
  uniform float uCorteY;
  varying float vBrilho;
  void main() {
    if (position.y < uCorteY - 0.6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float e = uEspalhar * (0.6 + aRand * 0.8);
    vec3 p = position + aDir * e * 3.2;
    p += vec3(sin(uTempo * 2.0 + aRand * 20.0), cos(uTempo * 1.7 + aRand * 13.0), sin(uTempo * 1.3 + aRand * 7.0)) * e * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uTam * (0.6 + aRand) * (10.0 / -mv.z);
    vBrilho = 0.45 + 0.55 * aRand;
    gl_Position = projectionMatrix * mv;
  }`;

const fragPontos = /* glsl */ `
  uniform float uAlfa;
  varying float vBrilho;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = 1.0 - smoothstep(0.15, 0.5, length(c));
    gl_FragColor = vec4(vec3(0.65, 0.93, 1.0) * vBrilho, d * uAlfa * vBrilho);
  }`;

// Foto da IA transformada em holograma (2D), quando a IA tem imagem própria.
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
    p[i] = 40 + 200 * Math.pow(l, 1.5);
    p[i + 1] = 170 + 85 * l;
    p[i + 2] = 230 + 25 * l;
    p[i + 3] = 255 * suave(0.1, 0.65, l) * borda;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

export async function criarCabeca(canvasGL, canvas2D) {
  const L = canvas2D.width, A = canvas2D.height;
  const ctx = canvas2D.getContext('2d');
  const renderer = new THREE.WebGLRenderer({ canvas: canvasGL, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(L, A, false);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, L / A, 0.1, 100);
  camera.position.set(0, 1.0, 14.5);
  camera.lookAt(0, 1.0, 0);

  const gltf = await carregar('modelos/LeePerrySmith.glb');
  let geo = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
  geo = geo.clone();
  geo.computeVertexNormals();

  const uniCabeca = {
    uModo: { value: 0 }, uAlfa: { value: 1 }, uTempo: { value: 0 }, uOlhos: { value: 1 }, uCorteY: { value: -1.2 },
  };
  const malha = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    vertexShader: vertCabeca, fragmentShader: fragCabeca, uniforms: uniCabeca,
    transparent: true, depthWrite: true,
  }));

  // nuvem de partículas com os mesmos vértices da cabeça
  const n = geo.attributes.position.count;
  const dir = new Float32Array(n * 3), rand = new Float32Array(n);
  const pos = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    v.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.4)).normalize();
    dir.set([v.x, v.y, v.z], i * 3);
    rand[i] = Math.random();
  }
  const geoPontos = new THREE.BufferGeometry();
  geoPontos.setAttribute('position', pos);
  geoPontos.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geoPontos.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  const uniPontos = { uEspalhar: { value: 0 }, uTempo: { value: 0 }, uAlfa: { value: 0 }, uTam: { value: 2.2 * renderer.getPixelRatio() }, uCorteY: uniCabeca.uCorteY };
  const pontos = new THREE.Points(geoPontos, new THREE.ShaderMaterial({
    vertexShader: vertPontos, fragmentShader: fragPontos, uniforms: uniPontos,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));

  const uniArame = { uAlfa: { value: 1 }, uCorteY: uniCabeca.uCorteY };
  const arame = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: uniArame, wireframe: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uAlfa; uniform float uCorteY; varying float vY; void main(){ float p = smoothstep(uCorteY - 0.9, uCorteY + 0.3, vY); gl_FragColor = vec4(vec3(0.25,0.75,0.95), 0.10 * uAlfa * p); }',
  }));
  const grupo = new THREE.Group();
  grupo.add(malha, arame, pontos);
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
      let y = A * 0.42 + (Math.random() - 0.5) * 40;
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
    const g = ctx.createRadialGradient(L / 2, A * 0.42, 10, L / 2, A * 0.42, 180);
    g.addColorStop(0, `rgba(120, 230, 255, ${0.35 * intensidade})`);
    g.addColorStop(1, 'rgba(120, 230, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L, A);
    ctx.restore();
  }

  function desenharFoto(alfa) {
    if (!foto || alfa <= 0) return;
    ctx.save();
    ctx.globalAlpha = alfa * (0.9 + 0.1 * Math.random());
    ctx.drawImage(foto, 0, 0);
    if (Math.random() < 0.05) {
      const y = Math.random() * A, h = 4 + Math.random() * 18, dx = (Math.random() - 0.5) * 24;
      ctx.drawImage(foto, 0, y, L, h, dx, y, L, h);
    }
    ctx.fillStyle = 'rgba(4, 10, 20, 0.28)';
    for (let yy = 0; yy < A; yy += 3) ctx.fillRect(0, yy, L, 1);
    ctx.restore();
  }

  function quadro(agora) {
    requestAnimationFrame(quadro);
    const t = agora - inicio;
    const seg = agora / 1000;
    uniCabeca.uTempo.value = seg;
    uniPontos.uTempo.value = seg;
    ctx.clearRect(0, 0, L, A);
    canvasGL.style.visibility = modo === 'vazio' ? 'hidden' : 'visible';

    if (modo === 'mascara') {
      grupo.rotation.set(0.05, 0.55 + Math.sin(seg * 0.7) * 0.35, 0);
      uniCabeca.uModo.value = 0; uniCabeca.uAlfa.value = 1; uniPontos.uAlfa.value = 0;
      uniCabeca.uOlhos.value = 0.75 + 0.25 * Math.sin(seg * 3);
      malha.visible = true; arame.visible = true; uniArame.uAlfa.value = 1;
    } else if (modo === 'transformando') {
      // 1) máscara girando até ficar de frente, tremendo
      const giro = 0.55 * (1 - suave(600, 2600, t));
      grupo.rotation.set(0.05 * (1 - suave(600, 2600, t)), giro + Math.sin(t / 380) * 0.25 * (1 - suave(400, 1600, t)), 0);
      const tremor = suave(900, 1500, t) * (1 - suave(1900, 2200, t));
      grupo.position.x = (Math.random() - 0.5) * 0.12 * tremor;
      // 2) a máscara some e vira partículas, que se espalham e voltam formando o rosto
      const alfaMascara = 1 - suave(1500, 2000, t);
      const espalhar = suave(1700, 2400, t) * (1 - suave(2500, 3400, t));
      uniPontos.uEspalhar.value = espalhar;
      uniPontos.uAlfa.value = suave(1400, 1800, t) * (1 - suave(3300, 4000, t));
      // 3) o rosto em holograma aparece (3D ou a foto da IA)
      const alfaRosto = suave(3000, 3800, t);
      arame.visible = alfaMascara > 0.01; uniArame.uAlfa.value = alfaMascara;
      if (alfaMascara > 0.01) {
        uniCabeca.uModo.value = 0; uniCabeca.uAlfa.value = alfaMascara; uniCabeca.uOlhos.value = 1 + tremor;
        malha.visible = true;
      } else if (!foto) {
        uniCabeca.uModo.value = 1; uniCabeca.uAlfa.value = alfaRosto;
        malha.visible = alfaRosto > 0.01;
      } else {
        malha.visible = false;
      }
      renderer.render(cena, camera);
      faiscas(suave(700, 1400, t) * (1 - suave(2300, 2900, t)));
      desenharFoto(alfaRosto);
      if (t > 4000) {
        modo = 'rosto';
        grupo.position.x = 0;
        if (aoTerminar) { aoTerminar(); aoTerminar = null; }
      }
      return;
    } else if (modo === 'rosto') {
      grupo.rotation.set(0, Math.sin(seg * 0.5) * 0.12, 0);
      uniPontos.uAlfa.value = 0;
      arame.visible = false;
      if (foto) {
        malha.visible = false;
        renderer.render(cena, camera);
        desenharFoto(1);
        return;
      }
      malha.visible = true;
      uniCabeca.uModo.value = 1; uniCabeca.uAlfa.value = 1;
      if (Math.random() < 0.04) grupo.position.x = (Math.random() - 0.5) * 0.2; else grupo.position.x = 0;
    }
    renderer.render(cena, camera);
  }
  requestAnimationFrame(quadro);

  return {
    vazio() { modo = 'vazio'; },
    mascara() { modo = 'mascara'; inicio = performance.now(); grupo.position.x = 0; },
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
function materialCorpo(uniformes, wire) {
  return new THREE.ShaderMaterial({
    uniforms: uniformes,
    wireframe: wire,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 mundo = modelMatrix * vec4(transformed, 1.0);
        vY = mundo.y;
        vec4 mv = viewMatrix * mundo;
        vN = normalize(normalMatrix * objectNormal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCorA;
      uniform vec3 uBordaA;
      uniform vec3 uCorB;
      uniform vec3 uBordaB;
      uniform float uCorte;
      uniform float uForca;
      uniform float uTempo;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float novo = smoothstep(uCorte - 0.04, uCorte + 0.04, vY);
        vec3 cor = mix(uCorA, uCorB, novo);
        vec3 borda = mix(uBordaA, uBordaB, novo);
        vec3 c = cor * (0.05 + 0.32 * fres) + borda * pow(fres, 3.0) * 0.9;
        float faixa = smoothstep(0.03, 0.0, abs(vY - uCorte)) * step(0.001, uCorte) * step(uCorte, 1.95);
        c += vec3(0.8, 0.97, 1.0) * faixa * 1.5;
        float linha = 0.85 + 0.15 * step(0.5, fract(gl_FragCoord.y / 3.0));
        gl_FragColor = vec4(c * uForca * linha, 1.0);
      }`,
  });
}

function texturaBrilho() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.25)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.08)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export async function criarCorpo(canvas) {
  const L = canvas.width, A = canvas.height;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(L, A, false);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, L / A, 0.1, 50);
  camera.position.set(0, 0.95, 4.3);
  camera.lookAt(0, 0.9, 0);

  const gltf = await carregar('modelos/Xbot.glb');
  const modelo = gltf.scene;
  const uniSuperficie = {
    uCorA: { value: LARANJA.clone() }, uBordaA: { value: DOURADO.clone() },
    uCorB: { value: CIANO.clone() }, uBordaB: { value: CIANO_CLARO.clone() },
    uCorte: { value: 3 }, uForca: { value: 1 }, uTempo: { value: 0 },
  };
  const uniJuntas = {
    uCorA: { value: DOURADO.clone() }, uBordaA: { value: new THREE.Color('#fff0c0') },
    uCorB: { value: new THREE.Color('#7fe9ff') }, uBordaB: { value: new THREE.Color('#ffffff') },
    uCorte: uniSuperficie.uCorte, uForca: { value: 0.55 }, uTempo: uniSuperficie.uTempo,
  };
  const uniArame = {
    uCorA: { value: new THREE.Color('#ff7a2a') }, uBordaA: { value: new THREE.Color('#ffd27a') },
    uCorB: { value: new THREE.Color('#2fb8ff') }, uBordaB: { value: new THREE.Color('#bff4ff') },
    uCorte: uniSuperficie.uCorte, uForca: { value: 0.55 }, uTempo: uniSuperficie.uTempo,
  };
  const extras = [];
  modelo.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.frustumCulled = false;
    const juntas = /Joints/i.test(o.name);
    o.material = materialCorpo(juntas ? uniJuntas : uniSuperficie, false);
    // segunda camada só com as arestas (o "wireframe" do filme)
    const arame = new THREE.SkinnedMesh(o.geometry, materialCorpo(uniArame, true));
    arame.bind(o.skeleton, o.bindMatrix);
    arame.frustumCulled = false;
    extras.push([o.parent, arame]);
  });
  extras.forEach(([pai, m]) => pai.add(m));
  modelo.rotation.y = -0.32;
  cena.add(modelo);

  const mixer = new THREE.AnimationMixer(modelo);
  const idle = gltf.animations.find((a) => a.name === 'idle');
  if (idle) mixer.clipAction(idle).play();

  // reator no peito
  const brilho = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texturaBrilho(), color: new THREE.Color('#ffe6b0'), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  brilho.scale.set(0.2, 0.2, 1);
  let peito = null;
  modelo.traverse((o) => { if (o.isBone && /Spine2$/.test(o.name)) peito = o; });
  if (peito) {
    peito.add(brilho);
    // os ossos do Mixamo estão em escala 100x
    const escala = new THREE.Vector3();
    peito.getWorldScale(escala);
    brilho.scale.set(0.2 / escala.x, 0.2 / escala.y, 1);
    brilho.position.set(0, 0.06 / escala.y, 0.13 / escala.z);
  } else {
    brilho.position.set(0, 1.3, 0.15);
    cena.add(brilho);
  }

  const relogio = new THREE.Clock();
  let troca = null; // { inicio, duracao, ida }
  function quadro() {
    requestAnimationFrame(quadro);
    const dt = relogio.getDelta();
    mixer.update(dt);
    const seg = relogio.elapsedTime;
    uniSuperficie.uTempo.value = seg;
    modelo.rotation.y = -0.32 + Math.sin(seg * 0.3) * 0.06;
    if (troca) {
      const k = Math.min(1, (performance.now() - troca.inicio) / troca.duracao);
      const e = k * k * (3 - 2 * k);
      // o corte desce da cabeça (y ~1.9) aos pés (y ~0)
      uniSuperficie.uCorte.value = troca.ida ? 1.95 - e * 2.05 : 3;
      if (k >= 1) troca = null;
    }
    const novo = uniSuperficie.uCorte.value < 1.0;
    brilho.material.color.set(novo ? '#9ff8ec' : '#ffe0a8');
    brilho.material.opacity = 0.85 + 0.15 * Math.sin(seg * 4);
    renderer.render(cena, camera);
  }
  quadro();

  return {
    paraCiano(duracao) { troca = { inicio: performance.now(), duracao, ida: true }; },
    paraLaranja() { troca = null; uniSuperficie.uCorte.value = 3; },
  };
}
