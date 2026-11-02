/**
 * 中国联通小组件｜完整移植中国广电正式版 UI（保留现有数据接口）
 *
 * 微信小程序抓取诊断：
 * 1. 在微信打开中国联通小程序并进入流量查询
 * 2. Egern 监听 mxx.client.10010.com 请求并输出脱敏诊断信息
 * 3. 先确认实际请求结构，再适配数据接口；不会把未知接口当作旧 App 接口解析
 *
 * 旧 App 数据接口仍保留：
 * https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven
 */


/* =========================================================
 * 基础配置
 * ========================================================= */

const API_HOST = 'm.client.10010.com';
const MINI_PROGRAM_HOST = 'mxx.client.10010.com';
const KEY = 'unicom';
// 每 25 分钟最多一个采样点，96 个点约覆盖 24 小时，"今日流量使用"才有完整曲线（原来只留 24 个点，不足 10 小时）。
const HISTORY_LIMIT = 96;

const API_URL =
  'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';

// 微信小程序「中国联通」首页大球接口。返回结构与 App 的 queryUserInfoSeven 同构，
// 因此响应体可以直接复用 parseUnicomData 解析（协议来源见 README）。
// 流量明细接口（通用/定向分项）。参考 IBL3ND/module 的做法：App 侧 POST + Cookie 即可，不依赖小程序。
const FLOW_DETAIL_URL =
  'https://m.client.10010.com/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune';

// 明细里按这些容器取子项（容器名参与「免流流量」判定）
const FLOW_CONTAINERS = {
  resources: '通用流量',
  RzbResources: '日租宝',
  MlResources: '免流流量',
  XsbResources: '限时流量',
};

// 定向（免流）判定：命中任一即为定向，其余计入通用
function isDirectionalFlowItem(item, containerName) {
  const code = String((item && item.addupItemCode) || '');
  const name = String((item && item.addUpItemName) || '');
  const fee = String((item && item.feePolicyName) || '');
  return code === '40008' ||
    name === '套餐内专享免费流量' ||
    containerName === '免流流量' ||
    /（免流）|畅视/.test(fee);
}

// 把明细响应整理成组件用的结构（单位 MB）
function parseDetailFlow(body) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  let gR = 0, gT = 0, gU = 0, dR = 0, dT = 0, dU = 0;
  let percent = null;
  let voiceRemain = null;
  let smsRemain = null;

  for (const key of Object.keys(FLOW_CONTAINERS)) {
    const list = body[key];
    if (!Array.isArray(list)) continue;
    for (const res of list) {
      const details = res && res.details;
      if (!Array.isArray(details)) continue;
      for (const item of details) {
        const remain = Math.max(0, num(item && item.remain));
        const total = Math.max(0, num(item && item.total));
        const used = Math.max(0, num(item && item.use));
        if (isDirectionalFlowItem(item, FLOW_CONTAINERS[key])) {
          dR += remain; dT += total; dU += used;
        } else {
          gR += remain; gT += total; gU += used;
        }
        if (percent == null && item && item.usedPercent != null) {
          const p = num(item.usedPercent);
          if (p) percent = Math.min(1, Math.max(0, p / 100));
        }
      }
    }
  }

  for (const res of Array.isArray(body.resources) ? body.resources : []) {
    const type = String((res && res.type) || '').toLowerCase();
    if (type === 'voice' && voiceRemain == null) voiceRemain = num(res.remainResource);
    if (type === 'smslist' && smsRemain == null) smsRemain = num(res.remainResource);
  }

  let otherUsedMB = 0;
  for (const row of body.flowSumList || []) {
    if (String(row && row.flowtype) === '3') otherUsedMB += num(row.xusedvalue);
  }

  const directional = (dR + dT + dU) > 0 ? { usedMB: dU, remainMB: dR, totalMB: dT } : null;
  const percentFromTotals = (gU + dU) > 0 ? Math.min(1, (gU + dU) / Math.max(1, gU + dU + gR + dR)) : null;

  return {
    ts: Date.now(),
    packageName: body.packageName ? String(body.packageName) : '',
    time: body.time ? String(body.time) : '',
    remainMB: gR,
    usedMB: gU,
    totalMB: gT || null,
    percent: percent != null ? percent : percentFromTotals,
    otherUsedMB,
    general: { usedMB: gU, remainMB: gR, totalMB: gT },
    directional,
    voiceRemain,
    smsRemain,
  };
}

