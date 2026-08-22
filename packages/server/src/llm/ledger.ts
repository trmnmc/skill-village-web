export interface LlmLedger {
  /** UTC YYYY-MM-DD this ledger counts. Rolls over on the first spend of a new day. */
  day: string;
  interactiveIn: number;
  interactiveOut: number;
  autonomousIn: number;
  autonomousOut: number;
}

export interface LlmConfig {
  interactiveCap: number;
  autonomousCap: number;
  /** Spec §5: off until the player turns it on. The M9 scheduler spends it. */
  autonomousEnabled: boolean;
}

export interface LlmState {
  ledger: LlmLedger;
  config: LlmConfig;
}

export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function freshLedger(now: number): LlmLedger {
  return { day: dayOf(now), interactiveIn: 0, interactiveOut: 0, autonomousIn: 0, autonomousOut: 0 };
}

export function defaultLlmState(now: number): LlmState {
  return {
    ledger: freshLedger(now),
    config: { interactiveCap: 500_000, autonomousCap: 100_000, autonomousEnabled: false },
  };
}

/** The ledger for `now`: today's, or a fresh one if the stored day has passed. */
function current(state: LlmState, now: number): LlmLedger {
  return state.ledger.day === dayOf(now) ? state.ledger : freshLedger(now);
}

export function recordSpend(
  state: LlmState,
  kind: 'interactive' | 'autonomous',
  inTok: number,
  outTok: number,
  now: number,
): LlmState {
  const ledger = { ...current(state, now) };
  if (kind === 'interactive') {
    ledger.interactiveIn += inTok;
    ledger.interactiveOut += outTok;
  } else {
    ledger.autonomousIn += inTok;
    ledger.autonomousOut += outTok;
  }
  return { ...state, ledger };
}

export function remaining(state: LlmState, kind: 'interactive' | 'autonomous', now: number): number {
  const ledger = current(state, now);
  if (kind === 'autonomous' && !state.config.autonomousEnabled) return 0;
  const spent = kind === 'interactive'
    ? ledger.interactiveIn + ledger.interactiveOut
    : ledger.autonomousIn + ledger.autonomousOut;
  const cap = kind === 'interactive' ? state.config.interactiveCap : state.config.autonomousCap;
  return Math.max(0, cap - spent);
}
