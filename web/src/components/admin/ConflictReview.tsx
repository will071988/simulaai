"use client";

import { useEffect, useState } from "react";
import type { ConflictDetail, ConflictPage } from "@/lib/admin/conflict-detail";
import type { OperationAction } from "@/lib/admin/operations";

const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";
const value = (item: unknown) => item == null ? "Não informado" : typeof item === "string" ? item : JSON.stringify(item);
const labels: Record<string, string> = { titulo: "Título", orgao: "Órgão", banca: "Banca", vagas: "Vagas", salario: "Salário", inscricao_inicio: "Início das inscrições", inscricao_fim: "Fim das inscrições", prova_data: "Prova", cadastro_reserva: "Cadastro reserva", cargos: "Cargos", escolaridade: "Escolaridade", status: "Situação", scope: "Abrangência", state_code: "Estado", city: "Cidade", location_label: "Local", latitude: "Latitude", longitude: "Longitude", edital_number: "Edital", process_number: "Processo" };
type OffsetKey = "evidenceOffset" | "documentsOffset" | "changesOffset" | "auditOffset";
const buttonStyle = "rounded-full border border-cyan-300/50 px-4 py-2 text-sm text-cyan-100 disabled:opacity-40";

function SourceLink({ url, name }: { url: string | null; name: string | null }) {
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline">{name || url}</a> : <span>{name || "Fonte não informada"} · link indisponível</span>;
}

