/**
 * 中国广电话费流量小组件
 *
 * 自动获取方式：
 * 1. 开启「中国广电数据抓取」
 * 2. 打开中国广电 App
 * 3. App 请求 qryUserInfo 接口
 * 4. Egern 自动捕获 access + data
 * 5. 小组件自动更新
 * 6. 捕获成功后可以关闭「数据抓取」
 *
 * Author: wuhuhuuuu
 */

const API_URL =
  'https://app.10099.com.cn/contact-web/api/busi/qryUserInfo';

const KEY = 'ChinaBroadnet';


/* =========================================================
 * 颜色
 * ========================================================= */

const COLORS = {

  bg: {
    light: '#FFFFFF',
    dark: '#2C2C2E',
  },

  border: {
    light: '#E5E5EA',
    dark: '#3A3A3C',
  },

  title: {
    light: '#666666',
    dark: '#8E8E93',
  },

  value: {
    light: '#1C1C1E',
    dark: '#FFFFFF',
  },

  time: {
    light: '#999999',
    dark: '#666666',
  },

  error: {
    light: '#FF3B30',
    dark: '#FF453A',
  },

  capsuleBg: {
    light: '#F5F5F7',
    dark: '#3A3A3C',
  },

  accent: {
    light: '#1677FF',
    dark: '#409CFF',
  },

};


/* =========================================================
 * Headers
 * ========================================================= */

function getHeader(headers, name) {

  if (!headers) {
    return '';
  }

  try {

    if (typeof headers.get === 'function') {
      return headers.get(name) || '';
    }

  } catch (e) {}

  try {

    for (const key of Object.keys(headers)) {

      if (
        String(key).toLowerCase() ===
        name.toLowerCase()
      ) {
        return headers[key] || '';
      }

    }

  } catch (e) {}

  return '';
}


/* =========================================================
 * 自动捕获
 * ========================================================= */

async function handleCapture(ctx) {

  const req =
    ctx.request || {};

  const url =
    String(req.url || '');

  if (!url) {
    return;
  }

  if (
    !url.startsWith(API_URL)
  ) {
    return;
  }

  if (
    String(req.method || '').toUpperCase() !==
    'POST'
  ) {
    return;
  }

  try {

    const access =
      String(
        getHeader(
          req.headers,
          'access'
        ) || ''
      ).trim();

    const body =
      await req.json();

    if (
      !access ||
      !body ||
      body.data == null
    ) {
      return;
    }


    /*
     * 保存接口地址
     */
    ctx.storage.set(
      KEY + '.url',
      url
    );


    /*
     * 保存 access
     */
    ctx.storage.set(
      KEY + '.access',
      access
    );


    /*
     * 保存请求数据
     */
    ctx.storage.setJSON(
      KEY + '.data',
      body.data
    );


    /*
     * 保存捕获时间
     */
    ctx.storage.set(
      KEY + '.captureTime',
      String(Date.now())
    );


    /*
     * 捕获成功通知
     */
    ctx.notify({
      title: '中国广电',
      body: '已自动获取登录信息，小组件将自动更新',
      sound: false,
    });

  } catch (e) {

    console.log(
      '[ChinaBroadnet] capture error: ' +
      e
    );

  }
}


/* =========================================================
 * 数据请求
 * ========================================================= */

async function fetchData(
  ctx,
  access,
  data,
  url
) {

  const resp =
    await ctx.http.post(
      url || API_URL,
      {

        timeout: 10000,

        headers: {
          access: access,
          'Content-Type':
            'application/json',
        },

        body: {
          data: data,
        },

      }
    );


  if (
    !resp ||
    resp.status < 200 ||
    resp.status >= 300
  ) {

    throw new Error(
      `HTTP ${resp ? resp.status : 'no-response'}`
    );

  }


  return await resp.json();
}


/* =========================================================
 * 数据解析
 * ========================================================= */

