import { Badge, makeStyles, tokens } from '@fluentui/react-components'
import type { Product } from './models/products'
import { useT } from './i18n'
import type { CardAlertKind } from './cardAlerts'

/** 在庫が少ないとみなす数(AI の商品選定の基準と同じ) */
const LOW_STOCK = 50

// アラートのラベルの色(配信カードの上の帯の種類の札と同じ)
const ALERT_BG: Record<CardAlertKind, string> = {
  outOfStock: tokens.colorPaletteRedBackground3,
  lowStock: tokens.colorPaletteDarkOrangeBackground3,
  // 白い文字が読めるよう、濃い色にする(上の帯の種類の札と同じ)
  policyChanged: tokens.colorPalettePurpleBorderActive,
  dateChanged: tokens.colorPaletteBlueBorderActive,
  overLimit: tokens.colorPaletteBrownBorderActive,
}

const useStyles = makeStyles({
  alertChip: {
    justifySelf: 'start',
    width: 'fit-content',
    padding: '0 7px',
    height: '18px',
    border: 'none',
    borderRadius: tokens.borderRadiusCircular,
    color: '#ffffff',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
  },
})

/**
 * アラートの種類の札。押すと、そのアラートへの対応を開く。
 * 行のクリック(商品のフロート)とは分けるため、クリックを行へ伝えない
 */
export function AlertChip({ kind, onClick, className }: { kind: CardAlertKind; onClick: () => void; className?: string }) {
  const t = useT()
  const s = useStyles()
  return (
    <button
      type="button"
      className={className ? `${s.alertChip} ${className}` : s.alertChip}
      style={{ backgroundColor: ALERT_BG[kind] }}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={t('このアラートへの対応を開く', 'Handle this alert')}
    >
      {{ outOfStock: t('在庫切れ', 'Out of stock'), lowStock: t('在庫僅少', 'Low stock'), policyChanged: t('方針の変更', 'Policy'), dateChanged: t('日程', 'Date'), overLimit: t('週の上限', 'Weekly limit') }[kind]}
    </button>
  )
}

/** 在庫が少ない商品の「残少」(商品情報の一覧と、中ペインの選定済みの行で同じ) */
export function LowStockBadge({ product }: { product?: Product }) {
  const t = useT()
  if (product?.stock === undefined || product.stock >= LOW_STOCK) return null
  return <Badge size="small" appearance="tint" color="warning">{t('残少', 'Low')}</Badge>
}
