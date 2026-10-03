"use client";

import { useCallback } from "react";
import { ApiError, apiGet, mediaUrl, type SapMediaUrl } from "../../lib/api/client";
import MediaThumbnail from "../media-thumbnail";

/** Admin media requires a report-scoped read authorization, not a public bucket. */
export default function PublicationPhoto({ mediaId, reportId, alt, className }: {
  mediaId: string; reportId: string; alt: string; className: string;
}) {
  const loadUrl = useCallback(async (id: string, signal?: AbortSignal): Promise<SapMediaUrl> => {
    try {
      return await apiGet<SapMediaUrl>(`/admin/instagram/reports/${encodeURIComponent(reportId)}/media/${encodeURIComponent(id)}/url`, signal);
    } catch (cause) {
      // Until the new admin module exists, the old API can serve the current
      // user's own media only. Never bypass a forbidden response or ownership.
      if (cause instanceof ApiError && cause.status === 404 && !signal?.aborted) return mediaUrl(id, signal);
      throw cause;
    }
  }, [reportId]);
  return <MediaThumbnail mediaId={mediaId} alt={alt} className={className} loadUrl={loadUrl} />;
}
