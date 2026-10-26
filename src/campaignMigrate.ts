// いまの配信カードを、キャンペーンにまとめて作り直す(X79 の段 ⑤)。開発用の画面(src/dev/CampaignTab.tsx)から、ブラウザで回す。
// AI の下書きは画面の側(askAgent・generateFor)にあるので、サーバーで回さずに、それを使い回す(指示文・手順を複製しないため)。
//   1. 同じ国・同じ配信日(canJoinCampaign と同じ決まり)の、取りやめていないカードを 1 つにまとめる。campaign_id のあるカードは触らない
//   2. キャンペーンの名前・テーマ・目的は、まとめたカードのいまのテーマと商品から AI が 1 つ案を出し、それを採用する
//   3. カードは、そのテーマで AI に中身をすべて作り直してもらい、未起案に戻し、承認の依頼・制作の依頼の行を消す
// 途中で止まっても、もう一度流せば続きから進む: カードの campaign_id は、そのカードの作業のいちばん最後に書くので、
// campaign_id のないカードだけが残りとして出る。同じ国・同じ配信日のキャンペーンがもうあれば、新しく作らずにそこへ入れる
import type { Campaign } from './models/campaigns'
import type { DeliveryCard, DeliveryCardFields } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { CampaignsService } from './data/campaigns'
import { ApprovalsService } from './data/approvals'
import { askAgent } from './aiSelect'
import { generateFor, replaceContent } from './bulkDraft'
import { REMAKE_CLEARED_TABLES, campaignDateOf, cardNameFor, cardsOfCampaign, remakeResetFields } from './campaigns'
import { isCancelled } from './cancel'
import { localDate } from './dates'
import { THEME_TYPES } from './themeTypes'

/** カードにつながる行(承認の依頼・制作の依頼)。消す行を数え、消すのに使う */
export interface CardRow {
  id: string
  delivery_card_id?: string | null
}

/** まとめる 1 組 */
export interface MigrationGroup {
  /** 国|配信日 */
  key: string
  country: string
  /** 配信日(YYYY-MM-DD。ブラウザの時刻) */
  day: string
  /** 入れる先の、すでにあるキャンペーン(同じ国・同じ配信日)。なければ新しく作る */
  campaign?: Campaign
  /** まとめるカード(campaign_id がなく、取りやめていない。時刻の順) */
  cards: DeliveryCard[]
}

export interface MigrationPlan {
  groups: MigrationGroup[]
  /** カードごとの、消す行の数(表 → 数) */
  cleared: Map<string, Record<(typeof REMAKE_CLEARED_TABLES)[number], number>>
  /** まとめないカード: もうキャンペーンに入っている / 取りやめた / 配信日がない */
  skipped: { inCampaign: number; cancelled: number; noDate: DeliveryCard[] }
}

/**
 * 何を、どうまとめ、どの行を消すかを決める(書かない。試しの一覧と、実行の両方がこれを使う)。
 * rows は、消す表の行(表の名前 → 行)
 */
export function planMigration(cards: DeliveryCard[], campaigns: Campaign[], rows: Record<(typeof REMAKE_CLEARED_TABLES)[number], CardRow[]>): MigrationPlan {
  // すでにあるキャンペーンの、国と配信日(取りやめていない子から)
  const existing = new Map<string, Campaign>()
  for (const c of campaigns) {
    const children = cardsOfCampaign(c.id, cards)
    const day = campaignDateOf(children.filter((x) => !isCancelled(x))) || campaignDateOf(children)
    const country = c.country || children[0]?.country || ''
    if (day && !existing.has(`${country}|${day}`)) existing.set(`${country}|${day}`, c)
  }
  const skipped: MigrationPlan['skipped'] = { inCampaign: 0, cancelled: 0, noDate: [] }
  const groups = new Map<string, MigrationGroup>()
  for (const c of cards) {
    if (c.campaign_id) skipped.inCampaign++
    else if (isCancelled(c)) skipped.cancelled++
    else if (!c.scheduled_at) skipped.noDate.push(c)
    else {
      const country = String(c.country ?? '')
      const day = localDate(c.scheduled_at)
      const key = `${country}|${day}`
      const g = groups.get(key) ?? { key, country, day, campaign: existing.get(key), cards: [] }
      g.cards.push(c)
      groups.set(key, g)
    }
  }
  const list = [...groups.values()].sort((a, b) => a.day.localeCompare(b.day) || a.country.localeCompare(b.country))
  for (const g of list) g.cards.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))
  const cleared: MigrationPlan['cleared'] = new Map()
  for (const g of list)
    for (const c of g.cards)
      cleared.set(c.id, {
        approval_requests: rows.approval_requests.filter((r) => r.delivery_card_id === c.id).length,
        production_requests: rows.production_requests.filter((r) => r.delivery_card_id === c.id).length,
      })
  return { groups: list, cleared, skipped }
}