function findValue(
  obj,
  keys
) {

  if (
    !obj ||
    typeof obj !== 'object'
  ) {
    return null;
  }

  for (
    const key of keys
  ) {

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


/* =========================================================
 * 话费
 *
 * 中国广电接口：
 * 374 → 3.74 元
 *
 * 接口单位为分
 * ========================================================= */

function formatFee(value) {

  if (value == null) {
    return '--';
  }

  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return String(value);
  }

  return (
    n / 100
  ).toFixed(2);

}


/* =========================================================
 * 流量
 * ========================================================= */

function formatFlow(value) {

  if (value == null) {
    return '--';
  }

  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return String(value);
  }


  /*
   * 大于等于 1GB
   */
  if (
    n >= 1024 * 1024
  ) {

    return (
      n / 1024 / 1024
    ).toFixed(2);

  }


  /*
   * MB
   */
  if (
    n >= 1024
  ) {

    return (
      n / 1024
    ).toFixed(2);

  }


  return n.toFixed(2);
}


/* =========================================================
 * 语音
 * ========================================================= */

function formatVoice(value) {

  if (value == null) {
    return '--';
  }

  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return String(value);
  }

  return n.toFixed(0);
}


/* =========================================================
 * 数据加载
 * ========================================================= */

async function loadData(ctx) {

  const url =
    ctx.storage.get(
      KEY + '.url'
    ) || API_URL;

  const access =
    ctx.storage.get(
      KEY + '.access'
    );

  const data =
    ctx.storage.getJSON(
      KEY + '.data'
    );

  const requestBody =
    ctx.storage.getJSON(
      KEY + '.requestBody'
    );


  /*
   * 尚未捕获
   */
  if (
    !access ||
    data == null
  ) {

    return {
      configured: false,
      data: null,
      error: null,
    };

  }


  try {

    const result =
      await fetchData(
        ctx,
        access,
        data,
        url,
        requestBody
      );


    if (
      !result.data
    ) {
      let detail = '';
      try {
        detail = JSON.stringify(result);
      } catch (e) {
        detail = String(result);
      }

      throw new Error(
        'API 返回异常: ' +
        (result.status != null ? 'status=' + result.status + ' ' : '') +
        (result.code != null ? 'code=' + result.code + ' ' : '') +
        detail.slice(0, 500)
      );
    }


    const user =
      result.data.userData ||
      result.data;


    const feeValue =
      findValue(
        user,
        [
          'fee',
          'balance',
          'money',
          'remainFee',
        ]
      );


    const flowValue =
      findValue(
        user,
        [
          'flow',
          'remainFlow',
          'flowRemain',
        ]
      );


    const voiceValue =
      findValue(
        user,
        [
          'voice',
          'remainVoice',
          'voiceRemain',
        ]
      );


    const resultData = {

      fee: {
        title: '剩余话费',
        value: formatFee(
          feeValue
        ),
        unit: '元',
      },

      flow: {
        title: '剩余流量',
        value: formatFlow(
          flowValue
        ),
        unit: 'MB',
      },

      voice: {
        title: '剩余语音',
        value: formatVoice(
          voiceValue
        ),
        unit: '分钟',
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

      timestamp:
        Date.now(),

    };


    /*
     * 保存最新数据
     */
    ctx.storage.setJSON(
      KEY + '.datasource',
      resultData
    );


    return {
      configured: true,
      data: resultData,
      error: null,
    };


  } catch (e) {

    console.log(
      '[ChinaBroadnet] query error: ' +
      e
    );


    /*
     * 接口失败时显示缓存
     */
    const cached =
      ctx.storage.getJSON(
        KEY + '.datasource'
      );


    return {
      configured: true,
      data: cached || null,
      error: e,
    };

  }

}


/* =========================================================
 * 顶部标题
 * ========================================================= */

function headerRow(
  title,
  data
) {

  return {

    type: 'stack',

    direction: 'row',

    alignItems: 'center',

    children: [

      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        gap: 6,

        children: [

          {
            type: 'image',

            src:
              'sf-symbol:simcard.fill',

            color:
              COLORS.accent,

            width: 17,

            height: 17,
          },

          {
            type: 'text',

            text:
              title,

            font: {
              size: 'headline',
              weight: 'semibold',
            },

            textColor:
              COLORS.value,

            maxLines: 1,

            minScale: 0.8,
          },

        ],

      },


      {
        type: 'spacer',
      },


      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        gap: 5,

        children: [

          {
            type: 'image',

            src:
              'sf-symbol:arrow.clockwise',

            color:
              COLORS.time,

            width: 12,

            height: 12,
          },

          {
            type: 'text',

            text:
              data.updateTime ||
              '--:--',

            font: {
              size: 'caption2',
            },

            textColor:
              COLORS.time,

            maxLines: 1,
          },

        ],

      },

    ],

  };

}


