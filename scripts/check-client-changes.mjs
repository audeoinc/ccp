// 共通の列を消す・名前を変える・型を変えたのに、docs/client/CHANGES.md に書いていなければ止める(npm run verify に含まれる)。
// 書かずに変えると、次の版のマージで気づかないまま壊れるため(docs/AWS_CUSTOMIZE.md の 4 章)。
// 比べる元は、ZIP に入っている届いたままの定義(server/schema.base.json)。版を取り込むと一緒に新しくなるので、
// 開発側が変えた分では止まらない。開発側のリポジトリにはこのファイルがないので、何もしない。
//   node scripts/check-client-changes.mjs [リポジトリの場所]
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 届いたままの定義から、なくなった・変わったものを [{ name, what }] で返す。足した列は入らない */
export function commonChanges(base, current) {
  const out = []
  for (const [table, def] of Object.entries(base.tables)) {
    const now = current.tables[table]
    if (!now) {
      out.push({ name: table, what: '表がなくなった' })
      continue
    }
    const cols = new Map(now.columns.map((c) => [c[0], c]))
    const lks = new Map(now.lookups.map((l) => [l[0], l]))
    for (const c of def.columns) {
      const name = `${table}.${c[0]}`
      const col = cols.get(c[0])
      if (!col) out.push({ name, what: '列がなくなった(名前を変えたときも、こう見える)' })
      else if (col[1] !== c[1]) out.push({ name, what: `型が変わった(${c[1]} → ${col[1]})` })
    }
    for (const l of def.lookups) {
      const name = `${table}.${l[0]}`
      const lk = lks.get(l[0])
      if (!lk) out.push({ name, what: '参照がなくなった(名前を変えたときも、こう見える)' })
      else if (lk[1] !== l[1]) out.push({ name, what: `参照先が変わった(${l[1]} → ${lk[1]})` })
    }
  }
  return out
}

/** CHANGES.md に名前が書かれているか(products.season が products.season_code に当たらないように、前後を見る) */
export function isRecorded(name, text) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\w.])${escaped}(?![\\w])`).test(text)
}

export function checkClientChanges(root) {
  const basePath = join(root, 'server', 'schema.base.json')
  if (!existsSync(basePath)) return []
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
  const changesPath = join(root, 'docs', 'client', 'CHANGES.md')
  const text = existsSync(changesPath) ? readFileSync(changesPath, 'utf8') : ''
  return commonChanges(read(basePath), read(join(root, 'server', 'schema.json'))).filter((c) => !isRecorded(c.name, text))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
  const missing = checkClientChanges(root)
  if (missing.length) {
    console.error('共通の定義を変えたのに、docs/client/CHANGES.md に書いていません:')
    for (const m of missing) console.error(`- ${m.name}: ${m.what}`)
    console.error('次にやること: docs/client/CHANGES.md に、上の名前(例: ' + missing[0].name + ')と、変えた理由を書いてください。元に戻すなら、server/schema.json を戻してください(docs/AWS_CUSTOMIZE.md の 4 章)')
    process.exit(1)
  }
  console.log('共通の定義の変更: 書き漏れなし')
}
