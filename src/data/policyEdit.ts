// マーケティングの決まりを画面で足す・直す・消す・書き出す窓口(X61。server/ccp/policies.py の /api/policies/rules)。表ではなくサーバーの API。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、メモリ上の表で同じことをする身代わり(src/mock/policyEdit.ts)に差し替える。
import { callApi } from '../gcp/services'
import { tr } from '../i18n'

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

// 書いた人の印・混み合いのやり直しは、表の読み書きと同じ呼び方に任せる
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const json = await callApi<T>(method, `/api/policies${path}`, body)
  if (!json.success) throw new Error(json.error?.message ?? tr('うまくいきませんでした', 'Something went wrong'))
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
