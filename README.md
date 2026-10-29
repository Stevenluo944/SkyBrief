# SkyBrief · 天气简报

一个只用**原生 HTML / CSS / JavaScript**（无任何框架、无构建步骤）实现的天气可视化页面，
支持实时天气、未来 3 天预报、24 小时温度折线图与深色/浅色主题切换。

## 功能

- **实时天气**：温度、体感、湿度、风、气压、日出日落
- **未来 3 天预报**：最高/最低气温、天气描述与图标、降水概率、最大风速
- **24 小时折线图**：Canvas 手绘的霓虹渐变温度曲线 + 降水概率柱状图，并带横向小时卡片
- **城市搜索**：输入城市名即时联想（支持中文）
- **自动定位**：浏览器 Geolocation 定位并反查城市名
- **主题切换**：深色赛博朋克霓虹风 / 浅色清爽风，选择记忆到 localStorage
- **多数据源可切换**：Open-Meteo（默认，免密钥）、中国天气网、气象数据平台（weatherdt）接口

## 目录结构

```
SkyBrief/
├── index.html          # 页面入口
├── css/style.css       # 样式（深色霓虹 + 浅色清爽 双主题）
├── js/weather.js       # 数据适配层（三个数据源，统一内部数据模型）
├── js/app.js           # 交互与渲染（搜索 / 定位 / Canvas 折线图 / 主题）
├── tools/weather-proxy.mjs  # 天气数据通用反向代理（Node ESM，中国天气网 + 气象数据平台）
└── README.md
```

## 快速开始

方式一：直接双击打开 `index.html`（默认使用 Open-Meteo，免密钥、可直接跑通）。

方式二：起一个本地静态服务器（推荐，定位功能在 http 下更稳）：

```bash
# 任选其一
npx serve .
python -m http.server 8080
```

然后访问对应地址即可。

## 数据源说明

页面右上角的下拉框可实时切换数据源。

| 数据源 | 说明 | 是否需要额外配置 |
| --- | --- | --- |
| `open-meteo` | 默认方案，免密钥、支持 CORS，全球覆盖 | 否 |
| `cnweather` | 中国天气网（weather.com.cn） | **是**，需反向代理（补 Referer） |
| `weatherdt` | 气象数据平台（weatherdt.com）接口 | **是**，需反向代理 + 平台密钥 key |

当所选数据源不可用时，页面会给出中文提示并**自动回退**到 Open-Meteo，保证始终能渲染真实数据。

### 启动反向代理

中国天气网接口带 `Referer` 校验、气象数据平台接口不返回 CORS 头，
纯静态页面浏览器直连都会失败，因此内置一个通用反向代理
（同时放行 `www.weather.com.cn` 与 `api.weatherdt.com`）：

```bash
node tools/weather-proxy.mjs      # 默认监听 http://localhost:8787/
```

随后把 `js/weather.js` 中的配置改为：

```js
CONFIG.proxy = 'http://localhost:8787/';
```

### 启用中国天气网数据源

配置好上面的 `CONFIG.proxy` 后，直接在下拉框选择“中国天气网”即可。
代理会把请求转发到 `www.weather.com.cn` 并自动补上 `Referer` 头。

### 启用气象数据平台（weatherdt）

数据源已按平台官方接口文档**逆向实现**，无需引入任何插件脚本：

```
GET http://api.weatherdt.com/common/?area={站号}&type=observe|forecast&key={密钥}
```

- `area`：站号（与城市对应，如北京 `101010100`），本项目复用内置城市表自动匹配
- `type`：`observe` 实况、`forecast` 预报（默认逐 24 小时）、`index` 指数、`air` 空气质量、`alarm` 预警
- `key`：在用户中心【订单管理 → 我的订单 → 接口详情】获取，**通常绑定请求来源 IP 或域名**

配置方式：

```js
CONFIG.proxy = 'http://localhost:8787/';   // 平台接口无 CORS 头，必须经代理
CONFIG.weatherdt.key = '你的密钥 key';
```

已支持的字段映射：实况（温度/湿度/风向/风力/气压/降水）+ 逐日预报（白天与夜间温度、天气现象编码转中文与图标）；
天气现象编码、风向编号、风力编号均按官方编码表解析，接口错误码（如 `CC1105` 密钥未授权）会转成中文提示。

> 平台数据源默认不含逐小时序列（需在订单中定制 `1h` 类型），此时 24 小时折线图会提示暂不支持，
> 其余实况与 3 天预报正常展示；未配置 key 或请求失败时自动回退 Open-Meteo。

## 主题

- 深色主题：`#070b16` 底色 + 青/紫/品红霓虹渐变光晕、圆角卡片
- 浅色主题：清爽蓝白配色
- 点击右上角 🌙 / ☀️ 切换，选择记忆在 localStorage

## 部署到 GitHub Pages

仓库为纯静态站点，直接在 GitHub 仓库 `Settings → Pages` 中选择分支根目录发布即可。

## 许可

MIT