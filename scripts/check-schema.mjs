// server/schema.json(データ定義。唯一の正)と、画面の型(src/models、src/data)の食い違いを検出する。
//   node scripts/check-schema.mjs        ← npm run verify に含まれる
// 片方にだけ列や選択肢の値を足して、もう片方への追記を忘れる事故を防ぐ。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const schema = JSON.parse(readFileSync(join(root, 'server', 'schema.json'), 'utf8'))
const problems = []
// 表の名前 → ファイル名(delivery_cards → deliveryCards)
const stemOf = (table) => table.replace(/_(\w)/g, (_, c) => c.toUpperCase())
// どの表にもある列・読むだけの項目は、突き合わせない
const SYSTEM = new Set(['id', 'state_code', 'created_on', 'modified_on'])

for (const [table, def] of Object.entries(schema.tables)) {
  const model = join(root, 'src', 'models', `${stemOf(table)}.ts`)
  const data = join(root, 'src', 'data', `${stemOf(table)}.ts`)
  const file = existsSync(model) ? model : data
  if (!existsSync(file)) {
    problems.push(`${table}: 型のファイルが見つかりません(src/models/${stemOf(table)}.ts か src/data/${stemOf(table)}.ts)`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  const defined = new Set([...def.columns.map((c) => c[0]), ...def.lookups.map((l) => l[0])])
  // 型の項目。models は、ファイルの中のすべての interface を合わせる(書き込める列 + 読んだ行)。
  // data は、schema.json の列をいちばん多く含む interface を、この表の型とみなす(ほかの interface も同じファイルにあるため)
  const interfaces = [...text.matchAll(/export interface \w+(?: extends \w+)? \{([\s\S]*?)\n\}/g)].map(
    (m) => new Set([...m[1].matchAll(/^\s+(\w+)\??:/gm)].map((f) => f[1])),
  )
  const hits = (s) => [...s].filter((f) => defined.has(f)).length
  const fields = file === model ? new Set(interfaces.flatMap((s) => [...s])) : interfaces.reduce((a, b) => (hits(b) > hits(a) ? b : a), new Set())
  for (const f of fields) {
    if (SYSTEM.has(f) || (f.endsWith('_name') && defined.has(f.slice(0, -5)))) continue
    if (!defined.has(f)) problems.push(`${table}: 型にある項目 ${f} が、schema.json にありません`)
  }
  for (const f of defined) if (!fields.has(f)) problems.push(`${table}: schema.json にある項目 ${f} が、型にありません`)

  // 選択肢の値(models の export const <型><列> = { 値: '表示名' })
  for (const [col, type] of def.columns) {
    const codes = schema.choices?.[`${table}.${col}`]
    if (type === 'choice' && !codes) problems.push(`${table}.${col}: 選択肢の値が、schema.json の choices にありません`)
    if (type !== 'choice' || file !== model) continue
    const pascal = col.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase())
    const block = text.match(new RegExp(`export const \\w+${pascal} = \\{([\\s\\S]*?)\\} as const`))?.[1]
    if (!block) {
      problems.push(`${table}.${col}: 型のファイルに、選択肢(…${pascal})がありません`)
      continue
    }
    const keys = [...block.matchAll(/^\s+(\w+):/gm)].map((k) => k[1])
    if (keys.join(',') !== codes.join(',')) problems.push(`${table}.${col}: 選択肢の値が違います(型: ${keys.join(' / ')}、schema.json: ${codes.join(' / ')})`)
  }
}

if (problems.length) {
  console.error('schema.json と画面の型が一致しません:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log(`schema.json OK(${Object.keys(schema.tables).length} テーブル)`)