// 主动拉一次明细：App 侧 POST，带 Cookie 即可
async function fetchFlowDetail(ctx, cookie) {
  const resp = await ctx.http.post(FLOW_DETAIL_URL, {
    timeout: 5000,
    headers: {
      Cookie: cookie,
      'User-Agent': 'ChinaUnicom.x CFNetwork iOS/16.3',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: '',
    credentials: 'omit',
  });
  if (!resp || resp.status !== 200) throw new Error('HTTP ' + (resp ? resp.status : 'no-response'));
  const body = await resp.json();
  if (!body || String(body.code) !== '0000') throw new Error('code ' + String(body && body.code));
  return parseDetailFlow(body);
}

const MINI_API_PATH = '/wxapplet/weixinNew/';
const MINI_API_BASE = 'https://mina.10010.com' + MINI_API_PATH;
const MINI_SSP_BIGBALL = MINI_API_BASE + 'sspbigball';


/* =========================================================
 * 颜色
 * ========================================================= */


/* =========================================================
 * Cookie / 手机号捕获
 * ========================================================= */

function getRequestHeader(headers, name) {
  if (!headers) return '';

  try {
    if (typeof headers.get === 'function') {
      return headers.get(name) || '';
    }
  } catch (e) {}

  try {
    for (const key of Object.keys(headers)) {
      if (String(key).toLowerCase() === name.toLowerCase()) {
        return headers[key] || '';
      }
    }
  } catch (e) {}

  return '';
}


// App 不同接口用的手机号参数名不一样，这里都试一遍，最后统一按 11 位号码校验，
// 避免把 pageNum / userNum 这类参数误当成手机号。
const PHONE_PARAM_NAMES = ['desmobiel', 'desmobile', 'usermobile', 'mobile', 'phone', 'mobileno', 'userNumber'];

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // 允许 86 前缀、空格和短横线
  const digits = raw.replace(/[\s-]/g, '').replace(/^\+?86/, '');
  return /^1\d{10}$/.test(digits) ? digits : '';
}

function extractPhone(url) {
  if (!url) return '';

  try {
    const query = String(url).split('#')[0].split('?')[1] || '';
    if (!query) return '';
    for (const pair of query.split('&')) {
      const idx = pair.indexOf('=');
      if (idx <= 0) continue;
      const key = pair.slice(0, idx).toLowerCase();
      if (!PHONE_PARAM_NAMES.some(name => name.toLowerCase() === key)) continue;
      let value = pair.slice(idx + 1);
      try {
        value = decodeURIComponent(value);
      } catch (e) {}
      const phone = normalizePhone(value);
      if (phone) return phone;
    }
  } catch (e) {}

  return '';
}


async function fetchUnicomData(
  ctx,
  cookie,
  phone
) {

  const url =
    `${API_URL}?version=iphone_c@10.0100` +
    `&desmobiel=${encodeURIComponent(phone)}` +
    `&showType=0`;

  const resp = await ctx.http.get(
    url,
    {
      timeout: 10000,

      headers: {
        Host: API_HOST,

        'User-Agent':
          'ChinaUnicom.x CFNetwork iOS/16.3',

        Cookie: cookie,
      },

      credentials: 'omit',
    }
  );


  if (!resp || resp.status !== 200) {
    const status = resp ? resp.status : 0;
    const err = new Error(
      `HTTP ${resp ? resp.status : 'no-response'}`
    );
    // 401/403/302 基本意味着登录态失效，需要用户重新抓一次凭据。
    err.kind = status === 401 || status === 403 || status === 302 ? 'auth' : 'http';
    throw err;
  }


  return await resp.json();
}


/* =========================================================
 * 数据解析
 * ========================================================= */

function parseUnicomData(res) {

  if (
    !res ||
    res.code !== 'Y' ||
    !res.feeResource ||
    !res.voiceResource ||
    !res.flowResource
  ) {
    const err = new Error(
      `API 返回异常：${res?.code || 'unknown'}`
    );
    err.kind = 'auth';
    throw err;
  }


  const feeResource =
    res.feeResource;

  const voiceResource =
    res.voiceResource;

  const flowResource =
    res.flowResource;


  return {
    fee: {
      title:
        feeResource.dynamicFeeTitle ||
        '剩余话费',

      value:
        feeResource.feePersent ??
        0,

      unit:
        feeResource.newUnit ||
        '元',
    },

    voice: {
      title:
        voiceResource.dynamicVoiceTitle ||
        '剩余语音',

      value:
        voiceResource.voicePersent ??
        0,

      unit:
        voiceResource.newUnit ||
        '分钟',
    },

    flow: {
      title:
        flowResource.dynamicFlowTitle ||
        '剩余流量',

      value:
        flowResource.flowPersent ??
        0,

      unit:
        flowResource.newUnit ||
        'MB',
    },

    updateTime:
      new Date().toLocaleTimeString(
        'zh-CN',
        {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Shanghai',
        }
      ),

    timestamp: Date.now(),
  };
}


/* =========================================================
 * 加载数据
 * ========================================================= */


function captureDebug(message) {
  try {
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('[ChinaUnicom Capture] ' + message);
    }
  } catch (e) {}
}

