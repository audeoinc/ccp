// 制作の面のシンプルな画面(X86。2026-10-28 利用者が案 A に決めた。要件: 共有メモ req-production-simple.md)。
// 配信カードのシンプルと同じ形: 左に企画の見本のプレビュー(部品を押せる)、右に部品のペイン。何も選んでいないときは「渡されたもの」。
// MVP は「開く・読む・コピー」まで(直す・工程・やり取り・ピンは v1、制作した HTML の編集・AI は FULL)。
// 中身は、渡した写し(制作が直していれば、その写し)。渡す前は、いまの配信カードから作った下書き。写しの作り・コピーの値は、
// 詳しい制作のページ(ProductionPage)と同じもの(productionSnapshot.ts)を使い、ここでは並べ方だけを変える
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge, Button, Dialog, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Tab, TabList, Text, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowDownloadRegular, CopyRegular, DesktopRegular, DismissRegular, DocumentTextRegular, MoreHorizontalRegular, OpenRegular, PhoneRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from '../models/deliveryCards'
import type { Product } from '../models/products'
import type { HeroImage } from '../models/heroImages'
import type { ProductionRequest } from '../models/productionRequests'
import type { VariantKey } from '../abTest'
import { ProductionRequestsService } from '../data/productionRequests'
import { CardPreview } from '../CardPreview'
import { ChannelBadge } from '../ChannelBadge'
import { CreativeAssets } from '../CreativeAssets'
import { LabeledValue } from '../LabeledValue'
import { MarkdownLite } from '../MarkdownLite'
import { PreviewPartPicker } from '../PreviewPartPicker'
import { ResizableSurface } from '../ResizableSurface'
import { Splitter } from '../Splitter'
import { CopyButton } from '../ProductionInfoPane'
import { usePaneWidths } from '../floatLayout'
import { slotIdsOf } from '../slots'
import { PREF } from '../prefKeys'
import { typo } from '../typo'
import { day, locale, useT, when } from '../i18n'
import { productionColor, productionLabel, productionView } from '../useProductionRequests'
import { StageHeader } from '../simple/StageHeader'
import { partElement, type PartRef } from '../simple/parts'
import {
  buildSnapshot,
  downloadText,
  getText,
  htmlLinks,
  linkRows,
  parseSnapshot,
  previewHtml,
  productRows,
  productionVariants,
  rowsText,
  snapshotOf,
  textRows,
  trackingRows,
  type Snapshot,
  type TextField,
} from '../productionSnapshot'

const useStyles = makeStyles({
  surface: { position: 'fixed', inset: 0, margin: 'auto', width: 'min(1600px, (97vw / var(--ui-zoom, 1)))', maxWidth: 'none', height: 'calc(92vh / var(--ui-zoom, 1))', maxHeight: 'calc(92vh / var(--ui-zoom, 1))', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  name: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '420px' },
  state: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: '12px', color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  panes: { flexGrow: 1, minHeight: 0, display: 'grid' },
  previewPane: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, backgroundColor: tokens.colorNeutralBackground3 },
  previewBar: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '6px 12px' },
  grow: { flexGrow: 1 },
  // プレビューの箱(部品を選ぶ層の基準。スクロールする)
  previewBox: { position: 'relative', flexGrow: 1, minHeight: 0, overflow: 'auto', padding: '8px 16px 24px', outline: 'none' },
  side: { minWidth: 0, minHeight: 0, overflowY: 'auto', padding: '12px 16px 24px', display: 'grid', rowGap: '14px', alignContent: 'start' },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px' },
  heading: { ...typo.heading, flexGrow: 1, minWidth: 0 },
  section: { display: 'grid', rowGap: '6px' },
  row: { display: 'flex', alignItems: 'flex-start', columnGap: '8px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  rowValue: { display: 'grid', rowGap: '2px', flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', fontSize: tokens.fontSizeBase300 },
  rowLabel: { ...typo.label },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  hero: { maxWidth: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1 },
  thumb: { width: '56px', height: '56px', objectFit: 'contain', flexShrink: 0, borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground1 },
  instructions: { padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2, fontSize: tokens.fontSizeBase300 },
  meta: { display: 'flex', columnGap: '20px', rowGap: '4px', flexWrap: 'wrap' },
  actions: { display: 'flex', columnGap: '8px', flexWrap: 'wrap' },
  // HTML を作るためだけの、見えないプレビュー(写しの中身を、そのままの大きさで描く)
  offscreen: { position: 'fixed', left: '-10000px', top: 0, width: '700px', pointerEvents: 'none' },
})

