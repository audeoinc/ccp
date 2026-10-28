import type { DeliveryCardEmailTemplate } from './models/deliveryCards'
// メールのテンプレート。ヒーロー(上部)の種類と、商品を並べる枠(セクション)で定義する。
// 掲載商品は並び順に、上のセクションの枠から順に流し込む。
//
// テンプレートは、「標準」(コードに持つ。常に使える。編集不可)と、「ユーザーが作ったもの」(データベースに保存)の登録型。
// ユーザーが作ったテンプレートの ID は、表 layout_templates の行の ID。配信カードは、この ID(layout_key)で、テンプレートを指す。

import { useSyncExternalStore } from 'react'
import { appliesIn } from './countryApply'
import { tr } from './i18n'
import { cellRows, cellViewLabel, type Cell, type CellView } from './cells'

/** 標準のテンプレートは 'free' | 'standard4' | 'collab' | 'offer' | 'cat2' | 'cat3'。ユーザーが作ったものは、行の ID */
export type EmailTemplateId = string

export type HeroKind = 'standard' | 'collab' | 'offer'

/**
 * ヒーローの細かい見た目(T8 の 8.6)。どれも省略は、以前の見た目(帯は下・左、大きく重ねるは中央、写真の下は中央)。
 * ratio: 写真の形 / v・h: ヘッドラインの位置(帯は上か下、大きく重ねるは 9 か所、写真の下は左右だけ)/
 * color: 文字の色(light 白・dark 黒)/ shade: 写真に重ねる暗さ(0 なし〜3 濃く)/ barText: お知らせの帯の文言(空は配信名)
 */
export interface HeroStyle {
  ratio?: MediaRatio
  v?: 'top' | 'middle' | 'bottom'
  h?: 'left' | 'center' | 'right'
  color?: 'light' | 'dark'
  shade?: 0 | 1 | 2 | 3
  barText?: string
}

/** ヘッドラインの見せ方。band: 写真の下部に帯で重ねる / overlay: 写真の中央に大きく重ねる / below: 写真の下に置く */
export type HeroText = 'band' | 'overlay' | 'below'

/**
 * セクション(商品を並べる部品)の種類。
 * grid: 名前・価格つきのグリッド / photos: 写真だけのタイル / wide: 全幅で大きく 1 点ずつ /
 * mosaic: 大きい 1 点 + 小さい 2 点(3 点で 1 組) / story: 写真と文を左右交互に / feature: 写真の横に説明を置く特集枠 /
 * cells: 箱(マス目の列・行と、枠の置き方を自由に決める。いくつかのマスを 1 つの枠にまとめられ、見せ方も選べる。枠の形は cells.ts)
 * table: 表(T8。列 1〜4 × 行 1〜8 のマスに、箱・ボタン・テキスト・空きの部品を敷き詰める。部品ごとに ID を持つ。操作は tables.ts)。
 *   テンプレートの編集画面は、この形だけで編集する(以前の種類は、開いたときに表に直す)
 */
export type SectionKind = 'grid' | 'photos' | 'wide' | 'mosaic' | 'story' | 'feature' | 'cells' | 'table'
export const SECTION_KINDS: SectionKind[] = ['grid', 'photos', 'wide', 'mosaic', 'story', 'feature', 'cells', 'table']

/** 表の部品の種類。箱 = 商品 1 点。media = 画像・動画(バナー・タイル・アイコン。動画は、メールではサムネイル + ▶ で動画のページへ) */
export type PartType = 'box' | 'button' | 'text' | 'media' | 'line' | 'spacer' | 'empty'

/** 写真・画像の形(縦:横)。square 1:1 / portrait 3:4 / landscape 4:3 / wide 2:1 */
export type MediaRatio = 'square' | 'portrait' | 'landscape' | 'wide'
export const MEDIA_RATIOS: MediaRatio[] = ['square', 'portrait', 'landscape', 'wide']
/** 形の、横 / 縦 */
export const ratioValue = (r: MediaRatio): number => ({ square: 1, portrait: 3 / 4, landscape: 4 / 3, wide: 2 })[r]

/** ボタンの色(tables.ts の BUTTON_COLORS) */
export type ButtonColor = 'black' | 'red' | 'navy' | 'green' | 'gray'

/** 文字の揃え */
export type TextAlign = 'left' | 'center' | 'right'

/** 箱に出すもの(写真のほか)。名前・価格は商品のデータから出す(テンプレートでは文言を打たない。値段の食い違いを防ぐため) */
/** 箱に出すもの。swatches: カラーチップ(SKU の色)/ rating: レビュー(星・平均点・件数)。T8 の 8.5 */
export type BoxField = 'name' | 'price' | 'badge' | 'desc' | 'button' | 'swatches' | 'rating'
export const BOX_FIELDS: BoxField[] = ['name', 'price', 'swatches', 'rating', 'badge', 'desc', 'button']
/**
 * 箱の「出すもの」(名前・価格・カラーチップ・レビュー・説明・ボタン)の置き場所(T12。2026-10-27)。
 * below: 写真の下 / top・middle・bottom: 写真に重ねる(上・中央・下)/ left・right: 写真の横(文をその側に)。バッジは、いつも写真の左上。
 * 箱ごとにまとめて持つ(要素ごとに持つときは、els の要素ごとの値として足せる形)
 */
export type BoxPlace = 'below' | 'top' | 'middle' | 'bottom' | 'left' | 'right'
export const BOX_PLACES: BoxPlace[] = ['below', 'top', 'middle', 'bottom', 'left', 'right']

/**
 * 表の部品(マス)。列 c・行 r(0 から)に置き、横 w・縦 h マス分を使う(結合したマスも 1 つの部品)。
 * id は、動かしても・中身の設定を変えても・版が変わっても同じ。形が変わったら(結合・分割・種類の変更・複製)新しい ID にする
 * (コメント・成績を、条件の違う部品と混ぜないため。docs/TEMPLATE_OBJECTS.md の 2.2)
 */
/** 要素ごとの設定(どれも省略は既定) */
export interface ElementSpec {
  /** 説明(空なら場所から自動。例「S1 箱 1 の写真」) */
  desc?: string
  /** 押せる(メールの中でリンクになる)か。省略は要素の既定(写真・名前・ボタンは押せる) */
  click?: boolean
}

