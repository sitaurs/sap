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

export function SourcePhoto({
  reportId,
  large = false,
}: {
  reportId: string;
  large?: boolean;
}) {
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
      alt="Foto laporan sumber kegiatan"
      className={large ? s.cover : s.thumbnail}
      loadUrl={load}
      fallback={<FileText size={large ? 42 : 26} />}
    />
  );
}
export function ResultPhoto({
  result,
  mediaId,
}: {
  result: ActivityResult;
  mediaId: string;
}) {
  const load = useCallback(
    (id: string, signal?: AbortSignal) =>
      resultPhotoUrl(result.activityId, result.id, id, signal),
    [result.activityId, result.id],
  );
  return (
    <MediaThumbnail
      mediaId={mediaId}
      alt="Foto bukti hasil kegiatan"
      className={s.evidencePhoto}
      loadUrl={load}
      fallback={<Camera size={28} />}
    />
  );
}
export function MeasurementPhoto({
  measurement,
  mediaId,
}: {
  measurement: Measurement;
  mediaId: string;
}) {
  const load = useCallback(
    (id: string, signal?: AbortSignal) =>
      measurementPhotoUrl(measurement, id, signal),
    [measurement],
  );
  return (
    <MediaThumbnail
      mediaId={mediaId}
      alt="Foto bukti timbangan kegiatan"
      className={s.evidencePhoto}
      loadUrl={load}
      fallback={<Camera size={28} />}
    />
  );
}
