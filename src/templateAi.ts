// テンプレートを AI で作る(T9。設計は docs/TEMPLATE_OBJECTS.md の 9 章)・AI で直す(11 章)。AI の呼び出しは askAgent だけを通す(指示文は日本語)。
// 返答の検査と、表の形への直し方は templateDraft.ts(作る)・templateEdit.ts(直す)
import { askAgent } from './aiSelect'
import { tr } from './i18n'
import { parseTemplateDraft, type TemplateAiInput, type TemplateDraftOut } from './templateDraft'
import { layoutForAi, parseTemplateEdit, type EditableLayout, type TemplateEditOut } from './templateEdit'

const PROMPT = `あなたは、メールマガジンのテンプレートの構成を組み立てる担当です。入力の request(目的・商品の数・切り口・雰囲気)に合う、メールのテンプレートの構成を 1 つ考えてください。
決まり:
- メイン画像(ヒーロー)のあとに、セクションを 1〜5 個並べる。各セクションは表で、rows(行の配列)を持つ。行は部品の配列で、左から部品の幅 w(1〜4)を足して並べる。1 行の幅の合計は 4 以下。行は 1 セクションに 8 行まで。
- 部品の type と、持てる値:
  - box: 商品 1 点。view は card(写真 + 名前・価格)/ photo(写真だけ)/ detail(写真の横に説明。特集の 1 点に)/ story(写真と説明を左右交互)。fields は name・price・badge・desc・button・swatches・rating から選ぶ配列。badge はバッジの文言(12 字まで。NEW・SALE など)。aiNote は、この枠に置く商品の一言(例「主役の新作」)。
  - button: label は文言(12 字まで)。style は fill(塗り)・outline(枠線)・text(文字のリンク)。
  - text: text は固定の文(60 字まで)。
  - media: 画像(バナー)。alt は画像の説明。swap を true にすると、配信ごとに画像を差し替える。
  - line: 区切り線。spacer: 余白。
- box の数の合計を、request.itemCount にちょうど合わせる。
- セクションには name(呼び名。10 字まで)・heading(見出しを置くか。true / false)・copy(AI が配信ごとに書くコピーを置くか)・aiNote(このセクションに商品を選ぶ切り口)を付ける。
- hero は request.hero をそのまま使う。heroButton は、メイン画像のすぐ下のボタンの文言(要らなければ空)。
- name(テンプレートの名前。20 字まで)・description(どんな配信に向くか。60 字まで)・reason(この構成にした理由。80 字まで)。
- 商品の名前・価格の文字は書かない(商品のデータから出るため)。
返す JSON の形: {"name":"","description":"","hero":"standard","heroButton":"","sections":[{"name":"","heading":true,"copy":true,"aiNote":"","rows":[[{"type":"box","w":1,"view":"card","fields":["name","price"]}]]}],"reason":""}
入力: `

/** AI にテンプレートの構成を組み立ててもらい、検査した下書きを返す(読めない形なら、作り直しを促すエラー) */
export async function askTemplateDraft(input: TemplateAiInput): Promise<TemplateDraftOut> {
  const res = await askAgent(PROMPT, {
    task: 'design_template',
    request: { purpose: input.purpose.trim(), itemCount: input.itemCount, angle: input.angle.trim(), hero: input.hero },
  })
  const draft = parseTemplateDraft(res)
  if (!draft) throw new Error(tr('AI の返答を、テンプレートの形に直せませんでした。もう一度作ってください', 'Could not turn the AI answer into a template. Please try again.'))
  return draft
}

const EDIT_PROMPT = `あなたは、メールマガジンのテンプレートの構成を直す担当です。入力の template(今のテンプレートの形)を、入力の request(頼まれた直し)のとおりに直し、直したあとの形の全体を返してください。
template の形:
- heroTable はメイン画像のすぐ下の表、sections はその下のセクションの並び。どれも表で、cols(列 1〜4)・rows(行 0〜8)・parts(部品)を持つ。
- 部品は id・type・c(列)・r(行)・w(幅)・h(高さ)と、種類ごとの設定を持つ。c + w は cols 以下、r + h は rows 以下。部品どうしは重ねない。空いたマスは書かなくてよい。
- type: box(商品 1 点。view・fields・badge・priceStyle・aiNote など)/ button(label・style・color など)/ text(text)/ media(画像。alt・swap)/ line(区切り線)/ spacer(余白)。
- セクションは id・name・aiNote・categoryHeading(見出しを置く)・copy(false でコピーを置かない)・bg・space・evenRows なども持つ。
決まり:
- **残す部品・動かす部品・設定を変える部品は、id をそのまま書く。** id を付け直さない。新しく足す部品だけ、id を書かない。セクションも同じ(残すセクションは id をそのまま)。
- 頼まれていない所は変えない(設定・文言・並びをそのまま返す)。
- heroTable を変えないときは、heroTable を省いてよい。
- 商品の名前・価格の文字は書かない(商品のデータから出るため)。
- summary に、何を変えたかを 80 字までで書く。頼まれたことができないときは、形を変えずに返し、summary に理由を書く。
返す JSON の形: {"summary":"","heroTable":{"cols":1,"rows":1,"parts":[]},"sections":[{"id":"","name":"","cols":2,"rows":1,"parts":[{"id":"","type":"box","c":0,"r":0,"w":1,"h":1}]}]}
入力: `

/** 今のテンプレートへの直しを AI に頼み、検査した直したあとの形を返す(読めない形なら、頼み直しを促すエラー) */
export async function askTemplateEdit(request: string, before: EditableLayout): Promise<TemplateEditOut> {
  const res = await askAgent(EDIT_PROMPT, { task: 'edit_template', request: request.trim(), template: layoutForAi(before) })
  const out = parseTemplateEdit(res, before)
  if (!out) throw new Error(tr('AI の返答を、テンプレートの形に直せませんでした。もう一度頼んでください', 'Could not turn the AI answer into a template. Please ask again.'))
  return out
}
