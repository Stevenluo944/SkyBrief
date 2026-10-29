// SkyBrief 天气数据通用反向代理
// 解决两点浏览器限制：
//   1) 中国天气网（www.weather.com.cn）接口带 Referer 校验，直连返回 403
//   2) 气象数据平台（api.weatherdt.com）接口不返回 CORS 头，跨域被浏览器拦截
// 用法：node tools/weather-proxy.mjs        （默认监听 8787）
//       随后把 js/weather.js 中的 CONFIG.proxy 设为 'http://localhost:8787/'
//
// 请求约定：把目标完整地址拼在路径后，例如
//   http://localhost:8787/http://api.weatherdt.com/common/?area=101010100&type=observe%7Cforecast&key=xxx
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.PORT || 8787);
const ALLOW_HOSTS = new Set(['www.weather.com.cn', 'api.weatherdt.com']);
const REFERER = 'http://www.weather.com.cn/';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 目标地址形如：/http://api.weatherdt.com/common/?area=...&type=...&key=...
  let target = decodeURIComponent((req.url || '').replace(/^\//, ''));
  if (!/^https?:\/\//i.test(target)) target = 'http://' + target;

  let u;
  try {
    u = new URL(target);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('无效的目标地址');
    return;
  }

  if (!ALLOW_HOSTS.has(u.hostname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('仅允许代理：' + Array.from(ALLOW_HOSTS).join('、'));
    return;
  }

  const path = (u.pathname + u.search).replace(/\|/g, '%7C');
  const mod = u.protocol === 'https:' ? https : http;

  const upstream = mod.request({
    hostname: u.hostname,
    path: path,
    method: 'GET',
    headers: {
      'Referer': REFERER,
      'User-Agent': 'Mozilla/5.0 (compatible; SkyBrief/1.0)',
      'Accept': '*/*'
    }
  }, upRes => {
    res.writeHead(upRes.statusCode || 502, {
      'Content-Type': upRes.headers['content-type'] || 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    upRes.pipe(res);
  });

  upstream.on('error', err => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('代理请求失败：' + err.message);
  });

  upstream.end();
});

server.listen(PORT, () => {
  console.log('SkyBrief 天气代理已启动：http://localhost:' + PORT + '/');
  console.log('可代理域名：' + Array.from(ALLOW_HOSTS).join('、'));
  console.log('请将 js/weather.js 中 CONFIG.proxy 设为 "http://localhost:' + PORT + '/"');
});