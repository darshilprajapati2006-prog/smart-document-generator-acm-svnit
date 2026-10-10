export const AUTH_SESSION_PATH = "/api/auth/session";
export const BOOTSTRAP_ADMIN_PATH = "/api/auth/bootstrap-admin";

// Shared request builder keeps sign-in and post-verification session checks
// pointed at the same protected Firebase session endpoint.
export function postAuthSession(fetchImpl, url, headers) {
  return fetchImpl(url, { method: "POST", headers });
}

// The one-time bootstrap never accepts the server bootstrap secret from the
// client. Only the fresh Firebase ID token is attached to this request.
export function postBootstrapAdmin(fetchImpl, url, idToken) {
  return fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
}
