"use client";

import { useState } from "react";
import { calculateSolar } from "@/lib/solar";

interface Coord {
  lat: number;
  lng: number;
}

interface ResultPanelProps {
  polygons: { area: number; coords: Coord[]; type: 'inclusion' | 'exclusion' }[];
}

const POLYGON_COLORS = ["#0066ff", "#ff6600", "#9900cc", "#00aa66", "#cc0033"];

function getCentroid(coords: Coord[]): Coord {
  return {
    lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
    lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
  };
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

export default function ResultPanel({ polygons }: ResultPanelProps) {
  const [coverageRatio, setCoverageRatio] = useState(60);
  const [panelEfficiency, setPanelEfficiency] = useState(20);
  const [peakSunHours, setPeakSunHours] = useState(3.5);
  const [systemEfficiency, setSystemEfficiency] = useState(85);
  const [projectName, setProjectName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const inclusions = polygons.filter(p => p.type === 'inclusion');
  const exclusions = polygons.filter(p => p.type === 'exclusion');

  const exclusionsByInclusion: (typeof exclusions)[] = inclusions.map(inc =>
    exclusions.filter(exc => pointInPolygon(getCentroid(exc.coords), inc.coords))
  );
  const unattributedExclusions = exclusions.filter(exc =>
    !inclusions.some(inc => pointInPolygon(getCentroid(exc.coords), inc.coords))
  );

  const inclusionNetAreas = inclusions.map((inc, i) => {
    const exclArea = exclusionsByInclusion[i].reduce((sum, e) => sum + e.area, 0);
    return Math.max(0, inc.area - exclArea);
  });

  const inclusionArea = inclusions.reduce((sum, p) => sum + p.area, 0);
  const exclusionArea = exclusions.reduce((sum, p) => sum + p.area, 0);
  const totalArea = Math.max(0, inclusionArea - exclusionArea);
  const firstCoords = inclusions.length > 0 ? inclusions[0].coords : [];

  const result =
    totalArea > 0
      ? calculateSolar({
          areaSqm: totalArea,
          coverageRatio: coverageRatio / 100,
          panelEfficiency: panelEfficiency / 100,
          peakSunHours,
          systemEfficiency: systemEfficiency / 100,
        })
      : null;

  const handleSave = async () => {
    if (!result || !projectName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim(),
          area_m2: totalArea,
          coordinates: firstCoords,
          coverage_ratio: coverageRatio / 100,
          panel_efficiency: panelEfficiency / 100,
          capacity_kw: result.capacityKw,
          annual_generation_kwh: result.annualGenerationKwh,
          polygons_data: polygons,
        }),
      });
      if (res.ok) {
        setSaveMessage("저장 완료!");
        setProjectName("");
        setTimeout(() => setSaveMessage(""), 3000);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 h-full overflow-y-auto">
      {/* 면적 */}
      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-xs text-gray-500 mb-1">
          {inclusions.length > 1 ? `유효 면적 (${inclusions.length}개 영역 합산)` : "선택 면적"}
          {exclusions.length > 0 && ` − 제외 ${exclusions.length}개`}
        </p>
        <p className="text-2xl font-bold text-blue-600">
          {totalArea > 0
            ? `${Math.round(totalArea).toLocaleString("ko")} m²`
            : "—"}
        </p>
        {totalArea > 0 && (
          <p className="text-xs text-gray-400 mt-0.5">
            {(totalArea / 10000).toFixed(2)} ha
          </p>
        )}
        {(inclusions.length > 1 || exclusions.length > 0) && (
          <div className="mt-2 space-y-1 border-t pt-2">
            {inclusions.map((p, i) => {
              const color = POLYGON_COLORS[i % POLYGON_COLORS.length];
              const excls = exclusionsByInclusion[i];
              const netArea = inclusionNetAreas[i];
              return (
                <div key={`inc-${i}`}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span style={{ background: color }} className="inline-block w-2 h-2 rounded-full" />
                      영역 {i + 1}
                    </span>
                    <span className="text-xs font-medium text-gray-700">
                      {Math.round(p.area).toLocaleString("ko")} m²
                    </span>
                  </div>
                  {excls.map((exc, j) => {
                    const globalIdx = exclusions.indexOf(exc);
                    return (
                      <div key={`exc-${j}`} className="flex items-center justify-between pl-3">
                        <span className="text-xs text-red-400">└ 제외 {globalIdx + 1}</span>
                        <span className="text-xs font-medium text-red-400">
                          −{Math.round(exc.area).toLocaleString("ko")} m²
                        </span>
                      </div>
                    );
                  })}
                  {excls.length > 0 && (
                    <div className="flex items-center justify-between pl-3">
                      <span className="text-xs text-blue-500">→ 유효</span>
                      <span className="text-xs font-semibold text-blue-600">
                        {Math.round(netArea).toLocaleString("ko")} m²
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {unattributedExclusions.map((p, i) => {
              const globalIdx = exclusions.indexOf(p);
              return (
                <div key={`unatr-${i}`} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-red-400">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
                    제외 {globalIdx + 1}
                  </span>
                  <span className="text-xs font-medium text-red-400">
                    −{Math.round(p.area).toLocaleString("ko")} m²
                  </span>
                </div>
              );
            })}
            {exclusions.length > 0 && (
              <div className="flex items-center justify-between border-t pt-1 mt-1">
                <span className="text-xs font-semibold text-gray-600">유효 면적</span>
                <span className="text-xs font-bold text-blue-600">
                  {Math.round(totalArea).toLocaleString("ko")} m²
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 파라미터 */}
      <div className="bg-white border rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-600 mb-3">계산 설정</p>
        <div className="space-y-3">
          <Param
            label={`배치율 ${coverageRatio}%`}
            min={30} max={90} step={1}
            value={coverageRatio}
            onChange={setCoverageRatio}
          />
          <Param
            label={`패널 효율 ${panelEfficiency}%`}
            min={15} max={25} step={1}
            value={panelEfficiency}
            onChange={setPanelEfficiency}
          />
          <Param
            label={`일평균 일조시간 ${peakSunHours}h`}
            min={2.5} max={5} step={0.1}
            value={peakSunHours}
            onChange={setPeakSunHours}
          />
          <Param
            label={`시스템 효율 ${systemEfficiency}%`}
            min={70} max={95} step={1}
            value={systemEfficiency}
            onChange={setSystemEfficiency}
          />
        </div>
      </div>

      {/* 결과 */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">
            {inclusions.length > 1 ? "전체 합산 결과" : "분석 결과"}
          </p>
          <div className="space-y-2">
            <Row label="예상 패널 수" value={`${result.panelCount.toLocaleString("ko")} 개`} />
            <Row
              label="설치 용량"
              value={`${result.capacityKw >= 1000
                ? (result.capacityKw / 1000).toFixed(2) + " MW"
                : result.capacityKw.toFixed(1) + " kW"}`}
              highlight
            />
            <Row
              label="연간 예상 발전량"
              value={`${(result.annualGenerationKwh / 1000).toFixed(1)} MWh`}
            />
            <Row
              label="연간 CO₂ 절감 추정"
              value={`${(result.annualGenerationKwh * 0.4581 / 1000).toFixed(1)} 톤`}
            />
          </div>

          {inclusions.length > 1 && (
            <div className="mt-3 border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 mb-1">영역별 예상 용량</p>
              {inclusions.map((p, i) => {
                const netArea = inclusionNetAreas[i];
                const r = calculateSolar({
                  areaSqm: netArea,
                  coverageRatio: coverageRatio / 100,
                  panelEfficiency: panelEfficiency / 100,
                  peakSunHours,
                  systemEfficiency: systemEfficiency / 100,
                });
                const color = POLYGON_COLORS[i % POLYGON_COLORS.length];
                const hasExcl = exclusionsByInclusion[i].length > 0;
                return (
                  <div key={i} className="bg-white rounded p-2 border">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span style={{ background: color }} className="inline-block w-2 h-2 rounded-full flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-600">영역 {i + 1}</span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {hasExcl
                          ? <>{Math.round(netArea).toLocaleString("ko")} m² <span className="text-red-300 line-through">{Math.round(p.area).toLocaleString("ko")}</span></>
                          : <>{Math.round(p.area).toLocaleString("ko")} m²</>
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">설치 용량</span>
                      <span className="text-xs font-bold" style={{ color }}>
                        {r.capacityKw >= 1000
                          ? (r.capacityKw / 1000).toFixed(2) + " MW"
                          : r.capacityKw.toFixed(1) + " kW"}
                      </span>
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-xs text-gray-500">연간 발전량</span>
                      <span className="text-xs text-gray-700">{(r.annualGenerationKwh / 1000).toFixed(1)} MWh</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 저장 */}
      {result && (
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">결과 저장</p>
          <input
            type="text"
            placeholder="프로젝트명 입력"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full border rounded p-2 mb-2 text-sm outline-none focus:border-blue-400"
          />
          <button
            onClick={handleSave}
            disabled={!projectName.trim() || isSaving}
            className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40 text-sm font-medium"
          >
            {isSaving ? "저장 중..." : "저장"}
          </button>
          {saveMessage && (
            <p className="text-green-600 text-xs mt-1 text-center">{saveMessage}</p>
          )}
        </div>
      )}

      {inclusions.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center">
          지도에서 영역을 그리면<br />분석 결과가 표시됩니다<br />
          <span className="text-xs mt-1 block">(영역 추가 / 제외 영역 버튼 사용)</span>
        </div>
      )}
    </div>
  );
}

function Param({
  label, min, max, step, value, onChange,
}: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-green-600 text-base" : "text-gray-700"}`}>
        {value}
      </span>
    </div>
  );
}
