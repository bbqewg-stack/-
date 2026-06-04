"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

interface Analysis {
  id: number;
  name: string;
  area_m2: number;
  capacity_kw: number;
  annual_generation_kwh: number;
  coverage_ratio: number;
  panel_efficiency: number;
  created_at: string;
}

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const editInputRef = useRef<HTMLInputElement>(null);

  const fetchAnalyses = async () => {
    const res = await fetch("/api/analyses");
    const data = await res.json();
    setAnalyses(data);
    setLoading(false);
  };

  useEffect(() => { fetchAnalyses(); }, []);
  useEffect(() => { if (editingId !== null) editInputRef.current?.focus(); }, [editingId]);

  const startEdit = (a: Analysis) => {
    setEditingId(a.id);
    setEditName(a.name);
  };

  const submitEdit = async (id: number) => {
    if (!editName.trim()) return;
    await fetch(`/api/analyses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    setEditingId(null);
    fetchAnalyses();
  };

  const deleteOne = async (id: number) => {
    await fetch(`/api/analyses/${id}`, { method: "DELETE" });
    setDeletingId(null);
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    fetchAnalyses();
  };

  const deleteSelected = async () => {
    await Promise.all([...selectedIds].map(id => fetch(`/api/analyses/${id}`, { method: "DELETE" })));
    setSelectedIds(new Set());
    fetchAnalyses();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === analyses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(analyses.map(a => a.id)));
    }
  };

  const downloadExcel = () => {
    const rows = analyses.map(a => ({
      "프로젝트명": a.name,
      "면적 (m²)": Math.round(a.area_m2),
      "배치율 (%)": Math.round(a.coverage_ratio * 100),
      "패널효율 (%)": Math.round(a.panel_efficiency * 100),
      "설치용량 (kW)": parseFloat(a.capacity_kw.toFixed(2)),
      "연간발전량 (MWh)": parseFloat((a.annual_generation_kwh / 1000).toFixed(2)),
      "연간 CO₂ 절감 (톤)": parseFloat((a.annual_generation_kwh * 0.4581 / 1000).toFixed(2)),
      "분석일시": new Date(a.created_at).toLocaleString("ko"),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "분석이력");
    XLSX.writeFile(wb, `태양광분석이력_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const formatCapacity = (kw: number) =>
    kw >= 1000 ? `${(kw / 1000).toFixed(2)} MW` : `${kw.toFixed(1)} kW`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white px-4 py-3 flex items-center gap-3 shadow-md">
        <Link
          href="/"
          className="text-xs bg-white text-blue-600 px-3 py-1.5 rounded font-medium hover:bg-blue-50 transition-colors"
        >
          ← 돌아가기
        </Link>
        <h1 className="text-base font-bold">분석 이력</h1>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {/* 상단 액션 바 */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            총 {analyses.length}건
            {selectedIds.size > 0 && (
              <span className="ml-2 text-blue-600 font-medium">{selectedIds.size}개 선택됨</span>
            )}
          </p>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={deleteSelected}
                className="px-3 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600 font-medium"
              >
                선택 삭제 ({selectedIds.size})
              </button>
            )}
            <button
              onClick={downloadExcel}
              disabled={analyses.length === 0}
              className="px-4 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-40 font-medium"
            >
              엑셀 다운로드
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow p-20 text-center text-gray-400">불러오는 중...</div>
        ) : analyses.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-20 text-center text-gray-400">
            저장된 분석 결과가 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === analyses.length && analyses.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3">프로젝트명</th>
                  <th className="text-right px-4 py-3">면적</th>
                  <th className="text-right px-4 py-3">배치율</th>
                  <th className="text-right px-4 py-3">패널효율</th>
                  <th className="text-right px-4 py-3">설치용량</th>
                  <th className="text-right px-4 py-3">연간발전량</th>
                  <th className="text-right px-4 py-3">분석일시</th>
                  <th className="px-4 py-3 text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((a, i) => (
                  <tr
                    key={a.id}
                    className={`border-t ${selectedIds.has(a.id) ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                  >
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {editingId === a.id ? (
                        <div className="flex gap-1">
                          <input
                            ref={editInputRef}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") submitEdit(a.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="border rounded px-2 py-0.5 text-sm flex-1 outline-none focus:border-blue-400"
                          />
                          <button
                            onClick={() => submitEdit(a.id)}
                            className="px-2 py-0.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-0.5 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        a.name
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {Math.round(a.area_m2).toLocaleString("ko")} m²
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {Math.round(a.coverage_ratio * 100)}%
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {Math.round(a.panel_efficiency * 100)}%
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">
                      {formatCapacity(a.capacity_kw)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {(a.annual_generation_kwh / 1000).toFixed(1)} MWh
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                      {new Date(a.created_at).toLocaleString("ko")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        {editingId !== a.id && (
                          <button
                            onClick={() => startEdit(a)}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          >
                            수정
                          </button>
                        )}
                        {deletingId === a.id ? (
                          <>
                            <button
                              onClick={() => deleteOne(a.id)}
                              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              확인
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeletingId(a.id)}
                            className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
