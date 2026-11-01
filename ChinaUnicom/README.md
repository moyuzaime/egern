# 中国联通

此目录用于存放中国联通小组件及相关配置文件。

## 文件

| 文件 | 作用 |
| --- | --- |
| `ChinaUnicom.yaml` | 主模块：小组件 + 联通 App 抓取（`m.client.10010.com`） |
| `ChinaUnicom_Widget.js` | 两个模块共用的脚本（generic / http_request / http_response 三种角色） |
| `ChinaUnicom.Mini.yaml` | 可选模块：微信小程序抓取（`mina.10010.com`），需与主模块一起安装 |

## 微信小程序抓取

- 小程序首页的 `POST /wxapplet/weixinNew/sspbigball` 一次返回话费、流量、语音，字段与 App 接口同名（`feePersent` / `flowPersent` / `voicePersent` / `newUnit` / `dynamic*Title`），所以脚本直接复用了 App 端的解析逻辑。
- 只做**响应被动解析**，不重放请求：不需要 openid、RSA 加密或任何登录凭据。打开小程序查一次，小组件就会更新。
- 这个小模块会把 `mina.10010.com` 加进 MITM 列表。如果微信没有信任 Egern 的 CA，小程序可能打不开——此时不要安装小程序模块即可，主模块不受影响。
- 覆盖范围仅限首页余量（话费/流量/语音）。流量/语音的**分项明细**在小程序里走 `mxx.client.10010.com`，需要「微营业厅」Cookie，暂未支持。`sspbalcbroadcast`（可用话费/本月消费/欠费/结转）目前只存档不展示。

## 致谢

小程序接口协议（RSA 加密的 `openid`、`sspbigball` 返回结构、请求头要求）由 **Testplayers** 在 [Cyborg2017/ha_unicom_bill#5](https://github.com/Cyborg2017/ha_unicom_bill/issues/5) 与 [Testplayers/unicom-mini-ha](https://github.com/Testplayers/unicom-mini-ha) 中完整逆向并公开；本项目仅参考其协议结论，代码为独立实现。
