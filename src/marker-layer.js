import {
  buildLocationMeta,
  escapeHtml,
  formatMultilineText,
  getCategoryLabel,
  getPhotoUrl,
  toLeafletLatLng,
} from "./formatters.js";

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

export function createMarkerLayer(map, icons) {
  const markerByLocationId = new Map();
  const markerGroup = window.L.layerGroup().addTo(map);

  function clear() {
    markerGroup.clearLayers();
    markerByLocationId.clear();
  }

  function buildLeafletIcon(location, extraClass = "") {
    const icon = icons[location.icon_key] || icons[location.category] || icons.default;
    const label = location.name.length > 9 ? `${location.name.slice(0, 9)}...` : location.name;
    return window.L.divIcon({
      className: `travel-marker-icon ${extraClass}`.trim(),
      html: `
        <div class="marker-pin" style="background:${icon.background};">
          <span class="marker-pin__icon">${icon.emoji}</span>
          <span>${label}</span>
        </div>
      `,
      iconSize: null,
      iconAnchor: [0, 0],
      popupAnchor: [0, -34],
    });
  }

  function bindPopup(marker, location, context = {}) {
    marker.bindPopup(
      buildInfoWindowHtml({
        location,
        title: context.title || location.name,
        subtitle: context.subtitle || getCategoryLabel(location.category),
        guideText: context.guideText || location.description || location.notes,
        badges: context.badges || [],
        guideToggle: context.guideToggle || null,
      }),
      {
        closeButton: false,
        className: "travel-popup",
        autoPanPadding: [24, 24],
      },
    );
  }

  function render(locations, context = {}) {
    clear();
    const getMarkerContext = context.getMarkerContext || (() => ({}));
    const markerClass = context.markerClass || "";
    const markers = [];

    for (const location of locations) {
      const latLng = toLeafletLatLng([location.lng, location.lat]);
      if (!latLng) {
        continue;
      }

      const markerContext = {
        subtitle: context.subtitle || getCategoryLabel(location.category),
        ...getMarkerContext(location),
      };

      const marker = window.L.marker(latLng, {
        icon: buildLeafletIcon(location, markerClass),
        riseOnHover: true,
      });

      bindPopup(marker, location, markerContext);
      marker.on("click", () => marker.openPopup());
      markerGroup.addLayer(marker);
      markerByLocationId.set(location.id, marker);
      markers.push(marker);
    }

    return markers;
  }

  function focusLocation(locationId, location, context = {}) {
    const marker = markerByLocationId.get(locationId);
    const latLng = toLeafletLatLng([location?.lng, location?.lat]);
    if (!marker || !latLng) {
      return false;
    }

    bindPopup(marker, location, context);
    map.setView(latLng, Math.max(map.getZoom(), 13), { animate: true });
    marker.openPopup();
    return true;
  }

  return { clear, render, focusLocation };
}
