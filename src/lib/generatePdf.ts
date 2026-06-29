import jsPDF from "jspdf";

export interface ZoneInfo {
  label: string;    // e.g. "A구역"
  color: string;
  moduleCount: number;
  capacityKw: number;
  angle: number;
}

export interface PdfReportData {
  mapImageDataUrl: string;   // html2canvas output
  zones: ZoneInfo[];
  totalModules: number;
  totalCapacityKw: number;
  moduleWidth: number;       // mm
  moduleHeight: number;      // mm
  moduleWattage: number;     // W
  rowSpacing: number;        // mm
  colSpacing: number;        // mm
  location: string;          // 위치 (주소)
  projectName: string;
}

// A3 landscape: 420 × 297 mm
const PAGE_W = 420;
const PAGE_H = 297;

// Title block dimensions (bottom-right area)
const TB_X = 240;   // title block starts x
const TB_Y = 200;   // title block starts y
const TB_W = PAGE_W - TB_X - 10;
const TB_H = PAGE_H - TB_Y - 10;

function drawBorder(doc: jsPDF) {
  // Outer frame
  doc.setLineWidth(0.8);
  doc.rect(5, 5, PAGE_W - 10, PAGE_H - 10);
  // Inner margin line
  doc.setLineWidth(0.3);
  doc.rect(15, 10, PAGE_W - 25, PAGE_H - 20);
}

function drawNorthArrow(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setLineWidth(0.4);
  doc.setDrawColor(180, 0, 0);
  // Simple north arrow: circle + N letter + arrow
  doc.circle(cx, cy, r);
  // Arrow up (north)
  doc.setFillColor(180, 0, 0);
  doc.triangle(cx, cy - r + 1, cx - r * 0.35, cy + r * 0.3, cx + r * 0.35, cy + r * 0.3, "F");
  // Arrow down (south) outline
  doc.setFillColor(255, 255, 255);
  doc.triangle(cx, cy + r - 1, cx - r * 0.35, cy - r * 0.3, cx + r * 0.35, cy - r * 0.3, "F");
  doc.setFontSize(7);
  doc.setTextColor(180, 0, 0);
  doc.text("N", cx, cy - r - 1.5, { align: "center" });
  doc.setDrawColor(0);
  doc.setTextColor(0);
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/company-logo.png");
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawCompanyLogo(doc: jsPDF, x: number, y: number, w: number, h: number, logoDataUrl: string | null) {
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", x, y, w, h);
      return;
    } catch {}
  }
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
  doc.setFontSize(8);
  doc.text("TNE", x + w / 2, y + h / 2 + 2, { align: "center" });
}

