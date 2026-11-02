// 「詳しく」の説明文のうち、商品ページの文と重なる所(X80 段 ③)。書く人の画面だけで薄く印を付け、ページにある内容かを見比べやすくする。
// 表示のたびに計算し、保存しない。言い換えた文は重ならないので、印がない = ページにない、とは限らない(印は手がかり)。

/** これより短い一致は印にしない(助詞・冠詞などの、たまたまの一致を拾わないため) */
const MIN_MATCH = 6

export interface OverlapPart {
  text: string
  /** ページの文にもある */
  on: boolean
}

// 見比べ用に、空白をつめて小文字に(位置は変えない: 1 文字 → 1 文字)
const fold = (s: string) => s.replace(/\s/g, ' ').toLowerCase()

/** 説明文を、ページと重なる所・重ならない所に分ける。重なる所は、前から順に、いちばん長い一致を取る */
export function pageOverlaps(body: string, page: string): OverlapPart[] {
  if (!body) return []
  const b = fold(body)
  const p = fold(page).replace(/ +/g, ' ')
  const parts: OverlapPart[] = []
  const push = (text: string, on: boolean) => {
    const last = parts[parts.length - 1]
    if (last && last.on === on) last.text += text
    else parts.push({ text, on })
  }
  let i = 0
  while (i < body.length) {
    let len = 0
    if (p.includes(b.slice(i, i + MIN_MATCH)) && b.slice(i, i + MIN_MATCH).trim().length === MIN_MATCH) {
      len = MIN_MATCH
      while (i + len < body.length && p.includes(b.slice(i, i + len + 1))) len++
    }
    if (len > 0) {
      push(body.slice(i, i + len), true)
      i += len
    } else {
      push(body[i], false)
      i++
    }
  }
  return parts
}