/* =========================================================
 * 数据胶囊
 * ========================================================= */

function makeCapsule(
  title,
  value,
  unit
) {

  return {

    type: 'stack',

    direction: 'column',

    alignItems: 'center',

    justifyContent: 'center',

    flex: 1,

    padding: [
      7,
      8,
      7,
      8,
    ],

    backgroundColor:
      COLORS.capsuleBg,

    borderRadius: 14,

    borderWidth: 1,

    borderColor:
      COLORS.border,

    children: [

      {
        type: 'text',

        text:
          title,

        font: {
          size: 'caption2',
          weight: 'medium',
        },

        textColor:
          COLORS.title,

        textAlign:
          'center',

        maxLines: 1,

        minScale: 0.7,
      },


      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        justifyContent: 'center',

        gap: 3,

        children: [

          {
            type: 'text',

            text:
              String(value),

            font: {
              size: 'title2',
              weight: 'semibold',
            },

            textColor:
              COLORS.value,

            textAlign:
              'center',

            maxLines: 1,

            minScale: 0.55,
          },


          {
            type: 'text',

            text:
              unit,

            font: {
              size: 'caption2',
            },

            textColor:
              COLORS.title,

            maxLines: 1,

            minScale: 0.7,
          },

        ],

      },

    ],

  };

}


/* =========================================================
 * 中号 / 大号
 * ========================================================= */

function buildMainWidget(
  title,
  data
) {

  return {

    type: 'widget',

    backgroundColor:
      COLORS.bg,

    padding: [
      10,
      14,
      10,
      14,
    ],

    gap: 10,

    refreshAfter:
      new Date(
        Date.now() +
        60 * 60 * 1000
      ).toISOString(),

    children: [

      headerRow(
        title,
        data
      ),


      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        gap: 8,

        children: [

          makeCapsule(
            data.fee.title,
            data.fee.value,
            data.fee.unit
          ),

          makeCapsule(
            data.voice.title,
            data.voice.value,
            data.voice.unit
          ),

          makeCapsule(
            data.flow.title,
            data.flow.value,
            data.flow.unit
          ),

        ],

      },


      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        children: [

          {
            type: 'spacer',
          },

          {
            type: 'stack',

            width: 42,

            height: 3,

            borderRadius: 2,

            backgroundColor:
              COLORS.border,
          },

          {
            type: 'spacer',
          },

        ],

      },

    ],

  };

}


/* =========================================================
 * 小组件数据行
 * ========================================================= */