async function handleCapture(ctx) {
  const req = ctx.request || {};
  const url = String(req.url || '');
  // 日志只记录路径和布尔状态，绝不输出查询参数、手机号、Cookie 或 Token。
  const safePath = url.split('?')[0].split('#')[0];
  if (ctx.env && String(ctx.env.cuCapture).toLowerCase() === 'false') {
    captureDebug('skip(disabled): cuCapture=false; path=' + safePath);
    return;
  }
  const isAppRequest = url.includes(API_HOST);
  const isMiniProgramRequest = url.includes(MINI_PROGRAM_HOST);
  if (!isAppRequest && !isMiniProgramRequest) {
    captureDebug('skip(host): host mismatch; path=' + safePath);
    return;
  }

  // 微信小程序接口先只做脱敏侦察。未知请求结构不写入旧 App 凭据，也不尝试用旧接口解析。
  if (isMiniProgramRequest) {
    const method = String(req.method || 'unknown').toUpperCase();
    const headers = req.headers || {};
    let headerNames = [];
    try {
      if (typeof headers.keys === 'function') headerNames = Array.from(headers.keys());
      else headerNames = Object.keys(headers);
    } catch (e) {}
    headerNames = headerNames.map(k => String(k).toLowerCase()).sort();
    const body = req.body;
    const bodyType = body === null || body === undefined ? 'empty' : typeof body;
    let bodyLength = 0;
    let bodyKeys = [];
    try {
      if (typeof body === 'string') {
        bodyLength = body.length;
        try {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) bodyKeys = Object.keys(parsed).sort();
        } catch (e) {}
      } else if (body && typeof body === 'object') {
        bodyKeys = Object.keys(body).sort();
        bodyLength = JSON.stringify(body).length;
      }
    } catch (e) {}
    // Do not print request values. This diagnostic is intentionally metadata-only.
    captureDebug('mini-program request: method=' + method +
      '; path=' + safePath +
      '; headerNames=' + headerNames.join(',') +
      '; bodyType=' + bodyType +
      '; bodyLength=' + bodyLength +
      '; bodyKeys=' + bodyKeys.join(','));
    return;
  }

  const cookie = String(getRequestHeader(req.headers, 'cookie') || '').trim();
  const phone = extractPhone(url);

  // App 里大量接口（如 servicequerybusiness/yidingyewu）本来就不带 Cookie 和 desmobiel。
  // 这类请求只留一行日志就退出：既不误弹通知，也不会让日志看起来像报错。
  if (!cookie && !phone) {
    captureDebug('skip(no-creds): path=' + safePath);
    return;
  }

  // 只有套餐查询 / 登录类请求才值得提示「凭据不完整」。
  const planLike = Boolean(phone) ||
    /queryUserInfo|desmobiel|userinfo|login|home\/query/i.test(url);

  captureDebug('triggered: path=' + safePath +
    '; cookiePresent=' + Boolean(cookie) +
    '; phoneParamPresent=' + Boolean(phone) +
    '; planLike=' + planLike);

  let cookieChanged = false;
  let phoneChanged = false;
  if (cookie) {
    const previousCookie = ctx.storage.get('unicom_cookie') || '';
    if (cookie !== previousCookie) {
      ctx.storage.set('unicom_cookie', cookie);
      cookieChanged = true;
    }
  }
  if (phone) {
    const previousPhone = ctx.storage.get('unicom_phone') || '';
    if (phone !== previousPhone) {
      ctx.storage.set('unicom_phone', phone);
      phoneChanged = true;
    }
  }

  if (cookie && phone && (cookieChanged || phoneChanged)) {
    ctx.storage.set('unicom_captureTime', String(Date.now()));
    captureDebug('success: credentials updated; cookieChanged=' + cookieChanged + '; phoneChanged=' + phoneChanged);
    if ((!ctx.env || String(ctx.env.cuCaptureNotice).toLowerCase() !== 'false') && typeof ctx.notify === 'function') {
      const maskedPhone = phone ? '（尾号 ' + phone.slice(-4) + '）' : '';
      ctx.notify({
        title: '中国联通数据捕获成功',
        body: '已捕获登录信息' + maskedPhone + '，正在更新套餐数据',
        sound: false,
      });
    }
    return;
  }

  const captureNoticeEnabled = !ctx.env || String(ctx.env.cuCaptureNotice).toLowerCase() !== 'false';
  const notifyDiagnostic = (status) => {
    if (!captureNoticeEnabled || typeof ctx.notify !== 'function') return;
    // 限频，避免 App 连续请求时反复弹通知；通知内容只包含状态，不包含任何凭据。
    const now = Date.now();
    const last = Number(ctx.storage.get('unicom_captureDiagNotifyAt') || 0);
    if (now - last < 60000) return;
    ctx.storage.set('unicom_captureDiagNotifyAt', String(now));
    ctx.notify({
      title: '中国联通捕获诊断',
      body: '请求脚本已触发；Cookie：' + (cookie ? '已获取' : '缺失') +
        '；手机号参数：' + (phone ? '已获取' : '缺失') +
        '；状态：' + status,
      sound: false,
    });
  };

  if (!cookie || !phone) {
    captureDebug('incomplete: cookiePresent=' + Boolean(cookie) + '; phoneParamPresent=' + Boolean(phone));
    if (planLike) notifyDiagnostic('凭据不完整');
  } else {
    captureDebug('unchanged: credentials already match stored values');
    if (planLike) notifyDiagnostic('凭据未变化');
  }
}
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

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '刚刚';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '刚刚';
  if (totalMin < 60) return totalMin + '分';
  const hours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  if (hours < 24) return hours + '小时' + (remMin > 0 ? remMin + '分' : '');
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return days + '天' + (remHours > 0 ? remHours + '小时' : '');
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

function saveHistory(ctx, flow) {
  try {
    const old = ctx.storage.getJSON(KEY + '.history') || [];
    if (flow == null || flow === '') return old;
    const n = Number(flow);
    if (!Number.isFinite(n)) return old;

    const now = Date.now();
    const next = old.filter(x => now - Number(x.ts) < 7 * 86400000);
    const last = next[next.length - 1];
    if (!last || now - Number(last.ts) >= 25 * 60 * 1000 || Number(last.flowKB) !== n) {
      next.push({ ts: now, flowKB: n });
    }
    const trimmed = next.slice(-HISTORY_LIMIT);
    if (JSON.stringify(trimmed) !== JSON.stringify(old)) {
      ctx.storage.setJSON(KEY + '.history', trimmed);
    }
    return trimmed;
  } catch (e) {
    return [];
  }
}


