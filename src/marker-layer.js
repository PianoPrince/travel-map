import { buildInfoWindowHtml } from "./info-panel.js";
import { getCategoryLabel, toLeafletLatLng } from "./formatters.js";

export function createMarkerLayer(map, icons) {
  let markers = [];
  const markerByLocationId = new Map();
  const markerGroup = window.L.layerGroup().addTo(map);

  function clear() {
    markerGroup.clearLayers();
    markers = [];
    markerByLocationId.clear();
  }

  function buildMarkerContent(location) {
    const icon = icons[location.icon_key] || icons[location.category] || icons.default;
    const label = location.name.length > 9 ? `${location.name.slice(0, 9)}...` : location.name;
    return `
      <div class="marker-pin" style="background:${icon.background};">
        <span class="marker-pin__icon">${icon.emoji}</span>
        <span>${label}</span>
      </div>
    `;
  }

  function buildLeafletIcon(location, extraClass = "") {
    return window.L.divIcon({
      className: `travel-marker-icon ${extraClass}`.trim(),
      html: buildMarkerContent(location),
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
    const nextMarkers = [];
    const markerClass = context.markerClass || "";
    const getMarkerContext = context.getMarkerContext || (() => ({}));
    const onSelect = context.onSelect || null;

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
      marker.on("click", () => {
        marker.openPopup();
        if (typeof onSelect === "function") {
          onSelect(location, markerContext);
        }
      });

      markerGroup.addLayer(marker);
      nextMarkers.push(marker);
      markerByLocationId.set(location.id, marker);
    }

    markers = nextMarkers;
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

  return {
    clear,
    render,
    focusLocation,
  };
}
