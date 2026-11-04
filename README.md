# egern

个人使用的 Egern 模块集合：**中国联通小组件** 与 **中国广电小组件**。

两者都支持 App / 微信与支付宝小程序自动抓取、三种显示样式、今日流量估算、锁屏组件与自动重试；数据只保存在本机，不经过任何第三方服务器。

## 模块一览

| 模块 | 说明 | 一键安装 | Raw YAML |
|---|---|---|---|
| 中国联通小组件 | 话费余额、通用/定向流量、语音、今日流量 | [安装](https://egernapp.com/modules/new/?name=%E4%B8%AD%E5%9B%BD%E8%81%94%E9%80%9A%E5%B0%8F%E7%BB%84%E4%BB%B6&url=https%3A%2F%2Fraw.githubusercontent.com%2Fmoyuzaime%2Fegern%2Fmain%2FChinaUnicom%2FChinaUnicom.yaml) | [ChinaUnicom.yaml](https://raw.githubusercontent.com/moyuzaime/egern/main/ChinaUnicom/ChinaUnicom.yaml) |
| 中国广电小组件 | 话费余额、剩余流量、语音、今日流量 | [安装](https://egernapp.com/modules/new/?name=%E4%B8%AD%E5%9B%BD%E5%B9%BF%E7%94%B5%E5%B0%8F%E7%BB%84%E4%BB%B6&url=https%3A%2F%2Fraw.githubusercontent.com%2Fmoyuzaime%2Fegern%2Fmain%2FChinaBroadnet%2FChinaBroadnet.yaml) | [ChinaBroadnet.yaml](https://raw.githubusercontent.com/moyuzaime/egern/main/ChinaBroadnet/ChinaBroadnet.yaml) |

## 功能

**数据抓取**
- 抓取即用：打开对应 App 或小程序查询一次，组件自动读取，无需填 Cookie 或密码
- 联通支持小程序余量页（通用 / 定向分项）与 App 明细接口，两者互为兜底
- 抓取类开关关闭后不再发请求，仅展示最后一次缓存

**显示**
- 三种样式，模块参数切换：
  - `classic` 经典卡片：流量大数字 + 环形用量 + 今日曲线
  - `dash` 仪表盘版：四宫格（话费 / 流量 / 今日 / 语音）+ 趋势条
  - `ios` iOS 风格：同心圆环 + 明细列表
- 小号 / 中号 / 大号 + 三种锁屏尺寸
- 页头统一显示「缓存 x 分钟前 · 凭据保持 x」；数据超过 24 小时转告警色并标注「数据已过期」

**其他**
- 今日流量：以昨日最后一个采样点为 00:00 基线，跨天第一次刷新即可出数
- 自动刷新：数据新鲜 15 分钟一次，过期后 2 分钟重试；错误页 5 分钟自动重试
- 组件不支持「下拉刷新」（iOS 组件没有该手势），刷新由系统按 `refreshAfter` 调度
- 需要立刻取数时：Egern「工具 → 脚本」运行「中国联通小组件」/「中国广电小组件」（不带组件尺寸运行时即手动刷新），会强制查询一次并通知结果
- 联通可选：通用 / 定向流量是否计入统计

## 使用

1. 用上面的「安装」链接导入模块（或复制 Raw YAML 到 Egern「模块」手动添加）
2. 按提示安装并信任 Egern 的 CA 证书（抓取依赖 MITM）
3. 首次使用打开 App 或小程序，进入能查询余额 / 流量的页面并查询一次
4. 抓到数据后即可在主屏或锁屏添加组件；不需要继续抓取时关闭「数据抓取」

> 联通用小程序「余量查询」页可拿到通用 / 定向分项；广电用 App 查询即可。

## 参数

**中国联通**

| 参数 | 默认 | 说明 |
|---|---|---|
| `cuCapture` | `true` | App 抓取开关 |
| `cuMiniCapture` | `true` | 小程序响应解析开关 |
| `cuCaptureNotice` | `true` | 捕获成功通知 |
| `cuPlanNotice` | `true` | 套餐查询成功通知 |
| `cuGeneralFlow` | `true` | 流量统计包含通用流量 |
| `cuDirectionalFlow` | `true` | 流量统计包含定向流量，并显示定向余量 |
| `cuUiStyle` | `classic` | 显示样式：`classic` / `dash` / `ios` |
| `cuDebug` | `false` | 打印接口响应结构与关键字段（不含手机号 / 票据） |

**中国广电**

| 参数 | 默认 | 说明 |
|---|---|---|
| `cbCapture` | `true` | 抓取开关（App / 微信 / 支付宝） |
| `cbCaptureNotice` | `true` | 捕获成功通知 |
| `cbPlanNotice` | `true` | 套餐查询成功通知 |
| `cbKeepaliveInterval` | `15` | 保活间隔（分钟，15–1440） |
| `cbDebug` | `false` | 打印接口结构诊断日志 |
| `cbUiStyle` | `classic` | 显示样式：`classic` / `dash` / `ios` |

## 目录结构

```
.
├── ChinaUnicom/
│   ├── ChinaUnicom.yaml          # 联通模块
│   ├── ChinaUnicom_Widget.js     # 联通脚本
│   └── README.md                 # 联通模块说明
└── ChinaBroadnet/
    ├── ChinaBroadnet.yaml        # 广电模块
    └── ChinaBroadnet_Widget.js   # 广电脚本
```

## 数据与隐私

- 所有数据仅保存在 Egern 本机存储（`unicom.*` / `ChinaBroadnet.*`）
- 抓取时只保留数值字段，不保存订单号、票据、手机号密文等敏感字段
- 抓取需要 MITM 以下域名：
  - 联通：`m.client.10010.com`、`mina.10010.com`、`mxx.client.10010.com`
  - 广电：`app.10099.com.cn`、`wx.10099.com.cn`、`zfb.10099.com.cn`

## 常见问题

**组件显示「请打开 App 查询一次」**
还没抓到凭据。按使用步骤 3 打开 App / 小程序查询一次即可。

**联通没有总量 / 使用率**
只有首页大球数据时拿不到总量，打开一次小程序「余量查询」页即可补全。

**今日流量一直是「采集中」**
跨天后需要至少一次刷新；若长时间无变化，检查「数据抓取」开关是否被关闭、凭据是否过期。

**切换样式没生效**
模块参数保存后请刷新组件（或等下一次自动刷新），组件有渲染缓存。

**下拉刷新组件没反应**
iOS 主屏幕组件没有下拉刷新手势，刷新时机由系统按脚本返回的 `refreshAfter` 决定（Egern 不会在你下拉时重跑脚本）。需要立即更新时，用「工具 → 脚本」运行手动刷新脚本，或删除组件重新添加触发一次渲染。

**数据不更新**
下拉刷新会强制重新查询；仍不更新时确认 App 登录状态与网络。

## 致谢

- 联通小程序抓取协议参考 [Testplayers/unicom-mini-ha](https://github.com/Testplayers/unicom-mini-ha) 与 [IBL3ND/module](https://github.com/IBL3ND/module)
- 仪表盘版与 iOS 版布局参考 [zhaohantao1360-hash/Hark](https://github.com/zhaohantao1360-hash/Hark) 的中国移动小组件
- 广电抓取协议基于上游 `wuhuhuuuu` 的脚本整理
