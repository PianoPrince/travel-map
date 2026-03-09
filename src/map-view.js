import { AMAP_TILE_URL, FALLBACK_CENTER, FALLBACK_ZOOM } from "./constants.js";
import { toLeafletLatLng } from "./formatters.js";

export function setMapMessage(container, overlay, html) {
  container.innerHTML = "";
  overlay.innerHTML = html;
  overlay.hidden = false;
}

export function clearMapMessage(overlay) {
  overlay.hidden = true;
  overlay.innerHTML = "";
}

export function createMap(container, trip) {
  if (!window.L) {
    throw new Error("Leaflet 未加载，请确认 `assets/vendor/leaflet` 资源存在且已被页面引用。");
  }

  const center = toLeafletLatLng(trip.default_center || FALLBACK_CENTER)
    || toLeafletLatLng(FALLBACK_CENTER);

  const map = window.L.map(container, {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
  });

  window.L.tileLayer(AMAP_TILE_URL, {
    minZoom: 3,
    maxZoom: 18,
    attribution: "© AutoNavi",
  }).addTo(map);

  map.setView(center, trip.default_zoom || FALLBACK_ZOOM);
  return map;
}

export function attachMapControls(map) {
  window.L.control.zoom({ position: "bottomright" }).addTo(map);
  window.L.control.scale({
    position: "bottomleft",
    metric: true,
    imperial: false,
  }).addTo(map);
  window.L.control.attribution({ position: "bottomleft", prefix: false })
    .addAttribution("© AutoNavi")
    .addTo(map);
}

export function fitMapToOverlays(map, overlays, trip) {
  const visibleOverlays = overlays.filter(Boolean);
  if (visibleOverlays.length > 0) {
    const group = window.L.featureGroup(visibleOverlays);
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [80, 80],
      });
      return;
    }
  }

  const center = toLeafletLatLng(trip.default_center || FALLBACK_CENTER)
    || toLeafletLatLng(FALLBACK_CENTER);
  map.setView(center, trip.default_zoom || FALLBACK_ZOOM);
}
