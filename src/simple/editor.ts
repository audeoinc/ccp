import type { ReactNode } from 'react'
import type { SwapRender } from '../ProductActionFloat'
import type { DeliveryCard } from '../models/deliveryCards'
import type { Product } from '../models/products'
import type { HeroImage } from '../models/heroImages'
import type { AiCard } from '../aiSelect'
import type { EmailTemplateId } from '../templates'
import type { LinkSlot } from '../links'
import type { CardAlert, CardAlertKind } from '../cardAlerts'
import type { NextStep } from './nextStep'
import type { AbPurpose, VariantKey } from '../abTest'
import type { PartRef } from './parts'
import type { WholeTexts } from './partAi'
import type { TemplateUse } from '../templateUse'
import type { ThemeSuggestion } from '../aiDraft'
import type { PreviewZoom } from './usePreviewNav'
import type { useCardEditor } from '../useCardEditor'

type CardEditor = ReturnType<typeof useCardEditor>

/** シンプルな画面で直せる、配信カードの入力欄(CardDetail の Form の一部。名前は Form と同じ) */
export type SimpleField =
  | 'name'
  | 'scheduledAt'
  | 'country'
  | 'channel'
  | 'themeType'
  | 'status'
  | 'owner'
  | 'targetGender'
  | 'targetAges'
  | 'pushTitle'
  | 'pushBody'
  | 'subject'
  | 'preheader'
  | 'theme'
  | 'headline'
  | 'copy'
  | 'instructions'

/** プレビューにだけ仮に写す、AI の案(メイン画像・商品) */
export interface AiPreview {
  /** 文言の案(件名・見出し・セクションなど)。保存する中身は変えず、プレビューと受信箱の行にだけ写す(dirty にしない) */
  texts?: WholeTexts
  heroId?: string
  /** テンプレートの選び直しで、乗せているテンプレート */
  templateId?: EmailTemplateId
  /** 枠の商品の案。key が空なら空いた枠への案で、at の位置(押した空いた枠)に写す */
  item?: { key: string; productId: string; at?: number }
}

/** 商品のフロートを、入れ替えの候補(配信に載っていない商品)の詳しい情報として開くときの鍵の頭(openProduct の key に「pid:商品 ID」) */
export const CANDIDATE_DETAIL = 'pid:'

/** 商品のフロートに足す、選んでいる枠への操作(「この枠の商品と入れ替える」など) */
export interface FloatAction {
  label: string
  run: () => void
  /** 帯の説明(渡さなければ「プレビューで選んでいる枠と見比べています」) */
  note?: string
  /** 「← 候補に戻る」(入れ替えの候補の詳しい情報として開いたとき。フロートを閉じて、部品のペインの候補に戻る) */
  backLabel?: string
}

/**
 * 配信カードの editor(useCardEditor)から、そのまま渡すもの。名前と型は editor と同じ(写しの型を書かない。2 つの画面で、ずれないように)。
 * form は詳しい画面と同じ Form、savedAt は最後に保存した日時(ISO。上の帯の「保存済み · 12:03」)、canReview は承認の依頼・承認を出せるか(確定した週の配信は、出さない)
 */
const FROM_EDITOR = ['form', 'template', 'items', 'candidates', 'poolProducts', 'poolHeroes', 'heroReason', 'heroCandidates', 'sectionTitles', 'sectionCopies', 'setSectionTitle', 'setSectionCopy', 'partContent', 'setPartContent', 'links', 'setLinks', 'pushLink', 'setPushLink', 'addProduct', 'removeItem', 'moveItem', 'swapItems', 'saving', 'justSaved', 'savedAt', 'canReview', 'audience', 'setAudience'] as const
type FromEditor = Pick<CardEditor, (typeof FROM_EDITOR)[number]>

/**
 * シンプルな配信カード(SU1)が使う、値と操作のまとまり = editor の値(FromEditor)+ この画面だけのもの(SimpleExtras)。
 * 状態と保存は CardDetail・useCardEditor のものをそのまま使い、ここでは複製しない(docs/SIMPLE_CARD.md の 3 章)。
 * 保存・元に戻すなど ref を読む操作は、ここに入れず、SimpleCardLayout の引数で渡す(描画の中で ref を読まないため。react-hooks/refs)
 */
