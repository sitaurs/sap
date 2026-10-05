"use client";

import { useCallback } from "react";
import { apiGet, type SapMediaUrl } from "../../lib/api/client";
import MediaThumbnail from "../media-thumbnail";

/** Admin media requires a report-scoped read authorization, not a public bucket. */
export default function PublicationPhoto({ mediaId, reportId, alt, className }: {
  mediaId: string; reportId: string; alt: string; className: string;
}) {
  const loadUrl = useCallback(async (id: string, signal?: AbortSignal): Promise<SapMediaUrl> => {
    return apiGet<SapMediaUrl>(`/admin/instagram/reports/${encodeURIComponent(reportId)}/media/${encodeURIComponent(id)}/url`, signal);
  }, [reportId]);
  return <MediaThumbnail mediaId={mediaId} alt={alt} className={className} loadUrl={loadUrl} />;
}
