"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, FileText } from "lucide-react";
import { type SapReport } from "../../lib/api/client";
import {
  adminSourcePhotoUrl,
  getActivitySourceReport,
  sourcePhotoUrl,
  resultPhotoUrl,
  measurementPhotoUrl,
  type ActivityResult,
  type Measurement,
} from "../../lib/api/activities";
import MediaThumbnail from "../media-thumbnail";
import s from "./activities.module.css";

/** Source photos for volunteers are authorized by activity membership on the server. */
export function SourcePhoto({
  activityId,
  allowed,
  large = false,
}: {
  activityId: string;
  allowed: boolean;
  large?: boolean;
}) {
  const load = useCallback(
    (_key: string, signal?: AbortSignal) => sourcePhotoUrl(activityId, signal),
    [activityId],
  );
  return (
    <MediaThumbnail
      mediaId={allowed ? activityId : null}
      alt="Foto laporan sumber kegiatan"
      className={large ? s.cover : s.thumbnail}
      loadUrl={load}
      fallback={<FileText size={large ? 42 : 26} />}
    />
  );
}

/** Admin-only source-photo lookup; report and media IDs never go to the volunteer endpoint. */
export function AdminSourcePhoto({
  reportId,
  allowed = true,
  large = false,
}: {
  reportId: string;
  allowed?: boolean;
  large?: boolean;
}) {
  const [report, setReport] = useState<SapReport | null>(null);
  useEffect(() => {
    if (!allowed) {
      setReport(null);
      return;
    }
    const controller = new AbortController();
    setReport(null);
    void getActivitySourceReport(reportId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setReport(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [allowed, reportId]);
  const load = useCallback(
    (mediaId: string, signal?: AbortSignal) =>
      adminSourcePhotoUrl(reportId, mediaId, signal),
    [reportId],
  );
  return (
    <MediaThumbnail
      mediaId={allowed ? report?.mediaIds[0] : null}
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