function smallRow(
  color,
  symbol,
  glyph,
  value,
  unit,
  label
) {

  const iconChild =
    symbol
      ? {

          type: 'image',

          src: symbol,

          color: '#FFFFFF',

          width: 16,

          height: 16,

        }
      : {

          type: 'text',

          text: glyph,

          font: {
            size: 'headline',
            weight: 'bold',
          },

          textColor:
            '#FFFFFF',

        };


  return {

    type: 'stack',

    direction: 'row',

    alignItems: 'center',

    gap: 8,

    flex: 1,

    padding: [
      4,
      8,
      4,
      8,
    ],

    backgroundColor: {
      light: color + '1F',
      dark: color + '33',
    },

    borderRadius: 14,

    children: [

      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        justifyContent: 'center',

        width: 30,

        height: 30,

        borderRadius: 15,

        backgroundColor:
          color,

        children: [
          iconChild,
        ],

      },


      {
        type: 'stack',

        direction: 'column',

        flex: 1,

        children: [

          {
            type: 'stack',

            direction: 'row',

            alignItems: 'center',

            gap: 3,

            children: [

              {
                type: 'text',

                text:
                  String(value),

                font: {
                  size: 'title3',
                  weight: 'bold',
                },

                textColor:
                  color,

                maxLines: 1,

                minScale: 0.5,
              },

              {
                type: 'text',

                text:
                  String(unit),

                font: {
                  size: 'caption1',
                  weight: 'semibold',
                },

                textColor:
                  color,

                maxLines: 1,
              },

              {
                type: 'spacer',
              },

            ],

          },


          {
            type: 'stack',

            direction: 'row',

            alignItems: 'center',

            children: [

              {
                type: 'text',

                text:
                  String(label),

                font: {
                  size: 'caption2',
                  weight: 'medium',
                },

                textColor:
                  color + 'B3',

                maxLines: 1,

                minScale: 0.7,
              },

              {
                type: 'spacer',
              },

            ],

          },

        ],

      },

    ],

  };

}


/* =========================================================
 * 小尺寸
 * ========================================================= */

function buildSmall(
  title,
  data
) {

  return {

    type: 'widget',

    backgroundColor:
      COLORS.bg,

    padding: [
      10,
      10,
      10,
      10,
    ],

    gap: 6,

    refreshAfter:
      new Date(
        Date.now() +
        60 * 60 * 1000
      ).toISOString(),

    children: [

      smallRow(
        '#1677FF',
        null,
        '¥',
        data.fee.value,
        data.fee.unit,
        data.fee.title
      ),

      smallRow(
        '#4DA6F0',
        'sf-symbol:antenna.radiowaves.left.and.right',
        '',
        data.flow.value,
        data.flow.unit,
        data.flow.title
      ),

      smallRow(
        '#55C759',
        'sf-symbol:phone.and.waveform.fill',
        '',
        data.voice.value,
        data.voice.unit,
        data.voice.title
      ),

    ],

  };

}


/* =========================================================
 * 锁屏小组件
 * ========================================================= */

function buildLockScreen(
  title,
  data,
  family
) {

  if (
    family ===
    'accessoryInline'
  ) {

    return {

      type: 'widget',

      children: [

        {
          type: 'text',

          text:
            `${title} ` +
            `${data.fee.value}${data.fee.unit} · ` +
            `${data.flow.value}${data.flow.unit}`,

          font: {
            size: 'caption1',
            weight: 'medium',
          },

          textColor:
            COLORS.value,

          maxLines: 1,

          minScale: 0.5,
        },

      ],

    };

  }


  if (
    family ===
    'accessoryCircular'
  ) {

    return {

      type: 'widget',

      padding: 4,

      children: [

        {
          type: 'text',

          text:
            data.flow.value,

          font: {
            size: 'title2',
            weight: 'bold',
          },

          textColor:
            COLORS.value,

          textAlign:
            'center',

          maxLines: 1,

          minScale: 0.5,
        },

        {
          type: 'text',

          text:
            data.flow.unit,

          font: {
            size: 'caption2',
          },

          textColor:
            COLORS.title,

          textAlign:
            'center',

          maxLines: 1,
        },

      ],

    };

  }


  return {

    type: 'widget',

    padding: 4,

    children: [

      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        children: [

          {
            type: 'image',

            src:
              'sf-symbol:simcard.fill',

            color:
              COLORS.accent,

            width: 15,

            height: 15,
          },

          {
            type: 'text',

            text:
              `${data.fee.value}${data.fee.unit}`,

            font: {
              size: 'headline',
              weight: 'semibold',
            },

            textColor:
              COLORS.value,

            maxLines: 1,

            minScale: 0.5,
          },

        ],

      },


      {
        type: 'text',

        text:
          `${data.flow.value}${data.flow.unit}`,

        font: {
          size: 'caption1',
          weight: 'medium',
        },

        textColor:
          COLORS.title,

        maxLines: 1,

        minScale: 0.5,
      },

    ],

  };

}


