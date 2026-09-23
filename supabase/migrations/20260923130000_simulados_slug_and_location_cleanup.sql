alter table simulados add column if not exists slug text;

update simulados s
set slug = case c.orgao
  when 'PF' then 'pf-cebraspe-01'
  when 'PRF' then 'prf-cebraspe-01'
  when 'INSS' then 'inss-fgv-01'
  when 'BACEN' then 'bacen-cesgranrio-01'
  when 'PC-BA' then 'pcba-aocp-01'
  when 'Transpetro' then 'transpetro-cesgranrio-01'
  else null
end
from concursos c
where s.concurso_id = c.id and s.slug is null;

update concursos
set scope = null, state_code = null, city = null, latitude = null, longitude = null, location_label = null
where orgao not in ('PF', 'PRF', 'INSS', 'BACEN', 'Transpetro', 'PC-BA', 'PC-RJ');

update concursos
set scope = 'ESTADUAL', state_code = 'RJ', city = null, latitude = null, longitude = null, location_label = 'Rio de Janeiro - abrangencia estadual'
where orgao = 'PC-RJ';

update concursos
set scope = 'MUNICIPAL', state_code = 'RJ', city = 'Niteroi', latitude = -22.8832, longitude = -43.1034, location_label = 'Niteroi - abrangencia municipal'
where upper(titulo) like '%PREFEITURA%NITEROI%';
