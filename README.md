# Travel Map Prototype

基于静态前端（Leaflet）和轻量 Python 工具链的西双版纳旅行地图。

## 本地运行

```powershell
.venv\Scripts\Activate.ps1
python tools\serve.py
```

浏览器打开 `http://127.0.0.1:8000`。

## 路线缓存（可选重建）

```powershell
$env:AMAP_API_KEY="your_web_service_key_here"
python tools\prefetch_routes.py
```

## 数据文件

- `data/locations.csv`：地点基础库
- `data/itinerary.json`：每日行程和基础攻略
- `data/icons.json`：图标映射
- `data/route_cache.json`：预取后的路线缓存

## 共享攻略编辑（GitHub Pages 可用）

前端默认只读本地攻略。要启用“网页端编辑并共享保存”，需要部署 Worker API。

### 1) 部署 Worker

目录：`worker/guide-api/`

```powershell
cd worker/guide-api
npm create cloudflare@latest .
# 若仓库已有 wrangler，可直接：
wrangler kv namespace create GUIDE_KV
wrangler secret put EDIT_TOKEN
wrangler deploy
```

然后把 `wrangler.toml` 的 `kv_namespaces.id` 改成真实 KV ID，并设置 `ALLOWED_ORIGINS` 为你的 Pages 域名。

### 2) 配置前端 API 地址

编辑 `src/runtime-config.js`：

```js
window.TRAVEL_APP_CONFIG = {
  guideApiBase: "https://travel-guide-api.<your-subdomain>.workers.dev",
};
```

### 3) 使用说明

- 点击地图点位 -> 查看攻略 -> 编辑攻略
- 支持 Markdown（标题、列表、图片语法 `![](url)`）
- 保存需要输入 `EDIT_TOKEN`
- 保存成功后，其他设备刷新同一网址可见

## 校验

```powershell
python tools\validate_data.py
python -m py_compile tools\serve.py tools\validate_data.py tools\prefetch_routes.py
```
