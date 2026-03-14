from __future__ import annotations

import argparse
import csv
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
LOCATIONS_PATH = ROOT / "data" / "locations.csv"
ITINERARY_PATH = ROOT / "data" / "itinerary.json"
ROUTE_CACHE_PATH = ROOT / "data" / "route_cache.json"
API_URL_BY_MODE = {
    "driving": "https://restapi.amap.com/v5/direction/driving",
    "walking": "https://restapi.amap.com/v5/direction/walking",
}
REQUEST_INTERVAL_SECONDS = 0.35


def load_locations() -> dict[str, dict]:
    with LOCATIONS_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return {row["id"]: row for row in reader}


def load_itinerary() -> dict:
    return json.loads(ITINERARY_PATH.read_text(encoding="utf-8"))


def load_existing_cache() -> dict:
    if not ROUTE_CACHE_PATH.exists():
        return {"routes": {}}
    return json.loads(ROUTE_CACHE_PATH.read_text(encoding="utf-8"))


def normalize_transport_mode(value: str | None) -> str:
    mode = (value or "driving").strip().lower()
    return mode if mode in API_URL_BY_MODE else "driving"


def build_pair_key(transport_mode: str, from_id: str, to_id: str) -> str:
    return f"{transport_mode}:{from_id}->{to_id}"


def parse_polyline(polyline: str) -> list[list[float]]:
    path: list[list[float]] = []
    for pair in polyline.split(";"):
        if not pair:
            continue
        lng, lat = pair.split(",")
        point = [float(lng), float(lat)]
        if not path or path[-1] != point:
            path.append(point)
    return path


def fetch_route(api_key: str, origin: str, destination: str, transport_mode: str) -> dict:
    params = {
        "key": api_key,
        "origin": origin,
        "destination": destination,
        "show_fields": "cost,polyline",
    }
    if transport_mode == "driving":
        params["strategy"] = 32
    query = urllib.parse.urlencode(params)
    api_url = API_URL_BY_MODE[transport_mode]
    url = f"{api_url}?{query}"
    with urllib.request.urlopen(url, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_route_payload(
    segment: dict,
    origin: list[float],
    destination: list[float],
    data: dict,
    transport_mode: str,
) -> dict:
    if data.get("status") != "1" or data.get("count") == "0":
        return {
            "segment_id": segment["id"],
            "from": segment["from"],
            "to": segment["to"],
            "transport_mode": transport_mode,
            "origin": origin,
            "destination": destination,
            "status": "error",
            "error": data.get("info", "路线规划失败"),
            "path": [],
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }

    route = data["route"]["paths"][0]
    cost = route.get("cost", {})
    duration_value = cost.get("duration", route.get("duration", 0))
    path: list[list[float]] = []
    for step in route.get("steps", []):
        polyline = step.get("polyline")
        if not polyline:
            continue
        for point in parse_polyline(polyline):
            if not path or path[-1] != point:
                path.append(point)

    return {
        "segment_id": segment["id"],
        "from": segment["from"],
        "to": segment["to"],
        "transport_mode": transport_mode,
        "origin": origin,
        "destination": destination,
        "distance": int(route.get("distance", 0)),
        "duration": int(duration_value or 0),
        "traffic_lights": int(cost.get("traffic_lights", 0)) if transport_mode == "driving" else 0,
        "status": "ok",
        "path": path,
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }


def build_segment_payload(cached: dict, segment: dict) -> dict:
    payload = dict(cached)
    payload["segment_id"] = segment["id"]
    payload["transport_mode"] = normalize_transport_mode(segment.get("transport_mode"))
    return payload


def can_reuse_cached_route(cached: dict | None, segment: dict, origin: list[float], destination: list[float]) -> bool:
    if not cached:
        return False
    segment_mode = normalize_transport_mode(segment.get("transport_mode"))
    cached_mode = normalize_transport_mode(cached.get("transport_mode"))
    return (
        cached.get("from") == segment["from"]
        and cached.get("to") == segment["to"]
        and cached_mode == segment_mode
        and cached.get("origin") == origin
        and cached.get("destination") == destination
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Prefetch route_cache.json from AMap driving/walking API.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore existing route_cache.json and refresh every segment.",
    )
    args = parser.parse_args()

    api_key = os.environ.get("AMAP_API_KEY", "").strip()
    if not api_key:
        print("[ERROR] 环境变量 AMAP_API_KEY 未设置")
        return 1

    locations = load_locations()
    itinerary = load_itinerary()
    existing_cache = load_existing_cache()
    existing_routes = existing_cache.get("routes", {})
    routes: dict[str, dict] = {}
    pair_cache: dict[str, dict] = {}
    last_request_at = 0.0

    for day in itinerary.get("days", []):
        for segment in day.get("segments", []):
            transport_mode = normalize_transport_mode(segment.get("transport_mode"))
            from_location = locations[segment["from"]]
            to_location = locations[segment["to"]]
            origin = [float(from_location["lng"]), float(from_location["lat"])]
            destination = [float(to_location["lng"]), float(to_location["lat"])]
            pair_key = build_pair_key(transport_mode, segment["from"], segment["to"])

            if pair_key in pair_cache:
                routes[segment["id"]] = build_segment_payload(pair_cache[pair_key], segment)
                print(f"[SKIP] {segment['id']} -> reused in-run pair cache")
                continue

            existing_segment = existing_routes.get(segment["id"])
            if not args.force and can_reuse_cached_route(existing_segment, segment, origin, destination):
                payload = build_segment_payload(existing_segment, segment)
                routes[segment["id"]] = payload
                pair_cache[pair_key] = payload
                print(f"[SKIP] {segment['id']} -> reused existing cache")
                continue

            now = time.time()
            wait_seconds = max(0.0, REQUEST_INTERVAL_SECONDS - (now - last_request_at))
            if wait_seconds > 0:
                time.sleep(wait_seconds)

            data = fetch_route(
                api_key=api_key,
                origin=f"{origin[0]},{origin[1]}",
                destination=f"{destination[0]},{destination[1]}",
                transport_mode=transport_mode,
            )
            last_request_at = time.time()
            payload = extract_route_payload(segment, origin, destination, data, transport_mode)
            routes[segment["id"]] = payload
            pair_cache[pair_key] = payload
            print(f"[FETCH] {segment['id']} -> {payload['status']}")

    ROUTE_CACHE_PATH.write_text(
        json.dumps(
            {
                "provider": "AMap Web Service Routing v5 (driving+walking)",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "routes": routes,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[OK] wrote {ROUTE_CACHE_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
