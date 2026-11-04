# egern

Egern 模块集合，主要用于整理和维护个人使用的 Egern 模块。

## 中国广电小组件

**中国广电小组件**用于在 Egern 中显示中国广电用户的套餐数据，包括：

- 话费余额
- 剩余流量
- 剩余语音
- 自动获取并缓存数据
- 支持通过中国广电 App、微信或支付宝请求自动抓取数据
- 支持 Egern 小组件显示


| 版本 | 说明 | 模块 YAML | 脚本 JS |
|---|---|---|---|
| **正式版** | 日常使用版本 | [ChinaBroadnet.yaml](https://github.com/moyuzaime/egern/blob/main/ChinaBroadnet/ChinaBroadnet.yaml) · [Raw](https://raw.githubusercontent.com/moyuzaime/egern/main/ChinaBroadnet/ChinaBroadnet.yaml) | [ChinaBroadnet_Widget.js](https://github.com/moyuzaime/egern/blob/main/ChinaBroadnet/ChinaBroadnet_Widget.js) · [Raw](https://raw.githubusercontent.com/moyuzaime/egern/main/ChinaBroadnet/ChinaBroadnet_Widget.js) |


### 一键安装正式版

点击下面的链接，可直接跳转 Egern 添加正式版中国广电小组件：

**[🟢 一键安装正式版中国广电小组件](https://egernapp.com/modules/new/?name=%E4%B8%AD%E5%9B%BD%E5%B9%BF%E7%94%B5%E5%B0%8F%E7%BB%84%E4%BB%B6&url=https%3A%2F%2Fraw.githubusercontent.com%2Fmoyuzaime%2Fegern%2Fmain%2FChinaBroadnet%2FChinaBroadnet.yaml)**



如果点击无法唤起 Egern，也可以复制对应版本的 Raw YAML 链接，在 Egern 的「模块」中手动添加。

### 使用方法

2. 首次使用时，打开中国广电 App、微信或支付宝中的中国广电服务，并进入能够查询用户信息的页面。
3. 发起一次用户信息查询，Egern 即可尝试捕获相关数据。
4. 数据获取成功后，即可在对应版本的小组件中查看话费、流量和语音信息。
5. 如不需要继续抓取数据，可关闭对应模块中的数据抓取选项。

> 首次使用建议先保持数据抓取开启，并主动查询一次用户信息。

### 目录

```
.
└── ChinaBroadnet/
    ├── ChinaBroadnet.yaml
    ├── ChinaBroadnet_Widget.js
    └── JS/
        
```

### 说明

