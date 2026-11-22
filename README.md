# HackBar 复刻版

Chrome / Edge（Manifest V3）上的 Web 安全测试插件：**请求重放 + 编解码工具箱 + SQLi 语句生成器**。

侧边栏和 DevTools 面板共用同一套界面与状态，改完参数直接发送，响应交给浏览器原生渲染。

> 本项目是从零实现的独立作品，与浏览器扩展 HackBar 的原作者/维护者无关；命名只是为了说明它面向同一类工作流。

---

## 功能

### 请求重放

- **载入当前页**：一键带出 URL、query 参数、Referer、User-Agent、全部 Cookie（含 HttpOnly）
- **粘贴请求**：自动识别 bash / cmd 两种 cURL 写法，以及 Burp / DevTools 复制出来的原始 HTTP 报文
- **参数表格**：query 与 form body 都支持增删、单行启用/禁用、上下移、自动 URL 编码
- **请求头编辑**：键值表 + 常用头模板（可保存 / 删除）
- **Cookie 编辑**：逐条修改、新增、删除，发送前写入浏览器
- **发送目标**：当前标签 / 新标签，可切换
- **最终请求预览**：发送前核对将注入的头、Cookie 变更、被跳过的受控头

发送分支（按 method + Content-Type 自动选择）：

| 条件 | 实现 | 地址栏 | 自定义头 |
| --- | --- | --- | --- |
| GET / HEAD | `chrome.tabs.update` 导航 | 目标 URL | DNR 注入 |
| POST + `application/x-www-form-urlencoded` | 隐藏表单真实提交 | 目标 URL | DNR 注入 |
| POST + `multipart/form-data` | 隐藏表单真实提交（纯文本字段） | 目标 URL | DNR 注入 |
| JSON / Raw / 其他 method | replay 页内 `fetch` + 沙箱 iframe 渲染 | `chrome-extension://…` | fetch 直接设置 |

### 工具箱

- 编码解码：URL、Base64、Hex、HTML 实体（命名/十进制/十六进制）、`\uXXXX`、八进制、`\xHH`、`String.fromCharCode`、GBK 百分号编码
- 哈希：MD5（纯 JS，不走网络）、SHA-1 / SHA-256 / SHA-384 / SHA-512
- 字符串变换：大小写、反转、去重、排序、前后缀、逐行编码、行合并等
- 随机值：UUID、随机串、整数、IPv4/IPv6、端口、密码、Hex
- AES 加解密：CBC / GCM，密钥 16/24/32 字节，支持 utf8/hex 密钥与 IV，输出 base64/hex
- JWT 解析：header / payload / 过期时间（不校验签名）
- 时间戳：秒/毫秒/ISO/本地/UTC/相对时间互转

### SQLi 生成器

按 MySQL / PostgreSQL / MSSQL / SQLite 生成：版本、导库、导表、导列、UNION SELECT、报错注入、DIOS、当前查询、时间盲注、布尔盲注；支持「补前导单引号」「补 `-- -`」「空格转内联注释」。

生成结果可一键插入到**当前选中的参数行**（先在请求页点一下那个参数输入框）。

### Payload 库

内置 SQLi / XSS / 命令注入 / LFI / SSRF / SSTI / 反弹 Shell 分组，支持搜索；自定义分组与条目存本地，可导出/导入 JSON。

---

## 安装

环境要求：**Node.js ≥ 22.18** + npm（构建用 Vite 8；测试脚本用到 Node 的 TS 类型剥离）。

```bash
npm install
npm run build
```

然后打开 `chrome://extensions`（Edge 为 `edge://extensions`）→ 打开「开发者模式」→「加载已解压的扩展程序」→ 选择本仓库的 **`dist`** 目录。

想生成可分发的 zip：`npm run pack`，产物在 `release/hackbar-clone-v1.0.0.zip`（`release/` 与 `dist/` 都不入库，可从 GitHub Releases 下载）。

打开方式：

- 点击工具栏图标 → 侧边栏
- `F12` → 顶部标签里的 **HackBar**

### 快捷键

| 快捷键 | 动作 |
| --- | --- |
| `Alt + A` | 载入当前页 |
| `Alt + X` | 发送 |

---

## 使用流程

1. 打开目标页面，点「载入当前页」把 URL / 头 / Cookie 带进面板
2. 在 Query / Body 表格里改参数；需要特殊头就展开「请求头」加
3. 展开「最终请求预览」核对一遍
4. 点「发送」；表单分支地址栏会停在目标 URL，JSON 分支会跳到扩展页并显示响应
5. 编码 / SQLi / Payload 在对应标签页里用，结果可插回参数行

---

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `<all_urls>` | 任意站点载入与重放 |
| `tabs` | 读取当前标签的 URL / 标题，导航发送 |
| `cookies` | 读取与写入目标站点 Cookie（含 HttpOnly） |
| `storage` | 本地保存草稿、模板、自定义 payload、设置 |
| `sidePanel` | 侧边栏入口 |
| `declarativeNetRequest` / `declarativeNetRequestWithHostAccess` | 给重放请求注入 Referer / User-Agent / 自定义头 |
| `devtools_page` | DevTools 面板入口 |

