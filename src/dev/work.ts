// 開発用の画面の「出力ごとの作業」で使う、画面の中だけの計算(版の違い・表を作る SQL)
import type { VersionMeta } from './api'

/** 出力の名前・仕様の章・更新の目安(BIGQUERY_EXPORT.md の 1 章の表) */
export function outputs(): { value: string; label: string; chapter: string; refresh: string }[] {
  return [
    { value: 'spu', label: 'SPU', chapter: '2 章', refresh: '1 日 1 回' },
    { value: 'sku', label: 'SKU', chapter: '3 章', refresh: '1 日 1 回' },
    { value: 'sku_stock', label: 'SKU の在庫', chapter: '4 章', refresh: '元の在庫の更新に合わせる(1 時間に数回)' },
    { value: 'weekly', label: '週ごとの実績', chapter: '5 章', refresh: '1 日 1 回' },
    { value: 'forecast', label: '天気予報', chapter: '6 章', refresh: '予報の更新に合わせる' },
    { value: 'ranking', label: '販売チャネルごとの順位', chapter: '9 章', refresh: '1 日 1 回' },
  ]
}

export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string }

/** 行ごとの違い(最長共通部分列)。SQL は数百行までなので、素直な表で足りる */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.replace(/\r\n/g, '\n').split('\n')
  const y = b.replace(/\r\n/g, '\n').split('\n')
  const n = x.length
  const m = y.length
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ kind: 'same', text: x[i] })
      i++
      j++
    } else if (t[i + 1][j] >= t[i][j + 1]) out.push({ kind: 'del', text: x[i++] })
    else out.push({ kind: 'add', text: y[j++] })
  }
  while (i < n) out.push({ kind: 'del', text: x[i++] })
  while (j < m) out.push({ kind: 'add', text: y[j++] })
  return out
}

/** 出す先の表の場所(<プロジェクト>.<データセット>.<頭><出力>) */
export const targetTable = (dataset: string, prefix: string, output: string) => `${dataset.replace(/`/g, '').trim()}.${prefix}${output}`

const stamp = (iso?: string) => (iso ? new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '')

/**
 * 表を作る SQL(BigQuery のコンソール・スケジュールされたクエリに貼る形)。
 * 先頭のコメントに、出力・版・答え合わせの結果・更新の目安を入れる(貼ったあとで、どの版かが分かるように)
 */
export function ddl(output: string, sql: string, table: string, meta?: VersionMeta | null): string {
  const o = outputs().find((x) => x.value === output)
  const body = sql.trim().replace(/;\s*$/, '')
  const check = meta?.check ? `NG ${meta.check.ng} / 注意 ${meta.check.warn}(${stamp(meta.check.checked_at)}、${meta.check.rows.toLocaleString()} 行)` : 'まだ'
  return [
    `-- CCP の出力: ${o?.label ?? output}(BIGQUERY_EXPORT.md の ${o?.chapter ?? '?'})`,
    meta ? `-- 版: v${meta.v}(${stamp(meta.created)} 作成)` : '-- 版: 保存していない SQL',
    `-- 答え合わせ: ${check}`,
    `-- 更新の目安: ${o?.refresh ?? '?'}。BigQuery の「スケジュールされたクエリ」に貼って、頻度を設定する`,
    `CREATE OR REPLACE TABLE \`${table}\` AS`,
    body,
    ';',
    '',
  ].join('\n')
}
