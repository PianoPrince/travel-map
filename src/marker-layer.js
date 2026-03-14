import {
  buildLocationMeta,
  escapeHtml,
  formatMultilineText,
  getCategoryLabel,
  getPhotoUrl,
} from "./formatters.js";

function toLngLat(location) {
  if (!location || !Number.isFinite(location.lng) || !Number.isFinite(location.lat)) {
    return null;
  }
  return [location.lng, location.lat];
}

function buildInfoWindowHtml({ location, title, subtitle, guideText, badges = [], guideToggle = null }) {
  const mediaUrl = getPhotoUrl(location?.photo);
  const metaItems = [subtitle, location ? buildLocationMeta(location) : ""]
    .filter(Boolean)
    .concat(badges)
    .map((item) => `<span class="badge">${escapeHtml(item)}</span>`)
    .join("");

  return `
    <div class="travel-info-window">
      <div class="travel-info-window__media">
        <img src="${mediaUrl}" alt="${escapeHtml(location?.photo_alt || title || "Travel image")}">
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

function buildMarkerContent(icon, label, extraClass = "") {
  return `
    <div class="amap-marker-chip ${escapeHtml(extraClass)}">
      <div class="marker-pin" style="background:${icon.background};">
        <span class="marker-pin__icon">${icon.emoji}</span>
        <span>${escapeHtml(label)}</span>
      </div>
    </div>
  `;
}

export function createMarkerLayer(map, icons) {
  const markerByLocationId = new Map();
  const overlays = [];
  const infoWindow = new window.AMap.InfoWindow({
    isCustom: true,
    autoMove: true,
    offset: new window.AMap.Pixel(0, -30),
  });

  function clear() {
    overlays.forEach((overlay) => overlay.setMap(null));
    overlays.length = 0;
    markerByLocationId.clear();
    infoWindow.close();
  }

  function buildMarker(location, extraClass = "") {
    const icon = icons[location.icon_key] || icons[location.category] || icons.default;
    const label = location.name.length > 9 ? `${location.name.slice(0, 9)}...` : location.name;
    const position = toLngLat(location);
    if (!position) {
      return null;
    }

    return new window.AMap.Marker({
      position,
      anchor: "bottom-center",
      content: buildMarkerContent(icon, label, extraClass),
      offset: new window.AMap.Pixel(0, 0),
      zIndex: 120,
    });
  }

  function bindPopup(marker, location, context = {}) {
    const popupHtml = buildInfoWindowHtml({
      location,
      title: context.title || location.name,
      subtitle: context.subtitle || getCategoryLabel(location.category),
      guideText: context.guideText || location.description || location.notes,
      badges: context.badges || [],
      guideToggle: context.guideToggle || null,
    });
    marker.__popupHtml = popupHtml;
    marker.__popupPosition = toLngLat(location);
  }

  function openPopup(marker) {
    if (!marker?.__popupHtml || !marker?.__popupPosition) {
      return;
    }
    infoWindow.setContent(marker.__popupHtml);
    infoWindow.open(map, marker.__popupPosition);
  }

  function render(locations, context = {}) {
    clear();
    const getMarkerContext = context.getMarkerContext || (() => ({}));
    const markerClass = context.markerClass || "";
    const rendered = [];

    locations.forEach((location) => {
      const marker = buildMarker(location, markerClass);
      if (!marker) {
        return;
      }

      const markerContext = {
        subtitle: context.subtitle || getCategoryLabel(location.category),
        ...getMarkerContext(location),
      };

      bindPopup(marker, location, markerContext);
      marker.on("click", () => openPopup(marker));
      marker.setMap(map);

      overlays.push(marker);
      markerByLocationId.set(location.id, marker);
      rendered.push(marker);
    });

    return rendered;
  }

  function focusLocation(locationId, location, context = {}) {
    const marker = markerByLocationId.get(locationId);
    const position = toLngLat(location);
    if (!marker || !position) {
      return false;
    }

    bindPopup(marker, location, context);
    const nextZoom = Math.max(13, map.getZoom() || 13);
    map.setZoomAndCenter(nextZoom, position);
    openPopup(marker);
    return true;
  }

  return { clear, render, focusLocation };
}
