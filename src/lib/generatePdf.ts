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
  const N = "#1c2f4f", RED = "#cc0000", A = "#1e5fa8";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 108 108" width="84" height="84">
  <circle cx="50" cy="50" r="44" fill="white" stroke="${N}" stroke-width="3"/>
  <circle cx="50" cy="50" r="28" fill="none" stroke="${N}" stroke-width="0.7" stroke-dasharray="4,3" opacity="0.25"/>
  <polygon points="50,8 42,50 50,42 58,50" fill="${RED}"/>
  <polygon points="50,92 42,50 50,58 58,50" fill="#dde7f5" stroke="${N}" stroke-width="1.5"/>
  <polygon points="92,50 76,44 76,56" fill="#8899bb" opacity="0.6"/>
  <polygon points="8,50 24,44 24,56" fill="#8899bb" opacity="0.6"/>
  <circle cx="50" cy="50" r="6" fill="${A}" stroke="white" stroke-width="2.5"/>
  <text x="50" y="2" text-anchor="middle" dominant-baseline="middle" font-size="17" font-weight="900" fill="${RED}" font-family="Arial,sans-serif">N</text>
  <text x="50" y="98" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="${N}" font-family="Arial,sans-serif">S</text>
  <text x="4" y="50" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="${N}" font-family="Arial,sans-serif">W</text>
  <text x="96" y="50" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="${N}" font-family="Arial,sans-serif">E</text>
