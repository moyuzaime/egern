'use strict';

const API_URL = 'https://app.10099.com.cn/contact-web/api/busi/qryUserInfo';
const MINI_API_URL = 'https://wx.10099.com.cn/contact-web/api/busi/qryUserInfo';
const ALIPAY_API_URL = 'https://zfb.10099.com.cn/contact-web/api/busi/qryUserInfo';
const SUPPORTED_API_URLS = [API_URL, MINI_API_URL, ALIPAY_API_URL];
const BLOCKED_API_URL = 'https://wx.10099.com.cn/contact-web/api/busi/qryNeedPaperLess';
const KEY = 'ChinaBroadnet';

const C = {
  // 低饱和环境渐变 + 统一中性色玻璃；主题色只用于图标、关键数字和进度。
  fee: '#E28A16',
  flow: '#079ACB',
  voice: '#8B5CF6',
  // 文本色随系统外观自动切换，避免深色模式下深色文字落在深色玻璃上。
  txt: { light: '#172B45', dark: '#F3F7FC' },
  sub: { light: '#586D84', dark: '#B8C7D8' },
  title: '#0F9F91',
  cyan: '#22B8CF',
  violet: '#9B7BFF',
  pink: '#EC6FA7',
  green: '#27A879',
  glass: { light: '#FFFFFFD9', dark: '#263D55D9' },
  glassBorder: { light: '#FFFFFF70', dark: '#FFFFFF25' },
  glassShadow: { light: '#64748B06', dark: '#00000000' },
};

// 测试版采用统一的清透磨砂玻璃，避免不同卡片各自铺色造成视觉杂乱。
const transparentMode = true;

function broadnetBackgroundGradient() {
  if (transparentMode) return undefined;
  return {
    type: 'radial',
    colors: [
      { light: '#BFEAFF', dark: '#193B60' },
      { light: '#E7D9FF', dark: '#3C2E63' },
      { light: '#C8F7E6', dark: '#174D48' },
    ],
    stops: [0, 0.55, 1],
    center: { x: 0.22, y: 0.12 },
    startRadius: 0,
    endRadius: 520,
  };
}

function readRequestBody(ctx) {
  const req = ctx.request || {};

  function parseBody(raw) {
    if (raw == null || raw === '') return null;

    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }

    // Some runtimes expose the body as a byte buffer instead of a string.
    if (typeof raw === 'object') {
      try {
        if (raw.data != null) return raw;
        if (typeof raw.text === 'function') return null;
        if (typeof raw.length === 'number' &&
            (raw instanceof Uint8Array || Object.prototype.toString.call(raw) === '[object Uint8Array]')) {
          let text = '';
          for (let i = 0; i < raw.length; i++) text += String.fromCharCode(raw[i]);
          try {
            return JSON.parse(decodeURIComponent(escape(text)));
          } catch (e) {
            try { return JSON.parse(text); } catch (e2) { return null; }
          }
        }
      } catch (e) {}
      // An empty Request-like object is not the parsed payload. Let json()/text()
      // read the actual body instead of returning {} and masking it.
      try {
        if (Object.keys(raw).length > 0) return raw;
      } catch (e) {}
      return null;
    }

    return null;
  }

  return (async () => {
    // Some Egern runtimes expose req.body as an empty Request-like object while
    // the actual payload is available through req.json() or req.text().
    try {
      const body = parseBody(req.body);
      if (body != null && (typeof body !== 'object' || Object.keys(body).length > 0)) return body;
    } catch (e) {}

    try {
      if (typeof req.json === 'function') {
        const body = await req.json();
        if (body != null) {
          const parsed = parseBody(body);
          if (parsed != null) return parsed;
        }
      }
    } catch (e) {}

    try {
      if (typeof req.text === 'function') {
        const raw = await req.text();
        const body = parseBody(raw);
        if (body != null) return body;
      }
    } catch (e) {}

    try {
      if (typeof $request !== 'undefined' && $request && $request.body != null) {
        const body = parseBody($request.body);
        if (body != null) return body;
      }
    } catch (e) {}

    return null;
  })();
}

function getHeader(headers, name) {
  if (!headers) return '';
  try {
    if (typeof headers.get === 'function') return headers.get(name) || '';
  } catch (e) {}
  try {
    for (const k of Object.keys(headers)) {
      if (String(k).toLowerCase() === name.toLowerCase()) return headers[k] || '';
    }
  } catch (e) {}
  return '';
}

function findValue(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return null;
}

function scanPlanFields(root) {
  const out = [];
  const seen = new Set();
  const words = /(flow|traffic|data|voice|call|quota|total|used|remain|balance|resource|package|plan|usage|limit|free|gprs|fee)/i;

  function walk(v, path, depth) {
    if (depth > 8 || v == null) return;

    if (typeof v === 'object') {
      if (seen.has(v)) return;
      seen.add(v);

      for (const k of Object.keys(v)) {
        const value = v[k];
        const nextPath = path ? path + '.' + k : k;
        const keyHit = words.test(k);

        if (keyHit && (typeof value === 'number' || (typeof value === 'string' && /^-?\\d+(?:\\.\\d+)?$/.test(value.trim())))) {
          out.push({
            path: nextPath,
            key: k,
            value: Number(value),
          });
        }

        if (typeof value === 'object' && value !== null) {
          walk(value, nextPath, depth + 1);
        }
      }
    }
  }

  walk(root, '', 0);
  return out.slice(0, 80);
}

function pickPlanMetric(candidates, kind) {
  const list = candidates || [];
  const re = kind === 'total'
    ? /(total|quota|limit|package|plan|free)/i
    : kind === 'used'
      ? /(used|usage|consume|consumed)/i
      : /(remain|left|balance|available)/i;

  return list.find(x => re.test(x.key) || re.test(x.path)) || null;
}

function calcPlanPercent(total, used, remain) {
  const t = Number(total);
  const u = Number(used);
  const r = Number(remain);

  if (Number.isFinite(t) && t > 0 && Number.isFinite(u) && u >= 0) {
    return Math.max(0, Math.min(1, u / t));
  }
  if (Number.isFinite(t) && t > 0 && Number.isFinite(r) && r >= 0) {
    return Math.max(0, Math.min(1, 1 - r / t));
  }
  return null;
}

function formatFee(v) {
  const n = Number(v);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : '--';
}

function formatFlow(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return { number: '--', unit: 'GB' };

  // 广电 qryUserInfo 的 flowAll / flowUserd / flow 字段单位为 KB。
  // 采用 1024 进制换算，保证总量、已用、剩余及历史记录显示一致。
  const gb = 1024 * 1024;
  const mb = 1024;
  if (n >= gb) return { number: (n / gb).toFixed(2), unit: 'GB' };
  if (n >= mb) return { number: (n / mb).toFixed(2), unit: 'MB' };
  if (n >= 1) return { number: n.toFixed(2), unit: 'KB' };
  return { number: (n * 1024).toFixed(2), unit: 'B' };
}

function formatVoice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(0) : '--';
}

function detectCaptureSource(req) {
  const headers = req && req.headers;
  const hints = [
    getHeader(headers, 'referer'),
    getHeader(headers, 'origin'),
    getHeader(headers, 'user-agent'),
    getHeader(headers, 'x-requested-with'),
  ].join(' ').toLowerCase();

  if (/alipay|alipayclient|alipay\.com|mini\.alipay|my\.alipay/.test(hints)) return '支付宝小程序';
  if (/weixin|micromessenger|wx\.qq\.com|servicewechat/.test(hints)) return '微信小程序';
  return '中国广电 App 或未识别来源';
}

