import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AlertRegular } from '@fluentui/react-icons'
import type { CardAlert, CardAlertKind } from './cardAlerts'
import { useT } from './i18n'

const useStyles = makeStyles({
  root: {
    display: 'grid',
    rowGap: '4px',
    padding: '6px 12px',
    marginBottom: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorPaletteDarkOrangeBorder1}`,
    backgroundColor: tokens.colorPaletteDarkOrangeBackground1,
  },
  head: { display: 'flex', alignItems: 'center', columnGap: '6px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  item: { display: 'flex', alignItems: 'baseline', columnGap: '8px', fontSize: tokens.fontSizeBase200, flexWrap: 'wrap' },
  kind: { flexShrink: 0, padding: '0 6px', borderRadius: '8px', color: '#fff', fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold },
  name: { fontWeight: tokens.fontWeightSemibold },
  link: { border: 'none', background: 'none', padding: 0, font: 'inherit', fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1, textDecoration: 'underline', cursor: 'pointer' },
  on: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px', borderRadius: '2px' },
  detail: { color: tokens.colorNeutralForeground2 },
})

const KIND_BG: Record<CardAlertKind, string> = {
  outOfStock: tokens.colorPaletteRedBackground3,
  lowStock: tokens.colorPaletteDarkOrangeBackground3,
  policyChanged: tokens.colorPalettePurpleBackground2,
  dateChanged: tokens.colorPaletteBlueBackground2,
}

interface Props {
  alerts: CardAlert[]
  /** いま選んでいる商品(強調する) */
  selectedProductId?: string
  /** 商品名を押したとき: 配信カードで、その商品を選ぶ */
  onSelectProduct: (productId: string) => void
}

/**
 * 配信カードの「この配信のアラート」。どこに問題があるか(どの商品か)を、開いた瞬間にわかるようにする。
 * 商品名を押すと、その商品を選び、プレビューのその枠に移る
 */
export function CardAlertsBar({ alerts, selectedProductId, onSelectProduct }: Props) {
  const styles = useStyles()
  const t = useT()
  const kindLabel = (k: CardAlertKind) =>
    ({ outOfStock: t('在庫切れの見込み', 'Out of stock'), lowStock: t('在庫僅少', 'Low stock'), policyChanged: t('MD 方針の変更', 'MD policy'), dateChanged: t('日程の変更', 'Date change') })[k]
  return (
    <div className={styles.root} role="status">
      <span className={styles.head}>
        <AlertRegular />
        {t(`この配信のアラート(${alerts.length})`, `Alerts for this delivery (${alerts.length})`)}
      </span>
      {alerts.map((a, i) => (
        <span key={`${a.kind}:${a.productId ?? ''}:${i}`} className={styles.item}>
          <span className={styles.kind} style={{ backgroundColor: KIND_BG[a.kind] }}>{kindLabel(a.kind)}</span>
          {a.productId ? (
            <button type="button" className={mergeClasses(styles.link, a.productId === selectedProductId && styles.on)} onClick={() => onSelectProduct(a.productId!)} title={t('この商品を選んで、プレビューで見る', 'Select this product and show it in the preview')}>
              {a.label}
            </button>
          ) : (
            <span className={styles.name}>{a.label}</span>
          )}
          <span className={styles.detail}>{a.detail}</span>
        </span>
      ))}
    </div>
  )
}
