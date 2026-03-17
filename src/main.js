import { loadTripData } from "./data-loader.js";
import {
  buildLocationMeta,
  escapeHtml,
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
import { getGuideApiBase, fetchGuideOverrides, saveGuideOverride } from "./guide-api.js";
import { markdownToHtml, markdownToSummary } from "./guide-markdown.js";

const MOBILE_MEDIA_QUERY = "(max-width: 960px)";
const GUIDE_EDIT_TOKEN_KEY = "travel_guide_edit_token";
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
  openGuideEntry: null,
  drawerState: "collapsed",
  drawerMode: "itinerary",
  guideApiBase: "",
  guideOverrides: new Map(),
  editingGuideKey: null,
  editingGuideDraft: "",
  editingError: "",
  savingGuide: false,
  editToken: window.localStorage.getItem(GUIDE_EDIT_TOKEN_KEY) || "",
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

function buildGuideKey(dayId, mode, locationId) {
  return `${dayId}:${mode}:${locationId}`;
}

function applyGuideOverride(entry) {
  if (!entry?.guide_key) {
    return entry;
  }

  const override = state.guideOverrides.get(entry.guide_key);
  if (!override) {
    return {
      ...entry,
      guide_markdown: entry.guide_markdown || entry.guide_text || "",
      guide_updated_at: entry.guide_updated_at || "",
    };
  }

  return {
    ...entry,
    guide_markdown: String(override.markdown || ""),
    guide_updated_at: String(override.updatedAt || ""),
  };
}

function resolveGuideText(entry) {
  return String(entry?.guide_markdown || entry?.guide_text || "");
}

function buildGuidePreview(entry) {
  return markdownToSummary(resolveGuideText(entry));
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
    guide_mode: mode,
    day_id: dayView.day.id,
    guide_key: buildGuideKey(dayView.day.id, mode, location.id),
  };
}

function resolveGuideEntryForLocation(dayView, location, mode = "core") {
  const matchedPoi = dayView.day.poi_entries.find((entry) => entry.location_id === location.id);
  const baseEntry = matchedPoi
    ? {
        ...matchedPoi,
        entry_type: "poi",
        guide_mode: mode,
        day_id: dayView.day.id,
        guide_key: buildGuideKey(dayView.day.id, mode, location.id),
      }
    : buildFallbackGuideEntry(location, dayView, mode);

  return applyGuideOverride(baseEntry);
}

function formatUpdatedAt(value = "") {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function renderGuideEditor(entry) {
  const saving = state.savingGuide;
  const updatedAt = formatUpdatedAt(entry.guide_updated_at);
  const canSave = Boolean(state.guideApiBase);

  return `
    <div class="guide-editor" data-guide-editor-key="${escapeHtml(entry.guide_key || "")}">
      <label class="guide-editor__label" for="guideEditorMarkdown">攻略内容 (Markdown)</label>
      <textarea id="guideEditorMarkdown" class="guide-editor__textarea" data-guide-field="markdown" ${saving ? "disabled" : ""}>${escapeHtml(state.editingGuideDraft)}</textarea>
      <label class="guide-editor__label" for="guideEditorToken">编辑密码</label>
      <input id="guideEditorToken" class="guide-editor__input" data-guide-field="token" type="password" placeholder="输入编辑密码" value="${escapeHtml(state.editToken)}" ${saving ? "disabled" : ""}>
      <p class="guide-editor__hint">支持标题、列表和图片语法，例如：![](./assets/images/example.png)</p>
      ${updatedAt ? `<p class="guide-editor__hint">最近更新：${escapeHtml(updatedAt)}</p>` : ""}
      ${state.editingError ? `<p class="guide-editor__error">${escapeHtml(state.editingError)}</p>` : ""}
      <div class="guide-editor__actions">
        <button type="button" class="action-chip" data-guide-action="cancel-edit" ${saving ? "disabled" : ""}>取消</button>
        <button type="button" class="action-chip action-chip--active" data-guide-action="save-guide" ${!canSave || saving ? "disabled" : ""}>${saving ? "保存中..." : "保存"}</button>
      </div>
      ${!canSave ? "<p class=\"guide-editor__error\">未配置共享保存服务，请先配置 guideApiBase。</p>" : ""}
    </div>
  `;
}

function renderGuideViewer(entry) {
  const markdown = resolveGuideText(entry);
  const html = markdownToHtml(markdown);
  const updatedAt = formatUpdatedAt(entry.guide_updated_at);

  return `
    <div class="guide-content">
      <div class="guide-content__actions">
        ${state.guideApiBase ? "<button type=\"button\" class=\"action-chip\" data-guide-action=\"start-edit\">编辑攻略</button>" : ""}
        ${updatedAt ? `<span class="badge">更新于 ${escapeHtml(updatedAt)}</span>` : ""}
      </div>
      <div class="guide-richtext">${html}</div>
    </div>
  `;
}

function renderGuideBody(entry) {
  if (state.editingGuideKey && state.editingGuideKey === entry.guide_key) {
    return renderGuideEditor(entry);
  }
  return renderGuideViewer(entry);
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
    expanded: "收起行程",
  };
  refs.drawerToggle.textContent = showingGuide ? "收起攻略" : drawerLabels[state.drawerState];
}