async function capture(ctx) {
  // cbCapture is injected by the module argument into ctx.env. Default to enabled for older installs.
  if (ctx.env && String(ctx.env.cbCapture).toLowerCase() === 'false') {
    console.log('[ChinaBroadnet] 数据抓取已关闭，跳过 HTTP 捕获');
    return;
  }
  const req = ctx.request || {};
  const url = String(req.url || '');
  const method = String(req.method || '').toUpperCase();
  // Ignore this endpoint entirely; the widget must never query it.
  if (url.startsWith(BLOCKED_API_URL)) return;
  // Parse the request body once and reuse it for both probing and capture.
  let parsedBody = null;
  let bodyRead = false;
  const getParsedBody = async () => {
    if (!bodyRead) {
      parsedBody = await readRequestBody(ctx);
      bodyRead = true;
    }
    return parsedBody;
  };

  if (/^https:\/\/(?:app|wx|zfb)\.10099\.com\.cn\//i.test(url)) {
    try {
      const body = await getParsedBody();
      const keys = [];

      function collectKeys(v, depth) {
        if (depth > 5 || v == null || typeof v !== 'object') return;
        for (const k of Object.keys(v)) {
          if (!keys.includes(k)) keys.push(k);
          if (v[k] && typeof v[k] === 'object') collectKeys(v[k], depth + 1);
        }
      }

      collectKeys(body, 0);

      const old = ctx.storage.getJSON(KEY + '.apiProbe') || [];
      const item = {
        ts: Date.now(),
        method,
        url,
        keys: keys.slice(0, 80),
      };

      const next = old.filter(x => !(x.url === url && x.method === method));
      next.push(item);
      ctx.storage.setJSON(KEY + '.apiProbe', next.slice(-60));

      // Log only the shape of the request context; never log header values or body contents.
      let bodyType = body == null ? 'null' : (Array.isArray(body) ? 'array' : typeof body);
      let bodyKeys = [];
      try {
        if (body && typeof body === 'object') bodyKeys = Object.keys(body).slice(0, 30);
      } catch (e) {}
      let requestKeys = [];
      try { requestKeys = Object.keys(req).slice(0, 40); } catch (e) {}
      let headerKeys = [];
      try {
        const hs = req.headers;
        if (hs && typeof hs === 'object') headerKeys = Object.keys(hs).slice(0, 40);
      } catch (e) {}
      let rawBodyType = 'missing';
      try {
        const rawBody = req.body;
        rawBodyType = rawBody == null ? 'null' : (Array.isArray(rawBody) ? 'array' : typeof rawBody);
      } catch (e) {}

      // 只记录是否存在关键字段及 data 的结构，不输出 access 或业务数据本身。
      let hasAccess = false;
      try { hasAccess = !!String(getHeader(req.headers, 'access') || '').trim(); } catch (e) {}
      let dataType = body && body.data == null ? 'missing' : (body && Array.isArray(body.data) ? 'array' : typeof (body && body.data));
      let dataKeys = [];
      let dataLength = 0;
      let dataLooksBase64 = false;
      let dataParsesAsJson = false;
      try {
        if (body && body.data && typeof body.data === 'object') dataKeys = Object.keys(body.data).slice(0, 30);
        if (typeof (body && body.data) === 'string') {
          const dataText = body.data.trim();
          dataLength = dataText.length;
          dataLooksBase64 = dataText.length > 0 &&
            dataText.length % 4 === 0 &&
            /^[A-Za-z0-9+/]+={0,2}$/.test(dataText);
          try { JSON.parse(dataText); dataParsesAsJson = true; } catch (e) {}
        }
      } catch (e) {}

      console.log(
        '[ChinaBroadnet] API侦察[v20261023-2349]: ' +
        method + ' ' + url +
        (keys.length ? ' | keys=' + keys.join(',') : '') +
        ' | bodyType=' + bodyType +
        ' | bodyKeys=' + bodyKeys.join(',') +
        ' | dataType=' + dataType +
        ' | dataKeys=' + dataKeys.join(',') +
        ' | dataLength=' + dataLength +
        ' | dataLooksBase64=' + dataLooksBase64 +
        ' | dataParsesAsJson=' + dataParsesAsJson +
        ' | accessPresent=' + hasAccess +
        ' | rawBodyType=' + rawBodyType +
        ' | requestKeys=' + requestKeys.join(',') +
        ' | headerKeys=' + headerKeys.join(',')
      );
    } catch (e) {
      console.log('[ChinaBroadnet] probe error: ' + e);
    }
  }

  const matchedApi = SUPPORTED_API_URLS.find(api => url.startsWith(api));
  if (!matchedApi) return;
  if (method !== 'POST') return;

  try {
    const access = String(getHeader(req.headers, 'access') || '').trim();
    const body = await getParsedBody();
    if (!access || !body || body.data == null) {
      console.log('[ChinaBroadnet-Hark] 捕获未完成: ' + (!access ? '缺少 access 请求头' : '请求体中缺少 data'));
      return;
    }

    ctx.storage.set(KEY + '.url', url);
    ctx.storage.set(KEY + '.access', access);
    ctx.storage.setJSON(KEY + '.data', body.data);
    ctx.storage.set(KEY + '.captureTime', String(Date.now()));

    // 捕获成功通知独立开关；只提示已捕获并开始查询，不提前声称套餐查询成功。
    if ((!ctx.env || String(ctx.env.cbCaptureNotice).toLowerCase() !== 'false') &&
        typeof ctx.notify === 'function') {
      const source = detectCaptureSource(req);
      ctx.notify({
        title: '中国广电数据捕获成功',
        body: source + '数据捕获成功，正在查询套餐接口',
        sound: false,
      });
    }
  } catch (e) {
    console.log('[ChinaBroadnet-Hark] capture error: ' + e);
  }
}

