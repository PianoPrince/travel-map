import { loadTripData } from "./data-loader.js";
import {
  buildLocationMeta,
  escapeHtml,
  formatMultilineText,
  formatTimeToMinute,
  ROUTE_CACHE_NOTICE,
  summarizeDay,
  truncateText,
} from "./formatters.js";
import { createMarkerLayer } from "./marker-layer.js";
import { createRouteLayer } from "./route-layer.js";
import {
  attachMapControls,
  clearMapMessage,
  createMap,
  fitMapToOverlays,
  setMapMessage,
} from "./map-view.js";

const MOBILE_MEDIA_QUERY = "(max-width: 960px)";
const mobileMediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);

const refs = {
  sidebar: document.getElementById("sidebar"),
  drawerToggle: document.getElementById("drawerToggle"),
  tripSummary: document.getElementById("tripSummary"),
  dayPills: document.getElementById("dayPills"),
  daySwitcherSection: document.getElementById("daySwitcherSection"),
  dayOverview: document.getElementById("dayOverview"),
  timelineSection: document.getElementById("timelineSection"),
  timelineList: document.getElementById("timelineList"),
  activeDayTitle: document.getElementById("activeDayTitle"),
  activeDayMeta: document.getElementById("activeDayMeta"),
  mapContainer: document.getElementById("mapContainer"),
  mapOverlayMessage: document.getElementById("mapOverlayMessage"),
  statusPill: document.getElementById("statusPill"),
  timelineItemTemplate: document.getElementById("timelineItemTemplate"),
  foodToggle: document.getElementById("foodToggle"),
  guidePanel: document.getElementById("guidePanel"),
  guidePanelClose: document.getElementById("guidePanelClose"),
  guidePanelTitle: document.getElementById("guidePanelTitle"),
  guidePanelMeta: document.getElementById("guidePanelMeta"),
  guidePanelBody: document.getElementById("guidePanelBody"),
  mobileGuide: document.getElementById("mobileGuide"),
  mobileGuideTitle: document.getElementById("mobileGuideTitle"),
  mobileGuideMeta: document.getElementById("mobileGuideMeta"),
  mobileGuideBody: document.getElementById("mobileGuideBody"),
  mobileGuideBack: document.getElementById("mobileGuideBack"),
};

let itinerary = null;
let activeDayId = null;
let locationsById = null;
let icons = null;
let map = null;
let markerLayer = null;
let foodLayer = null;
let routeLayer = null;

const state = {
  showFoods: false,
  highlightedSegmentId: null,
  openGuideId: null,
  drawerState: "peek",
  drawerMode: "itinerary",
};

function isMobileViewport() {
  return mobileMediaQuery.matches;
}

function setStatus(text, mode = "warn") {
  refs.statusPill.textContent = text;
  refs.statusPill.className = `status-pill status-pill--${mode}`;
}

function getDay(dayId = activeDayId) {
  return itinerary?.days.find((day) => day.id === dayId) ?? null;
}

function buildTimeline(day) {
  const routeEntries = day.segments.map((segment) => ({ ...segment, entry_type: "route" }));
  const poiEntries = day.poi_entries.map((entry) => ({ ...entry, entry_type: "poi" }));
  return [...routeEntries, ...poiEntries].sort((left, right) => left.order - right.order);
}

function buildDayView(dayId = activeDayId) {
  const day = getDay(dayId);
  if (!day) {
    return null;
  }

  const resolvedPoints = new Map();
  for (const segment of day.segments) {
    [segment.from, segment.to].forEach((locationId) => {
      if (locationId && locationsById.has(locationId)) {
        resolvedPoints.set(locationId, locationsById.get(locationId));
      }
    });
  }

  for (const entry of day.poi_entries) {
    if (entry.location_id && locationsById.has(entry.location_id)) {
      resolvedPoints.set(entry.location_id, locationsById.get(entry.location_id));
    }
  }

  return {
    day,
    timeline: buildTimeline(day),
    resolvedPoints: [...resolvedPoints.values()],
    summary: summarizeDay(day),
  };
}

function buildGuidePreview(entry) {
  return String(entry.guide_text || "").trim();
}

function renderGuideBody(entry) {
  return `<p>${formatMultilineText(entry.guide_text || "暂无攻略说明。")}</p>`;
}

function buildGuideMeta(entry, location) {
  if (location) {
    return `${location.name} · ${buildLocationMeta(location)}`;
  }
  if (entry.entry_type === "route") {
    const from = locationsById.get(entry.from);
    const to = locationsById.get(entry.to);
    return `${from?.name || entry.from} → ${to?.name || entry.to}`;
  }
  return entry.visit_window || "";
}

