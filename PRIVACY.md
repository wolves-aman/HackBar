# 隐私说明 / Privacy Policy

HackBar 复刻版（下称「本扩展」）不收集、不上传任何用户数据。

## 会接触哪些数据

| 数据 | 用途 | 存储位置 |
| --- | --- | --- |
| 当前标签页的 URL、标题 | 填充请求编辑器 | 仅本地 `chrome.storage.local`（草稿） |
| 目标站点的 Cookie | 载入后允许你编辑，并在发送时写回 | 浏览器 Cookie 管理器 |
| 你编辑的请求头 / 参数 / body | 构造并发送请求 | 仅本地草稿 |
| 自定义 Payload、请求头模板、主题与语言偏好 | 功能偏好 | 仅本地 |

## 不会做什么

- 不向任何第三方服务器发送数据（除了**你自己在面板里指定并点击发送的目标站点**）
- 不做统计、埋点、遥测
- 不读取与当前操作无关的标签页内容
- 不修改页面 DOM，不注入 content script

## 权限用途

- `host_permissions: <all_urls>`：在任意测试目标上载入与重放请求
- `cookies`：读写目标站点 Cookie，使重放请求带上你编辑后的登录态
- `declarativeNetRequest`：修改重放请求的请求头（Referer / User-Agent / 自定义头）
- `storage`：本地保存草稿、模板、自定义 payload 与设置
- `tabs`：获取当前标签页 URL/标题，并在其上导航
- `sidePanel` / `devtools_page`：提供侧边栏与 DevTools 面板入口

## 数据保留

草稿与自定义内容保存在本机 `chrome.storage.local`，卸载扩展即被浏览器清除。本扩展没有任何服务端。

## 联系

在仓库 issue 中反馈即可。
