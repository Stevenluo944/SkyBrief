// SkyBrief 中国天气网反向代理
// 用途：中国天气网接口带 Referer 校验且不返回 CORS 头，纯静态页面无法直接抓取。
//       本代理为页面转发请求并自动补上 Referer，同时返回 CORS 头。
// 用法：node tools/cn-proxy.mjs   （默认监听 8787）
//       随后把 js/weather.js 中的 CONFIG.cn_proxy 设为 'http://localhost:8787/'
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.PORT || 8787);
const ALLOW_HOST = 'www.weather.com.cn';
const REFERER = 'http://www.weather.com.cn/';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 目标 URL 形如：/http://www.weather.com.cn/data/sk/101010100.html
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

  if (u.hostname !== ALLOW_HOST) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('仅允许代理 ' + ALLOW_HOST);
    return;
  }

  const mod = u.protocol === 'https:' ? https : http;
  const upstream = mod.request({
    hostname: u.hostname,
    path: u.pathname + u.search,
    method: 'GET',
    headers: {
      'Referer': REFERER,
      'User-Agent': 'Mozilla/5.0 (compatible; SkyBrief/1.0)',
      'Accept': '*/*'
    }
  }, upRes => {
    res.writeHead(upRes.statusCode || 502, {
      'Content-Type': upRes.headers['content-type'] || 'text/html; charset=utf-8',
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
  console.log('SkyBrief 中国天气网代理已启动：http://localhost:' + PORT + '/');
  console.log('请将 js/weather.js 中 CONFIG.cn_proxy 设为 "http://localhost:' + PORT + '/"');
});