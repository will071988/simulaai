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

## Testar restauração

Nunca usar a base de produção.

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
