// CCP の頼み T1〜T6(src/aiSelect.ts・src/simple/partAi.ts の指示文を縮めたもの。商品は架空)と、決まりの確かめ。
// 手順書 docs/MS_AI_VERIFY.md の 7 章と同じ中身。どちらかを直したら、もう一方も直す。

const INTRO = 'あなたは、ファッション通販の配信(メール・プッシュ)を企画するアシスタントです。\n'
const FORMAT_HEAD = '# 出力の形式(厳守)\n次の JSON オブジェクト 1 つだけを返す。説明文、見出し、箇条書き、コードフェンス(```)、前置き、あとがきは一切付けない。\n'
const ERROR_RULE = '- 入力の JSON が不正、または card.theme が空のときは、{"error":"理由を日本語で簡潔に"} だけを返す。\n'

const T1 = `あなたは、メールマガジン・アプリの通知の文言を直す手伝いをする。担当者は、配信の 1 つの部品(件名・見出し・コピーなど)を選び、「もっと短く」のように頼む。
入力の part が直す部品(kind・label・current = いまの文言)、card が配信(テーマ theme・国・チャネル)。
次の JSON だけを返す:
{"mode":"update","reply":"依頼にどう応えたかを 1 文で","ideas":[{"text":"新しい文言","why":"そう直した理由を 1 文で"}]}

決まり:
1. ideas は 3 つ。それぞれ違う方向にする。
2. 文言は日本語。テーマから外れない。価格・割引率・期限など、入力にない事実を作らない。
3. 見出しは短く。

入力:
{"request":"もっと短く","part":{"kind":"heading","label":"見出し","current":"秋の新作ニットで、肌寒い朝もあたたかく過ごそう"},"card":{"theme":"秋の新作ニット","country":"JP","channel":"email"}}`

const titlesInput = (theme) =>
  JSON.stringify({
    card: { theme, country: 'JP', channel: 'email', scheduledAt: '2026-11-05' },
    section: { wantTitle: true, productNames: ['ケーブル編みニット', 'モックネックセーター'] },
    otherSections: [{ title: '重ね着のニット' }],
  })

const titlesPrompt = (theme) => `${INTRO}下の「入力」の JSON を読み、メールの 1 つのセクションの「見出しの候補」を、JSON だけで返してください。

${FORMAT_HEAD}{"titles":[{"title":"...","reason":"..."}]}
- titles は、切り口の異なる見出しの案を 3 つ。
${ERROR_RULE}- section.productNames がある場合は、それに合う見出しにする。

# 見出し(title)のルール
1. 日本語で 12 文字以内。そのセクションの商品に共通する切り口を、配信テーマに沿って表す。
2. 商品カテゴリ名だけの見出しは避ける。
3. 案どうしで、切り口を変える。otherSections にある他のセクションの見出しとも、切り口が重ならないようにする。
4. reason は日本語で 40 文字以内。その見出しがどんな商品のまとまりを表すかを書く。

# 入力
${titlesInput(theme)}`

const PRODUCTS = [
  { code: 'P01', name: 'ケーブル編みニット', category: 'ニット', season: '秋冬', stock: 420, salesTrend: '上昇', rating: 4.6 },
  { code: 'P02', name: 'モヘアカーディガン', category: 'ニット', season: '秋冬', stock: 35, salesTrend: '上昇', rating: 4.8 },
  { code: 'P03', name: 'リネンシャツ', category: 'シャツ', season: '春夏', stock: 600, salesTrend: '横ばい', rating: 4.2 },
  { code: 'P04', name: 'モックネックセーター', category: 'ニット', season: '秋冬', stock: 310, salesTrend: '横ばい', rating: 4.4 },
  { code: 'P05', name: 'ウールマフラー', category: '小物', season: '秋冬', stock: 180, salesTrend: '下降', rating: 4.0 },
  { code: 'P06', name: 'デニムパンツ', category: 'パンツ', season: '通年', stock: 500, salesTrend: '横ばい', rating: 4.1 },
]

