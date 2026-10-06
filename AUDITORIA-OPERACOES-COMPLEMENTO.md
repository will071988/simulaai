# Complemento operacional — fontes e conflitos

Estado: implementação e migração validadas; CI, publicação e smoke da interface nova pendentes.

A sincronização de `main` incorporou os commits até `7b70f44e2b2cc8765d2322a7b0ec35e4a3172a52`, incluindo a restrição de retry da Sprint 2.6 e a observabilidade da Sprint 2.7. O fechamento anteriormente registrado nessas auditorias é histórico; este complemento valida dois fluxos que ainda exigiam consulta ou inserção manual no banco.

## Comportamento implementado

- A aprovação cria ou vincula uma fonte operacional na mesma transação da revisão e da auditoria. Candidatos revisados permanecem em histórico paginado, com o destino operacional vinculado.
- Novos domínios sem adaptador ficam desativados, tier 3 e `DISCOVERY_AUXILIAR`, com motivo `APPROVED_PENDING_ADAPTER`. A implementação e publicação de um adaptador continuam necessárias para coletar um domínio novo.
- Ativação exige decisão explícita e correspondência de nome, origem HTTPS, adaptador, tier e tipo com o catálogo compilado. Configuração incompatível é recusada; saúde e histórico de falhas não são zerados.
- Aprovação repetida não duplica a fonte. Uma segunda aprovação no mesmo domínio mantém o vínculo histórico de ambas. A revisão original é preservada durante ativação posterior.
- O detalhe privado de conflito mostra valores atuais, evidências concordantes/divergentes/invalidadas, documentos, alterações aceitas, última nota e auditoria de revisões. As quatro coleções são paginadas independentemente.
- A nota administrativa registra a análise e não modifica a classificação factual ou a publicação. Decisões antigas de manter valor ou detectar conflito não eram persistidas pelo coletor; o painel informa essa limitação.
- Os novos dados exigem Auth permanente confirmado e vínculo ADMIN a cada requisição, usam `private, no-store` e participam da instrumentação de API existente.
- O novo RPC conserva a restrição de retries transitórios e o bloqueio de `INSUFFICIENT_IDENTITY` aplicado por `20261005120000`.

## Evidência e gates pendentes

Antes da sincronização de `main`, os testes de banco comprovaram registro integral pelo RPC, ativação explícita, rollback, ausência de duplicação e vínculo de auditoria. O teste do endpoint privado comprovou RBAC, quarentena, diferenças factuais, paginação e ausência de dados brutos. O teste da API comprovou ator definido pelo servidor, ativação explícita e destino persistente.

Após sincronizar as mudanças posteriores, `test:2.6`, `test:2.7`, lint completo, TypeScript e build de produção passaram. O build incluiu o novo endpoint privado. `npm audit --omit=dev` encontrou zero vulnerabilidades. O smoke existente foi ajustado para reconhecer a query de paginação na requisição do painel. Os scripts adicionais de verificação remota e smoke também passaram lint e TypeScript.

O dry-run no Supabase autorizado `ukwulespvvthyjqgrjfo` listou exclusivamente `20261006010000_operational_source_approval.sql`, aplicada depois dos checks locais. Nenhum reparo de histórico foi executado, e nenhum candidato de produção foi aprovado ou ativado por esta execução.

Snapshots em transação somente de leitura antes e depois confirmaram 10 fontes, 32 documentos, 13 candidatos, 1 administrador e 1 vínculo exato com usuário verificado. Os fingerprints permaneceram iguais: fontes `3aa47b84014d02ad88ada20cd28dc18d`, documentos `39df1692f809ad32ced121d59e4e9e9f`, candidatos `053d966dad677ce40fd9df8129a77204`. A coluna e a FK de destino operacional e o RPC existem; `anon`/`authenticated` não têm EXECUTE, `service_role` tem; a função de retry conserva o bloqueio permanente.

A credencial REST dos arquivos locais recebeu 401; a verificação remota usou o CLI já autenticado no projeto vinculado. Nenhuma credencial foi revelada, atualizada ou substituída. O health do deployment anterior respondeu `ok: true`, `status: degraded`; isso não comprova o deployment dos novos fluxos.

Pendências: CI do commit integrado, deployment, smoke público e validação autenticada da interface nova. Não reutilizar smokes anteriores para afirmar esses gates.

As mudanças anteriores à sincronização foram preservadas em um stash nomeado `Sprint 2.6 source and conflict completion before syncing main`, mantido como recuperação adicional.
