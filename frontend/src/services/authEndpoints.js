export const AUTH_SESSION_PATH = "/api/auth/session";

// Shared request builder keeps sign-in and post-verification session checks
// pointed at the same protected Firebase session endpoint.
export function postAuthSession(fetchImpl, url, headers) {
  return fetchImpl(url, { method: "POST", headers });
}
