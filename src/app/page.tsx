"use client";

import { useState } from "react";
import Link from "next/link";
import KakaoMap from "@/components/KakaoMap";
import ResultPanel from "@/components/ResultPanel";

interface Coord {
  lat: number;
  lng: number;
}

export default function Home() {
  const [polygons, setPolygons] = useState<{ area: number; coords: Coord[]; type: 'inclusion' | 'exclusion' }[]>([]);

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-md flex-shrink-0">
        <h1 className="text-base font-bold tracking-tight">
          ☀️ 태양광 발전소 용량 분석
        </h1>
        <Link
          href="/history"
          className="text-xs bg-white text-blue-600 px-3 py-1.5 rounded font-medium hover:bg-blue-50 transition-colors"
        >
          분석 이력 보기
        </Link>
      </header>

      <main className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <div className="absolute inset-0">
            <KakaoMap onAreasChange={setPolygons} />
          </div>
        </div>
        <div className="w-72 border-l bg-gray-50 flex-shrink-0 overflow-y-auto">
          <ResultPanel polygons={polygons} />
        </div>
      </main>
    </div>
  );
}
