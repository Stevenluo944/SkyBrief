/* SkyBrief 天气数据适配层
 * 统一内部数据模型 + 三个可切换数据源：
 *   1) open-meteo  免密钥、支持 CORS，默认方案，可直接跑通
 *   2) cnweather   中国天气网（需 Referer，须配合 CONFIG.cn_proxy 反向代理）
 *   3) weatherdt   气象数据平台官方插件（需引入插件脚本并配置 appid）
 */
(function (global) {
  'use strict';

  /* ===================== 配置 ===================== */
  const CONFIG = {
    provider: 'open-meteo',
    /* 中国天气网反向代理前缀（务必以 / 结尾），例如：
     *   'http://localhost:8787/'
     * 代理需转发到 http://www.weather.com.cn/ 并补上 Referer 头。 */
    cn_proxy: '',
    /* 气象数据平台 weatherdt 配置 */
    weatherdt: {
      appid: '',
      token: '',
      api: 'https://api.weatherdt.com'
    }
  };

  /* ===================== WMO 天气代码映射 ===================== */
  const WMO = {
    0:  { d: '晴',           i: '☀️', n: '🌙' },
    1:  { d: '大部晴朗',     i: '🌤️', n: '🌙' },
    2:  { d: '局部多云',     i: '⛅', n: '☁️' },
    3:  { d: '阴',           i: '☁️', n: '☁️' },
    45: { d: '雾',           i: '🌫️' },
    48: { d: '雾凇',         i: '🌫️' },
    51: { d: '小毛毛雨',     i: '🌦️' },
    53: { d: '毛毛雨',       i: '🌦️' },
    55: { d: '大毛毛雨',     i: '🌧️' },
    56: { d: '冻毛毛雨',     i: '🌧️' },
    57: { d: '强冻毛毛雨',   i: '🌧️' },
    61: { d: '小雨',         i: '🌦️' },
    63: { d: '中雨',         i: '🌧️' },
    65: { d: '大雨',         i: '🌧️' },
    66: { d: '冻雨',         i: '🌧️' },
    67: { d: '强冻雨',       i: '🌧️' },
    71: { d: '小雪',         i: '🌨️' },
    73: { d: '中雪',         i: '🌨️' },
    75: { d: '大雪',         i: '❄️' },
    77: { d: '米雪',         i: '🌨️' },
    80: { d: '阵雨',         i: '🌦️' },
    81: { d: '强阵雨',       i: '🌧️' },
    82: { d: '暴雨',         i: '⛈️' },
    85: { d: '阵雪',         i: '🌨️' },
    86: { d: '强阵雪',       i: '❄️' },
    95: { d: '雷阵雨',       i: '⛈️' },
    96: { d: '雷阵雨伴冰雹', i: '⛈️' },
    99: { d: '强雷暴伴冰雹', i: '⛈️' }
  };

  function codeInfo(code, isDay) {
    const e = WMO[code] || { d: '未知', i: '❓' };
    const night = isDay === 0 || isDay === false;
    return { desc: e.d, icon: night && e.n ? e.n : e.i };
  }

  const WIND_DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  function windDirText(deg) {
    if (deg == null || isNaN(deg)) return '--';
    const i = Math.round(((deg % 360 + 360) % 360) / 45) % 8;
    return WIND_DIRS[i] + '风';
  }

  /* 中文天气词 -> emoji（中国天气网解析用） */
  const CN_ICON = [
    [/雷|雹/, '⛈️'], [/雪/, '❄️'], [/雾|霾/, '🌫️'],
    [/大雨|暴雨/, '🌧️'], [/中雨|小雨|雨/, '🌦️'], [/阴/, '☁️'], [/多云/, '⛅'],
    [/晴/, '☀️']
  ];
  function cnIcon(text) {
    for (const [re, ic] of CN_ICON) if (re.test(text)) return ic;
    return '🌡️';
  }

  function fmtHour(iso) {
    if (!iso) return '--:--';
    const t = String(iso);
    const idx = t.indexOf('T');
    return idx >= 0 ? t.slice(idx + 1, idx + 6) : t.slice(-5);
  }

  /* ===================== 请求工具 ===================== */
  async function fetchJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('请求失败 HTTP ' + res.status);
    return res.json();
  }
  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('请求失败 HTTP ' + res.status);
    return res.text();
  }

  /* ===================== 数据源 1：Open-Meteo ===================== */
  const openMeteo = {
    id: 'open-meteo',
    label: 'Open-Meteo',

    async search(q) {
      const url = 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=zh&format=json&name='
        + encodeURIComponent(q);
      const d = await fetchJSON(url);
      return (d.results || []).map(r => ({
        name: r.name,
        sub: [r.admin1, r.country].filter(Boolean).join(' · ') || 'Open-Meteo',
        lat: r.latitude,
        lon: r.longitude
      }));
    },

    async reverse(lat, lon) {
      try {
        const d = await fetchJSON('https://api.bigdatacloud.net/data/reverse-geocode-client'
          + '?localityLanguage=zh&latitude=' + lat + '&longitude=' + lon);
        const name = d.city || d.locality || d.principalSubdivision || '我的位置';
        return {
          name: name,
          sub: [d.principalSubdivision, d.countryName].filter(Boolean).join(' · '),
          lat, lon
        };
      } catch (e) {
        try {
          const d = await fetchJSON('https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=zh-CN'
            + '&lat=' + lat + '&lon=' + lon);
          const a = d.address || {};
          return {
            name: a.city || a.town || a.county || a.state_district || a.state || '我的位置',
            sub: [a.state, a.country].filter(Boolean).join(' · '),
            lat, lon
          };
        } catch (e2) {
          return { name: '我的位置', sub: '定位坐标', lat, lon };
        }
      }
    },

    async fetch(target) {
      const url = 'https://api.open-meteo.com/v1/forecast'
        + '?latitude=' + target.lat + '&longitude=' + target.lon
        + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,'
        + 'weather_code,pressure_msl,wind_speed_10m,wind_direction_10m'
        + '&hourly=temperature_2m,precipitation_probability,weather_code,is_day'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,'
        + 'precipitation_probability_max,wind_speed_10m_max'
        + '&wind_speed_unit=ms&timezone=auto&forecast_days=3';
      const d = await fetchJSON(url);
      const cur = d.current;
      const curInfo = codeInfo(cur.weather_code, cur.is_day);

      const times = d.hourly.time;
      const nowIso = cur.time.slice(0, 13) + ':00';
      let start = times.findIndex(t => t >= nowIso);
      if (start < 0) start = 0;
      const hourly = [];
      for (let i = start; i < Math.min(start + 24, times.length); i++) {
        const c = codeInfo(d.hourly.weather_code[i], d.hourly.is_day[i]);
        hourly.push({
          time: fmtHour(times[i]),
          temp: Math.round(d.hourly.temperature_2m[i]),
          precipProb: d.hourly.precipitation_probability[i] == null ? 0 : d.hourly.precipitation_probability[i],
          code: d.hourly.weather_code[i],
          icon: c.icon,
          desc: c.desc
        });
      }

      const dayLabels = ['今天', '明天', '后天'];
      const daily = [];
      for (let i = 0; i < d.daily.time.length; i++) {
        const c = codeInfo(d.daily.weather_code[i], 1);
        daily.push({
          label: dayLabels[i] || ('第' + (i + 1) + '天'),
          date: String(d.daily.time[i]).slice(5),
          code: d.daily.weather_code[i],
          desc: c.desc,
          icon: c.icon,
          max: Math.round(d.daily.temperature_2m_max[i]),
          min: Math.round(d.daily.temperature_2m_min[i]),
          precipProb: d.daily.precipitation_probability_max[i],
          windMax: Math.round(d.daily.wind_speed_10m_max[i])
        });
      }

      return {
        city: target.name || '我的位置',
        provider: 'Open-Meteo',
        updatedAt: fmtHour(cur.time),
        current: {
          temp: Math.round(cur.temperature_2m),
          feelsLike: Math.round(cur.apparent_temperature),
          humidity: cur.relative_humidity_2m,
          windSpeed: cur.wind_speed_10m,
          windDir: windDirText(cur.wind_direction_10m),
          pressure: Math.round(cur.pressure_msl),
          precip: cur.precipitation,
          desc: curInfo.desc,
          icon: curInfo.icon,
          isDay: cur.is_day
        },
        hourly: hourly,
        daily: daily,
        sun: {
          sunrise: fmtHour(d.daily.sunrise[0]),
          sunset: fmtHour(d.daily.sunset[0])
        }
      };
    }
  };

  /* ===================== 数据源 2：中国天气网 ===================== */
  const CN_CITY = {
    '北京': '101010100', '上海': '101020100', '天津': '101030100', '重庆': '101040100',
    '哈尔滨': '101050101', '长春': '101060101', '沈阳': '101070101', '呼和浩特': '101080101',
    '石家庄': '101090101', '太原': '101100101', '西安': '101110101', '济南': '101120101',
    '乌鲁木齐': '101130101', '拉萨': '101140101', '西宁': '101150101', '兰州': '101160101',
    '银川': '101170101', '郑州': '101180101', '南京': '101190101', '武汉': '101200101',
    '杭州': '101210101', '合肥': '101220101', '福州': '101230101', '南昌': '101240101',
    '长沙': '101250101', '贵阳': '101260101', '成都': '101270101', '广州': '101280101',
    '昆明': '101290101', '南宁': '101300101', '海口': '101310101', '香港': '101320101',
    '澳门': '101330101', '台北': '101340101', '深圳': '101280601', '苏州': '101190401',
    '青岛': '101120201', '大连': '101070201', '厦门': '101230201', '无锡': '101190201',
    '宁波': '101210401', '温州': '101210701', '东莞': '101281601', '珠海': '101280701',
    '佛山': '101280800', '三亚': '101310201', '桂林': '101300501', '洛阳': '101180901'
  };

  function parseCnShtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const lis = doc.querySelectorAll('.t.clearfix li');
    const labels = ['今天', '明天', '后天'];
    const out = [];
    lis.forEach((li, i) => {
      if (i >= 3) return;
      const h1 = li.querySelector('h1');
      const wea = li.querySelector('.wea');
      const tem = li.querySelector('.tem');
      let max = null, min = null;
      if (tem) {
        const nums = (tem.textContent.match(/-?\d+/g) || []).map(Number);
        if (nums.length >= 2) { max = nums[0]; min = nums[1]; }
        else if (nums.length === 1) { max = nums[0]; }
      }
      const desc = wea ? wea.textContent.trim() : '';
      out.push({
        label: labels[i] || ('第' + (i + 1) + '天'),
        date: h1 ? h1.textContent.replace(/日.*/, '').trim() : '',
        desc: desc,
        icon: cnIcon(desc),
        code: null,
        max: max,
        min: min,
        precipProb: null,
        windMax: null
      });
    });
    return out;
  }

  const cnWeather = {
    id: 'cnweather',
    label: '中国天气网',

    async search(q) {
      const hit = Object.keys(CN_CITY).filter(k => k.indexOf(q) >= 0 || q.indexOf(k) >= 0);
      return hit.map(k => ({ name: k, sub: '中国天气网 · 城市ID ' + CN_CITY[k], cnId: CN_CITY[k] }));
    },

    reverse(lat, lon) { return openMeteo.reverse(lat, lon); },

    resolveId(target) {
      if (target.cnId) return target.cnId;
      if (target.name && CN_CITY[target.name]) return CN_CITY[target.name];
      return '';
    },

    async fetch(target) {
      if (!CONFIG.cn_proxy) {
        throw new Error('中国天气网需配置反向代理（js/weather.js 中 CONFIG.cn_proxy）');
      }
      const id = this.resolveId(target);
      if (!id) throw new Error('未匹配到中国天气网城市ID，请直接输入城市名（如 北京）');

      const base = CONFIG.cn_proxy.replace(/\/?$/, '/');

      const skText = await fetchText(base + 'http://www.weather.com.cn/data/sk/' + id + '.html');
      let sk;
      try { sk = JSON.parse(skText).weatherinfo; }
      catch (e) { throw new Error('中国天气网实况解析失败（可能代理未补 Referer）'); }

      let daily = [];
      try {
        const html = await fetchText(base + 'http://www.weather.com.cn/weather/' + id + '.shtml');
        daily = parseCnShtml(html);
      } catch (e) { daily = []; }

      const temp = parseInt(sk.temp, 10);
      const hour = new Date().getHours();
      return {
        city: sk.city || target.name || '未知城市',
        provider: '中国天气网',
        updatedAt: (sk.time || '').slice(11) || '--:--',
        current: {
          temp: isNaN(temp) ? null : temp,
          feelsLike: null,
          humidity: sk.SD || null,
          windSpeed: sk.WS || null,
          windDir: sk.WD || '--',
          pressure: null,
          precip: null,
          desc: (daily[0] && daily[0].desc) || '',
          icon: (daily[0] && daily[0].icon) || '⛅',
          isDay: (hour >= 6 && hour < 19) ? 1 : 0
        },
        hourly: [],
        daily: daily,
        sun: { sunrise: '--:--', sunset: '--:--' }
      };
    }
  };

  /* ===================== 数据源 3：weatherdt 官方插件 ===================== */
  const weatherdt = {
    id: 'weatherdt',
    label: 'weatherdt 插件',

    search(q) { return openMeteo.search(q); },
    reverse(lat, lon) { return openMeteo.reverse(lat, lon); },

    async fetch(target) {
      const plugin = global.weatherdt || global.WD || global.WeatherDT;
      if (!plugin) {
        throw new Error('未检测到 weatherdt 官方插件：请在页面引入插件脚本，或在 js/weather.js 中配置 CONFIG.weatherdt');
      }
      if (!CONFIG.weatherdt.appid) {
        throw new Error('weatherdt 未配置 appid：请填写 CONFIG.weatherdt.appid');
      }
      if (typeof plugin.getData === 'function') {
        return await plugin.getData({
          appid: CONFIG.weatherdt.appid,
          token: CONFIG.weatherdt.token,
          lon: target.lon,
          lat: target.lat,
          city: target.name
        });
      }
      throw new Error('weatherdt 插件缺少 getData 方法，请按其接入文档对接');
    }
  };

  /* ===================== 统一出口 ===================== */
  const PROVIDERS = { 'open-meteo': openMeteo, cnweather: cnWeather, weatherdt: weatherdt };

  function pick(providerId) {
    return PROVIDERS[providerId] || PROVIDERS['open-meteo'];
  }

  const API = {
    CONFIG: CONFIG,
    PROVIDERS: PROVIDERS,
    codeInfo: codeInfo,
    windDirText: windDirText,
    cnIcon: cnIcon,
    getWeather(providerId, target) { return pick(providerId).fetch(target); },
    searchCity(providerId, keyword) { return pick(providerId).search(keyword); },
    reverseGeocode(providerId, lat, lon) { return pick(providerId).reverse(lat, lon); }
  };

  global.SkyBriefWeather = API;
})(window);