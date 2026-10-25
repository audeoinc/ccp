// 開発用の画面(/dev/)の、サーバーの API の窓口(server/ccp/devtools/。設計は docs/DEVTOOLS.md)。
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
  /** ポリシーの文書のタブで、前に開いた GCS のバケットとフォルダ */
  gcs?: { bucket: string; prefix: string }
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
  /** 保存するときのファイル名の候補(AI が title を英語にして短くしたもの) */
  name?: string
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
export function chatStream(messages: ChatTurn[], ctx: ChatContext, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  return taskEvents<ChatEvent>('/tasks/chat', { messages, ...ctx }, onEvent, signal)
}

// 時間のかかる処理は、サーバーが裏で走らせ、画面は 1 秒ごとに「ここまでの出来事」を聞きに行く。
// Workbench の画面は Jupyter の中継を通り、返り終わらない要求は 100〜120 秒ほどで打ち切られる(524)ため、
// どの要求もすぐ終わる形にする(server/ccp/devtools/tasks.py の「時間のかかる処理は、裏で走らせて…」)
const POLL_MS = 1000
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok) => {
    const id = window.setTimeout(ok, ms)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(id)
      ok()
    })
  })

/** 受付を始め、終わるまで出来事を onEvent に渡す。つながらないことが続いたら、error を渡す */
async function taskEvents<E extends { type: string }>(start: string, body: unknown, onEvent: (e: E) => void, signal?: AbortSignal): Promise<void> {
  const fail = (error: string) => onEvent({ type: 'error', error } as unknown as E)
  const begun = await call<{ ok: true; task: string }>(start, post(body))
  if (isFailure(begun)) return fail(begun.error)
  let after = 0
  let misses = 0
  let ended = false
  while (!signal?.aborted) {
    const r = await call<{ ok: true; events: E[]; next: number; done: boolean }>(`/tasks/${begun.task}?after=${after}`)
    if (isFailure(r)) {
      // 中継の一時的な失敗は、少し待ってもう一度(続けて 10 回で、あきらめる)
      if (++misses >= 10) return fail(r.error)
      await sleep(POLL_MS * 2, signal)
      continue
    }
    misses = 0
    for (const ev of r.events) {
      if (ev.type === 'final' || ev.type === 'error' || ev.type === 'result') ended = true
      onEvent(ev)
    }
    after = r.next
    if (r.done) break
    await sleep(POLL_MS, signal)
  }
  if (!ended && !signal?.aborted) fail('返事が最後まで届きませんでした(サーバーのログを見てください)')
}

