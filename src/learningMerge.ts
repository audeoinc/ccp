// 似た学びのまとめ(X78)と、学びの名前を AI で付ける。
// まとめるときは、まとめる元の学び(配信結果の行)に「まとめた先」(merged_into)を書くだけにし、ほかの表(配信カードの付け外し・
// 国のデッキ・AI の依頼の記録)の行は書き換えない。読むときに、元の id をまとめた先の id として扱う(aliasOf)ので、付け外し・デッキ・
// 効き目は、まとめた先に付け替わったのと同じになる。merged_into を消せば、そのまま元に戻る(書き換えた行を探して戻さなくてよい)
import type { DeliveryResult } from './data/deliveryResults'
import { DeliveryResultsService } from './data/deliveryResults'
import type { AiRun } from './data/aiRuns'
import { askAgent } from './aiSelect'
import { learningIdsOf } from './impact'
import { tr } from './i18n'
import type { LearningCardData } from './learningCards'

/** まとめた元の学び → まとめた先の学び(まとめた先も、さらにまとめていれば、いちばん先まで辿る) */
export function mergeAliases(results: Pick<DeliveryResult, 'id' | 'merged_into'>[]): Map<string, string> {
  const next = new Map(results.filter((r) => r.merged_into && r.merged_into !== r.id).map((r) => [r.id, r.merged_into as string]))
  const out = new Map<string, string>()
  for (const id of next.keys()) {
    let to = next.get(id)!
    // 輪になっていたら(壊れたデータ)、まとめていないとみなす
    for (let i = 0; i < 20 && next.has(to); i++) to = next.get(to)!
    if (next.has(to) || to === id) continue
    out.set(id, to)
  }
  return out
}

/** AI の依頼の記録の学びを、まとめた先の id に読み替える(同じ依頼に元と先の両方があれば 1 つにする) */
export function aliasRuns(runs: AiRun[], aliases: Map<string, string>): AiRun[] {
  if (aliases.size === 0) return runs
  return runs.map((r) => {
    const ids = learningIdsOf(r)
    if (!ids.some((id) => aliases.has(id))) return r
    return { ...r, learning_ids: JSON.stringify([...new Set(ids.map((id) => aliases.get(id) ?? id))]) }
  })
}

/** 学びをまとめる(元の学びに、まとめた先を書く) */
export async function mergeLearning(fromId: string, intoId: string, by: string): Promise<void> {
  const r = await DeliveryResultsService.update(fromId, { merged_into: intoId, merged_at: new Date().toISOString(), merged_by: by })
  if (!r.success) throw new Error(r.error?.message ?? tr('まとめられませんでした', 'Could not merge'))
}

/** まとめたのを元に戻す */
export async function unmergeLearning(fromId: string): Promise<void> {
  const r = await DeliveryResultsService.update(fromId, { merged_into: null, merged_at: null, merged_by: null })
  if (!r.success) throw new Error(r.error?.message ?? tr('元に戻せませんでした', 'Could not undo the merge'))
}

/** AI が挙げた、似ている学びの組(into に from をまとめる案) */
export interface SimilarPair {
  into: string
  from: string
  why: string
}

const SIMILAR_PROMPT = `あなたは、メール・アプリの配信の振り返りから得た「学び」を整理する担当です。
入力の学びの一覧から、同じことを言っている(意味が重なる)学びの組を挙げてください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"pairs":[{"into":"残す学びの id","from":"まとめる学びの id","why":"似ていると考えた理由(1 文)"}]}

# ルール
1. 言い回しが違っても、配信に生かすことが同じなら、似ているとみなす。対象(国・チャネル・テーマの種類)が違って、生かし方も違うなら、似ていない。
2. into には、根拠がしっかりしている方(強さが高い・使われた本数が多い)を選ぶ。
3. 1 つの学びは、1 つの組にだけ入れる。似た組がなければ、pairs は空にする。
4. id は、入力の id をそのまま返す。

# 入力
`

/** AI に、似ている学びの組を挙げてもらう(同じ出元の国の中だけで比べる。国をまたいだ学びは、生かし方が違うことが多いため) */
export async function suggestSimilarLearnings(cards: LearningCardData[]): Promise<SimilarPair[]> {
  const learnings = cards.map((l) => ({ id: l.id, title: l.title, notes: l.notes, country: l.origin, channel: l.channel, themeType: l.themeType, strength: l.strength, uses: l.uses }))
  const parsed = (await askAgent(SIMILAR_PROMPT, { task: 'suggest_similar_learnings', learnings })) as { pairs?: { into?: string; from?: string; why?: string }[] }
  if (!parsed.pairs) throw new Error(tr('似た学びの組を取得できませんでした', 'Could not get similar learnings'))
  const byId = new Map(cards.map((l) => [l.id, l]))
  const used = new Set<string>()
  const out: SimilarPair[] = []
  for (const p of parsed.pairs) {
    const into = byId.get(String(p.into ?? ''))
    const from = byId.get(String(p.from ?? ''))
    if (!into || !from || into.id === from.id || into.origin !== from.origin || used.has(into.id) || used.has(from.id)) continue
    used.add(into.id)
    used.add(from.id)
    out.push({ into: into.id, from: from.id, why: String(p.why ?? '') })
  }
  return out
}

const TITLE_PROMPT = `あなたは、メール・アプリの配信の振り返りから得た「学び」に、見出しを付ける担当です。
学びのメモを読み、カードの見出しになる、一言の名前を付けてください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"title":"見出し"}

# ルール
1. 日本語なら 16 文字以内、英語なら 5 語以内。何をすると効くかが分かる言い方にする(例: 「夜の配信はセールが効く」)。
2. メモにない数字や事実を足さない。

# 入力
`

/** AI に、学びの名前(一言の見出し)を付けてもらう。保存はしない(採用したときに、呼ぶ側が learning_title に書く) */
export async function suggestLearningTitle(l: Pick<LearningCardData, 'id' | 'notes' | 'channel' | 'themeType'>): Promise<string> {
  const parsed = (await askAgent(TITLE_PROMPT, { task: 'suggest_learning_title', learning: { id: l.id, notes: l.notes, channel: l.channel, themeType: l.themeType } })) as { title?: string }
  const title = String(parsed.title ?? '').trim()
  if (!title) throw new Error(tr('名前の案を取得できませんでした', 'Could not get a name suggestion'))
  return title
}
