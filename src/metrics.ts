// 商品・カテゴリの週の指標(X48)の、項目の一覧と、値・増減の書き方。画面の部品(ProductMetrics.tsx)とは分けておく。
// 値は、外で計算し終えたもの(表 product_metrics / category_metrics)。ここでは計算しない。定義は docs/METRICS_FORMAT.md:
//   順位   … 商品は、同じ市場の全商品の中で。カテゴリは、同じ市場のカテゴリ同士で(1 が上。rank_of が母数)
//   WoW    … 前の週と比べる
//   MoM    … 暦の月。週の最終日が入る月の 1 日からその日まで と、前の月の同じ日まで を比べる(在庫・率は、その日の値と前の月の同じ日の値)
//   YoY    … 前年の同じ週(52 週前)と比べる
//   SKU 欠品率 … 週の最終日(日曜)の在庫が 0 の SKU の数 ÷ SKU の数(販売を終えた SKU は数えない)
import { tr } from './i18n'

/** 値の種類。count / money は増減を割合(0.05 = +5%)で、rate は差(0.02 = +2pt)で持つ */
export type MetricKind = 'count' | 'money' | 'rate'

export interface MetricDef {
  key: string
  kind: MetricKind
  /** 順位を持つか(在庫・欠品率は持たない) */
  ranked: boolean
  label: () => string
}

// 項目の名前は、サーバー(server/ccp/metrics.py)と同じ。並びは表の行の順
export const PRODUCT_METRIC_KEYS = ['spu_stock', 'sku_stock', 'sku_stockout_rate', 'store_sales', 'ec_sales', 'ec_favorites'] as const
export const CATEGORY_METRIC_KEYS = ['ec_sessions', 'ec_sales', 'ec_favorites'] as const

export const productMetricDefs = (): MetricDef[] => [
  { key: 'spu_stock', kind: 'count', ranked: false, label: () => tr('SPU 在庫数', 'SPU stock') },
  { key: 'sku_stock', kind: 'count', ranked: false, label: () => tr('SKU 在庫数', 'SKU stock') },
  { key: 'sku_stockout_rate', kind: 'rate', ranked: false, label: () => tr('SKU 欠品率', 'SKU stockout rate') },
  { key: 'store_sales', kind: 'money', ranked: true, label: () => tr('店舗売上', 'Store sales') },
  { key: 'ec_sales', kind: 'money', ranked: true, label: () => tr('EC 売上', 'EC sales') },
  { key: 'ec_favorites', kind: 'count', ranked: true, label: () => tr('EC お気に入り数', 'EC favorites') },
]

export const categoryMetricDefs = (): MetricDef[] => [
  { key: 'ec_sessions', kind: 'count', ranked: true, label: () => tr('EC セッション数', 'EC sessions') },
  { key: 'ec_sales', kind: 'money', ranked: true, label: () => tr('EC 売上', 'EC sales') },
  { key: 'ec_favorites', kind: 'count', ranked: true, label: () => tr('EC お気に入り数', 'EC favorites') },
]

/** 増減の書き方(+5.2% / -1.0pt)。0 は ±0 */
export function changeText(v: number | undefined, kind: MetricKind): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '-'
  const n = Math.round(v * 1000) / 10
  const sign = n > 0 ? '+' : n < 0 ? '' : '±'
  return `${sign}${n.toFixed(1)}${kind === 'rate' ? 'pt' : '%'}`
}

/** 週の開始日(月曜。YYYY-MM-DD)から、「10/12〜10/18」 */
export function weekRange(weekStart?: string): string {
  if (!weekStart) return ''
  const [y, m, d] = weekStart.slice(0, 10).split('-').map(Number)
  const end = new Date(y, m - 1, d + 6)
  return `${m}/${d}〜${end.getMonth() + 1}/${end.getDate()}`
}
