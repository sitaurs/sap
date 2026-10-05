"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, Filter, Info, List, Map, SlidersHorizontal } from "lucide-react";
import AreaMap from "./area-map";
import AreaIncidentLinks from "./community/area-incident-links";
import { ApiError, getArea, listAreas, type SapAreaDetail, type SapAreas, type SapCategory } from "../lib/api/client";
import styles from "./dashboard.module.css";
import { useI18n } from "../lib/i18n/provider";


function dateRange(period: string) {
  const to = new Date();
  const from = new Date(to.getTime() - Number(period) * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AreaView({ categories }: { categories: SapCategory[] }) {
  const { t, intlLocale } = useI18n();
  const [period, setPeriod] = useState("30");
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState<"map" | "list">("map");
  const [bbox, setBbox] = useState("");
  const [areas, setAreas] = useState<SapAreas | null>(null);
  const [detail, setDetail] = useState<SapAreaDetail | null>(null);
  const [selectedCell, setSelectedCell] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const range = useMemo(() => dateRange(period), [period]);
  const onBoundsChange = useCallback((value: string) => setBbox(value), []);
  const onSelect = useCallback((value: string) => setSelectedCell(value), []);

  useEffect(() => {
    if (!bbox) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(""); setSelectedCell(""); setDetail(null);
      try {
        const result = await listAreas(bbox, range.from, range.to, category || undefined, controller.signal);
        if (!controller.signal.aborted) setAreas(result);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setAreas(null);
          setError(cause instanceof ApiError && cause.code === "MAP_BOUNDS_TOO_LARGE" ? "Area terlalu luas. Perbesar peta untuk melihat ringkasan." : cause instanceof Error ? cause.message : "Data peta belum tersedia.");
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [bbox, range, category]);

  useEffect(() => {
    if (!selectedCell) return;
    const controller = new AbortController();
    void getArea(selectedCell, range.from, range.to, category || undefined, controller.signal).then(setDetail).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Detail area belum tersedia.");
    });
    return () => controller.abort();
  }, [selectedCell, range, category]);

  const feature = detail?.feature;
  const features = areas?.features || [];
  return <>
    <div className={styles.referenceHeading}><h1>{t("Peta area")}</h1><p>{t("Jelajahi ringkasan laporan terverifikasi.")}</p></div>
    <div className={styles.mapFilters}>
      <label>{t("Rentang tanggal")}<span className={styles.selectWrap}><CalendarDays size={19} /><select aria-label={t("Rentang tanggal peta")} value={period} onChange={event => setPeriod(event.target.value)}><option value="7">{t("7 hari terakhir")}</option><option value="30">{t("30 hari terakhir")}</option><option value="90">{t("90 hari terakhir")}</option></select></span></label>
      <label>{t("Kategori sampah")}<span className={styles.selectWrap}><Filter size={19} /><select aria-label={t("Kategori sampah peta")} value={category} onChange={event => setCategory(event.target.value)}><option value="">{t("Semua kategori")}</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></span></label>
      <div className={styles.segmented} role="group" aria-label={t("Tampilan peta")}><button type="button" className={mode === "map" ? styles.segmentActive : ""} onClick={() => setMode("map")} aria-pressed={mode === "map"}><Map size={21} />{t("Peta")}</button><button type="button" className={mode === "list" ? styles.segmentActive : ""} onClick={() => setMode("list")} aria-pressed={mode === "list"}><List size={21} />{t("Daftar")}</button></div>
    </div>
    <div className={styles.areaLayout}>
      <div className={styles.mapCanvas}>
        <AreaMap areas={areas} onBoundsChange={onBoundsChange} onSelect={onSelect} />
        {mode === "list" && <div className={styles.mapListEmpty} style={{ position: "absolute", inset: 0, zIndex: 2, alignItems: "stretch", overflow: "auto" }}>
          {features.length ? features.map(item => <button key={item.id} type="button" onClick={() => { setSelectedCell(item.properties.cellId); setMode("map"); }} style={{ padding: 16, margin: 6, textAlign: "left", border: "1px solid #dfece9", borderRadius: 12, background: "white", color: "#1a3c37" }}>{item.properties.incidentCount} {" "}{t("laporan ·")}{" "}{item.properties.openIncidentCount} {" "}{t("terbuka · Risiko")}{" "}{item.properties.riskLevel}</button>) : <p>{t("Belum ada laporan terverifikasi di area dan periode ini.")}</p>}
        </div>}
        {loading && <span style={{ position: "absolute", zIndex: 3, left: 12, bottom: 12, background: "white", padding: "8px 12px", borderRadius: 8 }}>{t("Memuat area…")}</span>}
      </div>
      <aside className={styles.areaDetail}><h2><FileText size={23} />{t("Detail area")}</h2>
        <div className={styles.areaDetailEmpty}>{feature ? <div style={{ textAlign: "left", width: "100%", padding: 12 }}><strong>{feature.properties.incidentCount} {" "}{t("laporan terverifikasi")}</strong><p>{feature.properties.openIncidentCount} {" "}{t("masih terbuka ·")}{" "}{feature.properties.resolvedIncidentCount} {" "}{t("selesai")}</p><p>{t("Risiko:")}{" "}{feature.properties.riskLevel}</p><small>{t("Sel area:")}{" "}{feature.properties.cellId}</small></div> : <p>{t("Pilih area pada peta untuk melihat detail.")}{" "}{features.length ? t("{0} area memiliki data.", { "0": features.length }) : t("Belum ada data untuk tampilan ini.")}</p>}</div>
        {selectedCell && <AreaIncidentLinks cellId={selectedCell} from={range.from} to={range.to} categoryId={category||undefined}/>}
        <div className={styles.intensity}><strong><SlidersHorizontal size={20} />{t("Legenda intensitas laporan")}</strong><span><i className={styles.low} />{t("Rendah")}</span><span><i className={styles.medium} />{t("Sedang")}</span><span><i className={styles.high} />{t("Tinggi")}</span></div>
        {error && <p className={styles.areaInfo} role="alert"><Info size={18} />{t(error)}</p>}
        <p className={styles.areaInfo}><Info size={18} />{t("Area tanpa data tidak berarti bersih.")}</p>
        {areas && <small style={{ color: "#718198", marginTop: 8 }}>{t("Diperbarui")}{" "}{new Date(areas.asOf).toLocaleString(intlLocale)}{areas.isStale ? t(" · data tersimpan") : ""} · {areas.methodVersion}</small>}
      </aside>
    </div>
  </>;
}
