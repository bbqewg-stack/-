"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ProposalData,
  loadProposalData,
  saveProposalData,
  calcAnnualGenerationKwh,
  calcAnnualRevenueWan,
  calcBreakevenYear,
} from "@/lib/proposalData";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtKw(kw: number) {
  return kw >= 1000 ? (kw / 1000).toFixed(2) + " MW" : kw.toFixed(2) + " kW";
}
function fmtWan(n: number) {
  return n >= 10000
    ? (n / 10000).toFixed(2) + "억원"
    : n.toLocaleString("ko") + "만원";
}
function fmtKwh(kwh: number) {
  return kwh >= 1000000
    ? (kwh / 1000000).toFixed(2) + " GWh"
    : kwh >= 1000
    ? (kwh / 1000).toFixed(1) + " MWh"
    : kwh.toFixed(0) + " kWh";
}

// ── Edit sidebar ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-slate-700 text-white text-sm rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 border border-slate-600";

function EditSidebar({ data, onChange }: { data: ProposalData; onChange: (d: ProposalData) => void }) {
  const set = (patch: Partial<ProposalData>) => onChange({ ...data, ...patch });
  const constructionDefault = Math.round(data.totalCapacityKw * 130);

  return (
    <div className="no-print fixed top-12 right-0 bottom-0 w-72 bg-slate-800 text-white overflow-y-auto p-4 z-40 border-l border-slate-700 shadow-2xl">
      <p className="text-xs font-bold text-slate-300 mb-4 uppercase tracking-widest">제안서 편집</p>

      <Field label="고객사명 (제안 받는 회사)">
        <input className={inputCls} value={data.clientName} onChange={e => set({ clientName: e.target.value })} placeholder="예) 대성정밀 주식회사" />
      </Field>
      <Field label="프로젝트명">
        <input className={inputCls} value={data.projectName} onChange={e => set({ projectName: e.target.value })} />
      </Field>
      <Field label="설치 위치">
        <input className={inputCls} value={data.location} onChange={e => set({ location: e.target.value })} />
      </Field>
      <Field label="제안서 날짜">
        <input className={inputCls} value={data.proposalDate} onChange={e => set({ proposalDate: e.target.value })} />
      </Field>

      <hr className="border-slate-600 my-4" />
      <p className="text-xs font-bold text-slate-300 mb-3 uppercase tracking-widest">수익 분석 설정</p>

      <Field label={`SMP+REC 통합 단가 (원/kWh) — 현재 ${data.smpBlendedRate}원`}>
        <input className={inputCls} type="number" value={data.smpBlendedRate} onChange={e => set({ smpBlendedRate: +e.target.value })} />
      </Field>
      <Field label="REC 가중치">
        <input className={inputCls} type="number" step="0.1" value={data.recWeight} onChange={e => set({ recWeight: +e.target.value })} />
      </Field>
      <Field label={`예상 공사금액 (만원) — 기본 ${constructionDefault.toLocaleString("ko")}만원`}>
        <input className={inputCls} type="number" value={data.constructionCostWan}
          onChange={e => set({ constructionCostWan: +e.target.value })}
          placeholder={constructionDefault.toString()} />
      </Field>
      <Field label="일평균 일조시간 (h)">
        <input className={inputCls} type="number" step="0.1" value={data.peakSunHours} onChange={e => set({ peakSunHours: +e.target.value })} />
      </Field>
      <Field label="시스템 효율 (%)">
        <input className={inputCls} type="number" value={Math.round(data.systemEfficiency * 100)}
          onChange={e => set({ systemEfficiency: +e.target.value / 100 })} />
      </Field>

      <hr className="border-slate-600 my-4" />
      <p className="text-xs font-bold text-slate-300 mb-3 uppercase tracking-widest">시공사 정보</p>

      <Field label="회사명"><input className={inputCls} value={data.companyName} onChange={e => set({ companyName: e.target.value })} /></Field>
      <Field label="전화"><input className={inputCls} value={data.companyTel} onChange={e => set({ companyTel: e.target.value })} /></Field>
      <Field label="팩스"><input className={inputCls} value={data.companyFax} onChange={e => set({ companyFax: e.target.value })} /></Field>
      <Field label="이메일"><input className={inputCls} value={data.companyEmail} onChange={e => set({ companyEmail: e.target.value })} /></Field>
      <Field label="홈페이지"><input className={inputCls} value={data.companyWeb} onChange={e => set({ companyWeb: e.target.value })} /></Field>
      <Field label="주소"><input className={inputCls} value={data.companyAddress} onChange={e => set({ companyAddress: e.target.value })} /></Field>
      <Field label="면허번호"><input className={inputCls} value={data.companyLicense} onChange={e => set({ companyLicense: e.target.value })} /></Field>

      <button
        onClick={() => saveProposalData(data)}
        className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm font-semibold"
      >
        변경사항 저장
      </button>
    </div>
  );
}

