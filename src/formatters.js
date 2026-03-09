import { CATEGORY_LABELS, PLACEHOLDER_IMAGE } from "./constants.js";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDistance(meters = 0) {
  const safe = Number(meters) || 0;
  return safe >= 1000 ? `${(safe / 1000).toFixed(1)} km` : `${Math.round(safe)} m`;
}

export function formatDuration(seconds = 0) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.round((safe % 3600) / 60);
  if (hours > 0) {
    return `${hours} 小时 ${Math.max(1, minutes)} 分钟`;
  }
  return `${Math.max(1, minutes)} 分钟`;
}

export function formatTimeToMinute(value = "") {
  if (!value) {
    return "";
  }
  const [hours = "", minutes = ""] = String(value).split(":");
  return `${hours}:${minutes}`;
}

export function formatMultilineText(text = "") {
  return escapeHtml(text).replaceAll("\n", "<br>");
}

export function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || "地点";
}

export function getPhotoUrl(value) {
  return value || PLACEHOLDER_IMAGE;
}

export function summarizeDay(day) {
  const routeCount = day.segments.length;
  const poiCount = day.poi_entries.length;
  return `${routeCount} 段路线，${poiCount} 个打卡或候选点`;
}

export function buildLocationMeta(location) {
  return [location.region, getCategoryLabel(location.category)].filter(Boolean).join(" · ");
}

export function toLeafletLatLng([lng, lat] = []) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return [lat, lng];
}

export function truncateText(text = "", maxLength = 88) {
  const safe = String(text).trim();
  if (safe.length <= maxLength) {
    return safe;
  }
  return `${safe.slice(0, maxLength).trim()}...`;
}
