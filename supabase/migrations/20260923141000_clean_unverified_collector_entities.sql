update concursos
set scope = null, state_code = null, city = null, latitude = null, longitude = null, location_label = null,
    quality_status = 'UNVERIFIED'
where lower(titulo) in ('para candidatos', 'contatos', 'publicacoes', 'publicações', 'avaliacoes', 'avaliações', 'concursos', 'centros de pesquisa');
