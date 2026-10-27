// 配信カードの詳しい画面(今の配信カード)の描き方。シンプルな配信カード(simple/SimpleCardLayout)と並べる(整理 第3段 ②)。
// 状態と保存は配信カード(CardDetail・useCardEditor)の 1 か所だけ。ここは受け取ったものを描き、この画面だけのペインの幅・開閉を持つ
import { filled } from './slots'
import { useRef, useState, type ReactNode } from 'react'
import {
  Badge,
  Button,
  Caption1,
  Field,
  Switch,
  Text,
  ToggleButton,
  Tooltip,
  mergeClasses,
} from '@fluentui/react-components'
import { ArrowNextRegular, BeakerRegular, CheckmarkCircleRegular, CommentAddRegular, ChevronRightRegular, DataBarVerticalRegular, DesktopRegular, DismissRegular, MailRegular, PhoneRegular, SaveRegular } from '@fluentui/react-icons'
import { day, locale, useT } from './i18n'
import { AiIcon } from './AiMark'
import { ProductInfoPane } from './ProductInfoPane'
import { AutoTextarea } from './AutoTextarea'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { ChannelBadge } from './ChannelBadge'
import { CopyLinkButton } from './CopyLinkButton'
import { FaceBadge } from './FaceBadge'
import { THEME_TYPES, themeTypeLabel } from './themeTypes'
import { ContentPane } from './ContentPane'
import { Preview } from './Preview'
import { type EmailTemplateId } from './templates'
import { Splitter } from './Splitter'
import { useStoredWidths } from './floatLayout'
import { progressOf } from './progress'
import { campaignSlug, productUrl, type LinkSlot } from './links'
import { LinkOverlay } from './LinkOverlay'
import { readRaw, writeRaw } from './settings'
import { PREF } from './prefKeys'
import { useAiDrafts } from './useAiDrafts'
import { useCardEditor } from './useCardEditor'
import { useCardAlerts } from './useCardAlerts'
import { ProcessPane, ProcessRail, type TalkTab } from './ProcessPane'
import type { TopTab } from './ContentPane'
import { channelOptions, countryOptions } from './status'
import { LearningsBar } from './LearningsBar'
import { ResolvedPinsToggle } from './ResolvedPinsToggle'
import { AbDecidedBar, AbTestBar } from './AbTestBar'
import { CreativeAssets } from './CreativeAssets'
import { templateUse } from './templateUse'
import { isChoose, metricLabel, targetLabel } from './abTest'
import { AudienceRow, ChoiceField, NameField, OwnerField, ScheduledAtField, StatusField, TargetField } from './DeliveryInfoFields'
import { PreviewPins } from './PreviewPins'
import { pinView } from './pinStore'
import { viewWidth } from './uiScale'
import { ViewSwitch } from './simple/ViewSwitch'
import { PinFloat } from './PinFloat'
import { focusSoon, type ContextItem } from './ContextMenu'
import { usePreviewPins } from './usePreviewPins'
import { heroImage } from './images'
import { previewMenuItems } from './previewMenu'
import { PaneRail } from './PaneRail'
import type { ComponentProps, Dispatch, RefObject, SetStateAction } from 'react'
import { MIN_PREVIEW, MIN_W, useCardDetailStyles } from './cardDetailStyles'
import type { VariantKey } from './abTest'

// 4 つめの幅(右端のプロセスのペイン)を足したので、版を上げた(2026-10-17)
const WIDTH_KEY = PREF.cardPaneWidths

// 既定を「開く」に変えたので、キーの版を上げて、以前に保存した開閉は使わない
const INFO_KEY = PREF.cardInfoOpen
const RAIL_W = 32

/** 商品情報ペインを開くか。保存がなければ、開いておく(選んだ商品の売上・在庫を、すぐ確かめられるように) */
// 保存は 'open' / 'closed' の文字のまま(以前からの形)。読めないときは、既定(開く)にする
const loadInfoOpen = (): boolean => readRaw(INFO_KEY) !== 'closed'
const MAX_W = 640
const clamp = (v: number) => Math.min(MAX_W, Math.max(MIN_W, v))
// 中央(コンテンツ生成)は、プレビューと商品情報がつぶれない範囲で、いくらでも広げられる
// (上限は、ドラッグのときに、その時のダイアログの幅から求める。CSS でも、プレビューの最小幅を残すよう抑える)
const clampMid = (v: number, max = 4000) => Math.min(Math.max(MIN_W, max), Math.max(MIN_W, v))

