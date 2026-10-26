# Lançamento — evidências de 23/10/2026

## Atualização de 26/10/2026 — Chrome integrado e contrato v8

**Lançamento comercial continua bloqueado.** As seções abaixo desta atualização
registram o snapshot histórico de 23/10, não o estado atual.

- Chrome integrado ao OpenCode utilizado em `/admin/operacoes` e `/concursos`.
  O painel privado exige login de administrador na sessão integrada; não houve
  execução do worker nem retry por esse navegador nesta rodada.
- Contrato `extract_concurso_v8_field_scoped` publicado no commit `b5b4d78`.
  [CI completo aprovado](https://github.com/will071988/simulaai/actions/runs/40341231138),
  incluindo build e E2E do gate. Deploy Production `READY`:
  `dpl_HAdNXKcoCTFQnmXvKgScWNuUd2e1`, alias público conferido.
- TypeScript, `test:2.8`, `test:ai-budget`, lint e auditoria de produção passaram
  localmente; zero vulnerabilidades. Build local com ambiente isolado passou.
  Build com o ambiente local original falhou por URL Supabase inválida; nenhuma
  credencial foi alterada ou exposta para contornar essa configuração.
- Campos fora do contrato do documento não atualizam fatos canônicos e são
  auditados em `ai_unrequested_fields`. Campos solicitados continuam exigindo
  prova literal; regressões rejeitam vagas/salários inventados e escolaridade
  incompatível, além de preservar qualificações no fim do documento.
- O último lote real anterior, em Chrome separado, teve 1 sucesso e 4 falhas.
  Seu snapshot foi 9 AI_PENDING, 38 FAILED, 26 PROCESSED, 4 FETCHED, claims zero,
  22 reservas/22 logs e 215 evidências. **Não é um snapshot atual nem comprovação
  de sucesso do contrato v8 em produção.**
- A inspeção pública integrada encontrou frases procedimentais exibidas como
  cargos. Reprodução local confirmou que `enrichDocument` aceita
  “O concurso para os cargos de que trata este edital compreenderá as seguintes
  fases” como um cargo; o caso de controle `Cargo: Analista Administrativo`
  extrai o nome esperado. Origem em `web/src/lib/collector/enrichment.ts`.
  Correção e reparação auditada dos registros existentes continuam pendentes;
  nenhum dado foi removido ou ocultado na interface.

Próximos gates: login administrativo no Chrome integrado; validar uma execução
v8 e persistência/accounting antes de lote; revisar os quatro documentos falhos
antes de `RETRY_DOCUMENT`; corrigir qualidade dos cargos; comprovar restore real
e cópia externa; configurar e validar billing live. FREE-ONLY, limites de 10 por
execução e 50 por dia, e `STRIPE_LIVEMODE=false` permanecem preservados.

## Decisão atual

**Publicado e funcional, mas lançamento comercial ainda bloqueado.**

Snapshot autenticado de produção às 16:31 UTC: 12 dos 14 gates do endpoint
`/api/admin/release-readiness` passaram. `collectorBacklog` e `billingLiveMode`
continuam bloqueados. A restauração real completa também segue pendente e não
deve ser considerada aprovada apenas pelos gates desse endpoint.

## Entregue e verificado

### Conteúdo e jornada

- 62 questões elegíveis e 62 comentários validados em produção.
- Pacote `macae-2024-matematica-v1`: 30 questões inéditas de matemática para
  Professor C – Matemática, contextualizadas pelo edital oficial 01/2024 de Macaé,
  Anexo I, páginas 42–43.
- Fonte: <https://conhecimento.fgv.br/sites/default/files/concursos/1-prefeitura-de-macae-diversos-cargos-rsadsjcnos.pdf>.
- Questões identificadas como IA, banca nula e vínculo curricular explícito.
  Trata-se de treino temático, não de questões oficiais nem de cobertura integral
  do edital.
- Publicação administrativa idempotente por revisão; conteúdo existente divergente
  continua protegido. Gabaritos novos têm provas por cálculo exato.
- Prova temática real de 30 questões criada e concluída na conta administrativa de
  verificação: 20 acertos, nota 66,67%, 30 comentários e histórico acrescido de uma
  tentativa. Repetir a conclusão não duplicou o histórico nem mudou a nota.
- Projeção pública não expõe gabarito/isCorrect. Exercícios IA não herdam autoria
  FGV do concurso nos filtros do frontend ou backend.

### Extração e persistência

- Erro Groq `json_validate_failed` com HTTP 400 agora permite fallback como
  `INVALID_JSON`. Outros erros de entrada continuam interrompendo a execução.
- Prompt v6, enum das UFs válidas e regressões de citações de PDF. Apenas espaços
  e quebras de linha são normalizados; palavras, acentos e pontuação continuam
  exigidos. UF curta requer token explícito na fonte, sem inferência do nome do estado.
- Migration `20261023170000_allow_cebraspe_official_cdn_evidence.sql` aplicada ao
  projeto autorizado por workspace isolado com histórico remoto atualizado.
  O dry-run listou exclusivamente essa migration nova.
- A regra de evidência mantém source_id e tier; aceita o CDN HTTPS oficial de
  concursos apenas para a origem Cebraspe registrada. Testes PostgreSQL rejeitam
  host semelhante, HTTP, caminho não permitido, outra fonte e outro tier.
- Verificação remota após aplicação: guard presente; execução anon negada e
  service_role preservada. O CLI avisou que não pôde gerar cache local de catálogo
  sem Docker; isso não impediu a aplicação, conferida diretamente no banco.
- Dois documentos reais foram processados pelo worker, com evidências persistidas
  e claims liberados. Nenhum status, retry ou agendamento foi alterado manualmente.

### Backup

- Backup real criptografado criado via CLI linked e PostgreSQL nativo Windows.
- Checksum e descriptografia aprovados, com roles/schema/data/manifest presentes.
- Artefato e chave DPAPI documentados em [backup-recovery.md](backup-recovery.md).
- O restore sintético local passou, mas **não equivale ao restore do banco real**.
  Falta alvo descartável compatível com os componentes e extensões do Supabase,
  além da conservação externa do backup e da chave.

### Billing

- Checkouts mensal, anual e avulso retornaram HTTP 200, links oficiais Stripe de
  teste, referência de usuário e e-mail bloqueado. Plano inválido retornou 400.
- Customer Portal retornou HTTP 200.
- Nenhum pagamento foi criado ou realizado. `STRIPE_LIVEMODE=false` foi preservado.
- `.env.billing`, ignorado pelo Git, foi preparado para o responsável informar os
  recursos live. Ele não é carregado nem publicado automaticamente.

## Pendências objetivas

1. **Backlog:** AI_PENDING=32, limite=20. O lote foi interrompido após timeout,
   rejeição semântica e abertura do circuito do provedor. Não executar novos lotes
   cegamente nem mudar thresholds/claims/agendamentos para aparentar saúde.
   Existem 24 FAILED anteriores, sem aumento nesta rodada; 16 PROCESSED e quatro FETCHED.
2. **Recuperação:** completar restauração real em ambiente Supabase compatível e
   validar aplicação e dados restaurados. Docker/daemon local não está disponível;
   PostgreSQL vanilla não comprova a recuperação de todos os componentes gerenciados.
3. **Comercial:** configurar e validar prices, Payment Links, webhook e portal
   Stripe live na conta responsável antes de ativar cobrança.

Orçamento observado no dia UTC: 29 reservas e 29 logs físicos, dentro do limite de
50/dia. Claims ativos: zero. Fontes saudáveis: três. Collector: DEGRADED.

## Qualidade e publicação

Código principal em `75187ba`; correção de CDN em `ae34fb1`.
[CI da correção de CDN](https://github.com/will071988/simulaai/actions/runs/39985406361)
aprovado em 2m06s, incluindo lint, TypeScript, build, auditoria de dependências de
produção e suítes do projeto. Deployment Production READY e alias público
conferidos. A implementação foi revisada pelo mesmo agente sob as perspectivas
do escritório de desenvolvimento; não houve revisão humana independente.
