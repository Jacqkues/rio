import posthog from "posthog-js";

// Landing analytics. Off unless VITE_POSTHOG_KEY is set (h-tutor/.env, read
// through envDir). Pageviews and clicks on links/buttons; no session replay.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://eu.i.posthog.com";

export function initAnalytics() {
  if (!KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: { dom_event_allowlist: ["click"], element_allowlist: ["a", "button"] },
    capture_pageview: true,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
  });
  posthog.register({ surface: "landing" });
}
