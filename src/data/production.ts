// 制作の依頼(バックログ PR2・PR5)。サーバーの窓口 /api/production(server/ccp/production.py)を呼ぶ。
// 表(production_requests)を画面から直接書かないのは、承認済みかの確かめ・版の数え方・前の版を古くする、をサーバーでまとめて行うため。
// 読むだけなら、表のサービス(ProductionRequestsService)でよい。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、src/mock/production.ts(同じ流れをメモリ上で行う)に差し替える。
import { appPath } from '../appRoot'
import type { ProductionRequest } from '../models/productionRequests'
import type { Actor } from './approvals'

export interface RequestInput {
  delivery_card_id: string
  actor: Actor
  /** 写し(src/productionSnapshot.ts の Snapshot を JSON にしたもの) */
  snapshot: string
  instructions: string
  production_owner: string
  production_due: string
  /** エディタの HTML(直していればそれ。依頼・送信のときに一緒に固める) */
  html?: string
  week_start?: string
}

interface Result<T> {
  success: boolean
  data?: T
  error?: { message: string; code?: string }
}

async function post<T>(path: string, body: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(appPath(`/api/production${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as Result<T> | null
    return json ?? { success: false, error: { message: `サーバーの応答が正しくありません(${res.status})` } }
  } catch (e) {
    return { success: false, error: { message: e instanceof Error ? e.message : String(e) } }
  }
}

export const ProductionService = {
  /** 「この内容で制作に依頼する」(写しを固める) */
  request: (input: RequestInput) => post<ProductionRequest>('/requests', input),
  /** 制作が「受け取った」 */
  receive: (requestId: string, input: { actor: Actor; week_start?: string }) => post<ProductionRequest>(`/requests/${encodeURIComponent(requestId)}/receive`, input),
  /** 制作が「制作が終わった」 */
  done: (requestId: string, input: { actor: Actor; note?: string; link?: string; week_start?: string }) => post<ProductionRequest>(`/requests/${encodeURIComponent(requestId)}/done`, input),
  /** 制作のページで直した HTML を保存する */
  saveHtml: (requestId: string, input: { actor: Actor; html: string }) => post<ProductionRequest>(`/requests/${encodeURIComponent(requestId)}/html`, input),
  /** 制作のページの左で直した中身(写しと同じ形の JSON)を保存する。空の文字で、承認された写しに戻す */
  saveEdits: (requestId: string, input: { actor: Actor; edited_snapshot: string; week_start?: string }) => post<ProductionRequest>(`/requests/${encodeURIComponent(requestId)}/edits`, input),
  /** 制作が終わった版を、配信のしくみに送る(工程の最後。いまは仮の窓口) */
  sendRequest: (requestId: string, input: { actor: Actor; html?: string; week_start?: string }) => post<ProductionRequest>(`/requests/${encodeURIComponent(requestId)}/send`, input),
  /** 制作を通さず、配信のしくみに送る(いまは仮の窓口。「送りました」と返る) */
  send: (input: RequestInput) => post<ProductionRequest & { message?: string }>('/send', input),
}
