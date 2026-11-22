/**
 * 编码 / 解码。全部同步纯函数，UI 直接调用。
 * 注意：GBK 编码依赖懒加载的反向映射表（浏览器只提供 GBK 解码器）。
 */

const utf8Encoder = new TextEncoder()

function toBytes(text: string): Uint8Array {
  return utf8Encoder.encode(text)
}

function fromBytes(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function bytesToHex(bytes: Uint8Array, upper = true): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return upper ? out.toUpperCase() : out
}

function parseHexBytes(text: string): Uint8Array {
  const clean = text.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '')
  if (clean.length % 2 !== 0) throw new Error('hex 长度必须是偶数')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/* ------------------------------- URL ------------------------------- */

export function urlEncode(text: string): string {
  return encodeURIComponent(text).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function urlDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

/* ------------------------------ Base64 ----------------------------- */

export function base64Encode(text: string): string {
  const bytes = toBytes(text)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64Decode(text: string): string {
  const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return fromBytes(bytes)
}

/* -------------------------------- Hex ------------------------------ */

export function hexEncode(text: string): string {
  return bytesToHex(toBytes(text), true)
}

export function hexDecode(text: string): string {
  return fromBytes(parseHexBytes(text))
}

/* --------------------------- HTML 实体 ----------------------------- */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
}

const NAMED_REVERSE: Record<string, string> = {
  '&': 'amp',
  '<': 'lt',
  '>': 'gt',
  '"': 'quot',
  "'": 'apos',
  '\u00a0': 'nbsp',
}

export function htmlEncode(text: string, mode: 'named' | 'dec' | 'hex' = 'named'): string {
  let out = ''
  for (const ch of text) {
    const named = NAMED_REVERSE[ch]
    if (named) {
      out += `&${named};`
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    if (code > 0x7e) {
      out += mode === 'hex' ? `&#x${code.toString(16)};` : `&#${code};`
    } else if (mode !== 'named' && code < 0x20) {
      out += mode === 'hex' ? `&#x${code.toString(16)};` : `&#${code};`
    } else {
      out += ch
    }
  }
  return out
}

export function htmlDecode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, name: string) => NAMED[name.toLowerCase()] ?? m)
}

/* ------------------------- Unicode 转义 ---------------------------- */

export function unicodeEncode(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code > 0xffff) {
      const v = code - 0x10000
      const hi = 0xd800 + (v >> 10)
      const lo = 0xdc00 + (v & 0x3ff)
      out += `\\u${hi.toString(16).padStart(4, '0')}\\u${lo.toString(16).padStart(4, '0')}`
    } else {
      out += `\\u${code.toString(16).padStart(4, '0')}`
    }
  }
  return out
}

export function unicodeDecode(text: string): string {
  return text
    .replace(/\\u\{([0-9a-f]+)\}/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

/* ------------------------------ 八进制 ----------------------------- */

export function octalEncode(text: string): string {
  let out = ''
  for (const b of toBytes(text)) out += `\\${b.toString(8).padStart(3, '0')}`
  return out
}

export function octalDecode(text: string): string {
  const bytes: number[] = []
  const re = /\\([0-7]{1,3})/g
  let m: RegExpExecArray | null
  let matched = false
  while ((m = re.exec(text))) {
    matched = true
    bytes.push(parseInt(m[1] as string, 8) & 0xff)
  }
  if (!matched) return text
  return fromBytes(new Uint8Array(bytes))
}

/* ----------------------- \xHH / \ooo 转义 -------------------------- */

export function escapeHex(text: string): string {
  let out = ''
  for (const b of toBytes(text)) {
    if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b)
    else out += `\\x${b.toString(16).padStart(2, '0')}`
  }
  return out
}

export function unescapeHex(text: string): string {
  return text
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8)))
}

export function escapeOctal(text: string): string {
  let out = ''
  for (const b of toBytes(text)) {
    if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b)
    else out += `\\${b.toString(8).padStart(3, '0')}`
  }
  return out
}

