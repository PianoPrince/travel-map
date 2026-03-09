from __future__ import annotations

import csv
import json
from pathlib import Path

try:
    import jsonschema  # type: ignore
except Exception:  # pragma: no cover
    jsonschema = None


ROOT = Path(__file__).resolve().parent.parent
LOCATIONS_PATH = ROOT / "data" / "locations.csv"
ITINERARY_PATH = ROOT / "data" / "itinerary.json"
SCHEMA_PATH = ROOT / "data" / "schema.json"
ROUTE_CACHE_PATH = ROOT / "data" / "route_cache.json"


def load_locations() -> dict[str, dict]:
    with LOCATIONS_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

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


def validate_schema(payload: dict) -> None:
    if jsonschema is None:
        return
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    jsonschema.validate(payload, schema)


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
            for option in entry.get("candidate_options", []):
                option_location_id = option.get("location_id")
                if option_location_id and option_location_id not in locations:
                    raise ValueError(
                        f"{day['id']} 的 {entry['id']} 候选项引用了缺失地点: {option_location_id}"
                    )


def validate_order(payload: dict) -> None:
    for day in payload.get("days", []):
        orders = []
        for segment in day.get("segments", []):
            orders.append(segment["order"])
        for entry in day.get("poi_entries", []):
            orders.append(entry["order"])

        if len(orders) != len(set(orders)):
            raise ValueError(f"{day['id']} 的 order 存在重复")


def validate_route_cache(payload: dict) -> None:
    if not ROUTE_CACHE_PATH.exists():
        raise ValueError("缺少 data/route_cache.json")

    route_cache = json.loads(ROUTE_CACHE_PATH.read_text(encoding="utf-8"))
    if "routes" not in route_cache or not isinstance(route_cache["routes"], dict):
        raise ValueError("route_cache.json 缺少 routes 对象")

    for day in payload.get("days", []):
        for segment in day.get("segments", []):
            segment_id = segment["id"]
            if segment_id not in route_cache["routes"]:
                raise ValueError(f"route_cache.json 缺少 segment 缓存: {segment_id}")


def main() -> int:
    try:
        locations = load_locations()
        itinerary = json.loads(ITINERARY_PATH.read_text(encoding="utf-8"))
        validate_schema(itinerary)
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
