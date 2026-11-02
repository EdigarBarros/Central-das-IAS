// Desenho do circuito que aparece na janela do chip.

(function () {
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

})();
