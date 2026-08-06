// worker.js — Cloudflare Worker backend for ShiftApp
// =============================================================================
// A complete REST API backed by Cloudflare KV.
//
// Data model: each user's whole document lives under a single KV key
//   user:<userId>  ->  { profile, workplaces, shifts }
// scoped by the `X-User-Id` request header. This keeps writes atomic per user
// and reads to a single round trip — ideal for a personal scheduling app.
//
// ---- Setup ------------------------------------------------------------------
//   1. npm i -g wrangler            (or use `npx wrangler`)
//   2. wrangler kv namespace create SHIFT_KV
//        -> copy the returned id into wrangler.toml (see that file)
//   3. wrangler deploy
//   4. Point the client at the deployed URL
//        (window.__SHIFT_API_URL__ or VITE_API_URL).
//
// ---- REST API ---------------------------------------------------------------
//   GET    /                       health/info (no auth)
//   GET    /health                 health check (no auth)
//
//   (all /api/* require the X-User-Id header)
//   GET    /api/state              -> { profile, workplaces, shifts }
//   DELETE /api/state              reset this user's data to defaults
//
//   GET    /api/profile            -> profile
//   PUT    /api/profile            replace profile
//   PATCH  /api/profile            merge into profile
//
//   GET    /api/workplaces         -> [workplace]
//   POST   /api/workplaces         create             -> workplace (201)
//   GET    /api/workplaces/:id     -> workplace
//   PUT    /api/workplaces/:id     upsert             -> workplace
//   DELETE /api/workplaces/:id     delete (+ its shifts)
//
//   GET    /api/shifts             -> [shift]   (optional ?from=YYYY-MM-DD&to=YYYY-MM-DD)
//   POST   /api/shifts             create             -> shift (201)
//   POST   /api/shifts/bulk        { shifts:[...] }   -> [shift] (201)
//   GET    /api/shifts/:id         -> shift
//   PUT    /api/shifts/:id         upsert             -> shift
//   DELETE /api/shifts/:id         delete
// =============================================================================

// ---- CORS -------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
  "Access-Control-Max-Age": "86400",
};

// ---- Response helpers -------------------------------------------------------
function json(data, status = 200, extraHeaders = {}) {
  return new Response(data === null ? "" : JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extraHeaders },
  });
}
const ok = (data) => json(data, 200);
const created = (data) => json(data, 201);
const err = (message, status = 400) => json({ error: message }, status);

// ---- Seed / defaults --------------------------------------------------------
// Kept in sync with the client's seed so a brand-new user has usable workplaces.
function defaultDoc() {
  return {
    profile: { name: "יוסי", weekStart: 0, hourFormat: "24h" },
    workplaces: [
      {
        id: "w1",
        name: "דובנוב",
        accent: "#1677FF",
        shiftTypes: [
          { id: "w1m", name: "בוקר", kind: "morning", startOptions: ["07:00", "09:00"], endOptions: ["14:00", "15:00"] },
          { id: "w1e", name: "ערב", kind: "evening", startOptions: ["15:00", "17:00"], endOptions: ["22:00", "23:00"] },
        ],
      },
      {
        id: "w2",
        name: "אייסטור",
        accent: "#1DB954",
        shiftTypes: [
          { id: "w2m", name: "בוקר", kind: "morning", startOptions: ["08:00", "09:15"], endOptions: ["15:00", "16:00"] },
          { id: "w2e", name: "ערב", kind: "evening", startOptions: ["15:00"], endOptions: ["21:30", "22:30"] },
        ],
      },
    ],
    shifts: [], // clean schedule — the user adds their own
  };
}

