# 高德地图（AMap）API 接入迁移手册

本文档基于当前仓库 `E:\VSCode_Project\rent_project` 的真实实现整理，目标不是重复高德官方文档，而是说明：

1. 这个项目实际调用了哪些 AMap REST API。
2. 每个接口是如何传参的。
3. 原始返回大致长什么样。
4. 项目内部又如何把原始返回清洗成更易消费的数据结构。
5. 这些做法如何迁移到另一个旅游攻略项目中。

结论先行：本项目运行时使用的是高德 Web Service REST API，直接通过 `requests.get(...)` 调用，并没有使用高德 Python SDK。真实用到的能力只有 5 类：

- 地理编码 `v3/geocode/geo`
- 驾车路线规划 `v5/direction/driving`
- 公交一体化路线规划 `v5/direction/transit/integrated`
- 步行路线规划 `v5/direction/walking`
- 周边 POI 搜索 `v5/place/around`

## 1. 总览

| 能力 | HTTP | URL | 本项目用途 | 核心源码 |
| --- | --- | --- | --- | --- |
| 地理编码 | `GET` | `https://restapi.amap.com/v3/geocode/geo` | 把通勤地址、房源地址转成经纬度 | `geocoding/amap_client.py` |
| 驾车路线 | `GET` | `https://restapi.amap.com/v5/direction/driving` | 计算房源/网格点到目标点的驾车时间、距离、打车价、红绿灯数 | `geocoding/traffic.py` |
| 公交路线 | `GET` | `https://restapi.amap.com/v5/direction/transit/integrated` | 计算房源/网格点到目标点的公交耗时、票价、换乘段 | `geocoding/traffic.py` |
| 步行路线 | `GET` | `https://restapi.amap.com/v5/direction/walking` | 计算房源到最近地铁口的步行距离、时间、折线 | `geocoding/walking.py` |
| 周边 POI | `GET` | `https://restapi.amap.com/v5/place/around` | 小区周边地铁、商场、咖啡店、便利店统计与明细 | `geocoding/poi_cache_builder.py` |

## 2. 本项目的调用风格

### 2.1 公共特征

- 全部是 `GET` 请求。
- 统一通过 `requests.get(url, params=params, timeout=10)` 发起。
- 所有接口都依赖环境变量 `AMAP_API_KEY`，或构造对象时显式传入 `api_key`。
- 项目中普遍带有请求延迟和重试：
  - 地理编码默认 `request_delay=0.1`，`max_retries=3`
  - 路径规划/步行默认 `request_delay=0.34`，`max_retries=3`
  - POI 搜索默认延迟更高，避免触发限流
- 坐标内部统一使用 `(lon, lat)`。
- 地图渲染时会把坐标转成 `[lat, lon]`。

### 2.2 推荐在旅游项目中复用的基础请求函数

```python
import requests
import time


def amap_get(url: str, params: dict, retries: int = 3, delay: float = 0.3, timeout: int = 10):
    last_error = None
    for attempt in range(retries):
        try:
            if delay > 0:
                time.sleep(delay)
            resp = requests.get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            last_error = exc
            if attempt < retries - 1:
                time.sleep(1)
    raise RuntimeError(f"AMap request failed after {retries} attempts: {last_error}")
```

## 3. 地理编码 API

### 3.1 实际调用方式

- URL: `https://restapi.amap.com/v3/geocode/geo`
- Method: `GET`
- 源码入口：`geocoding/amap_client.py`

本项目实际参数：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `key` | `你的 AMAP_API_KEY` | 必填 |
| `address` | `上海黄浦区复兴坊` | 本项目会把 `city + address` 拼接后传入 |
| `city` | `上海` | 用于缩小搜索范围 |

本项目关键逻辑：

- 调用前把地址拼成 `full_address = f"{city}{address}"`。
- 只取 `geocodes[0]` 第一条结果。
- 从 `location` 字符串拆出经纬度。
- 只保留 `longitude`、`latitude`、`formatted_address`、`level`。
- 额外做上海范围校验：
  - `120 <= longitude <= 123`
  - `30 <= latitude <= 32`

