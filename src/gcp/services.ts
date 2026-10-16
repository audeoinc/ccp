// データの入出力。表ごとのサービス(src/data)が、これを使って、
// サーバーの /api/data/{テーブル} を呼ぶ。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、テーブルごとのサービスの読み込みを、サンプルデータに差し替える。
import { showDbWake } from './dbWake'

// 書き換えた人(画面で入れた名前。src/history.ts の myName と同じ記録を読む)。サーバーは、変更の記録(配信日時・商品の方針)に残す。
// history.ts は、このファイルを使うサービスを読み込むので、ここでは読み込まず、同じ記録を直接読む(読み込みの輪を作らないため)
const actorName = (): string => {
  for (const key of ['me.name', 'comment.author']) {
    try {
      const v = localStorage.getItem(key)
      const name = v === null ? '' : (JSON.parse(v) as string)
      if (name) return name
    } catch {
      /* 読めなければ、次の記録を見る */
    }
  }
  return ''
}
import { appPath } from '../appRoot'

interface ErrorBody {
  message: string
  code?: string
}
interface Result<T> {
  success: boolean
  data?: T
  error?: ErrorBody
}

interface GetAllOptions {
  filter?: string
  orderBy?: string[]
  select?: string[]
  top?: number
  skip?: number
}

type Rec = Record<string, unknown>

async function call<T>(method: string, path: string, query?: URLSearchParams, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(appPath(`/api/data/${path}${query && [...query].length ? `?${query}` : ''}`), {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'x-ccp-actor': encodeURIComponent(actorName()) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as Result<T> | null
    if (!json) return { success: false, error: { message: `サーバーの応答が正しくありません(${res.status})` } }
    // DB が止まっている(起動中)ときは、準備中の表示を出す(準備ができたら、自動で読み込み直す)
    if (!json.success && (json.error?.code === 'db_starting' || json.error?.code === 'db_unavailable')) showDbWake()
    // DB の自動起動を使わない環境(Workbench など)で、つながらないときは、理由と直し方を出す(待っても起動しないため)
    if (!json.success && json.error?.code === 'db_unreachable') showDbWake(json.error.message.replace(/^データベースにつながりません: /, ''))
    return json
  } catch (e) {
    return { success: false, error: { message: e instanceof Error ? e.message : String(e) } }
  }
}

export function makeService(table: string) {
  return {
    async getAll(options?: GetAllOptions): Promise<Result<Rec[]>> {
      const q = new URLSearchParams()
      if (options?.filter) q.set('filter', options.filter)
      if (options?.orderBy?.length) q.set('orderBy', options.orderBy.join(','))
      if (options?.select?.length) q.set('select', options.select.join(','))
      if (options?.top) q.set('top', String(options.top))
      if (options?.skip) q.set('skip', String(options.skip))
      return call<Rec[]>('GET', table, q)
    },
    async get(id: string): Promise<Result<Rec>> {
      return call<Rec>('GET', `${table}/${encodeURIComponent(id)}`)
    },
    async create(record: Rec): Promise<Result<Rec>> {
      return call<Rec>('POST', table, undefined, record)
    },
    async update(id: string, changedFields: Rec): Promise<Result<Rec>> {
      return call<Rec>('PATCH', `${table}/${encodeURIComponent(id)}`, undefined, changedFields)
    },
    async delete(id: string): Promise<void> {
      await call<null>('DELETE', `${table}/${encodeURIComponent(id)}`)
    },
  }
}

/** サーバーの応答(成功なら data に、行または行の一覧が入る) */
export interface OperationResult<T> {
  success: boolean
  data: T
  error?: ErrorBody
}

/**
 * テーブルごとの、型の付いたサービス(T = 読んだ行の型、Base = 書き込む列の型)。
 * 呼び方は getAll / get / create / update / delete。
 */
export function tableService<T, Base = T>(table: string) {
  const svc = makeService(table)
  return {
    getAll: (options?: GetAllOptions) => svc.getAll(options) as Promise<OperationResult<T[]>>,
    get: (id: string) => svc.get(id) as Promise<OperationResult<T>>,
    create: (record: Partial<Base>) => svc.create(record as Rec) as Promise<OperationResult<T>>,
    update: (id: string, changedFields: Partial<Base>) => svc.update(id, changedFields as Rec) as Promise<OperationResult<T>>,
    delete: (id: string) => svc.delete(id),
  }
}