export interface TablePart {
  id: string
  type: PartType
  c: number
  r: number
  w: number
  h: number
  /** 部品の説明(人が読むため。任意で、空なら場所から自動。分析・UTM の対応表・制作への指示に出す。T8 の 8.4) */
  desc?: string
  /** 要素ごとの設定(キーは要素の名前 image / name / price …。要素の ID は「部品 ID.要素の名前」。elements.ts) */
  els?: Record<string, ElementSpec>
  /** 区切り線: 太さ(px。省略は 1。T8 の 8.9) */
  lineWidth?: 2 | 4
  /** 区切り線: 色(省略は薄いグレー。受信側の見た目なので決まった色から。tables.ts の LINE_COLORS) */
  lineColor?: 'gray' | 'black'
  /** 区切り線: true のとき、真ん中だけの短い線(省略は全幅) */
  lineShort?: boolean
  /** 区切り線: 上下の余白(省略はふつう) */
  lineSpace?: 'tight' | 'wide'
  /** 余白: 高さ(px。省略は 24) */
  height?: number
  /** テキスト・ボタン・画像: 枠で囲む(クーポンの番号・注意書きなど。省略は囲まない) */
  frame?: 'solid' | 'dashed'
  /** 均等の行: 部品の間に縦の区切り線(WOMEN | MEN | KIDS)。行の中のどれかに付いていれば、その行に引く(行を足し引きしても番号がずれないよう、部品に持つ) */
  sep?: boolean
  /** 箱: 見せ方(省略は card) */
  view?: CellView
  /** 箱: AI に伝える一言(この枠に、どんな商品を置くか) */
  aiNote?: string
  /** 箱: 出すもの(省略は、見せ方の既定。tables.ts の boxFields) */
  fields?: BoxField[]
  /** 箱: 価格の見せ方(省略はふつう)。sale: 元の価格(商品の regular_price)に取り消し線 + 赤い価格 / from: 「〜から」 */
  priceStyle?: 'sale' | 'from'
  /** 箱: バッジの文言(出すものに badge があるとき。空は NEW) */
  badge?: string
  /** 箱: カラーチップの形(省略は丸) */
  swatchShape?: 'square'
  /** 箱: カラーチップを並べる数の上限(超えた分は「+3」。省略は 5) */
  swatchMax?: number
  /** 箱: 名前・価格などの置き場所(T12。省略は見せ方から決まる場所。tables.ts の boxPlace) */
  place?: BoxPlace
  /** 箱: レビューの見せ方(省略は 星・平均点・件数のすべて) */
  ratingShow?: 'stars' | 'starsCount'
  /** 箱: レビューの件数がこれより少ない商品では、レビューを出さない(省略は 3) */
  ratingMin?: number
  /** 箱: 平均点がこれより低い商品では、レビューを出さない(省略は、点では隠さない) */
  ratingFloor?: number
  /** ボタン: 文言(空は、既定の文言) */
  label?: string
  /** ボタン: 見た目(省略は fill)。text: 文字のリンク(WOMEN / MEN のような、枠のない文字) */
  style?: 'fill' | 'outline' | 'text'
  /** ボタン: 色(決まった色から選ぶ。ブランドの見た目をそろえるため、自由な色は持たない。省略は黒。期間限定のヒーローでは赤) */
  color?: ButtonColor
  /** ボタン: 形(省略は丸 pill)。rounded 角丸 / square 四角 / underline 下線だけの文字(T8 の 8.7) */
  shape?: 'rounded' | 'square' | 'underline'
  /** ボタン: 大きさ(省略は中) */
  size?: 'small' | 'large'
  /** ボタン: true のとき、幅を文字に合わせる(省略はマスいっぱい) */
  fit?: boolean
  /** ボタン: 矢印(›)を文字の右・左に付ける(省略はなし) */
  icon?: 'right' | 'left'
  /** ボタン: 画像のボタン。image 画像だけ / both 画像の上に文字(省略は文字だけ)。画像は src・imageId・alt を使う */
  face?: 'image' | 'both'
  /** ボタン・画像: リンク先の種類(省略は campaign) */
  link?: LinkKind
  /** ボタン・画像: 計測用の名前(クリックの集計で使う) */
  track?: string
  /** テキスト: 固定の文 */
  text?: string
  /**
   * テキスト: 向き(T8 の 8.8。省略は横)。vertical: 縦書き(1 文字ずつ上から下)/ rotate: 90 度回す(英字を横倒しで、上から下へ)。
   * Gmail・Outlook などは縦の書き方に対応していないことが多いので、制作には「この文字は画像にする」の印を渡す
   */
  dir?: 'vertical' | 'rotate'
  /** テキスト・ボタン: false のとき、文(ボタンは文言)を配信ごとに書き換えない(省略は書き換えてよい) */
  overridable?: boolean
  /** テキスト・ボタン: 揃え(省略は、テキストは左・ボタンは中央) */
  align?: TextAlign
  /** 箱・画像: 写真・画像の形(省略は、箱は縦長 portrait・写真だけの箱はマスの形・画像は横長 wide) */
  ratio?: MediaRatio
  /** 画像・画像のボタン: 画像の URL(部品の画像のライブラリから選ぶと、その URL が入る) */
  src?: string
  /** 画像: 部品の画像のライブラリの ID(どの画像を使ったかの記録) */
  imageId?: string
  /** 画像: 動画の URL。あると動画として扱い、メールでは src をサムネイルにして ▶ を重ね、押すと動画へ */
  video?: string
  /** 画像: 画像が出ないときの文(代わりの文) */
  alt?: string
  /**
   * 画像: true のとき、配信ごとに差し替える(キャンペーンのバナーなど。省略はテンプレートの画像のまま)。
   * ボタンの画像は逆で、省略は差し替えてよい・false のとき、テンプレートの画像のまま(8.7)
   */
  swap?: boolean
}

/** セクションの背景の色(受信側の見た目なので、メールの中の色は固定。tables.ts の SECTION_BG) */
export type SectionBg = 'gray' | 'beige' | 'blue' | 'pink'