type Widths = [number, number, number, number]
function readWidths(v: unknown): Widths {
  if (Array.isArray(v) && v.length === 4) return [clamp(Number(v[0])), clampMid(Number(v[1])), clamp(Number(v[2])), clamp(Number(v[3]))]
  // 既定値: ダイアログの幅(最大 1800px)に合わせる。左 18%・中 26%・商品情報 15%・プロセス(右端)17%・プレビューは残り
  const total = Math.min(1800, viewWidth() * 0.98)
  return [clamp(Math.round(total * 0.18)), clamp(Math.round(total * 0.26)), clamp(Math.round(total * 0.15)), clamp(Math.round(total * 0.17))]
}

type CardEditor = ReturnType<typeof useCardEditor>
type CardAlertsApi = ReturnType<typeof useCardAlerts>
type PreviewPins = ReturnType<typeof usePreviewPins>

export type ClassicCardLayoutProps = Pick<CardEditor, 'ab' | 'abAiBusy' | 'active' | 'addVariant' | 'asTarget' | 'audience' | 'buildContent' | 'canReview' | 'changeReason' | 'changeTarget' | 'comparing' | 'decideVariant' | 'decision' | 'draftActiveVariant' | 'form' | 'groupByCategory' | 'heroId' | 'isDirty' | 'items' | 'justSaved' | 'lockedWeeks' | 'productById' | 'removeItem' | 'removeVariant' | 'saveAndNext' | 'saveAndStay' | 'savingAfter' | 'saving' | 'sectionTitles' | 'selectedKey' | 'set' | 'setAb' | 'setAudience' | 'setComparing' | 'setForm' | 'setSelectedKey' | 'startAbTest' | 'stopAbTest' | 'switchVariant' | 'template' | 'templateChannel'> &
  { editor: CardEditor } & Pick<CardAlertsApi, 'alertCard' | 'itemAlertKinds' | 'openAlertFor' | 'productAlertKinds' | 'setActAlert' | 'setProductOpen' | 'setSlotAction'> & {
    abCompareNode: ReactNode
    alertsNode: ReactNode
    footerNode: ReactNode
    heroUploadNode: ReactNode
    itemAlertOverlay: ReactNode
    noticesNode: ReactNode
    emptyDraftNode: ReactNode
    productFloat: ReactNode
    zoomBox: ReactNode
    auto: { label: string; done: number; total: number } | null
    cardMenu: (extra?: ReactNode) => ReactNode
    changeTemplate: (id: EmailTemplateId) => void
    changeView: (v: boolean, remember?: boolean) => void
    placingPin: PreviewPins['placing']
    setPlacingPin: PreviewPins['setPlacing']
    endPlacingPin: PreviewPins['endPlacing']
    pinTarget: PreviewPins['target']
    setPinTarget: PreviewPins['setTarget']
    openPinThreads: PreviewPins['openThreads']
    closePin: PreviewPins['close']
    drafts: ReturnType<typeof useAiDrafts>
    hero: HeroImage | undefined
    linkSpots: LinkSlot[]
    linkUrlOf: (slot: LinkSlot) => string
    productLinkOf: (itemKey: string) => { name: string; url: string } | undefined
    linkVariant: VariantKey | null
    pickDevice: (d: 'mobile' | 'pc') => void
    previewBoxRef: RefObject<HTMLDivElement | null>
    previewInnerRef: RefObject<HTMLDivElement | null>
    previewCommon: Omit<ComponentProps<typeof Preview>, 'items' | 'selectedKey' | 'template' | 'hero' | 'onSelect'>
    previewDevice: 'mobile' | 'pc'
    previewTab: 'email' | 'push'
    processOpen: boolean
    toggleProcess: () => void
    progress: ReturnType<typeof progressOf>
    runAllManual: () => void
    setHeroUpload: Dispatch<SetStateAction<boolean | File>>
    setHoverKey: Dispatch<SetStateAction<string | null>>
    showHeadings: boolean
    setShowHeadings: Dispatch<SetStateAction<boolean>>
    stepRequest: { tab: TopTab; seq: number } | undefined
    setStepRequest: Dispatch<SetStateAction<{ tab: TopTab; seq: number } | undefined>>
    tabRequest: { tab: TalkTab; seq: number } | undefined
    setTabRequest: Dispatch<SetStateAction<{ tab: TalkTab; seq: number } | undefined>>
    templateUseMap: ReturnType<typeof templateUse> | undefined
    utmCampaign: string
    zoom: number | 'fit'
    card: DeliveryCard | undefined
    draft: { card: DeliveryCard } | undefined
    heroes: HeroImage[]
    products: Product[]
    owners: string[]
    next: { name: string; position: string } | null | undefined
    stageNav: ReactNode
    onBack: () => void
    onSaved: () => Promise<void>
    onOpenResults: ((id: string) => void) | undefined
    onOpenProduction: ((cardId: string, opts?: { request?: boolean }) => void) | undefined
    onTabChange: ((tab: string) => void) | undefined
    /** キャンペーンの帯(X79。キャンペーンに入っている配信だけ)。引数は 3 段目に置く AB の案の帯。あるときは、AB の帯を題の下に置かない */
    campaignBand?: (variants: ReactNode) => ReactNode
    /** 配信の画面に出す名前(キャンペーンに入っている配信は「キャンペーン名 + チャネル」) */
    campaignName?: string
  }

