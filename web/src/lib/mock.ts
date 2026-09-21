export type Questao = {
  id: string;
  enunciado: string;
  alternativas: { letra: string; texto: string }[];
  gabarito: string;
  tema: string;
  banca: string;
};

export type Simulado = {
  slug: string;
  titulo: string;
  banca: string;
  orgao: string;
  duracaoMin: number;
  questoes: Questao[];
};

export const simulados: Simulado[] = [
  {
    slug: "pf-cebraspe-01",
    titulo: "PF - Agente - Simulado 01 (Cebraspe)",
    banca: "Cebraspe",
    orgao: "PF",
    duracaoMin: 60,
    questoes: [
      {
        id: "q1",
        enunciado: "À luz da Constituição Federal, julgue o item: A segurança pública é dever do Estado, mas responsabilidade de todos. C/E?",
        alternativas: [
          { letra: "A", texto: "Certo" },
          { letra: "B", texto: "Errado" },
        ],
        gabarito: "A",
        tema: "Direito Constitucional",
        banca: "Cebraspe",
      },
      {
        id: "q2",
        enunciado: "No regime de direito administrativo, o poder de polícia decorre da supremacia do interesse público. Esse poder é:",
        alternativas: [
          { letra: "A", texto: "Discricionário e autoexecutório em regra" },
          { letra: "B", texto: "Vinculado e dependente de autorização judicial" },
          { letra: "C", texto: "Apenas punitivo" },
          { letra: "D", texto: "Exclusivo do Poder Judiciário" },
          { letra: "E", texto: "Indelegável em qualquer hipótese" },
        ],
        gabarito: "A",
        tema: "Direito Administrativo",
        banca: "Cebraspe",
      },
      {
        id: "q3",
        enunciado: "Julgue: Em lógica proposicional, 'Se P então Q' equivale a 'Se não Q então não P'.",
        alternativas: [
          { letra: "A", texto: "Certo" },
          { letra: "B", texto: "Errado" },
        ],
        gabarito: "A",
        tema: "Raciocínio Lógico",
        banca: "Cebraspe",
      },
    ],
  },
  {
    slug: "inss-fgv-01",
    titulo: "INSS - Analista - Simulado 01 (FGV)",
    banca: "FGV",
    orgao: "INSS",
    duracaoMin: 50,
    questoes: [
      {
        id: "q1",
        enunciado: "Sobre seguridade social, assinale a correta:",
        alternativas: [
          { letra: "A", texto: "Saúde, previdência e assistência são universais sem contribuição" },
          { letra: "B", texto: "Previdência é contributiva e de filiação obrigatória" },
          { letra: "C", texto: "Assistência independe de contribuição e é para todos" },
          { letra: "D", texto: "Saúde é contributiva" },
        ],
        gabarito: "B",
        tema: "Seguridade Social",
        banca: "FGV",
      },
      {
        id: "q2",
        enunciado: "Interpretação de texto: 'O concurseiro persevera.' Pode-se inferir:",
        alternativas: [
          { letra: "A", texto: "Todo concurseiro passa rápido" },
          { letra: "B", texto: "Perseverança é irrelevante" },
          { letra: "C", texto: "Aprovação exige constância" },
          { letra: "D", texto: "Simulado é inútil" },
        ],
        gabarito: "C",
        tema: "Português",
        banca: "FGV",
      },
    ],
  },
  {
    slug: "prf-cebraspe-01",
    titulo: "PRF - Policial - Simulado 01 (Cebraspe)",
    banca: "Cebraspe",
    orgao: "PRF",
    duracaoMin: 60,
    questoes: [
      {
        id: "q1",
        enunciado: "CTB: ultrapassagem em faixa contínua é infração gravíssima?",
        alternativas: [
          { letra: "A", texto: "Certo" },
          { letra: "B", texto: "Errado" },
        ],
        gabarito: "A",
        tema: "CTB",
        banca: "Cebraspe",
      },
    ],
  },
];

export function getSimulado(slug: string) {
  return simulados.find((s) => s.slug === slug);
}