export interface Section {
  kind: SectionKind
  /** 表: セクションの ID(sec_…)。以前の種類を表に直したときは、順番から決めた ID */
  id?: string
  /** 表: 画面の呼び名(任意。キャンバスの札・構成の一覧に出す) */
  name?: string
  /** 表: AI の切り口のメモ(商品を選ぶ・見出しを書くときに渡す) */
  aiNote?: string
  /** 表: 行の数(0 は、まだ最初の行を作っていない) */
  rows?: number
  /**
   * 表: 均等に並べる行の番号(0 から)。その行は、列に合わせず、中身のある部品を同じ幅で並べる
   * (例: 3 列の表の下に、ボタン 2 つを半分ずつ。2026-10-23 利用者と決めた)。縦に結合した部品がかかる行には付けない
   */
  evenRows?: number[]
  /** 表: スマホでの並び方。stack: 縦に積む(上の行から、同じ行は左から)。省略は、列のまま縮める */
  mobile?: 'stack'
  /** 表: 背景の色(薄い色から選ぶ。省略は白) */
  bg?: SectionBg
  /** 表: 上下の余白(省略はふつう) */
  space?: 'tight' | 'wide'
  /** 表: セクションの上に区切り線を引く */
  divider?: boolean
  /** 表: 部品(すき間なく敷き詰める)。商品の載る順は、上の行から・同じ行は左から(tables.ts の boxesOf) */
  parts?: TablePart[]
  slots: number
  /** grid・photos の列の数(省略は 2) */
  columns?: 2 | 3
  /** mosaic: 大きい枠を右に置く */
  flip?: boolean
  /** cells・table: マス目の列の数(1〜4) */
  cols?: number
  /** cells: 枠の並び(配列の順が商品の載る順)。枠の数 slots は、この数と同じ */
  cells?: Cell[]
  /** cells: 箱の中の見せ方(省略は card = 写真 + 名前・価格) */
  view?: CellView
  /** true のとき、セクションに見出しを付ける(AI が文言を作る。名前は、以前のデータとの互換のため) */
  categoryHeading?: boolean
  /** false のとき、セクションのコピーを置かない(省略は置く。以前のテンプレートは、すべてコピーあり) */
  copy?: boolean
  /**
   * セクションの後に置くボタンの数(以前の形。読むだけ)。
   * 今は、ボタンは独立した部品(ButtonBlock)。管理画面で開くと、部品に置き換える
   */
  buttons?: 1 | 2
}

/**
 * リンク先の種類。テンプレートには種類(既定値)だけを持ち、実際の URL は、配信カードで決める(src/links.ts。制作指示のタブ)。
 * campaign: その配信のページ / category: セクションのカテゴリのページ / top: ショップのトップ / custom: 配信カードで個別に指定
 */
export type LinkKind = 'campaign' | 'category' | 'top' | 'custom'
export const LINK_KINDS: LinkKind[] = ['campaign', 'category', 'top', 'custom']

export function linkKindLabel(kind: LinkKind): string {
  switch (kind) {
    case 'category':
      return tr('カテゴリのページ', 'Category page')
    case 'top':
      return tr('ショップのトップ', 'Shop top page')
    case 'custom':
      return tr('配信カードで指定', 'Set on the card')
    default:
      return tr('配信のページ', 'Campaign page')
  }
}

export interface ButtonSpec {
  /**
   * テンプレートの中で変わらない ID。配信カードで、ボタンごとの URL を持つときの鍵にする
   * (文言や位置を変えても、設定した URL が外れないように)
   */
  id: string
  /** 文言(空は、既定の文言) */
  label?: string
  /** fill: 塗り / outline: 枠線(省略は fill) */
  style?: 'fill' | 'outline'
  /** リンク先の種類(省略は campaign) */
  link?: LinkKind
}

/** 独立したボタンの部品。at = その前にあるセクションの数(0 はヒーローの直後、セクションの数と同じなら最後) */
export interface ButtonBlock {
  at: number
  buttons: ButtonSpec[]
}

/** 1 つの部品に並べるボタンの上限(メールの幅で、読める数) */
export const MAX_BUTTONS_PER_BLOCK = 2

export const newButtonId = () => `b${Math.random().toString(36).slice(2, 10)}`

/** 文言が空のボタンの、既定の文言(並びの位置で決める。以前のボタンと同じ文言) */
export const defaultButtonLabel = (i: number) => (i === 0 ? tr('商品を見る', 'Shop now') : tr('もっと見る', 'See more'))

/**
 * 置く位置ごとのボタン。以前の形(ヒーローのボタンの数、セクションの後のボタンの数)も、同じ形に直して返す。
 * 以前の形のボタンの ID は、位置から決める(同じテンプレートなら、いつも同じ ID になる)
 */
export function placedButtons(layout: TemplateLayout): ButtonBlock[] {
  const legacy = (n: number | undefined, style: ButtonSpec['style'], prefix: string): ButtonSpec[] =>
    Array.from({ length: n ?? 0 }, (_, i) => ({ id: `${prefix}-${i + 1}`, style }))
  const blocks: ButtonBlock[] = []
  if (layout.heroButtons) blocks.push({ at: 0, buttons: legacy(layout.heroButtons, 'fill', 'hero') })
  layout.sections.forEach((sec, i) => {
    if (sec.buttons) blocks.push({ at: i + 1, buttons: legacy(sec.buttons, 'outline', `s${i + 1}`) })
  })
  blocks.push(...(layout.buttonBlocks ?? []))
  // 同じ位置では、以前の形のボタンを先に置く(並べ替えても、並びの順は保つ)
  return blocks.map((b, i) => ({ b, i })).sort((x, y) => x.b.at - y.b.at || x.i - y.i).map((x) => x.b)
}

/** 位置 at(0 はヒーローの直後、i はセクション i の後)に置くボタンを、1 つの部品ごとに返す(範囲外の位置は、端に寄せる) */
export const buttonsAt = (blocks: ButtonBlock[], at: number, sectionCount: number): ButtonSpec[][] =>
  blocks.filter((b) => Math.max(0, Math.min(b.at, sectionCount)) === at).map((b) => b.buttons)

