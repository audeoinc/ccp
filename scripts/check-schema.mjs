// server/schema.json(データ定義。唯一の正)と、画面の型(src/models、src/data)の食い違いを検出する。
//   node scripts/check-schema.mjs        ← npm run verify に含まれる
// 片方にだけ列や選択肢の値を足して、もう片方への追記を忘れる事故を防ぐ。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filesUsing, loadSchema } from './schema-overlay.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// AWS 側が重ねた列・表(server/ccp/client/schema.json)も、重ねたあとの形で照合する。ファイルがなければ schema.json だけ
const { schema, problems: overlayProblems, notes, changes, changedChoices, removedValues, addedColumns, addedTables } = loadSchema(root)
if (overlayProblems.length) {
  console.error('server/ccp/client/schema.json を重ねられません:\n- ' + overlayProblems.join('\n- ') + '\n次にやること: 上の行を直してください(決まりは docs/AWS_CUSTOMIZE.md の 4 章)')
  process.exit(1)
}
const problems = []
// 重ねて足した列の型がないのは、止めない(サーバーだけで使う列もある)
const warnings = []
// 表の名前 → ファイル名(delivery_cards → deliveryCards)
const stemOf = (table) => table.replace(/_(\w)/g, (_, c) => c.toUpperCase())
// どの表にもある列・読むだけの項目は、突き合わせない
const SYSTEM = new Set(['id', 'state_code', 'created_on', 'modified_on'])

for (const [table, def] of Object.entries(schema.tables)) {
  const model = join(root, 'src', 'models', `${stemOf(table)}.ts`)
  const data = join(root, 'src', 'data', `${stemOf(table)}.ts`)
  // AWS 側が足した列・表の型は src/client/models/ に置く(共通の型のファイルを直さずに済む)
  const client = join(root, 'src', 'client', 'models', `${stemOf(table)}.ts`)
  const hasClient = existsSync(client)
  const common = existsSync(model) ? model : data
  const file = existsSync(common) ? common : client
  if (!existsSync(file) && addedTables.has(table)) {
    warnings.push(`${table}: 型のファイルがありません(画面で使うなら src/client/models/${stemOf(table)}.ts)`)
    continue
  }
  if (!existsSync(file)) {
    problems.push(`${table}: 型のファイルが見つかりません(src/models/${stemOf(table)}.ts か src/data/${stemOf(table)}.ts。AWS 側が足した表は src/client/models/${stemOf(table)}.ts)`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  const clientText = hasClient && file !== client ? readFileSync(client, 'utf8') : ''
  const defined = new Set([...def.columns.map((c) => c[0]), ...def.lookups.map((l) => l[0])])
  // 重ねるファイルで使わない列にしたものは、共通の型に残っていてよい
  const retired = new Set(def.retired ?? [])
  // 型の項目。models は、ファイルの中のすべての interface を合わせる(書き込める列 + 読んだ行)。
  // data は、schema.json の列をいちばん多く含む interface を、この表の型とみなす(ほかの interface も同じファイルにあるため)
  const interfaces = [...text.matchAll(/export interface \w+(?: extends \w+)? \{([\s\S]*?)\n\}/g)].map(
    (m) => new Set([...m[1].matchAll(/^\s+(\w+)\??:/gm)].map((f) => f[1])),
  )
  const hits = (s) => [...s].filter((f) => defined.has(f)).length
  const fields = file === model ? new Set(interfaces.flatMap((s) => [...s])) : interfaces.reduce((a, b) => (hits(b) > hits(a) ? b : a), new Set())
  const clientFields = new Set(
    [...clientText.matchAll(/export interface \w+(?: extends \w+)? \{([\s\S]*?)\n\}/g)].flatMap((m) => [...m[1].matchAll(/^\s+(\w+)\??:/gm)].map((f) => f[1])),
  )
  for (const f of clientFields) {
    if (SYSTEM.has(f) || (f.endsWith('_name') && defined.has(f.slice(0, -5)))) continue
    if (!defined.has(f)) problems.push(`${table}: 型にある項目 ${f} が、重ねたあとの定義にありません(src/client/models/${stemOf(table)}.ts)`)
  }
  for (const f of fields) {
    if (SYSTEM.has(f) || (f.endsWith('_name') && defined.has(f.slice(0, -5)))) continue
    if (!defined.has(f) && !retired.has(f)) problems.push(`${table}: 型にある項目 ${f} が、schema.json にありません`)
  }
  for (const f of defined) {
    if (fields.has(f) || clientFields.has(f)) continue
    if (addedColumns.has(`${table}.${f}`)) warnings.push(`${table}.${f}: 型がありません(画面で使うなら src/client/models/${stemOf(table)}.ts)`)
    else problems.push(`${table}: schema.json にある項目 ${f} が、型にありません`)
  }

  // 選択肢の値(models の export const <型><列> = { 値: '表示名' })
  for (const [col, type] of def.columns) {
    const codes = schema.choices?.[`${table}.${col}`]
    if (type === 'choice' && !codes) problems.push(`${table}.${col}: 選択肢の値が、schema.json の choices にありません`)
    // 重ねて変えた選択肢は、共通の型の定数と違っていてよい
    if (type !== 'choice' || changedChoices.has(`${table}.${col}`) || (file !== model && !hasClient)) continue
    const pascal = col.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase())
    const block = (text + '\n' + clientText).match(new RegExp(`export const \\w+${pascal} = \\{([\\s\\S]*?)\\} as const`))?.[1]
    if (!block) {
      if (addedColumns.has(`${table}.${col}`)) warnings.push(`${table}.${col}: 選択肢の表示名がありません(値のまま出ます)`)
      else problems.push(`${table}.${col}: 型のファイルに、選択肢(…${pascal})がありません`)
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
// 止めないが、AWS 側が合わせる所。変えたことと次にやることを出し続ける
if (changes.length) {
  console.log('注意: 重ねるファイルで共通の定義を変えています。docs/client/CHANGES.md に名前と理由を書いてください:')
  for (const c of changes) console.log(`- ${c}`)
}
for (const { col, values } of removedValues) {
  for (const v of values) {
    const files = filesUsing(root, v)
    if (files.length) console.log(`注意: ${col} から消した ${v} を、コードが使っているかもしれません(${files.length} 個: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ' ほか' : ''})。その値を保存する所は「使えない値」で断られます。次にやること: この所を合わせてください`)
  }
}
for (const n of [...notes, ...warnings]) console.log(`注意: ${n}`)
