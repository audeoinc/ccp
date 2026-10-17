// must の決まりの、コードでの確かめ(バックログ M5。設計は docs/POLICY.md の 5 章、書き方は docs/POLICY_FORMAT.md の 3.3)。
// AI の返答(askAgent が受け取った JSON)を、決まりの「確かめ方」に照らす。破っていれば、askAgent が 1 回だけ作り直させ、それでもだめなら警告を出す。
// ほかのファイルを読み込まない(scripts/check-policy.mjs が、このファイルだけを読み込んで確かめるため)。

export type Check =
  | { kind: 'excludeWords'; words: string[] }
  | { kind: 'excludeRe'; re: RegExp }
  | { kind: 'requireRe'; re: RegExp }
  | { kind: 'excludeStage'; stage: string }
  | { kind: 'weeklyLimit'; n: number }

export interface CheckRule {
  ruleId: string
  title: string
  checkSpec?: string
}

export interface Violation {
  ruleId: string
  title: string
  /** 何が破れているか(見つかった言葉・商品など) */
  detail: string
}

/** /…/ の中身を正規表現にする(JavaScript の書き方。読めなければ undefined) */
function toRe(src: string): RegExp | undefined {
  const m = src.trim().match(/^\/(.+)\/([a-z]*)$/)
  if (!m) return undefined
  try {
    return new RegExp(m[1], m[2].replace(/g/g, ''))
  } catch {
    return undefined
  }
}

/** 「確かめ方」の文字を読む。読めない・この画面で確かめないものは undefined */
export function parseCheck(spec?: string): Check | undefined {
  const s = (spec ?? '').trim()
  let m = s.match(/^含めない\s+(\/.+\/[a-z]*)$/)
  if (m) {
    const re = toRe(m[1])
    return re ? { kind: 'excludeRe', re } : undefined
  }
  m = s.match(/^含める\s+(\/.+\/[a-z]*)$/)
  if (m) {
    const re = toRe(m[1])
    return re ? { kind: 'requireRe', re } : undefined
  }
  m = s.match(/^含めない\s+(.+)$/)
  if (m) {
    const words = m[1].split(/[,、，]/).map((w) => w.trim()).filter(Boolean)
    return words.length ? { kind: 'excludeWords', words } : undefined
  }
  m = s.match(/^除く\s+段階\s*=\s*(\S+)$/)
  if (m) return { kind: 'excludeStage', stage: m[1] }
  m = s.match(/^上限\s+週\s+(\d+)\s*回$/)
  if (m) return { kind: 'weeklyLimit', n: Number(m[1]) }
  return undefined
}

// 文字を確かめないキー(理由・切り口・チャットの返事・コード・商品名など。AI が書いた「理由」の中の言葉で、案を破ったことにしないため)
const SKIP_TEXT = /(reason|angle|reply|mode|code|^id$|Id$|^name$|productName|why|note)/i
// 選んだ商品のコードが入るキー
const CODE_KEYS = new Set(['code', 'productCode', 'product_code'])

/** 返答の中の、案の文字(見出し・コピー・テーマ・制作指示など)を集める */
export function textsOf(v: unknown, key = ''): string[] {
  if (typeof v === 'string') return SKIP_TEXT.test(key) ? [] : [v]
  if (Array.isArray(v)) return v.flatMap((x) => textsOf(x, key))
  if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => textsOf(x, k))
  return []
}

/** 返答の中の、選んだ商品のコードを集める */
export function codesOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(codesOf)
  if (v && typeof v === 'object')
    return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => (CODE_KEYS.has(k) && (typeof x === 'string' || typeof x === 'number') ? [String(x)] : codesOf(x)))
  return []
}

// 段階の日本語と英語(POLICY_FORMAT.md の 2 章)。どちらで書かれていても、同じ段階として比べる
const STAGE_ALIASES: Record<string, string> = { 主力: 'core', core: 'core', 定番: 'staple', staple: 'staple', 在庫調整: 'clearance', clearance: 'clearance', 新作: 'new', new: 'new' }
const stageKey = (s?: string) => {
  const t = (s ?? '').trim().toLowerCase()
  return STAGE_ALIASES[t] ?? STAGE_ALIASES[(s ?? '').trim()] ?? t
}

/**
 * 返答を、must の決まりに照らす。stageOf は、商品コード → 段階(今週の方針か MD 方針)。
 * 「上限 週 n 回」は、1 回の返答では分からないので、ここでは確かめない(週の確認で見る)。
 */
export function findViolations(rules: CheckRule[], output: unknown, stageOf: (code: string) => string | undefined): Violation[] {
  const texts = textsOf(output)
  const joined = texts.join('\n')
  const out: Violation[] = []
  for (const r of rules) {
    const c = parseCheck(r.checkSpec)
    if (!c) continue
    if (c.kind === 'excludeWords') {
      const lower = joined.toLowerCase()
      const hit = c.words.filter((w) => lower.includes(w.toLowerCase()))
      if (hit.length) out.push({ ruleId: r.ruleId, title: r.title, detail: hit.join(', ') })
    } else if (c.kind === 'excludeRe') {
      const hit = texts.map((t) => t.match(c.re)?.[0]).filter((x): x is string => !!x)
      if (hit.length) out.push({ ruleId: r.ruleId, title: r.title, detail: Array.from(new Set(hit)).join(', ') })
    } else if (c.kind === 'requireRe') {
      // 文字の案がない返答(商品だけを選ぶ依頼など)では、確かめない
      if (texts.length && !c.re.test(joined)) out.push({ ruleId: r.ruleId, title: r.title, detail: String(c.re) })
    } else if (c.kind === 'excludeStage') {
      const want = stageKey(c.stage)
      const hit = Array.from(new Set(codesOf(output))).filter((code) => stageKey(stageOf(code)) === want)
      if (hit.length) out.push({ ruleId: r.ruleId, title: r.title, detail: hit.join(', ') })
    }
  }
  return out
}

/** 作り直しを頼むときに、指示文の頭に付ける文 */
export function retryNote(v: Violation[]): string {
  return (
    '【必ず守る決まりを破っています】前の返答は、次の must の決まりを破っていた。これを直して、もう一度作る(ほかの条件はそのまま)。' +
    v.map((x) => `${x.ruleId}「${x.title}」: ${x.detail}`).join(' / ') +
    '\n\n'
  )
}
