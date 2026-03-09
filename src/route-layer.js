import { HIGHLIGHT_ROUTE_COLOR, STATIC_ROUTE_COLOR } from "./constants.js";
import { formatDistance, formatDuration, toLeafletLatLng } from "./formatters.js";

function midpoint(path) {
  if (path.length === 0) {
    return null;
  }
  return path[Math.floor(path.length / 2)];
}

function toLeafletPath(path = []) {
  return path.map(toLeafletLatLng).filter(Boolean);
}

function endAngle(path) {
  if (path.length < 2) {
    return 0;
  }
  const [prevLat, prevLng] = path[path.length - 2];
  const [endLat, endLng] = path[path.length - 1];
  const radians = Math.atan2(endLat - prevLat, endLng - prevLng);
  return (radians * 180) / Math.PI;
}

function ensurePane(map, name, zIndex) {
  const pane = map.getPane(name) || map.createPane(name);
  pane.style.zIndex = String(zIndex);
  pane.style.pointerEvents = "none";
  return name;
}

export function createRouteLayer(map, routeCache) {
  let overlays = [];
  let animationFrameId = null;
  const routesBySegmentId = new Map(Object.entries(routeCache?.routes ?? {}));

  const basePane = ensurePane(map, "route-base-pane", 420);
  const labelPane = ensurePane(map, "route-label-pane", 430);
  const highlightPane = ensurePane(map, "route-highlight-pane", 650);

  const baseGroup = window.L.layerGroup().addTo(map);
  const highlightGroup = window.L.layerGroup().addTo(map);

  function stopDashAnimation() {
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function clear() {
    stopDashAnimation();
    baseGroup.clearLayers();
    highlightGroup.clearLayers();
    overlays = [];
  }

  function startDashAnimation(polyline) {
    let dashOffset = 0;
    let lastFrame = null;

    const tick = (timestamp) => {
      const pathElement = polyline.getElement?.();
      if (!pathElement || !pathElement.isConnected) {
        animationFrameId = null;
        return;
      }

      if (lastFrame !== null) {
        const delta = timestamp - lastFrame;
        dashOffset -= delta * 0.06;
        pathElement.style.strokeDashoffset = `${dashOffset}`;
      }

      lastFrame = timestamp;
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
  }

  function buildLabel(route, path, isHighlighted) {
    const labelPosition = midpoint(path);
    if (!labelPosition) {
      return null;
    }

    return window.L.marker(labelPosition, {
      pane: isHighlighted ? highlightPane : labelPane,
      icon: window.L.divIcon({
        className: `route-label-icon${isHighlighted ? " route-label-icon--active" : ""}`,
        html: `<div class="route-label">${formatDistance(route.distance)} | ${formatDuration(route.duration)}</div>`,
        iconSize: null,
        iconAnchor: [0, 0],
      }),
      interactive: false,
      keyboard: false,
    });
  }

  function buildEndpointArrow(path) {
    const end = path[path.length - 1];
    if (!end) {
      return null;
    }

    const angle = endAngle(path);
    return window.L.marker(end, {
      pane: highlightPane,
      icon: window.L.divIcon({
        className: "route-arrow-icon",
        html: `<div class="route-arrow" style="transform: rotate(${angle}deg)">➜</div>`,
        iconSize: null,
        iconAnchor: [0, 0],
      }),
      interactive: false,
      keyboard: false,
    });
  }

  function createBaseStroke(path, isHighlighted) {
    return window.L.polyline(path, {
      pane: basePane,
      color: STATIC_ROUTE_COLOR,
      opacity: isHighlighted ? 0.28 : 0.65,
      weight: isHighlighted ? 10 : 7,
      lineJoin: "round",
      lineCap: "round",
      interactive: false,
      className: `route-line-base${isHighlighted ? " route-line-base--active" : ""}`,
    });
  }

  function createHighlightStroke(path) {
    return window.L.polyline(path, {
      pane: highlightPane,
      color: HIGHLIGHT_ROUTE_COLOR,
      opacity: 1,
      weight: 6,
      dashArray: "14 12",
      lineJoin: "round",
      lineCap: "round",
      interactive: false,
      className: "route-line-dash route-line-dash--highlight",
    });
  }

  function render(day, locationsById, highlightedSegmentId = null) {
    clear();
    const nextOverlays = [];
    const missingSegments = [];
    let highlightedDashLayer = null;

    for (const segment of day.segments) {
      const from = locationsById.get(segment.from);
      const to = locationsById.get(segment.to);
      if (!from || !to) {
        missingSegments.push({
          segmentId: segment.id,
          label: segment.label,
          error: "起点或终点缺少坐标数据",
        });
        continue;
      }

      const cachedRoute = routesBySegmentId.get(segment.id);
      if (!cachedRoute || cachedRoute.status !== "ok") {
        missingSegments.push({
          segmentId: segment.id,
          label: segment.label,
          error: cachedRoute?.error || "未找到路线缓存",
        });
        continue;
      }

      const path = toLeafletPath(cachedRoute.path || []);
      if (path.length === 0) {
        missingSegments.push({
          segmentId: segment.id,
          label: segment.label,
          error: "缓存缺少路线坐标",
        });
        continue;
      }

      const isHighlighted = segment.id === highlightedSegmentId;
      const baseStroke = createBaseStroke(path, isHighlighted);
      const label = buildLabel(cachedRoute, path, isHighlighted);
      baseGroup.addLayer(baseStroke);
      if (label) {
        (isHighlighted ? highlightGroup : baseGroup).addLayer(label);
      }
      nextOverlays.push(baseStroke, label);

      if (isHighlighted) {
        const dashStroke = createHighlightStroke(path);
        const arrow = buildEndpointArrow(path);
        highlightGroup.addLayer(dashStroke);
        if (arrow) {
          highlightGroup.addLayer(arrow);
        }
        nextOverlays.push(dashStroke, arrow);
        highlightedDashLayer = dashStroke;
      }
    }

    if (highlightedDashLayer) {
      startDashAnimation(highlightedDashLayer);
    }

    overlays = nextOverlays.filter(Boolean);
    return { overlays, missingSegments };
  }

  return {
    clear,
    render,
  };
}