所有数据都只存在本机，不会上传到任何服务器（详见 [PRIVACY.md](./PRIVACY.md)）。

---

## 已知限制

这些限制来自浏览器，不是实现遗漏：

1. **从当前页载入拿不到 POST body**。扩展没有网络抓包权限，body 需要手填或粘 cURL / 原始报文。
2. **SameSite 严格的站点可能掉登录态**。表单提交与导航由扩展发起，Chrome 可能按跨站处理 `SameSite=Lax/Strict` 的 Cookie。
3. **JSON 分支地址栏是 `chrome-extension://`**。响应里相对路径资源靠注入 `<base>` 兜底；目标页脚本会被剥离（扩展页 CSP 也不允许执行），因此只看响应内容，不当作正常浏览。
4. **部分请求头改不了**。`Host`、`Content-Length`、`Connection` 等浏览器受控头会在预览里标黄并跳过。
5. **Cookie 头不走 DNR**，而是通过 `chrome.cookies` 写入浏览器，再靠同站导航带上。
6. **multipart 只支持文本字段**，文件上传请用 Raw 分支自行构造。
7. **GBK 编码首次使用**会构建反向映射表，约 100ms。
8. **没有请求历史 / 集合 / 环境变量**（按需求确认过不做）。

---

## 目录结构

```
hackbar/
├─ public/
│  ├─ manifest.json          # MV3 清单
│  ├─ icon/                  # 16/32/48/128 图标（scripts/gen_icons.py 生成）
│  └─ _locales/              # 商店名称与描述的中英文案
├─ src/
│  ├─ core/                  # 纯函数层，无 chrome 依赖，可单独测试
│  │  ├─ url.ts              # query 解析 / URL 拼接
│  │  ├─ curl.ts             # cURL 与原始报文解析
│  │  ├─ encode.ts           # 编解码（含 GBK）
│  │  ├─ hash.ts             # MD5 + SHA
│  │  ├─ crypto-tools.ts     # AES / JWT / 时间戳
│  │  ├─ sqli.ts             # SQLi 语句生成
│  │  ├─ payloads.ts         # 内置 payload 字典
│  │  ├─ string-ops.ts       # 字符串变换
│  │  ├─ random.ts           # 随机值
│  │  ├─ storage.ts          # chrome.storage 包装
│  │  └─ i18n.ts             # 中英字典
│  ├─ app/                   # Vue 应用（侧边栏 + DevTools 面板共用）
│  │  ├─ App.vue
│  │  ├─ state.ts            # 全局状态与动作
│  │  ├─ send.ts             # 发送编排：Cookie → DNR → 导航
│  │  └─ components/         # 请求编辑、工具箱、SQLi、Payload、设置
│  ├─ replay/                # 真正发请求的扩展页（表单提交 / fetch 渲染）
│  ├─ devtools/              # 注册 DevTools 面板
│  └─ background/            # service worker（图标行为 + 清理残留规则）
├─ scripts/
│  ├─ test-core.ts           # 核心纯函数自测（44 项，Node 直接跑 TS）
│  ├─ test-send.ts           # 发送编排测试（9 项，假 chrome API 记录调用）
│  ├─ smoke-ui.mjs           # jsdom 挂载 dist 产物，逐个 Tab 点一遍
│  ├─ gen_icons.py           # 图标生成
│  ├─ pack.py                # 打包 zip（含清单完整性校验）
│  └─ vite-patch.cjs         # 构建期补丁，见下
└─ dist/                     # npm run build 产物，直接加载
```

---

## 开发

```bash
npm run dev        # Vite dev server，只用于调 UI（chrome.* API 不可用）
npm run build      # 产出 dist/
npm run typecheck  # tsc --noEmit
npm run test       # 核心纯函数自测（44 项）
npm run test:send  # 发送编排测试（9 项）
npm run test:ui    # jsdom 挂载 dist 产物做 UI 冒烟
npm run test:all   # 上面三项一起跑
npm run icons      # 重新生成图标
npm run pack       # 打包 release/*.zip
```

> `scripts/vite-patch.cjs`：Vite 在 Windows 上会执行 `net use` 探测网络盘，某些受控环境（沙箱 / CI）禁止带管道的子进程会直接 `EPERM`。该补丁只短路这一条命令，其余行为不变；在普通环境下也是安全的，可以保留。

核心逻辑都在 `src/core/`，不依赖任何 chrome API，所以 `npm run test` 直接用 Node 跑 TS 源码即可。

---

## 开源协议

[MIT](./LICENSE) © HackBar Reborn contributors

欢迎提 issue / PR。提交前请先跑一遍 `npm run typecheck && npm run test:all`。

---

## 免责声明

本插件面向**你自己的站点**或**已获得书面授权的测试目标**。使用者需自行承担因未授权测试导致的一切后果。
