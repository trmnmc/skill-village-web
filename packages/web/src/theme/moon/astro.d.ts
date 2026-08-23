export interface MoonState {
  julianDay: number; age: number; cycleFraction: number; phaseAngle: number;
  illumination: number; phaseName: string; isInstantPhase: boolean;
}
export function computeMoon(date: Date): MoonState;
export function nextFullMoon(date: Date): Date;
export const PHASE_NAMES: string[];
export const PHASE_ILLUMINATION_CONSISTENCY_DOMAIN: { startMs: number; endMs: number };