interface Props {
  card: DeliveryCard
  /** いまの掲載商品(メールの並び順) */
  productIds: string[]
  /** AB テストの B・C 案の商品(X55) */
  variantIds?: Partial<Record<VariantKey, string[]>>
  products: Product[]
  /** この配信で選んだ商品の画像(商品 ID → 画像の URL。X64) */
  productImages?: Map<string, string>
  heroes: HeroImage[]
  people: string[]
  onClose: () => void
  /** 詳しい制作のページに切り替える(消すまでは並べて残す。決定 6) */
  onFullView?: () => void
  /** 題の行の面のタブ(PLAN | PRODUCTION | RESULTS。StageNav の tabs) */
  stageTabs?: ReactNode
}

// 依頼として生きている状態(この状態の版の写しを見せる。ほかは、いまの配信カードからの下書き)
const LIVE = new Set(['requested', 'in_progress', 'done', 'checked', 'sent'])

/** 部品の名前(ペインの見出し) */
function partTitle(p: PartRef, t: ReturnType<typeof useT>, rows: { field: TextField; label: string }[]): string {
  const textLabel = (match: (f: TextField) => boolean) => rows.find((r) => match(r.field))?.label
  switch (p.kind) {
    case 'subject':
      return t('件名', 'Subject')
    case 'preheader':
      return t('プリヘッダー', 'Preheader')
    case 'pushTitle':
      return t('通知のタイトル', 'Notification title')
    case 'pushBody':
      return t('通知の本文', 'Notification body')
    case 'headline':
      return t('ヘッドライン', 'Headline')
    case 'copy':
      return t('コピー', 'Copy')
    case 'hero':
      return t('メイン画像', 'Main image')
    case 'sectionTitle':
      return textLabel((f) => f.key === 'section_titles' && f.index === p.index) ?? t('セクションの見出し', 'Section heading')
    case 'sectionCopy':
      return textLabel((f) => f.key === 'section_copies' && f.index === p.index) ?? t('セクションのコピー', 'Section copy')
    case 'section':
      return t(`セクション ${p.index + 1}`, `Section ${p.index + 1}`)
    case 'product':
      return t('商品', 'Product')
    case 'slot':
      return t('空いた枠', 'Empty slot')
    case 'button':
      return t('ボタン', 'Button')
    case 'image':
      return t('画像', 'Image')
    case 'text':
      return textLabel((f) => f.key === 'part_text' && f.id === p.id) ?? t('テキスト', 'Text')
    default:
      return t('部品', 'Part')
  }
}

/** 選んだ部品の文(テキストの行の、どの欄か) */
function textFieldsOf(p: PartRef): (f: TextField) => boolean {
  switch (p.kind) {
    case 'subject':
      return (f) => f.key === 'subject'
    case 'preheader':
      return (f) => f.key === 'preheader'
    case 'pushTitle':
      return (f) => f.key === 'push_title'
    case 'pushBody':
      return (f) => f.key === 'push_body'
    case 'headline':
      return (f) => f.key === 'headline'
    case 'copy':
      return (f) => f.key === 'copy'
    case 'sectionTitle':
      return (f) => f.key === 'section_titles' && f.index === p.index
    case 'sectionCopy':
      return (f) => f.key === 'section_copies' && f.index === p.index
    case 'section':
      return (f) => (f.key === 'section_titles' || f.key === 'section_copies') && f.index === p.index
    case 'text':
    case 'button':
      return (f) => f.key === 'part_text' && f.id === p.id
    default:
      return () => false
  }
}