function buildFallbackGuideEntry(location, dayView, mode = "core") {
  return {
    id: `${dayView.day.id}-${mode}-${location.id}`,
    entry_type: "poi",
    title: location.name,
    location_id: location.id,
    visit_window: mode === "food" ? "美食补充" : dayView.day.title,
    guide_text: location.description || location.notes || "暂无攻略说明。",
  };
}

function resolveGuideEntryForLocation(dayView, location, mode = "core") {
  const matchedPoi = dayView.day.poi_entries.find((entry) => entry.location_id === location.id);
  return matchedPoi ? { ...matchedPoi, entry_type: "poi" } : buildFallbackGuideEntry(location, dayView, mode);
}

function applyDrawerState() {
  const isMobile = isMobileViewport();
  refs.sidebar.dataset.drawerState = isMobile ? state.drawerState : "desktop";
  refs.sidebar.dataset.drawerMode = isMobile ? state.drawerMode : "itinerary";
  refs.drawerToggle.hidden = !isMobile;

  if (!isMobile) {
    refs.mobileGuide.hidden = true;
    refs.daySwitcherSection.hidden = false;
    refs.dayOverview.hidden = false;
    refs.timelineSection.hidden = false;
    return;
  }

  const showingGuide = state.drawerMode === "guide";
  refs.mobileGuide.hidden = !showingGuide;
  refs.daySwitcherSection.hidden = showingGuide;
  refs.dayOverview.hidden = showingGuide;
  refs.timelineSection.hidden = showingGuide;

  const drawerLabels = {
    collapsed: "展开行程",
    peek: "展开更多",
    expanded: "收起行程",
  };
  refs.drawerToggle.textContent = showingGuide ? "收起攻略" : drawerLabels[state.drawerState];
}

function closeGuidePanel() {
  refs.guidePanel.hidden = true;
  refs.guidePanelTitle.textContent = "";
  refs.guidePanelMeta.textContent = "";
  refs.guidePanelBody.innerHTML = "";
  refs.mobileGuideTitle.textContent = "";
  refs.mobileGuideMeta.textContent = "";
  refs.mobileGuideBody.innerHTML = "";
  state.openGuideId = null;
  state.drawerMode = "itinerary";
  applyDrawerState();
}

function openGuidePanel(entry) {
  const location = entry.location_id ? locationsById.get(entry.location_id) : null;
  const title = entry.title || location?.name || "攻略详情";
  const meta = buildGuideMeta(entry, location);
  const body = renderGuideBody(entry);

  state.openGuideId = entry.id;

  if (isMobileViewport()) {
    refs.mobileGuideTitle.textContent = title;
    refs.mobileGuideMeta.textContent = meta;
    refs.mobileGuideBody.innerHTML = body;
    state.drawerMode = "guide";
    state.drawerState = "expanded";
    refs.guidePanel.hidden = true;
    applyDrawerState();
    return;
  }

  refs.guidePanelTitle.textContent = title;
  refs.guidePanelMeta.textContent = meta;
  refs.guidePanelBody.innerHTML = body;
  refs.guidePanel.hidden = false;
  applyDrawerState();
}

function toggleGuidePanel(entry) {
  if (state.openGuideId === entry.id) {
    closeGuidePanel();
    return;
  }
  openGuidePanel(entry);
}

function cycleDrawerState() {
  if (state.drawerMode === "guide") {
    closeGuidePanel();
    return;
  }

  const nextState = {
    collapsed: "peek",
    peek: "expanded",
    expanded: "collapsed",
  };
  state.drawerState = nextState[state.drawerState];
  applyDrawerState();
}

function renderDayPills() {
  refs.dayPills.innerHTML = "";
  for (const day of itinerary.days) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `day-pill${day.id === activeDayId ? " is-active" : ""}`;
    button.textContent = day.short_label;
    button.addEventListener("click", async () => {
      activeDayId = day.id;
      state.highlightedSegmentId = null;
      state.drawerMode = "itinerary";
      if (isMobileViewport()) {
        state.drawerState = "peek";
      }
      closeGuidePanel();
      renderDayPills();
      await renderActiveDay();
    });
    refs.dayPills.appendChild(button);
  }
}

function renderOverview(dayView) {
  refs.tripSummary.textContent =
    `${itinerary.trip.city} · ${itinerary.trip.date_range.start} 至 ${itinerary.trip.date_range.end}`;
  refs.dayOverview.innerHTML = `
    <article class="day-overview-card">
      <h2>${escapeHtml(dayView.day.title)}</h2>
      <p>${escapeHtml(dayView.day.theme)} · ${escapeHtml(dayView.summary)}</p>
      <div class="meta-grid">
        <div class="meta-chip">日出 ${escapeHtml(formatTimeToMinute(dayView.day.sun_times.sunrise))}</div>
        <div class="meta-chip">日落 ${escapeHtml(formatTimeToMinute(dayView.day.sun_times.sunset))}</div>
      </div>
    </article>
  `;
}

