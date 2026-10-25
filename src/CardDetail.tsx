import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStableCallback } from './useStableCallback'
import {
  Button,
  Caption1,
  Dialog,
  Field,
  MenuItem,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  ProgressBar,
  Slider,
  Spinner,
  Text,
} from '@fluentui/react-components'
import { AddRegular, ArrowNextRegular, DataBarVerticalRegular, SaveRegular, SubtractRegular } from '@fluentui/react-icons'
import { locale, tr, useT } from './i18n'
import { AiIcon } from './AiMark'
import { cardMarket } from './market'
import { AutoTextarea } from './AutoTextarea'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { themeTypeLabel, type ThemeType } from './themeTypes'
import { Preview } from './Preview'
import { sectionIndexAt, sectionsOf, type EmailTemplateId, getTemplate, splitTemplateKey, templateKeyOfCard, templateMissing, templatesSettled, useTemplates } from './templates'
import { tapComplete } from './pushLink'
import { SOURCE_AI, type Candidate, type Item } from './items'
import { progressOf } from './progress'
import { ResizableSurface } from './ResizableSurface'
import { campaignId, campaignSlug, productContent, fcmText, linkSlots, linksComplete, productUrl, screenOf, withUtm, type LinkSlot, utmFor, variantCampaign } from './links'
import { loadAutoDraft, loadPref, loadSimpleCard, readRaw, savePref, saveSimpleCard, writeRaw } from './settings'
import { PREF } from './prefKeys'
import { runAutoDraft, type AutoDraftResult } from './autoDraft'
import { useAiDrafts } from './useAiDrafts'
import { useCardEditor, type Snapshot } from './useCardEditor'
import { ClassicCardLayout } from './ClassicCardLayout'
import { useCardDetailStyles } from './cardDetailStyles'
import { useCardAlerts } from './useCardAlerts'
import type { Form } from './cardForm'
import type { WeekRow } from './data/weeks'
import { myName } from './history'
import { type TalkTab } from './ProcessPane'
import type { TopTab } from './ContentPane'
import { CHANNEL_PUSH } from './status'
import { LearningsBar } from './LearningsBar'
import { CardMenu } from './CardMenu'
import { CardAlertsBar } from './CardAlertsBar'
import { HeroUploadDialog } from './HeroUploadDialog'
import { AbCompare } from './AbCompare'
import { templateUse } from './templateUse'
import { allVariants, nextVariant, ownsAnyText, ownsSubject } from './abTest'
import { ProductActionFloat, type SwapOption } from './ProductActionFloat'
import { ItemAlertOverlay } from './ItemAlertOverlay'
import { confirmDialog } from './confirm'
import type { StockModel } from './alerts'
import type { CardAlert } from './cardAlerts'
import { SimpleCardLayout } from './simple/SimpleCardLayout'
import type { AiPreview, SimpleEditor } from './simple/editor'
import { nextStepOf, type NextStep } from './simple/nextStep'
import { useUndo } from './simple/useUndo'
import { ViewSwitch } from './simple/ViewSwitch'
import { AbSettings } from './simple/AbSettings'
import { usePreviewPins } from './usePreviewPins'

/** 新規作成のときに、最初から入れておく値(カレンダーで押した日付、絞り込み中の国・チャネル・種別。まとめて作った下書きを開くときは、名前も) */
export type NewCardDefaults = Partial<Pick<Form, 'name' | 'scheduledAt' | 'country' | 'channel' | 'themeType'>>

interface Props {
  /** undefined のときは新規作成 */
  card?: DeliveryCard
  /** 新規作成のときだけ使う */
  defaults?: NewCardDefaults
  /**
   * 新規作成で、中身まで入れて開く(まとめて作る作業画面の、まだ保存していない AI の案)。
   * 保存すると新しい配信カードになり、onCreated で id を返す(作業画面が、その案を保存済みにする)
   */
  draft?: { card: DeliveryCard; items: Item[]; candidates: Candidate[] }
  onCreated?: (id: string) => void
  /** 新しい配信を「保存」(閉じない)したとき、保存した配信として開き直す(X52) */
  onReopen?: (id: string) => void
  /** メイン画像のライブラリを読み直す(画像を上げたあと。X59) */
  onHeroesChanged?: () => Promise<void>
  /** この配信の週に、商品を載せる配信の数(週の上限超えのアラートの差し替えで、上限に届いた商品を候補から除く) */
  weekUse?: Map<string, number>
  products: Product[]
  heroes: HeroImage[]
  /** 他の配信で使われているテーマ(テーマ案の重複回避用) */
  otherThemes: string[]
  /** すべての配信(テンプレートの最近の使用回数を数える。X4) */
  allCards?: DeliveryCard[]
  /** これまでに入れた担当者の名前(入力の候補) */
  owners?: string[]
  /** 週の計画(確定した週の配信は、理由を残さないと保存できない) */
  weeks?: WeekRow[]
  onBack: () => void
  onSaved: () => Promise<void>
  /** この配信の結果を、上に重ねて見る(送ったあとの配信だけ、ボタンを出す) */
  onOpenResults?: (id: string) => void
  /** この配信のアラート(題名の下に帯で出す) */
  alerts?: CardAlert[]
  /** 開いたときに選んでおく商品(アラートの画面から開いたとき。問題の商品を、プレビューで強調する) */
  focusProductId?: string
  /** 在庫の見込み(アラートへの対応で、差し替えの候補を選ぶのに使う) */
  stockModel?: StockModel
  /** アラートの画面を開く(その商品のアラートを選んで。配信カードは閉じる) */
  onOpenAlerts?: (productId?: string) => void
  /** 制作のページを開く(プロセスのペインの「制作の依頼」の札から。PR4) */
  onOpenProduction?: (cardId: string, opts?: { request?: boolean }) => void
  /** 題名の左に出す、配信の段階の帯(計画・制作・結果を行き来する。StageNav)。新規作成のときはなく、面の札を出す */
  stageNav?: ReactNode
  /** 同じ段階の帯の、タブの見せ方(シンプルな配信カードの上の帯の 2 段目。StageHeader) */
  stageTabs?: ReactNode
  /** 最初に開く工程のタブ(リンクから開いたとき。X36) */
  initialTab?: string
  /** 工程のタブが変わったとき(URL に持たせる) */
  onTabChange?: (tab: string) => void
  /** 「保存して次へ」で開く配信(同じ週、または週の確認の項目で選んだ配信の、次の 1 本)。null は次がない。undefined はボタンを出さない */
  next?: { name: string; position: string } | null
  /** 保存したあとに、次の配信を開く(閉じる代わりに呼ぶ) */
  onNext?: () => void
}


// 既定を「全体(fit)」に変えたので、キーの版を上げて、以前に保存した倍率は使わない(鍵は prefKeys.ts)
const ZOOM_KEY = PREF.cardPreviewZoom
const ZOOM_MIN = 0.15  // 長いテンプレートも、「全体」で収まるように、小さくできる
const ZOOM_MAX = 1.2

/** プレビューの倍率: 数値(1 = 現在のサイズ)または 'fit'(メール全体を画面の高さに収める) */
function loadZoom(): number | 'fit' {
  // 読めなければ既定値を使う
  const v = loadPref<unknown>(ZOOM_KEY, null)
  if (v === 'fit') return 'fit'
  if (typeof v === 'number' && v >= ZOOM_MIN && v <= ZOOM_MAX) return v
  // 既定は、メール全体が見える倍率(作り始めに、構成の全体を見渡せるように)
  return 'fit'
}

