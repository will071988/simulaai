update concursos
set location_label = 'Nacional - sede administrativa em Brasilia'
where scope = 'NACIONAL' and orgao in ('PF', 'PRF', 'INSS', 'BACEN', 'Transpetro');

update concursos
set location_label = 'Bahia - abrangencia estadual'
where orgao = 'PC-BA' and scope = 'ESTADUAL';