/** グリッド・写真タイルの列の数(以前のテンプレートや、列を持たない種類は 2 として扱う) */
export const gridColumns = (sec: Section): 2 | 3 => ((sec.kind === 'grid' || sec.kind === 'photos') && sec.columns === 3 ? 3 : 2)

/** 枠の数の刻み。モザイクは 3 点で 1 組なので、3 の倍数にする */
export const slotStep = (kind: SectionKind): number => (kind === 'mosaic' ? 3 : 1)

/** セクションの種類の表示名(テンプレートの管理画面、構成の説明に使う) */
export function sectionKindLabel(sec: Section): string {
  switch (sec.kind) {
    case 'photos':
      return tr(`写真だけ(${gridColumns(sec)}列)`, `Photos only (${gridColumns(sec)} col)`)
    case 'wide':
      return tr('大きく(全幅)', 'Large (full width)')
    case 'mosaic':
      return sec.flip ? tr('モザイク(右が大)', 'Mosaic (large right)') : tr('モザイク(左が大)', 'Mosaic (large left)')
    case 'story':
      return tr('ストーリー(写真 + 文)', 'Story (photo + text)')
    case 'feature':
      return tr('特集', 'Feature')
    case 'cells':
      return `${tr('箱', 'Box')}(${sec.cols ?? 2} × ${cellRows(sec.cells ?? [])}${sec.view && sec.view !== 'card' ? tr('・', ', ') + cellViewLabel(sec.view) : ''})`
    case 'table':
      return `${tr('表', 'Table')}(${sec.cols ?? 1} × ${sec.rows ?? 0})`
    default:
      return tr(`グリッド(${gridColumns(sec)}列)`, `Grid (${gridColumns(sec)} col)`)
  }
}

/** テンプレートのチャネル。配信カードはチャネルごとに作るので、テンプレートも、そのチャネルのものだけを選ぶ */
export type TemplateChannel = 'email' | 'push'

/** アプリ(プッシュ通知)のテンプレートの中身 */
export interface PushSpec {
  /** 通知に画像を付ける。画像は、メッセージのメイン画像(通知と、開いたメッセージの見た目をつなげるため) */
  image: boolean
  /** 通知のボタン(アクション)の文言。空なら、ボタンなし */
  buttons: string[]
}

export interface EmailTemplate {
  label: string
  description: string
  /** チャネル(省略はメール。以前のテンプレートは、すべてメール) */
  channel?: TemplateChannel
  /** アプリのテンプレートだけ: 通知の中身 */
  push?: PushSpec
  hero: HeroKind
  /** ヘッドラインの見せ方(省略は band。以前のテンプレートと同じ見た目) */
  heroText?: HeroText
  /** ヒーローの下に置くボタンの数(省略は 0。以前の形。今は、位置 0 の ButtonBlock で表す) */
  heroButtons?: 0 | 1 | 2
  /** ヒーローの細かい見た目(T8 の 8.6。省略は以前の見た目) */
  heroStyle?: HeroStyle
  /** メールの最上部に、お知らせの帯を置く */
  topBar?: boolean
  /** メイン画像のリンク先の種類(省略は campaign) */
  heroLink?: LinkKind
  sections: Section[]
  /**
   * ヒーローのすぐ下の表(T8 の 8.1・8.6。ID は sec_hero)。ボタン・テキスト・画像を置く(箱は置かない)。
   * セクションの並び(sections)には入れない: 配信カードの見出し・コピーはセクションの番号で持つので、番号をずらさないため
   */
  heroTable?: Section
  /** 独立したボタンの部品(セクションとは別に持つ。商品の枠の位置の計算に関わらないように) */
  buttonBlocks?: ButtonBlock[]
  /** 標準のテンプレート(コードに持つもの。編集すると、上書きの行で置き換わる) */
  builtin: boolean
  /** 標準を編集した(上書きの行がある)。「最初の形に戻す」で、上書きの行を消す */
  edited?: boolean
  /** 上書きの行・作成したテンプレートの行の ID(標準のままなら、ない) */
  rowId?: string
  /** 版の番号(いまの版。過去の版の登録では、その版の番号) */
  version?: number
  /** 過去の版の登録のとき: もとのテンプレートの ID(一覧には出さない。配信カードが、使った版として引く) */
  versionOf?: string
  /** 過去の版のとき: 変更のメモ・保存した人・保存した日時 */
  note?: string
  author?: string
  savedAt?: string
  /** 非表示(配信カードの選択肢に出さない。使っている配信は、そのまま) */
  hidden?: boolean
}

/** 構成の見た目に関わる部分(見取り図、プレビュー、編集中の内容で共通に使う) */
export type TemplateLayout = Pick<EmailTemplate, 'hero' | 'heroText' | 'heroButtons' | 'topBar' | 'heroLink' | 'sections' | 'buttonBlocks' | 'heroTable' | 'heroStyle'>

// ---- 標準のテンプレート ----

