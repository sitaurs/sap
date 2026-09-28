"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Info, MapPin } from "lucide-react";
import AreaMap from "./area-map";
import { getArea, listAreas, type SapAreaDetail, type SapAreas } from "../lib/api/client";

export default function PublicMapSection() {
  const [bbox, setBbox] = useState("");
  const [period, setPeriod] = useState(30);
  const [areas, setAreas] = useState<SapAreas | null>(null);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<SapAreaDetail | null>(null);
  const [error, setError] = useState("");
  const range = useMemo(() => { const to = new Date(); const from = new Date(to.getTime() - period * 86_400_000); return { from: from.toISOString(), to: to.toISOString() }; }, [period]);
  const onBoundsChange = useCallback((value: string) => setBbox(value), []);
  const onSelect = useCallback((value: string) => setSelected(value), []);
  useEffect(() => {
    if (!bbox) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void listAreas(bbox, range.from, range.to, undefined, controller.signal).then(result => { setAreas(result); setError(""); }).catch(cause => {
        if (!controller.signal.aborted) { setAreas(null); setError(cause instanceof Error ? cause.message : "Peta belum tersedia."); }
      });
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [bbox, range]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void getArea(selected, range.from, range.to, undefined, controller.signal).then(setDetail).catch(() => { if (!controller.signal.aborted) setDetail(null); });
    return () => controller.abort();
  }, [selected, range]);
  return <section id="peta" className="map-section"><div className="section-heading"><h2>Lihat pola kejadian, <em>bukan tebakan.</em></h2><p>Jelajahi area berdasarkan laporan sampah yang sudah terverifikasi.<br /> Area tanpa data belum tentu bebas sampah.</p></div>
    <div className="map-frame"><div className="map-visual" style={{ position: "relative", background: "#eaf4f8" }}><AreaMap areas={areas} onBoundsChange={onBoundsChange} onSelect={onSelect} /></div><aside className="map-panel"><div className="panel-heading"><h3>Peta Laporan Sampah</h3><span>{areas ? `Diperbarui: ${new Date(areas.asOf).toLocaleString("id-ID")}` : "Memuat data area"}</span></div>
      <label className="period"><span>Periode</span><span><CalendarDays size={21} /><select value={period} onChange={event => { setPeriod(Number(event.target.value)); setSelected(""); setDetail(null); }} aria-label="Periode laporan"><option value={7}>7 hari terakhir</option><option value={30}>30 hari terakhir</option><option value={90}>90 hari terakhir</option></select><ChevronDown size={18} /></span></label>
      <div className="legend"><span><i className="green" />Risiko<br />rendah</span><span><i className="amber" />Risiko<br />sedang</span><span><i className="blue" style={{ background: "#ed7070", borderColor: "#fff0f0" }} />Risiko<br />tinggi</span></div>
      <div className="list-title"><h4>Area terverifikasi</h4><span>{areas?.features.length || 0} area</span></div>
      <div className="reports">{areas?.features.length ? areas.features.slice(0, 4).map(feature => <button className={`report ${selected === feature.properties.cellId ? "chosen" : ""}`} type="button" key={feature.id} onClick={() => setSelected(feature.properties.cellId)}><span className="report-main"><strong><MapPin size={16} /> {feature.properties.incidentCount} laporan terverifikasi</strong><small>{feature.properties.openIncidentCount} terbuka · {feature.properties.resolvedIncidentCount} selesai</small></span><span className="badge green">{feature.properties.riskLevel}</span></button>) : <p style={{ color: "#65738e", lineHeight: 1.5 }}>Belum ada laporan terverifikasi untuk area yang terlihat pada peta.</p>}</div>
      {detail && <p style={{ color: "#33475e", fontSize: 13 }}>Area terpilih: {detail.feature.properties.incidentCount} laporan pada {detail.feature.properties.distinctDays} hari.</p>}
      {error && <p role="alert" style={{ color: "#ad3b3b", fontSize: 13 }}>{error}</p>}
      <small className="map-disclaimer"><Info size={13} /> Ringkasan berasal dari API SAP. Area tanpa data tidak berarti bersih.</small>
    </aside></div></section>;
}
