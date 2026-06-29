"use client";

export interface ZoneInfo {
  label: string;
  color: string;
  moduleCount: number;
  capacityKw: number;
  angle: number;
}

export interface PdfReportData {
  mapImageDataUrl: string;
  zones: ZoneInfo[];
  totalModules: number;
  totalCapacityKw: number;
  moduleWidth: number;
  moduleHeight: number;
  moduleWattage: number;
  rowSpacing: number;
  colSpacing: number;
  location: string;
  projectName: string;
}

function formatKw(kw: number): string {
  return kw >= 1000
    ? (kw / 1000).toFixed(2) + " MW"
    : kw.toFixed(2) + " kW";
}

function buildAngles(zones: ZoneInfo[]): string {
  if (zones.length === 0) return "-";
  return zones.map(z => `${z.label} ${z.angle.toFixed(1)}°`).join(", ");
}

function buildModuleComposition(zones: ZoneInfo[]): string {
  if (zones.length === 0) return "-";
  return zones.map(z => `${z.label}: ${z.moduleCount}장`).join(", ");
}

// Draw north arrow as inline SVG string
function northArrowSvg(): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="70" height="80" viewBox="0 0 70 80">
  <circle cx="35" cy="42" r="25" fill="none" stroke="#cc0000" stroke-width="1.5"/>
  <polygon points="35,18 28,42 42,42" fill="#cc0000"/>
  <polygon points="35,66 28,42 42,42" fill="white" stroke="#cc0000" stroke-width="1"/>
  <text x="35" y="12" text-anchor="middle" font-size="14" font-weight="bold" fill="#cc0000" font-family="sans-serif">N</text>
</svg>`;
}

function buildHtml(data: PdfReportData, logoDataUrl: string | null): string {
  // Canvas dimensions: A3 landscape at 3.78px/mm (96dpi) * 1.5 = 5.67px/mm ≈ 150dpi
  // A3 = 420×297mm → at 150dpi: 2480×1754, but let's use a simpler 2100×1485
  const W = 2100;
  const H = 1485;

  const MARGIN_OUT = 25;   // outer frame
  const MARGIN_IN = 55;    // inner frame
  const RIGHT_W = 660;     // right panel width
  const TITLE_H = 90;      // bottom title bar height
  const MAP_X = MARGIN_IN;
  const MAP_Y = MARGIN_IN;
  const MAP_W = W - MARGIN_IN - RIGHT_W - 20;
  const MAP_H = H - MARGIN_IN - TITLE_H - MARGIN_OUT;

  // Right panel
  const RP_X = MAP_X + MAP_W + 20;
  const RP_Y = MARGIN_IN;
  const RP_W = RIGHT_W;

  // Row definitions for 발전용량 table
  const tableRows = [
    ["총 발전용량", formatKw(data.totalCapacityKw)],
    ["모 듈 규 격", `${data.moduleWidth}×${data.moduleHeight}mm / ${data.moduleWattage}W`],
    ["모 듈 총 수 량", `${data.totalModules.toLocaleString("ko")} 장`],
    ["모 듈 구 성", buildModuleComposition(data.zones)],
    ["모 듈 각 도", buildAngles(data.zones)],
    ["인 버 터 구 성", ""],
  ];

  const ROW_H = 46;
  const LABEL_W = RP_W * 0.38;

  const tableRowsHtml = tableRows.map(([label, value]) => `
    <div style="display:flex;height:${ROW_H}px;border-bottom:1px solid #999;box-sizing:border-box;">
      <div style="width:${LABEL_W}px;flex-shrink:0;background:#ebebeb;border-right:1px solid #999;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;letter-spacing:1px;">
        ${label}
      </div>
      <div style="flex:1;display:flex;align-items:center;padding-left:14px;font-size:15px;">
        ${value}
      </div>
    </div>
  `).join("");

  // Zone legend
  const zoneLegendHtml = data.zones.map(z => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;background:rgba(255,255,255,0.85);padding:3px 8px;border-radius:4px;">
      <div style="width:18px;height:18px;background:${z.color};border-radius:3px;flex-shrink:0;"></div>
      <span style="font-size:16px;font-weight:600;">${z.label}: ${formatKw(z.capacityKw)} (${z.moduleCount}장)</span>
    </div>
  `).join("");

  // Bottom title bar meta cells
  const metaRows = [
    ["PROJECT", data.projectName || "태양광 발전소"],
    ["TITLE", "MODULE ARRAY"],
    ["SCALE", "S=1:100"],
    ["DWG No.", "6-01"],
    ["DATE", new Date().toISOString().slice(0, 7).replace("-", ".")],
  ];
  const META_ROW_H = TITLE_H / metaRows.length;
  const META_LABEL_W = 100;
  const metaHtml = metaRows.map(([k, v]) => `
    <div style="display:flex;height:${META_ROW_H}px;border-bottom:1px solid #999;box-sizing:border-box;">
      <div style="width:${META_LABEL_W}px;background:#ebebeb;border-right:1px solid #999;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">
        ${k}
      </div>
      <div style="flex:1;display:flex;align-items:center;padding-left:10px;font-size:13px;">
        ${v}
      </div>
    </div>
  `).join("");

  // ■ 건축개요 row
  const archY = RP_Y + 30 + tableRows.length * ROW_H + 14;
  const archH = 60;

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="height:${TITLE_H - 10}px;max-width:180px;object-fit:contain;" />`
    : `<div style="font-size:22px;font-weight:900;color:#1a3a8c;font-family:sans-serif;">TNE</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: white; font-family: 'Malgun Gothic', '맑은 고딕', '나눔고딕', sans-serif; }
