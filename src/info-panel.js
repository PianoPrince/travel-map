import { buildLocationMeta, escapeHtml, formatMultilineText, getPhotoUrl } from "./formatters.js";

export function buildInfoWindowHtml({
  location,
  title,
  subtitle,
  guideText,
  badges = [],
  guideToggle = null,
}) {
  const mediaUrl = getPhotoUrl(location?.photo);
  const metaItems = [subtitle, location ? buildLocationMeta(location) : ""]
    .filter(Boolean)
    .concat(badges)
    .map((item) => `<span class="badge">${escapeHtml(item)}</span>`)
    .join("");

  return `
    <div class="travel-info-window">
      <div class="travel-info-window__media">
        <img src="${mediaUrl}" alt="${escapeHtml(location?.photo_alt || title || "旅行图片")}">
      </div>
      <div class="travel-info-window__body">
        <h3>${escapeHtml(title || location?.name || "地点")}</h3>
        <div class="travel-info-window__meta">${metaItems}</div>
        <p>${formatMultilineText(guideText || location?.description || location?.notes || "暂无补充说明。")}</p>
        ${location?.address ? `<p>${escapeHtml(location.address)}</p>` : ""}
        ${guideToggle ? `
          <div class="travel-info-window__actions">
            <button
              type="button"
              class="action-chip action-chip--popup"
              data-guide-toggle="true"
              data-location-id="${escapeHtml(guideToggle.locationId)}"
              data-guide-mode="${escapeHtml(guideToggle.mode)}"
            >
              ${escapeHtml(guideToggle.label || "查看攻略")}
            </button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}
