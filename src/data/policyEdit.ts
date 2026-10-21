// マーケティングの決まりを画面で足す・直す・消す・書き出す窓口(X61。server/ccp/policies.py の /api/policies/rules)。表ではなくサーバーの API。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、メモリ上の表で同じことをする身代わり(src/mock/policyEdit.ts)に差し替える。
import { appPath } from '../appRoot'
import { myName } from '../history'

/** 画面で入れる決まり(列は policy_rules と同じ。対象・市場・チャネルは `,` 区切り) */
export interface RuleInput {
  rule_id: string
  title: string
  applies_to: string
  strength: string
  market: string
  channel: string
  period_start?: string | null
  period_end?: string | null
  check_spec?: string | null
  body: string
}

/** 保存はできたが、気になること(本文がない・長い など)があれば、problems に入る */
export interface RuleSaveResult {
  problems: { message: string }[]
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(appPath(`/api/policies${path}`), {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'x-ccp-actor': encodeURIComponent(myName()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as { success: boolean; data?: T; error?: { message: string } } | null
  if (!json?.success) throw new Error(json?.error?.message ?? `うまくいきませんでした(${res.status})`)
  return json.data as T
}

export const PolicyEdit = {
  create: (r: RuleInput) => call<RuleSaveResult>('POST', '/rules', r),
  update: (id: string, r: RuleInput) => call<RuleSaveResult>('PUT', `/rules/${encodeURIComponent(id)}`, r),
  remove: (id: string) => call<unknown>('DELETE', `/rules/${encodeURIComponent(id)}`),
  /** いまの決まりを、取り込める Markdown にする(sourceFile を渡せば、そのファイルの分だけ) */
  exportMarkdown: (sourceFile?: string) =>
    call<{ filename: string; content: string; count: number }>('GET', `/rules/export${sourceFile ? `?source_file=${encodeURIComponent(sourceFile)}` : ''}`),
}