### 3.2 cURL 示例

```bash
curl -G "https://restapi.amap.com/v3/geocode/geo" ^
  --data-urlencode "key=YOUR_AMAP_API_KEY" ^
  --data-urlencode "address=上海市黄浦区复兴坊" ^
  --data-urlencode "city=上海"
```

### 3.3 Python 示例

```python
def geocode_address(api_key: str, address: str, city: str = "上海") -> dict | None:
    url = "https://restapi.amap.com/v3/geocode/geo"
    full_address = f"{city}{address}"
    data = amap_get(
        url,
        {
            "key": api_key,
            "address": full_address,
            "city": city,
        },
        retries=3,
        delay=0.1,
    )

    if data.get("status") != "1" or data.get("count") == "0":
        return None

    geocode = data["geocodes"][0]
    lng, lat = geocode["location"].split(",")
    return {
        "longitude": float(lng),
        "latitude": float(lat),
        "formatted_address": geocode.get("formatted_address", full_address),
        "level": geocode.get("level", ""),
    }
```

### 3.4 原始返回结构

高德原始 JSON 在本项目中的有效主结构大致如下：

```json
{
  "status": "1",
  "info": "OK",
  "infocode": "10000",
  "count": "1",
  "geocodes": [
    {
      "formatted_address": "上海市黄浦区复兴坊",
      "country": "中国",
      "province": "上海市",
      "city": [],
      "district": "黄浦区",
      "adcode": "310101",
      "location": "121.467016,31.214602",
      "level": "兴趣点"
    }
  ]
}
```

### 3.5 本项目清洗后的返回

运行时返回：

```json
{
  "longitude": 121.467016,
  "latitude": 31.214602,
  "formatted_address": "上海市黄浦区复兴坊",
  "level": "兴趣点"
}
```

命中缓存时再补：

```json
{
  "longitude": 121.467016,
  "latitude": 31.214602,
  "formatted_address": "上海市黄浦区复兴坊",
  "cached": true
}
```

### 3.6 推荐迁移方式

旅游攻略项目里建议把它作为基础能力，统一服务于：

- 景点名转经纬度
- 酒店地址转经纬度
- 餐厅地址转经纬度
- 用户自定义出发点/住宿点定位

如果你的目标城市不止一个，不要复用本项目的上海坐标范围校验；应改成：

- 全国放开校验
- 或按城市边界做配置化校验

## 4. 驾车路线 API

### 4.1 实际调用方式

- URL: `https://restapi.amap.com/v5/direction/driving`
- Method: `GET`
- 源码入口：`geocoding/traffic.py`

本项目实际参数：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `key` | `你的 AMAP_API_KEY` | 必填 |
| `origin` | `121.433677,31.191394` | 起点，经纬度字符串 |
| `destination` | `121.459719,31.168871` | 终点，经纬度字符串 |
| `strategy` | `32` | 本项目固定使用 |
| `show_fields` | `cost,polyline` | 让返回里包含耗时成本和折线 |

本项目关键逻辑：

- 只取 `route.paths[0]` 第一条路线。
- 从 `paths[0].cost` 中取：
  - `duration`
  - `traffic_lights`
- 从 `route` 中取：
  - `taxi_cost`
- 把每个 step 的 `polyline` 提取成数组 `polylines`。

### 4.2 cURL 示例

```bash
curl -G "https://restapi.amap.com/v5/direction/driving" ^
  --data-urlencode "key=YOUR_AMAP_API_KEY" ^
  --data-urlencode "origin=121.433677,31.191394" ^
  --data-urlencode "destination=121.459719,31.168871" ^
  --data-urlencode "strategy=32" ^
  --data-urlencode "show_fields=cost,polyline"
```

### 4.3 Python 示例

