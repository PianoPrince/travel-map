const FALLBACK_CENTER = [100.803, 22.009];
const FALLBACK_ZOOM = 11;
let amapScriptPromise = null;

function toLngLat([lng, lat] = []) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return [lng, lat];
}

function getRuntimeConfig() {
  return window.TRAVEL_APP_CONFIG || {};
}

function ensureSecurityConfig() {
  const { securityJsCode } = getRuntimeConfig();
  if (securityJsCode) {
    window._AMapSecurityConfig = { securityJsCode };
  }
}

function loadAMapScript() {
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }

  if (amapScriptPromise) {
    return amapScriptPromise;
  }

  const { amapKey } = getRuntimeConfig();
  if (!amapKey) {
    return Promise.reject(new Error("Missing amapKey in src/runtime-config.js."));
  }

  ensureSecurityConfig();
  const scriptSrc = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapKey)}&plugin=AMap.Scale,AMap.ToolBar`;
  amapScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => {
      if (window.AMap) {
        resolve(window.AMap);
      } else {
        reject(new Error("AMap SDK loaded without window.AMap."));
      }
    };
    script.onerror = () => {
      reject(new Error("Failed to load AMap JS API script."));
    };
    document.head.appendChild(script);
  });

  return amapScriptPromise;
}

export function setMapMessage(container, overlay, html) {
  container.innerHTML = "";
  overlay.innerHTML = html;
  overlay.hidden = false;
}

export function clearMapMessage(overlay) {
  overlay.hidden = true;
  overlay.innerHTML = "";
}

export async function createMap(container, trip) {
  await loadAMapScript();

  const center = toLngLat(trip.default_center || FALLBACK_CENTER) || FALLBACK_CENTER;
  const defaultLayer = typeof window.AMap.createDefaultLayer === "function"
    ? window.AMap.createDefaultLayer()
    : null;
  const map = new window.AMap.Map(container, {
    viewMode: "2D",
    zoom: trip.default_zoom || FALLBACK_ZOOM,
    center,
    ...(defaultLayer ? { layers: [defaultLayer] } : {}),
    resizeEnable: true,
  });

  return map;
}

export function attachMapControls(map) {
  map.addControl(new window.AMap.Scale());
  map.addControl(new window.AMap.ToolBar({ position: "RB" }));
}

export function fitMapToOverlays(map, overlays, trip) {
  const visibleOverlays = overlays.filter(Boolean);
  if (visibleOverlays.length > 0) {
    map.setFitView(visibleOverlays, false, [80, 80, 80, 80]);
    return;
  }

  const center = toLngLat(trip.default_center || FALLBACK_CENTER) || FALLBACK_CENTER;
  map.setZoomAndCenter(trip.default_zoom || FALLBACK_ZOOM, center);
}
