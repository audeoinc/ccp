// 撮影・デモ用のビルドで、「？ 聞く」の保存と FAQ の窓口(src/data/help.ts → server/ccp/help.py)の身代わり。
// ブラウザの中だけで同じ動き(質問をためる・20 件でまとめ直しを促す・札・FAQ に回数を足す・隠す)をする。開き直すと消える。
// 開発・管理の画面を見せるため、見本の FAQ を少し入れておく
import type { HelpFaq } from '../models/helpFaqs'
import type { HelpQuestion } from '../models/helpQuestions'
import type { HelpFaqBuild } from '../models/helpFaqBuilds'
import type { HelpRecord } from '../help/helpAsk'
import type { BuildFaq, BuildGroup, BuildQuestion, HelpFaqAdminInfo } from '../data/help'

export type { BuildFaq, BuildGroup, BuildQuestion, HelpFaqAdminInfo }

const THRESHOLD = 20
const RETAIN_DAYS = 90

export class HelpApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const answer = (reply: string, steps: string[]) => JSON.stringify({ known: true, reply, steps, open: { page: 'calendar', view: 'week' }, openLabel: '', basis: [{ doc: 'FEATURES.md', title: '' }], files: [] })

const faqs: HelpFaq[] = [
  {
    id: uid(),
    question_ja: '承認を依頼するには?',
    question_en: 'How do I request approval?',
    answer_ja: answer('配信カードの上の帯の [[承認を依頼する]] から依頼します。', ['配信カードを開く', '[[承認を依頼する]] を押す', '相手を選んで送る']),
    answer_en: answer('Use [[Request approval]] on the bar at the top of the delivery card.', ['Open the delivery card', 'Click [[Request approval]]', 'Choose reviewers and send']),
    ask_count: 14,
    dev_count: 1,
    first_asked_at: daysAgo(20),
    last_asked_at: daysAgo(1),
    places: JSON.stringify([{ page: 'calendar', open: 'delivery card', count: 11 }]),
    built_at: daysAgo(3),
  },
  {
    id: uid(),
    question_ja: '商品を入れ替えるには?',
    question_en: 'How do I replace a product?',
    answer_ja: answer('プレビューの商品を押して、[[入れ替える]] から選びます。', ['プレビューの商品を押す', '[[入れ替える]] を押す', '候補を試して確定する']),
    answer_en: answer('Click the product in the preview and choose from [[Replace]].', ['Click the product in the preview', 'Click [[Replace]]', 'Try a candidate and apply']),
    ask_count: 9,
    dev_count: 3,
    first_asked_at: daysAgo(15),
    last_asked_at: daysAgo(2),
    places: JSON.stringify([{ page: 'calendar', open: 'delivery card', el: 'product', count: 6 }]),
    built_at: daysAgo(3),
  },
]
const questions: HelpQuestion[] = []
const builds: HelpFaqBuild[] = [{ id: uid(), status: 'done', question_count: 23, faq_count: 2, created_on: daysAgo(3), finished_at: daysAgo(3) }]

const purge = () => {
  const limit = Date.now() - RETAIN_DAYS * 86400000
  for (let i = questions.length - 1; i >= 0; i--) if (questions[i].summarized_at && Date.parse(questions[i].summarized_at!) < limit) questions.splice(i, 1)
}
const pending = () => questions.filter((q) => !q.summarized_at).length
const sorted = (rows: HelpFaq[]) => [...rows].sort((a, b) => (b.ask_count ?? 0) - (a.ask_count ?? 0))

