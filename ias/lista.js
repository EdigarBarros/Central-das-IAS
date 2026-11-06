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
//   rosto     caminho da imagem do rosto (PNG sem fundo, de preferência)
//   cor       cor da IA: o celular, a caixa do nome e os sistemas assumem essa cor
//   sistemas  os 5 itens da coluna da direita (no filme: FLIGHT SYSTEM, NAVIGATION SYSTEM...)

window.IAS = [
  {
    id: 'adenor',
    etiqueta: 'ADENOR',
    nome: 'ADENOR',
    rosto: 'ias/rostos/adenor.png',
    cor: '#ff8a1e',
    sistemas: ['RABUGICE', 'LEALDADE', 'EXPERIÊNCIA', 'IRONIA', 'PLANEJAMENTO'],
  },
  {
    id: 'veronica',
    etiqueta: 'VERÔNICA',
    nome: 'VERÔNICA',
    rosto: 'ias/rostos/veronica.png',
    cor: '#3fd0ff',
    sistemas: ['SERENIDADE', 'PERSPICÁCIA', 'HUMOR', 'ESTRATÉGIA', 'SENSIBILIDADE'],
  },
  {
    id: 'nicole',
    etiqueta: 'NICOLE',
    nome: 'NICOLE',
    rosto: 'ias/rostos/nicole.png',
    cor: '#b46bff',
    sistemas: ['MEDO', 'TIMIDEZ', 'INTELIGÊNCIA', 'DELICADEZA', 'CORAGEM'],
  },
];

// Texto do cabeçalho da caixa do nome (no filme: "MARK XLV OPERATING SYSTEM")
window.CABECALHO_SISTEMA = 'MARK XLV OPERATING SYSTEM';

