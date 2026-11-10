import posthog from "posthog-js";

// Product analytics for the Rio app. Off unless VITE_POSTHOG_KEY is set
// (h-tutor/.env). Privacy: no autocapture, no session replay, and never the
// text the learner typed or said, nor anything from their screen. Only
// counts, durations, app names, languages and outcomes.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://eu.i.posthog.com";

type Props = Record<string, unknown>;
let on = false;

/** `surface`: which window (panel bar, autopilot notch). Same anonymous id for both. */
export function initAnalytics(surface: "app" | "notch") {
  if (!KEY || on) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage",
  });
  posthog.register({ surface, app_version: __APP_VERSION__, screen_w: screen.width, screen_h: screen.height });
  on = true;
  if (surface === "app") {
    track("app_opened");
    window.addEventListener("error", (e) => track("ui_error", { error: short(e.message) }));
    window.addEventListener("unhandledrejection", (e) => track("ui_error", { error: short(errorOf(e.reason)) }));
  }
}

export function track(event: string, props?: Props) {
  if (on) posthog.capture(event, props);
}

function errorOf(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e) ?? "";
}
function short(s: string): string {
  return s.slice(0, 160);
}
/** Broad cause of a failure, for grouping in PostHog. */
export function errorKind(e: unknown): string {
  const m = errorOf(e).toLowerCase();
  if (/stopp|cancel/.test(m)) return "stopped";
  if (/429|rate.?limit|quota/.test(m)) return "rate_limited";
  if (/timeout|timed out|deadline|too long/.test(m)) return "timeout";
  if (/key|token|unauthori|401|403/.test(m)) return "auth";
  if (/network|connect|dns|offline|unavailable|5\d\d/.test(m)) return "network";
  if (/permission|accessibility|screen recording/.test(m)) return "permission";
  return "other";
}

/**
 * Runs `call`, then sends `event` with its duration and outcome; `after`
 * adds properties from the result. Errors are sent as a kind plus a short
 * message (the app's own error text, never the learner's input).
 */
export async function timed<T>(event: string, props: Props, call: () => Promise<T>, after?: (r: T) => Props): Promise<T> {
  const t0 = performance.now();
  try {
    const r = await call();
    track(event, { ...props, ...(after ? after(r) : {}), ok: true, duration_ms: Math.round(performance.now() - t0) });
    return r;
  } catch (e) {
    track(event, { ...props, ok: false, error_kind: errorKind(e), error: short(errorOf(e)), duration_ms: Math.round(performance.now() - t0) });
    throw e;
  }
}

// ---------- One tutorial run, from start to completion or stop ----------

type Run = {
  t0: number;
  source: string;
  lang: string | null;
  app: string | null;
  steps: number;
  kinds: Record<string, number>;
  unchanged: number;
  questions: number;
  reveals: number;
  repoints: number;
  skips: number;
  learnerQuestions: number;
  milestoneT0: number;
  done: Set<string>;
  total: number;
};
let run: Run | null = null;

export function runStarted(source: "library" | "goal", lang: string | null, app: string | null) {
  if (run) runEnded("replaced");
  const now = performance.now();
  run = { t0: now, source, lang, app, steps: 0, kinds: {}, unchanged: 0, questions: 0, reveals: 0, repoints: 0, skips: 0, learnerQuestions: 0, milestoneT0: now, done: new Set(), total: 0 };
}

export function runCount(what: "questions" | "reveals" | "repoints" | "skips") {
  if (run) run[what] += 1;
}

type StepLike = {
  kind: string;
  unchanged: boolean;
  completed: string[];
  progress: { id: string; status: string; optional: boolean }[];
  milestone: { id: string } | null;
  hint_only: boolean;
  options: string[];
};

/** Every step Holo returns: milestones closed, help given, end of the run. */
export function runStep(step: StepLike) {
  if (!run) return;
  run.steps += 1;
  run.kinds[step.kind] = (run.kinds[step.kind] ?? 0) + 1;
  if (step.unchanged) run.unchanged += 1;
  run.total = step.progress.length || run.total;
  const now = performance.now();
  for (const id of step.completed) {
    if (run.done.has(id)) continue;
    run.done.add(id);
    const index = step.progress.findIndex((m) => m.id === id);
    track("milestone_completed", {
      index,
      total: run.total,
      seconds: Math.round((now - run.milestoneT0) / 1000),
      app: run.app,
      source: run.source,
    });
    run.milestoneT0 = now;
  }
  if (step.kind === "ask_learner") {
    run.learnerQuestions += 1;
    track("learner_asked", { options: step.options.length, app: run.app });
  }
  if (step.kind === "done") runEnded("completed");
}

/** Sends the run summary: the main event to read a tutorial funnel. */
export function runEnded(outcome: "completed" | "stopped" | "error" | "replaced" | "closed", error?: unknown) {
  if (!run) return;
  const r = run;
  run = null;
  track("tutorial_ended", {
    outcome,
    source: r.source,
    lang: r.lang,
    app: r.app,
    seconds: Math.round((performance.now() - r.t0) / 1000),
    steps: r.steps,
    step_kinds: r.kinds,
    unchanged_steps: r.unchanged,
    milestones_done: r.done.size,
    milestones_total: r.total,
    completion: r.total ? Math.round((100 * r.done.size) / r.total) : null,
    questions: r.questions,
    reveals: r.reveals,
    repoints: r.repoints,
    skips: r.skips,
    learner_questions: r.learnerQuestions,
    ...(error ? { error_kind: errorKind(error), error: short(errorOf(error)) } : {}),
  });
}

// A run left open when the bar's window closes still gets its summary.
addEventListener("pagehide", () => runEnded("closed"));
