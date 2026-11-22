/**
 * AES 加解密、JWT 解析、时间戳转换。
 */

export type KeyFormat = 'utf8' | 'hex'
export type AesMode = 'CBC' | 'GCM'
export type DataFormat = 'base64' | 'hex'

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (clean.length % 2 !== 0) throw new Error('hex 长度必须是偶数')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function encodeBytes(bytes: Uint8Array, format: DataFormat): string {
  return format === 'hex' ? bytesToHex(bytes) : bytesToBase64(bytes)
}

function decodeBytes(text: string, format: DataFormat): Uint8Array {
  return format === 'hex' ? hexToBytes(text) : base64ToBytes(text)
}

function keyBytes(key: string, format: KeyFormat): Uint8Array {
  return format === 'hex' ? hexToBytes(key) : new TextEncoder().encode(key)
}

function ivBytes(iv: string, format: KeyFormat): Uint8Array {
  const bytes = iv ? keyBytes(iv, format) : crypto.getRandomValues(new Uint8Array(16))
  if (bytes.length !== 16) throw new Error('IV 必须是 16 字节')
  return bytes
}

export interface AesOptions {
  key: string
  keyFormat: KeyFormat
  iv: string
  ivFormat: KeyFormat
  mode: AesMode
  output: DataFormat
}

/** WebCrypto 要求 ArrayBuffer 视图，这里复制成裸 ArrayBuffer，规避 TS 的 SharedArrayBuffer 兼容提示 */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export async function aesEncrypt(text: string, options: AesOptions): Promise<string> {
  const rawKey = keyBytes(options.key, options.keyFormat)
  if (![16, 24, 32].includes(rawKey.length)) {
    throw new Error('密钥长度必须是 16 / 24 / 32 字节（AES-128/192/256）')
  }
  const iv = ivBytes(options.iv, options.ivFormat)
  const algo = options.mode === 'GCM' ? { name: 'AES-GCM', iv: toBuffer(iv) } : { name: 'AES-CBC', iv: toBuffer(iv) }
  const cryptoKey = await crypto.subtle.importKey('raw', toBuffer(rawKey), algo.name, false, ['encrypt'])
  const data = new TextEncoder().encode(text)
  const encrypted = await crypto.subtle.encrypt(algo, cryptoKey, data)
  return encodeBytes(new Uint8Array(encrypted), options.output)
}

export async function aesDecrypt(text: string, options: AesOptions): Promise<string> {
  const rawKey = keyBytes(options.key, options.keyFormat)
  if (![16, 24, 32].includes(rawKey.length)) {
    throw new Error('密钥长度必须是 16 / 24 / 32 字节（AES-128/192/256）')
  }
  const iv = ivBytes(options.iv, options.ivFormat)
  const algo = options.mode === 'GCM' ? { name: 'AES-GCM', iv: toBuffer(iv) } : { name: 'AES-CBC', iv: toBuffer(iv) }
  const cryptoKey = await crypto.subtle.importKey('raw', toBuffer(rawKey), algo.name, false, ['decrypt'])
  const data = decodeBytes(text.trim(), options.output)
  const decrypted = await crypto.subtle.decrypt(algo, cryptoKey, toBuffer(data))
  return new TextDecoder('utf-8', { fatal: false }).decode(decrypted)
}

/* -------------------------------- JWT ------------------------------ */

export interface JwtDecoded {
  ok: boolean
  header: unknown
  payload: unknown
  signature: string
  headerRaw: string
  payloadRaw: string
  error?: string
}

function base64UrlDecode(text: string): string {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

export function decodeJwt(token: string): JwtDecoded {
  const empty: JwtDecoded = {
    ok: false,
    header: null,
    payload: null,
    signature: '',
    headerRaw: '',
    payloadRaw: '',
  }
  const parts = token.trim().split('.')
  if (parts.length < 2) return { ...empty, error: '不是合法的 JWT（至少需要 2 段）' }
  try {
    const headerRaw = base64UrlDecode(parts[0] as string)
    const payloadRaw = base64UrlDecode(parts[1] as string)
    return {
      ok: true,
      header: JSON.parse(headerRaw),
      payload: JSON.parse(payloadRaw),
      signature: parts[2] ?? '',
      headerRaw,
      payloadRaw,
    }
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : '解码失败' }
  }
}

export const JWT_TIME_CLAIMS = ['exp', 'iat', 'nbf'] as const

/* ----------------------------- 时间戳 ------------------------------ */

export interface TimeInfo {
  seconds: number
  millis: number
  iso: string
  local: string
  utc: string
  relative: string
}

function relativeFrom(ms: number): string {
  const diff = ms - Date.now()
  const abs = Math.abs(diff)
  const units: [number, string][] = [
    [1000, '秒'],
    [60_000, '分'],
    [3_600_000, '小时'],
    [86_400_000, '天'],
  ]
  let idx = 0
  for (let i = 0; i < units.length; i++) {
    if (abs >= (units[i] as [number, string])[0]) idx = i
  }
  const [unit, label] = units[idx] as [number, string]
  const value = Math.round(abs / unit)
  return diff >= 0 ? `${value} ${label}后` : `${value} ${label}前`
}

export function timeInfo(ms: number): TimeInfo {
  return {
    seconds: Math.floor(ms / 1000),
    millis: ms,
    iso: new Date(ms).toISOString(),
    local: new Date(ms).toLocaleString(),
    utc: new Date(ms).toUTCString(),
    relative: relativeFrom(ms),
  }
}

/** 智能解析：纯数字按秒/毫秒判断，其他交给 Date.parse */
export function parseTimeInput(input: string): number | null {
  const text = input.trim()
  if (!text) return null
  if (/^\d+$/.test(text)) {
    const num = Number(text)
    // 10 位及以下按秒，13 位按毫秒
    return text.length <= 10 ? num * 1000 : num
  }
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : parsed
}
