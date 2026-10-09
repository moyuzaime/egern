'use strict';

const API_URL = 'https://app.10099.com.cn/contact-web/api/busi/qryUserInfo';
const KEY = 'ChinaBroadnetHarkTest';

const C = {
  fee: '#FF9F0A',
  flow: '#0A84FF',
  voice: '#30D158',
  txt: { light: '#000000', dark: '#FFFFFF' },
  sub: { light: '#3C3C4399', dark: '#EBEBF599' },
  glass: { light: '#FFFFFF22', dark: '#FFFFFF30' },
  glassBorder: { light: '#FFFFFF70', dark: '#FFFFFF68' },
  glassShadow: { light: '#64748B06', dark: '#00000003' },
};

function bg() {
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

function readRequestBody(ctx) {
  const req = ctx.request || {};
  return (async () => {
    try {
      if (typeof req.json === 'function') {
        const body = await req.json();
        if (body && body.data != null) return body;
      }
    } catch (e) {}
    try {
      const raw = req.body;
      if (typeof raw === 'string' && raw) return JSON.parse(raw);
      if (raw && typeof raw === 'object') return raw;
    } catch (e) {}
    try {
      if (typeof $request !== 'undefined' && $request && $request.body) {
        return typeof $request.body === 'string' ? JSON.parse($request.body) : $request.body;
      }
    } catch (e) {}
    return null;
  })();
};

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
  const gb = 1024 * 1024;
  const mb = 1024;
  if (n >= gb) return { number: (n / gb).toFixed(2), unit: 'GB' };
  if (n >= mb) return { number: (n / mb).toFixed(2), unit: 'MB' };
  return { number: n.toFixed(2), unit: 'KB' };
}

function formatVoice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(0) : '--';
}

async function capture(ctx) {
  const req = ctx.request || {};
  const url = String(req.url || '');
  const method = String(req.method || '').toUpperCase();

  if (/^https:\/\/app\\.10099\\.com\\.cn\//i.test(url)) {
    try {
      const body = await readRequestBody(ctx);
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

      console.log(
        '[ChinaBroadnet-Hark] API侦察: ' +
        method + ' ' + url +
        (keys.length ? ' | keys=' + keys.join(',') : '')
      );
    } catch (e) {
      console.log('[ChinaBroadnet-Hark] probe error: ' + e);
    }
  }

  if (!url.startsWith(API_URL)) return;
  if (method !== 'POST') return;

  try {
    const access = String(getHeader(req.headers, 'access') || '').trim();
    const body = await readRequestBody(ctx);
    if (!access || !body || body.data == null) return;

    ctx.storage.set(KEY + '.url', url);
    ctx.storage.set(KEY + '.access', access);
    ctx.storage.setJSON(KEY + '.data', body.data);
    ctx.storage.set(KEY + '.captureTime', String(Date.now()));

    ctx.notify({
      title: '中国广电',
      body: '数据捕获成功，正在侦察套餐接口',
      sound: false,
    });
  } catch (e) {
    console.log('[ChinaBroadnet-Hark] capture error: ' + e);
  }
}

