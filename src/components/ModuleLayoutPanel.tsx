"use client";

import { useState, RefObject } from "react";
import { ModuleConfig, MODULE_LAYOUT_LIMIT } from "@/lib/moduleLayout";
import { KakaoMapHandle } from "@/components/KakaoMap";

interface Coord {
  lat: number;
  lng: number;
}

interface ModuleLayoutPanelProps {
  polygons: { area: number; coords: Coord[]; type: 'inclusion' | 'exclusion'; angle?: number }[];
  moduleConfig: ModuleConfig;
  onModuleConfigChange: (config: ModuleConfig) => void;
  moduleCounts: number[];
  mapRef?: RefObject<KakaoMapHandle | null>;
  zoneLabels?: string[];
  onZoneLabelChange?: (index: number, label: string) => void;
  onZoneAngleChange?: (index: number, angle: number) => void;
  onZoneRemove?: (index: number) => void;
}

function pointInPolygon(point: Coord, polygon: Coord[]): boolean {
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

function getCentroid(coords: Coord[]): Coord {
  return {
    lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
  };
}

const POLYGON_COLORS = ["#0066ff", "#ff6600", "#9900cc", "#00aa66", "#cc0033"];

const MODULE_PRESETS = [
  { label: "JINKO 660W",     wattage: 660, width: 1134, height: 2382 },
  { label: "TRINA 730W",     wattage: 730, width: 1303, height: 2384 },
  { label: "LONGI 660W",     wattage: 660, width: 1134, height: 2382 },
  { label: "한화큐셀 640W",   wattage: 640, width: 1134, height: 2382 },
  { label: "한화큐셀 730W",   wattage: 730, width: 1303, height: 2384 },
];

export default function ModuleLayoutPanel({
  polygons,
  moduleConfig,
  onModuleConfigChange,
  moduleCounts,
  mapRef,
  zoneLabels,
  onZoneLabelChange,
  onZoneAngleChange,
  onZoneRemove,
}: ModuleLayoutPanelProps) {
  const [peakSunHours, setPeakSunHours] = useState(3.5);
  const [systemEfficiency, setSystemEfficiency] = useState(85);
  const [modulesPerString, setModulesPerString] = useState(0);
  const [printState, setPrintState] = useState<'idle' | 'capturing' | 'preview'>('idle');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("태양광 발전소");
  const [location, setLocation] = useState("");

  const inclusions = polygons.filter(p => p.type === 'inclusion');
  const exclusions = polygons.filter(p => p.type === 'exclusion');

  const exclusionsByInclusion = inclusions.map(inc =>
    exclusions.filter(exc => pointInPolygon(getCentroid(exc.coords), inc.coords))
  );

  const inclusionNetAreas = inclusions.map((inc, i) => {
    const exclArea = exclusionsByInclusion[i].reduce((sum, e) => sum + e.area, 0);
    return Math.max(0, inc.area - exclArea);
  });

  const totalArea = Math.max(0, inclusions.reduce((s, p) => s + p.area, 0) - exclusions.reduce((s, p) => s + p.area, 0));

  // 결선 조정 계산
  const rawCounts = inclusions.map((_, i) => moduleCounts[i] ?? 0);
  const totalRawModules = rawCounts.reduce((s, n) => s + n, 0);
  const adjustedCounts = rawCounts.map(raw =>
    modulesPerString > 1 ? Math.floor(raw / modulesPerString) * modulesPerString : raw
  );
  const totalModules = adjustedCounts.reduce((s, n) => s + n, 0);
  const totalStrings = modulesPerString > 1 ? totalModules / modulesPerString : 0;

  const capacityKw = (totalModules * moduleConfig.moduleWattage) / 1000;
  const annualMwh = (capacityKw * peakSunHours * 365 * systemEfficiency / 100) / 1000;
  const isAtLimit = totalRawModules >= MODULE_LAYOUT_LIMIT;

  const set = (patch: Partial<ModuleConfig>) =>
    onModuleConfigChange({ ...moduleConfig, ...patch });

  const buildPdfData = async () => {
    const mapImageDataUrl = await mapRef!.current!.captureMapImage();
    const selectedPreset = MODULE_PRESETS.find(p =>
      p.width === moduleConfig.moduleWidth &&
      p.height === moduleConfig.moduleHeight &&
      p.wattage === moduleConfig.moduleWattage
    );
    return {
      mapImageDataUrl,
      zones: inclusions.map((inc, i) => ({
        label: zoneLabels?.[i] ?? String.fromCharCode(65 + i) + "구역",
        color: POLYGON_COLORS[i % POLYGON_COLORS.length],
        moduleCount: adjustedCounts[i] ?? 0,
        capacityKw: ((adjustedCounts[i] ?? 0) * moduleConfig.moduleWattage) / 1000,
        angle: inc.angle ?? 0,
      })),
      totalModules,
      totalCapacityKw: capacityKw,
      moduleWidth: moduleConfig.moduleWidth,
      moduleHeight: moduleConfig.moduleHeight,
      moduleWattage: moduleConfig.moduleWattage,
      moduleMaker: selectedPreset?.label ?? "",
      modulesPerString,
      totalStrings,
      rowSpacing: moduleConfig.rowSpacing,
      colSpacing: moduleConfig.colSpacing,
      location,
      projectName,
    };
  };

  const handlePrint = async () => {
    if (!mapRef?.current) return;
    setPrintState('capturing');
    try {
      const { generatePreviewImage } = await import("@/lib/generatePdf");
      const data = await buildPdfData();
      const url = await generatePreviewImage(data);
      setPreviewDataUrl(url);
      setPrintState('preview');
    } catch {
      setPrintState('idle');
    }
  };

  const handleConfirmPrint = async () => {
    if (!previewDataUrl) return;
    const { savePdfFromImage } = await import("@/lib/generatePdf");
    await savePdfFromImage(previewDataUrl);
    setPrintState('idle');
    setPreviewDataUrl(null);
  };

  const handleCancelPreview = () => {
    setPrintState('idle');
    setPreviewDataUrl(null);
  };

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">

      {/* PDF 정보 입력 */}
      <div className="bg-white border rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-600 mb-3">PDF 도면 정보</p>
        <div className="space-y-2.5">
          <LabelRow label="프로젝트명">
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="태양광 발전소"
              className="text-xs border rounded px-1.5 py-0.5 outline-none focus:border-blue-400 flex-1 min-w-0"
            />
          </LabelRow>
          <LabelRow label="설치 위치">
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="예) 전남 해남군 산이면 00번지"
              className="text-xs border rounded px-1.5 py-0.5 outline-none focus:border-blue-400 flex-1 min-w-0"
            />
          </LabelRow>
        </div>
      </div>

      {/* PDF 인쇄 버튼 */}
      {mapRef && totalModules > 0 && (
        <button
          onClick={handlePrint}
          disabled={printState !== 'idle'}
          className="w-full py-2 bg-slate-700 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {printState === 'capturing' ? "캡처 중..." : "📄 도면 PDF 인쇄"}
        </button>
      )}

      {/* 미리보기 모달 */}
      {printState === 'preview' && previewDataUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
          onClick={handleCancelPreview}
        >
          <div
            className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxWidth: "95vw", maxHeight: "95vh" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
              <span className="font-bold text-gray-800 text-base">도면 미리보기</span>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelPreview}
                  className="px-4 py-1.5 text-sm rounded bg-gray-200 hover:bg-gray-300 font-medium"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirmPrint}
                  className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-medium"
                >
                  PDF 저장
                </button>
              </div>
            </div>
            {/* 미리보기 이미지 */}
            <div className="flex-1 bg-gray-300 overflow-hidden flex items-center justify-center p-2" style={{ minHeight: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewDataUrl}
                alt="도면 미리보기"
                className="shadow-xl"
                style={{ maxWidth: "100%", maxHeight: "calc(95vh - 70px)", objectFit: "contain", display: "block" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 모듈 규격 */}
      <div className="bg-white border rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-600 mb-3">모듈 규격</p>
        <div className="space-y-2.5">
          {/* 메이커 프리셋 */}
          <LabelRow label="메이커">
            <select
              value={MODULE_PRESETS.find(p =>
                p.width === moduleConfig.moduleWidth &&
                p.height === moduleConfig.moduleHeight &&
                p.wattage === moduleConfig.moduleWattage
              )?.label ?? ""}
              onChange={e => {
                const preset = MODULE_PRESETS.find(p => p.label === e.target.value);
                if (preset) set({ moduleWidth: preset.width, moduleHeight: preset.height, moduleWattage: preset.wattage });
              }}
              className="text-xs border rounded px-1.5 py-0.5 outline-none focus:border-blue-400 bg-white w-32"
            >
              <option value="">직접 입력</option>
              {MODULE_PRESETS.map(p => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
            </select>
          </LabelRow>
          <LabelRow label="크기 (W×H)">
            <div className="flex items-center gap-1">
              <NumInput value={moduleConfig.moduleWidth} min={500} max={3000}
                onChange={v => set({ moduleWidth: v })} />
              <span className="text-xs text-gray-400">×</span>
              <NumInput value={moduleConfig.moduleHeight} min={500} max={3000}
                onChange={v => set({ moduleHeight: v })} />
              <span className="text-xs text-gray-400">mm</span>
            </div>
          </LabelRow>
          <LabelRow label="1장 출력">
            <div className="flex items-center gap-1">
              <NumInput value={moduleConfig.moduleWattage} min={100} max={1000} step={5}
                onChange={v => set({ moduleWattage: v })} />
              <span className="text-xs text-gray-400">W</span>
            </div>
          </LabelRow>
        </div>
      </div>

      {/* 배치 설정 */}
      <div className="bg-white border rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-600 mb-3">배치 설정</p>
        <div className="space-y-2.5">
          <LabelRow label="행 간격">
            <div className="flex items-center gap-1">
              <NumInput value={moduleConfig.rowSpacing} min={0} max={5000} step={10}
                onChange={v => set({ rowSpacing: v })} />
              <span className="text-xs text-gray-400">mm</span>
            </div>
          </LabelRow>
          <LabelRow label="열 간격">
            <div className="flex items-center gap-1">
              <NumInput value={moduleConfig.colSpacing} min={0} max={1000} step={5}
                onChange={v => set({ colSpacing: v })} />
              <span className="text-xs text-gray-400">mm</span>
            </div>
          </LabelRow>
          <LabelRow label="세로 최대 장수">
            <div className="flex items-center gap-1">
              <NumInput value={moduleConfig.maxModulesPerColumn} min={1} max={50} step={1}
                onChange={v => set({ maxModulesPerColumn: v })} />
              <span className="text-xs text-gray-400">장</span>
            </div>
          </LabelRow>
        </div>
      </div>

      {/* 발전량 계산 파라미터 */}
      <div className="bg-white border rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-600 mb-3">발전량 파라미터</p>
        <div className="space-y-3">
          <SliderParam
            label={`일평균 일조시간 ${peakSunHours}h`}
            min={2.5} max={5} step={0.1}
            value={peakSunHours} onChange={setPeakSunHours}
          />
          <SliderParam
            label={`시스템 효율 ${systemEfficiency}%`}
            min={70} max={95} step={1}
            value={systemEfficiency} onChange={setSystemEfficiency}
          />
        </div>
      </div>

      {/* 전기 결선 설정 */}
      <div className="bg-white border rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-600 mb-3">전기 결선 설정</p>
        <LabelRow label="스트링 결선 수량">
          <div className="flex items-center gap-1">
            <NumInput value={modulesPerString} min={0} max={100} step={1}
              onChange={setModulesPerString} />
            <span className="text-xs text-gray-400">개/스트링</span>
          </div>
        </LabelRow>
        <p className="text-xs text-gray-400 mt-2">0 입력 시 결선 조정 없음</p>
      </div>

      {/* 선택 영역 */}
      {inclusions.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">
            선택 영역{exclusions.length > 0 && ` (제외 ${exclusions.length}개 반영)`}
          </p>
          <p className="text-xl font-bold text-blue-600">
            {Math.round(totalArea).toLocaleString("ko")} m²
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{(totalArea / 10000).toFixed(3)} ha</p>

          <div className="mt-2 pt-2 border-t space-y-1.5">
            {inclusions.map((p, i) => {
              const color = POLYGON_COLORS[i % POLYGON_COLORS.length];
              const label = zoneLabels?.[i] ?? String.fromCharCode(65 + i) + "구역";
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span style={{ background: color }} className="inline-block w-2 h-2 rounded-full flex-shrink-0" />
                  {onZoneLabelChange ? (
                    <select
                      value={label}
                      onChange={e => onZoneLabelChange(i, e.target.value)}
                      className="text-xs border rounded px-1 py-0.5 flex-1 min-w-0 outline-none focus:border-blue-400 bg-white"
                    >
                      {['A','B','C','D','E','F','G'].map(l => (
                        <option key={l} value={`${l}구역`}>{l}구역</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-600 flex-1">{label}</span>
                  )}
                  {inclusions.length > 1 && (
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {Math.round(inclusionNetAreas[i]).toLocaleString("ko")} m²
                    </span>
                  )}
                  {onZoneRemove && (
                    <button
                      onClick={() => onZoneRemove(i)}
                      className="text-gray-300 hover:text-red-500 text-xs leading-none flex-shrink-0 px-0.5"
                      title="구역 삭제"
                    >✕</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 배치 결과 */}
      {moduleConfig.enabled ? (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">배치 결과</p>
          {totalRawModules > 0 ? (
            <div className="space-y-2">
              <ResultRow label="배치 모듈 수"
                value={`${totalRawModules.toLocaleString("ko")} 개`
                  + (isAtLimit ? " ⚠️" : "")} />
              {modulesPerString > 1 && (
                <>
                  <ResultRow label="결선 수량"
                    value={`${modulesPerString} 개/스트링`} />
                  <ResultRow label="확정 모듈 수"
                    value={`${totalModules.toLocaleString("ko")} 개 (${totalStrings}스트링)`}
                    highlight />
                </>
              )}
              <ResultRow label="패널 면적"
                value={`${(totalModules * moduleConfig.moduleWidth * moduleConfig.moduleHeight / 1_000_000).toFixed(1)} m²`} />
              <ResultRow label="설치 용량"
                value={capacityKw >= 1000
                  ? (capacityKw / 1000).toFixed(2) + " MW"
                  : capacityKw.toFixed(2) + " kW"}
                highlight />
              <ResultRow label="연간 예상 발전량" value={`${annualMwh.toFixed(1)} MWh`} />
              <ResultRow label="연간 CO₂ 절감"
                value={`${(annualMwh * 1000 * 0.4581 / 1000).toFixed(1)} 톤`} />
            </div>
          ) : inclusions.length > 0 ? (
            <p className="text-xs text-gray-400">배치 계산 중...</p>
          ) : (
            <p className="text-xs text-gray-400">영역을 그리면 자동 배치됩니다</p>
          )}

          {/* 영역별 내역 */}
          {inclusions.length > 1 && totalRawModules > 0 && (
            <div className="mt-3 pt-3 border-t space-y-2">
              <p className="text-xs font-semibold text-gray-500">영역별 내역</p>

              {/* 구역별 합계 요약 - 같은 이름끼리 합산 */}
              <div className="bg-white rounded p-2 border space-y-1">
                {(() => {
                  const grouped = new Map<string, { kw: number; color: string }>();
                  inclusions.forEach((_, i) => {
                    const cnt = adjustedCounts[i] ?? 0;
                    const kw = (cnt * moduleConfig.moduleWattage) / 1000;
                    const lbl = zoneLabels?.[i] ?? String.fromCharCode(65 + i) + "구역";
                    const color = POLYGON_COLORS[i % POLYGON_COLORS.length];
                    if (!grouped.has(lbl)) {
                      grouped.set(lbl, { kw, color });
                    } else {
                      grouped.get(lbl)!.kw += kw;
                    }
                  });
                  return Array.from(grouped.entries()).map(([lbl, { kw, color }]) => (
                    <div key={lbl} className="flex justify-between items-center">
                      <span className="text-xs font-bold" style={{ color }}>{lbl} 합계</span>
                      <span className="text-xs font-bold" style={{ color }}>
                        {kw >= 1000 ? (kw / 1000).toFixed(2) + " MW" : kw.toFixed(2) + " kW"}
                      </span>
                    </div>
                  ));
                })()}
              </div>

              {inclusions.map((_, i) => {
                const rawCnt = rawCounts[i] ?? 0;
                const cnt = adjustedCounts[i] ?? 0;
                const kw = (cnt * moduleConfig.moduleWattage) / 1000;
                const color = POLYGON_COLORS[i % POLYGON_COLORS.length];
                const polyAngle = inclusions[i]?.angle;
                return (
                  <div key={i} className="bg-white rounded p-2 border">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span style={{ background: color }} className="inline-block w-2 h-2 rounded-full" />
                      <span className="text-xs font-medium text-gray-600">
                        {zoneLabels?.[i] ?? String.fromCharCode(65 + i) + "구역"}
                      </span>
                      {polyAngle !== undefined && onZoneAngleChange ? (
                        <div className="flex items-center gap-0.5 ml-1">
                          <input
                            type="number"
                            value={polyAngle.toFixed(1)}
                            min={0} max={360} step={0.5}
                            onChange={e => onZoneAngleChange(i, parseFloat(e.target.value) || 0)}
                            className="text-xs border rounded px-1 py-0 w-16 text-center outline-none focus:border-blue-400"
                          />
                          <span className="text-xs text-gray-400">°</span>
                        </div>
                      ) : polyAngle !== undefined ? (
                        <span className="text-xs text-gray-400 ml-1">{polyAngle.toFixed(1)}°</span>
                      ) : null}
                      <div className="ml-auto text-right">
                        {modulesPerString > 1 && rawCnt !== cnt && (
                          <span className="text-xs text-gray-400 line-through mr-1">{rawCnt.toLocaleString("ko")}</span>
                        )}
                        <span className="text-xs text-purple-600 font-semibold">{cnt.toLocaleString("ko")} 개</span>
                        {modulesPerString > 1 && cnt > 0 && (
                          <span className="text-xs text-gray-400 ml-1">({cnt / modulesPerString}스트링)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">설치 용량</span>
                      <span className="text-xs font-bold" style={{ color }}>
                        {kw >= 1000 ? (kw / 1000).toFixed(2) + " MW" : kw.toFixed(2) + " kW"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isAtLimit && (
            <p className="text-xs text-orange-500 mt-2">
              ⚠️ 최대 {MODULE_LAYOUT_LIMIT.toLocaleString()}개 제한 — 실제 배치 수가 더 많을 수 있습니다
            </p>
          )}
        </div>
      ) : (
        inclusions.length > 0 && (
          <div className="bg-gray-50 border rounded-lg p-4 text-center">
            <p className="text-xs text-gray-400">모듈 배치가 꺼져 있습니다</p>
            <button
              onClick={() => set({ enabled: true })}
              className="mt-2 text-xs px-3 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              배치 켜기
            </button>
          </div>
        )
      )}

      {inclusions.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center px-4">
          지도에서 <strong className="text-blue-500 mx-1">영역 추가</strong> 버튼으로<br />
          폴리곤을 그리면 모듈이<br />자동으로 배치됩니다
        </div>
      )}
    </div>
  );
}

function NumInput({
  value, min, max, step = 1, onChange,
}: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(+e.target.value)}
      className="w-16 border rounded px-1 py-0.5 text-xs text-center outline-none focus:border-purple-400"
    />
  );
}

function LabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      {children}
    </div>
  );
}

function SliderParam({
  label, min, max, step, value, onChange,
}: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500 mt-0.5"
      />
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-purple-600 text-base" : "text-gray-700"}`}>
        {value}
      </span>
    </div>
  );
}
