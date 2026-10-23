import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Input, ToggleButton, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import {
  ArrowDownRegular,
  ArrowUpRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
} from '@fluentui/react-icons'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { AutoTextarea } from './AutoTextarea'
import { DND_HERO, DND_ITEM, scaled, yen, type Item } from './items'
import { heroImage, productImage } from './images'
import { heroCropStyle } from './heroRights'
import { productMarket } from './market'
import { buttonsAt, defaultButtonLabel, getTemplate, gridColumns, placedButtons, type ButtonSpec, type EmailTemplateId, type BoxField, type Section, type TablePart, ratioValue } from './templates'
import { SECTION_BG, boxFields, boxesOf, buttonColor, sectionSpace } from './tables'
import { cellRows, isTextView } from './cells'
import { HEADLINE_FONT } from './fonts'
import { locale, optionLabel, useT } from './i18n'

interface Props {
  channel: 'email' | 'push'
  subject: string
  /** メールの件名(空は subject = 配信名)とプリヘッダー(X2) */
  subjectLine?: string
  preheader?: string
  /** メールの幅(X3。mobile = スマホ 375px / pc = PC 640px。既定はこれまでどおり 440px) */
  device?: 'mobile' | 'pc'
  /** メイン画像に載せる大見出し */
  headline: string
  copy: string
  items: Item[]
  products: Product[]
  selectedKey: string | null
  /** 商品リストの行にマウスが乗っている商品(該当商品を光らせる) */
  hoverKey?: string | null
  showHeadings: boolean
  template: EmailTemplateId
  /** 配信日時(ロック画面の時計に使う) */
  scheduledAt: string
  /** true のとき、画像を小さくした表示(プッシュのメッセージ用) */
  compact?: boolean
  /** カテゴリ系テンプレートの見出し(セクションの順) */
  sectionTitles: string[]
  onSectionTitle: (index: number, text: string) => void
  /** 各セクションのコピー(セクションの順) */
  sectionCopies: string[]
  onSectionCopy: (index: number, text: string) => void
  /** 設定中のメイン画像 */
  hero?: HeroImage
  onDropHero: (heroId: string) => void
  onClearHero: () => void
  onSelect: (key: string) => void
  onRemove: (key: string) => void
  /** 1つ前/後ろへ移す(delta は -1 か 1) */
  onMove: (key: string, delta: number) => void
  /** index の位置へドロップされた(末尾は items.length) */
  onDropAt: (index: number, dt: DataTransfer) => void
  /** アプリ: 通知を押したときに開く画面の種類(未設定は undefined。この配信のメッセージとして見せる) */
  pushLinkKind?: string
  /** アプリ: 通知のタイトル・本文(空なら、メッセージのヘッドライン・コピーで仮に見せる) */
  pushTitle?: string
  pushBody?: string
  /**
   * 部品を押して選ぶ見せ方(シンプルな配信カード SU1)。入力はペインで行うので、プレビューの中の入力欄は文字の表示にし、
   * 並べ替え・外すのボタンも出さない(並べ替えのドラッグは残す)。受信箱の 1 行は、画面の側がプレビューの上に出す
   */
  pickMode?: boolean
}

// メール・プッシュは受信側の見た目なので、テーマに依らず固定の配色にする
const INK = '#222'
const SUB = '#666'
const ACCENT = '#6750a4'
const ACCENT_BG = 'rgba(103,80,164,0.08)'

const useStyles = makeStyles({
  fit: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  controls: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    right: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    opacity: 0,
    pointerEvents: 'none',
  },
  controlsGroup: { display: 'flex', gap: '4px', pointerEvents: 'auto' },
  ctlRight: { pointerEvents: 'auto' },
  ctl: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    color: INK,
    '&:hover': { backgroundColor: '#fff', color: INK },
    '&:hover:active': { backgroundColor: '#fff', color: INK },
  },
  heroClear: { position: 'absolute', top: '8px', right: '8px', opacity: 0 },
  frame: {
    position: 'relative',
    cursor: 'grab',
    padding: '6px',
    borderRadius: '12px',
    border: '2px solid transparent',
    '&:hover .remove': { opacity: 1 },
  },
  featureFrame: { display: 'flex', gap: '12px' },
  featureBody: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px' },
  // 商品の写真は、縦長でも横長でも、全体を枠に収める(長い辺を、枠の辺に合わせる。切り取らない)。余白は、薄い灰色
  img: { objectFit: 'contain', borderRadius: '8px', backgroundColor: '#f1f1f4', display: 'block' },
  noWrap: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  slot: {
    border: '2px dashed #bbb',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: SUB,
    textAlign: 'center',
  },
  hero: {
    position: 'relative',
    containerType: 'inline-size',
    color: '#999',
    display: 'grid',
    placeItems: 'center',
    fontSize: '12.8px',
    '&:hover .hero-clear': { opacity: 1 },
  },
  headingInput: {
    border: `2px solid ${INK}`,
    borderRadius: 0,
    backgroundColor: 'transparent',
    color: INK,
    maxWidth: '100%',
    '::after': { display: 'none' },
  },
  copyTextarea: {
    width: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    '::after': { display: 'none' },
    '& textarea::placeholder': { opacity: 0.6 },
  },
  pushRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px',
    border: '2px solid',
    borderRadius: '12px',
    cursor: 'grab',
  },
  pushDrop: {
    border: '2px dashed',
    borderRadius: '12px',
    padding: '12px 0',
    textAlign: 'center',
    color: tokens.colorNeutralForeground2,
    fontSize: '13.6px',
  },
})

// ブロックの data-anchor(hero・section:N・button:… など)は、プレビュー上に置く書き込み(ピン)の場所の目印(pinStore.ts)。
// 座標だけで持つと、幅・倍率・文言でずれるので、ブロックの中の割合で持つ。名前を変えると、置いたピンが見つからなくなる。
// 部品を選ぶ(SU1)ための細かい目印は、別の属性 data-part に持つ(simple/parts.ts。見出しとコピー・空いた枠などを見分ける)
export function Preview(props: Props) {
  return props.channel === 'email' ? <EmailPreview {...props} /> : <PushPreview {...props} />
}

function useDropTarget(onDropAt: Props['onDropAt']) {
  const [over, setOver] = useState<number | null>(null)
  const handlers = (index: number) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DND_ITEM) ? 'move' : 'copy'
      setOver(index)
    },
    onDragLeave: () => setOver((o) => (o === index ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(null)
      onDropAt(index, e.dataTransfer)
    },
  })
  return { over, handlers, clear: () => setOver(null) }
}

