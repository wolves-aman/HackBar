/**
 * 粘贴解析：cURL 命令（bash / cmd 两种格式）以及原始 HTTP 报文。
 * 纯函数，无 chrome 依赖。
 */

export interface ParsedRequest {
  method: string
  url: string
  headers: { name: string; value: string }[]
  body: string
  source: 'curl' | 'raw'
  warnings: string[]
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']

/** 去除换行转义后按 shell 规则分词 */
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let started = false
  let i = 0
  type Mode = 'plain' | 'single' | 'double'
  let mode: Mode = 'plain'

  const push = () => {
    if (started || cur !== '') tokens.push(cur)
    cur = ''
    started = false
  }

  while (i < input.length) {
    const ch = input[i] as string

    if (mode === 'single') {
      if (ch === "'") mode = 'plain'
      else cur += ch
      i += 1
      continue
    }

    if (mode === 'double') {
      if (ch === '"') {
        mode = 'plain'
        i += 1
      } else if (ch === '\\' && i + 1 < input.length) {
        const next = input[i + 1] as string
        if (next === '"' || next === '\\' || next === '$' || next === '`') {
          cur += next
          i += 2
        } else if (next === '\n') {
          i += 2
        } else if (next === '\r' && input[i + 2] === '\n') {
          i += 3
        } else {
          cur += ch
          i += 1
        }
      } else {
        cur += ch
        i += 1
      }
      continue
    }

    // plain
    if (ch === '\\' || ch === '^') {
      const next = input[i + 1]
      if (next === '\n') {
        i += 2
        continue
      }
      if (next === '\r' && input[i + 2] === '\n') {
        i += 3
        continue
      }
      if (ch === '\\' && next !== undefined) {
        cur += next
        started = true
        i += 2
        continue
      }
      cur += ch
      started = true
      i += 1
      continue
    }

    if (ch === "'") {
      mode = 'single'
      started = true
      i += 1
      continue
    }

    if (ch === '"') {
      mode = 'double'
      started = true
      i += 1
      continue
    }

    // ANSI-C quoting: $'...'
    if (ch === '$' && input[i + 1] === "'") {
      i += 2
      let out = ''
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\' && i + 1 < input.length) {
          const e = input[i + 1] as string
          i += 2
          if (e === 'n') out += '\n'
          else if (e === 't') out += '\t'
          else if (e === 'r') out += '\r'
          else if (e === '\\') out += '\\'
          else if (e === "'") out += "'"
          else if (e === 'x') {
            out += String.fromCharCode(parseInt(input.slice(i, i + 2), 16) || 0)
            i += 2
          } else if (e === 'u') {
            out += String.fromCharCode(parseInt(input.slice(i, i + 4), 16) || 0)
            i += 4
          } else out += e
        } else {
          out += input[i]
          i += 1
        }
      }
      i += 1
      cur += out
      started = true
      continue
    }

    if (/\s/.test(ch)) {
      push()
      i += 1
      continue
    }

    cur += ch
    started = true
    i += 1
  }

  push()
  return tokens
}

function splitHeader(line: string): { name: string; value: string } | null {
  const idx = line.indexOf(':')
  if (idx <= 0) return null
  const name = line.slice(0, idx).trim()
  if (!name || /\s/.test(name)) return null
  return { name, value: line.slice(idx + 1).trim() }
}

