/**
 * 发送编排：Cookie 写入 → DNR 头注入 → 导航 / 表单提交 / fetch 渲染。
 * 只在扩展页面里调用（side panel / devtools panel）。
 */

import { normalizeUrl, stringifyPairs } from '../core/url'
import { sessionSet } from '../core/storage'
import type { CookieRow, Draft } from './types'

export type SendMode = 'get' | 'form' | 'fetch'

export interface SendOutcome {
  ok: boolean
  mode: SendMode
  tabId: number
  injected: string[]
  skipped: string[]
  cookieWrites: number
  cookieRemoves: number
  ruleId?: number
  error?: string
}

/** 浏览器受控、DNR 改不了（或改了会坏）的头 */
export const SKIP_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'keep-alive',
  'expect',
  'proxy-connection',
])

interface PendingRule {
  ruleId: number
  matchUrl: string
  timer: number
}

const pending = new Map<number, PendingRule[]>()

async function removeRules(entries: PendingRule[]): Promise<void> {
  for (const entry of entries) clearTimeout(entry.timer)
  if (entries.length === 0) return
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: entries.map((entry) => entry.ruleId),
    })
  } catch {
    /* 标签页已关闭等情况忽略 */
  }
}

export async function cleanupTab(tabId: number): Promise<void> {
  const entries = pending.get(tabId)
  if (!entries?.length) return
  pending.delete(tabId)
  await removeRules(entries)
}

if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return
    const entries = pending.get(tabId)
    if (!entries?.length) return
    const current = changeInfo.url ?? ''
    const done = entries.filter((entry) => !current || sameUrl(current, entry.matchUrl))
    if (done.length === 0) return
    const rest = entries.filter((entry) => !done.includes(entry))
    if (rest.length) pending.set(tabId, rest)
    else pending.delete(tabId)
    void removeRules(done)
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    const entries = pending.get(tabId)
    if (!entries) return
    pending.delete(tabId)
    for (const entry of entries) clearTimeout(entry.timer)
  })
}

