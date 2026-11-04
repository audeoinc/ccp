// データの取り込みの管理(settings.dataimport。⚙ →「データの取り込み」)。サーバーは server/ccp/bq_import.py の /api/bq/…。
// 状態・今すぐ取り込む・確認だけ・記録・定期の取り込みの設定。確認だけ・記録・設定の変更・出力を絞った取り込みは、管理する人だけ(サーバーが確かめる)。
// 撮影・デモ用のビルドでは、見本の値を返す身代わり(src/mock/dataImport.ts)に差し替える。
import { callApi } from '../gcp/services'

export interface ImportOutput {
  /** spu / sku / sku_stock / weekly / forecast / ranking */
  name: string
  label: string
  env: string
  /** 写す先の CCP の DB の表(変えられない) */
  dest: string
  /** ok / error / never(まだ取り込んでいない) */
  status: string
  message: string
  /** 最後に取り込めたデータの、BigQuery 側の時点 */
  dataAsOf?: string | null
  /** 最後に取り込めた時刻と行数 */
  importedAt?: string | null
  rows?: number | null
  /** その前に取り込めたときの行数(増減を出す) */
  rowsBefore?: number | null
  /** 最後に試した時刻(失敗も含む)と、そのときの BigQuery 側の最終更新 */
  triedAt?: string | null
  sourceModified?: string | null
  /** 最後に BigQuery を確かめた時刻(変わっていなくて取り込まなかったときも) */
  checkedAt?: string | null
  intervalMin: number
  /** 次に確かめる時刻(定期の取り込みが動いているときだけ) */
  nextCheckAt?: string | null
  /** 同じ理由の失敗が続いた回数 */
  repeat?: number | null
  trigger?: string | null
  actor?: string | null
  /** データの時点が古すぎる(在庫は 6 時間・ほかは 2〜10 日。server/ccp/bq_validate.py の FRESH) */
  stale: boolean
}

export interface ImportAuto {
  enabled: boolean
  /** BQ_AUTO_SYNC=0 で止めている(画面からは入れられない) */
  envDisabled: boolean
  active: boolean
  intervals: Record<string, number>
  choices: number[]
}

export interface ImportStatus {
  configured: boolean
  outputs: ImportOutput[]
  unconfigured: { name: string; label: string; env: string; dest: string }[]
  auto: ImportAuto
}

export interface ImportSyncResult extends ImportStatus {
  imported: { name: string; rows: number; summary: string }[]
  failed: { name: string; message: string }[]
  /** 取り込まなかった理由(auto = 定期の取り込みに任せた / recent = 少し前に確かめた / busy = ほかの取り込みの最中) */
  skipped?: string
}

export interface ImportCheck {
  configured: boolean
  checkedAt?: string
  outputs: { name: string; label: string; ok: boolean; rows: number | null; dataAsOf: string | null; /** BigQuery の種類(TABLE / VIEW など。読めたときだけ) */ kind?: string; issues: { level: string; text: string }[] }[]
}

export interface ImportRecord {
  source: string
  status: string
  sourceModified?: string | null
  dataAsOf?: string | null
  rows?: number | null
  message: string
  importedAt?: string | null
  checkedAt?: string | null
  repeat: number
  trigger?: string | null
  actor?: string | null
}

export interface ImportSettings {
  enabled: boolean
  intervals: Record<string, number>
  envDisabled: boolean
  choices: number[]
}

type Res<T> = { data?: T; error?: string; forbidden?: boolean }

async function call<T>(method: string, url: string, body?: unknown): Promise<Res<T>> {
  const r = await callApi<T>(method, url, body)
  if (r.success && r.data !== undefined) return { data: r.data }
  return { error: r.error?.message ?? 'error', forbidden: r.error?.code === 'forbidden' }
}

const only = (names?: string[]) => (names?.length ? `only=${encodeURIComponent(names.join(','))}` : '')

export const DataImportService = {
  status: () => call<ImportStatus>('GET', '/api/bq/status'),
  /** force = 変わっていなくても読み直す。names = 出力を絞る(管理する人だけ) */
  sync: (opts: { force?: boolean; names?: string[] } = {}) =>
    call<ImportSyncResult>('POST', `/api/bq/sync?trigger=manual${opts.force ? '&force=true' : ''}${opts.names?.length ? `&${only(opts.names)}` : ''}`),
  /** 読んで確かめるだけ(書き込まない) */
  check: (names?: string[]) => call<ImportCheck>('POST', `/api/bq/check${names?.length ? `?${only(names)}` : ''}`),
  history: (source?: string, limit = 50) => call<ImportRecord[]>('GET', `/api/bq/history?limit=${limit}${source ? `&source=${encodeURIComponent(source)}` : ''}`),
  settings: () => call<ImportSettings>('GET', '/api/bq/settings'),
  saveSettings: (v: { enabled: boolean; intervals: Record<string, number> }) => call<ImportSettings>('PUT', '/api/bq/settings', v),
}
