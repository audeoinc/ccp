// AI の送受信(Cr854_airequestsService)。
//
// askText(src/aiSelect.ts)は、依頼を create し、返答を get で待ち、delete する。
// ここでは、その呼び出しを、サーバーの /api/ask(Gemini)への 1 回の問い合わせに置き換える。
// (撮影・デモ用のビルドでは、同じ呼び方のまま、サンプルの返答に差し替える)

// aiSelect.ts の STATUS_* と同じ値(AI要求の状態の選択肢)
import { appPath } from '../appRoot'
import type { Cr854_airequests, Cr854_airequestsBase } from '../generated/models/Cr854_airequestsModel'
import type { OperationResult } from './services'

const WAITING = 588230000
const DONE = 588230001
const ERROR = 588230002

interface Pending {
  status: typeof WAITING | typeof DONE | typeof ERROR
  response: string
  settled: Promise<void>
}

const requests = new Map<string, Pending>()
// get は、返答が出るまで少し待つ(2 秒おきのポーリングでも、返答の直後に受け取れる)
const WAIT_IN_GET_MS = 20_000

function ask(prompt: string): Pending {
  const p: Pending = { status: WAITING, response: '', settled: Promise.resolve() }
  p.settled = (async () => {
    try {
      const res = await fetch(appPath('/api/ask'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })
      const json = (await res.json().catch(() => null)) as { success?: boolean; text?: string; error?: { message?: string } } | null
      if (json?.success && json.text) {
        p.status = DONE
        p.response = json.text
      } else {
        p.status = ERROR
        p.response = json?.error?.message ?? `AI のサーバーの応答が正しくありません(${res.status})`
      }
    } catch (e) {
      p.status = ERROR
      p.response = e instanceof Error ? e.message : String(e)
    }
  })()
  return p
}

export function makeAiRequestService() {
  return {
    async create(record: Partial<Cr854_airequestsBase>): Promise<OperationResult<Partial<Cr854_airequests>>> {
      const id = crypto.randomUUID()
      requests.set(id, ask(record.cr854_prompt ?? ''))
      return { success: true, data: { cr854_airequestid: id } }
    },
    async get(id: string): Promise<OperationResult<Partial<Cr854_airequests> | undefined>> {
      const p = requests.get(id)
      if (!p) return { success: false, data: undefined, error: { message: 'AI の依頼が見つかりません' } }
      if (p.status === WAITING) await Promise.race([p.settled, new Promise((r) => setTimeout(r, WAIT_IN_GET_MS))])
      return { success: true, data: { cr854_airequestid: id, cr854_status: p.status, cr854_response: p.response } }
    },
    async delete(id: string) {
      requests.delete(id)
    },
  }
}
