// api.js
// -----------------------------------------------------------------------------
// Centralized data layer for ShiftApp.
// ALL reads and writes go through a Cloudflare Worker HTTP API (fetch).
// The ONLY thing kept in localStorage is an anonymous user id, used to scope
// the user's data on the Worker. No shift/workplace/profile data is cached
// locally — the Worker is the single source of truth.
// -----------------------------------------------------------------------------

/**
 * Base URL of your deployed Cloudflare Worker.
 * Resolution order:
 *   1. window.__SHIFT_API_URL__      (set at runtime, e.g. in index.html)
 *   2. import.meta.env.VITE_API_URL  (Vite build-time env var)
 *   3. the fallback constant below
 * Replace the fallback with your real Worker URL, e.g.
 *   https://shiftapp-api.<your-subdomain>.workers.dev
 */
const FALLBACK_API_BASE = "https://meshimot-api.avivissta.workers.dev";

function resolveBase() {
  if (typeof window !== "undefined" && window.__SHIFT_API_URL__) {
    return String(window.__SHIFT_API_URL__).replace(/\/+$/, "");
  }
  try {
    // import.meta may be undefined in some bundlers; guard it.
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) {
      return String(import.meta.env.VITE_API_URL).replace(/\/+$/, "");
    }
  } catch (_) {
    /* import.meta not available in this environment */
  }
  return FALLBACK_API_BASE.replace(/\/+$/, "");
}

const API_BASE = resolveBase();

// -----------------------------------------------------------------------------
// User id — the single allowed use of localStorage.
// -----------------------------------------------------------------------------
const USER_ID_KEY = "shiftapp:userId";

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

export function getUserId() {
  let id = null;
  try {
    id = localStorage.getItem(USER_ID_KEY);
  } catch (_) {
    /* localStorage unavailable (private mode / SSR) — fall back to in-memory id */
  }
  if (!id) {
    id = makeId();
    try {
      localStorage.setItem(USER_ID_KEY, id);
    } catch (_) {
      /* ignore — id will just live for this session */
    }
  }
  return id;
}

/** Clears the stored user id (e.g. on "sign out" / reset device). */
export function clearUserId() {
  try {
    localStorage.removeItem(USER_ID_KEY);
  } catch (_) {
    /* ignore */
  }
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
    throw new ApiError(`Network error contacting API: ${networkErr.message}`, 0, null);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text; // non-JSON response
    }
  }

  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "Request failed";
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

// -----------------------------------------------------------------------------
// Bootstrap — fetch the whole state in one round trip.
// Returns { profile, workplaces, shifts }.
// The Worker seeds default workplaces for a brand-new user id.
// -----------------------------------------------------------------------------
export function getState({ signal } = {}) {
  return request("/api/state", { signal });
}

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------
export function saveProfile(profile, { signal } = {}) {
  return request("/api/profile", { method: "PUT", body: profile, signal });
}

// -----------------------------------------------------------------------------
// Workplaces
// -----------------------------------------------------------------------------
export function listWorkplaces({ signal } = {}) {
  return request("/api/workplaces", { signal });
}

export function createWorkplace(workplace, { signal } = {}) {
  return request("/api/workplaces", { method: "POST", body: workplace, signal });
}

export function updateWorkplace(id, workplace, { signal } = {}) {
  return request(`/api/workplaces/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: workplace,
    signal,
  });
}

export function deleteWorkplace(id, { signal } = {}) {
  return request(`/api/workplaces/${encodeURIComponent(id)}`, { method: "DELETE", signal });
}

/** Upsert helper: create if new, update if it already has a server id. */
export function saveWorkplace(workplace, existingIds = [], opts = {}) {
  const exists = workplace.id && existingIds.includes(workplace.id);
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
  return request("/api/shifts", { method: "POST", body: shift, signal });
}

export function updateShift(id, shift, { signal } = {}) {
  return request(`/api/shifts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: shift,
    signal,
  });
}

export function deleteShift(id, { signal } = {}) {
  return request(`/api/shifts/${encodeURIComponent(id)}`, { method: "DELETE", signal });
}

/** Create many shifts at once (used by "duplicate"). Returns the created rows. */
export function bulkCreateShifts(shifts, { signal } = {}) {
  return request("/api/shifts/bulk", { method: "POST", body: { shifts }, signal });
}

export { API_BASE };
