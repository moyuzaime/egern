/**
 * 中国联通小组件｜完整移植中国广电正式版 UI（保留联通数据接口）
 *
 * 自动获取方式：
 * 1. 打开中国联通 App
 * 2. 进入首页
 * 3. 点击当前余额 / 话费位置，让 App 查询一次
 * 4. Egern 会自动捕获联通 App 请求中的 Cookie 和手机号
 * 5. 小组件自动使用捕获的数据，无需手动填写环境变量
 *
 * 自动捕获域名：
 * m.client.10010.com
 *
 * 数据接口：
 * https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven
 */


/* =========================================================
 * 基础配置
 * ========================================================= */

const API_HOST = 'm.client.10010.com';
const KEY_PREFIX = 'unicom';
const KEY = 'unicom';

const API_URL =
  'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';


/* =========================================================
 * 颜色
 * ========================================================= */

const COLORS = {
  unicomWidgetBackgroundGradient: { light: '#EEF6FF', dark: '#405A70' },
  border: { light: '#FFFFFF78', dark: '#FFFFFF70' },
  title: { light: '#3C3C4399', dark: '#EBEBF599' },
  value: { light: '#000000', dark: '#FFFFFF' },
  time: { light: '#3C3C4399', dark: '#EBEBF599' },
  error: { light: '#FF453A', dark: '#FF453A' },
  capsuleBg: { light: '#FFFFFF45', dark: '#FFFFFF28' },
  accent: { light: '#0A84FF', dark: '#64B5FF' },
  fee: '#FF9F0A', flow: '#0A84FF', voice: '#30D158',
};

function glassStyle() {
  return {
    backgroundColor: { light: '#FFFFFF45', dark: '#FFFFFF28' },
    borderRadius: 18,
    borderWidth: 1,
    borderColor: { light: '#FFFFFF85', dark: '#FFFFFF70' },
  };
}

function widgetGradient() {
  return {
    type: 'radial',
    colors: [
      { light: '#EEF6FF', dark: '#405A70' },
      { light: '#F8F4FF', dark: '#514761' },
      { light: '#EEFCF6', dark: '#3E5E53' },
    ],
    stops: [0, 0.55, 1],
    center: { x: 0.22, y: 0.12 },
    startRadius: 0,
    endRadius: 520,
  };
}


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


function extractPhone(url) {
  if (!url) return '';

  try {
    const match = url.match(
      /[?&]desmobiel=([^&]+)/i
    );

    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
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
    throw new Error(
      `HTTP ${resp ? resp.status : 'no-response'}`
    );
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
    throw new Error(
      `API 返回异常：${res?.code || 'unknown'}`
    );
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


async function handleCapture(ctx) {
  if (ctx.env && String(ctx.env.cuCapture).toLowerCase() === 'false') return;
  const req = ctx.request || {};
  const url = String(req.url || '');
  if (!url.includes(API_HOST)) return;
  const cookie = String(getRequestHeader(req.headers, 'cookie') || '').trim();
  const phone = extractPhone(url);
  let changed = false;
  if (cookie) {
    const old = ctx.storage.get('unicom_cookie') || '';
    if (cookie !== old) { ctx.storage.set('unicom_cookie', cookie); changed = true; }
  }
  if (phone) {
    const old = ctx.storage.get('unicom_phone') || '';
    if (phone !== old) { ctx.storage.set('unicom_phone', phone); changed = true; }
  }
  if (changed && cookie && phone) {
    ctx.storage.set('unicom_captureTime', String(Date.now()));
    if ((!ctx.env || String(ctx.env.cuCaptureNotice).toLowerCase() !== 'false') && typeof ctx.notify === 'function') {
      ctx.notify({ title: '中国联通数据捕获成功', body: '已捕获登录信息，正在更新套餐数据', sound: false });
    }
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
    const trimmed = next.slice(-24);
    ctx.storage.setJSON(KEY + '.history', trimmed);
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
async function loadData(ctx) {
  if (ctx.env && String(ctx.env.cuCapture).toLowerCase() === 'false') {
    const cached = ctx.storage.getJSON('unicom_datasource') || null;
    if (cached) cached.stale = true;
    return { data: cached, configured: !!cached, error: null, fromCache: true };
  }
  const cookie = ctx.storage.get('unicom_cookie') || '';
  const phone = ctx.storage.get('unicom_phone') || '';
  if (!cookie || !phone) return { data: null, configured: false, error: null, fromCache: false };

  try {
    const raw = await fetchUnicomData(ctx, cookie, phone);
    const parsed = parseUnicomData(raw);
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
    ctx.storage.setJSON('unicom_datasource', ds);
    const captureTime = String(ctx.storage.get('unicom_captureTime') || '');
    const notifiedCaptureTime = String(ctx.storage.get('unicom_notifiedCaptureTime') || '');
    if (captureTime && captureTime !== notifiedCaptureTime) {
      if ((!ctx.env || String(ctx.env.cuPlanNotice).toLowerCase() !== 'false') && typeof ctx.notify === 'function') {
        ctx.notify({
          title: '中国联通套餐查询成功',
          body: ['剩余话费：¥' + ds.fee.number, '剩余流量：' + flowDisplay.number + ' ' + flowDisplay.unit, '剩余语音：' + ds.voice.number + ' 分钟'].join('\\n'),
          sound: false,
        });
      }
      ctx.storage.set('unicom_notifiedCaptureTime', captureTime);
    }
    return { data: ds, configured: true, error: null, fromCache: false };
  } catch (e) {
    const cached = ctx.storage.getJSON('unicom_datasource') || null;
    if (cached) cached.stale = true;
    return { data: cached, configured: true, error: e, fromCache: true };
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
  const title = '中国联通';
  const result = await loadData(ctx);
  if (!result.configured) return buildError(title, '请打开联通 App，进入首页并点击余额位置');
  if (!result.data) return buildError(title, '数据获取失败，请重新打开联通 App 查询一次');
  const ds = result.data;
  const family = ctx.widgetFamily || 'systemSmall';
  if (family === 'systemMedium') return liquidGlassWidget(buildMedium(title, ds, result.fromCache));
  if (family === 'systemLarge' || family === 'systemExtraLarge') return liquidGlassWidget(buildLarge(title, ds, result.fromCache));
  if (family.startsWith('accessory')) return buildLock(title, ds, family);
  return liquidGlassWidget(buildSmall(title, ds, result.fromCache));
}
export default async function(ctx) {
  if (ctx && ctx.request && ctx.request.url) { await handleCapture(ctx); return; }
  try {
    const widget = await handleWidget(ctx || {});
    if (widget && widget.type === 'widget') return widget;
    return buildError('中国联通', '组件返回内容异常，请刷新模块');
  } catch (e) {
    return buildError('中国联通', '组件渲染异常：' + String(e && e.message ? e.message : e).slice(0, 80));
  }
}
