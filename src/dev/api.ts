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
  steps?: string[]
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
  /** 仕様のまとめ(利用先の資料から。Gemini に渡す。DEVTOOLS.md の 4 章の 8) */
  notes?: string
}

/** Gemini に何を渡すか(DEVTOOLS.md の 4 章) */
export interface ChatContext {
  /** 使うモデル(なければサーバーの既定) */
  model: string | null
  /** 作ろうとしている出力(spu など)。仕様の章と手本の SQL を渡す */
  output: string | null
  /** 画面で開いているデータセット(「このデータセット」の手がかり) */
  dataset: string
  /** 列(と先頭の数行)を渡す表 */
  tables: string[]
  sample_rows: boolean
  /** Gemini に SELECT を流させるか(読む量の上限つき) */
  allow_run: boolean
  notes: string
  sql: string
  /** いまの SQL を流した結果(エラー、または結果の先頭) */
  last: string
}

export interface ChatTurn {
  role: 'user' | 'model'
  text: string
}

export interface SqlBlock {
  title: string
  sql: string
}

/** 会話の 1 回分で、サーバーから起きた順に届くもの(NDJSON の 1 行) */
export type ChatEvent =
  | { type: 'start'; model: string; thinking?: string }
  | { type: 'thought'; text: string }
  | { type: 'step'; text: string }
  | { type: 'ping' }
  | { type: 'final'; reply: string; sqls: SqlBlock[]; questions: string[]; context_chars?: number }
  | { type: 'error'; error: string }

/**
 * 会話の 1 回分を送り、届いたそばから onEvent に渡す(思考・調べたこと・返事)。
 * signal で止められる。つながらない・途中で切れたときも、error として渡す
 */
export async function chatStream(messages: ChatTurn[], ctx: ChatContext, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response
  try {
    res = await fetch(appPath('/api/dev/ai/chat'), { ...post({ messages, ...ctx }), signal })
  } catch (e) {
    if (signal?.aborted) return
    onEvent({ type: 'error', error: `サーバーにつながりません(${e instanceof Error ? e.message : String(e)})` })
    return
  }
  if (!res.ok || !res.body) {
    onEvent({ type: 'error', error: res.status === 404 ? '開発用の画面が無効です(CCP_DEVTOOLS=1)' : `サーバーの返事を読めませんでした(${res.status})` })
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let ended = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        try {
          const ev = JSON.parse(line) as ChatEvent
          if (ev.type === 'final' || ev.type === 'error') ended = true
          onEvent(ev)
        } catch {
          // 壊れた行は飛ばす
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) return
    onEvent({ type: 'error', error: `途中で切れました(${e instanceof Error ? e.message : String(e)})` })
    return
  }
  if (!ended && !signal?.aborted) onEvent({ type: 'error', error: '返事が最後まで届きませんでした(サーバーのログを見てください)' })
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
  /** ビューが参照している元の表(ビューの中のビューもたどる) */
  sources: string[]
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
  /** 流したときの概算の料金(ドル。オンデマンドの単価から) */
  cost_usd: number | null
  price_per_tib: number
  weight: string
  /** 読むことになる元の表と、SQL に書いたビュー */
  tables: string[]
  views: string[]
}

/** ジョブの実行情報(結果の下に出す) */
export interface JobStats {
  job_id: string | null
  location: string | null
  processed: number | null
  billed: number | null
  cost_usd: number | null
  price_per_tib: number
  slot_ms: number | null
  elapsed: number | null
  cached: boolean
  /** 軽い / ふつう / 重い */
  weight: string
  tables: string[]
  views: string[]
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
  job?: JobStats
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
  projects: () => call<{ ok: true; default: string | null; projects: string[] }>('/bq/projects'),
  models: () => call<{ ok: true; default: string; models: string[]; thinking: string }>('/ai/models'),
  chatStream,
  context: (ctx: ChatContext) => call<{ ok: true; context: string }>('/ai/context', post({ messages: [], ...ctx })),
}

/** 出力ごとの版(server/devwork/outputs/<出力>/) */
export interface VersionMeta {
  v: number
  created: string
  note?: string
  check: { checked_at: string; rows: number; ng: number; warn: number } | null
}

export interface WorkInfo {
  ok: true
  outputs: Record<string, { label: string; env: string; versions: VersionMeta[]; adopted: number | null }>
  /** 出す先(<プロジェクト>.<データセット>)と、表の名前の頭 */
  target: { dataset?: string; prefix?: string }
}

export interface CheckIssue {
  level: string
  message: string
  count: number
  examples: string[]
}

export interface CheckResult {
  ok: true
  output: string
  columns: string[]
  missing: string[]
  missing_optional: string[]
  bytes: number
  cost_usd: number | null
  price_per_tib: number
  weight: string
  /** 結びつきを確かめる相手(採用の版がある出力) */
  context: string[]
  max_bytes: number
  ran: boolean
  error?: string
  rows?: number
  issues?: CheckIssue[]
  ng?: number
  warn?: number
  notes?: string[]
  checked_at?: string
  job?: JobStats
}

/** AI との会話(セッション)。server/devwork/chats/ に残る */
export interface ChatMeta {
  id: string
  title: string
  created: string
  updated: string
  count: number
  output: string
}

export const ChatApi = {
  list: () => call<{ ok: true; chats: ChatMeta[] }>('/chats'),
  get: (id: string) => call<{ ok: true; id: string; title: string; output: string; messages: unknown[] }>(`/chats/${id}`),
  save: (id: string, body: { title?: string; output: string; messages: unknown[] }) =>
    call<{ ok: true }>(`/chats/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  remove: (id: string) => call<{ ok: true }>(`/chats/${id}`, { method: 'DELETE' }),
}

export const WorkApi = {
  list: () => call<WorkInfo>('/work'),
  save: (output: string, sql: string, note = '') => call<{ ok: true; v: number; same: boolean }>(`/work/${output}`, post({ sql, note })),
  get: (output: string, v: number) => call<VersionMeta & { ok: true; sql: string }>(`/work/${output}/${v}`),
  adopt: (output: string, v: number | null) => call<{ ok: true }>(`/work/${output}/adopt`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v }) }),
  target: (dataset: string, prefix: string) => call<{ ok: true }>('/work/target', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset, prefix }) }),
  check: (output: string, sql: string, opts: { version?: number | null; withContext: boolean; run: boolean }) =>
    call<CheckResult>('/check', post({ output, sql, version: opts.version ?? null, with_context: opts.withContext, run: opts.run })),
}

export const isFailure = (v: unknown): v is Failure => !!v && typeof v === 'object' && (v as { ok?: unknown }).ok === false

/** 読む量の表示(BigQuery の料金は読んだ量で決まるので、GB で見せる) */
export function bytesLabel(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
