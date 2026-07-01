export const PROPOSAL_LS_KEY = "solar_proposal_draft";

export interface ProposalZone {
  label: string;
  color: string;
  moduleCount: number;
  capacityKw: number;
  angle: number;
}

export interface ProposalData {
  projectName: string;
  location: string;
  totalCapacityKw: number;
  totalModules: number;
  moduleWattage: number;
  moduleMaker: string;
  moduleWidth: number;
  moduleHeight: number;
  modulesPerString: number;
  totalStrings: number;
  peakSunHours: number;
  systemEfficiency: number;
  zones: ProposalZone[];
  mapImageDataUrl: string;
  // editable
  clientName: string;
  smpRate: number;              // SMP 단가 (원/kWh)
  recRate: number;              // REC 단가 (원/kWh)
  recWeight: number;            // REC 가중치 (recRate에만 적용)
  constructionUnitPriceWan: number; // 공사 단가 (만원/kW)
  proposalDate: string;
  // company
  companyName: string;
  companyTel: string;
  companyFax: string;
  companyEmail: string;
  companyWeb: string;
  companyAddress: string;
  companyLicense: string;
}

export const DEFAULT_PROPOSAL: Partial<ProposalData> = {
  clientName: "",
  smpRate: 120,
  recRate: 64,
  recWeight: 1.5,
  constructionUnitPriceWan: 130,
  proposalDate: new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long" }),
  companyName: "주식회사 티앤이",
  companyTel: "055-291-5567",
  companyFax: "055-291-5568",
  companyEmail: "tnekbt1041@naver.com",
  companyWeb: "www.tneepc.com",
  companyAddress: "경남 창원시 의창구 동읍 신촌본포로426",
  companyLicense: "제 경남-02113 호",
};

export const BLANK_PROPOSAL: ProposalData = {
  projectName: "태양광 발전소",
  location: "",
  totalCapacityKw: 0,
  totalModules: 0,
  moduleWattage: 500,
  moduleMaker: "",
  moduleWidth: 1.134,
  moduleHeight: 2.278,
  modulesPerString: 15,
  totalStrings: 0,
  peakSunHours: 3.5,
  systemEfficiency: 0.85,
  zones: [],
  mapImageDataUrl: "",
  clientName: "",
  smpRate: 120,
  recRate: 64,
  recWeight: 1.5,
  constructionUnitPriceWan: 130,
  proposalDate: "",
  companyName: "주식회사 티앤이",
  companyTel: "055-291-5567",
  companyFax: "055-291-5568",
  companyEmail: "tnekbt1041@naver.com",
  companyWeb: "www.tneepc.com",
  companyAddress: "경남 창원시 의창구 동읍 신촌본포로426",
  companyLicense: "제 경남-02113 호",
};

export function calcBlendedRate(data: Pick<ProposalData, "smpRate" | "recRate" | "recWeight">): number {
  return data.smpRate + data.recRate * data.recWeight;
}

export function calcConstructionCostWan(data: Pick<ProposalData, "constructionUnitPriceWan" | "totalCapacityKw">): number {
  return Math.round(data.constructionUnitPriceWan * data.totalCapacityKw);
}

export function calcAnnualGenerationKwh(data: Pick<ProposalData, "totalCapacityKw" | "peakSunHours" | "systemEfficiency">): number {
  return data.totalCapacityKw * data.peakSunHours * 365 * data.systemEfficiency;
}

export function calcAnnualRevenueWan(data: Pick<ProposalData, "totalCapacityKw" | "peakSunHours" | "systemEfficiency" | "smpRate" | "recRate" | "recWeight">): number {
  const kwh = calcAnnualGenerationKwh(data);
  return Math.round((kwh * calcBlendedRate(data)) / 10000);
}

export function calcBreakevenYear(data: Pick<ProposalData, "totalCapacityKw" | "peakSunHours" | "systemEfficiency" | "smpRate" | "recRate" | "recWeight" | "constructionUnitPriceWan">): number {
  const annualWan = calcAnnualRevenueWan(data);
  if (annualWan <= 0) return 0;
  return Math.ceil(calcConstructionCostWan(data) / annualWan);
}

export function saveProposalData(data: ProposalData): void {
  try { localStorage.setItem(PROPOSAL_LS_KEY, JSON.stringify(data)); } catch {}
}

export function loadProposalData(): ProposalData | null {
  try {
    const raw = localStorage.getItem(PROPOSAL_LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