function calcPlanPercent(total, used, remain) {
  const t = Number(total), u = Number(used), r = Number(remain);
  if (Number.isFinite(t) && t > 0 && Number.isFinite(u) && u >= 0) return Math.max(0, Math.min(1, u / t));
  if (Number.isFinite(t) && t > 0 && Number.isFinite(r) && r >= 0) return Math.max(0, Math.min(1, 1 - r / t));
  return null;
}
function formatFlow(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return { number: '--', unit: 'GB' };
  if (n >= 1024 * 1024) return { number: (n / (1024 * 1024)).toFixed(2), unit: 'GB' };
  if (n >= 1024) return { number: (n / 1024).toFixed(2), unit: 'MB' };
  if (n >= 1) return { number: n.toFixed(2), unit: 'KB' };
  return { number: (n * 1024).toFixed(2), unit: 'B' };
}
function formatVoice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(0) : '--';
}

/* 联通数据加载：保留联通 API，并增加历史趋势与广电组件同款数据结构 */
function numericResourceValue(resource, keys) {
  if (!resource || typeof resource !== 'object') return null;
  for (const key of keys) {
    const v = resource[key];
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}
// App 接口与小程序接口返回同样的 feeResource/flowResource/voiceResource，
// 这里统一换算成小组件使用的数据结构。
function buildDataSource(ctx, parsed, raw, captureDuration) {
  const flowResource = raw.flowResource || {};
  const voiceResource = raw.voiceResource || {};
  const flowTotalRaw = numericResourceValue(flowResource, ['flowTotal', 'flowAll', 'totalFlow', 'total', 'totalValue', 'resourceTotal', 'sumValue']);
  const flowUsedRaw = numericResourceValue(flowResource, ['flowUsed', 'flowUserd', 'usedFlow', 'used', 'usedValue', 'consumeValue', 'usedResource']);
  const voiceTotal = numericResourceValue(voiceResource, ['voiceTotal', 'voiceAll', 'totalVoice', 'total', 'totalValue', 'resourceTotal', 'sumValue']);
  const voiceUsed = numericResourceValue(voiceResource, ['voiceUsed', 'usedVoice', 'voiceUserd', 'used', 'usedValue', 'consumeValue', 'usedResource']);

  const unit = String(parsed.flow.unit || 'MB').toUpperCase();
  const flowToKB = n => {
    const v = Number(n);
    if (!Number.isFinite(v)) return null;
    if (unit === 'GB') return v * 1024 * 1024;
    if (unit === 'KB') return v;
    if (unit === 'B') return v / 1024;
    return v * 1024;
  };
  const remainKB = flowToKB(parsed.flow.value);
  const totalKB = flowTotalRaw == null ? null : flowToKB(flowTotalRaw);
  const usedKB = flowUsedRaw == null ? null : flowToKB(flowUsedRaw);
  const history = saveHistory(ctx, remainKB);
  const flowDisplay = formatFlow(remainKB);
  const ds = {
    stale: false,
    fee: { title: '剩余话费', number: Number(parsed.fee.value).toFixed(2), unit: '元' },
    flow: { title: '剩余流量', number: flowDisplay.number, unit: flowDisplay.unit },
    voice: { title: '剩余语音', number: String(parsed.voice.value), unit: parsed.voice.unit || '分钟' },
    updatedAt: Date.now(),
    captureDuration: captureDuration || '',
    history,
    plan: {
      total: totalKB, used: usedKB, remain: remainKB,
      percent: calcPlanPercent(totalKB, usedKB, remainKB),
      totalPath: flowTotalRaw == null ? null : 'flowResource',
      usedPath: flowUsedRaw == null ? null : 'flowResource',
      voiceTotal, voiceUsed, voiceRemain: Number(parsed.voice.value),
      voicePercent: calcPlanPercent(voiceTotal, voiceUsed, Number(parsed.voice.value)),
    },
  };
  return { ds, flowDisplay };
}

async function loadData(ctx) {
  const captureDisabled = !!(ctx.env && String(ctx.env.cuCapture).toLowerCase() === 'false');
  const readCache = () => {
    const cached = ctx.storage.getJSON('unicom_datasource') || null;
    if (!cached) return null;
    cached.stale = true;
    // 连续两次鉴权失败才提示，避免接口偶发异常时误报。
    cached.authFailed = Number(ctx.storage.get('unicom_authFail') || 0) >= 2;
    const ts = Number(ctx.storage.get('unicom_captureTime') || 0);
    cached.captureDuration = ts > 0 ? formatDuration(Date.now() - ts) : '';
    return cached;
  };

  if (captureDisabled) {
    const cached = readCache();
    return { data: cached, configured: !!cached, error: null, fromCache: true };
  }

  // 主屏 / 锁屏 / 画廊可能在同一轮里各自渲染一次，45 秒内复用同一份数据，避免重复打接口被风控。
  const fresh = ctx.storage.getJSON('unicom_datasource') || null;
  if (fresh && Number(fresh.updatedAt || 0) > 0 && Date.now() - Number(fresh.updatedAt) < 45000) {
    const ts = Number(ctx.storage.get('unicom_captureTime') || 0);
    fresh.captureDuration = ts > 0 ? formatDuration(Date.now() - ts) : '';
    return { data: fresh, configured: true, error: null, fromCache: false };
  }

  const captureTs = Number(ctx.storage.get('unicom_captureTime') || 0);
  const captureDuration = captureTs > 0 ? formatDuration(Date.now() - captureTs) : '';
  const cookie = ctx.storage.get('unicom_cookie') || '';
  const phone = ctx.storage.get('unicom_phone') || '';
  if (!cookie || !phone) {
    // 只做过微信小程序抓取（没有 App 凭据）时，直接用已缓存的小程序数据。
    const cached = readCache();
    if (cached) return { data: cached, configured: true, error: null, fromCache: true };
    return { data: null, configured: false, error: null, fromCache: false };
  }

  try {
    const raw = await fetchUnicomData(ctx, cookie, phone);
    const parsed = parseUnicomData(raw);
    const { ds, flowDisplay } = buildDataSource(ctx, parsed, raw, captureDuration);
    ctx.storage.setJSON('unicom_datasource', ds);
    ctx.storage.delete('unicom_authFail');
    // 流量明细（通用/定向分项）：15 分钟内不重复拉，失败静默降级
    try {
      const prevDetail = ctx.storage.getJSON('unicom_flowdetail');
      if (!prevDetail || !prevDetail.ts || Date.now() - Number(prevDetail.ts) > 15 * 60 * 1000) {
        ctx.storage.setJSON('unicom_flowdetail', await fetchFlowDetail(ctx, cookie));
      }
    } catch (e) {
      console.log('[ChinaUnicom] 流量明细获取失败: ' + String((e && e.message) || e));
    }
    const captureTime = String(ctx.storage.get('unicom_captureTime') || '');
    const notifiedCaptureTime = String(ctx.storage.get('unicom_notifiedCaptureTime') || '');
    if (captureTime && captureTime !== notifiedCaptureTime) {
      if ((!ctx.env || String(ctx.env.cuPlanNotice).toLowerCase() !== 'false') && typeof ctx.notify === 'function') {
        ctx.notify({
          title: '中国联通套餐查询成功',
          body: [
            '剩余话费：¥' + ds.fee.number,
            '剩余流量：' + flowDisplay.number + ' ' + flowDisplay.unit,
            '剩余语音：' + ds.voice.number + ' 分钟',
          ].join('\n'),
          sound: false,
        });
      }
      ctx.storage.set('unicom_notifiedCaptureTime', captureTime);
    }
    return { data: ds, configured: true, error: null, fromCache: false };
  } catch (e) {
    if (e && e.kind === 'auth') {
      ctx.storage.set('unicom_authFail', String(Number(ctx.storage.get('unicom_authFail') || 0) + 1));
    }
    return { data: readCache(), configured: true, error: e, fromCache: true };
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

const NO_COLOR = { light: '#00000000', dark: '#00000000' };

function glass(children, extra) {
  // 所有尺寸共用单一外层玻璃；此 helper 只负责透明布局，不再绘制内层卡片。
  // 透明值只作为默认值：调用方显式传入的样式仍然生效（原实现会写死覆盖）。
  return Object.assign({
    type: 'stack',
    direction: 'column',
    gap: 6,
    padding: [8, 10],
    borderRadius: 16,
    backgroundColor: NO_COLOR,
    borderWidth: 0,
    borderColor: NO_COLOR,
    shadowRadius: 0,
    children,
  }, extra || {});
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
    ? '总量 ' + (total ? total.number + ' ' + total.unit : '--') + ' · 已用 ' + (used ? used.number + ' ' + used.unit : '--') +
      (ds.directional && ds.directional.remain
        ? ' · 定向 ' + ds.directional.remain.number + ' ' + ds.directional.remain.unit
        : '')
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
        t(ds.packageName || '流量主卡', 10, 'semibold', C.txt),
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
    shadowColor: { light: '#52677A18', dark: '#00000028' },
    shadowRadius: 0,
    shadowOffset: { x: 0, y: 0 },
  });
}

function header(title, ds, fromCache, mediumInset) {
  const dur = ds.captureDuration ? ' · 凭据保持 ' + ds.captureDuration : '';
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
      t(`${fromCache ? '缓存数据' : '更新'} ${fmtTime(ds.updatedAt)}${dur}${ds.authFailed ? ' · 凭据待更新' : ''}`, 9, 'medium', C.sub, {
        minScale: 0.8,
      }),
    ],
  };
}