async function fetchData(ctx, access, data, preferredUrl) {
  // 优先使用捕获到的域名；失败或业务状态异常时自动回退到其他支持的端点。
  const candidates = [preferredUrl, ...SUPPORTED_API_URLS.filter(u => u !== preferredUrl)].filter(Boolean);
  let lastErr = null;

  for (const targetUrl of candidates) {
    if (targetUrl.startsWith(BLOCKED_API_URL)) continue;
    try {
      const resp = await ctx.http.post(targetUrl, {
        timeout: 6000,
        headers: {
          access,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        },
        body: { data },
      });

      if (resp && resp.status >= 200 && resp.status < 300) {
        const json = await resp.json();
        if (json && json.status === '000000') return json;
        lastErr = new Error('API业务状态异常：' + String(json && json.status || 'empty-response'));
      } else {
        lastErr = new Error('HTTP ' + (resp ? resp.status : 'no-response'));
      }
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('所有可用接口更新均失败');
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

function saveHistory(ctx, flow) {
  try {
    const old = ctx.storage.getJSON(KEY + '.history') || [];
    const n = Number(flow);
    if (!Number.isFinite(n)) return old;

    const now = Date.now();
    const next = old.filter(x => now - Number(x.ts) < 7 * 86400000);
    const last = next[next.length - 1];
    if (!last || now - Number(last.ts) >= 25 * 60 * 1000 || Number(last.flowKB) !== n) {
      next.push({ ts: now, flowKB: n });
    }
    const trimmed = next.slice(-24);
    ctx.storage.setJSON(KEY + '.history', trimmed);
    return trimmed;
  } catch (e) {
    return [];
  }
}

async function loadData(ctx, forceRefresh) {
  // 关闭抓取时不再主动请求 qryUserInfo，仅展示最后一次成功缓存。
  if (ctx.env && String(ctx.env.cbCapture).toLowerCase() === 'false') {
    const cached = ctx.storage.getJSON(KEY + '.datasource') || null;
    if (cached) cached.stale = true;
    return { configured: !!cached, data: cached, fromCache: true, captureDisabled: true };
  }
  // 套餐缓存有效期调整为 15 分钟，提升数据实时性。
  const CACHE_TTL = 15 * 60 * 1000;
  const cachedData = ctx.storage.getJSON(KEY + '.datasource') || null;
  const currentCaptureTime = String(ctx.storage.get(KEY + '.captureTime') || '');
  const queriedCaptureTime = String(ctx.storage.get(KEY + '.queriedCaptureTime') || '');
  const cachedAt = Number(cachedData && cachedData.updatedAt || 0);
  const cacheAge = cachedAt > 0 ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;
  const hasNewCapture = currentCaptureTime && currentCaptureTime !== queriedCaptureTime;

  // 15 分钟内且没有新捕获凭据时直接命中新鲜缓存；强制刷新时跳过缓存判断。
  if (!forceRefresh && cachedData && !hasNewCapture && cacheAge >= 0 && cacheAge < CACHE_TTL) {
    cachedData.stale = false;
    return { configured: true, data: cachedData, fromCache: true };
  }

  // 最近 15 秒内已经尝试过请求时先显示旧缓存，避免组件切屏时连续触发。
  const lastAttemptAt = Number(ctx.storage.get(KEY + '.lastAttemptAt') || 0);
  const attemptAge = Date.now() - lastAttemptAt;
  if (!forceRefresh && cachedData && !hasNewCapture && lastAttemptAt > 0 &&
      attemptAge >= 0 && attemptAge < 15000) {
    cachedData.stale = true;
    return { configured: true, data: cachedData, fromCache: true };
  }

  // SWR：缓存过期时先返回旧数据渲染，同时启动一次后台刷新；新捕获凭据则仍立即同步查询。
  if (!forceRefresh && cachedData && !hasNewCapture && cacheAge >= CACHE_TTL) {
    const accessForRefresh = ctx.storage.get(KEY + '.access');
    const dataForRefresh = ctx.storage.getJSON(KEY + '.data');
    if (accessForRefresh && dataForRefresh != null) {
      cachedData.stale = true;
      ctx.storage.set(KEY + '.lastAttemptAt', String(Date.now()));
      loadData(ctx, true).catch(e => {
        console.log('[ChinaBroadnet-Hark] 后台静默刷新异常: ' + e);
      });
      return { configured: true, data: cachedData, fromCache: true };
    }
  }

  const access = ctx.storage.get(KEY + '.access');
  const data = ctx.storage.getJSON(KEY + '.data');
  const url = ctx.storage.get(KEY + '.url') || API_URL;

  if (!access || data == null) {
    return { configured: false, data: null };
  }

  try {
    ctx.storage.set(KEY + '.lastAttemptCaptureTime', currentCaptureTime);
    ctx.storage.set(KEY + '.lastAttemptAt', String(Date.now()));
    const result = await fetchData(ctx, access, data, url);
    // 仅记录响应结构与字段是否存在，不记录手机号、令牌或业务字段原值。
    const responseUser = result && result.data && (result.data.userData || result.data);
    const responseKeys = result && typeof result === 'object' ? Object.keys(result).slice(0, 20) : [];
    const responseDataKeys = result && result.data && typeof result.data === 'object'
      ? Object.keys(result.data).slice(0, 30)
      : [];
    const responseUserKeys = responseUser && typeof responseUser === 'object'
      ? Object.keys(responseUser).filter(k => /^(voice|flow|flowUserd|flowAll|voiceAll|voiceUsed|fee|finBalance|packName)$/.test(k))
      : [];
    console.log(
      '[ChinaBroadnet-Hark] API响应诊断[v20261023-2349]: ' +
      'status=' + String(result && result.status) +
      ' | ok=' + String(result && result.ok) +
      ' | resultKeys=' + responseKeys.join(',') +
      ' | dataType=' + (result && result.data === null ? 'null' : typeof (result && result.data)) +
      ' | dataKeys=' + responseDataKeys.join(',') +
      ' | userDataPresent=' + Boolean(result && result.data && result.data.userData) +
      ' | userDataKeys=' + responseUserKeys.join(',') +
      ' | flowFieldsComplete=' + Boolean(responseUser &&
        responseUser.flowAll != null && responseUser.flowUserd != null && responseUser.flow != null) +
      ' | flowSumMatches=' + Boolean(responseUser &&
        Number(responseUser.flowUserd) + Number(responseUser.flow) === Number(responseUser.flowAll))
    );
    if (!result || result.status !== '000000' || !result.data) {
      const resultKeys = result && typeof result === 'object'
        ? Object.keys(result).slice(0, 20)
        : [];
      const responseDataKeys = result && result.data && typeof result.data === 'object'
        ? Object.keys(result.data).slice(0, 30)
        : [];
      console.log(
        '[ChinaBroadnet-Hark] API响应诊断[v20261019-2318]: ' +
        'resultType=' + (result === null ? 'null' : typeof result) +
        ' | status=' + String(result && result.status).slice(0, 40) +
        ' | message=' + String(result && result.message || '').replace(/[\\r\\n]+/g, ' ').slice(0, 120) +
        ' | updateMes=' + String(result && result.updateMes || '').replace(/[\\r\\n]+/g, ' ').slice(0, 120) +
        ' | ok=' + String(result && result.ok) +
        ' | resultKeys=' + resultKeys.join(',') +
        ' | dataPresent=' + Boolean(result && result.data) +
        ' | dataType=' + (result && result.data === null ? 'null' : typeof (result && result.data)) +
        ' | dataKeys=' + responseDataKeys.join(',')
      );
      throw new Error('API 返回异常');
    }

    const user = result.data.userData || result.data;

    const planFields = scanPlanFields(result.data);
    const totalField = pickPlanMetric(planFields, 'total');
    const usedField = pickPlanMetric(planFields, 'used');
    const remainField = pickPlanMetric(planFields, 'remain');
    const planPercent = calcPlanPercent(
      totalField && totalField.value,
      usedField && usedField.value,
      remainField && remainField.value
    );

    ctx.storage.setJSON(KEY + '.planDebug', {
      capturedAt: Date.now(),
      fields: planFields,
      total: totalField,
      used: usedField,
      remain: remainField,
      percent: planPercent,
    });

    const feeRaw = findValue(user, ['fee', 'balance', 'money', 'remainFee']);
    const flowTotalRaw = findValue(user, ['flowAll']);
    const flowUsedRaw = findValue(user, ['flowUserd']);
    const flowRaw = findValue(user, ['flow', 'remainFlow', 'flowRemain']);
    const voiceTotalRaw = findValue(user, ['voiceAll']);
    const voiceUsedRaw = findValue(user, ['voiceUsed']);
    const voiceRaw = findValue(user, ['voice', 'remainVoice', 'voiceRemain']);

    const flowTotal = flowTotalRaw != null ? Number(flowTotalRaw) : (totalField && /flow/i.test(totalField.path) ? totalField.value : null);
    const flowUsed = flowUsedRaw != null ? Number(flowUsedRaw) : (usedField && /flow/i.test(usedField.path) ? usedField.value : null);
    const flowRemain = flowRaw != null ? Number(flowRaw) : (remainField && /flow/i.test(remainField.path) ? remainField.value : null);
    const voiceTotal = voiceTotalRaw != null ? Number(voiceTotalRaw) : (totalField && /voice/i.test(totalField.path) ? totalField.value : null);
    const voiceUsed = voiceUsedRaw != null ? Number(voiceUsedRaw) : (usedField && /voice/i.test(usedField.path) ? usedField.value : null);
    const voiceRemain = voiceRaw != null ? Number(voiceRaw) : (remainField && /voice/i.test(remainField.path) ? remainField.value : null);

    const flow = formatFlow(flowRemain);
    const flowPercent = calcPlanPercent(flowTotal, flowUsed, flowRemain);
    const voicePercent = calcPlanPercent(voiceTotal, voiceUsed, voiceRemain);
    const history = saveHistory(ctx, flowRemain);

    const ds = {
      stale: false,
      fee: {
        title: '剩余话费',
        number: formatFee(feeRaw),
        unit: '元',
      },
      flow: {
        title: '剩余流量',
        number: flow.number,
        unit: flow.unit,
      },
      voice: {
        title: '剩余语音',
        number: formatVoice(voiceRemain),
        unit: '分钟',
      },
      updatedAt: Date.now(),
      history,
      plan: {
        total: flowTotal,
        used: flowUsed,
        remain: flowRemain,
        percent: flowPercent,
        totalPath: flowTotalRaw != null ? 'userData.flowAll' : (totalField ? totalField.path : null),
        usedPath: flowUsedRaw != null ? 'userData.flowUserd' : (usedField ? usedField.path : null),
        remainPath: flowRaw != null ? 'userData.flow' : (remainField ? remainField.path : null),
        voiceTotal,
        voiceUsed,
        voiceRemain,
        voicePercent,
      },
    };

    ctx.storage.setJSON(KEY + '.datasource', ds);
    if (currentCaptureTime) ctx.storage.set(KEY + '.queriedCaptureTime', currentCaptureTime);

    // 每次新捕获只发送一次完整套餐通知；小组件每分钟刷新不会重复打扰。
    const captureTime = String(ctx.storage.get(KEY + '.captureTime') || '');
    const notifiedCaptureTime = String(ctx.storage.get(KEY + '.notifiedCaptureTime') || '');
    if (captureTime && captureTime !== notifiedCaptureTime) {
      if ((!ctx.env || String(ctx.env.cbPlanNotice).toLowerCase() !== 'false') &&
          typeof ctx.notify === 'function') {
      const totalFlowText = formatFlow(flowTotal);
      const usedFlowText = formatFlow(flowUsed);
      const remainFlowText = formatFlow(flowRemain);
      const body = [
        '剩余话费：¥' + formatFee(feeRaw),
        '流量：已用 ' + usedFlowText.number + ' ' + usedFlowText.unit +
          ' / 总量 ' + totalFlowText.number + ' ' + totalFlowText.unit,
        '剩余流量：' + remainFlowText.number + ' ' + remainFlowText.unit,
        '语音：剩余 ' + formatVoice(voiceRemain) + ' / 总量 ' +
          formatVoice(voiceTotal) + ' 分钟',
      ].join('\n');
      ctx.notify({
        title: '中国广电套餐查询成功',
        body,
        sound: false,
      });
      }
      // 即使关闭通知也标记已处理，避免之后刷新时补发旧捕获的通知。
      ctx.storage.set(KEY + '.notifiedCaptureTime', captureTime);
    }

    // 直接输出接口已确认的套餐字段，避免依赖递归扫描结果而漏掉字段。
    console.log(
      '[ChinaBroadnet-Hark] 套餐字段探测: ' +
      'userData.voice=' + String(user.voice) +
      ', userData.flowUserd=' + String(user.flowUserd) +
      ', userData.voiceAll=' + String(user.voiceAll) +
      ', userData.fee=' + String(user.fee) +
      ', userData.flowAll=' + String(user.flowAll) +
      ', userData.voiceUsed=' + String(user.voiceUsed) +
      ', userData.flow=' + String(user.flow)
    );


    return { configured: true, data: ds, fromCache: false };
  } catch (e) {
    console.log('[ChinaBroadnet-Hark] query error: ' + e);
    return {
      configured: true,
      data: (() => {
        const cached = ctx.storage.getJSON(KEY + '.datasource') || null;
        if (cached) cached.stale = true;
        return cached;
      })(),
      fromCache: true,
    };
  }
}


/* =========================================================
 * 保活模式（schedule 定时任务调用）
 * 触达服务端的同时强制刷新套餐数据，并复用 loadData 的历史记录与存储逻辑
 * ========================================================= */
function parseKeepAliveInterval(value) {
  // 参数只接受正整数，单位固定为分钟；无效输入回退到默认 15 分钟。
  const raw = String(value == null ? '15' : value).trim();
  if (!/^[0-9]+$/.test(raw)) return 15 * 60 * 1000;
  const minutes = Number(raw);
  if (!Number.isSafeInteger(minutes) || minutes <= 0) return 15 * 60 * 1000;
  return Math.max(15 * 60 * 1000, Math.min(24 * 60 * 60 * 1000, minutes * 60 * 1000));
}

/* =========================================================
 * 保活模式（schedule 每分钟触发，由用户输入的易读间隔控制实际执行频率）
 * ========================================================= */
async function handleKeepAlive(ctx) {
  const env = ctx && ctx.env ? ctx.env : {};
  const intervalText = env.cbKeepaliveInterval == null ? '15' : env.cbKeepaliveInterval;
  const intervalMs = parseKeepAliveInterval(intervalText);
  const forceManual = String(env.CB_KEEPALIVE_FORCE || '').toLowerCase() === 'true';
  const lastRun = Number(ctx.storage.get(KEY + '.keepAliveLastRun') || 0);
  const now = Date.now();

  // 定时任务按用户设定的间隔节流；独立手动刷新入口不受此限制。
  if (!forceManual && lastRun && now - lastRun < intervalMs) {
    // 正常的间隔节流属于预期行为，静默跳过，避免 Cron 每分钟重复刷日志。
    return;
  }

  const access = ctx.storage.get(KEY + '.access');
  const data = ctx.storage.getJSON(KEY + '.data');

  if (!access || data == null) {
    console.log('[ChinaBroadnet] 保活/刷新跳过：尚未捕获有效凭据');
    return;
  }

  // 记录本轮尝试时间，避免网络失败时定时任务每分钟重复请求。
  ctx.storage.set(KEY + '.keepAliveLastRun', String(now));

  try {
    const res = await loadData(ctx, true);
    if (res && res.data && !res.data.stale && !res.fromCache) {
      console.log('[ChinaBroadnet] ' + (forceManual ? '手动强制刷新' : '定时保活') +
        '成功：已请求套餐接口并写入最新套餐数据');
    } else {
      console.log('[ChinaBroadnet] ' + (forceManual ? '手动强制刷新' : '定时保活') +
        '已执行，但数据未完全更新；请查看 API 响应诊断日志');
    }
  } catch (e) {
    console.log('[ChinaBroadnet] 保活/刷新请求异常: ' + String(e && e.message || e));
  }
}

function fontSize(size) {
  if (typeof size === 'number') {
    if (size <= 8) return 9;
    if (size <= 10) return 10;
    if (size <= 13) return 12;
    if (size <= 19) return 16;
    return 24;
  }

  const named = {
    caption2: 9,
    caption1: 10,
    footnote: 12,
    body: 16,
    title3: 20,
    title2: 22,
    title: 24,
  };
  return named[size] || 12;
}

function t(text, size, weight, color, extra) {
  return Object.assign({
    type: 'text',
    text: String(text),
    font: { size: fontSize(size), weight: weight || 'regular' },
    textColor: color || C.txt,
    maxLines: 1,
    minScale: 0.6,
  }, extra || {});
}

function glass(children, extra) {
  // 所有尺寸共用单一外层玻璃；此 helper 只负责透明布局，不再绘制内层卡片。
  return Object.assign({
    type: 'stack',
    direction: 'column',
    gap: 6,
    padding: [8, 10],
    borderRadius: 16,
    backgroundColor: { light: '#00000000', dark: '#00000000' },
    borderWidth: 0,
    borderColor: { light: '#00000000', dark: '#00000000' },
    shadowRadius: 0,
    children,
  }, extra || {}, {
    backgroundColor: { light: '#00000000', dark: '#00000000' },
    borderWidth: 0,
    borderColor: { light: '#00000000', dark: '#00000000' },
    shadowRadius: 0,
  });
}

function gaugeSvg(pct, color, w) {
  const stroke = 11;
  const r = (w - stroke) / 2;
  const cx = w / 2;
  const cy = w / 2;
  const h = w / 2 + stroke / 2;
  const p = Math.max(0, Math.min(1, Number(pct) || 0));

  const pt = a => [
    (cx - r * Math.cos(a)).toFixed(2),
    (cy - r * Math.sin(a)).toFixed(2),
  ];

  const [x0, y0] = pt(0);
  const [x1, y1] = pt(Math.PI);
  const [xp, yp] = pt(Math.PI * p);

  let body =
    `<path d='M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}' fill='none' stroke='${color}' stroke-opacity='0.18' stroke-width='${stroke}' stroke-linecap='round'/>`;

  if (p > 0.005) {
    body +=
      `<path d='M ${x0} ${y0} A ${r} ${r} 0 0 1 ${xp} ${yp}' fill='none' stroke='${color}' stroke-width='${stroke}' stroke-linecap='round'/>`;
  }

  return 'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${body}</svg>`
    );
}

function historyDeltaText(history) {
  const vals = (history || []).map(x => Number(x.flowKB)).filter(Number.isFinite);
  if (vals.length < 2) return '采集中';
  const delta = vals[vals.length - 1] - vals[vals.length - 2];
  if (Math.abs(delta) < 1) return '余量基本稳定';
  const f = formatFlow(Math.abs(delta));
  return (delta < 0 ? '较上次减少 ' : '较上次增加 ') + f.number + ' ' + f.unit;
}

function flowStatus(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) {
    return { color: C.flow, label: '套餐用量' };
  }
  const p = Number(pct);
  if (p >= 0.9) return { color: '#C4475B', label: '用量偏高' };
  if (p >= 0.7) return { color: C.fee, label: '注意余量' };
  return { color: C.voice, label: '用量正常' };
}

function trendStrip(ds) {
  const today = todayFlowUsage(ds.history);
  const used = today.value == null ? null : formatFlow(today.value);
  return glass([
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 6,
      children: [
        {
          type: 'image',
          src: historySvg(today.history, C.flow, 100, 30),
          width: 72,
          height: 22,
        },
        {
          type: 'stack',
          direction: 'column',
          alignItems: 'start',
          gap: 1,
          flex: 1,
          children: [
            t('今日流量使用', 9, 'semibold', C.txt),
            t(today.label, 8, 'medium', C.sub, { minScale: 0.65 }),
          ],
        },
        t(used ? used.number + ' ' + used.unit : '采集中', 9, 'bold', C.flow, { minScale: 0.7 }),
      ],
    },
  ], {
    height: 42,
    padding: [5, 8],
    borderRadius: 13,
    gap: 0,
    backgroundColor: transparentMode ? { light: '#00000000', dark: '#00000000' } : { light: '#F8FAFCD9', dark: '#172638D9' },
    borderColor: transparentMode ? { light: '#00000000', dark: '#00000000' } : { light: '#FFFFFFF2', dark: '#D7E7F0B0' },
  });
}

