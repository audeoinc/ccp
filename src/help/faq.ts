// 「？ 聞く」の質問の保存と、よく聞かれる質問(FAQ)のまとめ直し(X82 段 ④)。
// 質問と答えは helpAsk.ts の setHelpRecorder で受け取り、サーバー(/api/help)に保存する(だれが聞いたかは送らない)。
// 前にまとめてから新しい質問が 20 件(サーバーの THRESHOLD)たまったら、その質問をした人の画面が、裏でまとめ直す(2026-10-28 利用者と決めた案 A)。
// AI を呼ぶのは画面の側(askAgent)にそろえ、FAQ の答えも「？ 聞く」と同じ材料・同じ決まり(askHelp)で作るため、サーバーでは AI を呼ばない
import { askAgent } from '../aiSelect'
import { getLang, tr } from '../i18n'
import { HelpApiError, HelpService, type BuildGroup } from '../data/help'
import type { HelpFaq } from '../models/helpFaqs'
import { askHelp, loadMaterial, normalizeAnswer, pickMaterial, setHelpRecorder, type HelpAnswer, type HelpRecord } from './helpAsk'

// 1 回のまとめ直しで、新しく答えを作る FAQ の数の上限(1 つにつき AI を 2 回呼ぶので、時間とお金の上限。残りは次の回)
const NEW_FAQ_MAX = 12

// まとめ直しの中で、FAQ の答えを作るために聞いた質問(これは利用者の質問ではないので、保存しない)
const ownQuestions = new Set<string>()
let building = false
// FAQ を読み直したら、使っている部品を描き直す
const listeners = new Set<() => void>()
export const onFaqsChanged = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 質問と答えを保存し始める(アプリの起動時に 1 回)。保存の失敗で、答えを見せるのは止めない */
export function startHelpRecording() {
  setHelpRecorder((r: HelpRecord & { tellDev?: boolean }) => {
    if (ownQuestions.has(r.question)) return
    void HelpService.addQuestion(r)
      .then((res) => {
        if (res.pending >= res.threshold) void buildFaqs().catch(() => {})
      })
      .catch(() => {})
  })
}

const GROUP_PROMPT = `あなたは、業務の画面(CCP)の使い方の質問を整理する係です。利用者が「？ 聞く」で聞いた新しい質問(questions)を、同じ意味の質問ごとに束ね、よく聞かれる質問(FAQ)にします。
【材料】
- faqs: いまある FAQ(id と代表の聞き方)。
- questions: まだ束ねていない質問(id・質問の文・画面の言葉)。
【決まり】
1. 同じことを知りたい質問は、言い方や言葉(日本語・English)が違っても 1 つに束ねる。いまの FAQ と同じ意味なら、その faq_id に足す(聞き方は書かない)。
2. どの FAQ とも違う意味の質問は、新しい束にする(faq_id は null)。新しい束は多くても ${NEW_FAQ_MAX} 個まで。少ない質問の束より、多くの質問が入る束を優先する。入りきらない質問は、どの束にも入れない(次の回にまわる)。
3. 使い方の質問でないもの(あいさつ・お礼・意味の分からない文・試しの入力)は、どの束にも入れない。
4. 新しい束には、代表の聞き方を書く。question_ja は必ず日本語、question_en は必ず English で(画面の言葉によらず、両方とも)。短く、利用者が聞きそうな形で。個人や会社の名前・数字の細部は入れない。
【出力】JSON だけ: {"groups": [{"faq_id": "…" または null, "question_ids": ["…"], "question_ja": "…", "question_en": "…"}]}
`

const TRANSLATE_PROMPT = `あなたは、業務の画面(CCP)の使い方の答えを訳す係です。answer(JSON)の文を、to の言葉に訳してください。
【決まり】
1. reply・steps・openLabel だけを訳す。known・open・basis・files は、そのまま写す。
2. [[ ]] で囲んだ画面の名前は、labels(1 行 =「日本語 | English | 画面の場所 | 部品」)で同じ行の、to の言葉の文言に置き換え、[[ ]] で囲んだまま残す。labels にない名前は、[[ ]] を外して説明の言葉にする。
3. to が ja なら、出力の文はすべて日本語にする(この依頼に限り、英語にしない)。to が en なら English にする。
【出力】JSON だけ: answer と同じ形({"known": …, "reply": "…", "steps": ["…"], "open": …, "openLabel": "…", "basis": […], "files": […]})
`

