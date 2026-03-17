import {
  buildLocationMeta,
  escapeHtml,
  formatMultilineText,
  getCategoryLabel,
  getPhotoUrl,
} from "./formatters.js";

const FOOD_CLUSTER_GRID_SIZE = 80;
const FOOD_CLUSTER_MAX_ZOOM = 14;

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

function resolveIcon(icons, location) {
  return icons[location.icon_key] || icons[location.category] || icons.default;
}

function truncateLabel(label = "", maxLength = 9) {
  const safe = String(label || "").trim();
  if (!safe) {
    return "";
  }
  return safe.length > maxLength ? `${safe.slice(0, maxLength)}...` : safe;
}

function buildMarkerContent(icon, label, extraClass = "", showLabel = true) {
  return `
    <div class="amap-marker-chip ${escapeHtml(extraClass)}">
      <div class="marker-pin" style="background:${icon.background};">
        <span class="marker-pin__icon">${icon.emoji}</span>
        ${showLabel ? `<span class="marker-pin__label">${escapeHtml(label)}</span>` : ""}
      </div>
    </div>
  `;
}

function buildClusterContent(count) {
  return `
    <div class="cluster-pin">
      <span class="cluster-pin__count">${escapeHtml(String(count))}</span>
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
  let clusterer = null;

  function clear() {
    overlays.forEach((overlay) => overlay.setMap(null));
    overlays.length = 0;
    markerByLocationId.clear();
    if (clusterer) {
      if (typeof clusterer.setData === "function") {
        clusterer.setData([]);
      }
      if (typeof clusterer.setMap === "function") {
        clusterer.setMap(null);
      }
      clusterer = null;
    }
    infoWindow.close();
  }

  function buildMarker(location, extraClass = "", showLabel = true, labelMaxLength = 9) {
    const icon = resolveIcon(icons, location);
    const label = truncateLabel(location.name, labelMaxLength);
    const position = toLngLat(location);
    if (!position) {
      return null;
    }

    return new window.AMap.Marker({
      position,
      anchor: "bottom-center",
      content: buildMarkerContent(icon, label, extraClass, showLabel),
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

  function openPopupForLocation(location, context = {}) {
    const position = toLngLat(location);
    if (!position) {
      return;
    }
    const popupHtml = buildInfoWindowHtml({
      location,
      title: context.title || location.name,
      subtitle: context.subtitle || getCategoryLabel(location.category),
      guideText: context.guideText || location.description || location.notes,
      badges: context.badges || [],
      guideToggle: context.guideToggle || null,
    });
    infoWindow.setContent(popupHtml);
    infoWindow.open(map, position);
  }

  function renderClustered(locations, context = {}) {
    const getMarkerContext = context.getMarkerContext || (() => ({}));
    const markerClass = context.markerClass || "";
    const compactClass = [markerClass, "amap-marker-chip--compact"].filter(Boolean).join(" ");
    const showLabel = context.showLabel !== false;
    const labelMaxLength = context.labelMaxLength || 9;
    const contextByLocationId = new Map();
    const contextByPositionKey = new Map();
    const points = [];

    locations.forEach((location) => {
      const position = toLngLat(location);
      if (!position) {
        return;
      }

      const markerContext = {
        subtitle: context.subtitle || getCategoryLabel(location.category),
        ...getMarkerContext(location),
      };
      const positionKey = position.join(",");
      contextByLocationId.set(location.id, { location, markerContext });
      contextByPositionKey.set(positionKey, { location, markerContext });
      points.push({
        lnglat: position,
        extData: {
          locationId: location.id,
          positionKey,
        },
      });
    });

    if (points.length === 0) {
      return [];
    }

    if (!window.AMap.MarkerCluster) {
      return render(locations, { ...context, cluster: false, showLabel, labelMaxLength });
    }

    clusterer = new window.AMap.MarkerCluster(map, points, {
      gridSize: FOOD_CLUSTER_GRID_SIZE,
      maxZoom: FOOD_CLUSTER_MAX_ZOOM,
      averageCenter: true,
      renderClusterMarker: (contextValue) => {
        const marker = contextValue.marker || contextValue.clusterMarker;
        const count = contextValue.count || contextValue.markers?.length || 0;
        if (!marker) {
          return;
        }
        marker.setContent(buildClusterContent(count));
        marker.setAnchor("center");
        marker.setOffset(new window.AMap.Pixel(0, 0));
      },
      renderMarker: (contextValue) => {
        const marker = contextValue.marker;
        if (!marker) {
          return;
        }

        const extData = marker.getExtData?.() || {};
        const markerPosition = marker.getPosition?.();
        const fallbackKey = markerPosition?.toArray ? markerPosition.toArray().join(",") : "";
        const resolved = (
          (extData.locationId && contextByLocationId.get(extData.locationId))
          || (extData.positionKey && contextByPositionKey.get(extData.positionKey))
          || (fallbackKey && contextByPositionKey.get(fallbackKey))
        );

        if (!resolved) {
          return;
        }

        const { location, markerContext } = resolved;
        const icon = resolveIcon(icons, location);
        marker.setContent(
          buildMarkerContent(
            icon,
            truncateLabel(location.name, labelMaxLength),
            compactClass,
            showLabel,
          ),
        );
        marker.setAnchor("bottom-center");
        marker.setOffset(new window.AMap.Pixel(0, 0));
        bindPopup(marker, location, markerContext);
        marker.on("click", () => openPopup(marker));
        markerByLocationId.set(location.id, marker);
      },
    });

    return [];
  }

  function render(locations, context = {}) {
    clear();
    const getMarkerContext = context.getMarkerContext || (() => ({}));
    const markerClass = context.markerClass || "";
    const showLabel = context.showLabel !== false;
    const labelMaxLength = context.labelMaxLength || 9;
    const rendered = [];

    if (context.cluster) {
      return renderClustered(locations, context);
    }

    locations.forEach((location) => {
      const marker = buildMarker(location, markerClass, showLabel, labelMaxLength);
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
    const position = toLngLat(location);
    if (!position) {
      return false;
    }

    const nextZoom = Math.max(13, map.getZoom() || 13);
    map.setZoomAndCenter(nextZoom, position);
    const marker = markerByLocationId.get(locationId);
    if (marker) {
      bindPopup(marker, location, context);
      openPopup(marker);
      return true;
    }

    openPopupForLocation(location, context);
    return true;
  }

  return { clear, render, focusLocation };
}
