import { useState } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkCircleFilled, ChevronDownRegular, ChevronUpRegular, WarningFilled } from '@fluentui/react-icons'
import { useT } from './i18n'
import type { CheckItem, CheckKey } from './reviewChecks'
import { checkAction, checkHint, checkTitle } from './weekLabels'

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
  // 問題があるときに、何をするか
  action: { color: tokens.colorNeutralForeground2 },
  // 「ほか n 項目は OK」(問題のない項目を出す・隠す)
  more: {
    padding: '3px 8px',
    border: 'none',
    background: 'none',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForegroundLink,
    cursor: 'pointer',
    ':hover': { textDecoration: 'underline' },
  },
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
 * 週を確定する前に直すことの一覧(確認の一覧。W4)。
 * 問題のある項目だけを、何をするかと一緒に出す。問題のない項目は「ほか n 項目は OK」にまとめ、押すと出す(消さない。PRINCIPLES 2-2)。
 * 項目を選ぶと、中身を下に出して、週の表示で該当する配信・商品を目立たせる。配信カードの「保存して次へ」は、その項目の中で次の配信を開く(X9)
 */
export function WeekChecklist({ items, selected, onSelect }: Props) {
  const styles = useStyles()
  const t = useT()
  const [showOk, setShowOk] = useState(false)
  const current = items.find((i) => i.key === selected)
  const todo = items.filter((i) => !i.ok)
  // 問題のない項目でも、選んでいるものは出したままにする(選んだ項目が消えないように)
  const okItems = items.filter((i) => i.ok)
  const shownOk = showOk ? okItems : okItems.filter((i) => i.key === selected)

  const chip = (i: CheckItem) => {
    const on = i.key === selected
    return (
      <button key={i.key} type="button" className={mergeClasses(styles.item, on && styles.itemOn)} aria-pressed={on} onClick={() => onSelect(on ? null : i.key)}>
        {i.ok ? <CheckmarkCircleFilled className={styles.ok} /> : <WarningFilled className={styles.warn} />}
        {checkTitle(t, i.key)}
        <span className={styles.count}>{i.total !== undefined ? `${i.count} / ${i.total}` : i.count}</span>
        {!i.ok && <span className={styles.action}>{`→ ${checkAction(t, i.key)}`}</span>}
        {on ? <ChevronUpRegular className={styles.chevron} /> : <ChevronDownRegular className={styles.chevron} />}
      </button>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <span className={styles.label}>
          {todo.length > 0
            ? t(`確定の前に直すこと(${todo.length})`, `Fix before confirming (${todo.length})`)
            : t('確定の前に直すことはありません', 'Nothing to fix before confirming')}
        </span>
        {todo.map(chip)}
        {shownOk.map(chip)}
        {okItems.length > 0 && (
          <button type="button" className={styles.more} aria-expanded={showOk} onClick={() => setShowOk(!showOk)}>
            {showOk ? t('OK の項目を隠す', 'Hide OK items') : t(`ほか ${okItems.length} 項目は OK`, `${okItems.length} more OK`)}
          </button>
        )}
      </div>
      {current && (
        <div className={styles.details}>
          <span className={styles.hint}>{checkHint(t, current.key)}</span>
          {current.details.length > 0 ? current.details.map((d, i) => <span key={i}>{d}</span>) : <span className={styles.hint}>{t('ありません', 'None')}</span>}
          {!current.ok && current.cardIds.length > 0 && (
            <span className={styles.hint}>
              {t(
                '該当する配信が、週の表示で目立ちます。配信カードの「保存して次へ」で、この項目の配信を順に開けます。',
                'Matching deliveries are highlighted below. Use “Save and next” on the delivery card to go through them in order.',
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