export function SimpleProductionPage({ card, productIds, variantIds, products, productImages, heroes, people, onClose, onFullView, stageTabs }: Props) {
  const s = useStyles()
  const t = useT()
  const panes = usePaneWidths(PREF.productionSimplePaneWidths, [0, 420], 0)
  const [requests, setRequests] = useState<ProductionRequest[] | null>(null)
  const [device, setDevice] = useState<'mobile' | 'pc'>('pc')
  const [variant, setVariant] = useState<VariantKey>('A')
  const [part, setPart] = useState<PartRef | null>(null)
  // 選んだ部品に写っている画像の URL(プレビューに描いたものから、選んだときに読む。テンプレートの画像も同じに扱える)
  const [partImg, setPartImg] = useState('')
  const pick = (p: PartRef | null) => {
    const el = p && boxRef.current ? partElement(boxRef.current, p) : null
    const src = el instanceof HTMLImageElement ? el.getAttribute('src') : (el?.querySelector('img')?.getAttribute('src') ?? null)
    setPartImg(src ? new URL(src, location.href).href : '')
    setPart(p)
  }
  const boxRef = useRef<HTMLDivElement>(null)
  const offscreenRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const r = await ProductionRequestsService.getAll({ filter: `delivery_card_id eq '${card.id}'` })
    setRequests(r.success ? [...(r.data ?? [])].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0)) : [])
  }, [card.id])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // 写し: 渡したあとは固めたもの(制作が直していれば、その写し)、渡す前はいまの配信カードから作った下書き(詳しい制作のページと同じ決め方)
  const latest = requests?.[0]
  const live = latest && LIVE.has(latest.status ?? '') ? latest : undefined
  const shownProducts = useMemo(() => (productImages?.size ? products.map((p) => (productImages.has(p.id) ? { ...p, image_url: productImages.get(p.id) } : p)) : products), [products, productImages])
  const draft = useMemo(() => buildSnapshot(card, slotIdsOf(card.id, productIds), shownProducts, heroes, variantIds), [card, productIds, shownProducts, heroes, variantIds])
  const frozen = useMemo(() => parseSnapshot(live?.snapshot), [live?.snapshot])
  const edited = useMemo(() => parseSnapshot(live?.edited_snapshot), [live?.edited_snapshot])
  const snap: Snapshot = edited ?? frozen ?? draft
  const keys = productionVariants(snap)
  const cur: VariantKey = keys.includes(variant) ? variant : 'A'
  const vs = snapshotOf(snap, cur)
  const view = productionView(card, latest)
  const instructions = live ? (live.instructions ?? '') : (card.instructions ?? '')
  const owner = live ? (live.production_owner ?? '') : (card.production_owner ?? '')
  const due = live ? (live.production_due ?? '') : (card.production_due ?? '')

  const texts = textRows(vs)
  const prows = productRows(vs, cur)
  const lrows = linkRows(vs, cur)
  const trows = trackingRows(vs, cur)
  const previewCard = { ...card, ...vs.card } as DeliveryCard

  // 企画の見本の HTML(詳しい制作のページと同じ作り方: 見えないプレビューから、書式を直接書いた形にする)。押したときに作る
  const sampleHtml = () => (offscreenRef.current ? previewHtml(offscreenRef.current, card.name ?? '', htmlLinks(vs, cur)) : '')
  const fileName = `${(card.name ?? 'delivery').replace(/[\\/:*?"<>|]/g, '_')}${keys.length > 1 ? `-${cur}` : ''}.html`
  const [copied, setCopied] = useState(false)
  const copyHtml = () =>
    void navigator.clipboard?.writeText(sampleHtml()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })

  const when_ = card.scheduled_at ? new Date(card.scheduled_at).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''

  const copyRow = (label: string, value: string, key: string, extra?: ReactNode) => (
    <div key={key} className={s.row}>
      <span className={s.rowValue}>
        <span className={s.rowLabel}>{label}</span>
        {extra}
        {value || <span className={s.note}>{t('(空)', '(empty)')}</span>}
      </span>
      {value && <CopyButton text={value} />}
    </div>
  )

  /** 何も選んでいないとき: 渡されたもの(制作の人が最初に読むもの) */
  const givenPane = (
    <>
      <div className={s.head}>
        <span className={s.heading}>{t('渡されたもの', 'Handed over')}</span>
      </div>
      <div className={s.meta}>
        <LabeledValue label={t('制作の担当', 'Production owner')}>{owner}</LabeledValue>
        <LabeledValue label={t('締め切り', 'Due')}>{due ? day(due) : ''}</LabeledValue>
        <LabeledValue label={t('渡した日時', 'Handed off')}>{live?.requested_at ? when(live.requested_at) : ''}</LabeledValue>
      </div>
      {!live && <span className={s.note}>{t('まだ制作に渡していません。中身は、いまの配信カードから作った下書きです', 'Not handed off yet. This is a draft built from the current delivery card.')}</span>}
      <div className={s.section}>
        <div className={s.head}>
          <span className={s.heading}>{t('制作指示', 'Production notes')}</span>
          {instructions && <CopyButton text={instructions} label={t('制作指示をコピー', 'Copy production notes')} />}
        </div>
        {instructions ? <div className={s.instructions}><MarkdownLite text={instructions} /></div> : <span className={s.note}>{t('制作指示はありません', 'No production notes')}</span>}
      </div>
      <div className={s.section}>
        <div className={s.head}>
          <span className={s.heading}>{t('テキスト', 'Text')}</span>
          {texts.length > 0 && <CopyButton text={rowsText(texts)} label={t('まとめてコピー', 'Copy all')} />}
        </div>
        {texts.length ? texts.map((r) => copyRow(r.label, r.value, r.id)) : <span className={s.note}>{t('テキストはありません', 'No text')}</span>}
      </div>
      <div className={s.section}>
        <div className={s.head}>
          <span className={s.heading}>{t(`商品(${prows.length})`, `Products (${prows.length})`)}</span>
          {prows.length > 0 && <CopyButton text={prows.map((r) => [r.section, r.product.name, r.product.product_code, r.price, r.url].filter(Boolean).join('\t')).join('\n')} label={t('まとめてコピー', 'Copy all')} />}
        </div>
        {prows.length === 0 && <span className={s.note}>{t('商品はありません', 'No products')}</span>}
      </div>
      <div className={s.section}>
        <div className={s.head}>
          <span className={s.heading}>{t('リンク先', 'Links')}</span>
          {lrows.some((r) => r.value) && <CopyButton text={rowsText(lrows.filter((r) => r.value))} label={t('まとめてコピー', 'Copy all')} />}
        </div>
        {trows.length > 0 && (
          <div className={s.actions}>
            <CopyButton text={['utm_content\tdescription\tproduct_code\turl', ...trows.map((r) => [r.content, r.desc, r.productCode ?? '', r.url].join('\t'))].join('\n')} label={t('計測の対応表をコピー(表計算に貼れる形)', 'Copy the tracking map (for spreadsheets)')} />
            <span className={s.note}>{t(`計測の対応表(utm_content。${trows.length})`, `Tracking map (utm_content; ${trows.length})`)}</span>
          </div>
        )}
      </div>
      <div className={s.section}>
        <div className={s.head}>
          <span className={s.heading}>{t('企画の見本の HTML', 'Plan sample HTML')}</span>
        </div>
        <div className={s.actions}>
          <Button size="small" icon={<CopyRegular />} onClick={copyHtml}>
            {copied ? t('コピーしました', 'Copied') : t('HTML をコピー', 'Copy HTML')}
          </Button>
          <Button size="small" icon={<ArrowDownloadRegular />} onClick={() => downloadText(fileName, sampleHtml())}>
            {t('.html で保存', 'Save as .html')}
          </Button>
        </div>
        <span className={s.note}>{t('プレビューと同じ見た目の HTML です(リンクには計測用のパラメーターが付いています)', 'HTML that looks like the preview (links include tracking parameters).')}</span>
      </div>
      {/* 参考の素材(企画が配信カードで置いたもの。制作の面からも見られる) */}
      <CreativeAssets cardId={card.id} stage="production" people={people} cardName={card.name ?? ''} productionOwner={owner} productionDue={due} productIds={vs.productIds.filter(Boolean)} products={vs.products} title={t('参考の素材', 'Reference materials')} compactAdd />
      <span className={s.note}>{t('プレビューの部品を押すと、その部品の材料だけを出します', 'Click a part in the preview to see only its materials.')}</span>
    </>
  )

  /** 部品を選んだとき: その部品の材料(どれも 1 押しでコピー) */
  const partPane = (p: PartRef) => {
    const all = textRows(vs, true)
    const title = partTitle(p, t, all)
    const match = textFieldsOf(p)
    const trs = all.filter((r) => match(r.field))
    const imgUrl = partImg
    const linkKey = p.kind === 'hero' ? 'hero' : p.kind === 'button' || p.kind === 'image' ? p.id : null
    const links = linkKey ? lrows.filter((r) => r.slotKey === linkKey) : []
    const prod = p.kind === 'product' ? prows.find((r) => `${r.product.id}-${r.at}` === p.itemKey) : undefined
    // 表の箱は、写真・名前などが別々のリンク(utm_content)になる。商品ページの URL と同じものは重ねて出さない
    const prodTracking = prod ? trows.filter((r) => r.productCode && r.productCode === prod.product.product_code && r.url !== prod.url) : p.kind === 'image' || p.kind === 'button' ? trows.filter((r) => r.content.startsWith(`${p.id}`)) : []
    return (
      <>
        <div className={s.head}>
          <span className={s.heading}>{title}</span>
          <Button size="small" appearance="subtle" onClick={() => pick(null)}>
            {t('渡されたものに戻る', 'Back to handed over')}
          </Button>
        </div>
        {trs.map((r) => copyRow(r.label, getText(vs, r.field), r.id))}
        {imgUrl && (p.kind === 'hero' || p.kind === 'image') && (
          <div className={s.section}>
            <img className={s.hero} src={imgUrl} alt="" />
            <div className={s.actions}>
              <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => window.open(imgUrl, '_blank', 'noopener')}>
                {t('画像を開く(保存できます)', 'Open image (to save)')}
              </Button>
            </div>
            {copyRow(t('画像の URL', 'Image URL'), imgUrl, 'img')}
          </div>
        )}
        {prod && (
          <div className={s.section}>
            <div className={s.row}>
              <img className={s.thumb} src={prod.product.image_url ?? ''} alt="" />
              <span className={s.rowValue}>
                <span className={s.rowLabel}>{prod.section}</span>
                {prod.product.name}
              </span>
              <CopyButton text={[prod.product.name, prod.product.product_code, prod.price, prod.url].filter(Boolean).join('\t')} label={t('まとめてコピー', 'Copy all')} />
            </div>
            {copyRow(t('商品名', 'Product name'), prod.product.name ?? '', 'name')}
            {copyRow(t('商品コード', 'Product code'), prod.product.product_code ?? '', 'code')}
            {copyRow(t('価格', 'Price'), prod.price, 'price')}
            {copyRow(t('商品ページの URL(計測用のパラメーター付き)', 'Product page URL (with tracking)'), prod.url, 'url')}
          </div>
        )}
        {links.map((r, i) => copyRow(t(`リンク先: ${r.label}`, `Link: ${r.label}`), r.value, `link${i}`))}
        {prodTracking.map((r) => copyRow(`utm_content: ${r.content}`, r.url, `trk-${r.content}-${r.url}`, <span className={s.note}>{r.desc}</span>))}
        {p.kind === 'slot' && <span className={s.note}>{t('この枠には、商品が入っていません', 'This slot has no product.')}</span>}
        {!trs.length && !imgUrl && !prod && !links.length && !prodTracking.length && p.kind !== 'slot' && <span className={s.note}>{t('この部品に、コピーする材料はありません(中身はテンプレートで決まっています)', 'Nothing to copy for this part (its content comes from the template).')}</span>}
      </>
    )
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="productionSimple" min={{ w: 720, h: 480 }} className={s.surface} aria-label={card.name ?? ''}>
        <StageHeader
          title={
            <>
              <ChannelBadge channel={card.channel} />
              <span className={s.name}>{card.name}</span>
              <span>{when_}</span>
              {/* 制作の状態(読むだけ。工程のボタンは v1) */}
              <Tooltip content={t('制作の状態', 'Production status')} relationship="label">
                <span className={s.state}>
                  <span className={s.dot} style={{ backgroundColor: productionColor(view) }} aria-hidden />
                  {productionLabel(view)}
                </span>
              </Tooltip>
            </>
          }
          tabs={stageTabs}
          actions={
            <>
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('そのほかの操作', 'More actions')} />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem icon={<CopyRegular />} onClick={copyHtml}>
                      {t('企画の見本の HTML をコピー', 'Copy the plan sample HTML')}
                    </MenuItem>
                    <MenuItem icon={<ArrowDownloadRegular />} onClick={() => downloadText(fileName, sampleHtml())}>
                      {t('企画の見本を .html で保存', 'Save the plan sample as .html')}
                    </MenuItem>
                    {onFullView && (
                      <MenuItem icon={<DocumentTextRegular />} onClick={onFullView}>
                        {t('詳しい制作のページで開く', 'Open the full production page')}
                      </MenuItem>
                    )}
                  </MenuList>
                </MenuPopover>
              </Menu>
              <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
            </>
          }
        />
        <div className={s.panes} style={{ gridTemplateColumns: panes.columns }}>
          <div className={s.previewPane}>
            <div className={s.previewBar}>
              {keys.length > 1 && (
                <TabList size="small" selectedValue={cur} onTabSelect={(_, d) => (setVariant(d.value as VariantKey), pick(null))}>
                  {keys.map((k) => (
                    <Tab key={k} value={k}>
                      {t(`案 ${k}`, `Variant ${k}`)}
                    </Tab>
                  ))}
                </TabList>
              )}
              <Text size={200}>{t('企画の見本(部品を押すと、その材料を右に出します)', 'Plan sample (click a part to see its materials on the right)')}</Text>
              <span className={s.grow} />
              {edited && <Badge appearance="tint" color="warning">{t('制作が直した写し', 'Edited in production')}</Badge>}
              <TabList size="small" selectedValue={device} onTabSelect={(_, d) => setDevice(d.value as 'mobile' | 'pc')}>
                <Tab value="mobile" icon={<PhoneRegular />} aria-label={t('スマホ', 'Phone')} />
                <Tab value="pc" icon={<DesktopRegular />} aria-label={t('PC', 'Desktop')} />
              </TabList>
            </div>
            <div ref={boxRef} className={s.previewBox} tabIndex={-1}>
              <CardPreview card={previewCard} productIds={vs.productIds} products={vs.products} heroes={vs.hero ? [vs.hero] : []} device={device} />
              <PreviewPartPicker boxRef={boxRef} selected={part} onSelect={pick} />
            </div>
          </div>
          <Splitter onDrag={panes.onDrag(0)} onDone={panes.onDone} />
          <div className={mergeClasses(s.side)}>{part ? partPane(part) : givenPane}</div>
        </div>
        {/* 見本の HTML を作るためだけの、見えないプレビュー(画面の大きさ・スマホの切り替えに左右されないように、別に描く) */}
        <div className={s.offscreen} aria-hidden>
          <div ref={offscreenRef}>
            <CardPreview card={previewCard} productIds={vs.productIds} products={vs.products} heroes={vs.hero ? [vs.hero] : []} />
          </div>
        </div>
      </ResizableSurface>
    </Dialog>
  )
}