export type SimpleEditor = FromEditor & SimpleExtras

/** editor の値に、この画面だけのものを足して、SimpleEditor を作る(CardDetail が呼ぶ) */
export function simpleEditorOf(editor: CardEditor, extras: SimpleExtras): SimpleEditor {
  const picked = Object.fromEntries(FROM_EDITOR.map((k) => [k, editor[k]])) as FromEditor
  return { ...picked, ...extras }
}

/** シンプルな配信カードだけのもの(editor にない値・この画面向けに形を変えた操作。上の帯・プレビュー・知らせの部品など) */
export interface SimpleExtras {
  card: DeliveryCard
  /** まとめて作った、まだ保存していない案(card は ID のない仮のもの)。自動では保存せず、上の帯の「この案で作る」で配信を作る */
  unsaved: boolean
  /** AI に渡す、配信のいまの入力(国・チャネルは名前で) */
  aiCard: () => AiCard
  setField: (k: SimpleField, v: string) => void
  /** テーマの AI の案(詳しい画面の ① テーマと同じ useAiDrafts。案は保存しない。X81 の 4) */
  themeAi: { ideas: ThemeSuggestion[]; busy: boolean; run: () => void }
  /** テンプレートごとの最近の使われ方(詳しい画面の ② テンプレートと同じ templateUse。全部の配信が読めるまでは undefined。X81 の 7) */
  templateUse?: Map<string, TemplateUse>
  /** テーマの案を採用する(理由も一緒に入れる。手で直したときは setField('theme') が理由を消す) */
  adoptTheme: (theme: string, reason: string) => void
  channel: 'email' | 'push'
  /** AB テスト(SU2)。keys は A を含む案、active はいま直している案(プレビューとペインは、この案の中身) */
  ab: { keys: VariantKey[]; active: VariantKey; purpose: AbPurpose; canAdd: boolean; busy: boolean } | null
  abSwitch: (k: VariantKey) => void
  /** 案を足す(その案の写しから始める。ai は A を写して AI に作らせる)。AB テストでなければ始める */
  abAdd: (from: VariantKey | 'ai') => void
  abRemove: (k: VariantKey) => void
  abCompare: () => void
  /** 案から選んだあと(AB テストは終わっている)、決めた案。null = 決めていない(X81 の 6) */
  abDecided: VariantKey | null
  /** 決めた案と、配信しなかった案を並べて見る */
  abViewDecided: () => void
  /** テストの設定(タブの横の ⚙ の中身) */
  abSettings: ReactNode
  /** いまの案が A と違う部品(「A と違う」の目印) */
  abDiffParts: PartRef[]
  products: Product[]
  hero?: HeroImage
  setHero: (id: string | undefined, reason: string) => void
  /** 持っている画像を上げる(file を渡すと、そのファイルを上げながら開く) */
  uploadHero: (file?: File) => void
  /** 文言をまとめて変える(配信の全体への AI の依頼。入れたものだけ変える) */
  applyTexts: (t: WholeTexts) => void
  linkSpots: LinkSlot[]
  /** リンクの場所の、計測用のパラメーター(utm)つきの URL(⑤ リンク先・プレビューのリンクと同じ。AB の案の印つき。X81 の 8) */
  linkUrlOf: (slot: LinkSlot) => string
  /** アプリの開く画面の FCM の data に入れる campaign(⑤ リンク先と同じ。AB の案の印つき) */
  fcmCampaign: string
  /** 商品 ID → いちばん強いアラートの種類 */
  alertKinds: Map<string, CardAlertKind>
  /** 載せた商品と、残りの候補を入れ替える(行 ID のまま) */
  swapWithCandidate: (itemKey: string, candKey: string, reason: string) => void
  /** 商品のフロートを開く(載せた商品か候補の鍵。action は、選んでいる枠への操作。swap があれば、フロートの「入れ替える」でそれを呼ぶ(SU9)) */
  openProduct: (key: string, action?: FloatAction, swap?: SwapRender) => void
  hoverProduct: (key: string | null) => void
  /** 載せた商品を、ほかの商品に置き換える(行は作り直す。理由は配信のメモに残す) */
  replaceItem: (itemKey: string, productId: string, reason: string) => void
  /** AI の案を、保存する中身を変えずに、プレビューにだけ仮に写す(null で戻す)。商品の item.key が空なら、空いた枠に足して見せる */
  setAiPreview: (p: AiPreview | null) => void
  /** プレビューに写している AI の文言の案(受信箱の行も、これで描く) */
  previewTexts: WholeTexts | null
  /** テンプレートを替える(セクションの構成が変わるので、残りの候補と AI の案は捨てる。CardDetail の changeTemplate) */
  setTemplate: (id: EmailTemplateId) => void
  // ---- 保存(入力が止まって約 1.5 秒で自動。CardDetail)と元に戻す
  /** 開いたとき・前に保存したときから、内容が変わったか */
  dirty: boolean
  /** 保存すると承認のやり直しになる変更があるか(商品の画像だけを替えたときは false。X64 の g) */
  revokesApproval: boolean
  /** 確定した週の配信(自動では保存せず、上の帯の保存のボタンで理由を聞く) */
  locked: boolean
  /** 保存の失敗(上の帯に「保存できませんでした・再試行」) */
  saveError: string | null
  /** ほかの人が先に保存していた(上の帯で、上書きする / 閉じて読み直す) */
  saveConflict: { at: string; overwrite: () => void; reload: () => void } | null
  retrySave: () => void
  /** 確定した週の、変えた理由の入力欄(上の帯の保存のボタンの下の Popover に出す) */
  reasonOpen: boolean
  reasonForm: ReactNode
  cancelReason: () => void
  canUndo: boolean
  // ---- 上の帯
  nextStep: NextStep
  /** 「⋯」の中身(すべて AI で下書き・保存して次へ・結果を見る・詳しい画面へ + 複製・取りやめ・削除) */
  menu: ReactNode
  stageNav?: ReactNode
  /** キャンペーンの帯(X79。キャンペーンに入っている配信だけ)。引数は 3 段目に置く AB の案の切り替え。あるときは、AB の案を上の帯の 2 段目に置かない */
  campaignBand?: (variants: ReactNode) => ReactNode
  /** 配信の画面に出す名前(キャンペーンに入っている配信は「キャンペーン名 + チャネル」で、直せない) */
  campaignName?: string
  /** 「シンプル | 詳しい」の切り替え */
  viewSwitch: ReactNode
  // ---- プレビュー(倍率の計算は CardDetail のまま。箱の ref は、別の引数で渡して、この画面の箱に付ける)
  preview: ReactNode
  device: 'mobile' | 'pc'
  setDevice: (d: 'mobile' | 'pc') => void
  zoom: PreviewZoom
  /** 上の知らせ(取りやめ・AI 下書き・承認済みの変更・確定した週) */
  notices: ReactNode
  /** 下の知らせ(テンプレートが見つからない・AI などのエラー。保存の失敗と理由の入力は上の帯) */
  footer: ReactNode
  /** 目印: 商品のアラートの印(プレビューに重ねる層)と、これまでの学びの帯(AI の依頼に学びを渡す役もあるので、隠すときも描く)と、その件数 */
  alertOverlay: ReactNode
  /** この配信のアラート(左のバーの「アラート」。SU6) */
  alerts: CardAlert[]
  /** アラートへの対応を開く(対応できない配信では undefined) */
  actAlert?: (a: CardAlert) => void
  // ---- コミュニケーションのペイン(段階 d)
  /** 制作への引き継ぎ(担当・締め切り・引き継ぎ済み) */
  setHandoff: (key: 'productionOwner' | 'handedOffAt' | 'productionDue', value: string) => void
  /** 工程の残り(引き継ぎのときに知らせる) */
  remaining: string[]
  /** これまでに入れた人の名前(宛先の候補) */
  people: string[]
  /** 承認・依頼のあとに、配信カードを読み直す */
  reload: () => Promise<void>
  /** 制作のページを開く(request: 開いたら、そのまま制作に依頼する。シンプルな画面の「制作に渡す」) */
  openProduction?: (opts?: { request?: boolean }) => void
  learnings: ReactNode
  learnCount: number
}
