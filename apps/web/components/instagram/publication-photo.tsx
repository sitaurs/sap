"use client";

import { useCallback } from "react";
import { publicationPhotoUrl } from "../../lib/api/instagram";
import MediaThumbnail from "../media-thumbnail";

/** Admin media requires a report-scoped read authorization, not a public bucket. */
export default function PublicationPhoto({
  mediaId,
  reportId,
  alt,
  className,
}: {
  mediaId: string;
  reportId: string;
  alt: string;
  className: string;
}) {
  const loadUrl = useCallback(
    (id: string, signal?: AbortSignal) =>
      publicationPhotoUrl(reportId, id, signal),
    [reportId],
  );
  return (
    <MediaThumbnail
      mediaId={mediaId}
      alt={alt}
      className={className}
      loadUrl={loadUrl}
    />
  );
}
