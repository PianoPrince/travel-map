import { summarizeDay } from "./formatters.js";

export function createItineraryStore(itinerary, locationsById) {
  let activeDayId = itinerary.days[0]?.id ?? null;

  function getDay(dayId = activeDayId) {
    return itinerary.days.find((item) => item.id === dayId) ?? null;
  }

  function setActiveDay(dayId) {
    activeDayId = dayId;
  }

  function buildTimeline(day) {
    const routeEntries = day.segments.map((segment) => ({
      ...segment,
      order: segment.order,
      entry_type: "route",
    }));

    const poiEntries = day.poi_entries.map((entry) => ({
      ...entry,
      order: entry.order,
      entry_type: "poi",
    }));

    return [...routeEntries, ...poiEntries].sort((left, right) => left.order - right.order);
  }

  function buildDayView(dayId = activeDayId) {
    const day = getDay(dayId);
    if (!day) {
      return null;
    }

    const timeline = buildTimeline(day);
    const resolvedPoints = new Map();

    for (const segment of day.segments) {
      for (const locationId of [segment.from, segment.to]) {
        if (locationId && locationsById.has(locationId)) {
          resolvedPoints.set(locationId, locationsById.get(locationId));
        }
      }
    }

    for (const entry of day.poi_entries) {
      if (entry.location_id && locationsById.has(entry.location_id)) {
        resolvedPoints.set(entry.location_id, locationsById.get(entry.location_id));
      }
      for (const option of entry.candidate_options || []) {
        if (option.location_id && locationsById.has(option.location_id)) {
          resolvedPoints.set(option.location_id, locationsById.get(option.location_id));
        }
      }
    }

    return {
      day,
      timeline,
      resolvedPoints: [...resolvedPoints.values()],
      summary: summarizeDay(day),
    };
  }

  return {
    itinerary,
    get activeDayId() {
      return activeDayId;
    },
    getDay,
    setActiveDay,
    buildDayView,
  };
}
