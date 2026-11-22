/**
 * 全局状态：单例 reactive，组件直接引用。
 * 这里 deliberately 不引入 Pinia —— 面板只有一棵组件树。
 */

import { computed, reactive, ref, watch } from 'vue'
import type { BodyMode, CookieRow, Draft, Settings } from './types'
import { makePair, pairsFromUrl, parsePairs, splitUrl, joinUrl, stringifyPairs } from '../core/url'
import { KEYS, storageGet, storageSet } from '../core/storage'
import { normalizeCookies, normalizePairs, normalizeTemplates } from '../core/draft'
import { debounce, uid } from '../core/util'
import { detectLang, translate, type Lang } from '../core/i18n'
import { readCookiesForUrl, sendRequest, snapshotTab, type SendOutcome } from './send'
import { DEFAULT_HEADERS } from './types'

export type ListKind = 'query' | 'body'

export const draft = reactive<Draft>({
  method: 'GET',
  url: '',
  query: [],
  bodyMode: 'none',
  bodyPairs: [],
  rawBody: '',
  headers: DEFAULT_HEADERS.map((h) => makePair(h.name, h.value)),
  cookies: [],
  autoEncode: true,
  target: 'current',
})

export const settings = reactive<Settings>({
  lang: 'auto',
  theme: 'auto',
  templates: [],
})

export const runtime = reactive({
  tabId: null as number | null,
  tabUrl: '',
  tabTitle: '',
  ready: false,
  sending: false,
  outcome: null as SendOutcome | null,
  messages: [] as { id: string; text: string; level: 'info' | 'error' | 'ok' }[],
})

export const cookieBaseline = ref<CookieRow[]>([])
export const selected = ref<{ kind: ListKind; id: string } | null>(null)
export const activeTab = ref<'request' | 'tools' | 'sqli' | 'payload' | 'settings'>('request')

export const lang = computed<Lang>(() => {
  if (settings.lang === 'auto') return detectLang()
  return settings.lang
})

export function t(key: string, vars?: Record<string, string | number>): string {
  return translate(lang.value, key, vars)
}

export function notify(text: string, level: 'info' | 'error' | 'ok' = 'info'): void {
  runtime.messages.unshift({ id: uid('msg'), text, level })
  runtime.messages = runtime.messages.slice(0, 30)
}

export function clearMessages(): void {
  runtime.messages = []
}

/* ------------------------------ URL 同步 ---------------------------- */

/** 用户手改 URL 输入框 → 重新解析 query 表格 */
export function onUrlInput(value: string): void {
  draft.url = value
  const parsed = pairsFromUrl(value)
  // 输入过程中保持行 id 稳定，减少光标/焦点跳动
  const sameShape =
    parsed.length === draft.query.length &&
    parsed.every((p, i) => p.key === draft.query[i]?.key && p.value === draft.query[i]?.value)
  if (!sameShape) draft.query = parsed
}

/** 表格改动 → 回写 URL 文本 */
export function syncUrlFromQuery(): void {
  const parts = splitUrl(draft.url)
  draft.url = joinUrl(parts, stringifyPairs(draft.query, draft.autoEncode))
}

export function addQueryPair(): void {
  draft.query.push(makePair('', ''))
  syncUrlFromQuery()
}

export function addBodyPair(): void {
  draft.bodyPairs.push(makePair('', ''))
}

export function removePair(kind: ListKind, id: string): void {
  const list = kind === 'query' ? draft.query : draft.bodyPairs
  const idx = list.findIndex((p) => p.id === id)
  if (idx >= 0) list.splice(idx, 1)
  if (kind === 'query') syncUrlFromQuery()
  if (selected.value?.id === id) selected.value = null
}

export function setBodyMode(mode: BodyMode): void {
  const previous = draft.bodyMode
  draft.bodyMode = mode
  if (mode === 'urlencoded' && previous !== 'urlencoded') {
    if (draft.bodyPairs.length === 0 && draft.rawBody.trim()) {
      draft.bodyPairs = parsePairs(draft.rawBody)
    }
  }
  if (mode === 'none') {
    draft.method = draft.method === 'POST' ? 'GET' : draft.method
  }
}

/* --------------------------- 标签页 / Cookie ------------------------ */

const devtoolsTabId = (() => {
  const raw = new URLSearchParams(location.search).get('tabId')
  const num = raw ? Number(raw) : NaN
  return Number.isFinite(num) && num > 0 ? num : null
})()