function historySvg(history, color, w, h) {
  const vals = (history || []).map(x => Number(x.flowKB)).filter(Number.isFinite).slice(-12);
  const baseline = h - 2;
  const empty = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'><path d='M 2 ${baseline} H ${w-2}' stroke='${color}' stroke-opacity='.22' stroke-width='1.5' stroke-linecap='round' stroke-dasharray='3 4'/></svg>`;
  if (!vals.length) return 'data:image/svg+xml,' + encodeURIComponent(empty);

  const max = Math.max(1, ...vals);
  const padX = Math.min(3, w * 0.025);
  const gap = Math.max(2, Math.min(5, w * 0.035));
  const count = vals.length;
  const barW = Math.max(2, (w - padX * 2 - gap * (count - 1)) / count);
  const usableH = h - 5;
  const bars = vals.map((v, i) => {
    const bh = Math.max(2, (Math.max(0, v) / max) * usableH);
    const x = padX + i * (barW + gap);
    const y = baseline - bh;
    const opacity = i === count - 1 ? 1 : 0.48 + 0.42 * ((i + 1) / count);
    return `<rect x='${x.toFixed(1)}' y='${y.toFixed(1)}' width='${barW.toFixed(1)}' height='${bh.toFixed(1)}' rx='${Math.min(2, barW / 2).toFixed(1)}' fill='${color}' fill-opacity='${opacity.toFixed(2)}'/>`;
  }).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'><path d='M 1 ${baseline} H ${w-1}' stroke='${color}' stroke-opacity='.12' stroke-width='1'/>${bars}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function heroFlowCard(ds, cardHeight, cardFlex, isMedium) {
  const remain = ds.flow.number + ' ' + ds.flow.unit;
  const total = ds.plan && ds.plan.total != null ? formatFlow(ds.plan.total) : null;
  const used = ds.plan && ds.plan.used != null ? formatFlow(ds.plan.used) : null;
  const compactFlowDetail = !cardHeight
    ? '总量 ' + (total ? total.number + ' ' + total.unit : '--') + ' · 已用 ' + (used ? used.number + ' ' + used.unit : '--')
    : '';
  const p = ds.plan && ds.plan.percent != null ? ds.plan.percent : null;
  const flowStyle = flowStatus(p);
  const flowContent = isMedium
    ? {
        // 中号：左侧显示剩余数值和套餐详情，右侧显示缩小的半圆仪表盘。
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 6,
        children: [
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'start',
            gap: 2,
            flex: 1,
            children: [
              t(remain, cardHeight ? 22 : 19, 'bold', C.txt, { minScale: 0.55 }),
              t(compactFlowDetail || '当前剩余', 8, 'medium', C.sub, { minScale: 0.45 }),
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'center',
            gap: 0,
            children: [
              {
                type: 'image',
                src: gaugeSvg(p != null ? p : 0, flowStyle.color, 68),
                width: 44,
                height: 24,
              },
              t(p != null ? Math.round(p * 100) + '% 已用' : '—', 8, 'bold', flowStyle.color),
            ],
          },
        ],
      }
    : {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 12,
        children: [
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'center',
            gap: -2,
            children: [
              {
                type: 'image',
                src: gaugeSvg(p != null ? p : 0, flowStyle.color, 86),
                width: 64,
                height: 34,
              },
              t(p != null ? Math.round(p * 100) + '% 已用' : '—', 10, 'bold', flowStyle.color),
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'start',
            gap: 1,
            flex: 1,
            children: [
              t(remain, cardHeight ? 23 : 20, 'bold', C.txt, { minScale: 0.55 }),
              t('当前剩余', 9, 'medium', C.sub),
              ...(!cardHeight ? [t(compactFlowDetail, 8, 'medium', C.sub, { minScale: 0.45 })] : []),
            ],
          },
        ],
      };
  return glass([
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 6,
      children: [
        {
          type: 'image',
          src: 'sf-symbol:chart.pie.fill',
          width: 13,
          height: 13,
          color: C.flow,
        },
        t('流量主卡', 10, 'semibold', C.txt),
        { type: 'spacer' },
        t(p != null ? Math.round((1 - p) * 100) + '% 剩余' : '实时套餐', 9, 'semibold', flowStyle.color),
      ],
    },
    flowContent,
  ], {
    width: 0,
    flex: cardFlex || 1,
    ...(cardHeight ? { height: cardHeight, maxWidth: 360 } : {}),
    padding: [8, 10],
    borderRadius: 18,
    gap: 4,
    backgroundColor: transparentMode ? { light: '#00000000', dark: '#00000000' } : { light: '#F8FAFCD9', dark: '#172638D9' },
    borderColor: transparentMode ? { light: '#00000000', dark: '#00000000' } : { light: '#FFFFFFF2', dark: '#D7E7F0B0' },
    shadowColor: { light: '#52677A18', dark: '#00000028' },
    shadowRadius: 0,
    shadowOffset: { x: 0, y: 0 },
  });
}

