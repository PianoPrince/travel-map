from __future__ import annotations

import argparse
import json
from pathlib import Path


def build_day(day_id: str, label: str, date: str) -> dict:
    return {
        "id": day_id,
        "short_label": label,
        "date": date,
        "title": "新的一天",
        "theme": "待补充",
        "sun_times": {
            "sunrise": "",
            "sunset": "",
            "dawn": "",
            "dusk": "",
        },
        "segments": [],
        "poi_entries": [],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Append an empty day scaffold to itinerary.json.")
    parser.add_argument("day_id", help="New day id, e.g. day5")
    parser.add_argument("label", help="Display label, e.g. Day 5")
    parser.add_argument("date", help="Date in YYYY-MM-DD")
    args = parser.parse_args()

    itinerary_path = Path(__file__).resolve().parent.parent / "data" / "itinerary.json"
    data = json.loads(itinerary_path.read_text(encoding="utf-8"))
    data.setdefault("days", []).append(build_day(args.day_id, args.label, args.date))
    itinerary_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Appended {args.day_id} to {itinerary_path}")


if __name__ == "__main__":
    main()