export async function refreshTab(): Promise<void> {
  try {
    if (devtoolsTabId !== null) {
      const tab = await chrome.tabs.get(devtoolsTabId)
      runtime.tabId = tab.id ?? null
      runtime.tabUrl = tab.url ?? ''
      runtime.tabTitle = tab.title ?? ''
      return
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    runtime.tabId = tab?.id ?? null
    runtime.tabUrl = tab?.url ?? ''
    runtime.tabTitle = tab?.title ?? ''
  } catch {
    runtime.tabId = null
  }
}

export async function loadFromTab(): Promise<void> {
  if (runtime.tabId === null) {
    await refreshTab()
  }
  if (runtime.tabId === null) {
    notify(t('err.noTab'), 'error')
    return
  }
  const snapshot = await snapshotTab(runtime.tabId)
  if (!snapshot) {
    notify(t('err.noTab'), 'error')
    return
  }
  draft.url = snapshot.url
  draft.query = pairsFromUrl(snapshot.url)
  cookieBaseline.value = snapshot.cookies
  draft.cookies = snapshot.cookies.map((c) => ({ ...c, id: uid('ck') }))

  const ensured: { name: string; value: string }[] = [
    { name: 'Referer', value: snapshot.url },
    { name: 'User-Agent', value: snapshot.userAgent },
  ]
  for (const item of ensured) {
    const existing = draft.headers.find((h) => h.key.toLowerCase() === item.name.toLowerCase())
    if (existing) existing.value = item.value
    else draft.headers.push(makePair(item.name, item.value))
  }
  notify(t('headers.autoFilled'), 'ok')
}

export async function reloadCookies(): Promise<void> {
  if (!draft.url) {
    notify(t('send.noUrl'), 'error')
    return
  }
  const cookies = await readCookiesForUrl(draft.url)
  cookieBaseline.value = cookies
  draft.cookies = cookies.map((c) => ({ ...c, id: uid('ck') }))
  notify(t('cookies.count', { n: cookies.length }), 'ok')
}

/* -------------------------------- 发送 ------------------------------ */

export async function send(): Promise<void> {
  if (runtime.sending) return
  if (!draft.url.trim()) {
    notify(t('send.noUrl'), 'error')
    return
  }
  runtime.sending = true
  try {
    const outcome = await sendRequest(draft, runtime.tabId, cookieBaseline.value)
    runtime.outcome = outcome
    if (!outcome.ok) {
      notify(t('send.failed') + ' · ' + (outcome.error ?? ''), 'error')
      return
    }
    const parts = [t('send.done')]
    if (outcome.injected.length) parts.push(t('send.injected', { n: outcome.injected.length }))
    if (outcome.cookieWrites) parts.push(t('send.cookiesWritten', { n: outcome.cookieWrites }))
    if (outcome.cookieRemoves) parts.push(t('send.cookiesRemoved', { n: outcome.cookieRemoves }))
    if (outcome.ruleId) parts.push(t('send.ruleCreated', { id: outcome.ruleId }))
    if (outcome.skipped.length) parts.push(t('send.headerSkipped', { n: outcome.skipped.length }))
    parts.push(
      outcome.mode === 'fetch' ? t('send.fetchMode') : t('send.formSubmit'),
    )
    notify(parts.join(' · '), 'ok')
  } catch (err) {
    notify(`${t('send.failed')} · ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    runtime.sending = false
  }
}

/* ------------------------------ 持久化 ------------------------------ */

const persistDraft = debounce(() => {
  void storageSet(KEYS.draft, {
    method: draft.method,
    url: draft.url,
    query: draft.query,
    bodyMode: draft.bodyMode,
    bodyPairs: draft.bodyPairs,
    rawBody: draft.rawBody,
    headers: draft.headers,
    cookies: draft.cookies,
    autoEncode: draft.autoEncode,
    target: draft.target,
  })
}, 400)

const persistSettings = debounce(() => {
  void storageSet(KEYS.settings, {
    lang: settings.lang,
    theme: settings.theme,
    templates: settings.templates,
  })
}, 300)

export async function initState(): Promise<void> {
  const savedSettings = await storageGet<unknown>(KEYS.settings, null)
  if (savedSettings && typeof savedSettings === 'object') {
    const raw = savedSettings as Partial<Settings>
    settings.lang = raw.lang === 'zh' || raw.lang === 'en' ? raw.lang : 'auto'
    settings.theme =
      raw.theme === 'dark' || raw.theme === 'light' ? raw.theme : 'auto'
    settings.templates = normalizeTemplates(raw.templates)
  }

  const savedDraft = await storageGet<unknown>(KEYS.draft, null)
  if (savedDraft && typeof savedDraft === 'object') {
    const raw = savedDraft as Partial<Draft> & { headers?: unknown }
    draft.method = typeof raw.method === 'string' ? raw.method : 'GET'
    draft.url = typeof raw.url === 'string' ? raw.url : ''
    draft.query = normalizePairs(raw.query)
    draft.bodyMode =
      raw.bodyMode === 'urlencoded' ||
      raw.bodyMode === 'multipart' ||
      raw.bodyMode === 'json' ||
      raw.bodyMode === 'raw'
        ? raw.bodyMode
        : 'none'
    draft.bodyPairs = normalizePairs(raw.bodyPairs)
    draft.rawBody = typeof raw.rawBody === 'string' ? raw.rawBody : ''
    draft.headers = normalizePairs(raw.headers)
    if (draft.headers.length === 0) {
      draft.headers = DEFAULT_HEADERS.map((h) => makePair(h.name, h.value))
    }
    draft.cookies = normalizeCookies(raw.cookies)
    draft.autoEncode = raw.autoEncode !== false
    draft.target = raw.target === 'new' ? 'new' : 'current'
  }

  watch(draft, persistDraft, { deep: true })
  watch(settings, persistSettings, { deep: true })

  // 把修复后的数据立刻写回，避免下次启动再读一遍坏结构
  persistDraft()
  persistSettings()

  await refreshTab()
  runtime.ready = true
}
