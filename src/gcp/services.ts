// データの入出力。表ごとのサービス(src/data)が、これを使って、
// サーバーの /api/data/{テーブル} を呼ぶ。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、テーブルごとのサービスの読み込みを、サンプルデータに差し替える。
import { showDbWake } from './dbWake'
import { dropSharedReads, shareRead } from './readShare'

// 書き換えた人(画面で入れた名前。src/history.ts の myName と同じ記録を読む)。サーバーは、変更の記録(配信日時・商品の方針)に残す。
// history.ts は、このファイルを使うサービスを読み込むので、ここでは読み込まず、同じ記録を直接読む(読み込みの輪を作らないため)
const actorName = (): string => {
  return loadPref<string>(PREF.myName, '') || loadPref<string>(PREF.legacyCommentAuthor, '')
}
import { appPath } from '../appRoot'
import { PREF } from '../prefKeys'
import { loadPref } from '../settings'

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

// 混み合い(429)のときに、やり直すまでの待ち(ミリ秒)。
// 本番は、DB の起動の直後に、画面の読み込みが一度に重なって、サーバーの実行環境が「空いているインスタンスがない」と 429 で断ることがある。
// この 429 は、サーバーに届く前に断られたもの(書き込みも行われていない)なので、書き込みも含めて、少し待ってやり直してよい
const RETRY_WAITS = [1000, 2000, 4000]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * サーバーの窓口を呼ぶ(表の読み書き /api/data/… と、承認・制作の依頼・方針の取り込みなど、専用の窓口の両方)。
 * 書いた人の印(x-ccp-actor)・混み合いのやり直し・DB の起動中の表示を、どの窓口でも同じにする
 * (以前は専用の窓口が自前の fetch で、書いた人がサーバーに届かず、記録が空になっていた)
 */
export async function callApi<T>(method: string, url: string, body?: unknown): Promise<Result<T>> {
  const writes = method !== 'GET'
  // 書く前に途中だった読み込みには、書いたあとの部品を相乗りさせない
  if (writes) dropSharedReads()
  try {
    const send = () =>
      fetch(appPath(url), {
        method,
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'x-ccp-actor': encodeURIComponent(actorName()) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    let res = await send()
    for (const wait of RETRY_WAITS) {
      if (res.status !== 429) break
      // 同時に断られた読み込みが、同じ時刻にそろってやり直さないように、少しずらす
      await sleep(wait + Math.random() * 500)
      res = await send()
    }
    // 書いている間に始まった読み込みも、書く前の中身を返しかねないので、相乗りさせない
    if (writes) dropSharedReads()
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

const call = <T>(method: string, path: string, query?: URLSearchParams, body?: unknown) => callApi<T>(method, `/api/data/${path}${query && [...query].length ? `?${query}` : ''}`, body)

export function makeService(table: string) {
  return {
    async getAll(options?: GetAllOptions): Promise<Result<Rec[]>> {
      const q = new URLSearchParams()
      if (options?.filter) q.set('filter', options.filter)
      if (options?.orderBy?.length) q.set('orderBy', options.orderBy.join(','))
      if (options?.select?.length) q.set('select', options.select.join(','))
      if (options?.top) q.set('top', String(options.top))
      if (options?.skip) q.set('skip', String(options.skip))
      // 同じ表・同じ条件の読み込みが重なったら、1 回の通信を分け合う(readShare.ts)
      return shareRead(`${table}?${q}`, () => call<Rec[]>('GET', table, q))
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