```python
def get_driving_route(api_key: str, origin: tuple[float, float], destination: tuple[float, float]) -> dict | None:
    url = "https://restapi.amap.com/v5/direction/driving"
    data = amap_get(
        url,
        {
            "key": api_key,
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
            "strategy": 32,
            "show_fields": "cost,polyline",
        },
        retries=3,
        delay=0.34,
    )

    if data.get("status") != "1" or data.get("count") == "0":
        return None

    route = data["route"]
    path = route["paths"][0]
    cost = path.get("cost", {})
    polylines = [step["polyline"] for step in path.get("steps", []) if step.get("polyline")]
    return {
        "route": route,
        "polylines": polylines,
        "summary": {
            "distance": int(path.get("distance", 0)),
            "duration": int(cost.get("duration", 0)),
            "taxi_cost": float(route.get("taxi_cost", 0)),
            "traffic_lights": int(cost.get("traffic_lights", 0)),
        },
    }
```

### 4.4 原始返回结构

本项目实际消费到的主结构如下：

```json
{
  "status": "1",
  "info": "OK",
  "count": "1",
  "route": {
    "origin": "121.433677,31.191394",
    "destination": "121.459719,31.168871",
    "taxi_cost": "22",
    "paths": [
      {
        "distance": "4395",
        "restriction": "0",
        "cost": {
          "duration": "937",
          "tolls": "0",
          "toll_distance": "0",
          "traffic_lights": "15"
        },
        "steps": [
          {
            "instruction": "向东行驶44米右转",
            "step_distance": "44",
            "polyline": "121.433577,31.191255;121.433622,31.191231"
          }
        ]
      }
    ]
  }
}
```

### 4.5 本项目清洗后的返回

接口封装直接返回：

```json
{
  "route": {
    "origin": "121.433677,31.191394",
    "destination": "121.459719,31.168871",
    "taxi_cost": "22",
    "paths": [
      {
        "distance": "4395",
        "cost": {
          "duration": "937",
          "traffic_lights": "15"
        },
        "steps": []
      }
    ]
  },
  "polylines": [
    "121.433577,31.191255;121.433622,31.191231",
    "121.433987,31.191113;121.433976,31.190936"
  ]
}
```

上层再提炼成摘要：

```json
{
  "distance": 4395,
  "duration": 937,
  "taxi_cost": 22.0,
  "traffic_lights": 15,
  "polylines": [
    "121.433577,31.191255;121.433622,31.191231"
  ]
}
```

### 4.6 推荐迁移方式

旅游攻略项目里这类数据适合用于：

- 酒店到景点的打车耗时/距离展示
- 一日游路径的驾车成本排序
- 自驾路线卡片
- 地图上绘制路线折线

建议保留两层结果：

- 一层保留原始 `route`
- 一层输出你自己项目使用的 `summary`

这样后续若要扩展收费、限行、分段指令，不需要重新设计接口。

## 5. 公交一体化路线 API

### 5.1 实际调用方式

- URL: `https://restapi.amap.com/v5/direction/transit/integrated`
- Method: `GET`
- 源码入口：`geocoding/traffic.py`

本项目实际参数：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `key` | `你的 AMAP_API_KEY` | 必填 |
| `origin` | `121.433677,31.191394` | 起点 |
| `destination` | `121.459719,31.168871` | 终点 |
| `city1` | `021` | 起点城市代码，本项目默认上海 |
| `city2` | `021` | 终点城市代码，本项目默认上海 |
| `strategy` | `0` | 本项目固定使用 |
| `alternativeRoute` | `5` | 返回备选方案数量配置 |
| `show_fields` | `cost,polyline` | 需要费用和折线 |
| `date` | `2026-03-06` | 可选，本项目会传 |
| `time` | `08:00` | 可选，本项目会传 |

本项目关键逻辑：

- 若传入 `city` 不是数字，则强制回退成 `021`。
- 只取 `data["route"]["transits"][0]` 第一条公交方案。
- 对每个 `segment` 拆出步行段、公交段、地铁段、铁路段折线。
- 把折线存成：

```json
[
  {"type": "walk", "polyline": "..."},
  {"type": "bus", "polyline": "..."},
  {"type": "subway", "polyline": "..."}
]
```

