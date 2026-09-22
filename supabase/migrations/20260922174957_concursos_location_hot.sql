alter table concursos add column if not exists scope text check (scope in ('NACIONAL','ESTADUAL','MUNICIPAL','REGIONAL'));
alter table concursos add column if not exists state_code text;
alter table concursos add column if not exists city text;
alter table concursos add column if not exists latitude numeric;
alter table concursos add column if not exists longitude numeric;
alter table concursos add column if not exists location_label text;
alter table concursos add column if not exists hot_score int default 0;
-- update existing concursos with location
update concursos set scope='NACIONAL', state_code=null, location_label='Nacional - Brasilia (sede)', latitude=-15.7939, longitude=-47.8828, hot_score= case when orgao='PF' then 88 when orgao='PRF' then 85 when orgao='INSS' then 90 when orgao='BACEN' then 82 when orgao='PC-BA' then 75 when orgao='Transpetro' then 70 else 50 end where scope is null;
update concursos set state_code='BA', scope='ESTADUAL', city=null, location_label='Bahia (estadual)', latitude=-12.9714, longitude=-38.5124 where orgao='PC-BA';
