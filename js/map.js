/* SkyBrief 中国省份气温地图
 * 纯原生 Canvas 绘制：
 *   - 运行时多源加载省级 GeoJSON（DataV → jsDelivr 兜底），失败时降级为提示
 *   - 一次性批量请求各省会坐标的实况与 24 小时温度（Open-Meteo 多坐标接口）
 *   - 省份按温度着色并标注温度，鼠标悬停高亮并弹出含 24 小时趋势折线图的浮层
 *   - 点击省份可将左侧城市切换到该省省会
 */
(function () {
  'use strict';

  const W = window.SkyBriefWeather;
  const el = id => document.getElementById(id);

  const GEO_SOURCES = [
    'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
    'https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/china.json'
  ];

  /* 省级行政区：adcode 用于与 GeoJSON 精确匹配，names 兼容两套数据源的命名 */
  const PROVINCES = [
    { adcode: '110000', names: ['北京', '北京市'], short: '北京', city: '北京', lat: 39.90, lon: 116.41 },
    { adcode: '120000', names: ['天津', '天津市'], short: '天津', city: '天津', lat: 39.13, lon: 117.20 },
    { adcode: '130000', names: ['河北', '河北省'], short: '河北', city: '石家庄', lat: 38.04, lon: 114.51 },
    { adcode: '140000', names: ['山西', '山西省'], short: '山西', city: '太原', lat: 37.87, lon: 112.55 },
    { adcode: '150000', names: ['内蒙古', '内蒙古自治区'], short: '内蒙古', city: '呼和浩特', lat: 40.84, lon: 111.75 },
    { adcode: '210000', names: ['辽宁', '辽宁省'], short: '辽宁', city: '沈阳', lat: 41.80, lon: 123.43 },
    { adcode: '220000', names: ['吉林', '吉林省'], short: '吉林', city: '长春', lat: 43.82, lon: 125.32 },
    { adcode: '230000', names: ['黑龙江', '黑龙江省'], short: '黑龙江', city: '哈尔滨', lat: 45.80, lon: 126.53 },
    { adcode: '310000', names: ['上海', '上海市'], short: '上海', city: '上海', lat: 31.23, lon: 121.47 },
    { adcode: '320000', names: ['江苏', '江苏省'], short: '江苏', city: '南京', lat: 32.06, lon: 118.78 },
    { adcode: '330000', names: ['浙江', '浙江省'], short: '浙江', city: '杭州', lat: 30.27, lon: 120.15 },
    { adcode: '340000', names: ['安徽', '安徽省'], short: '安徽', city: '合肥', lat: 31.86, lon: 117.28 },
    { adcode: '350000', names: ['福建', '福建省'], short: '福建', city: '福州', lat: 26.08, lon: 119.30 },
    { adcode: '360000', names: ['江西', '江西省'], short: '江西', city: '南昌', lat: 28.68, lon: 115.89 },
    { adcode: '370000', names: ['山东', '山东省'], short: '山东', city: '济南', lat: 36.65, lon: 117.00 },
    { adcode: '410000', names: ['河南', '河南省'], short: '河南', city: '郑州', lat: 34.75, lon: 113.62 },
    { adcode: '420000', names: ['湖北', '湖北省'], short: '湖北', city: '武汉', lat: 30.59, lon: 114.30 },
    { adcode: '430000', names: ['湖南', '湖南省'], short: '湖南', city: '长沙', lat: 28.23, lon: 112.94 },
    { adcode: '440000', names: ['广东', '广东省'], short: '广东', city: '广州', lat: 23.13, lon: 113.26 },
    { adcode: '450000', names: ['广西', '广西壮族自治区'], short: '广西', city: '南宁', lat: 22.82, lon: 108.37 },
    { adcode: '460000', names: ['海南', '海南省'], short: '海南', city: '海口', lat: 20.04, lon: 110.20 },
    { adcode: '500000', names: ['重庆', '重庆市'], short: '重庆', city: '重庆', lat: 29.56, lon: 106.55 },
    { adcode: '510000', names: ['四川', '四川省'], short: '四川', city: '成都', lat: 30.67, lon: 104.07 },
    { adcode: '520000', names: ['贵州', '贵州省'], short: '贵州', city: '贵阳', lat: 26.65, lon: 106.63 },
    { adcode: '530000', names: ['云南', '云南省'], short: '云南', city: '昆明', lat: 24.88, lon: 102.83 },
    { adcode: '540000', names: ['西藏', '西藏自治区'], short: '西藏', city: '拉萨', lat: 29.65, lon: 91.13 },
    { adcode: '610000', names: ['陕西', '陕西省'], short: '陕西', city: '西安', lat: 34.34, lon: 108.94 },
    { adcode: '620000', names: ['甘肃', '甘肃省'], short: '甘肃', city: '兰州', lat: 36.06, lon: 103.83 },
    { adcode: '630000', names: ['青海', '青海省'], short: '青海', city: '西宁', lat: 36.62, lon: 101.78 },
    { adcode: '640000', names: ['宁夏', '宁夏回族自治区'], short: '宁夏', city: '银川', lat: 38.49, lon: 106.23 },
    { adcode: '650000', names: ['新疆', '新疆维吾尔自治区'], short: '新疆', city: '乌鲁木齐', lat: 43.82, lon: 87.62 },
    { adcode: '710000', names: ['台湾', '台湾省'], short: '台湾', city: '台北', lat: 25.03, lon: 121.56 },
    { adcode: '810000', names: ['香港', '香港特别行政区'], short: '香港', city: '香港', lat: 22.32, lon: 114.17 },
    { adcode: '820000', names: ['澳门', '澳门特别行政区'], short: '澳门', city: '澳门', lat: 22.20, lon: 113.55 }
  ];
  const BY_ADCODE = {};
  PROVINCES.forEach(p => { BY_ADCODE[p.adcode] = p; });

  /* 中国经纬度范围（含南海诸岛留白） */
  const LNG0 = 73.0, LNG1 = 135.6, LAT0 = 15.5, LAT1 = 54.0;
  const MERC = lat => Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);

  /* 温度色带 */
  const STOPS = [[-10, '#2b6cff'], [0, '#3aa0ff'], [10, '#25e0c0'], [18, '#ffd166'], [26, '#ff8a3d'], [36, '#ff2d6e']];

  const state = { geo: null, features: [], data: {}, hover: null, raf: 0, ready: false };

  /* ---------- 工具 ---------- */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mix(c0, c1, k) {
    const a = hexToRgb(c0), b = hexToRgb(c1);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ','
      + Math.round(a[1] + (b[1] - a[1]) * k) + ','
      + Math.round(a[2] + (b[2] - a[2]) * k) + ')';
  }
  function tempColor(t) {
    if (t == null) return null;
    if (t <= STOPS[0][0]) return STOPS[0][1];
    if (t >= STOPS[STOPS.length - 1][0]) return STOPS[STOPS.length - 1][1];
    for (let i = 0; i < STOPS.length - 1; i++) {
      const a = STOPS[i], b = STOPS[i + 1];
      if (t >= a[0] && t <= b[0]) return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
    }
    return STOPS[STOPS.length - 1][1];
  }
  function withAlpha(color, alpha) {
    const rgb = hexToRgb(color);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }
  function isDark() {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  }
  function matchProvince(props) {
    if (!props) return null;
    if (props.adcode != null && BY_ADCODE[String(props.adcode)]) return BY_ADCODE[String(props.adcode)];
    const name = String(props.name || '');
    return PROVINCES.find(p => p.names.indexOf(name) >= 0)
      || PROVINCES.find(p => p.short.length >= 2 && name.indexOf(p.short) >= 0)
      || null;
  }
  function inRings(pt, polys) {
    let inside = false;
    for (let p = 0; p < polys.length; p++) {
      const rings = polys[p];
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        let hit = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
          if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) hit = !hit;
        }
        if (hit) inside = !inside;
      }
    }
    return inside;
  }
  function geomRings(geom) {
    if (!geom) return [];
    if (geom.type === 'Polygon') return [geom.coordinates];
    if (geom.type === 'MultiPolygon') return geom.coordinates;
    return [];
  }

  /* ---------- 绘制 ---------- */
  function draw() {
    const canvas = el('chinaMap');
    if (!canvas || !state.features.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 640;
    const H = canvas.clientHeight || 520;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const pad = 6;
    const fx = lng => pad + (lng - LNG0) / (LNG1 - LNG0) * (W - pad * 2);
    const y0 = MERC(LAT0), y1 = MERC(LAT1);
    const fy = lat => {
      const m = MERC(Math.max(LAT0, Math.min(LAT1, lat)));
      return H - pad - (m - y0) / (y1 - y0) * (H - pad * 2);
    };

    const dark = isDark();
    const strokeBase = dark ? 'rgba(140, 165, 220, 0.38)' : 'rgba(60, 100, 180, 0.32)';
    const textColor = dark ? '#eaf0ff' : '#16203a';
    const emptyFill = dark ? 'rgba(124, 77, 255, 0.10)' : 'rgba(60, 100, 180, 0.08)';
    const fillAlpha = dark ? 0.62 : 0.55;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-1').trim() || '#00e5ff';

    state.features.forEach(f => {
      const rings = geomRings(f.geometry).map(poly =>
        poly.map(ring => ring.map(c => [fx(c[0]), fy(c[1])]))
      );
      f._rings = rings;
      if (!rings.length) return;

      const p = matchProvince(f.properties);
      const d = p ? state.data[p.adcode] : null;
      const hovered = p && state.hover === p.adcode;

      ctx.beginPath();
      rings.forEach(poly => {
        poly.forEach(ring => {
          ring.forEach((pt, i) => { i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); });
          ctx.closePath();
        });
      });
      const color = tempColor(d && d.temp);
      ctx.fillStyle = color ? withAlpha(color, hovered ? Math.min(1, fillAlpha + 0.22) : fillAlpha) : emptyFill;
      ctx.fill('evenodd');
      ctx.lineWidth = hovered ? 2 : 1;
      ctx.strokeStyle = hovered ? accent : strokeBase;
      ctx.stroke();

      /* 温度标注 */
      if (p && d && d.temp != null) {
        const c = f.properties.center || f.properties.centroid;
        const cx = c ? fx(c[0]) : rings[0][0].reduce((s, q) => s + q[0], 0) / rings[0][0].length;
        const cy = c ? fy(c[1]) : rings[0][0].reduce((s, q) => s + q[1], 0) / rings[0][0].length;
        ctx.font = 'bold 11px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = dark ? 'rgba(7, 11, 22, 0.85)' : 'rgba(255, 255, 255, 0.85)';
        ctx.strokeText(d.temp + '°', cx, cy);
        ctx.fillStyle = textColor;
        ctx.fillText(d.temp + '°', cx, cy);
      }
    });
  }

  /* ---------- 悬停浮层 ---------- */
  function sparkline(hourly) {
    if (!hourly || hourly.length < 2) {
      return '<div class="tt-empty">暂无逐小时数据</div>';
    }
    const w = 190, h = 46;
    const ts = hourly.map(x => x.temp);
    const min = Math.min.apply(null, ts);
    const max = Math.max.apply(null, ts);
    const range = (max - min) || 1;
    const sx = i => (i / (hourly.length - 1)) * w;
    const sy = t => h - 3 - ((t - min) / range) * (h - 6);
    const pts = hourly.map((x, i) => sx(i).toFixed(1) + ',' + sy(x.temp).toFixed(1)).join(' ');
    return '<svg class="tt-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">'
      + '<polygon points="0,' + h + ' ' + pts + ' ' + w + ',' + h + '" fill="rgba(0,229,255,0.15)"></polygon>'
      + '<polyline points="' + pts + '" fill="none" stroke="#00e5ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>'
      + '</svg>';
  }

  function showTooltip(p, clientX, clientY) {
    const tip = el('mapTooltip');
    const wrap = el('mapWrap');
    const d = state.data[p.adcode];
    if (d && d.temp != null) {
      const info = W.codeInfo(d.code, d.isDay);
      tip.innerHTML = '<div class="tt-title">' + p.short + '<small>' + p.city + '</small></div>'
        + '<div class="tt-row"><span class="tt-temp">' + d.temp + '°C</span>'
        + '<span class="tt-desc">' + info.icon + ' ' + info.desc + '</span></div>'
        + sparkline(d.hourly)
        + '<div class="tt-axis"><span>现在</span><span>+6h</span><span>+12h</span><span>+18h</span><span>+24h</span></div>';
    } else {
      tip.innerHTML = '<div class="tt-title">' + p.short + '<small>' + p.city + '</small></div>'
        + '<div class="tt-empty">温度数据加载中…</div>';
    }

    const rect = wrap.getBoundingClientRect();
    let x = clientX - rect.left + 14;
    let y = clientY - rect.top + 14;
    tip.classList.add('show');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > rect.width - 6) x = clientX - rect.left - tw - 14;
    if (y + th > rect.height - 6) y = clientY - rect.top - th - 14;
    tip.style.transform = 'translate(' + Math.max(4, x) + 'px, ' + Math.max(4, y) + 'px)';
  }

  function hideTooltip() {
    const tip = el('mapTooltip');
    if (tip) tip.classList.remove('show');
  }

  function hitTest(clientX, clientY) {
    const canvas = el('chinaMap');
    const rect = canvas.getBoundingClientRect();
    const pt = [clientX - rect.left, clientY - rect.top];
    for (let i = state.features.length - 1; i >= 0; i--) {
      const f = state.features[i];
      if (f._rings && inRings(pt, f._rings)) {
        const p = matchProvince(f.properties);
        if (p) return p;
      }
    }
    return null;
  }

  /* ---------- 数据 ---------- */
  async function loadGeo() {
    let lastErr = null;
    for (const url of GEO_SOURCES) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (json && Array.isArray(json.features) && json.features.length) return json;
        throw new Error('GeoJSON 结构异常');
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('无法加载中国地图边界数据');
  }

  async function loadTemperatures() {
    const lats = PROVINCES.map(p => p.lat).join(',');
    const lons = PROVINCES.map(p => p.lon).join(',');
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lats + '&longitude=' + lons
      + '&current=temperature_2m,weather_code,is_day&hourly=temperature_2m'
      + '&timezone=auto&forecast_days=2';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    const arr = Array.isArray(raw) ? raw : [raw];

    arr.forEach((d, idx) => {
      if (!d || d.current == null) return;
      const i = d.location_id != null ? d.location_id : idx;
      const p = PROVINCES[i];
      if (!p) return;
      const times = (d.hourly && d.hourly.time) || [];
      const temps = (d.hourly && d.hourly.temperature_2m) || [];
      const nowIso = String(d.current.time).slice(0, 13) + ':00';
      let start = times.findIndex(t => t >= nowIso);
      if (start < 0) start = 0;
      const hourly = [];
      for (let k = start; k < Math.min(start + 24, times.length); k++) {
        if (temps[k] == null) continue;
        hourly.push({ time: String(times[k]).slice(11, 16), temp: Math.round(temps[k]) });
      }
      state.data[p.adcode] = {
        temp: Math.round(d.current.temperature_2m),
        code: d.current.weather_code,
        isDay: d.current.is_day,
        hourly: hourly
      };
    });
  }

  /* ---------- 事件 ---------- */
  function bind() {
    const canvas = el('chinaMap');
    if (!canvas) return;

    canvas.addEventListener('mousemove', e => {
      if (state.raf) return;
      state.raf = requestAnimationFrame(() => {
        state.raf = 0;
        const p = hitTest(e.clientX, e.clientY);
        const next = p ? p.adcode : null;
        if (next !== state.hover) {
          state.hover = next;
          draw();
        }
        if (p) showTooltip(p, e.clientX, e.clientY);
        else hideTooltip();
      });
    });

    canvas.addEventListener('mouseleave', () => {
      state.hover = null;
      hideTooltip();
      draw();
    });

    canvas.addEventListener('click', e => {
      const p = hitTest(e.clientX, e.clientY);
      if (!p) return;
      if (window.SkyBriefApp && typeof window.SkyBriefApp.setCity === 'function') {
        window.SkyBriefApp.setCity({ name: p.city, lat: p.lat, lon: p.lon });
      }
    });

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(draw, 150);
    });

    if (window.MutationObserver) {
      new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  function buildLegend() {
    const box = el('mapLegend');
    if (!box) return;
    box.innerHTML = '<span>-10°</span><span>0°</span><span class="lg-bar"></span>'
      + '<span>26°</span><span>36°</span><span>（省会城市气温）</span>';
  }

  function setStatus(text, hide) {
    const s = el('mapStatus');
    if (!s) return;
    if (hide) { s.classList.add('hide'); return; }
    s.classList.remove('hide');
    s.textContent = text;
  }

  /* ---------- 启动 ---------- */
  async function init() {
    buildLegend();
    try {
      state.geo = await loadGeo();
      state.features = state.geo.features;
    } catch (e) {
      setStatus('中国地图边界数据加载失败（需要联网获取）。\n其余天气功能不受影响。');
      return;
    }
    state.ready = true;
    setStatus('', true);
    bind();
    draw();

    try {
      await loadTemperatures();
    } catch (e) {
      setStatus('省份气温数据获取失败，地图暂不显示温度。');
    }
    draw();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();