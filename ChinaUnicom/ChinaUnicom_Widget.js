/**
 * 中国联通话费流量小组件
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

const API_URL =
  'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';


/* =========================================================
 * 颜色
 * ========================================================= */

const COLORS = {
  bg: { light: '#EEF6FF', dark: '#405A70' },
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


async function handleCapture(ctx) {
  const req = ctx.request || {};
  const url = String(req.url || '');

  if (!url) return;

  /*
   * 只捕获中国联通 App 的接口请求
   */
  if (!url.includes(API_HOST)) {
    return;
  }


  /*
   * 获取 Cookie
   */
  const cookie = String(
    getRequestHeader(req.headers, 'cookie') || ''
  ).trim();


  /*
   * 获取手机号
   *
   * 联通这个接口使用：
   * desmobiel=手机号
   */
  const phone = extractPhone(url);


  let changed = false;


  /*
   * 保存 Cookie
   */
  if (cookie) {
    const oldCookie =
      ctx.storage.get('unicom_cookie') || '';

    if (cookie !== oldCookie) {
      ctx.storage.set(
        'unicom_cookie',
        cookie
      );

      changed = true;
    }
  }


  /*
   * 保存手机号
   */
  if (phone) {
    const oldPhone =
      ctx.storage.get('unicom_phone') || '';

    if (phone !== oldPhone) {
      ctx.storage.set(
        'unicom_phone',
        phone
      );

      changed = true;
    }
  }


  /*
   * 第一次成功捕获时通知
   */
  if (
    changed &&
    cookie &&
    phone
  ) {
    ctx.notify({
      title: '中国联通',
      body: '已自动获取登录信息，小组件将自动更新',
    });
  }
}


/* =========================================================
 * 数据请求
 * ========================================================= */

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

async function loadData(ctx) {

  const cookie =
    ctx.storage.get('unicom_cookie') ||
    '';

  const phone =
    ctx.storage.get('unicom_phone') ||
    '';


  /*
   * 没有自动捕获到登录信息
   */
  if (!cookie || !phone) {

    return {
      data: null,
      configured: false,
      error: null,
    };
  }


  try {

    const res =
      await fetchUnicomData(
        ctx,
        cookie,
        phone
      );


    const data =
      parseUnicomData(res);


    /*
     * 保存最新数据
     */
    ctx.storage.setJSON(
      'unicom_datasource',
      data
    );


    return {
      data,
      configured: true,
      error: null,
    };

  } catch (e) {

    /*
     * 如果接口失败，尝试使用缓存
     */
    const cached =
      ctx.storage.getJSON(
        'unicom_datasource'
      );


    return {
      data: cached || null,
      configured: true,
      error: e,
    };
  }
}


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



function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes());
}
function formatFlow(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return { number: '--', unit: 'GB' };
  if (n >= 1024) return { number: (n / 1024).toFixed(2), unit: 'GB' };
  return { number: n.toFixed(2), unit: 'MB' };
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

function historyDeltaText(history) {
  const vals = (history || []).map(x => Number(x.flowKB)).filter(Number.isFinite);
  if (vals.length < 2) return '采集中';
  const delta = vals[vals.length - 1] - vals[vals.length - 2];
  if (Math.abs(delta) < 1) return '余量基本稳定';
  const f = formatFlow(Math.abs(delta));
  return (delta < 0 ? '较上次减少 ' : '较上次增加 ') + f.number + ' ' + f.unit;
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
      gap: 2,
      children: [
        t('¥', 13, 'semibold', low ? '#FF453A' : C.fee),
        t(ds.fee.number, 24, 'bold', low ? '#FF453A' : C.txt, {
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
  });
}

function buildSmall(title, ds, fromCache) {
  const p = ds.plan && ds.plan.percent != null ? ds.plan.percent : null;
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
          t(`${fromCache ? '缓存 · ' : ''}更新 ${fmtTime(ds.updatedAt)}`, 8, 'medium', C.sub, { minScale: 0.7 }),
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
              t(
                ds.plan && ds.plan.used != null && ds.plan.total != null
                  ? '已用 ' + used + ' / 套餐 ' + total
                  : (ds.plan && ds.plan.remain != null
                    ? '套餐余量 ' + formatFlow(ds.plan.remain).number + ' ' + formatFlow(ds.plan.remain).unit
                    : '套餐用量待确认'),
                8,
                'semibold',
                C.flow,
                { minScale: 0.55 }
              ),
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
                p != null ? Math.round(p * 100) + '% 已用' : '套餐',
                8,
                'bold',
                C.flow
              ),
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
            { type: 'image', src: 'sf-symbol:phone.fill', width: 10, height: 10, color: C.voice },
            t('通信余量', 9, 'semibold', C.sub),
          ],
        },
        {
          type: 'stack',
          direction: 'row',
          alignItems: 'center',
          gap: 10,
          children: [
            {
              type: 'stack',
              direction: 'column',
              alignItems: 'start',
              gap: 2,
              flex: 1,
              children: [
                t('剩余语音', 8, 'medium', C.sub),
                {
                  type: 'stack',
                  direction: 'row',
                  alignItems: 'end',
                  gap: 3,
                  children: [
                    t(ds.voice.number === '--' ? '暂无数据' : ds.voice.number, 22, 'bold', C.txt, { minScale: 0.45 }),
                    t(ds.voice.number === '--' ? '' : '分钟', 9, 'semibold', C.sub),
                  ],
                },
              ],
            },
            {
              type: 'stack',
              direction: 'column',
              alignItems: 'start',
              gap: 2,
              flex: 1,
              children: [
                t('剩余话费', 8, 'medium', C.sub),
                {
                  type: 'stack',
                  direction: 'row',
                  alignItems: 'end',
                  gap: 2,
                  children: [
                    t('¥', 12, 'semibold', C.fee),
                    t(ds.fee.number, 22, 'bold', C.txt, { minScale: 0.45 }),
                  ],
                },
              ],
            },
          ],
        },
      ], {
        width: 0,
        flex: 1,
        padding: [7, 10],
        borderRadius: 14,
        gap: 4,
        backgroundColor: { light: '#FFFFFF45', dark: '#FFFFFF28' },
        borderColor: { light: '#FFFFFF85', dark: '#FFFFFF70' },
      })
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
          glass([
            {
              type: 'stack',
              direction: 'row',
              alignItems: 'center',
              gap: 4,
              children: [
                { type: 'image', src: 'sf-symbol:phone.fill', width: 11, height: 11, color: C.voice },
                t('通信余量', 10, 'semibold', C.txt),
              ],
            },
            {
              type: 'stack',
              direction: 'column',
              alignItems: 'start',
              gap: 3,
              children: [
                t('剩余语音', 9, 'medium', C.sub),
                {
                  type: 'stack',
                  direction: 'row',
                  alignItems: 'end',
                  gap: 3,
                  children: [
                    t(ds.voice.number === '--' ? '暂无数据' : ds.voice.number, 23, 'bold', C.txt, { minScale: 0.5 }),
                    t(ds.voice.number === '--' ? '' : '分钟', 9, 'semibold', C.sub),
                  ],
                },
              ],
            },
            {
              type: 'divider',
              color: { light: '#FFFFFF70', dark: '#FFFFFF35' },
              size: 1,
            },
            {
              type: 'stack',
              direction: 'column',
              alignItems: 'start',
              gap: 2,
              children: [
                t('剩余话费', 9, 'medium', C.sub),
                {
                  type: 'stack',
                  direction: 'row',
                  alignItems: 'end',
                  gap: 2,
                  children: [
                    t('¥', 12, 'semibold', C.fee),
                    t(ds.fee.number, 22, 'bold', C.txt, { minScale: 0.55 }),
                  ],
                },
              ],
            },
          ], {
            width: 132,
            height: 148,
            padding: [9, 10],
            borderRadius: 18,
            gap: 5,
            backgroundColor: { light: '#FFFFFF45', dark: '#FFFFFF28' },
            borderColor: { light: '#FFFFFF85', dark: '#FFFFFF70' },
          }),
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
            t('流量余量趋势', 10, 'semibold', C.txt),
            { type: 'spacer' },
            t(
              ds.plan && ds.plan.total != null
                ? ('已用 ' + Math.round((ds.plan.percent || 0) * 100) + '%')
                : historyDeltaText(ds.history),
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
        t(historyDeltaText(ds.history), 9, 'medium', C.sub),
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

/* =========================================================
 * Widget 主逻辑
 * ========================================================= */

async function handleWidget(ctx) {
  const title = '中国联通';
  const result = await loadData(ctx);
  const data = result.data;

  if (!result.configured) {
    return buildError(title, '请打开联通 App，进入首页并点击余额位置');
  }
  if (!data) {
    return buildError(title, '数据获取失败，请重新打开联通 App 查询一次');
  }

  // 将联通接口数据映射到广电正式版 UI 使用的数据结构。
  const flowRaw = Number(data.flow.value);
  const flow = Number.isFinite(flowRaw)
    ? (String(data.flow.unit).toUpperCase() === 'GB'
      ? { number: flowRaw.toFixed(2), unit: 'GB' }
      : flowRaw >= 1024
        ? { number: (flowRaw / 1024).toFixed(2), unit: 'GB' }
        : { number: flowRaw.toFixed(2), unit: 'MB' })
    : { number: '--', unit: 'MB' };

  const ds = {
    fee: { number: String(data.fee.value ?? '--'), unit: data.fee.unit || '元' },
    flow: { number: flow.number, unit: flow.unit },
    voice: { number: String(data.voice.value ?? '--'), unit: data.voice.unit || '分钟' },
    updatedAt: data.timestamp || Date.now(),
    history: [],
    plan: null,
  };

  const family = ctx.widgetFamily || 'systemSmall';
  if (family.startsWith('accessory')) return buildLock(title, ds, family);
  if (family === 'systemSmall') return buildSmall(title, ds, Boolean(result.error));
  if (family === 'systemMedium') return buildMedium(title, ds, Boolean(result.error));
  if (family === 'systemLarge' || family === 'systemExtraLarge') return buildLarge(title, ds, Boolean(result.error));
  return buildSmall(title, ds, Boolean(result.error));
}

/* =========================================================
 * Egern 入口
 *
 * 同一个 JS：
 *
 * http_request → 自动抓 Cookie / 手机号
 * generic      → 显示 Widget
 * ========================================================= */

export default async function(ctx) {

  /*
   * HTTP Request 模式
   */
  if (
    ctx.request &&
    ctx.request.url
  ) {

    return handleCapture(ctx);
  }


  /*
   * Generic Widget 模式
   */
  return handleWidget(ctx);
}