// ── Page section wrapper ──────────────────────────────────────────────────────

function Page({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`proposal-page ${className}`}>
      {children}
    </div>
  );
}

// ── Section divider title ─────────────────────────────────────────────────────

function SectionTitle({ num, title, sub }: { num: string; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="flex-shrink-0 w-10 h-10 bg-navy rounded-lg flex items-center justify-center text-white font-black text-sm">
        {num}
      </div>
      <div>
        <h2 className="text-xl font-bold text-navy">{title}</h2>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── 01. Cover ────────────────────────────────────────────────────────────────

function CoverPage({ data }: { data: ProposalData }) {
  return (
    <Page className="cover-page flex">
      {/* Left blue panel */}
      <div className="w-56 bg-navy flex-shrink-0 flex flex-col justify-between p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/company-logo.png" alt="TNE" className="h-10 w-auto object-contain bg-white rounded px-2 py-1" />
        <div>
          <div className="w-8 h-0.5 bg-blue-300 mb-4" />
          <p className="text-blue-200 text-xs leading-relaxed">
            태양광발전소<br />시공 전문기업
          </p>
          <p className="text-blue-300 text-xs mt-2">Tech &amp; Engineering Corp.</p>
        </div>
      </div>

      {/* Right content */}
      <div className="flex-1 flex flex-col justify-between p-10">
        <div>
          {data.clientName && (
            <p className="text-slate-400 text-sm font-medium mb-2">
              {data.clientName} 귀중
            </p>
          )}
          <div className="w-12 h-0.5 bg-navy mb-5" />
          <h1 className="text-3xl font-black text-navy leading-tight mb-2">
            {data.projectName || "태양광 발전 사업"}
          </h1>
          <h2 className="text-lg font-bold text-slate-500 mb-6">
            Solar Power Project Proposal
          </h2>
          <div className="flex gap-6 mt-8">
            <div className="text-center">
              <p className="text-3xl font-black text-blue-600">{fmtKw(data.totalCapacityKw)}</p>
              <p className="text-xs text-slate-400 mt-1">설치 용량</p>
            </div>
            <div className="w-px bg-slate-200" />
            <div className="text-center">
              <p className="text-3xl font-black text-blue-600">{data.totalModules.toLocaleString("ko")}장</p>
              <p className="text-xs text-slate-400 mt-1">태양광 모듈</p>
            </div>
            <div className="w-px bg-slate-200" />
            <div className="text-center">
              <p className="text-3xl font-black text-emerald-600">
                {calcBreakevenYear(data)}년
              </p>
              <p className="text-xs text-slate-400 mt-1">투자 회수</p>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <ul className="text-xs text-slate-500 space-y-1">
            <li>• 태양광 모듈 배치도 / Solar Modules Site Plan</li>
            <li>• 예상 용량 및 발전 수익 분석 / Revenue Analysis</li>
            <li>• 사업 진행 절차 / Project Process</li>
          </ul>
          <div className="text-right text-xs text-slate-400">
            <p className="font-semibold text-slate-600">{data.proposalDate}</p>
            <p className="mt-1">{data.companyName}</p>
          </div>
        </div>
      </div>
    </Page>
  );
}

// ── 02. Executive Summary ────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-5 ${accent ? "bg-navy text-white" : "bg-slate-50 border border-slate-200"}`}>
      <p className={`text-xs font-medium mb-1 ${accent ? "text-blue-200" : "text-slate-400"}`}>{label}</p>
      <p className={`text-2xl font-black ${accent ? "text-white" : "text-navy"}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? "text-blue-200" : "text-slate-400"}`}>{sub}</p>}
    </div>
  );
}

