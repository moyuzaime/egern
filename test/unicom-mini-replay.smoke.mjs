// 冒烟测试：联通模块「小程序抓凭据 → 组件原样重放取数」链路。
// 运行：node test/unicom-mini-replay.smoke.mjs
//
// 说明：这里用 mock 的 Egern 运行时（storage / http / notify / widgetFamily），
// 只验证代码路径与数据流，不访问真实接口。

import assert from 'node:assert/strict';
import widget from '../ChinaUnicom/ChinaUnicom_Widget.js';

const BIGBALL_URL = 'https://mina.10010.com/wxapplet/weixinNew/sspbigball';
const DETAIL_URL =
  'https://mxx.client.10010.com/servicequerybusiness/operationservice/queryOcsPackageFlowLeftContentRevisedInJune';
const APP_URL = 'https://m.client.10010.com/mobileserviceimportant/home/queryUserInfoSeven';

const BIGBALL_BODY = {
  code: '0000',
  data: {
    feeResource: { feePersent: '12.34', newUnit: '元' },
    flowResource: { flowPersent: '5200', newUnit: 'MB', flowTotal: '10240', flowUsed: '5040' },
    voiceResource: { voicePersent: '120', newUnit: '分钟' },
  },
};

const DETAIL_BODY = {
  code: '0000',
  packageName: '测试套餐',
  time: '2026-11-20 10:00:00',
  resources: [
    { type: 'flow', details: [{ remain: '2048', total: '10240', use: '8192', usedPercent: '80' }] },
    { type: 'voice', remainResource: '150' },
  ],
  flowSumList: [{ flowtype: '3', xusedvalue: '100' }],
};

const APP_BODY = {
  code: 'Y',
  feeResource: { feePersent: '9.99', newUnit: '元' },
  flowResource: { flowPersent: '1024', newUnit: 'MB', flowTotal: '10240', flowUsed: '9216' },
  voiceResource: { voicePersent: '60', newUnit: '分钟' },
};

function makeCtx({ seed = {}, env = {}, http, family } = {}) {
  const store = new Map(Object.entries(seed));
  const notifies = [];
  const ctx = {
    env,
    storage: {
      get: k => (store.has(k) ? store.get(k) : undefined),
      set: (k, v) => { store.set(k, String(v)); },
      delete: k => { store.delete(k); },
      getJSON: k => (store.has(k) ? JSON.parse(store.get(k)) : null),
      setJSON: (k, v) => { store.set(k, JSON.stringify(v)); },
    },
    notify: n => notifies.push(n),
    http: http || mockHttp([]),
    widgetFamily: family,
  };
  return { ctx, store, notifies };
}

function mockHttp(routes) {
  const calls = [];
  const send = async (method, url, opts = {}) => {
    calls.push({ method, url, body: opts.body, headers: opts.headers });
    for (const [matcher, body] of routes) {
      const re = matcher instanceof RegExp ? matcher : new RegExp(String(matcher));
      if (re.test(url)) return { status: 200, json: async () => body };
    }
    return { status: 500, json: async () => ({}) };
  };
  return { calls, get: (u, o) => send('GET', u, o), post: (u, o) => send('POST', u, o) };
}

// 模拟微信发往小程序接口的一次请求
function miniRequest(url, body) {
  return {
    url,
    method: 'POST',
    headers: { cookie: 'mini-session=abc', 'user-agent': 'MicroMessenger/8.0', 'content-type': 'application/json' },
    body,
  };
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' :: ' + String((e && e.message) || e)]);
  }
}

// ① 抓取：小程序请求应保存为可重放的凭据
await test('抓取小程序请求 → 保存可重放凭据', async () => {
  const { ctx, store } = makeCtx({ env: { cuMiniCapture: 'true' } });
  ctx.request = miniRequest(BIGBALL_URL, '{"openid":"enc","sign":"enc"}');
  await widget(ctx);

  const saved = store.get('unicom_mini_req_bigball');
  assert.ok(saved, '应写入 unicom_mini_req_bigball');
  const req = JSON.parse(saved);
  assert.equal(req.url, BIGBALL_URL);
  assert.equal(req.method, 'POST');
  assert.equal(req.body, '{"openid":"enc","sign":"enc"}');
  assert.equal(req.headers.cookie, 'mini-session=abc');
  assert.ok(store.get('unicom_miniTime'), '应记录 unicom_miniTime');
});

