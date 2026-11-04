// AI の案の扱い(ai_runs.adoption。X56 の (b))。案をそのまま使ったか・人が直したか・使わなかったかを、あとから決める。
// AI の案そのものは保存しない(CLAUDE.md の約束)。依頼の記録には、比べるのに要る最小限の「指紋」だけを持つ:
//   文 = ならした文のハッシュ(32 ビット)と、2 文字ずつの組の MinHash(16 個 × 16 ビット)。元の文には戻せない
//   商品・メイン画像・テンプレート = コードのハッシュ(32 ビット)
// 決めるのは、承認がそろったときと、制作に渡したとき(そのときの配信カードの中身と比べる。決め直すたびに上書きし、最後の判定を残す)。
import { AiRunsService, type AiRunAdoption } from './data/aiRuns'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import { HeroImagesService } from './data/heroImages'
import { ProductsService } from './data/products'

const MINHASH = 16
/** 似ている(人が直した)とみなす、2 文字の組の重なりの目安(MinHash で見積もる Jaccard) */
const SIMILAR = 0.4

// ---- 指紋

const norm = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')

/** FNV-1a(32 ビット)。画面とモックで同じ値になれば足りるので、暗号のハッシュは要らない */
function fnv(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
const hex = (n: number, w: number) => n.toString(16).padStart(w, '0')

/** 文の指紋(t + ハッシュ 8 桁 + MinHash 16 × 4 桁)。短すぎる文は比べられないので null */
export function textSig(s: string): string | null {
  const n = norm(s)
  if (n.length < 2) return null
  const grams = new Set<string>()
  for (let i = 0; i < n.length - 1; i++) grams.add(n.slice(i, i + 2))
  let mins = ''
  for (let k = 0; k < MINHASH; k++) {
    let m = 0xffff
    for (const g of grams) m = Math.min(m, fnv(`${k}:${g}`) & 0xffff)
    mins += hex(m, 4)
  }
  return `t${hex(fnv(n), 8)}${mins}`
}

/** コード(商品・メイン画像・テンプレート)の指紋 */
export function codeSig(code: string): string | null {
  const n = norm(code)
  return n ? `c${hex(fnv(n), 8)}` : null
}

/** 指紋の形: 枠(slot) → 選べた案(alt) → 案の中身(文・コード)。1 つの依頼に、別々に決める枠がいくつかある(商品と見出しなど) */
export interface Fingerprint {
  v: 1
  s: string[][][]
}

type Raw = Record<string, unknown>
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? { code: x, text: x } : ((x ?? {}) as Raw))) : [])
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const T = (v: unknown) => textSig(str(v))
const C = (v: unknown) => codeSig(str(v))
const codeOf = (x: Raw) => C(x.code ?? x.productCode ?? x.product_code ?? x.id ?? x.name)
const alts = (list: Raw[], pick: (x: Raw) => (string | null)[]) => list.map((x) => pick(x).filter((s): s is string => !!s))

/**
 * 依頼の種類ごとに、返ってきた案から指紋の枠を作る。配信カードの中身にならない依頼(タスク・学び・キャンペーンの名前など)は扱わない(null)
 */
function slotsOf(task: string, out: Raw): string[][][] | null {
  switch (task) {
    case 'suggest_themes':
      return [alts(arr(out.themes), (x) => [T(x.theme)])]
    case 'suggest_copies':
      return [alts(arr(out.copies), (x) => [T(x.headline), T(x.lead)])]
    case 'suggest_push':
      return [alts(arr(out.notifications), (x) => [T(x.title), T(x.body)])]
    case 'suggest_subjects':
      return [alts(arr(out.subjects), (x) => [T(x.subject), T(x.preheader)])]
    case 'suggest_instructions':
      return [alts(arr(out.instructions), (x) => [T(x.text)])]
    case 'suggest_template':
      return [[[C(out.template)].filter((s): s is string => !!s)]]
    // 枠の商品は、選んだ組がひとつの案(候補の中から 1 つを選ぶのではない)。見出し・コピーは、候補から 1 つを選ぶ
    case 'select_section':
      return [[arr(out.products).map(codeOf).filter((s): s is string => !!s)], alts(arr(out.titles), (x) => [T(x.title)]), alts(arr(out.copies), (x) => [T(x.copy)])]
    case 'select_section_products':
      return [[arr(out.products).map(codeOf).filter((s): s is string => !!s)]]
    case 'select_section_titles':
      return [alts(arr(out.titles), (x) => [T(x.title)])]
    case 'select_section_copies':
      return [alts(arr(out.copies), (x) => [T(x.copy)])]
    case 'select_hero':
      return [alts([...(out.hero ? [out.hero as Raw] : []), ...arr(out.candidates)], (x) => [C(x.code)])]
    case 'suggest_part_rewrite':
      return [alts(arr(out.ideas), (x) => [T(x.text)])]
    case 'suggest_part_hero':
    case 'suggest_part_product':
      return [alts(arr(out.ideas), (x) => [C(x.code)])]
    case 'write_product_detail':
      return [alts(arr(out.ideas), (x) => [T(x.title), T(x.body)])]
    default:
      return null
  }
}

/** 配信カードの中身になる案を返す依頼か(このときは、学びを渡したかに関わらず、依頼を記録する) */
export const isContentTask = (task: string) => slotsOf(task, {}) !== null

