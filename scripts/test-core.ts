/**
 * 核心纯逻辑自测（Node 23 直接跑 TS）。
 * 运行：node --experimental-strip-types scripts/test-core.ts
 */

import assert from 'node:assert/strict'
import { md5, shaHash } from '../src/core/hash.ts'
import {
  applyPairsToUrl,
  joinUrl,
  makePair,
  normalizeUrl,
  parsePairs,
  pairsFromUrl,
  splitUrl,
  stringifyPairs,
} from '../src/core/url.ts'
import { parseCurl, parsePastedRequest, tokenize } from '../src/core/curl.ts'
import {
  base64Decode,
  base64Encode,
  charCodeDecode,
  charCodeEncode,
  gbkUrlDecode,
  gbkUrlEncode,
  hexDecode,
  hexEncode,
  htmlDecode,
  htmlEncode,
  octalDecode,
  octalEncode,
  unicodeDecode,
  unicodeEncode,
  urlDecode as urlDecodeFn,
  urlEncode as urlEncodeFn,
} from '../src/core/encode.ts'
import { buildSqli, spaceToComment, wrapSqli } from '../src/core/sqli.ts'
import { decodeJwt, parseTimeInput, timeInfo } from '../src/core/crypto-tools.ts'
import { aesDecrypt, aesEncrypt } from '../src/core/crypto-tools.ts'
import { generateRandom, uuid } from '../src/core/random.ts'
import { STRING_OPS } from '../src/core/string-ops.ts'
import { clonePlain } from '../src/core/util.ts'
import { coerceArray, normalizeCookies, normalizePairs, normalizeTemplates } from '../src/core/draft.ts'

let passed = 0
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1
      console.log(`  ok  ${name}`)
    })
    .catch((err) => {
      console.error(`FAIL  ${name}`)
      throw err
    })
}