function newId(prefix) {
  const rnd =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

// ---- KV document access -----------------------------------------------------
function keyFor(userId) {
  return `user:${userId}`;
}

async function loadDoc(env, userId) {
  const raw = await env.SHIFT_KV.get(keyFor(userId));
  if (!raw) {
    const doc = defaultDoc();
    await env.SHIFT_KV.put(keyFor(userId), JSON.stringify(doc));
    return doc;
  }
  try {
    const doc = JSON.parse(raw);
    // defensive: guarantee shape
    doc.profile = doc.profile || {};
    doc.workplaces = Array.isArray(doc.workplaces) ? doc.workplaces : [];
    doc.shifts = Array.isArray(doc.shifts) ? doc.shifts : [];
    return doc;
  } catch (_) {
    const doc = defaultDoc();
    await env.SHIFT_KV.put(keyFor(userId), JSON.stringify(doc));
    return doc;
  }
}

async function saveDoc(env, userId, doc) {
  await env.SHIFT_KV.put(keyFor(userId), JSON.stringify(doc));
  return doc;
}

// ---- Route table ------------------------------------------------------------
// Each handler receives { env, userId, params, body, query } and returns a Response.
const ROUTES = [
  // --- health (no auth) ---
  { method: "GET", pattern: /^\/$/, auth: false, handler: () => ok({ name: "shiftapp-api", status: "ok" }) },
  { method: "GET", pattern: /^\/health$/, auth: false, handler: () => ok({ status: "ok", ts: Date.now() }) },

  // --- whole state ---
  {
    method: "GET",
    pattern: /^\/api\/state$/,
    handler: async ({ env, userId }) => ok(await loadDoc(env, userId)),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/state$/,
    handler: async ({ env, userId }) => ok(await saveDoc(env, userId, defaultDoc())),
  },

  // --- profile ---
  {
    method: "GET",
    pattern: /^\/api\/profile$/,
    handler: async ({ env, userId }) => ok((await loadDoc(env, userId)).profile),
  },
  {
    method: "PUT",
    pattern: /^\/api\/profile$/,
    handler: async ({ env, userId, body }) => {
      const doc = await loadDoc(env, userId);
      doc.profile = { ...(body || {}) };
      await saveDoc(env, userId, doc);
      return ok(doc.profile);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/profile$/,
    handler: async ({ env, userId, body }) => {
      const doc = await loadDoc(env, userId);
      doc.profile = { ...doc.profile, ...(body || {}) };
      await saveDoc(env, userId, doc);
      return ok(doc.profile);
    },
  },

  // --- workplaces collection ---
  {
    method: "GET",
    pattern: /^\/api\/workplaces$/,
    handler: async ({ env, userId }) => ok((await loadDoc(env, userId)).workplaces),
  },
  {
    method: "POST",
    pattern: /^\/api\/workplaces$/,
    handler: async ({ env, userId, body }) => {
      if (!body || typeof body !== "object") return err("Body required");
      const doc = await loadDoc(env, userId);
      const wp = { ...body, id: body.id || newId("w") };
      doc.workplaces.push(wp);
      await saveDoc(env, userId, doc);
      return created(wp);
    },
  },

  // --- workplace item ---
  {
    method: "GET",
    pattern: /^\/api\/workplaces\/([^/]+)$/,
    handler: async ({ env, userId, params }) => {
      const doc = await loadDoc(env, userId);
      const wp = doc.workplaces.find((w) => w.id === params[0]);
      return wp ? ok(wp) : err("Workplace not found", 404);
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/workplaces\/([^/]+)$/,
    handler: async ({ env, userId, params, body }) => {
      const id = params[0];
      const doc = await loadDoc(env, userId);
      const wp = { ...(body || {}), id };
      const idx = doc.workplaces.findIndex((w) => w.id === id);
      if (idx === -1) doc.workplaces.push(wp);
      else doc.workplaces[idx] = wp;
      await saveDoc(env, userId, doc);
      return ok(wp);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/workplaces\/([^/]+)$/,
    handler: async ({ env, userId, params }) => {
      const id = params[0];
      const doc = await loadDoc(env, userId);
      doc.workplaces = doc.workplaces.filter((w) => w.id !== id);
      doc.shifts = doc.shifts.filter((s) => s.workplaceId !== id); // cascade
      await saveDoc(env, userId, doc);
      return ok({ ok: true, id });
    },
  },

  // --- shifts collection ---
  {
    method: "GET",
    pattern: /^\/api\/shifts$/,
    handler: async ({ env, userId, query }) => {
      const doc = await loadDoc(env, userId);
      let list = doc.shifts;
      const from = query.get("from");
      const to = query.get("to");
      if (from) list = list.filter((s) => s.date >= from);
      if (to) list = list.filter((s) => s.date <= to);
      return ok(list);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/shifts$/,
    handler: async ({ env, userId, body }) => {
      if (!body || typeof body !== "object") return err("Body required");
      const doc = await loadDoc(env, userId);
      const shift = { ...body, id: body.id || newId("s") };
      doc.shifts.push(shift);
      await saveDoc(env, userId, doc);
      return created(shift);
    },
  },

  // --- shifts bulk (must be registered before the :id route) ---
  {
    method: "POST",
    pattern: /^\/api\/shifts\/bulk$/,
    handler: async ({ env, userId, body }) => {
      const incoming = Array.isArray(body?.shifts) ? body.shifts : [];
      const doc = await loadDoc(env, userId);
      const rows = incoming.map((s) => ({ ...s, id: s.id || newId("s") }));
      doc.shifts.push(...rows);
      await saveDoc(env, userId, doc);
      return created(rows);
    },
  },

  // --- shift item ---
  {
    method: "GET",
    pattern: /^\/api\/shifts\/([^/]+)$/,
    handler: async ({ env, userId, params }) => {
      const doc = await loadDoc(env, userId);
      const s = doc.shifts.find((x) => x.id === params[0]);
      return s ? ok(s) : err("Shift not found", 404);
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/shifts\/([^/]+)$/,
    handler: async ({ env, userId, params, body }) => {
      const id = params[0];
      const doc = await loadDoc(env, userId);
      const shift = { ...(body || {}), id };
      const idx = doc.shifts.findIndex((s) => s.id === id);
      if (idx === -1) doc.shifts.push(shift);
      else doc.shifts[idx] = shift;
      await saveDoc(env, userId, doc);
      return ok(shift);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/shifts\/([^/]+)$/,
    handler: async ({ env, userId, params }) => {
      const id = params[0];
      const doc = await loadDoc(env, userId);
      doc.shifts = doc.shifts.filter((s) => s.id !== id);
      await saveDoc(env, userId, doc);
      return ok({ ok: true, id });
    },
  },
];

// ---- Worker entry -----------------------------------------------------------
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    // Find routes matching the path (any method) to distinguish 404 vs 405.
    const pathMatches = ROUTES.filter((r) => r.pattern.test(path));
    if (pathMatches.length === 0) return err("Not found", 404);

    const route = pathMatches.find((r) => r.method === method);
    if (!route) {
      const allow = [...new Set(pathMatches.map((r) => r.method))].join(", ");
      return json({ error: "Method not allowed" }, 405, { Allow: allow });
    }

    // Auth (all /api/* routes)
    let userId = null;
    if (route.auth !== false) {
      userId = request.headers.get("X-User-Id");
      if (!userId) return err("Missing X-User-Id header", 401);
    }

    // Parse body for write methods
    let body;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const text = await request.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch (_) {
          return err("Invalid JSON body");
        }
      }
    }

    const params = (route.pattern.exec(path) || []).slice(1).map((p) => decodeURIComponent(p));

    try {
      return await route.handler({ env, userId, params, body, query: url.searchParams, request });
    } catch (e) {
      return err(`Server error: ${e.message}`, 500);
    }
  },
};
