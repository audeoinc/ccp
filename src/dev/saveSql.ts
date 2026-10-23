// SQL を作業ファイル(server/devwork/files/)に保存する(会話の「保存」と、SQL の欄の「保存」で同じ)。
// 名前の初期値は、分かりやすく: AI が付けた英語の短い名前(例: spu_from_ctlg)、なければ作る出力・FROM の表の名前と日時
import { FilesApi, isFailure } from './api'
import { outputs } from './work'

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

/** ファイル名に使える、英小文字・数字・_ だけの短い名前にする */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)

/**
 * SQL のファイル名の初期値。作る出力を選んでいれば、取り込み先の PostgreSQL の表の名前を頭に付ける
 * (例: products__spu_from_ctlg.sql。どの表に入れる SQL かが、名前で分かるように)
 */
export function sqlFileName(sql: string, opts: { name?: string; output?: string } = {}): string {
  const pg = outputs().find((o) => o.value === opts.output)?.pg
  const head = pg ? `${pg}__` : ''
  const fromAi = slug(opts.name ?? '')
  if (fromAi) return `${head}${fromAi}.sql`
  // AI の名前がなければ、FROM の最初の表(`p.d.表` の表の名前)と日時
  const m = /\bFROM\s+`?[\w-]+\.[\w]+\.([\w$]+)`?/i.exec(sql)
  return `${head}${slug(m?.[1] ?? '') || 'query'}_${stamp()}.sql`
}

/**
 * 名前を聞いて保存する。同じ名前があれば、上書きしてよいかを確かめる。
 * 保存した名前(やめたときは null)と、知らせる文を返す
 */
export async function saveSqlFile(sql: string, suggested: string): Promise<{ name: string | null; note: string }> {
  const raw = window.prompt('作業ファイルに保存する名前(.sql)', suggested)?.trim()
  if (!raw) return { name: null, note: '' }
  const name = /\.(sql|md|txt)$/i.test(raw) ? raw : `${raw}.sql`
  const list = await FilesApi.list()
  if (!isFailure(list) && list.files.some((f) => f.name === name) && !window.confirm(`${name} は、もうあります。上書きしますか?`)) return { name: null, note: '' }
  const r = await FilesApi.save(name, sql)
  return isFailure(r) ? { name: null, note: r.error } : { name, note: `${name} に保存しました(作業ファイル)` }
}
