import type { ReactNode } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { useT } from './i18n'

const useStyles = makeStyles({
  // 計画の面の「月の要約の帯」(MonthSummaryBar)と同じ形・同じ位置
  root: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: '12px',
    rowGap: '6px',
    padding: '8px 12px',
    marginBottom: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, whiteSpace: 'nowrap' },
  divider: { alignSelf: 'stretch', width: '1px', backgroundColor: tokens.colorNeutralStroke2 },
  item: { display: 'inline-flex', alignItems: 'baseline', columnGap: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  value: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
})

interface Props {
  /** この月の配信の数(結果がまだのものも含む)と、そのうち結果のある数 */
  deliveries: number
  withResults: number
  /** 売上の合計(表記済み。国が混ざるときは、通貨ごとに並べたもの) */
  revenue: ReactNode
  /** 前月比・前年比(▲▼ の付いた表記。比べられなければ —) */
  vsPrevMonth: ReactNode
  vsLastYear: ReactNode
  /** 開封率(メールだけ)・クリック率(アプリは通知のタップ)。表記済み */
  openRate: string
  clickRate: string
}

/**
 * 結果の面の「月の要約の帯」。月の表示・一覧の上に、計画の面の月の要約の帯と同じ位置で、この月の結果の合計を出す(見るだけ)。
 * 計画の面は件数の流れ(未起案 › 承認待ち › 承認済み)、結果の面は数字(売上・前月比・前年比・開封率・クリック率)
 */
export function ResultsSummaryBar({ deliveries, withResults, revenue, vsPrevMonth, vsLastYear, openRate, clickRate }: Props) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.root}>
      <span className={s.label}>{t('この月', 'This month')}</span>
      <span className={s.divider} aria-hidden />
      <span className={s.item}>
        {t('配信', 'Deliveries')}
        <span className={s.value}>{deliveries}</span>
        {t(`(結果あり ${withResults})`, `(${withResults} with results)`)}
      </span>
      <span className={s.divider} aria-hidden />
      <span className={s.item}>
        {t('売上', 'Revenue')}
        <span className={s.value}>{revenue}</span>
      </span>
      <span className={s.item}>
        {t('前月比', 'vs prev month')}
        {vsPrevMonth}
      </span>
      <span className={s.item}>
        {t('前年比', 'vs last year')}
        {vsLastYear}
      </span>
      <span className={s.divider} aria-hidden />
      <span className={s.item}>
        {t('開封率', 'Open rate')}
        <span className={s.value}>{openRate}</span>
      </span>
      <span className={s.item}>
        {t('クリック率', 'Click rate')}
        <span className={s.value}>{clickRate}</span>
      </span>
    </div>
  )
}