/** 解析 cURL 命令，失败返回 null */
export function parseCurl(command: string): ParsedRequest | null {
  const warnings: string[] = []
  const tokens = tokenize(command)
  if (tokens.length === 0) return null
  if (!/^curl(\.exe)?$/i.test(tokens[0] as string)) return null

  let url = ''
  let method = ''
  let cookie = ''
  let referer = ''
  let userAgent = ''
  let auth = ''
  let headOnly = false
  const headers: { name: string; value: string }[] = []
  const dataParts: string[] = []
  const formParts: string[] = []

  let i = 1
  let forceGet = false
  while (i < tokens.length) {
    const arg = tokens[i] as string
    // 短选项区分大小写（-G ≠ -g，-X ≠ -x），长选项统一小写
    const key = arg.startsWith('--') ? arg.toLowerCase() : arg

    const takeValue = (): string => {
      const value = tokens[i + 1] ?? ''
      i += 2
      return value
    }

    switch (key) {
      case '-X':
      case '--request':
        method = takeValue().toUpperCase()
        continue
      case '-H':
      case '--header': {
        const h = splitHeader(takeValue())
        if (h) headers.push(h)
        continue
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
      case '--data-urlencode':
        dataParts.push(takeValue())
        continue
      case '-b':
      case '--cookie':
        cookie = takeValue()
        continue
      case '-A':
      case '--user-agent':
        userAgent = takeValue()
        continue
      case '-e':
      case '--referer':
        referer = takeValue()
        continue
      case '-u':
      case '--user':
        auth = takeValue()
        continue
      case '--url':
        url = takeValue()
        continue
      case '-F':
      case '--form':
      case '--form-string':
        formParts.push(takeValue())
        continue
      case '-I':
      case '--head':
        headOnly = true
        i += 1
        continue
      case '-G':
      case '--get':
        forceGet = true
        i += 1
        continue
      case '-o':
      case '--output':
      case '--connect-timeout':
      case '--max-time':
      case '--retry':
        i += 2
        continue
      default:
        break
    }

    if (arg.startsWith('-')) {
      // 未知开关：只跳过自己，不吞后面的值，避免误伤 URL
      i += 1
      continue
    }
    if (!url) url = arg
    i += 1
  }

  if (!url) return null
  if (formParts.length) {
    warnings.push('multipart 的 -F 字段已忽略，请手动填写表单字段')
  }

  let body = dataParts.join('&')
  let effectiveMethod = method
  if (!effectiveMethod) {
    if (headOnly) effectiveMethod = 'HEAD'
    else if (forceGet) effectiveMethod = 'GET'
    else if (body) effectiveMethod = 'POST'
    else effectiveMethod = 'GET'
  }

  if (cookie && !headers.some((h) => h.name.toLowerCase() === 'cookie')) {
    headers.push({ name: 'Cookie', value: cookie })
  }
  if (userAgent && !headers.some((h) => h.name.toLowerCase() === 'user-agent')) {
    headers.push({ name: 'User-Agent', value: userAgent })
  }
  if (referer && !headers.some((h) => h.name.toLowerCase() === 'referer')) {
    headers.push({ name: 'Referer', value: referer })
  }
  if (auth) {
    headers.push({ name: 'Authorization', value: `Basic ${btoa(auth)}` })
  }

  // GET（含 -G）带 body 时，数据并回 query
  if ((forceGet || effectiveMethod === 'GET') && body) {
    url += (url.includes('?') ? '&' : '?') + body
    body = ''
  }

  return { method: effectiveMethod, url, headers, body, source: 'curl', warnings }
}

/** 解析原始 HTTP 报文（Burp / DevTools 复制出来的那种） */
export function parseRawRequest(text: string): ParsedRequest | null {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  if (lines.length === 0) return null

  const first = (lines[0] ?? '').trim()
  const m = first.match(/^([A-Za-z]+)\s+(\S+)\s+HTTP\/[\d.]+$/)
  if (!m) return null

  const method = (m[1] as string).toUpperCase()
  if (!METHODS.includes(method)) return null
  const target = m[2] as string

  const headers: { name: string; value: string }[] = []
  let idx = 1
  for (; idx < lines.length; idx++) {
    const line = lines[idx] as string
    if (line.trim() === '') {
      idx += 1
      break
    }
    const h = splitHeader(line)
    if (h) headers.push(h)
  }
  const body = lines.slice(idx).join('\n')

  const host = headers.find((h) => h.name.toLowerCase() === 'host')?.value ?? ''
  let url: string
  if (/^https?:\/\//i.test(target)) url = target
  else if (target.startsWith('/')) url = host ? `http://${host}${target}` : target
  else url = host ? `http://${host}/${target}` : target

  return { method, url, headers, body, source: 'raw', warnings: [] }
}

/** 自动判断是 cURL 还是原始报文 */
export function parsePastedRequest(text: string): ParsedRequest | null {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return null
  if (/^curl(\.exe)?\b/i.test(trimmed)) return parseCurl(trimmed)
  return parseRawRequest(trimmed)
}
