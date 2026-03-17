from __future__ import annotations

import argparse
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ITINERARY_PATH = ROOT / "data" / "itinerary.json"
RUNTIME_CONFIG_PATH = ROOT / "src" / "runtime-config.js"


def load_itinerary() -> dict:
    return json.loads(ITINERARY_PATH.read_text(encoding="utf-8"))


def parse_runtime_guide_api_base() -> str:
    text = RUNTIME_CONFIG_PATH.read_text(encoding="utf-8")
    matched = re.search(r'guideApiBase:\s*"([^"]*)"', text)
    return matched.group(1).strip() if matched else ""


def fetch_remote_guides(api_base: str, trip_id: str, origin: str = "") -> dict:
    base = api_base.rstrip("/")
    if not base:
        raise ValueError("guideApiBase 为空，请在 src/runtime-config.js 配置或通过 --api-base 传入。")

    query = urllib.parse.urlencode({"tripId": trip_id})
    url = f"{base}/api/guides?{query}"
    headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GuideSync/1.0",
    }
    if origin:
        headers["Origin"] = origin
        headers["Referer"] = f"{origin.rstrip('/')}/"

    request = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    guides = payload.get("guides", {})
    if not isinstance(guides, dict):
        raise ValueError("Guide API 返回格式异常：guides 不是对象。")
    return {"tripId": trip_id, "guides": guides}


def merge_core_guides_into_itinerary(itinerary: dict, guides: dict) -> dict:
    days = {day.get("id"): day for day in itinerary.get("days", [])}
    merged_count = 0
    skipped_non_core = 0
    unmatched_core: list[str] = []

    for guide_key, guide_payload in guides.items():
        parts = str(guide_key).split(":")
        if len(parts) != 3:
            continue
        day_id, mode, location_id = parts

        if mode != "core":
            skipped_non_core += 1
            continue

        day = days.get(day_id)
        if not day:
            unmatched_core.append(guide_key)
            continue

        poi_entries = day.get("poi_entries", [])
        matched_entry = next(
            (entry for entry in poi_entries if entry.get("location_id") == location_id),
            None,
        )
        if not matched_entry:
            unmatched_core.append(guide_key)
            continue

        markdown = str(guide_payload.get("markdown", ""))
        updated_at = str(guide_payload.get("updatedAt", ""))
        before_markdown = str(matched_entry.get("guide_markdown", ""))
        before_updated_at = str(matched_entry.get("guide_updated_at", ""))

        matched_entry["guide_markdown"] = markdown
        matched_entry["guide_updated_at"] = updated_at

        if before_markdown != markdown or before_updated_at != updated_at:
            merged_count += 1

    return {
        "merged_count": merged_count,
        "skipped_non_core": skipped_non_core,
        "unmatched_core": unmatched_core,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Pull guide overrides from Worker and sync to local files.")
    parser.add_argument("--api-base", default="", help="Guide API base URL. Default: read from runtime-config.js")
    parser.add_argument("--trip-id", default="", help="Trip id. Default: read from data/itinerary.json")
    parser.add_argument(
        "--origin",
        default="",
        help="Optional request Origin header for Worker allowlist, e.g. https://pianoprince.github.io",
    )
    parser.add_argument(
        "--snapshot-path",
        default="",
        help="Override snapshot output path. Default: data/guide_overrides.<trip_id>.json",
    )
    parser.add_argument(
        "--skip-itinerary-merge",
        action="store_true",
        help="Only pull snapshot, do not merge core guides into itinerary.json",
    )
    args = parser.parse_args()

    itinerary = load_itinerary()
    trip_id = args.trip_id.strip() or itinerary.get("trip", {}).get("id", "").strip()
    if not trip_id:
        raise ValueError("未找到 trip id，请在 itinerary.json 配置或通过 --trip-id 传入。")

    api_base = args.api_base.strip() or parse_runtime_guide_api_base()
    payload = fetch_remote_guides(api_base=api_base, trip_id=trip_id, origin=args.origin.strip())

    snapshot_path = (
        Path(args.snapshot_path)
        if args.snapshot_path.strip()
        else ROOT / "data" / f"guide_overrides.{trip_id}.json"
    )
    if not snapshot_path.is_absolute():
        snapshot_path = ROOT / snapshot_path
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[OK] snapshot saved: {snapshot_path}")
    print(f"[OK] total overrides: {len(payload['guides'])}")

    if args.skip_itinerary_merge:
        print("[SKIP] itinerary merge disabled by flag.")
        return 0

    merge_result = merge_core_guides_into_itinerary(itinerary=itinerary, guides=payload["guides"])
    ITINERARY_PATH.write_text(json.dumps(itinerary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[OK] itinerary merged core guides: {merge_result['merged_count']}")
    print(f"[INFO] non-core overrides skipped (kept in snapshot): {merge_result['skipped_non_core']}")
    if merge_result["unmatched_core"]:
        print(f"[WARN] unmatched core overrides: {len(merge_result['unmatched_core'])}")
        for key in merge_result["unmatched_core"]:
            print(f"  - {key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
