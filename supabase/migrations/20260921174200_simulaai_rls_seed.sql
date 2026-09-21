-- RLS + policies SimulaAi
alter table concursos enable row level security;
alter table questoes enable row level security;
alter table simulados enable row level security;
alter table tentativas enable row level security;

drop policy if exists "public read concursos" on concursos;
create policy "public read concursos" on concursos for select using (true);
drop policy if exists "public read questoes" on questoes;
create policy "public read questoes" on questoes for select using (true);
drop policy if exists "public read simulados" on simulados;
create policy "public read simulados" on simulados for select using (true);
drop policy if exists "public insert tentativas" on tentativas;
create policy "public insert tentativas" on tentativas for insert with check (true);
drop policy if exists "public read tentativas" on tentativas;
create policy "public read tentativas" on tentativas for select using (true);

-- seed concursos quentes
insert into concursos (orgao, titulo, banca, vagas, status, edital_url) values
('PF','Policia Federal - Agente','Cebraspe',1000,'previsto','https://www.cebraspe.org.br/concursos/pf_25'),
('PRF','PRF - Policial Rodoviario','Cebraspe',533,'previsto','https://www.cebraspe.org.br/concursos/prf_26'),
('INSS','INSS - Analista','FGV',1500,'autorizado','https://conhecimento.fgv.br/concursos/inss2026'),
('BACEN','Banco Central - Analista','Cesgranrio',560,'solicitado','https://www.cesgranrio.org.br/bacen2026'),
('PC-BA','PC-BA - Investigador','AOCP',750,'aberto','https://www.institutoaocp.org.br/pcba2026'),
('Transpetro','Transpetro - Cesgranrio', 'Cesgranrio', 281, 'aberto','https://www.cesgranrio.org.br/transpetro2026')
on conflict (edital_url) do nothing;

-- seed simulados ligados a concursos
insert into simulados (concurso_id, titulo, banca_alvo, nivel, premium)
select id, orgao || ' - Simulado 01 (' || banca || ')', banca, 'Superior', false from concursos where orgao in ('PF','PRF','INSS','BACEN','PC-BA','Transpetro')
and not exists (select 1 from simulados s where s.concurso_id = concursos.id);