const T3 = `${INTRO}下の「入力」の JSON を読み、メールの 1 つのセクションに載せる「掲載商品とその候補」を、JSON だけで返してください。

${FORMAT_HEAD}{"products":[{"code":"P01","reason":"..."}]}
- products は、優先度の高い順に並べる。先頭から section.slots 件が「選定」、その続き 2 件が「残りの候補」。
${ERROR_RULE}
# 商品選定のルール
1. 商品は products の中からだけ選ぶ。候補にないものを作らない。code は入力のとおりに返す。同じ code を重複させない。
2. 配信テーマ(card.theme)との適合を最優先にする。次に、セクションの見出し(section.title)、配信日(scheduledAt)の季節を考慮する。
3. 在庫(stock)が少ない商品(50 未満)は避ける。やむを得ず選ぶときは、理由に在庫が少ないことを書く。
4. 同じ条件なら、売上トレンドが「上昇」の商品、レビュー評価が高い商品を優先する。売上トレンドが「下降」の商品は避ける。
5. 季節(season)が配信日の季節と合わない商品は避ける。「通年」はいつでも使える。
6. 理由(reason)は日本語。選定した商品は 60 文字以内、候補は 40 文字以内。

# 入力
${JSON.stringify({ card: { theme: '秋の新作ニット', country: 'JP', channel: 'email', scheduledAt: '2026-11-05' }, section: { title: 'ぬくもりニット', slots: 2 }, products: PRODUCTS })}`

const T5 = `${INTRO}下の「入力」の JSON を読み、メールの 1 つのセクションの「コピーの候補」を、JSON だけで返してください。

${FORMAT_HEAD}{"copies":[{"copy":"...","angle":"..."}]}
- copies は、切り口の異なるコピーの案を 3 つ。
${ERROR_RULE}- section.title(見出し)と section.productNames(選ばれた商品)がある場合は、それらを踏まえる。

# セクションのコピー(copies)のルール
1. 言語は language に従う('ja' は日本語、'en' は英語)。'auto' のときは card.country に合わせる(US は英語、JP は日本語)。
2. 長さは 30 文字前後(25〜35 文字。英語も文字数で数える)。1 文で。
3. 案どうしで、切り口を変える。angle には、その切り口を日本語 10 文字以内で書く。
4. 誇大な表現や、根拠のない断定(「最安値」「絶対」など)は使わない。

# 入力
${JSON.stringify({ language: 'auto', card: { theme: 'Fall knits', country: 'US', channel: 'email', scheduledAt: '2026-11-05' }, section: { title: 'Cozy Knits', productNames: ['Cable Knit Sweater', 'Mock Neck Sweater'] } })}`

export const T6 = `次の画像は、ファッション通販の商品の写真です。写真を見て、次の JSON だけを返してください。説明文や前置き、コードフェンスは付けない。
{"description":"写っている商品の説明(日本語 60 文字以内。写っていないことは書かない)","tags":["特徴を表す短い言葉を 3〜5 個"],"season":"春夏 / 秋冬 / 通年 のどれか 1 つ"}`

// ---- 確かめ。答えの文を受け取り、{ json: そのまま読めたか, fenced: 囲みを外せば読めたか, ok: 決まりを守ったか, notes: 守れなかった所 } を返す
const JA = /[぀-ヿ㐀-鿿]/
const len = (s) => [...String(s ?? '')].length

function parse(text) {
  const t = String(text ?? '').trim()
  try {
    return { obj: JSON.parse(t), json: true, fenced: true }
  } catch {
    const m = t.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return { obj: JSON.parse(m[0]), json: false, fenced: true }
      } catch {
        /* 読めない */
      }
    }
    return { obj: null, json: false, fenced: false }
  }
}

function judge(text, rules) {
  const p = parse(text)
  const notes = []
  if (!p.obj) notes.push('JSON として読めない')
  else rules(p.obj, notes)
  // 出典(Web の検索)が混ざっていないか
  if (/https?:\/\/|\[\d+\]/.test(String(text ?? '')) && !/^\s*\{[\s\S]*\}\s*$/.test(String(text ?? ''))) notes.push('出典・リンクらしきものが付いた')
  return { json: p.json, fenced: p.fenced, ok: notes.length === 0, notes }
}

