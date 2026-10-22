import type { ReactNode } from 'react'
import type { DeliveryCard } from '../models/deliveryCards'
import type { Product } from '../models/products'
import type { HeroImage } from '../models/heroImages'
import type { Candidate, Item } from '../items'
import type { AiCard, ProposedHero } from '../aiSelect'
import type { EmailTemplateId } from '../templates'
import type { LinkSlot, Links } from '../links'
import type { CardAlertKind } from '../cardAlerts'
import type { NextStep } from './nextStep'
import type { AbPurpose, VariantKey } from '../abTest'
import type { PartRef } from './parts'
import type { WholeTexts } from './partAi'
import type { PreviewZoom } from './usePreviewNav'

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

export type SimpleForm = Record<SimpleField, string> & {
  copyAngle: string
  themeReason: string
  productionOwner: string
  productionDue: string
  handedOffAt: string
}

/** プレビューにだけ仮に写す、AI の案(メイン画像・商品) */
export interface AiPreview {
  heroId?: string
  /** テンプレートの選び直しで、乗せているテンプレート */
  templateId?: EmailTemplateId
  item?: { key: string; productId: string }
}

/** 商品のフロートに足す、選んでいる枠への操作(「この枠の商品と入れ替える」など) */
export interface FloatAction {
  label: string
  run: () => void
}

/**
 * シンプルな配信カード(SU1)が使う、値と操作のまとまり。状態と保存は CardDetail のものをそのまま使い、ここでは複製しない
 * (2 つの画面で振る舞いがずれないように。docs/SIMPLE_CARD.md の 3 章)。あとで useCardEditor のようなフックに切り出すときの形も兼ねる。
 * 保存・元に戻すなど ref を読む操作は、ここに入れず、SimpleCardLayout の引数で渡す(描画の中で ref を読まないため。react-hooks/refs)
 */
export interface SimpleEditor {
  card: DeliveryCard
  form: SimpleForm
  /** AI に渡す、配信のいまの入力(国・チャネルは名前で) */
  aiCard: () => AiCard
  setField: (k: SimpleField, v: string) => void
  channel: 'email' | 'push'
  template: EmailTemplateId
  /** AB テスト(SU2)。keys は A を含む案、active はいま直している案(プレビューとペインは、この案の中身) */
  ab: { keys: VariantKey[]; active: VariantKey; purpose: AbPurpose; canAdd: boolean; busy: boolean } | null
  abSwitch: (k: VariantKey) => void
  /** 案を足す(その案の写しから始める。ai は A を写して AI に作らせる)。AB テストでなければ始める */
  abAdd: (from: VariantKey | 'ai') => void
  abRemove: (k: VariantKey) => void
  abCompare: () => void
  /** テストの設定(タブの横の ⚙ の中身) */
  abSettings: ReactNode
  /** いまの案が A と違う部品(「A と違う」の目印) */
  abDiffParts: PartRef[]
  items: Item[]
  candidates: Candidate[]
  products: Product[]
  poolProducts: Product[]
  poolHeroes: HeroImage[]
  hero?: HeroImage
  heroReason: string
  heroCandidates: ProposedHero[]
  setHero: (id: string | undefined, reason: string) => void
  uploadHero: () => void
  sectionTitles: string[]
  sectionCopies: string[]
  setSectionTitle: (i: number, v: string) => void
  setSectionCopy: (i: number, v: string) => void
  /** 文言をまとめて変える(配信の全体への AI の依頼。入れたものだけ変える) */
  applyTexts: (t: WholeTexts) => void
  links: Links
  setLinks: (l: Links) => void
  linkSpots: LinkSlot[]
  /** 商品 ID → いちばん強いアラートの種類 */
  alertKinds: Map<string, CardAlertKind>
  addProduct: (productId: string, at?: number) => void
  removeItem: (key: string) => void
  moveItem: (from: number, to: number) => void
  /** 載せた商品どうしの位置を入れ替える */
  swapItems: (a: string, b: string) => void
  /** 載せた商品と、残りの候補を入れ替える(行 ID のまま) */
  swapWithCandidate: (itemKey: string, candKey: string, reason: string) => void
  /** 商品のフロートを開く(載せた商品か候補の鍵。action は、選んでいる枠への操作) */
  openProduct: (key: string, action?: FloatAction) => void
  hoverProduct: (key: string | null) => void
  /** 載せた商品を、ほかの商品に置き換える(行は作り直す。理由は配信のメモに残す) */
  replaceItem: (itemKey: string, productId: string, reason: string) => void
  /** AI の案を、保存する中身を変えずに、プレビューにだけ仮に写す(null で戻す)。商品の item.key が空なら、空いた枠に足して見せる */
  setAiPreview: (p: AiPreview | null) => void
  /** テンプレートを替える(セクションの構成が変わるので、残りの候補と AI の案は捨てる。CardDetail の changeTemplate) */
  setTemplate: (id: EmailTemplateId) => void
  // ---- 反映(保存)と元に戻す
  saving: boolean
  /** 開いたとき・前に反映したときから、内容が変わったか */
  dirty: boolean
  /** 確定した週の配信(自動では反映せず、反映のボタンで理由を聞く) */
  locked: boolean
  justSaved: boolean
  canUndo: boolean
  // ---- 上の帯
  nextStep: NextStep
  /** 「⋯」の中身(すべて AI で下書き・保存して次へ・結果を見る・詳しい画面へ + 複製・取りやめ・削除) */
  menu: ReactNode
  stageNav?: ReactNode
  /** 「シンプル | 詳しい」の切り替え */
  viewSwitch: ReactNode
  // ---- プレビュー(倍率の計算は CardDetail のまま。箱の ref は、別の引数で渡して、この画面の箱に付ける)
  preview: ReactNode
  device: 'mobile' | 'pc'
  setDevice: (d: 'mobile' | 'pc') => void
  zoom: PreviewZoom
  /** 上の知らせ(取りやめ・AI 下書き・承認済みの変更・確定した週) */
  notices: ReactNode
  /** 下の知らせ(エラー・確定した週の理由の入力欄) */
  footer: ReactNode
  /** 目印: 商品のアラートの印(プレビューに重ねる層)と、これまでの学びの帯(AI の依頼に学びを渡す役もあるので、隠すときも描く)と、その件数 */
  alertOverlay: ReactNode
  // ---- コミュニケーションのペイン(段階 d)
  /** 制作への引き継ぎ(担当・締め切り・引き継ぎ済み) */
  setHandoff: (key: 'productionOwner' | 'handedOffAt' | 'productionDue', value: string) => void
  /** 工程の残り(引き継ぎのときに知らせる) */
  remaining: string[]
  /** これまでに入れた人の名前(宛先の候補) */
  people: string[]
  /** 承認の依頼・承認を出せるか(確定した週の配信は、出さない) */
  canReview: boolean
  /** 承認・依頼のあとに、配信カードを読み直す */
  reload: () => Promise<void>
  openProduction?: () => void
  learnings: ReactNode
  learnCount: number
}
