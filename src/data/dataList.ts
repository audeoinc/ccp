// 取り込んだデータの一覧(settings.datalist。X105)の窓口。サーバーは server/ccp/datalist.py の /api/datalist/…。
// 読むのはだれでも。見本を消す(seedStatus・removeSeed)は管理する人だけ(サーバーが確かめる)。
// 撮影・デモ用のビルドでは、メモリ上の表を読む身代わり(src/mock/dataList.ts)に差し替える。
import { callApi } from '../gcp/services'

export interface DataListColumn {
  name: string
  type: string
}

/** 1 行。列の名前 → 値。id と、見本の印 _sample も入る */
export type DataListRow = Record<string, unknown> & { id: string; _sample?: boolean }

export interface DataListPage {
  columns: DataListColumn[]
  rows: DataListRow[]
  /** 表の全部の行数(検索に関係なく) */
  total: number
  /** 検索に当たった行数 */
  matched: number
  /** 見本の行数(検索に関係なく) */
  sample: number
  byMarket: { market: string; rows: number }[]
}

export interface SeedStatus {
  /** 入っている見本の行。表 → 件数 */
  found: Record<string, number>
  /** 見本を使っている、見本でない行。あれば消せない */
  used: { table: string; column: string; ref: string; count: number }[]
}

type Res<T> = { data?: T; error?: string }

async function call<T>(method: string, url: string): Promise<Res<T>> {
  const r = await callApi<T>(method, url)
  if (r.success && r.data !== undefined) return { data: r.data }
  return { error: r.error?.message ?? 'error' }
}

export const DataListService = {
  page: (name: string, opts: { q?: string; offset?: number; limit?: number } = {}) => {
    const p = new URLSearchParams({ offset: String(opts.offset ?? 0), limit: String(opts.limit ?? 100) })
    if (opts.q?.trim()) p.set('q', opts.q.trim())
    return call<DataListPage>('GET', `/api/datalist/${encodeURIComponent(name)}?${p}`)
  },
  seedStatus: () => call<SeedStatus>('GET', '/api/datalist/seed'),
  removeSeed: () => call<SeedStatus>('POST', '/api/datalist/seed/remove'),
}
