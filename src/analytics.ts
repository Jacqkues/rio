import posthog from "posthog-js";

// Product analytics for the Rio app. Off unless VITE_POSTHOG_KEY is set
// (h-tutor/.env). Privacy: no autocapture, no session replay, no text the
// learner typed or said; only the explicit events below.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://eu.i.posthog.com";

let on = false;

export function initAnalytics() {
  if (!KEY || on) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage",
  });
  posthog.register({ surface: "app" });
  on = true;
  track("app_opened");
}

export function track(event: string, props?: Record<string, unknown>) {
  if (on) posthog.capture(event, props);
}