/* =========================================================
 * 错误界面
 * ========================================================= */

function buildError(
  title,
  message
) {

  return {

    type: 'widget',

    backgroundColor:
      COLORS.bg,

    padding: 12,

    children: [

      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        gap: 6,

        children: [

          {
            type: 'image',

            src:
              'sf-symbol:exclamationmark.triangle.fill',

            color:
              COLORS.error,

            width: 15,

            height: 15,
          },

          {
            type: 'text',

            text:
              title,

            font: {
              size: 'headline',
              weight: 'semibold',
            },

            textColor:
              COLORS.value,

            maxLines: 1,
          },

        ],

      },


      {
        type: 'spacer',
      },


      {
        type: 'text',

        text:
          message,

        font: {
          size: 'caption1',
          weight: 'medium',
        },

        textColor:
          COLORS.title,

        textAlign:
          'center',

        maxLines: 3,

        minScale: 0.75,
      },


      {
        type: 'spacer',
      },


      {
        type: 'stack',

        direction: 'row',

        alignItems: 'center',

        children: [

          {
            type: 'spacer',
          },

          {
            type: 'stack',

            padding: [
              5,
              12,
              5,
              12,
            ],

            backgroundColor:
              COLORS.capsuleBg,

            borderRadius: 10,

            borderWidth: 1,

            borderColor:
              COLORS.border,

            children: [

              {
                type: 'text',

                text:
                  '打开广电 App 查询一次',

                font: {
                  size: 'caption2',
                  weight: 'medium',
                },

                textColor:
                  COLORS.accent,

                maxLines: 1,
              },

            ],

          },

          {
            type: 'spacer',
          },

        ],

      },

    ],

  };

}


/* =========================================================
 * Widget 主逻辑
 * ========================================================= */

async function handleWidget(ctx) {

  const title =
    '中国广电';


  const result =
    await loadData(ctx);


  const data =
    result.data;


  /*
   * 尚未捕获
   */
  if (
    !result.configured
  ) {

    return buildError(
      title,
      '请打开中国广电 App，登录后等待自动捕获'
    );

  }


  /*
   * 没有数据
   */
  if (!data) {

    return buildError(
      title,
      '数据获取失败，请重新打开中国广电 App 查询一次'
    );

  }


  const family =
    ctx.widgetFamily ||
    'systemSmall';


  /*
   * 锁屏
   */
  if (
    family.startsWith(
      'accessory'
    )
  ) {

    return buildLockScreen(
      title,
      data,
      family
    );

  }


  /*
   * 小组件
   */
  if (
    family ===
    'systemSmall'
  ) {

    return buildSmall(
      title,
      data
    );

  }


  /*
   * 中号 / 大号 / 超大号
   */
  if (
    family ===
      'systemMedium' ||
    family ===
      'systemLarge' ||
    family ===
      'systemExtraLarge'
  ) {

    return buildMainWidget(
      title,
      data
    );

  }


  return buildSmall(
    title,
    data
  );

}


/* =========================================================
 * Egern 入口
 * ========================================================= */

export default async function(ctx) {

  /*
   * HTTP Request
   * 自动捕获 access + data
   */
  if (
    ctx.request &&
    ctx.request.url
  ) {

    return handleCapture(
      ctx
    );

  }


  /*
   * Generic Widget
   */
  return handleWidget(
    ctx
  );

}