function header(title, ds, fromCache, mediumInset) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    padding: mediumInset ? [4, 6] : 0,
    gap: 5,
    children: [
      {
        type: 'image',
        src: 'sf-symbol:antenna.radiowaves.left.and.right',
        width: 13,
        height: 13,
        color: C.flow,
      },
      t(title, 'footnote', 'semibold', C.txt),
      { type: 'spacer' },
      t(`${fromCache ? '缓存数据' : '更新'} ${fmtTime(ds.updatedAt)}`, 9, 'medium', C.sub, {
        minScale: 0.8,
      }),
    ],
  };
}

function feeCard(ds) {
  const low = Number(ds.fee.number) < 10;
  return glass([
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 4,
      children: [
        {
          type: 'image',
          src: 'sf-symbol:yensign.circle.fill',
          width: 11,
          height: 11,
          color: low ? '#C4475B' : C.fee,
        },
        t('剩余话费', 9, 'medium', C.sub),
      ],
    },
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'end',
      gap: 2,
      children: [
        t('¥', 13, 'semibold', low ? '#C4475B' : C.fee),
        t(ds.fee.number, 24, 'bold', low ? '#C4475B' : C.txt, {
          minScale: 0.62,
        }),
      ],
    },
  ], {
    alignItems: 'center',
    padding: [7, 8],
    borderRadius: 18,
    height: 70,
    gap: 5,
    backgroundColor: transparentMode ? { light: '#00000000', dark: '#00000000' } : { light: '#F8FAFCD9', dark: '#172638D9' },
    borderColor: transparentMode ? { light: '#00000000', dark: '#00000000' } : { light: '#FFFFFFF2', dark: '#D7E7F0B0' },
  });
}
function dataCard(icon, color, title, value, unit, detail) {
  return glass([
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 3,
      children: [
        { type: 'image', src: 'sf-symbol:' + icon, width: 10, height: 10, color },
        t(title, 9, 'medium', C.sub),
      ],
    },
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'end',
      gap: 2,
      children: [
        t(value, 20, 'bold', C.txt, { minScale: 0.4 }),
        t(unit, 9, 'semibold', C.sub),
      ],
    },
    ...(detail ? [t(detail, 8, 'medium', C.sub, { minScale: 0.6 })] : []),
  ], {
    padding: [7, 8],
    borderRadius: 18,
    height: 70,
    gap: 3,
    backgroundColor: transparentMode ? { light: '#00000000', dark: '#00000000' } : { light: '#F8FAFCD9', dark: '#172638D9' },
    borderColor: transparentMode ? { light: '#00000000', dark: '#00000000' } : { light: '#FFFFFFF2', dark: '#D7E7F0B0' },
  });
}