export function ConflictReview({ id, token, busy, onAction }: { id: string; token: string; busy: boolean; onAction: (action: OperationAction) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [offsets, setOffsets] = useState({ evidenceOffset: 0, documentsOffset: 0, changesOffset: 0, auditOffset: 0 });
  const [result, setResult] = useState<{ id: string; token: string; offsets: typeof offsets; data: ConflictDetail | null; error: string } | null>(null);
  const current = result?.id === id && result.token === token && result.offsets === offsets ? result : null;
  const data = current?.data || null;
  const error = current?.error || "";
  const loading = open && !current;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    const query = new URLSearchParams({ limit: "20", ...Object.fromEntries(Object.entries(offsets).map(([key, offset]) => [key, String(offset)])) });
    void (async () => {
      try {
        const response = await fetch(`/api/admin/operations/conflicts/${id}?${query}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("DETAIL_FAILED");
        const payload = await response.json();
        if (active) setResult({ id, token, offsets, data: payload.data, error: "" });
      } catch {
        if (active) setResult({ id, token, offsets, data: null, error: "Não foi possível carregar as evidências. Atualize os detalhes antes de registrar a revisão." });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [id, token, open, offsets]);

  function pager(page: ConflictPage, key: OffsetKey, label: string) {
    return <nav aria-label={`Páginas de ${label}`} className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span>{page.total ? `${page.offset + 1}–${Math.min(page.offset + page.limit, page.total)}` : "0"} de {page.total}</span>
      <button type="button" className={buttonStyle} disabled={loading || page.offset === 0} onClick={() => setOffsets((current) => ({ ...current, [key]: Math.max(0, page.offset - page.limit) }))}>Anteriores</button>
      <button type="button" className={buttonStyle} disabled={loading || !page.hasMore} onClick={() => setOffsets((current) => ({ ...current, [key]: page.offset + page.limit }))}>Próximos</button>
    </nav>;
  }

  return <div className="mt-3">
    <button type="button" className={buttonStyle} aria-expanded={open} onClick={() => { setResult(null); setOpen((current) => !current); }}>{open ? "Ocultar evidências" : "Ver evidências e revisar"}</button>
    {open && <div className="mt-4 space-y-5">
      {loading && <p role="status">Carregando evidências…</p>}
      {error && <p role="alert" className="text-red-200">{error}</p>}
      {error && <button type="button" className={buttonStyle} onClick={() => setOffsets((current) => ({ ...current }))}>Atualizar detalhes</button>}
      {data && <>
        <p className="text-xs text-amber-200">{data.contest.quality_status} · {data.contest.is_publishable ? "Publicável" : "Não publicável"} · atualizado em {date(data.contest.updated_at)}</p>
        <section><h3 className="font-semibold">Valores atuais e evidências</h3>
          <p className="text-xs text-white/60">As evidências são paginadas; ausência nesta página não significa ausência no concurso.</p>
          <div className="mt-2 space-y-3">{data.fields.filter((field) => field.current_value != null || field.evidence.length).map((field) => <article key={field.field_name} className="rounded-xl border border-white/10 p-3">
            <h4 className="font-semibold">{labels[field.field_name] || field.field_name}</h4><p className="break-words text-sm">Valor atual: {value(field.current_value)}</p>
            {field.evidence.map((item) => <div key={item.id} className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
              <p className={item.relation === "DIFFERS_FROM_CURRENT" ? "text-amber-200" : item.relation === "INVALIDATED" ? "text-red-200" : "text-cyan-200"}>{item.relation === "DIFFERS_FROM_CURRENT" ? "Diverge do valor atual" : item.relation === "INVALIDATED" ? "Evidência invalidada" : "Corresponde ao valor atual"}: {value(item.value_json)}</p>
              <p><SourceLink url={item.source_url} name={item.source_name} /> · tier {item.source_tier} · confiança {item.confidence} · {date(item.observed_at)}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{item.evidence_text}{item.evidence_truncated ? " [trecho limitado; consulte o documento]" : ""}</p>
              {item.invalidation_reason && <p className="text-red-200">Motivo: {item.invalidation_reason}</p>}
            </div>)}
          </article>)}</div>{pager(data.pagination.evidence, "evidenceOffset", "evidências")}
        </section>
        <section><h3 className="font-semibold">Documentos relacionados</h3><div className="mt-2 space-y-2">{data.documents.map((item) => <p key={item.id} className="rounded-lg bg-white/5 p-2 text-xs"><SourceLink url={item.source_url} name={item.source_name} /> · {item.document_type || "tipo não informado"} · {item.relationship_type} · {item.is_current ? "atual" : "histórico"} · observado em {date(item.observed_at)}</p>)}</div>{pager(data.pagination.documents, "documentsOffset", "documentos")}</section>
        <section><h3 className="font-semibold">Alterações aceitas</h3><p className="text-xs text-white/60">O histórico registra alterações aceitas. Decisões anteriores de manter valor ou detectar conflito não foram armazenadas pelo coletor.</p><div className="mt-2 space-y-2">{data.acceptedChanges.map((item) => <article key={item.id} className="rounded-lg bg-white/5 p-2 text-xs"><b>{labels[item.field_name] || item.field_name}</b><p>{value(item.old_value)} → {value(item.new_value)}</p><p><SourceLink url={item.source_url} name={item.source_name} /> · {date(item.detected_at)}</p><p className="whitespace-pre-wrap break-words">{item.evidence_text}{item.evidence_truncated ? " [trecho limitado]" : ""}</p></article>)}</div>{pager(data.pagination.acceptedChanges, "changesOffset", "alterações")}</section>
        <section><h3 className="font-semibold">Revisões registradas</h3>{data.latestReview && <p className="mt-2 whitespace-pre-wrap break-words text-sm">Última nota ({date(data.latestReview.reviewed_at)}): {data.latestReview.review_note}</p>}<div className="mt-2 space-y-2">{data.audit.map((item) => <p key={item.id} className="whitespace-pre-wrap break-words rounded-lg bg-white/5 p-2 text-xs">{date(item.created_at)} · {item.note || "Sem nota"}</p>)}</div>{pager(data.pagination.audit, "auditOffset", "revisões")}</section>
        <p className="text-xs text-white/60">Registrar uma revisão salva sua análise. A classificação e a publicação dependem da resolução factual do conflito.</p>
        <textarea aria-label="Nota da revisão do conflito" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Conclusão da análise e próximos passos" className="w-full rounded-xl border border-white/20 bg-zinc-950 px-3 py-2 text-sm" />
        <button type="button" className={buttonStyle} disabled={busy || note.trim().length < 5} onClick={() => void onAction({ action: "REVIEW_CONFLICT", targetId: id, note })}>Registrar revisão</button>
      </>}
    </div>}
  </div>;
}
