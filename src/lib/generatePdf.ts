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
  exclusionLegend?: { reason: string; color: string }[];
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

export interface TextOverlayItem {
  id: string;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "right" | "center";
  fontFamily?: string;
  /** placeholder div의 CSS padding과 맞추기 위한 가로 여백(px, 비스케일). left align이면 좌측에서, right align이면 우측에서 안쪽으로 띄움. */
  padX?: number;
}

/**
 * html2canvas의 table-cell/중첩flex/absolute+flex 기반 수직 중앙정렬 모두 격리 테스트에서는
 * 정상으로 보였지만, 실제 배포 환경(무거운 페이지 + 실행 중인 Leaflet 지도 등)에서 캡처하면
 * 텍스트가 박스 중심에서 벗어나는 것이 Playwright + 실제 html2canvas 렌더링 + ink-centroid
 * 픽셀 측정 + 실제 사용자 PDF 파일 직접 측정으로 반복 확인됨 (2026-06-30).
 * HTML/CSS 자체는 두 실행 컨텍스트에서 동일함을 직접 dump해서 확인했고, getBoundingClientRect로
 * 읽은 박스 위치/크기는 두 컨텍스트 모두 정확함도 확인함 — 즉 "박스 배치"는 항상 정확하고,
 * html2canvas가 그 박스 안의 "텍스트"를 그리는 단계에서만 실행 컨텍스트에 따라 다르게 깨짐.
 *
 * 해결: 텍스트가 들어갈 자리에는 빈 박스(배경/테두리만 있는 placeholder, id 부여)만 HTML/CSS로
 * 배치하고, html2canvas가 캡처를 마친 뒤 해당 박스들의 getBoundingClientRect()를 읽어
 * canvas 2D API(fillText, textBaseline:'middle')로 직접 텍스트를 그린다. 박스 배치(레이아웃)는
 * 기존처럼 HTML/CSS가 담당하되, 텍스트 렌더링만은 html2canvas를 완전히 우회한다.
 */