function buildSmall(title, ds, fromCache) {
  const p = ds.plan && ds.plan.percent != null ? ds.plan.percent : null;
  const flowStyle = flowStatus(p);
  const remain = ds.flow.number + ' ' + ds.flow.unit;
  const used = ds.plan && ds.plan.used != null
    ? formatFlow(ds.plan.used).number + ' ' + formatFlow(ds.plan.used).unit
    : '--';
  const total = ds.plan && ds.plan.total != null
    ? formatFlow(ds.plan.total).number + ' ' + formatFlow(ds.plan.total).unit
    : '--';

  return {
    type: 'widget',
    padding: [13, 13],
    gap: 6,
    backgroundColor: '#00000000',
    refreshAfter: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 5,
        children: [
          {
            type: 'image',
            src: 'sf-symbol:antenna.radiowaves.left.and.right',
            width: 12,
            height: 12,
            color: C.flow,
          },
          t(title, 12, 'semibold', C.txt),
          { type: 'spacer' },
          t(`${fromCache ? '缓存 · ' : ''}${fmtTime(ds.updatedAt)}`, 8, 'medium', C.sub, { minScale: 0.65 }),
        ],
      },

      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 4,
        flex: 1,
        children: [
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'start',
            gap: 2,
            flex: 1,
            children: [
              t('剩余流量', 9, 'medium', C.sub),
              {
                type: 'stack',
                direction: 'row',
                alignItems: 'end',
                gap: 2,
                children: [
                  t(ds.flow.number, 23, 'bold', C.txt, { minScale: 0.35 }),
                  t(ds.flow.unit, 9, 'semibold', C.sub, { minScale: 0.7 }),
                ],
              },
              {
                type: 'stack',
                direction: 'column',
                alignItems: 'start',
                gap: 2,
                children: [
                  t(
                    ds.plan && ds.plan.used != null
                      ? '已用 ' + used
                      : '已用量待确认',
                    8,
                    'semibold',
                    flowStyle.color,
                    { minScale: 0.65 }
                  ),
                  t(
                    ds.plan && ds.plan.total != null
                      ? '总量 ' + total
                      : (ds.plan && ds.plan.remain != null
                        ? '余量 ' + formatFlow(ds.plan.remain).number + ' ' + formatFlow(ds.plan.remain).unit
                        : '总量待确认'),
                    8,
                    'medium',
                    C.sub,
                    { minScale: 0.45 }
                  ),
                ],
              },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'center',
            gap: -2,
            children: [
              {
                type: 'image',
                src: gaugeSvg(p, flowStyle.color, 78),
                width: 44,
                height: 27,
              },
              t(
                p != null ? Math.round(p * 100) + '% 已用' : '套餐',
                8,
                'bold',
                flowStyle.color
              ),
              t(
                (() => {
                  const today = todayFlowUsage(ds.history);
                  return today.value != null
                    ? '今日 ' + formatFlow(today.value).number + formatFlow(today.value).unit
                    : '今日采集中';
                })(),
                8,
                'medium',
                C.sub,
                { minScale: 0.6 }
              ),
            ],
          },
        ],
      },

      {
        type: 'stack',
        direction: 'row',
        gap: 5,
        children: [
          glass([
            { type: 'stack', direction: 'row', alignItems: 'center', gap: 3, children: [
              { type: 'image', src: 'sf-symbol:phone.fill', width: 10, height: 10, color: C.voice },
              t('剩余语音', 8, 'medium', C.sub),
            ]},
            { type: 'stack', direction: 'row', alignItems: 'end', gap: 2, children: [
              t(ds.voice.number === '--' ? '暂无' : ds.voice.number, 18, 'bold', C.txt, { minScale: 0.4 }),
              t(ds.voice.number === '--' ? '' : '分钟', 8, 'semibold', C.sub),
            ]},
          ], { width: 0, flex: 1, height: 48, padding: [7, 7], gap: 4, borderRadius: 15 }),
          glass([
            { type: 'stack', direction: 'row', alignItems: 'center', gap: 3, children: [
              { type: 'image', src: 'sf-symbol:yensign.circle.fill', width: 10, height: 10, color: C.fee },
              t('剩余话费', 8, 'medium', C.sub),
            ]},
            { type: 'stack', direction: 'row', alignItems: 'end', gap: 2, children: [
              t('¥', 10, 'semibold', C.fee),
              t(ds.fee.number, 18, 'bold', C.txt, { minScale: 0.4 }),
            ]},
          ], { width: 0, flex: 1, height: 48, padding: [7, 7], gap: 4, borderRadius: 15 }),
        ],
      }
    ],
  };
}

