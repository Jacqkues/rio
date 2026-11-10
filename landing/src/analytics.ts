import posthog from "posthog-js";

// Landing analytics. Off unless VITE_POSTHOG_KEY is set (h-tutor/.env, read
// through envDir). Pageviews, scroll depth, clicks (with heatmaps), rage and
// dead clicks, sections seen, and the checkout funnel. No session replay;
// inputs are never captured.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://eu.i.posthog.com";

let on = false;

export function initAnalytics() {
  if (!KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: { dom_event_allowlist: ["click", "submit"], element_allowlist: ["a", "button", "form"] },
    capture_pageview: true,
    capture_pageleave: true, // carries scroll depth
    capture_dead_clicks: true,
    enable_heatmaps: true,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
  });
  posthog.register({ surface: "landing", viewport: viewport() });
  on = true;
  watchSections();
  watchTime();
}

export function track(event: string, props?: Record<string, unknown>) {
  if (on) posthog.capture(event, props);
}

function viewport(): string {
  const w = window.innerWidth;
  return w < 640 ? "phone" : w < 1024 ? "tablet" : "desktop";
}

/** `section_viewed` once per section (id) when half of it is on screen. */
function watchSections() {
  const seen = new Set<string>();
  const t0 = performance.now();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).id;
        if (!e.isIntersecting || seen.has(id)) continue;
        seen.add(id);
        track("section_viewed", { section: id, order: seen.size, seconds: Math.round((performance.now() - t0) / 1000) });
      }
    },
    { threshold: 0.5 },
  );
  // Sections render with React: observe them once they exist.
  const scan = () => document.querySelectorAll("section[id]").forEach((s) => io.observe(s));
  requestAnimationFrame(scan);
  setTimeout(scan, 1500);
}

/** `engaged` at 15 s, 60 s and 3 min while the tab is visible. */
function watchTime() {
  let visible = 0;
  let last = performance.now();
  const marks = [15, 60, 180];
  setInterval(() => {
    const now = performance.now();
    if (document.visibilityState === "visible") visible += (now - last) / 1000;
    last = now;
    while (marks.length && visible >= marks[0]) track("engaged", { seconds: marks.shift() });
  }, 1000);
}