async function fetchData(ctx, access, data, url) {
  const resp = await ctx.http.post(url || API_URL, {
    timeout: 10000,
    headers: {
      access,
      'Content-Type': 'application/json',
    },
    body: { data },
  });

  if (!resp || resp.status < 200 || resp.status >= 300) {
    throw new Error('HTTP ' + (resp ? resp.status : 'no-response'));
  }

  return await resp.json();
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

async function loadData(ctx) {
  const access = ctx.storage.get(KEY + '.access');
  const data = ctx.storage.getJSON(KEY + '.data');
  const url = ctx.storage.get(KEY + '.url') || API_URL;

  if (!access || data == null) {
    return { configured: false, data: null };
  }

  try {
    const result = await fetchData(ctx, access, data, url);
    if (!result || result.status !== '000000' || !result.data) {
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

    if (planFields.length) {
      console.log(
        '[ChinaBroadnet-Hark] 套餐字段探测: ' +
        planFields.map(x => x.path + '=' + x.value).join(', ')
      );
    } else {
      console.log('[ChinaBroadnet-Hark] 未发现明显的套餐资源数值字段');
    }

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

function t(text, size, weight, color, extra) {
  return Object.assign({
    type: 'text',
    text: String(text),
    font: { size, weight: weight || 'regular' },
    textColor: color || C.txt,
    maxLines: 1,
    minScale: 0.6,
  }, extra || {});
}

function glass(children, extra) {
  return Object.assign({
    type: 'stack',
    direction: 'column',
    alignItems: 'start',
    gap: 6,
    padding: 10,
    borderRadius: 18,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    shadowColor: C.glassShadow,
    shadowRadius: 8,
    shadowOffset: { x: 0, y: 3 },
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

function historySvg(history, color, w, h) {
  const vals = (history || []).map(x => Number(x.flowKB)).filter(Number.isFinite);
  if (!vals.length) {
    return 'data:image/svg+xml,' +
      encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'></svg>`);
  }

  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = Math.max(1, max - min);
  const points = vals.slice(-12).map((v, i, a) => {
    const x = a.length === 1 ? w / 2 : (i / (a.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>
      <polyline points='${points}' fill='none' stroke='${color}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/>
    </svg>`;

  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function heroFlowCard(ds) {
  const p = ds.plan && ds.plan.percent != null ? ds.plan.percent : null;
  const remain = ds.flow.number + ' ' + ds.flow.unit;
  const usedText = ds.plan && ds.plan.used != null
    ? '已用 ' + formatFlow(ds.plan.used).number + ' ' + formatFlow(ds.plan.used).unit
    : '套餐用量待确认';
  const totalText = ds.plan && ds.plan.total != null
    ? '套餐 ' + formatFlow(ds.plan.total).number + ' ' + formatFlow(ds.plan.total).unit
    : '等待套餐总量';

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
        t(p != null ? Math.round((1 - p) * 100) + '% 剩余' : '实时套餐', 9, 'semibold', C.flow),
      ],
    },
    {
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
              src: gaugeSvg(p != null ? p : 0, C.flow, 110),
              width: 82,
              height: 43,
            },
            t(p != null ? Math.round(p * 100) + '% 已用' : '—', 10, 'bold', C.flow),
          ],
        },
        {
          type: 'stack',
          direction: 'column',
          alignItems: 'start',
          gap: 1,
          flex: 1,
          children: [
            t(remain, 23, 'bold', C.txt, { minScale: 0.55 }),
            t(usedText, 9, 'medium', C.sub),
            t(totalText, 9, 'medium', C.sub, { minScale: 0.65 }),
          ],
        },
      ],
    },
  ], {
    width: 0,
    flex: 1,
    padding: [8, 10],
    borderRadius: 18,
    gap: 4,
    backgroundColor: { light: '#FFFFFF28', dark: '#FFFFFF3A' },
    borderColor: { light: '#FFFFFF78', dark: '#FFFFFF70' },
    shadowColor: { light: '#64748B04', dark: '#00000000' },
    shadowRadius: 2,
    shadowOffset: { x: 0, y: 1 },
  });
}

function header(title, ds, fromCache) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 4,
    children: [
      {
        type: 'image',
        src: 'sf-symbol:antenna.radiowaves.left.and.right',
        width: 12,
        height: 12,
        color: C.flow,
      },
      t(title, 'footnote', 'semibold'),
      { type: 'spacer' },
      t(
        `${fromCache ? '缓存 · ' : ''}更新 ${fmtTime(ds.updatedAt)}`,
        9,
        'regular',
        C.sub,
        { minScale: 1 }
      ),
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
          color: low ? '#FF453A' : C.fee,
        },
        t('剩余话费', 9, 'medium', C.sub),
      ],
    },
    {
      type: 'stack',
      direction: 'row',
      alignItems: 'end',
      gap: 3,
      children: [
        t('¥', 12, 'semibold', low ? '#FF453A' : C.fee),
        t(ds.fee.number, 22, 'bold', low ? '#FF453A' : C.txt, {
          minScale: 0.7,
        }),
      ],
    },
  ], {
    alignItems: 'center',
    padding: [7, 8],
    borderRadius: 18,
    height: 70,
    gap: 5,
  });
}
function dataCard(icon, color, title, value, unit) {
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
        t(value, 19, 'bold', C.txt, { minScale: 0.55 }),
        t(unit, 9, 'semibold', C.sub),
      ],
    },
  ], {
    padding: [8, 8],
    borderRadius: 18,
    height: 70,
  });
}

function buildSmall(title, ds, fromCache) {
  const p = ds.plan && ds.plan.percent != null ? ds.plan.percent : 0;
  const remain = ds.flow.number + ' ' + ds.flow.unit;
  const used = ds.plan && ds.plan.used != null
    ? formatFlow(ds.plan.used).number + ' ' + formatFlow(ds.plan.used).unit
    : '--';
  const total = ds.plan && ds.plan.total != null
    ? formatFlow(ds.plan.total).number + ' ' + formatFlow(ds.plan.total).unit
    : '--';

  return {
    type: 'widget',
    padding: 11,
    gap: 7,
    backgroundGradient: bg(),
    refreshAfter: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
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
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'end',
            gap: 2,
            children: [
              t('¥', 9, 'semibold', C.fee),
              t(ds.fee.number, 13, 'bold', C.txt, { minScale: 0.7 }),
            ],
          },
        ],
      },

      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        children: [
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'start',
            gap: 1,
            flex: 1,
            children: [
              t('剩余流量', 9, 'medium', C.sub),
              {
                type: 'stack',
                direction: 'row',
                alignItems: 'end',
                gap: 2,
                children: [
                  t(ds.flow.number, 27, 'bold', C.txt, { minScale: 0.58 }),
                  t(ds.flow.unit, 10, 'semibold', C.sub),
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                alignItems: 'center',
                gap: 4,
                children: [
                  {
                    type: 'image',
                    src: 'sf-symbol:chart.pie.fill',
                    width: 8,
                    height: 8,
                    color: C.flow,
                  },
                  t(
                    p != null
                      ? Math.round((1 - p) * 100) + '% 剩余'
                      : '套餐用量待确认',
                    8,
                    'semibold',
                    C.flow
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
                src: gaugeSvg(p, C.flow, 82),
                width: 56,
                height: 32,
              },
              t(
                p != null ? Math.round(p * 100) + '% 已用' : '—',
                8,
                'bold',
                C.flow
              ),
            ],
          },
        ],
      },

      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 5,
        padding: [5, 7],
        borderRadius: 12,
        backgroundColor: C.glass,
        borderWidth: 1,
        borderColor: C.glassBorder,
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 3,
            flex: 1,
            children: [
              {
                type: 'image',
                src: 'sf-symbol:phone.fill',
                width: 9,
                height: 9,
                color: C.voice,
              },
              t(ds.voice.number + ' 分钟', 9, 'semibold', C.txt, { minScale: 0.65 }),
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'end',
            gap: 0,
            children: [
              t('套餐', 7, 'regular', C.sub),
              t(total, 8, 'medium', C.sub, { minScale: 0.65 }),
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'end',
            gap: 0,
            children: [
              t('已用', 7, 'regular', C.sub),
              t(used, 8, 'medium', C.sub, { minScale: 0.65 }),
            ],
          },
        ],
      },
    ],
  };
}

function buildMedium(title, ds, fromCache) {
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
        t('¥' + ds.fee.number, 17, 'bold', C.txt, { minScale: 0.65 }),
      ],
    },
  ], {
    height: 50,
    padding: [6, 8],
    gap: 2,
    borderRadius: 16,
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
        t(ds.voice.number, 17, 'bold', C.txt, { minScale: 0.65 }),
        t('分', 8, 'semibold', C.sub),
      ],
    },
    t(
      ds.plan && ds.plan.voiceTotal != null
        ? ('套餐 ' + formatVoice(ds.plan.voiceTotal) + ' 分')
        : '剩余语音',
      8,
      'regular',
      C.sub
    ),
  ], {
    height: 50,
    padding: [6, 8],
    gap: 2,
    borderRadius: 16,
  });

  const row = {
    type: 'stack',
    direction: 'row',
    alignItems: 'start',
    gap: 7,
    height: 106,
    children: [
      heroFlowCard(ds),
      {
        type: 'stack',
        direction: 'column',
        alignItems: 'start',
        gap: 6,
        width: 112,
        height: 106,
        children: [
          compactFee,
          compactVoice,
        ],
      },
    ],
  };

  return {
    type: 'widget',
    padding: [10, 11],
    gap: 6,
    backgroundGradient: bg(),
    refreshAfter: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    children: [
      header(title, ds, fromCache),
      row,
    ],
  };
}

function buildLarge(title, ds, fromCache) {
  return {
    type: 'widget',
    padding: 15,
    gap: 10,
    backgroundGradient: bg(),
    refreshAfter: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    children: [
      header(title, ds, fromCache),
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'start',
        gap: 10,
        children: [
          heroFlowCard(ds),
          {
            type: 'stack',
            direction: 'column',
            alignItems: 'start',
            width: 132,
            height: 148,
            gap: 8,
            children: [
              feeCard(ds),
              dataCard('phone.fill', C.voice, '剩余语音', ds.voice.number, ds.voice.unit),
            ],
          },
        ],
      },
      glass([
        {
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          gap: 4,
          children: [
            {
              type: 'image',
              src: 'sf-symbol:chart.bar.fill',
              width: 10,
              height: 10,
              color: C.flow,
            },
            t('流量变化', 10, 'semibold', C.txt),
            { type: 'spacer' },
            t(
              ds.plan && ds.plan.total != null
                ? ('已用 ' + Math.round((ds.plan.percent || 0) * 100) + '%')
                : '最近捕获快照',
              9,
              'medium',
              ds.plan && ds.plan.total != null ? C.voice : C.sub
            ),
          ],
        },
        {
          type: 'image',
          src: historySvg(ds.history, C.flow, 290, 45),
          width: 290,
          height: 48,
        },

      ], {
        width: 0,
        flex: 1,
        gap: 6,
        padding: [10, 13],
        borderRadius: 18,
      }),
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

function buildError(title, message) {
  return {
    type: 'widget',
    padding: 14,
    gap: 6,
    backgroundGradient: bg(),
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
    return buildMedium('中国广电', result.data, result.fromCache);
  }

  if (family === 'systemLarge' || family === 'systemExtraLarge') {
    return buildLarge('中国广电', result.data, result.fromCache);
  }

  if (family.startsWith('accessory')) {
    return buildLock('中国广电', result.data, family);
  }

  return buildSmall('中国广电', result.data, result.fromCache);
}

export default async function(ctx) {
  if (ctx.request && ctx.request.url) {
    return capture(ctx);
  }
  return handleWidget(ctx);
}
