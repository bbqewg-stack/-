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
  smpBlendedRate: number;
  constructionCostWan: number;
  proposalDate: string;
  recWeight: number;
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
  smpBlendedRate: 216,
  recWeight: 1.5,
  proposalDate: new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long" }),
  companyName: "주식회사 티앤이",
  companyTel: "055-291-5567",
  companyFax: "055-291-5568",
  companyEmail: "tnekbt1041@naver.com",
  companyWeb: "www.tneepc.com",
  companyAddress: "경남 창원시 의창구 동읍 신촌본포로426",
  companyLicense: "제 경남-02113 호",
};

export function calcAnnualGenerationKwh(data: Pick<ProposalData, "totalCapacityKw" | "peakSunHours" | "systemEfficiency">): number {
  return data.totalCapacityKw * data.peakSunHours * 365 * data.systemEfficiency;
}

export function calcAnnualRevenueWan(data: Pick<ProposalData, "totalCapacityKw" | "peakSunHours" | "systemEfficiency" | "smpBlendedRate">): number {
  const kwh = calcAnnualGenerationKwh(data);
  return Math.round((kwh * data.smpBlendedRate) / 10000);
}

export function calcBreakevenYear(data: Pick<ProposalData, "totalCapacityKw" | "peakSunHours" | "systemEfficiency" | "smpBlendedRate" | "constructionCostWan">): number {
  const annualWan = calcAnnualRevenueWan(data);
  if (annualWan <= 0) return 0;
  return Math.ceil(data.constructionCostWan / annualWan);
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
