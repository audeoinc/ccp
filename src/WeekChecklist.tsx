import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkCircleFilled, ChevronDownRegular, ChevronUpRegular, WarningFilled } from '@fluentui/react-icons'
import { useT } from './i18n'
import { WEEKLY_PRODUCT_LIMIT, type CheckItem, type CheckKey } from './reviewChecks'

const useStyles = makeStyles({
  root: {
    display: 'grid',
    rowGap: '6px',
    padding: '8px 12px',
    marginBottom: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  row: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginRight: '6px' },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '5px',
    padding: '3px 10px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground1,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemOn: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  count: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  warn: { color: tokens.colorPaletteDarkOrangeForeground1 },
  chevron: { color: tokens.colorNeutralForeground3 },
  // 選んだ項目の中身(商品名と回数・配信名)。週の表示でも、該当する配信・商品を目立たせる
  details: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 12px',
    paddingTop: '6px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  hint: { color: tokens.colorNeutralForeground3 },
})

interface Props {
  items: CheckItem[]
  /** 選んでいる項目(null は選んでいない) */
  selected: CheckKey | null
  onSelect: (key: CheckKey | null) => void
}

/**
 * 週のレビューの確認の一覧。項目ごとに件数を出し、選ぶと、中身を下に出して、週の表示で該当する配信・商品を目立たせる。
 * 確定の前に、週全体を見て気づきにくい点(偏り・そろい・漏れ・連続・未解決・承認)を、数で見落とさないようにする
 */
export function WeekChecklist({ items, selected, onSelect }: Props) {
  const styles = useStyles()
  const t = useT()
  const title = (k: CheckKey) =>
    ({
      overLimit: t(`週の上限(${WEEKLY_PRODUCT_LIMIT} 本)を超えた商品`, `Products over the weekly limit (${WEEKLY_PRODUCT_LIMIT})`),
      pushAlign: t('メールとプッシュのテーマ違い', 'Email / push to align'),
      leadMissing: t('載っていない主力の商品', 'Lead items not featured'),
      repeat: t('テーマ・メイン画像の連続', 'Same main image or theme in a row'),
      openComments: t('未対応のコメント', 'Open comments'),
      openQuestions: t('未解決の質問', 'Open questions'),
      approved: t('承認済みの配信', 'Approved deliveries'),
    })[k]
  const hint = (k: CheckKey) =>
    ({
      overLimit: t('同じ商品を載せた配信の数', 'Number of deliveries featuring the product'),
      pushAlign: t('同じ日のメールと、テーマがそろっていないプッシュ', 'Pushes whose theme differs from the same-day email'),
      leadMissing: t('販促の期間が、この週にかかる主力の商品', 'Lead items whose promotion period covers this week'),
      repeat: t('同じチャネルで、すぐ前の配信と同じ(前の週の最後の配信を含む)', 'Same as the previous delivery on the same channel (including the last one of the previous week)'),
      openComments: t('レビューのコメントで、まだ対応済みにしていないもの', 'Review comments not marked resolved yet'),
      openQuestions: t('制作からの質問で、まだ解決していないもの', 'Questions from production that are not resolved yet'),
      approved: t('まだ承認されていない配信', 'Deliveries not approved yet'),
    })[k]
  const current = items.find((i) => i.key === selected)

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <span className={styles.label}>{t('確認の一覧', 'Review checklist')}</span>
        {items.map((i) => {
          const on = i.key === selected
          return (
            <button key={i.key} type="button" className={mergeClasses(styles.item, on && styles.itemOn)} aria-pressed={on} onClick={() => onSelect(on ? null : i.key)}>
              {i.ok ? <CheckmarkCircleFilled className={styles.ok} /> : <WarningFilled className={styles.warn} />}
              {title(i.key)}
              <span className={styles.count}>{i.total !== undefined ? `${i.count} / ${i.total}` : i.count}</span>
              {on ? <ChevronUpRegular className={styles.chevron} /> : <ChevronDownRegular className={styles.chevron} />}
            </button>
          )
        })}
      </div>
      {current && (
        <div className={styles.details}>
          <span className={styles.hint}>{hint(current.key)}</span>
          {current.details.length > 0 ? current.details.map((d, i) => <span key={i}>{d}</span>) : <span className={styles.hint}>{t('ありません', 'None')}</span>}
        </div>
      )}
    </div>
  )
}
