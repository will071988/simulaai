"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MapContainer = dynamic(() => import("react-leaflet").then((module) => module.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((module) => module.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((module) => module.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((module) => module.Popup), { ssr: false });

export function ContestLocationMap({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { import("leaflet").then((leaflet) => {
    // @ts-expect-error Leaflet keeps this compatibility hook outside its public types.
    delete leaflet.Icon.Default.prototype._getIconUrl;
    leaflet.Icon.Default.mergeOptions({ iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png", iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png", shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png" });
    setReady(true);
  }); }, []);
  if (!ready) return <div aria-label="Carregando mapa" className="h-72 animate-pulse rounded-3xl bg-white/5" />;
  return <div className="h-72 overflow-hidden rounded-3xl border border-white/10"><MapContainer center={[latitude, longitude]} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}><TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={[latitude, longitude]}><Popup>{label}</Popup></Marker></MapContainer></div>;
}
