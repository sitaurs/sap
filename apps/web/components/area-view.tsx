"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, Filter, Info, List, Map, SlidersHorizontal } from "lucide-react";
import AreaMap from "./area-map";
import AreaIncidentLinks from "./community/area-incident-links";
import { ApiError, apiGet, getArea, listAreas, type SapAreaDetail, type SapAreaFeature, type SapAreas, type SapCategory } from "../lib/api/client";
import styles from "./dashboard.module.css";
import ui from "./area-view.module.css";
import { useI18n } from "../lib/i18n/provider";
import { publicAreaLabel } from "./community/public-community";

type AreaLocality = { cellId: string; kelurahan: string | null; kecamatan: string | null; city: string | null; label: string };

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
  const [localities, setLocalities] = useState<Record<string, AreaLocality>>({});
  const [localityBatchDone, setLocalityBatchDone] = useState(false);
  const [selectedLocality, setSelectedLocality] = useState<AreaLocality | null>(null);
  const features = useMemo(() => areas?.features ?? [], [areas?.features]);
  const localityCells = useMemo(() => [...new Set(features.map(item => item.properties.cellId))].slice(0, 100), [features]);
  const range = useMemo(() => dateRange(period), [period]);
  const onBoundsChange = useCallback((value: string) => setBbox(value), []);
  const onSelect = useCallback((value: string) => {
    if (value === selectedCell) return;
    setDetail(null);
    setError("");
    setSelectedCell(value);
  }, [selectedCell]);

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
    void getArea(selectedCell, range.from, range.to, category || undefined, controller.signal).then(value => {
      if (!controller.signal.aborted) setDetail(value);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Detail area belum tersedia.");
    });
    return () => controller.abort();
  }, [selectedCell, range, category]);

  useEffect(() => {
    const controller = new AbortController();
    setLocalities({});
    setLocalityBatchDone(false);
    if (!localityCells.length) return () => controller.abort();
    void apiGet<{ items: AreaLocality[] }>(`/area-localities?cells=${encodeURIComponent(localityCells.join(","))}`, controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setLocalities(Object.fromEntries(value.items.map(item => [item.cellId, item])));
      })
      .catch(() => { /* Area summaries remain available when locality names cannot be loaded. */ })
      .finally(() => {
        if (!controller.signal.aborted) setLocalityBatchDone(true);
      });
    return () => controller.abort();
  }, [localityCells]);

  const needsLocality = Boolean(selectedCell && (!localityCells.includes(selectedCell) || (localityBatchDone && !localities[selectedCell])));
  useEffect(() => {
    setSelectedLocality(null);
    if (!needsLocality) return;
    const controller = new AbortController();
    void apiGet<AreaLocality>(`/areas/${encodeURIComponent(selectedCell)}/locality`, controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setSelectedLocality(value);
      })
      .catch(() => { /* Unconfigured cells keep the honest grid-area fallback. */ });
    return () => controller.abort();
  }, [selectedCell, needsLocality]);

  const feature = detail?.feature;
  const riskLabels = { low: "Rendah", medium: "Sedang", high: "Tinggi" };
  function areaName(item: SapAreaFeature) {
    const cellId = item.properties.cellId;
    const locality = localities[cellId] ?? (selectedLocality?.cellId === cellId ? selectedLocality : null);
    return publicAreaLabel({ cellId, label: locality?.label ?? "" }, t);
  }
  return <>
    <div data-motion="heading" className={styles.referenceHeading}><h1>{t("Peta area")}</h1><p>{t("Jelajahi ringkasan laporan terverifikasi.")}</p></div>
    <div className={styles.mapFilters}>
      <label>{t("Rentang tanggal")}<span className={styles.selectWrap}><CalendarDays size={19} /><select aria-label={t("Rentang tanggal peta")} value={period} onChange={event => setPeriod(event.target.value)}><option value="7">{t("7 hari terakhir")}</option><option value="30">{t("30 hari terakhir")}</option><option value="90">{t("90 hari terakhir")}</option></select></span></label>
      <label>{t("Kategori sampah")}<span className={styles.selectWrap}><Filter size={19} /><select aria-label={t("Kategori sampah peta")} value={category} onChange={event => setCategory(event.target.value)}><option value="">{t("Semua kategori")}</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></span></label>
      <div className={styles.segmented} role="group" aria-label={t("Tampilan peta")}><button type="button" className={mode === "map" ? styles.segmentActive : ""} onClick={() => setMode("map")} aria-pressed={mode === "map"}><Map size={21} />{t("Peta")}</button><button type="button" className={mode === "list" ? styles.segmentActive : ""} onClick={() => setMode("list")} aria-pressed={mode === "list"}><List size={21} />{t("Daftar")}</button></div>
    </div>
    <div className={styles.areaLayout}>
      <div className={styles.mapCanvas}>
        <AreaMap areas={areas} onBoundsChange={onBoundsChange} onSelect={onSelect} />
        {mode === "list" && <div className={ui.areaList}>
          {features.length ? features.map(item => <button className={ui.areaRow} key={item.id} type="button" onClick={() => { onSelect(item.properties.cellId); setMode("map"); }}><strong>{areaName(item)}</strong><span>{item.properties.incidentCount}{" "}{t("laporan ·")}{" "}{item.properties.openIncidentCount}{" "}{t("terbuka · Risiko")}{" "}{t(riskLabels[item.properties.riskLevel])}</span></button>) : <p>{t("Belum ada laporan terverifikasi di area dan periode ini.")}</p>}
        </div>}
        {loading && <span style={{ position: "absolute", zIndex: 3, left: 12, bottom: 12, background: "white", padding: "8px 12px", borderRadius: 8 }}>{t("Memuat area…")}</span>}
      </div>
      <aside className={styles.areaDetail}><h2><FileText size={23} />{t("Detail area")}</h2>
        <div className={styles.areaDetailEmpty}>{feature ? <div className={ui.areaFacts}><h3>{areaName(feature)}</h3><strong>{feature.properties.incidentCount}{" "}{t("laporan terverifikasi")}</strong><p>{feature.properties.openIncidentCount}{" "}{t("masih terbuka ·")}{" "}{feature.properties.resolvedIncidentCount}{" "}{t("selesai")}</p><p>{t("Risiko:")}{" "}{t(riskLabels[feature.properties.riskLevel])}</p></div> : <div><p>{t("Pilih area pada peta untuk melihat detail.")}</p><p>{features.length ? t("{0} area memiliki data.", { "0": features.length }) : t("Belum ada data untuk tampilan ini.")}</p></div>}</div>
        {selectedCell && <AreaIncidentLinks cellId={selectedCell} from={range.from} to={range.to} categoryId={category||undefined}/>}
        <div className={styles.intensity}><strong><SlidersHorizontal size={20} />{t("Legenda intensitas laporan")}</strong><span><i className={styles.low} />{t("Rendah")}</span><span><i className={styles.medium} />{t("Sedang")}</span><span><i className={styles.high} />{t("Tinggi")}</span></div>
        {error && <p className={styles.areaInfo} role="alert"><Info size={18} />{t(error)}</p>}
        <p className={styles.areaInfo}><Info size={18} />{t("Area tanpa data tidak berarti bersih.")}</p>
        <details className={ui.areaMethod}><summary>{t("Bagaimana area dibentuk?")}</summary><p>{t("Laporan dikelompokkan berdasarkan lokasi ke sel grid H3 resolusi 9. Ukuran grid tetap saat peta diperbesar; bukan radius dari titik laporan atau batas kelurahan/kecamatan.")}</p><p>{t("Ringkasan menghitung laporan terverifikasi, dalam penanganan, dan selesai sesuai periode serta kategori yang dipilih.")}</p><p>{t("Nama kelurahan, kecamatan, dan kota dikurasi manual oleh admin. Label ini bukan alamat tepat atau batas wilayah. Area tanpa nama ditampilkan sebagai area laporan.")}</p></details>
        {areas && <small className={ui.updatedAt}>{t("Diperbarui: {0}", { "0": new Date(areas.asOf).toLocaleString(intlLocale) })}{areas.isStale ? t(" · data tersimpan") : ""}</small>}
      </aside>
    </div>
  </>;
}