/* ------------------------ String.fromCharCode ---------------------- */

export function charCodeEncode(text: string): string {
  const codes = Array.from(toBytes(text)).join(',')
  return `String.fromCharCode(${codes})`
}

export function charCodeDecode(text: string): string {
  const nums = text.match(/-?\d+/g)
  if (!nums) return text
  const codes = nums.map(Number).filter((n) => n >= 0 && n <= 0x10ffff)
  return String.fromCodePoint(...codes)
}

/* ------------------------------ GBK -------------------------------- */

let gbkEncodeMap: Map<string, [number, number]> | null = null

function buildGbkMap(): Map<string, [number, number]> {
  if (gbkEncodeMap) return gbkEncodeMap
  const decoder = new TextDecoder('gbk')
  const map = new Map<string, [number, number]>()
  const pair = new Uint8Array(2)
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo === 0x7f) continue
      pair[0] = hi
      pair[1] = lo
      let ch = ''
      try {
        ch = decoder.decode(pair)
      } catch {
        continue
      }
      if (ch.length === 1 && ch !== '\uFFFD' && ch !== '\u0000' && !map.has(ch)) {
        map.set(ch, [hi, lo])
      }
    }
  }
  gbkEncodeMap = map
  return map
}

/** 文本 → GBK 字节 */
export function gbkBytes(text: string): Uint8Array {
  const map = buildGbkMap()
  const out: number[] = []
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x80) {
      out.push(code)
      continue
    }
    const hit = map.get(ch)
    if (hit) out.push(hit[0], hit[1])
    else out.push(0x3f) // '?'
  }
  return new Uint8Array(out)
}

export function gbkFromBytes(bytes: Uint8Array): string {
  return new TextDecoder('gbk', { fatal: false }).decode(bytes)
}

/** 文本 → GBK 百分号编码，例如 中文 → %D6%D0%CE%C4 */
export function gbkUrlEncode(text: string): string {
  return Array.from(gbkBytes(text))
    .map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('')
}

/** GBK 百分号编码 / 十六进制 → 文本 */
export function gbkUrlDecode(text: string): string {
  const hexes = text.match(/%[0-9a-fA-F]{2}|[0-9a-fA-F]{2}/g) ?? []
  const bytes = new Uint8Array(hexes.map((h) => parseInt(h.replace('%', ''), 16)))
  return gbkFromBytes(bytes)
}

/* ---------------------------- 统一注册表 --------------------------- */

export interface CodecDef {
  id: string
  encode: (text: string) => string
  decode: (text: string) => string
  /** 需要提示的额外说明（文案 key） */
  hint?: string
}

export const CODECS: CodecDef[] = [
  { id: 'url', encode: urlEncode, decode: urlDecode },
  { id: 'base64', encode: base64Encode, decode: base64Decode },
  { id: 'hex', encode: hexEncode, decode: hexDecode },
  { id: 'html', encode: (t) => htmlEncode(t, 'named'), decode: htmlDecode },
  { id: 'htmlDec', encode: (t) => htmlEncode(t, 'dec'), decode: htmlDecode },
  { id: 'htmlHex', encode: (t) => htmlEncode(t, 'hex'), decode: htmlDecode },
  { id: 'unicode', encode: unicodeEncode, decode: unicodeDecode },
  { id: 'octal', encode: octalEncode, decode: octalDecode },
  { id: 'escapeHex', encode: escapeHex, decode: unescapeHex },
  { id: 'escapeOctal', encode: escapeOctal, decode: unescapeHex },
  { id: 'charCode', encode: charCodeEncode, decode: charCodeDecode },
  { id: 'gbk', encode: gbkUrlEncode, decode: gbkUrlDecode, hint: 'gbkHint' },
]

export function getCodec(id: string): CodecDef {
  return CODECS.find((c) => c.id === id) ?? (CODECS[0] as CodecDef)
}
