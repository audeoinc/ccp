import type { Item } from './items'
import { tr } from './i18n'
import { DEFAULT_PUSH_TEMPLATE, sectionRange, sectionsOf, templateFromValue, type EmailTemplateId } from './templates'

const labelsNow = (): string[] => [
  tr('① テーマ', '1. Theme'),
  tr('② テンプレート', '2. Template'),
  tr('③ ヒーロー', '3. Hero'),
  tr('④ セクション', '4. Sections'),
  tr('⑤ 制作指示', '5. Production notes'),
]

// アプリ(プッシュ通知)の配信カードの工程
const pushLabelsNow = (): string[] => [
  tr('① テーマ', '1. Theme'),
  tr('② テンプレート', '2. Template'),
  tr('③ 通知', '3. Notification'),
  tr('④ メッセージ', '4. Message'),
  tr('⑤ 時刻・相手', '5. Timing & audience'),
]

/** 工程の名前。読むたびに現在の言語で返す(インデックスのゲッター) */
export const PROGRESS_LABELS: readonly string[] = (() => {
  const a: string[] = []
  for (let i = 0; i < 5; i++) Object.defineProperty(a, i, { get: () => labelsNow()[i], enumerable: true })
  return a
})()

export interface Progress {
  theme: boolean
  template: boolean
  hero: boolean
  sections: boolean
  instructions: boolean
  done: number
  total: number
  /** 未完了の工程の名前 */
  remaining: string[]
}

/** 工程の進み具合。中ペインの ✓ と、ダイアログ右上の「工程 n / 5」で、同じ基準を使う */
export function progressOf(a: {
  theme: string
  template: EmailTemplateId
  heroId?: string
  headline: string
  items: Item[]
  instructions: string
  /** アプリの配信カードのとき: 通知のタイトル・本文と、送る時刻・開く画面・送る相手がそろっているか */
  push?: { title: string; body: string; timing: boolean }
}): Progress {
  if (a.push) {
    // アプリ: テーマ / テンプレート / 通知(タイトル・本文)/ メッセージ(メイン画像・ヘッドライン・セクションの枠)/ 時刻・相手
    const secs = sectionsOf(a.template)
    const filled = secs.every((sec) => {
      const [from, to] = sectionRange(secs, sec, a.items.length)
      return Math.max(0, to - from) >= sec.slots
    })
    const message = !!a.heroId && !!a.headline.trim() && filled
    const flags = [!!a.theme.trim(), true, !!a.push.title.trim() && !!a.push.body.trim(), message, a.push.timing]
    const [theme, template, hero, sectionsOk, instructions] = flags
    return {
      theme,
      template,
      hero,
      sections: sectionsOk,
      instructions,
      done: flags.filter(Boolean).length,
      total: flags.length,
      remaining: pushLabelsNow().filter((_, i) => !flags[i]),
    }
  }
  const sections = sectionsOf(a.template)
  const sectionsDone =
    a.template === 'free'
      ? a.items.length > 0
      : sections.every((sec) => {
          const [from, to] = sectionRange(sections, sec, a.items.length)
          return Math.max(0, to - from) >= sec.slots
        })

  const flags = [
    !!a.theme.trim(),
    true, // テンプレートは、常にどれかが選ばれている
    !!a.heroId && !!a.headline.trim(), // メイン画像とヘッドラインがそろったら完了
    sectionsDone, // すべてのセクションの枠が埋まったら完了(自由は、1 件以上)
    !!a.instructions.trim(),
  ]
  const [theme, template, hero, sectionsOk, instructions] = flags
  return {
    theme,
    template,
    hero,
    sections: sectionsOk,
    instructions,
    done: flags.filter(Boolean).length,
    total: flags.length,
    remaining: labelsNow().filter((_, i) => !flags[i]),
  }
}

/**
 * 一覧・カレンダー用の進み具合。配信カードの列と、掲載商品の数だけで求める
 * (セクションの判定は、商品の数しか使わないため、中身のない配列で足りる)。
 */
export function cardProgress(
  card: {
    cr854_theme?: string
    cr854_headline?: string
    cr854_copy?: string
    cr854_instructions?: string
    cr854_layoutkey?: string
    cr854_emailtemplate?: number
    _cr854_heroimage_value?: string
    cr854_channel?: number
    cr854_pushlink?: string
    cr854_audience?: string
    cr854_pushtitle?: string
    cr854_pushbody?: string
  },
  productCount: number,
): Progress {
  return progressOf({
    push:
      card.cr854_channel === 588230001
        ? { title: card.cr854_pushtitle ?? '', body: card.cr854_pushbody ?? '', timing: !!card.cr854_pushlink && !!card.cr854_audience }
        : undefined,
    theme: card.cr854_theme ?? '',
    template: card.cr854_layoutkey || (card.cr854_channel === 588230001 ? DEFAULT_PUSH_TEMPLATE : templateFromValue(card.cr854_emailtemplate)),
    heroId: card._cr854_heroimage_value,
    headline: card.cr854_headline ?? '',
    items: Array.from({ length: productCount }, () => ({}) as Item),
    instructions: card.cr854_instructions ?? '',
  })
}

/** 締め切りの警告の日数(制作の締め切り、なければ配信日が、この日数以内で、まだ何も作っていない配信に印を付ける) */
export const DUE_SOON_DAYS = 7

/** 締め切り(制作の締め切り、なければ配信日)が近いのに、まだ着手していない(テンプレート以外の工程が 1 つも終わっていない)か */
export function isDueSoonNotStarted(deadline: string | undefined, progress: Progress, now = new Date(), scheduledAt = deadline): boolean {
  if (!deadline || !scheduledAt) return false
  // 締め切りを過ぎていても、まだ配信していなければ警告する(過ぎているほうが急ぐ)
  if (new Date(scheduledAt).getTime() < now.getTime()) return false
  const days = (new Date(deadline).getTime() - now.getTime()) / 86_400_000
  return days <= DUE_SOON_DAYS && progress.done <= 1
}
