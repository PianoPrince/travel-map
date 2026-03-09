# Role & Project Overview
你是一个资深的前端开发工程师和地图可视化专家，精通 HTML5, CSS3, JavaScript (ES6+)，以及高德地图 JavaScript API 2.0。
我们需要共同从零构建一个**轻量级、响应式（适配手机）的纯前端旅游路线可视化 Web 应用**。

# Tech Stack & File Structure
- **HTML/CSS/JS**: 原生构建，无需框架（如 React/Vue），确保最后可以通过浏览器直接双击打开或通过简单的静态服务器（如 Live Server）运行。
- **高德地图 JS API 2.0**: 用于地图渲染、地点标记（Marker）、路径规划（Driving）和信息窗体（InfoWindow）。
- **PapaParse (CDN)**: 用于在前端解析本地的 CSV 数据。
- **项目目录预期**:
  - `index.html`: 主容器与地图挂载点。
  - `style.css`: 全局样式、响应式布局及自定义地图气泡框样式。
  - `app.js`: 核心业务逻辑。
  - `data/locations.csv`: 存储全量地点元数据（Name, Lng, Lat, Type_Icon）。
  - `data/itinerary.json`: 存储每日行程逻辑、A->B 的路线关联、独立游玩小攻略及图片路径。
  - `assets/`: 存储攻略所需的相关图片。

# Core Requirements & Features

## 1. 响应式地图底座
- 地图需全屏满铺，并自适应移动端和 PC 端屏幕尺寸。
- 采用适合旅游展示的地图底图风格（如高德的 `amap://styles/light` 或默认清晰风格）。

## 2. 数据处理引擎
- **底库构建**：读取并解析 `locations.csv`，将所有涉及的坐标点缓存在内存中备用。
- **行程解析**：读取 `itinerary.json`，根据当天的行程安排（明确的起点到终点）来串联逻辑。

## 3. 动态路线规划与绘制（核心）
- 针对 `itinerary.json` 中带有方向性（A -> B）的行程，调用高德 `AMap.Driving`（驾车路线规划 API）。
- **蚂蚁线绘制**：提取驾车路线规划返回的 `polylines`，将其在地图上绘制为虚线流动的“蚂蚁线”（利用高德 VectorLayer 或 Polyline 虚线动画属性）以标明方向。
- **数据提取**：获取 API 返回的 A 到 B 的**距离（公里）**和**预计耗时（分钟/小时）**，并在路线中点或途经点附近的地图上做文字标注（Text）。

## 4. POI 标记与自定义 InfoWindow
- 对行程中没有形成路线的独立地点（如单纯打卡的美食、景点），根据其分类在地图上标注自定义样式的 Marker。
- 所有的 Marker 和路线节点均需绑定点击事件：点击后弹出高德 `InfoWindow`（悬浮气泡框）。
- **气泡框内容**：从 JSON 中读取该地点的“小攻略（富文本/文字）”和“图片”，渲染进气泡框中。气泡框样式需美观、圆角、适配手机屏幕展示。

# Execution Plan (Step-by-Step)
请严格按照以下阶段与我配合进行 Vibe Coding，每完成一个阶段并经我确认测试无误后，再进入下一阶段：

- **Phase 1: 基础骨架搭建**
  - 创建 HTML, CSS, JS 文件，引入高德 API 脚本（预留 Key 的位置）和 PapaParse。
  - 实现全屏地图的渲染和基础的手机端自适应逻辑。
- **Phase 2: 数据结构定义与 Mock 数据加载**
  - 制定 `locations.csv` 的表头格式和 `itinerary.json` 的 JSON Schema，生成几条测试数据供前端调用。
  - 实现用 `fetch` 读取 CSV 和 JSON 并解析为 JS 对象。
- **Phase 3: 静态 Marker 与 InfoWindow 渲染**
  - 将地点数据遍历渲染到地图上。
  - 编写 CSS 和 JS，实现点击 Marker 弹出图文并茂的自定义气泡框。
- **Phase 4: 路径规划与蚂蚁虚线动画**
  - 接入驾车 API，传入 A 和 B 的经纬度，绘制动态虚线。
  - 提取并在路线上方渲染距离与耗时信息。
- **Phase 5: 最终打磨**
  - 修复多路线重叠、气泡框超出屏幕边界等 UI 细节问题，确保移动端体验丝滑。

明白以上所有背景和要求后，请回复“确认”，并直接给我输出 Phase 2 所需的 `locations.csv` 和 `itinerary.json` 的最佳数据结构模板！