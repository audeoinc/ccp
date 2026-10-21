// 週・月の振り返りの下書きを、AI に書いてもらう(結果の面の「この週 / この月の振り返り」の「AI で下書き」)。
// 下書きは、メモの欄にそのまま入れ、人が直してから保存する(保存しなければ残らない。AI の案は保存しない、という約束のまま)。
// 配信 1 本ずつの振り返り(aiReview.ts)と違い、期間の配信をまとめて、同じ長さの前の期間と比べる
import { askAgent } from './aiSelect'
import { tr } from './i18n'
import { isPush, templateName, type ResultRow } from './results'
import { themeTypeLabel, themeTypeOf } from './themeTypes'

export type RetroPeriod = 'week' | 'month'

const RETRO_PROMPT = `あなたは、ファッション通販の配信(メール・アプリのプッシュ)の結果を分析するアシスタントです。
下の「入力」の JSON を読み、この期間(period が week なら 1 週間、month なら 1 か月)に送った配信の結果を、前の期間(past)と比べて、期間全体の振り返りを、JSON だけで返してください。
返した文は、担当者がそのまま振り返りのメモに入れて、直してから保存します。

# 入力の見方
- period: week / month。label: 期間の表示(例 2026-10-04 の週、2026-10)
- summary: 国(country)× チャネル(channel)ごとの、今回 now と前の期間 past の数字。past は、前の期間 pastPeriods 回分の、1 期間あたりの平均。rate は割合(0〜1)。push には開封率がない(clickRate はタップ率)
- deliveries: この期間の配信。日付・名前・テーマ・テーマの種類・テンプレート・数字・前年比(vsLastYear)・担当者が書いた「次に生かすメモ」(note)
- weekRetros: (月のときだけ)この月の各週に、担当者が書いた週の振り返り

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"good":["..."],"bad":["..."],"next":["..."],"confidence":"..."}

# ルール
1. good・bad・next は、それぞれ 1〜3 個。1 つは 70 文字以内の 1 文。数字(差のポイント・割合・金額の増減)を必ず入れる。
2. 1 本の配信の話だけで終わらせず、期間全体の傾向(テーマの種類・テンプレート・チャネル・曜日・国の違い)を優先して書く。どの配信の話かは、配信の名前で示す。
3. next は、次の{期間}で、何を・どう変えるかが分かる、具体的な提案にする。担当者のメモ(note・weekRetros)にある気づきと矛盾しないようにし、裏づけがあれば生かす。
4. confidence は、根拠の強さを 1 文で(配信の本数が少ない・前の期間の材料が少ない・差が小さいときは「弱い」と書く)。
5. 入力にないことは書かない。日本語で書く。

# 入力
`

/** 1 つの配信の数字(AI に渡す形) */
const deliveryOf = (r: ResultRow) => ({
  date: (r.result.sent_at ?? r.card.scheduled_at ?? '').slice(0, 10),
  name: r.card.name,
  channel: isPush(r.card) ? 'push' : 'email',
  country: r.card.country ?? '',
  theme: r.card.theme ?? '',
  themeType: themeTypeLabel(themeTypeOf(r.card).type),
  template: templateName(r.card),
  recipients: r.result.recipients ?? 0,
  openRate: r.openRate,
  clickRate: r.clickRate,
  orders: r.result.orders ?? 0,
  revenue: Math.round(r.revenue),
  vsLastYear: r.vsLastYear,
  note: r.result.notes?.trim() || undefined,
})

/** 国 × チャネルごとの合計(今回)と、前の期間の 1 期間あたりの平均 */
function summarize(now: ResultRow[], past: ResultRow[], pastPeriods: number) {
  const keyOf = (r: ResultRow) => `${r.card.country ?? ''}|${isPush(r.card) ? 'push' : 'email'}`
  const total = (rows: ResultRow[]) => {
    const recipients = rows.reduce((a, r) => a + (r.result.recipients ?? 0), 0)
    const opens = rows.reduce((a, r) => a + (r.result.opens ?? 0), 0)
    const clicks = rows.reduce((a, r) => a + ((isPush(r.card) ? r.result.opens : r.result.clicks) ?? 0), 0)
    const push = rows.length > 0 && isPush(rows[0].card)
    return {
      deliveries: rows.length,
      recipients,
      openRate: push || !recipients ? undefined : opens / recipients,
      clickRate: recipients ? clicks / recipients : undefined,
      orders: rows.reduce((a, r) => a + (r.result.orders ?? 0), 0),
      revenue: Math.round(rows.reduce((a, r) => a + r.revenue, 0)),
    }
  }
  const keys = [...new Set(now.map(keyOf))]
  return keys.map((k) => {
    const [country, channel] = k.split('|')
    const p = total(past.filter((r) => keyOf(r) === k))
    const per = (v: number) => (pastPeriods ? Math.round(v / pastPeriods) : 0)
    return {
      country,
      channel,
      now: total(now.filter((r) => keyOf(r) === k)),
      // 割合は前の期間をまとめた値、数は 1 期間あたりの平均
      past: { ...p, deliveries: pastPeriods ? p.deliveries / pastPeriods : 0, recipients: per(p.recipients), orders: per(p.orders), revenue: per(p.revenue) },
    }
  })
}

/**
 * 週・月の振り返りの下書き(メモにそのまま入れる文)を作る。
 * now = この期間に送った配信、past = 前の期間(pastPeriods 回分)に送った配信
 */
export async function draftRetro(args: { period: RetroPeriod; label: string; now: ResultRow[]; past: ResultRow[]; pastPeriods: number; weekRetros?: { week: string; text: string }[] }): Promise<string> {
  if (args.now.length === 0) throw new Error(tr('この期間には、結果のある配信がありません', 'No deliveries with results in this period'))
  const prompt = RETRO_PROMPT.replace('{期間}', args.period === 'week' ? '週' : '月')
  const parsed = (await askAgent(prompt, {
    task: 'draft_retro',
    period: args.period,
    label: args.label,
    pastPeriods: args.pastPeriods,
    summary: summarize(args.now, args.past, args.pastPeriods),
    deliveries: args.now.map(deliveryOf),
    ...(args.weekRetros?.length ? { weekRetros: args.weekRetros } : {}),
  })) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 3) : [])
  const good = list(parsed.good)
  const bad = list(parsed.bad)
  const next = list(parsed.next)
  if (good.length + bad.length + next.length === 0) throw new Error(tr('振り返りの下書きを取得できませんでした', 'Could not get the draft'))
  const block = (head: string, items: string[]) => (items.length ? [head, ...items.map((s) => `・${s}`)].join('\n') : '')
  const confidence = String(parsed.confidence ?? '').trim()
  return [
    block(tr('【良かったこと】', '[What went well]'), good),
    block(tr('【悪かったこと】', '[What did not]'), bad),
    block(args.period === 'week' ? tr('【次の週に試すこと】', '[Try next week]') : tr('【次の月に試すこと】', '[Try next month]'), next),
    confidence ? tr(`(根拠の強さ: ${confidence})`, `(Strength of evidence: ${confidence})`) : '',
  ]
    .filter(Boolean)
    .join('\n')
}
