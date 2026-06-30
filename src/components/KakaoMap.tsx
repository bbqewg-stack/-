"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { ModuleConfig, ZoneAdjust, calculateModuleLayout, isCoordInPolygon } from "@/lib/moduleLayout";

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
  label: string;
  reason?: string;
}

export interface SavedPolygon {
  type: 'inclusion' | 'exclusion';
  coords: { lat: number; lng: number }[];
  angle: number;
  label: string;
  reason?: string;
}

export interface KakaoMapHandle {
  captureMapImage: () => Promise<string>;
  renameZone: (index: number, label: string) => void;
  setZoneAngle: (index: number, angle: number) => void;
  removeZone: (index: number) => void;
  duplicateZone: (index: number) => void;
  setZoneAdjust: (index: number, adj: ZoneAdjust) => void;
  setExclusionReason: (index: number, reason: string) => void;
  removeExclusionZone: (index: number) => void;
  getSaveData: () => SavedPolygon[];
  loadProject: (polygons: SavedPolygon[]) => void;
}

interface KakaoMapProps {
  onAreasChange: (polygons: { area: number; coords: Coord[]; type: 'inclusion' | 'exclusion'; angle?: number; reason?: string }[]) => void;
  moduleConfig?: ModuleConfig;
  onModuleCountsChange?: (counts: number[]) => void;
  onLocationDetected?: (address: string) => void;
}

const POLYGON_COLORS = ["#0066ff", "#ff6600", "#9900cc", "#00aa66", "#cc0033"];

function getColor(index: number) {
  return POLYGON_COLORS[index % POLYGON_COLORS.length];
}

// 설치불가 구역 사유별 색상 (미지정/직접입력은 기존 제외영역 빨강 유지)
const EXCLUSION_REASON_COLORS: Record<string, string> = {
  "음영 간섭 구간 설치불가": "#f59e0b",
  "지장물 간섭 구간 설치불가": "#9333ea",
  "진입로 확보 구간 설치불가": "#0891b2",
};
const DEFAULT_EXCLUSION_COLOR = "#e53e3e";
export const EXCLUSION_REASON_PRESETS = Object.keys(EXCLUSION_REASON_COLORS);

export function getExclusionColor(reason?: string): string {
  if (reason && EXCLUSION_REASON_COLORS[reason]) return EXCLUSION_REASON_COLORS[reason];
  return DEFAULT_EXCLUSION_COLOR;
}

function exclusionLabelIconHtml(text: string, color: string): string {
  return `<div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);">${text}</div>`;
}

function drawRoundedPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 모듈 좌표 기반 안정적 식별 키 (zoneAdjust/각도 변경 시 그리드가 바뀌면 자연스럽게 무효화됨)
function moduleKey(corners: Coord[]): string {
  const cy = corners.reduce((s, c) => s + c.lat, 0) / corners.length;
  const cx = corners.reduce((s, c) => s + c.lng, 0) / corners.length;
  return `${cy.toFixed(8)}_${cx.toFixed(8)}`;
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

// Detect facing azimuth from polygon edges (CW from North, 0-360°)
// Facing azimuth = direction modules face = row_direction + 90°
// For E-W rows (longest edge pointing East), facing azimuth = 180° (South-facing)
function detectPolygonAngle(coords: Coord[]): number {
  if (coords.length < 2) return 180;
  const avgLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const cosLat = Math.cos(avgLat * Math.PI / 180);
  let bestLen = 0, bestMathAngle = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const dx = (coords[j].lng - coords[i].lng) * cosLat;
    const dy = coords[j].lat - coords[i].lat;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > bestLen) {
      bestLen = len;
      bestMathAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    }
  }
  // Convert math angle (CCW from East) to facing azimuth (CW from North)
  // facing = (180 - math_angle + 360) % 360
  const azimuth = ((180 - bestMathAngle) + 360) % 360;
  return Math.round(azimuth * 10) / 10;
}

