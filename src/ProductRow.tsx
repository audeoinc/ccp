import { useState, type ReactNode } from 'react'
import { Badge, Field, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ReOrderDotsVerticalRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { ImageThumb } from './ImageThumb'
import type { Product } from './models/products'
import { productMarket } from './market'
import { SOURCE_AI, yen } from './items'
import { optionLabel, tr, useT } from './i18n'

const useStyles = makeStyles({
  flexRowTight: { display: 'flex', alignItems: 'center', columnGap: '6px', rowGap: '4px', flexWrap: 'wrap', minWidth: 0 },
  reason: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
  },
  reasonEditable: {
    cursor: 'text',
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover },
  },
  reasonPlain: { cursor: 'default' },
  row: {
    display: 'flex',
    columnGap: '8px',
    padding: '8px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: 0,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  // 詰めた形(フロート・シンプルの一覧・右の商品情報。並べて見比べる所)。形は同じで、余白と写真を小さくする
  rowDense: { columnGap: '8px', padding: '6px 8px', alignItems: 'center' },
  rowSelected: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  rowClickable: { cursor: 'pointer' },
  rowHighlight: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  rowDim: { opacity: 0.8 },
  rowDraggable: { cursor: 'grab' },
  dragIcon: { alignSelf: 'center', marginLeft: '-4px', marginRight: '-4px', color: tokens.colorNeutralForegroundDisabled, flexShrink: 0 },
  rowBody: { flexGrow: 1, minWidth: 0, display: 'grid', rowGap: '2px' },
  noWrap: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  rowActions: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  rowActionsInline: { flexDirection: 'row', alignItems: 'center', columnGap: '2px' },
  lead: { alignSelf: 'center', flexShrink: 0 },
  nameDense: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
})

/** 理由の表示。2 行で省略し、クリックすると全文を編集できる(onChange なしなら読み取り専用) */
export function ReasonText({ value, onChange }: { value: string; onChange?: (v: string) => void }) {
  const s = useStyles()
  const t = useT()
  const [editing, setEditing] = useState(false)
  if (onChange && editing) {
    return (
      <Field label={t('選定理由', 'Selection reason')} size="small" data-no-float>
        <AutoTextarea heightKey="ProductRow.value"
          autoFocus
          size="small"
                    value={value}
          onChange={(_, d) => onChange(d.value)}
          onBlur={() => setEditing(false)}
        />
      </Field>
    )
  }
  return (
    <span
      className={mergeClasses(s.reason, onChange ? s.reasonEditable : s.reasonPlain)}
      style={{ color: value ? tokens.colorNeutralForeground3 : tokens.colorNeutralForegroundDisabled }}
      onClick={onChange ? () => setEditing(true) : undefined}
      // 押すと編集になる理由の文は、商品のフロートを開かない(ProductFloat)
      data-no-float={onChange ? '' : undefined}
      title={onChange ? t('クリックして編集', 'Click to edit') : undefined}
    >
      {value || (onChange ? t('(理由を入力)', '(Enter a reason)') : t('(理由なし)', '(No reason)'))}
    </span>
  )
}

export interface RowProps {
  image?: string
  wide?: boolean
  title: string
  meta: string
  /** 理由(なければ出さない) */
  reason?: string
  onReason?: (v: string) => void
  source?: string
  badge?: string
  /** 名前の横に足す印(残少・アラートの札) */
  marks?: ReactNode
  actions?: ReactNode
  dim?: boolean
  /** 詰めた形(写真を小さく、名前は 1 行で省略、操作は横に並べる) */
  dense?: boolean
  /** 写真の前に置くもの(並びの番号) */
  lead?: ReactNode
  /** 名前の行の下に足すもの(アラートの札など) */
  below?: ReactNode
  /** 行の上に重ねる見た目(操作をマウスを乗せたときだけ出す、など) */
  className?: string
  /** 名前に添える説明(マウスを乗せたとき) */
  tip?: string
  /** ドラッグ&ドロップ(ドラッグ元・ドロップ先) */
  drag?: {
    draggable?: boolean
    onDragStart?: (e: React.DragEvent) => void
    onDragOver?: (e: React.DragEvent) => void
    onDragLeave?: (e: React.DragEvent) => void
    onDrop?: (e: React.DragEvent) => void
  }
  /** ドロップ先として強調する */
  highlight?: boolean
  /** 選択中(プレビューと連動)として強調する */
  selected?: boolean
  onClick?: () => void
  /** マウスが乗った / 外れた */
  onHover?: (on: boolean) => void
}

export function Row({ image, wide, title, meta, reason, onReason, source, badge, marks, actions, dim, dense, lead, below, className, tip, drag, highlight, selected, onClick, onHover }: RowProps) {
  const s = useStyles()
  const t = useT()
  // 行の中のボタン・入力欄・理由の文を押したときは、行の動き(onClick)にしない(ProductFloat と同じ決まり)。
  // 行の中のメニュー(Portal で外に出る)から上がってきた押下も、行の動きにしない
  const own = (e: React.SyntheticEvent) => {
    const el = e.target as HTMLElement
    if (el === e.currentTarget) return true
    return e.currentTarget.contains(el) && !el.closest?.('button, a, input, textarea, select, [data-no-float]')
  }
  return (
    <div
      {...drag}
      onClick={onClick && ((e) => own(e) && onClick())}
      onKeyDown={onClick && ((e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onClick()
      })}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick && selected !== undefined ? selected : undefined}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
      className={mergeClasses(s.row, dense && s.rowDense, selected && s.rowSelected, highlight && s.rowHighlight, dim && s.rowDim, drag?.draggable && s.rowDraggable, onClick && !drag?.draggable && s.rowClickable, className)}
    >
      {drag?.draggable && <ReOrderDotsVerticalRegular className={s.dragIcon} />}
      {lead !== undefined && <span className={s.lead}>{lead}</span>}
      <ImageThumb src={image} alt={title} width={dense ? (wide ? 56 : 40) : wide ? 80 : 56} height={dense ? 52 : 72} />
      <div className={s.rowBody}>
        <div className={s.flexRowTight} style={dense ? { flexWrap: 'nowrap' } : undefined}>
          <Text weight="semibold" size={dense ? 200 : 300} className={dense ? s.nameDense : undefined} title={tip}>{title}</Text>
          {source !== undefined && (
            <Badge size="small" appearance="tint" color={source === SOURCE_AI ? 'brand' : 'informative'}>{source === SOURCE_AI ? 'AI' : t('手動', 'Manual')}</Badge>
          )}
          {badge && <Badge size="small" appearance="tint" color="warning">{badge}</Badge>}
          {marks}
        </div>
        <span className={s.noWrap}>{meta}</span>
        {below}
        {reason !== undefined && <ReasonText value={reason} onChange={onReason} />}
      </div>
      {actions && <div className={mergeClasses(s.rowActions, dense && s.rowActionsInline)}>{actions}</div>}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const productMeta = (p?: Product) =>
  p ? `${p.product_code} ・ ${yen(p.price, productMarket(p))} ・ ${tr('在庫', 'Stock ')}${p.stock ?? '—'} ・ ${optionLabel(p.sales_trend_name)} ・ ★${p.rating ?? '—'}` : ''
