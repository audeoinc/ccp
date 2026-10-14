// 配信の結果を、過去の配信と比べた数字から、AI に言葉にしてもらう(良かったこと / 悪かったこと / 次に試すこと)。
// 振り返りは保存しない。採用したものだけを「次に生かすメモ」に入れる(AI の案は保存しない、という約束に合わせる)
import { askAgent } from './aiSelect'
import { tr } from './i18n'

const REVIEW_PROMPT = `あなたは、ファッション通販の配信(メール・プッシュ)の結果を分析するアシスタントです。
下の「入力」の JSON を読み、この配信の結果を、同じ条件の過去の配信(past の回数分の平均)と比べて、次の配信に生かせる振り返りを、JSON だけで返してください。

# 入力の見方
- delivery: この配信(名前・テーマ・テーマの種類・テンプレート・見出し・載せた商品(枠の順))
- compareBy: 比べた相手(template = 同じテンプレート / themeType = 同じテーマの種類)。past: 比べた過去の配信の数
- kpis: 数字(今回 now と、過去の平均 past)。rate は割合(0〜1)
- positions: 位置ごとのクリックの割合(メッセージの中のクリックの合計に対して。今回 now と、過去の平均 past)。hero はメイン画像、button:n はボタン、slot:n は商品の枠(0 から。上から順)
- slots: 商品の枠に、今回載せた商品

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"good":["..."],"bad":["..."],"next":["..."],"confidence":"..."}

# ルール
1. good・bad・next は、それぞれ 1〜3 個。1 つは 60 文字以内の 1 文。数字(差のポイント・割合)を必ず入れる。
2. 位置の違いは、その位置に何を載せたか(商品名・メイン画像・ボタン)と結びつけて書く。
3. next は、次の配信で、何を・どこに・どう変えるかが分かる、具体的な提案にする。
4. confidence は、根拠の強さを 1 文で(比べた回数が少ない・差が小さいときは「弱い」と書く)。
5. 入力にないことは書かない。

# 入力
`

export interface ResultReview {
  good: string[]
  bad: string[]
  next: string[]
  confidence: string
}

export async function reviewResult(input: unknown): Promise<ResultReview> {
  const parsed = (await askAgent(REVIEW_PROMPT, { task: 'review_results', ...(input as object) })) as Partial<Record<keyof ResultReview, unknown>>
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 3) : [])
  const review = { good: list(parsed.good), bad: list(parsed.bad), next: list(parsed.next), confidence: String(parsed.confidence ?? '').trim() }
  if (review.good.length + review.bad.length + review.next.length === 0) throw new Error(tr('振り返りを取得できませんでした', 'Could not get the review'))
  return review
}