- 当 `status == "1"` 但 `count == "0"` 时，不当错误处理，而是返回一个显式的 `no_transit` 结果。
- 上层还有一个额外业务规则：
  - 如果起终点球面距离小于 500 米，直接跳过公交请求，并缓存一个空公交结果。

### 5.2 cURL 示例

```bash
curl -G "https://restapi.amap.com/v5/direction/transit/integrated" ^
  --data-urlencode "key=YOUR_AMAP_API_KEY" ^
  --data-urlencode "origin=121.433677,31.191394" ^
  --data-urlencode "destination=121.459719,31.168871" ^
  --data-urlencode "city1=021" ^
  --data-urlencode "city2=021" ^
  --data-urlencode "strategy=0" ^
  --data-urlencode "alternativeRoute=5" ^
  --data-urlencode "show_fields=cost,polyline" ^
  --data-urlencode "date=2026-03-06" ^
  --data-urlencode "time=08:00"
```

### 5.3 Python 示例

```python
def get_transit_route(
    api_key: str,
    origin: tuple[float, float],
    destination: tuple[float, float],
    city_code: str = "021",
    date: str | None = None,
    time_str: str | None = None,
) -> dict | None:
    url = "https://restapi.amap.com/v5/direction/transit/integrated"
    params = {
        "key": api_key,
        "origin": f"{origin[0]},{origin[1]}",
        "destination": f"{destination[0]},{destination[1]}",
        "city1": city_code,
        "city2": city_code,
        "strategy": 0,
        "alternativeRoute": 5,
        "show_fields": "cost,polyline",
    }
    if date:
        params["date"] = date
    if time_str:
        params["time"] = time_str

    data = amap_get(url, params, retries=3, delay=0.34)

    if data.get("status") != "1":
        return None
    if data.get("count") == "0":
        return {
            "transit": {"cost": {"duration": 0, "transit_fee": 0}, "segments": []},
            "no_transit": True,
            "polylines": [],
        }

    transit = data["route"]["transits"][0]
    polylines = []
    for segment in transit.get("segments", []):
        walking = segment.get("walking", {})
        for step in walking.get("steps", []) or []:
            if step.get("polyline"):
                polylines.append({"type": "walk", "polyline": step["polyline"]})

        bus = segment.get("bus", {})
        for line in bus.get("buslines", []) or []:
            if line.get("polyline"):
                polylines.append({"type": "bus", "polyline": line["polyline"]})

    return {
        "transit": transit,
        "polylines": polylines,
    }
```

### 5.4 原始返回结构

本项目真实依赖的主结构是：

```json
{
  "status": "1",
  "info": "OK",
  "count": "1",
  "route": {
    "transits": [
      {
        "cost": {
          "duration": "2680",
          "transit_fee": "4"
        },
        "taxi": {
          "price": "22",
          "drivetime": "18",
          "distance": "4395"
        },
        "segments": [
          {
            "walking": {
              "distance": "380",
              "cost": {"duration": "300"},
              "steps": [
                {"polyline": "121.1,31.1;121.2,31.2"}
              ]
            },
            "bus": {
              "buslines": [
                {
                  "name": "地铁9号线",
                  "type": "地铁线路",
                  "polyline": "121.2,31.2;121.3,31.3",
                  "departure_stop": {
                    "name": "A站",
                    "location": "121.2,31.2"
                  },
                  "arrival_stop": {
                    "name": "B站"
                  },
                  "via_num": "5",
                  "cost": {
                    "duration": "900"
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

### 5.5 本项目清洗后的返回

封装层返回：

```json
{
  "transit": {
    "cost": {
      "duration": "2680",
      "transit_fee": "4"
    },
    "taxi": {
      "price": "22",
      "drivetime": "18",
      "distance": "4395"
    },
    "segments": []
  },
  "polylines": [
    {"type": "walk", "polyline": "121.1,31.1;121.2,31.2"},
    {"type": "subway", "polyline": "121.2,31.2;121.3,31.3"}
  ]
}
```

上层摘要：

```json
{
  "duration": 2680,
  "transit_fee": 4.0,
  "taxi_price": 22.0,
  "taxi_drivetime": 18,
  "taxi_distance": 4395,
  "segments": [],
  "polylines": [
    {"type": "walk", "polyline": "121.1,31.1;121.2,31.2"},
    {"type": "subway", "polyline": "121.2,31.2;121.3,31.3"}
  ]
}
```

无公交时：

```json
{
  "transit": {
    "cost": {
      "duration": 0,
      "transit_fee": 0
    },
    "segments": []
  },
  "no_transit": true,
  "polylines": []
}
```

### 5.6 推荐迁移方式

旅游攻略项目里公交接口适合用于：

- 酒店到景点的公共交通推荐
- 不同景点之间换乘复杂度比较
- 路线详情页展示步行段、地铁段、公交段

建议保留 `segments` 原始结构，不要只保留摘要，因为：

- 旅游场景更需要展示换乘细节
- 可能要展示站名、上下车点、途经站数、步行距离

## 6. 步行路线 API

### 6.1 实际调用方式

- URL: `https://restapi.amap.com/v5/direction/walking`
- Method: `GET`
- 源码入口：`geocoding/walking.py`

