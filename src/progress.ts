import type { Item } from './items'
import { tr } from './i18n'
import { linkSlots, linksComplete, parseLinks } from './links'
import { parsePushLink, tapComplete } from './pushLink'
import { DEFAULT_PUSH_TEMPLATE, sectionRange, sectionsOf, templateFromValue, type EmailTemplateId } from './templates'

const labelsNow = (): string[] => [
  tr('① テーマ', '1. Theme'),
  tr('② テンプレート', '2. Template'),
  tr('③ ヒーロー', '3. Hero'),
  tr('④ セクション', '4. Sections'),
  tr('⑤ リンク先', '5. Links'),
  tr('⑥ 制作指示', '6. Production notes'),
]

// アプリ(プッシュ通知)の配信カードの工程
const pushLabelsNow = (): string[] => [
  tr('① テーマ', '1. Theme'),
  tr('② テンプレート', '2. Template'),
  tr('③ 通知', '3. Notification'),
  tr('④ メッセージ', '4. Message'),
  tr('⑤ リンク先', '5. Links'),
  tr('⑥ 時刻・相手', '6. Timing & audience'),
]

/** 工程の名前。読むたびに現在の言語で返す(インデックスのゲッター) */
export const PROGRESS_LABELS: readonly string[] = (() => {
  const a: string[] = []
  for (let i = 0; i < 6; i++) Object.defineProperty(a, i, { get: () => labelsNow()[i], enumerable: true })
  return a
})()

export interface Progress {
  theme: boolean
  template: boolean
  hero: boolean
  sections: boolean
  /** リンク先(メール: すべてのリンクに URL / アプリ: 通知とメッセージのすべてのリンクに、開く画面) */
  links: boolean
  /** メール: 制作指示 / アプリ: 時刻・相手 */
  instructions: boolean
  done: number
  total: number
  /** 未完了の工程の名前 */
  remaining: string[]
}

/** 工程の進み具合。中ペインの ✓ と、ダイアログ右上の「工程 n / 6」で、同じ基準を使う */
export function progressOf(a: {
  theme: string
  template: EmailTemplateId
  heroId?: string
  headline: string
  items: Item[]
  instructions: string
  /** リンク先の工程が完了しているか(src/links.ts の linksComplete) */
  links: boolean
  /** アプリの配信カードのとき: 通知のタイトル・本文と、送る相手が決まっているか */
  push?: { title: string; body: string; timing: boolean }
}): Progress {
  if (a.push) {
    // アプリ: テーマ / テンプレート / 通知(タイトル・本文)/ メッセージ(メイン画像・ヘッドライン・セクションの枠)/ リンク先 / 時刻・相手
    const secs = sectionsOf(a.template)
    const filled = secs.every((sec) => {
      const [from, to] = sectionRange(secs, sec, a.items.length)
      return Math.max(0, to - from) >= sec.slots
    })
    const message = !!a.heroId && !!a.headline.trim() && filled
    const flags = [!!a.theme.trim(), true, !!a.push.title.trim() && !!a.push.body.trim(), message, a.links, a.push.timing]
    const [theme, template, hero, sectionsOk, links, instructions] = flags
    return {
      theme,
      template,
      hero,
      sections: sectionsOk,
      links,
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
    a.links, // すべてのリンクの場所に、行き先がある(既定の URL を含む)
    !!a.instructions.trim(),
  ]
  const [theme, template, hero, sectionsOk, links, instructions] = flags
  return {
    theme,
    template,
    hero,
    sections: sectionsOk,
    links,
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
    theme?: string
    headline?: string
    copy?: string
    instructions?: string
    layout_key?: string
    email_template?: string
    hero_image_id?: string | null
    channel?: string
    push_link?: string
    audience?: string
    push_title?: string
    push_body?: string
    links?: string
  },
  productCount: number,
): Progress {
  const isApp = card.channel === 'app'
  const template = card.layout_key || (isApp ? DEFAULT_PUSH_TEMPLATE : templateFromValue(card.email_template))
  // リンク先の判定は、テンプレートのリンクの場所と、配信カードの設定だけで決まる(既定の行き先は、商品がなくても作れる)
  const links = linksComplete(linkSlots(template, [], [], 'campaign'), parseLinks(card.links), isApp ? { tapDone: tapComplete(parsePushLink(card.push_link)) } : undefined)
  return progressOf({
    push: isApp ? { title: card.push_title ?? '', body: card.push_body ?? '', timing: !!card.audience } : undefined,
    theme: card.theme ?? '',
    template,
    links,
    heroId: card.hero_image_id ?? undefined,
    headline: card.headline ?? '',
    items: Array.from({ length: productCount }, () => ({}) as Item),
    instructions: card.instructions ?? '',
  })
}

/** 締め切りの警告の日数(制作の締め切り、なければ配信日が、この日数以内で、まだ何も作っていない配信に印を付ける) */
export const DUE_SOON_DAYS = 7

/**
 * 締め切り(制作の締め切り、なければ配信日)が近いのに、まだ着手していないか。
 * 着手していない = テーマ・ヒーロー(通知)・セクション(メッセージ)・制作指示(時刻・相手)が、どれも終わっていない
 * (テンプレートは常に選ばれていて、リンク先は既定の行き先で完了になることがあるので、数えない)
 */
export function isDueSoonNotStarted(deadline: string | undefined, progress: Progress, now = new Date(), scheduledAt = deadline): boolean {
  if (!deadline || !scheduledAt) return false
  // 締め切りを過ぎていても、まだ配信していなければ警告する(過ぎているほうが急ぐ)
  if (new Date(scheduledAt).getTime() < now.getTime()) return false
  const days = (new Date(deadline).getTime() - now.getTime()) / 86_400_000
  return days <= DUE_SOON_DAYS && !progress.theme && !progress.hero && !progress.sections && !progress.instructions
}
