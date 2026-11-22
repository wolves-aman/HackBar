import type { Pair } from '../core/url'

export type BodyMode = 'none' | 'urlencoded' | 'multipart' | 'json' | 'raw'
export type TargetMode = 'current' | 'new'
export type ThemeMode = 'auto' | 'dark' | 'light'
export type LangMode = 'auto' | 'zh' | 'en'

export interface CookieRow {
  id: string
  name: string
  value: string
  enabled: boolean
  domain?: string
  path?: string
  httpOnly?: boolean
  secure?: boolean
}

export interface Draft {
  method: string
  url: string
  query: Pair[]
  bodyMode: BodyMode
  bodyPairs: Pair[]
  rawBody: string
  headers: Pair[]
  cookies: CookieRow[]
  autoEncode: boolean
  target: TargetMode
}

export interface HeaderTemplate {
  id: string
  name: string
  headers: { name: string; value: string }[]
}

export interface CustomPayloadItem {
  id: string
  value: string
  note?: string
}

export interface CustomPayloadGroup {
  id: string
  name: string
  items: CustomPayloadItem[]
}

export interface Settings {
  lang: LangMode
  theme: ThemeMode
  templates: HeaderTemplate[]
}

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

export const DEFAULT_HEADERS: { name: string; value: string }[] = [
  { name: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
]