本项目实际参数：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `key` | `你的 AMAP_API_KEY` | 必填 |
| `origin` | `121.498446,31.151630` | 起点 |
| `destination` | `121.494868,31.148849` | 终点 |
| `show_fields` | `cost,duration,polyline` | 返回步行成本与折线 |

本项目关键逻辑：

- 只取 `route.paths[0]`。
- 优先使用 `path["polyline"]`。
- 如果 path 顶层没有 polyline，就拼接 `steps[*].polyline`。
- 最终保留 `distance`、`duration`、`polyline`、`paths`、`route`。

### 6.2 cURL 示例

```bash
curl -G "https://restapi.amap.com/v5/direction/walking" ^
  --data-urlencode "key=YOUR_AMAP_API_KEY" ^
  --data-urlencode "origin=121.498446,31.151630" ^
  --data-urlencode "destination=121.494868,31.148849" ^
  --data-urlencode "show_fields=cost,duration,polyline"
```

### 6.3 Python 示例

```python
def get_walking_route(api_key: str, origin: tuple[float, float], destination: tuple[float, float]) -> dict | None:
    url = "https://restapi.amap.com/v5/direction/walking"
    data = amap_get(
        url,
        {
            "key": api_key,
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
            "show_fields": "cost,duration,polyline",
        },
        retries=3,
        delay=0.34,
    )

    if data.get("status") != "1" or data.get("count") == "0":
        return None

    route = data.get("route", {})
    paths = route.get("paths") or []
    path = paths[0] if paths else {}
    cost = path.get("cost", {})
    polyline = path.get("polyline", "")
    if not polyline:
        steps = path.get("steps") or []
        polyline = ";".join(s["polyline"] for s in steps if s.get("polyline"))

    return {
        "distance": int(path.get("distance", 0)),
        "duration": int(cost.get("duration", 0)),
        "polyline": polyline,
        "paths": paths,
        "route": route,
    }
```

### 6.4 原始返回结构

```json
{
  "status": "1",
  "info": "OK",
  "count": "1",
  "route": {
    "paths": [
      {
        "distance": "712",
        "cost": {
          "duration": "570"
        },
        "polyline": "121.498485,31.151576;121.498455,31.151558",
        "steps": [
          {
            "instruction": "向西步行117米左转",
            "step_distance": "117",
            "cost": {
              "duration": "94"
            },
            "polyline": "121.498485,31.151576;121.498455,31.151558"
          }
        ]
      }
    ]
  }
}
```

### 6.5 本项目清洗后的返回

```json
{
  "distance": 712,
  "duration": 570,
  "polyline": "121.498485,31.151576;121.498455,31.151558",
  "paths": [
    {
      "distance": "712",
      "cost": {"duration": "570"},
      "steps": []
    }
  ],
  "route": {
    "paths": []
  }
}
```

