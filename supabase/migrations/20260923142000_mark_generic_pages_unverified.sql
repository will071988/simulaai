update concursos
set scope = null, state_code = null, city = null, latitude = null, longitude = null, location_label = null,
    quality_status = 'UNVERIFIED'
where orgao not in ('PF', 'PRF', 'INSS', 'BACEN', 'Transpetro', 'PC-BA', 'PC-RJ')
  and lower(titulo) !~ '(concurso|edital|ag[eê]ncia|prefeitura|pol[ií]cia|tribunal|secretaria|universidade|instituto|banco|federal|estadual)';
