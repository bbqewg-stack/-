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
  return kw >= 1000 ? (kw / 1000).toFixed(2) + " MW" : kw.toFixed(2) + " kW";
}

function northArrowSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="72" viewBox="0 0 64 72">
  <circle cx="32" cy="40" r="22" fill="none" stroke="#cc0000" stroke-width="1.5"/>
  <polygon points="32,19 25,40 39,40" fill="#cc0000"/>
  <polygon points="32,61 25,40 39,40" fill="white" stroke="#cc0000" stroke-width="1"/>
  <text x="32" y="11" text-anchor="middle" font-size="13" font-weight="bold" fill="#cc0000" font-family="Arial,sans-serif">N</text>
</svg>`;
}

function buildHtml(data: PdfReportData, logoDataUrl: string | null): string {
  // A3 landscape at 4px/mm = 1680 × 1188 px
  const PW = 1680, PH = 1188;
  const PAD = 32;      // outer border inset
  const INNER = 52;    // inner border / content start
  const RIGHT_W = 560; // right info panel width
  const TITLE_H = 100; // bottom title bar height
  const GAP = 16;      // gap between map and right panel

  const mapW = PW - INNER - RIGHT_W - GAP - PAD;
  const mapH = PH - INNER - TITLE_H - PAD;
  const rpX = INNER + mapW + GAP;
  const rpW = RIGHT_W;
  const rpH = mapH;

  // 발전용량 table rows
  const zones = data.zones;
  const tableRows = [
    ["총 발전용량", formatKw(data.totalCapacityKw)],
    ["모 듈 규 격", `${data.moduleWidth}×${data.moduleHeight}㎜ / ${data.moduleWattage}W`],
    ["모 듈 총 수 량", `${data.totalModules.toLocaleString("ko")} 장`],
    ["모 듈 구 성", zones.length ? zones.map(z => `${z.label}: ${z.moduleCount}장`).join(", ") : "-"],
    ["모 듈 각 도", zones.length ? zones.map(z => `${z.label} ${z.angle.toFixed(1)}°`).join(", ") : "-"],
    ["인 버 터 구 성", ""],
  ];

  const HDR_H = 30;
  const ROW_H = Math.floor((rpH * 0.52 - HDR_H) / tableRows.length);
  const LW = Math.floor(rpW * 0.36); // label column width

  const tableRowsHtml = tableRows.map(([lbl, val]) => `
    <div style="display:flex;height:${ROW_H}px;border-bottom:1px solid #aaa;">
      <div style="width:${LW}px;flex-shrink:0;background:#f0f0f0;border-right:1px solid #aaa;
                  display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;letter-spacing:0.5px;text-align:center;padding:0 4px;">
        ${lbl}
      </div>
      <div style="flex:1;display:flex;align-items:center;padding:0 10px;font-size:13px;word-break:break-all;line-height:1.4;">
        ${val}
      </div>
    </div>`).join("");

  // 건축개요
  const archH = 52;
  const archHtml = `
    <div style="border:1px solid #aaa;border-top:none;height:${archH}px;display:flex;">
      <div style="width:${LW}px;flex-shrink:0;background:#f0f0f0;border-right:1px solid #aaa;
                  display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;letter-spacing:2px;">
        위 치
      </div>
      <div style="flex:1;display:flex;align-items:center;padding:0 10px;font-size:12px;line-height:1.5;word-break:break-all;">
        ${data.location || ""}
      </div>
    </div>`;

  // Zone cards (if multiple zones)
  const zoneCardsHtml = zones.length > 1 ? `
    <div style="margin-top:14px;">
      ${zones.map(z => `
        <div style="display:flex;align-items:center;border:1px solid #ddd;border-radius:4px;margin-bottom:6px;overflow:hidden;">
          <div style="width:10px;flex-shrink:0;background:${z.color};self-stretch;"></div>
          <div style="flex:1;padding:5px 10px;">
            <div style="font-size:13px;font-weight:700;color:#333;">${z.label}</div>
            <div style="font-size:11px;color:#666;">${z.moduleCount}장 · ${formatKw(z.capacityKw)} · ${z.angle.toFixed(1)}°</div>
          </div>
        </div>`).join("")}
    </div>` : "";

  // Zone legend overlay (on map)
  const legendHtml = zones.map(z => `
    <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.88);
                padding:3px 8px;border-radius:3px;margin-bottom:4px;font-size:13px;font-weight:600;border:1px solid rgba(0,0,0,0.12);">
      <div style="width:14px;height:14px;background:${z.color};border-radius:2px;flex-shrink:0;"></div>
      ${z.label}: ${formatKw(z.capacityKw)} (${z.moduleCount}장)
    </div>`).join("");

  // Bottom meta rows
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="max-height:${TITLE_H - 14}px;max-width:180px;object-fit:contain;" />`
    : `<div style="font-size:20px;font-weight:900;color:#1a3a8c;font-family:Arial,sans-serif;">TNE</div>`;

  const metaItems = [
    ["PROJECT", data.projectName || "태양광 발전소"],
    ["TITLE", "MODULE ARRAY"],
    ["SCALE", "S=1:100"],
    ["DWG No.", "6-01"],
    ["DATE", new Date().toISOString().slice(0, 7).replace("-", ".")],
  ];
  const metaRowH = Math.floor(TITLE_H / metaItems.length);
  const metaHtml = metaItems.map(([k, v]) => `
    <div style="display:flex;height:${metaRowH}px;border-bottom:1px solid #aaa;box-sizing:border-box;">
      <div style="width:76px;flex-shrink:0;background:#f0f0f0;border-right:1px solid #aaa;
                  display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">
        ${k}
      </div>
      <div style="flex:1;display:flex;align-items:center;padding-left:8px;font-size:11px;">
        ${v}
      </div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#fff;font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif;}
</style>
</head>
<body>
<div id="drawing" style="width:${PW}px;height:${PH}px;background:#fff;position:relative;overflow:hidden;">

  <!-- Outer border -->
  <div style="position:absolute;inset:${PAD}px;border:2px solid #222;pointer-events:none;z-index:1;"></div>
  <!-- Inner border -->
  <div style="position:absolute;inset:${INNER - 10}px;border:0.8px solid #666;pointer-events:none;z-index:1;"></div>

  <!-- ── MAP AREA ── -->
  <div style="position:absolute;left:${INNER}px;top:${INNER}px;width:${mapW}px;height:${mapH}px;overflow:hidden;border:1px solid #bbb;">
    ${data.mapImageDataUrl
      ? `<img src="${data.mapImageDataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : `<div style="width:100%;height:100%;background:#e8e8e8;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:18px;">지도 이미지</div>`
    }
    <!-- North arrow -->
    <div style="position:absolute;top:10px;left:10px;z-index:5;">${northArrowSvg()}</div>
    <!-- Zone legend -->
    <div style="position:absolute;bottom:12px;left:12px;z-index:5;">${legendHtml}</div>
  </div>

  <!-- ── RIGHT PANEL ── -->
  <div style="position:absolute;left:${rpX}px;top:${INNER}px;width:${rpW}px;height:${rpH}px;overflow:hidden;">

    <!-- 발전용량 header -->
    <div style="background:#1c1c1c;color:#fff;padding:5px 10px;font-size:15px;font-weight:700;letter-spacing:1px;height:${HDR_H}px;display:flex;align-items:center;">
      ■ 발 전 용 량
    </div>
    <!-- 발전용량 table -->
    <div style="border:1px solid #aaa;border-top:none;">
      ${tableRowsHtml}
    </div>

    <!-- 건축개요 header -->
    <div style="margin-top:12px;background:#1c1c1c;color:#fff;padding:5px 10px;font-size:15px;font-weight:700;letter-spacing:1px;height:${HDR_H}px;display:flex;align-items:center;">
      ■ 건 축 개 요
    </div>
    ${archHtml}

    ${zoneCardsHtml}
  </div>

  <!-- ── BOTTOM TITLE BAR ── -->
  <div style="
    position:absolute;
    left:${INNER - 10}px;bottom:${PAD}px;
    width:${PW - INNER + 10 - PAD}px;height:${TITLE_H}px;
    border:1.5px solid #555;
    display:flex;overflow:hidden;background:#fff;
  ">
    <!-- Logo -->
    <div style="width:190px;flex-shrink:0;border-right:1.5px solid #555;display:flex;align-items:center;justify-content:center;padding:6px;">
      ${logoHtml}
    </div>
    <!-- MODULE ARRAY -->
    <div style="flex:1;display:flex;align-items:center;justify-content:center;">
      <span style="font-size:24px;font-weight:900;letter-spacing:5px;font-family:Arial,Helvetica,sans-serif;">MODULE  ARRAY</span>
    </div>
    <!-- META -->
    <div style="width:${rpW}px;flex-shrink:0;border-left:1.5px solid #555;">
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

  // Render HTML in a hidden iframe
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1680px;height:1188px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const html = buildHtml(data, logoDataUrl);
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();

    // Wait for all images to load
    await new Promise<void>(resolve => {
      const imgs = Array.from(iframe.contentDocument!.querySelectorAll("img"));
      if (imgs.length === 0) { resolve(); return; }
      let loaded = 0;
      const done = () => { if (++loaded >= imgs.length) resolve(); };
      imgs.forEach(img => {
        if (img.complete) done();
        else { img.onload = done; img.onerror = done; }
      });
      setTimeout(resolve, 4000);
    });

    await new Promise(r => setTimeout(r, 400));

    const el = iframe.contentDocument!.getElementById("drawing") as HTMLElement;
    const canvas = await html2canvas(el, {
      scale: 1,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 1680,
      height: 1188,
      backgroundColor: "#ffffff",
    });

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 420, 297);
    pdf.save("태양광_배치도.pdf");
  } finally {
    document.body.removeChild(iframe);
  }
}
