/**
 * Node 侧的 ESM 解析钩子：把 `./foo` 解析到 `./foo.ts`。
 * 只用于 `npm run test:send`，让测试能直接跑 TS 源码（Vite 构建不受影响）。
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EXTS = ['.ts', '.tsx', '.mts', '.js']

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
    const base = context.parentURL ? new URL(specifier, context.parentURL) : null
    if (base) {
      for (const ext of EXTS) {
        const candidate = fileURLToPath(base) + ext
        if (existsSync(candidate)) return nextResolve(`${specifier}${ext}`, context)
      }
    }
  }
  return nextResolve(specifier, context)
}