async function main(): Promise<void> {
  console.log('hash')
  await check('md5 empty', () => assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e'))
  await check('md5 abc', () => assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72'))
  await check('md5 中文', () =>
    assert.equal(md5('中文'), 'a7bac2239fcdcb3a067903d8077c4a07'),
  )
  await check('sha256 abc', async () => {
    const value = await shaHash('SHA-256', 'abc')
    assert.equal(value, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  console.log('url')
  await check('parse query', () => {
    const pairs = parsePairs('a=1&b=%E4%B8%AD%E6%96%87&flag')
    assert.equal(pairs.length, 3)
    assert.equal(pairs[0]!.key, 'a')
    assert.equal(pairs[1]!.value, '中文')
    assert.equal(pairs[2]!.noValue, true)
  })
  await check('stringify keeps flag', () => {
    const pairs = parsePairs('a=1&flag')
    assert.equal(stringifyPairs(pairs, false), 'a=1&flag')
  })
  await check('splitUrl', () => {
    const parts = splitUrl('https://a.com/x/y?a=1&b=2#h')
    assert.equal(parts.base, 'https://a.com/x/y')
    assert.equal(parts.query, 'a=1&b=2')
    assert.equal(parts.hash, '#h')
    assert.equal(joinUrl(parts, 'c=3'), 'https://a.com/x/y?c=3#h')
  })
  await check('applyPairsToUrl', () => {
    const pairs = [makePair('q', '中文 x'), makePair('off', '1', false)]
    const url = applyPairsToUrl('https://a.com/s?old=1', pairs, true)
    assert.equal(url, 'https://a.com/s?q=%E4%B8%AD%E6%96%87%20x')
  })
  await check('pairsFromUrl', () => {
    assert.equal(pairsFromUrl('https://a.com/?id=1').length, 1)
  })
  await check('normalizeUrl', () => {
    assert.equal(normalizeUrl('example.com/a'), 'http://example.com/a')
    assert.equal(normalizeUrl('https://x.com'), 'https://x.com')
    assert.equal(normalizeUrl('//x.com/a'), 'https://x.com/a')
  })
  await check('url encode/decode', () => {
    assert.equal(urlDecodeFn(urlEncodeFn('中文 & ?=#')), '中文 & ?=#')
    assert.equal(urlDecodeFn('%E4%B8%AD+%E6%96%87'), '中 文')
  })

  console.log('curl')
  await check('tokenize quotes', () => {
    const tokens = tokenize(`curl 'http://a.com/x' -H "A: b c" -d 'x=1&y=2'`)
    assert.deepEqual(tokens, ['curl', 'http://a.com/x', '-H', 'A: b c', '-d', 'x=1&y=2'])
  })
  await check('bash cURL', () => {
    const parsed = parseCurl(`curl 'https://a.com/api?id=1' \\
  -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: sid=abc; uid=1' \\
  -H 'Referer: https://a.com/' \\
  -b 'sid=abc' \\
  --data-raw '{"a":1}'`)
    assert.ok(parsed)
    assert.equal(parsed!.method, 'POST')
    assert.equal(parsed!.url, 'https://a.com/api?id=1')
    assert.equal(parsed!.body, '{"a":1}')
    assert.equal(parsed!.headers.find((h) => h.name === 'Cookie')?.value, 'sid=abc; uid=1')
  })
  await check('cmd cURL with caret', () => {
    const parsed = parseCurl(
      'curl "https://a.com/x" ^\n -H "X-Test: 1" ^\n --data "a=1"',
    )
    assert.ok(parsed)
    assert.equal(parsed!.method, 'POST')
    assert.equal(parsed!.headers[0]!.name, 'X-Test')
  })
  await check('ANSI-C quoting', () => {
    const parsed = parseCurl(`curl 'https://a.com/x' -d $'line1\\nline2'`)
    assert.ok(parsed)
    assert.equal(parsed!.body, 'line1\nline2')
  })
  await check('GET with -d moves to query', () => {
    const parsed = parseCurl(`curl 'https://a.com/x' -G -d 'a=1'`)
    assert.ok(parsed)
    assert.equal(parsed!.url, 'https://a.com/x?a=1')
    assert.equal(parsed!.body, '')
  })
  await check('raw request', () => {
    const parsed = parsePastedRequest(
      'POST /login HTTP/1.1\nHost: a.com\nContent-Type: application/json\n\n{"u":"a"}',
    )
    assert.ok(parsed)
    assert.equal(parsed!.method, 'POST')
    assert.equal(parsed!.url, 'http://a.com/login')
    assert.equal(parsed!.body, '{"u":"a"}')
    assert.equal(parsed!.source, 'raw')
  })
  await check('auto detect curl vs raw', () => {
    assert.equal(parsePastedRequest(`curl 'https://a.com'`)!.source, 'curl')
  })

  console.log('encode')
  await check('base64 roundtrip', () => {
    assert.equal(base64Encode('hello 中文'), 'aGVsbG8g5Lit5paH')
    assert.equal(base64Decode('aGVsbG8g5Lit5paH'), 'hello 中文')
  })
  await check('hex roundtrip', () => {
    assert.equal(hexDecode(hexEncode('中文')), '中文')
  })
  await check('html entities', () => {
    assert.equal(htmlEncode('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;')
    assert.equal(htmlDecode('&lt;a&gt;&#20013;&#x6587;'), '<a>中文')
  })
  await check('unicode', () => {
    assert.equal(unicodeEncode('中a'), '\\u4e2d\\u0061')
    assert.equal(unicodeDecode('\\u4e2d\\u0061'), '中a')
  })
  await check('octal', () => {
    assert.equal(octalDecode(octalEncode('ab')), 'ab')
  })
  await check('charcode', () => {
    assert.equal(charCodeDecode(charCodeEncode('hi')), 'hi')
  })
  await check('gbk roundtrip', () => {
    const encoded = gbkUrlEncode('中文')
    assert.equal(encoded, '%D6%D0%CE%C4')
    assert.equal(gbkUrlDecode(encoded), '中文')
  })

  console.log('sqli')
  await check('mysql dump databases', () => {
    const sql = buildSqli('mysql', 'dumpDatabases', {
      columns: 3,
      table: 'users',
      quote: true,
      comment: true,
    })
    assert.match(sql, /information_schema\.schemata/)
  })
  await check('mysql dump columns uses hex table', () => {
    const sql = buildSqli('mysql', 'dumpColumns', {
      columns: 3,
      table: 'users',
      quote: true,
      comment: true,
    })
    assert.match(sql, /0x7573657273/)
  })
  await check('union wraps quote + comment', () => {
    const sql = buildSqli('postgres', 'unionSelect', {
      columns: 4,
      table: '',
      quote: true,
      comment: true,
    })
    const wrapped = wrapSqli(sql, true, { columns: 4, table: '', quote: true, comment: true })
    assert.equal(wrapped, "' UNION SELECT 1,2,3,4 -- -")
  })
  await check('space bypass', () => {
    assert.equal(spaceToComment('AND 1=1'), 'AND/**/1=1')
  })
  await check('sqlite table dump', () => {
    const sql = buildSqli('sqlite', 'dumpTables', {
      columns: 3,
      table: 'users',
      quote: false,
      comment: false,
    })
    assert.match(sql, /sqlite_master/)
  })

  console.log('crypto tools')
  await check('jwt decode', () => {
    // jwt.io 首页的公开示例 token，不是任何真实凭据
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const decoded = decodeJwt(token)
    assert.equal(decoded.ok, true)
    assert.equal((decoded.payload as Record<string, unknown>).sub, '1234567890')
  })
  await check('jwt invalid', () => {
    assert.equal(decodeJwt('not-a-jwt').ok, false)
  })
  await check('aes cbc roundtrip', async () => {
    const out = await aesEncrypt('secret 中文', {
      key: '0123456789abcdef',
      keyFormat: 'utf8',
      iv: '00112233445566778899aabbccddeeff',
      ivFormat: 'hex',
      mode: 'CBC',
      output: 'base64',
    })
    const back = await aesDecrypt(out, {
      key: '0123456789abcdef',
      keyFormat: 'utf8',
      iv: '00112233445566778899aabbccddeeff',
      ivFormat: 'hex',
      mode: 'CBC',
      output: 'base64',
    })
    assert.equal(back, 'secret 中文')
  })
  await check('time parse', () => {
    assert.equal(parseTimeInput('1700000000'), 1700000000000)
    assert.equal(parseTimeInput('1700000000000'), 1700000000000)
    assert.ok(timeInfo(1700000000000).iso.startsWith('2023-11-14'))
  })

  console.log('random / string')
  await check('uuid shape', () => {
    assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  await check('random number range', () => {
    for (let i = 0; i < 50; i++) {
      const value = Number(generateRandom({ kind: 'number', length: 0, min: 5, max: 9 }))
      assert.ok(value >= 5 && value <= 9)
    }
  })
  await check('string ops', () => {
    const dedupe = STRING_OPS.find((op) => op.id === 'dedupe')!
    assert.equal(dedupe.run('a\nb\na'), 'a\nb')
    const prefix = STRING_OPS.find((op) => op.id === 'prefix')!
    assert.equal(prefix.run('a\nb', 'x'), 'xa\nxb')
  })

  console.log('draft 容错')
  await check('coerceArray 兼容数字键对象', () => {
    assert.deepEqual(coerceArray<string>({ 0: 'a', 1: 'b' }) as string[], ['a', 'b'])
    assert.deepEqual(coerceArray<string>(null) as string[], [])
    assert.deepEqual(coerceArray<string>('x') as string[], [])
    assert.deepEqual(coerceArray<string>({ foo: 1 }) as string[], [])
  })
  await check('normalizePairs 修复被写成对象的数组', () => {
    const broken = { 0: { key: 'a', value: '1', enabled: true }, 1: { key: 'b' } }
    const pairs = normalizePairs(broken)
    assert.equal(pairs.length, 2)
    assert.equal(pairs[0]!.key, 'a')
    assert.equal(pairs[0]!.value, '1')
    assert.equal(pairs[1]!.value, '')
    assert.ok(pairs[0]!.id.startsWith('pair_'))
    assert.equal(pairs[0]!.enabled, true)
  })
  await check('normalizePairs 丢弃非对象', () => {
    const pairs = normalizePairs([{ key: 'a' }, null, 'oops', 42])
    assert.equal(pairs.length, 1)
    assert.equal(pairs[0]!.key, 'a')
  })
  await check('normalizeCookies 修复损坏草稿', () => {
    const broken = {
      0: { name: 'sid', value: 'abc', domain: 'example.com', httpOnly: true },
      1: { name: 'theme', value: 'dark', secure: true },
    }
    const cookies = normalizeCookies(broken)
    assert.equal(cookies.length, 2)
    assert.equal(cookies[0]!.domain, 'example.com')
    assert.equal(cookies[0]!.httpOnly, true)
    assert.equal(cookies[1]!.path, '/')
    assert.equal(cookies[1]!.secure, true)
  })
  await check('normalizeTemplates 修复损坏草稿', () => {
    const broken = { 0: { name: 'tpl', headers: { 0: { name: 'X-A', value: '1' }, 1: { name: '', value: 'x' } } } }
    const templates = normalizeTemplates(broken)
    assert.equal(templates.length, 1)
    assert.equal(templates[0]!.name, 'tpl')
    assert.equal(templates[0]!.headers.length, 1)
    assert.equal(templates[0]!.headers[0]!.name, 'X-A')
  })
  await check('clonePlain 去掉响应式包装', async () => {
    const { reactive } = await import('vue')
    const state = reactive({ list: [{ key: 'a' }], nested: { enabled: true } })
    const plain = clonePlain(state)
    assert.ok(Array.isArray(plain.list))
    assert.equal(Object.getPrototypeOf(plain.nested), Object.prototype)
    assert.equal(JSON.stringify(plain.list), '[{"key":"a"}]')
  })

  console.log('i18n')
  await check('zh / en 字典 key 对齐', async () => {
    const { DICTS } = await import('../src/core/i18n.ts')
    const zhKeys = Object.keys(DICTS.zh).sort()
    const enKeys = Object.keys(DICTS.en).sort()
    const missingInEn = zhKeys.filter((key) => !(key in DICTS.en))
    const missingInZh = enKeys.filter((key) => !(key in DICTS.zh))
    assert.deepEqual(missingInEn, [])
    assert.deepEqual(missingInZh, [])
  })

  console.log(`\n${passed} checks passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
