# SimulaAí — Backup e Recuperação

## Objetivo

Este runbook cobre backup lógico e teste de restauração do banco do SimulaAí sem executar qualquer restauração destrutiva na produção.

O projeto usa Supabase Free no momento. A documentação atual do Supabase informa que backups automáticos estão disponíveis nos planos Pro, Team e Enterprise; no Free, a recomendação é fazer exportações regulares com `supabase db dump`.

## RPO/RTO operacional inicial

- **RPO alvo enquanto estiver no Free:** até 24 horas, desde que o backup diário externo esteja habilitado.
- **RTO alvo inicial:** até 4 horas para recriar infraestrutura e restaurar um backup validado.
- Para reduzir o RPO e obter restauração gerenciada, avaliar Pro/PITR antes de escalar receita e volume.

## O que o backup cobre

O fluxo lógico gera:
- `roles.sql`;
- `schema.sql`;
- `data.sql`;
- manifesto;
- arquivo criptografado;
- checksum SHA-256.

Objetos do Supabase Storage não são restaurados por um backup do banco. Se o produto passar a armazenar arquivos no Storage, deve existir uma rotina independente de cópia dos objetos.

## Segredos necessários

Nunca commitar valores reais.

- `SUPABASE_DB_URL`: connection string de sessão/direta obtida no Dashboard.
- `BACKUP_ENCRYPTION_KEY`: frase aleatória longa, armazenada em cofre/secret manager.
- Para restore drill, `RESTORE_DB_URL` deve apontar exclusivamente para um banco descartável.

## Criar backup

```bash
SUPABASE_DB_URL='...' \
BACKUP_ENCRYPTION_KEY='...' \
BACKUP_OUTPUT_DIR='./backups' \
bash ops/backup-supabase.sh
```

O diretório `backups/` deve permanecer fora do Git.

Também é possível usar o vínculo autenticado do CLI, sem gravar uma connection
string no `.env`: `BACKUP_SOURCE=linked`. Executar a partir da raiz do projeto e
conferir antes que `supabase/.temp/project-ref` corresponde ao projeto autorizado
`ukwulespvvthyjqgrjfo`. O padrão continua sendo `BACKUP_SOURCE=url`, com
`SUPABASE_DB_URL` obrigatório. O modo linked utiliza as credenciais temporárias
obtidas pelo CLI; sua receita de dump deve permanecer fora dos logs.

### Ferramentas locais no Windows (sem Docker)

Executar em **Windows PowerShell 5.1**, na raiz do repositório.

Requisitos: Git for Windows, Supabase CLI autenticado e binários PostgreSQL da
mesma versão principal do servidor (ou mais novos). O modo padrão do backup
continua usando Docker. O modo `BACKUP_DUMP_MODE=native` executa, via Git Bash,
a receita emitida pelo `supabase db dump --dry-run` com `pg_dump` e `pg_dumpall`
locais, preservando os filtros do CLI. A receita contém credenciais e deve ir
diretamente para o Bash, nunca para logs. Não habilitar `set -x`.

Preparação realizada em 23/10/2026 nesta máquina:

