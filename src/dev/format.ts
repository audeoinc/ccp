// 開発用の画面で、表・列を写すときの形(スプレッドシートに貼る TSV、Gemini・Claude に渡す Markdown)
import type { Column, ColumnProfile, Row } from './api'

const cell = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** タブ区切り(スプレッドシートにそのまま貼れる)。値の中のタブ・改行は空白にする */
export function toTsv(columns: Column[], rows: Row[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ')
  return [columns.map((c) => c.name).join('\t'), ...rows.map((r) => columns.map((c) => clean(cell(r[c.name]))).join('\t'))].join('\n')
}

/** Markdown の表(Gemini・Claude に貼る用) */
export function toMarkdown(columns: Column[], rows: Row[]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
  return [
    `| ${columns.map((c) => esc(c.name)).join(' | ')} |`,
    `|${columns.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${columns.map((c) => esc(cell(r[c.name]))).join(' | ')} |`),
  ].join('\n')
}

/** 表の列の一覧(Markdown)。Gemini に渡す「元の表と列」(DEVTOOLS.md の 4 章の 6)の形 */
export function columnsMarkdown(ref: string, columns: Column[], description?: string): string {
  const head = [`### \`${ref}\``, ...(description ? ['', description] : []), '', '| 列 | 型 | モード | 説明 |', '|---|---|---|---|']
  return [...head, ...columns.map((c) => `| ${c.name} | ${c.type} | ${c.mode ?? ''} | ${(c.description ?? '').replace(/[|\r\n]+/g, ' ')} |`)].join('\n')
}

export const cellText = cell

/** 割合の表示(小さい割合は桁を増やす) */
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(v < 0.01 && v > 0 ? 2 : 1)}%`)

/** 列の中身を、AI・Claude に渡す形(Markdown)にする */
export function profileMarkdown(p: ColumnProfile): string {
  const lines = [
    `### 列の中身: \`${p.table}\`.\`${p.column}\`(${p.type}${p.mode !== 'NULLABLE' ? `、${p.mode}` : ''})`,
    ...(p.description ? [p.description] : []),
    '',
    `- 行数: ${p.total?.toLocaleString() ?? '?'}`,
    `- 空(NULL): ${p.nulls?.toLocaleString() ?? '?'}(${pct(p.null_rate)})`,
    ...(p.distinct_approx != null ? [`- 値の種類(近似): ${p.distinct_approx.toLocaleString()}`] : []),
    ...(p.min_value != null ? [`- 最小: ${p.min_value} / 最大: ${p.max_value}`] : []),
    ...(p.min_len != null ? [`- 文字の長さ: ${p.min_len}〜${p.max_len}`] : []),
  ]
  if (p.top?.length) {
    lines.push('', '| 値 | 件数 |', '|---|---|', ...p.top.map((t) => `| ${t.value ?? '(NULL)'} | ${t.n.toLocaleString()} |`))
  }
  return lines.join('\n')
}

