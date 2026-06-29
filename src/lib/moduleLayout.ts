export interface ModuleConfig {
  enabled: boolean;
  moduleWidth: number;    // mm
  moduleHeight: number;   // mm
  moduleWattage: number;  // W per panel
  rowSpacing: number;     // mm between rows
  colSpacing: number;     // mm between columns
  angle: number;          // grid rotation degrees (CCW from east)
  maxModulesPerColumn: number; // max vertical modules per block (0 = unlimited)
}

export interface Coord {
  lat: number;
  lng: number;
}

export const DEFAULT_MODULE_CONFIG: ModuleConfig = {
  enabled: false,
  moduleWidth: 1134,
  moduleHeight: 2094,
  moduleWattage: 550,
  rowSpacing: 10,
  colSpacing: 10,
  angle: 0,
  maxModulesPerColumn: 5,
};

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
  exclusionCoordsList: Coord[][] = []
): Coord[][] {
  if (polygonCoords.length < 3) return [];

  const origin: Coord = {
    lat: polygonCoords.reduce((s, c) => s + c.lat, 0) / polygonCoords.length,
    lng: polygonCoords.reduce((s, c) => s + c.lng, 0) / polygonCoords.length,
  };

  // Rotate everything into the grid frame
  const poly = polygonCoords.map((c) => rot(toXY(c, origin), -config.angle));
  const excls = exclusionCoordsList.map((exc) =>
    exc.map((c) => rot(toXY(c, origin), -config.angle))
  );

  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const mW = config.moduleWidth / 1000;
  const mH = config.moduleHeight / 1000;
  const colStep = mW + config.colSpacing / 1000;
  const rowStep = mH + config.rowSpacing / 1000;

  const result: Coord[][] = [];

  // Center the grid so leftover space is split evenly on both sides
  const numCols = Math.floor((maxX - minX + 1e-6) / colStep);
  const numRows = Math.floor((maxY - minY + 1e-6) / rowStep);
  const offsetX = ((maxX - minX) - (numCols * colStep - config.colSpacing / 1000)) / 2;
  const offsetY = ((maxY - minY) - (numRows * rowStep - config.rowSpacing / 1000)) / 2;
  const startX = minX + offsetX;
  const startY = minY + offsetY;

  const maxPerCol = config.maxModulesPerColumn > 0 ? config.maxModulesPerColumn : numRows;

  for (let col = 0; col < numCols; col++) {
    const x = startX + col * colStep;
    let placedInCol = 0;
    for (let row = 0; row < numRows; row++) {
      if (placedInCol >= maxPerCol) break;
      const y = startY + row * rowStep;
      const corners = [
        { x, y }, { x: x + mW, y }, { x: x + mW, y: y + mH }, { x, y: y + mH },
      ];
      const center = { x: x + mW / 2, y: y + mH / 2 };

      if (!corners.every((c) => inPoly2D(c, poly))) continue;
      if (!inPoly2D(center, poly)) continue;
      if (excls.some((e) => corners.some((c) => inPoly2D(c, e)) || inPoly2D(center, e))) continue;

      result.push(corners.map((c) => fromXY(rot(c, config.angle), origin)));
      placedInCol++;

      if (result.length >= MODULE_LAYOUT_LIMIT) return result;
    }
  }

  return result;
}
