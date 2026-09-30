"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import styles from "./report-wizard.module.css";
import { MALANG_CENTER } from "../lib/malang";

export type ReportPoint = { latitude: number; longitude: number };

const fallbackCenter: ReportPoint = MALANG_CENTER;

export default function ReportMap({ point, onPick, readOnly = false }: {
  point: ReportPoint | null;
  onPick?: (point: ReportPoint) => void;
  readOnly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onPickRef = useRef(onPick);
  const pointRef = useRef(point);
  onPickRef.current = onPick;
  pointRef.current = point;

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let currentMap: LeafletMap | null = null;
    void import("leaflet").then(L => {
      if (disposed || !containerRef.current) return;
      const center = pointRef.current || fallbackCenter;
      const map = L.map(containerRef.current, {
        zoomControl: !readOnly,
        attributionControl: true,
        dragging: !readOnly,
        scrollWheelZoom: false,
        doubleClickZoom: !readOnly,
        touchZoom: !readOnly,
      }).setView([center.latitude, center.longitude], readOnly ? 14 : 13);
      currentMap = map;
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).addTo(map);
      const icon = L.divIcon({ className: "sap-report-pin-wrap", html: '<span class="sap-report-pin"></span>', iconSize: [36, 48], iconAnchor: [18, 46] });
      const marker = L.marker([center.latitude, center.longitude], { icon, draggable: !readOnly }).addTo(map);
      markerRef.current = marker;
      if (!readOnly) {
        map.on("click", event => onPickRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
        marker.on("dragend", () => {
          const latLng = marker.getLatLng();
          onPickRef.current?.({ latitude: latLng.lat, longitude: latLng.lng });
        });
      }
      window.setTimeout(() => map.invalidateSize(), 80);
    });
    return () => {
      disposed = true;
      currentMap?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mount once per wizard step; location updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  useEffect(() => {
    if (!point || !mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([point.latitude, point.longitude]);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current.panTo([point.latitude, point.longitude], { animate: !readOnly && !reducedMotion });
  }, [point, readOnly]);

  return <div ref={containerRef} className={styles.map} role="application" aria-label={readOnly ? "Peta lokasi laporan" : "Peta interaktif. Klik atau geser pin untuk menentukan lokasi temuan."} />;
}