function buildSmall(title, ds, fromCache) {
  const p = ds.plan && ds.plan.percent != null ? ds.plan.percent : null;
  const flowStyle = flowStatus(p);
  const remain = ds.flow.number + ' ' + ds.flow.unit;
  const usedFlow = ds.plan && ds.plan.used != null ? formatFlow(ds.plan.used) : null;
  const totalFlow = ds.plan && ds.plan.total != null ? formatFlow(ds.plan.total) : null;
  const used = usedFlow ? usedFlow.number + ' ' + usedFlow.unit : '--';
  const total = totalFlow ? totalFlow.number + ' ' + totalFlow.unit : '--';

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
          t(`${fromCache ? '缓存 · ' : ''}${fmtTime(ds.updatedAt)}${ds.authFailed ? ' · 凭据待更新' : (ds.captureDuration ? ' · ' + ds.captureDuration : '')}`, 8, 'medium', C.sub, { minScale: 0.5 }),
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
              t(ds.flow && ds.flow.title ? ds.flow.title : '剩余流量', 9, 'medium', C.sub),
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
              t(ds.account && ds.account.balance != null ? '账户余额' : '剩余话费', 8, 'medium', C.sub),
            ]},
            { type: 'stack', direction: 'row', alignItems: 'end', gap: 2, children: [
              t('¥', 10, 'semibold', C.fee),
              t(ds.fee.number, 18, 'bold', C.txt, { minScale: 0.4 }),
              ...(ds.account && ds.account.monthCost != null
                ? [t('本月 ' + Number(ds.account.monthCost).toFixed(2), 7, 'medium', C.sub, { minScale: 0.5 })]
                : []),
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
        t(ds.account && ds.account.balance != null ? '余额' : '话费', 9, 'medium', C.sub),
        { type: 'spacer' },
        {
          type: 'stack',
          direction: 'column',
          alignItems: 'end',
          gap: 0,
          children: [
            t('¥' + ds.fee.number, 15, 'bold', C.txt, { minScale: 0.6 }),
            ...(ds.account && ds.account.monthCost != null
              ? [t('本月 ' + Number(ds.account.monthCost).toFixed(2), 7, 'medium', C.sub, { minScale: 0.5 })]
              : []),
          ],
        },
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
                  t(ds.flow && ds.flow.title ? ds.flow.title : '剩余流量', 10, 'semibold', C.sub),
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
                '  ·  已用 ' + (usedFlow ? usedFlow.number + ' ' + usedFlow.unit : '--') +
                (ds.otherUsedMB != null
                  ? '  ·  其他 ' + formatFlow(ds.otherUsedMB * 1024).number + ' ' + formatFlow(ds.otherUsedMB * 1024).unit
                  : ''), 9, 'medium', C.sub, { minScale: 0.55 }),
              ...(ds.directional && (ds.directional.remain || ds.directional.used)
                ? [t('定向流量 ' + (ds.directional.remain ? '剩余 ' + ds.directional.remain.number + ' ' + ds.directional.remain.unit : '') +
                    (ds.directional.used ? (ds.directional.remain ? ' · ' : '') + '已用 ' + ds.directional.used.number + ' ' + ds.directional.used.unit : ''), 8, 'medium', C.sub, { minScale: 0.6 })]
                : []),
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
                t(ds.account && ds.account.balance != null ? '账户余额' : '剩余话费', 10, 'medium', C.sub),
              ]},
              { type: 'stack', direction: 'row', alignItems: 'end', gap: 2, children: [
                t('¥' + ds.fee.number, 21, 'bold', C.txt, { minScale: 0.5 }),
                t('元', 9, 'medium', C.sub),
              ]},
              ...(ds.account && ds.account.monthCost != null
                ? [t('本月 ¥' + Number(ds.account.monthCost).toFixed(2), 8, 'medium', C.sub, { minScale: 0.6 })]
                : []),
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
              ...(voiceUsed != null && voiceTotal != null
                ? [t('已用 ' + voiceUsed + ' / ' + voiceTotal + ' 分钟', 8, 'medium', C.sub, { minScale: 0.55 })]
                : []),
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
              t(ds.captureDuration ? '凭据已保持 ' + ds.captureDuration : (fromCache ? '数据可能过期' : '定时保活中'), 8, 'medium', C.sub),
            ],
          },
          ...(ds.account && ds.account.balance != null
            ? [{
                type: 'stack',
                direction: 'row',
                alignItems: 'center',
                gap: 4,
                children: [
                  { type: 'image', src: 'sf-symbol:wallet.pass.fill', width: 9, height: 9, color: C.fee },
                  t('余额 ¥' + Number(ds.account.balance).toFixed(2), 8, 'semibold', C.sub),
                  t('· 结转 ¥' + (ds.account.carryOver != null ? Number(ds.account.carryOver).toFixed(2) : '--'), 8, 'medium', C.sub),
                  { type: 'spacer' },
                  ds.account.owed != null && Number(ds.account.owed) > 0
                    ? t('欠费 ¥' + Number(ds.account.owed).toFixed(2), 8, 'semibold', C.fee)
                    : t('无欠费', 8, 'medium', C.sub),
                ],
              }]
            : []),
        ],
      },
    ],
  };
}

