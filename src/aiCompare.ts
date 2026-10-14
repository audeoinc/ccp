// 人が絞り込んで並べた配信の結果を、AI が見比べて評価する(どれが良く、どれが悪かったか、その違い・傾向・次に試すこと)。
// 評価は保存しない。採用したものだけを、並びの最新の配信の「次に生かすメモ」に入れる
import { askAgent } from './aiSelect'
import { tr } from './i18n'

const COMPARE_PROMPT = `あなたは、ファッション通販の配信(メール・プッシュ)の結果を分析するアシスタントです。
下の「入力」の JSON の deliveries は、担当者が条件(filters)で絞り込み、古い順に並べた配信の結果です。
これらを見比べて、良かった配信と悪かった配信、その違い、全体の傾向、次の配信で試すことを、JSON だけで返してください。

# 入力の見方
- filters: 担当者が絞り込んだ条件
- deliveries: 配信(古い順)。id・date・name・theme(テーマ)・themeType(テーマの種類)・template(テンプレート)・headline(見出し)・slots(商品の枠に載せた商品。上から順)
  - kpis: openRate(開封率。アプリはなし)・clickRate(クリック率。アプリは通知のタップ率)・revenue(売上)・revenuePerRecipient(1 通あたりの売上)・orders(注文)
  - positions: 位置ごとのクリックの割合(メッセージの中のクリックの合計に対して)。hero はメイン画像、button:n はボタン、slot:n は商品の枠(0 から。上から順)。テンプレートが揃っていないときは空
- 送った数は回ごとに違うので、比べるときは 1 通あたりの売上・率を重く見る

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"summary":"...","best":[{"id":"...","why":"..."}],"worst":[{"id":"...","why":"..."}],"findings":["..."],"next":["..."],"confidence":"..."}

# ルール
1. summary は、並び全体の評価を 2 文以内で。
2. best・worst は、それぞれ 1〜2 本。id は入力のものをそのまま。why は 60 文字以内で、数字を入れ、他の配信と何が違ったか(テーマ・見出し・メイン画像・商品・位置)と結びつける。
3. findings は、並び全体から読み取れる傾向を 1〜3 個(60 文字以内。数字を入れる)。
4. next は、次の配信で、何を・どこに・どう変えるかが分かる提案を 1〜3 個(60 文字以内)。
5. confidence は、根拠の強さを 1 文で(本数が少ない・差が小さいときは「弱い」と書く)。
6. 入力にないことは書かない。

# 入力
`

export interface CompareVerdict {
  summary: string
  best: { id: string; why: string }[]
  worst: { id: string; why: string }[]
  findings: string[]
  next: string[]
  confidence: string
}

export async function evaluateLineup(input: unknown): Promise<CompareVerdict> {
  const p = (await askAgent(COMPARE_PROMPT, { task: 'compare_results', ...(input as object) })) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 3) : [])
  const picks = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((x) => x as { id?: unknown; why?: unknown })
      .filter((x) => x && x.id)
      .map((x) => ({ id: String(x.id), why: String(x.why ?? '').trim() }))
      .slice(0, 2)
  const verdict = { summary: String(p.summary ?? '').trim(), best: picks(p.best), worst: picks(p.worst), findings: list(p.findings), next: list(p.next), confidence: String(p.confidence ?? '').trim() }
  if (!verdict.summary && verdict.findings.length === 0 && verdict.best.length === 0) throw new Error(tr('評価を取得できませんでした', 'Could not get the evaluation'))
  return verdict
}
