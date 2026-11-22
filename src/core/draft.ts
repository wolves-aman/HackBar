/**
 * 草稿数据的容错与修复。
 *
 * 历史原因：chrome.storage 会把 Vue 的响应式数组（Proxy）序列化成
 * `{"0":{...},"1":{...}}` 这种对象，读回来 `Array.isArray` 为 false，
 * 于是 `for...of` 和 `.map()` 都会炸。这里统一做兼容还原。
 */

import { uid } from './util'
import type { Pair } from './url'

/** 接受数组、类数组对象、数字键对象；其它情况返回空数组 */
export function coerceArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => record[key]) as T[]
    }
  }
  return []
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** 还原 key-value 行（query / body / headers） */
export function normalizePairs(value: unknown): Pair[] {
  return coerceArray<Record<string, unknown>>(value)
    .filter((item) => item !== null && typeof item === 'object')
    .map((item) => ({
      id: text(item.id) || uid('pair'),
      key: typeof item.key === 'string' ? item.key : String(item.key ?? ''),
      value: typeof item.value === 'string' ? item.value : String(item.value ?? ''),
      enabled: item.enabled !== false,
      ...(item.noValue ? { noValue: true } : {}),
    }))
}

export interface CookieLike {
  id: string
  name: string
  value: string
  enabled: boolean
  domain?: string
  path?: string
  httpOnly?: boolean
  secure?: boolean
}

/** 还原 Cookie 行 */
export function normalizeCookies(value: unknown): CookieLike[] {
  return coerceArray<Record<string, unknown>>(value)
    .filter((item) => item !== null && typeof item === 'object')
    .map((item) => ({
      id: text(item.id) || uid('ck'),
      name: String(item.name ?? ''),
      value: String(item.value ?? ''),
      enabled: item.enabled !== false,
      domain: typeof item.domain === 'string' ? item.domain : undefined,
      path: typeof item.path === 'string' ? item.path : '/',
      httpOnly: Boolean(item.httpOnly),
      secure: Boolean(item.secure),
    }))
}

export interface HeaderTemplateLike {
  id: string
  name: string
  headers: { name: string; value: string }[]
}

/** 还原请求头模板列表 */
export function normalizeTemplates(value: unknown): HeaderTemplateLike[] {
  return coerceArray<Record<string, unknown>>(value)
    .filter((item) => item !== null && typeof item === 'object')
    .map((item) => ({
      id: text(item.id) || uid('tpl'),
      name: text(item.name) || 'template',
      headers: coerceArray<Record<string, unknown>>(item.headers)
        .filter((header) => header !== null && typeof header === 'object')
        .map((header) => ({
          name: String(header.name ?? '').trim(),
          value: String(header.value ?? ''),
        }))
        .filter((header) => header.name !== ''),
    }))
}