### 6.6 推荐迁移方式

旅游攻略项目里可以用于：

- 酒店到最近地铁站
- 景点内部入口到出口
- 酒店到附近餐厅/商圈
- 地图页画步行导航预览线

如果只展示摘要，可用：

```json
{
  "distance": 712,
  "duration": 570,
  "polyline": "121.498485,31.151576;121.498455,31.151558"
}
```

## 7. 周边 POI 搜索 API

### 7.1 实际调用方式

- URL: `https://restapi.amap.com/v5/place/around`
- Method: `GET`
- 源码入口：`geocoding/poi_cache_builder.py`

本项目实际参数：

| 参数 | 示例 | 说明 |
| --- | --- | --- |
| `key` | `你的 AMAP_API_KEY` | 必填 |
| `location` | `121.462771,31.198247` | 中心点 |
| `keywords` | `` | 本项目传空字符串 |
| `types` | `150501|060100|050500|060200` | 多类型联合搜索 |
| `radius` | `500` | 搜索半径，单位米 |
| `sortrule` | `distance` | 按距离排序 |
| `page_size` | `25` | 每页数量 |
| `page_num` | `1` | 页码 |
| `extensions` | `base` | 返回基础字段 |

本项目默认类型说明：

| 类型码 | 含义 | 用途 |
| --- | --- | --- |
| `150501` | 地铁站出入口 | 找最近地铁 |
| `060100` | 商场相关 | 统计商场/购物中心 |
| `050500` | 咖啡厅相关 | 统计咖啡店 |
| `060200` | 便利店 | 统计便利店品牌 |

本项目关键逻辑：

- 每个小区最多翻 3 页。
- 如果第 2 页开始出现明显重复 POI，则提前停止翻页。
- 原样保留 `pois` 数组。
- 额外统计：
  - 每个类型码命中的数量
  - 便利店品牌计数：`全家`、`LAWSON`、`7-ELEVEn`

### 7.2 cURL 示例

```bash
curl -G "https://restapi.amap.com/v5/place/around" ^
  --data-urlencode "key=YOUR_AMAP_API_KEY" ^
  --data-urlencode "location=121.462771,31.198247" ^
  --data-urlencode "keywords=" ^
  --data-urlencode "types=150501|060100|050500|060200" ^
  --data-urlencode "radius=500" ^
  --data-urlencode "sortrule=distance" ^
  --data-urlencode "page_size=25" ^
  --data-urlencode "page_num=1" ^
  --data-urlencode "extensions=base"
```

### 7.3 Python 示例

```python
def search_poi_around(
    api_key: str,
    location: tuple[float, float],
    types: str,
    radius: int = 500,
    page_size: int = 25,
    page_num: int = 1,
) -> list[dict]:
    url = "https://restapi.amap.com/v5/place/around"
    data = amap_get(
        url,
        {
            "key": api_key,
            "location": f"{location[0]},{location[1]}",
            "keywords": "",
            "types": types,
            "radius": radius,
            "sortrule": "distance",
            "page_size": page_size,
            "page_num": page_num,
            "extensions": "base",
        },
        retries=5,
        delay=1.0,
    )
    return data.get("pois", []) or []
```

### 7.4 原始返回结构

本项目真实消费到的 POI 结构如下：

```json
{
  "pois": [
    {
      "id": "B0FFHCE2AZ",
      "name": "LAWSON罗森(204067斜土路400店)",
      "type": "购物服务;便民商店/便利店;便民商店/便利店",
      "typecode": "060200",
      "address": "斜土路400号",
      "location": "121.462188,31.198108",
      "distance": "57",
      "pname": "上海市",
      "cityname": "上海市",
      "adname": "徐汇区",
      "citycode": "021",
      "adcode": "310104",
      "parent": ""
    }
  ]
}
```

### 7.5 本项目清洗后的返回

POI 搜索本身基本不清洗单条 POI，而是外层加一个缓存壳：

