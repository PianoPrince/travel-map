from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
LOCATIONS_PATH = ROOT / "data" / "locations.csv"
ITINERARY_PATH = ROOT / "data" / "itinerary.json"
ROUTE_CACHE_PATH = ROOT / "data" / "route_cache.json"


def load_locations() -> dict[str, dict]:
    with LOCATIONS_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    seen: set[str] = set()
    locations: dict[str, dict] = {}
    for row in rows:
        location_id = row["id"].strip()
        if not location_id:
            raise ValueError("locations.csv 存在空 id")
        if location_id in seen:
            raise ValueError(f"locations.csv 出现重复 id: {location_id}")
        seen.add(location_id)

        if row["lng"] and row["lat"]:
            try:
                lng = float(row["lng"])
                lat = float(row["lat"])
            except ValueError as exc:
                raise ValueError(f"{location_id} 的坐标无法解析") from exc
            if not (-180 <= lng <= 180 and -90 <= lat <= 90):
                raise ValueError(f"{location_id} 的坐标超出范围")

        locations[location_id] = row
    return locations


def validate_links(payload: dict, locations: dict[str, dict]) -> None:
    for day in payload.get("days", []):
        for segment in day.get("segments", []):
            for key in ("from", "to"):
                location_id = segment.get(key)
                if location_id not in locations:
                    raise ValueError(f"{day['id']} 的 {segment['id']} 引用了缺失地点: {location_id}")

        for entry in day.get("poi_entries", []):
            location_id = entry.get("location_id")
            if location_id and location_id not in locations:
                raise ValueError(f"{day['id']} 的 {entry['id']} 引用了缺失地点: {location_id}")


def validate_order(payload: dict) -> None:
    for day in payload.get("days", []):
        orders = [segment["order"] for segment in day.get("segments", [])]
        orders.extend(entry["order"] for entry in day.get("poi_entries", []))
        if len(orders) != len(set(orders)):
            raise ValueError(f"{day['id']} 的 order 存在重复")


def validate_route_cache(payload: dict) -> None:
    if not ROUTE_CACHE_PATH.exists():
        raise ValueError("缺少 data/route_cache.json")

    route_cache = json.loads(ROUTE_CACHE_PATH.read_text(encoding="utf-8"))
    routes = route_cache.get("routes")
    if not isinstance(routes, dict):
        raise ValueError("route_cache.json 缺少 routes 对象")

    for day in payload.get("days", []):
        for segment in day.get("segments", []):
            if segment["id"] not in routes:
                raise ValueError(f"route_cache.json 缺少 segment 缓存: {segment['id']}")


def main() -> int:
    try:
        locations = load_locations()
        itinerary = json.loads(ITINERARY_PATH.read_text(encoding="utf-8"))
        validate_links(itinerary, locations)
        validate_order(itinerary)
        validate_route_cache(itinerary)
    except Exception as exc:
        print(f"[ERROR] {exc}")
        return 1

    print(f"[OK] locations: {len(locations)}")
    print(f"[OK] days: {len(itinerary.get('days', []))}")
    print("[OK] data validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