function createTimelineCard(entry) {
  const node = refs.timelineItemTemplate.content.firstElementChild.cloneNode(true);
  const body = node.querySelector(".timeline-card__body");
  node.querySelector(".timeline-card__order").textContent = entry.order;

  const location = entry.location_id ? locationsById.get(entry.location_id) : null;
  const preview = truncateText(buildGuidePreview(entry), 96) || "暂无补充说明。";

  if (entry.entry_type === "route") {
    const from = locationsById.get(entry.from);
    const to = locationsById.get(entry.to);
    const isHighlighted = state.highlightedSegmentId === entry.id;
    body.innerHTML = `
      <h3>${escapeHtml(entry.label)}</h3>
      <p>${escapeHtml(from?.name || entry.from)} → ${escapeHtml(to?.name || entry.to)}</p>
      <p class="timeline-card__excerpt">${escapeHtml(preview)}</p>
      <div class="timeline-card__actions">
        <button type="button" class="action-chip" data-location-id="${escapeHtml(entry.to)}">定位终点</button>
        <button type="button" class="action-chip${isHighlighted ? " action-chip--active" : ""}" data-route-id="${escapeHtml(entry.id)}">${isHighlighted ? "取消高亮" : "高亮动线"}</button>
      </div>
    `;
    return node;
  }

  body.innerHTML = `
    <h3>${escapeHtml(entry.title)}</h3>
    <p>${escapeHtml(location ? `${location.name} · ${buildLocationMeta(location)}` : "待确认地点")}</p>
    <p class="timeline-card__excerpt">${escapeHtml(preview)}</p>
    <div class="timeline-card__actions">
      ${location ? `<button type="button" class="action-chip" data-location-id="${escapeHtml(location.id)}">地图定位</button>` : ""}
    </div>
  `;
  return node;
}

function bindTimelineActions(dayView) {
  refs.timelineList.querySelectorAll("[data-location-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const locationId = button.dataset.locationId;
      const location = locationsById.get(locationId);
      if (!location || !markerLayer) {
        return;
      }
      markerLayer.focusLocation(locationId, location, {
        title: location.name,
        subtitle: `${dayView.day.title} · ${buildLocationMeta(location)}`,
      });
    });
  });

  refs.timelineList.querySelectorAll("[data-route-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const routeId = button.dataset.routeId;
      state.highlightedSegmentId = state.highlightedSegmentId === routeId ? null : routeId;
      await renderActiveDay();
    });
  });
}

function renderTimeline(dayView) {
  refs.timelineList.innerHTML = "";
  dayView.timeline.forEach((entry) => refs.timelineList.appendChild(createTimelineCard(entry)));
  bindTimelineActions(dayView);
}

function buildFoodLocations(dayView) {
  const resolvedIds = new Set(dayView.resolvedPoints.map((item) => item.id));
  return [...locationsById.values()].filter((location) => location.category === "restaurant" && !resolvedIds.has(location.id));
}

function renderMap(dayView) {
  if (!map) {
    setMapMessage(refs.mapContainer, refs.mapOverlayMessage, "<strong>地图未初始化</strong><br>Leaflet 实例尚未创建，请刷新页面。");
    return { overlays: [], missingSegments: [] };
  }

  clearMapMessage(refs.mapOverlayMessage);

  const coreMarkers = markerLayer.render(dayView.resolvedPoints, {
    getMarkerContext: (location) => {
      const guideEntry = resolveGuideEntryForLocation(dayView, location, "core");
      return {
        title: guideEntry.title || location.name,
        subtitle: `${dayView.day.title} · ${buildLocationMeta(location)}`,
        guideText: guideEntry.guide_text || location.description || location.notes,
        badges: [guideEntry.visit_window].filter(Boolean),
        guideToggle: {
          locationId: location.id,
          mode: "core",
          label: state.openGuideId === guideEntry.id ? "隐藏攻略" : "查看攻略",
        },
      };
    },
  });

  const foodMarkers = state.showFoods
    ? foodLayer.render(buildFoodLocations(dayView), {
        markerClass: "travel-marker-icon--food",
        getMarkerContext: (location) => {
          const guideEntry = resolveGuideEntryForLocation(dayView, location, "food");
          return {
            title: location.name,
            subtitle: `美食补充 · ${buildLocationMeta(location)}`,
            guideText: guideEntry.guide_text || location.description || location.notes,
            badges: [guideEntry.visit_window].filter(Boolean),
            guideToggle: {
              locationId: location.id,
              mode: "food",
              label: state.openGuideId === guideEntry.id ? "隐藏攻略" : "查看攻略",
            },
          };
        },
      })
    : (foodLayer.clear(), []);

  const result = routeLayer.render(dayView.day, locationsById, state.highlightedSegmentId);
  fitMapToOverlays(map, [...coreMarkers, ...foodMarkers, ...result.overlays], itinerary.trip);
  return result;
}