</style>
</head>
<body>
<div id="drawing" style="
  width:${W}px;height:${H}px;
  background:white;
  position:relative;
  overflow:hidden;
">

  <!-- Outer border -->
  <div style="position:absolute;inset:${MARGIN_OUT}px;border:2.5px solid #222;pointer-events:none;"></div>
  <!-- Inner border -->
  <div style="position:absolute;inset:${MARGIN_IN - 8}px;border:1px solid #555;pointer-events:none;"></div>

  <!-- North arrow -->
  <div style="position:absolute;left:${MAP_X + 8}px;top:${MAP_Y + 8}px;z-index:10;">
    ${northArrowSvg()}
  </div>

  <!-- Map image -->
  <div style="position:absolute;left:${MAP_X}px;top:${MAP_Y}px;width:${MAP_W}px;height:${MAP_H}px;border:1px solid #999;overflow:hidden;">
    ${data.mapImageDataUrl
      ? `<img src="${data.mapImageDataUrl}" style="width:100%;height:100%;object-fit:cover;" />`
      : `<div style="width:100%;height:100%;background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:20px;">지도 이미지</div>`
    }
    <!-- Zone legend overlay -->
    <div style="position:absolute;bottom:12px;left:12px;z-index:5;">
      ${zoneLegendHtml}
    </div>
  </div>

  <!-- Right panel: 발전용량 -->
  <div style="position:absolute;left:${RP_X}px;top:${RP_Y}px;width:${RP_W}px;">
    <!-- Section header -->
    <div style="background:#1a1a1a;color:white;padding:6px 12px;font-size:17px;font-weight:700;">
      ■ 발 전 용 량
    </div>
    <!-- Table -->
    <div style="border:1px solid #999;border-bottom:none;">
      ${tableRowsHtml}
    </div>

    <!-- 건축개요 -->
    <div style="margin-top:14px;background:#1a1a1a;color:white;padding:6px 12px;font-size:17px;font-weight:700;">
      ■ 건 축 개 요
    </div>
    <div style="border:1px solid #999;height:${archH}px;display:flex;">
      <div style="width:${LABEL_W}px;background:#ebebeb;border-right:1px solid #999;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;">
        위 &nbsp; 치
      </div>
      <div style="flex:1;display:flex;align-items:center;padding-left:14px;font-size:14px;line-height:1.5;">
        ${data.location || ""}
      </div>
    </div>
  </div>

  <!-- Bottom title bar -->
  <div style="
    position:absolute;
    left:${MARGIN_IN - 8}px;
    bottom:${MARGIN_OUT}px;
    right:${MARGIN_OUT}px;
    height:${TITLE_H}px;
    border:1.5px solid #555;
    display:flex;
    overflow:hidden;
  ">
    <!-- Logo -->
    <div style="width:200px;flex-shrink:0;border-right:1.5px solid #555;display:flex;align-items:center;justify-content:center;padding:4px;">
      ${logoHtml}
    </div>
    <!-- MODULE ARRAY text -->
    <div style="flex:1;display:flex;align-items:center;justify-content:center;">
      <span style="font-size:28px;font-weight:900;letter-spacing:6px;font-family:'Arial','Helvetica',sans-serif;">MODULE  ARRAY</span>
    </div>
    <!-- Meta info -->
    <div style="width:${RP_W}px;flex-shrink:0;border-left:1.5px solid #555;font-size:13px;">
      ${metaHtml}
    </div>
  </div>

</div>
</body>
</html>`;
}

export async function generatePdf(data: PdfReportData): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { default: jsPDF } = await import("jspdf");

  // Load company logo
  let logoDataUrl: string | null = null;
  try {
    const res = await fetch("/company-logo.png");
    const blob = await res.blob();
    logoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch { /* logo optional */ }

  // Create hidden iframe to render HTML
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:2100px;height:1485px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const html = buildHtml(data, logoDataUrl);
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();

    // Wait for images to load
    await new Promise<void>(resolve => {
      const imgs = iframe.contentDocument!.querySelectorAll("img");
      if (imgs.length === 0) { resolve(); return; }
      let loaded = 0;
      const done = () => { if (++loaded >= imgs.length) resolve(); };
      imgs.forEach(img => {
        if (img.complete) done();
        else { img.onload = done; img.onerror = done; }
      });
      setTimeout(resolve, 3000); // fallback timeout
    });

    // Extra render delay
    await new Promise(r => setTimeout(r, 300));

    const drawingEl = iframe.contentDocument!.getElementById("drawing") as HTMLElement;

    const canvas = await html2canvas(drawingEl, {
      scale: 1,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 2100,
      height: 1485,
      backgroundColor: "#ffffff",
    });

    // A3 landscape PDF
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(imgData, "JPEG", 0, 0, 420, 297);
    pdf.save("태양광_배치도.pdf");

  } finally {
    document.body.removeChild(iframe);
  }
}