/** 答えをもう一方の言葉に訳す(画面の名前は、文言の一覧の、その言葉の文言にする) */
async function translateAnswer(answer: HelpAnswer, question: string, to: 'ja' | 'en'): Promise<HelpAnswer> {
  const m = await loadMaterial()
  const picked = pickMaterial(m, `${question} ${answer.reply} ${answer.steps.join(' ')}`, [])
  const raw = await askAgent(TRANSLATE_PROMPT, { task: 'help_faq_translate', to, answer, labels: picked.labels })
  return normalizeAnswer(raw)
}

/** 新しい FAQ の答えを、日本語と English の両方で作る(いまの画面の言葉で「？ 聞く」と同じに作り、もう一方は訳す) */
async function answerBoth(questionJa: string, questionEn: string): Promise<{ ja: HelpAnswer; en: HelpAnswer }> {
  const lang = getLang()
  const question = lang === 'en' ? questionEn || questionJa : questionJa || questionEn
  ownQuestions.add(question)
  try {
    const { answer } = await askHelp(question, [])
    const other = await translateAnswer(answer, question, lang === 'en' ? 'ja' : 'en')
    return lang === 'en' ? { ja: other, en: answer } : { ja: answer, en: other }
  } finally {
    ownQuestions.delete(question)
  }
}

/**
 * よく聞かれる質問をまとめ直す。まだまとめていない質問を AI が束ね、新しい束には答えを作って、サーバーに入れる。
 * ほかの画面がまとめていれば何もしない(サーバーの札)。失敗したら質問はまとめないまま残り、次の回にやり直す。
 * 返すのは、足した・直した FAQ の数(まとめる質問がなければ 0)
 */
export async function buildFaqs(): Promise<number> {
  if (building) return 0
  building = true
  let buildId: string | null = null
  try {
    let lease
    try {
      lease = await HelpService.startBuild()
    } catch (e) {
      if (e instanceof HelpApiError && (e.code === 'busy' || e.code === 'empty')) return 0
      throw e
    }
    buildId = lease.id
    const raw = await askAgent(GROUP_PROMPT, {
      task: 'help_faq_group',
      faqs: lease.faqs.map((f) => ({ id: f.id, question: f.question_ja || f.question_en })),
      questions: lease.questions.map((q) => ({ id: q.id, question: q.question, lang: q.lang })),
    })
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const known = new Set(lease.faqs.map((f) => f.id))
    const groups = (Array.isArray(raw.groups) ? raw.groups : []) as Record<string, unknown>[]
    const out: BuildGroup[] = []
    let made = 0
    for (const g of groups) {
      const ids = Array.isArray(g.question_ids) ? g.question_ids.filter((x): x is string => typeof x === 'string') : []
      if (ids.length === 0) continue
      const faqId = str(g.faq_id)
      if (faqId && known.has(faqId)) {
        out.push({ faq_id: faqId, question_ids: ids })
        continue
      }
      const qja = str(g.question_ja)
      const qen = str(g.question_en)
      if (!(qja || qen) || made >= NEW_FAQ_MAX) continue
      made++
      const a = await answerBoth(qja, qen)
      out.push({ faq_id: null, question_ids: ids, question_ja: qja || qen, question_en: qen || qja, answer_ja: JSON.stringify(a.ja), answer_en: JSON.stringify(a.en) })
    }
    const res = await HelpService.finishBuild(lease.id, out)
    listeners.forEach((f) => f())
    return res.faqs
  } catch (e) {
    if (buildId) await HelpService.failBuild(buildId, e instanceof Error ? e.message : String(e)).catch(() => {})
    throw e
  } finally {
    building = false
  }
}

/** FAQ の答え(画面の言葉のもの。なければもう一方)。読めなければ null */
export function faqAnswer(f: HelpFaq, lang = getLang()): HelpAnswer | null {
  const text = (lang === 'en' ? f.answer_en || f.answer_ja : f.answer_ja || f.answer_en) ?? ''
  try {
    return normalizeAnswer(JSON.parse(text) as Record<string, unknown>)
  } catch {
    return null
  }
}

/** FAQ の聞き方(画面の言葉のもの) */
export const faqQuestion = (f: HelpFaq, lang = getLang()) => (lang === 'en' ? f.question_en || f.question_ja : f.question_ja || f.question_en) ?? tr('(聞き方なし)', '(No question)')
