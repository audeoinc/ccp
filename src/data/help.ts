// 「？ 聞く」の質問の保存と、よく聞かれる質問(FAQ)の窓口(server/ccp/help.py。X82 段 ④)。表ではなくサーバーの API。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、ブラウザの中だけで同じ動きをする身代わり(src/mock/help.ts)に差し替える。
import { appPath } from '../appRoot'
import type { HelpFaq } from '../models/helpFaqs'
import type { HelpQuestion } from '../models/helpQuestions'
import type { HelpFaqBuild } from '../models/helpFaqBuilds'
import type { HelpRecord } from '../help/helpAsk'

/** まとめ直しに渡す、まだまとめていない質問 */
export interface BuildQuestion {
  id: string
  question: string
  lang?: string
  screen?: string
  element?: string
  element_label?: string
  sent_to_dev?: boolean
}

/** まとめ直しに渡す、いまの FAQ */
export interface BuildFaq {
  id: string
  question_ja?: string
  question_en?: string
  answer_ja?: string
  ask_count?: number
  hidden?: boolean
}

/** AI が束ねた 1 つ。faq_id があれば、いまの FAQ に足す(聞き方・答えは、書き直したときだけ送る) */
export interface BuildGroup {
  faq_id?: string | null
  question_ids: string[]
  question_ja?: string
  question_en?: string
  /** HelpAnswer の JSON */
  answer_ja?: string
  answer_en?: string
}

/** 開発・管理の画面に出す、まとめ直しの様子 */
export interface HelpFaqAdminInfo {
  pending: number
  threshold: number
  questions: number
  retainDays: number
  builds: HelpFaqBuild[]
}

/** 断られたときの理由の印(busy = ほかの画面がまとめている / empty = まとめる質問がない) */
export class HelpApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(appPath(path), {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = (await res.json().catch(() => null)) as { success: boolean; data?: T; error?: { message: string; code?: string } } | null
  if (!json?.success) throw new HelpApiError(json?.error?.message ?? `うまくいきませんでした(${res.status})`, json?.error?.code)
  return json.data as T
}

export const HelpService = {
  /** 質問と答えを 1 つ足す(tellDev = 「開発に伝える」に進んだ)。まだまとめていない数を返す */
  addQuestion: (r: HelpRecord & { tellDev?: boolean }) => call<{ pending: number; threshold: number }>('api/help/questions', { method: 'POST', body: r }),
  /** よく聞かれる質問(隠したものは除く・回数の多い順) */
  faqs: () => call<{ faqs: HelpFaq[] }>('api/help/faqs').then((d) => d.faqs),
  /** 開発・管理の画面: 隠したものも含めた FAQ と、まとめ直しの様子 */
  adminFaqs: () => call<{ faqs: HelpFaq[] } & HelpFaqAdminInfo>('api/help/faqs?all=1'),
  setHidden: (id: string, hidden: boolean) => call<{ hidden: boolean }>(`api/help/faqs/${encodeURIComponent(id)}/hidden`, { method: 'POST', body: { hidden } }),
  /** 生の記録(新しい順) */
  questions: (limit = 200) => call<HelpQuestion[]>(`api/help/questions?limit=${limit}`),
  /** まとめ直しの札を取る(ほかの画面がまとめていれば HelpApiError の code = busy) */
  startBuild: () => call<{ id: string; questions: BuildQuestion[]; faqs: BuildFaq[] }>('api/help/builds', { method: 'POST', body: {} }),
  finishBuild: (id: string, groups: BuildGroup[]) => call<{ faqs: number; pending: number }>(`api/help/builds/${encodeURIComponent(id)}/finish`, { method: 'POST', body: { groups } }),
  failBuild: (id: string, error: string) => call<Record<string, never>>(`api/help/builds/${encodeURIComponent(id)}/fail`, { method: 'POST', body: { error } }),
}
