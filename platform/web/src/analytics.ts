import posthog from "posthog-js";

// Console analytics (rio.vignemale.com). Off unless VITE_POSTHOG_KEY is set
// (h-tutor/.env at build time). Pageviews per route, clicks with heatmaps,
// dead clicks, every write to the console API, sign-up/sign-in, and the
// signed-in user grouped by organization. No session replay; inputs and the
// text of tutorials or documents are never sent.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://eu.i.posthog.com";

let on = false;

export function initAnalytics() {
  if (!KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: { dom_event_allowlist: ["click", "submit"], element_allowlist: ["a", "button", "form", "select"] },
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_dead_clicks: true,
    enable_heatmaps: true,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
  });
  posthog.register({ surface: "console" });
  on = true;
}

export function track(event: string, props?: Record<string, unknown>) {
  if (on) posthog.capture(event, props);
}

let identified = "";
/** Ties events to the signed-in user and their active organization (PostHog group "organization"). */
export function identify(user: { id: string; email?: string | null; name?: string | null }, org: { id: string; name?: string | null } | null, role?: string) {
  if (!on) return;
  const key = `${user.id}/${org?.id ?? ""}/${role ?? ""}`;
  if (key === identified) return;
  identified = key;
  posthog.identify(user.id, { email: user.email ?? undefined, name: user.name ?? undefined });
  if (org) posthog.group("organization", org.id, { name: org.name ?? undefined });
  if (role) posthog.register({ role });
}

export function resetIdentity() {
  identified = "";
  if (on) posthog.reset();
}

// ---------- Writes to the console API ----------

/** Readable names for the console's writes; anything else is `console_action`. */
const ACTIONS: [RegExp, string][] = [
  [/^POST \/tutorials$/, "tutorial_created"],
  [/^POST \/tutorials\/:id\/retry$/, "tutorial_retried"],
  [/^POST \/tutorials\/:id\/remix$/, "tutorial_remixed"],
  [/^POST \/tutorials\/:id\/like$/, "tutorial_liked"],
  [/^PATCH \/tutorials\/:id$/, "tutorial_edited"],
  [/^DELETE \/tutorials\/:id$/, "tutorial_deleted"],
  [/^POST \/knowledge\/docs$/, "knowledge_doc_added"],
  [/^DELETE \/knowledge\/docs\/:id$/, "knowledge_doc_deleted"],
  [/^POST \/knowledge\/apps\/:id\/share$/, "knowledge_shared"],
  [/^POST \/tokens$/, "api_token_created"],
  [/^DELETE \/tokens\/:id$/, "api_token_deleted"],
];

/** `/tutorials/abc123/like?x=1` → `/tutorials/:id/like` (ids never become event names). */
function route(path: string): string {
  return path
    .split("?")[0]!
    .split("/")
    .map((seg, i, all) => (i > 1 && /^(tutorials|tokens|docs|apps)$/.test(all[i - 1]!) ? ":id" : seg))
    .join("/");
}

/** Called by `api()` for every non-GET request. `json`: the body, read only for safe fields. */
export function apiWrite(method: string, path: string, json: unknown, status: number, ms: number, error?: string) {
  if (!on) return;
  const action = `${method} ${route(path)}`;
  const name = ACTIONS.find(([re]) => re.test(action))?.[1] ?? "console_action";
  const body = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  if (typeof body.app === "string") safe.app = body.app;
  if (typeof body.visibility === "string") safe.visibility = body.visibility;
  if (typeof body.shared === "boolean") safe.shared = body.shared;
  if (typeof body.input === "string") {
    safe.input_kind = /youtu\.?be/.test(body.input) ? "youtube" : /^https?:\/\//.test(body.input) ? "url" : "text";
    safe.input_words = body.input.trim().split(/\s+/).length;
  }
  if (typeof body.text === "string") safe.doc_chars = body.text.length;
  if (Array.isArray(body.milestones)) safe.milestones = body.milestones.length;
  track(name, { action, ok: !error, status, duration_ms: Math.round(ms), ...safe, ...(error ? { error: error.slice(0, 160) } : {}) });
}
