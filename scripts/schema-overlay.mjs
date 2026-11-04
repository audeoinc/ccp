// AWS 側の列・表(server/ccp/client/schema.json)を、server/schema.json に重ねて読む。
// サーバーの merge_overlay(server/ccp/schema.py)と同じ決まり。npm run verify が、起動より前に同じ理由で止められるように持つ。
// 2 つの食い違いは、server/tests/test_schema_overlay.py が同じ例を両方に流して見つける。
//   node scripts/schema-overlay.mjs <schema.json> <重ねるファイル>   ← 結果を JSON で出す(そのテストのため)
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = /^[a-z][a-z0-9_]*$/
const RESERVED = new Set(['id', 'state_code', 'created_on', 'modified_on'])
const TYPES = ['text', 'int', 'numeric', 'float', 'timestamptz', 'date', 'choice']
const ON_DELETE = new Set(['NO ACTION', 'CASCADE', 'SET NULL'])
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const same = (a, b) => {
  const sorted = (o) => Object.keys(o).sort().map((k) => [k, o[k]])
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
}
const entryOk = (e) =>
  Array.isArray(e) && e.length >= 2 && e.length <= 3 && typeof e[0] === 'string' && typeof e[1] === 'string' && (e.length === 2 || isObject(e[2]))

const items = (t, key) => (Array.isArray(t[key]) ? t[key] : [])

