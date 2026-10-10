import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import { locale, optionLabel, tr } from './i18n'
import { cardProgress, isDueSoonNotStarted } from './progress'
import { channelOptions, countryOptions, departmentOptions, statusOptions } from './status'

// 配信の一覧(ListView)の列と行。CSV の書き出しも、同じ定義を使う(画面と CSV で、列の並びと値をそろえるため)

/** 一覧の列。順番は、この並び。CSV の書き出しも、この定義を使う */
export type ColumnKey = 'date' | 'time' | 'name' | 'country' | 'channel' | 'department' | 'status' | 'owner' | 'due' | 'handoff' | 'questions' | 'theme' | 'products' | 'steps'

export interface Row {
  card: Cr854_deliverycards
  products: number
  /** 制作からの質問の、未解決の数 */
  questions: number
  done: number
  total: number
  dueSoon: boolean
}

export interface Column {
  key: ColumnKey
  label: () => string
  /** 表示と CSV の値 */
  text: (r: Row) => string
  /** 並べ替えの値(なければ text) */
  sort?: (r: Row) => string | number
}

// 制作の締め切り(YYYY-MM-DD)。時差でずれないよう、日付の文字列から、その日のローカルの日付として作る
const dueText = (ymd?: string) => {
  if (!ymd) return ''
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { year: 'numeric', month: '2-digit', day: '2-digit' })
}
// 選択肢の表示名は、値から求める(〜name の列は、データの入れ方によっては空のため)
const label = (options: { value: number; label: string }[], v?: number) => optionLabel(options.find((o) => o.value === v)?.label)
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '')
// 日付は、数字を先・曜日を後ろにする(曜日の文字の幅で、数字の位置がずれないように)
const date = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const ymd = d.toLocaleDateString(locale(), { year: 'numeric', month: '2-digit', day: '2-digit' })
  const wd = d.toLocaleDateString(locale(), { weekday: 'short' })
  return locale() === 'ja-JP' ? `${ymd}(${wd})` : `${ymd} ${wd}`
}

export const COLUMNS: Column[] = [
  { key: 'date', label: () => tr('配信日', 'Date'), text: (r) => date(r.card.cr854_scheduledat), sort: (r) => r.card.cr854_scheduledat ?? '' },
  { key: 'time', label: () => tr('時刻', 'Time'), text: (r) => time(r.card.cr854_scheduledat), sort: (r) => time(r.card.cr854_scheduledat) },
  { key: 'name', label: () => tr('配信名', 'Name'), text: (r) => r.card.cr854_name },
  { key: 'country', label: () => tr('国', 'Country'), text: (r) => label(countryOptions, r.card.cr854_country) },
  { key: 'channel', label: () => tr('チャネル', 'Channel'), text: (r) => label(channelOptions, r.card.cr854_channel) },
  { key: 'department', label: () => tr('種別', 'Type'), text: (r) => label(departmentOptions, r.card.cr854_department) },
  { key: 'status', label: () => tr('ステータス', 'Status'), text: (r) => label(statusOptions, r.card.cr854_status), sort: (r) => r.card.cr854_status ?? 0 },
  { key: 'owner', label: () => tr('担当者', 'Owner'), text: (r) => r.card.cr854_owner ?? '' },
  { key: 'due', label: () => tr('制作の締め切り', 'Production due'), text: (r) => dueText(r.card.cr854_productiondue), sort: (r) => r.card.cr854_productiondue ?? '' },
  {
    key: 'handoff',
    label: () => tr('制作への引き継ぎ', 'Handoff'),
    text: (r) =>
      r.card.cr854_handedoffat
        ? `${new Date(r.card.cr854_handedoffat).toLocaleDateString(locale(), { month: '2-digit', day: '2-digit' })}${r.card.cr854_productionowner ? ` · ${r.card.cr854_productionowner}` : ''}`
        : '',
    sort: (r) => r.card.cr854_handedoffat ?? '',
  },
  { key: 'questions', label: () => tr('未解決の質問', 'Open questions'), text: (r) => (r.questions ? String(r.questions) : ''), sort: (r) => r.questions },
  { key: 'theme', label: () => tr('テーマ', 'Theme'), text: (r) => r.card.cr854_theme ?? '' },
  { key: 'products', label: () => tr('商品数', 'Products'), text: (r) => String(r.products), sort: (r) => r.products },
  { key: 'steps', label: () => tr('工程', 'Steps'), text: (r) => `${r.done} / ${r.total}`, sort: (r) => r.done },
]

export const DEFAULT_COLUMNS: ColumnKey[] = COLUMNS.map((c) => c.key)

/** 警告の基準の日時: 制作の締め切りがあれば、その日の終わり。なければ、配信日時 */
const deadlineOf = (card: Cr854_deliverycards): string | undefined => {
  if (!card.cr854_productiondue) return card.cr854_scheduledat
  const [y, m, d] = card.cr854_productiondue.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59).toISOString()
}

/** 配信カードと掲載商品の数から、一覧の行を作る(締め切りの警告も、ここで決める) */
export function toRows(cards: Cr854_deliverycards[], productCounts: Map<string, number>, questionCounts: Map<string, number> = new Map()): Row[] {
  const now = new Date()
  return cards.map((card) => {
    const products = productCounts.get(card.cr854_deliverycardid) ?? 0
    const p = cardProgress(card, products)
    return { card, products, questions: questionCounts.get(card.cr854_deliverycardid) ?? 0, done: p.done, total: p.total, dueSoon: isDueSoonNotStarted(deadlineOf(card), p, now, card.cr854_scheduledat) }
  })
}

/** 一覧の行を CSV にして、ダウンロードさせる(Excel で開けるよう、BOM と CRLF を付ける) */
export function downloadCsv(rows: Row[], columns: ColumnKey[], fileName: string) {
  const shown = COLUMNS.filter((c) => columns.includes(c.key))
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const sorted = [...rows].sort((a, b) => (a.card.cr854_scheduledat ?? '').localeCompare(b.card.cr854_scheduledat ?? ''))
  const lines = [shown.map((c) => esc(c.label())).join(','), ...sorted.map((r) => shown.map((c) => esc(c.text(r))).join(','))]
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