function drawTitleBlock(doc: jsPDF, data: PdfReportData, logoDataUrl: string | null) {
  const margin = 10;
  const rightEnd = PAGE_W - margin;
  const bottomEnd = PAGE_H - margin;

  // ── 발전용량 table (right side, upper)
  const tvX = TB_X;
  const tvY = TB_Y;
  const tvW = rightEnd - tvX;

  const rows = [
    ["총 발전용량", formatKw(data.totalCapacityKw)],
    ["모 듈 규 격", `${data.moduleWidth}×${data.moduleHeight}mm / ${data.moduleWattage}W`],
    ["모 듈 총 수 량", `${data.totalModules.toLocaleString("ko")} 장`],
    ["모 듈 구 성", buildModuleConfig(data)],
    ["모 듈 각 도", buildAngles(data.zones)],
    ["인 버 터 구 성", ""],
  ];

  doc.setFontSize(7);
  doc.setLineWidth(0.25);

  // Section header "■ 발전용량"
  doc.setFillColor(30, 30, 30);
  doc.rect(tvX, tvY, tvW, 5, "F");
  doc.setTextColor(255);
  doc.setFontSize(7.5);
  doc.text("■ 발 전 용 량", tvX + 2, tvY + 3.5);
  doc.setTextColor(0);

  const rowH = 6;
  rows.forEach(([label, value], i) => {
    const ry = tvY + 5 + i * rowH;
    doc.setFillColor(240, 240, 240);
    doc.rect(tvX, ry, tvW * 0.38, rowH, "F");
    doc.rect(tvX, ry, tvW, rowH);
    doc.setFontSize(6.5);
    doc.text(label, tvX + tvW * 0.19, ry + rowH / 2 + 1, { align: "center" });
    doc.text(value, tvX + tvW * 0.4, ry + rowH / 2 + 1);
    doc.line(tvX + tvW * 0.38, ry, tvX + tvW * 0.38, ry + rowH);
  });

  // ── 건축개요
  const bY = tvY + 5 + rows.length * rowH + 3;
  doc.setFillColor(30, 30, 30);
  doc.rect(tvX, bY, tvW, 5, "F");
  doc.setTextColor(255);
  doc.text("■ 건 축 개 요", tvX + 2, bY + 3.5);
  doc.setTextColor(0);

  const locY = bY + 5;
  doc.rect(tvX, locY, tvW, 8);
  doc.setFillColor(240, 240, 240);
  doc.rect(tvX, locY, tvW * 0.2, 8, "F");
  doc.line(tvX + tvW * 0.2, locY, tvX + tvW * 0.2, locY + 8);
  doc.setFontSize(7);
  doc.text("위  치", tvX + tvW * 0.1, locY + 5, { align: "center" });
  doc.setFontSize(6.5);
  doc.text(data.location || "", tvX + tvW * 0.22, locY + 5, { maxWidth: tvW * 0.76 });

  // ── Bottom title bar
  const titleY = bottomEnd - 18;
  doc.setLineWidth(0.4);
  doc.rect(margin, titleY, rightEnd - margin, 18);

  // Company logo box (left)
  const logoW = 35;
  doc.line(margin + logoW, titleY, margin + logoW, bottomEnd);
  drawCompanyLogo(doc, margin + 1, titleY + 1, logoW - 2, 16, logoDataUrl);

  // "MODULE ARRAY" center
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const titleMid = margin + logoW + (tvX - margin - logoW) / 2;
  doc.text("MODULE  ARRAY", titleMid, titleY + 11, { align: "center" });
  doc.setFont("helvetica", "normal");

  // Right cells: PROJECT / TITLE / SCALE / DWG No / DATE
  const metaX = tvX;
  const metaW = tvW;
  const metaRowH = 4.5;
  const metaRows = [
    ["PROJECT", data.projectName || "시스코 태양광 발전소"],
    ["TITLE", "MODULE ARRAY"],
    ["SCALE", "S=1:100"],
    ["DWG No.", "6-01"],
    ["DATE", new Date().toISOString().slice(0, 7).replace("-", ".")],
  ];
  metaRows.forEach(([k, v], i) => {
    const my = titleY + i * metaRowH;
    doc.rect(metaX, my, metaW, metaRowH);
    doc.setFillColor(240, 240, 240);
    doc.rect(metaX, my, metaW * 0.35, metaRowH, "F");
    doc.line(metaX + metaW * 0.35, my, metaX + metaW * 0.35, my + metaRowH);
    doc.setFontSize(5.5);
    doc.text(k, metaX + metaW * 0.175, my + metaRowH - 1, { align: "center" });
    doc.text(v, metaX + metaW * 0.37, my + metaRowH - 1);
  });
}

function buildModuleConfig(data: PdfReportData): string {
  if (data.zones.length === 0) return "";
  return data.zones.map(z => `${z.label}: ${z.moduleCount}장`).join(", ");
}

function buildAngles(zones: ZoneInfo[]): string {
  const unique = [...new Set(zones.map(z => z.angle.toFixed(1) + "°"))];
  return unique.join(", ") || "";
}

function formatKw(kw: number): string {
  return kw >= 1000 ? (kw / 1000).toFixed(2) + " MW" : kw.toFixed(2) + " kW";
}

export async function generatePdf(data: PdfReportData): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });

  doc.setFont("helvetica", "normal");

  const logoDataUrl = await loadLogoDataUrl();

  drawBorder(doc);

  // North arrow top-left
  drawNorthArrow(doc, 30, 30, 10);

  // Map image
  const mapX = 15;
  const mapY = 10;
  const mapW = TB_X - mapX - 5;
  const mapH = PAGE_H - 20 - 20; // leave room for bottom title bar
  if (data.mapImageDataUrl) {
    doc.addImage(data.mapImageDataUrl, "PNG", mapX, mapY, mapW, mapH);
  }

  // Zone labels on map image area (top-left legend)
  if (data.zones.length > 0) {
    const lgX = mapX + 2;
    let lgY = mapY + 15;
    doc.setFontSize(6);
    data.zones.forEach(z => {
      const [r, g, b] = hexToRgb(z.color);
      doc.setFillColor(r, g, b);
      doc.rect(lgX, lgY - 3, 4, 3.5, "F");
      doc.setFillColor(0, 0, 0);
      doc.text(`${z.label}: ${formatKw(z.capacityKw)} (${z.moduleCount}장)`, lgX + 5, lgY);
      lgY += 5;
    });
  }

  drawTitleBlock(doc, data, logoDataUrl);

  doc.save("태양광_배치도.pdf");
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
