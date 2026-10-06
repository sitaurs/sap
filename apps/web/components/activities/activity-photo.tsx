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
import { enc, r1Get, type R1 } from "../../lib/api/r1";
import { useI18n } from "../../lib/i18n/provider";


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
  const { t } = useI18n();
  const load = useCallback(
    (_key: string, signal?: AbortSignal) => sourcePhotoUrl(activityId, signal),
    [activityId],
  );
  return (
    <MediaThumbnail
      mediaId={allowed ? activityId : null}
      alt={t("Foto laporan sumber kegiatan")}
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
  const { t } = useI18n();
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
