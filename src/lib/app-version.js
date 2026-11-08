// Detect that a newer build of the app has been deployed than the one this tab is running. The SPA is a single hashed
// entry bundle (/assets/index-<hash>.js, referenced by the page HTML), so "newer deploy" = the page's bundle name differs
// from the one this tab loaded. Pure helpers (the polling lives in App.jsx).

const BUNDLE_RE = /\/assets\/(index-[A-Za-z0-9_-]+\.js)/;

// The entry bundle file name referenced by a page's HTML, or null (a login page, an error page, no hash in dev).
export function bundleIdFromHtml(html) {
  if (typeof html !== "string") return null;
  const m = BUNDLE_RE.exec(html);
  return m ? m[1] : null;
}

// True only when both names are known and differ — never for an unknown current build (dev server) or a page that
// isn't the app (a login redirect).
export function isNewVersionAvailable(currentId, html) {
  const next = bundleIdFromHtml(html);
  return !!currentId && !!next && next !== currentId;
}
