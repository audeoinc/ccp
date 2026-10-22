// 開発用の画面で、表・列を写すときの形(スプレッドシートに貼る TSV、Gemini・Claude に渡す Markdown)
import type { Column, Row } from './api'

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