export const TESTS = [
  {
    id: 'T1',
    name: '部品の文言の言い換え',
    runs: 3,
    prompt: T1,
    check: (text) =>
      judge(text, (o, n) => {
        if (o.mode !== 'update') n.push('mode が update でない')
        if (!Array.isArray(o.ideas) || o.ideas.length !== 3) n.push('ideas が 3 つでない')
        else if (o.ideas.some((i) => !i.text || !i.why)) n.push('text・why の欠け')
      }),
  },
  {
    id: 'T2',
    name: 'セクションの見出しの候補',
    runs: 1,
    prompt: titlesPrompt('秋の新作ニット'),
    check: (text) =>
      judge(text, (o, n) => {
        if (!Array.isArray(o.titles) || o.titles.length !== 3) return n.push('titles が 3 つでない')
        o.titles.forEach((t, i) => {
          if (len(t.title) > 12) n.push(`${i + 1} つ目の見出しが 12 文字を超えた(${len(t.title)})`)
          if (/重ね着/.test(t.title)) n.push(`${i + 1} つ目が otherSections の「重ね着」と重なった`)
          if (!t.reason || len(t.reason) > 40) n.push(`${i + 1} つ目の reason が空か 40 文字を超えた`)
        })
      }),
  },
  {
    id: 'T3',
    name: '商品の選定',
    runs: 3,
    prompt: T3,
    check: (text) =>
      judge(text, (o, n) => {
        if (!Array.isArray(o.products) || o.products.length === 0) return n.push('products がない')
        const codes = o.products.map((p) => p.code)
        const known = new Set(PRODUCTS.map((p) => p.code))
        if (codes.some((c) => !known.has(c))) n.push('入力にない code を作った')
        if (new Set(codes).size !== codes.length) n.push('code が重なった')
        if (o.products.length > 4) n.push('選定 2 + 候補 2 を超えた')
        const top = codes.slice(0, 2).sort().join(',')
        if (top !== 'P01,P04') n.push(`選定が P01・P04 でない(${codes.slice(0, 2).join('・')})`)
        if (codes.includes('P03')) n.push('季節の合わない P03 を選んだ')
        const p02 = o.products.find((p) => p.code === 'P02')
        if (p02 && !/在庫/.test(p02.reason ?? '')) n.push('P02 の理由に在庫が書かれていない')
      }),
  },
  {
    id: 'T4',
    name: '決まりどおりのエラー',
    runs: 1,
    prompt: titlesPrompt(''),
    check: (text) =>
      judge(text, (o, n) => {
        const keys = Object.keys(o)
        if (keys.length !== 1 || keys[0] !== 'error') n.push(`{"error":…} だけでない(${keys.join(',')})`)
      }),
  },
  {
    id: 'T5',
    name: '英語のコピー',
    runs: 1,
    prompt: T5,
    check: (text) =>
      judge(text, (o, n) => {
        if (!Array.isArray(o.copies) || o.copies.length !== 3) return n.push('copies が 3 つでない')
        o.copies.forEach((c, i) => {
          if (JA.test(c.copy ?? '')) n.push(`${i + 1} つ目のコピーが英語でない`)
          if (len(c.copy) < 25 || len(c.copy) > 35) n.push(`${i + 1} つ目のコピーが 25〜35 文字でない(${len(c.copy)})`)
          if (!JA.test(c.angle ?? '') || len(c.angle) > 10) n.push(`${i + 1} つ目の angle が日本語 10 文字以内でない`)
        })
      }),
  },
]

// T6 は画像を付けて送る。--image <ファイル> を渡したときだけ送る(TESTS には入れない)
export const T6_TEST = {
  id: 'T6',
  name: '画像の説明',
  runs: 1,
  prompt: T6,
  check: (text) =>
    judge(text, (o, n) => {
      if (!o.description || len(o.description) > 60) n.push('description が空か 60 文字を超えた')
      if (!Array.isArray(o.tags) || o.tags.length < 3 || o.tags.length > 5) n.push('tags が 3〜5 個でない')
      if (!['春夏', '秋冬', '通年'].includes(o.season)) n.push('season が 春夏 / 秋冬 / 通年 でない')
    }),
}

// 確かめの仕組みそのものを、つながずに試す見本の答え(node measure.mjs --self-test)
export const SAMPLES = {
  T1: ['{"mode":"update","reply":"短くしました","ideas":[{"text":"秋のニットで温もりを","why":"短く"},{"text":"肌寒い朝にニット","why":"場面"},{"text":"新作ニット、届きました","why":"新作"}]}', true],
  T2: ['```json\n{"titles":[{"title":"重ね着のニット","reason":"r"}]}\n```', false],
  T3: ['{"products":[{"code":"P01","reason":"在庫 420"},{"code":"P04","reason":"在庫 310"},{"code":"P02","reason":"在庫が 35 と少ない"},{"code":"P06","reason":"通年"}]}', true],
  T4: ['{"error":"テーマが空です"}', true],
  T5: ['{"copies":[{"copy":"Cozy knits for crisp fall mornings","angle":"朝の場面"},{"copy":"Soft cable knits, made to layer","angle":"重ね着"},{"copy":"Warm up your fall with new knits","angle":"新作"}]}', true],
}