const CAMPAIGN_PROMPT = `あなたは、ファッション通販の配信(メール・アプリ)を企画するアシスタントです。
下の「入力」の JSON の cards は、同じ国・同じ配信日の配信です。これらを 1 つの「キャンペーン」にまとめます。
キャンペーンの名前・テーマ・テーマの理由・テーマの種類・目的の案を 1 つ、JSON だけで返してください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。説明文、見出し、箇条書き、コードフェンス(\`\`\`)、前置き、あとがきは一切付けない。
{"name":"...","theme":"...","themeReason":"...","themeType":"...","purpose":"..."}

# ルール
1. name はキャンペーンの名前。20 文字以内。country が JP なら日本語、US なら英語。チャネル(メール・アプリ)の言葉は入れない(配信の名前は「キャンペーン名 + チャネル」で作るため)。
2. theme は、すべての配信に共通する配信テーマ。日本語で 20 文字以内の名詞句。cards のいまのテーマ(theme)と、載せている商品(products)を手がかりに、両方のチャネルで使える 1 つにまとめる。
3. themeReason は、そのテーマにした理由。日本語で 60 文字以内。配信日の時期や商品の傾向など、根拠を具体的に書く。
4. themeType は、次のどれか 1 つ: ${THEME_TYPES.join(' / ')}。
5. purpose は、このキャンペーンで達成したいこと。日本語で 30 文字以内(例:「週末の来店・購入を増やす」)。

# 入力
`

/** AI のキャンペーンの案 */
export interface CampaignProposal {
  name: string
  theme: string
  theme_reason: string
  theme_type?: string
  purpose: string
}

/** まとめたカードのいまのテーマと商品から、キャンペーンの案を 1 つ出してもらう */
export async function suggestCampaign(group: MigrationGroup, products: Product[]): Promise<CampaignProposal> {
  const named = (s?: string) => (s ?? '').split(' / ').map((x) => x.trim()).filter(Boolean)
  const parsed = (await askAgent(CAMPAIGN_PROMPT, {
    task: 'suggest_campaign',
    country: group.country,
    date: group.day,
    cards: group.cards.map((c) => ({ name: c.name, channel: c.channel, theme: c.theme ?? '', themeType: c.theme_type ?? '', products: named(c.products) })),
    products: products
      .filter((p) => group.cards.some((c) => named(c.products).includes(p.name)))
      .map((p) => ({ name: p.name, category: p.category_name, season: p.season_name, salesTrend: p.sales_trend_name })),
  })) as Partial<Record<'name' | 'theme' | 'themeReason' | 'themeType' | 'purpose', unknown>>
  const name = String(parsed.name ?? '').trim()
  const theme = String(parsed.theme ?? '').trim()
  if (!name || !theme) throw new Error('キャンペーンの案(名前・テーマ)を取得できませんでした')
  const type = String(parsed.themeType ?? '')
  return {
    name,
    theme,
    theme_reason: String(parsed.themeReason ?? '').trim(),
    theme_type: (THEME_TYPES as string[]).includes(type) ? type : undefined,
    purpose: String(parsed.purpose ?? '').trim(),
  }
}

/** 実行の材料 */
export interface MigrationContext {
  products: Product[]
  heroes: HeroImage[]
  rows: Record<(typeof REMAKE_CLEARED_TABLES)[number], CardRow[]>
  /** 進み具合(1 行ずつ) */
  log: (line: string) => void
  isStopped: () => boolean
}

const fail = (res: { success: boolean; error?: { message: string } }, msg: string) => {
  if (!res.success) throw new Error(res.error?.message ?? msg)
}

