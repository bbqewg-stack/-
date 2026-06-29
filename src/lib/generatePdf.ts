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
  moduleMaker: string;
  modulesPerString: number;
  totalStrings: number;
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

/** 50kW, 60kW, 125kW 인버터 조합으로 시스템 용량을 최소 초과로 커버하는 최적 조합 계산 */
function calcInverters(totalKw: number): string {
  if (totalKw <= 0) return "-";

  let best: { n125: number; n60: number; n50: number } | null = null;
  let bestScore = Infinity;

  const max125 = Math.ceil(totalKw / 125) + 1;
  for (let n125 = 0; n125 <= max125; n125++) {
    const rem1 = totalKw - n125 * 125;
    const max60 = Math.ceil(Math.max(0, rem1) / 60) + 1;
    for (let n60 = 0; n60 <= max60; n60++) {
      const rem2 = rem1 - n60 * 60;
      const n50 = rem2 > 0 ? Math.ceil(rem2 / 50) : 0;
      const total = n125 * 125 + n60 * 60 + n50 * 50;
      const excess = total - totalKw;
      if (excess < 0) continue;
      // 초과 용량 최소화 우선, 동률이면 대수 최소화
      const score = excess * 100 + (n125 + n60 + n50);
      if (score < bestScore) {
        bestScore = score;
        best = { n125, n60, n50 };
      }
    }
  }

  if (!best) return "-";
  const parts: string[] = [];
  if (best.n125 > 0) parts.push(`125kW = ${best.n125}대`);
  if (best.n60 > 0) parts.push(`60kW = ${best.n60}대`);
  if (best.n50 > 0) parts.push(`50kW = ${best.n50}대`);
  return parts.join(" / ") || "-";
}