export function ClassicCardLayout({ editor, ab, abAiBusy, active, addVariant, audience, canReview, changeReason, changeTarget, decideVariant, decision, draftActiveVariant, form, groupByCategory, isDirty, items, justSaved, lockedWeeks, productById, removeItem, removeVariant, saveAndNext, saveAndStay, savingAfter, saving, sectionTitles, selectedKey, set, setAb, setAudience, setComparing, setForm, setSelectedKey, startAbTest, stopAbTest, switchVariant, template, templateChannel, alertCard, itemAlertKinds, openAlertFor, productAlertKinds, setActAlert, setProductOpen, setSlotAction, abCompareNode, alertsNode, emptyDraftNode, footerNode, heroUploadNode, itemAlertOverlay, noticesNode, productFloat, zoomBox, auto, cardMenu, changeTemplate, changeView, placingPin, setPlacingPin, endPlacingPin, pinTarget, setPinTarget, openPinThreads, closePin, drafts, hero, linkSpots, linkUrlOf, productLinkOf, linkVariant, pickDevice, previewBoxRef, previewInnerRef, previewCommon, previewDevice, previewTab, processOpen, toggleProcess, progress, runAllManual, setHeroUpload, setHoverKey, showHeadings, setShowHeadings, stepRequest, setStepRequest, tabRequest, setTabRequest, templateUseMap, utmCampaign, zoom, card, draft, heroes, products, owners, next, stageNav, onBack, onSaved, onOpenResults, onOpenProduction, onTabChange, campaignBand, campaignName }: ClassicCardLayoutProps) {
  const t = useT()
  const styles = useCardDetailStyles()
  const { widths, setWidths, onDone: saveWidths } = useStoredWidths<Widths>(WIDTH_KEY, readWidths)

  // リンク先のタブを開いているか・設定の欄で選んでいる場所(プレビューに、番号と枠を重ねる。W12)
  const [linksTab, setLinksTab] = useState(false)

  const [linkFocus, setLinkFocus] = useState<string | null>(null)

  const [infoOpen, setInfoOpen] = useState<boolean>(loadInfoOpen)

  const toggleInfo = () =>
    setInfoOpen((open) => {
      writeRaw(INFO_KEY, open ? 'closed' : 'open')
      return !open
    })

  const panesRef = useRef<HTMLDivElement>(null)
  // 中央の上限: ダイアログの中の幅から、左・商品情報・境界線・プレビューの最小幅を引いた残り
  // (中の幅は、ドラッグのたびに、幅を変える前に測る。幅を決める関数の中では ref を読まない)
  const midMax = (w: Widths, total: number) => total - w[0] - (infoOpen ? w[2] : RAIL_W) - (processOpen ? w[3] : RAIL_W) - 4 - MIN_PREVIEW
  const resizeLeft = (dx: number) => setWidths((w) => [clamp(w[0] + dx), w[1], w[2], w[3]])
  const resizeMid = (dx: number) => {
    const total = panesRef.current?.clientWidth ?? viewWidth()
    setWidths((w) => [w[0], clampMid(Math.min(w[1], midMax(w, total)) + dx, midMax(w, total)), w[2], w[3]])
  }
  const resizeInfo = (dx: number) => setWidths((w) => [w[0], w[1], clamp(w[2] - dx), w[3]])
  const resizeProcess = (dx: number) => setWidths((w) => [w[0], w[1], w[2], clamp(w[3] - dx)])

  /**
   * 詳しい画面のプレビューの右クリックの項目(「ここにピンを打つ」のあと)。押した所について、工程のタブ・商品のフロート・プレビューの「外す」と同じ処理を呼ぶ。
   * 直す・AI に頼むは、その部品を直す工程のタブを開く(AI は、そのタブの AI チャットの入力欄へ)。保存中は、中身を変える項目を押せなくする
   */
  const detailPreviewMenu = (under: Element): ContextItem[] => {
    const itemKey = under.closest('[data-item-key]')?.getAttribute('data-item-key') ?? undefined
    const anchor = under.closest('[data-anchor]')?.getAttribute('data-anchor') ?? ''
    const kind = anchor.split(':')[0]
    const tab: TopTab | null = itemKey ? 'sections' : kind === 'hero' || kind === 'herotext' || kind === 'subject' ? 'hero' : kind === 'section' ? 'sections' : kind === 'button' ? 'links' : kind === 'push' ? 'notice' : null
    const openTab = (to: TopTab) => setStepRequest((r) => ({ tab: to, seq: (r?.seq ?? 0) + 1 }))
    const it = itemKey ? items.find((i) => i.key === itemKey) : undefined
    return previewMenuItems({
      // ボタンと同じく、保存中だけ押せなくする
      busy: saving,
      edit: tab ? () => openTab(tab) : undefined,
      ai: tab
        ? () => {
            openTab(tab)
            focusSoon('[data-ai-chat-input]')
          }
        : undefined,
      product: itemKey
        ? {
            swapLabel: t('商品を入れ替える', 'Replace the product'),
            url: productUrl(productById.get(it?.productId ?? '')),
            // 商品の箱を押したときと同じ、商品のフロート
            swap: () => {
              setActAlert(null)
              setSlotAction(null)
              setProductOpen(itemKey)
            },
            remove: () => removeItem(itemKey),
          }
        : undefined,
      hero: !itemKey && kind === 'hero' ? { src: heroImage(hero), replace: () => openTab('hero') } : undefined,
    })
  }

  // AB テストの帯(X55): 案の切り替えと、テストの設定。案から選んだあと(X57)は、決めた案と、配信しなかった案の入り口
  const abNode = ab ? (
    <AbTestBar
      ab={ab}
      active={active}
      onSwitch={switchVariant}
      onChange={setAb}
      onAdd={addVariant}
      onRemove={removeVariant}
      onStop={stopAbTest}
      onTarget={changeTarget}
      onAiDraft={() => void draftActiveVariant()}
      aiBusy={abAiBusy}
      onCompare={() => setComparing('live')}
      onDecide={decideVariant}
    />
  ) : decision ? (
    <AbDecidedBar decision={decision} onView={() => setComparing('decided')} />
  ) : null

  return (
    <>
            {/* キャンペーンの帯(X79)。親(キャンペーン) › 子(配信) › 孫(AB の案) */}
            {campaignBand?.(abNode ?? <Caption1 className={styles.caption}>{t('AB テストはしていません', 'No A/B test')}</Caption1>)}
            <div className={styles.titleRow}>
              {/* メールかアプリかを、開いた瞬間に分かるように、題名の左に札を置く */}
              {stageNav ?? <FaceBadge face="calendar" />}
              <ChannelBadge channel={form.channel} />
              <Text as="h2" size={500} weight="semibold" className={styles.titleText}>{campaignName ?? (card ? card.name : draft ? draft.card.name : t('配信カードの新規作成', 'New delivery card'))}</Text>
              <Tooltip
                relationship="description"
                content={progress.remaining.length ? t(`未完了: ${progress.remaining.join('、')}`, `Incomplete: ${progress.remaining.join(', ')}`) : t('すべての工程が完了しています', 'All steps are complete')}
              >
                <Badge appearance="tint" color={progress.done === progress.total ? 'success' : 'informative'} size="large">
                  {t(`工程 ${progress.done} / ${progress.total}`, `Steps ${progress.done} / ${progress.total}`)}
                </Badge>
              </Tooltip>
              {card && onOpenResults && card.scheduled_at && new Date(card.scheduled_at) < new Date() && (
                <Button type="button" size="small" appearance="secondary" icon={<DataBarVerticalRegular />} onClick={() => onOpenResults(card.id)}>
                  {t('結果を見る', 'View results')}
                </Button>
              )}
              {/* この配信カードを開くリンク(保存済みの配信だけ。X36) */}
              {card && <ViewSwitch simple={false} onChange={changeView} />}
              {card && <CopyLinkButton />}
              {/* 複製・取りやめ・削除(保存済みの配信だけ) */}
              {cardMenu()}
              {/* 閉じる ×: フロートのいちばん上の右の角に。キャンペーンの帯があれば、その 1 段目の右の端(CardDetail が入れる)。なければ題の行 */}
              {!campaignBand && <Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={onBack} aria-label={t('閉じる', 'Close')} />}
            </div>
            {noticesNode}
            {productFloat}
            {alertsNode}
            {/* これまでの学び(同じテンプレート・テーマの種類の、過去の配信のメモ)。保存済みの配信だけ */}
            {card && (
              <LearningsBar card={card} templateId={template} country={form.country} channel={form.channel} name={form.name} theme={form.theme} headline={form.headline} themeType={form.themeType} />
            )}

            {heroUploadNode}
            {/* キャンペーンに入っている配信は、AB の帯をキャンペーンの帯の 3 段目に置く */}
            {!campaignBand && abNode}
            {abCompareNode}

            <div ref={panesRef} className={styles.panes} style={{ '--w0': `${widths[0]}px`, '--w1': `${widths[1]}px`, '--w2': `${infoOpen ? widths[2] : RAIL_W}px`, '--w3': `${processOpen ? widths[3] : RAIL_W}px` } as React.CSSProperties}>
              {/* 左: 配信の情報 */}
              <div className={styles.pane}>
                <Button
                  appearance="primary"
                  icon={<AiIcon tone="white" size={18} />}
                  onClick={runAllManual}
                  disabled={!!auto || saving}
                  className={styles.fullWidth}
                >
                  {t('すべてAIで下書き', 'Draft everything with AI')}
                </Button>
                <Caption1 className={mergeClasses(styles.caption, styles.captionTight)}>
                  {templateChannel === 'push' ? t('テーマ・メイン画像・ヘッドライン・セクション・通知の文を、まとめてAIが下書きします', 'AI drafts the theme, hero image, headline, sections, and notification text all at once') : t('テーマ・メイン画像・ヘッドライン・セクション・制作指示・件名とプリヘッダーを、まとめてAIが下書きします', 'AI drafts the theme, hero image, headline, sections, production notes, subject, and preheader all at once')}
                </Caption1>
                <Text weight="semibold" size={300}>{t('配信情報', 'Delivery info')}</Text>
                <NameField value={form.name} onChange={set('name')} />
                <ScheduledAtField value={form.scheduledAt} onChange={set('scheduledAt')} />
                <div className={styles.twoCol}>
                  <ChoiceField label={t('国', 'Country')} value={form.country} options={countryOptions} onChange={set('country')} />
                  <ChoiceField label={t('チャネル', 'Channel')} value={form.channel} options={channelOptions} onChange={set('channel')} />
                  <ChoiceField label={t('種類', 'Type')} value={form.themeType} options={THEME_TYPES.map((v) => ({ value: v, label: themeTypeLabel(v) }))} onChange={set('themeType')} />
                  <StatusField value={form.status} onChange={set('status')} />
                </div>
                {/* 配信の対象(X40): 誰に向けて作るか。最初に決め、AI の下書きと商品の候補をこれに合わせる */}
                <TargetField gender={form.targetGender} ages={form.targetAges} onGender={set('targetGender')} onAges={set('targetAges')}>
                  {/* アプリの送る相手(これまでの ⑥ 時刻・相手 から移した) */}
                  <AudienceRow value={audience} onChange={setAudience} channel={templateChannel === 'push' ? 'push' : 'email'} />
                </TargetField>
                <div className={styles.twoCol}>
                  <OwnerField value={form.owner} onChange={set('owner')} owners={owners} />
                  {/* 制作の担当者・締め切り・引き継ぎ済みは、右端のプロセスのペインの「引き継ぎ」だけで決める(2 か所で入力しない。FLOWS の C-3)。ここは表示だけで、押すとそのタブが開く(閉じていれば開く) */}
                  <Field label={t('制作に渡す', 'Hand off to production')} className={styles.handoffField}>
                    <button type="button" className={styles.handoffSummary} onClick={() => {
                      if (!processOpen) toggleProcess()
                      setTabRequest((r) => ({ tab: 'handoff', seq: (r?.seq ?? 0) + 1 }))
                    }} title={t('渡すもののタブで決める', 'Set in the Handoff tab')}>
                      <span>
                        <span className={styles.caption}>{t('担当 ', 'Assignee ')}</span>
                        {form.productionOwner.trim() || <span className={styles.caption}>{t('(未設定)', '(not set)')}</span>}
                        <span className={styles.caption}>{t(' ・ 締め切り ', ' · Due ')}</span>
                        {form.productionDue ? day(form.productionDue) : <span className={styles.caption}>{t('(未設定)', '(not set)')}</span>}
                      </span>
                      <span>
                        {form.handedOffAt ? (
                          <span className={mergeClasses(styles.success, styles.handoffItem)}>{t('渡し済み ', 'Handed off ')}{new Date(form.handedOffAt).toLocaleString(locale(), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        ) : (
                          <span className={styles.caption}>{t('まだ渡していない', 'Not handed off yet')}</span>
                        )}
                        <span className={styles.handoffLink}>{t('渡すもののタブで決める ›', 'Set in the Handoff tab ›')}</span>
                      </span>
                    </button>
                  </Field>
                </div>
                {/* AB テスト(X55)・案から選ぶ(X57)。始めると、題名の下に案の切り替えと設定の帯が出る */}
                <Field label={t('案(AB テスト・案から選ぶ)', 'Variants (A/B test or choose one)')}>
                  {ab && isChoose(ab) ? (
                    <Caption1 className={styles.caption}>
                      {t(`${['A', ...ab.variants].join('・')} の ${ab.variants.length + 1} 案から、1 案に決めて配信する(${targetLabel(ab.target)}を案ごとに)。上の帯で決める`, `Choose one of ${ab.variants.length + 1} variants to send (${targetLabel(ab.target).toLowerCase()} per variant). Decide in the bar above.`)}
                    </Caption1>
                  ) : ab ? (
                    <Caption1 className={styles.caption}>
                      {t(
                        `${['A', ...ab.variants].join('・')} の ${ab.variants.length + 1} 案で、${targetLabel(ab.target)}を比べる(判定: ${metricLabel(ab.metric)})。設定と案の切り替えは、上の帯で`,
                        `${ab.variants.length + 1} variants (${['A', ...ab.variants].join(', ')}) comparing the ${targetLabel(ab.target).toLowerCase()} (judged by ${metricLabel(ab.metric).toLowerCase()}). Settings and switching are in the bar above.`,
                      )}
                    </Caption1>
                  ) : (
                    <div className={styles.targetRow}>
                      <Button type="button" size="small" icon={<BeakerRegular />} onClick={() => startAbTest('test')} title={t('A 案(いまの配信)の写しから B 案を作り、メイン画像や商品を比べます。全案を、受信者を分けて送ります(C 案まで)', 'Create variant B as a copy of A to compare the hero image or products. All variants are sent to split recipients (up to C)')}>
                        {t('AB テストにする', 'Make it an A/B test')}
                      </Button>
                      <Button type="button" size="small" icon={<CheckmarkCircleRegular />} onClick={() => startAbTest('choose')} title={t('A 案の写しから B 案を作り、クリエイティブ全体(画像・商品・文言)を変えて比べ、決めた 1 案だけを配信します(C 案まで)', 'Create variant B as a copy of A, vary the whole creative (image, products, text), and send only the one you choose (up to C)')}>
                        {t('案を出して選ぶ', 'Make variants to choose from')}
                      </Button>
                      {decision && <Caption1 className={styles.caption}>{t(`前回は ${decision.variant} 案に決めた(上の帯)`, `Last time: went with ${decision.variant} (bar above)`)}</Caption1>}
                    </div>
                  )}
                </Field>
                <Text weight="semibold" size={300} className={styles.sectionHead}>{t('工程', 'Steps')}</Text>
                <Field label={t('テーマ(配信全体の前提。メールには出ません)', 'Theme (premise for the whole delivery; not shown in the email)')}>
                  <AutoTextarea heightKey="CardDetail.form_theme"
                    size="small"
                    rows={2}
                                      className={form.theme ? styles.filled : undefined}
                    value={form.theme}
                    onChange={(_, d) => set('theme')(d.value)}
                  />
                </Field>
                {form.theme && form.themeReason && <Caption1 className={styles.caption}><span className={styles.lead}>{t('AIの理由:', 'AI rationale:')}</span>{` ${form.themeReason}`}</Caption1>}
                <Caption1 className={filled(items).length ? styles.success : styles.caption}>
                  {t(`掲載商品: ${filled(items).length}件(中央の「セクション」タブで選びます)`, `Products in this delivery: ${filled(items).length} (choose them in the Sections tab in the middle)`)}
                </Caption1>
                <Field label={t('ヘッドライン(メイン画像に載せる大見出し)', 'Headline (the large heading on the hero image)')}>
                  <AutoTextarea heightKey="CardDetail.form_headline"
                    size="small"
                    rows={1}
                                      className={form.headline ? styles.filled : undefined}
                    value={form.headline}
                    onChange={(_, d) => set('headline')(d.value)}
                  />
                </Field>
                <Field label={t('コピー(ヘッドラインの下の導入文)', 'Copy (intro text below the headline)')}>
                  <AutoTextarea heightKey="CardDetail.form_copy"
                    size="small"
                    rows={2}
                                      className={form.copy ? styles.filled : undefined}
                    value={form.copy}
                    onChange={(_, d) => set('copy')(d.value)}
                  />
                </Field>
                {(form.headline || form.copy) && form.copyAngle && <Caption1 className={styles.caption}><span className={styles.lead}>{t('切り口:', 'Angle:')}</span>{` ${form.copyAngle}`}</Caption1>}
                {/* 制作指示は、作るのは中ペインの「⑥ 制作指示」、引き継ぐ前に確かめるのは右のプロセスのペインの「渡す制作指示」。左には置かない(書き換える場所を 1 つにする。X26) */}
              </div>

              <Splitter onDrag={resizeLeft} onDone={saveWidths} />

              {/* 中: コンテンツ生成(テーマ・商品選定・コピー・制作指示) */}
              <div className={mergeClasses(styles.pane, styles.paneMid)}>
                <ContentPane
                  editor={editor}
                  drafts={drafts}
                  products={products}
                  heroes={heroes}
                  onTemplate={changeTemplate}
                  templateUse={templateUseMap}
                  assetsSlot={
                    <CreativeAssets
                      cardId={card?.id}
                      stage="plan"
                      title={t('参考の素材(制作に使ってほしい画像・資料・ページ)', 'Reference assets (images, documents and pages for production)')}
                      owner={card?.owner}
                      people={owners}
                      cardName={form.name}
                      productionOwner={form.productionOwner}
                      productionDue={form.productionDue}
                      productIds={filled(items).map((i) => i.productId)}
                      products={products}
                    />
                  }
                  onUploadHero={() => setHeroUpload(true)}
                  alertKinds={productAlertKinds}
                  onAlert={alertCard ? openAlertFor : undefined}
                  onOpenProduct={(key) => {
                    setActAlert(null)
                    setProductOpen(key)
                  }}
                  tabRequest={stepRequest}
                  campaign={campaignSlug(form.name, form.scheduledAt)}
                  utmCampaign={utmCampaign}
                  linkVariant={linkVariant}
                  onLinksTab={setLinksTab}
                  onLinkFocus={setLinkFocus}
                  onTabChange={onTabChange}
                />
              </div>

              <Splitter onDrag={resizeMid} onDone={saveWidths} />

              {/* 右: プレビュー */}
              <div className={mergeClasses(styles.pane, styles.panePreview)}>
                <div className={styles.toolbar}>
                  <div className={mergeClasses(styles.grow, styles.previewHead)}>
                    {previewTab === 'push' ? <PhoneRegular /> : <MailRegular />}
                    <Text weight="semibold" size={300}>{previewTab === 'push' ? t('アプリのプレビュー', 'App preview') : t('メールのプレビュー', 'Email preview')}</Text>
                    {!form.channel && <Caption1 className={styles.caption}>{t('チャネルが未設定のため、メールで表示しています', 'No channel set — showing the email')}</Caption1>}
                    {previewTab !== 'push' && (
                      <span className={styles.deviceSwitch} role="tablist" aria-label={t('プレビューの幅', 'Preview width')}>
                        {(['mobile', 'pc'] as const).map((d) => (
                          <Button key={d} type="button" size="small" role="tab" aria-selected={previewDevice === d} appearance={previewDevice === d ? 'primary' : 'subtle'} className={styles.deviceBtn} icon={d === 'mobile' ? <PhoneRegular /> : <DesktopRegular />} onClick={() => pickDevice(d)}>
                            {d === 'mobile' ? t('スマホ', 'Mobile') : t('PC', 'Desktop')}
                          </Button>
                        ))}
                      </span>
                    )}
                    {ab && (
                      <Badge appearance="filled" color="brand">
                        {t(`${active} 案`, `Variant ${active}`)}
                      </Badge>
                    )}
                  </div>
                  {zoomBox}
                  <Tooltip
                    relationship="description"
                    content={card ? t('プレビューの場所を押して、そこへの書き込み(承認者のコメント・制作への問い合わせなど)を始めます。Esc でやめます。', 'Click a spot in the preview to start a comment there (approver feedback, questions to production, etc.). Esc to cancel.') : t('配信カードを保存すると、使えます', 'Save the delivery card first')}
                  >
                    <ToggleButton type="button" size="small" appearance={placingPin ? 'primary' : 'subtle'} checked={placingPin} icon={<CommentAddRegular />} disabled={!card} onClick={() => setPlacingPin((v) => !v)}>
                      {placingPin ? t('場所を押す…', 'Click a spot…') : t('コメントを置く', 'Place comment')}
                    </ToggleButton>
                  </Tooltip>
                  {card && <ResolvedPinsToggle />}
                  {previewTab === 'email' && template === 'free' && (
                    <>
                      <Switch label={t('カテゴリ見出し', 'Category headings')} checked={showHeadings} onChange={(_, d) => setShowHeadings(d.checked)} />
                      <Button type="button" size="small" appearance="subtle" onClick={groupByCategory} disabled={filled(items).length < 2}>{t('カテゴリでまとめる', 'Group by category')}</Button>
                    </>
                  )}
                </div>
                <div ref={previewBoxRef} className={styles.previewBox}>
                  {emptyDraftNode}
                  <div ref={previewInnerRef} style={{ zoom: zoom === 'fit' ? undefined : zoom }}>
                    <Preview {...previewCommon} items={items} selectedKey={selectedKey} template={template} hero={hero} onSelect={setSelectedKey} />
                  </div>
                  {card && itemAlertKinds.size > 0 && itemAlertOverlay}
                  <PreviewPins
                    boxRef={previewBoxRef}
                    cardId={card?.id}
                    view={pinView(previewTab, previewDevice, ab ? active : 'A')}
                    items={items}
                    placing={placingPin}
                    onPlacingEnd={endPlacingPin}
                    onOpenThreads={openPinThreads}
                    menuItems={detailPreviewMenu}
                  />
                  {card && pinTarget && (
                    <PinFloat
                      cardId={card.id}
                      cardOwner={form.owner}
                      stage="plan"
                      root={() => previewBoxRef.current}
                      target={pinTarget}
                      productName={(id) => productById.get(id)?.name ?? ''}
                      onTarget={setPinTarget}
                      onClose={closePin}
                    />
                  )}
                  <LinkOverlay boxRef={previewBoxRef} slots={linkSpots} urlOf={linkUrlOf} productLink={productLinkOf} linksMode={linksTab} focusKey={linkFocus} />
                </div>
              </div>

              <Splitter onDrag={infoOpen ? resizeInfo : () => undefined} onDone={saveWidths} />

              {/* 右端: 商品情報(参照用。操作はしない) */}
              {infoOpen ? (
                <div className={styles.pane}>
                  <div className={styles.infoToolbar}>
                    <Button type="button" size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleInfo} aria-label={t('商品情報を閉じる', 'Collapse product info')} />
                  </div>
                  <ProductInfoPane
                    template={template}
                    sectionTitles={sectionTitles}
                    items={items}
                    products={products}
                    onHover={setHoverKey}
                    alertKinds={productAlertKinds}
                    onAlert={alertCard ? openAlertFor : undefined}
                    onOpenProduct={(key) => {
                      setActAlert(null)
                      setProductOpen(key)
                    }}
                  />
                </div>
              ) : (
                <PaneRail label={t('商品情報', 'Product info')} onOpen={toggleInfo} />
              )}

              <Splitter onDrag={processOpen ? resizeProcess : () => undefined} onDone={saveWidths} />

              {/* 右端: プロセス(状態・承認・引き継ぎ・質問・タスク・コメント)。作る(左〜商品情報)と、進めるを分ける */}
              {processOpen ? (
                <div className={mergeClasses(styles.pane, styles.paneMid)}>
                  <div className={styles.infoToolbar} style={{ padding: '4px 4px 0', marginBottom: 0 }}>
                    <Button type="button" size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleProcess} aria-label={t('プロセスを閉じる', 'Collapse process')} />
                  </div>
                  <ProcessPane
                    card={card}
                    onOpenProduction={onOpenProduction}
                    status={form.status}
                    canReview={canReview}
                    locked={lockedWeeks.length > 0}
                    isDirty={isDirty}
                    busy={saving}
                    onChanged={onSaved}
                    handoff={{ productionOwner: form.productionOwner, handedOffAt: form.handedOffAt, productionDue: form.productionDue }}
                    onHandoff={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                    instructions={form.instructions}
                    onEditInstructions={() => setStepRequest((r) => ({ tab: 'instructions', seq: (r?.seq ?? 0) + 1 }))}
                    remaining={progress.remaining}
                    people={owners}
                    cardName={form.name}
                    productIds={filled(items).map((it) => it.productId)}
                    products={products}
                    tabRequest={tabRequest}
                  />
                </div>
              ) : (
                <ProcessRail card={card} status={form.status} onOpen={toggleProcess} />
              )}
            </div>

            {footerNode}
            <div className={styles.actions}>
              <Button type="button" onClick={onBack} disabled={saving}>{t('やめる', 'Cancel')}</Button>
              {/* 次がないときも消さずに、選べないだけにする(ボタンの位置を変えない。PRINCIPLES.md 2-2) */}
              {next !== undefined && (
                <Tooltip
                  relationship="description"
                  content={next ? t(`保存して、次の配信「${next.name}」を開きます(${next.position})`, `Save and open the next delivery "${next.name}" (${next.position})`) : t('次の配信はありません(この週・この確認の項目の、最後の配信です)', 'No next delivery (this is the last one in this week or check item)')}
                >
                  <Button type="button" icon={<ArrowNextRegular />} iconPosition="after" disabled={saving || !next || (changeReason !== null && lockedWeeks.length > 0)} onClick={saveAndNext}>
                    {t('保存して次へ', 'Save and next')}
                  </Button>
                </Tooltip>
              )}
              {/* 保存(閉じない)と、保存して閉じる(X52。保存のたびに閉じると、続けて直しにくいため) */}
              {justSaved && <span className={styles.savedNote}>{t('保存しました', 'Saved')}</span>}
              <Button type="button" icon={<SaveRegular />} disabled={saving || (changeReason !== null && lockedWeeks.length > 0)} onClick={saveAndStay}>
                {saving && savingAfter === 'stay' ? t('保存中...', 'Saving...') : lockedWeeks.length > 0 ? t('理由を入力して保存', 'Save with a reason') : t('保存', 'Save')}
              </Button>
              <Button type="submit" appearance="primary" icon={<SaveRegular />} disabled={saving || (changeReason !== null && lockedWeeks.length > 0)}>
                {saving && savingAfter !== 'stay' ? t('保存中...', 'Saving...') : t('保存して閉じる', 'Save & close')}
              </Button>
            </div>
    </>
  )
}
