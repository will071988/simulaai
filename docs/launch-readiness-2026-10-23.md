# Lançamento — evidências de 23/10/2026

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