function buildHtml(data: PdfReportData, logoDataUrl: string | null): string {
  // A3 landscape at 4px/mm = 1680 × 1188 px
  const PW = 1680, PH = 1188;
  const MARGIN = 20;
  const HDR_H = 64;          // top header bar
  const RIGHT_W = 488;       // right panel width
  const DIV_W = 1;           // divider
  const TITLE_BLOCK_H = 168; // title block at bottom of right panel

  const mapLeft = MARGIN;
  const mapTop = MARGIN + HDR_H + 8;
  const mapW = PW - RIGHT_W - DIV_W - MARGIN * 2 - 6;
  const mapH = PH - mapTop - MARGIN;

  const rpLeft = PW - RIGHT_W - MARGIN;
  const rpTop = mapTop;
  const rpH = PH - rpTop - MARGIN;
  const infoH = rpH - TITLE_BLOCK_H - 8;

  const zones = data.zones;

  // ── Color palette ──
  const NAVY = "#1c2f4f";
  const NAVY2 = "#243c61";
  const ACCENT = "#1e5fa8";
  const STRIPE = "#f4f6f9";
  const BORDER = "#d0d7e3";
  const TEXT = "#1a1e2e";
  const MUTED = "#6b7a99";

  // 모듈 규격 표시: 메이커명 포함 (예: TRINA 730W : 1303×2384 ㎜)
  const moduleSpecText = data.moduleMaker
    ? `${data.moduleMaker} : ${data.moduleWidth}×${data.moduleHeight} ㎜`
    : `${data.moduleWattage}W : ${data.moduleWidth}×${data.moduleHeight} ㎜`;

  // 모듈 구성: 직병렬 수식 (예: 15직렬 × 10병렬 = 150장 × 730W = 109.5kW)
  const moduleConfigText = (data.modulesPerString > 0 && data.totalStrings > 0)
    ? `${data.modulesPerString}직렬 × ${data.totalStrings}병렬 = ${data.totalModules.toLocaleString("ko")}장 × ${data.moduleWattage}W = ${formatKw(data.totalCapacityKw)}`
    : `${data.totalModules.toLocaleString("ko")}장`;

  // 인버터 구성 자동계산
  const inverterText = calcInverters(data.totalCapacityKw);

  // ── Capacity table ──
  const capRows = [
    ["총 발전용량",  `<b style="font-size:15px;color:${ACCENT}">${formatKw(data.totalCapacityKw)}</b>`],
    ["모듈 규격",    moduleSpecText],
    ["모듈 총 수량", `${data.totalModules.toLocaleString("ko")} 장`],
    ["모듈 구성",    moduleConfigText],
    ["모듈 각도",    zones.map(z => `${z.label} ${z.angle.toFixed(1)}°`).join(" &nbsp;|&nbsp; ") || "-"],
    ["인버터 구성",  inverterText],
  ];
  const capRowH = Math.floor((infoH * 0.65 - 36) / capRows.length);
  const LW = 128;

  const capRowsHtml = capRows.map(([lbl, val], idx) => `
    <div style="display:flex;height:${capRowH}px;background:${idx % 2 === 0 ? "#fff" : STRIPE};">
      <div style="width:${LW}px;flex-shrink:0;border-right:1px solid ${BORDER};
                  display:flex;align-items:center;padding:0 10px;
                  font-size:11.5px;font-weight:600;color:${MUTED};letter-spacing:0.3px;">
        ${lbl}
      </div>
      <div style="flex:1;display:flex;align-items:center;padding:0 12px;font-size:12.5px;color:${TEXT};line-height:1.4;word-break:break-all;">
        ${val}
      </div>
    </div>`).join("");

  // ── Location row ──
  const locHtml = `
    <div style="display:flex;min-height:34px;border-bottom:1px solid ${BORDER};background:${STRIPE};">
      <div style="width:${LW}px;flex-shrink:0;border-right:1px solid ${BORDER};
                  display:flex;align-items:center;padding:0 10px;font-size:11.5px;font-weight:600;color:${MUTED};">
        설치 위치
      </div>
      <div style="flex:1;display:flex;align-items:center;padding:0 12px;font-size:12px;color:${TEXT};">
        ${data.location || "&nbsp;"}
      </div>
    </div>`;

  // ── Title block ──
  const metaItems = [
    ["PROJECT", data.projectName || "태양광 발전소"],
    ["TITLE",   "MODULE ARRAY"],
    ["SCALE",   "S=1:100"],
    ["DWG No.", "6-01"],
    ["DATE",    new Date().toISOString().slice(0, 7).replace("-", ".")],
  ];
  const metaRowH = Math.floor((TITLE_BLOCK_H - 56) / metaItems.length);
  const metaHtml = metaItems.map(([k, v]) => `
    <div style="display:flex;height:${metaRowH}px;">
      <div style="width:76px;flex-shrink:0;border-right:1px solid ${BORDER};
                  display:flex;align-items:center;padding:0 8px;
                  font-size:10px;font-weight:700;color:${MUTED};letter-spacing:0.5px;background:${STRIPE};">
        ${k}
      </div>
      <div style="flex:1;display:flex;align-items:center;padding:0 10px;font-size:10.5px;color:${TEXT};">
        ${v}
      </div>
    </div>`).join("");

  // 헤더용 로고 (어두운 배경 → 흰 배경 박스로 감쌈)
  const logoHtmlDark = logoDataUrl
    ? `<div style="background:#fff;border-radius:4px;padding:3px 8px;display:inline-flex;align-items:center;">
         <img src="${logoDataUrl}" style="max-height:36px;max-width:120px;object-fit:contain;" />
       </div>`
    : `<div style="font-size:18px;font-weight:900;color:#fff;font-family:Arial,sans-serif;letter-spacing:2px;">TNE</div>`;

  // 타이틀 블록용 로고 (밝은 배경 → 그대로)
  const logoHtmlLight = logoDataUrl
    ? `<img src="${logoDataUrl}" style="max-height:40px;max-width:130px;object-fit:contain;" />`
    : `<div style="font-size:18px;font-weight:900;color:${ACCENT};font-family:Arial,sans-serif;letter-spacing:2px;">TNE</div>`;

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
<div id="drawing" style="width:${PW}px;height:${PH}px;background:#f0f2f5;position:relative;overflow:hidden;">

  <!-- ── OUTER FRAME ── -->
  <div style="position:absolute;inset:${MARGIN}px;background:#fff;border:1.5px solid ${BORDER};box-shadow:0 2px 12px rgba(0,0,0,0.08);"></div>

  <!-- ── TOP HEADER BAR ── -->
  <div style="position:absolute;left:${MARGIN}px;top:${MARGIN}px;width:${PW - MARGIN * 2}px;height:${HDR_H}px;
              background:linear-gradient(135deg,${NAVY} 0%,${NAVY2} 100%);
              display:flex;align-items:center;padding:0 24px;gap:20px;">
    <!-- Logo (흰 배경 박스로 감싸 네이비 배경 대비 확보) -->
    <div style="flex-shrink:0;height:44px;display:flex;align-items:center;">${logoHtmlDark}</div>
    <!-- Vertical divider -->
    <div style="width:1px;height:36px;background:rgba(255,255,255,0.25);flex-shrink:0;"></div>
    <!-- Title + 설치위치 -->
    <div style="flex:1;">
      <div style="font-size:9px;font-weight:500;color:rgba(255,255,255,0.55);letter-spacing:2px;margin-bottom:3px;">SOLAR PV DESIGN</div>
      <div style="font-size:17px;font-weight:700;color:#fff;letter-spacing:3px;font-family:Arial,sans-serif;">MODULE  ARRAY</div>
      ${data.location ? `<div style="font-size:10px;color:rgba(255,255,255,0.70);margin-top:3px;letter-spacing:0.5px;">${data.location}</div>` : ""}
    </div>
    <!-- Capacity badge -->
    <div style="flex-shrink:0;text-align:right;">
      <div style="font-size:9px;color:rgba(255,255,255,0.55);letter-spacing:1px;margin-bottom:2px;">총 발전용량</div>
      <div style="font-size:22px;font-weight:900;color:#7dd3fc;font-family:Arial,sans-serif;letter-spacing:1px;">${formatKw(data.totalCapacityKw)}</div>
    </div>
  </div>

  <!-- ── MAP AREA ── -->
  <div style="position:absolute;left:${mapLeft}px;top:${mapTop}px;width:${mapW}px;height:${mapH}px;overflow:hidden;">
    ${data.mapImageDataUrl
      ? `<img src="${data.mapImageDataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : `<div style="width:100%;height:100%;background:#e8edf2;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:18px;">지도 이미지</div>`
    }
    <!-- North arrow -->
    <div style="position:absolute;top:12px;left:12px;z-index:5;background:rgba(255,255,255,0.9);border-radius:50%;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.2);">${northArrowSvg()}</div>
  </div>

  <!-- ── VERTICAL DIVIDER ── -->
  <div style="position:absolute;left:${rpLeft - 8}px;top:${mapTop}px;width:1px;height:${mapH}px;background:${BORDER};"></div>

  <!-- ── RIGHT PANEL ── -->
  <div style="position:absolute;left:${rpLeft}px;top:${rpTop}px;width:${RIGHT_W}px;height:${rpH}px;overflow:hidden;display:flex;flex-direction:column;">

    <!-- 발전용량 섹션 -->
    <div style="flex-shrink:0;">
      <div style="background:${NAVY};color:#fff;padding:0 14px;height:32px;display:flex;align-items:center;gap:8px;">
        <div style="width:3px;height:14px;background:#7dd3fc;border-radius:2px;"></div>
        <span style="font-size:12px;font-weight:700;letter-spacing:1.5px;">발전용량</span>
      </div>
      <div style="border:1px solid ${BORDER};border-top:none;">
        ${capRowsHtml}
      </div>
    </div>

    <!-- 설치위치 -->
    <div style="flex-shrink:0;margin-top:10px;border:1px solid ${BORDER};">
      ${locHtml}
    </div>

    <!-- Spacer -->
    <div style="flex:1;"></div>

    <!-- ── TITLE BLOCK ── -->
    <div style="flex-shrink:0;border:1.5px solid ${BORDER};border-radius:2px;overflow:hidden;">
      <!-- Title block header -->
      <div style="background:${NAVY};padding:0 14px;height:34px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:13px;font-weight:700;color:#fff;letter-spacing:2px;font-family:Arial,sans-serif;">DRAWING INFO</div>
        <div style="font-size:9px;color:rgba(255,255,255,0.5);letter-spacing:1px;">태양광 자동 용량계산</div>
      </div>
      <!-- Divider with logo -->
      <div style="height:48px;display:flex;align-items:center;border-bottom:1px solid ${BORDER};background:#fff;">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;">
          ${logoHtmlLight}
        </div>
        <div style="width:1px;height:32px;background:${BORDER};"></div>
        <div style="flex:2;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;">
          <div style="font-size:14px;font-weight:900;letter-spacing:4px;color:${NAVY};font-family:Arial,sans-serif;">MODULE ARRAY</div>
          <div style="font-size:9px;color:${MUTED};letter-spacing:1px;">SOLAR PV INSTALLATION PLAN</div>
        </div>
      </div>
      <!-- Meta rows -->
      <div style="border-top:1px solid ${BORDER};">
        ${metaHtml}
      </div>
    </div>

  </div>

</div>
</body>
</html>`;
}

/** Renders the template to a canvas and returns a data URL for preview */
export async function generatePreviewImage(data: PdfReportData): Promise<string> {
  const html2canvas = (await import("html2canvas")).default;

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

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1680px;height:1188px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(buildHtml(data, logoDataUrl));
    iframe.contentDocument!.close();

    await new Promise<void>(resolve => {
      const imgs = Array.from(iframe.contentDocument!.querySelectorAll("img"));
      if (imgs.length === 0) { resolve(); return; }
      let loaded = 0;
      const done = () => { if (++loaded >= imgs.length) resolve(); };
      imgs.forEach(img => { if (img.complete) done(); else { img.onload = done; img.onerror = done; } });
      setTimeout(resolve, 4000);
    });

    await new Promise(r => setTimeout(r, 300));

    const el = iframe.contentDocument!.getElementById("drawing") as HTMLElement;
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 1680,
      height: 1188,
      backgroundColor: "#ffffff",
    });
    return canvas.toDataURL("image/jpeg", 0.97);
  } finally {
    document.body.removeChild(iframe);
  }
}

/** Saves a preview data URL directly as a PDF file */
export async function savePdfFromImage(imageDataUrl: string): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  pdf.addImage(imageDataUrl, "JPEG", 0, 0, 420, 297);
  pdf.save("태양광_배치도.pdf");
}

/** @deprecated use generatePreviewImage + savePdfFromImage */
export async function generatePdf(data: PdfReportData): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { default: jsPDF } = await import("jspdf");

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

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1680px;height:1188px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const html = buildHtml(data, logoDataUrl);
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();

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
