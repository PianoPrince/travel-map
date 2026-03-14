function normalizeBaseUrl(baseUrl = "") {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function withTimeout(promise, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Guide API request timed out."));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error("Guide API returned invalid JSON.");
  }
}

export function getGuideApiBase() {
  const runtimeBase = window?.TRAVEL_APP_CONFIG?.guideApiBase;
  return normalizeBaseUrl(runtimeBase || "");
}

export async function fetchGuideOverrides({ apiBase, tripId }) {
  const base = normalizeBaseUrl(apiBase);
  if (!base) {
    return {};
  }

  const url = `${base}/api/guides?tripId=${encodeURIComponent(tripId)}`;
  const response = await withTimeout(fetch(url, { method: "GET" }));
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to load guide overrides.");
  }

  return payload?.guides && typeof payload.guides === "object" ? payload.guides : {};
}

export async function saveGuideOverride({ apiBase, tripId, guideKey, markdown, editToken }) {
  const base = normalizeBaseUrl(apiBase);
  if (!base) {
    throw new Error("Guide API is not configured.");
  }

  const url = `${base}/api/guides/${encodeURIComponent(guideKey)}`;
  const response = await withTimeout(
    fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Edit-Token": editToken || "",
      },
      body: JSON.stringify({
        tripId,
        markdown,
      }),
    }),
  );

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error || "Failed to save guide.");
  }

  if (!payload?.guide || typeof payload.guide !== "object") {
    throw new Error("Guide API save response is invalid.");
  }

  return payload.guide;
}