const BUILTIN: Record<string, EmailTemplate> = {
  free: {
    get label() {
      // 枠の数・形が決まっていないことと、見出しが付くことを、名前で分かるように(2026-10-21 利用者の指摘)
      return tr('自由に並べる(カテゴリごとに見出し)', 'Free order (heading per category)')
    },
    get description() {
      return tr(
        '商品の数を決めずに、2 列で並べる。同じカテゴリが続く所に、カテゴリ名の見出しを自動で付ける。点数が毎回変わる配信(新作まとめ・セール対象の一覧など)に。',
        'Products in two columns, any number. A category heading is added wherever the category changes. For deliveries whose item count varies (new-arrivals roundups, sale lists).',
      )
    },
    hero: 'standard',
    sections: [],
    builtin: true,
  },
  standard4: {
    label: 'Standard Hero + 4 Grid Items',
    get description() {
      return tr('メイン画像 + 2×2 の商品グリッド(4 点)。基本の構成です。', 'Main image + a 2x2 product grid (4 items). The basic layout.')
    },
    hero: 'standard',
    heroText: 'below',
    heroButtons: 1,
    sections: [{ kind: 'grid', slots: 4, buttons: 1 }],
    builtin: true,
  },
  collab: {
    label: 'Collaboration Hero + 2 Features + 2 Grid',
    get description() {
      return tr('コラボ用のヒーロー + 特集の商品 2 点 + グリッド 2 点(計 4 点)。', 'Collab hero + 2 featured products + 2 grid items (4 in total).')
    },
    hero: 'collab',
    heroButtons: 1,
    sections: [
      { kind: 'feature', slots: 2 },
      { kind: 'grid', slots: 2, buttons: 1 },
    ],
    builtin: true,
  },
  offer: {
    label: 'Price: Limited Offer & Value Hero',
    get description() {
      return tr('期間限定・お得感を打ち出す赤基調のヒーロー + 価格を強調した 4 点。', 'A red-toned hero for limited-time deals + 4 items with emphasized prices.')
    },
    hero: 'offer',
    heroText: 'overlay',
    heroButtons: 2,
    topBar: true,
    sections: [{ kind: 'grid', slots: 4, buttons: 2 }],
    builtin: true,
  },
  cat2: {
    label: 'Standard Hero + 2 Category (2 items each)',
    get description() {
      return tr('メイン画像 + カテゴリ 2 つ(各 2 点、計 4 点)。カテゴリごとに見出しが付きます。', 'Main image + 2 categories (2 items each, 4 in total). Each category gets a heading.')
    },
    hero: 'standard',
    heroText: 'below',
    heroButtons: 2,
    sections: [
      { kind: 'grid', slots: 2, categoryHeading: true },
      { kind: 'grid', slots: 2, categoryHeading: true, buttons: 2 },
    ],
    builtin: true,
  },
  cat3: {
    label: 'Standard Hero + 3 Category (2 items each)',
    get description() {
      return tr('メイン画像 + カテゴリ 3 つ(各 2 点、計 6 点)。カテゴリごとに見出しが付きます。', 'Main image + 3 categories (2 items each, 6 in total). Each category gets a heading.')
    },
    hero: 'standard',
    heroText: 'below',
    heroButtons: 2,
    sections: [
      { kind: 'grid', slots: 2, categoryHeading: true },
      { kind: 'grid', slots: 2, categoryHeading: true },
      { kind: 'grid', slots: 2, categoryHeading: true, buttons: 2 },
    ],
    builtin: true,
  },
  // ---- 新しい部品を使う標準(以前の選択肢の列に値がないので、配信カードは layoutkey だけで指す)
  sale: {
    get label() {
      return tr('セール(大きく 1 点 + グリッド)', 'Sale (large single + grid)')
    },
    get description() {
      return tr(
        'お知らせ帯と、文字を大きく重ねたヒーロー。目玉の商品を大きく見せ、2 列のグリッドと交互に並べ、最後に写真だけのタイルで「ほかにも」を見せます(計 12 点)。',
        'A top bar and a hero with large overlaid text. Large picks alternate with 2-column grids, ending with a photo tile "more to love" block (12 items).',
      )
    },
    hero: 'offer',
    heroText: 'overlay',
    heroButtons: 2,
    topBar: true,
    sections: [
      { kind: 'wide', slots: 1 },
      { kind: 'grid', slots: 2 },
      { kind: 'wide', slots: 1 },
      { kind: 'grid', slots: 2 },
      { kind: 'photos', slots: 6, columns: 3, categoryHeading: true, buttons: 2 },
    ],
    builtin: true,
  },
  spotlight: {
    get label() {
      return tr('特集(モザイク + グリッド)', 'Spotlight (mosaic + grid)')
    },
    get description() {
      return tr(
        'ヒーローの下に見出し・コピー・ボタン。大きい 1 点と小さい 2 点のモザイクで主役を見せ、見出し付きのグリッドで組み合わせを提案します(計 7 点)。',
        'Headline, copy, and a button below the hero. A mosaic of one large and two small items leads, then a headed grid suggests pairings (7 items).',
      )
    },
    hero: 'standard',
    heroText: 'below',
    heroButtons: 1,
    sections: [
      { kind: 'mosaic', slots: 3 },
      { kind: 'grid', slots: 4, categoryHeading: true, buttons: 2 },
    ],
    builtin: true,
  },
  story: {
    get label() {
      return tr('ストーリー(写真 + 文)', 'Story (photo + text)')
    },
    get description() {
      return tr(
        '写真と商品の説明を左右交互に並べ、1 点ずつ丁寧に見せます。最後に見出し付きのグリッド(計 7 点)。',
        'Photos and product descriptions alternate left and right to tell each item\'s story, then a headed grid (7 items).',
      )
    },
    hero: 'standard',
    heroText: 'overlay',
    heroButtons: 2,
    sections: [
      { kind: 'story', slots: 3 },
      { kind: 'grid', slots: 4, categoryHeading: true, buttons: 2 },
    ],
    builtin: true,
  },
  editorial: {
    get label() {
      return tr('コレクション(大きな写真中心)', 'Collection (photo-led)')
    },
    get description() {
      return tr(
        '大きな写真とモザイクで世界観を見せ、3 列のグリッドで商品をまとめて紹介します(計 11 点)。新作やコレクションの紹介に。',
        'Large photos and a mosaic set the mood, then a 3-column grid shows the lineup (11 items). For new arrivals and collections.',
      )
    },
    hero: 'standard',
    heroText: 'below',
    heroButtons: 1,
    sections: [
      { kind: 'wide', slots: 1 },
      { kind: 'mosaic', slots: 3, flip: true },
      { kind: 'grid', slots: 6, columns: 3 },
      { kind: 'wide', slots: 1, buttons: 1 },
    ],
    builtin: true,
  },
}

