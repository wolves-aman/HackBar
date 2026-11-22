/**
 * 字符串批量变换。
 */

export interface StringOp {
  id: string
  /** 是否需要额外参数（如前后缀） */
  arg?: 'text'
  run: (text: string, arg?: string) => string
}

const lines = (text: string) => text.split(/\r?\n/)

export const STRING_OPS: StringOp[] = [
  { id: 'upper', run: (t) => t.toUpperCase() },
  { id: 'lower', run: (t) => t.toLowerCase() },
  { id: 'reverse', run: (t) => Array.from(t).reverse().join('') },
  { id: 'trim', run: (t) => lines(t).map((l) => l.trim()).join('\n') },
  { id: 'dedupe', run: (t) => Array.from(new Set(lines(t))).join('\n') },
  { id: 'sort', run: (t) => [...lines(t)].sort().join('\n') },
  { id: 'removeEmpty', run: (t) => lines(t).filter((l) => l.trim() !== '').join('\n') },
  { id: 'prefix', arg: 'text', run: (t, a) => lines(t).map((l) => `${a ?? ''}${l}`).join('\n') },
  { id: 'suffix', arg: 'text', run: (t, a) => lines(t).map((l) => `${l}${a ?? ''}`).join('\n') },
  { id: 'joinAmp', run: (t) => lines(t).filter(Boolean).join('&') },
  { id: 'joinComma', run: (t) => lines(t).filter(Boolean).join(',') },
  { id: 'quoteLines', run: (t) => lines(t).filter(Boolean).map((l) => `"${l}"`).join(',\n') },
  { id: 'urlEncodeLines', run: (t) => lines(t).map((l) => encodeURIComponent(l)).join('\n') },
  { id: 'urlDecodeLines', run: (t) =>
    lines(t)
      .map((l) => {
        try {
          return decodeURIComponent(l)
        } catch {
          return l
        }
      })
      .join('\n') },
  { id: 'stripSpaces', run: (t) => t.replace(/[ \t]+/g, '') },
  { id: 'collapseSpaces', run: (t) => t.replace(/[ \t]+/g, ' ').trim() },
]
