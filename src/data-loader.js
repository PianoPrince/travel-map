function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvText(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return headers.reduce((acc, header, index) => {
      acc[header] = (cells[index] || "").trim();
      return acc;
    }, {});
  });
}

function normalizeLocation(row) {
  return {
    ...row,
    lng: row.lng ? Number(row.lng) : null,
    lat: row.lat ? Number(row.lat) : null,
    day_tags: row.day_tags ? row.day_tags.split("|").filter(Boolean) : [],
  };
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`无法读取 ${path}`);
  }
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`无法读取 ${path}`);
  }
  return response.text();
}

export async function loadTripData() {
  if (window.location.protocol === "file:") {
    throw new Error("请通过 `python tools/serve.py` 或本地静态服务打开项目，避免 `file://` 下 `fetch` 失败。");
  }

  const [csvText, itinerary, icons, routeCache] = await Promise.all([
    fetchText("./data/locations.csv"),
    fetchJson("./data/itinerary.json"),
    fetchJson("./data/icons.json"),
    fetchJson("./data/route_cache.json"),
  ]);

  const locations = parseCsvText(csvText).map(normalizeLocation);
  const locationsById = new Map(locations.map((item) => [item.id, item]));
  return { itinerary, icons, locations, locationsById, routeCache };
}