// ---- アプリの標準のテンプレート。アプリの配信 = 通知 + アプリの中で開くメッセージ。
// 通知の形(push)と、メッセージの本文(メールと同じ部品: メイン画像・セクション・ボタン)を組み合わせる。
// ID は、以前の版(通知だけのテンプレート)と同じものを残す(保存済みの配信カードが指しているため)
BUILTIN['push-text'] = {
  get label() {
    return tr('お知らせ', 'Announcement')
  },
  get description() {
    return tr('通知はテキストだけ。メッセージは、メイン画像 + 見出し・コピー + ボタン。お知らせ・リマインドに。', 'Text-only notification. Message: main image, headline and copy, and a button. For announcements and reminders.')
  },
  channel: 'push',
  push: { image: false, buttons: [] },
  hero: 'standard',
  heroText: 'below',
  heroButtons: 1,
  sections: [],
  builtin: true,
}
BUILTIN['push-image'] = {
  get label() {
    return tr('特集', 'Feature')
  },
  get description() {
    return tr('通知は画像つき。メッセージは、メイン画像 + 2 列のグリッド 4 点 + ボタン。特集・新作の告知に。', 'Notification with image. Message: main image, a 2-column grid of 4, and a button. For features and new arrivals.')
  },
  channel: 'push',
  push: { image: true, buttons: [] },
  hero: 'standard',
  heroText: 'below',
  sections: [{ kind: 'grid', slots: 4, buttons: 1 }],
  builtin: true,
}
BUILTIN['push-product'] = {
  get label() {
    return tr('商品の紹介', 'Product spotlight')
  },
  get description() {
    return tr('通知は画像つき + ボタン 2 つ(見る / あとで)。メッセージは、大きく 1 点 + 関連の商品 2 点。値下げ・再入荷に。商品の写真をメイン画像に選ぶと、通知にも出ます。', 'Notification with image and two buttons (View / Later). Message: one large product and two related items. For price drops and restocks. Pick the product photo as the main image to show it in the notification too.')
  },
  channel: 'push',
  get push() {
    return { image: true, buttons: [tr('見る', 'View'), tr('あとで', 'Later')] }
  },
  hero: 'standard',
  heroText: 'below',
  sections: [
    { kind: 'wide', slots: 1 },
    { kind: 'grid', slots: 2, buttons: 1 },
  ],
  builtin: true,
}
BUILTIN['push-sale'] = {
  get label() {
    return tr('セール', 'Sale')
  },
  get description() {
    return tr('通知は画像つき。メッセージは、お知らせ帯 + 大きく 1 点 + グリッド 4 点 + ボタン 2 つ。期間限定のセールに。', 'Notification with image. Message: a top bar, one large item, a grid of 4, and two buttons. For limited-time sales.')
  },
  channel: 'push',
  push: { image: true, buttons: [] },
  hero: 'offer',
  heroText: 'overlay',
  topBar: true,
  sections: [
    { kind: 'wide', slots: 1 },
    { kind: 'grid', slots: 4, buttons: 2 },
  ],
  builtin: true,
}

const BUILTIN_IDS = Object.keys(BUILTIN)
export const DEFAULT_TEMPLATE: EmailTemplateId = 'standard4'
/** アプリの配信カードの既定のテンプレート */
export const DEFAULT_PUSH_TEMPLATE: EmailTemplateId = 'push-image'
/** テンプレートのチャネル(省略はメール) */
export const channelOf = (id: EmailTemplateId): TemplateChannel => getTemplate(id).channel ?? 'email'

// ---- 登録(標準 + ユーザーが作ったもの) ----

let custom: Record<string, EmailTemplate> = {}
// 標準を編集したときの上書き(標準の ID → 上書きの中身)。コードの標準はそのまま残すので、上書きを消せば最初の形に戻る
let overrides: Record<string, EmailTemplate> = {}
// 過去の版(「テンプレートの ID@v版」→ その版の中身)。配信カードは、使った版をこの鍵で引く(描画の仕組みは、ID のときと同じ)
let versions: Record<string, EmailTemplate> = {}
let version = 0
// データベースから読み込んだか(読み込む前は、作ったテンプレートがまだ登録になく、「見つからない」と取り違えるため)
let customLoaded = false
let versionsLoaded = false
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const changed = () => {
  version += 1
  listeners.forEach((fn) => fn())
}

/**
 * データベースから読み込んだテンプレートに入れ替える。
 * overrides のある行は、標準の上書き(その標準の ID で引ける)。それ以外は、作成したテンプレート
 */
export function setCustomTemplates(list: ({ id: string; overrides?: string } & Omit<EmailTemplate, 'builtin'>)[]) {
  custom = Object.fromEntries(list.filter((x) => !x.overrides || !BUILTIN[x.overrides]).map((x) => [x.id, { ...x, rowId: x.id, builtin: false, version: x.version ?? 1 }]))
  // 使わない(無効)にしただけの上書きの行は、中身が標準と同じ。中身が違うときだけ「編集済み」にする
  const shape = (x: Partial<EmailTemplate>) => JSON.stringify([x.label, x.description, x.hero, x.heroText ?? 'band', !!x.topBar, x.heroLink ?? 'campaign', x.sections, x.buttonBlocks ?? [], x.push ?? null, x.heroTable ?? null, x.heroStyle ?? null])
  overrides = Object.fromEntries(
    list.filter((x) => x.overrides && BUILTIN[x.overrides]).map(({ id, overrides: o, ...rest }) => [o!, { ...rest, rowId: id, builtin: true, edited: shape(rest) !== shape(BUILTIN[o!]), version: rest.version ?? 0 }]),
  )
  customLoaded = true
  changed()
}

/** 過去の版を登録する(テンプレートの ID・版の番号・中身) */
export function setTemplateVersions(list: ({ templateId: string; version: number } & Omit<EmailTemplate, 'builtin'>)[]) {
  versions = Object.fromEntries(list.map(({ templateId, version: v, ...rest }) => [`${templateId}@v${v}`, { ...rest, builtin: !!BUILTIN[templateId], version: v, versionOf: templateId }]))
  versionsLoaded = true
  changed()
}

/** テンプレートの登録が変わったら、再描画する(読み込み・保存・削除のあと) */
export function useTemplates(): number {
  return useSyncExternalStore(subscribe, () => version)
}

/** 鍵(ID、または「ID@v版」)を、テンプレートの ID と版の番号に分ける */
export function splitTemplateKey(key: EmailTemplateId): { id: EmailTemplateId; version?: number } {
  const m = /^(.*)@v(\d+)$/.exec(key)
  return m ? { id: m[1], version: Number(m[2]) } : { id: key }
}

