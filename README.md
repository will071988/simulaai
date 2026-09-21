# SimulaAí — Simulados para Concursos com IA

Plataforma de **simulações de provas** (não é curso) para concurseiros.
Foco: concursos quentes, simulados no estilo da banca, correção comentada por IA, preço acessível (até R$29,90).

## Trilhas iniciais (set/2026)
1. Polícia Federal (1.000 vagas previstas)
2. PRF (533 vagas — Cebraspe)
3. INSS (1.500 vagas Analista)
4. Banco Central (560 vagas)
5. PC-BA / PM-BA (750 + 2.700)
6. Transpetro / Dataprev / Receita

## Monetização
- Grátis: 1 simulado por trilha + correção parcial
- Assinatura Trilha: R$29,90/mês
- Assinatura Total Anual: R$299/ano (foco)
- Avulso Premium: R$14,90 (funil p/ assinatura)
- Pagamento: Mercado Pago Pix recorrente (MVP) -> Stripe depois

## Estrutura
- `web/` — Next.js + Tailwind (app do aluno)
- `collector/` — coletor diário: editais + provas anteriores (06h)
- `supabase/` — Postgres: concursos, questoes, simulados, tentativas, assinaturas
- `ai-prompts/` — prompts gerador de simulados + correção

## Coletor diário (resumo)
1. Scraper: Cebraspe, FGV, AOCP, Cesgranrio, PCI, JC, DOU
2. IA classifica: órgão, banca, vagas, salário, data prova
3. Baixa PDFs oficiais de provas -> extrai questões -> normaliza
4. Nunca copiar QConcursos/TEC. Só fonte oficial + questões inéditas inspiradas.

## Rodar MVP
Fase 1: 6 páginas + 10 simulados/trilha + login + paywall
Fase 2: coletor + gerador IA
Fase 3: ranking, evolução, anual + avulso
