/** 通用小工具 */

let seq = 0
export function uid(prefix = 'p'): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`
}

export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 300): T {
  let timer: number | undefined
  return ((...args: never[]) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait) as unknown as number
  }) as T
}

/**
 * 转成纯数据（去掉 Vue Proxy）。
 * chrome.storage 的序列化器会把 Proxy 包裹的数组当成普通对象，
 * 存成 {"0":…,"1":…}，取回来就不是数组了。写入前必须过一遍。
 */
export function clonePlain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 退化方案：textarea + execCommand
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/** 截断显示，保留头尾 */
export function ellipsis(text: string, max = 120): string {
  if (text.length <= max) return text
  const head = Math.ceil((max - 3) / 2)
  const tail = Math.floor((max - 3) / 2)
  return `${text.slice(0, head)}...${text.slice(text.length - tail)}`
}
