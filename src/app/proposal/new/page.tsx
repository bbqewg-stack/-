"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ProposalData, BLANK_PROPOSAL, saveProposalData, calcBlendedRate, calcConstructionCostWan } from "@/lib/proposalData";

const inputCls = "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent";
const labelCls = "block text-xs font-semibold text-slate-500 mb-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-sm font-bold text-slate-700 mb-4 pb-2 border-b border-slate-100">{title}</h2>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

export default function NewProposalPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProposalData>({
    ...BLANK_PROPOSAL,
    proposalDate: new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long" }),
  });
  const [imagePreview, setImagePreview] = useState<string>("");
  const [dragging, setDragging] = useState(false);

  const set = (patch: Partial<ProposalData>) => setForm(prev => ({ ...prev, ...patch }));

  const loadImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setImagePreview(url);
      set({ mapImageDataUrl: url });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImage(f);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadImage(f);
  };

  const handleGenerate = () => {
    saveProposalData(form);
    router.push("/proposal");
  };

  const blended = calcBlendedRate(form);
  const totalCost = calcConstructionCostWan(form);
  const isReady = form.projectName.trim().length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 h-12 flex items-center px-6 gap-3">
        <button onClick={() => router.back()} className="text-slate-400 hover:text-white text-xs">← 뒤로</button>
        <span className="text-white text-sm font-semibold flex-1">새 사업제안서 작성</span>
        <button
          onClick={handleGenerate}
          disabled={!isReady}
          className="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          제안서 생성 →
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        {/* 프로젝트 기본 정보 */}
        <Section title="프로젝트 기본 정보">
          <Field label="프로젝트명 *">
            <input className={inputCls} value={form.projectName}
              onChange={e => set({ projectName: e.target.value })} placeholder="예) 부산 기장 태양광 발전소" />
          </Field>
          <Field label="고객사명">
            <input className={inputCls} value={form.clientName}
              onChange={e => set({ clientName: e.target.value })} placeholder="예) 대성정밀 주식회사" />
          </Field>
          <Field label="설치 위치">
            <input className={inputCls} value={form.location}
              onChange={e => set({ location: e.target.value })} placeholder="예) 경남 창원시 의창구" />
          </Field>
          <Field label="제안서 날짜">
            <input className={inputCls} value={form.proposalDate}
              onChange={e => set({ proposalDate: e.target.value })} />
          </Field>
        </Section>

        {/* 시스템 사양 */}
        <Section title="시스템 사양">
          <Field label="설치 용량 (kW)">
            <input className={inputCls} type="number" min={0} step={0.1} value={form.totalCapacityKw || ""}
              onChange={e => set({ totalCapacityKw: +e.target.value })} placeholder="예) 99.5" />
          </Field>
          <Field label="모듈 수 (매)">
            <input className={inputCls} type="number" min={0} value={form.totalModules || ""}
              onChange={e => set({ totalModules: +e.target.value })} placeholder="예) 199" />
          </Field>
          <Field label="모듈 단위 용량 (W)">
            <input className={inputCls} type="number" min={0} value={form.moduleWattage || ""}
              onChange={e => set({ moduleWattage: +e.target.value })} placeholder="예) 500" />
          </Field>
          <Field label="모듈 제조사/모델명">
            <input className={inputCls} value={form.moduleMaker}
              onChange={e => set({ moduleMaker: e.target.value })} placeholder="예) 한화 Q.PEAK DUO-G9" />
          </Field>
          <Field label="직렬 연결 수 (모듈/string)">
            <input className={inputCls} type="number" min={0} value={form.modulesPerString || ""}
              onChange={e => set({ modulesPerString: +e.target.value })} placeholder="예) 15" />
          </Field>
          <Field label="병렬 연결 수 (string 수)">
            <input className={inputCls} type="number" min={0} value={form.totalStrings || ""}
              onChange={e => set({ totalStrings: +e.target.value })} placeholder="예) 13" />
          </Field>
          <Field label="일평균 일조시간 (h)">
            <input className={inputCls} type="number" min={0} step={0.1} value={form.peakSunHours}
              onChange={e => set({ peakSunHours: +e.target.value })} />
          </Field>
          <Field label="시스템 효율 (%)">
            <input className={inputCls} type="number" min={0} max={100} value={Math.round(form.systemEfficiency * 100)}
              onChange={e => set({ systemEfficiency: +e.target.value / 100 })} />
          </Field>
        </Section>

        {/* 배치도 이미지 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 mb-4 pb-2 border-b border-slate-100">배치도 이미지</h2>
          {imagePreview ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="배치도 미리보기" className="w-full max-h-80 object-contain rounded-xl border border-slate-200" />
              <div className="flex gap-3">
                <button onClick={() => fileRef.current?.click()}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium">
                  이미지 교체
                </button>
                <button onClick={() => { setImagePreview(""); set({ mapImageDataUrl: "" }); }}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium">
                  삭제
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                ${dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"}`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">+</div>
              <p className="text-sm font-medium text-slate-600">클릭하거나 이미지를 끌어다 놓으세요</p>
              <p className="text-xs text-slate-400">CAD 캡처, PNG / JPG / WEBP 모두 가능</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* 수익 분석 */}
        <Section title="수익 분석">
          <Field label="SMP 단가 (원/kWh)">
            <input className={inputCls} type="number" value={form.smpRate}
              onChange={e => set({ smpRate: +e.target.value })} />
          </Field>
          <Field label="REC 단가 (원/kWh)">
            <input className={inputCls} type="number" value={form.recRate}
              onChange={e => set({ recRate: +e.target.value })} />
          </Field>
          <Field label="REC 가중치">
            <input className={inputCls} type="number" step="0.1" value={form.recWeight}
              onChange={e => set({ recWeight: +e.target.value })} />
          </Field>
          <Field label="공사 단가 (만원/kW)">
            <input className={inputCls} type="number" value={form.constructionUnitPriceWan}
              onChange={e => set({ constructionUnitPriceWan: +e.target.value })} />
          </Field>
          <div className="col-span-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-slate-600">
            적용 단가: {form.smpRate} + {form.recRate} × {form.recWeight} =&nbsp;
            <span className="font-bold text-blue-700">{blended.toFixed(1)}원/kWh</span>
            &nbsp;·&nbsp; 예상 공사금액:&nbsp;
            <span className="font-bold text-blue-700">
              {totalCost >= 10000 ? (totalCost / 10000).toFixed(2) + "억원" : totalCost.toLocaleString("ko") + "만원"}
            </span>
          </div>
        </Section>

        {/* 시공사 정보 */}
        <Section title="시공사 정보">
          <Field label="회사명">
            <input className={inputCls} value={form.companyName} onChange={e => set({ companyName: e.target.value })} />
          </Field>
          <Field label="전화">
            <input className={inputCls} value={form.companyTel} onChange={e => set({ companyTel: e.target.value })} />
          </Field>
          <Field label="팩스">
            <input className={inputCls} value={form.companyFax} onChange={e => set({ companyFax: e.target.value })} />
          </Field>
          <Field label="이메일">
            <input className={inputCls} value={form.companyEmail} onChange={e => set({ companyEmail: e.target.value })} />
          </Field>
          <Field label="홈페이지">
            <input className={inputCls} value={form.companyWeb} onChange={e => set({ companyWeb: e.target.value })} />
          </Field>
          <Field label="면허번호">
            <input className={inputCls} value={form.companyLicense} onChange={e => set({ companyLicense: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="주소">
              <input className={inputCls} value={form.companyAddress} onChange={e => set({ companyAddress: e.target.value })} />
            </Field>
          </div>
        </Section>

        {/* 생성 버튼 */}
        <button
          onClick={handleGenerate}
          disabled={!isReady}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-base rounded-2xl transition-colors shadow-sm"
        >
          제안서 생성
        </button>
        <div className="h-6" />
      </div>
    </div>
  );
}