function ExecutiveSummaryPage({ data }: { data: ProposalData }) {
  const annualKwh = calcAnnualGenerationKwh(data);
  const annualWan = calcAnnualRevenueWan(data);
  const breakevenYr = calcBreakevenYear(data);
  const twentyYrWan = annualWan * 20;
  const roi20 = data.constructionCostWan > 0
    ? Math.round((twentyYrWan / data.constructionCostWan) * 100)
    : 0;

  return (
    <Page>
      <SectionTitle num="01" title="사업 핵심 요약" sub="Executive Summary" />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="설치 용량" value={fmtKw(data.totalCapacityKw)} sub={`모듈 ${data.totalModules.toLocaleString("ko")}장`} accent />
        <KpiCard label="연간 예상 발전량" value={fmtKwh(annualKwh)} sub={`일조 ${data.peakSunHours}h/일 기준`} />
        <KpiCard label="연평균 예상 수익" value={fmtWan(annualWan)} sub={`단가 ${data.smpBlendedRate}원/kWh`} />
        <KpiCard label="투자 회수 기간" value={`${breakevenYr}년`} sub={`20년 누적 ${fmtWan(twentyYrWan)}`} accent />
      </div>

      {/* 주요 사업 정보 표 */}
      <div className="grid grid-cols-2 gap-5">
        <table className="w-full text-sm border-collapse">
          <tbody>
            {[
              ["사업명", data.projectName || "태양광 발전소"],
              ["설치 위치", data.location || "-"],
              ["사업 구분", "건물 지붕·옥상 태양광"],
              ["계통 연계", data.totalCapacityKw >= 1000 ? "22.9kV 특고압 연계" : "380V 저압 연계"],
              ["모듈 방위각", data.zones.length > 0 ? (() => {
                const angles = data.zones.map(z => z.angle);
                return angles.every(a => a === angles[0]) ? `${angles[0].toFixed(1)}°` : `최소 ${Math.min(...angles).toFixed(1)}° / 최대 ${Math.max(...angles).toFixed(1)}°`;
              })() : "-"],
            ].map(([k, v], i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                <td className="py-2 px-3 text-slate-500 font-medium text-xs border border-slate-200 w-32">{k}</td>
                <td className="py-2 px-3 text-slate-700 border border-slate-200">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {[
              ["모듈 사양", data.moduleMaker || `${data.moduleWattage}W`],
              ["총 모듈 수", `${data.totalModules.toLocaleString("ko")} 장`],
              ["예상 공사금액", fmtWan(data.constructionCostWan)],
              ["20년 누적 수익", fmtWan(twentyYrWan)],
              ["20년 투자수익률", `${roi20}%`],
            ].map(([k, v], i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                <td className="py-2 px-3 text-slate-500 font-medium text-xs border border-slate-200 w-36">{k}</td>
                <td className="py-2 px-3 text-slate-700 border border-slate-200 font-semibold">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        ※ 수익 분석은 전력거래소 현물시세 기준이며, SMP·REC 가격 변동에 따라 실제 수익은 달라질 수 있습니다.
        제품 보증: 태양광 모듈 12년, 인버터 5년, 구조 및 전기 3년
      </div>
    </Page>
  );
}

// ── 03. System Layout ────────────────────────────────────────────────────────

function SystemLayoutPage({ data }: { data: ProposalData }) {
  const selectedPresetLabel = data.moduleMaker || `${data.moduleWattage}W 모듈`;

  return (
    <Page>
      <SectionTitle num="02" title="시스템 배치" sub="Solar Module Site Plan" />
      <div className="flex gap-6">
        {/* Map */}
        <div className="flex-1 min-w-0">
          {data.mapImageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.mapImageDataUrl} alt="배치도" className="w-full rounded-lg border border-slate-200 object-contain"
              style={{ maxHeight: "420px" }} />
          ) : (
            <div className="w-full h-64 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm">
              배치도 이미지
            </div>
          )}
          {/* Zone legend */}
          {data.zones.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.zones.map((z, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: z.color }} />
                  <span className="font-medium">{z.label}</span>
                  <span className="text-slate-400">{z.moduleCount}장 / {fmtKw(z.capacityKw)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spec table */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-navy text-white text-xs font-bold px-3 py-2 rounded-t-lg">설계 사양 / Design Spec</div>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {[
                ["총 발전용량", fmtKw(data.totalCapacityKw)],
                ["사용 모듈", selectedPresetLabel],
                ["모듈 규격", `${data.moduleWidth.toLocaleString("ko")}×${data.moduleHeight.toLocaleString("ko")} mm`],
                ["모듈 총 수량", `${data.totalModules.toLocaleString("ko")} 장`],
                ...(data.modulesPerString > 0 ? [
                  ["모듈 구성", `${data.modulesPerString}직렬 × ${data.totalStrings}병렬`],
                ] : []),
                ["계통 연계", data.totalCapacityKw >= 1000 ? "22.9kV 특고압" : "380V 저압"],
                ["일조 시간", `${data.peakSunHours} h/일`],
                ["시스템 효율", `${Math.round(data.systemEfficiency * 100)} %`],
              ].map(([k, v], i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                  <td className="py-2 px-3 text-xs text-slate-500 font-medium border border-slate-200">{k}</td>
                  <td className="py-2 px-3 text-xs text-slate-800 font-semibold border border-slate-200">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Per-zone table */}
          {data.zones.length > 1 && (
            <div className="mt-4">
              <div className="bg-slate-600 text-white text-xs font-bold px-3 py-2 rounded-t">구역별 현황</div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="py-1.5 px-2 border border-slate-200 text-left font-semibold text-slate-600">구역</th>
                    <th className="py-1.5 px-2 border border-slate-200 text-right font-semibold text-slate-600">모듈</th>
                    <th className="py-1.5 px-2 border border-slate-200 text-right font-semibold text-slate-600">용량</th>
                  </tr>
                </thead>
                <tbody>
                  {data.zones.map((z, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="py-1.5 px-2 border border-slate-200">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: z.color, display: "inline-block" }} />
                          {z.label}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 border border-slate-200 text-right">{z.moduleCount.toLocaleString("ko")}</td>
                      <td className="py-1.5 px-2 border border-slate-200 text-right font-semibold">{fmtKw(z.capacityKw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

// ── 04. Revenue Analysis ─────────────────────────────────────────────────────

function RevenueBar({ year, cumWan, targetWan, breakevenYr }: { year: number; cumWan: number; targetWan: number; breakevenYr: number }) {
  const pct = Math.min((cumWan / targetWan) * 100, 100);
  const isBreakeven = year === breakevenYr;
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs text-slate-500 w-8 flex-shrink-0 text-right">{year}년</span>
      <div className="flex-1 bg-slate-100 rounded h-4 relative overflow-hidden">
        <div
          className={`h-full rounded transition-all ${isBreakeven ? "bg-emerald-500" : cumWan >= targetWan ? "bg-blue-500" : "bg-blue-300"}`}
          style={{ width: `${pct}%` }}
        />
        {isBreakeven && (
          <span className="absolute inset-y-0 right-1 flex items-center text-xs font-bold text-white">회수</span>
        )}
      </div>
      <span className={`text-xs w-24 flex-shrink-0 text-right font-semibold ${isBreakeven ? "text-emerald-600" : "text-slate-600"}`}>
        {fmtWan(cumWan)}
      </span>
    </div>
  );
}

function RevenuePage({ data }: { data: ProposalData }) {
  const annualWan = calcAnnualRevenueWan(data);
  const annualKwh = calcAnnualGenerationKwh(data);
  const breakevenYr = calcBreakevenYear(data);
  const cost = data.constructionCostWan;

  const rows = [1, 2, 3, 5, 7, 10, 12, 15, 17, 20];

  return (
    <Page>
      <SectionTitle num="03" title="수익 분석" sub="Revenue Analysis · 연평균 일일 발전시간 기준" />

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { k: "SMP+REC 단가", v: `${data.smpBlendedRate}원/kWh`, sub: `가중치 ${data.recWeight}` },
          { k: "연간 예상 발전량", v: fmtKwh(annualKwh), sub: `${data.peakSunHours}h × 365일` },
          { k: "연평균 예상 수익", v: fmtWan(annualWan), sub: "순수익 (세전)" },
          { k: "예상 공사금액", v: fmtWan(cost), sub: "VAT 별도" },
        ].map(({ k, v, sub }) => (
          <div key={k} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-400">{k}</p>
            <p className="text-lg font-black text-navy mt-0.5">{v}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Table */}
        <div className="flex-1">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-navy text-white">
                <th className="py-2 px-3 text-left font-semibold text-xs">연차</th>
                <th className="py-2 px-3 text-right font-semibold text-xs">연간 발전량</th>
                <th className="py-2 px-3 text-right font-semibold text-xs">연간 수익</th>
                <th className="py-2 px-3 text-right font-semibold text-xs">누적 수익</th>
                <th className="py-2 px-3 text-right font-semibold text-xs">비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((yr, i) => {
                const cumWan = annualWan * yr;
                const isBreakeven = yr === breakevenYr;
                const recovered = cumWan >= cost;
                return (
                  <tr key={yr} className={
                    isBreakeven
                      ? "bg-emerald-50 border-l-4 border-l-emerald-500"
                      : i % 2 === 0 ? "bg-white" : "bg-slate-50"
                  }>
                    <td className="py-2 px-3 font-semibold border border-slate-200 text-navy">{yr}년</td>
                    <td className="py-2 px-3 text-right border border-slate-200 text-slate-600">{fmtKwh(annualKwh * yr)}</td>
                    <td className="py-2 px-3 text-right border border-slate-200 text-slate-700 font-medium">{fmtWan(annualWan)}</td>
                    <td className={`py-2 px-3 text-right border border-slate-200 font-bold ${isBreakeven ? "text-emerald-600" : recovered ? "text-blue-600" : "text-slate-700"}`}>
                      {fmtWan(cumWan)}
                    </td>
                    <td className="py-2 px-3 text-right border border-slate-200 text-xs">
                      {isBreakeven && <span className="bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold">투자 회수</span>}
                      {!isBreakeven && yr === 20 && <span className="text-blue-500 font-semibold">최종</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bar chart */}
        <div className="w-64 flex-shrink-0">
          <p className="text-xs font-semibold text-slate-500 mb-3">누적 수익 vs 공사금액</p>
          {rows.map(yr => (
            <RevenueBar key={yr} year={yr} cumWan={annualWan * yr} targetWan={cost} breakevenYr={breakevenYr} />
          ))}
          <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
            <span className="text-xs text-slate-500">공사금액 기준선 ({fmtWan(cost)})</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-3 h-3 rounded bg-emerald-500" />
            <span className="text-xs text-slate-500">투자 회수 시점</span>
          </div>
          <div className="mt-4 p-3 bg-navy rounded-lg text-white text-center">
            <p className="text-xs text-blue-200">20년 누적 수익</p>
            <p className="text-xl font-black mt-1">{fmtWan(annualWan * 20)}</p>
            <p className="text-xs text-blue-200 mt-1">투자수익률 {data.constructionCostWan > 0 ? Math.round((annualWan * 20 / data.constructionCostWan) * 100) : 0}%</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        ※ 발전 수익은 전력거래소 현물시세 기준이며 SMP·REC 변동 시 수익이 달라질 수 있습니다.
        구조물 보강·한전 인입·부가세 별도. 제품보증: 모듈 12년 / 인버터 5년 / 구조·전기 3년
      </p>
    </Page>
  );
}

// ── 05. Business Overview (SMP/REC) ─────────────────────────────────────────

function BusinessOverviewPage({ data }: { data: ProposalData }) {
  return (
    <Page>
      <SectionTitle num="04" title="태양광 수익구조" sub="SMP & REC Revenue Structure" />

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-navy text-base mb-3">SMP (계통한계가격)</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            한국전력공사에서 발전사업자에게 지급하는 전력 단가입니다.
            발전량(kWh)에 SMP 단가를 곱하여 월 매출을 산출하며,
            실시간 전력시장의 수요·공급에 따라 변동됩니다.
          </p>
          <div className="mt-4 bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">현재 적용 단가</p>
            <p className="text-2xl font-black text-blue-600">{data.smpBlendedRate}원<span className="text-sm font-normal text-slate-400">/kWh</span></p>
            <p className="text-xs text-slate-400 mt-1">REC 가중치 {data.recWeight} 포함</p>
          </div>
        </div>
        <div className="border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-navy text-base mb-3">REC (신재생에너지 공급인증서)</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            신재생에너지 발전량에 가중치를 곱한 값으로 에너지관리공단이 발급합니다.
            18개 공급의무자가 의무공급량을 신재생에너지 공급인증서 구매로 충당합니다.
          </p>
          <div className="mt-4 bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">건축물 기존시설 REC 가중치</p>
            <div className="flex gap-4 mt-2">
              <div className="text-center">
                <p className="text-lg font-black text-navy">1.5</p>
                <p className="text-xs text-slate-400">100kW 미만</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-slate-500">1.0</p>
                <p className="text-xs text-slate-400">100kW~3MW</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl p-5">
        <h3 className="font-bold text-navy text-base mb-4">사업 진행 절차</h3>
        <div className="flex gap-4">
          {[
            { step: "1단계", title: "사업 검토", items: ["사업 신청", "사업 검토 (금융)", "현장 검증 (공사)"] },
            { step: "2단계", title: "사업 준비", items: ["발전사업허가신청", "구조검토·전기설계", "개발행위신청, PPA접수", "자재발주 및 준비"] },
            { step: "3단계", title: "공사·검사", items: ["착공신고", "구조물·전기공사", "사용전안전검사", "준공검사"] },
            { step: "4단계", title: "사업 완료", items: ["한전 PPA 계약", "상업운전개시", "REC 등록", "사업개시신고"] },
          ].map(({ step, title, items }, i) => (
            <div key={i} className={`flex-1 rounded-lg p-4 ${i === 1 ? "bg-navy text-white" : "bg-slate-50"}`}>
              <p className={`text-xs font-bold mb-1 ${i === 1 ? "text-blue-200" : "text-slate-400"}`}>{step}</p>
              <p className={`font-bold text-sm mb-3 ${i === 1 ? "text-white" : "text-navy"}`}>{title}</p>
              <ul className={`text-xs space-y-1 ${i === 1 ? "text-blue-100" : "text-slate-500"}`}>
                {items.map((item, j) => <li key={j}>· {item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}

// ── 06. Construction Overview ────────────────────────────────────────────────

function ConstructionPage({ data }: { data: ProposalData }) {
  return (
    <Page>
      <SectionTitle num="05" title="공사 개요" sub="Construction Overview" />

      <div className="grid grid-cols-2 gap-6">
        <div>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {[
                ["사업구분", "태양광 발전사업"],
                ["공사명", `${data.projectName || "태양광발전소"}`],
                ["설치 위치", data.location || "-"],
                ["사업자명", data.clientName || "-"],
                ["시설 규모", `지붕·옥상 / ${fmtKw(data.totalCapacityKw)}`],
                ["공사 범위", "구조물·모듈 설치, 전기공사 전체"],
                ["인버터 구성", (() => {
                  const kw = data.totalCapacityKw;
                  if (kw <= 0) return "-";
                  let best: { n125: number; n60: number; n50: number } | null = null;
                  let bestScore = Infinity;
                  for (let n125 = 0; n125 <= Math.ceil(kw / 125) + 2; n125++) {
                    const rem1 = kw - n125 * 125;
                    for (let n60 = 0; n60 <= Math.ceil(Math.max(0, rem1) / 60) + 2; n60++) {
                      const rem2 = rem1 - n60 * 60;
                      const n50 = rem2 > 0 ? Math.ceil(rem2 / 50) : 0;
                      const total = n125 * 125 + n60 * 60 + n50 * 50;
                      if (total < kw) continue;
                      const score = (total - kw) * 3 + n60 * 30 + n50 * 20 - n125 * 50;
                      if (score < bestScore) { bestScore = score; best = { n125, n60, n50 }; }
                    }
                  }
                  if (!best) return "-";
                  const parts = [];
                  if (best.n125 > 0) parts.push(`125kW × ${best.n125}대`);
                  if (best.n60 > 0) parts.push(`60kW × ${best.n60}대`);
                  if (best.n50 > 0) parts.push(`50kW × ${best.n50}대`);
                  return parts.join(" / ") || "-";
                })()],
                ["예상 공사금액", fmtWan(data.constructionCostWan) + " (VAT 별도)"],
              ].map(([k, v], i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                  <td className="py-2.5 px-3 text-xs text-slate-500 font-semibold border border-slate-200 w-32 align-top">{k}</td>
                  <td className="py-2.5 px-3 text-sm text-slate-800 border border-slate-200">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="bg-navy text-white rounded-t-lg px-4 py-2.5 font-bold text-sm">시공사 정보</div>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {[
                ["상호", data.companyName],
                ["주소", data.companyAddress],
                ["전화", data.companyTel],
                ["팩스", data.companyFax],
                ["이메일", data.companyEmail],
                ["홈페이지", data.companyWeb],
                ["면허번호", data.companyLicense],
              ].map(([k, v], i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                  <td className="py-2 px-3 text-xs text-slate-500 font-semibold border border-slate-200 w-24">{k}</td>
                  <td className="py-2 px-3 text-sm text-slate-700 border border-slate-200">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-xs font-semibold text-slate-500 mb-3">예상 착공 일정 (계약 후 기준)</p>
            <div className="space-y-2">
              {[
                { phase: "1단계", label: "사업 검토 · 인허가 준비", range: "계약 후 1~2개월" },
                { phase: "2단계", label: "발전사업허가 · 구조설계", range: "2~4개월" },
                { phase: "3단계", label: "착공 · 구조물 · 전기공사", range: "5~7개월" },
                { phase: "4단계", label: "준공 · PPA 체결 · 상업운전", range: "7~8개월" },
              ].map(({ phase, label, range }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${i === 2 ? "bg-navy text-white" : "bg-slate-200 text-slate-600"}`}>{phase}</span>
                  <span className="text-xs text-slate-700 flex-1">{label}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProposalPage() {
  const [data, setData] = useState<ProposalData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Data is saved before window.open, so it should be available immediately.
    // Also listen for storage events so map image (saved async after capture) updates live.
    const initial = loadProposalData();
    if (initial) {
      setData(initial);
    } else {
      // Fallback: wait a bit in case of race condition
      const t = setTimeout(() => {
        const saved = loadProposalData();
        if (saved) setData(saved);
        else setNotFound(true);
      }, 3000);
      return () => clearTimeout(t);
    }

    // Listen for map image update from parent tab
    const onStorage = (e: StorageEvent) => {
      if (e.key === "solar_proposal_draft" && e.newValue) {
        try { setData(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleChange = useCallback((updated: ProposalData) => {
    setData(updated);
    saveProposalData(updated);
  }, []);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <p className="text-slate-500 mb-4">제안서 데이터가 없습니다.</p>
          <p className="text-sm text-slate-400 mb-6">모듈 배치 페이지에서 &quot;사업제안서 생성&quot; 버튼을 눌러주세요.</p>
          <Link href="/panel-layout" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
            모듈 배치로 이동
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">데이터 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Toolbar (screen only) ── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 h-12 bg-slate-900 flex items-center px-4 gap-3 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/company-logo.png" alt="TNE" className="h-6 w-auto object-contain bg-white rounded px-1.5" />
        <span className="text-white text-sm font-semibold flex-1">사업제안서</span>
        <Link href="/panel-layout" className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded hover:bg-slate-700">
          ← 배치도로
        </Link>
        <button
          onClick={() => setEditMode(v => !v)}
          className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${editMode ? "bg-blue-500 text-white" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}
        >
          {editMode ? "✓ 편집 중" : "✏️ 편집"}
        </button>
        <button
          onClick={() => window.print()}
          className="text-xs px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold"
        >
          PDF 인쇄
        </button>
      </div>

      {/* Edit sidebar */}
      {editMode && <EditSidebar data={data} onChange={handleChange} />}

      {/* Proposal content */}
      <div className={`proposal-wrap pt-12 ${editMode ? "mr-72" : ""}`}>
        <CoverPage data={data} />
        <ExecutiveSummaryPage data={data} />
        <SystemLayoutPage data={data} />
        <RevenuePage data={data} />
        <BusinessOverviewPage data={data} />
        <ConstructionPage data={data} />
      </div>

      <style>{`
        :root { --navy: #1c2f4f; }
        .bg-navy { background-color: var(--navy); }
        .text-navy { color: var(--navy); }
        .border-l-navy { border-left-color: var(--navy); }

        .proposal-page {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto 0;
          padding: 40px 48px;
          background: white;
          min-height: 700px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.08);
          position: relative;
        }
        .proposal-page + .proposal-page {
          border-top: 8px solid #f1f5f9;
        }
        .cover-page {
          min-height: 620px;
          padding: 0;
          overflow: hidden;
          border-radius: 0;
        }
        .proposal-wrap {
          background: #f1f5f9;
          padding-bottom: 40px;
        }

        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          .no-print { display: none !important; }
          .proposal-wrap { background: white; padding: 0; margin: 0; }
          .proposal-page {
            max-width: none;
            width: 100%;
            padding: 12mm 14mm;
            box-shadow: none;
            page-break-after: always;
            min-height: 0;
            break-after: page;
          }
          .proposal-page + .proposal-page { border-top: none; }
          body { margin: 0; }
        }
      `}</style>
    </>
  );
}