/** 1 行に必ず収まる文字。はみ出すときだけ、フォントサイズを縮める(下限 minScale。それでも収まらなければ「…」で省略) */
function FitLine({ baseSize, minScale = 0.55, style, children }: { baseSize: string; minScale?: number; style?: React.CSSProperties; children: string }) {
  const classes = useStyles()
  const ref = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const text = textRef.current
    if (!el || !text) return
    const fit = () => {
      // 文字そのものの幅(text)と、表示できる幅(el)を比べて、倍率を決める。
      // 文字の幅は、現在の倍率に比例するので、「現在の倍率 × 表示幅 / 文字の幅」が、ちょうど収まる倍率になる
      const current = parseFloat(el.style.getPropertyValue('--fit')) || 1
      const width = text.offsetWidth
      if (width <= 0 || el.clientWidth <= 0) return
      const next = Math.max(minScale, Math.min(1, (current * el.clientWidth) / width))
      if (Math.abs(next - current) > 0.004) el.style.setProperty('--fit', String(next))
    }
    fit()
    // 表示幅が変わったとき(ペインの幅の変更など)と、文字の幅が変わったとき(フォントの読み込み、文の変更)の、どちらも検知する
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    ro.observe(text)
    document.fonts?.ready.then(fit)
    document.fonts?.addEventListener?.('loadingdone', fit)
    return () => {
      ro.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', fit)
    }
  }, [children, minScale])

  return (
    <div ref={ref} className={classes.fit} style={{ fontSize: `calc(${baseSize} * var(--fit, 1))`, ...style }}>
      <span ref={textRef} style={{ display: 'inline-block' }}>{children}</span>
    </div>
  )
}

