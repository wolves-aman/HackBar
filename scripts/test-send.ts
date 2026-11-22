/**
 * 发送编排测试：用假的 chrome API 记录调用，验证分支选择、DNR 规则、Cookie 同步。
 * 运行：node scripts/test-send.ts
 */

import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { makePair } from '../src/core/url.ts'
import type { CookieRow, Draft } from '../src/app/types.ts'

interface Recorded {
  rules: chrome.declarativeNetRequest.Rule[]
  removedRuleIds: number[]
  updates: { tabId: number; url: string }[]
  cookieSets: chrome.cookies.SetDetails[]
  cookieRemoves: { url: string; name: string }[]
  session: Record<string, unknown>
  created: number
}

const recorded: Recorded = {
  rules: [],
  removedRuleIds: [],
  updates: [],
  cookieSets: [],
  cookieRemoves: [],
  session: {},
  created: 0,
}

const area = {
  get: async () => ({}),
  set: async (items: Record<string, unknown>) => {
    Object.assign(recorded.session, items)
  },
  remove: async () => undefined,
}

// @ts-expect-error 测试用最小 stub
globalThis.chrome = {
  storage: { local: area, session: area },
  tabs: {
    create: async () => {
      recorded.created += 1
      return { id: 99 }
    },
    update: async (tabId: number, props: { url?: string }) => {
      recorded.updates.push({ tabId, url: props.url ?? '' })
      return {}
    },
    get: async () => ({ id: 1, url: 'https://example.com/', title: 't' }),
    onUpdated: { addListener() {} },
    onRemoved: { addListener() {} },
  },
  cookies: {
    set: async (details: chrome.cookies.SetDetails) => {
      recorded.cookieSets.push(details)
      return {}
    },
    remove: async (details: { url: string; name: string }) => {
      recorded.cookieRemoves.push({ url: details.url, name: details.name })
      return {}
    },
  },
  declarativeNetRequest: {
    updateSessionRules: async (options: {
      addRules?: chrome.declarativeNetRequest.Rule[]
      removeRuleIds?: number[]
    }) => {
      if (options.addRules) recorded.rules.push(...options.addRules)
      if (options.removeRuleIds) recorded.removedRuleIds.push(...options.removeRuleIds)
    },
  },
  runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
}

const { sendRequest } = await import('../src/app/send.ts')

const baseDraft = (): Draft => ({
  method: 'GET',
  url: 'https://example.com/api?id=1',
  query: [makePair('id', '1')],
  bodyMode: 'none',
  bodyPairs: [],
  rawBody: '',
  headers: [
    makePair('Referer', 'https://example.com/'),
    makePair('User-Agent', 'HB-Test'),
    makePair('X-Trace', 'abc'),
    makePair('Host', 'evil.com'),
  ],
  cookies: [],
  autoEncode: true,
  target: 'current',
})

let passed = 0
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

function reset(): void {
  recorded.rules = []
  recorded.removedRuleIds = []
  recorded.updates = []
  recorded.cookieSets = []
  recorded.cookieRemoves = []
  recorded.session = {}
  recorded.created = 0
}

/* 1. GET：DNR 注入 + 当前标签导航 */
reset()
await check('GET 走 DNR + tabs.update', async () => {
  const outcome = await sendRequest(baseDraft(), 1, [])
  assert.equal(outcome.ok, true)
  assert.equal(outcome.mode, 'get')
  assert.equal(recorded.rules.length, 1)
  const rule = recorded.rules[0]!
  assert.equal(rule.action.type, 'modifyHeaders')
  const headers = (rule.action as chrome.declarativeNetRequest.ModifyHeadersAction).requestHeaders ?? []
  const names = headers.map((h) => h.header)
  assert.deepEqual(names.sort(), ['referer', 'user-agent', 'x-trace'])
  assert.equal(rule.condition.tabIds?.[0], 1)
  assert.equal(recorded.updates[0]!.url, 'https://example.com/api?id=1')
  assert.equal(outcome.skipped.includes('Host'), true)
})

/* 2. 新标签：先建 tab 再用它的 id */
reset()
await check('新标签模式先建 tab', async () => {
  const draft = baseDraft()
  draft.target = 'new'
  const outcome = await sendRequest(draft, 1, [])
  assert.equal(recorded.created, 1)
  assert.equal(outcome.tabId, 99)
  assert.equal(recorded.updates[0]!.tabId, 99)
})

/* 3. POST urlencoded：表单分支 + content-type 跳过 */
reset()
await check('POST urlencoded 走 form 分支', async () => {
  const draft = baseDraft()
  draft.method = 'POST'
  draft.bodyMode = 'urlencoded'
  draft.bodyPairs = [makePair('user', 'admin'), makePair('pass', 'p@ss')]
  draft.headers.push(makePair('Content-Type', 'application/x-www-form-urlencoded'))
  const outcome = await sendRequest(draft, 1, [])
  assert.equal(outcome.mode, 'form')
  assert.equal(recorded.rules.length, 1)
  const headers = (recorded.rules[0]!.action as chrome.declarativeNetRequest.ModifyHeadersAction)
    .requestHeaders ?? []
  assert.equal(headers.some((h) => h.header === 'content-type'), false)
  const replayKey = Object.keys(recorded.session).find((key) => key.startsWith('hb.replay.'))
  assert.ok(replayKey)
  const payload = recorded.session[replayKey!] as {
    kind: string
    enctype: string
    fields: { name: string; value: string }[]
  }
  assert.equal(payload.kind, 'form')
  assert.equal(payload.enctype, 'application/x-www-form-urlencoded')
  assert.deepEqual(payload.fields.map((f) => f.name), ['user', 'pass'])
  assert.match(recorded.updates[0]!.url, /^chrome-extension:\/\/test\/replay\.html\?s=/)
})

