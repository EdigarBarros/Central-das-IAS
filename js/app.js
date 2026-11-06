import { criarServidor, criarCelular } from './holograma.js';
import { abrirCofre, lerPrompt } from './cofre.js';

(function () {
  const $ = (id) => document.getElementById(id);
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

  const tela = $('tela');
  const monitorArea = $('monitorArea');
  const janela = $('janela');
  let rosto = null;
  let corpo = null;
  const pronto = Promise.all([criarServidor($('rosto3d'), $('rosto')), criarCelular($('corpo3d'))])
    .then(([r, c]) => { rosto = r; corpo = c; })
    .catch((e) => { console.error('Falha ao carregar os modelos 3D', e); });

  let carregada = null;     // IA que está no leitor
  let chipNoLeitor = null;  // { el, dx, dy1, dy2, r }
  let sequencia = 0;        // aumenta a cada chip; cancela animações antigas
  const cachePrompts = {};
  const chavePronta = abrirCofre();

  // "VERÔNICA" -> "V.E.R.Ô.N.I.C.A."
  const sigla = (nome) =>
    nome.trim().toUpperCase().split(/\s+/).map((p) => [...p].join('.') + '.').join(' ');


  // ---------------- escala do monitor ----------------
  // A tela é desenhada num tamanho fixo (1600 x 900 deitada, 900 x 1240 em pé no celular, quem decide é o CSS)
  // e encolhe inteira para caber no monitor.
  const escala = () => monitorArea.clientWidth / (tela.offsetWidth || 1600);
  function ajustar() {
    const k = escala();
    tela.style.transform = `scale(${k})`;
    // 1px "de verdade" medido dentro da cena encolhida: o texto do prompt usa isso para sair sempre legível
    tela.style.setProperty('--px', (1 / k) + 'px');
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

  // Deitado, os chips ficam em coluna ao lado do monitor: até 3 chips numa coluna só, depois em duas.
  const bancada = $('bancada');
  const colunasDeitado = IAS.length <= 3 ? 1 : 2;
  bancada.style.setProperty('--quantos', IAS.length);
  bancada.style.setProperty('--colunas-deitado', colunasDeitado);
  bancada.style.setProperty('--linhas-deitado', Math.ceil(IAS.length / colunasDeitado));

  // ---------------- estado de espera ----------------
  function telaEmEspera() {
    esconderPrompt(false);
    tela.querySelectorAll('.voo-rosto').forEach((c) => c.remove());
    janela.getAnimations().forEach((a) => a.cancel());
    janela.classList.remove('voou');
    $('aguardando').hidden = false;
    $('porcento').textContent = '0%';
    $('cargaBarra').style.width = '0%';
    pronto.then(() => { rosto && rosto.mascara(); corpo && corpo.repouso(); });
    tela.classList.remove('ciano', 'trocando', 'final');

    const placa = $('placaNome');
    placa.classList.remove('nova', 'apagando');
    $('placaTexto').textContent = '';
    document.body.style.removeProperty('--cor-ia');
    $('placaSubTexto').textContent = '';
    $('placaSubBarra').getAnimations().forEach((a) => a.cancel());

    $('sistemas').innerHTML = '';
    $('nomeFantasma').textContent = '';
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

  // Se a tela gira ou muda de tamanho com um chip no leitor, o leitor muda de lugar: o chip vai junto.
  function chipParaOLeitor() {
    if (!chipNoLeitor) return;
    const { el, giro } = chipNoLeitor;
    const anims = el.getAnimations();
    if (anims.some((a) => a.playState === 'running')) {
      // ainda está entrando: espera terminar e confere de novo
      Promise.all(anims.map((a) => a.finished)).then(chipParaOLeitor, () => {});
      return;
    }
    anims.forEach((a) => a.cancel());
    const boca = document.querySelector('.leitor-boca').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const h = el.offsetHeight;
    const cy = r.top + r.height / 2;
    const dx = boca.left + boca.width / 2 - (r.left + r.width / 2);
    const dy1 = boca.bottom + 14 + h / 2 - cy;
    const dy2 = boca.bottom - h * 0.6 + h / 2 - cy;
    el.animate([{ transform: `translate(${dx}px, ${dy2}px) rotate(0deg) scale(1)` }], { duration: 0, fill: 'forwards' });
    chipNoLeitor = { el, dx, dy1, dy2, giro };
  }
  let esperaGiro = 0;
  window.addEventListener('resize', () => {
    clearTimeout(esperaGiro);
    esperaGiro = setTimeout(chipParaOLeitor, 120);
  });

  // No celular a página rola: quando a IA começa a carregar, o monitor entra inteiro na tela.
  function mostrarMonitor() {
    const r = monitorArea.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    monitorArea.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'nearest' });
  }

  async function aoTocarChip(ia, el) {
    if (chipNoLeitor && chipNoLeitor.el === el) { ejetar(); return; }
    const minha = ++sequencia;
    document.body.classList.add('ocupado');
    if (chipNoLeitor) {
      await tirarIADoCelular(minha);
      if (minha !== sequencia) return;
      await animarSaida();
      telaEmEspera();
      if (minha !== sequencia) return;
    }
    carregada = ia;
    $('dica').textContent = 'Lendo ' + ia.etiqueta + '...';
    await animarEntrada(el);
    if (minha !== sequencia) return;
    mostrarMonitor();
    await carregarNaTela(ia, minha);
  }

  // A IA sai do celular e volta para o servidor (só quando ela terminou de carregar).
  async function tirarIADoCelular(minha) {
    if (!carregada || !tela.classList.contains('final') || !rosto || !corpo) return;
    const ok = () => minha === sequencia;
    $('dica').textContent = 'Removendo ' + carregada.etiqueta + '...';
    tela.classList.remove('final');
    await esconderPrompt(true); if (!ok()) return;

    // sistemas e ligações saem; a caixa do nome pisca e se apaga
    $('sistemas').querySelectorAll('li').forEach((li, i) => li.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(30px)' }],
      { duration: 350, delay: i * 70, fill: 'forwards' }
    ));
    tela.classList.remove('ciano');
    const placa = $('placaNome');
    $('placaSubTexto').textContent = 'DISCONNECTING';
    placa.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2.2)', transform: 'translateX(4px)' }, { filter: 'brightness(1)' }], { duration: 500 });

    const saida = corpo.desinstalar();
    await esperar(600); if (!ok()) return;
    placa.classList.remove('nova');
    $('placaTexto').textContent = '';
    $('placaSubTexto').textContent = '';
    $('placaSubBarra').getAnimations().forEach((a) => a.cancel());
    $('nomeFantasma').textContent = '';
    $('atualizando').classList.remove('visivel');

    // a janela volta do celular para o lugar dela, mostrando o servidor
    await esperar(300); if (!ok()) return;
    janela.getAnimations().forEach((a) => a.cancel());
    $('aguardando').hidden = true;
    $('porcento').textContent = '0%';
    $('cargaBarra').style.width = '0%';
    const volta = rosto.recolher();
    janela.animate(
      [{ opacity: 0, transform: 'scale(.94)', filter: 'blur(6px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }],
      { duration: 600, easing: 'ease-out' }
    );
    await Promise.all([saida, volta]);
  }

  async function ejetar() {
    const minha = ++sequencia;
    document.body.classList.add('ocupado');
    await tirarIADoCelular(minha);
    if (minha !== sequencia) return;
    carregada = null;
    $('leitorLed').classList.remove('aceso', 'lendo');
    await animarSaida();
    if (minha !== sequencia) return;
    telaEmEspera();
    $('dica').textContent = 'Toque em um chip para carregar a IA';
    document.body.classList.remove('ocupado');
  }

  // ---------------- voo do rosto até o celular ----------------
  // Posição de um elemento em coordenadas da tela do monitor (1600 x 900).
  function naTela(el) {
    const r = el.getBoundingClientRect();
    const t = tela.getBoundingClientRect();
    const k = escala();
    return { x: (r.left - t.left) / k, y: (r.top - t.top) / k, w: r.width / k, h: r.height / k };
  }

  function voarRostoParaCelular(retrato, cor, duracao) {
    const origem = naTela($('rosto'));
    const cel = naTela($('corpo3d'));
    const alvo = corpo.alvoRosto(retrato.height / retrato.width);
    const escalaFinal = (alvo.w * cel.w) / origem.w;
    const fimX = cel.x + alvo.cx * cel.w - (origem.w * escalaFinal) / 2 - origem.x;
    const fimY = cel.y + alvo.cy * cel.h - (origem.h * escalaFinal) / 2 - origem.y;

    // curva: o rosto se destaca (cresce um pouco), sobe num arco e mergulha na tela
    const passos = 14;
    const quadros = [];
    for (let i = 0; i <= passos; i++) {
      const k = i / passos;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const arco = Math.sin(k * Math.PI);
      const x = fimX * e;
      const y = fimY * e - arco * 90;
      const destaque = Math.sin(Math.min(1, k / 0.35) * Math.PI) * 0.08 * (k < 0.35 ? 1 : 0);
      const esc = 1 + (escalaFinal - 1) * e + destaque;
      quadros.push({
        transform: `translate(${x}px, ${y}px) scale(${esc}) rotate(${arco * -4}deg)`,
        filter: `brightness(${1 + arco * 0.7}) drop-shadow(0 0 ${8 + arco * 26}px ${cor})`,
        offset: k,
      });
    }

    const criar = (opacidade, classe) => {
      const c = document.createElement('canvas');
      c.width = retrato.width;
      c.height = retrato.height;
      c.getContext('2d').drawImage(retrato, 0, 0);
      c.className = 'voo-rosto ' + classe;
      c.style.cssText = `left:${origem.x}px;top:${origem.y}px;width:${origem.w}px;height:${origem.h}px;opacity:${opacidade}`;
      tela.appendChild(c);
      return c;
    };
    // rastro de luz: cópias mais fracas que seguem o rosto com um pequeno atraso
    const rastros = [[0.4, 50], [0.24, 100], [0.12, 150]].map(([op, atraso]) => {
      const c = criar(op, 'rastro');
      return c.animate(quadros, { duration: duracao, delay: atraso, easing: 'linear', fill: 'forwards' });
    });
    const principal = criar(1, '');
    const anim = principal.animate(quadros, { duration: duracao, easing: 'linear', fill: 'forwards' });
    // no fim do voo, o rosto voador some rápido (o celular já está mostrando o rosto no mesmo lugar)
    principal.animate([{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: duracao + 120, fill: 'forwards' });

    return Promise.all([anim.finished, ...rastros.map((r) => r.finished)])
      .catch(() => {})
      .then(() => new Promise((ok) => setTimeout(ok, 140)))
      .then(() => tela.querySelectorAll('.voo-rosto').forEach((c) => c.remove()));
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
    corpo.paraFrente();
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

    // o rosto se solta da janela e voa, numa curva, para dentro da tela do celular
    const retrato = rosto.retrato();
    const DURACAO_VOO = 1150;
    const voo = voarRostoParaCelular(retrato, ia.cor || '#3fd0ff', DURACAO_VOO);
    rosto.soltar();
    janela.animate(
      [{ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
       { opacity: 0, transform: 'scale(.94)', filter: 'blur(6px)' }],
      { duration: 550, easing: 'ease-in', fill: 'forwards' }
    );
    $('nomeFantasma').textContent = nomeNovo;
    $('atualizando').classList.add('visivel');

    // o celular passa a mostrar o rosto um instante antes do voo terminar: a passagem fica contínua
    await esperar(DURACAO_VOO - 110); if (!ok()) return;
    tela.classList.add('trocando');
    const instalacao = corpo.instalar(retrato, ia.nome, ia.cor);
    await voo;
    await instalacao; if (!ok()) return;

    const placa = $('placaNome');
    placa.classList.remove('apagando');
    placa.classList.add('nova');
    $('placaTexto').textContent = nomeNovo;
    $('placaSubTexto').textContent = 'UPLOAD COMPLETE';
    document.body.style.setProperty('--cor-ia', ia.cor || '#3fd0ff');
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

    await esperar(2000); if (!ok()) return;
    tela.classList.add('final');
    document.body.classList.remove('ocupado');
    $('dica').textContent = ia.etiqueta + ' carregada · toque no chip para ejetar';
    mostrarPrompt(ia);
  }

  // ---------------- painel do prompt ----------------
  async function pegarPrompt(ia) {
    if (cachePrompts[ia.id]) return cachePrompts[ia.id];
    try {
      cachePrompts[ia.id] = (await lerPrompt(await chavePronta, ia.id)).trim();
    } catch (e) {
      return `Não consegui abrir o prompt de ${ia.nome}. (${e.message})`;
    }
    return cachePrompts[ia.id];
  }

  // O prompt aparece dentro da cena, no lugar da janela (que fica vazia depois que o rosto vai para o celular).
  async function mostrarPrompt(ia) {
    const painel = $('painelPrompt');
    $('painelPromptTitulo').textContent = sigla(ia.nome);
    $('painelPromptTexto').textContent = 'Carregando...';
    painel.hidden = false;
    painel.getAnimations().forEach((a) => a.cancel());
    painel.animate(
      [{ opacity: 0, transform: 'scale(.94)', filter: 'blur(6px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }],
      { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
    const texto = await pegarPrompt(ia);
    if (carregada !== ia) return;
    $('painelPromptTexto').textContent = texto;
    $('painelPromptTexto').scrollTop = 0;
  }

  async function esconderPrompt(comAnimacao) {
    const painel = $('painelPrompt');
    if (painel.hidden) return;
    if (comAnimacao) {
      await painel.animate(
        [{ opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(.94)', filter: 'blur(6px)' }],
        { duration: 350, easing: 'ease-in', fill: 'forwards' }
      ).finished.catch(() => {});
    }
    painel.getAnimations().forEach((a) => a.cancel());
    painel.hidden = true;
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

  telaEmEspera();
})();
