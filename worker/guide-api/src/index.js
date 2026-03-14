function jsonResponse(payload, status = 200, origin = "", allowedOrigins = []) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
  });
  applyCorsHeaders(headers, origin, allowedOrigins);
  return new Response(JSON.stringify(payload), { status, headers });
}

function applyCorsHeaders(headers, origin, allowedOrigins = []) {
  const allowAny = allowedOrigins.includes("*");
  const allowOrigin = allowAny || allowedOrigins.includes(origin) ? origin : "";
  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
  }
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Edit-Token");
}

function parseAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function guidePrefix(tripId) {
  return `guide:${tripId}:`;
}

function guideRecord(guideKey, markdown, updatedBy = "web") {
  return {
    guideKey,
    markdown: String(markdown || ""),
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
}

async function listGuides(kv, tripId) {
  const prefix = guidePrefix(tripId);
  const guides = {};

  let cursor = undefined;
  do {
    const listed = await kv.list({ prefix, cursor, limit: 1000 });
    for (const key of listed.keys) {
      const raw = await kv.get(key.name);
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        const guideKey = key.name.slice(prefix.length);
        guides[guideKey] = parsed;
      } catch (_error) {
        // Ignore invalid records.
      }
    }
    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor);

  return guides;
}

function getTripId(url, body) {
  return (
    url.searchParams.get("tripId")
    || body?.tripId
    || "default-trip"
  );
}

async function handleGetGuides(request, env) {
  const url = new URL(request.url);
  const tripId = getTripId(url, null);
  const guides = await listGuides(env.GUIDE_KV, tripId);
  return { tripId, guides };
}

async function handlePutGuide(request, env) {
  const token = request.headers.get("X-Edit-Token") || "";
  if (!env.EDIT_TOKEN || token !== env.EDIT_TOKEN) {
    return { error: "Unauthorized edit token.", status: 401 };
  }

  const url = new URL(request.url);
  const guideKey = decodeURIComponent(url.pathname.replace(/^\/api\/guides\//, ""));
  if (!guideKey) {
    return { error: "Guide key is required.", status: 400 };
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch (_error) {
    return { error: "Invalid JSON body.", status: 400 };
  }

  const tripId = getTripId(url, payload);
  const markdown = String(payload.markdown || "");
  const updatedBy = String(payload.updatedBy || "web");
  const record = guideRecord(guideKey, markdown, updatedBy);
  await env.GUIDE_KV.put(`${guidePrefix(tripId)}${guideKey}`, JSON.stringify(record));
  return { tripId, guide: record };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = parseAllowedOrigins(env);

    if (request.method === "OPTIONS") {
      const headers = new Headers();
      applyCorsHeaders(headers, origin, allowedOrigins);
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (url.pathname === "/api/guides" && request.method === "GET") {
      const result = await handleGetGuides(request, env);
      return jsonResponse(result, 200, origin, allowedOrigins);
    }

    if (url.pathname.startsWith("/api/guides/") && request.method === "PUT") {
      const result = await handlePutGuide(request, env);
      if (result.error) {
        return jsonResponse({ error: result.error }, result.status || 400, origin, allowedOrigins);
      }
      return jsonResponse(result, 200, origin, allowedOrigins);
    }

    return jsonResponse({ error: "Not found." }, 404, origin, allowedOrigins);
  },
};