/** 結果を 1 つ返す窓口を、裏で呼んで、結果を待つ(流す・答え合わせ・列を調べる など。中継の 524 を避ける) */
async function callLong<T>(path: string, body: Record<string, unknown>): Promise<T | Failure> {
  let out: T | Failure = { ok: false, error: '返事が届きませんでした' }
  await taskEvents<{ type: string; result?: T; error?: string }>('/tasks/call', { path, body }, (ev) => {
    if (ev.type === 'result') out = ev.result as T
    else if (ev.type === 'error') out = { ok: false, error: ev.error ?? 'うまくいきませんでした' }
  })
  return out
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

/** 画像の一覧の種類(server/ccp/devimages.py) */
export type ImageKind = 'heroes' | 'parts' | 'creative' | 'products'

/** ok = ファイルがある / missing = ない(壊れたリンク) / external = 外の URL(確かめない) / empty = 画像がない / unknown = 確かめられない */
export type LinkState = 'ok' | 'missing' | 'external' | 'empty' | 'unknown'

/** 画像を使っている所(配信カードか、テンプレート) */
export interface ImageUse {
  type: 'card' | 'template'
  id: string
  name: string
  at?: string | null
}

/** 画像の 1 行。種類ごとの列(image_code・kind・product_code・role など)も、そのまま入る */
export interface ImageRow {
  id: string
  name?: string | null
  market?: string | null
  image_url?: string | null
  origin?: string | null
  uploaded_by?: string | null
  created_on?: string | null
  used: ImageUse[]
  link: LinkState
  [key: string]: unknown
}

export interface ImageList {
  ok?: true
  kind: ImageKind
  rows: ImageRow[]
  truncated: boolean
  note: string
  /** 画像の置き場所(folder = ASSET_DIR / bucket / none) */
  store: string
}

export const DevApi = {
  images: (kind: ImageKind) => call<ImageList>(`/images?kind=${kind}`),
  status: () => call<Status & { ok?: true }>('/status'),
  settings: () => call<Settings>('/settings'),
  saveSettings: (s: Settings) => call<{ ok: true }>('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }),
  datasets: (project?: string) => call<{ ok: true; project: string; datasets: string[] }>(`/bq/datasets${project ? `?project=${q(project)}` : ''}`),
  tables: (dataset: string) => call<{ ok: true; tables: { id: string; ref: string; type: string }[] }>(`/bq/tables?dataset=${q(dataset)}`),
  table: (ref: string) => call<TableInfo>(`/bq/table?ref=${q(ref)}`),
  preview: (ref: string) => call<{ ok: true; columns: Column[]; rows: Row[] }>(`/bq/preview?ref=${q(ref)}`),
  dryrun: (sql: string) => callLong<DryRun>('bq/dryrun', { sql }),
  run: (sql: string, maxRows: number, runId = '') => callLong<RunResult>('bq/run', { sql, max_rows: maxRows, run_id: runId }),
  cancel: (runId: string) => call<{ ok: true; cancelled: boolean }>('/bq/cancel', post({ run_id: runId })),
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

/** ポリシーの文書(DEVTOOLS.md の 3.2) */
export interface GcsFile {
  name: string
  size: number
  updated: string | null
  type: string
}

export interface PolicyDraft {
  kind: 'rules' | 'sales'
  filename: string
  content: string
}

export type ConvertEvent =
  | { type: 'start'; model: string; thinking?: string }
  | { type: 'thought'; text: string }
  | { type: 'step'; text: string }
  | { type: 'ping' }
  | { type: 'final'; reply: string; files: PolicyDraft[]; questions: string[] }
  | { type: 'error'; error: string }

/** CCP の取り込みの確かめ(/api/policies/preview)の結果 */
export interface PolicyPreview {
  kind: string
  filename: string
  title: string
  count: number
  problems: { line: number; message: string; where: string }[]
  rules?: { rule_id: string; title: string; strength: string; market: string | null; channel: string | null }[]
  weeks?: { week_start: string; market: string; rows: number }[]
  edited_on_screen?: string[]
}

/** CCP の既存の API(/api/policies/…)は { success, data | error } の形 */
async function policyCall(path: string, body: unknown): Promise<PolicyPreview | Failure> {
  try {
    const res = await fetch(appPath(`/api/policies${path}`), post(body))
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: PolicyPreview; error?: { message: string } } | null
    if (!json) return { ok: false, error: `サーバーの返事を読めませんでした(${res.status})` }
    if (!json.success || !json.data) return { ok: false, error: json.error?.message ?? '確かめに失敗しました' }
    return json.data
  } catch (e) {
    return { ok: false, error: `サーバーにつながりません(${e instanceof Error ? e.message : String(e)})` }
  }
}

export const PolicyApi = {
  list: (bucket: string, prefix: string) => call<{ ok: true; bucket: string; prefix: string; folders: string[]; files: GcsFile[] }>(`/gcs/list?bucket=${q(bucket)}&prefix=${q(prefix)}`),
  extract: (bucket: string, names: string[]) =>
    callLong<{ ok: true; docs: { name: string; kind: string; text?: string; chars?: number; size?: number; truncated?: boolean; error?: string }[] }>('gcs/extract', { bucket, names }),
  convert: (body: { bucket: string; names: string[]; messages: ChatTurn[]; model: string | null }, onEvent: (e: ConvertEvent) => void, signal?: AbortSignal) =>
    taskEvents<ConvertEvent>('/tasks/policy-convert', body, onEvent, signal),
  drafts: () => call<{ ok: true; drafts: (PolicyDraft & { updated: string })[] }>('/policy/drafts'),
  preview: (d: PolicyDraft) => policyCall('/preview', d),
  import: (d: PolicyDraft) => policyCall('/import', d),
}

/** 作業ファイル(server/devwork/files/。引き継ぎ・SQL・コーディングルールなど)。pinned は「いつも AI に渡す」 */
export interface WorkFile {
  name: string
  size: number
  updated: string
  pinned: boolean
}

const put = (body: unknown): RequestInit => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const fileUrl = (name: string) => `/files/${encodeURIComponent(name)}`

export const FilesApi = {
  list: () => call<{ ok: true; files: WorkFile[] }>('/files'),
  get: (name: string) => call<{ ok: true; name: string; content: string; pinned: boolean }>(fileUrl(name)),
  save: (name: string, content: string) => call<{ ok: true; overwritten: boolean }>(fileUrl(name), put({ content })),
  remove: (name: string) => call<{ ok: true }>(fileUrl(name), { method: 'DELETE' }),
  pin: (name: string, pinned: boolean) => call<{ ok: true }>(`${fileUrl(name)}/pin`, put({ pinned })),
  fromXlsx: (name: string, data: string) => call<{ ok: true; overwritten: boolean; chars: number }>(`${fileUrl(name)}/from-xlsx`, post({ data })),
}

/** 実行の履歴(server/devwork/history.jsonl)の 1 件 */
export interface RunEntry {
  id: number
  at: string
  /** 画面 / AI / 列を調べる */
  source: string
  sql: string
  ok: boolean
  rows: number | null
  processed: number | null
  billed: number | null
  cost_usd: number | null
  seconds: number | null
  error: string
}

/** 列の中身(POST /api/dev/bq/profile) */
export interface ColumnProfile {
  ok: true
  table: string
  column: string
  type: string
  mode: string
  description: string
  bytes: number
  cost_usd: number | null
  sql: string
  needs_confirm?: boolean
  total?: number
  nulls?: number
  null_rate?: number | null
  distinct_approx?: number
  min_value?: string | null
  max_value?: string | null
  min_len?: number | null
  max_len?: number | null
  top?: { value: string | null; n: number }[]
  seconds?: number
}

export const RunApi = {
  history: (q = '') => call<{ ok: true; runs: RunEntry[] }>(`/history?q=${encodeURIComponent(q)}`),
  profile: (table: string, column: string, confirm = false) => callLong<ColumnProfile>('bq/profile', { table, column, confirm }),
}

export const WorkApi = {
  list: () => call<WorkInfo>('/work'),
  save: (output: string, sql: string, note = '') => call<{ ok: true; v: number; same: boolean }>(`/work/${output}`, post({ sql, note })),
  get: (output: string, v: number) => call<VersionMeta & { ok: true; sql: string }>(`/work/${output}/${v}`),
  adopt: (output: string, v: number | null) => call<{ ok: true }>(`/work/${output}/adopt`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v }) }),
  target: (dataset: string, prefix: string) => call<{ ok: true }>('/work/target', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataset, prefix }) }),
  check: (output: string, sql: string, opts: { version?: number | null; withContext: boolean; run: boolean }) =>
    callLong<CheckResult>('check', { output, sql, version: opts.version ?? null, with_context: opts.withContext, run: opts.run }),
}

export const isFailure = (v: unknown): v is Failure => !!v && typeof v === 'object' && (v as { ok?: unknown }).ok === false

/** 読む量の表示(BigQuery の料金は読んだ量で決まるので、GB で見せる) */
export function bytesLabel(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
