# Complemento operacional — fontes e conflitos

Estado: implementação, migração, CI, publicação e smoke público validados; smoke autenticado dos novos fluxos ainda pendente.

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

O commit `6361cc825cf32384a2e5be88f763b8624dd1f569` foi enviado a `origin/main`. GitHub Actions [37397206256](https://github.com/will071988/simulaai/actions/runs/37397206256) terminou com sucesso, incluindo as suítes anteriores e os checks das Sprints 2.6 e 2.7. Vercel `dpl_CcJ5XzxkZ9h7AK6k6fdv9oEg8Bio`: Production Ready; URL imutável `https://simulaai-7pwdd3fon-williamrocha6-5180s-projects.vercel.app`, alias `https://simulaai-kappa.vercel.app`.

No alias publicado, o painel respondeu 200; GET e POST de operações e GET do novo detalhe privado sem token responderam 401 `AUTH_REQUIRED`. O health respondeu `ok: true`, `status: degraded`. A consulta dos logs de erro no intervalo da última hora não encontrou registros. Isso comprova publicação e negação anônima, sem afirmar leitura privada autenticada.

O teste `test:2.6:ui-fixture` executou o cliente do build em servidor loopback e contexto headless isolado, com respostas de fixture e rede externa bloqueada. Comprovou aprovação com destino visível, ausência de ativação para domínio desconhecido, ativação explícita de conhecido, mensagem de incompatibilidade, leitura de evidências e nota anterior, paginação independente e recarga da nota salva. Lint e TypeScript do teste passaram. A captura visual foi inspecionada; nenhum perfil pessoal de Chrome, usuário real ou banco de produção foi usado.

Para repetir o fixture: servir o build com `npm run start -- --hostname 127.0.0.1 --port 3026`, definir `BROWSER_EXECUTABLE_PATH` para o Chrome instalado e executar `npm run test:2.6:ui-fixture`. `OPS_UI_FIXTURE_URL` pode selecionar outra porta em `127.0.0.1`; qualquer host externo é recusado. O teste fecha seu contexto e navegador ao terminar; o servidor local desta verificação também foi encerrado.

O usuário interrompeu o controle do Chrome com Esc antes da verificação autenticada. Esse controle permaneceu interrompido. Pendência: validar os novos fluxos com sessão admin autorizada no deployment publicado. O fixture local não substitui esse gate; não iniciar a Sprint 2.8 antes de fechar essa validação.

As mudanças anteriores à sincronização foram preservadas em um stash nomeado `Sprint 2.6 source and conflict completion before syncing main`, mantido como recuperação adicional.

## Confusão no cadastro e acesso pendente

Uma consulta somente de leitura no Auth autorizado confirmou que a conta do administrador já tem e-mail confirmado desde 2026-09-05 e senha cadastrada. A página de cadastro afirmava que uma conta havia sido criada e um e-mail enviado sempre que `signUp` retornava sem erro e sem sessão, inclusive na resposta ofuscada para conta existente. Esse texto não era prova de envio ou de entrega; nenhum diagnóstico de falha SMTP foi inferido.

A mensagem foi substituída por confirmação neutra da solicitação, orientação condicional para verificar confirmação e instrução para quem já tem conta usar Entrar com a senha original. Nenhuma consulta pública de existência de conta foi adicionada, nem conta, senha, configuração de Auth ou e-mail foram alterados.

`test:2.0`, lint direcionado, TypeScript e build passaram. `test:account:ui-fixture` executou a página compilada em loopback, com rede externa bloqueada e respostas simuladas de cadastro novo e conta existente. Nos dois casos, comprovou mensagem idêntica sem afirmação de criação/envio, orientação para Entrar, limpeza do campo de senha e acesso à aba de login. O teste fechou navegador e contextos; o servidor local foi encerrado. Para repetir, servir na porta 3026 e definir `BROWSER_EXECUTABLE_PATH`, como no fixture operacional acima.

Isso corrige a orientação, mas não substitui a validação autenticada dos novos fluxos operacionais em produção. Esse gate continua pendente, sem avanço para a Sprint 2.8.

O commit `ec79c741e78effbb1752ab91f975ab06ce5fc486` publicou a correção de cadastro. Vercel `dpl_DWCdSXVcN38Xk5dUGwMYE9mNAEgb` ficou Production Ready, com o alias público apontando para `https://simulaai-ldj2klq66-williamrocha6-5180s-projects.vercel.app`. GET de `/conta` respondeu 200; inspeção dos nove scripts públicos confirmou a nova orientação e ausência da afirmação antiga. O health permaneceu `ok: true`, `status: degraded`.

A CI [37398940378](https://github.com/will071988/simulaai/actions/runs/37398940378) passou em todas as suítes até 2.7, lint e TypeScript, mas falhou no audit antes do build por [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), atualizado em 2026-10-05. A atualização pontual de `source-map-js` de 1.2.1 para a versão corrigida 1.2.2 alterou somente esse pacote no lockfile. `npm audit --omit=dev` voltou a zero vulnerabilidades. As cinco vulnerabilidades de desenvolvimento previamente conhecidas não foram tratadas com atualização forçada, nem o gate de segurança foi relaxado.

## Retomada com autenticação legítima e paginação real

Após autorização explícita para uso exclusivo pelo SimulaAí, o Auth remoto passou a usar `https://simulaai-kappa.vercel.app` como Site URL e somente `/conta` nesse domínio como redirecionamento permitido. Nome do remetente, seis assuntos e seis modelos foram ajustados para SimulaAí. GET independente confirmou persistência; a comparação integral antes/depois não encontrou alterações fora desses campos. MFA, confirmação de e-mail, servidor e credenciais SMTP permaneceram iguais. Não houve novo envio de e-mail nessa configuração.

A investigação de envio confirmou que a conta solicitada já estava verificada desde 2026-09-05. A tentativa de cadastro de 2026-10-06 às 02:25:45 UTC foi `user_repeated_signup`, não prova de nova confirmação enviada. O pedido de acesso `/otp` às 01:39:58 UTC recebeu 200; não foi possível comprovar entrega no Gmail. A senha dessa conta foi alterada exclusivamente por pedido explícito do usuário via Auth Admin, sem mudar identidade, confirmação ou privilégios. Nenhuma senha, chave ou sessão foi registrada neste relatório ou no repositório.

O smoke por HTTP no alias publicado autenticou a conta com senha, confirmou ADMIN GET 200, `private, no-store` e negação anônima 401. A sessão isolada de teste foi encerrada com logout local 204. Esse teste não automatizou Chrome, não aprovou fontes, não alterou notas e não substitui o gate visual autenticado.

O mesmo smoke encontrou uma regressão real: `candidateOffset=50&historyOffset=50` recebeu 503 `OPERATIONS_QUERY_FAILED`. Consulta direta somente de leitura comprovou que PostgREST retorna 416 `PGRST103`, com `Content-Range: */13` para candidatos e `*/0` para histórico. A página inicial funciona; uma página válida além do fim não era normalizada.

A correção em andamento confirma novamente a contagem filtrada somente após `PGRST103` e retorna lista vazia apenas se o offset estiver além do fim. Erros diferentes, falha da contagem ou contagem incompatível continuam como 503. Foram adicionados testes de endpoint para essas quatro condições. Testes locais, CI, deployment e smoke da correção ainda precisam ser comprovados antes do fechamento; a Sprint 2.8 permanece não iniciada.

Nesta retomada, `test:2.6` e `test:2.7` terminaram com sucesso, incluindo as suítes PostgreSQL e os novos casos de paginação. `tsc --noEmit` passou e `npm audit --omit=dev` encontrou zero vulnerabilidades. `git diff --check` passou. Lint e build foram iniciados e continuam aguardando resultado; a correção não foi commitada, enviada nem publicada. A consulta remota confirmou sucesso da CI anterior [37399255883](https://github.com/will071988/simulaai/actions/runs/37399255883) para `6600bb1eccb64f6ee0532ee222a54fe8ffc7c2c5`, não para as alterações atuais.

O smoke adicional confirmou detalhe de conflito autenticado 200 e anônimo 401, mas também reproduziu 503 quando os quatro offsets do detalhe ultrapassam suas coleções. A correção foi compartilhada entre fontes e as quatro coleções de conflitos, preservando todos os filtros na recontagem. Os testes verificam listas vazias, contagens por concurso e ação, manutenção da nota anterior e erro real quando a recontagem falha. Houve um erro de nome de campo no novo teste (`changes` em vez de `acceptedChanges`), corrigido antes da publicação. As suítes de conflitos e API operacional passaram novamente; TypeScript, lint completo, lint direcionado dos arquivos finais e build de produção terminaram com sucesso. Nenhuma migration é necessária. CI e smoke do deployment desta correção continuam pendentes.