// Facing azimuth of rectangle edge P1→P2 (CW from North, 0-360°)
function edgeAngle(p1: [number, number], p2: [number, number]): number {
  const cosLat = Math.cos(p1[0] * Math.PI / 180);
  const dx = (p2[1] - p1[1]) * cosLat;
  const dy = p2[0] - p1[0];
  const mathAngle = Math.atan2(dy, dx) * 180 / Math.PI;
  const azimuth = ((180 - mathAngle) + 360) % 360;
  return Math.round(azimuth * 10) / 10;
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

const LeafletMap = forwardRef<KakaoMapHandle, KakaoMapProps>(function LeafletMap({
  onAreasChange,
  moduleConfig,
  onModuleCountsChange = () => {},
  onLocationDetected,
}: KakaoMapProps, ref) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exclusionRendererRef = useRef<any>(null);
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

  // Print area refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const printBoundsLayerRef = useRef<any>(null);
  const printBoundsRef = useRef<[[number, number], [number, number]] | null>(null);
  const [isPrintAreaMode, setIsPrintAreaMode] = useState(false);
  const [printAreaPhase, setPrintAreaPhase] = useState(0); // 0=idle, 1=P1 set
  const [printAreaSet, setPrintAreaSet] = useState(false);
  const printP1Ref = useRef<[number, number] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const printClickHandlerRef = useRef<any>(null);

  // 설치불가(제외) 구역 2클릭 직사각형 (반대편 모서리 2점, 회전 없음)
  const [isExclusionRectMode, setIsExclusionRectMode] = useState(false);
  const [exclusionRectPhase, setExclusionRectPhase] = useState(0); // 0=idle, 1=P1 set
  const exclusionRectP1Ref = useRef<[number, number] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exclusionRectPreviewRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exclusionRectClickHandlerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exclusionRectMouseMoveHandlerRef = useRef<any>(null);

  // Module layout refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleLayersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRendererRef = useRef<any>(null);
  const moduleConfigRef = useRef<ModuleConfig | undefined>(moduleConfig);
  const onModuleCountsChangeRef = useRef(onModuleCountsChange);
  const renderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoneCapacitiesRef = useRef<number[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifyAreasRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderModulesRef = useRef<any>(null);
  const zoneAdjustsRef = useRef<ZoneAdjust[]>([]);
  const deletedModuleKeysRef = useRef<Set<string>[]>([]);
  const onLocationDetectedRef = useRef(onLocationDetected);
  const [isDragMode, setIsDragMode] = useState(false);
  const isDragModeRef = useRef(false);

  useEffect(() => { onModuleCountsChangeRef.current = onModuleCountsChange; }, [onModuleCountsChange]);
  useEffect(() => { onLocationDetectedRef.current = onLocationDetected; }, [onLocationDetected]);

  const renderModules = useCallback(() => {
    const config = moduleConfigRef.current;
    const map = mapInstanceRef.current;
    const L = leafletRef.current;

    moduleLayersRef.current.forEach((l) => l.remove());
    moduleLayersRef.current = [];

    // Recreate canvas renderer each time to prevent stale canvas artifacts
    if (moduleRendererRef.current) {
      try { moduleRendererRef.current.remove(); } catch { /* ok */ }
      moduleRendererRef.current = null;
    }

    if (!config?.enabled || !map || !L) {
      onModuleCountsChangeRef.current([]);
      // 모듈 숨김 시 구역 테두리/음영 + 라벨 복원
      polygonsRef.current.forEach((p, i) => {
        const color = getColor(i);
        p.leafletPolygon.setStyle({ fillOpacity: 0.25, opacity: 1, color });
        if (L) {
          const sl = p.label.replace("구역", "").trim();
          p.labelMarker.setIcon(L.divIcon({
            html: `<div style="color:${color};font-size:18px;font-weight:900;line-height:1;text-shadow:-1px -1px 0 rgba(0,0,0,0.8),1px -1px 0 rgba(0,0,0,0.8),-1px 1px 0 rgba(0,0,0,0.8),1px 1px 0 rgba(0,0,0,0.8);">${sl}</div>`,
            className: "", iconAnchor: [0, 0],
          }));
          const nwLat = Math.max(...p.coords.map(c => c.lat));
          const nwLng = Math.min(...p.coords.map(c => c.lng));
          p.labelMarker.setLatLng([nwLat, nwLng]);
        }
      });
      return;
    }

    // Canvas renderer so html2canvas can capture module polygons directly (SVG cannot be captured)
    moduleRendererRef.current = L.canvas();

    const allExclusionCoords = exclusionPolygonsRef.current.map((p) => p.coords);
    const counts: number[] = [];

    polygonsRef.current.forEach((polygonData, zoneIndex) => {
      const zoneColor = getColor(zoneIndex);

      const relevantExcls = allExclusionCoords.filter((exc) => {
        const excCentroid: Coord = {
          lat: exc.reduce((s, c) => s + c.lat, 0) / exc.length,
          lng: exc.reduce((s, c) => s + c.lng, 0) / exc.length,
        };
        return isCoordInPolygon(excCentroid, polygonData.coords);
      });

      const allModules = calculateModuleLayout(polygonData.coords, { ...config, angle: polygonData.angle }, relevantExcls, zoneAdjustsRef.current[zoneIndex]);
      const deletedKeys = deletedModuleKeysRef.current[zoneIndex];
      const modules = deletedKeys ? allModules.filter((corners) => !deletedKeys.has(moduleKey(corners))) : allModules;
      counts.push(modules.length);

      // 구역별 색상으로 모듈 렌더링, 동시에 모듈 NW 코너 추적
      let modNwLat = -Infinity;
      let modNwLng = Infinity;

      modules.forEach((corners) => {
        const latLngs = corners.map((c) => [c.lat, c.lng] as [number, number]);
        const poly = L.polygon(latLngs, {
          color: "#7f1d1d",
          weight: 0.8,
          fillColor: "#ef4444",
          fillOpacity: 0.72,
          renderer: moduleRendererRef.current,
        }).addTo(map);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        poly.on("click", (e: any) => {
          L.DomEvent.stop(e);
          if (!deletedModuleKeysRef.current[zoneIndex]) deletedModuleKeysRef.current[zoneIndex] = new Set();
          deletedModuleKeysRef.current[zoneIndex].add(moduleKey(corners));
          renderModules();
        });
        moduleLayersRef.current.push(poly);

        corners.forEach(c => {
          if (c.lat > modNwLat) modNwLat = c.lat;
          if (c.lng < modNwLng) modNwLng = c.lng;
        });
      });

      // 라벨을 모듈 배치 좌상단으로 이동 + 용량 표기
      if (modules.length > 0 && isFinite(modNwLat)) {
        const shortLabel = polygonData.label.replace("구역", "").trim();
        const capacityKw = (modules.length * config.moduleWattage) / 1000;
        zoneCapacitiesRef.current[zoneIndex] = capacityKw;
        const capacityText = capacityKw >= 1000
          ? (capacityKw / 1000).toFixed(2) + "MW"
          : capacityKw.toFixed(2) + "kW";
        const ts = "-1px -1px 0 rgba(0,0,0,0.8),1px -1px 0 rgba(0,0,0,0.8),-1px 1px 0 rgba(0,0,0,0.8),1px 1px 0 rgba(0,0,0,0.8)";
        polygonData.labelMarker.setIcon(L.divIcon({
          html: `<div style="pointer-events:none;line-height:1.15;"><div style="color:${zoneColor};font-size:18px;font-weight:900;text-shadow:${ts};">${shortLabel}</div><div style="color:${zoneColor};font-size:10px;font-weight:800;text-shadow:${ts};">${capacityText}</div></div>`,
          className: "", iconAnchor: [0, 0],
        }));
        polygonData.labelMarker.setLatLng([modNwLat, modNwLng]);
      }
    });

    onModuleCountsChangeRef.current(counts);

    // 모듈이 배치되면 구역 테두리/음영 숨김
    const totalModules = counts.reduce((s, n) => s + n, 0);
    polygonsRef.current.forEach((p, i) => {
      if (totalModules > 0) {
        p.leafletPolygon.setStyle({ fillOpacity: 0, opacity: 0 });
        // 구역 폴리곤(SVG)이 투명해도 클릭은 그대로 가로채 모듈(canvas) 클릭 삭제를 막으므로,
        // 구역 이동 모드가 아닐 때는 포인터 이벤트를 꺼서 클릭이 아래 모듈 캔버스로 통과하게 함
        const el = p.leafletPolygon.getElement?.();
        if (el) el.style.pointerEvents = isDragModeRef.current ? "" : "none";
      } else {
        const color = getColor(i);
        p.leafletPolygon.setStyle({ fillOpacity: 0.25, opacity: 1, color });
        const el = p.leafletPolygon.getElement?.();
        if (el) el.style.pointerEvents = "";
        // 모듈 없으면 라벨 위치를 폴리곤 NW 코너로 복원
        const nwLat = Math.max(...p.coords.map(c => c.lat));
        const nwLng = Math.min(...p.coords.map(c => c.lng));
        p.labelMarker.setLatLng([nwLat, nwLng]);
      }
    });
  }, []);

  const scheduleRenderModules = useCallback(() => {
    if (renderDebounceRef.current) clearTimeout(renderDebounceRef.current);
    renderDebounceRef.current = setTimeout(renderModules, 150);
  }, [renderModules]);

  // Attach drag-to-move behavior to an inclusion polygon
  const addDragBehavior = useCallback((polygon: any) => {
    polygon.on('mousedown', function(e: any) {
      if (!isDragModeRef.current) return;
      const map = mapInstanceRef.current;
      const L = leafletRef.current;
      if (!map || !L) return;
      const zoneIndex = polygonsRef.current.findIndex(p => p.leafletPolygon === polygon);
      if (zoneIndex === -1) return;
      L.DomEvent.stopPropagation(e);
      const startLat = e.latlng.lat, startLng = e.latlng.lng;
      const startCoords = polygonsRef.current[zoneIndex].coords.map((c: Coord) => ({ ...c }));
      map.getContainer().style.cursor = 'grabbing';

      const mmHandler = (me: any) => {
        const polyData = polygonsRef.current[zoneIndex];
        if (!polyData) return;
        const dlat = me.latlng.lat - startLat;
        const dlng = me.latlng.lng - startLng;
        const newCoords = startCoords.map((c: Coord) => ({ lat: c.lat + dlat, lng: c.lng + dlng }));
        polyData.coords = newCoords;
        polygon.setLatLngs(newCoords.map((c: Coord) => [c.lat, c.lng]));
        const nwLat = Math.max(...newCoords.map((c: Coord) => c.lat));
        const nwLng = Math.min(...newCoords.map((c: Coord) => c.lng));
        polyData.labelMarker.setLatLng([nwLat, nwLng]);
      };

      const muHandler = () => {
        map.off('mousemove', mmHandler);
        map.off('mouseup', muHandler);
        map.getContainer().style.cursor = isDragModeRef.current ? 'default' : '';
        const polyData = polygonsRef.current[zoneIndex];
        if (polyData) {
          polyData.area = calculateArea(polyData.coords);
          notifyAreasRef.current?.();
        }
      };

      map.on('mousemove', mmHandler);
      map.on('mouseup', muHandler);
    });
  }, []);

  // 설치불가(제외) 구역 1개 생성: 그리기 완료 / 사각형 완료 / 프로젝트 불러오기에서 공용으로 사용
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addExclusionZone = useCallback((L: any, map: any, coords: Coord[], reason: string = "") => {
    const exIdx = exclusionPolygonsRef.current.length + 1;
    const latLngs = coords.map((c) => [c.lat, c.lng] as [number, number]);
    const area = calculateArea(coords);
    const centroid = getCentroid(latLngs);
    const color = getExclusionColor(reason);
    const labelText = reason || `제외 ${exIdx}`;
    const polygon = L.polygon(latLngs, {
      color, weight: 2, fillColor: color, fillOpacity: 0.3, dashArray: "6,4",
      renderer: exclusionRendererRef.current,
    }).addTo(map);
    const labelIcon = L.divIcon({ html: exclusionLabelIconHtml(labelText, color), className: "", iconAnchor: [20, 10] });
    const labelMarker = L.marker(centroid, { icon: labelIcon, interactive: false }).addTo(map);
    exclusionPolygonsRef.current = [...exclusionPolygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords, angle: 0, label: labelText, reason }];
    setExclusionCount(exclusionPolygonsRef.current.length);
  }, []);

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
      // 설치불가(제외) 구역도 canvas renderer로 그려야 PDF 캡처(html2canvas)에 포함됨 (SVG는 캡처 안 됨)
      exclusionRendererRef.current = L.canvas();
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
            `<div style="font-size:10px;color:#aaa;margin-top:4px">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>` +
            `<div style="font-size:10px;color:#805ad5;margin-top:4px;cursor:pointer;font-weight:600;" onclick="window.__useAsLocation && window.__useAsLocation('${(road || addr || "").replace(/'/g, "\\'")}')">📍 설치 위치로 사용</div></div>`
          );
          // Auto-fill location
          onLocationDetectedRef.current?.(road || addr || "");
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

  const startPrintArea = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    cancelCurrentDrawing();
    setIsPrintAreaMode(true);
    printP1Ref.current = null;
    map.getContainer().style.cursor = "crosshair";
    import("leaflet").then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (e: any) => {
        const { lat, lng } = e.latlng;
        if (!printP1Ref.current) {
          printP1Ref.current = [lat, lng];
          setPrintAreaPhase(1);
          const m = L.circleMarker([lat, lng], { radius: 5, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }).addTo(map);
          markersRef.current.push(m);
        } else {
          const p1 = printP1Ref.current;
          const bounds: [[number, number], [number, number]] = [
            [Math.min(p1[0], lat), Math.min(p1[1], lng)],
            [Math.max(p1[0], lat), Math.max(p1[1], lng)],
          ];
          if (printBoundsLayerRef.current) { printBoundsLayerRef.current.remove(); }
          printBoundsLayerRef.current = L.rectangle(bounds, {
            color: "#ef4444", weight: 2, fillColor: "#ef4444", fillOpacity: 0.04, dashArray: "8,4",
          }).addTo(map);
          printBoundsRef.current = bounds;
          map.off("click", handler);
          printClickHandlerRef.current = null;
          markersRef.current.forEach(m => m.remove());
          markersRef.current = [];
          map.getContainer().style.cursor = "";
          setIsPrintAreaMode(false);
          setPrintAreaSet(true);
          setPrintAreaPhase(0);
          printP1Ref.current = null;
        }
      };
      map.on("click", handler);
      printClickHandlerRef.current = handler;
    });
  }, [cancelCurrentDrawing]);

  const clearPrintArea = useCallback(() => {
    const map = mapInstanceRef.current;
    if (printBoundsLayerRef.current) { printBoundsLayerRef.current.remove(); printBoundsLayerRef.current = null; }
    printBoundsRef.current = null;
    setPrintAreaSet(false);
    setPrintAreaPhase(0);
    if (printClickHandlerRef.current && map) { map.off("click", printClickHandlerRef.current); printClickHandlerRef.current = null; }
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (map) map.getContainer().style.cursor = "";
    setIsPrintAreaMode(false);
    printP1Ref.current = null;
  }, []);

  const notifyAreas = useCallback(() => {
    const inclusions = polygonsRef.current.map(p => ({ area: p.area, coords: p.coords, type: 'inclusion' as const, angle: p.angle }));
    const exclusions = exclusionPolygonsRef.current.map(p => ({ area: p.area, coords: p.coords, type: 'exclusion' as const, reason: p.reason ?? '' }));
    onAreasChange([...inclusions, ...exclusions]);
    renderModules();
  }, [onAreasChange, renderModules]);

  useEffect(() => { notifyAreasRef.current = notifyAreas; }, [notifyAreas]);
  useEffect(() => { renderModulesRef.current = renderModules; }, [renderModules]);

  // --- 설치불가(제외) 구역: 반대편 모서리 2클릭으로 회전 없는 직사각형 생성 ---
  const cancelExclusionRect = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map) {
      if (exclusionRectClickHandlerRef.current) { map.off("click", exclusionRectClickHandlerRef.current); exclusionRectClickHandlerRef.current = null; }
      if (exclusionRectMouseMoveHandlerRef.current) { map.off("mousemove", exclusionRectMouseMoveHandlerRef.current); exclusionRectMouseMoveHandlerRef.current = null; }
      map.getContainer().style.cursor = "";
    }
    if (exclusionRectPreviewRef.current) { exclusionRectPreviewRef.current.remove(); exclusionRectPreviewRef.current = null; }
    exclusionRectP1Ref.current = null;
    setExclusionRectPhase(0);
    setIsExclusionRectMode(false);
  }, []);

  const startExclusionRect = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    cancelCurrentDrawing();
    if (locateHandlerRef.current) { map.off("click", locateHandlerRef.current); locateHandlerRef.current = null; }
    if (locateMarkerRef.current) { locateMarkerRef.current.remove(); locateMarkerRef.current = null; }
    setIsLocating(false);
    setIsExclusionRectMode(true);
    exclusionRectP1Ref.current = null;
    setExclusionRectPhase(0);
    map.getContainer().style.cursor = "crosshair";
    import("leaflet").then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (e: any) => {
        const { lat, lng } = e.latlng;
        if (!exclusionRectP1Ref.current) {
          exclusionRectP1Ref.current = [lat, lng];
          setExclusionRectPhase(1);
          const preview = L.rectangle([[lat, lng], [lat, lng]], {
            color: "#e53e3e", weight: 2, fillColor: "#e53e3e", fillOpacity: 0.15, dashArray: "6,4", interactive: false,
          }).addTo(map);
          exclusionRectPreviewRef.current = preview;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mmHandler = (me: any) => {
            const p1 = exclusionRectP1Ref.current!;
            const bounds: [[number, number], [number, number]] = [
              [Math.min(p1[0], me.latlng.lat), Math.min(p1[1], me.latlng.lng)],
              [Math.max(p1[0], me.latlng.lat), Math.max(p1[1], me.latlng.lng)],
            ];
            preview.setBounds(bounds);
          };
          map.on("mousemove", mmHandler);
          exclusionRectMouseMoveHandlerRef.current = mmHandler;
        } else {
          const p1 = exclusionRectP1Ref.current;
          const bounds: [[number, number], [number, number]] = [
            [Math.min(p1[0], lat), Math.min(p1[1], lng)],
            [Math.max(p1[0], lat), Math.max(p1[1], lng)],
          ];

          if (exclusionRectMouseMoveHandlerRef.current) { map.off("mousemove", exclusionRectMouseMoveHandlerRef.current); exclusionRectMouseMoveHandlerRef.current = null; }
          if (exclusionRectPreviewRef.current) { exclusionRectPreviewRef.current.remove(); exclusionRectPreviewRef.current = null; }
          map.off("click", handler);
          exclusionRectClickHandlerRef.current = null;
          map.getContainer().style.cursor = "";
          setIsExclusionRectMode(false);
          setExclusionRectPhase(0);
          exclusionRectP1Ref.current = null;

          const [[south, west], [north, east]] = bounds;
          const coords: Coord[] = [
            { lat: north, lng: west },
            { lat: north, lng: east },
            { lat: south, lng: east },
            { lat: south, lng: west },
          ];
          addExclusionZone(L, map, coords);
          notifyAreas();
        }
      };
      map.on("click", handler);
      exclusionRectClickHandlerRef.current = handler;
    });
  }, [cancelCurrentDrawing, addExclusionZone, notifyAreas]);

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
      if (mode === 'exclusion') {
        addExclusionZone(L, map, coords);
      } else {
        const colorIndex = polygonsRef.current.length;
        const color = getColor(colorIndex);
        const label = String.fromCharCode(65 + colorIndex) + "구역";
        const shortLabel = String.fromCharCode(65 + colorIndex);
        const nwCorner: [number, number] = [
          Math.max(...capturedVertices.map(v => v[0])),
          Math.min(...capturedVertices.map(v => v[1])),
        ];
        const polygon = L.polygon(capturedVertices, { color, weight: 2, fillColor: color, fillOpacity: 0.25 }).addTo(map);
        const labelIcon = L.divIcon({
          html: `<div style="color:${color};font-size:18px;font-weight:900;line-height:1;text-shadow:-1px -1px 0 rgba(0,0,0,0.7),1px -1px 0 rgba(0,0,0,0.7),-1px 1px 0 rgba(0,0,0,0.7),1px 1px 0 rgba(0,0,0,0.7);">${shortLabel}</div>`,
          className: "",
          iconSize: [22, 22],
          iconAnchor: [0, 0],
        });
        const labelMarker = L.marker(nwCorner, { icon: labelIcon, interactive: false }).addTo(map);
        polygonsRef.current = [...polygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords, angle: detectPolygonAngle(coords), label }];
        addDragBehavior(polygon);
        setPolygonCount(polygonsRef.current.length);
      }
      notifyAreas();
    });
  }, [notifyAreas, addDragBehavior, addExclusionZone]);

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

          if (capturedMode === 'exclusion') {
            addExclusionZone(L, map, coords);
          } else {
            const colorIndex = polygonsRef.current.length;
            const color = getColor(colorIndex);
            const label = String.fromCharCode(65 + colorIndex) + "구역";
            const shortLabel = String.fromCharCode(65 + colorIndex);
            const nwCorner: [number, number] = [
              Math.max(...corners.map(v => v[0])),
              Math.min(...corners.map(v => v[1])),
            ];
            const polygon = L.polygon(corners, { color, weight: 2, fillColor: color, fillOpacity: 0.25 }).addTo(map);
            const labelIcon = L.divIcon({
              html: `<div style="color:${color};font-size:18px;font-weight:900;line-height:1;text-shadow:-1px -1px 0 rgba(0,0,0,0.7),1px -1px 0 rgba(0,0,0,0.7),-1px 1px 0 rgba(0,0,0,0.7),1px 1px 0 rgba(0,0,0,0.7);">${shortLabel}</div>`,
              className: "",
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
            const labelMarker = L.marker(nwCorner, { icon: labelIcon, interactive: false }).addTo(map);
            polygonsRef.current = [...polygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords, angle: edgeAngle(p1, p2), label }];
            addDragBehavior(polygon);
            setPolygonCount(polygonsRef.current.length);
          }
          notifyAreas();
        }
      };
      map.on("click", handler);
      clickHandlerRef.current = handler;
    });
  }, [cancelCurrentDrawing, notifyAreas, addDragBehavior, addExclusionZone]);

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
    marker.on('popupclose', () => {
      if (parcelPolygonRef.current) { parcelPolygonRef.current.remove(); parcelPolygonRef.current = null; }
      if (searchMarkerRef.current) { searchMarkerRef.current.remove(); searchMarkerRef.current = null; }
    });
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

  const stopDragMode = useCallback(() => {
    setIsDragMode(false);
    isDragModeRef.current = false;
    const map = mapInstanceRef.current;
    if (map) {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
    }
    // 모듈이 있으면 구역 폴리곤 포인터 이벤트를 다시 꺼서 모듈 클릭 삭제가 동작하게 함
    renderModulesRef.current?.();
  }, []);

  const startDragMode = useCallback(() => {
    cancelCurrentDrawing();
    stopLocating();
    setIsDragMode(true);
    isDragModeRef.current = true;
    const map = mapInstanceRef.current;
    if (map) {
      map.dragging.disable();
      map.getContainer().style.cursor = 'default';
    }
    // 모듈에 가려진 구역도 드래그할 수 있도록 즉시 포인터 이벤트 복원
    polygonsRef.current.forEach((p) => {
      const el = p.leafletPolygon.getElement?.();
      if (el) el.style.pointerEvents = "";
    });
  }, [cancelCurrentDrawing, stopLocating]);

  const isAnyDrawing = isDrawing || isRectDrawing || isExclusionRectMode;

  useImperativeHandle(ref, () => ({
    captureMapImage: async (): Promise<string> => {
      const html2canvas = (await import("html2canvas")).default;
      const map = mapInstanceRef.current;
      const mapEl = mapRef.current;
      if (!mapEl || !map) return "";

      // Hide inclusion/exclusion polygon fills/borders only.
      // Module layers use L.canvas() renderer and are captured directly by html2canvas.
      polygonsRef.current.forEach(p => {
        p.leafletPolygon.setStyle({ fillOpacity: 0, opacity: 0 });
        p.labelMarker.setOpacity(0);
      });
      // 사유가 지정된 설치불가 구역은 도면에 표시(색상 유지), 사유 없는 구역은 기존처럼 숨김
      exclusionPolygonsRef.current.forEach(p => {
        if (p.reason) {
          const color = getExclusionColor(p.reason);
          p.leafletPolygon.setStyle({ fillOpacity: 0.3, opacity: 1, color, fillColor: color });
        } else {
          p.leafletPolygon.setStyle({ fillOpacity: 0, opacity: 0 });
        }
        p.labelMarker.setOpacity(0); // DOM 라벨은 항상 숨기고, 사유 텍스트는 캡처 후 canvas에 직접 그림
      });
      if (printBoundsLayerRef.current) printBoundsLayerRef.current.setStyle({ opacity: 0, fillOpacity: 0 });

      // Hide Leaflet UI controls (+/- zoom, attribution) before capture
      const controlEls = mapEl.querySelectorAll<HTMLElement>('.leaflet-control-container');
      controlEls.forEach(el => { el.style.visibility = 'hidden'; });

      await new Promise(r => setTimeout(r, 200));

      const SCALE = 3;
      const canvas = await html2canvas(mapEl, {
        useCORS: true,
        allowTaint: true,
        scale: SCALE,
        logging: false,
        backgroundColor: "#f0f0f0",
      });

      // 사유가 있는 설치불가 구역의 라벨 텍스트를 캡처된 canvas에 직접 드로잉
      // (html2canvas의 DOM 텍스트 렌더링 버그를 피하기 위해 canvas fillText로 직접 그림 — generatePdf.ts와 동일한 방식)
      const ctx2 = canvas.getContext("2d");
      if (ctx2) {
        // html2canvas는 내부 렌더링 과정(클리핑/마스킹)에서 globalCompositeOperation/transform/alpha를
        // 기본값이 아닌 상태로 남겨둘 수 있어, 캡처 직후 같은 canvas에 직접 그릴 때는 명시적으로 리셋해야 함
        ctx2.setTransform(1, 0, 0, 1, 0, 0);
        ctx2.globalCompositeOperation = "source-over";
        ctx2.globalAlpha = 1;
      }
      if (ctx2) {
        exclusionPolygonsRef.current.forEach(p => {
          if (!p.reason) return;
          const cLat = p.coords.reduce((s, c) => s + c.lat, 0) / p.coords.length;
          const cLng = p.coords.reduce((s, c) => s + c.lng, 0) / p.coords.length;
          const pt = map.latLngToContainerPoint([cLat, cLng]);
          const x = pt.x * SCALE;
          const y = pt.y * SCALE;
          const color = getExclusionColor(p.reason);
          const fontSize = 13 * SCALE;
          ctx2.font = `700 ${fontSize}px 'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif`;
          ctx2.textAlign = "center";
          ctx2.textBaseline = "middle";
          const textWidth = ctx2.measureText(p.reason).width;
          const padX = 10 * SCALE, padY = 6 * SCALE;
          const bw = textWidth + padX * 2, bh = fontSize + padY * 2;
          ctx2.fillStyle = color;
          drawRoundedPill(ctx2, x - bw / 2, y - bh / 2, bw, bh, bh / 2);
          ctx2.fill();
          ctx2.fillStyle = "#fff";
          ctx2.fillText(p.reason, x, y + fontSize * 0.06);
        });
      }

      // Restore styles (modules present → keep zones hidden, else restore)
      const hasModules = moduleLayersRef.current.length > 0;
      polygonsRef.current.forEach((p, i) => {
        if (hasModules) {
          p.leafletPolygon.setStyle({ fillOpacity: 0, opacity: 0 });
        } else {
          const color = getColor(i);
          p.leafletPolygon.setStyle({ fillOpacity: 0.25, opacity: 1, color });
        }
        p.labelMarker.setOpacity(1);
      });
      exclusionPolygonsRef.current.forEach(p => {
        const color = getExclusionColor(p.reason);
        p.leafletPolygon.setStyle({ fillOpacity: 0.3, opacity: 1, color, fillColor: color });
        p.labelMarker.setOpacity(1);
      });
      if (printBoundsLayerRef.current) printBoundsLayerRef.current.setStyle({ opacity: 1, fillOpacity: 0.04 });

      // Restore Leaflet UI controls
      controlEls.forEach(el => { el.style.visibility = ''; });

      // Crop canvas to print area bounds if set
      if (printBoundsRef.current) {
        const [[south, west], [north, east]] = printBoundsRef.current;
        const nw = map.latLngToContainerPoint([north, west]);
        const se = map.latLngToContainerPoint([south, east]);
        const cx = Math.max(0, Math.round(nw.x * SCALE));
        const cy = Math.max(0, Math.round(nw.y * SCALE));
        const seX = Math.min(canvas.width, Math.round(se.x * SCALE));
        const seY = Math.min(canvas.height, Math.round(se.y * SCALE));
        const cw = seX - cx;
        const ch = seY - cy;
        if (cw > 20 && ch > 20) {
          const cropped = document.createElement("canvas");
          cropped.width = cw;
          cropped.height = ch;
          cropped.getContext("2d")!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
          return cropped.toDataURL("image/png");
        }
      }

      return canvas.toDataURL("image/png");
    },
    renameZone: (index: number, label: string) => {
      const polyData = polygonsRef.current[index];
      if (!polyData) return;
      polyData.label = label;
      const L = leafletRef.current;
      if (!L) return;
      const color = getColor(index);
      const shortLabel = label.replace("구역", "").trim();
      const ts = "-1px -1px 0 rgba(0,0,0,0.8),1px -1px 0 rgba(0,0,0,0.8),-1px 1px 0 rgba(0,0,0,0.8),1px 1px 0 rgba(0,0,0,0.8)";
      const capacityKw = zoneCapacitiesRef.current[index];
      if (capacityKw !== undefined && capacityKw > 0) {
        const capacityText = capacityKw >= 1000
          ? (capacityKw / 1000).toFixed(2) + "MW"
          : capacityKw.toFixed(2) + "kW";
        polyData.labelMarker.setIcon(L.divIcon({
          html: `<div style="pointer-events:none;line-height:1.15;"><div style="color:${color};font-size:18px;font-weight:900;text-shadow:${ts};">${shortLabel}</div><div style="color:${color};font-size:10px;font-weight:800;text-shadow:${ts};">${capacityText}</div></div>`,
          className: "", iconAnchor: [0, 0],
        }));
      } else {
        polyData.labelMarker.setIcon(L.divIcon({
          html: `<div style="color:${color};font-size:18px;font-weight:900;line-height:1;text-shadow:${ts};">${shortLabel}</div>`,
          className: "", iconAnchor: [0, 0],
        }));
      }
    },
    setZoneAngle: (index: number, angle: number) => {
      const poly = polygonsRef.current[index];
      if (!poly) return;
      poly.angle = angle;
      notifyAreasRef.current?.();
    },
    removeZone: (index: number) => {
      const poly = polygonsRef.current[index];
      if (!poly) return;
      poly.leafletPolygon.remove();
      poly.labelMarker.remove();
      polygonsRef.current = polygonsRef.current.filter((_, i) => i !== index);
      zoneCapacitiesRef.current = zoneCapacitiesRef.current.filter((_, i) => i !== index);
      zoneAdjustsRef.current = zoneAdjustsRef.current.filter((_, i) => i !== index);
      deletedModuleKeysRef.current = deletedModuleKeysRef.current.filter((_, i) => i !== index);
      setPolygonCount(polygonsRef.current.length);
      notifyAreasRef.current?.();
    },
    duplicateZone: (index: number) => {
      const map = mapInstanceRef.current;
      const L = leafletRef.current;
      const src = polygonsRef.current[index];
      if (!map || !L || !src) return;

      // 화면 픽셀 기준으로 우측 하단에 살짝 띄워서 배치 (줌 레벨에 관계없이 항상 일정한 간격으로 보이도록,
      // 원본과 겹치지 않게). 사용자가 이후 "구역 이동" 드래그로 원하는 위치에 옮기는 것을 전제로 함.
      const OFFSET_PX = 50;
      const offsetCoords = src.coords.map((c: Coord) => {
        const pt = map.latLngToContainerPoint([c.lat, c.lng]);
        const latlng = map.containerPointToLatLng(L.point(pt.x + OFFSET_PX, pt.y + OFFSET_PX));
        return { lat: latlng.lat, lng: latlng.lng };
      });

      const latLngs = offsetCoords.map((c: Coord) => [c.lat, c.lng] as [number, number]);
      const area = calculateArea(offsetCoords);
      const colorIndex = polygonsRef.current.length;
      const color = getColor(colorIndex);
      const label = String.fromCharCode(65 + colorIndex) + "구역";
      const shortLabel = String.fromCharCode(65 + colorIndex);
      const nwCorner: [number, number] = [
        Math.max(...latLngs.map(v => v[0])),
        Math.min(...latLngs.map(v => v[1])),
      ];
      const polygon = L.polygon(latLngs, { color, weight: 2, fillColor: color, fillOpacity: 0.25 }).addTo(map);
      const labelIcon = L.divIcon({
        html: `<div style="color:${color};font-size:18px;font-weight:900;line-height:1;text-shadow:-1px -1px 0 rgba(0,0,0,0.7),1px -1px 0 rgba(0,0,0,0.7),-1px 1px 0 rgba(0,0,0,0.7),1px 1px 0 rgba(0,0,0,0.7);">${shortLabel}</div>`,
        className: "",
        iconSize: [22, 22],
        iconAnchor: [0, 0],
      });
      const labelMarker = L.marker(nwCorner, { icon: labelIcon, interactive: false }).addTo(map);
      polygonsRef.current = [...polygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords: offsetCoords, angle: src.angle, label }];
      addDragBehavior(polygon);
      setPolygonCount(polygonsRef.current.length);
      notifyAreasRef.current?.();
    },
    setZoneAdjust: (index: number, adj: ZoneAdjust) => {
      zoneAdjustsRef.current[index] = adj;
      if (renderDebounceRef.current) clearTimeout(renderDebounceRef.current);
      renderDebounceRef.current = setTimeout(() => renderModulesRef.current?.(), 80);
    },
    setExclusionReason: (index: number, reason: string) => {
      const exData = exclusionPolygonsRef.current[index];
      const L = leafletRef.current;
      if (!exData || !L) return;
      const color = getExclusionColor(reason);
      const labelText = reason || `제외 ${index + 1}`;
      exData.reason = reason;
      exData.label = labelText;
      exData.leafletPolygon.setStyle({ color, fillColor: color });
      exData.labelMarker.setIcon(L.divIcon({ html: exclusionLabelIconHtml(labelText, color), className: "", iconAnchor: [20, 10] }));
    },
    removeExclusionZone: (index: number) => {
      const exData = exclusionPolygonsRef.current[index];
      if (!exData) return;
      exData.leafletPolygon.remove();
      exData.labelMarker.remove();
      exclusionPolygonsRef.current = exclusionPolygonsRef.current.filter((_, i) => i !== index);
      setExclusionCount(exclusionPolygonsRef.current.length);
      notifyAreasRef.current?.();
    },
    getSaveData: (): SavedPolygon[] => {
      const inclusions: SavedPolygon[] = polygonsRef.current.map(p => ({
        type: 'inclusion' as const,
        coords: p.coords,
        angle: p.angle,
        label: p.label,
      }));
      const exclusions: SavedPolygon[] = exclusionPolygonsRef.current.map(p => ({
        type: 'exclusion' as const,
        coords: p.coords,
        angle: 0,
        label: p.label,
        reason: p.reason ?? '',
      }));
      return [...inclusions, ...exclusions];
    },
    loadProject: (savedPolygons: SavedPolygon[]) => {
      const map = mapInstanceRef.current;
      const L = leafletRef.current;
      if (!map || !L) return;

      // Clear existing polygons
      polygonsRef.current.forEach(p => { p.leafletPolygon.remove(); p.labelMarker.remove(); });
      polygonsRef.current = [];
      exclusionPolygonsRef.current.forEach(p => { p.leafletPolygon.remove(); p.labelMarker.remove(); });
      exclusionPolygonsRef.current = [];
      zoneAdjustsRef.current = [];
      zoneCapacitiesRef.current = [];
      deletedModuleKeysRef.current = [];
      setPolygonCount(0);
      setExclusionCount(0);

      savedPolygons.forEach(saved => {
        const latLngs = saved.coords.map(c => [c.lat, c.lng] as [number, number]);
        const area = calculateArea(saved.coords);

        if (saved.type === 'exclusion') {
          addExclusionZone(L, map, saved.coords, saved.reason ?? '');
        } else {
          const colorIndex = polygonsRef.current.length;
          const color = getColor(colorIndex);
          const shortLabel = saved.label.replace("구역", "").trim();
          const nwCorner: [number, number] = [
            Math.max(...latLngs.map(v => v[0])),
            Math.min(...latLngs.map(v => v[1])),
          ];
          const polygon = L.polygon(latLngs, { color, weight: 2, fillColor: color, fillOpacity: 0.25 }).addTo(map);
          const ts = "-1px -1px 0 rgba(0,0,0,0.8),1px -1px 0 rgba(0,0,0,0.8),-1px 1px 0 rgba(0,0,0,0.8),1px 1px 0 rgba(0,0,0,0.8)";
          const labelIcon = L.divIcon({
            html: `<div style="color:${color};font-size:18px;font-weight:900;line-height:1;text-shadow:${ts};">${shortLabel}</div>`,
            className: "", iconAnchor: [0, 0],
          });
          const labelMarker = L.marker(nwCorner, { icon: labelIcon, interactive: false }).addTo(map);
          polygonsRef.current = [...polygonsRef.current, { leafletPolygon: polygon, labelMarker, area, coords: saved.coords, angle: saved.angle, label: saved.label }];
          addDragBehavior(polygon);
          setPolygonCount(polygonsRef.current.length);
        }
      });

      // Fit map to loaded polygons
      if (savedPolygons.length > 0) {
        const allCoords = savedPolygons.flatMap(p => p.coords);
        const lats = allCoords.map(c => c.lat);
        const lngs = allCoords.map(c => c.lng);
        map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [40, 40] });
      }

      notifyAreasRef.current?.();
    },
  }), [addDragBehavior, addExclusionZone]);

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
        {!isAnyDrawing && !isPrintAreaMode && !isDragMode ? (
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
            <button onClick={startExclusionRect}
              className="px-3 py-2 bg-rose-400 text-white rounded hover:bg-rose-500 text-sm font-medium">
              제외 사각형
            </button>
            {polygonCount > 0 && (
              <button onClick={() => startDragMode()}
                className="px-3 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm font-medium">
                구역 이동
              </button>
            )}
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
            {/* 인쇄 범위 */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={startPrintArea}
                className={`px-3 py-2 rounded text-sm font-medium border ${
                  printAreaSet
                    ? "bg-red-50 text-red-600 border-red-300 hover:bg-red-100"
                    : "bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100"
                }`}
              >
                인쇄 범위 설정
              </button>
              {printAreaSet && (
                <button onClick={clearPrintArea}
                  className="px-2 py-2 bg-gray-100 text-gray-500 rounded text-xs hover:bg-gray-200 border border-gray-300">
                  초기화
                </button>
              )}
            </div>
            {(polygonCount > 0 || exclusionCount > 0) && (
              <span className="text-xs font-medium">
                {polygonCount > 0 && <span className="text-blue-600">구역 {polygonCount}개</span>}
                {polygonCount > 0 && exclusionCount > 0 && <span className="text-gray-400"> / </span>}
                {exclusionCount > 0 && <span className="text-red-500">제외 {exclusionCount}개</span>}
              </span>
            )}
          </>
        ) : isDragMode ? (
          <>
            <button onClick={stopDragMode}
              className="px-3 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm font-medium">
              이동 완료
            </button>
            <span className="text-xs text-amber-600 font-medium">구역을 클릭+드래그하여 이동하세요</span>
          </>
        ) : isPrintAreaMode ? (
          <>
            <button onClick={clearPrintArea}
              className="px-3 py-2 bg-yellow-400 text-white rounded hover:bg-yellow-500 text-sm">취소</button>
            <span className="text-xs text-red-500 font-medium">
              {printAreaPhase === 0 ? "① 인쇄 범위 시작점 클릭" : "② 반대쪽 끝점 클릭"}
            </span>
          </>
        ) : isExclusionRectMode ? (
          <>
            <button onClick={cancelExclusionRect}
              className="px-3 py-2 bg-yellow-400 text-white rounded hover:bg-yellow-500 text-sm">취소</button>
            <span className="text-xs text-rose-500 font-medium">
              {exclusionRectPhase === 0 ? "① 첫 번째 모서리 클릭" : "② 반대쪽 모서리 클릭"}
            </span>
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
});

export default LeafletMap;