export function mergeOverlay(base, overlay) {
  const merged = JSON.parse(JSON.stringify(base))
  const problems = []
  if (!isObject(overlay)) return { merged, problems: ['いちばん外は { } にしてください'] }
  for (const key of Object.keys(overlay)) {
    if (key !== 'tables' && key !== 'choices' && !key.startsWith('_')) problems.push(`${key}: 使えない項目です(使えるのは tables と choices)`)
  }
  const tables = merged.tables
  const overTables = overlay.tables ?? {}
  const overChoices = overlay.choices ?? {}
  if (!isObject(overTables) || !isObject(overChoices)) return { merged, problems: ['tables と choices は { } にしてください'] }
  const added = new Set(Object.keys(overTables).filter((n) => !(n in tables)))
  const ownChoice = new Set()

  for (const [name, t] of Object.entries(overTables)) {
    if (!NAME.test(name)) {
      problems.push(`${name}: 表の名前は、小文字の英字で始まる英数字と _ にしてください`)
      continue
    }
    if (!isObject(t)) {
      problems.push(`${name}: 表の定義は { } にしてください`)
      continue
    }
    for (const key of Object.keys(t)) {
      if (!['columns', 'lookups', 'retired', 'unique'].includes(key) && !key.startsWith('_')) problems.push(`${name}.${key}: 使えない項目です(使えるのは columns・lookups・retired・unique)`)
      else if (['columns', 'lookups', 'retired', 'unique'].includes(key) && !Array.isArray(t[key])) problems.push(`${name}.${key}: [ ] で並べてください`)
    }
    tables[name] ??= { columns: [], lookups: [] }
  }

  for (const [name, t] of Object.entries(overTables)) {
    if (!(name in tables) || !isObject(t)) continue
    const target = tables[name]
    const cols = new Map(target.columns.map((c) => [c[0], c]))
    const lks = new Map(target.lookups.map((l) => [l[0], l]))
    for (const c of items(t, 'columns')) {
      if (!entryOk(c)) {
        problems.push(`${name}: 列は [名前, 型] か [名前, 型, { 指定 }] にしてください(${JSON.stringify(c)})`)
        continue
      }
      const col = `${name}.${c[0]}`
      const opts = c[2] ?? {}
      if (!NAME.test(c[0])) problems.push(`${col}: 列の名前は、小文字の英字で始まる英数字と _ にしてください`)
      else if (RESERVED.has(c[0])) problems.push(`${col}: どの表にもある列なので、足せません。別の名前にしてください`)
      else if (!TYPES.includes(c[1])) problems.push(`${col}: 使えない型です: ${c[1]}(使える型: ${TYPES.join(', ')})`)
      else if (Object.keys(opts).some((k) => k !== 'required' && k !== 'index')) problems.push(`${col}: 使えない指定です(使えるのは required と index)`)
      else if (lks.has(c[0])) problems.push(`${col}: 同じ名前の参照が、すでにあります。別の名前にしてください`)
      else if (cols.has(c[0])) {
        const old = cols.get(c[0])
        if (old[1] !== c[1] || !same(old[2] ?? {}, opts)) problems.push(`${col}: すでにある列と定義が違います(いま: ${JSON.stringify(old)}、重ね: ${JSON.stringify(c)})。別の名前にするか、いまの定義に合わせてください`)
      } else {
        const add = Object.keys(opts).length ? [c[0], c[1], opts] : [c[0], c[1]]
        target.columns.push(add)
        cols.set(c[0], add)
        if (c[1] === 'choice') ownChoice.add(col)
      }
    }
    for (const lk of items(t, 'lookups')) {
      if (!entryOk(lk)) {
        problems.push(`${name}: 参照は [名前, 参照先の表] か [名前, 参照先の表, { "onDelete": … }] にしてください(${JSON.stringify(lk)})`)
        continue
      }
      const col = `${name}.${lk[0]}`
      const opts = lk[2] ?? {}
      if (!NAME.test(lk[0])) problems.push(`${col}: 参照の名前は、小文字の英字で始まる英数字と _ にしてください`)
      else if (RESERVED.has(lk[0]) || cols.has(lk[0])) problems.push(`${col}: 同じ名前の列が、すでにあります。別の名前にしてください`)
      else if (!(lk[1] in tables)) problems.push(`${col}: 参照先の表 ${lk[1]} がありません`)
      else if (Object.keys(opts).some((k) => k !== 'onDelete') || !ON_DELETE.has(opts.onDelete ?? 'NO ACTION')) problems.push(`${col}: 使えない指定です(onDelete に使えるのは ${[...ON_DELETE].sort().join(', ')})`)
      else if (lks.has(lk[0])) {
        const old = lks.get(lk[0])
        if (old[1] !== lk[1] || !same(old[2] ?? {}, opts)) problems.push(`${col}: すでにある参照と定義が違います。別の名前にするか、いまの定義に合わせてください`)
      } else {
        const add = Object.keys(opts).length ? [lk[0], lk[1], opts] : [lk[0], lk[1]]
        target.lookups.push(add)
        lks.set(lk[0], add)
      }
    }
  }

  for (const [name, t] of Object.entries(overTables)) {
    if (!(name in tables) || !isObject(t)) continue
    const target = tables[name]
    const names = new Set([...target.columns.map((c) => c[0]), ...target.lookups.map((l) => l[0])])
    const retired = items(t, 'retired')
    for (const r of retired) {
      if (typeof r !== 'string') problems.push(`${name}: retired には列の名前を並べてください(${JSON.stringify(r)})`)
      else if (names.has(r)) problems.push(`${name}.${r}: 使っている列を retired にはできません。共通の列を止めるなら、共通の変更として CHANGES.md に書いてください`)
    }
    if (retired.length && !problems.length) {
      const have = target.retired ?? []
      target.retired = [...have, ...retired.filter((r) => !have.includes(r))]
    }
    const unique = items(t, 'unique')
    if (unique.length && !added.has(name)) problems.push(`${name}: unique は、重ねるファイルで足した表にだけ書けます(一意にするときに、重なった行が消えるため)`)
    else if (unique.length) {
      for (const u of unique) {
        if (!Array.isArray(u) || !u.length || u.some((c) => !names.has(c))) problems.push(`${name}: unique の列がありません: ${JSON.stringify(u)}`)
      }
      target.unique = unique
    }
  }

  merged.choices ??= {}
  for (const [col, values] of Object.entries(overChoices)) {
    if (!ownChoice.has(col)) problems.push(`${col}: 重ねるファイルで足した choice の列にだけ、選択肢を書けます`)
    else if (!Array.isArray(values) || !values.length || values.some((v) => typeof v !== 'string')) problems.push(`${col}: 選択肢は、文字の値を 1 つ以上並べてください`)
    else merged.choices[col] = values
  }
  for (const col of [...ownChoice].filter((c) => !(c in overChoices)).sort()) problems.push(`${col}: choice の列には、choices に選択肢を書いてください`)
  return { merged, problems }
}

/** リポジトリの定義を読む。重ねるファイルがなければ schema.json そのまま */
export function loadSchema(root) {
  const base = JSON.parse(readFileSync(join(root, 'server', 'schema.json'), 'utf8'))
  const path = join(root, 'server', 'ccp', 'client', 'schema.json')
  if (!existsSync(path)) return { schema: base, problems: [] }
  let overlay
  try {
    overlay = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    return { schema: base, problems: [`読めません(${e.message})`] }
  }
  const { merged, problems } = mergeOverlay(base, overlay)
  return { schema: merged, problems }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
  process.stdout.write(JSON.stringify(mergeOverlay(read(process.argv[2]), read(process.argv[3]))))
}
