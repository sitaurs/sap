"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Info, MapPin, RefreshCw } from "lucide-react";
import AreaMap from "./area-map";
import AreaIncidentLinks from "./community/area-incident-links";
import { getArea, listAreas, type SapAreaDetail, type SapAreas } from "../lib/api/client";
import { useI18n } from "../lib/i18n/provider";


export default function PublicMapSection() {
  const { t, intlLocale } = useI18n();
  const [bbox, setBbox] = useState("");
  const [period, setPeriod] = useState(30);
  const [areas, setAreas] = useState<SapAreas | null>(null);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<SapAreaDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const range = useMemo(() => { const to = new Date(); const from = new Date(to.getTime() - period * 86_400_000); return { from: from.toISOString(), to: to.toISOString() }; }, [period]);
  const onBoundsChange = useCallback((value: string) => setBbox(value), []);
  const onSelect = useCallback((value: string) => setSelected(value), []);
  useEffect(() => {
    if (!bbox) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      void listAreas(bbox, range.from, range.to, undefined, controller.signal).then(result => {
        if (!controller.signal.aborted) { setAreas(result); setError(""); setLoading(false); }
      }).catch(cause => {
        if (!controller.signal.aborted) { setAreas(null); setError(cause instanceof Error ? cause.message : "Peta belum tersedia."); setLoading(false); }
      });
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [bbox, range, reload]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void getArea(selected, range.from, range.to, undefined, controller.signal).then(setDetail).catch(() => { if (!controller.signal.aborted) setDetail(null); });
    return () => controller.abort();
  }, [selected, range]);
  return <section id="peta" className="map-section"><div className="section-heading"><p className="landing-eyebrow">{t("Peta laporan")}</p><h2>{t("Lihat pola kejadian,")}{" "}<em>{t("bukan tebakan.")}</em></h2><p>{t("Jelajahi area berdasarkan laporan sampah yang sudah terverifikasi.")}<br /> {" "}{t("Area tanpa data belum tentu bebas sampah.")}</p></div>
    <div className="map-frame"><div className="map-visual" style={{ position: "relative", background: "#eaf4f8" }}><AreaMap areas={areas} onBoundsChange={onBoundsChange} onSelect={onSelect} /></div><aside className="map-panel" aria-busy={loading}><div className="panel-heading"><h3>{t("Peta Laporan Sampah")}</h3><span>{loading ? t("Memuat data area") : areas ? t("Diperbarui: {0}", { "0": new Date(areas.asOf).toLocaleString(intlLocale) }) : t("Data belum tersedia")}</span></div>
      <label className="period"><span>{t("Periode")}</span><span><CalendarDays size={21} /><select value={period} onChange={event => { setPeriod(Number(event.target.value)); setSelected(""); setDetail(null); }} aria-label={t("Periode laporan")}><option value={7}>{t("7 hari terakhir")}</option><option value={30}>{t("30 hari terakhir")}</option><option value={90}>{t("90 hari terakhir")}</option></select><ChevronDown size={18} /></span></label>
      <div className="legend"><span><i className="green" />{t("Risiko")}<br />{t("rendah")}</span><span><i className="amber" />{t("Risiko")}<br />{t("sedang")}</span><span><i className="blue" style={{ background: "#ed7070", borderColor: "#fff0f0" }} />{t("Risiko")}<br />{t("tinggi")}</span></div>
      <div className="list-title"><h4>{t("Area terverifikasi")}</h4><span>{loading || !areas ? "—" : t("{0} area", { "0": areas.features.length })}</span></div>
      <div className="reports" aria-live="polite">{loading ? <p style={{ color: "#65738e", lineHeight: 1.5 }}>{t("Memuat ringkasan laporan terverifikasi…")}</p> : error ? <div className="landing-map-error"><p role="alert">{t(error)}</p><button type="button" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{t("Coba lagi")}</button></div> : areas?.features.length ? areas.features.slice(0, 4).map(feature => <button className={`report ${selected === feature.properties.cellId ? "chosen" : ""}`} type="button" key={feature.id} onClick={() => setSelected(feature.properties.cellId)}><span className="report-main"><strong><MapPin size={16} /> {feature.properties.incidentCount} {" "}{t("laporan terverifikasi")}</strong><small>{feature.properties.openIncidentCount} {" "}{t("terbuka ·")}{" "}{feature.properties.resolvedIncidentCount} {" "}{t("selesai")}</small></span><span className={`badge ${feature.properties.riskLevel === "medium" ? "amber" : feature.properties.riskLevel === "high" ? "red" : "green"}`}>{({ low: t("Risiko rendah"), medium: t("Risiko sedang"), high: t("Risiko tinggi") })[feature.properties.riskLevel]}</span></button>) : <p style={{ color: "#65738e", lineHeight: 1.5 }}>{t("Belum ada laporan terverifikasi untuk area yang terlihat pada peta.")}</p>}</div>
      {detail && <p style={{ color: "#33475e", fontSize: 13 }}>{t("Area terpilih:")}{" "}{detail.feature.properties.incidentCount} {" "}{t("laporan pada")}{" "}{detail.feature.properties.distinctDays} {" "}{t("hari.")}</p>}
      {selected && <AreaIncidentLinks cellId={selected} from={range.from} to={range.to}/>}
      <small className="map-disclaimer"><Info size={13} /> {" "}{t("Ringkasan berasal dari API SAP. Area tanpa data tidak berarti bersih.")}</small>
    </aside></div></section>;
}
