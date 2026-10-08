# egern

Egern 模块集合，主要用于整理和维护个人使用的 Egern 模块。

## 中国广电小组件

**中国广电小组件**用于在 Egern 中显示中国广电用户的套餐数据，包括：

- 话费余额
- 剩余流量
- 剩余语音
- 自动获取并缓存数据
- 支持通过中国广电 App 请求自动抓取数据
- 支持 Egern 小组件显示

### 模块地址

将下面的链接添加到 Egern 的「模块」中即可：

https://raw.githubusercontent.com/moyuzaime/egern/main/ChinaBroadnet/ChinaBroadnet.yaml

### 模块文件

- 模块配置：`ChinaBroadnet/ChinaBroadnet.yaml`
- 小组件脚本：`ChinaBroadnet/ChinaBroadnet_Widget.js`

小组件脚本地址：

https://raw.githubusercontent.com/moyuzaime/egern/main/ChinaBroadnet/ChinaBroadnet_Widget.js

### 使用方法

1. 在 Egern 中添加上面的中国广电模块。
2. 打开中国广电 App，并进入能够查询用户信息的页面。
3. Egern 会通过请求捕获获取相关数据。
4. 数据获取成功后，即可在 Egern 小组件中查看话费、流量和语音信息。
5. 如果不需要继续抓取数据，可以关闭模块中的「中国广电数据抓取」选项。

> 首次使用时建议先保持数据抓取开启，并在中国广电 App 中主动查询一次用户信息。

## 目录

```
.
└── ChinaBroadnet/
    ├── ChinaBroadnet.yaml
    └── ChinaBroadnet_Widget.js
```

## 说明

本项目中的模块主要面向 Egern 使用。模块及脚本会根据实际接口和 Egern 版本持续调整，如果出现无法抓取数据、接口返回异常或小组件无法显示等问题，可以检查 Egern 的脚本日志以及中国广电 App 是否成功发起用户信息查询请求。
