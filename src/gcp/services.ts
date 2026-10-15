// GCP 版の、データの入出力(generated/services の互換サービス)。
//
// Power Apps 版では、生成された `Cr854_…Service` が Dataverse を呼ぶ。GCP 版のビルド(vite.gcp.config.ts)では、
// その import をここに差し替えて、同じ関数名・同じ戻り値の形で、サーバーの /api/data を呼ぶ。
// 画面のコードは、どちらのビルドでも同じ(同期を保つため、画面側には GCP 用の分岐を入れない)。
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
