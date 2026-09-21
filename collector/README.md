# Collector — Radar diário SimulaAí
Roda todo dia às 06h (Trigger.dev / Inngest).

## A. Coleta editais
Fontes: Cebraspe, FGV, FCC, AOCP, Cesgranrio, PCI Concursos, JC Concursos, DOU.
Saída: `concursos` { orgao, banca, vagas, salario, status, edital_url, prova_data }

## B. Coleta provas anteriores
Só PDFs oficiais das bancas. Extrair com IA para `questoes` { enunciado, alternativas, gabarito, banca, ano, cargo, tema, fonte_url }.

## Regras
- Deduplicar por edital_url
- Respeitar robots.txt, cachear, logar fonte
- Nunca raspar conteúdo paywall QConcursos/TEC/Gran
