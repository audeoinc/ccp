// BigQuery からの取り込み(バックログ B2・B4。サーバーは server/ccp/bq_import.py)。
// 画面を開いたとき(force なし。変わった出力だけ取り込む)と、⚙ の「BigQuery から取り込む」(force)で呼ぶ。
// BigQuery の設定がない環境(撮影用のビルド・設定前の Workbench)では、configured: false が返る(何もしない)。
import { appPath } from '../appRoot'
import { tr } from '../i18n'

export interface BqOutputStatus {
  /** spu / sku / sku_stock / weekly / forecast */
  name: string
  label: string
  /** ok / error / never(まだ取り込んでいない) */
  status: string
  message: string
  /** 最後に取り込めたデータの、BigQuery 側の時点 */
  dataAsOf?: string
  importedAt?: string
  rows?: number
}

export interface BqSyncResult {
  configured: boolean
  imported: { name: string; rows: number; summary: string }[]
  failed: { name: string; message: string }[]
  outputs: BqOutputStatus[]
}

const EMPTY: BqSyncResult = { configured: false, imported: [], failed: [], outputs: [] }

/** 取り込みを依頼する。失敗しても投げずに、理由を返す(取り込めなくても、画面はいまのデータで使えるため) */
export async function syncBigQuery(force: boolean): Promise<{ result: BqSyncResult; error?: string }> {
  try {
    const res = await fetch(appPath(`/api/bq/sync${force ? '?force=true' : ''}`), { method: 'POST' })
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: BqSyncResult; error?: { message: string; code?: string } } | null
    // 撮影用のビルドなど、API がない環境は、設定がないのと同じに扱う
    if (!json) return { result: EMPTY }
    // DB の起動中は、データの読み込みの側が準備中の表示を出し、準備ができたら読み込み直す(そのときに、また取り込みを依頼する)
    if (json.error?.code?.startsWith('db_')) return { result: EMPTY }
    if (!json.success || !json.data) return { result: EMPTY, error: json.error?.message ?? tr('BigQuery から取り込めませんでした', 'Could not import from BigQuery') }
    return { result: json.data }
  } catch {
    return { result: EMPTY }
  }
}

/** 出力の名前を、画面の言葉に */
export const bqOutputLabel = (name: string): string =>
  ({
    spu: tr('商品(SPU)', 'Products (SPU)'),
    sku: tr('SKU', 'SKUs'),
    sku_stock: tr('在庫', 'Stock'),
    weekly: tr('週ごとの実績', 'Weekly results'),
    forecast: tr('天気予報', 'Weather forecast'),
  })[name] ?? name