// ② 被动解析：响应钩子仍应写 datasource / flowdetail
await test('小程序响应被动解析 → 写入 datasource', async () => {
  const { ctx, store } = makeCtx({ env: { cuMiniCapture: 'true' } });
  ctx.request = { url: BIGBALL_URL };
  ctx.response = { status: 200, json: async () => BIGBALL_BODY };
  await widget(ctx);
  const ds = JSON.parse(store.get('unicom_datasource'));
  assert.equal(ds.flow.number, '5.08');
  assert.equal(ds.source, 'mini');
});

// ③ 重放：没有 App 凭据时，组件应原样重放小程序请求取数
await test('无 App 凭据 → 重放小程序请求取数', async () => {
  const http = mockHttp([[BIGBALL_URL, BIGBALL_BODY], [DETAIL_URL, DETAIL_BODY]]);
  const { ctx, store } = makeCtx({
    env: { cuMiniCapture: 'true' },
    http,
    family: 'systemSmall',
    seed: {
      unicom_mini_req_bigball: JSON.stringify({
        ts: Date.now(), method: 'POST', url: BIGBALL_URL,
        headers: { cookie: 'mini-session=abc', 'user-agent': 'MicroMessenger/8.0' },
        body: '{"openid":"enc"}',
      }),
      unicom_mini_req_detail: JSON.stringify({
        ts: Date.now(), method: 'POST', url: DETAIL_URL,
        headers: { cookie: 'mini-session=abc' },
        body: '{"q":"enc"}',
      }),
    },
  });

  const out = await widget(ctx);
  assert.equal(out.type, 'widget');

  assert.equal(http.calls.length, 2, '应重放 bigball + detail 两个请求');
  const bigballCall = http.calls.find(c => c.url === BIGBALL_URL);
  assert.ok(bigballCall, '应重放 bigball');
  assert.equal(bigballCall.body, '{"openid":"enc"}', '重放必须原样带回请求体');
  assert.equal(bigballCall.headers.cookie, 'mini-session=abc', '重放必须原样带回 Cookie');

  const ds = JSON.parse(store.get('unicom_datasource'));
  assert.equal(ds.flow.number, '5.08');
  const fd = JSON.parse(store.get('unicom_flowdetail'));
  assert.equal(fd.packageName, '测试套餐', '明细重放应写入 unicom_flowdetail');
});

// ④ 重放失败：应静默回落缓存，不影响渲染
await test('重放失败 → 回落缓存仍可渲染', async () => {
  const http = mockHttp([]); // 全部 500
  const oldDs = {
    stale: false,
    fee: { title: '剩余话费', number: '1.00', unit: '元' },
    flow: { title: '剩余流量', number: '1.00', unit: 'GB' },
    voice: { title: '剩余语音', number: '10', unit: '分钟' },
    updatedAt: Date.now() - 10 * 60 * 1000,
    history: [],
    plan: { total: 1024 * 1024, used: 1024, remain: 1024 * 1024, percent: 0.01 },
  };
  const { ctx, store } = makeCtx({
    env: { cuMiniCapture: 'true' },
    http,
    family: 'systemSmall',
    seed: {
      unicom_datasource: JSON.stringify(oldDs),
      unicom_mini_req_bigball: JSON.stringify({
        ts: Date.now(), method: 'POST', url: BIGBALL_URL, headers: {}, body: '{}',
      }),
    },
  });

  const out = await widget(ctx);
  assert.equal(out.type, 'widget');
  assert.ok(http.calls.length > 0, '应尝试过重放');
  const ds = JSON.parse(store.get('unicom_datasource'));
  assert.equal(ds.updatedAt, oldDs.updatedAt, '失败时不应改写缓存');
});

