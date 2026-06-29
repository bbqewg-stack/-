"use client";

import { useState } from "react";
import Link from "next/link";
import KakaoMap from "@/components/KakaoMap";
import ModuleLayoutPanel from "@/components/ModuleLayoutPanel";
import { ModuleConfig, DEFAULT_MODULE_CONFIG } from "@/lib/moduleLayout";

interface Coord {
  lat: number;
  lng: number;
}

export default function LayoutPage() {
  const [polygons, setPolygons] = useState<{ area: number; coords: Coord[]; type: 'inclusion' | 'exclusion'; angle?: number }[]>([]);
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig>({
    ...DEFAULT_MODULE_CONFIG,
    enabled: true,
  });
  const [moduleCounts, setModuleCounts] = useState<number[]>([]);

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-purple-700 text-white px-4 py-3 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold tracking-tight">
            🔲 태양광 모듈 배치도
          </h1>
          <span className="text-xs bg-purple-500 px-2 py-0.5 rounded-full">
            영역 선택 → 자동 배치
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 배치 on/off 토글 */}
          <button
            onClick={() => setModuleConfig(c => ({ ...c, enabled: !c.enabled }))}
            className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
              moduleConfig.enabled
                ? "bg-white text-purple-700 hover:bg-purple-50"
                : "bg-purple-500 text-white hover:bg-purple-400"
            }`}
          >
            {moduleConfig.enabled ? "배치 표시 중" : "배치 숨김"}
          </button>
          <Link
            href="/"
            className="text-xs bg-purple-500 text-white px-3 py-1.5 rounded font-medium hover:bg-purple-600 transition-colors"
          >
            용량 분석
          </Link>
          <Link
            href="/history"
            className="text-xs bg-white text-purple-700 px-3 py-1.5 rounded font-medium hover:bg-purple-50 transition-colors"
          >
            분석 이력
          </Link>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <div className="absolute inset-0">
            <KakaoMap
              onAreasChange={setPolygons}
              moduleConfig={moduleConfig}
              onModuleCountsChange={setModuleCounts}
            />
          </div>
        </div>
        <div className="w-72 border-l bg-gray-50 flex-shrink-0 overflow-y-auto">
          <ModuleLayoutPanel
            polygons={polygons}
            moduleConfig={moduleConfig}
            onModuleConfigChange={setModuleConfig}
            moduleCounts={moduleCounts}
          />
        </div>
      </main>
    </div>
  );
}
