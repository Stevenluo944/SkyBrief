/* SkyBrief 天气数据适配层
 * 统一内部数据模型 + 三个可切换数据源：
 *   1) open-meteo  免密钥、支持 CORS，默认方案，可直接跑通
 *   2) cnweather   中国天气网（需 Referer，须配合 CONFIG.proxy 反向代理）
 *   3) weatherdt   气象数据平台官方接口（按官方文档逆向实现）：
 *        GET http://api.weatherdt.com/common/?area=站号&type=数据大类&key=密钥
 *        数据大类：observe(实况) / forecast(预报) / index(指数) / air(空气质量) / alarm(预警)
 *        key 在用户中心【我的订单-接口详情】获取，通常绑定请求来源 IP/域名
 *        api.weatherdt.com 不返回 CORS 头，浏览器直连会被拦截，须经 CONFIG.proxy
 */
(function (global) {
  'use strict';

  /* ===================== 配置 ===================== */
  const CONFIG = {
    provider: 'open-meteo',
    /* 反向代理前缀（务必以 / 结尾），例如：
     *   'http://localhost:8787/'
     * 同时用于：中国天气网（补 Referer）与气象数据平台 api.weatherdt.com（补 CORS）。
     * 代理由 tools/weather-proxy.mjs 提供，启动：node tools/weather-proxy.mjs */
    proxy: '',
    /* 气象数据平台 weatherdt 配置 */
    weatherdt: {
      key: '',
      api: 'http://api.weatherdt.com'
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

  /* ===================== 气象数据平台 weatherdt 编码表 ===================== */
  /* 天气现象编码 -> [中文名称, emoji]（来源：平台帮助文档「天气现象编码表」） */
  const WDT_WEATHER = {
    '0': ['晴', '☀️'], '1': ['多云', '⛅'], '2': ['阴', '☁️'],
    '3': ['阵雨', '🌦️'], '4': ['雷阵雨', '⛈️'], '5': ['雷阵雨伴有冰雹', '⛈️'],
    '6': ['雨夹雪', '🌨️'], '7': ['小雨', '🌦️'], '8': ['中雨', '🌧️'],
    '9': ['大雨', '🌧️'], '10': ['暴雨', '🌧️'], '11': ['大暴雨', '🌧️'],
    '12': ['特大暴雨', '⛈️'], '13': ['阵雪', '🌨️'], '14': ['小雪', '❄️'],
    '15': ['中雪', '❄️'], '16': ['大雪', '❄️'], '17': ['暴雪', '❄️'],
    '18': ['雾', '🌫️'], '19': ['冻雨', '🌧️'], '20': ['沙尘暴', '🌪️'],
    '21': ['小到中雨', '🌦️'], '22': ['中到大雨', '🌧️'], '23': ['大到暴雨', '🌧️'],
    '24': ['暴雨到大暴雨', '🌧️'], '25': ['大暴雨到特大暴雨', '🌧️'],
    '26': ['小到中雪', '🌨️'], '27': ['中到大雪', '❄️'], '28': ['大到暴雪', '❄️'],
    '29': ['浮尘', '🌫️'], '30': ['扬沙', '🌪️'], '31': ['强沙尘暴', '🌪️'],
    '32': ['浓雾', '🌫️'], '49': ['强浓雾', '🌫️'], '53': ['霾', '🌫️'],
    '54': ['中度霾', '🌫️'], '55': ['重度霾', '🌫️'], '56': ['严重霾', '🌫️'],
    '57': ['大雾', '🌫️'], '58': ['特强浓雾', '🌫️'], '99': ['无', '❓'],
    '301': ['雨', '🌧️'], '302': ['雪', '❄️']
  };
  function wdtWeather(code) {
    const e = WDT_WEATHER[String(code)];
    return e ? { desc: e[0], icon: e[1] } : { desc: '未知', icon: '❓' };
  }

  /* 风向编号表 */
  const WDT_WIND_DIR = ['无持续风向', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风', '北风', '旋转风'];
  function wdtWindDir(code) {
    return WDT_WIND_DIR[parseInt(code, 10)] || '--';
  }

  /* 风力编号表（级） */
  const WDT_WIND_FORCE = ['微风', '3-4级', '4-5级', '5-6级', '6-7级', '7-8级', '8-9级', '9-10级', '10-11级', '11-12级'];
  function wdtWindForce(code) {
    const i = parseInt(code, 10);
    return WDT_WIND_FORCE[i] || (isNaN(i) ? '--' : i + '级');
  }

  /* 接口错误编码表（来源：平台帮助文档） */
  const WDT_ERROR = {
    CC1000: '参数错误', CC1003: '订单已过期', CC1004: '访问次数超限', CC1005: '站点数过多',
    CC1006: '访问接口路径错误', CC1100: '连接超时', CC1101: '密钥错误',
    CC1102: '系统无响应', CC1105: '密钥未授权（可能未绑定当前来源 IP/域名）',
    CC1200: '请求了无效站点', CC1201: '站点或要素过多', CC1300: '请求要素格式错误',
    CC1301: '请求了未定制的数据类型', CC1302: '请求类型定制天数超出', CC1303: '多站点与指数要素过多'
  };

  /* 城市名 -> 统一站号（101010100 式），中国天气网与气象数据平台通用 */
  function matchCnId(name) {
    if (!name) return '';
    if (CN_CITY[name]) return CN_CITY[name];
    const norm = String(name).replace(/[市省县区]/g, '');
    if (CN_CITY[norm]) return CN_CITY[norm];
    for (const k of Object.keys(CN_CITY)) {
      const kn = k.replace(/[市省县区]/g, '');
      if (kn && (String(name).indexOf(kn) >= 0 || kn.indexOf(norm) >= 0)) return CN_CITY[k];
    }
    return '';
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
      return matchCnId(target.name);
    },

    async fetch(target) {
      if (!CONFIG.proxy) {
        throw new Error('中国天气网需配置反向代理（js/weather.js 中 CONFIG.proxy）');
      }
      const id = this.resolveId(target);
      if (!id) throw new Error('未匹配到中国天气网城市ID，请直接输入城市名（如 北京）');

      const base = CONFIG.proxy.replace(/\/?$/, '/');

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

  /* ===================== 数据源 3：气象数据平台 weatherdt =====================
   * 逆向自官方接口文档：
   *   GET {api}/common/?area={站号}&type=observe|forecast&key={密钥}
   *   observe  -> { "<站号>": { "1001002": {002温度,003风力,004风向,005湿度,006降水,007气压,000时间} } }
   *   forecast -> { "24h": { "<站号>": { "1001001": [ {001白天天气,002夜间天气,003白天温度,004夜间温度,005白天风力,007白天风向,006夜间风力,008夜间风向}, ... ], "000":更新时间 } } }
   * key 绑定来源 IP/域名；接口无 CORS 头，浏览器需经 CONFIG.proxy 反向代理。 */
  const weatherdt = {
    id: 'weatherdt',
    label: '气象数据平台',

    search(q) { return cnWeather.search(q); },
    reverse(lat, lon) { return openMeteo.reverse(lat, lon); },

    resolveId(target) {
      if (target.cnId) return target.cnId;
      return matchCnId(target.name);
    },

    buildUrl(id) {
      const api = CONFIG.weatherdt.api.replace(/\/+$/, '');
      const base = CONFIG.proxy ? CONFIG.proxy.replace(/\/?$/, '/') : '';
      return base + api + '/common/?area=' + id
        + '&type=observe%7Cforecast&key=' + encodeURIComponent(CONFIG.weatherdt.key);
    },

    async fetch(target) {
      if (!CONFIG.weatherdt.key) {
        throw new Error('气象数据平台未配置 key：请在 js/weather.js 的 CONFIG.weatherdt.key 填写密钥');
      }
      const id = this.resolveId(target);
      if (!id) throw new Error('未匹配到气象数据平台站号，请直接输入城市名（如 北京）');

      const raw = await fetchText(this.buildUrl(id));
      const text = String(raw).trim();

      const codeErr = /^CC\d+$/.exec(text);
      if (codeErr) throw new Error(WDT_ERROR[codeErr[0]] || ('接口错误 ' + codeErr[0]));

      let data;
      try { data = JSON.parse(text); }
      catch (e) { throw new Error('气象数据平台返回非 JSON 数据：' + text.slice(0, 60)); }

      return parseWeatherdt(data, id, target);
    }
  };

  function parseWeatherdt(data, id, target) {
    /* 实况 observe：站号下第一个数据大类对象 */
    let ob = null;
    const obRoot = data.observe && data.observe[id];
    if (obRoot) ob = obRoot[Object.keys(obRoot)[0]] || null;

    /* 预报 forecast / 24h：站号下第一个数组即逐日数据 */
    const fcRoot = data.forecast && data.forecast['24h'] && data.forecast['24h'][id];
    const fcKey = fcRoot ? Object.keys(fcRoot).find(k => Array.isArray(fcRoot[k])) : null;
    const fcArr = fcKey ? fcRoot[fcKey] : [];

    const dayLabels = ['今天', '明天', '后天'];
    const daily = fcArr.slice(0, 3).map((it, i) => {
      const w = wdtWeather(it['001']);
      return {
        label: dayLabels[i] || ('第' + (i + 1) + '天'),
        date: '',
        code: String(it['001'] || ''),
        desc: w.desc,
        icon: w.icon,
        max: it['003'] != null ? parseInt(it['003'], 10) : null,
        min: it['004'] != null ? parseInt(it['004'], 10) : null,
        precipProb: null,
        windMax: wdtWindForce(it['005'])
      };
    });

    const now = daily[0] || { desc: '', icon: '⛅' };
    const temp = ob && ob['002'] != null ? parseInt(ob['002'], 10) : now.max;
    const hour = new Date().getHours();

    return {
      city: target.name || '',
      provider: '气象数据平台',
      updatedAt: (ob && ob['000']) || (fcRoot && fcRoot['000']) || '--:--',
      current: {
        temp: temp,
        feelsLike: null,
        humidity: ob && ob['005'] != null ? parseInt(ob['005'], 10) : null,
        windSpeed: ob ? wdtWindForce(ob['003']) : null,
        windDir: ob ? wdtWindDir(ob['004']) : '--',
        pressure: ob && ob['007'] != null ? parseInt(ob['007'], 10) : null,
        precip: ob && ob['006'] != null ? parseFloat(ob['006']) : null,
        desc: now.desc || '',
        icon: now.icon || '⛅',
        isDay: (hour >= 6 && hour < 19) ? 1 : 0
      },
      hourly: [],
      daily: daily,
      sun: { sunrise: '--:--', sunset: '--:--' }
    };
  }

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
    matchCnId: matchCnId,
    wdtWeather: wdtWeather,
    wdtWindDir: wdtWindDir,
    wdtWindForce: wdtWindForce,
    parseWeatherdt: parseWeatherdt,
    getWeather(providerId, target) { return pick(providerId).fetch(target); },
    searchCity(providerId, keyword) { return pick(providerId).search(keyword); },
    reverseGeocode(providerId, lat, lon) { return pick(providerId).reverse(lat, lon); }
  };

  global.SkyBriefWeather = API;
})(window);