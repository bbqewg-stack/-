"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback } from "react";
import { ModuleConfig, calculateModuleLayout, isCoordInPolygon } from "@/lib/moduleLayout";

interface Coord {
  lat: number;
  lng: number;
}

interface PolygonData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leafletPolygon: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  labelMarker: any;
  area: number;
  coords: Coord[];
  angle: number;
}

interface KakaoMapProps {
  onAreasChange: (polygons: { area: number; coords: Coord[]; type: 'inclusion' | 'exclusion'; angle?: number }[]) => void;
  moduleConfig?: ModuleConfig;
  onModuleCountsChange?: (counts: number[]) => void;
}

const POLYGON_COLORS = ["#0066ff", "#ff6600", "#9900cc", "#00aa66", "#cc0033"];

function getColor(index: number) {
  return POLYGON_COLORS[index % POLYGON_COLORS.length];
}

function calculateArea(coords: Coord[]): number {
  if (coords.length < 3) return 0;
  const R = 6371000;
  const n = coords.length;
  let area = 0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const avgLat = coords.reduce((s, c) => s + c.lat, 0) / n;
  const cosLat = Math.cos(toRad(avgLat));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = toRad(coords[i].lng) * R * cosLat;
    const yi = toRad(coords[i].lat) * R;
    const xj = toRad(coords[j].lng) * R * cosLat;
    const yj = toRad(coords[j].lat) * R;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2);
}

function getCentroid(vertices: [number, number][]): [number, number] {
  const lat = vertices.reduce((s, v) => s + v[0], 0) / vertices.length;
  const lng = vertices.reduce((s, v) => s + v[1], 0) / vertices.length;
  return [lat, lng];
}

// Detect dominant angle from polygon edges (angle of longest edge, -90~90°)
function detectPolygonAngle(coords: Coord[]): number {
  if (coords.length < 2) return 0;
  const avgLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const cosLat = Math.cos(avgLat * Math.PI / 180);
  let bestLen = 0, bestAngle = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const dx = (coords[j].lng - coords[i].lng) * cosLat;
    const dy = coords[j].lat - coords[i].lat;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > bestLen) {
      bestLen = len;
      bestAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    }
  }
  while (bestAngle > 90) bestAngle -= 180;
  while (bestAngle < -90) bestAngle += 180;
  return Math.round(bestAngle * 100) / 100;
}

// Angle of edge P1→P2 normalized to -90~90°
function edgeAngle(p1: [number, number], p2: [number, number]): number {
  const cosLat = Math.cos(p1[0] * Math.PI / 180);
  const dx = (p2[1] - p1[1]) * cosLat;
  const dy = p2[0] - p1[0];
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  while (angle > 90) angle -= 180;
  while (angle < -90) angle += 180;
  return Math.round(angle * 100) / 100;
}

