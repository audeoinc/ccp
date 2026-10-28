// あいまいな検索(X87 の「使える機能」から。2026-10-29 利用者: ID を覚えていない・名前もうろ覚えでも当たるように)。
// - ひらがな / カタカナ、全角 / 半角、大文字 / 小文字をそろえ、空白・記号(/・- . など)を外して比べる(「AB」と「A/B」が同じになる)
// - 空白で区切った語は、すべて含むもの(順不同)。語ごとに、言い換え(「下書き」と「ドラフト」など)も試す
// - 当たらなければ、1 文字の打ち間違い(3 文字以上の語)、それでもなければ、文字が順に含まれるかで当てる。当たり方ごとに点を付け、近い順に並べる
// - 当たった所を、元の文字の位置で返す(太字にするため)

/** 比べるための形と、その 1 文字ずつが元の文字の何文字目か */
interface Normalized {
  text: string
  map: number[]
}

// 外して比べる記号(空白・区切り・かっこ)
const SKIP = /[\s/・\-_.()()「」『』:、,。!?!?▾→]/

function normalize(s: string): Normalized {
  let text = ''
  const map: number[] = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (SKIP.test(ch)) continue
    for (let c of ch.normalize('NFKC').toLowerCase()) {
      const code = c.charCodeAt(0)
      // カタカナ → ひらがな(ァ〜ヶ)
      if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60)
      if (SKIP.test(c)) continue
      text += c
      map.push(i)
    }
  }
  return { text, map }
}

// 言い換え(どれかで当たればよい)。よく揺れる言葉だけ
const SYNONYMS: string[][] = [
  ['下書き', 'ドラフト', 'draft'],
  ['削除', '消す', 'delete'],
  ['複製', 'コピー', 'copy', 'duplicate'],
  ['画像', '写真', 'image', 'photo'],
  ['通知', 'プッシュ', 'push', 'notification', 'アプリ'],
  ['承認', 'approval', 'approve'],
  ['書き出し', 'エクスポート', 'export'],
  ['取り込み', 'インポート', 'import'],
  ['やり取り', 'コメント', 'thread', 'comment'],
  ['結果', 'result', 'results'],
  ['学び', 'learning', 'learnings'],
  ['商品', 'product', 'products'],
  ['テンプレート', 'template', 'テンプレ'],
  ['アラート', 'alert', '警告'],
  ['検索', '探す', 'search'],
  ['設定', 'setting', 'settings'],
]
const synonymTable = SYNONYMS.map((group) => group.map((w) => normalize(w).text))

function variantsOf(term: string): string[] {
  const out = new Set([term])
  for (const group of synonymTable) if (group.some((w) => w === term || (term.length >= 2 && w.includes(term)))) group.forEach((w) => out.add(w))
  return [...out]
}

/** 1 文字までの違い(置き換え・足りない・多い)で当たる所を探す。当たれば [始め, 終わり)(比べる形の位置) */
function nearMatch(text: string, term: string): [number, number] | null {
  const n = term.length
  if (n < 3) return null
  for (const len of [n, n - 1, n + 1]) {
    for (let i = 0; i + len <= text.length; i++) {
      if (withinOne(text.slice(i, i + len), term)) return [i, i + len]
    }
  }
  return null
}

function withinOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let diff = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++diff > 1) return false
    if (a.length > b.length) i++
    else if (a.length < b.length) j++
    else {
      i++
      j++
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1
}

/** 文字が順に含まれるか(間に何があってもよい)。当たれば、その文字の位置 */
function subsequence(text: string, term: string): number[] | null {
  const at: number[] = []
  let from = 0
  for (const c of term) {
    const k = text.indexOf(c, from)
    if (k < 0) return null
    at.push(k)
    from = k + 1
  }
  return at
}

export interface SearchField {
  text: string
  /** 当たったときの重み(名前は高く、親の名前は低く) */
  weight: number
}

/** 当たった所(元の文字の位置。[始め, 終わり))。フィールドの並びごと */
export type Hits = [number, number][][]

export interface Match {
  score: number
  hits: Hits
}

/** 語に分ける(空白で区切る)。空なら、何も絞らない */
export const termsOf = (query: string) =>
  query
    // \s は全角の空白(U+3000)も含む
    .split(/\s+/)
    .map((w) => normalize(w).text)
    .filter(Boolean)

/** フィールドのどれかに、語がすべて当たれば、点と当たった所を返す。当たらなければ null */
export function fuzzyMatch(terms: string[], fields: SearchField[]): Match | null {
  if (terms.length === 0) return { score: 0, hits: fields.map(() => []) }
  const norms = fields.map((f) => normalize(f.text))
  const hits: Hits = fields.map(() => [])
  let score = 0
  for (const term of terms) {
    let best = 0
    let bestHit: { field: number; ranges: [number, number][] } | null = null
    const consider = (field: number, points: number, ranges: [number, number][]) => {
      if (points > best) {
        best = points
        bestHit = { field, ranges }
      }
    }
    norms.forEach((nf, fi) => {
      const w = fields[fi].weight
      for (const v of variantsOf(term)) {
        const k = nf.text.indexOf(v)
        if (k >= 0) {
          // そのままの語は、言い換えより少し高く。頭から当たれば、さらに高く
          consider(fi, w * (v === term ? 10 : 8) + (k === 0 ? w : 0), [[k, k + v.length]])
        }
      }
      const near = nearMatch(nf.text, term)
      if (near) consider(fi, w * 5, [near])
      // 順に含まれるだけのものは、語が 3 文字以上で、まとまって当たるときだけ(離れすぎた文字の当たりで、何にでも当たらないように)
      const seq = term.length >= 3 ? subsequence(nf.text, term) : null
      if (seq && seq[seq.length - 1] - seq[0] < term.length * 2) consider(fi, w * 2, seq.map((k) => [k, k + 1] as [number, number]))
    })
    if (!bestHit) return null
    score += best
    const { field, ranges } = bestHit as { field: number; ranges: [number, number][] }
    // 比べる形の位置を、元の文字の位置に戻す
    const map = norms[field].map
    for (const [a, b] of ranges) hits[field].push([map[a], map[b - 1] + 1])
  }
  return { score, hits }
}

/** 当たった所を太字にするための区切り(重なり・隣り合いはまとめる) */
export function splitByHits(text: string, ranges: [number, number][]): { text: string; hit: boolean }[] {
  if (ranges.length === 0) return [{ text, hit: false }]
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  const out: { text: string; hit: boolean }[] = []
  let at = 0
  for (const [a, b] of merged) {
    if (a > at) out.push({ text: text.slice(at, a), hit: false })
    out.push({ text: text.slice(a, b), hit: true })
    at = b
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false })
  return out
}
