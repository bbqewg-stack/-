export interface SolarParams {
  areaSqm: number;
  coverageRatio: number;
  panelEfficiency: number;
  peakSunHours: number;
  systemEfficiency: number;
}

export interface SolarResult {
  capacityKw: number;
  annualGenerationKwh: number;
  panelCount: number;
}

const PANEL_AREA_SQM = 2.0;
const STANDARD_IRRADIANCE = 1.0; // kW/m²

export function calculateSolar(params: SolarParams): SolarResult {
  const { areaSqm, coverageRatio, panelEfficiency, peakSunHours, systemEfficiency } = params;

  const usableArea = areaSqm * coverageRatio;
  const panelCount = Math.floor(usableArea / PANEL_AREA_SQM);
  const panelPowerKw = PANEL_AREA_SQM * STANDARD_IRRADIANCE * panelEfficiency;
  const capacityKw = panelCount * panelPowerKw;
  const annualGenerationKwh = capacityKw * peakSunHours * 365 * systemEfficiency;

  return { capacityKw, annualGenerationKwh, panelCount };
}