```json
{
  "community": "大木小区",
  "location": [121.462771, 31.198247],
  "radius": 500,
  "page_size": 25,
  "updated_at": "2026-02-04 22:07:43",
  "types": "150501|060100|050500|060200",
  "pois": [
    {
      "id": "B0FFHCE2AZ",
      "name": "LAWSON罗森(204067斜土路400店)",
      "typecode": "060200",
      "location": "121.462188,31.198108",
      "distance": "57"
    }
  ],
  "convenience": {
    "total": 8,
    "family": 1,
    "lawson": 2,
    "seven": 0
  }
}
```

### 7.6 推荐迁移方式

旅游攻略项目里这类能力非常有用，建议直接复用：

- 景点周边地铁站
- 酒店周边餐饮、便利店、咖啡厅
- 商圈密度评分
- 景点周边生活便利度标签

建议为旅游项目改造 `types`：

- 景点周边美食
- 地铁/公交
- 商圈/购物
- 医院/药店
- 卫生间/游客服务中心

## 8. 本项目统一返回模型

如果你要在旅游攻略项目中复用这套思路，建议不要直接把高德原始返回透给前端，而是统一成以下模型。

### 8.1 `GeocodeResult`

```json
{
  "longitude": 121.467016,
  "latitude": 31.214602,
  "formatted_address": "上海市黄浦区复兴坊",
  "level": "兴趣点",
  "cached": false
}
```

### 8.2 `DrivingRouteSummary`

```json
{
  "distance": 4395,
  "duration": 937,
  "taxi_cost": 22.0,
  "traffic_lights": 15,
  "polylines": [
    "121.433577,31.191255;121.433622,31.191231"
  ]
}
```

### 8.3 `TransitRouteSummary`

```json
{
  "duration": 2680,
  "transit_fee": 4.0,
  "taxi_price": 22.0,
  "taxi_drivetime": 18,
  "taxi_distance": 4395,
  "segments": [],
  "polylines": [
    {"type": "walk", "polyline": "..."},
    {"type": "subway", "polyline": "..."}
  ]
}
```

### 8.4 `WalkingRouteSummary`

```json
{
  "distance": 712,
  "duration": 570,
  "polyline": "121.498485,31.151576;121.498455,31.151558",
  "paths": [],
  "route": {}
}
```

### 8.5 `PoiCacheEntry`

```json
{
  "community": "大木小区",
  "location": [121.462771, 31.198247],
  "radius": 500,
  "page_size": 25,
  "updated_at": "2026-02-04 22:07:43",
  "types": "150501|060100|050500|060200",
  "pois": [],
  "convenience": {
    "total": 0,
    "family": 0,
    "lawson": 0,
    "seven": 0
  }
}
```

## 9. `polyline` 的处理方式

这是本项目里非常值得复用的一部分。

高德多数路径接口返回的是：

```text
121.433577,31.191255;121.433622,31.191231;121.433708,31.191156
```

本项目的处理规则是：

1. 原始字符串按 `;` 分段。
2. 每段再按 `,` 拆成 `lng` 和 `lat`。
3. 地图渲染前转成 `[lat, lng]`。

推荐复用函数：

```python
def parse_polyline(polyline: str) -> list[list[float]]:
    coords = []
    if not polyline:
        return coords
    for pair in polyline.split(";"):
        if not pair:
            continue
        parts = pair.split(",")
        if len(parts) != 2:
            continue
        lng = float(parts[0])
        lat = float(parts[1])
        coords.append([lat, lng])
    return coords
```

注意：

- 后端计算距离时仍建议保留 `(lon, lat)`。
- 只有在前端地图绘制时再换成 `[lat, lon]`。

## 10. 缓存设计

本项目的缓存设计很适合迁移。

### 10.1 地理编码缓存

- 文件：`data/geocode_cache.json`
- Key：`city::normalized_address`
- 值结构：

```json
{
  "address": "黄浦区复兴坊",
  "longitude": 121.467016,
  "latitude": 31.214602,
  "formatted_address": "上海市黄浦区复兴坊",
  "city": "上海",
  "cached_at": "2026-01-25T17:04:27.916463"
}
```