- servidor remoto: PostgreSQL **17.6**, conferido por consulta de metadados;
- binários portáteis **17.11**, obtidos da [página oficial da EDB](https://www.enterprisedb.com/download-postgresql-binaries), em `C:\Seu concurso\local-tools\pgsql\bin`;
- Git for Windows fornece Bash, OpenSSL, `tar` e `sha256sum`;
- não há serviço PostgreSQL instalado por este procedimento;
- teste com dois bancos locais sintéticos: backup AES/PBKDF2, checksum,
  descriptografia e restauração aprovados, com duas linhas e UTF-8 idênticos;
  o servidor descartável é encerrado ao final. Isso **não** comprova restauração
  do banco real do Supabase.

Ativar ferramentas apenas para a sessão atual:

```powershell
. .\ops\windows-backup-env.ps1
# Em outra máquina, informar -PostgreSqlBin 'C:\caminho\pgsql\bin'.
```

Repetir o teste sintético (porta local `55439`; falha se estiver ocupada):

```powershell
$env:BACKUP_SMOKE_ROOT = 'C:/Seu concurso/local-tools'
bash ./ops/smoke-native-backup.sh
if ($LASTEXITCODE -ne 0) { throw 'Falha no teste local de backup' }
```

Os diretórios `backup-smoke-*` contêm apenas fixtures e logs locais, fora do
repositório. As chaves aleatórias do teste não são conservadas; seus arquivos
criptografados são artefatos descartáveis, não backups operacionais.

Para um **backup real**, obter a connection string direta/de sessão no Dashboard
Supabase e conservar a chave de criptografia em cofre. Digitar ambos localmente,
sem incluir valores no histórico de comandos ou no chat:

```powershell
$value = Read-Host 'SUPABASE_DB_URL (connection string de sessao/direta)' -AsSecureString
$env:SUPABASE_DB_URL = [System.Net.NetworkCredential]::new('', $value).Password
$value = Read-Host 'BACKUP_ENCRYPTION_KEY (chave conservada em cofre)' -AsSecureString
$env:BACKUP_ENCRYPTION_KEY = [System.Net.NetworkCredential]::new('', $value).Password
Remove-Variable value
$env:BACKUP_OUTPUT_DIR = 'C:/Seu concurso/local-tools/backups'
try {
    bash ./ops/backup-supabase.sh
    if ($LASTEXITCODE -ne 0) { throw 'Falha no backup real' }
} finally {
    Remove-Item Env:SUPABASE_DB_URL -ErrorAction SilentlyContinue
    Remove-Item Env:BACKUP_ENCRYPTION_KEY -ErrorAction SilentlyContinue
}
```

Um PostgreSQL vanilla local comprova o funcionamento das ferramentas com
fixtures. O restore completo do Supabase exige um alvo descartável compatível
com seus schemas internos, roles e extensões; não remover dependências do dump
para forçar aprovação. O banco é compartilhado: o backup lógico pode incluir
dados de outros módulos. O runbook não cobre objetos do Storage.

### Evidência de backup real — 23/10/2026

Foi executado backup lógico real do projeto autorizado com `BACKUP_SOURCE=linked`
e ferramentas nativas Windows. Artefato local, fora do Git:

`C:\Seu concurso\local-tools\production-backups\simulaai-db-20261023T144525Z.tar.gz.enc`

O arquivo `.sha256` correspondente passou na verificação. A descriptografia
também passou, e o arquivo contém `roles.sql`, `schema.sql`, `data.sql` e
`manifest.txt`. Nenhum segredo foi impresso. A chave aleatória foi conservada
em `backup-key.dpapi`, no mesmo diretório, protegida pelo Windows DPAPI para o
usuário atual. Esse cofre local não substitui uma cópia da chave em cofre externo
nem uma cópia do backup fora da máquina.

O dump informou dependências circulares, inclusive em tabelas de outros módulos;
a receita de dados do Supabase usa `session_replication_role = replica`. O banco
compartilhado tem a extensão `supabase_vault`, além de componentes gerenciados do
Supabase. O restore completo precisa de alvo descartável compatível. **Até aqui
foi comprovado backup + checksum + decrypt do banco real, não o restore completo.**

## Testar restauração

Nunca usar a base de produção.

O arquivo de checksum `.sha256` deve acompanhar o backup. O restore drill
recusa arquivos de checksum ausentes ou vazios e interrompe a execução se a
verificação SHA-256 falhar, antes de descriptografar ou conectar ao banco alvo.

Crie um projeto/banco descartável e execute:

```bash
BACKUP_FILE='./backups/simulaai-db-YYYYMMDDTHHMMSSZ.tar.gz.enc' \
BACKUP_ENCRYPTION_KEY='...' \
RESTORE_DB_URL='...' \
ALLOW_RESTORE_TEST=true \
bash ops/verify-backup-restore.sh
```

O script bloqueia explicitamente o project ref de produção.

## Critério de aprovação do drill

1. checksum válido;
2. decrypt e extração sem erro;
3. roles/schema/data aplicados no alvo isolado;
4. consulta básica às tabelas de negócio funciona;
5. aplicação de teste consegue inicializar contra o alvo;
6. nenhum segredo aparece em logs;
7. alvo descartável é removido apenas depois da evidência do drill.

## Cadência recomendada

- backup lógico: diário;
- teste de decrypt/checksum: semanal;
- restore drill: mensal e antes de grandes mudanças;
- revisão do runbook: trimestral.

## Migrações

O Git continua sendo a fonte de verdade do histórico de migrations em `supabase/migrations`. Um backup não substitui migrations e migrations não substituem o backup de dados.

## Incidente

Em perda/corrupção:
1. bloquear writes não essenciais;
2. registrar horário do último dado íntegro;
3. preservar logs/evidências;
4. selecionar o último backup validado anterior ao incidente;
5. restaurar primeiro em ambiente isolado;
6. validar schema, contagens, autenticação e rotas críticas;
7. somente então planejar troca/promote do ambiente recuperado.

Não fazer restore direto sobre produção como primeira ação.
