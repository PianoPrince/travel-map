const PLACEHOLDER_IMAGE = "./assets/placeholders/no-photo.svg";
const CATEGORY_LABELS = {
  airport: "机场",
  hotel: "酒店",
  attraction: "景点",
  temple: "寺院",
  market: "夜市",
  restaurant: "美食",
  village: "村落",
  garden: "园区",
  shopping: "购物",
  massage: "放松",
};

export const ROUTE_CACHE_NOTICE =
  "当前页面只读取本地 route_cache.json。若缺少路线，请先运行预取脚本生成缓存。";

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
  const minutes = Math.max(1, Math.round((safe % 3600) / 60));
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
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
  return `${day.segments.length} 段路线，${day.poi_entries.length} 个打卡点`;
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
  return safe.length <= maxLength ? safe : `${safe.slice(0, maxLength).trim()}...`;
}
