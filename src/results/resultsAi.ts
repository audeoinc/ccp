// 配信 1 本の結果を、AI に短く読んでもらう(X89 のシンプルな結果の窓。results.ai)。
// 主な数字・AB の案ごとの数字・押された部品の順を渡し、「どう読めるか」と「次に試すこと」を 2〜3 行で返してもらう。
// 詳しい振り返り(aiReview。過去の配信の平均と比べる)と違い、この配信の数字だけで読む。AI の答えは保存しない(採用したものだけを、次に生かすメモに入れる)
import { askAgent } from '../aiSelect'
import { metricLabel } from '../abTest'
import type { VariantStat } from '../abResults'
import { tr } from '../i18n'
import type { Product } from '../models/products'
import { parseLinkResults, parseProductResults, templateIdOf, type ResultRow } from '../results'
import { getTemplate } from '../templates'
import { elementDescriptions } from '../elements'
import type { AbMetric } from '../abTest'

const READ_PROMPT = `あなたは、ファッション通販の配信(メール・アプリの通知)の結果を読むアシスタントです。
下の「入力」の JSON を読み、この配信の結果が「どう読めるか」と「次に試すこと」を、JSON だけで返してください。

# 入力の見方
- delivery: この配信(名前・チャネル・テーマ・テンプレート)
- kpis: 主な数字。rate は割合(0〜1)。vsPrevWeek は前の週の同じ国・チャネルの配信の売上の平均との差、vsLastYear は前年との差(割合。ないときは null)
- ab: AB テストのとき、案ごとの数字(metric は判定の指標、value はその値)と勝ち案・伸び・差が偶然でないかの目安(confidence: sure / likely / notYet / tooFew)。AB でなければ null
- clicks: 押された部品(メイン画像・ボタン・要素・商品)を、クリックの多い順に。share は、この配信のクリックの合計に対する割合

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"reading":["..."],"next":["..."]}

# ルール
1. reading は 1〜2 個、next は 1 個。合わせて 2〜3 行。1 つは 60 文字以内の 1 文。
2. reading には、数字(割合・ポイント・差)を必ず入れる。押された部品の順から、どこが効いたかを書く。
3. AB があれば、勝ち案と、その差が確かか(confidence)を reading に入れる。tooFew・notYet なら「まだ決められない」と書く。
4. next は、次の配信で、何を・どこに・どう変えるかが分かる、具体的な 1 文にする。
5. 入力にないことは書かない。日本語で書く。

# 入力
`

export interface ResultReading {
  reading: string[]
  next: string[]
}

/** 案ごとの結果(abVerdict の結果のうち、AI に渡す分) */
export interface AbForAi {
  metric: AbMetric
  stats: VariantStat[]
  winner?: VariantStat
  lift?: number
  confidence: string
}

const round = (v: number | undefined, d = 4) => (v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)))

/** 押された部品を、クリックの多い順に(名前は、画面の言葉で。要素はテンプレートの説明から) */
export function clickOrder(row: ResultRow, products: Product[] = []): { name: string; clicks: number; share: number }[] {
  const links = parseLinkResults(row.result.links)
  const names = elementDescriptions(getTemplate(templateIdOf(row.card)))
  const byId = new Map(products.map((p) => [p.id, p]))
  const out: { name: string; clicks: number }[] = []
  // 要素ごとの分け(版 3)があれば、そちらを使う(hero・buttons は、その合計なので重ねない)
  if (links.els && Object.keys(links.els).length) {
    for (const [id, n] of Object.entries(links.els)) out.push({ name: names.get(id) ?? id, clicks: n })
  } else {
    if (links.hero) out.push({ name: tr('メイン画像', 'Main image'), clicks: links.hero })
    ;(links.buttons ?? []).forEach((n, i) => n && out.push({ name: tr(`ボタン ${i + 1}`, `Button ${i + 1}`), clicks: n }))
    for (const pr of parseProductResults(row.result.products)) if (pr.clicks) out.push({ name: byId.get(pr.productId)?.name ?? pr.productId, clicks: pr.clicks })
  }
  if (links.other) out.push({ name: tr('そのほかのリンク', 'Other links'), clicks: links.other })
  const total = out.reduce((a, x) => a + x.clicks, 0)
  return out.sort((a, b) => b.clicks - a.clicks).slice(0, 10).map((x) => ({ ...x, share: total ? Number((x.clicks / total).toFixed(3)) : 0 }))
}

/** AI に渡す入力(試しやすいように、呼ぶ所と分ける) */
export function readingInput(row: ResultRow, ab: AbForAi | null, products: Product[] = []) {
  const r = row.result
  return {
    delivery: { name: row.card.name ?? '', channel: row.card.channel ?? '', theme: row.card.theme ?? '', template: templateIdOf(row.card) },
    kpis: {
      recipients: r.recipients ?? null,
      opens: r.opens ?? null,
      clicks: r.clicks ?? null,
      orders: r.orders ?? null,
      revenue: row.revenue,
      openRate: round(row.openRate),
      clickRate: round(row.clickRate),
      vsPrevWeek: round(row.vsPrevWeek, 3),
      vsLastYear: round(row.vsLastYear, 3),
    },
    ab: ab
      ? {
          metric: metricLabel(ab.metric),
          variants: ab.stats.map((s) => ({ key: s.key, recipients: s.recipients, opens: s.opens, clicks: s.clicks, orders: s.orders, revenue: s.revenue, value: round(s.value) })),
          winner: ab.winner?.key ?? null,
          lift: round(ab.lift, 3),
          confidence: ab.confidence,
        }
      : null,
    clicks: clickOrder(row, products),
  }
}

export async function readResult(row: ResultRow, ab: AbForAi | null, products: Product[] = []): Promise<ResultReading> {
  const parsed = (await askAgent(READ_PROMPT, { task: 'read_result', ...readingInput(row, ab, products) })) as Partial<Record<keyof ResultReading, unknown>>
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, n) : [])
  const out = { reading: list(parsed.reading, 2), next: list(parsed.next, 1) }
  if (!out.reading.length && !out.next.length) throw new Error(tr('AI の読みを取得できませんでした', 'Could not get the AI reading'))
  return out
}