/* 4. POST JSON：fetch 分支，不建 DNR，body 原样传 */
reset()
await check('POST JSON 走 fetch 分支', async () => {
  const draft = baseDraft()
  draft.method = 'POST'
  draft.bodyMode = 'json'
  draft.rawBody = '{"a":1}'
  const outcome = await sendRequest(draft, 1, [])
  assert.equal(outcome.mode, 'fetch')
  assert.equal(recorded.rules.length, 0)
  const replayKey = Object.keys(recorded.session).find((key) => key.startsWith('hb.replay.'))
  const payload = recorded.session[replayKey!] as {
    kind: string
    method: string
    body: string
    headers: { name: string; value: string }[]
  }
  assert.equal(payload.kind, 'fetch')
  assert.equal(payload.method, 'POST')
  assert.equal(payload.body, '{"a":1}')
  assert.ok(payload.headers.some((h) => h.name.toLowerCase() === 'content-type' && h.value === 'application/json'))
})

/* 5. PUT 无 body：走 fetch，不当 GET 导航 */
reset()
await check('PUT 走 fetch 分支', async () => {
  const draft = baseDraft()
  draft.method = 'PUT'
  const outcome = await sendRequest(draft, 1, [])
  assert.equal(outcome.mode, 'fetch')
})

/* 6. GET + urlencoded body 合并进 query */
reset()
await check('GET 的 body 合并进 query', async () => {
  const draft = baseDraft()
  draft.bodyMode = 'urlencoded'
  draft.bodyPairs = [makePair('extra', '2')]
  await sendRequest(draft, 1, [])
  assert.equal(recorded.updates[0]!.url, 'https://example.com/api?id=1&extra=2')
})

/* 7. Cookie 同步：改写 / 新增 / 删除 */
reset()
await check('Cookie 差异同步', async () => {
  const baseline: CookieRow[] = [
    { id: '1', name: 'sid', value: 'old', enabled: true, domain: 'example.com', path: '/' },
    { id: '2', name: 'gone', value: 'x', enabled: true, domain: 'example.com', path: '/' },
    { id: '3', name: 'keep', value: 'same', enabled: true, domain: 'example.com', path: '/' },
  ]
  const draft = baseDraft()
  draft.cookies = [
    { id: '1', name: 'sid', value: 'new', enabled: true, domain: 'example.com', path: '/' },
    { id: '3', name: 'keep', value: 'same', enabled: true, domain: 'example.com', path: '/' },
    { id: '4', name: 'added', value: '1', enabled: true, path: '/' },
  ]
  const outcome = await sendRequest(draft, 1, baseline)
  assert.equal(outcome.cookieWrites, 2)
  assert.equal(outcome.cookieRemoves, 1)
  assert.deepEqual(recorded.cookieSets.map((c) => c.name).sort(), ['added', 'sid'])
  assert.deepEqual(recorded.cookieRemoves.map((c) => c.name), ['gone'])
})

/* 8. 非法 URL 直接拒绝 */
reset()
await check('坏 URL 被拒绝', async () => {
  const draft = baseDraft()
  draft.url = 'javascript:alert(1)'
  const outcome = await sendRequest(draft, 1, [])
  assert.equal(outcome.ok, false)
  assert.equal(outcome.error, 'bad-url')
  assert.equal(recorded.updates.length, 0)
})

/* 9. 没有可注入头时不建规则 */
reset()
await check('无自定义头时不建 DNR 规则', async () => {
  const draft = baseDraft()
  draft.headers = []
  const outcome = await sendRequest(draft, 1, [])
  assert.equal(recorded.rules.length, 0)
  assert.equal(outcome.ok, true)
})

/* 10. 持久化前必须去掉 Vue Proxy，否则 chrome.storage 会把数组写成对象 */
reset()
await check('storageSet 写入纯数组（回归：headers 不可迭代）', async () => {
  const { storageSet } = await import('../src/core/storage.ts')
  const state = reactive({ headers: [{ key: 'a', value: '1' }], query: [] as unknown[] })
  await storageSet('test.key', { headers: state.headers, query: state.query })
  const stored = recorded.session['test.key'] as { headers: unknown; query: unknown }
  assert.ok(Array.isArray(stored.headers), 'headers 必须存成数组')
  assert.ok(Array.isArray(stored.query), 'query 必须存成数组')
  assert.equal((stored.headers as unknown[]).length, 1)
})

console.log(`\n${passed} send checks passed`)
