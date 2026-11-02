// Lista das IAs que aparecem na bancada.
//
// Para adicionar uma IA nova:
//   1. Coloque o prompt completo em ias/prompts/<id>.md
//   2. (Opcional) Coloque o rosto em ias/rostos/<arquivo> (de preferência PNG/JPG com fundo escuro)
//   3. Acrescente um bloco abaixo.
//
// Campos:
//   id        identificador sem espaços (é o nome do arquivo do prompt)
//   etiqueta  o que vai escrito à mão na etiqueta do chip
//   nome      o nome que aparece na tela (vira "V.E.R.Ô.N.I.C.A." sozinho)
//   rosto     caminho da imagem do rosto (deixe null para usar o rosto genérico)
//   sistemas  os 5 itens da coluna da direita (no filme: FLIGHT SYSTEM, NAVIGATION SYSTEM...)

window.IAS = [
  {
    id: 'adenor',
    etiqueta: 'ADENOR',
    nome: 'ADENOR',
    rosto: null,
    sistemas: ['RABUGICE', 'LEALDADE', 'EXPERIÊNCIA', 'IRONIA', 'PLANEJAMENTO'],
  },
  {
    id: 'veronica',
    etiqueta: 'VERÔNICA',
    nome: 'VERÔNICA',
    rosto: null,
    sistemas: ['SERENIDADE', 'PERSPICÁCIA', 'HUMOR', 'ESTRATÉGIA', 'SENSIBILIDADE'],
  },
  {
    id: 'nicole',
    etiqueta: 'NICOLE',
    nome: 'NICOLE',
    rosto: null,
    sistemas: ['MEDO', 'TIMIDEZ', 'INTELIGÊNCIA', 'DELICADEZA', 'CORAGEM'],
  },
];

// Texto do cabeçalho da caixa do nome (no filme: "MARK XLV OPERATING SYSTEM")
window.CABECALHO_SISTEMA = 'MARK XLV OPERATING SYSTEM';

// IA que aparece em laranja na primeira vez (antes de você ter carregado alguma)
window.IA_ANTERIOR_PADRAO = 'J.A.R.V.I.S';
