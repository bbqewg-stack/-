export interface ModuleConfig {
  enabled: boolean;
  moduleWidth: number;    // mm
  moduleHeight: number;   // mm
  moduleWattage: number;  // W per panel
  rowSpacing: number;     // mm between rows
  colSpacing: number;     // mm between columns
  angle: number;          // module facing azimuth degrees (CW from North, 0-360)
  maxModulesPerColumn: number; // max vertical modules per block (0 = unlimited)
}

export interface Coord {
  lat: number;
  lng: number;
}

export const DEFAULT_MODULE_CONFIG: ModuleConfig = {
  enabled: false,
  moduleWidth: 1134,
  moduleHeight: 2382,
  moduleWattage: 660,
  rowSpacing: 10,
  colSpacing: 10,
  angle: 180,
  maxModulesPerColumn: 5,
};

export interface ZoneAdjust {
  top: number;    // extra rows at north edge
  bottom: number; // extra rows at south edge
  left: number;   // extra cols at west edge
  right: number;  // extra cols at east edge
}

export function isCoordInPolygon(point: Coord, polygon: Coord[]): boolean {
  const { lat: y, lng: x } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { lat: yi, lng: xi } = polygon[i];
    const { lat: yj, lng: xj } = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function rot(p: { x: number; y: number }, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function toXY(coord: Coord, origin: Coord) {
  const R = 6371000;
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: ((coord.lng - origin.lng) * Math.PI / 180) * R * cosLat,
    y: ((coord.lat - origin.lat) * Math.PI / 180) * R,
  };
}

function fromXY(p: { x: number; y: number }, origin: Coord): Coord {
  const R = 6371000;
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + (p.y / R) * (180 / Math.PI),
    lng: origin.lng + (p.x / (R * cosLat)) * (180 / Math.PI),
  };
}

function inPoly2D(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if ((yi > pt.y) !== (yj > pt.y) &&
        pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export const MODULE_LAYOUT_LIMIT = 10000;

export function calculateModuleLayout(
  polygonCoords: Coord[],
  config: ModuleConfig,
  exclusionCoordsList: Coord[][] = [],
  adjust?: ZoneAdjust
): Coord[][] {
  if (polygonCoords.length < 3) return [];

  const origin: Coord = {
    lat: polygonCoords.reduce((s, c) => s + c.lat, 0) / polygonCoords.length,
    lng: polygonCoords.reduce((s, c) => s + c.lng, 0) / polygonCoords.length,
  };

  // Convert facing azimuth (CW from North) to math rotation angle (CCW from East)
  // azimuth 180° (South) → mathAngle 0° (E-W grid, standard south-facing)
  const mathAngle = 180 - config.angle;

  // Rotate everything into the grid frame
  const poly = polygonCoords.map((c) => rot(toXY(c, origin), -mathAngle));
  const excls = exclusionCoordsList.map((exc) =>
    exc.map((c) => rot(toXY(c, origin), -mathAngle))
  );

  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const mW = config.moduleWidth / 1000;
  const mH = config.moduleHeight / 1000;
  const colStep = mW + config.colSpacing / 1000;
  const rowStep = mH + config.rowSpacing / 1000;

  const result: Coord[][] = [];

  // Base grid dimensions from polygon bounds
  const baseNumCols = Math.floor((maxX - minX + 1e-6) / colStep);
  const baseNumRows = Math.floor((maxY - minY + 1e-6) / rowStep);

  // 4-direction adjustment: extend grid beyond polygon boundary
  const topAdd    = Math.max(0, adjust?.top    ?? 0);
  const bottomAdd = Math.max(0, adjust?.bottom ?? 0);
  const leftAdd   = Math.max(0, adjust?.left   ?? 0);
  const rightAdd  = Math.max(0, adjust?.right  ?? 0);

  const numCols = baseNumCols + leftAdd + rightAdd;
  const numRows = baseNumRows + topAdd + bottomAdd;
  const startX = minX - leftAdd * colStep;
  const startY = minY - bottomAdd * rowStep;

  // Coordinate range covered by the base polygon-fitted grid
  const baseMinX = minX, baseMaxX = minX + baseNumCols * colStep;
  const baseMinY = minY, baseMaxY = minY + baseNumRows * rowStep;

  const maxPerCol = config.maxModulesPerColumn > 0 ? config.maxModulesPerColumn : numRows;

  for (let col = 0; col < numCols; col++) {
    const x = startX + col * colStep;
    let placedInCol = 0; // counts polygon + X-extended cells (subject to maxPerCol)
    for (let row = numRows - 1; row >= 0; row--) {
      const y = startY + row * rowStep;
      const corners = [
        { x, y }, { x: x + mW, y }, { x: x + mW, y: y + mH }, { x, y: y + mH },
      ];
      const center = { x: x + mW / 2, y: y + mH / 2 };

      const isXExtended = x < baseMinX - 1e-6 || x + mW > baseMaxX + 1e-6;
      const isYExtended = y < baseMinY - 1e-6 || y + mH > baseMaxY + 1e-6;

      if (isYExtended) {
        // 상(top)/하(bottom) 확장 행: polygon 체크 생략, maxPerCol 무제한
        // (X 확장 열의 상하 확장 모서리 포함)
        if (excls.some((e) => corners.some((c) => inPoly2D(c, e)) || inPoly2D(center, e))) continue;
      } else if (isXExtended) {
        // 좌(left)/우(right) 확장 열 (polygon Y 범위 내): polygon 체크 생략, maxPerCol 적용
        if (placedInCol >= maxPerCol) continue;
        if (excls.some((e) => corners.some((c) => inPoly2D(c, e)) || inPoly2D(center, e))) continue;
        placedInCol++;
      } else {
        // 일반 polygon 셀: polygon 경계 + maxPerCol 모두 적용
        if (placedInCol >= maxPerCol) continue;
        if (!corners.every((c) => inPoly2D(c, poly))) continue;
        if (!inPoly2D(center, poly)) continue;
        if (excls.some((e) => corners.some((c) => inPoly2D(c, e)) || inPoly2D(center, e))) continue;
        placedInCol++;
      }

      result.push(corners.map((c) => fromXY(rot(c, mathAngle), origin)));
      if (result.length >= MODULE_LAYOUT_LIMIT) return result;
    }
  }

  return result;
}
