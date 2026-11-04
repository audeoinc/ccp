// 仕事の設定(BigQuery の表の場所・AI のモデルなど)。サーバーは server/ccp/appsettings.py の /api/settings/…(管理する人だけ)。
// 正は DB だけ。前の版の環境変数は、サーバーが最初に一度だけ DB に写す(copiedFromEnvAt)。保存したら、起動し直さずに次の呼び出しから効く。
// 撮影・デモ用のビルドでは、メモリ上に持つ身代わり(src/mock/appSettings.ts)に差し替える。
import { callApi } from '../gcp/services'
import type { ImportCheck } from './dataImport'

export type SettingsGroup = 'bq' | 'ai'

export interface SettingsChange {
  at: string
  by: string
  /** screen = 画面で変えた / env = 環境変数から写した */
  source: string
  /** 変えた項目 */
  changes: string[]
}

export interface SettingsView {
  values: Record<string, string | number>
  defaults: Record<string, string | number>
  /** 項目 → 前の版の環境変数の名前(どの値が写ったかを見せる) */
  env: Record<string, string>
  /** DB に行がある(ない間は、環境変数か既定で動いている) */
  saved: boolean
  updatedAt?: string | null
  updatedBy?: string | null
  copiedFromEnvAt?: string | null
  history: SettingsChange[]
  choices: { thinking?: string[] }
  /** 設定の型から写した BigQuery の表の場所が、確認待ち */
  pendingTemplate?: { exportedAt?: string } | null
}

/** いま使える Gemini のモデル(サーバーが Vertex AI から読み、1 日覚える) */
export interface AiModels {
  models: string[]
  /** 最後に読めた時刻(読めたことがなければ null) */
  at: string | null
  /** いま読めた(false = 前の一覧かコードの一覧を出している) */
  live: boolean
  /** 読めなかった理由 */
  error: string
  /** コードに持つ一覧を出している */
  builtin: boolean
}

/** AI を短く 1 回呼んだ結果 */
export interface AiTry {
  ok: boolean
  seconds: number
  message: string
  via: 'gemini' | 'outlet'
  model: string
}

type Res<T> = { data?: T; error?: string; code?: string }

async function call<T>(method: string, url: string, body?: unknown): Promise<Res<T>> {
  const r = await callApi<T>(method, url, body)
  return r.success && r.data !== undefined ? { data: r.data } : { error: r.error?.message ?? 'error', code: r.error?.code }
}

export const AppSettingsService = {
  get: (group: SettingsGroup) => call<SettingsView>('GET', `/api/settings/${group}`),
  /** AI は、呼び方が変わるときサーバーが保存の前に試し、通らなければ code=try_failed で断る。force = それでも保存する */
  save: (group: SettingsGroup, values: Record<string, string | number>, force = false) => call<SettingsView>('PUT', `/api/settings/${group}`, { values, force }),
  aiModels: (refresh = false) => call<AiModels>('GET', `/api/settings/ai/models${refresh ? '?refresh=true' : ''}`),
  /** 保存の前の値で、AI を短く 1 回呼んでみる(何も保存しない) */
  tryAi: (values: Record<string, string | number>) => call<AiTry>('POST', '/api/settings/ai/try', { values }),
  /** 保存の前に、入れた表の場所で読んで確かめる(何も書かない)。names で出力を絞る */
  tryBq: (values: Record<string, string | number>, names?: string[]) => call<ImportCheck>('POST', '/api/settings/bq/try', { values, only: names ?? [] }),
}
