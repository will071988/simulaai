-- Remove one false-positive schooling claim produced from the cookie banner.
-- Clear the canonical value only when no independent schooling evidence exists.
update concursos c
set escolaridade = '{}'::text[], updated_at = now()
where c.id = 'b195e9cd-aa71-4c94-99e0-641ab244a608'::uuid
  and c.escolaridade = array['TECNICO']::text[]
  and not exists (
    select 1
    from concurso_field_evidence e
    where e.concurso_id = c.id
      and e.field_name = 'escolaridade'
      and not (
        e.document_id = '0174d5f2-4743-4d8d-a452-b225607bc7d9'::uuid
        and e.evidence_text like 'Nosso website coleta informações%funcionamento técnico%'
      )
  );

delete from concurso_field_evidence
where document_id = '0174d5f2-4743-4d8d-a452-b225607bc7d9'::uuid
  and field_name = 'escolaridade'
  and value_json = '["TECNICO"]'::jsonb
  and evidence_text like 'Nosso website coleta informações%funcionamento técnico%';

-- Remove the historical title spelling that is not literal in the retained
-- document. Equivalent, literal title evidence for the same PDF remains.
delete from concurso_field_evidence
where document_id = '84e7028e-23c4-413a-801f-5b4aeba88b0e'::uuid
  and field_name = 'titulo'
  and evidence_text = '3ª Retificação do Edital nº 01/2026 - Prefeitura Municipal do Salvador';
