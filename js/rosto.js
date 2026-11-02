// Animação da janela "INITIATING LANGUAGE INTERFACE":
// máscara da IA antiga girando -> faíscas -> partículas -> rosto da IA nova.

(function () {
  const L = 400;
  const A = 480;

  const suave = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function carregarImagem(src) {
    return new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = erro;
      img.src = src;
    });
  }

  // Transforma qualquer imagem (ou o rosto genérico) em holograma ciano.
  async function prepararRosto(ia) {
    const c = document.createElement('canvas');
    c.width = L; c.height = A;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    let temImagem = false;

    if (ia.rosto) {
      try {
        const img = await carregarImagem(ia.rosto);
        const escala = Math.max(L / img.width, A / img.height);
        const w = img.width * escala, h = img.height * escala;
        ctx.drawImage(img, (L - w) / 2, (A - h) / 2, w, h);
        temImagem = true;
      } catch (e) {
        console.warn('Não consegui abrir o rosto de', ia.nome, e);
      }
    }
    if (!temImagem) desenharRostoGenerico(ctx);

    const dados = ctx.getImageData(0, 0, L, A);
    const p = dados.data;
    for (let i = 0; i < p.length; i += 4) {
      let l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
      if (!temImagem) l *= p[i + 3] / 255;
      // borda suave: o rosto some nas bordas da janela, como no filme
      const x = (i / 4) % L, y = Math.floor(i / 4 / L);
      const borda = suave(0, 40, x) * suave(0, 40, L - x) * suave(0, 30, y) * suave(0, 50, A - y);
      const a = suave(0.08, 0.62, l) * borda;
      p[i] = 40 + 200 * Math.pow(l, 1.5);
      p[i + 1] = 170 + 85 * l;
      p[i + 2] = 230 + 25 * l;
      p[i + 3] = 255 * a;
    }
    ctx.putImageData(dados, 0, 0);
    return c;
  }

  function amostrar(canvas, passo, limiar, max) {
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, L, A).data;
    const pts = [];
    for (let y = 0; y < A; y += passo) {
      for (let x = 0; x < L; x += passo) {
        const a = d[(y * L + x) * 4 + 3];
        if (a > limiar && Math.random() < a / 255) pts.push([x + Math.random() * passo, y + Math.random() * passo]);
      }
    }
    for (let i = pts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    return pts.slice(0, max);
  }

  function pontosDaMascara() {
    const c = document.createElement('canvas');
    c.width = L; c.height = A;
    desenharMascara(c.getContext('2d'), 0, 1);
    return amostrar(c, 4, 60, 3000);
  }

  window.criarRosto = function (canvas) {
    const ctx = canvas.getContext('2d');
    let modo = 'vazio';      // vazio | mascara | transformando | rosto
    let inicio = 0;
    let rosto = null;
    let particulas = [];
    let aoTerminar = null;
    let mascaraPts = null;

    function desenharFaiscas(intensidade) {
      if (intensidade <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(190, 245, 255, 0.9)';
      ctx.shadowColor = '#7fe6ff';
      ctx.shadowBlur = 12;
      const n = Math.floor(4 + 10 * intensidade);
      for (let k = 0; k < n; k++) {
        const lado = Math.random() < 0.5 ? -1 : 1;
        let x = 200 + lado * (40 + Math.random() * 40);
        let y = 215 + (Math.random() - 0.5) * 30;
        ctx.lineWidth = 0.6 + Math.random() * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const passos = 4 + Math.floor(Math.random() * 6);
        for (let s = 0; s < passos; s++) {
          x += lado * (8 + Math.random() * 20) * intensidade;
          y += (Math.random() - 0.6) * 26;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // névoa de energia
      const g = ctx.createRadialGradient(200, 220, 10, 200, 220, 170);
      g.addColorStop(0, `rgba(120, 230, 255, ${0.35 * intensidade})`);
      g.addColorStop(1, 'rgba(120, 230, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, L, A);
      ctx.restore();
    }

    function desenharRostoPronto(alfa, t) {
      if (!rosto || alfa <= 0) return;
      ctx.save();
      ctx.globalAlpha = alfa * (0.9 + 0.1 * Math.random());
      ctx.drawImage(rosto, 0, 0);
      // falha de sinal de vez em quando
      if (Math.random() < 0.05) {
        const y = Math.random() * A, h = 4 + Math.random() * 18, dx = (Math.random() - 0.5) * 24;
        ctx.drawImage(rosto, 0, y, L, h, dx, y, L, h);
      }
      ctx.restore();
    }

    function linhasDeVarredura(t) {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 10, 20, 0.28)';
      for (let y = 0; y < A; y += 3) ctx.fillRect(0, y, L, 1);
      const yb = ((t / 8) % (A + 80)) - 40;
      const g = ctx.createLinearGradient(0, yb - 30, 0, yb + 30);
      g.addColorStop(0, 'rgba(120,230,255,0)');
      g.addColorStop(0.5, 'rgba(120,230,255,0.08)');
      g.addColorStop(1, 'rgba(120,230,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, yb - 30, L, 60);
      ctx.restore();
    }

    function quadro(agora) {
      requestAnimationFrame(quadro);
      const t = agora - inicio;
      ctx.clearRect(0, 0, L, A);

      if (modo === 'mascara') {
        desenharMascara(ctx, Math.sin(t / 1400) * 0.7, 0.5 + 0.5 * Math.sin(t / 300));
      } else if (modo === 'transformando') {
        // 1) máscara girando, depois tremendo
        const alfaMascara = 1 - suave(1500, 2000, t);
        if (alfaMascara > 0) {
          ctx.save();
          ctx.globalAlpha = alfaMascara;
          const tremor = suave(900, 1500, t) * (Math.random() - 0.5) * 6;
          ctx.translate(tremor, 0);
          desenharMascara(ctx, Math.sin(t / 500) * 0.6 * (1 - suave(800, 1400, t)), 1);
          ctx.restore();
        }
        // 2) faíscas
        desenharFaiscas(suave(700, 1400, t) * (1 - suave(2300, 2900, t)));
        // 3) partículas voando da máscara para o rosto
        const alfaPart = suave(1400, 1600, t) * (1 - suave(3200, 3900, t));
        if (alfaPart > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgb(170, 240, 255)';
          for (const p of particulas) {
            const k = easeInOut(Math.min(1, Math.max(0, (t - p.atraso) / p.dur)));
            const u = 1 - k;
            const x = u * u * p.sx + 2 * u * k * p.mx + k * k * p.tx;
            const y = u * u * p.sy + 2 * u * k * p.my + k * k * p.ty;
            ctx.globalAlpha = alfaPart * p.brilho;
            ctx.fillRect(x, y, p.tam, p.tam);
          }
          ctx.restore();
        }
        // 4) rosto aparecendo
        desenharRostoPronto(suave(2800, 3700, t), t);
        if (t > 4000) {
          modo = 'rosto';
          if (aoTerminar) { aoTerminar(); aoTerminar = null; }
        }
      } else if (modo === 'rosto') {
        desenharRostoPronto(1, t);
      }
      if (modo !== 'vazio') linhasDeVarredura(t);
    }
    requestAnimationFrame(quadro);

    return {
      vazio() { modo = 'vazio'; },
      mascara() { modo = 'mascara'; inicio = performance.now(); },
      async preparar(ia) {
        if (!mascaraPts) mascaraPts = pontosDaMascara();
        rosto = await prepararRosto(ia);
        const alvos = amostrar(rosto, 3, 70, 3200);
        particulas = alvos.map(([tx, ty], i) => {
          const [sx, sy] = mascaraPts[i % mascaraPts.length];
          return {
            sx, sy, tx, ty,
            mx: (sx + tx) / 2 + (Math.random() - 0.5) * 160,
            my: (sy + ty) / 2 + (Math.random() - 0.5) * 160,
            atraso: 1450 + (sy / A) * 500 + Math.random() * 300,
            dur: 900 + Math.random() * 600,
            tam: 1 + Math.random() * 1.8,
            brilho: 0.5 + Math.random() * 0.5,
          };
        });
      },
      transformar() {
        return new Promise((ok) => {
          modo = 'transformando';
          inicio = performance.now();
          aoTerminar = ok;
        });
      },
    };
  };
})();
