// Desenhos usados pela tela: o corpo em wireframe, o circuito do chip,
// a máscara (IA antiga) e o rosto genérico (quando a IA não tem imagem).

(function () {
  // ---------- CORPO (metade direita; a esquerda é espelhada) ----------
  const metade = `
    <!-- cabeça -->
    <path class="placa" d="M0 0 C26 0 40 14 42 40 L40 70 C38 86 26 98 0 102 Z"/>
    <path d="M0 24 L30 26 L38 44 M0 58 L14 52 L30 54 M0 80 L18 78 L28 90 M30 26 L34 70"/>
    <path class="olho" d="M8 42 L28 40 L26 48 L10 49 Z"/>
    <!-- pescoço -->
    <path d="M0 102 L20 98 L24 118 M8 104 L10 120"/>
    <!-- ombro -->
    <path class="placa" d="M44 120 C70 112 100 120 112 140 C118 156 112 172 100 178 C90 162 72 150 50 146 Z"/>
    <path d="M60 128 C80 128 98 140 106 156 M56 138 L96 168"/>
    <!-- peito -->
    <path class="placa" d="M0 120 L42 118 L82 132 C96 140 100 158 96 178 L90 214 L70 238 L0 244 Z"/>
    <path d="M0 140 L46 138 L72 160 L66 200 L0 206 M46 138 L40 206 M72 160 L92 178 M20 206 L28 240"/>
    <!-- abdômen -->
    <path class="placa" d="M0 244 L68 240 L60 302 L0 306 Z"/>
    <path d="M0 262 L56 260 M0 282 L54 280 M30 244 L28 306 M64 270 L52 268"/>
    <!-- quadril -->
    <path class="placa" d="M0 306 L60 302 L68 338 L34 354 L0 348 Z"/>
    <path d="M10 320 L52 316 M34 354 L30 322"/>
    <!-- braço -->
    <path class="placa" d="M96 178 L116 244 L120 300 L96 302 L86 248 L78 196 Z"/>
    <path d="M84 216 L112 222 M90 262 L118 264 M100 180 L104 300"/>
    <ellipse cx="108" cy="306" rx="15" ry="10"/>
    <path class="placa" d="M96 312 L122 310 L132 372 L132 402 L108 404 L102 372 Z"/>
    <path d="M100 340 L126 338 M104 372 L130 372 M116 312 L120 402"/>
    <path class="placa mao" d="M106 404 L134 402 L140 438 L132 452 L116 454 L108 440 Z"/>
    <path d="M112 420 L136 418 M120 440 L120 454 M128 438 L130 452"/>
    <!-- coxa -->
    <path class="placa" d="M68 338 L76 420 L70 462 L32 462 L26 420 L14 350 L34 354 Z"/>
    <path d="M22 390 L72 386 M48 352 L50 460 M28 430 L74 428"/>
    <!-- joelho -->
    <path class="placa" d="M32 464 L70 464 L72 486 L34 488 Z"/>
    <circle cx="52" cy="476" r="6"/>
    <!-- canela -->
    <path class="placa" d="M34 490 L72 488 L70 580 L64 616 L38 616 L36 580 Z"/>
    <path d="M38 530 L70 528 M40 570 L68 568 M52 490 L52 614"/>
    <!-- pé -->
    <path class="placa" d="M36 618 L66 618 L78 648 L74 656 L30 656 L32 636 Z"/>
    <path d="M34 640 L76 640"/>
  `;
  const centro = `
    <path class="reator-anel" d="M0 148 m-18 0 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0"/>
    <circle class="reator" cx="0" cy="148" r="10"/>
    <path d="M0 0 V102 M0 244 V348"/>
  `;
  window.CORPO_SVG = `
    <defs>
      <filter id="brilhoCorpo" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g filter="url(#brilhoCorpo)">
      <g>${metade}</g>
      <g transform="scale(-1,1)">${metade}</g>
      ${centro}
    </g>`;

  // ---------- CIRCUITO DO CHIP ----------
  window.CIRCUITO_SVG = `
    <svg viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="manchaChip" cx="50%" cy="45%" r="60%">
          <stop offset="0" stop-color="#4fb7ff" stop-opacity=".55"/>
          <stop offset="1" stop-color="#0a3d9a" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100" height="150" fill="#0d4fc4"/>
      <rect width="100" height="150" fill="url(#manchaChip)"/>
      <ellipse cx="22" cy="40" rx="20" ry="14" fill="#5fc8ff" opacity=".25"/>
      <ellipse cx="78" cy="110" rx="22" ry="16" fill="#5fc8ff" opacity=".2"/>
      <g class="trilhas" fill="none" stroke="#bff0ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 0 V30 L34 46 V84 L22 96 V150"/>
        <path d="M30 0 V22 L44 36 V70 L58 84 V150"/>
        <path d="M46 0 V18 L62 34 V62 L76 76 V112 L66 122 V150"/>
        <path d="M66 0 V26 L84 44 V150"/>
        <path d="M8 60 L20 72 V112 L36 128 V150"/>
        <path d="M92 20 V52 L80 64"/>
        <path d="M44 70 L30 84 V120"/>
        <path d="M62 34 H76"/>
      </g>
      <g fill="#dff8ff">
        <circle cx="80" cy="64" r="2.2"/><circle cx="30" cy="120" r="2.2"/><circle cx="76" cy="34" r="2"/>
        <circle cx="8" cy="60" r="2"/><circle cx="92" cy="20" r="2"/>
      </g>
    </svg>`;

  // ---------- MÁSCARA (a IA antiga, antes de virar rosto) ----------
  // Desenha num canvas 400x480. "giro" vai de -1 a 1 e simula o capacete girando.
  window.desenharMascara = function (ctx, giro, brilho) {
    ctx.save();
    ctx.translate(200, 250);
    ctx.scale(0.86 + 0.14 * Math.cos(giro), 1);
    ctx.translate(-200 + giro * 10, -250);

    const contorno = new Path2D('M200 60 C268 60 312 100 318 170 L320 250 C318 300 300 350 262 392 L232 420 H168 L138 392 C100 350 82 300 80 250 L82 170 C88 100 132 60 200 60 Z');
    const testa = new Path2D('M200 60 L200 150 M120 120 C150 110 176 128 200 150 C224 128 250 110 280 120');
    const bochechas = new Path2D('M96 250 L150 290 L156 360 M304 250 L250 290 L244 360 M150 290 H250 M168 420 L176 360 H224 L232 420');
    const olhoE = new Path2D('M118 214 L182 204 L176 230 L124 236 Z');
    const olhoD = new Path2D('M282 214 L218 204 L224 230 L276 236 Z');

    ctx.fillStyle = 'rgba(110, 22, 22, 0.55)';
    ctx.fill(contorno);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(96, 222, 255, 0.95)';
    ctx.shadowColor = '#3fd8ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3;
    ctx.stroke(contorno);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(96, 222, 255, 0.55)';
    ctx.stroke(testa);
    ctx.stroke(bochechas);
    ctx.fillStyle = `rgba(150, 240, 255, ${0.75 + 0.25 * brilho})`;
    ctx.shadowBlur = 28;
    ctx.fill(olhoE);
    ctx.fill(olhoD);
    ctx.restore();
  };

  // ---------- ROSTO GENÉRICO (quando a IA ainda não tem imagem) ----------
  // Rosto escuro com luz nas sobrancelhas, olhos, nariz e boca, como no filme.
  window.desenharRostoGenerico = function (ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // maçãs do rosto e testa (luz suave)
    const luz = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    luz(200, 120, 90, 0.18);
    luz(126, 270, 50, 0.22);
    luz(274, 270, 50, 0.22);
    luz(200, 395, 40, 0.18);

    // contorno do rosto (bem discreto)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(98, 170);
    ctx.bezierCurveTo(96, 280, 140, 388, 200, 420);
    ctx.bezierCurveTo(260, 388, 304, 280, 302, 170);
    ctx.stroke();

    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#fff';

    // sobrancelhas (bem marcadas, como no filme)
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(108, 188); ctx.quadraticCurveTo(140, 160, 182, 176); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(292, 188); ctx.quadraticCurveTo(260, 160, 218, 176); ctx.stroke();

    // olhos
    ctx.lineWidth = 3;
    const olho = (cx, dir) => {
      ctx.beginPath();
      ctx.moveTo(cx - 30 * dir, 222);
      ctx.quadraticCurveTo(cx, 200, cx + 28 * dir, 220);
      ctx.quadraticCurveTo(cx, 236, cx - 30 * dir, 222);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(cx, 219, 7, 0, Math.PI * 2); ctx.fill();
    };
    olho(146, 1);
    olho(254, -1);

    // nariz
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(196, 230); ctx.lineTo(192, 300); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(178, 312); ctx.quadraticCurveTo(200, 324, 222, 312); ctx.stroke();
    ctx.globalAlpha = 1;

    // boca
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(160, 360);
    ctx.quadraticCurveTo(185, 344, 200, 352);
    ctx.quadraticCurveTo(215, 344, 240, 360);
    ctx.quadraticCurveTo(200, 366, 160, 360);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(164, 362);
    ctx.quadraticCurveTo(200, 398, 236, 362);
    ctx.quadraticCurveTo(200, 372, 164, 362);
    ctx.fill();
    ctx.restore();
  };
})();