### 10.2 交通缓存

- 文件：`data/traffic_cache.json`
- Key：`traffic_{transport_type}_{origin_lon}_{origin_lat}_to_{dest_lon}_{dest_lat}`
- 值结构：

```json
{
  "transport_type": "driving",
  "origin": [121.433677, 31.191394],
  "destination": [121.459719, 31.168871],
  "data": {
    "route": {},
    "polylines": []
  },
  "context": {
    "city": "021",
    "date": "2026-03-06",
    "time": "08:00"
  },
  "cached_at": "2026-03-06T08:05:00"
}
```

这个 `context` 很重要，适合旅游项目继续保留，因为：

- 同一对起终点在不同日期/时间，公交结果可能变化
- 同一路径在不同场景下的缓存不能完全混用

### 10.3 步行缓存

- 文件：`data/walking_cache.json`
- Key：`walking_{origin}_to_{dest}`
- 值结构：

```json
{
  "origin": [121.498446, 31.151630],
  "destination": [121.494868, 31.148849],
  "data": {
    "distance": 712,
    "duration": 570,
    "polyline": "...",
    "paths": []
  },
  "cached_at": "2026-01-31T21:54:13.944988"
}
```

### 10.4 POI 缓存

- 文件：`data/poi_cache.json`
- Key：`community|lon|lat`
- 值结构见上面的 `PoiCacheEntry`

## 11. 迁移到旅游攻略项目的建议

### 11.1 建议保留原始响应的接口

- 公交路线
- 驾车路线
- 步行路线

原因：

- 后续很可能还要增加站点信息、路线详情、分段展示、地图动画
- 只保留摘要会让后续扩展再次回头改接口

### 11.2 建议优先输出摘要的接口

- 地理编码
- POI 搜索统计

原因：

- 业务方通常更关心坐标、格式化地址、POI 标签统计
- 原始字段大多不会直接展示

### 11.3 建议的旅游项目模块拆分

```text
travel_project/
  amap/
    client.py              # 通用 GET + 重试
    geocode.py             # 地址转坐标
    routing.py             # driving / transit / walking
    poi.py                 # around search
    cache.py               # 通用缓存接口
    normalize.py           # 原始响应 -> 业务摘要
```

### 11.4 建议的业务映射

| 旅游业务场景 | 推荐 AMap 能力 |
| --- | --- |
| 酒店到景点 | 驾车 + 公交 |
| 景点到景点 | 驾车 + 公交 + 步行 |
| 最近地铁站 | POI + 步行 |
| 周边商圈便利度 | POI |
| 多景点排序 | 地理编码 + 路径规划 |

## 12. 本项目未实际使用但容易误判的能力

以下内容虽然可能出现在仓库资料或工具配置里，但不属于当前 Python 代码主流程的真实运行调用：

- 逆地理编码 `v3/geocode/regeo`
- 天气 API
- IP 定位 API
- 高德 MCP 工具调用

如果你的旅游项目需要这些能力，应单独设计，不要误以为本项目已经实现。

## 13. 源码追溯索引

如果后续要继续核对实现细节，可优先看以下文件：

- `geocoding/amap_client.py`
- `geocoding/geocoder.py`
- `geocoding/traffic.py`
- `geocoding/walking.py`
- `geocoding/poi_cache_builder.py`
- `geocoding/traffic_cache.py`
- `geocoding/walking_cache.py`
- `geocoding/cache.py`
- `geocoding/visualizer.py`
- `test_traffic_visualization.py`

## 14. 最终建议

如果你要把这套能力迁移到旅游攻略项目，最实用的做法是：

1. 先保留 REST 直连模式，不必急着接 SDK。
2. 统一一层 `amap_get(...)` 请求函数。
3. 路由类接口同时保留 `raw` 和 `summary` 两层结果。
4. 把 `polyline` 解析封装成通用函数。
5. 让缓存键包含坐标和上下文，不要只按坐标缓存。

这样复用成本最低，也最接近本项目已经验证过的实现路径。
