# 中国联通

此目录用于存放中国联通小组件及相关配置文件。

## 文件

| 文件 | 作用 |
| --- | --- |
| `ChinaUnicom.yaml` | 模块：小组件 + 联通 App 抓取 + 微信小程序抓取（已合并，无需再装小程序模块） |
| `ChinaUnicom_Widget.js` | 脚本，被 `generic`（组件、手动刷新）/ `http_request` / `http_response` 三种角色共用 |

## 数据来源

| 来源 | 域名 | 内容 |
| --- | --- | --- |
| 联通 App | `m.client.10010.com` | Cookie + `desmobiel`，用于主动查询 `queryUserInfoSeven` |
| 小程序首页 | `mina.10010.com` | `sspbigball` 大球（话费/流量/语音）、`queryGoodsList` 手机号、`sspbalcbroadcast` 账户总览 |
| 小程序余量页 | `mxx.client.10010.com` | 通用/其他流量明细、语音与短信余量（字段最全，含使用率、日租宝已用量） |
| 小程序账户页 | `mina.10010.com` | 账户余额、本月实时话费、月初结转、欠费 |

组件取值优先级：余量明细 > 首页大球；话费优先用「账户当前可用余额」。

小程序请求凭据保存在 `unicom_mini_req_bigball` / `unicom_mini_req_detail`（完整 URL、关键请求头、原始 body），仅用于重放取数，不参与 App 接口。

## 使用

打开联通 App 的余量/套餐页，或微信「中国联通」小程序的「余量查询」页查询一次即可自动捕获，无需手动填写任何凭据。

模块参数：

| 参数 | 说明 |
| --- | --- |
| `cuCapture` | App 抓取开关（关闭后 App 侧不写入数据） |
| `cuMiniCapture` | 小程序解析与重放开关（关闭后不解析响应、也不重放） |
| `cuCaptureNotice` | 捕获成功通知 |
| `cuPlanNotice` | 套餐查询成功通知 |

## 关于 MITM

模块的 MITM 包含 `m.client.10010.com`、`mina.10010.com`、`mxx.client.10010.com` 三个域名。如果微信没有信任 Egern 的 CA，小程序页面可能加载失败——把 `cuMiniCapture` 关掉只是停止解析，若要让 MITM 也生效不了，需要自行从模块里移除 `mina` / `mxx` 两个域名。

小程序部分做两件事：**被动解析响应**入库，以及**保存原始请求凭据**（完整 URL、关键请求头、密文 body）。没有 App 凭据时，组件按原样重放这些请求取数——请求体本来就是服务端下发的密文，原样重放就不需要自己实现 openid / RSA 签名。凭据超过 12 小时视为过期，不再重放，回落到纯缓存展示。

> 小程序会话与 App 会话按域隔离：`mina` / `mxx` 的 Cookie 不能用于 `m.client.10010.com`，所以重放只针对小程序自己的接口，不会（也无法）冒充 App 登录态。

## 致谢

小程序接口协议（RSA 加密的 `openid`、`sspbigball` 返回结构、请求头要求）由 **Testplayers** 在 [Cyborg2017/ha_unicom_bill#5](https://github.com/Cyborg2017/ha_unicom_bill/issues/5) 与 [Testplayers/unicom-mini-ha](https://github.com/Testplayers/unicom-mini-ha) 中完整逆向并公开；本项目仅参考其协议结论，代码为独立实现。

## 手动刷新

在 Egern「工具 → 脚本」中在脚本列表运行「中国联通小组件」（不带组件尺寸），会强制查询一次并弹出结果通知（不依赖组件刷新节奏）。

## 测试

冒烟测试在仓库根目录，用 Node 直接跑（mock 的 Egern 运行时，不访问真实接口）：

```bash
node test/unicom-mini-replay.smoke.mjs
```

覆盖：小程序请求捕获、被动解析、原样重放、重放失败回落、有 App 凭据时不重放、凭据过期、开关关闭、3 样式 × 4 尺寸渲染。最近一次结果见仓库根目录 [README.md](../README.md#测试)。

> 改动约定：直接提交 `main`；每次改动会在模块 YAML 的 `description` 里写入「更新时间」，模块页可见。
