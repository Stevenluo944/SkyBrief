/* SkyBrief 交互与渲染层：原生 JS，无框架 */
(function () {
  'use strict';

  const W = window.SkyBriefWeather;
  const el = id => document.getElementById(id);

  const LS = { theme: 'skybrief.theme', provider: 'skybrief.provider', city: 'skybrief.city' };
  const DEFAULT_CITY = { name: '北京', lat: 39.9042, lon: 116.4074 };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    getJSON(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const state = {
    provider: store.get(LS.provider, 'open-meteo'),
    theme: store.get(LS.theme, 'dark'),
    target: null,
    model: null,
    seq: 0,
    suggestItems: [],
    activeSuggest: -1
  };

  /* ===================== 主题 ===================== */
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    const btn = el('themeBtn');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    store.set(LS.theme, theme);
    if (state.model) drawChart(state.model.hourly);
  }

  function toggleTheme() { applyTheme(state.theme === 'dark' ? 'light' : 'dark'); }

  /* ===================== Toast ===================== */
  let toastTimer = null;
  function toast(msg) {
    const t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
  }

  /* ===================== 工具 ===================== */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function num(v, unit) {
    if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return '--';
    return v + (unit || '');
  }
  function show(v) { return (v == null || v === '') ? '--' : v; }

  function statHtml(k, v, unit) {
    return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v
      + (unit ? '<small>' + unit + '</small>' : '') + '</div></div>';
  }

  /* ===================== 渲染 ===================== */
  function setLoading(on) {
    const hero = el('hero');
    if (hero) hero.classList.toggle('loading', on);
    if (on && !state.model) {
      el('heroLoc').textContent = '加载中…';
      el('heroDesc').textContent = '正在获取天气数据';
    }
  }

  function render(model) {
    const cur = model.current || {};

    el('heroLoc').textContent = model.city || '--';
    el('heroBadge').textContent = model.provider || '--';
    el('heroIcon').textContent = cur.icon || '⛅';
    el('heroTemp').textContent = show(cur.temp);
    el('heroDesc').textContent = cur.desc || '--';

    const wind = cur.windSpeed == null ? '--'
      : (typeof cur.windSpeed === 'number' ? (cur.windSpeed + ' m/s') : cur.windSpeed);
    el('heroStats').innerHTML = [
      statHtml('体感温度', show(cur.feelsLike), '°C'),
      statHtml('相对湿度', show(cur.humidity), '%'),
      statHtml('风', wind, cur.windDir && cur.windDir !== '--' ? ' ' + cur.windDir : ''),
      statHtml('气压', show(cur.pressure), 'hPa'),
      statHtml('日出', show(model.sun && model.sun.sunrise), ''),
      statHtml('日落', show(model.sun && model.sun.sunset), '')
    ].join('');

    renderHourStrip(model.hourly || []);
    drawChart(model.hourly || []);
    renderDaily(model.daily || []);

    el('metaProvider').textContent = '数据源：' + (model.provider || '--');
    el('metaTime').textContent = '更新时间：' + (model.updatedAt || '--');
  }

  function renderHourStrip(hourly) {
    const box = el('hourStrip');
    if (!hourly.length) { box.innerHTML = ''; return; }
    box.innerHTML = hourly.map((h, i) => {
      const label = i === 0 ? '现在' : h.time.slice(0, 2) + '时';
      const p = h.precipProb ? '<div class="p">💧' + h.precipProb + '%</div>' : '<div class="p">&nbsp;</div>';
      return '<div class="hour-cell"><div class="h">' + label + '</div>'
        + '<div class="ic">' + h.icon + '</div>'
        + '<div class="t">' + h.temp + '°</div>' + p + '</div>';
    }).join('');
  }

  function renderDaily(daily) {
    const box = el('dailyList');
    if (!daily.length) {
      box.innerHTML = '<div class="day" style="grid-column:1/-1"><div class="d-desc">该数据源暂不提供 3 天预报</div></div>';
      return;
    }
    box.innerHTML = daily.slice(0, 3).map(d => {
      const extra = [];
      if (d.precipProb != null) extra.push('💧 ' + d.precipProb + '%');
      if (d.windMax != null) extra.push('🌬 ' + d.windMax + ' m/s');
      return '<div class="day">'
        + '<div class="d-label">' + d.label + '</div>'
        + '<div class="d-date">' + (d.date || '') + '</div>'
        + '<div class="d-icon">' + (d.icon || '⛅') + '</div>'
        + '<div class="d-desc">' + (d.desc || '--') + '</div>'
        + '<div class="d-temp"><span class="max">' + (d.max == null ? '--' : d.max + '°')
        + '</span><span class="min">' + (d.min == null ? '' : d.min + '°') + '</span></div>'
        + '<div class="d-bar"></div>'
        + (extra.length ? '<div class="d-extra">' + extra.join(' · ') + '</div>' : '')
        + '</div>';
    }).join('');
  }

  /* ===================== Canvas 小时折线图 ===================== */
  function drawChart(hourly) {
    const canvas = el('hourChart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 640;
    const cssH = canvas.clientHeight || parseInt(canvas.getAttribute('height'), 10) || 170;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!hourly || hourly.length < 2) {
      ctx.fillStyle = cssVar('--text-mute');
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('该数据源暂不提供逐小时数据', cssW / 2, cssH / 2);
      return;
    }

    const n = hourly.length;
    const temps = hourly.map(h => h.temp);
    let tmin = Math.min.apply(null, temps);
    let tmax = Math.max.apply(null, temps);
    if (tmax - tmin < 4) { const mid = (tmax + tmin) / 2; tmin = mid - 2; tmax = mid + 2; }

    const padL = 30, padR = 16, padT = 30, padB = 40;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    const X = i => padL + (n <= 1 ? plotW / 2 : plotW * i / (n - 1));
    const Y = t => padT + plotH * (1 - (t - tmin) / (tmax - tmin));

    // 网格 + 温度刻度
    ctx.strokeStyle = cssVar('--grid');
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    const rows = 4;
    for (let r = 0; r <= rows; r++) {
      const yy = padT + plotH * r / rows;
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(cssW - padR, yy);
      ctx.stroke();
      ctx.fillStyle = cssVar('--text-mute');
      ctx.fillText(Math.round(tmax - (tmax - tmin) * r / rows) + '°', 4, yy + 3);
    }

    // 降水概率柱
    const accent2 = cssVar('--accent-2') || '#7c4dff';
    hourly.forEach((h, i) => {
      const p = (h.precipProb || 0) / 100;
      if (p <= 0) return;
      const bh = plotH * 0.30 * p;
      ctx.fillStyle = 'rgba(124, 77, 255, 0.30)';
      ctx.fillRect(X(i) - 3, padT + plotH - bh, 6, bh);
    });

    // 面积填充
    const fill = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    fill.addColorStop(0, 'rgba(0, 229, 255, 0.30)');
    fill.addColorStop(1, 'rgba(0, 229, 255, 0.02)');
    ctx.beginPath();
    hourly.forEach((h, i) => { const px = X(i), py = Y(h.temp); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
    ctx.lineTo(X(n - 1), padT + plotH);
    ctx.lineTo(X(0), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // 折线（霓虹渐变）
    const stroke = ctx.createLinearGradient(padL, 0, cssW - padR, 0);
    stroke.addColorStop(0, cssVar('--accent-1') || '#00e5ff');
    stroke.addColorStop(0.5, accent2);
    stroke.addColorStop(1, cssVar('--accent-3') || '#ff2d95');
    ctx.beginPath();
    hourly.forEach((h, i) => { const px = X(i), py = Y(h.temp); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // 数据点
    hourly.forEach((h, i) => {
      const px = X(i), py = Y(h.temp);
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = cssVar('--bg-2') || '#0d1226';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = accent2;
      ctx.stroke();
    });

    // 温度标签
    const step = n > 16 ? 4 : (n > 10 ? 3 : 2);
    ctx.fillStyle = cssVar('--text-dim');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    hourly.forEach((h, i) => {
      if (i % step === 0 || i === n - 1) ctx.fillText(h.temp + '°', X(i), Y(h.temp) - 9);
    });

    // 时间标签
    ctx.fillStyle = cssVar('--text-mute');
    ctx.font = '10px sans-serif';
    hourly.forEach((h, i) => {
      if (i === 0 || i % step === 0) ctx.fillText(h.time.slice(0, 2) + '时', X(i), cssH - 16);
    });
  }

  /* ===================== 数据加载 ===================== */
  async function ensureCoords(target) {
    if (target && target.lat != null && target.lon != null) return target;
    if (target && target.name) {
      try {
        const list = await W.searchCity(state.provider, target.name);
        if (list && list.length) {
          return { name: list[0].name, sub: list[0].sub, lat: list[0].lat, lon: list[0].lon, cnId: list[0].cnId };
        }
      } catch (e) {}
    }
    return Object.assign({}, DEFAULT_CITY);
  }

  async function load(target, opts) {
    opts = opts || {};
    state.target = target;
    setLoading(true);
    const seq = ++state.seq;
    try {
      const model = await W.getWeather(state.provider, target);
      if (seq !== state.seq) return;
      state.model = model;
      render(model);
      store.setJSON(LS.city, target);
      if (!opts.silent) toast('已更新：' + (model.city || target.name || ''));
    } catch (err) {
      if (seq !== state.seq) return;
      if (state.provider !== 'open-meteo') {
        toast(err.message + '，已回退 Open-Meteo');
        state.provider = 'open-meteo';
        el('providerSel').value = 'open-meteo';
        store.set(LS.provider, 'open-meteo');
        const ft = await ensureCoords(target);
        return load(ft, { silent: true });
      }
      toast('加载失败：' + err.message);
      el('heroDesc').textContent = '加载失败，请稍后重试';
    } finally {
      if (seq === state.seq) setLoading(false);
    }
  }

  /* ===================== 城市搜索 ===================== */
  let searchTimer = null;
  function onSearchInput() {
    const q = el('cityInput').value.trim();
    clearTimeout(searchTimer);
    if (!q) { closeSuggest(); return; }
    searchTimer = setTimeout(async () => {
      try {
        const list = await W.searchCity(state.provider, q);
        renderSuggest(list || []);
      } catch (e) { closeSuggest(); }
    }, 280);
  }

  function renderSuggest(list) {
    const box = el('suggest');
    state.suggestItems = list;
    state.activeSuggest = -1;
    if (!list.length) { box.innerHTML = '<li class="cn" style="cursor:default">未找到城市</li>'; box.classList.add('open'); return; }
    box.innerHTML = list.map((it, i) =>
      '<li data-i="' + i + '"><span>' + it.name + '</span><span class="cn">' + (it.sub || '') + '</span></li>'
    ).join('');
    box.classList.add('open');
  }

  function closeSuggest() { el('suggest').classList.remove('open'); state.activeSuggest = -1; }

  function chooseSuggest(i) {
    const it = state.suggestItems[i];
    if (!it) return;
    closeSuggest();
    el('cityInput').value = '';
    el('cityInput').blur();
    load({ name: it.name, sub: it.sub, lat: it.lat, lon: it.lon, cnId: it.cnId });
  }

  function onSuggestKeydown(e) {
    const box = el('suggest');
    if (!box.classList.contains('open')) return;
    const items = state.suggestItems;
    if (e.key === 'ArrowDown') { state.activeSuggest = Math.min(state.activeSuggest + 1, items.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { state.activeSuggest = Math.max(state.activeSuggest - 1, 0); e.preventDefault(); }
    else if (e.key === 'Enter') { chooseSuggest(state.activeSuggest >= 0 ? state.activeSuggest : 0); e.preventDefault(); return; }
    else if (e.key === 'Escape') { closeSuggest(); return; }
    Array.prototype.forEach.call(box.querySelectorAll('li'), (li, i) => li.classList.toggle('active', i === state.activeSuggest));
  }

  /* ===================== 定位 ===================== */
  function onGeolocate() {
    if (!navigator.geolocation) { toast('当前浏览器不支持定位'); return; }
    toast('正在定位…');
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      try {
        const t = await W.reverseGeocode(state.provider, lat, lon);
        load({ name: t.name || '我的位置', sub: t.sub, lat: lat, lon: lon });
      } catch (e) {
        load({ name: '我的位置', lat: lat, lon: lon });
      }
    }, err => {
      toast('定位失败（' + (err.message || '未知错误') + '），已使用默认城市');
      load(Object.assign({}, DEFAULT_CITY));
    }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 });
  }

  /* ===================== 事件绑定 ===================== */
  function bind() {
    el('themeBtn').addEventListener('click', toggleTheme);
    el('reloadBtn').addEventListener('click', () => {
      if (state.target) load(state.target, { silent: true });
    });
    el('geoBtn').addEventListener('click', onGeolocate);

    el('providerSel').addEventListener('change', async e => {
      state.provider = e.target.value;
      store.set(LS.provider, state.provider);
      toast('已切换数据源：' + state.provider);
      const t = await ensureCoords(state.target || DEFAULT_CITY);
      load(t, { silent: true });
    });

    const input = el('cityInput');
    input.addEventListener('input', onSearchInput);
    input.addEventListener('keydown', onSuggestKeydown);
    input.addEventListener('focus', () => { if (el('suggest').innerHTML) el('suggest').classList.add('open'); });

    const box = el('suggest');
    box.addEventListener('mousedown', e => {
      const li = e.target.closest && e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); chooseSuggest(parseInt(li.getAttribute('data-i'), 10)); }
    });
    document.addEventListener('click', e => { if (!el('search').contains(e.target)) closeSuggest(); });

    let rTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(rTimer);
      rTimer = setTimeout(() => { if (state.model) drawChart(state.model.hourly); }, 160);
    });
  }

  /* ===================== 启动 ===================== */
  function init() {
    applyTheme(state.theme);
    el('providerSel').value = state.provider;
    bind();

    const saved = store.getJSON(LS.city, null);
    if (saved && saved.lat != null && saved.lon != null) {
      load(saved, { silent: true });
    } else {
      onGeolocate();
    }
  }

  /* 供地图模块调用：切换左侧展示的城市 */
  window.SkyBriefApp = {
    setCity(target) { load(target); },
    getState() { return state; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();