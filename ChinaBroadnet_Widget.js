// 中国广电小组件
// Author: wuhuhuuuu

const API_URL = 'https://app.10099.com.cn/contact-web/api/busi/qryUserInfo';
const KEY = 'ChinaBroadnet';

export default async function (ctx) {
  // 捕获中国广电 App 请求
  if (ctx.request) {
    if (
      ctx.request.method !== 'POST' ||
      !ctx.request.url.startsWith(API_URL)
    ) {
      return;
    }

    try {
      const access = ctx.request.headers.get('access');
      const body = await ctx.request.json();

      if (!access || !body || body.data == null) {
        return;
      }

      ctx.storage.set(KEY + '.url', ctx.request.url);
      ctx.storage.set(KEY + '.access', access);
      ctx.storage.setJSON(KEY + '.data', body.data);

      ctx.notify({
        title: '中国广电',
        body: '数据捕获成功',
        sound: false,
      });
    } catch (e) {
      console.log('[ChinaBroadnet] capture error: ' + e);
    }

    return;
  }

  // 小组件查询
  const url = ctx.storage.get(KEY + '.url') || API_URL;
  const access = ctx.storage.get(KEY + '.access');
  const data = ctx.storage.getJSON(KEY + '.data');

  if (!access || data == null) {
    return widget(
      '请先打开中国广电 App',
      '等待自动捕获账号数据'
    );
  }

  try {
    const resp = await ctx.http.post(url, {
      headers: {
        access: access,
        'Content-Type': 'application/json',
      },
      body: {
        data: data,
      },
      timeout: 10000,
    });

    const result = await resp.json();

    if (
      !result ||
      result.status !== '000000' ||
      !result.data
    ) {
      return widget(
        '数据获取失败',
        '请重新打开中国广电 App 捕获数据'
      );
    }

    const user = result.data.userData || result.data;

    const fee = formatFee(
      pick(user, [
        'fee',
        'balance',
        'money',
        'remainFee',
      ])
    );

    const flow = formatFlow(
      pick(user, [
        'flow',
        'remainFlow',
        'flowRemain',
      ])
    );

    const voice = formatVoice(
      pick(user, [
        'voice',
        'remainVoice',
        'voiceRemain',
      ])
    );

    return {
      type: 'widget',
      padding: 16,
      gap: 8,
      children: [
        {
          type: 'text',
          text: '中国广电',
          font: {
            size: 'headline',
            weight: 'bold',
          },
        },
        {
          type: 'text',
          text: '话费  ' + fee,
          font: {
            size: 'body',
          },
        },
        {
          type: 'text',
          text: '流量  ' + flow,
          font: {
            size: 'body',
          },
        },
        {
          type: 'text',
          text: '语音  ' + voice,
          font: {
            size: 'body',
          },
        },
      ],
    };
  } catch (e) {
    console.log(
      '[ChinaBroadnet] query error: ' + e
    );

    return widget(
      '数据获取失败',
      '网络异常或登录状态已失效'
    );
  }
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  for (const key of keys) {
    if (
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ''
    ) {
      return obj[key];
    }
  }

  return null;
}

function formatFee(value) {
  if (value == null) {
    return '--';
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return String(value);
  }

  return (
    (Math.abs(n) >= 1000 ? n / 100 : n).toFixed(2) +
    ' 元'
  );
}

function formatFlow(value) {
  if (value == null) {
    return '--';
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return String(value);
  }

  if (n >= 1024 * 1024) {
    return (n / 1024 / 1024).toFixed(2) + ' GB';
  }

  if (n >= 1024) {
    return (n / 1024).toFixed(2) + ' MB';
  }

  return n.toFixed(2) + ' MB';
}

function formatVoice(value) {
  if (value == null) {
    return '--';
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return String(value);
  }

  return n.toFixed(0) + ' 分钟';
}

function widget(title, message) {
  return {
    type: 'widget',
    padding: 16,
    gap: 8,
    children: [
      {
        type: 'text',
        text: title,
        font: {
          size: 'headline',
          weight: 'bold',
        },
      },
      {
        type: 'text',
        text: message,
        font: {
          size: 'body',
        },
      },
    ],
  };
}