"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { SapAreas } from "../lib/api/client";

type Props = { areas: SapAreas | null; onBoundsChange: (bbox: string) => void; onSelect: (cellId: string) => void };

export default function AreaMap({ areas, onBoundsChange, onSelect }: Props) {
  const node = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(0);
  const map = useRef<LeafletMap | null>(null);
  const overlays = useRef<LayerGroup | null>(null);
  const boundsCallback = useRef(onBoundsChange);
  const selectCallback = useRef(onSelect);
  boundsCallback.current = onBoundsChange;
  selectCallback.current = onSelect;

  useEffect(() => {
    if (!node.current) return;
    let disposed = false;
    let current: LeafletMap | null = null;
    void import("leaflet").then(L => {
      if (disposed || !node.current) return;
      current = L.map(node.current, { scrollWheelZoom: false }).setView([-5.43, 105.26], 12);
      map.current = current;
      overlays.current = L.layerGroup().addTo(current);
      setReady(value => value + 1);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).addTo(current);
      const publishBounds = () => {
        if (!current) return;
        const b = current.getBounds();
        boundsCallback.current([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(6)).join(","));
      };
      current.on("moveend", publishBounds);
      window.setTimeout(() => { current?.invalidateSize(); publishBounds(); }, 100);
    });
    return () => { disposed = true; current?.remove(); map.current = null; overlays.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !overlays.current) return;
    const group = overlays.current;
    group.clearLayers();
    void import("leaflet").then(L => {
      if (!map.current || overlays.current !== group || !areas) return;
      const colors = { low: "#50a976", medium: "#f2bd50", high: "#ed7070" };
      for (const feature of areas.features) {
        const ring = feature.geometry.coordinates[0];
        if (!ring) continue;
        const shape = L.polygon(ring.map(([lng, lat]) => [lat, lng] as [number, number]), {
          color: colors[feature.properties.riskLevel], fillColor: colors[feature.properties.riskLevel],
          fillOpacity: .42, weight: 2,
        }).addTo(group);
        shape.bindTooltip(`${feature.properties.incidentCount} laporan · ${feature.properties.riskLevel}`);
        shape.on("click", () => selectCallback.current(feature.properties.cellId));
      }
    });
  }, [areas, ready]);

  return <div ref={node} style={{ position: "absolute", inset: 0, zIndex: 0 }} role="application" aria-label="Peta area interaktif; geser atau perbesar untuk melihat laporan terverifikasi" />;
}