function EmailPreview({ subject, subjectLine, preheader, device, headline, copy, items, products, selectedKey, hoverKey, showHeadings, template, sectionTitles, onSectionTitle, sectionCopies, onSectionCopy, compact = false, hero, onDropHero, onClearHero, onSelect, onRemove, onMove, onDropAt, pickMode = false }: Props) {
  const t = useT()
  const classes = useStyles()
  const { over, handlers, clear } = useDropTarget(onDropAt)
  const [heroOver, setHeroOver] = useState(false)

  // 商品リストで選ばれた商品が、見える位置に来るようにスクロールする
  useEffect(() => {
    if (!selectedKey) return
    document.querySelector(`[data-item-key="${selectedKey}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedKey])
  const byId = new Map(products.map((p) => [p.id, p]))
  const tpl = getTemplate(template)
  const offer = tpl.hero === 'offer'
  const heroText = tpl.heroText ?? 'band'
  const jaHeadline = /[\u3000-\u9fff\uff00-\uffef]/.test(headline)
  const hf = HEADLINE_FONT

  // 商品にマウスを乗せたときに出る、並べ替えと削除のボタン(部品を選ぶ見せ方では、選んだ部品のペインで行う)
  const controls = (it: Item, idx: number) => pickMode ? null : (
    <div className={mergeClasses('remove', classes.controls)}>
      <div className={classes.controlsGroup}>
        <Button
          className={classes.ctl}
          appearance="subtle"
          size="small"
          icon={<ChevronLeftRegular />}
          disabled={idx === 0}
          onClick={(e) => {
            e.stopPropagation()
            onMove(it.key, -1)
          }}
          aria-label={t('前へ', 'Previous')}
        />
        <Button
          className={classes.ctl}
          appearance="subtle"
          size="small"
          icon={<ChevronRightRegular />}
          disabled={idx === items.length - 1}
          onClick={(e) => {
            e.stopPropagation()
            onMove(it.key, 1)
          }}
          aria-label={t('後ろへ', 'Next')}
        />
      </div>
      <Button
        className={mergeClasses(classes.ctl, classes.ctlRight)}
        appearance="subtle"
        size="small"
        icon={<DismissRegular />}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(it.key)
        }}
        aria-label={t('外す', 'Remove')}
      />
    </div>
  )

  const dragProps = (it: Item, idx: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DND_ITEM, it.key)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: clear,
    onClick: () => onSelect(it.key),
    'data-item-key': it.key,
    ...handlers(idx),
  })

  const frameStyle = (it: Item, idx: number): React.CSSProperties => ({
    borderColor: over === idx ? tokens.colorBrandForeground1 : it.key === selectedKey || it.key === hoverKey ? ACCENT : 'transparent',
    backgroundColor: over === idx ? 'rgba(103,80,164,0.08)' : 'transparent',
  })

  const priceEl = (price?: number, market?: 'JP' | 'US') =>
    offer ? (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#d32f2f' }}>{yen(price, market)}</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', backgroundColor: '#d32f2f', padding: '0 6px', borderRadius: 4 }}>
          {t('期間限定', 'LIMITED TIME')}
        </span>
      </div>
    ) : (
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: INK }}>{yen(price, market)}</div>
    )

  const cta = (
    <div style={{ marginTop: 6, padding: '4px 0', textAlign: 'center', backgroundColor: offer ? '#d32f2f' : '#222', color: '#fff', fontSize: '0.75rem', borderRadius: 4 }}>
      {t('詳細はこちら', 'View details')}
    </div>
  )

  const gridTile = (it: Item, idx: number) => {
    const p = byId.get(it.productId)
    return (
      <div key={it.key} {...dragProps(it, idx)} className={classes.frame} style={frameStyle(it, idx)}>
        <img className={classes.img} draggable={false} src={productImage(p, it.imageUrl)} alt={p?.name} style={{ width: '100%', aspectRatio: compact ? '1 / 1' : '3 / 4' }} />
        <div className={classes.noWrap} style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: 4, color: INK }}>{p?.name}</div>
        {priceEl(p?.price, productMarket(p))}
        {controls(it, idx)}
      </div>
    )
  }

  // 写真だけのタイル: 名前・価格を出さず、写真を敷き詰める
  const photoTile = (it: Item, idx: number) => {
    const p = byId.get(it.productId)
    return (
      <div key={it.key} {...dragProps(it, idx)} className={classes.frame} style={{ ...frameStyle(it, idx), padding: 2 }}>
        <img className={classes.img} draggable={false} src={productImage(p, it.imageUrl)} alt={p?.name} style={{ width: '100%', aspectRatio: '4 / 5', borderRadius: 4 }} />
        {controls(it, idx)}
      </div>
    )
  }

  // 写真を枠いっぱいに敷き、名前・価格を、下端の白い帯に載せる(ぼかさない。大きく 1 点・モザイク)。
  // fill: 枠の高さに合わせる(モザイクのマス)。そうでなければ正方形
  const overlayTile = (it: Item, idx: number, fill: boolean, small = false) => {
    const p = byId.get(it.productId)
    return (
      <div key={it.key} {...dragProps(it, idx)} className={classes.frame} style={{ ...frameStyle(it, idx), padding: 0, ...(fill ? { height: '100%' } : {}) }}>
        <img className={classes.img} draggable={false} src={productImage(p, it.imageUrl)} alt={p?.name} style={{ width: '100%', ...(fill ? { height: '100%' } : { aspectRatio: '1 / 1' }) }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: small ? '4px 6px' : '8px 12px', borderRadius: '0 0 8px 8px', background: 'rgba(255,255,255,0.92)' }}>
          <div className={classes.noWrap} style={{ fontSize: small ? '0.7rem' : '0.9rem', fontWeight: 600, color: INK }}>{p?.name}</div>
          {!small && priceEl(p?.price, productMarket(p))}
        </div>
        {controls(it, idx)}
      </div>
    )
  }

  // 箱の「写真だけ」: 枠いっぱいに写真を敷く(名前・価格を出さない)
  const overlayPhoto = (it: Item, idx: number) => {
    const p = byId.get(it.productId)
    return (
      <div key={it.key} {...dragProps(it, idx)} className={classes.frame} style={{ ...frameStyle(it, idx), padding: 0, height: '100%' }}>
        <img className={classes.img} draggable={false} src={productImage(p, it.imageUrl)} alt={p?.name} style={{ width: '100%', height: '100%' }} />
        {controls(it, idx)}
      </div>
    )
  }

  // ストーリー: 写真と、名前・価格・商品の説明を横に並べる。reverse で、写真を左にする
  const storyRow = (it: Item, idx: number, reverse: boolean) => {
    const p = byId.get(it.productId)
    const text = (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '12px 14px', minWidth: 0 }}>
        {p?.category_name && <div style={{ fontSize: '0.65rem', letterSpacing: 2, color: SUB }}>{optionLabel(p.category_name).toUpperCase()}</div>}
        <div style={{ fontSize: '1rem', fontWeight: 600, color: INK }}>{p?.name}</div>
        {priceEl(p?.price, productMarket(p))}
        {p?.description && <div style={{ fontSize: '0.78rem', color: SUB, lineHeight: 1.5, marginTop: 6 }}>“{p.description}”</div>}
      </div>
    )
    const img = <img className={classes.img} draggable={false} src={productImage(p, it.imageUrl)} alt={p?.name} style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 0 }} />
    return (
      <div key={it.key} {...dragProps(it, idx)} className={classes.frame} style={{ ...frameStyle(it, idx), padding: 0, backgroundColor: over === idx ? ACCENT_BG : '#f1f1f3' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
          {reverse ? img : text}
          {reverse ? text : img}
        </div>
        {controls(it, idx)}
      </div>
    )
  }

  // 特集枠: 画像を左、商品名・説明・価格を右に大きく見せる
  const featureTile = (it: Item, idx: number) => {
    const p = byId.get(it.productId)
    return (
      <div key={it.key} {...dragProps(it, idx)} className={mergeClasses(classes.frame, classes.featureFrame)} style={frameStyle(it, idx)}>
        <img className={classes.img} draggable={false} src={productImage(p, it.imageUrl)} alt={p?.name} style={{ width: compact ? '30%' : '44%', aspectRatio: compact ? '1 / 1' : '3 / 4', flexShrink: 0 }} />
        <div className={classes.featureBody}>
          <div style={{ fontSize: '0.7rem', letterSpacing: 2, color: SUB }}>FEATURE</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: INK }}>{p?.name}</div>
          <div style={{ fontSize: '0.8rem', color: SUB }}>{p?.description}</div>
          {priceEl(p?.price, productMarket(p))}
          {cta}
        </div>
        {controls(it, idx)}
      </div>
    )
  }

  // ---- 表の箱(T8): テンプレートで決めた「出すもの」・価格の見せ方・バッジで描く(以前の種類のタイルは、そのまま)
  const boxTile = (it: Item, idx: number, part: TablePart, j: number) => {
    const p = byId.get(it.productId)
    const fields = boxFields(part)
    const has = (f: BoxField) => fields.includes(f)
    const market = productMarket(p)
    const sale = part.priceStyle === 'sale'
    const regular = sale && p?.regular_price && p.price !== undefined && p.regular_price > p.price ? p.regular_price : undefined
    const price = has('price') && (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        {regular !== undefined && <span style={{ fontSize: '0.72rem', color: SUB, textDecoration: 'line-through' }}>{yen(regular, market)}</span>}
        <span style={{ fontSize: sale ? '0.95rem' : '0.8rem', fontWeight: sale ? 800 : 700, color: sale || offer ? '#d32f2f' : INK }}>
          {part.priceStyle === 'from' ? t(`${yen(p?.price, market)}〜`, `From ${yen(p?.price, market)}`) : yen(p?.price, market)}
        </span>
      </div>
    )
    const badgeText = part.badge?.trim() || 'NEW'
    const badge = has('badge') && (
      <span style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, padding: '2px 8px', borderRadius: 4, color: '#fff', backgroundColor: /sale|限定|off/i.test(badgeText) || sale ? '#d32f2f' : INK }}>{badgeText}</span>
    )
    const name = has('name') && <div className={classes.noWrap} style={{ fontSize: '0.85rem', fontWeight: 600, color: INK }}>{p?.name}</div>
    const desc = has('desc') && p?.description && <div style={{ fontSize: '0.75rem', color: SUB, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>
    const button = has('button') && cta
    const text = (name || price || desc || button) && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {name}
        {price}
        {desc}
        {button}
      </div>
    )
    const img = (style: React.CSSProperties) => <img className={classes.img} draggable={false} src={productImage(p, it.imageUrl)} alt={p?.name} style={{ width: '100%', ...style }} />
    // 文を写真の横に置く見せ方(特集・ストーリー)
    if (part.view === 'detail' || part.view === 'story') {
      const reverse = part.view === 'story' && j % 2 === 1
      const body = <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: part.view === 'story' ? '12px 14px' : 0, minWidth: 0 }}>{text}</div>
      const photo = <div style={{ position: 'relative' }}>{badge}{img({ aspectRatio: part.ratio ? String(ratioValue(part.ratio)) : '3 / 4', borderRadius: part.view === 'story' ? 0 : 8 })}</div>
      return (
        <div key={it.key} {...dragProps(it, idx)} className={classes.frame} style={{ ...frameStyle(it, idx), ...(part.view === 'story' ? { padding: 0, backgroundColor: '#f1f1f3' } : {}) }}>
          <div style={{ display: 'grid', gridTemplateColumns: part.view === 'story' ? '1fr 1fr' : '44% 1fr', gap: part.view === 'story' ? 0 : 12, alignItems: 'center' }}>
            {reverse || part.view === 'detail' ? photo : body}
            {reverse || part.view === 'detail' ? body : photo}
          </div>
          {controls(it, idx)}
        </div>
      )
    }
    // 大きい箱・写真だけ: 写真を枠いっぱいに敷き、文は下端の白い帯に
    if (part.view === 'photo' || part.w * part.h > 1) {
      return (
        <div key={it.key} {...dragProps(it, idx)} className={classes.frame} style={{ ...frameStyle(it, idx), padding: 0, height: '100%' }}>
          {badge}
          {img({ height: '100%' })}
          {text && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 12px', borderRadius: '0 0 8px 8px', background: 'rgba(255,255,255,0.92)' }}>{text}</div>}
          {controls(it, idx)}
        </div>
      )
    }
    // ふつうの箱: 写真の下に、名前・価格など
    return (
      <div key={it.key} {...dragProps(it, idx)} className={classes.frame} style={frameStyle(it, idx)}>
        {badge}
        {img({ aspectRatio: part.ratio ? String(ratioValue(part.ratio)) : compact ? '1 / 1' : '3 / 4' })}
        {text && <div style={{ marginTop: 4 }}>{text}</div>}
        {controls(it, idx)}
      </div>
    )
  }

  // 空きの枠: ここへドロップすると、末尾の空き枠から埋まる
  const emptySlot = (key: string, feature: boolean, shape?: React.CSSProperties, index = items.length) => (
    <div
      key={key}
      data-part={`slot:${index}`}
      {...handlers(items.length)}
      className={classes.slot}
      style={{
        aspectRatio: feature ? undefined : compact ? '1 / 1' : '3 / 4',
        minHeight: feature ? 120 : undefined,
        ...shape,
        borderColor: over === items.length ? ACCENT : '#bbb',
        backgroundColor: over === items.length ? ACCENT_BG : 'transparent',
        fontSize: '0.8rem',
        padding: 8,
      }}
    >
      {t('ここに商品をドロップ', 'Drop a product here')}
    </div>
  )

  const headingEl = (text: string) => (
    <div style={{ textAlign: 'center', margin: '12px 0' }}>
      <span style={{ display: 'inline-block', border: `2px solid ${INK}`, padding: '2px 16px', fontWeight: 700, fontSize: '0.95rem', color: INK, letterSpacing: 4 }}>
        {text}
      </span>
    </div>
  )

  // カテゴリ系テンプレートの見出し。クリックして書き換えられる(未設定なら商品カテゴリ名を出す)
  const editableHeading = (index: number, fallback: string) => {
    const value = sectionTitles[index] ? sectionTitles[index] : fallback
    if (pickMode)
      return (
        <div data-part={`sectionTitle:${index}`} style={{ textAlign: 'center', margin: '12px 0' }}>
          <span style={{ display: 'inline-block', border: `2px solid ${INK}`, padding: '4px 16px', fontWeight: 700, fontSize: '0.95rem', color: INK, letterSpacing: 2 }}>{value}</span>
        </div>
      )
    return (
      <div style={{ textAlign: 'center', margin: '12px 0' }}>
        <Input
          className={classes.headingInput}
          appearance="outline"
          value={value}
          onChange={(_, d) => onSectionTitle(index, d.value)}
          input={{ 'aria-label': t(`セクション${index + 1}の見出し`, `Section ${index + 1} heading`), style: { textAlign: 'center', fontWeight: 700, fontSize: '0.95rem', letterSpacing: 2, color: INK } }}
          style={{ width: `${Math.max(10, value.length * 2 + 4)}ch` }}
        />
      </div>
    )
  }

  // セクションのコピー。クリックして書き換えられる(見出しの下、商品の上に入る)
  // hasHeading: カテゴリ見出しの直下かどうか。見出しがないときは、メイン画像から離す(コピーは、直下の商品に寄せる)
  const sectionCopyEl = (index: number, hasHeading: boolean) => {
    const text = sectionCopies[index] ?? ''
    if (pickMode)
      return (
        <div data-part={`sectionCopy:${index}`} style={{ textAlign: 'center', marginTop: hasHeading ? 6 : 22, marginBottom: 4, padding: '2px 8px', fontSize: '0.85rem', color: SUB, letterSpacing: 0.5, whiteSpace: 'pre-wrap', opacity: text ? 1 : 0.6 }}>
          {text || t('(セクションのコピー)', '(Section copy)')}
        </div>
      )
    return (
      <div style={{ textAlign: 'center', marginTop: hasHeading ? 6 : 22, marginBottom: 4, padding: '0 8px' }}>
        <AutoTextarea
          className={classes.copyTextarea}
          appearance="outline"
          rows={Math.max(1, text.split('\n').length)}
          value={text}
          onChange={(_, d) => onSectionCopy(index, d.value)}
          placeholder={t('(セクションのコピー)', '(Section copy)')}
          textarea={{ 'aria-label': t(`セクション${index + 1}のコピー`, `Section ${index + 1} copy`), style: { textAlign: 'center', fontSize: '0.85rem', color: SUB, letterSpacing: 0.5, paddingTop: 2, paddingBottom: 2, minHeight: 0 } }}
        />
      </div>
    )
  }

  // ---- ヒーロー(メイン画像 + 見出し)。種類によって装飾が変わる
  const heroBox = (
    <div
      className={classes.hero}
      data-link="hero"
      data-anchor="hero"
      data-part="hero"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DND_HERO)) return
        e.preventDefault()
        setHeroOver(true)
      }}
      onDragLeave={() => setHeroOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setHeroOver(false)
        const id = e.dataTransfer.getData(DND_HERO)
        if (id) onDropHero(id)
      }}
      style={{
        aspectRatio: heroText === 'band' ? (compact ? '3 / 1' : '8 / 3') : compact ? '2 / 1' : heroText === 'overlay' ? '4 / 5' : '1 / 1',
        backgroundColor: heroOver ? 'rgba(103,80,164,0.15)' : '#e9e9ee',
        // 拡大して切り出すとき(X59 ④)に、はみ出しを隠す
        overflow: 'hidden',
        outline: heroOver ? `3px solid ${ACCENT}` : 'none',
        outlineOffset: -3,
      }}
    >
      {hero ? (
        <>
          <img draggable={false} src={heroImage(hero)} alt={hero.name} style={{ width: '100%', height: '100%', ...heroCropStyle(hero), display: 'block' }} />
          {!pickMode && <Button
            className={mergeClasses('hero-clear', classes.heroClear, classes.ctl)}
            appearance="subtle"
            size="small"
            icon={<DismissRegular />}
            onClick={onClearHero}
            aria-label={t('メイン画像を外す', 'Remove main image')}
          />}
        </>
      ) : (
        t('メインビジュアル(候補から画像をドロップ)', 'Main visual (drop an image from the candidates)')
      )}
      {tpl.hero === 'offer' && (
        <div style={{ position: 'absolute', top: 12, left: 12, backgroundColor: '#d32f2f', color: '#fff', fontWeight: 800, letterSpacing: 2, fontSize: '0.75rem', padding: '4px 10px', borderRadius: 4 }}>
          LIMITED OFFER
        </div>
      )}
      {tpl.hero === 'collab' && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', textAlign: 'center', letterSpacing: 4, fontSize: '0.7rem', padding: '4px 0' }}>
          SPECIAL COLLABORATION
        </div>
      )}
      {/* ヘッドライン(帯): 画像の下部に半透明の帯を敷いて、左寄せの太字で載せる */}
      {heroText === 'band' && (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: `${compact ? '1.2cqw' : '2.2cqw'} 5cqw`,
          backgroundColor: 'rgba(0,0,0,0.42)',
          color: '#fff',
          textAlign: 'left',
          // 部品を選ぶ見せ方では、見出しとコピーを、メイン画像とは別に押せるようにする
          pointerEvents: pickMode ? 'auto' : 'none',
        }}
      >
        {/* 日英どちらも 1 行に収める: 長いときは、文字を縮める(下限は 0.4 倍) */}
        <div data-part="headline">
        <FitLine
          baseSize={`calc(${compact ? '4.2cqw' : '5cqw'} * ${hf.scale})`}
          minScale={0.4}
          style={{
            fontFamily: hf.family,
            fontWeight: hf.weight,
            // 日本語を含むヘッドラインは、字間を狭める
            letterSpacing: /[\u3000-\u9fff\uff00-\uffef]/.test(headline) ? hf.trackingJa : hf.tracking,
            textTransform: hf.upper ? 'uppercase' : 'none',
            lineHeight: 1.2,
          }}
        >
          {headline || t('(ヘッドライン未入力)', '(No headline)')}
        </FitLine>
        </div>
        <div data-part="copy">
        <FitLine
          baseSize={compact ? '2.6cqw' : '2.9cqw'}
          style={{ marginTop: '0.8cqw', fontFamily: hf.family, fontWeight: 400, letterSpacing: '0.06em', lineHeight: 1.5, opacity: 0.95 }}
        >
          {copy || t('(コピー未入力)', '(No copy)')}
        </FitLine>
        </div>
      </div>
      )}
      {/* ヘッドライン(大きく重ねる): 写真の中央に、折り返して大きく載せる。コピーは写真の下 */}
      {heroText === 'overlay' && (
        <div
          style={{
            position: 'absolute',
            inset: '0 6cqw',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            textAlign: 'center',
            pointerEvents: 'none',
            fontFamily: hf.family,
            fontWeight: hf.weight,
            fontSize: `calc(${compact ? '6cqw' : '10cqw'} * ${hf.scale})`,
            lineHeight: 1.15,
            letterSpacing: jaHeadline ? hf.trackingJa : hf.tracking,
            textTransform: hf.upper ? 'uppercase' : 'none',
            textShadow: '0 2px 12px rgba(0,0,0,0.35)',
            overflowWrap: 'anywhere',
          }}
        >
          {/* 文字の所だけを押せるようにする(画像の全体を覆うと、メイン画像を選べなくなるため) */}
          <span data-part="headline" style={{ pointerEvents: pickMode ? 'auto' : 'none' }}>{headline || t('(ヘッドライン未入力)', '(No headline)')}</span>
        </div>
      )}
    </div>
  )

  // ---- ヒーローの下(写真の下に置くヘッドライン・コピーと、ボタン)
  // ボタンの部品。1 つの部品のボタンを横に並べる。文言が空のボタンは、既定の文言(並びの位置で決まる)
  const blocks = placedButtons(tpl)
  const buttonRow = (buttons: ButtonSpec[], key: number) => (
    <div key={key} style={{ display: 'grid', gridTemplateColumns: `repeat(${buttons.length}, 1fr)`, gap: 10, padding: buttons.length === 1 ? '4px 25%' : '4px 16px' }}>
      {buttons.map((b, i) => (
        <div
          key={b.id}
          data-link="button"
          data-link-id={b.id}
          data-anchor={`button:${b.id}`}
          data-part={`button:${b.id}`}
          className={classes.noWrap}
          style={{
            textAlign: 'center',
            padding: '8px 4px',
            borderRadius: 999,
            fontSize: '0.8rem',
            ...(b.style === 'outline' ? { border: `1px solid ${INK}`, color: INK } : { backgroundColor: offer ? '#d32f2f' : '#222', color: '#fff' }),
          }}
        >
          {b.label || defaultButtonLabel(i)}
        </div>
      ))}
    </div>
  )
  const buttonsAfter = (at: number, paddingTop: number) => {
    const rows = buttonsAt(blocks, at, tpl.sections.length)
    return rows.length > 0 ? <div style={{ paddingTop, display: 'grid', rowGap: 8 }}>{rows.map(buttonRow)}</div> : null
  }

  const heroAfter = (
    <>
      {heroText === 'below' && (
        <div data-anchor="herotext" style={{ textAlign: 'center', padding: '16px 16px 0', color: INK }}>
          <div data-part="headline" style={{ fontFamily: hf.family, fontWeight: hf.weight, fontSize: `calc(1.5rem * ${hf.scale})`, lineHeight: 1.25, letterSpacing: jaHeadline ? hf.trackingJa : hf.tracking, textTransform: hf.upper ? 'uppercase' : 'none' }}>
            {headline || t('(ヘッドライン未入力)', '(No headline)')}
          </div>
        </div>
      )}
      {heroText !== 'band' && (
        <div data-anchor="herotext" data-part="copy" style={{ textAlign: 'center', padding: '8px 24px 0', fontSize: '0.85rem', color: SUB, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{copy || t('(コピー未入力)', '(No copy)')}</div>
      )}
      {buttonsAfter(0, 12)}
      <div style={{ height: 8 }} />
    </>
  )

  // ---- セクションの商品の並び(種類ごと)。start は、並び全体の中での先頭の位置
  const sectionBody = (sec: Section, start: number, list: Item[]) => {
    const slot = (j: number, tile: (it: Item, idx: number) => React.ReactNode, shape?: React.CSSProperties, feature = false) =>
      list[j] ? tile(list[j], start + j) : emptySlot(`e${start + j}`, feature, shape, start + j)
    const slots = Array.from({ length: sec.slots }, (_, j) => j)
    const cols = gridColumns(sec)
    switch (sec.kind) {
      case 'photos':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 4, alignItems: 'start' }}>{slots.map((j) => slot(j, photoTile, { aspectRatio: '4 / 5', padding: 4 }))}</div>
        )
      case 'wide':
        return <div style={{ display: 'grid', gap: 12 }}>{slots.map((j) => slot(j, (it, idx) => overlayTile(it, idx, false), { aspectRatio: '1 / 1' }))}</div>
      case 'mosaic': {
        // 3 点で 1 組。各組の先頭が大きいマス(縦 2 行分)
        const groups = Array.from({ length: Math.ceil(sec.slots / 3) }, (_, g) => g * 3)
        const cell = (j: number, big: boolean) => slot(j, (it, idx) => overlayTile(it, idx, true, !big), { aspectRatio: 'auto', height: '100%' })
        return (
          <div style={{ display: 'grid', gap: 8 }}>
            {groups.map((g) => (
              <div key={g} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 8, aspectRatio: '1 / 1' }}>
                <div style={{ gridRow: '1 / 3', gridColumn: sec.flip ? 2 : 1, minHeight: 0 }}>{cell(g, true)}</div>
                <div style={{ gridRow: 1, gridColumn: sec.flip ? 1 : 2, minHeight: 0 }}>{cell(g + 1, false)}</div>
                <div style={{ gridRow: 2, gridColumn: sec.flip ? 1 : 2, minHeight: 0 }}>{cell(g + 2, false)}</div>
              </div>
            ))}
          </div>
        )
      }
      case 'cells': {
        // 箱: 商品は、枠の並び(番号の順)に載る。写真の見せ方は 1 マスを正方形にし、説明を並べる見せ方は、文の高さに合わせる
        const cols = sec.cols ?? 2
        const rows = Math.max(1, cellRows(sec.cells ?? []))
        const text = isTextView(sec.view)
        const tile = (x: { w: number; h: number }, j: number) => (it: Item, idx: number) =>
          sec.view === 'detail'
            ? featureTile(it, idx)
            : sec.view === 'story'
              ? storyRow(it, idx, j % 2 === 1)
              : sec.view === 'photo'
                ? overlayPhoto(it, idx)
                : overlayTile(it, idx, true, x.w * x.h === 1 && cols > 2)
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8, ...(text ? {} : { gridTemplateRows: `repeat(${rows}, 1fr)`, aspectRatio: `${cols} / ${rows}` }) }}>
            {(sec.cells ?? []).map((x, j) => (
              <div key={j} style={{ gridColumn: `${x.c + 1} / span ${x.w}`, gridRow: `${x.r + 1} / span ${x.h}`, minHeight: 0, minWidth: 0 }}>
                {slot(j, tile(x, j), text ? undefined : { aspectRatio: 'auto', height: '100%' }, sec.view === 'detail')}
              </div>
            ))}
          </div>
        )
      }
      case 'table': {
        // 表: 部品を、表のマスの位置に置く。商品は、箱の順(上の行から、同じ行は左から)に載る。
        // 写真の箱は、マスの形(横 w・縦 h)の縦横比で、ほかの部品の高さに合わせて伸びる。文を並べる見せ方は、文の高さに合わせる
        const cols = sec.cols ?? 1
        const boxNo = new Map(boxesOf(sec).map((p, j) => [p.id, j]))
        const body = (p: TablePart) => {
          if (p.type === 'box') {
            const j = boxNo.get(p.id) ?? 0
            const text = isTextView(p.view)
            const big = p.w * p.h > 1
            const tile = (it: Item, idx: number) => boxTile(it, idx, p, j)
            const fill = !text && (big || p.view === 'photo')
            return (
              <div style={fill ? { aspectRatio: p.ratio ? String(ratioValue(p.ratio)) : `${p.w} / ${p.h}`, height: '100%', minHeight: 0 } : undefined}>
                {slot(j, tile, fill ? { aspectRatio: 'auto', height: '100%' } : undefined, p.view === 'detail')}
              </div>
            )
          }
          if (p.type === 'button') {
            const color = buttonColor(p, offer)
            const align = p.align ?? 'center'
            const text = p.style === 'text'
            return (
              <div style={{ display: 'grid', alignItems: 'center', height: '100%', padding: p.w === cols && cols > 1 && !text && align === 'center' ? '0 20%' : 0, justifyItems: text ? (align === 'left' ? 'start' : align === 'right' ? 'end' : 'center') : 'stretch' }}>
                <div
                  data-link="button"
                  data-link-id={p.id}
                  data-anchor={`button:${p.id}`}
                  data-part={`button:${p.id}`}
                  className={classes.noWrap}
                  style={{
                    textAlign: align,
                    padding: text ? '8px 2px' : '8px 12px',
                    borderRadius: 999,
                    fontSize: '0.8rem',
                    ...(p.style === 'outline' ? { border: `1px solid ${color}`, color } : text ? { color, fontWeight: 600, letterSpacing: 1 } : { backgroundColor: color, color: '#fff' }),
                  }}
                >
                  {p.label || defaultButtonLabel(0)}
                </div>
              </div>
            )
          }
          if (p.type === 'text') return <div style={{ fontSize: '0.85rem', color: SUB, lineHeight: 1.6, whiteSpace: 'pre-wrap', alignSelf: 'center', textAlign: p.align ?? 'left' }}>{p.text ?? ''}</div>
          if (p.type === 'media') {
            // 画像・動画: 押すとリンク先へ(URL は配信ごと。ボタンと同じ目印で、リンクの設定と計測に乗る)。
            // 動画は、メールでは再生できないので、画像をサムネイルにして ▶ を重ねる
            return (
              <div
                data-link="button"
                data-link-id={p.id}
                data-anchor={`button:${p.id}`}
                data-part={`button:${p.id}`}
                style={{ position: 'relative', aspectRatio: String(ratioValue(p.ratio ?? 'wide')), borderRadius: 8, overflow: 'hidden', backgroundColor: '#eef0f3', display: 'grid', placeItems: 'center', alignSelf: 'center' }}
              >
                {p.src ? (
                  <img src={p.src} alt={p.alt ?? ''} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <span style={{ fontSize: '0.75rem', color: SUB }}>{p.video ? t('動画(サムネイル未設定)', 'Video (no thumbnail)') : t('画像(未設定)', 'Image (not set)')}</span>
                )}
                {p.video && (
                  <span style={{ position: 'absolute', width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 18 }}>▶</span>
                )}
              </div>
            )
          }
          return null
        }
        // 均等に並べる行は、列に合わせず、行いっぱいの帯の中で、中身のある部品(空きは除く)を同じ幅で並べる
        const even = sec.evenRows ?? []
        const cell = (p: TablePart, area?: React.CSSProperties) => (
          <div key={p.id} data-part-id={p.id} style={{ ...area, minWidth: 0, minHeight: 0, display: 'grid' }}>
            {body(p)}
          </div>
        )
        // スマホで「縦に積む」セクションは、スマホの見え方のとき、中身のある部品を上の行から・左から 1 列に並べる
        if (device === 'mobile' && sec.mobile === 'stack') {
          return <div style={{ display: 'grid', gap: 8 }}>{[...(sec.parts ?? [])].filter((p) => p.type !== 'empty').sort((a, b) => a.r - b.r || a.c - b.c).map((p) => cell(p))}</div>
        }
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }}>
            {(sec.parts ?? []).filter((p) => !even.includes(p.r)).map((p) => cell(p, { gridColumn: `${p.c + 1} / span ${p.w}`, gridRow: `${p.r + 1} / span ${p.h}` }))}
            {even.map((r) => {
              const row = (sec.parts ?? []).filter((p) => p.r === r && p.type !== 'empty').sort((a, b) => a.c - b.c)
              return (
                <div key={`even${r}`} style={{ gridColumn: '1 / -1', gridRow: r + 1, display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, row.length)}, minmax(0, 1fr))`, gap: 8 }}>
                  {row.map((p) => cell(p))}
                </div>
              )
            })}
          </div>
        )
      }
      case 'story':
        return <div style={{ display: 'grid', gap: 8 }}>{slots.map((j) => slot(j, (it, idx) => storyRow(it, idx, j % 2 === 1), { aspectRatio: '2 / 1.3' }))}</div>
      case 'feature':
        return <div style={{ display: 'grid', gap: 12 }}>{slots.map((j) => slot(j, featureTile, undefined, true))}</div>
      default:
        // 3 列は 1 枠が狭いので、名前が枠を押し広げないよう minmax(0, 1fr) にし、間隔も詰める
        return (
          // alignItems: start: 空き枠を、隣の商品(名前・価格の分だけ高い)の高さに引き伸ばすと、縦横比のせいで横にはみ出すため
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: cols === 3 ? 8 : 12, alignItems: 'start' }}>{slots.map((j) => slot(j, gridTile))}</div>
        )
    }
  }

  // セクションの外枠。表のセクションは、背景の色・上下の余白・区切り線を持てる(以前の種類は、いままでどおり)
  const sectionStyle = (sec: Section): React.CSSProperties => {
    if (sec.kind !== 'table' || (!sec.bg && !sec.space && !sec.divider)) return { padding: '0 16px 16px' }
    const sp = sectionSpace(sec.space)
    return { padding: `${sec.bg || sec.divider ? sp : 0}px 16px ${sp}px`, ...(sec.bg ? { backgroundColor: SECTION_BG[sec.bg] } : {}), ...(sec.divider ? { borderTop: '1px solid #e2e2e2' } : {}) }
  }

  // ---- 本文(商品)。free は連続する同カテゴリごとに見出しを付け、それ以外はテンプレートの枠に流し込む
  let body: React.ReactNode
  if (template === 'free') {
    const runs: { category?: string; start: number; items: Item[] }[] = []
    items.forEach((it, idx) => {
      const category = byId.get(it.productId)?.category_name
      const last = runs[runs.length - 1]
      if (last && last.category === category) last.items.push(it)
      else runs.push({ category, start: idx, items: [it] })
    })
    body = (
      <>
        {runs.map((run, ri) => (
          <div key={run.start} data-anchor={`section:${ri}`} style={{ padding: '0 16px 16px' }}>
            {showHeadings && run.category && headingEl(optionLabel(run.category))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{run.items.map((it, j) => gridTile(it, run.start + j))}</div>
          </div>
        ))}
        <div style={{ padding: '0 16px 24px' }}>
          <div
            {...handlers(items.length)}
            data-part={`slot:${items.length}`}
            className={classes.slot}
            style={{
              minHeight: items.length === 0 ? 96 : 44,
              borderColor: over === items.length ? ACCENT : '#bbb',
              backgroundColor: over === items.length ? ACCENT_BG : 'transparent',
              fontSize: '0.85rem',
            }}
          >
            {items.length === 0 ? t('ここに商品をドロップ', 'Drop a product here') : t('＋ ここにドロップで末尾に追加', '+ Drop here to add to the end')}
          </div>
        </div>
      </>
    )
  } else {
    // 各セクションの先頭位置(それまでの枠数の合計)
    const sections = tpl.sections.map((sec, i) => {
      const start = tpl.sections.slice(0, i).reduce((n, s) => n + s.slots, 0)
      return { sec, start, list: items.slice(start, start + sec.slots) }
    })
    const offset = tpl.sections.reduce((n, s) => n + s.slots, 0)
    const overflow = items.slice(offset)
    body = (
      <>
        {sections.map(({ sec, start, list }, si) => {
          const category = sec.categoryHeading ? byId.get(list[0]?.productId ?? '')?.category_name : undefined
          return (
            <div key={start} data-anchor={`section:${si}`} style={sectionStyle(sec)}>
              {sec.categoryHeading && editableHeading(si, category ? optionLabel(category) : `CATEGORY ${si + 1}`)}
              {sec.copy !== false && sectionCopyEl(si, !!sec.categoryHeading)}
              {sectionBody(sec, start, list)}
              {buttonsAfter(si + 1, 14)}
            </div>
          )
        })}
        {overflow.length > 0 && (
          <div style={{ padding: '0 16px 24px' }}>
            <div style={{ fontSize: '0.75rem', color: '#b26a00', backgroundColor: '#fff4e0', borderRadius: 8, padding: '4px 8px', marginBottom: 8 }}>
              {t(`枠外(${overflow.length}件): このテンプレートの枠を超えているため、メールには載りません`, `Out of slots (${overflow.length}): these exceed the template's slots and won't appear in the email`)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, opacity: 0.55 }}>
              {overflow.map((it, j) => gridTile(it, offset + j))}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div data-anchor="preview" style={{ maxWidth: device === 'pc' ? 640 : device === 'mobile' ? 375 : 440, margin: '0 auto' }}>
      {/* 受信一覧での見え方: 件名(空は配信名)と、プリヘッダー(X2) */}
      {!compact && !pickMode && (
        <div data-anchor="subject" style={{ fontSize: 12, color: tokens.colorNeutralForeground2, display: 'grid', rowGap: 2 }}>
          <span>
            {t('件名', 'Subject')}: <span style={{ color: tokens.colorNeutralForeground1, fontWeight: 600 }}>{subjectLine || subject || t('(配信名未入力)', '(No name)')}</span>
          </span>
          {preheader ? <span>{t('プリヘッダー', 'Preheader')}: {preheader}</span> : null}
        </div>
      )}
      <div style={{ backgroundColor: '#fff', color: INK, border: '1px solid #ddd', borderRadius: 16, overflow: 'hidden', marginTop: 4, ...scaled }}>
        {/* お知らせ帯: 配信名を、メールの最上部に細い帯で出す */}
        {tpl.topBar && (
          <div data-anchor="topbar" className={classes.noWrap} style={{ backgroundColor: '#555', color: '#fff', textAlign: 'center', padding: '6px 12px', fontSize: '0.75rem', letterSpacing: 2 }}>
            {subject || t('(配信名未入力)', '(No name)')} ›
          </div>
        )}
        <div data-anchor="header" style={{ backgroundColor: '#222', color: '#fff', textAlign: 'center', padding: '12px 0', letterSpacing: 4, fontWeight: 700 }}>SHOP</div>
        {heroBox}
        {heroAfter}
        {body}
        {!compact && <div data-anchor="footer" style={{ backgroundColor: '#f5f5f5', color: SUB, fontSize: '0.75rem', textAlign: 'center', padding: '12px 0' }}>{t('配信停止はこちら', 'Unsubscribe')}</div>}
      </div>
    </div>
  )
}

function PushPreview(props: Props) {
  const { subject, headline, copy, scheduledAt, items, products, selectedKey, hero: pickedHero, onSelect, onRemove, onMove, onDropAt, template, pushLinkKind, pushTitle, pushBody, pickMode = false } = props
  // アプリのテンプレートの中身(画像・商品・ボタン)。アプリのテンプレートでなければ、以前と同じ(画像つき)
  const spec = getTemplate(template).push ?? { image: true, buttons: [] }
  const t = useT()
  const classes = useStyles()
  const { over, handlers, clear } = useDropTarget(onDropAt)
  const [style, setStyle] = useState<'ios' | 'android'>('ios')
  const byId = new Map(products.map((p) => [p.id, p]))
  const firstProduct = items[0] && byId.get(items[0].productId)
  // 通知の画像: 「画像つき」は、メッセージのメイン画像(押して開いたメッセージの一番上と、同じ画像)。「テキストだけ」は画像なし
  const heroSrc = spec.image && pickedHero ? heroImage(pickedHero) : undefined
  const heroAlt = pickedHero?.name

  const when = scheduledAt ? new Date(scheduledAt) : null
  const clock = when ? `${when.getHours()}:${String(when.getMinutes()).padStart(2, '0')}` : '9:41'
  const dateText = when ? when.toLocaleDateString(locale(), { month: 'long', day: 'numeric', weekday: 'long' }) : ''
  const title = pushTitle || headline || subject || t('(通知のタイトル未入力)', '(No notification title)')
  const bodyText = pushBody || copy || t('(通知の本文未入力)', '(No notification body)')
  const hasJa = /[\u3000-\u9fff\uff00-\uffef]/.test(title)
  const titleFont = {
    fontFamily: HEADLINE_FONT.family,
    fontWeight: HEADLINE_FONT.weight,
    letterSpacing: hasJa ? '0.06em' : '0.14em',
    textTransform: HEADLINE_FONT.upper ? ('uppercase' as const) : ('none' as const),
  }
  const bodyFont = { fontFamily: HEADLINE_FONT.family, letterSpacing: '0.04em' }
  const more = ''
  // 通知のボタン(アクション)。テンプレートが決める
  const actions = spec.buttons.length > 0 && (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${spec.buttons.length}, 1fr)`, gap: 6, marginTop: 8 }}>
      {spec.buttons.map((b) => (
        <div key={b} style={{ textAlign: 'center', padding: '6px 0', borderRadius: style === 'ios' ? 10 : 18, backgroundColor: 'rgba(0,0,0,0.06)', fontSize: '0.8rem', fontWeight: 600 }}>
          {b}
        </div>
      ))}
    </div>
  )

  const appIcon = (size: number) => (
    <div style={{ width: size, height: size, borderRadius: style === 'ios' ? '22%' : '50%', backgroundColor: '#222', color: '#fff', display: 'grid', placeItems: 'center', fontSize: size * 0.5, fontWeight: 800, flexShrink: 0 }}>
      S
    </div>
  )

  const image = heroSrc && (
    <img
      draggable={false}
      src={heroSrc}
      alt={heroAlt}
      // 写真は、元の縦横の比率のまま、切らずに見せる(決まった枠に入れると、縦長の写真の左右に大きな余白ができるため)。
      // 縦長の写真が通知を押し広げすぎないよう、高さに上限を付け、その場合は中央に置く
      style={{ display: 'block', maxWidth: '100%', maxHeight: 300, width: 'auto', height: 'auto', margin: '8px auto 0', borderRadius: style === 'ios' ? 14 : 20 }}
    />
  )

  const notification =
    style === 'ios' ? (
      <div style={{ backgroundColor: 'rgba(250,250,252,0.86)', color: INK, borderRadius: 22, padding: 12, boxShadow: '0 4px 18px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {appIcon(20)}
          <div style={{ flexGrow: 1, fontSize: '0.7rem', letterSpacing: 1, color: SUB }}>SHOP</div>
          <div style={{ fontSize: '0.7rem', color: SUB }}>{t('たった今', 'now')}</div>
        </div>
        <div data-part="pushTitle" style={{ ...titleFont, fontSize: '0.9rem', color: INK }}>{title}</div>
        <div data-part="pushBody" style={{ ...bodyFont, fontSize: '0.85rem', color: INK, whiteSpace: 'pre-wrap' }}>{bodyText}</div>
        {image}
        {more && <div style={{ fontSize: '0.7rem', color: SUB, marginTop: 6 }}>{more}</div>}
        {actions}
      </div>
    ) : (
      <div style={{ backgroundColor: '#f3edf7', color: INK, borderRadius: 24, padding: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          {appIcon(18)}
          <div style={{ flexGrow: 1, fontSize: '0.7rem', color: SUB }}>SHOP ・ {t('たった今', 'now')}</div>
          <div style={{ fontSize: '0.8rem', color: SUB, lineHeight: 1 }}>⌃</div>
        </div>
        <div data-part="pushTitle" style={{ ...titleFont, fontSize: '0.9rem', color: INK }}>{title}</div>
        <div data-part="pushBody" style={{ ...bodyFont, fontSize: '0.85rem', color: '#444', whiteSpace: 'pre-wrap' }}>{bodyText}</div>
        {image}
        {more && <div style={{ fontSize: '0.7rem', color: SUB, marginTop: 6 }}>{more}</div>}
        {actions}
      </div>
    )

  return (
    <div data-anchor="preview" style={{ maxWidth: 380, margin: '0 auto', display: 'grid', gap: 16 }}>
      <div style={{ justifySelf: 'center', display: 'flex' }}>
        <ToggleButton size="small" checked={style === 'ios'} onClick={() => setStyle('ios')} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
          {t('iOS風', 'iOS style')}
        </ToggleButton>
        <ToggleButton size="small" checked={style === 'android'} onClick={() => setStyle('android')} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }}>
          {t('Android風', 'Android style')}
        </ToggleButton>
      </div>
      {/* スマホのロック画面 */}
      <div
        style={{
          background: style === 'ios' ? 'linear-gradient(165deg, #3b4a6b, #1d2438 70%, #2a2440)' : 'linear-gradient(165deg, #2b3a4a, #141c26)',
          border: '6px solid #101010',
          borderRadius: 36,
          padding: '24px 14px',
          color: '#fff',
          boxShadow: tokens.shadow16,
          ...scaled,
        }}
      >
        <div style={{ textAlign: style === 'ios' ? 'center' : 'left', marginBottom: 20, padding: style === 'ios' ? 0 : '0 8px' }}>
          {dateText && <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>{dateText}</div>}
          <div style={{ fontSize: style === 'ios' ? '3.6rem' : '3rem', fontWeight: style === 'ios' ? 300 : 400, lineHeight: 1.1 }}>{clock}</div>
        </div>
        <div data-link="push" data-anchor="push">{notification}</div>
        <div style={{ width: 96, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)', margin: '24px auto 0' }} />
      </div>
      {/* 通知を押したあとに開く画面(「⑤ リンク先」の「通知を押したときに開く画面」で決める) */}
      <div style={{ fontSize: 14, fontWeight: 700 }}>
        {!pushLinkKind || pushLinkKind === 'message' ? t('通知を押すと開く、アプリのメッセージ', 'In-app message opened by the notification') : t('通知を押したあとに開く画面', 'Screen opened by the notification')}
      </div>
      {pushLinkKind === 'product' && firstProduct ? (
        <div style={{ border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: 16, padding: 12, display: 'grid', gap: 8, ...scaled }}>
          <img draggable={false} src={productImage(firstProduct, items[0]?.imageUrl)} alt={firstProduct.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'contain', borderRadius: 12, backgroundColor: '#f1f1f4' }} />
          <div style={{ fontWeight: 700 }}>{firstProduct.name}</div>
          <div style={{ color: SUB }}>{t('商品のページ', 'Product page')}</div>
        </div>
      ) : !pushLinkKind || pushLinkKind === 'message' ? (
        // アプリの中のメッセージ: メールと同じ部品を、スマートフォンの幅で
        <div style={{ maxWidth: 360, margin: '0 auto', width: '100%' }}>
          <EmailPreview {...props} compact />
        </div>
      ) : pushLinkKind === 'campaign' ? (
        <EmailPreview {...props} compact />
      ) : (
        <div style={{ border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: 16, padding: 16, textAlign: 'center', color: tokens.colorNeutralForeground3, fontSize: 13 }}>
          {pushLinkKind === 'category'
            ? t('カテゴリのページが開きます', 'Opens the category page')
            : pushLinkKind === 'home'
              ? t('アプリのホームが開きます', 'Opens the app home')
              : pushLinkKind === 'custom'
                ? t('指定した名前の画面が開きます', 'Opens the named screen')
                : ''}
        </div>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((it, idx) => {
          const p = byId.get(it.productId)
          return (
            <div
              key={it.key}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_ITEM, it.key)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={clear}
              onClick={() => onSelect(it.key)}
              // 部品を選ぶ見せ方のときだけ(結果のヒートマップなどは、メッセージの中の商品の枠だけを数えるため)
              data-item-key={pickMode ? it.key : undefined}
              {...handlers(idx)}
              className={classes.pushRow}
              style={{ borderColor: over === idx || it.key === selectedKey ? tokens.colorBrandForeground1 : tokens.colorNeutralStroke2 }}
            >
              <span style={{ width: 16, fontSize: 12, color: tokens.colorNeutralForeground2 }}>{idx + 1}</span>
              <img draggable={false} src={productImage(p, it.imageUrl)} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
              <div className={classes.noWrap} style={{ flexGrow: 1, fontSize: '0.85rem' }}>{p?.name}</div>
              {!pickMode && <>
              <Button
                appearance="subtle"
                size="small"
                icon={<ArrowUpRegular />}
                disabled={idx === 0}
                onClick={(e) => {
                  e.stopPropagation()
                  onMove(it.key, -1)
                }}
                aria-label={t('上へ', 'Move up')}
              />
              <Button
                appearance="subtle"
                size="small"
                icon={<ArrowDownRegular />}
                disabled={idx === items.length - 1}
                onClick={(e) => {
                  e.stopPropagation()
                  onMove(it.key, 1)
                }}
                aria-label={t('下へ', 'Move down')}
              />
              <Button
                appearance="subtle"
                size="small"
                icon={<DismissRegular />}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(it.key)
                }}
                aria-label={t('外す', 'Remove')}
              />
              </>}
            </div>
          )
        })}
        <div
          {...handlers(items.length)}
          data-part={`slot:${items.length}`}
          className={classes.pushDrop}
          style={{ borderColor: over === items.length ? tokens.colorBrandForeground1 : tokens.colorNeutralStroke2 }}
        >
          {items.length === 0 ? t('ここに商品をドロップ', 'Drop a product here') : t('＋ ここにドロップで末尾に追加', '+ Drop here to add to the end')}
        </div>
      </div>
    </div>
  )
}