</svg>`;
}

/**
 * 인버터 조합 계산: 125kW > 60kW > 50kW 순 우선
 * score = excess*3 + n60*30 + n50*20 - n125*50
 * → 125kW 대수가 많을수록 score 감소(유리), excess도 최소화
 */
function calcInverters(totalKw: number): string {
  if (totalKw <= 0) return "-";

  let best: { n125: number; n60: number; n50: number } | null = null;
  let bestScore = Infinity;

  const max125 = Math.ceil(totalKw / 125) + 2;
  for (let n125 = 0; n125 <= max125; n125++) {
    const rem1 = totalKw - n125 * 125;
    const max60 = Math.ceil(Math.max(0, rem1) / 60) + 2;
    for (let n60 = 0; n60 <= max60; n60++) {
      const rem2 = rem1 - n60 * 60;
      const n50 = rem2 > 0 ? Math.ceil(rem2 / 50) : 0;
      const total = n125 * 125 + n60 * 60 + n50 * 50;
      const excess = total - totalKw;
      if (excess < 0) continue;
      // 125kW 많을수록 유리(-50/대), 초과량 최소화, 60/50은 패널티
      const score = excess * 3 + n60 * 30 + n50 * 20 - n125 * 50;
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

export function buildHtml(data: PdfReportData, logoDataUrl: string | null): string {
  const PW = 1680, PH = 1188;
  const MARGIN = 20;
  const HDR_H = 68;
  const RIGHT_W = 492;
  const COMPANY_H = 172;  // bottom company block height

  const mapLeft = MARGIN;
  const mapTop = MARGIN + HDR_H + 8;
  const mapW = PW - RIGHT_W - MARGIN * 2 - 8;
  const mapH = PH - mapTop - MARGIN;

  const rpLeft = PW - RIGHT_W - MARGIN;
  const rpTop = mapTop;
  const rpH = PH - rpTop - MARGIN;
  const infoH = rpH - COMPANY_H - 10;

  const zones = data.zones;

  const NAVY = "#1c2f4f";
  const NAVY2 = "#243c61";
  const ACCENT = "#1e5fa8";
  const STRIPE = "#f0f3f8";
  const BORDER = "#c8d0e0";
  const TEXT = "#0f1520";
  const LBL = "#4a5a78";

  // 모듈 규격
  const moduleSpecText = data.moduleMaker
    ? `${data.moduleMaker} : ${data.moduleWidth}×${data.moduleHeight} ㎜`
    : `${data.moduleWattage}W : ${data.moduleWidth}×${data.moduleHeight} ㎜`;

  // 모듈 구성 2줄
  const moduleConfigText = (data.modulesPerString > 0 && data.totalStrings > 0)
    ? `${data.modulesPerString}직렬 × ${data.totalStrings}병렬 = ${data.totalModules.toLocaleString("ko")}장 × ${data.moduleWattage}W<br/>= ${formatKw(data.totalCapacityKw)}`
    : `${data.totalModules.toLocaleString("ko")}장`;

  const inverterText = calcInverters(data.totalCapacityKw);

  // 방위각 min/max
  const angles = zones.map(z => z.angle).filter(a => isFinite(a));
  const angleText = angles.length === 0 ? "-"
    : angles.every(a => a === angles[0]) ? `${angles[0].toFixed(1)}°`
    : `최소 ${Math.min(...angles).toFixed(1)}° / 최대 ${Math.max(...angles).toFixed(1)}°`;

  // ── Capacity table (프로젝트명·설치위치 포함) ──
  const capRows: [string, string][] = [
    ["프로젝트명",   data.projectName || "태양광 발전소"],
    ["설치 위치",    data.location || "-"],
    ["총 발전용량",  `<b style="font-size:22px;font-weight:900;color:${ACCENT};">${formatKw(data.totalCapacityKw)}</b>`],
    ["모듈 규격",    moduleSpecText],
    ["모듈 총 수량", `${data.totalModules.toLocaleString("ko")} 장`],
    ["모듈 구성",    moduleConfigText],
    ["모듈 방위각",  angleText],
    ["인버터 구성",  inverterText],
  ];

  const capRowH = Math.max(58, Math.floor((infoH * 0.72 - 36) / capRows.length));
  const LW = 138;

  // 단일 레벨 flex row + align-items:center 사용 (하단 회사정보 블록과 동일 방식).
  // line-height를 박스 높이와 동일하게 맞추는 트릭은 폰트별로 베이스라인 계산이 틀어져
  // 텍스트가 위/아래로 쏠리는 문제가 있었음 — 폰트 메트릭에 의존하지 않는
  // flex 단일 레이아웃(중첩 없음)으로 전면 교체.
  const capRowsHtml = capRows.map(([lbl, val], idx) => {
    const isMultiLine = val.includes('<br/>');
    return `
    <div style="display:flex;width:100%;min-height:${capRowH}px;box-sizing:border-box;background:${idx % 2 === 0 ? "#fff" : STRIPE};border-bottom:1px solid ${BORDER};">
      <div style="display:flex;align-items:center;flex-shrink:0;width:${LW}px;border-right:1px solid ${BORDER};
                  padding:0 10px;box-sizing:border-box;font-size:15px;font-weight:700;color:${LBL};letter-spacing:0.3px;overflow:hidden;">
        <span>${lbl}</span>
      </div>
      <div style="display:flex;align-items:center;flex:1;padding:${isMultiLine ? "8px" : "0"} 12px;box-sizing:border-box;${isMultiLine ? "line-height:1.55;" : ""}font-size:16px;font-weight:600;color:${TEXT};">
        <span>${val}</span>
      </div>
    </div>`;
  }).join("");

  // 로고 (상단 헤더용)
  const logoHtmlHeader = logoDataUrl
    ? `<div style="background:#fff;border-radius:4px;padding:2px 8px;display:inline-flex;align-items:center;height:48px;">
         <img src="${logoDataUrl}" style="max-height:44px;max-width:130px;object-fit:contain;" />
       </div>`
    : `<div style="font-size:20px;font-weight:900;color:#fff;font-family:Arial,sans-serif;letter-spacing:2px;">TNE</div>`;

  // 로고 (회사 블록용 - 더 크게)
  const logoHtmlCompany = logoDataUrl
    ? `<img src="${logoDataUrl}" style="max-height:52px;max-width:150px;object-fit:contain;background:#fff;border-radius:4px;padding:4px 8px;" />`
    : `<div style="font-size:22px;font-weight:900;color:#fff;font-family:Arial,sans-serif;letter-spacing:3px;">TNE</div>`;

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

  <!-- OUTER FRAME -->
  <div style="position:absolute;inset:${MARGIN}px;background:#fff;border:1.5px solid ${BORDER};box-shadow:0 2px 12px rgba(0,0,0,0.08);"></div>

  <!-- TOP HEADER BAR -->
  <div style="position:absolute;left:${MARGIN}px;top:${MARGIN}px;width:${PW - MARGIN * 2}px;height:${HDR_H}px;
              background:linear-gradient(135deg,${NAVY} 0%,${NAVY2} 100%);
              display:flex;align-items:center;padding:0 24px;gap:20px;">
    <div style="flex-shrink:0;display:flex;align-items:center;">${logoHtmlHeader}</div>
    <div style="width:1px;height:44px;background:rgba(255,255,255,0.25);flex-shrink:0;"></div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:4px;">
      <div style="font-size:19px;font-weight:800;color:#fff;letter-spacing:1.5px;line-height:1.2;">${data.projectName ? data.projectName + " 태양광발전소" : "태양광발전소"}&nbsp;&nbsp;MODULE ARRAY</div>
      ${data.location ? `<div style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.80);letter-spacing:0.5px;line-height:1.2;">${data.location}</div>` : ""}
    </div>
    <div style="flex-shrink:0;text-align:right;">
      <div style="font-size:10px;color:rgba(255,255,255,0.60);letter-spacing:1px;margin-bottom:3px;">총 발전용량</div>
      <div style="font-size:26px;font-weight:900;color:#7dd3fc;font-family:Arial,sans-serif;letter-spacing:1px;">${formatKw(data.totalCapacityKw)}</div>
    </div>
  </div>

  <!-- MAP AREA -->
  <div style="position:absolute;left:${mapLeft}px;top:${mapTop}px;width:${mapW}px;height:${mapH}px;overflow:hidden;background:#ffffff;">
    ${data.mapImageDataUrl
      ? `<img src="${data.mapImageDataUrl}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;position:absolute;inset:0;margin:auto;" />`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:18px;">지도 이미지</div>`
    }
    <!-- North arrow -->
    <div style="position:absolute;top:14px;left:14px;z-index:5;background:rgba(255,255,255,0.92);border-radius:50%;padding:5px;box-shadow:0 2px 10px rgba(0,0,0,0.22);">${northArrowSvg()}</div>
  </div>

  <!-- VERTICAL DIVIDER -->
  <div style="position:absolute;left:${rpLeft - 8}px;top:${mapTop}px;width:1px;height:${mapH}px;background:${BORDER};"></div>

  <!-- RIGHT PANEL -->
  <div style="position:absolute;left:${rpLeft}px;top:${rpTop}px;width:${RIGHT_W}px;height:${rpH}px;overflow:hidden;display:flex;flex-direction:column;">

    <!-- 사업개요 섹션 -->
    <div style="flex-shrink:0;">
      <div style="display:flex;align-items:center;background:${NAVY};color:#fff;height:40px;padding:0 14px;overflow:hidden;white-space:nowrap;box-sizing:border-box;">
        <div style="flex-shrink:0;width:4px;height:19px;background:#7dd3fc;border-radius:2px;margin-right:9px;"></div>
        <div style="font-size:20px;font-weight:700;letter-spacing:1.5px;">태양광발전소 사업개요</div>
      </div>
      <div style="border:1px solid ${BORDER};border-top:none;">
        ${capRowsHtml}
      </div>
    </div>

    <!-- Spacer -->
    <div style="flex:1;"></div>

    <!-- COMPANY INFO BLOCK -->
    <div style="flex-shrink:0;border:1.5px solid ${BORDER};border-radius:2px;overflow:hidden;">
      <!-- Company header: 단일 레벨 flex + align-items:center -->
      <div style="display:flex;align-items:center;background:${NAVY};height:60px;padding:0 16px;box-sizing:border-box;">
        <div style="flex-shrink:0;display:flex;align-items:center;padding-right:14px;">${logoHtmlCompany}</div>
        <div style="flex-shrink:0;width:1px;height:44px;background:rgba(255,255,255,0.25);"></div>
        <div style="flex-shrink:0;padding-left:14px;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:19px;font-weight:700;color:#fff;letter-spacing:0.5px;line-height:1.3;">태양광 시공 전문기업</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.70);letter-spacing:0.5px;margin-top:4px;">Tech &amp; Engineering Corporation</div>
        </div>
      </div>
      <!-- Contact rows: 단일 레벨 flex row + align-items:center (짧은 한 줄 텍스트는 table-cell의
           baseline 기반 middle 정의보다 flex의 line-box 기준 center가 더 정확히 중앙정렬됨) -->
      ${(() => {
        const cellBase = `display:flex;align-items:center;padding:0 10px;box-sizing:border-box;`;
        const labelCell = (txt: string, w: number) =>
          `<div style="${cellBase}width:${w}px;flex-shrink:0;font-size:13px;font-weight:700;color:${ACCENT};background:${STRIPE};border-right:1px solid ${BORDER};">${txt}</div>`;
        const valueCell = (txt: string, fontSize = 13) =>
          `<div style="${cellBase}flex:1;font-size:${fontSize}px;font-weight:500;color:${TEXT};">${txt}</div>`;
        const row = (inner: string, withBorder: boolean) =>
          `<div style="display:flex;width:100%;height:28px;${withBorder ? `border-bottom:1px solid ${BORDER};` : ""}">${inner}</div>`;

        return [
          row(
            labelCell("Tel", 70) + valueCell("055 291 5567") +
            `<div style="${cellBase}width:48px;flex-shrink:0;font-size:13px;font-weight:700;color:${ACCENT};background:${STRIPE};border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">Fax</div>` +
            valueCell("055 291 5568"),
            true
          ),
          row(labelCell("E-mail", 70) + valueCell("tnekbt1041@naver.com"), true),
          row(labelCell("Web", 70) + valueCell("www.tneepc.com"), true),
          row(labelCell("주소", 70) + valueCell("경남 창원시 의창구 동읍 신촌본포로426 1동", 12), false),
        ].join("");
      })()}
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
    if (res.ok) {
      const blob = await res.blob();
      logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
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
      setTimeout(resolve, 5000);
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
export async function savePdfFromImage(imageDataUrl: string, filename?: string): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  pdf.addImage(imageDataUrl, "JPEG", 0, 0, 420, 297);
  pdf.save(filename ?? "태양광_배치도.pdf");
}
