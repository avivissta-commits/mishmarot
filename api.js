// api.js
// -----------------------------------------------------------------------------
// Centralized data layer for ShiftApp.
// ALL reads and writes go through a Cloudflare Worker HTTP API (fetch).
// This is a single-user personal app, so all devices use the same fixed user id.
// -----------------------------------------------------------------------------

/**
 * Base URL of your deployed Cloudflare Worker.
 * Resolution order:
 *   1. window.__SHIFT_API_URL__      (set at runtime, e.g. in index.html)
 *   2. import.meta.env.VITE_API_URL  (Vite build-time env var)
 *   3. the fallback constant below
 */
const FALLBACK_API_BASE = "https://meshimot-api.avivissta.workers.dev";

function resolveBase() {
  if (typeof window !== "undefined" && window.__SHIFT_API_URL__) {
    return String(window.__SHIFT_API_URL__).replace(/\/+$/, "");
  }

  try {
    if (
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_URL
    ) {
      return String(import.meta.env.VITE_API_URL).replace(/\/+$/, "");
    }
  } catch (_) {
    // ignore
  }

  return FALLBACK_API_BASE.replace(/\/+$/, "");
}

const API_BASE = resolveBase();

// -----------------------------------------------------------------------------
// Single fixed user id for this personal app.
// Every browser/device reads and writes the same KV record.
// -----------------------------------------------------------------------------
export function getUserId() {
  return "yosi";
}

// Kept only so existing imports won't break if the app uses this function.
export function clearUserId() {
  // No-op: this app uses one fixed user.
}

// -----------------------------------------------------------------------------
// Core request helper
// -----------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = "GET", body, signal } = {}) {
  const url = `${API_BASE}${path}`;
  let res;

  try {
    res = await fetch(url, {
      method,
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": getUserId(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(
      `Network error contacting API: ${networkErr.message}`,
      0,
      null
    );
  }

  const text = await res.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data && data.error) ||
      res.statusText ||
      "Request failed";

    throw new ApiError(msg, res.status, data);
  }

  return data;
}

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------
export function getState({ signal } = {}) {
  return request("/api/state", { signal });
}

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------
export function saveProfile(profile, { signal } = {}) {
  return request("/api/profile", {
    method: "PUT",
    body: profile,
    signal,
  });
}

// -----------------------------------------------------------------------------
// Workplaces
// -----------------------------------------------------------------------------
export function listWorkplaces({ signal } = {}) {
  return request("/api/workplaces", { signal });
}

export function createWorkplace(workplace, { signal } = {}) {
  return request("/api/workplaces", {
    method: "POST",
    body: workplace,
    signal,
  });
}

export function updateWorkplace(id, workplace, { signal } = {}) {
  return request(`/api/workplaces/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: workplace,
    signal,
  });
}

export function deleteWorkplace(id, { signal } = {}) {
  return request(`/api/workplaces/${encodeURIComponent(id)}`, {
    method: "DELETE",
    signal,
  });
}

export function saveWorkplace(workplace, existingIds = [], opts = {}) {
  const exists =
    workplace.id &&
    existingIds.includes(workplace.id);

  return exists
    ? updateWorkplace(workplace.id, workplace, opts)
    : createWorkplace(workplace, opts);
}

// -----------------------------------------------------------------------------
// Shifts
// -----------------------------------------------------------------------------
export function listShifts({ signal } = {}) {
  return request("/api/shifts", { signal });
}

export function createShift(shift, { signal } = {}) {
  return request("/api/shifts", {
    method: "POST",
    body: shift,
    signal,
  });
}

export function updateShift(id, shift, { signal } = {}) {
  return request(`/api/shifts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: shift,
    signal,
  });
}

export function deleteShift(id, { signal } = {}) {
  return request(`/api/shifts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    signal,
  });
}

export function bulkCreateShifts(shifts, { signal } = {}) {
  return request("/api/shifts/bulk", {
    method: "POST",
    body: { shifts },
    signal,
  });
}

export { API_BASE };