function buildMedium(title, ds, fromCache) {
  // 中号内容增加内缩留白，避免标题与信息区贴近玻璃卡片边缘。
  const compactFee = glass([
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 4,
      children: [
        {
          type: 'image',
          src: 'sf-symbol:yensign.circle.fill',
          width: 10,
          height: 10,
          color: C.fee,
        },
        t('话费', 9, 'medium', C.sub),
        { type: 'spacer' },
        t('¥' + ds.fee.number, 15, 'bold', C.txt, { minScale: 0.6 }),
      ],
    },
  ], {
    flex: 1,
    padding: [6, 8],
    gap: 1,
    borderRadius: 14,
    justifyContent: 'center',
  });

  const compactVoice = glass([
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'center',
      gap: 4,
      children: [
        {
          type: 'image',
          src: 'sf-symbol:phone.fill',
          width: 10,
          height: 10,
          color: C.voice,
        },
        t('语音', 9, 'medium', C.sub),
        { type: 'spacer' },
        t(ds.voice.number, 15, 'bold', C.txt, { minScale: 0.6 }),
        t('分', 8, 'semibold', C.sub),
      ],
    },

  ], {
    flex: 1,
    padding: [6, 8],
    gap: 1,
    borderRadius: 14,
  });

  const row = {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 5,
    children: [
      heroFlowCard(ds, null, null, true),
      {
        type: 'stack',
        direction: 'column',
        alignItems: 'center',
        gap: 5,
        width: 100,
        children: [
          compactFee,
          compactVoice,
        ],
      },
    ],
  };

  return {
    type: 'widget',
    padding: [12, 14],
    gap: 6,
    backgroundColor: { light: '#F4F7FB', dark: '#161B22' },
    refreshAfter: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    children: [
      header(title, ds, fromCache, true),
      row,
      trendStrip(ds),
    ],
  };
}


function todayFlowUsage(history) {
  const now = new Date();
  const todayKey = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
  const today = (history || [])
    .filter(x => {
      const ts = Number(x.ts);
      if (!Number.isFinite(ts)) return false;
      const d = new Date(ts);
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() === todayKey;
    })
    .sort((a, b) => Number(a.ts) - Number(b.ts));

  if (today.length < 2) {
    return { value: null, history: today, label: '今日数据采集中' };
  }

  const first = Number(today[0].flowKB);
  const last = Number(today[today.length - 1].flowKB);
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return { value: null, history: today, label: '今日数据采集中' };
  }

  const value = Math.max(0, first - last);
  return {
    value,
    history: today.map(x => ({
      ts: x.ts,
      flowKB: Math.max(0, first - Number(x.flowKB)),
    })),
    label: value < 1 ? '今日暂无明显消耗' : '按今日已记录余量变化估算',
  };
}

