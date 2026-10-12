// 撮影・デモ用の、AI エージェントの身代わり。実際の AI ではなく、依頼の内容(task、商品の一覧、チャットの指示)から、
// それらしい返答(JSON の文字列)を、決まった形で作る。AI の画面の撮影のためだけに使う。

type Obj = Record<string, unknown>
type ProductIn = { code: string; name: string; category?: string; price?: number; stock?: number; salesTrend?: string; rating?: number }
type HeroIn = { code: string; name: string; season?: string; purpose?: string }

const TREND_EN: Record<string, string> = { 上昇: 'rising', 横ばい: 'flat', 下降: 'falling' }
const hasJa = (s: string) => /[぀-ヿ㐀-鿿]/.test(s)

/** 依頼の文から、末尾の入力(JSON)を取り出す */
function payloadOf(message: string): Obj {
  const i = message.lastIndexOf('{"task":')
  if (i < 0) return {}
  try {
    return JSON.parse(message.slice(i)) as Obj
  } catch {
    return {}
  }
}

const J = (o: unknown) => JSON.stringify(o)

export function mockAgent(message: string): string {
  const p = payloadOf(message)
  const task = String(p.task ?? '')
  const en = message.includes('自然な英語で書くこと') // 画面が English のときの注意書き
  const card = (p.card ?? {}) as Obj
  const theme = String(card.theme ?? '')
  const chat = (p.chat as { role: string; text: string }[] | undefined) ?? []
  const last = chat.length > 0 ? chat[chat.length - 1].text : ''

  // チャットで、質問・相談のときは、案を変えずに、答えだけを返す
  if (chat.length > 0 && /[?？]|どう思|なぜ|why|what do you think|how about/i.test(last)) {
    return J({
      mode: 'answer',
      reply: hasJa(last)
        ? '全体として季節感と統一感がありますが、見出しの内容がやや重複しています。トップス中心に、軽めのニットやカーディガンを軸に再構成すると、より自然に秋の立ち上がりに合います。'
        : 'The lineup feels seasonal and cohesive, though two items overlap. Building around knits and a light cardigan would fit the early-fall mood more naturally.',
    })
  }
  const reply = (jaDefault: string, enDefault: string) => {
    if (chat.length === 0) return {}
    return { mode: 'update', reply: hasJa(last) ? jaDefault : enDefault }
  }

  if (task === 'suggest_themes') {
    return en
      ? J({ themes: [
          { theme: 'Layered Comfort for Crisp Days', reason: 'Early October brings cooler mornings; light jackets and knits are well stocked and trending up.' },
          { theme: 'Rain-Ready Chic for Autumn Streets', reason: 'Rain parkas, boots and totes have solid inventory and growing demand this season.' },
          { theme: 'Warm Textures to Welcome Fall', reason: 'Knits, blankets and loungewear are selling well and give a strong seasonal feel.' },
        ] })
      : J({ themes: [
          { theme: '季節の変わり目スタイル', reason: '10月初旬の寒暖差が大きく、在庫豊富な軽アウターとニットが好調なため。' },
          { theme: '雨の日も楽しむ秋支度', reason: 'レインパーカーやレインブーツの在庫が多く、雨具の需要が高まる時期。' },
          { theme: 'あたたか素材で、秋じたく', reason: 'ニットやブランケットの売れ行きが伸びており、季節感を出しやすい。' },
        ] })
  }

  if (task === 'suggest_copies') {
    const t = en ? theme || 'the season' : theme || '季節'
    void t
    return en
      ? J({ copies: [
          { headline: 'Embrace the Autumn Layers', lead: 'Discover cozy blends and structured essentials that redefine effortless warmth.', angle: 'Seasonal feel' },
          { headline: 'Style That Moves With Fall', lead: 'Transition seamlessly from chilly mornings to golden afternoons with soft, tailored comfort.', angle: 'Product appeal' },
          { headline: 'Find Your Perfect Fall Layer', lead: 'From trench to wool, explore new arrivals made to make every outing effortlessly stylish.', angle: 'Call to action' },
        ] })
      : J({ copies: [
          { headline: 'ぬくもりを纏う、秋', lead: '重ねるほどに表情が変わる、やさしい手ざわりの新作が届きました。', angle: '季節感' },
          { headline: '秋の主役は、ニット', lead: '上質な素材とこなれたシルエットで、いつもの装いを一歩先へ。', angle: '商品の魅力' },
          { headline: 'あなたの秋の一枚を', lead: '今季の新作から、お気に入りのレイヤーを見つけてください。', angle: '行動の呼びかけ' },
        ] })
  }

  if (task === 'suggest_tasks') {
    // 返信の文を、そのまま「やること」にする(撮影用の簡単な身代わり)
    const reply = String(p.reply ?? '')
    const asker = String(p.asker ?? '')
    const due = String((p.card as Obj | undefined)?.productionDue ?? '')
    const sentences = reply.split(/(?<=[.。!！])\s*/).map((s) => s.trim()).filter((s) => s.length > 3).slice(0, 2)
    return J({ tasks: sentences.map((s) => ({ text: (en ? 'Apply: ' : '反映: ') + s.replace(/[.。]$/, ''), assignee: asker, due })) })
  }

  if (task === 'suggest_instructions') {
    // 制作指示は、見出し(###)と箇条書きの Markdown(aiDraft.ts の指示と同じ形)
    return en
      ? J({ instructions: [
          { text: '### Layout\n- Full-width hero, then 4 products in a 2×2 grid\n- Generous white space between blocks\n### Main image\n- Autumn outfit, natural light, full look\n### Color & tone\n- Warm brown to terracotta; quiet dark buttons\n### Products\n- Lead with the light jacket; short notes under each\n### Buttons & notes\n- One "Shop now" under the hero; keep prices visible', angle: 'Classic layout' },
          { text: '### Layout\n- Larger product images, minimal text\n### Main image\n- Close crop that shows the knit texture\n### Color & tone\n- Soft beige background, muted accents\n### Products\n- Let materials speak; one line per product\n### Buttons & notes\n- Outline buttons; avoid sale-style red', angle: 'Product first' },
          { text: '### Layout\n- Story flow: hero, then layered outfits\n### Main image\n- Golden-hour street scene\n### Color & tone\n- Warm neutrals with gold accents\n### Products\n- Show items as part of complete outfits\n### Buttons & notes\n- Refined, spacious typography', angle: 'Mood-driven' },
        ] })
      : J({ instructions: [
          { text: '### レイアウト\n- メインビジュアルを全幅、その下に商品 4 点を 2×2 のグリッド\n- ブロックの間の余白を多めに取る\n### メイン画像\n- 秋のコーディネートを、自然光で全身\n### 色とトーン\n- ブラウン〜テラコッタの温かみ。ボタンは落ち着いた濃色\n### 商品の見せ方\n- ライトジャケットを先頭に。各商品に短い説明\n### ボタン・注意点\n- メイン画像の下に「商品を見る」を 1 つ。価格は必ず見せる', angle: '王道構成' },
          { text: '### レイアウト\n- 商品画像を大きめに、文字は控えめ\n### メイン画像\n- ニットの質感が分かる寄りのクロップ\n### 色とトーン\n- 淡いベージュの背景、差し色は控えめ\n### 商品の見せ方\n- 素材の魅力を前面に。説明は 1 行\n### ボタン・注意点\n- 枠線のボタン。セール調の赤は使わない', angle: '商品を主役に' },
          { text: '### レイアウト\n- 物語の流れ: メインビジュアル → 重ね着のコーディネート\n### メイン画像\n- 夕暮れの街角\n### 色とトーン\n- 温かみのある中間色に、ゴールドの差し色\n### 商品の見せ方\n- 単品ではなく、コーディネートの一部として見せる\n### ボタン・注意点\n- 上品で、余白のあるタイポグラフィ', angle: '世界観重視' },
        ] })
  }

  if (task === 'suggest_template') {
    return en
      ? J({ template: 'cat2', reason: 'The theme calls for two angles (outerwear and knits) shown side by side.' })
      : J({ template: 'cat2', reason: '複数の切り口(アウターとニット)を並べて見せたいテーマのため。' })
  }

  if (task === 'select_hero') {
    const heroes = (p.heroes as HeroIn[] | undefined) ?? []
    const fall = heroes.filter((h) => /秋|fall|autumn/i.test(String(h.season ?? '')) || /new|新作/i.test(String(h.purpose ?? '')))
    const list = [...fall, ...heroes.filter((h) => !fall.includes(h))]
    const pick = list[0]
    if (!pick) return J({ hero: null, candidates: [] })
    return J({
      hero: { code: pick.code, reason: en ? `Fits the theme and the fall season: ${pick.name}.` : `テーマと秋の季節感に合う画像です(${pick.name})。` },
      candidates: list.slice(1, 4).map((h) => ({ code: h.code, reason: en ? `Alternative with a similar mood: ${h.name}.` : `近い雰囲気の候補です(${h.name})。` })),
    })
  }

  if (task.startsWith('select_section')) {
    const pool = ((p.products as ProductIn[] | undefined) ?? []).filter((x) => (x.stock ?? 0) >= 50)
    const section = (p.section ?? {}) as Obj
    const slots = Number(section.slots) || 4
    const others = (p.otherSections as Obj[] | undefined) ?? []
    const idx = others.filter((o) => Array.isArray(o.productNames) && (o.productNames as unknown[]).length > 0).length
    const wantTitle = Boolean(section.wantTitle)

    // 指示(チャット)に、商品名が入っていれば、先頭にする。「安い・affordable」なら、価格の安い順
    let ranked = [...pool].sort((a, b) => (a.salesTrend === '上昇' ? 0 : 1) - (b.salesTrend === '上昇' ? 0 : 1) || (b.rating ?? 0) - (a.rating ?? 0))
    if (/安|手頃|affordable|cheap/i.test(last)) ranked = [...pool].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    if (wantTitle && !last) {
      const cats = ['アウター', 'トップス', 'ボトムス', 'シューズ']
      const cat = cats[idx % cats.length]
      ranked = [...ranked.filter((x) => x.category === cat), ...ranked.filter((x) => x.category !== cat)]
    }
    const named = pool.find((x) => last && (last.toLowerCase().includes(x.name.toLowerCase()) || last.toLowerCase().includes(x.code.toLowerCase())))
    if (named) ranked = [named, ...ranked.filter((x) => x !== named)]

    const why = (x: ProductIn) =>
      en
        ? `Stock ${x.stock}, sales ${TREND_EN[x.salesTrend ?? ''] ?? 'flat'}, rating ★${x.rating}; fits "${theme || 'this story'}".`
        : `在庫${x.stock}、売上トレンド${x.salesTrend ?? '横ばい'}、評価★${x.rating}。「${theme || 'このテーマ'}」に合う${x.category ?? '商品'}です。`
    const products = ranked.slice(0, slots + 3).map((x) => ({ code: x.code, reason: why(x) }))

    const titlesJa = [
      { title: '重ねて楽しむ、秋のアウター', reason: 'アウターを軸にした切り口。' },
      { title: 'ニットで作る、秋の定番', reason: 'ニットを軸にした切り口。' },
      { title: '雨の日の、秋支度', reason: '雨具を軸にした切り口。' },
    ]
    const titlesEn = [
      { title: 'Outer Layers for Crisp Days', reason: 'An outerwear-led angle.' },
      { title: 'Knits That Layer Well', reason: 'A knit-led angle.' },
      { title: 'Rain-Ready Fall Picks', reason: 'A rainwear-led angle.' },
    ]
    const rot = <T,>(a: T[]) => [...a.slice(idx % a.length), ...a.slice(0, idx % a.length)]
    const used = new Set(others.map((o) => String(o.title ?? '')))
    const all = rot(en ? titlesEn : titlesJa)
    const titles = wantTitle ? [...all.filter((x) => !used.has(x.title)), ...all.filter((x) => used.has(x.title))] : []
    const copies = en
      ? [
          { copy: 'Find comfort and polish in layers that welcome the crisp fall breeze.', angle: 'Refined seasonal layering' },
          { copy: 'Warm up gently with soft textures and subtle tones for early autumn days.', angle: 'Cozy transitional style' },
          { copy: 'Easy pieces that carry you from chilly mornings to golden afternoons.', angle: 'Classy fall versatility' },
        ]
      : [
          { copy: '涼やかな秋風にぴったりの、上品な重ね着を。', angle: '上品な季節の重ね着' },
          { copy: 'やわらかな素材と穏やかな色で、秋のはじめをあたたかく。', angle: 'ほっとする移行期の装い' },
          { copy: '朝の肌寒さから午後のやわらかな日ざしまで、ずっと心地よく。', angle: '一日中使える万能さ' },
        ]

    const r = reply(
      named ? `ご指定の「${named.name}」を先頭に含めて、選び直しました。` : '指示を反映して、選び直しました。',
      named ? `Included "${named.name}" first and re-selected this section.` : 'Re-selected this section with your instruction applied.',
    )
    if (task === 'select_section_titles') return J({ titles, ...r })
    if (task === 'select_section_copies') return J({ copies, ...r })
    if (task === 'select_section_products') return J({ products, ...r })
    return J({ titles, copies, products, ...r })
  }

  return J({ error: 'mock agent: unknown task' })
}