/** 自動下書きを済ませたカード(同じカードを開き直しても、再実行しない) */
const autoDrafted = new Set<string>()

// ダイアログの大きさ(辺・角のドラッグで変える。ResizableSurface。鍵は以前からの cardDetail.size)
const MIN_DIALOG = { w: 900, h: 560 }
// 右端のプロセスのペイン(状態・承認・やり取り)の開閉。既定は開く
const PROCESS_KEY = PREF.cardProcessOpen


const loadOpen = (key: string): boolean => readRaw(key) !== 'closed'




export function CardDetail({ card, defaults, draft, onCreated, onReopen, onHeroesChanged, weekUse, products, heroes, otherThemes, allCards, owners = [], weeks = [], onBack, onSaved, onOpenResults, alerts = [], focusProductId, stockModel, onOpenAlerts, onOpenProduction, stageNav, stageTabs, initialTab, onTabChange, next, onNext }: Props) {
  const t = useT()
  const styles = useCardDetailStyles()
  // シンプルな配信カード(SU1)で描くか。上の帯の「シンプル | 詳しい」で切り替え、最後に選んだ方を次も使う(人の設定)。
  // 保存済みの配信だけ(新規作成・まとめて作った案は、自動の反映で新しい配信を作らないよう、詳しい画面)
  const [simpleView, setSimpleView] = useState(loadSimpleCard)
  const simpleOn = simpleView && !!card
  /** 見せ方を替える。remember が false のとき(次にやることのボタンで、承認・依頼のために詳しい画面へ移るとき)は、次に開くときの見せ方を変えない */
  const changeView = (v: boolean, remember = true) => {
    setSimpleView(v)
    if (remember) saveSimpleCard(v)
  }
  // 配信カードの中身(入力欄・商品・テンプレート・メイン画像・リンク・案)と、変えたかの判定・保存(useCardEditor.ts)。状態と保存は、ここの 1 か所
  const editor = useCardEditor({ card, draft, defaults, products, heroes, weeks, focusProductId, simpleOn, next, onSaved, onCreated, onReopen, onBack, onNext })
  const { form, setForm, items, setItems, candidates, setCandidates, original, selectedKey, setSelectedKey, justSaved, language, template, setTemplate, pushLink, setPushLink, audience, setAudience, templateChannel, sectionTitles, setSectionTitles, sectionCopies, setSectionCopies, heroCandidates, setHeroCandidates, heroId, setHeroId, heroReason, setHeroReason, links, setLinks, saving, changeReason, setChangeReason, error, setError, setAlertNotes, poolProducts, poolHeroes, ab, setAb, active, itemsOf, heroOf, textsOf, templateOfV, switchVariant, startAbTest, addVariant, removeVariant, abAiBusy, comparing, setComparing, draftActiveVariant, stopAbTest, changeTarget, asTarget, decision, decideVariant, saveTarget, abAddSimple, abDiff, set, productById, addProduct, dropAt, moveItem, groupByCategory, buildAiCard, applyTemplate, setSectionTitle, setSectionCopy, removeItem, lockedWeeks, submit, saveAndStay, saveAndNext, buildContent, committedSnap, approvedBefore, isDirty, changed, canReview, save, swapItems, savingAfter, pendingSave, askReason, cancelReason, savedAt, currentKey, saveError } = editor
  // プレビューは、配信カードのチャネルに合わせる(配信カードはチャネルごとに分けるので、切り替えは置かない)。
  // チャネルが未設定のときは、メールで表示する
  const previewTab: 'email' | 'push' = form.channel === String(CHANNEL_PUSH) ? 'push' : 'email'
  const [showHeadings, setShowHeadings] = useState(true)
  // プレビューの倍率(15〜120%)。'fit' は、メール全体が画面の高さに収まる倍率に自動で合わせる
  const [zoom, setZoom] = useState<number | 'fit'>(loadZoom)
  // メールのプレビューの幅(X3。スマホ / PC。ブラウザごとに覚える)
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'pc'>(() => loadPref<'mobile' | 'pc'>(PREF.cardPreviewDevice, 'mobile'))
  const pickDevice = (d: 'mobile' | 'pc') => {
    setPreviewDevice(d)
    savePref(PREF.cardPreviewDevice, d)
  }
  const [fitZoom, setFitZoom] = useState(1)
  // 「すべてAIで下書き」の進み具合(実行中だけ、画面全体に「推論中」を出す)
  const [autoEnabled] = useState(loadAutoDraft) // 設定は、画面上部のバーで切り替える
  const [auto, setAuto] = useState<{ label: string; done: number; total: number } | null>(null)
  const cancelRef = useRef(false)
  const aliveRef = useRef(true)
  const previewBoxRef = useRef<HTMLDivElement>(null)
  const previewInnerRef = useRef<HTMLDivElement>(null)
  // 持っている画像を上げる(X59)
  // true = 空で開く、File = そのファイルを上げながら開く(シンプルの「アップロード」のタブに落としたとき)
  const [heroUpload, setHeroUpload] = useState<boolean | File>(false)
  // プロセスのペインのタブを開く頼み(左の「制作への引き継ぎ」を押すと、「引き継ぎ」のタブを開く)
  const [tabRequest, setTabRequest] = useState<{ tab: TalkTab; seq: number } | undefined>(undefined)
  // プレビュー上の場所を指して書き込む(ピン)。選んでいる間は、プレビューを押しても編集しない
  // 打ったピン・押したピンは、その横のフロート(PinFloat)で書く・読む・返す(右のやり取りの欄は、全部の流れとして残す)
  const { placing: placingPin, setPlacing: setPlacingPin, endPlacing: endPlacingPin, target: pinTarget, setTarget: setPinTarget, openThreads: openPinThreads, close: closePin } = usePreviewPins()
  // 中ペインの工程のタブを開く頼み(プロセスのペインの「⑥ で直す」で、制作指示を開く)
  // リンクから開いたときは、そのタブで始める(seq 1 で、最初に 1 回だけ開く)
  const [stepRequest, setStepRequest] = useState<{ tab: TopTab; seq: number } | undefined>(() => (initialTab ? { tab: initialTab as TopTab, seq: 1 } : undefined))
  const surfaceRef = useRef<HTMLDivElement>(null)
  // 商品情報の行にマウスが乗っている商品(プレビューで光らせる)と、商品情報ペインの開閉
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [processOpen, setProcessOpen] = useState<boolean>(() => loadOpen(PROCESS_KEY))
  const toggleProcess = () =>
    setProcessOpen((open) => {
      writeRaw(PROCESS_KEY, open ? 'closed' : 'open')
      return !open
    })
  // 使ったテンプレートが見つからなかった配信(見せるテンプレートの名前と、AI で下書きし直したか)
  const [missingTemplate, setMissingTemplate] = useState<{ key: string; redrafted: boolean } | null>(null)
  // テンプレートの読み込みが済んだら、下の自動の下書きの判定をし直す
  const templatesVersion = useTemplates()


  useEffect(() => {
    savePref(ZOOM_KEY, zoom)
  }, [zoom])

  // 全体表示: 倍率 1 での高さを測り、プレビューの枠に収まる倍率を求める(内容や窓の大きさが変わったら、測り直す)。
  // 内容の変化は、中身の大きさの変化で知る(文言・商品などを effect の依存に並べると、打つたびに測り直し、並べ忘れると測り直さないため)
  useLayoutEffect(() => {
    const box = previewBoxRef.current
    const inner = previewInnerRef.current
    if (zoom !== 'fit' || !box || !inner) return
    const calc = () => {
      inner.style.zoom = '1'
      const h = inner.offsetHeight
      // 高さだけでなく、幅にも収める(ペインを狭めたとき、横にはみ出さないように)
      const w = (inner.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
      const byHeight = h > 0 ? (box.clientHeight - 16) / h : 1
      const byWidth = w > 0 ? (box.clientWidth - 8) / w : 1
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, byHeight, byWidth))
      inner.style.zoom = String(z)
      setFitZoom(z)
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(box)
    // 中身(倍率をかける前のメール)の大きさ。倍率を変えても、この大きさは変わらないので、測り直しが続くことはない
    const content = inner.firstElementChild
    if (content) ro.observe(content)
    return () => {
      ro.disconnect()
      inner.style.zoom = ''
    }
  }, [zoom, previewTab, simpleOn])

  const shownZoom = zoom === 'fit' ? fitZoom : zoom

  // プレビューのリンクの場所と、その URL(リンク先の設定の欄と同じ決め方。W12)
  const linkCampaign = campaignSlug(form.name, form.scheduledAt)
  const linkSpots = useMemo(() => linkSlots(template, items, products, linkCampaign, form.country), [template, items, products, linkCampaign, form.country])
  // AB テストの配信は、いま編集している案の印を campaign に付ける(X55)
  const linkVariant = ab ? active : null
  // utm_campaign の既定値は、配信日 + 配信カードの ID(links.ts の「UTM の決まり」)。リンク先のページの名前(linkCampaign)とは分ける
  const utmCampaign = campaignId(card?.id, form.scheduledAt)
  const linkUtm = utmFor(links, utmCampaign, linkVariant)
  const fcmCampaign = variantCampaign(linkCampaign, linkVariant)
  // アプリの配信は、URL の代わりに、開く画面(FCM の data)を出す
  const linkUrlOf = (slot: LinkSlot) => {
    if (previewTab === 'push') {
      const d = fcmText(screenOf(links, slot), fcmCampaign)
      return d ? `data: ${d}` : ''
    }
    const url = ((slot.kind === 'hero' ? links.hero : links.buttons?.[slot.key]) ?? '').trim() || slot.defaultUrl
    return url ? withUtm(url, linkUtm, slot.content) : ''
  }
  const productLinkOf = (itemKey: string) => {
    const index = items.findIndex((x) => x.key === itemKey)
    const it = items[index]
    const p = it && productById.get(it.productId)
    if (!p) return undefined
    if (previewTab === 'push') return { name: p.name, url: p.product_code ? `data: ${fcmText({ kind: 'product', value: p.product_code }, fcmCampaign)}` : '' }
    return { name: p.name, url: withUtm(productUrl(p), linkUtm, productContent(index, p.product_code)) }
  }
  const stepZoom = (d: number) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((shownZoom + d) * 20) / 20)))




  // テンプレートの最近の使用回数(X4。② テンプレートで選ぶとき。この配信の配信日・国を基準に)
  const templateUseMap = useMemo(() => (allCards ? templateUse(allCards, form.scheduledAt || undefined, form.country || undefined, card?.id) : undefined), [allCards, form.scheduledAt, form.country, card?.id])

  // AI の案の状態と生成(案は採用するまで、配信カードには反映しない)
  const drafts = useAiDrafts(
    {
      buildCard: buildAiCard,
      products: poolProducts,
      heroes: poolHeroes,
      otherThemes,
      template,
      items,
      candidates,
      sectionTitles,
      sectionCopies,
      heroId,
      heroReason,
      language,
      subject: form.subject,
      // AB テストで件名を案ごとに持ち、B・C 案を編集中なら、A 案と違う切り口の件名にする
      subjectAb: () =>
        ab && active !== 'A' && ownsSubject(ab)
          ? { key: active, compareWith: { subject: textsOf('A').subject || form.name, preheader: textsOf('A').preheader ?? '' }, hypothesis: ab.hypothesis.trim() }
          : null,
    },
    setError,
  )

  // ---- すべてAIで下書き(テーマ → テンプレート・メイン画像 → ヘッドライン・コピー → 各セクション → 制作指示)
  const applyAutoResult = (res: AutoDraftResult) => {
    if (res.template) setTemplate(res.template)
    setForm((f) => ({
      ...f,
      theme: res.theme ?? f.theme,
      themeReason: res.theme ? (res.themeIdeas[0]?.reason ?? '') : f.themeReason,
      headline: res.headline ?? f.headline,
      copy: res.copy ?? f.copy,
      copyAngle: res.headline ? (res.copyIdeas[0]?.angle ?? '') : f.copyAngle,
      instructions: res.instructions ?? f.instructions,
      instructionsAngle: res.instructions ? (res.instructionIdeas[0]?.angle ?? '') : f.instructionsAngle,
      pushTitle: res.pushTitle ?? f.pushTitle,
      pushBody: res.pushBody ?? f.pushBody,
    }))
    const toItem = (r: { productId: string; reason: string }): Item => ({ key: crypto.randomUUID(), productId: r.productId, reason: r.reason, source: SOURCE_AI })
    if (res.sections.some((sec) => sec.selected.length > 0)) {
      setItems(res.sections.flatMap((sec) => sec.selected.map(toItem)))
      setCandidates(res.sections.flatMap((sec, i) => sec.candidates.map((r) => ({ ...toItem(r), section: i }))))
    }
    if (res.sections.length > 0) {
      setSectionTitles(res.sections.map((sec) => sec.title))
      setSectionCopies(res.sections.map((sec) => sec.copy))
    }
    if (res.hero) {
      if (res.hero.hero) {
        setHeroId(res.hero.hero.heroId)
        setHeroReason(res.hero.hero.reason)
      }
      setHeroCandidates(res.hero.candidates)
    }
    drafts.applyAuto({
      themeIdeas: res.themeIdeas,
      copyIdeas: res.copyIdeas,
      instructionIdeas: res.instructionIdeas,
      pushIdeas: res.pushIdeas,
      titleCandidates: Object.fromEntries(res.sections.map((sec, i) => [i, sec.titles])),
      sectionCopyCandidates: Object.fromEntries(res.sections.map((sec, i) => [i, sec.copies])),
    })
    setSelectedKey(null)
    if (res.errors.length > 0) setError(t(`一部の工程で失敗しました: ${res.errors.join(' / ')}`, `Some steps failed: ${res.errors.join(' / ')}`))
  }

  // すべて AI で下書きした中身は、自動では保存しない(下書きの知らせのとおり、気に入らなければ保存せずに閉じられるように)。
  // 下書きが済んだときの中身を覚え、人がそこから直したら、下書きの分も一緒に保存する
  const [draftPending, setDraftPending] = useState(false)
  const [draftKey, setDraftKey] = useState<string | null>(null)
  useEffect(() => {
    if (!draftPending || auto !== null) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftPending(false)
    setDraftKey(currentKey)
  }, [draftPending, auto, currentKey])
  async function startAutoDraft() {
    if (!form.scheduledAt) {
      setError(t('すべてAIで下書きするには、先に配信日時を入力してください', 'Enter the send date & time first to draft everything with AI'))
      return
    }
    cancelRef.current = false
    setError(null)
    setDraftPending(true)
    setAuto({ label: t('準備しています', 'Getting ready'), done: 0, total: 7 })
    const res = await runAutoDraft(
      { card: buildAiCard(), language, otherThemes, products: poolProducts, heroes: poolHeroes, channel: templateChannel, country: form.country || undefined },
      (label, done, total) => setAuto({ label, done, total }),
      () => cancelRef.current || !aliveRef.current,
    )
    if (!cancelRef.current && aliveRef.current) applyAutoResult(res)
    setAuto(null)
  }

  const hasContent = !!(form.theme.trim() || form.headline.trim() || form.copy.trim() || form.instructions.trim() || items.length > 0 || heroId)

  async function runAllManual() {
    if (hasContent && !(await confirmDialog(t('現在のテーマ・ヘッドライン・コピー・商品・メイン画像・制作指示を、AIの下書きで置き換えます。よろしいですか?', 'This replaces the current theme, headline, copy, products, hero image, and production notes with an AI draft. Continue?')))) return
    void startAutoDraft()
  }

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // 既存のカードを開いたとき、自動で下書きを作る(同じカードで、1 回だけ):
  // ・内容が空のとき
  // ・使ったテンプレートが登録に見つからないとき(削除された・版が残っていない。代わりのテンプレートで描くので、保存した見出し・商品の枠がずれる。
  //   SU1。2026-10-23 利用者 OK)。テンプレートも AI が選び直す。保存するまでは、キャンセルで元に戻せる
  // どちらも、テンプレートの読み込みが済んでから判定する(済む前は、作ったテンプレートがまだ登録にない)
  useEffect(() => {
    if (!card || original === null) return
    if (products.length === 0 || heroes.length === 0 || !templatesSettled()) return
    if (autoDrafted.has(card.id)) return
    autoDrafted.add(card.id)
    const missing = templateMissing(templateKeyOfCard(card))
    if (missing) {
      // 版だけがないときは、テンプレートの名前と版の番号で見せる(ID より分かりやすい)。テンプレートごとないときは ID のまま
      const { id, version: v } = splitTemplateKey(templateKeyOfCard(card))
      const label = !templateMissing(id) && v !== undefined ? t(`${getTemplate(id).label} の版 ${v}`, `${getTemplate(id).label}, version ${v}`) : id
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMissingTemplate({ key: label, redrafted: autoEnabled })
    }
    if (autoEnabled && (!hasContent || missing)) void startAutoDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, original, products.length, heroes.length, templatesVersion])

  // テンプレートを変えると、セクションの構成が変わるので、候補と商品選定の案は破棄する
  const changeTemplate = (id: EmailTemplateId) => {
    if (applyTemplate(id)) drafts.discardProposals()
  }




  const weekRange = (w: WeekRow) => {
    const s = new Date(`${w.week_start?.slice(0, 10)}T00:00:00`)
    const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)
    const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
    return `${f(s)}–${f(e)}`
  }

  // ---- アラートへの対応(上の帯・プレビューの商品の枠・商品情報の行から開く。差し替えは、この配信カードの中で置き換えて、保存で確定)
  const { actAlert, setActAlert, productOpen, setProductOpen, slotAction, setSlotAction, floatSwap, setFloatSwap, liveAlerts, itemAlertKinds, openAlertFor, alertCard, replaceForAlert, swapWithCandidate, setItemImage, replaceItemWith, productAlertKinds, postponeForAlert, openAlertsScreen } = useCardAlerts({ alerts, items, setItems, candidates, setCandidates, productById, card, draft, setAlertNotes, surfaceRef, onOpenAlerts, hasChanges: () => changed })

  const progress = progressOf({
    theme: form.theme,
    template,
    heroId,
    headline: form.headline,
    items,
    instructions: form.instructions,
    links: linksComplete(linkSpots, links, templateChannel === 'push' ? { tapDone: tapComplete(pushLink) } : undefined),
    push: templateChannel === 'push' ? { title: form.pushTitle, body: form.pushBody } : undefined,
  })
  const hero = heroes.find((h) => h.id === heroId)

  // ---- 2 つの画面(今の配信カード・シンプルな配信カード SU1)で共通の部品
  const noticesNode = (
    <>
    {card?.cancelled_at && (
      <MessageBar layout="multiline" intent="warning" className={styles.locked}>
        <MessageBarBody>
          {t(
            `この配信は取りやめ済みです(${new Date(card.cancelled_at).toLocaleString(locale())})。理由: ${card.cancel_reason || '—'}。元に戻すときは、右上の「…」から「取りやめを取り消す」`,
            `This delivery was cancelled (${new Date(card.cancelled_at).toLocaleString(locale())}). Reason: ${card.cancel_reason || '—'}. To restore it, use "…" > "Undo cancellation".`,
          )}
        </MessageBarBody>
      </MessageBar>
    )}

    {/* 承認済みの配信: シンプルな画面は自動で保存するので、確かめの窓は出さず、開いたときから帯で知らせ、最初の書き換えで帯の文を変える(レビューの 7) */}
    {approvedBefore && lockedWeeks.length === 0 && simpleOn && (
      <MessageBar layout="multiline" intent={changed ? 'warning' : 'info'} className={styles.locked}>
        <MessageBarBody>
          {changed
            ? t('承認待ちに戻ります。保存すると、承認の依頼からやり直しになります。', 'This goes back to awaiting approval. Saving needs a new approval request.')
            : t('承認済みです。直すと承認待ちに戻ります。', 'Approved. Editing puts it back to awaiting approval.')}
        </MessageBarBody>
      </MessageBar>
    )}
    {approvedBefore && lockedWeeks.length === 0 && !simpleOn && changed && (
      <MessageBar layout="multiline" intent="info" className={styles.locked}>
        <MessageBarBody>
          {t(
            '承認済みの配信の内容を変えています。保存すると「承認待ち」に戻り、承認の依頼からやり直しになります。',
            'You are changing an approved delivery. Saving puts it back to awaiting approval and needs a new approval request.',
          )}
        </MessageBarBody>
      </MessageBar>
    )}
    {lockedWeeks.length > 0 && changed && (
      <MessageBar layout="multiline" intent="warning" className={styles.locked}>
        <MessageBarBody>
          {t(
            `確定した週(${lockedWeeks.map(weekRange).join('、')})の配信を変えています。保存するときは、理由を入力します。保存すると、この配信は「承認待ち」に戻り、週の確定は解けます。`,
            `You are changing a delivery in a confirmed week (${lockedWeeks.map(weekRange).join(', ')}). To save, enter a reason. Saving puts this delivery back to awaiting approval and the week is no longer confirmed.`,
          )}
        </MessageBarBody>
      </MessageBar>
    )}
    </>
  )
  const productFloat = (
    <>
    {/* 商品の対応のフロート(X54): アラートの札・商品の行の、どこから開いても、これ 1 つ */}
    {(actAlert || productOpen) && (() => {
      const item = actAlert ? items.find((i) => i.productId === actAlert.productId) : items.find((i) => i.key === productOpen)
      // シンプルな配信カードの商品の一覧では、候補の行からも開く(詳しい情報を見るだけ。差し替えは、選んだ枠への操作で)
      const cand = !actAlert && !item ? candidates.find((c) => c.key === productOpen) : undefined
      const product = productById.get(item?.productId ?? cand?.productId ?? actAlert?.productId ?? '')
      const idx = item ? items.indexOf(item) : -1
      const section = idx >= 0 ? sectionIndexAt(sectionsOf(template), idx) : -1
      const options: SwapOption[] = candidates.filter((c) => c.section === section).flatMap((c) => {
        const p = productById.get(c.productId)
        return p ? [{ key: c.key, product: p, reason: c.reason, source: c.source }] : []
      })
      const closeAction = () => {
        setActAlert(null)
        setProductOpen(null)
        setSlotAction(null)
        setFloatSwap(null)
      }
      return (
        <ProductActionFloat
          key={`${actAlert ? `alert:${actAlert.kind}:${actAlert.productId ?? ''}` : `item:${productOpen}`}`}
          product={product}
          alert={actAlert ?? undefined}
          card={alertCard}
          scheduledAt={form.scheduledAt}
          inCard={new Set(items.map((i) => i.productId))}
          products={products}
          poolProducts={poolProducts}
          model={stockModel}
          weekUse={weekUse}
          alertKinds={productAlertKinds}
          options={options}
          image={item?.imageUrl}
          delivery={{ theme: form.theme, headline: form.headline, copy: form.copy, themeType: form.themeType ? themeTypeLabel(form.themeType as ThemeType) : '' }}
          onImage={item ? (url, source) => setItemImage(item.key, url, source) : undefined}
          onSwapCandidate={
            item
              ? (candKey, reason) => {
                  swapWithCandidate(item.key, candKey, reason)
                  closeAction()
                }
              : undefined
          }
          onReplace={
            item
              ? (to, reason) => {
                  if (actAlert) replaceForAlert(actAlert, to, reason)
                  else replaceItemWith(item.key, to, reason)
                  closeAction()
                }
              : undefined
          }
          onPostpone={() => {
            setProductOpen(null)
            postponeForAlert()
          }}
          onOpenAlerts={actAlert ? () => openAlertsScreen(actAlert.productId) : undefined}
          aiCard={buildAiCard}
          angle={form.copyAngle}
          onOpenSwap={
            floatSwap && floatSwap.key === productOpen && !actAlert && !slotAction
              ? () => {
                  closeAction()
                  floatSwap.run()
                }
              : undefined
          }
          slotAction={
            slotAction && !actAlert
              ? {
                  label: slotAction.label,
                  run: () => {
                    slotAction.run()
                    closeAction()
                  },
                }
              : undefined
          }
          onClose={closeAction}
        />
      )
    })()}
    </>
  )
  const alertsNode = (
    <>
    {/* この配信のアラート(在庫・方針・日程)。ふだんは 1 行にたたむ。アラートの画面から開いたときは、開いておく */}
    {liveAlerts.length > 0 && (
      <CardAlertsBar
        alerts={liveAlerts}
        onAct={alertCard ? setActAlert : undefined}
        defaultOpen={!!focusProductId}
        selectedProductId={items.find((i) => i.key === selectedKey)?.productId}
        onSelectProduct={(pid) => {
          const it = items.find((i) => i.productId === pid)
          if (it) setSelectedKey(it.key)
        }}
      />
    )}
    </>
  )
  const heroUploadNode = (
    <>
    {heroUpload && (
      <HeroUploadDialog
        market={cardMarket(form.country)}
        cardId={card?.id}
        me={myName() || form.owner}
        file={heroUpload instanceof File ? heroUpload : undefined}
        onClose={() => setHeroUpload(false)}
        onDone={async (h) => {
          await onHeroesChanged?.()
          setHeroId(h.id)
          setHeroReason(tr('持っている画像を上げて使った', 'Uploaded and used'))
          setHeroUpload(false)
        }}
      />
    )}
    </>
  )

  const zoomBox = (
    <div className={styles.zoomBox}>
      <Button type="button" size="small" appearance="subtle" icon={<SubtractRegular />} onClick={() => stepZoom(-0.1)} aria-label={t('縮小', 'Zoom out')} />
      <Slider
        size="small"
        className={styles.slider}
        min={ZOOM_MIN * 100}
        max={ZOOM_MAX * 100}
        step={5}
        value={Math.round(shownZoom * 100)}
        onChange={(_, d) => setZoom(d.value / 100)}
        aria-label={t('プレビューの倍率', 'Preview zoom')}
      />
      <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} onClick={() => stepZoom(0.1)} aria-label={t('拡大', 'Zoom in')} />
      <Caption1 className={styles.zoomLabel}>{Math.round(shownZoom * 100)}%</Caption1>
      {/* ボタンの文字は、押したときの動きを表す: 全体表示にする前は「全体」、全体表示のときは「100%」(押すと100%に戻る) */}
      <Button
        type="button"
        size="small"
        appearance={zoom === 'fit' ? 'primary' : 'outline'}
        onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')}
        aria-label={zoom === 'fit' ? t('100% の倍率に戻す', 'Reset to 100%') : t('メール全体を表示', 'Fit the whole email')}
      >
        {zoom === 'fit' ? '100%' : t('全体', 'Fit')}
      </Button>
    </div>
  )
  const abCompareNode = (
    <>
      {ab && comparing === 'live' && (
        <AbCompare
          ab={ab}
          base={{ id: card?.id ?? 'draft', ...buildContent(), hero_image_id: null } as DeliveryCard}
          variants={allVariants(ab).map((k) => ({ key: k, productIds: itemsOf(k).map((i) => i.productId), heroId: heroOf(k).heroId, texts: ownsAnyText(ab) ? textsOf(k) : undefined, template: templateOfV(k) }))}
          products={products}
          heroes={heroes}
          onEdit={switchVariant}
          onClose={() => setComparing(null)}
        />
      )}
    </>
  )

  // ---- シンプルな配信カード(SU1。docs/SIMPLE_CARD.md)。状態と保存は、上のものをそのまま使い、描き方だけを替える
  const undoStack = useUndo<Snapshot>()
  // AI の案(メイン画像・商品)を、プレビューにだけ仮に写す(保存する中身は変えない)
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null)
  // これまでの学びの件数(シンプルな画面の「目印」に出す)
  const [learnCount, setLearnCount] = useState(0)
  const shownHero = aiPreview?.heroId ? heroes.find((h) => h.id === aiPreview.heroId) : hero
  const previewItem = aiPreview?.item
  const shownItems = previewItem
    ? previewItem.key
      ? items.map((i) => (i.key === previewItem.key ? { ...i, productId: previewItem.productId, imageUrl: undefined } : i))
      : [...items, { key: '__ai_preview', productId: previewItem.productId, reason: '', source: SOURCE_AI }]
    : items
  const [pendingUndoSave, setPendingUndoSave] = useState(false)
  const locked = lockedWeeks.length > 0
  /** 反映(保存して開いたまま)。成功したら、反映の前の中身を、元に戻すの履歴に積む */
  const saveStaying = async (reason?: string, push = true, force = false) => {
    const before = committedSnap.current
    const ok = await save({ after: 'stay', reason, force })
    if (ok && push && before) undoStack.push(before)
  }
  /** 別の部品を選んだときの反映。変わっていなければ何もしない。確定した週の配信は、反映のボタンで */
  const commitSimple = async () => {
    if (saving || locked || !isDirty()) return
    await saveStaying()
  }
  // シンプルな配信カードは、入力が止まって約 1.5 秒で保存する(Notion などと同じ。部品を選び直すまで保存しないと、タブを閉じたときに消えるため)。
  // 確定した週の配信は、理由が要るので自動では保存しない(上の帯の保存のボタンで)。保存中に書き換えた分は、保存が終わってから、また待って保存する
  useEffect(() => {
    if (!simpleOn || locked || !changed || saving || draftPending || currentKey === draftKey || saveError?.key === currentKey) return
    const id = window.setTimeout(() => void commitSimple(), 1500)
    return () => window.clearTimeout(id)
    // 待つのは、中身が変わるたびに数え直す(commitSimple は、その描画の中身で保存する)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, simpleOn, locked, changed, saving, draftPending, draftKey, saveError])
  // 保存していない変更がある間は、タブを閉じる・読み直すときに、ブラウザに確かめてもらう
  useEffect(() => {
    if (!changed) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changed])
  // ほかの人が先に保存していたとき: 上書きする(確定した週なら、入れた理由で)か、閉じて読み直す(閉じると一覧を読み直すので、開き直すと、ほかの人の中身)
  const overwriteSave = () => {
    const reason = lockedWeeks.length > 0 && changeReason?.trim() ? changeReason : undefined
    if (simpleOn) void saveStaying(reason, true, true)
    else void save({ after: 'stay', reason, force: true })
  }
  const conflictTime = saveError?.conflict?.at ? new Date(saveError.conflict.at).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
  const applySimple = () => {
    if (saving) return
    // 確定した週の配信は、すぐには保存せず、理由の入力欄を出す(保存は、理由の欄のボタンから saveStaying)
    if (locked) askReason('stay')
    else void commitSimple()
  }
  /** 元に戻す: 前に反映したときの中身に戻して、保存する(行 ID は、いまも残っている行だけ使う。消えた行は新しい行として作り直す) */
  const undoSimple = () => {
    if (saving) return
    const snap = undoStack.pop()
    if (!snap) return
    const alive = <T extends Item>(x: T): T => (x.rowId && original?.has(x.rowId) ? x : { ...x, rowId: undefined })
    // ステータスは戻さない(承認のやり直しを、元に戻すで飛ばさないように)
    setForm({ ...snap.form, status: form.status })
    setItems(snap.items.map(alive))
    setCandidates(snap.candidates.map(alive))
    setHeroId(snap.heroId)
    setHeroReason(snap.heroReason)
    setSectionTitles(snap.sectionTitles)
    setSectionCopies(snap.sectionCopies)
    setTemplate(snap.template)
    setLinks(snap.links)
    setPushLink(snap.pushLink)
    setAudience(snap.audience)
    setPendingUndoSave(true)
  }
  // 戻した中身で保存する(state を戻した次の描画の save を使うため、effect で呼ぶ)
  useEffect(() => {
    if (!pendingUndoSave) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingUndoSave(false)
    // 確定した週の配信は、理由の入力を待って保存する(元に戻すの保存は、履歴に積まない)
    if (lockedWeeks.length > 0) askReason('stay', false)
    else void saveStaying(undefined, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUndoSave])
  /** 確定した週の、理由の欄の保存のボタン */
  const saveWithReason = (reason: string) => {
    if (!simpleOn) {
      void save({ after: pendingSave?.after ?? 'close', reason })
      return
    }
    void saveStaying(reason, pendingSave?.recordUndo ?? true)
  }
  const nextStep = nextStepOf({ status: form.status, handedOff: !!form.handedOffAt })
  /** 詳しい画面(今の配信カード)で続ける。コミュニケーションの段階(d)ができるまで、承認・制作への依頼はこちらで */
  const openDetailed = (tab?: TalkTab) => {
    changeView(false, false)
    if (!processOpen) toggleProcess()
    if (tab) setTabRequest((r) => ({ tab, seq: (r?.seq ?? 0) + 1 }))
  }
  const runNext = (step: NextStep) => {
    if (step === 'openProduction') {
      if (card) {
        void commitSimple()
        onOpenProduction?.(card.id)
      }
    } else openDetailed(step === 'requestProduction' ? 'handoff' : undefined)
  }
  /** 閉じる: 変更があれば反映してから閉じる(確定した週の配信は、捨てるかを聞く) */
  const closeSimple = async () => {
    if (saving) return
    if (!isDirty()) {
      onBack()
      return
    }
    if (locked) {
      if (await confirmDialog(tr('確定した週の配信の変更を、保存せずに閉じます。よろしいですか?(保存するときは「理由を入力して保存」)', 'Close without saving the changes to this confirmed-week delivery? (To save, use “Save with a reason”.)'))) onBack()
      return
    }
    void save({ after: 'close' })
  }
  // プレビュー(memo)に渡す関数は、いつも同じものを渡す(打つたびに、プレビューまで描き直さないように)
  const previewSectionTitle = useStableCallback(setSectionTitle)
  const previewSectionCopy = useStableCallback(setSectionCopy)
  const previewClearHero = useCallback(() => setHeroId(undefined), [setHeroId])
  const previewNoSelect = useCallback(() => undefined, [])
  const previewRemove = useStableCallback(removeItem)
  const previewMove = useStableCallback((key: string, d: number) => {
    const i = items.findIndex((x) => x.key === key)
    moveItem(i, i + d)
  })
  const previewDropAt = useStableCallback(dropAt)
  // 詳しい画面とシンプルな画面のプレビューに、同じく渡すもの(違うのは、商品・選んだ枠・テンプレート・画像・押したとき・部品を選ぶ見せ方)
  const previewCommon = {
    channel: previewTab,
    country: form.country,
    pushLinkKind: pushLink?.kind,
    pushTitle: form.pushTitle,
    pushBody: form.pushBody,
    subject: form.name,
    subjectLine: form.subject,
    preheader: form.preheader,
    device: previewDevice,
    headline: form.headline,
    copy: form.copy,
    products,
    hoverKey,
    showHeadings,
    scheduledAt: form.scheduledAt,
    sectionTitles,
    onSectionTitle: previewSectionTitle,
    sectionCopies,
    onSectionCopy: previewSectionCopy,
    onDropHero: setHeroId,
    onClearHero: previewClearHero,
    onRemove: previewRemove,
    onMove: previewMove,
    onDropAt: previewDropAt,
  }
  // AI の文言の案を、プレビューにだけ重ねる(保存する中身は変えない)
  const pt = aiPreview?.texts
  const shownTexts = pt
    ? {
        headline: pt.headline ?? form.headline,
        copy: pt.copy ?? form.copy,
        subjectLine: pt.subject ?? form.subject,
        preheader: pt.preheader ?? form.preheader,
        pushTitle: pt.pushTitle ?? form.pushTitle,
        pushBody: pt.pushBody ?? form.pushBody,
        sectionTitles: pt.sectionTitles ?? sectionTitles,
        sectionCopies: pt.sectionCopies ?? sectionCopies,
      }
    : {}
  const simplePreview = (
    <>
      <div ref={previewInnerRef} style={{ zoom: zoom === 'fit' ? undefined : zoom }}>
        <Preview
          {...previewCommon}
          {...shownTexts}
          items={shownItems}
          // 選んだ部品の枠は、部品を選ぶ層が描く(二重に光らせない)
          selectedKey={null}
          template={aiPreview?.templateId ?? template}
          hero={shownHero}
          onSelect={previewNoSelect}
          pickMode
        />
      </div>
    </>
  )
  // 確定した週の、変えた理由の入力欄(詳しい画面はフッター、シンプルな画面は上の帯の保存のボタンの下の Popover)
  const reasonForm = changeReason !== null && (
    <>
      <Field label={t('確定後の変更の理由', 'Reason for changing a confirmed week')} required size="small">
        <AutoTextarea heightKey="CardDetail.changeReason"
          rows={2}
          size="small"
          autoFocus
          value={changeReason}
          onChange={(_, d) => setChangeReason(d.value)}
          placeholder={t('例: 在庫切れのため、商品を入れ替え', 'e.g. Replaced a product that went out of stock')}
        />
      </Field>
      <div className={styles.reasonActions}>
        <Button
          type="button"
          size="small"
          onClick={cancelReason}
          disabled={saving}
        >
          {t('やめる', 'Cancel')}
        </Button>
        <Button type="button" size="small" appearance="primary" icon={<SaveRegular />} disabled={saving || !changeReason.trim()} onClick={() => saveWithReason(changeReason)}>
          {t('保存して、週の確定を解く', 'Save and undo the week confirmation')}
        </Button>
      </div>
    </>
  )
  const footerNode = (
    <>
    {missingTemplate && (
      <MessageBar layout="multiline" intent="warning" className={styles.error}>
        <MessageBarBody>
          {missingTemplate.redrafted
            ? t(
                `この配信が使っていたテンプレート(${missingTemplate.key})が見つからないため、AI がテンプレートを選び直して下書きし直しました。保存するまでは、キャンセルで元に戻せます。`,
                `The template this delivery used (${missingTemplate.key}) was not found, so AI chose a template and redrafted it. Cancel to discard before saving.`,
              )
            : t(
                `この配信が使っていたテンプレート(${missingTemplate.key})が見つからないため、代わりのテンプレートで表示しています。見出し・商品の枠がずれていることがあります。`,
                `The template this delivery used (${missingTemplate.key}) was not found, so it is shown with a substitute. Headings and product slots may be off.`,
              )}
        </MessageBarBody>
        {/* 自動の下書きを切っているときは、ここから作り直す(シンプルな配信カードには「すべてAIで下書き」のボタンがないため) */}
        {!missingTemplate.redrafted && (
          <MessageBarActions>
            <Button
              size="small"
              disabled={auto !== null}
              onClick={() => {
                setMissingTemplate({ ...missingTemplate, redrafted: true })
                void startAutoDraft()
              }}
            >
              {t('AI で下書きし直す', 'Redraft with AI')}
            </Button>
          </MessageBarActions>
        )}
      </MessageBar>
    )}
    {error && (
      <MessageBar layout="multiline" intent="error" className={styles.error}>
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    )}
    {/* 保存の失敗(シンプルな配信カードは、上の帯に出す) */}
    {saveError && !simpleOn && !saveError.conflict && (
      <MessageBar layout="multiline" intent="error" className={styles.error}>
        <MessageBarBody>{saveError.message}</MessageBarBody>
      </MessageBar>
    )}
    {/* ほかの人が先に保存していた(黙って上書きしない) */}
    {saveError?.conflict && !simpleOn && (
      <MessageBar layout="multiline" intent="warning" className={styles.error}>
        <MessageBarBody>
          {t(
            `ほかの人が、この配信を先に保存しました${conflictTime ? `(${conflictTime})` : ''}。上書きすると、その変更は消えます。`,
            `Someone else saved this delivery first${conflictTime ? ` (${conflictTime})` : ''}. Overwriting discards their changes.`,
          )}
        </MessageBarBody>
        <MessageBarActions>
          <Button size="small" disabled={saving} onClick={overwriteSave}>
            {t('上書きする', 'Overwrite')}
          </Button>
          <Button size="small" appearance="primary" disabled={saving} onClick={onBack}>
            {t('閉じて読み直す', 'Close and reload')}
          </Button>
        </MessageBarActions>
      </MessageBar>
    )}
    {/* 確定した週の、変えた理由の入力(シンプルな配信カードは、上の帯の保存のボタンの下に出す) */}
    {changeReason !== null && lockedWeeks.length > 0 && !simpleOn && <div className={styles.reasonBox}>{reasonForm}</div>}
    </>
  )
  // 商品の枠のアラートの印(押すと、その商品のアラートへの対応を開く)。詳しい画面とシンプルな画面で同じ
  const itemAlertOverlay = (
    <ItemAlertOverlay
      boxRef={previewBoxRef}
      kinds={itemAlertKinds}
      onOpen={(key) => {
        const it = items.find((i) => i.key === key)
        if (it) openAlertFor(it.productId)
      }}
    />
  )
  /** 配信カードの ⋯ のメニュー(複製・取りやめ・削除。保存済みの配信だけ)。シンプルな画面は、項目を足して使う */
  const cardMenu = (extra?: ReactNode) =>
    card && (
      <CardMenu
        card={card}
        weeks={weeks}
        onChanged={async () => {
          await onSaved()
          onBack()
        }}
        onDeleted={async () => {
          await onSaved()
          onBack()
        }}
        // 複製した配信を読み込んでから、それに開き直す(onReopen は開く配信を差し替える)
        onDuplicated={async (id) => {
          await onSaved()
          onReopen?.(id)
        }}
        extra={extra}
      />
    )
  const simpleAlertOverlay = (
    <>
    {itemAlertKinds.size > 0 && (
      // アラートの印を押しても、部品を選び直さない
      <div data-no-pick>{itemAlertOverlay}</div>
    )}
    </>
  )
  const simpleEditor: SimpleEditor | null = card
    ? {
        card,
        form,
        aiCard: buildAiCard,
        setField: (k, v) => set(k)(v),
        channel: previewTab,
        template,
        ab: ab ? { keys: allVariants(ab), active, purpose: ab.purpose ?? 'test', canAdd: !!nextVariant(ab), busy: abAiBusy } : null,
        abSwitch: switchVariant,
        abAdd: abAddSimple,
        abRemove: removeVariant,
        abCompare: () => setComparing('live'),
        abSettings: ab ? <AbSettings ab={ab} active={active} target={saveTarget() ?? ab.target} onChange={setAb} onDecide={decideVariant} onStop={stopAbTest} /> : null,
        abDiffParts: abDiff?.parts ?? [],
        items,
        candidates,
        products,
        poolProducts,
        poolHeroes,
        hero,
        heroReason,
        heroCandidates,
        setHero: (id, reason) => {
          setHeroId(id)
          setHeroReason(reason)
        },
        uploadHero: (file?: File) => setHeroUpload(file ?? true),
        sectionTitles,
        sectionCopies,
        setSectionTitle,
        setSectionCopy,
        applyTexts: (x) => {
          setForm((f) => ({
            ...f,
            ...(x.subject !== undefined ? { subject: x.subject } : {}),
            ...(x.preheader !== undefined ? { preheader: x.preheader } : {}),
            ...(x.headline !== undefined ? { headline: x.headline } : {}),
            ...(x.copy !== undefined ? { copy: x.copy } : {}),
            ...(x.pushTitle !== undefined ? { pushTitle: x.pushTitle } : {}),
            ...(x.pushBody !== undefined ? { pushBody: x.pushBody } : {}),
          }))
          if (x.sectionTitles) setSectionTitles(x.sectionTitles)
          if (x.sectionCopies) setSectionCopies(x.sectionCopies)
        },
        links,
        setLinks,
        linkSpots,
        alertKinds: productAlertKinds,
        addProduct,
        removeItem,
        moveItem,
        swapItems,
        swapWithCandidate,
        openProduct: (key, action, swap) => {
          setActAlert(null)
          setSlotAction(action ?? null)
          setFloatSwap(swap ? { key, run: swap } : null)
          setProductOpen(key)
        },
        hoverProduct: setHoverKey,
        replaceItem: (itemKey, productId, reason) => {
          const to = productById.get(productId)
          if (to) replaceItemWith(itemKey, to, reason)
        },
        setAiPreview,
        previewTexts: aiPreview?.texts ?? null,
        setTemplate: changeTemplate,
        saving,
        dirty: changed,
        locked,
        justSaved,
        savedAt,
        saveError: saveError?.message ?? null,
        saveConflict: saveError?.conflict ? { at: conflictTime, overwrite: overwriteSave, reload: onBack } : null,
        retrySave: applySimple,
        reasonOpen: changeReason !== null && lockedWeeks.length > 0,
        reasonForm,
        cancelReason,
        canUndo: undoStack.canUndo,
        nextStep,
        menu: cardMenu(
          <>
            <MenuItem icon={<AiIcon size={16} />} disabled={!!auto || saving} onClick={runAllManual}>
              {t('すべて AI で下書き', 'Draft everything with AI')}
            </MenuItem>
            {next !== undefined && (
              <MenuItem icon={<ArrowNextRegular />} disabled={saving || !next} onClick={saveAndNext}>
                {next ? t(`保存して次へ(${next.name})`, `Save and next (${next.name})`) : t('保存して次へ(次の配信はありません)', 'Save and next (no next delivery)')}
              </MenuItem>
            )}
            {onOpenResults && card.scheduled_at && new Date(card.scheduled_at) < new Date() && (
              <MenuItem icon={<DataBarVerticalRegular />} onClick={() => onOpenResults(card.id)}>
                {t('結果を見る', 'View results')}
              </MenuItem>
            )}
          </>,
        ),
        stageNav: stageTabs ?? stageNav,
        viewSwitch: <ViewSwitch simple onChange={changeView} />,
        preview: simplePreview,
        device: previewDevice,
        setDevice: pickDevice,
        zoom: { mode: zoom, shown: shownZoom, set: setZoom, min: ZOOM_MIN, max: ZOOM_MAX, step: stepZoom },
        // アラートは左のバーの「アラート」に出す(SU6。上の帯に置くと、作業する場所を狭めるため)
        notices: noticesNode,
        footer: footerNode,
        alertOverlay: simpleAlertOverlay,
        alerts: liveAlerts,
        actAlert: alertCard ? setActAlert : undefined,
        setHandoff: (k, v) => setForm((f) => ({ ...f, [k]: v })),
        remaining: progress.remaining,
        people: owners,
        canReview,
        reload: onSaved,
        openProduction: onOpenProduction && card ? (opts) => onOpenProduction(card.id, opts) : undefined,
        learnings: <LearningsBar card={card} templateId={template} country={form.country} channel={form.channel} name={form.name} theme={form.theme} headline={form.headline} themeType={form.themeType} onCount={setLearnCount} panel />,
        learnCount,
      }
    : null

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open && !saving) onBack() }}>
      <ResizableSurface ref={surfaceRef} sizeKey="cardDetail" prefKey={PREF.cardSize} min={MIN_DIALOG} className={styles.surface} aria-label={card ? card.name : draft ? draft.card.name : t('配信カードの新規作成', 'New delivery card')}>
        <form onSubmit={submit} className={styles.form}>
          {auto && (
            <div className={styles.overlay}>
              <Spinner size="large" />
              <Text as="h2" size={500} weight="semibold">{t('AIが下書きを作っています', 'AI is drafting')}</Text>
              <Text>{auto.label}({Math.min(auto.done + 1, auto.total)} / {auto.total})</Text>
              <ProgressBar className={styles.overlayBar} value={Math.min(1, auto.done / auto.total)} />
              <Caption1 className={styles.caption}>
                {t('結果は画面に反映されるだけで、保存はされません。気に入らなければ、保存せずに閉じられます。', 'Results are only applied on screen and are not saved. If you do not like them, close without saving.')}
              </Caption1>
              <Button
                type="button"
                appearance="subtle"
                onClick={() => {
                  cancelRef.current = true
                  setAuto(null)
                }}
              >
                {t('スキップして開く', 'Skip and open')}
              </Button>
            </div>
          )}
          {simpleOn ? (
            <>
              {productFloat}
              {heroUploadNode}
              {abCompareNode}
              {simpleEditor && <SimpleCardLayout editor={simpleEditor} boxRef={previewBoxRef} isDirty={isDirty} onCommit={commitSimple} onApply={applySimple} onUndo={undoSimple} onRunNext={runNext} onClose={closeSimple} />}
            </>
          ) : (
          <>
          <ClassicCardLayout
            {...{ editor, ab, abAiBusy, active, addVariant, asTarget, audience, buildContent, canReview, changeReason, changeTarget, comparing, decideVariant, decision, draftActiveVariant, form, groupByCategory, heroId, isDirty, items, justSaved, lockedWeeks, productById, removeItem, removeVariant, saveAndNext, saveAndStay, savingAfter, saving, sectionTitles, selectedKey, set, setAb, setAudience, setComparing, setForm, setSelectedKey, startAbTest, stopAbTest, switchVariant, template, templateChannel, alertCard, itemAlertKinds, openAlertFor, productAlertKinds, setActAlert, setProductOpen, setSlotAction, abCompareNode, alertsNode, footerNode, heroUploadNode, itemAlertOverlay, noticesNode, productFloat, zoomBox, auto, cardMenu, changeTemplate, changeView, placingPin, setPlacingPin, endPlacingPin, pinTarget, setPinTarget, openPinThreads, closePin, drafts, hero, linkSpots, linkUrlOf, productLinkOf, linkVariant, pickDevice, previewBoxRef, previewInnerRef, previewCommon, previewDevice, previewTab, processOpen, toggleProcess, progress, runAllManual, setHeroUpload, setHoverKey, showHeadings, setShowHeadings, stepRequest, setStepRequest, tabRequest, setTabRequest, templateUseMap, utmCampaign, zoom, card, draft, heroes, products, owners, next, stageNav, onBack, onSaved, onOpenResults, onOpenProduction, onTabChange }}
          />
          </>
          )}
        </form>
      </ResizableSurface>
    </Dialog>
  )
}
