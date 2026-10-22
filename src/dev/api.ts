// 開発用の画面(/dev/)の、サーバーの API の窓口(server/ccp/devtools.py。設計は docs/DEVTOOLS.md)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、見本の表を返す身代わり(src/mock/devApi.ts)に差し替える。
import { appPath } from '../appRoot'

export interface Column {
  name: string
  type: string
  mode?: string
  description?: string
}

export type Row = Record<string, unknown>

export interface Failure {
  ok: false
  error: string
}

export interface Status {
  enabled: boolean
  project: string | null
  account: string
  devwork: string
  max_gb: number
}

export interface Settings {
  /** よく見るデータセット(<プロジェクト>.<データセット>)。新しく開いたものが先頭 */
  datasets?: string[]
}

export interface TableInfo {
  ok: true
  ref: string
  type: string
  description: string
  rows: number | null
  bytes: number | null
  modified: string | null
  location: string | null
  partitioning: { type: string; field: string } | null
  clustering: string[]
  view_sql: string
  columns: Column[]
}

export interface DryRun {
  ok: true
  statement_type: string | null
  bytes: number | null
  columns: Column[]
  runnable: boolean
  reason: string | null
  max_bytes: number
}

export interface RunResult {
  ok: true
  columns: Column[]
  rows: Row[]
  total_rows: number | null
  bytes: number | null
  billed: number | null
  seconds: number
  cached: boolean
}

async function call<T>(path: string, init?: RequestInit): Promise<T | Failure> {
  try {
    const res = await fetch(appPath(`/api/dev${path}`), init)
    if (res.status === 404) return { ok: false, error: '開発用の画面が無効です(server/workbench.env に CCP_DEVTOOLS=1 を足して、サーバーを起動し直してください)' }
    const json = (await res.json().catch(() => null)) as T | Failure | null
    if (!json) return { ok: false, error: `サーバーの返事を読めませんでした(${res.status})` }
    return json
  } catch (e) {
    return { ok: false, error: `サーバーにつながりません(${e instanceof Error ? e.message : String(e)})` }
  }
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const q = encodeURIComponent

export const DevApi = {
  status: () => call<Status & { ok?: true }>('/status'),
  settings: () => call<Settings>('/settings'),
  saveSettings: (s: Settings) => call<{ ok: true }>('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }),
  datasets: (project?: string) => call<{ ok: true; project: string; datasets: string[] }>(`/bq/datasets${project ? `?project=${q(project)}` : ''}`),
  tables: (dataset: string) => call<{ ok: true; tables: { id: string; ref: string; type: string }[] }>(`/bq/tables?dataset=${q(dataset)}`),
  table: (ref: string) => call<TableInfo>(`/bq/table?ref=${q(ref)}`),
  preview: (ref: string) => call<{ ok: true; columns: Column[]; rows: Row[] }>(`/bq/preview?ref=${q(ref)}`),
  dryrun: (sql: string) => call<DryRun>('/bq/dryrun', post({ sql })),
  run: (sql: string, maxRows: number) => call<RunResult>('/bq/run', post({ sql, max_rows: maxRows })),
}

export const isFailure = (v: unknown): v is Failure => !!v && typeof v === 'object' && (v as { ok?: unknown }).ok === false

/** 読む量の表示(BigQuery の料金は読んだ量で決まるので、GB で見せる) */
export function bytesLabel(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
