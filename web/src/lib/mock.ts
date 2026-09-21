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
  nivel: string;
  vagas: string;
  duracaoMin: number;
  questoes: Questao[];
  cor: string;
};

export const simulados: Simulado[] = [
  {
    slug: "pf-cebraspe-01",
    titulo: "PF • Agente • Cebraspe",
    banca: "Cebraspe",
    orgao: "PF",
    nivel: "Superior",
    vagas: "1.000 previstas",
    duracaoMin: 60,
    cor: "from-violet-600 to-cyan-400",
    questoes: [
      { id: "q1", enunciado: "À luz da CF, julgue: A segurança pública é dever do Estado, mas responsabilidade de todos.", alternativas: [{ letra: "A", texto: "Certo" },{ letra: "B", texto: "Errado" }], gabarito: "A", tema: "Constitucional", banca: "Cebraspe" },
      { id: "q2", enunciado: "O poder de polícia decorre da supremacia do interesse público. Esse poder é, em regra:", alternativas: [{ letra: "A", texto: "Discricionário e autoexecutório" },{ letra: "B", texto: "Vinculado e judicial" },{ letra: "C", texto: "Apenas punitivo" },{ letra: "D", texto: "Exclusivo do Judiciário" },{ letra: "E", texto: "Indelegável" }], gabarito: "A", tema: "Administrativo", banca: "Cebraspe" },
      { id: "q3", enunciado: "Em lógica, 'Se P então Q' equivale a 'Se não Q então não P'.", alternativas: [{ letra: "A", texto: "Certo" },{ letra: "B", texto: "Errado" }], gabarito: "A", tema: "Raciocínio Lógico", banca: "Cebraspe" },
      { id: "q4", enunciado: "Lei 13.964/2019 (Pacote Anticrime) criou o juiz das garantias. Julgue: sua implementação é imediata e sem vacatio.", alternativas: [{ letra: "A", texto: "Certo" },{ letra: "B", texto: "Errado" }], gabarito: "B", tema: "Penal", banca: "Cebraspe" },
    ],
  },
  {
    slug: "inss-fgv-01",
    titulo: "INSS • Analista • FGV",
    banca: "FGV",
    orgao: "INSS",
    nivel: "Superior",
    vagas: "1.500 vagas",
    duracaoMin: 50,
    cor: "from-fuchsia-500 to-orange-400",
    questoes: [
      { id: "q1", enunciado: "Sobre seguridade social, assinale a correta:", alternativas: [{ letra: "A", texto: "Saúde, previdência e assistência são universais sem contribuição" },{ letra: "B", texto: "Previdência é contributiva e de filiação obrigatória" },{ letra: "C", texto: "Assistência independe de contribuição e é para todos" },{ letra: "D", texto: "Saúde é contributiva" }], gabarito: "B", tema: "Seguridade", banca: "FGV" },
      { id: "q2", enunciado: "'O concurseiro persevera.' Pode-se inferir:", alternativas: [{ letra: "A", texto: "Todo concurseiro passa rápido" },{ letra: "B", texto: "Perseverança é irrelevante" },{ letra: "C", texto: "Aprovação exige constância" },{ letra: "D", texto: "Simulado é inútil" }], gabarito: "C", tema: "Português", banca: "FGV" },
      { id: "q3", enunciado: "No regime geral, carência para aposentadoria por idade urbana é:", alternativas: [{ letra: "A", texto: "60 meses" },{ letra: "B", texto: "120 meses" },{ letra: "C", texto: "180 meses" },{ letra: "D", texto: "240 meses" }], gabarito: "C", tema: "Previdenciário", banca: "FGV" },
    ],
  },
  {
    slug: "prf-cebraspe-01",
    titulo: "PRF • Policial • Cebraspe",
    banca: "Cebraspe",
    orgao: "PRF",
    nivel: "Superior",
    vagas: "533 vagas",
    duracaoMin: 60,
    cor: "from-cyan-400 to-emerald-400",
    questoes: [
      { id: "q1", enunciado: "CTB: ultrapassagem em faixa contínua é infração gravíssima?", alternativas: [{ letra: "A", texto: "Certo" },{ letra: "B", texto: "Errado" }], gabarito: "A", tema: "CTB", banca: "Cebraspe" },
      { id: "q2", enunciado: "PRF tem competência para:", alternativas: [{ letra: "A", texto: "Patrulhamento ostensivo das rodovias federais" },{ letra: "B", texto: "Policiamento da internet" },{ letra: "C", texto: "Guarda de fronteiras marítimas" },{ letra: "D", texto: "Investigação criminal federal" }], gabarito: "A", tema: "Legislação PRF", banca: "Cebraspe" },
    ],
  },
  {
    slug: "bacen-cesgranrio-01",
    titulo: "BACEN • Analista • Cesgranrio",
    banca: "Cesgranrio",
    orgao: "BACEN",
    nivel: "Superior",
    vagas: "560 vagas",
    duracaoMin: 55,
    cor: "from-indigo-600 to-violet-400",
    questoes: [
      { id: "q1", enunciado: "Copom define:", alternativas: [{ letra: "A", texto: "Meta de inflação" },{ letra: "B", texto: "Taxa Selic" },{ letra: "C", texto: "Câmbio fixo" },{ letra: "D", texto: "Salário mínimo" }], gabarito: "B", tema: "Economia", banca: "Cesgranrio" },
    ],
  },
  {
    slug: "pcba-aocp-01",
    titulo: "PC-BA • Investigador • AOCP",
    banca: "AOCP",
    orgao: "PC-BA",
    nivel: "Superior",
    vagas: "750 vagas",
    duracaoMin: 50,
    cor: "from-orange-500 to-pink-500",
    questoes: [
      { id: "q1", enunciado: "Inquérito policial é:", alternativas: [{ letra: "A", texto: "Processo judicial" },{ letra: "B", texto: "Procedimento administrativo investigatório" },{ letra: "C", texto: "Ação penal" },{ letra: "D", texto: "Recurso" }], gabarito: "B", tema: "Processo Penal", banca: "AOCP" },
    ],
  },
  {
    slug: "transpetro-cesgranrio-01",
    titulo: "Transpetro • Cesgranrio",
    banca: "Cesgranrio",
    orgao: "Transpetro",
    nivel: "Médio/Superior",
    vagas: "281 + 3.890 CR",
    duracaoMin: 45,
    cor: "from-sky-500 to-violet-500",
    questoes: [
      { id: "q1", enunciado: "Petrobras Transporte S.A. é subsidiária de:", alternativas: [{ letra: "A", texto: "Vale" },{ letra: "B", texto: "Petrobras" },{ letra: "C", texto: "Eletrobras" },{ letra: "D", texto: "Banco do Brasil" }], gabarito: "B", tema: "Conhecimentos Gerais", banca: "Cesgranrio" },
    ],
  },
];

export function getSimulado(slug: string) { return simulados.find(s=>s.slug===slug); }

export const trilhas = [
  { sigla: "PF", nome: "Polícia Federal", vagas: "1.000", banca: "Cebraspe", cor: "from-violet-600 to-cyan-400", slug: "pf-cebraspe-01" },
  { sigla: "PRF", nome: "PRF", vagas: "533", banca: "Cebraspe", cor: "from-cyan-400 to-emerald-400", slug: "prf-cebraspe-01" },
  { sigla: "INSS", nome: "INSS", vagas: "1.500", banca: "FGV", cor: "from-fuchsia-500 to-orange-400", slug: "inss-fgv-01" },
  { sigla: "BACEN", nome: "Banco Central", vagas: "560", banca: "Cesgranrio", cor: "from-indigo-600 to-violet-400", slug: "bacen-cesgranrio-01" },
  { sigla: "PC-BA", nome: "PC-BA / PM-BA", vagas: "3.450", banca: "AOCP", cor: "from-orange-500 to-pink-500", slug: "pcba-aocp-01" },
  { sigla: "ADM", nome: "Transpetro", vagas: "4.171", banca: "Cesgranrio", cor: "from-sky-500 to-violet-500", slug: "transpetro-cesgranrio-01" },
];
