import { formatDistance, formatDuration } from "./formatters.js";

const STATIC_ROUTE_COLOR = "#2f7f69";
const HIGHLIGHT_ROUTE_COLOR = "#ff7a18";

function midpoint(path) {
  return path.length === 0 ? null : path[Math.floor(path.length / 2)];
}

function toLngLatPath(path = []) {
  return path.filter((point) => (
    Array.isArray(point)
    && Number.isFinite(point[0])
    && Number.isFinite(point[1])
  ));
}

function endAngle(path) {
  if (path.length < 2) {
    return 0;
  }
  const [prevLng, prevLat] = path[path.length - 2];
  const [endLng, endLat] = path[path.length - 1];
  return (Math.atan2(endLat - prevLat, endLng - prevLng) * 180) / Math.PI;
}

export function createRouteLayer(map, routeCache) {
  const routesBySegmentId = new Map(Object.entries(routeCache?.routes ?? {}));
  const baseOverlays = [];
  const highlightOverlays = [];

  function removeAll(list) {
    list.forEach((overlay) => overlay.setMap(null));
    list.length = 0;
  }

  function clear() {
    removeAll(baseOverlays);
    removeAll(highlightOverlays);
  }

  function buildLabel(route, path, isHighlighted) {
    const position = midpoint(path);
    if (!position) {
      return null;
    }

    return new window.AMap.Text({
      position,
      anchor: "center",
      zIndex: isHighlighted ? 420 : 320,
      text: `${formatDistance(route.distance)} | ${formatDuration(route.duration)}`,
      style: {
        border: isHighlighted ? "1px solid rgba(255,122,24,0.24)" : "1px solid rgba(47,127,105,0.2)",
        background: "rgba(255,250,240,0.92)",
        borderRadius: "999px",
        padding: "6px 12px",
        boxShadow: "0 10px 24px rgba(40,30,18,0.12)",
        color: "#213032",
        fontWeight: "700",
        fontSize: "12px",
        whiteSpace: "nowrap",
      },
    });
  }

  function buildEndpointArrow(path) {
    const end = path[path.length - 1];
    if (!end) {
      return null;
    }

    return new window.AMap.Marker({
      position: end,
      anchor: "center",
      zIndex: 430,
      content: `<div class="route-arrow" style="transform: rotate(${endAngle(path)}deg)">➤</div>`,
    });
  }

  function render(day, locationsById, highlightedSegmentId = null) {
    clear();
    const overlays = [];
    const missingSegments = [];

    day.segments.forEach((segment) => {
      const from = locationsById.get(segment.from);
      const to = locationsById.get(segment.to);
      if (!from || !to) {
        missingSegments.push({
          segmentId: segment.id,
          label: segment.label,
          error: "起点或终点缺少坐标数据",
        });
        return;
      }

      const cachedRoute = routesBySegmentId.get(segment.id);
      if (!cachedRoute || cachedRoute.status !== "ok") {
        missingSegments.push({
          segmentId: segment.id,
          label: segment.label,
          error: cachedRoute?.error || "未找到路线缓存",
        });
        return;
      }

      const path = toLngLatPath(cachedRoute.path || []);
      if (path.length === 0) {
        missingSegments.push({
          segmentId: segment.id,
          label: segment.label,
          error: "缓存缺少路线坐标",
        });
        return;
      }

      const isHighlighted = segment.id === highlightedSegmentId;
      const baseStroke = new window.AMap.Polyline({
        path,
        strokeColor: STATIC_ROUTE_COLOR,
        strokeWeight: isHighlighted ? 10 : 7,
        strokeOpacity: isHighlighted ? 0.28 : 0.65,
        lineJoin: "round",
        lineCap: "round",
        zIndex: isHighlighted ? 210 : 200,
      });
      baseStroke.setMap(map);
      baseOverlays.push(baseStroke);
      overlays.push(baseStroke);

      const label = buildLabel(cachedRoute, path, isHighlighted);
      if (label) {
        label.setMap(map);
        if (isHighlighted) {
          highlightOverlays.push(label);
        } else {
          baseOverlays.push(label);
        }
        overlays.push(label);
      }

      if (isHighlighted) {
        const dashStroke = new window.AMap.Polyline({
          path,
          strokeColor: HIGHLIGHT_ROUTE_COLOR,
          strokeWeight: 6,
          strokeOpacity: 0.96,
          strokeStyle: "dashed",
          strokeDasharray: [14, 12],
          lineJoin: "round",
          lineCap: "round",
          showDir: true,
          zIndex: 410,
        });
        dashStroke.setMap(map);

        const arrow = buildEndpointArrow(path);
        if (arrow) {
          arrow.setMap(map);
          highlightOverlays.push(arrow);
          overlays.push(arrow);
        }

        highlightOverlays.push(dashStroke);
        overlays.push(dashStroke);
      }
    });

    return { overlays: overlays.filter(Boolean), missingSegments };
  }

  return { clear, render };
}