// Compute 4 rectangle corners: P1,P2 define one edge; P3 defines width
function computeRectCorners(
  p1: [number, number], p2: [number, number], p3: [number, number]
): [number, number][] {
  const R = 6371000;
  const cosLat = Math.cos(p1[0] * Math.PI / 180);
  const toXY = ([lat, lng]: [number, number]) => ({
    x: (lng - p1[1]) * Math.PI / 180 * R * cosLat,
    y: (lat - p1[0]) * Math.PI / 180 * R,
  });
  const fromXY = ({ x, y }: { x: number; y: number }): [number, number] => [
    p1[0] + (y / R) * (180 / Math.PI),
    p1[1] + (x / (R * cosLat)) * (180 / Math.PI),
  ];
  const lp1 = toXY(p1), lp2 = toXY(p2), lp3 = toXY(p3);
  const ex = lp2.x - lp1.x, ey = lp2.y - lp1.y;
  const elen = Math.sqrt(ex * ex + ey * ey) || 1;
  const pu = { x: -ey / elen, y: ex / elen };
  const d = (lp3.x - lp1.x) * pu.x + (lp3.y - lp1.y) * pu.y;
  return [
    lp1,
    lp2,
    { x: lp2.x + d * pu.x, y: lp2.y + d * pu.y },
    { x: lp1.x + d * pu.x, y: lp1.y + d * pu.y },
  ].map(fromXY);
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export default function LeafletMap({
  onAreasChange,
  moduleConfig,
  onModuleCountsChange = () => {},
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const polygonsRef = useRef<PolygonData[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchMarkerRef = useRef<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [vertexCount, setVertexCount] = useState(0);
  const [polygonCount, setPolygonCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verticesRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clickHandlerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locateMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locateHandlerRef = useRef<any>(null);
  const [isLocating, setIsLocating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parcelPolygonRef = useRef<any>(null);
  const [isLoadingParcel, setIsLoadingParcel] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exclusionPolygonsRef = useRef<PolygonData[]>([]);
  const [exclusionCount, setExclusionCount] = useState(0);
  const drawingModeRef = useRef<'inclusion' | 'exclusion'>('inclusion');
  const [drawingMode, setDrawingMode] = useState<'inclusion' | 'exclusion'>('inclusion');

  // Rectangle drawing state
  const [isRectDrawing, setIsRectDrawing] = useState(false);
  const [rectPhase, setRectPhase] = useState(0); // 0=idle,1=P1 set,2=P2 set(preview)
  const rectPhaseRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rectP1Ref = useRef<[number, number] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rectP2Ref = useRef<[number, number] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rectPreviewRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapMouseMoveHandlerRef = useRef<any>(null);

  // Module layout refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleLayersRef = useRef<any[]>([]);
  const moduleConfigRef = useRef<ModuleConfig | undefined>(moduleConfig);
  const onModuleCountsChangeRef = useRef(onModuleCountsChange);
  const renderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onModuleCountsChangeRef.current = onModuleCountsChange; }, [onModuleCountsChange]);

  const renderModules = useCallback(() => {
    const config = moduleConfigRef.current;
    const map = mapInstanceRef.current;
    const L = leafletRef.current;

    moduleLayersRef.current.forEach((l) => l.remove());
    moduleLayersRef.current = [];

    if (!config?.enabled || !map || !L) {
      onModuleCountsChangeRef.current([]);
      return;
    }

    const allExclusionCoords = exclusionPolygonsRef.current.map((p) => p.coords);
    const counts: number[] = [];

    polygonsRef.current.forEach((polygonData) => {
      const relevantExcls = allExclusionCoords.filter((exc) => {
        const excCentroid: Coord = {
          lat: exc.reduce((s, c) => s + c.lat, 0) / exc.length,
          lng: exc.reduce((s, c) => s + c.lng, 0) / exc.length,
        };
        return isCoordInPolygon(excCentroid, polygonData.coords);
      });

      const modules = calculateModuleLayout(polygonData.coords, { ...config, angle: polygonData.angle }, relevantExcls);
      counts.push(modules.length);

      modules.forEach((corners) => {
        const latLngs = corners.map((c) => [c.lat, c.lng] as [number, number]);
        const poly = L.polygon(latLngs, {
          color: "#9b59b6",
          weight: 0.8,
          fillColor: "#d7bde2",
          fillOpacity: 0.55,
        }).addTo(map);
        moduleLayersRef.current.push(poly);
      });
    });

    onModuleCountsChangeRef.current(counts);
  }, []);

  const scheduleRenderModules = useCallback(() => {
    if (renderDebounceRef.current) clearTimeout(renderDebounceRef.current);
    renderDebounceRef.current = setTimeout(renderModules, 150);
  }, [renderModules]);

  useEffect(() => {
    moduleConfigRef.current = moduleConfig;
    scheduleRenderModules();
  }, [moduleConfig, scheduleRenderModules]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let active = true;
    import("leaflet").then((L) => {
      if (!active || !mapRef.current || mapInstanceRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapRef.current, { center: [36.5, 127.8], zoom: 8, maxZoom: 22 });
      const vworldKey = process.env.NEXT_PUBLIC_VWORLD_KEY;
      L.tileLayer(
        `https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg?apikey=${vworldKey}`,
        { attribution: "© 국토정보플랫폼", maxZoom: 22, maxNativeZoom: 19 }
      ).addTo(map);
      L.tileLayer(
        `https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png?apikey=${vworldKey}`,
        { maxZoom: 22, maxNativeZoom: 19, opacity: 0.9 }
      ).addTo(map);
      mapInstanceRef.current = map;
    });
    return () => {
      active = false;
      if (renderDebounceRef.current) clearTimeout(renderDebounceRef.current);
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("solar_recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  const saveRecentSearch = useCallback((query: string) => {
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== query);
      const updated = [query, ...filtered].slice(0, 8);
      try { localStorage.setItem("solar_recent_searches", JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const stopLocating = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (locateHandlerRef.current) { map.off("click", locateHandlerRef.current); locateHandlerRef.current = null; }
    if (locateMarkerRef.current) { locateMarkerRef.current.remove(); locateMarkerRef.current = null; }
    setIsLocating(false);
    map.getContainer().style.cursor = "";
  }, []);

  const startLocating = useCallback(() => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    setIsLocating(true);
    map.getContainer().style.cursor = "crosshair";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = async (e: any) => {
      const { lat, lng } = e.latlng;
      if (locateMarkerRef.current) { locateMarkerRef.current.remove(); locateMarkerRef.current = null; }
      const icon = L.divIcon({
        html: `<div style="background:#805ad5;width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 14], className: "",
      });
      const marker = L.marker([lat, lng], { icon }).addTo(map);
      marker.bindPopup("주소 조회 중...", { autoClose: false, closeOnClick: false }).openPopup();
      locateMarkerRef.current = marker;
      try {
        const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
        const data = await res.json();
        const road = data.road_address, addr = data.address;
        if (road || addr) {
          marker.setPopupContent(
            `<div style="min-width:180px;line-height:1.5">` +
            (road ? `<div style="font-size:13px;font-weight:600">${road}</div>` : "") +
            (addr ? `<div style="font-size:11px;color:#666;margin-top:2px">${addr}</div>` : "") +
            `<div style="font-size:10px;color:#aaa;margin-top:4px">${lat.toFixed(6)}, ${lng.toFixed(6)}</div></div>`
          );
        } else {
          marker.setPopupContent(`<div>주소를 찾을 수 없습니다<br/><span style="font-size:10px;color:#aaa">${lat.toFixed(6)}, ${lng.toFixed(6)}</span></div>`);
        }
        if (!marker.isPopupOpen()) marker.openPopup();
      } catch {
        marker.setPopupContent("주소 조회 실패");
        if (!marker.isPopupOpen()) marker.openPopup();
      }
    };
    map.on("click", handler);
    locateHandlerRef.current = handler;
  }, []);

  // Unified cancel: clears both polygon and rect drawing state
  const cancelCurrentDrawing = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (clickHandlerRef.current) { map.off("click", clickHandlerRef.current); clickHandlerRef.current = null; }
    if (mapMouseMoveHandlerRef.current) { map.off("mousemove", mapMouseMoveHandlerRef.current); mapMouseMoveHandlerRef.current = null; }
    if (rectPreviewRef.current) { rectPreviewRef.current.remove(); rectPreviewRef.current = null; }
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    verticesRef.current = [];
    setVertexCount(0);
    setIsDrawing(false);
    setIsRectDrawing(false);
    rectPhaseRef.current = 0;
    setRectPhase(0);
    rectP1Ref.current = null;
    rectP2Ref.current = null;
    map.getContainer().style.cursor = "";
  }, []);

  const notifyAreas = useCallback(() => {
    const inclusions = polygonsRef.current.map(p => ({ area: p.area, coords: p.coords, type: 'inclusion' as const, angle: p.angle }));
    const exclusions = exclusionPolygonsRef.current.map(p => ({ area: p.area, coords: p.coords, type: 'exclusion' as const }));
    onAreasChange([...inclusions, ...exclusions]);
    renderModules();
  }, [onAreasChange, renderModules]);

  // --- Polygon drawing ---
  const startDrawing = useCallback((mode: 'inclusion' | 'exclusion' = 'inclusion') => {
    const map = mapInstanceRef.current;
    if (!map) return;
    cancelCurrentDrawing();
    drawingModeRef.current = mode;
    setDrawingMode(mode);
    if (locateHandlerRef.current) { map.off("click", locateHandlerRef.current); locateHandlerRef.current = null; }
    if (locateMarkerRef.current) { locateMarkerRef.current.remove(); locateMarkerRef.current = null; }
    setIsLocating(false);
    setIsDrawing(true);
    map.getContainer().style.cursor = "crosshair";
    import("leaflet").then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (e: any) => {
        const { lat, lng } = e.latlng;
        verticesRef.current.push([lat, lng]);
        setVertexCount(verticesRef.current.length);
        const marker = L.circleMarker([lat, lng], { radius: 5, color: "#ff6b6b", fillColor: "#ff6b6b", fillOpacity: 1 }).addTo(map);
        markersRef.current.push(marker);
        if (polylineRef.current) polylineRef.current.remove();
        if (verticesRef.current.length > 1) {
          polylineRef.current = L.polyline(verticesRef.current, { color: "#ff6b6b", weight: 2, dashArray: "5,5" }).addTo(map);
        }
      };
      map.on("click", handler);
      clickHandlerRef.current = handler;
    });
  }, [cancelCurrentDrawing]);

  const finishDrawing = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || verticesRef.current.length < 3) return;
    if (clickHandlerRef.current) { map.off("click", clickHandlerRef.current); clickHandlerRef.current = null; }
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    map.getContainer().style.cursor = "";
    const capturedVertices = [...verticesRef.current];
    const mode = drawingModeRef.current;
    verticesRef.current = [];
    setVertexCount(0);
    setIsDrawing(false);
    import("leaflet").then((L) => {
      const coords = capturedVertices.map(([lat, lng]) => ({ lat, lng }));
      const area = calculateArea(coords);
      const centroid = getCentroid(capturedVertices);
      if (mode === 'exclusion') {
        const exIdx = exclusionPolygonsRef.current.length + 1;
        const polygon = L.polygon(capturedVertices, { color: "#e53e3e", weight: 2, fillColor: "#e53e3e", fillOpacity: 0.3, dashArray: "6,4" }).addTo(map);
        const labelIcon = L.divIcon({ html: `<div style="background:#e53e3e;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);">제외 ${exIdx}</div>`, className: "", iconAnchor: [20, 10] });
        const labelMarker = L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(map);
        exclusionPolygonsRef.current = [...exclusionPolygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords, angle: 0 }];
        setExclusionCount(exclusionPolygonsRef.current.length);
      } else {
        const colorIndex = polygonsRef.current.length;
        const color = getColor(colorIndex);
        const label = colorIndex + 1;
        const polygon = L.polygon(capturedVertices, { color, weight: 2, fillColor: color, fillOpacity: 0.25 }).addTo(map);
        const labelIcon = L.divIcon({ html: `<div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);">영역 ${label}</div>`, className: "", iconAnchor: [20, 10] });
        const labelMarker = L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(map);
        polygonsRef.current = [...polygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords, angle: detectPolygonAngle(coords) }];
        setPolygonCount(polygonsRef.current.length);
      }
      notifyAreas();
    });
  }, [notifyAreas]);

  // --- Rectangle drawing (3 clicks: P1 corner → P2 edge → P3 width) ---
  const startDrawingRect = useCallback((mode: 'inclusion' | 'exclusion' = 'inclusion') => {
    const map = mapInstanceRef.current;
    if (!map) return;
    cancelCurrentDrawing();
    drawingModeRef.current = mode;
    setDrawingMode(mode);
    if (locateHandlerRef.current) { map.off("click", locateHandlerRef.current); locateHandlerRef.current = null; }
    if (locateMarkerRef.current) { locateMarkerRef.current.remove(); locateMarkerRef.current = null; }
    setIsLocating(false);
    setIsRectDrawing(true);
    rectPhaseRef.current = 0;
    setRectPhase(0);
    map.getContainer().style.cursor = "crosshair";

    import("leaflet").then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (e: any) => {
        const { lat, lng } = e.latlng;
        const phase = rectPhaseRef.current;

        if (phase === 0) {
          // P1: first corner
          rectP1Ref.current = [lat, lng];
          rectPhaseRef.current = 1;
          setRectPhase(1);
          const m = L.circleMarker([lat, lng], { radius: 5, color: "#00bcd4", fillColor: "#00bcd4", fillOpacity: 1 }).addTo(map);
          markersRef.current.push(m);

        } else if (phase === 1) {
          // P2: adjacent corner (defines edge direction)
          const p1 = rectP1Ref.current!;
          rectP2Ref.current = [lat, lng];
          rectPhaseRef.current = 2;
          setRectPhase(2);
          const m = L.circleMarker([lat, lng], { radius: 5, color: "#00bcd4", fillColor: "#00bcd4", fillOpacity: 1 }).addTo(map);
          markersRef.current.push(m);

          // Create preview polygon (will be updated on mousemove)
          const preview = L.polygon(
            computeRectCorners(p1, [lat, lng], [lat, lng]),
            { color: "#00bcd4", weight: 1.5, fillOpacity: 0.12, dashArray: "5,5", interactive: false }
          ).addTo(map);
          rectPreviewRef.current = preview;

          // Mousemove: update preview
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mmHandler = (me: any) => {
            const corners = computeRectCorners(rectP1Ref.current!, rectP2Ref.current!, [me.latlng.lat, me.latlng.lng]);
            preview.setLatLngs(corners);
          };
          map.on("mousemove", mmHandler);
          mapMouseMoveHandlerRef.current = mmHandler;

        } else if (phase === 2) {
          // P3: defines width → complete rectangle
          const p1 = rectP1Ref.current!;
          const p2 = rectP2Ref.current!;
          const corners = computeRectCorners(p1, p2, [lat, lng]);

          // Cleanup rect drawing state
          if (mapMouseMoveHandlerRef.current) { map.off("mousemove", mapMouseMoveHandlerRef.current); mapMouseMoveHandlerRef.current = null; }
          if (rectPreviewRef.current) { rectPreviewRef.current.remove(); rectPreviewRef.current = null; }
          if (clickHandlerRef.current) { map.off("click", clickHandlerRef.current); clickHandlerRef.current = null; }
          markersRef.current.forEach(m => m.remove());
          markersRef.current = [];
          map.getContainer().style.cursor = "";
          setIsRectDrawing(false);
          rectPhaseRef.current = 0;
          setRectPhase(0);
          rectP1Ref.current = null;
          rectP2Ref.current = null;

          const capturedMode = drawingModeRef.current;
          const coords = corners.map(([cLat, cLng]) => ({ lat: cLat, lng: cLng }));
          const area = calculateArea(coords);
          const centroid = getCentroid(corners);

          if (capturedMode === 'exclusion') {
            const exIdx = exclusionPolygonsRef.current.length + 1;
            const polygon = L.polygon(corners, { color: "#e53e3e", weight: 2, fillColor: "#e53e3e", fillOpacity: 0.3, dashArray: "6,4" }).addTo(map);
            const labelIcon = L.divIcon({ html: `<div style="background:#e53e3e;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);">제외 ${exIdx}</div>`, className: "", iconAnchor: [20, 10] });
            const labelMarker = L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(map);
            exclusionPolygonsRef.current = [...exclusionPolygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords, angle: 0 }];
            setExclusionCount(exclusionPolygonsRef.current.length);
          } else {
            const colorIndex = polygonsRef.current.length;
            const color = getColor(colorIndex);
            const label = colorIndex + 1;
            const polygon = L.polygon(corners, { color, weight: 2, fillColor: color, fillOpacity: 0.25 }).addTo(map);
            const labelIcon = L.divIcon({ html: `<div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);">영역 ${label}</div>`, className: "", iconAnchor: [20, 10] });
            const labelMarker = L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(map);
            polygonsRef.current = [...polygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords, angle: edgeAngle(p1, p2) }];
            setPolygonCount(polygonsRef.current.length);
          }
          notifyAreas();
        }
      };
      map.on("click", handler);
      clickHandlerRef.current = handler;
    });
  }, [cancelCurrentDrawing, notifyAreas]);

  const goToLocation = useCallback(async (result: SearchResult) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    setSearchResults([]);
    setSearchQuery(result.display_name.split(",")[0]);
    const L = await import("leaflet");
    if (searchMarkerRef.current) { searchMarkerRef.current.remove(); searchMarkerRef.current = null; }
    if (parcelPolygonRef.current) { parcelPolygonRef.current.remove(); parcelPolygonRef.current = null; }
    const icon = L.divIcon({
      html: `<div style="background:#e53e3e;width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 14], className: "",
    });
    const marker = L.marker([lat, lon], { icon }).addTo(map)
      .bindPopup(`<strong>${result.display_name.split(",")[0]}</strong><br/><span style="font-size:11px;color:#666">${result.display_name}</span>`, { maxWidth: 250 })
      .openPopup();
    searchMarkerRef.current = marker;
    map.setView([lat, lon], 17);
    setIsLoadingParcel(true);
    try {
      const res = await fetch(`/api/parcel-boundary?lat=${lat}&lng=${lon}`);
      const data = await res.json();
      if (data?.geometry) {
        const geo = data.geometry;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toLatLngs = (rings: any[][]) => rings.map((ring) => ring.map(([x, y]: [number, number]) => [y, x]));
        const latLngs = geo.type === "MultiPolygon" ? geo.coordinates.map(toLatLngs) : toLatLngs(geo.coordinates);
        const parcelLayer = L.polygon(latLngs, { color: "#f6ad55", weight: 2.5, fillColor: "#f6e05e", fillOpacity: 0.15, dashArray: "6,4" }).addTo(map);
        parcelPolygonRef.current = parcelLayer;
      }
    } catch {} finally {
      setIsLoadingParcel(false);
    }
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setShowRecent(false);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data: SearchResult[] = await res.json();
      if (data.length > 0) {
        await goToLocation(data[0]);
        saveRecentSearch(query.trim());
        if (data.length > 1) setSearchResults(data);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [goToLocation, saveRecentSearch]);

  const handleSearch = useCallback(() => { performSearch(searchQuery); }, [searchQuery, performSearch]);

  const clearDrawing = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    cancelCurrentDrawing();
    polygonsRef.current.forEach((p) => { p.leafletPolygon.remove(); p.labelMarker.remove(); });
    polygonsRef.current = [];
    exclusionPolygonsRef.current.forEach((p) => { p.leafletPolygon.remove(); p.labelMarker.remove(); });
    exclusionPolygonsRef.current = [];
    if (parcelPolygonRef.current) { parcelPolygonRef.current.remove(); parcelPolygonRef.current = null; }
    setPolygonCount(0);
    setExclusionCount(0);
    onAreasChange([]);
    renderModules();
  }, [cancelCurrentDrawing, onAreasChange, renderModules]);

  const removeLastPolygon = useCallback(() => {
    if (polygonsRef.current.length === 0) return;
    const last = polygonsRef.current[polygonsRef.current.length - 1];
    last.leafletPolygon.remove();
    last.labelMarker.remove();
    polygonsRef.current = polygonsRef.current.slice(0, -1);
    setPolygonCount(polygonsRef.current.length);
    notifyAreas();
  }, [notifyAreas]);

  const removeLastExclusion = useCallback(() => {
    if (exclusionPolygonsRef.current.length === 0) return;
    const last = exclusionPolygonsRef.current[exclusionPolygonsRef.current.length - 1];
    last.leafletPolygon.remove();
    last.labelMarker.remove();
    exclusionPolygonsRef.current = exclusionPolygonsRef.current.slice(0, -1);
    setExclusionCount(exclusionPolygonsRef.current.length);
    notifyAreas();
  }, [notifyAreas]);

  const isAnyDrawing = isDrawing || isRectDrawing;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 주소 검색 */}
      <div className="flex gap-2 p-2 bg-gray-50 border-b items-center flex-shrink-0 relative">
        <input
          type="text" value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSearchResults([]); }}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          onFocus={() => setShowRecent(true)}
          onBlur={() => setTimeout(() => setShowRecent(false), 150)}
          placeholder="주소 또는 지명 검색 (예: 전라남도 해남군)"
          className="flex-1 border rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
        />
        <button onClick={handleSearch} disabled={isSearching}
          className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-40">
          {isSearching ? "검색 중..." : "검색"}
        </button>
        {searchResults.length > 1 && (
          <div className="absolute top-full left-2 right-2 bg-white border rounded shadow-lg z-[9999] max-h-48 overflow-y-auto">
            <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-b">다른 결과 선택</div>
            {searchResults.map((r, i) => (
              <button key={i} onClick={() => { goToLocation(r); setSearchResults([]); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0">
                {r.display_name}
              </button>
            ))}
          </div>
        )}
        {showRecent && searchResults.length === 0 && recentSearches.length > 0 && (
          <div className="absolute top-full left-2 right-2 bg-white border rounded shadow-lg z-[9999] max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b">
              <span className="text-xs text-gray-400">최근 검색</span>
              <button onClick={() => { setRecentSearches([]); try { localStorage.removeItem("solar_recent_searches"); } catch {} }}
                className="text-xs text-gray-400 hover:text-red-400">전체 삭제</button>
            </div>
            {recentSearches.map((s, i) => (
              <button key={i} onClick={() => { setSearchQuery(s); performSearch(s); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0 text-gray-700">{s}</button>
            ))}
          </div>
        )}
      </div>

      {/* 그리기 도구 */}
      <div className="flex gap-2 p-2 bg-white border-b items-center flex-shrink-0 flex-wrap">
        {!isAnyDrawing ? (
          <>
            <button onClick={() => startDrawing('inclusion')}
              className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium">
              영역 추가
            </button>
            <button onClick={() => startDrawingRect('inclusion')}
              className="px-3 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 text-sm font-medium">
              직사각형
            </button>
            <button onClick={() => startDrawing('exclusion')}
              className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm font-medium">
              제외 영역
            </button>
            {polygonCount > 0 && (
              <button onClick={removeLastPolygon}
                className="px-3 py-2 bg-orange-400 text-white rounded hover:bg-orange-500 text-sm">
                영역 삭제
              </button>
            )}
            {exclusionCount > 0 && (
              <button onClick={removeLastExclusion}
                className="px-3 py-2 bg-red-300 text-white rounded hover:bg-red-400 text-sm">
                제외 삭제
              </button>
            )}
            <button onClick={clearDrawing}
              className="px-3 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 text-sm">
              전체 초기화
            </button>
            <button onClick={isLocating ? stopLocating : startLocating}
              className={`px-3 py-2 rounded text-sm font-medium ${
                isLocating ? "bg-purple-500 text-white hover:bg-purple-600" : "bg-purple-100 text-purple-700 hover:bg-purple-200"
              }`}>
              {isLocating ? "위치 확인 끄기" : "위치 확인"}
            </button>
            {(polygonCount > 0 || exclusionCount > 0) && (
              <span className="text-xs font-medium ml-auto">
                {polygonCount > 0 && <span className="text-blue-600">영역 {polygonCount}개</span>}
                {polygonCount > 0 && exclusionCount > 0 && <span className="text-gray-400"> / </span>}
                {exclusionCount > 0 && <span className="text-red-500">제외 {exclusionCount}개</span>}
              </span>
            )}
          </>
        ) : isDrawing ? (
          <>
            <button onClick={finishDrawing} disabled={vertexCount < 3}
              className={`px-4 py-2 text-white rounded disabled:opacity-40 text-sm font-medium ${
                drawingMode === 'exclusion' ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
              }`}>
              {drawingMode === 'exclusion' ? '제외 완료' : '완료'} ({vertexCount}점)
            </button>
            <button onClick={cancelCurrentDrawing}
              className="px-3 py-2 bg-yellow-400 text-white rounded hover:bg-yellow-500 text-sm">취소</button>
            <span className={`text-xs ${drawingMode === 'exclusion' ? 'text-red-500' : 'text-gray-500'}`}>
              지도를 클릭해 꼭짓점 추가 → 완료 버튼
            </span>
          </>
        ) : (
          // Rect drawing
          <>
            <button onClick={cancelCurrentDrawing}
              className="px-3 py-2 bg-yellow-400 text-white rounded hover:bg-yellow-500 text-sm">취소</button>
            <span className="text-xs text-teal-600 font-medium">
              {rectPhase === 0 && "① 첫 번째 꼭짓점 클릭"}
              {rectPhase === 1 && "② 인접 꼭짓점 클릭 (방향 설정)"}
              {rectPhase === 2 && "③ 마우스 이동 후 클릭 (너비 설정)"}
            </span>
          </>
        )}
        {isLocating && !isAnyDrawing && (
          <span className="text-xs text-purple-500">지도를 클릭해 주소 확인</span>
        )}
        {isLoadingParcel && (
          <span className="text-xs text-orange-500 ml-auto">지번 경계 조회 중...</span>
        )}
      </div>
      <div ref={mapRef} style={{ flex: 1 }} />
    </div>
  );
}
