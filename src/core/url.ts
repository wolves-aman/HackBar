/**
 * URL / query / form body 解析与拼接。
 * 这一层是纯函数，不依赖 chrome API，方便单测。
 */

export interface Pair {
  id: string
  key: string
  value: string
  enabled: boolean
  /** 原始串里是 `key` 而不是 `key=`，拼接时保留 */
  noValue?: boolean
}

let counter = 0
function nextId(): string {
  counter += 1
  return `pair_${counter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function makePair(key = '', value = '', enabled = true): Pair {
  return { id: nextId(), key, value, enabled }
}

export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

/** 解析 `a=1&b=2` 形式的 query 或 form body */
export function parsePairs(raw: string): Pair[] {
  const text = (raw ?? '').trim()
  if (!text) return []
  const out: Pair[] = []
  for (const chunk of text.split('&')) {
    if (chunk === '') continue
    const eq = chunk.indexOf('=')
    if (eq === -1) {
      out.push({ ...makePair(safeDecode(chunk), ''), noValue: true })
    } else {
      out.push(makePair(safeDecode(chunk.slice(0, eq)), safeDecode(chunk.slice(eq + 1))))
    }
  }
  return out
}

export function stringifyPairs(pairs: Pair[], encode: boolean): string {
  const enc = (v: string) => (encode ? encodeURIComponent(v) : v)
  return pairs
    .filter((p) => p.enabled && (p.key !== '' || p.value !== ''))
    .map((p) => {
      if (p.noValue && p.value === '') return enc(p.key)
      return `${enc(p.key)}=${enc(p.value)}`
    })
    .join('&')
}

export interface UrlParts {
  /** scheme://host/path，不含 query 和 hash */
  base: string
  query: string
  hash: string
}

export function splitUrl(raw: string): UrlParts {
  const url = (raw ?? '').trim()
  const hashIdx = url.indexOf('#')
  const beforeHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : ''
  const qIdx = beforeHash.indexOf('?')
  const base = qIdx >= 0 ? beforeHash.slice(0, qIdx) : beforeHash
  const query = qIdx >= 0 ? beforeHash.slice(qIdx + 1) : ''
  return { base, query, hash }
}

/** 补全协议，方便直接粘贴 example.com/admin 使用 */
export function normalizeUrl(raw: string): string {
  let url = (raw ?? '').trim()
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) return url
  if (/^(about|data|blob|javascript|chrome-extension):/i.test(url)) return url
  return `http://${url}`
}

export function joinUrl(parts: UrlParts, query: string): string {
  const base = parts.base
  const q = query ? `?${query}` : ''
  return `${base}${q}${parts.hash ?? ''}`
}

/** 从完整 URL 里取出 query 的 key-value */
export function pairsFromUrl(url: string): Pair[] {
  return parsePairs(splitUrl(url).query)
}

/** 用新的 key-value 替换 URL 里的 query，保留 path 与 hash */
export function applyPairsToUrl(url: string, pairs: Pair[], encode = true): string {
  const parts = splitUrl(url)
  return joinUrl(parts, stringifyPairs(pairs, encode))
}

/** 取 host（不含端口），失败返回空串 */
export function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname
  } catch {
    return ''
  }
}

export function originOf(url: string): string {
  try {
    const u = new URL(normalizeUrl(url))
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(normalizeUrl(url))
}

/** URL 里是否已有协议，用于给用户提示 */
export function hasScheme(url: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url.trim())
}