export const HelpService = {
  addQuestion: async (r: HelpRecord & { tellDev?: boolean }) => {
    // 「開発に伝える」は、同じ質問の記録(文と答えが同じもの)に印を付ける(もう一度渡されるときの at は押した時刻のため。help.py と同じ)
    const same = r.tellDev ? questions.find((q) => q.question === r.question && q.answer === JSON.stringify(r.answer)) : undefined
    if (same) {
      if (!same.sent_to_dev_at) {
        same.sent_to_dev_at = now()
        const f = faqs.find((x) => x.id === same.help_faq_id)
        if (f) f.dev_count = (f.dev_count ?? 0) + 1
      }
    } else {
      questions.unshift({
        id: uid(),
        question: r.question,
        answer: JSON.stringify(r.answer),
        lang: r.lang,
        screen: JSON.stringify(r.screen),
        element: r.part?.el,
        element_label: r.part?.label,
        asked_at: r.at,
        sent_to_dev_at: r.tellDev ? now() : undefined,
        created_on: now(),
      })
    }
    purge()
    return { pending: pending(), threshold: THRESHOLD }
  },
  faqs: async () => sorted(faqs.filter((f) => !f.hidden_at)),
  adminFaqs: async (): Promise<{ faqs: HelpFaq[] } & HelpFaqAdminInfo> => {
    purge()
    return { faqs: sorted(faqs), pending: pending(), threshold: THRESHOLD, questions: questions.length, retainDays: RETAIN_DAYS, builds: builds.slice(0, 5) }
  },
  setHidden: async (id: string, hidden: boolean) => {
    const f = faqs.find((x) => x.id === id)
    if (!f) throw new HelpApiError('その質問は見つかりません')
    f.hidden_at = hidden ? now() : undefined
    return { hidden }
  },
  questions: async (limit = 200) => questions.slice(0, limit),
  startBuild: async () => {
    if (builds.some((b) => b.status === 'running')) throw new HelpApiError('ほかの画面が、いままとめ直しています', 'busy')
    const qs = [...questions].reverse().filter((q) => !q.summarized_at)
    if (qs.length === 0) throw new HelpApiError('まとめる質問がありません', 'empty')
    const b: HelpFaqBuild = { id: uid(), status: 'running', question_count: qs.length, created_on: now() }
    builds.unshift(b)
    return {
      id: b.id,
      questions: qs.map((q): BuildQuestion => ({ id: q.id, question: q.question ?? '', lang: q.lang, screen: q.screen, element: q.element, element_label: q.element_label, sent_to_dev: !!q.sent_to_dev_at })),
      faqs: faqs.map((f): BuildFaq => ({ id: f.id, question_ja: f.question_ja, question_en: f.question_en, answer_ja: f.answer_ja, ask_count: f.ask_count, hidden: !!f.hidden_at })),
    }
  },
  finishBuild: async (id: string, groups: BuildGroup[]) => {
    const b = builds.find((x) => x.id === id && x.status === 'running')
    if (!b) throw new HelpApiError('このまとめ直しは、もう終わっているか、時間切れです', 'not_running')
    let touched = 0
    for (const g of groups) {
      const qs = questions.filter((q) => !q.summarized_at && g.question_ids.includes(q.id))
      let f = g.faq_id ? faqs.find((x) => x.id === g.faq_id) : undefined
      if (!f && g.question_ja && g.answer_ja) {
        f = { id: uid(), ask_count: 0, dev_count: 0, created_on: now() }
        faqs.push(f)
      }
      if (f) {
        touched++
        f.ask_count = (f.ask_count ?? 0) + qs.length
        f.dev_count = (f.dev_count ?? 0) + qs.filter((q) => q.sent_to_dev_at).length
        const ats = qs.map((q) => q.asked_at ?? q.created_on ?? now()).sort()
        if (ats.length) {
          f.first_asked_at = [f.first_asked_at, ats[0]].filter(Boolean).sort()[0]
          f.last_asked_at = [f.last_asked_at, ats[ats.length - 1]].filter(Boolean).sort().pop()
        }
        if (g.question_ja) Object.assign(f, { question_ja: g.question_ja, question_en: g.question_en, answer_ja: g.answer_ja, answer_en: g.answer_en, built_at: now() })
      }
      for (const q of qs) Object.assign(q, { summarized_at: now(), help_faq_id: f?.id })
    }
    for (const q of questions) if (!q.summarized_at) q.summarized_at = now()
    purge()
    Object.assign(b, { status: 'done', faq_count: touched, finished_at: now() })
    return { faqs: touched, pending: pending() }
  },
  failBuild: async (id: string, error: string) => {
    const b = builds.find((x) => x.id === id && x.status === 'running')
    if (b) Object.assign(b, { status: 'error', error, finished_at: now() })
    return {} as Record<string, never>
  },
}
