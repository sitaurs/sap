"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, FileText } from "lucide-react";
import { type SapReport } from "../../lib/api/client";
import {
  getActivitySourceReport,
  sourcePhotoUrl,
  resultPhotoUrl,
  measurementPhotoUrl,
  type ActivityResult,
  type Measurement,
} from "../../lib/api/activities";
import MediaThumbnail from "../media-thumbnail";
import s from "./activities.module.css";
import { enc, r1Get, type R1 } from "../../lib/api/r1";
import { useI18n } from "../../lib/i18n/provider";


export function SourcePhoto({
  reportId,
  large = false,
}: {
  reportId: string;
  large?: boolean;
}) {
  const { t } = useI18n();
  const [report, setReport] = useState<SapReport | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setReport(null);
    void getActivitySourceReport(reportId, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setReport(r);
      })
      .catch(() => {});
    return () => c.abort();
  }, [reportId]);
  const load = useCallback(
    (id: string, signal?: AbortSignal) => sourcePhotoUrl(reportId, id, signal),
    [reportId],
  );
  return (
    <MediaThumbnail
      mediaId={report?.mediaIds[0]}
      alt={t("Foto laporan sumber kegiatan")}
      className={large ? s.cover : s.thumbnail}
      loadUrl={load}
      fallback={<FileText size={large ? 42 : 26} />}
    />
  );
}
export function ResultPhoto({
  result,
  mediaId,
  real = false,
}: {
  result: ActivityResult;
  mediaId: string;
  real?: boolean;
}) {
  const { t } = useI18n();
  const load = useCallback(
    (id: string, signal?: AbortSignal) =>
      real
        ? r1Get<R1["MediaUrl"]>(
            `/activities/${enc(result.activityId)}/results/${enc(result.id)}/media/${enc(id)}/url`,
            signal,
          )
        : resultPhotoUrl(result.activityId, result.id, id, signal),
    [result.activityId, result.id, real],
  );
  return (
    <MediaThumbnail
      mediaId={mediaId}
      alt={t("Foto bukti hasil kegiatan")}
      className={s.evidencePhoto}
      loadUrl={load}
      fallback={<Camera size={28} />}
    />
  );
}
export function MeasurementPhoto({
  measurement,
  mediaId,
  real = false,
}: {
  measurement: Measurement;
  mediaId: string;
  real?: boolean;
}) {
  const { t } = useI18n();
  const load = useCallback(
    (id: string, signal?: AbortSignal) =>
      real
        ? r1Get<R1["MediaUrl"]>(
            `/activities/${enc(measurement.activityId)}/measurements/${enc(measurement.id)}/media/${enc(id)}/url`,
            signal,
          )
        : measurementPhotoUrl(measurement, id, signal),
    [measurement, real],
  );
  return (
    <MediaThumbnail
      mediaId={mediaId}
      alt={t("Foto bukti timbangan kegiatan")}
      className={s.evidencePhoto}
      loadUrl={load}
      fallback={<Camera size={28} />}
    />
  );
}