async function renderActiveDay() {
  const dayView = buildDayView();
  if (!dayView) {
    return;
  }

  refs.activeDayTitle.textContent = dayView.day.title;
  refs.activeDayMeta.textContent = `${dayView.day.date} · ${dayView.summary}`;
  refs.foodToggle.classList.toggle("is-active", state.showFoods);
  refs.foodToggle.textContent = state.showFoods ? "隐藏美食" : "显示美食";

  renderOverview(dayView);
  renderTimeline(dayView);
  applyDrawerState();

  try {
    setStatus(state.highlightedSegmentId ? "动线高亮中" : "已更新", state.highlightedSegmentId ? "warn" : "ok");
    const result = renderMap(dayView);
    if (result.missingSegments.length > 0) {
      setStatus("部分缺失", "warn");
      refs.mapOverlayMessage.hidden = false;
      refs.mapOverlayMessage.innerHTML = `
        <strong>部分路线未预取</strong><br>
        ${result.missingSegments.map((item) => `${escapeHtml(item.label)}：${escapeHtml(item.error)}`).join("<br>")}
        <br>${escapeHtml(ROUTE_CACHE_NOTICE)}
      `;
    }
  } catch (error) {
    setStatus("渲染异常", "error");
    refs.mapOverlayMessage.hidden = false;
    refs.mapOverlayMessage.innerHTML = `<strong>路线缓存渲染失败</strong><br>${escapeHtml(error.message)}<br>${escapeHtml(ROUTE_CACHE_NOTICE)}`;
  }
}

function handleViewportChange() {
  if (!isMobileViewport()) {
    state.drawerMode = "itinerary";
  } else if (state.drawerMode !== "guide") {
    state.drawerState = "peek";
  }
  applyDrawerState();
  if (itinerary) {
    renderActiveDay();
  }
}

async function init() {
  refs.mapContainer.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-guide-toggle]");
    if (!trigger) {
      return;
    }

    const dayView = buildDayView();
    const location = locationsById.get(trigger.dataset.locationId);
    if (!dayView || !location) {
      return;
    }

    toggleGuidePanel(resolveGuideEntryForLocation(dayView, location, trigger.dataset.guideMode || "core"));
    await renderActiveDay();
  });

  refs.foodToggle.addEventListener("click", async () => {
    state.showFoods = !state.showFoods;
    await renderActiveDay();
  });

  refs.drawerToggle.addEventListener("click", () => {
    cycleDrawerState();
  });

  refs.guidePanelClose.addEventListener("click", () => closeGuidePanel());
  refs.mobileGuideBack.addEventListener("click", () => {
    state.drawerMode = "itinerary";
    state.drawerState = "peek";
    closeGuidePanel();
    renderActiveDay();
  });

  if (mobileMediaQuery.addEventListener) {
    mobileMediaQuery.addEventListener("change", handleViewportChange);
  } else if (mobileMediaQuery.addListener) {
    mobileMediaQuery.addListener(handleViewportChange);
  }

  try {
    const data = await loadTripData();
    itinerary = data.itinerary;
    activeDayId = itinerary.days[0]?.id ?? null;
    locationsById = data.locationsById;
    icons = data.icons;

    map = createMap(refs.mapContainer, itinerary.trip);
    attachMapControls(map);
    markerLayer = createMarkerLayer(map, icons);
    foodLayer = createMarkerLayer(map, icons);
    routeLayer = createRouteLayer(map, data.routeCache);

    applyDrawerState();
    renderDayPills();
    await renderActiveDay();
  } catch (error) {
    setStatus("初始化失败", "error");
    refs.dayOverview.innerHTML = `<div class="day-overview-card"><h2>初始化失败</h2><p>${escapeHtml(error.message)}</p></div>`;
    refs.timelineList.innerHTML = "";
    refs.activeDayMeta.textContent = "请先通过本地静态服务打开项目。";
    setMapMessage(refs.mapContainer, refs.mapOverlayMessage, `<strong>无法启动项目</strong><br>${escapeHtml(error.message)}`);
  }
}

init();