/** いまの版を求める(版の登録がないときに使う) */
const currentOf = (id: EmailTemplateId): EmailTemplate | undefined => custom[id] ?? overrides[id] ?? BUILTIN[id]

/**
 * テンプレートを求める。鍵は、ID(いまの版)か「ID@v版」(過去の版)。
 * 過去の版が見つからないときは、標準の版 0 はコードの定義、それ以外は、いまの版にする。
 * 登録にない ID(削除された、まだ読み込まれていない)は、Standard4 にする
 */
export function getTemplate(key: EmailTemplateId): EmailTemplate {
  const { id, version: v } = splitTemplateKey(key)
  // `v === 0 && …` は版が 0 以外だと false になり、?? では飛ばされない(テンプレートの代わりに false を返し、画面全体が止まった。2026-10-23)
  if (v !== undefined) return versions[key] ?? (v === 0 ? BUILTIN[id] : undefined) ?? currentOf(id) ?? BUILTIN[DEFAULT_TEMPLATE]
  return currentOf(id) ?? BUILTIN[DEFAULT_TEMPLATE]
}

// 読み込みに失敗したか(そのときも、待つのをやめて、標準のテンプレートで動く)
let loadFailed = false

/** テンプレートの読み込みに失敗したことを知らせる(App の読み込み) */
export function markTemplatesLoadFailed() {
  loadFailed = true
  changed()
}

/** テンプレートの読み込みが終わったか(失敗も含む)。開いた配信の自動の下書きは、これを待ってから判定する */
export const templatesSettled = (): boolean => customLoaded || loadFailed

/**
 * 配信カードが使ったテンプレート(鍵)が、登録に見つからないか。getTemplate は代わりのテンプレートで描くので、
 * 保存した見出し・コピー・商品の枠が、描いている形と合わない。開いたときに、AI の下書きをやり直す目印にする(SU1。2026-10-23 利用者 OK)。
 * 読み込みが済むまでは、見つからないと言わない(作ったテンプレート・過去の版は、読み込むまで登録にない)
 */
export function templateMissing(key: EmailTemplateId): boolean {
  const { id, version: v } = splitTemplateKey(key)
  if (!customLoaded) return false
  if (v === undefined || (v === 0 && BUILTIN[id])) return !currentOf(id)
  // 過去の版の表が読めなかったときは、いまの版で描く(見つからないとは言わない)
  return !currentOf(id) || (versionsLoaded && !versions[key])
}

/** 登録にあるテンプレートか */
export const hasTemplate = (id: string): boolean => id in custom || id in BUILTIN

/** 標準の、最初の形(上書きのないもの。「最初の形に戻す」で、何に戻るかを見せる) */
export const builtinOriginal = (id: string): EmailTemplate | undefined => BUILTIN[id]

/** いまの版の番号(標準は、編集していなければ 0) */
export const currentVersion = (id: EmailTemplateId): number => currentOf(id)?.version ?? (BUILTIN[id] ? 0 : 1)

/** テンプレートの ID と版の番号から、引くときの鍵を作る(いまの版なら ID のまま) */
export const templateKey = (id: EmailTemplateId, v?: number | null): EmailTemplateId => (v === undefined || v === null || v === currentVersion(id) ? id : `${id}@v${v}`)

/**
 * 版まで決めた鍵(「ID@v版」。いまの版も番号で書く)。AB テストの案のテンプレートを保存するとき、
 * 2 つの鍵が同じ形かを比べるときに使う(いまの版を「ID」と書いた鍵と「ID@v版」と書いた鍵を、同じとみなすため)
 */
export const pinnedTemplateKey = (key: EmailTemplateId): string => {
  const { id, version: v } = splitTemplateKey(key)
  return `${id}@v${v ?? currentVersion(id)}`
}

/** 鍵から、テンプレートの ID(版を外す)。結果をテンプレートごとにまとめるときなどに使う */
export const baseTemplateId = (key: EmailTemplateId): EmailTemplateId => splitTemplateKey(key).id

/** テンプレートの、登録されている過去の版の一覧(版の番号の順) */
export const pastVersions = (id: EmailTemplateId): EmailTemplate[] =>
  Object.values(versions)
    .filter((x) => x.versionOf === id)
    .sort((a, b) => (a.version ?? 0) - (b.version ?? 0))

/** 配信カードが使っているテンプレートの ID(テンプレートを選んでいない以前の配信は、メールの種類の値から) */
export const templateIdOfCard = (c: { layout_key?: string; channel?: string; email_template?: string }): EmailTemplateId =>
  c.layout_key || (c.channel === 'app' ? DEFAULT_PUSH_TEMPLATE : templateFromValue(c.email_template))

/** 配信カードが使っている版を引く鍵(版を管理する前の配信は、いまの版) */
export const templateKeyOfCard = (c: { layout_key?: string; layout_version?: number | null; channel?: string; email_template?: string }): EmailTemplateId =>
  templateKey(templateIdOfCard(c), c.layout_version)

/**
 * 選べるテンプレートの一覧(標準 → ユーザーが作ったもの)。channel を渡すと、そのチャネルのものだけ。
 * 使わない(無効)のものは、includeHidden のときだけ出す(管理の画面)。過去の版は出さない。
 * country を渡すと、その国で使うものだけ(ST1。⚙ →「国」→「使うテンプレート」。決めていなければ使う)
 */
export function templateOptions(channel?: TemplateChannel, includeHidden = false, country?: string | null): ({ id: EmailTemplateId; label: string; description: string; builtin: boolean; edited: boolean; hidden: boolean; channel: TemplateChannel; push?: PushSpec } & TemplateLayout)[] {
  return [...BUILTIN_IDS, ...Object.keys(custom)]
    .filter((id) => !channel || (getTemplate(id).channel ?? 'email') === channel)
    .filter((id) => includeHidden || !getTemplate(id).hidden)
    .filter((id) => appliesIn('template', id, country))
    .map((id) => {
    const tpl = getTemplate(id)
    return {
      id,
      label: tpl.label,
      description: tpl.description,
      builtin: tpl.builtin,
      edited: !!tpl.edited,
      hidden: !!tpl.hidden,
      channel: tpl.channel ?? 'email',
      push: tpl.push,
      hero: tpl.hero,
      heroText: tpl.heroText,
      heroButtons: tpl.heroButtons,
      topBar: tpl.topBar,
      heroLink: tpl.heroLink,
      sections: tpl.sections,
      buttonBlocks: tpl.buttonBlocks,
      heroTable: tpl.heroTable,
      heroStyle: tpl.heroStyle,
    }
  })
}

