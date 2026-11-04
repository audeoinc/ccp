// 取り込んだデータの一覧(settings.datalist。X105)の、画面の部品でない所: 商品のページの URL・列の名前・値の出し方・CSV。
import type { DataListColumn, DataListRow } from './data/dataList'
import { productUrl } from './links'
import type { Product } from './models/products'
import { locale, tr } from './i18n'

/** 6 つの出力(server/ccp/bq_import.py の DEST と同じ並び) */
export const DATA_OUTPUTS = ['spu', 'sku', 'sku_stock', 'weekly', 'forecast', 'ranking'] as const

/**
 * 商品のページの URL。page_url があればそれ、なければ店の URL の形(settings.shopurl が公開のときだけ)。組めなければ空。
 * 利用先の実データしだいで作り方が変わるかもしれないので、一覧と CSV は、ここだけを通す
 */
export function productPageUrl(row: DataListRow, patternsOn: boolean): string {
  const own = typeof row.page_url === 'string' ? row.page_url.trim() : ''
  if (own) return own
  if (!patternsOn) return ''
  const url = productUrl(row as unknown as Product)
  // 店の URL が未設定だと {shop} が残る。開けないリンクは出さない
  return /^https?:\/\//.test(url) && !url.includes('{') ? url : ''
}

/** 列の見出し。知らない列は、列の名前のまま(schema.json に列が増えても、一覧は止まらない) */
export function columnLabel(name: string): string {
  const labels: Record<string, string> = {
    product_code: tr('商品コード', 'Product code'),
    name: tr('名前', 'Name'),
    market: tr('市場', 'Market'),
    page_url: tr('ページ', 'Page'),
    category: tr('カテゴリ', 'Category'),
    category_path: tr('カテゴリの階層', 'Category path'),
    gender: tr('性別', 'Gender'),
    season: tr('シーズン', 'Season'),
    price: tr('価格', 'Price'),
    regular_price: tr('通常価格', 'Regular price'),
    stock: tr('在庫', 'Stock'),
    sales_trend: tr('売れ行き', 'Sales trend'),
    rating: tr('評価', 'Rating'),
    review_count: tr('レビュー数', 'Reviews'),
    last_review_at: tr('最後のレビュー', 'Last review'),
    weather: tr('天気', 'Weather'),
    description: tr('説明', 'Description'),
    image_url: tr('画像', 'Image'),
    image_caption: tr('画像の説明', 'Image caption'),
    units_4w: tr('4 週の販売数', 'Units (4 wk)'),
    revenue_4w: tr('4 週の売上', 'Revenue (4 wk)'),
    revenue_yoy: tr('売上の前年比', 'Revenue YoY'),
    views_4w: tr('4 週の閲覧数', 'Views (4 wk)'),
    cvr_4w: tr('4 週の購入率', 'CVR (4 wk)'),
    lift_hot: tr('暑い日の伸び', 'Lift (hot)'),
    lift_cold: tr('寒い日の伸び', 'Lift (cold)'),
    lift_rain: tr('雨の日の伸び', 'Lift (rain)'),
    hot_days: tr('暑い日数', 'Hot days'),
    cold_days: tr('寒い日数', 'Cold days'),
    rain_days: tr('雨の日数', 'Rain days'),
    weather_basis: tr('天気の相性の元', 'Weather basis'),
    as_of: tr('データの時点', 'Data as of'),
    issued_at: tr('発表の時点', 'Issued at'),
    sku_code: tr('SKU コード', 'SKU code'),
    color: tr('色', 'Color'),
    color_hex: tr('色の値', 'Color value'),
    size: tr('サイズ', 'Size'),
    length: tr('丈', 'Length'),
    source: tr('出どころ', 'Source'),
    week_start: tr('週の始まり', 'Week start'),
    units: tr('販売数', 'Units'),
    revenue: tr('売上', 'Revenue'),
    date: tr('日付', 'Date'),
    temp_max: tr('最高気温', 'High'),
    temp_min: tr('最低気温', 'Low'),
    precip_prob: tr('降水確率', 'Rain chance'),
    channel: tr('販売チャネル', 'Channel'),
    rank: tr('順位', 'Rank'),
  }
  return labels[name] ?? name
}

/** 値を文字に(一覧と CSV で同じ)。何が入っているかを確かめる画面なので、値は加工しすぎない */
export function cellText(c: DataListColumn, v: unknown): string {
  if (v === null || v === undefined) return ''
  if (c.type === 'timestamptz' && typeof v === 'string') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  if (typeof v === 'number') return v.toLocaleString(locale())
  return String(v)
}

/** CSV の 1 つの値。= などで始まる文字は、表計算ソフトで数式として動かないように、先頭に ' を付ける */
function csvCell(s: string): string {
  const safe = /^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-[\d.,]+$/.test(s)) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** 表計算ソフトが文字化けしないよう、先頭に BOM を付ける */
export const toCsv = (head: string[], lines: string[][]): string => `\uFEFF${[head, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`
