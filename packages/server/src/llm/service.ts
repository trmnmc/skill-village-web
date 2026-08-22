import { defaultCliCommand, runCli } from './cli.js';
import { recordSpend, remaining, type LlmState } from './ledger.js';

export type LlmMode = 'full' | 'silent';

export interface LlmRequest {
  kind: 'chatter' | 'serious';
  budget: 'interactive' | 'autonomous';
  prompt: string;
}

export type LlmReply =
  | { ok: true; text: string }
  | { ok: false; why: 'silent' | 'budget' | 'failed' };

export interface LlmService {
  /** One cheap call to find out whether a model is there at all. */
  probe(): Promise<LlmMode>;
  mode(): LlmMode;
  request(req: LlmRequest): Promise<LlmReply>;
}

interface Options {
  command?: readonly string[];
  now: () => number;
  getLlm: () => LlmState;
  setLlm: (next: LlmState) => Promise<void>;
  concurrency?: number;
  timeoutMs?: number;
}

/**
 * The one door to the model. Everything the spec hangs on the LLM layer
 * lives here: the queue (a chatty village must not stampede the CLI), the
 * routing (chatter -> haiku, serious -> session default), the ledger writes,
 * and the mode the whole village degrades by. No other module runs the CLI.
 */
export function createLlmService(opts: Options): LlmService {
  const command = opts.command ?? defaultCliCommand();
  const concurrency = opts.concurrency ?? 2;
  let mode: LlmMode = 'silent';

  // A minimal promise queue: `slots` tracks running children; waiters resolve
  // in FIFO order as slots free up.
  let running = 0;
  const waiters: Array<() => void> = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (running < concurrency) {
        running++;
        resolve();
      } else {
        waiters.push(() => { running++; resolve(); });
      }
    });
  const release = () => {
    running--;
    waiters.shift()?.();
  };

  return {
    mode: () => mode,

    async probe() {
      const result = await runCli(command, {
        prompt: 'Reply with exactly: READY',
        model: 'haiku',
        timeoutMs: opts.timeoutMs ?? 30_000,
      });
      mode = result.ok ? 'full' : 'silent';
      if (result.ok) {
        await opts.setLlm(recordSpend(opts.getLlm(), 'interactive', result.inputTokens, result.outputTokens, opts.now()));
      }
      return mode;
    },

    async request(req) {
      if (mode !== 'full') return { ok: false, why: 'silent' };
      if (remaining(opts.getLlm(), req.budget, opts.now()) <= 0) return { ok: false, why: 'budget' };

      await acquire();
      try {
        const result = await runCli(command, {
          prompt: req.prompt,
          model: req.kind === 'chatter' ? 'haiku' : undefined,
          timeoutMs: opts.timeoutMs,
        });

        if (!result.ok) {
          if (result.reason === 'unauthenticated' || result.reason === 'missing') mode = 'silent';
          return { ok: false, why: 'failed' };
        }

        // Record what was actually spent, after the fact — the pre-check above
        // keeps a drained budget from dispatching at all, and slight overshoot
        // on the last call under the cap is accepted (spec: graceful, not exact).
        await opts.setLlm(recordSpend(opts.getLlm(), req.budget, result.inputTokens, result.outputTokens, opts.now()));
        return { ok: true, text: result.text };
      } finally {
        release();
      }
    },
  };
}
