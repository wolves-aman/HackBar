/**
 * UI 冒烟测试：用 jsdom 载入 dist 里的真实产物，挂载 Vue 应用并逐个点击 Tab。
 * 目的：在没有浏览器的环境里抓出运行期错误（模板里未定义的变量、初始化异常等）。
 *
 * 运行：node scripts/smoke-ui.mjs
 */

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const errors = []
const origError = console.error
const origWarn = console.warn
console.error = (...args) => {
  errors.push(`error: ${args.map(String).join(' ')}`)
  origError(...args)
}
console.warn = (...args) => {
  errors.push(`warn: ${args.map(String).join(' ')}`)
  origWarn(...args)
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const html = readFileSync('dist/sidepanel.html', 'utf8')
const scripts = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1])
const mainScript = scripts.find((src) => src.includes('/main-'))
if (!mainScript) throw new Error('dist/sidepanel.html 里找不到 main 产物')

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/sidepanel.html',
  pretendToBeVisual: true,
})

const { window } = dom
Object.defineProperty(window.navigator, 'language', { value: 'zh-CN', configurable: true })
Object.defineProperty(window.navigator, 'languages', { value: ['zh-CN', 'zh'], configurable: true })
for (const key of [
  'document',
  'navigator',
  'location',
  'history',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Text',
  'Comment',
  'DocumentFragment',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'KeyboardEvent',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true })
}
Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true })

const makeArea = () => ({
  get: async () => ({}),
  set: async () => undefined,
  remove: async () => undefined,
})

const tab = { id: 1, url: 'https://example.com/admin?id=1', title: 'Example Admin', active: true }

globalThis.chrome = {
  storage: { local: makeArea(), session: makeArea() },
  tabs: {
    query: async () => [tab],
    get: async () => tab,
    create: async () => ({ id: 2, ...tab }),
    update: async () => tab,
    onUpdated: { addListener() {}, removeListener() {} },
    onRemoved: { addListener() {}, removeListener() {} },
    onActivated: { addListener() {}, removeListener() {} },
  },
  cookies: {
    getAll: async () => [
      { name: 'sid', value: 'abc', domain: 'example.com', path: '/', httpOnly: true, secure: true },
    ],
    set: async () => ({}),
    remove: async () => ({}),
  },
  declarativeNetRequest: {
    updateSessionRules: async () => undefined,
    getSessionRules: async () => [],
  },
  runtime: {
    getURL: (path) => `chrome-extension://test/${path}`,
    getManifest: () => ({ version: '1.0.0' }),
  },
  sidePanel: { setPanelBehavior: async () => undefined },
}

await import(pathToFileURL(`dist${mainScript}`).href)
await delay(250)

const app = document.getElementById('app')
const initial = app.innerHTML
if (!initial || initial.length < 500) throw new Error(`挂载失败，innerHTML 长度 ${initial?.length}`)
for (const expected of ['HackBar', '发送', 'Query 参数', 'Cookie']) {
  if (!initial.includes(expected)) throw new Error(`首屏缺少内容: ${expected}`)
}
console.log(`  ok  首次挂载 (${initial.length} bytes)`)

const tabs = [...document.querySelectorAll('.tab')]
if (tabs.length !== 4) throw new Error(`Tab 数量不对: ${tabs.length}`)

const seen = []
for (const button of tabs) {
  button.click()
  await delay(180)
  seen.push(button.textContent.trim())
  const current = app.innerHTML
  if (current.length < 300) throw new Error(`切到 ${button.textContent.trim()} 后内容为空`)
  if (current.includes('{{')) throw new Error('模板未编译，仍含 {{ }}')
}
console.log(`  ok  ${seen.join(' / ')} 四个 Tab 均可渲染`)

// 工具页里的具体模块
for (const marker of ['编码 / 解码', 'MD5', 'GBK', 'AES', 'JWT', '时间戳', '随机值']) {
  const button = tabs[1]
  button.click()
  await delay(60)
  if (!app.innerHTML.includes(marker)) throw new Error(`工具箱缺少: ${marker}`)
}
console.log('  ok  工具箱 7 个模块全部渲染')

// 设置页
const gear = [...document.querySelectorAll('.app-head .btn')][0]
gear.click()
await delay(120)
if (!app.innerHTML.includes('权限')) throw new Error('设置页未渲染')
console.log('  ok  设置页渲染')

// Payload 页插入 / SQLi 按钮不应抛错
document.querySelectorAll('.tab')[2].click()
await delay(120)
const sqliButtons = [...document.querySelectorAll('.chip')]
if (sqliButtons.length === 0) throw new Error('SQLi 条目未渲染')

const realErrors = errors.filter(
  (line) => !line.includes('Not implemented: navigation') && !line.includes('Could not parse CSS'),
)
if (realErrors.length) {
  throw new Error(`控制台报错:\n${realErrors.join('\n')}`)
}

console.log('  ok  控制台无报错')
console.log('\nUI 冒烟测试通过')