function sameUrl(a: string, b: string): boolean {
  const strip = (u: string) => u.split('#')[0]
  return strip(a) === strip(b)
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function headerOps(
  headers: { name: string; value: string }[],
  extraSkip: Set<string>,
): { ops: { header: string; operation: 'set'; value: string }[]; skipped: string[] } {
  const ops: { header: string; operation: 'set'; value: string }[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  for (const h of headers) {
    const name = h.name.trim()
    if (!name) continue
    const lower = name.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    if (SKIP_HEADERS.has(lower) || extraSkip.has(lower) || lower === 'cookie') {
      skipped.push(name)
      continue
    }
    ops.push({ header: lower, operation: 'set', value: h.value })
  }
  return { ops, skipped }
}

interface CookieSyncResult {
  written: number
  removed: number
}

async function syncCookies(
  url: string,
  rows: CookieRow[],
  baseline: CookieRow[],
): Promise<CookieSyncResult> {
  const keyOf = (c: { name: string; domain?: string; path?: string }) =>
    `${c.name}|${c.domain ?? ''}|${c.path ?? '/'}`
  const baseMap = new Map(baseline.map((c) => [keyOf(c), c]))
  const keep = new Set<string>()
  let written = 0
  let removed = 0

  for (const row of rows) {
    if (!row.enabled || !row.name) continue
    keep.add(keyOf(row))
    const before = baseMap.get(keyOf(row))
    if (before && before.value === row.value) continue
    const details: chrome.cookies.SetDetails = {
      url,
      name: row.name,
      value: row.value,
      path: row.path || '/',
    }
    if (row.domain) details.domain = row.domain
    if (row.secure) details.secure = true
    if (row.httpOnly) details.httpOnly = true
    try {
      await chrome.cookies.set(details)
      written += 1
    } catch {
      /* 单条失败不影响整体 */
    }
  }

  for (const before of baseline) {
    if (keep.has(keyOf(before))) continue
    try {
      await chrome.cookies.remove({ url, name: before.name })
      removed += 1
    } catch {
      /* ignore */
    }
  }

  return { written, removed }
}

export async function sendRequest(
  draft: Draft,
  currentTabId: number | null,
  cookieBaseline: CookieRow[],
): Promise<SendOutcome> {
  const baseOutcome: SendOutcome = {
    ok: false,
    mode: 'get',
    tabId: -1,
    injected: [],
    skipped: [],
    cookieWrites: 0,
    cookieRemoves: 0,
  }

  let url = ''
  try {
    url = new URL(normalizeUrl(draft.url)).toString()
  } catch {
    return { ...baseOutcome, error: 'bad-url' }
  }
  if (!/^https?:/i.test(url)) {
    return { ...baseOutcome, error: 'bad-url' }
  }

  const method = draft.method.toUpperCase()
  const bodyMode = draft.bodyMode

  let mode: SendMode
  if (method === 'GET' || method === 'HEAD') mode = 'get'
  else if (method === 'POST' && (bodyMode === 'urlencoded' || bodyMode === 'multipart')) mode = 'form'
  else mode = 'fetch'

  // GET 带表单字段：并进 query
  if (mode === 'get' && bodyMode === 'urlencoded' && draft.bodyPairs.length > 0) {
    const extra = stringifyPairs(draft.bodyPairs, true)
    if (extra) url += (url.includes('?') ? '&' : '?') + extra
  }

  // 目标标签页
  let tabId: number
  if (draft.target === 'current' && currentTabId !== null) {
    tabId = currentTabId
  } else {
    const created = await chrome.tabs.create({ url: 'about:blank', active: true })
    if (created.id === undefined) return { ...baseOutcome, error: 'no-tab' }
    tabId = created.id
  }

  // Cookie 同步
  const cookieResult = await syncCookies(url, draft.cookies, cookieBaseline)

  const enabledHeaders = draft.headers
    .filter((h) => h.enabled && h.key.trim() !== '')
    .map((h) => ({ name: h.key, value: h.value }))

  let injected: string[] = []
  let skipped: string[] = []
  let ruleId: number | undefined

  if (mode === 'get' || mode === 'form') {
    const extraSkip = new Set<string>()
    if (mode === 'form') extraSkip.add('content-type')
    if (mode === 'get') extraSkip.add('content-type')
    const { ops, skipped: skippedNames } = headerOps(enabledHeaders, extraSkip)
    skipped = skippedNames

    if (ops.length > 0) {
      ruleId = Math.floor(Math.random() * 1_000_000_000) + 1
      const matchUrl = url.split('#')[0]
      const rule: chrome.declarativeNetRequest.Rule = {
        id: ruleId,
        priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: ops },
        condition: {
          tabIds: [tabId],
          regexFilter: `^${escapeRegex(matchUrl)}$`,
          resourceTypes: ['main_frame'],
        },
      }
      try {
        await chrome.declarativeNetRequest.updateSessionRules({ addRules: [rule] })
      } catch {
        // regex 不被接受时退化成正则无关的子串匹配
        const fallback: chrome.declarativeNetRequest.Rule = {
          ...rule,
          condition: { tabIds: [tabId], urlFilter: matchUrl, resourceTypes: ['main_frame'] },
        }
        try {
          await chrome.declarativeNetRequest.updateSessionRules({ addRules: [fallback] })
        } catch {
          ruleId = undefined
        }
      }
      injected = ops.map((o) => o.header)
      if (ruleId !== undefined) {
        const timer = setTimeout(() => void cleanupTab(tabId), 30_000) as unknown as number
        const entries = pending.get(tabId) ?? []
        entries.push({ ruleId, matchUrl, timer })
        pending.set(tabId, entries)
      }
    }
  } else {
    // fetch 分支由 replay 页自己设头，不需要 DNR
    const { skipped: skippedNames } = headerOps(enabledHeaders, new Set())
    skipped = skippedNames
    injected = enabledHeaders
      .filter((h) => !skippedNames.includes(h.name))
      .map((h) => h.name.toLowerCase())
  }

  // 导航
  if (mode === 'get') {
    await chrome.tabs.update(tabId, { url })
  } else {
    const sessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const fields = draft.bodyPairs
      .filter((p) => p.enabled && p.key.trim() !== '')
      .map((p) => ({ name: p.key, value: p.value }))

    if (mode === 'form') {
      await sessionSet(`hb.replay.${sessionId}`, {
        kind: 'form',
        url,
        enctype:
          bodyMode === 'multipart'
            ? 'multipart/form-data'
            : 'application/x-www-form-urlencoded',
        fields,
      })
    } else {
      const headers = enabledHeaders.filter(
        (h) => !skipped.includes(h.name) && h.name.toLowerCase() !== 'host',
      )
      if (!headers.some((h) => h.name.toLowerCase() === 'content-type')) {
        const ct =
          bodyMode === 'json'
            ? 'application/json'
            : bodyMode === 'urlencoded'
              ? 'application/x-www-form-urlencoded'
              : 'text/plain;charset=UTF-8'
        headers.push({ name: 'Content-Type', value: ct })
      }
      const body =
        bodyMode === 'json' || bodyMode === 'raw'
          ? draft.rawBody
          : bodyMode === 'urlencoded'
            ? stringifyPairs(draft.bodyPairs, true)
            : ''
      await sessionSet(`hb.replay.${sessionId}`, {
        kind: 'fetch',
        url,
        method,
        headers,
        body,
      })
    }

    await chrome.tabs.update(tabId, {
      url: `${chrome.runtime.getURL('replay.html')}?s=${sessionId}`,
    })
  }

  return {
    ok: true,
    mode,
    tabId,
    injected,
    skipped,
    cookieWrites: cookieResult.written,
    cookieRemoves: cookieResult.removed,
    ruleId,
  }
}

/* ------------------------- 从标签页载入 ------------------------- */

export interface TabSnapshot {
  url: string
  referer: string
  userAgent: string
  cookies: CookieRow[]
  title: string
}

export async function readCookiesForUrl(url: string): Promise<CookieRow[]> {
  try {
    const list = await chrome.cookies.getAll({ url })
    return list.map((c) => ({
      id: `${c.name}_${c.domain}_${c.path}`,
      name: c.name,
      value: c.value,
      enabled: true,
      domain: c.domain,
      path: c.path,
      httpOnly: c.httpOnly,
      secure: c.secure,
    }))
  } catch {
    return []
  }
}

export async function snapshotTab(tabId: number): Promise<TabSnapshot | null> {
  try {
    const tab = await chrome.tabs.get(tabId)
    const url = tab.url ?? ''
    if (!/^https?:/i.test(url)) return null
    return {
      url,
      referer: url,
      userAgent: navigator.userAgent,
      cookies: await readCookiesForUrl(url),
      title: tab.title ?? url,
    }
  } catch {
    return null
  }
}
