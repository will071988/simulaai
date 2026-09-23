"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getHotCta } from "@/lib/collector/hotCta";

type Hot = {
  id: string;
  titulo: string;
  orgao: string;
  banca: string;
  vagas: number | null;
  salario: number | null;
  inscricao_inicio: string | null;
  inscricao_fim: string | null;
  prova_data: string | null;
  cargos: string[];
  status: string;
  scope: string;
  state_code: string;
  latitude: number;
  longitude: number;
  location_label: string;
  hot_score: number;
  hot_reasons: string[];
  edital_url: string | null;
  simulado_slug: string | null;
};

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

export function HotConcursosMap() {
  const [data, setData] = useState<Hot[]>([]);
  const [filter, setFilter] = useState<"Todos" | "NACIONAL" | "ESTADUAL" | "MUNICIPAL">("Todos");
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    import("leaflet").then((L) => {
      // fix default icon
      // @ts-expect-error Leaflet does not expose its legacy icon URL hook in its types.
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setLeafletReady(true);
    });
    fetch("/api/concursos/hot").then((r) => r.json()).then((j) => setData(j.data || [])).catch(() => {});
  }, []);

  const filtered = data.filter((d) => filter === "Todos" || d.scope === filter);

  if (!leafletReady) return <div className="h-[320px] rounded-[24px] bg-white/5 animate-pulse" />;

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {(["Todos", "NACIONAL", "ESTADUAL", "MUNICIPAL"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-full text-sm font-medium ${filter === f ? "bg-white text-black" : "glass text-white"}`}>{f}</button>
        ))}
      </div>
      <div className="rounded-[24px] overflow-hidden border border-white/10 h-[420px] relative">
        <MapContainer center={[-15.8, -47.9]} zoom={4} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {filtered.map((c) => (
            <Marker key={c.id} position={[c.latitude, c.longitude]}>
              <Popup>
                <div className="text-sm">
                  <b>{c.orgao}</b> — {c.titulo}<br />{c.cargos?.[0] || "Cargo não informado"} • {c.banca}<br />{c.vagas == null ? "Vagas não informadas" : `${c.vagas} vagas`} • {c.salario == null ? "Salário não informado" : `R$ ${c.salario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}<br />
                  Inscrições: {c.inscricao_inicio || "não informadas"} a {c.inscricao_fim || "não informadas"}<br />Prova: {c.prova_data || "não informada"}<br />
                  <span className="text-xs">{c.location_label} • hot {c.hot_score} • {c.hot_reasons?.join(", ")}</span><br />
                  {(() => { const cta = getHotCta(c); return cta ? (cta.href.startsWith("/simulados/") ? <Link href={cta.href} className="text-violet-600 underline">{cta.label}</Link> : <a href={cta.href} target="_blank" rel="noreferrer" className="text-violet-600 underline">{cta.label}</a>) : null; })()}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <div className="mt-3 grid sm:grid-cols-2 gap-2">
        {filtered.slice(0, 6).map((c) => (
          <div key={c.id} className="glass rounded-2xl p-3 text-sm flex justify-between">
            <span>{c.orgao} • {c.location_label}</span><span className="font-bold">{c.hot_score}°</span>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p className="text-sm text-white/60 mt-3">Nenhum concurso com localização confiável. Lista abaixo mostra todos.</p>}
    </div>
  );
}