// ⑤ 有 App 凭据时不应重放小程序请求
await test('有 App 凭据 → 走 App 接口，不重放小程序', async () => {
  const http = mockHttp([[APP_URL, APP_BODY], [/mxx\.10010\.com/, DETAIL_BODY]]);
  const { ctx } = makeCtx({
    env: { cuMiniCapture: 'true' },
    http,
    family: 'systemSmall',
    seed: {
      unicom_cookie: 'app-session=xyz',
      unicom_phone: '13800138000',
      unicom_mini_req_bigball: JSON.stringify({
        ts: Date.now(), method: 'POST', url: BIGBALL_URL, headers: {}, body: '{}',
      }),
    },
  });

  const out = await widget(ctx);
  assert.equal(out.type, 'widget');
  const hitMini = http.calls.some(c => c.url.indexOf('mina.10010.com') >= 0);
  assert.equal(hitMini, false, '有 App 凭据时不应重放小程序首页接口');
  const hitApp = http.calls.some(c => c.url.indexOf('m.client.10010.com') >= 0);
  assert.equal(hitApp, true, '应调用 App 接口');
});

// ⑥ 凭据过期（>12h）不再重放
await test('小程序凭据超过 12 小时 → 不重放', async () => {
  const http = mockHttp([[BIGBALL_URL, BIGBALL_BODY]]);
  const { ctx } = makeCtx({
    env: { cuMiniCapture: 'true' },
    http,
    family: 'systemSmall',
    seed: {
      unicom_mini_req_bigball: JSON.stringify({
        ts: Date.now() - 13 * 60 * 60 * 1000, method: 'POST', url: BIGBALL_URL, headers: {}, body: '{}',
      }),
    },
  });
  const out = await widget(ctx);
  assert.equal(out.type, 'widget');
  assert.equal(http.calls.length, 0, '过期凭据不应触发请求');
});

// ⑦ 关闭小程序开关后既不抓也不重放
await test('cuMiniCapture=false → 不抓取、不重放', async () => {
  const http = mockHttp([[BIGBALL_URL, BIGBALL_BODY]]);
  const capture = makeCtx({ env: { cuMiniCapture: 'false' } });
  capture.ctx.request = miniRequest(BIGBALL_URL, '{"openid":"enc"}');
  await widget(capture.ctx);
  assert.equal(capture.store.get('unicom_mini_req_bigball'), undefined, '关闭后不应保存凭据');

  const render = makeCtx({
    env: { cuMiniCapture: 'false' },
    http,
    family: 'systemSmall',
    seed: {
      unicom_mini_req_bigball: JSON.stringify({
        ts: Date.now(), method: 'POST', url: BIGBALL_URL, headers: {}, body: '{}',
      }),
    },
  });
  await widget(render.ctx);
  assert.equal(http.calls.length, 0, '关闭后不应重放');
});

// ⑧ 渲染矩阵：三种样式 × 四种尺寸不应抛错
await test('渲染矩阵 3 样式 × 4 尺寸', async () => {
  const seed = {
    unicom_datasource: JSON.stringify({
      stale: false,
      fee: { title: '剩余话费', number: '12.34', unit: '元' },
      flow: { title: '剩余流量', number: '5.20', unit: 'GB' },
      voice: { title: '剩余语音', number: '120', unit: '分钟' },
      updatedAt: Date.now(),
      captureDuration: '1天',
      history: [{ ts: Date.now() - 3600e3, flowKB: 5500000 }, { ts: Date.now() - 600e3, flowKB: 5450000 }],
      packageName: '测试套餐',
      plan: {
        total: 10 * 1024 * 1024, used: 4800000, remain: 5452800, percent: 0.48,
        voiceTotal: 200, voiceUsed: 80, voiceRemain: 120, voicePercent: 0.6,
      },
    }),
  };
  for (const style of ['classic', 'dash', 'ios']) {
    for (const family of ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryRectangular']) {
      const { ctx } = makeCtx({ env: { cuUiStyle: style }, family, seed });
      const out = await widget(ctx);
      assert.equal(out && out.type, 'widget', style + '/' + family + ' 渲染失败');
    }
  }
});

const failed = results.filter(r => r[0] === 'FAIL');
for (const [status, name] of results) console.log(status + '  ' + name);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