/** 返ってきた案の指紋(JSON)。中身になる依頼でない・比べられる案がないときは undefined */
export function fingerprintOf(task: string, out: Raw): string | undefined {
  const slots = (slotsOf(task, out) ?? []).map((s) => s.filter((a) => a.length > 0)).filter((s) => s.length > 0)
  if (slots.length === 0) return undefined
  const fp: Fingerprint = { v: 1, s: slots }
  return JSON.stringify(fp)
}

// ---- 決める

/** いまの配信カードの中身(文とコードの指紋)。案の指紋と同じ作り方で作る */
export interface CardSigs {
  texts: string[]
  codes: Set<string>
}

const leaves = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') {
    // JSON の文字列(見出しの並び・部品の中身・AB の案)は、中の文まで開く
    const t = v.trim()
    if ((t.startsWith('{') || t.startsWith('[')) && t.length > 1) {
      try {
        return leaves(JSON.parse(t), out)
      } catch {
        /* ふつうの文 */
      }
    }
    out.push(v)
  } else if (Array.isArray(v)) v.forEach((x) => leaves(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out))
  return out
}

/** 文の近さ(MinHash の一致の割合)。ハッシュが同じなら 1 */
function similarity(a: string, b: string): number {
  if (a.slice(1, 9) === b.slice(1, 9)) return 1
  let same = 0
  for (let k = 0; k < MINHASH; k++) if (a.slice(9 + k * 4, 13 + k * 4) === b.slice(9 + k * 4, 13 + k * 4)) same++
  return same / MINHASH
}

/** 案の 1 つ(文・コード)が、いまの中身にどれだけ残っているか: 1 = そのまま、0.5 = 似ている(直した)、0 = ない */
function itemScore(sig: string, card: CardSigs): number {
  if (sig.startsWith('c')) return card.codes.has(sig) ? 1 : 0
  let best = 0
  for (const t of card.texts) best = Math.max(best, similarity(sig, t))
  return best === 1 ? 1 : best >= SIMILAR ? 0.5 : 0
}

const RANK: Record<AiRunAdoption, number> = { as_is: 2, edited: 1, rejected: 0 }

/** 指紋と、いまの中身を比べて、案の扱いを決める。枠ごとに、いちばん残っている案で決め、枠がすべてそのままなら as_is、すべてないなら rejected */
export function adoptionOf(fp: Fingerprint, card: CardSigs): AiRunAdoption {
  const perSlot = fp.s.map((slot) =>
    slot
      .map((alt): AiRunAdoption => {
        const scores = alt.map((sig) => itemScore(sig, card))
        return scores.every((x) => x === 1) ? 'as_is' : scores.some((x) => x > 0) ? 'edited' : 'rejected'
      })
      .reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'rejected' as AiRunAdoption),
  )
  if (perSlot.every((x) => x === 'as_is')) return 'as_is'
  if (perSlot.every((x) => x === 'rejected')) return 'rejected'
  return 'edited'
}

const TEXT_FIELDS = ['theme', 'headline', 'copy', 'instructions', 'subject', 'preheader', 'push_title', 'push_body', 'name', 'section_titles', 'section_copies', 'part_content', 'ab_test'] as const

/** いまの配信カードの中身を読んで、指紋を作る(商品・メイン画像は、コードを引く) */
async function cardSigsOf(cardId: string): Promise<CardSigs | null> {
  const card = await DeliveryCardsService.get(cardId)
  if (!card.success || !card.data) return null
  const c = card.data as unknown as Record<string, unknown>
  const texts: string[] = TEXT_FIELDS.flatMap((k) => leaves(c[k]))
  const codes: string[] = [str(c.layout_key), str(c.email_template), ...leaves(c.ab_test)]
  const rows = await DeliveryProductsService.getAll({ filter: `delivery_card_id eq ${cardId}` })
  const items = rows.success ? (rows.data ?? []) : []
  for (const r of items) texts.push(str(r.detail_title), str(r.detail_body))
  const productIds = [...new Set(items.map((r) => r.product_id).filter((x): x is string => !!x))]
  const products = await Promise.all(productIds.map((id) => ProductsService.get(id).catch(() => null)))
  for (const p of products) if (p?.success && p.data?.product_code) codes.push(p.data.product_code)
  const heroId = str(c.hero_image_id)
  if (heroId) {
    const h = await HeroImagesService.get(heroId).catch(() => null)
    if (h?.success && h.data?.image_code) codes.push(h.data.image_code)
  }
  return {
    texts: texts.map(textSig).filter((s): s is string => !!s),
    codes: new Set(codes.map(codeSig).filter((s): s is string => !!s)),
  }
}

/**
 * その配信カードの AI の依頼の扱いを決めて書く(承認がそろったとき・制作に渡したとき)。指紋のない依頼(以前の記録・画像の案)は触らない。
 * 失敗しても、承認・受け渡しは止めない(記録は、次に決めるときに書き直される)
 */
export async function settleAiRuns(cardId: string): Promise<void> {
  try {
    const runs = await AiRunsService.getAll({ filter: `delivery_card_id eq ${cardId}` })
    const open = (runs.success ? (runs.data ?? []) : []).filter((r) => r.fingerprint && !r.sample)
    if (open.length === 0) return
    const card = await cardSigsOf(cardId)
    if (!card) return
    await Promise.all(
      open.map((r) => {
        let fp: Fingerprint
        try {
          fp = JSON.parse(r.fingerprint!) as Fingerprint
        } catch {
          return null
        }
        if (fp?.v !== 1 || !Array.isArray(fp.s)) return null
        const adoption = adoptionOf(fp, card)
        return adoption === r.adoption ? null : AiRunsService.update(r.id, { adoption })
      }),
    )
  } catch {
    /* 記録だけなので、止めない */
  }
}
