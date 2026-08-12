import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type E2EPhase =
  | "generate"
  | "install"
  | "verify"
  | "uninstall"
  | "residuals";

export type E2EEntryStatus = "pass" | "fail";

export interface E2EEntryResult {
  name: string;
  generator: string;
  index: number;
  total: number;
  status: E2EEntryStatus;
  durationMs: number;
  failedPhase?: E2EPhase;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export interface E2ESuiteResults {
  suite: string;
  startedAt: string;
  finishedAt?: string;
  active: number;
  skipped: number;
  pass: number;
  fail: number;
  durationMs?: number;
  results: E2EEntryResult[];
}

function truncate(text: string, max = 400): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function resolveE2EResultsPath(): string | null {
  if (process.env.ALLBREW_E2E_RESULTS) return process.env.ALLBREW_E2E_RESULTS;
  if (process.env.ALLBREW_TEST_LOG) {
    return join(dirname(process.env.ALLBREW_TEST_LOG), "e2e-results.json");
  }
  return join(process.cwd(), "tests", "e2e-runs", "e2e-results-latest.json");
}

export class E2EProgress {
  readonly suite: string;
  readonly active: number;
  readonly skipped: number;
  readonly startedAt: string;
  private readonly startMs: number;
  private readonly results: E2EEntryResult[] = [];
  private pass = 0;
  private fail = 0;
  private readonly resultsPath: string | null;

  constructor(opts: { suite: string; active: number; skipped: number }) {
    this.suite = opts.suite;
    this.active = opts.active;
    this.skipped = opts.skipped;
    this.startedAt = new Date().toISOString();
    this.startMs = Date.now();
    this.resultsPath = resolveE2EResultsPath();
    console.log(
      `[E2E] suite start: ${this.active} active entries (skipped ${this.skipped}) suite=${this.suite}`,
    );
    this.flush();
  }

  begin(index: number, name: string, generator: string): void {
    console.log(`[E2E] [${index}/${this.active}] ${name} (${generator}) begin`);
  }

  phase(
    index: number,
    name: string,
    phase: E2EPhase,
    status: "ok" | "fail",
    durationMs: number,
    detail?: string,
  ): void {
    const extra = detail ? ` detail=${JSON.stringify(truncate(detail, 200))}` : "";
    console.log(
      `[E2E] [${index}/${this.active}] ${name} phase=${phase} status=${status} durationMs=${durationMs}${extra}`,
    );
  }

  end(
    entry: Omit<E2EEntryResult, "startedAt" | "finishedAt"> & {
      startedAtMs: number;
    },
  ): void {
    const finishedAt = new Date().toISOString();
    const result: E2EEntryResult = {
      name: entry.name,
      generator: entry.generator,
      index: entry.index,
      total: entry.total,
      status: entry.status,
      durationMs: entry.durationMs,
      failedPhase: entry.failedPhase,
      error: entry.error ? truncate(entry.error, 800) : undefined,
      startedAt: new Date(entry.startedAtMs).toISOString(),
      finishedAt,
    };
    this.results.push(result);
    if (entry.status === "pass") this.pass += 1;
    else this.fail += 1;

    console.log(
      `[E2E] [${entry.index}/${this.active}] ${entry.name} end status=${entry.status} durationMs=${entry.durationMs}` +
        (entry.failedPhase ? ` failedPhase=${entry.failedPhase}` : ""),
    );
    this.flush();
  }

  finish(): void {
    const durationMs = Date.now() - this.startMs;
    console.log(
      `[E2E] suite end: pass=${this.pass} fail=${this.fail} skipped=${this.skipped} durationMs=${durationMs}`,
    );
    this.flush({ finished: true, durationMs });
  }

  private flush(opts: { finished?: boolean; durationMs?: number } = {}): void {
    if (!this.resultsPath) return;
    const payload: E2ESuiteResults = {
      suite: this.suite,
      startedAt: this.startedAt,
      finishedAt: opts.finished ? new Date().toISOString() : undefined,
      active: this.active,
      skipped: this.skipped,
      pass: this.pass,
      fail: this.fail,
      durationMs: opts.durationMs,
      results: this.results,
    };
    try {
      mkdirSync(dirname(this.resultsPath), { recursive: true });
      writeFileSync(this.resultsPath, JSON.stringify(payload, null, 2) + "\n");
    } catch (err) {
      console.error(
        `[E2E] failed to write results to ${this.resultsPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/** Run a timed phase; logs ok/fail and rethrows on failure. */
export async function runPhase<T>(
  progress: E2EProgress,
  index: number,
  name: string,
  phase: E2EPhase,
  fn: () => T | Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const value = await fn();
    progress.phase(index, name, phase, "ok", Date.now() - start);
    return value;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    progress.phase(index, name, phase, "fail", Date.now() - start, message);
    throw Object.assign(err instanceof Error ? err : new Error(message), {
      e2ePhase: phase,
    });
  }
}
