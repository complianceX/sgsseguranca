import { Injectable } from '@nestjs/common';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ControlHierarchy =
  | 'ELIMINATION'
  | 'SUBSTITUTION'
  | 'ENGINEERING'
  | 'ADMINISTRATIVE'
  | 'PPE';

@Injectable()
export class RiskCalculationService {
  calculateScore(
    probability?: number | null,
    severity?: number | null,
    exposure?: number | null,
  ): number | null {
    if (!probability || !severity || !exposure) {
      return null;
    }

    const sanitizedProbability = Math.max(0, Number(probability));
    const sanitizedSeverity = Math.max(0, Number(severity));
    const sanitizedExposure = Math.max(0, Number(exposure));
    return sanitizedProbability * sanitizedSeverity * sanitizedExposure;
  }

  classifyByScore(score?: number | null): RiskLevel | null {
    if (score === null || score === undefined) {
      return null;
    }
    if (score >= 61) return 'CRITICAL';
    if (score >= 31) return 'HIGH';
    if (score >= 11) return 'MEDIUM';
    return 'LOW';
  }
}