function buildLarge(title, ds, fromCache) {
  const plan = ds.plan || {};
  const total = plan.total != null ? formatFlow(plan.total) : null;
  const usedFlow = plan.used != null ? formatFlow(plan.used) : null;
  const remain = plan.remain != null ? formatFlow(plan.remain) : null;
  const voicePct = plan.voicePercent != null
    ? Math.max(0, Math.min(1, Number(plan.voicePercent)))
    : null;
  const voiceUsed = plan.voiceUsed != null ? formatVoice(plan.voiceUsed) : null;
  const voiceTotal = plan.voiceTotal != null ? formatVoice(plan.voiceTotal) : null;
  const p = plan.percent != null ? Math.max(0, Math.min(1, Number(plan.percent))) : null;
  const flowStyle = flowStatus(p);
  const today = todayFlowUsage(ds.history);
  const todayUsed = today.value == null ? null : formatFlow(today.value);

  // 大号组件内部只排版内容，不创建子卡片；玻璃背景由 liquidGlassWidget 统一提供。
  return {
    type: 'widget',
    padding: [16, 17],
    gap: 9,
    backgroundColor: '#00000000',
    refreshAfter: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    children: [
      header(title, ds, fromCache),
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 12,
        height: 112,
        children: [
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'start',
            justifyContent: 'center',
            gap: 7,
            flex: 1.25,
            children: [
              {
                type: 'stack',
                direction: 'row',
                alignItems: 'center',
                gap: 5,
                children: [
                  { type: 'image', src: 'sf-symbol:chart.pie.fill', width: 13, height: 13, color: C.flow },
                  t('剩余流量', 10, 'semibold', C.sub),
                  { type: 'spacer' },
                  t(p != null ? Math.round((1 - p) * 100) + '% 剩余' : '套餐流量', 9, 'semibold', flowStyle.color),
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                alignItems: 'end',
                gap: 3,
                children: [
                  t(ds.flow.number, 29, 'bold', C.txt, { minScale: 0.45 }),
                  t(ds.flow.unit, 11, 'semibold', C.sub),
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                gap: 4,
                height: 5,
                children: [
                  {
                    type: 'stack',
                    flex: p == null ? 1 : Math.max(0.03, p),
                    backgroundColor: flowStyle.color,
                    borderRadius: 4,
                    children: [],
                  },
                  {
                    type: 'stack',
                    flex: p == null ? 0.001 : Math.max(0.03, 1 - p),
                    backgroundColor: { light: '#7890A52B', dark: '#FFFFFF2B' },
                    borderRadius: 4,
                    children: [],
                  },
                ],
              },
              t('总量 ' + (total ? total.number + ' ' + total.unit : '--') +
                '  ·  已用 ' + (usedFlow ? usedFlow.number + ' ' + usedFlow.unit : '--'), 9, 'medium', C.sub, { minScale: 0.55 }),
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0,
            width: 90,
            children: [
              { type: 'image', src: gaugeSvg(p, flowStyle.color, 110), width: 76, height: 40 },
              t(p != null ? Math.round(p * 100) + '% 已用' : '用量统计', 9, 'bold', flowStyle.color),
            ],
          },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 10,
        padding: [8, 0],
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: 4,
            flex: 1,
            children: [
              { type: 'stack', direction: 'row', alignItems: 'center', gap: 4, children: [
                { type: 'image', src: 'sf-symbol:yensign.circle.fill', width: 12, height: 12, color: C.fee },
                t('剩余话费', 10, 'medium', C.sub),
              ]},
              { type: 'stack', direction: 'row', alignItems: 'end', gap: 2, children: [
                t('¥' + ds.fee.number, 21, 'bold', C.txt, { minScale: 0.5 }),
                t('元', 9, 'medium', C.sub),
              ]},
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: 4,
            flex: 1,
            children: [
              { type: 'stack', direction: 'row', alignItems: 'center', gap: 4, children: [
                { type: 'image', src: 'sf-symbol:phone.fill', width: 12, height: 12, color: C.voice },
                t('剩余语音', 10, 'medium', C.sub),
              ]},
              { type: 'stack', direction: 'row', alignItems: 'end', gap: 2, children: [
                t(ds.voice.number === '--' ? '暂无' : ds.voice.number, 21, 'bold', C.txt, { minScale: 0.5 }),
                t(ds.voice.number === '--' ? '' : '分钟', 9, 'medium', C.sub),
              ]},
              t(voiceUsed != null && voiceTotal != null
                ? '已用 ' + voiceUsed + ' / ' + voiceTotal + ' 分钟'
                : '套餐分钟明细暂不可用', 8, 'medium', C.sub, { minScale: 0.55 }),
            ],
          },
        ],
      },
      {
        type: 'stack',
        direction: 'column',
        gap: 5,
        padding: [7, 0, 0, 0],
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 4,
            children: [
              { type: 'image', src: 'sf-symbol:chart.bar.fill', width: 10, height: 10, color: C.flow },
              t('今日流量使用', 10, 'semibold', C.txt),
              { type: 'spacer' },
              t(todayUsed ? todayUsed.number + ' ' + todayUsed.unit : '采集中', 10, 'bold', C.flow),
            ],
          },
          {
            type: 'image',
            src: historySvg(today.history.map(x => ({ flowKB: x.flowKB })), C.flow, 270, 38),
            width: 270,
            height: 38,
          },
          t(today.label, 8, 'medium', C.sub),
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 4,
            children: [
              { type: 'image', src: 'sf-symbol:clock', width: 9, height: 9, color: C.sub },
              t((fromCache ? '缓存数据 · ' : '最近更新 · ') + fmtTime(ds.updatedAt), 8, 'medium', C.sub),
              { type: 'spacer' },
              t(fromCache ? '数据可能过期' : '每 1 小时刷新', 8, 'medium', C.sub),
            ],
          },
        ],
      },
    ],
  };
}

function buildLock(title, ds, family) {
  if (family === 'accessoryInline') {
    return {
      type: 'widget',
      children: [
        {
          type: 'text',
          text: `¥${ds.fee.number} · ${ds.flow.number}${ds.flow.unit} · ${ds.voice.number}分`,
          maxLines: 1,
          minScale: 0.6,
        },
      ],
    };
  }

  if (family === 'accessoryCircular') {
    return {
      type: 'widget',
      padding: 7,
      children: [
        { type: 'spacer' },
        {
          type: 'stack',
          direction: 'column',
          alignItems: 'center',
          gap: 0,
          children: [
            {
              type: 'image',
              src: 'sf-symbol:wifi',
              width: 11,
              height: 11,
              color: C.flow,
            },
            t(ds.flow.number, 14, 'bold', C.txt, { minScale: 0.5 }),
            t(ds.flow.unit, 8, 'regular', C.sub),
          ],
        },
        { type: 'spacer' },
      ],
    };
  }

  return {
    type: 'widget',
    padding: [3, 5],
    gap: 2,
    children: [
      t(`话费 ¥${ds.fee.number}`, 'footnote', 'bold', C.fee),
      t(`流量 ${ds.flow.number}${ds.flow.unit} · 语音 ${ds.voice.number}分`, 'caption2', 'semibold', C.txt, {
        minScale: 0.6,
      }),
    ],
  };
}

function liquidGlassWidget(widget) {
  if (!widget || widget.type !== 'widget') return widget;
  // 透明模式下根节点完全透明，避免系统底色覆盖壁纸；内容仍按各自颜色绘制。
  widget.backgroundColor = transparentMode
    ? '#00000000'
    : { light: '#F4F7FB', dark: '#161B22' };
  delete widget.glassContentPadding;
  return widget;
}

function buildError(title, message) {
  return {
    type: 'widget',
    padding: 14,
    gap: 6,
    backgroundColor: transparentMode ? '#00000000' : { light: '#F4F7FB', dark: '#161B22' },
    children: [
      t(title, 'footnote', 'semibold'),
      { type: 'spacer' },
      {
        type: 'image',
        src: 'sf-symbol:exclamationmark.triangle.fill',
        width: 22,
        height: 22,
        color: C.fee,
      },
      t(message, 'caption1', 'medium', C.txt, {
        maxLines: 4,
        minScale: 0.7,
      }),
      { type: 'spacer' },
    ],
  };
}

async function handleWidget(ctx) {
  const result = await loadData(ctx);

  if (!result.configured) {
    return buildError(
      '中国广电',
      '请打开中国广电 App 查询一次，等待自动捕获数据'
    );
  }

  if (!result.data) {
    return buildError(
      '中国广电',
      '查询失败，请重新打开 App 查询一次'
    );
  }

  const family = ctx.widgetFamily || 'systemSmall';

  if (family === 'systemMedium') {
    return liquidGlassWidget(buildMedium('中国广电', result.data, result.fromCache));
  }

  if (family === 'systemLarge' || family === 'systemExtraLarge') {
    return liquidGlassWidget(buildLarge('中国广电', result.data, result.fromCache));
  }

  if (family.startsWith('accessory')) {
    return buildLock('中国广电', result.data, family);
  }

  return liquidGlassWidget(buildSmall('中国广电', result.data, result.fromCache));
}

export default async function(ctx) {
  // 1. HTTP 抓包模式：自动捕获 access 与请求 payload
  if (ctx && ctx.request && ctx.request.url) {
    await capture(ctx);
    return;
  }

  // 2. 定时保活模式：支持 schedule (ctx.cron) 或环境变量开启
  if (ctx && (ctx.cron || (ctx.env && ctx.env.CB_KEEPALIVE === 'true'))) {
    return handleKeepAlive(ctx);
  }

  // 3. Generic Widget 模式：渲染小组件 UI
  try {
    const widget = await handleWidget(ctx || {});
    if (widget && widget.type === 'widget') return widget;
    return buildError('中国广电', '组件返回内容异常，请刷新测试版模块');
  } catch (e) {
    return buildError('中国广电', '组件渲染异常：' + String(e && e.message ? e.message : e).slice(0, 80));
  }
}