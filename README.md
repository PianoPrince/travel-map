# Travel Map Prototype

一个基于静态前端和少量 Python 工具的西双版纳旅行地图原型。

## 启动

先预取本地路线缓存：

```powershell
.venv\Scripts\Activate.ps1
python tools\prefetch_routes.py
```

再启动本地静态服务：

```powershell
python tools\serve.py
```

浏览器打开 `http://127.0.0.1:8000`。

## 运行方式

- 地图底图使用本地 Leaflet + 高德瓦片 URL
- 地点、图标、行程、路线都来自本地静态文件
- 页面运行本身不需要高德 JS SDK Key
- 只有 `tools/prefetch_routes.py` 预取路线时需要环境变量 `AMAP_API_KEY`

PowerShell 临时设置示例：

```powershell
$env:AMAP_API_KEY="your_web_service_key_here"
python tools\prefetch_routes.py
```

## 数据文件

- `data/locations.csv`: 地点底库
- `data/itinerary.json`: 每日路线与攻略
- `data/icons.json`: 地点类别图标映射
- `data/route_cache.json`: 已预取的路线缓存

## 校验

```powershell
python tools\validate_data.py
python -m py_compile tools\serve.py tools\validate_data.py tools\prefetch_routes.py
```

## 说明

- 请通过本地 HTTP 服务访问，不要直接用 `file://` 打开
- 页面只依赖网络加载高德瓦片；地图引擎、点位和路线数据都在本地
- 批量预取请遵守高德限流，按序节流请求
