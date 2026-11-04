// 撮影・デモ用: 取り込んだデータの一覧(src/data/dataList.ts)の身代わり。メモリ上の表を読み、検索とページ送りをブラウザの中で行う。
// 本物の絞り込みは server/ccp/datalist.py。見本の印の出方を確かめられるように、はじめの 6 商品だけを見本の扱いにする。
// 見本を消すと、この身代わりの中で見本の行を隠すだけ(配信カードなどの見本の画面は壊さない)
import type { DataListColumn, DataListPage, DataListRow, DataListService as Real, SeedStatus } from '../data/dataList'
import { fuzzyMatch, termsOf } from '../fuzzySearch'
import { tables } from './db'

const TABLE: Record<string, string> = { spu: 'ProductsService', sku: 'SkuService', sku_stock: 'SkuStockService', weekly: 'WeeklyPerformancesService', ranking: 'ProductRankingsService' }

const COLUMNS: Record<string, [string, string][]> = {
  spu: [['product_code', 'text'], ['name', 'text'], ['market', 'choice'], ['page_url', 'text'], ['category', 'choice'], ['price', 'numeric'], ['stock', 'int'], ['season', 'choice'], ['rating', 'numeric'], ['units_4w', 'int'], ['as_of', 'timestamptz']],
  sku: [['market', 'text'], ['sku_code', 'text'], ['product_code', 'text'], ['color', 'text'], ['size', 'text'], ['price', 'numeric'], ['as_of', 'timestamptz'], ['source', 'text']],
  sku_stock: [['market', 'text'], ['sku_code', 'text'], ['stock', 'int'], ['as_of', 'timestamptz'], ['source', 'text']],
  weekly: [['name', 'text'], ['product_code', 'text'], ['week_start', 'date'], ['units', 'int'], ['revenue', 'numeric'], ['stock', 'int'], ['market', 'text']],
  forecast: [['market', 'text'], ['date', 'date'], ['temp_max', 'float'], ['temp_min', 'float'], ['precip_prob', 'float'], ['weather', 'text'], ['issued_at', 'timestamptz']],
  ranking: [['market', 'text'], ['product_code', 'text'], ['week_start', 'date'], ['channel', 'text'], ['rank', 'int'], ['units', 'int'], ['as_of', 'timestamptz']],
}

const forecast = (): DataListRow[] => {
  const out: DataListRow[] = []
  const today = new Date()
  for (const market of ['JP', 'US'])
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getTime() + i * 86_400_000)
      out.push({ id: `fc-${market}-${i}`, market, date: d.toISOString().slice(0, 10), temp_max: 14 + i, temp_min: 6 + i, precip_prob: (i * 13) % 100, weather: i % 3 ? '晴れ' : '雨', issued_at: today.toISOString() })
    }
  return out
}

let removed = false
const sampleCodes = () => new Set((tables.ProductsService ?? []).slice(0, 6).map((p) => String(p.product_code)))
const skuCodesOf = (codes: Set<string>) => new Set((tables.SkuService ?? []).filter((r) => codes.has(String(r.product_code))).map((r) => String(r.sku_code)))

function rowsOf(name: string): DataListRow[] {
  const codes = sampleCodes()
  const sampleSkus = skuCodesOf(codes)
  const rows = name === 'forecast' ? forecast() : ((tables[TABLE[name]] ?? []) as DataListRow[])
  const marked = rows.map((r) => ({
    ...r,
    _sample: name === 'forecast' ? false : name === 'sku_stock' ? sampleSkus.has(String(r.sku_code)) : codes.has(String(r.product_code)),
  }))
  return removed ? marked.filter((r) => !r._sample) : marked
}

const ok = <T,>(data: T) => Promise.resolve({ data })

export const DataListService: typeof Real = {
  page(name, opts = {}) {
    const columns: DataListColumn[] = (COLUMNS[name] ?? []).map(([n, type]) => ({ name: n, type }))
    const all = rowsOf(name)
    const terms = termsOf(opts.q ?? '')
    const text = (r: DataListRow) => columns.filter((c) => ['text', 'choice', 'date'].includes(c.type)).map((c) => String(r[c.name] ?? '')).join(' ')
    const hit = terms.length ? all.filter((r) => fuzzyMatch(terms, [{ text: text(r), weight: 1 }])) : all
    const offset = opts.offset ?? 0
    const markets = new Map<string, number>()
    for (const r of all) markets.set(String(r.market ?? ''), (markets.get(String(r.market ?? '')) ?? 0) + 1)
    const page: DataListPage = {
      columns,
      rows: hit.slice(offset, offset + (opts.limit ?? 100)),
      total: all.length,
      matched: hit.length,
      sample: all.filter((r) => r._sample).length,
      byMarket: [...markets].sort().map(([market, rows]) => ({ market, rows })),
    }
    return ok(page)
  },
  seedStatus() {
    return ok<SeedStatus>({ found: removed ? {} : { products: sampleCodes().size, weekly_performances: rowsOf('weekly').filter((r) => r._sample).length }, used: [] })
  },
  removeSeed() {
    const got: SeedStatus = { found: { products: sampleCodes().size, weekly_performances: rowsOf('weekly').filter((r) => r._sample).length }, used: [] }
    removed = true
    return ok(got)
  },
}
