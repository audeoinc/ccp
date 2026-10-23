// SQL の CTE(WITH 名前 AS (…))を見つけ、1 つだけを試す SQL を作る(開発用の画面の「CTE を試す」)。
// 長い SQL を作っている途中で、CTE ごとに途中の結果を確かめるため。文字列・コメントの中の括弧は数えない

export interface Cte {
  name: string
  /** その CTE の閉じ括弧の、次の位置 */
  end: number
}

/** 文字列・コメントを飛ばしながら、先頭から 1 文字ずつ読む。括弧の深さと位置を返す */
function scan(sql: string, onChar: (i: number, depth: number) => boolean | void): void {
  let depth = 0
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const two = sql.slice(i, i + 2)
    if (two === '--' || c === '#') {
      const nl = sql.indexOf('\n', i)
      i = nl < 0 ? sql.length : nl + 1
      continue
    }
    if (two === '/*') {
      const e = sql.indexOf('*/', i + 2)
      i = e < 0 ? sql.length : e + 2
      continue
    }
    // バッククォート(`表の名前`)は、名前を探せるように飛ばさない(名前の中に括弧・引用符は書かれない)
    if (c === "'" || c === '"') {
      // BigQuery の三重引用符('''…''')も、同じ引用符が 3 つ続くまで飛ばす
      const triple = sql.slice(i, i + 3) === c.repeat(3)
      const close = triple ? c.repeat(3) : c
      let j = i + close.length
      while (j < sql.length) {
        if (sql[j] === '\\') {
          j += 2
          continue
        }
        if (sql.slice(j, j + close.length) === close) break
        j++
      }
      i = j + close.length
      continue
    }
    if (c === '(') depth++
    if (onChar(i, depth) === true) return
    if (c === ')') depth--
    i++
  }
}

/** いちばん外の WITH の CTE を、書いた順に返す */
export function listCtes(sql: string): Cte[] {
  // 文字列・コメントの中を空白にした写しで、名前の位置を探す(位置は元と同じ)
  const plain = blankOutside(sql)
  const m = /^\s*WITH\s+(RECURSIVE\s+)?/i.exec(plain)
  if (!m) return []
  const out: Cte[] = []
  let pos = m[0].length
  for (;;) {
    const head = /^\s*(`[^`]+`|[A-Za-z_][\w]*)\s+AS\s*\(/i.exec(plain.slice(pos))
    if (!head) break
    const name = head[1].replace(/`/g, '')
    const open = pos + head[0].length - 1
    const close = matchParen(sql, open)
    if (close < 0) break
    out.push({ name, end: close + 1 })
    const comma = /^\s*,/.exec(plain.slice(close + 1))
    if (!comma) break
    pos = close + 1 + comma[0].length
  }
  return out
}

/** 文字列・コメントの中を空白にした写し(位置は元と同じ) */
function blankOutside(sql: string): string {
  const keep = new Array<boolean>(sql.length).fill(false)
  scan(sql, (i) => {
    keep[i] = true
  })
  return sql
    .split('')
    .map((c, i) => (keep[i] || c === '\n' ? c : ' '))
    .join('')
}

/** open の位置の「(」に対応する「)」の位置(なければ -1) */
function matchParen(sql: string, open: number): number {
  let found = -1
  let base = -1
  scan(sql, (i, depth) => {
    if (i === open) base = depth
    else if (base >= 0 && i > open && sql[i] === ')' && depth === base) {
      found = i
      return true
    }
  })
  return found
}

/** その CTE までを生かして、中身を見る SQL(後ろの CTE と、最後の SELECT は落とす) */
export function cteQuery(sql: string, cte: Cte, limit: number): string {
  return `${sql.slice(0, cte.end)}\nSELECT * FROM \`${cte.name}\`\nLIMIT ${limit}`
}