export function buildHtml(
  data: PdfReportData,
  logoDataUrl: string | null
): { html: string; overlays: TextOverlayItem[] } {
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

  const overlays: TextOverlayItem[] = [];
  const reg = (item: TextOverlayItem) => { overlays.push(item); return item.id; };

  // 모듈 규격
  const moduleWidthText = data.moduleWidth.toLocaleString("ko");
  const moduleHeightText = data.moduleHeight.toLocaleString("ko");
  const moduleSpecText = data.moduleMaker
    ? `${data.moduleMaker} : ${moduleWidthText}×${moduleHeightText} ㎜`
    : `${data.moduleWattage}W : ${moduleWidthText}×${moduleHeightText} ㎜`;

  // 모듈 구성 2줄
  const moduleConfigLines = (data.modulesPerString > 0 && data.totalStrings > 0)
    ? [
        `${data.modulesPerString}직렬 × ${data.totalStrings}병렬 = ${data.totalModules.toLocaleString("ko")}장 × ${data.moduleWattage}W`,
        `= ${formatKw(data.totalCapacityKw)}`,
      ]
    : [`${data.totalModules.toLocaleString("ko")}장`];

  const inverterText = calcInverters(data.totalCapacityKw);

  // 방위각 min/max
  const angles = zones.map(z => z.angle).filter(a => isFinite(a));
  const angleText = angles.length === 0 ? "-"
    : angles.every(a => a === angles[0]) ? `${angles[0].toFixed(1)}°`
    : `최소 ${Math.min(...angles).toFixed(1)}° / 최대 ${Math.max(...angles).toFixed(1)}°`;

  // ── Capacity table (프로젝트명·설치위치 포함) ──
  const capRows: { label: string; lines: string[]; big?: boolean }[] = [
    { label: "프로젝트명",   lines: [data.projectName || "태양광 발전소"] },
    { label: "설치 위치",    lines: [data.location || "-"] },
    { label: "총 발전용량",  lines: [formatKw(data.totalCapacityKw)], big: true },
    { label: "모듈 규격",    lines: [moduleSpecText] },
    { label: "모듈 총 수량", lines: [`${data.totalModules.toLocaleString("ko")} 장`] },
    { label: "모듈 구성",    lines: moduleConfigLines },
    { label: "모듈 방위각",  lines: [angleText] },
    { label: "인버터 구성",  lines: [inverterText] },
  ];

  const capRowH = Math.max(58, Math.floor((infoH * 0.72 - 36) / capRows.length));
  const LW = 150;

  const capRowsHtml = capRows.map((row, idx) => {
    const labelId = `ov-cap-label-${idx}`;
    const valueId = `ov-cap-value-${idx}`;
    reg({ id: labelId, lines: [row.label], fontSize: 17, fontWeight: 700, color: LBL, align: "left", padX: 14 });
    reg({
      id: valueId,
      lines: row.lines,
      fontSize: row.big ? 24 : 18,
      fontWeight: row.big ? 900 : 600,
      color: row.big ? ACCENT : TEXT,
      align: "left",
      padX: 8,
    });
    return `
    <div style="position:relative;width:100%;height:${capRowH}px;box-sizing:border-box;background:${idx % 2 === 0 ? "#fff" : STRIPE};border-bottom:1px solid ${BORDER};">
      <div id="${labelId}" style="position:absolute;left:0;top:0;bottom:0;width:${LW}px;border-right:1px solid ${BORDER};padding:0 10px;box-sizing:border-box;overflow:hidden;"></div>
      <div id="${valueId}" style="position:absolute;left:${LW}px;top:0;bottom:0;right:0;padding:0 12px;box-sizing:border-box;"></div>
    </div>`;
  }).join("");

  // ── 설치불가 구역 범례 ──
  const legendItems = (data.exclusionLegend ?? []).filter(e => e.reason);
  let legendHtml = "";
  if (legendItems.length > 0) {
    const legendRowsHtml = legendItems.map((item, i) => {
      const textId = `ov-legend-text-${i}`;
      reg({ id: textId, lines: [item.reason], fontSize: 17, fontWeight: 700, color: item.color, align: "left" });
      return `<div style="display:flex;align-items:center;height:38px;padding:0 14px;box-sizing:border-box;">
        <div style="width:30px;height:22px;background:${item.color};border-radius:4px;opacity:0.85;flex-shrink:0;margin-right:10px;"></div>
        <div id="${textId}" style="flex:1;height:22px;"></div>
      </div>`;
    }).join("");
    legendHtml = `<div style="padding:12px 0 4px;">
      ${legendRowsHtml}
    </div>`;
  }

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

  // 상단 헤더바 텍스트
  reg({ id: "ov-hdr-title", lines: [`${data.projectName ? data.projectName + " 태양광발전소" : "태양광발전소"}  MODULE ARRAY`], fontSize: 22, fontWeight: 800, color: "#fff", align: "left" });
  if (data.location) {
    reg({ id: "ov-hdr-loc", lines: [data.location], fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", align: "left" });
  }
  reg({ id: "ov-hdr-kwlabel", lines: ["총 발전용량"], fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.60)", align: "right" });
  reg({ id: "ov-hdr-kwvalue", lines: [formatKw(data.totalCapacityKw)], fontSize: 26, fontWeight: 900, color: "#7dd3fc", align: "right", fontFamily: "Arial,sans-serif" });

  // 사업개요 타이틀
  reg({ id: "ov-section-title", lines: ["태양광발전소 사업개요"], fontSize: 20, fontWeight: 700, color: "#fff", align: "left" });

  // 회사 헤더 텍스트
  reg({ id: "ov-co-title", lines: ["태양광발전소 시공 전문기업"], fontSize: 21, fontWeight: 700, color: "#fff", align: "left" });
  reg({ id: "ov-co-subtitle", lines: ["Tech & Engineering Corporation"], fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.70)", align: "left" });

  // 연락처 행
  const simpleContactRow = (idPrefix: string, lbl: string, val: string, withBorder: boolean, fontSize = 15) => {
    reg({ id: `ov-${idPrefix}-label`, lines: [lbl], fontSize: 15, fontWeight: 700, color: ACCENT, align: "left", padX: 14 });
    reg({ id: `ov-${idPrefix}-value`, lines: [val], fontSize, fontWeight: 500, color: TEXT, align: "left", padX: 14 });
    return `<div style="position:relative;width:100%;height:28px;box-sizing:border-box;${withBorder ? `border-bottom:1px solid ${BORDER};` : ""}">
      <div id="ov-${idPrefix}-label" style="position:absolute;left:0;top:0;bottom:0;width:70px;padding:0 10px;box-sizing:border-box;background:${STRIPE};border-right:1px solid ${BORDER};"></div>
      <div id="ov-${idPrefix}-value" style="position:absolute;left:70px;top:0;bottom:0;right:0;padding:0 10px;box-sizing:border-box;"></div>
    </div>`;
  };

  const telFaxRowHtml = (() => {
    const posCell = (id: string, text: string, isLabel: boolean, left: string, width: string, opts: { borderLeft?: boolean } = {}) => {
      reg({ id, lines: [text], fontSize: 15, fontWeight: isLabel ? 700 : 500, color: isLabel ? ACCENT : TEXT, align: "left", padX: 14 });
      return `<div id="${id}" style="position:absolute;left:${left};top:0;bottom:0;width:${width};padding:0 10px;box-sizing:border-box;${isLabel ? `background:${STRIPE};` : ""}${opts.borderLeft ? `border-left:1px solid ${BORDER};` : ""}border-right:${isLabel ? `1px solid ${BORDER}` : "none"};"></div>`;
    };
    const half = (idPrefix: string, lbl: string, labelW: number, val: string, leftPct: string, borderLeft: boolean) =>
      posCell(`ov-${idPrefix}-label`, lbl, true, leftPct, `${labelW}px`, { borderLeft }) +
      posCell(`ov-${idPrefix}-value`, val, false, `calc(${leftPct} + ${labelW}px)`, `calc(50% - ${labelW}px)`);
    return `<div style="position:relative;width:100%;height:28px;box-sizing:border-box;border-bottom:1px solid ${BORDER};">
      ${half("tel", "Tel", 70, "055 291 5567", "0%", false)}${half("fax", "Fax", 48, "055 291 5568", "50%", true)}
    </div>`;
  })();

  const contactRowsHtmlFinal = [
    telFaxRowHtml,
    simpleContactRow("email", "E-mail", "tnekbt1041@naver.com", true),
    simpleContactRow("web", "Web", "www.tneepc.com", true),
    simpleContactRow("addr", "주소", "경남 창원시 의창구 동읍 신촌본포로426 1동", false, 14),
  ].join("");

  const html = `<!DOCTYPE html>
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
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:4px;margin-top:-4px;">
      <div id="ov-hdr-title" style="height:28px;"></div>
      ${data.location ? `<div id="ov-hdr-loc" style="height:16px;"></div>` : ""}
    </div>
    <div style="flex-shrink:0;text-align:right;">
      <div id="ov-hdr-kwlabel" style="height:13px;margin-bottom:3px;"></div>
      <div id="ov-hdr-kwvalue" style="height:30px;"></div>
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
        <div id="ov-section-title" style="flex:1;height:24px;"></div>
      </div>
      <div style="border:1px solid ${BORDER};border-top:none;">
        ${capRowsHtml}
      </div>
    </div>

    <!-- Legend / Spacer -->
    <div style="flex:1;overflow:hidden;">${legendHtml}</div>

    <!-- COMPANY INFO BLOCK -->
    <div style="flex-shrink:0;border:1.5px solid ${BORDER};border-radius:2px;overflow:hidden;">
      <div style="display:flex;align-items:center;background:${NAVY};height:60px;padding:0 16px;box-sizing:border-box;">
        <div style="flex-shrink:0;display:flex;align-items:center;padding-right:14px;">${logoHtmlCompany}</div>
        <div style="flex-shrink:0;width:1px;height:44px;background:rgba(255,255,255,0.25);"></div>
        <div style="flex-shrink:0;padding-left:14px;display:flex;flex-direction:column;justify-content:center;">
          <div id="ov-co-title" style="height:24px;"></div>
          <div id="ov-co-subtitle" style="height:14px;margin-top:4px;"></div>
        </div>
      </div>
      ${contactRowsHtmlFinal}
    </div>

  </div>

</div>
</body>
</html>`;

  return { html, overlays };
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

  const SCALE = 2;

  try {
    const { html, overlays } = buildHtml(data, logoDataUrl);
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(html);
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
      scale: SCALE,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 1680,
      height: 1188,
      backgroundColor: "#ffffff",
    });

    // html2canvas의 텍스트 렌더링을 우회: 미리 비워둔 placeholder 박스의 실제 위치를
    // getBoundingClientRect로 읽어 canvas 2D API로 직접 텍스트를 그린다.
    // html2canvas가 중첩된 overflow:hidden 처리 과정에서 남긴 clip/transform 상태가
    // 캡처 완료 후에도 컨텍스트에 남아있을 수 있어, 깨끗한 새 캔버스에 결과 이미지를
    // 복사한 뒤 그 위에 텍스트를 그린다 (clip 잔존 가능성을 원천 차단).
    const cleanCanvas = document.createElement("canvas");
    cleanCanvas.width = canvas.width;
    cleanCanvas.height = canvas.height;
    const ctx = cleanCanvas.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);

    const fontFamily = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif";
    for (const item of overlays) {
      const target = iframe.contentDocument!.getElementById(item.id);
      if (!target) continue;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const fontSizePx = item.fontSize * SCALE;
      ctx.font = `${item.fontWeight} ${fontSizePx}px ${item.fontFamily || fontFamily}`;
      ctx.fillStyle = item.color;
      ctx.textBaseline = "middle";
      ctx.textAlign = item.align;

      const lineHeight = fontSizePx * 1.3;
      const totalHeight = lineHeight * item.lines.length;
      const rectCenterY = (rect.top + rect.height / 2) * SCALE;
      let y = rectCenterY - totalHeight / 2 + lineHeight / 2;

      const padX = item.padX || 0;
      const x = item.align === "right"
        ? (rect.right - padX) * SCALE
        : item.align === "center"
          ? (rect.left + rect.width / 2) * SCALE
          : (rect.left + padX) * SCALE;

      for (const line of item.lines) {
        ctx.fillText(line, x, y);
        y += lineHeight;
      }
    }

    return cleanCanvas.toDataURL("image/jpeg", 0.97);
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
