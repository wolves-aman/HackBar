/**
 * replay 页面：真正把请求打出去。
 * - form 模式：构造隐藏表单并提交（地址栏保持目标 URL）
 * - fetch 模式：fetch 后把响应渲染进沙箱 iframe（地址栏是扩展页）
 */

import { sessionGet, sessionRemove } from '../core/storage'

interface FormSession {
  kind: 'form'
  url: string
  enctype: 'application/x-www-form-urlencoded' | 'multipart/form-data'
  fields: { name: string; value: string }[]
}

interface FetchSession {
  kind: 'fetch'
  url: string
  method: string
  headers: { name: string; value: string }[]
  body: string
}

type ReplaySession = FormSession | FetchSession

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|x-ndjson)|$)/i

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function submitForm(session: FormSession): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = session.url
  form.enctype = session.enctype
  form.style.display = 'none'
  for (const field of session.fields) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = field.name
    input.value = field.value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  document.title = `POST ${session.url}`
  form.submit()
}

function ensureLayout(): { banner: HTMLElement; frame: HTMLIFrameElement } {
  document.body.innerHTML = ''
  Object.assign(document.body.style, {
    margin: '0',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#0f1115',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  })

  const banner = document.createElement('div')
  Object.assign(banner.style, {
    flex: '0 0 auto',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 14px',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#161a22',
    color: '#c9d4e3',
    fontSize: '12px',
    borderBottom: '1px solid #262c38',
    fontFamily: 'ui-monospace, Consolas, monospace',
  })

  const frame = document.createElement('iframe')
  Object.assign(frame.style, { flex: '1 1 auto', width: '100%', border: '0', background: '#fff' })
  frame.setAttribute('sandbox', 'allow-same-origin allow-forms allow-popups allow-downloads')

  document.body.appendChild(banner)
  document.body.appendChild(frame)
  return { banner, frame }
}

function chip(label: string, value: string, color = '#9fb3c8'): HTMLElement {
  const el = document.createElement('span')
  el.textContent = `${label} ${value}`
  Object.assign(el.style, {
    color,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '46vw',
  })
  return el
}

function buildDocument(
  buffer: ArrayBuffer,
  contentType: string,
  targetUrl: string,
): { html: string; objectUrl?: string } {
  let base = targetUrl
  try {
    base = new URL(targetUrl).origin + '/'
  } catch {
    /* keep raw */
  }

  const isText = TEXT_TYPES.test(contentType)
  const isHtml = /text\/html/i.test(contentType)

  if (!isText) {
    const objectUrl = URL.createObjectURL(new Blob([buffer], { type: contentType || 'application/octet-stream' }))
    if (/^image\//i.test(contentType)) {
      return {
        objectUrl,
        html: `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"><img src="${objectUrl}" style="max-width:100%"></body>`,
      }
    }
    return {
      objectUrl,
      html:
        `<!doctype html><meta charset="utf-8"><body style="font:13px ui-monospace,Consolas,monospace;padding:16px;background:#0f1115;color:#c9d4e3">` +
        `二进制响应 · ${escapeHtml(contentType || 'unknown')} · ${buffer.byteLength} B<br><br>` +
        `<a href="${objectUrl}" download="response.bin" style="color:#79c0ff">下载响应</a></body>`,
    }
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)

  if (isHtml) {
    const cleaned = text
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<!-- script removed by hackbar -->')
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    const withBase = /<head[^>]*>/i.test(cleaned)
      ? cleaned.replace(/<head([^>]*)>/i, `<head$1><base href="${escapeHtml(base)}">`)
      : `<!doctype html><html><head><base href="${escapeHtml(base)}"><meta charset="utf-8"></head><body>${cleaned}</body></html>`
    return { html: withBase }
  }

  return {
    html: `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><pre style="white-space:pre-wrap;word-break:break-all;font:12px/1.5 ui-monospace,Consolas,monospace;padding:12px;color:#111">${escapeHtml(
      text,
    )}</pre></body>`,
  }
}

async function runFetch(session: FetchSession): Promise<void> {
  const { banner, frame } = ensureLayout()
  banner.textContent = `${session.method} ${session.url} — 请求中…`

  const started = performance.now()
  try {
    const headers: Record<string, string> = {}
    for (const h of session.headers) headers[h.name] = h.value

    const response = await fetch(session.url, {
      method: session.method,
      headers,
      body: session.method === 'GET' || session.method === 'HEAD' ? undefined : session.body,
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store',
    })
    const elapsed = Math.round(performance.now() - started)
    const contentType = response.headers.get('content-type') ?? ''
    const buffer = await response.arrayBuffer()

    document.title = `${response.status} ${response.statusText} · ${session.url}`
    banner.innerHTML = ''
    banner.appendChild(
      chip('状态', `${response.status} ${response.statusText}`, response.ok ? '#7ee787' : '#ff7b72'),
    )
    banner.appendChild(chip('类型', contentType || 'unknown'))
    banner.appendChild(chip('大小', `${buffer.byteLength} B`))
    banner.appendChild(chip('耗时', `${elapsed} ms`))
    banner.appendChild(chip('URL', session.url))

    frame.srcdoc = buildDocument(buffer, contentType, session.url).html
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    banner.innerHTML = ''
    banner.appendChild(chip('失败', message, '#ff7b72'))
    banner.appendChild(chip('URL', session.url))
    frame.srcdoc =
      `<!doctype html><meta charset="utf-8"><body style="font:13px ui-monospace,Consolas,monospace;padding:16px;color:#ff7b72;background:#0f1115">` +
      `fetch 失败：${escapeHtml(message)}<br><br>` +
      `可能是目标站点 CORS / SameSite 限制，或响应过大。<br>` +
      `可改用表单分支，或检查目标站点策略。</body>`
  }
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const id = params.get('s')
  if (!id) {
    document.body.textContent = 'missing replay session'
    return
  }
  const key = `hb.replay.${id}`
  const session = await sessionGet<ReplaySession>(key)
  await sessionRemove(key)

  if (!session) {
    document.body.style.cssText =
      'font:13px ui-monospace,Consolas,monospace;padding:16px;background:#0f1115;color:#c9d4e3'
    document.body.textContent = 'replay session 已失效，请回到面板重新发送。'
    return
  }

  if (session.kind === 'form') {
    submitForm(session)
    return
  }
  await runFetch(session)
}

void main()