function buildLock(title, ds, family) {
  const dur = ds.captureDuration ? ' · 保持' + ds.captureDuration : '';
  if (family === 'accessoryInline') {
    return {
      type: 'widget',
      children: [
        {
          type: 'text',
          text: `¥${ds.fee.number} · ${ds.flow.number}${ds.flow.unit} · ${ds.voice.number}分${dur}`,
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
      t(`流量 ${ds.flow.number}${ds.flow.unit} · 语音 ${ds.voice.number}分${dur}`, 'caption2', 'semibold', C.txt, {
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


/* =========================================================
 * 微信小程序响应解析
 *
 * 小程序首页会把话费/流量/语音一次性拉下来：
 *   POST https://mina.10010.com/wxapplet/weixinNew/sspbigball
 *   -> {"code":"0000","data":{"feeResource":{...},"flowResource":{...},"voiceResource":{...}}}
 * 字段与 App 端同名（*Persent / newUnit / dynamic*Title），所以直接复用解析逻辑。
 * 这里只做被动解析：不重放请求，不需要 RSA 加密和 openid。
 * ========================================================= */
async function handleMiniResponse(ctx) {
  if (ctx.env && String(ctx.env.cuMiniCapture).toLowerCase() === 'false') return;

  const reqUrl = String((ctx.request && ctx.request.url) || '');
  // mina：小程序自有接口；mxx：小程序里的「余量查询」webview（字段最全）。
  if (!reqUrl.includes(MINI_API_PATH) && !reqUrl.includes('mxx.client.10010.com')) return;

  const res = ctx.response || {};
  if (Number(res.status) !== 200) return;

  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    return;
  }
  if (!body || String(body.code) !== '0000') return;

  // 小程序有些接口把字段放在响应根层（没有 data 包装），两种都要兼容。
  const data = body.data && typeof body.data === 'object' ? body.data : body;

  // ① 账户余额接口：curntbalancecust / canusefeecust
  if (body.curntbalancecust != null || body.canusefeecust != null) {
    try {
      const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      ctx.storage.setJSON('unicom_account', {
        ts: Date.now(),
        balance: num(body.curntbalancecust),
        available: num(body.canusefeecust ?? body.canuseprecust),
        monthCost: num(body.realfeecust ?? body.totalrealfee ?? body.allbillfee),
        carryOver: num(body.carryForwardFromLastMonth ?? body.newCarryForwardFromLastMonth ?? body.carryOverArrears),
        owed: num(body.allbowefeecust),
        queryTime: body.queryTime ? String(body.queryTime) : '',
        path: reqUrl.split('?')[0],
      });
      captureDebug('account captured: balance=' + body.curntbalancecust);
    } catch (e) {
      captureDebug('account parse failed: ' + e);
    }
    return;
  }

  // ② 余量查询接口：packageName + resources（flow/voice/sms）+ flowSumList
  if (body.packageName && Array.isArray(body.resources)) {
    try {
      const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const pick = (type) => body.resources.find(r => String(r && r.type).toLowerCase() === type) || null;
      const flow = pick('flow') || {};
      const voice = pick('voice') || {};
      const sms = pick('smslist') || {};
      const detail = (Array.isArray(flow.details) && flow.details[0]) || {};
      const parsed = parseDetailFlow(body);

      ctx.storage.setJSON('unicom_flowdetail', Object.assign(parsed, { path: reqUrl.split('?')[0] }));
      captureDebug('flow detail captured: pkg=' + body.packageName + '; remainMB=' + remainMB);
    } catch (e) {
      captureDebug('flow detail parse failed: ' + e);
    }
    return;
  }

  if (!data || typeof data !== 'object') return;

  if (reqUrl.indexOf(MINI_SSP_BIGBALL) === 0 && data.feeResource && data.flowResource && data.voiceResource) {
    try {
      const parsed = parseUnicomData({
        code: 'Y',
        feeResource: data.feeResource,
        voiceResource: data.voiceResource,
        flowResource: data.flowResource,
      });
      // buildDataSource 用的是原始资源对象里的 total/used 字段，小程序同样有。
      const { ds, flowDisplay } = buildDataSource(ctx, parsed, data, '');
      ds.source = 'mini';
      ctx.storage.setJSON('unicom_datasource', ds);
      ctx.storage.set('unicom_miniTime', String(Date.now()));
      ctx.storage.delete('unicom_authFail');
      if ((!ctx.env || String(ctx.env.cuCaptureNotice).toLowerCase() !== 'false') &&
          typeof ctx.notify === 'function') {
        ctx.notify({
          title: '中国联通小程序数据已捕获',
          body: [
            '剩余话费：¥' + ds.fee.number,
            '剩余流量：' + flowDisplay.number + ' ' + flowDisplay.unit,
            '剩余语音：' + ds.voice.number + ' 分钟',
          ].join('\n'),
          sound: false,
        });
      }
    } catch (e) {
      captureDebug('mini parse failed: ' + e);
    }
    return;
  }

  // 顺手保存手机号，方便诊断时区分账号（不参与取数）
  if (reqUrl.includes('queryGoodsList')) {
    try {
      const rows = data.res || [];
      const main = rows[0] && rows[0].mainNumber;
      if (main) ctx.storage.set('unicom_phone', String(main));
    } catch (e) {}
    return;
  }

  // 账户总览：可用话费 / 本月消费 / 欠费 / 结转（暂只存档，供后续展示）
  if (reqUrl.includes('sspbalcbroadcast')) {
    try {
      const rows = data.res || data || [];
      const first = Array.isArray(rows) ? rows[0] : rows;
      if (first && typeof first === 'object') {
        ctx.storage.setJSON('unicom_account', {
          ts: Date.now(),
          available: Number(first.CANUSE_FEE_CUST),
          monthCost: Number(first.REAL_FEE_CUST),
          owed: Number(first.ALLBOWE_FEE),
          carryOver: Number(first.CARRY_INFO_ALL_FEE),
        });
      }
    } catch (e) {}
  }
}

async function handleWidget(ctx) {
  const title = '中国联通';
  const result = await loadData(ctx);
  if (!result.configured) return buildError(title, '请打开微信中国联通小程序，进入流量查询页面刷新一次，或打开联通 App 查询');
  if (!result.data) {
    return buildError(
      title,
      result.error && result.error.kind === 'auth'
        ? '登录状态已失效，请重新打开中国联通 App 或微信小程序查询一次，让组件重新抓取凭据'
        : '数据获取失败，请刷新微信联通小程序流量查询或打开联通 App 重试'
    );
  }
  const ds = result.data;
  // 通用/定向显示开关（与参考模块 CU_SHOW_GENERAL_FLOW / CU_SHOW_DIRECTIONAL_FLOW 对应）
  const showGeneral = !(ctx.env && String(ctx.env.cuGeneralFlow).toLowerCase() === 'false');
  const showDirectional = !(ctx.env && String(ctx.env.cuDirectionalFlow).toLowerCase() === 'false');

  // 账户余额 / 余量明细单独缓存（比大球数据更精确），渲染时实时读取。
  ds.account = ctx.storage.getJSON('unicom_account') || null;
  const fd = ctx.storage.getJSON('unicom_flowdetail') || null;
  // 余量明细是快照：超过 6 小时回落到首页大球数据，避免旧数据盖住新数据。
  const fdFresh = Boolean(fd) && Boolean(fd.ts) && Date.now() - Number(fd.ts) < 6 * 60 * 60 * 1000;
  if (fd && fdFresh) {
    const toKB = (mb) => (mb == null ? null : Math.round(Number(mb) * 1024));
    const g = fd.general || null;
    const d = fd.directional || null;
    // 两个开关控制「哪些流量参与统计」：默认通用 + 定向一起算
    const incG = showGeneral ? g : null;
    const incD = showDirectional ? d : null;
    const sumRemainMB = (incG && incG.remainMB != null ? incG.remainMB : 0) + (incD && incD.remainMB != null ? incD.remainMB : 0);
    const sumUsedMB = (incG && incG.usedMB != null ? incG.usedMB : 0) + (incD && incD.usedMB != null ? incD.usedMB : 0);
    const sumTotalMB = (incG && incG.totalMB != null ? incG.totalMB : 0) + (incD && incD.totalMB != null ? incD.totalMB : 0);
    const hasSum = Boolean(incG || incD);

    const remainKB = hasSum ? toKB(sumRemainMB) : toKB(fd.remainMB);
    const display = formatFlow(remainKB);
    const flowLabel = hasSum ? (incG && incD ? '流量' : (incD ? '定向流量' : '通用流量')) : '通用流量';
    ds.flow = { title: flowLabel, number: display.number, unit: display.unit };
    ds.plan = Object.assign({}, ds.plan, {
      remain: remainKB,
      total: hasSum ? (sumTotalMB > 0 ? toKB(sumTotalMB) : null) : toKB(fd.totalMB),
      used: hasSum ? toKB(sumUsedMB) : toKB(fd.usedMB),
      percent: hasSum && sumTotalMB > 0
        ? Math.min(1, sumUsedMB / sumTotalMB)
        : (fd.percent != null ? fd.percent : (ds.plan ? ds.plan.percent : null)),
    });
    if (fd.voiceRemain != null) ds.voice = { title: '剩余语音', number: String(fd.voiceRemain), unit: '分钟' };
    ds.packageName = fd.packageName;
    ds.otherUsedMB = fd.otherUsedMB;
    ds.detailTime = fd.time;
    // 定向流量单独展示（关闭「显示定向流量」时连这一行也不出现）
    if (d && showDirectional && (d.usedMB != null || d.remainMB != null || d.totalMB != null)) {
      ds.directional = {
        used: d.usedMB != null ? formatFlow(toKB(d.usedMB)) : null,
        remain: d.remainMB != null ? formatFlow(toKB(d.remainMB)) : null,
        total: d.totalMB ? formatFlow(toKB(d.totalMB)) : null,
      };
    }
  }
  // 有账户余额时，话费数字用「账户当前可用余额」，比大球口径更准。
  if (ds.account && ds.account.balance != null) {
    ds.fee = { title: '账户余额', number: Number(ds.account.balance).toFixed(2), unit: '元' };
  }

  const family = ctx.widgetFamily || 'systemSmall';
  if (family === 'systemMedium') return liquidGlassWidget(buildMedium(title, ds, result.fromCache));
  if (family === 'systemLarge' || family === 'systemExtraLarge') return liquidGlassWidget(buildLarge(title, ds, result.fromCache));
  if (family.startsWith('accessory')) return buildLock(title, ds, family);
  return liquidGlassWidget(buildSmall(title, ds, result.fromCache));
}
export default async function(ctx) {
  if (ctx && ctx.response) { await handleMiniResponse(ctx); return; }
  if (ctx && ctx.request && ctx.request.url) { await handleCapture(ctx); return; }
  try {
    const widget = await handleWidget(ctx || {});
    if (widget && widget.type === 'widget') return widget;
    return buildError('中国联通', '组件返回内容异常，请刷新模块');
  } catch (e) {
    return buildError('中国联通', '组件渲染异常：' + String(e && e.message ? e.message : e).slice(0, 80));
  }
}
