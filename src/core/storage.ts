/**
 * chrome.storage 包装：本地持久化 + 会话级临时数据（replay 配置）。
 * 写入前统一 clonePlain，避免 Proxy 被序列化成对象（见 core/util.ts）。
 */

import { clonePlain } from './util'

const local: chrome.storage.StorageArea | null =
  typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null
const session: chrome.storage.StorageArea | null =
  typeof chrome !== 'undefined' && chrome.storage?.session ? chrome.storage.session : null

export const KEYS = {
  draft: 'hb.draft.v1',
  settings: 'hb.settings.v1',
  customPayloads: 'hb.payloads.v1',
  headerTemplates: 'hb.templates.v1',
} as const

function fallbackGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  if (!local) return fallbackGet(key, fallback)
  try {
    const result = await local.get(key)
    return (result[key] as T) ?? fallback
  } catch {
    return fallback
  }
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  const plain = clonePlain(value)
  if (!local) {
    try {
      localStorage.setItem(key, JSON.stringify(plain))
    } catch {
      /* ignore quota errors */
    }
    return
  }
  try {
    await local.set({ [key]: plain })
  } catch {
    /* ignore */
  }
}

export async function sessionSet(key: string, value: unknown): Promise<void> {
  const area = session ?? local
  if (!area) return
  try {
    await area.set({ [key]: clonePlain(value) })
  } catch {
    /* ignore */
  }
}

export async function sessionGet<T>(key: string): Promise<T | null> {
  const area = session ?? local
  if (!area) return null
  try {
    const result = await area.get(key)
    return (result[key] as T) ?? null
  } catch {
    return null
  }
}

export async function sessionRemove(key: string): Promise<void> {
  const area = session ?? local
  if (!area) return
  try {
    await area.remove(key)
  } catch {
    /* ignore */
  }
}