function renderOpenGuidePanel() {
  if (!state.openGuideEntry) {
    return;
  }

  const entry = state.openGuideEntry;
  const location = entry.location_id ? locationsById.get(entry.location_id) : null;
  const title = entry.title || location?.name || "攻略详情";
  const meta = buildGuideMeta(entry, location);
  const body = renderGuideBody(entry);

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

function resetEditingState() {
  state.editingGuideKey = null;
  state.editingGuideDraft = "";
  state.editingError = "";
  state.savingGuide = false;
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
  state.openGuideEntry = null;
  state.drawerMode = "itinerary";
  resetEditingState();
  applyDrawerState();
}

function openGuidePanel(entry) {
  state.openGuideId = entry.id;
  state.openGuideEntry = entry;
  resetEditingState();
  renderOpenGuidePanel();
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
  state.drawerState = state.drawerState === "collapsed" ? "expanded" : "collapsed";
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
        state.drawerState = "collapsed";
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
  return [...locationsById.values()].filter((location) => (
    location.category === "restaurant"
    && !resolvedIds.has(location.id)
  ));
}

function refreshOpenGuideEntry(dayView) {
  if (!state.openGuideEntry || !dayView) {
    return;
  }

  const location = state.openGuideEntry.location_id ? locationsById.get(state.openGuideEntry.location_id) : null;
  if (!location) {
    return;
  }

  state.openGuideEntry = resolveGuideEntryForLocation(
    dayView,
    location,
    state.openGuideEntry.guide_mode || "core",
  );
}

function renderMap(dayView) {
  if (!map) {
    setMapMessage(refs.mapContainer, refs.mapOverlayMessage, "<strong>地图未初始化</strong><br>地图实例尚未创建，请刷新页面。");
    return { overlays: [], missingSegments: [] };
  }

  clearMapMessage(refs.mapOverlayMessage);

  const coreMarkers = markerLayer.render(dayView.resolvedPoints, {
    getMarkerContext: (location) => {
      const guideEntry = resolveGuideEntryForLocation(dayView, location, "core");
      const preview = truncateText(buildGuidePreview(guideEntry), 72)
        || location.description
        || location.notes
        || "暂无补充说明。";
      return {
        title: guideEntry.title || location.name,
        subtitle: `${dayView.day.title} · ${buildLocationMeta(location)}`,
        guideText: preview,
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
        cluster: true,
        showLabel: true,
        labelMaxLength: 6,
        markerClass: "amap-marker-chip--food",
        getMarkerContext: (location) => {
          const guideEntry = resolveGuideEntryForLocation(dayView, location, "food");
          const preview = truncateText(buildGuidePreview(guideEntry), 60)
            || location.description
            || location.notes
            || "暂无补充说明。";
          return {
            title: location.name,
            subtitle: `美食补充 · ${buildLocationMeta(location)}`,
            guideText: preview,
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
  fitMapToOverlays(map, [...coreMarkers, ...result.overlays], itinerary.trip);
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

  refreshOpenGuideEntry(dayView);
  if (state.openGuideEntry) {
    renderOpenGuidePanel();
  }
}

function handleViewportChange() {
  if (!isMobileViewport()) {
    state.drawerMode = "itinerary";
  } else if (state.drawerMode !== "guide") {
    state.drawerState = "collapsed";
  }
  applyDrawerState();
  if (itinerary) {
    renderActiveDay();
  }
}

function readEditorFields() {
  const container = isMobileViewport() ? refs.mobileGuideBody : refs.guidePanelBody;
  const markdownField = container.querySelector("[data-guide-field='markdown']");
  const tokenField = container.querySelector("[data-guide-field='token']");

  return {
    markdown: markdownField ? markdownField.value : state.editingGuideDraft,
    token: tokenField ? tokenField.value.trim() : state.editToken,
  };
}

function startGuideEditing() {
  if (!state.openGuideEntry?.guide_key) {
    return;
  }
  state.editingGuideKey = state.openGuideEntry.guide_key;
  state.editingGuideDraft = resolveGuideText(state.openGuideEntry);
  state.editingError = "";
  state.savingGuide = false;
  renderOpenGuidePanel();
}

function cancelGuideEditing() {
  resetEditingState();
  renderOpenGuidePanel();
}

async function saveGuideEditing() {
  if (!state.openGuideEntry || !state.editingGuideKey) {
    return;
  }

  const { markdown, token } = readEditorFields();
  state.editingGuideDraft = markdown;

  if (!state.guideApiBase) {
    state.editingError = "未配置共享保存服务。";
    renderOpenGuidePanel();
    return;
  }

  if (!token) {
    state.editingError = "请输入编辑密码。";
    renderOpenGuidePanel();
    return;
  }

  state.savingGuide = true;
  state.editingError = "";
  renderOpenGuidePanel();

  try {
    const saved = await saveGuideOverride({
      apiBase: state.guideApiBase,
      tripId: itinerary.trip.id,
      guideKey: state.editingGuideKey,
      markdown,
      editToken: token,
    });

    state.guideOverrides.set(state.editingGuideKey, saved);
    state.editToken = token;
    window.localStorage.setItem(GUIDE_EDIT_TOKEN_KEY, token);

    if (state.openGuideEntry.guide_key === state.editingGuideKey) {
      state.openGuideEntry = applyGuideOverride({
        ...state.openGuideEntry,
        guide_markdown: markdown,
      });
    }

    resetEditingState();
    await renderActiveDay();
  } catch (error) {
    state.savingGuide = false;
    state.editingError = error.message || "保存失败，请稍后重试。";
    renderOpenGuidePanel();
  }
}

async function handleGuideActionClick(event) {
  const actionElement = event.target.closest("[data-guide-action]");
  if (!actionElement) {
    return;
  }

  const action = actionElement.dataset.guideAction;
  if (action === "start-edit") {
    startGuideEditing();
    return;
  }

  if (action === "cancel-edit") {
    cancelGuideEditing();
    return;
  }

  if (action === "save-guide") {
    await saveGuideEditing();
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

    const entry = resolveGuideEntryForLocation(dayView, location, trigger.dataset.guideMode || "core");
    toggleGuidePanel(entry);
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
    state.drawerState = "collapsed";
    closeGuidePanel();
    renderActiveDay();
  });

  refs.guidePanelBody.addEventListener("click", handleGuideActionClick);
  refs.mobileGuideBody.addEventListener("click", handleGuideActionClick);

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

    state.guideApiBase = getGuideApiBase();
    if (state.guideApiBase) {
      try {
        const overrides = await fetchGuideOverrides({
          apiBase: state.guideApiBase,
          tripId: itinerary.trip.id,
        });
        state.guideOverrides = new Map(Object.entries(overrides));
      } catch (overrideError) {
        console.warn("Guide overrides unavailable:", overrideError.message);
      }
    }

    map = await createMap(refs.mapContainer, itinerary.trip);
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