/**
 * 決めた組を、順に、まとめて作り直す。組の中のカードが 1 枚失敗しても、ほかのカードは進める(失敗したカードは campaign_id が付かないので、もう一度流すと残りとして出る)。
 * 戻り値は、作り直したカードの数と、失敗したカードの数
 */
export async function runMigration(plan: MigrationPlan, ctx: MigrationContext): Promise<{ done: number; failed: number }> {
  let done = 0
  let failed = 0
  for (const g of plan.groups) {
    if (ctx.isStopped()) break
    ctx.log(`■ ${g.day} ${g.country}(${g.cards.length} 枚)`)
    let campaign = g.campaign
    // テーマのないキャンペーン(段 ④ で人が作ったものなど)・新しいキャンペーンは、AI の案を採用する
    let proposal: CampaignProposal | null = null
    if (!campaign?.theme) {
      try {
        proposal = await suggestCampaign(g, ctx.products)
        ctx.log(`  キャンペーンの案: ${proposal.name} / テーマ「${proposal.theme}」/ 目的「${proposal.purpose}」`)
      } catch (e) {
        ctx.log(`  ✗ キャンペーンの案を作れませんでした(この組は飛ばします): ${e instanceof Error ? e.message : String(e)}`)
        failed += g.cards.length
        continue
      }
      if (campaign) {
        const r = await CampaignsService.update(campaign.id, { theme: proposal.theme, theme_reason: proposal.theme_reason, ...(proposal.theme_type ? { theme_type: proposal.theme_type } : {}) })
        fail(r, 'キャンペーンのテーマを書けませんでした')
        campaign = { ...campaign, theme: proposal.theme, theme_reason: proposal.theme_reason, theme_type: proposal.theme_type ?? campaign.theme_type }
      }
    }
    const fixedTheme = { theme: campaign?.theme || proposal!.theme, reason: campaign?.theme_reason || proposal?.theme_reason || '' }
    const themeType = campaign?.theme_type || proposal?.theme_type
    for (const card of g.cards) {
      if (ctx.isStopped()) break
      try {
        const r = await generateFor(card, { products: ctx.products, heroes: ctx.heroes, otherThemes: [], avoidProductIds: [], fixedTheme }, () => {}, ctx.isStopped)
        if (r.cancelled) break
        if (r.errors.length) ctx.log(`  (${card.name}: 一部の工程が失敗しました: ${r.errors.join(' / ')})`)
        // キャンペーンは、最初のカードの中身ができてから作る(作ってすぐ止まると、子のないキャンペーンが残るため)
        if (!campaign) {
          const res = await CampaignsService.create({ name: proposal!.name, country: g.country, theme: proposal!.theme, theme_reason: proposal!.theme_reason, ...(proposal!.theme_type ? { theme_type: proposal!.theme_type } : {}), purpose: proposal!.purpose, state_code: 0 })
          fail(res, 'キャンペーンを作れませんでした')
          campaign = res.data
          ctx.log(`  キャンペーンを作りました: ${campaign.name}`)
        }
        // 承認の依頼・制作の依頼の行を先に消す(campaign_id はいちばん最後。途中で止まっても、もう一度流せばここからやり直す)。
        // 汎用の窓口(/api/data)は、この 2 つの表を 403 で断る(WRITE_LOCKED)。消すのは承認の窓口の clear-card で、失敗はカードの失敗にする
        // (2026-10-26 の本番の移し替えで、汎用の窓口で消して結果を見ていなかったため、8 行が消えずに残った)
        const cleared = await ApprovalsService.clearCard({ delivery_card_id: card.id })
        fail(cleared, '承認の依頼・制作の依頼を消せませんでした')
        const extra: Partial<DeliveryCardFields> = {
          ...remakeResetFields(),
          name: cardNameFor(campaign.name, card.channel),
          ...(themeType ? { theme_type: themeType } : {}),
          campaign_id: campaign.id,
        }
        await replaceContent(card, r, ctx.products, extra)
        done++
        ctx.log(`  ✓ ${card.name} → ${extra.name}(作り直して未起案に)`)
      } catch (e) {
        failed++
        ctx.log(`  ✗ ${card.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  ctx.log(ctx.isStopped() ? `止めました(作り直した ${done} 枚・失敗 ${failed} 枚)。もう一度流すと、残りから進みます` : `終わりました(作り直した ${done} 枚・失敗 ${failed} 枚)`)
  return { done, failed }
}
