import { criarCabeca, criarCorpo } from './holograma.js';

(function () {
  const $ = (id) => document.getElementById(id);
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

  const tela = $('tela');
  const monitorArea = $('monitorArea');
  const janela = $('janela');
  let rosto = null;
  let corpo = null;
  const pronto = Promise.all([criarCabeca($('rosto3d'), $('rosto')), criarCorpo($('corpo3d'))])
    .then(([r, c]) => { rosto = r; corpo = c; })
    .catch((e) => { console.error('Falha ao carregar os modelos 3D', e); });

  const CHAVE_ANTERIOR = 'central-ias:anterior';
  let carregada = null;     // IA que está no leitor
  let chipNoLeitor = null;  // { el, dx, dy1, dy2, r }
  let sequencia = 0;        // aumenta a cada chip; cancela animações antigas
  const cachePrompts = {};

  // "VERÔNICA" -> "V.E.R.Ô.N.I.C.A."
  const sigla = (nome) =>
    nome.trim().toUpperCase().split(/\s+/).map((p) => [...p].join('.') + '.').join(' ');

  function lerAnterior() {
    try { return localStorage.getItem(CHAVE_ANTERIOR) || IA_ANTERIOR_PADRAO; } catch (e) { return IA_ANTERIOR_PADRAO; }
  }
  function salvarAnterior(nome) {
    try { localStorage.setItem(CHAVE_ANTERIOR, nome); } catch (e) { /* sem armazenamento: tudo bem */ }
  }

  // ---------------- escala do monitor ----------------
  function ajustar() {
    tela.style.transform = `scale(${monitorArea.clientWidth / 1600})`;
  }
  new ResizeObserver(ajustar).observe(monitorArea);
  ajustar();

  // ---------------- montagem ----------------
  $('placaCabecalho').textContent = CABECALHO_SISTEMA;

  const giros = [-9, 6, -4, 10, -12, 3, 8, -6, 12, -2];
  const chips = $('chips');
  IAS.forEach((ia, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.style.setProperty('--r', giros[i % giros.length] + 'deg');
    b.setAttribute('aria-label', 'Carregar ' + ia.nome);
    b.style.setProperty('--fator', Math.min(0.15, 0.74 / (ia.etiqueta.length * 0.95)));
    b.innerHTML = `
      <span class="chip-corpo">
        <span class="chip-etiqueta"><span>${ia.etiqueta}</span></span>
        <span class="chip-janela">${CIRCUITO_SVG}</span>
        <span class="chip-entalhe e"></span><span class="chip-entalhe d"></span>
        <span class="chip-entalhe e baixo"></span><span class="chip-entalhe d baixo"></span>
      </span>`;
    b.addEventListener('click', () => aoTocarChip(ia, b));
    chips.appendChild(b);
  });

  // ---------------- estado de espera ----------------
  function telaEmEspera(nomeAnterior) {
    janela.getAnimations().forEach((a) => a.cancel());
    janela.classList.remove('voou');
    $('aguardando').hidden = false;
    $('porcento').textContent = '0%';
    $('cargaBarra').style.width = '0%';
    pronto.then(() => { rosto && rosto.mascara(); corpo && corpo.paraLaranja(); });
    tela.classList.remove('ciano', 'trocando', 'final');

    const placa = $('placaNome');
    placa.classList.remove('nova', 'apagando');
    $('placaTexto').textContent = nomeAnterior;
    $('placaSubTexto').textContent = '';
    $('placaSubBarra').getAnimations().forEach((a) => a.cancel());

    $('sistemas').innerHTML = '';
    $('nomeFantasma').textContent = nomeAnterior;
    $('atualizando').classList.remove('visivel');
    $('leitorLed').classList.remove('aceso', 'lendo');
  }

  // ---------------- chip entrando e saindo do leitor ----------------
  function animarEntrada(el) {
    const boca = document.querySelector('.leitor-boca').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const h = el.offsetHeight;
    const giro = getComputedStyle(el).getPropertyValue('--r').trim() || '0deg';
    const dx = boca.left + boca.width / 2 - (r.left + r.width / 2);
    const cy = r.top + r.height / 2;
    const dy1 = boca.bottom + 14 + h / 2 - cy;            // embaixo da boca do leitor
    const dy2 = boca.bottom - h * 0.6 + h / 2 - cy;        // dentro do leitor
    el.classList.add('no-leitor');
    const anim = el.animate(
      [
        { transform: `translate(0,0) rotate(${giro}) scale(1)` },
        { transform: `translate(${dx * 0.5}px, ${dy1 * 0.5 - 30}px) rotate(0deg) scale(1.08)`, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy1}px) rotate(0deg) scale(1)`, offset: 0.65 },
        { transform: `translate(${dx}px, ${dy2}px) rotate(0deg) scale(1)` },
      ],
      { duration: 1100, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' }
    );
    chipNoLeitor = { el, dx, dy1, dy2, giro };
    return anim.finished;
  }

  function animarSaida() {
    if (!chipNoLeitor) return Promise.resolve();
    const { el, dx, dy1, dy2, giro } = chipNoLeitor;
    chipNoLeitor = null;
    el.getAnimations().forEach((a) => a.cancel());
    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy2}px) rotate(0deg) scale(1)` },
        { transform: `translate(${dx}px, ${dy1}px) rotate(0deg) scale(1)`, offset: 0.35 },
        { transform: `translate(0,0) rotate(${giro}) scale(1)` },
      ],
      { duration: 700, easing: 'cubic-bezier(.4,0,.2,1)' }
    );
    return anim.finished.then(() => el.classList.remove('no-leitor'));
  }

  async function aoTocarChip(ia, el) {
    if (chipNoLeitor && chipNoLeitor.el === el) { ejetar(); return; }
    const minha = ++sequencia;
    fecharProtocolo();
    $('verPrompt').hidden = true;
    document.body.classList.add('ocupado');
    if (chipNoLeitor) {
      const nomeAnterior = carregada ? sigla(carregada.nome) : lerAnterior();
      await animarSaida();
      telaEmEspera(nomeAnterior);
      if (minha !== sequencia) return;
    }
    carregada = ia;
    $('dica').textContent = 'Lendo ' + ia.etiqueta + '...';
    await animarEntrada(el);
    if (minha !== sequencia) return;
    await carregarNaTela(ia, minha);
  }

  async function ejetar() {
    const minha = ++sequencia;
    fecharProtocolo();
    $('verPrompt').hidden = true;
    const nomeAnterior = carregada ? sigla(carregada.nome) : lerAnterior();
    carregada = null;
    $('leitorLed').classList.remove('aceso', 'lendo');
    await animarSaida();
    if (minha !== sequencia) return;
    telaEmEspera(nomeAnterior);
    $('dica').textContent = 'Toque em um chip para carregar a IA';
    document.body.classList.remove('ocupado');
  }

  // ---------------- a sequência do monitor ----------------
  function contarPorcento(duracao, minha) {
    const ini = performance.now();
    const passo = (agora) => {
      if (minha !== sequencia) return;
      const k = Math.min(1, (agora - ini) / duracao);
      const v = Math.floor(100 * (k < 0.15 ? k * 0.6 : 0.09 + (k - 0.15) * 1.07));
      $('porcento').textContent = Math.min(100, v) + '%';
      $('cargaBarra').style.width = Math.min(100, v) + '%';
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  async function carregarNaTela(ia, minha) {
    const ok = () => minha === sequencia;
    const nomeNovo = sigla(ia.nome);
    const led = $('leitorLed');
    led.classList.add('lendo');

    await pronto;
    if (!rosto || !corpo) { $('dica').textContent = 'Não consegui carregar os modelos 3D. Recarregue a página.'; return; }
    await rosto.preparar(ia);
    if (!ok()) return;
    $('aguardando').hidden = true;
    led.classList.remove('lendo');
    led.classList.add('aceso');

    const fimDoRosto = rosto.transformar();
    contarPorcento(4300, minha);

    await esperar(2700); if (!ok()) return;
    const clarao = $('clarao');
    clarao.getAnimations().forEach((a) => a.cancel());
    clarao.animate(
      [{ opacity: 0 }, { opacity: 0.6, offset: 0.25 }, { opacity: 0.4, offset: 0.6 }, { opacity: 0 }],
      { duration: 1300, easing: 'ease-out' }
    );

    await esperar(400); if (!ok()) return;
    $('placaNome').classList.add('apagando');
    $('placaSubBarra').animate([{ width: '0%' }, { width: '100%' }], { duration: 1500, easing: 'ease-in-out', fill: 'forwards' });

    await fimDoRosto; if (!ok()) return;
    await esperar(500); if (!ok()) return;

    // a janela encolhe e voa até a cabeça do corpo
    const jr = janela.getBoundingClientRect();
    const cabeca = $('corpo3d').getBoundingClientRect();
    const escala = monitorArea.clientWidth / 1600;
    const dx = (cabeca.left + cabeca.width * 0.5 - (jr.left + jr.width / 2)) / escala;
    const dy = (cabeca.top + cabeca.height * 0.16 - (jr.top + jr.height / 2)) / escala;
    janela.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(.32)`, opacity: 0.9, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0 },
      ],
      { duration: 1000, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' }
    );
    $('nomeFantasma').textContent = nomeNovo;
    $('atualizando').classList.add('visivel');

    await esperar(500); if (!ok()) return;
    tela.classList.add('trocando');
    corpo.paraCiano(1600);

    await esperar(800); if (!ok()) return;
    const placa = $('placaNome');
    placa.classList.remove('apagando');
    placa.classList.add('nova');
    $('placaTexto').textContent = nomeNovo;
    $('placaSubTexto').textContent = 'OVERRIDE IN PROGRESS';
    placa.animate(
      [{ filter: 'brightness(2.2)', transform: 'translateX(-6px)' }, { filter: 'brightness(1)', transform: 'translateX(0)' }],
      { duration: 450, easing: 'ease-out' }
    );

    await esperar(300); if (!ok()) return;
    tela.classList.add('ciano');
    const lista = $('sistemas');
    lista.innerHTML = '';
    for (let i = 0; i < ia.sistemas.length; i++) {
      const li = document.createElement('li');
      li.innerHTML = `<small>SYS 0${i + 1}</small><b>${ia.sistemas[i]} <span>SYSTEM</span></b><i><em></em></i>`;
      li.style.animationDelay = i * 0.18 + 's';
      li.querySelector('em').style.animationDelay = 0.3 + i * 0.18 + 's';
      lista.appendChild(li);
    }

    salvarAnterior(nomeNovo);
    await esperar(2000); if (!ok()) return;
    tela.classList.add('final');
    document.body.classList.remove('ocupado');
    $('dica').textContent = ia.etiqueta + ' carregada · toque no chip para ejetar';
    abrirProtocolo(ia);
  }

  // ---------------- painel do prompt ----------------
  async function pegarPrompt(ia) {
    if (cachePrompts[ia.id]) return cachePrompts[ia.id];
    try {
      const r = await fetch(`ias/prompts/${ia.id}.md`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      cachePrompts[ia.id] = (await r.text()).trim();
    } catch (e) {
      return `Não encontrei o arquivo ias/prompts/${ia.id}.md`;
    }
    return cachePrompts[ia.id];
  }

  async function abrirProtocolo(ia) {
    $('protocoloTitulo').textContent = sigla(ia.nome);
    $('protocoloTexto').textContent = 'Carregando...';
    $('protocolo').hidden = false;
    $('verPrompt').hidden = true;
    $('protocoloTexto').textContent = await pegarPrompt(ia);
    $('protocoloTexto').scrollTop = 0;
  }

  function fecharProtocolo() {
    $('protocolo').hidden = true;
    if (carregada && !document.body.classList.contains('ocupado')) $('verPrompt').hidden = false;
  }

  async function copiar() {
    const texto = carregada ? await pegarPrompt(carregada) : '';
    let deu = false;
    try { await navigator.clipboard.writeText(texto); deu = true; } catch (e) {
      const t = document.createElement('textarea');
      t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { deu = document.execCommand('copy'); } catch (e2) { deu = false; }
      t.remove();
    }
    const b = $('copiar');
    b.textContent = deu ? 'Copiado ✓' : 'Não consegui copiar';
    b.classList.toggle('feito', deu);
    setTimeout(() => { b.textContent = 'Copiar prompt'; b.classList.remove('feito'); }, 2000);
  }

  $('copiar').addEventListener('click', copiar);
  $('fecharProtocolo').addEventListener('click', fecharProtocolo);
  $('ejetar').addEventListener('click', ejetar);
  $('verPrompt').addEventListener('click', () => carregada && abrirProtocolo(carregada));
  $('protocolo').addEventListener('click', (e) => { if (e.target === $('protocolo')) fecharProtocolo(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharProtocolo(); });

  telaEmEspera(lerAnterior());
})();
