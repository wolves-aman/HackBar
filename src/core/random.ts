/**
 * 随机值生成。
 */

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGIT = '0123456789'
const SYMBOL = '!@#$%^&*()-_=+[]{};:,.<>?'

function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] as number) % maxExclusive
}

export function randomString(length: number, charset = LOWER + UPPER + DIGIT): string {
  let out = ''
  for (let i = 0; i < length; i++) out += charset[randomInt(charset.length)]
  return out
}

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function randomNumber(min: number, max: number): number {
  if (max <= min) return min
  const range = max - min + 1
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return min + ((buf[0] as number) % range)
}

export function randomIp(v6 = false): string {
  if (v6) {
    const parts = Array.from(crypto.getRandomValues(new Uint16Array(8)), (n) =>
      n.toString(16),
    )
    return parts.join(':')
  }
  return Array.from({ length: 4 }, () => randomNumber(1, 254)).join('.')
}

export function randomPort(): number {
  return randomNumber(1024, 65535)
}

export function randomPassword(length = 16): string {
  return randomString(length, LOWER + UPPER + DIGIT + SYMBOL)
}

export function randomHex(length: number): string {
  return randomString(length, '0123456789abcdef')
}

export interface RandomOptions {
  kind: 'string' | 'number' | 'uuid' | 'ipv4' | 'ipv6' | 'port' | 'password' | 'hex'
  length: number
  min: number
  max: number
}

export function generateRandom(options: RandomOptions): string {
  switch (options.kind) {
    case 'number':
      return String(randomNumber(options.min, options.max))
    case 'uuid':
      return uuid()
    case 'ipv4':
      return randomIp(false)
    case 'ipv6':
      return randomIp(true)
    case 'port':
      return String(randomPort())
    case 'password':
      return randomPassword(options.length)
    case 'hex':
      return randomHex(options.length)
    case 'string':
    default:
      return randomString(options.length)
  }
}