// ---- 管理の画面を開く(ヘッダーのボタンや、テンプレートのタブから) ----

let managerOpen = false
const managerListeners = new Set<() => void>()
const subscribeManager = (fn: () => void) => {
  managerListeners.add(fn)
  return () => managerListeners.delete(fn)
}
export function setTemplateManagerOpen(open: boolean) {
  managerOpen = open
  managerListeners.forEach((fn) => fn())
}
export const openTemplateManager = () => setTemplateManagerOpen(true)
export function useTemplateManagerOpen(): boolean {
  return useSyncExternalStore(subscribeManager, () => managerOpen)
}

// 配信カードの「email_template」列の値との対応(標準のテンプレートだけ。以前のカードとの互換)
export const TEMPLATE_VALUES: Record<string, DeliveryCardEmailTemplate> = {
  free: 'free',
  standard4: 'standard4',
  collab: 'collab',
  offer: 'offer',
  cat2: 'cat2',
  cat3: 'cat3',
}

/** 保存されている選択肢の値から、標準のテンプレートを求める(未設定や不明な値は Standard4) */
export const templateFromValue = (v?: string): EmailTemplateId => BUILTIN_IDS.find((id) => TEMPLATE_VALUES[id] === v) ?? DEFAULT_TEMPLATE

/** テンプレートの商品枠の合計(free は決まっていないので 0) */
export const slotsOf = (id: EmailTemplateId) => getTemplate(id).sections.reduce((n, s) => n + s.slots, 0)

// ---- セクション(商品の枠)の計算

/** free のとき、AI に選ばせる商品数の既定 */
export const FREE_DEFAULT_SLOTS = 4

export interface SectionInfo {
  index: number
  /** 選定済みの商品の並び(items)の中での、先頭の位置 */
  start: number
  /** 枠の数。free は上限なし(Infinity) */
  slots: number
  kind: SectionKind
  /** カテゴリ系: AI が見出しを付ける */
  wantTitle: boolean
  label: string
  /** 表: テンプレートを作った人のメモ(セクションの切り口と、箱ごとの一言)。AI の選定に渡す */
  note?: string
}

/** 表のセクションの、AI に渡すメモ(セクションの切り口 + 箱ごとの一言)。箱の番号は、セクションの中で 1 から */
function tableNote(sec: Section): string | undefined {
  if (sec.kind !== 'table') return undefined
  const boxes = (sec.parts ?? []).filter((p) => p.type === 'box').sort((a, b) => a.r - b.r || a.c - b.c)
  const lines = [sec.aiNote?.trim(), ...boxes.map((p, i) => (p.aiNote?.trim() ? tr(`${i + 1} 番目の商品: ${p.aiNote.trim()}`, `Item ${i + 1}: ${p.aiNote.trim()}`) : ''))].filter(Boolean)
  return lines.length > 0 ? lines.join('\n') : undefined
}

/** テンプレートのセクション一覧。free は、全体で 1 つのセクションとして扱う */
export function sectionsOf(id: EmailTemplateId): SectionInfo[] {
  const tpl = getTemplate(id)
  if (id === 'free') {
    return [{ index: 0, start: 0, slots: Infinity, kind: 'grid', wantTitle: false, label: tr('全体', 'All') }]
  }
  // 中身の形が変わり続けるので、セクションが読めなくても止めない(一覧・月の画面がこれを呼ぶので、ここで止まると画面全体が描けない)
  const secs: Section[] = Array.isArray(tpl?.sections) ? tpl.sections : []
  // 同じ種類が複数あるときは、番号を付けて区別する(タブの名前になる)
  const countOf = (kind: SectionKind, upto = secs.length) => secs.slice(0, upto).filter((s) => s.kind === kind).length
  const kindName: Record<SectionKind, () => string> = {
    grid: () => tr('グリッド', 'Grid'),
    photos: () => tr('写真', 'Photos'),
    wide: () => tr('大きく', 'Large'),
    mosaic: () => tr('モザイク', 'Mosaic'),
    story: () => tr('ストーリー', 'Story'),
    feature: () => tr('特集', 'Feature'),
    cells: () => tr('箱', 'Box'),
    table: () => tr('表', 'Table'),
  }
  return secs.map((sec, i) => {
    const start = secs.slice(0, i).reduce((n, s) => n + s.slots, 0)
    const name = kindName[sec.kind]?.() ?? sec.kind
    // 表は、テンプレートで付けた名前があれば、それを使う(テンプレートの編集画面の札と同じ呼び名に)。
    // 「セクション 5」のような番号だけの呼び名は使わない(どこのことか分からない。2026-10-28 利用者)。見出しのあるセクションも種類の名前で呼ぶ
    const label = sec.name?.trim() ? sec.name.trim() : countOf(sec.kind) > 1 ? tr(`${name}${countOf(sec.kind, i + 1)}`, `${name} ${countOf(sec.kind, i + 1)}`) : name
    return { index: i, start, slots: sec.slots, kind: sec.kind, wantTitle: !!sec.categoryHeading, label, note: tableNote(sec) }
  })
}

/** 選定済みの並びの位置 idx が、どのセクションに属するか(枠を超えた分は最後のセクション) */
export function sectionIndexAt(sections: SectionInfo[], idx: number): number {
  const found = sections.find((s) => idx >= s.start && idx < s.start + s.slots)
  return found ? found.index : sections.length - 1
}

/** セクションが担当する選定済み商品の範囲 [開始, 終了)。最後のセクションは、枠を超えた分も含める */
export function sectionRange(sections: SectionInfo[], sec: SectionInfo, total: number): [number, number] {
  const last = sec.index === sections.length - 1
  const end = last || !Number.isFinite(sec.slots) ? total : sec.start + sec.slots
  return [sec.start, end]
}
