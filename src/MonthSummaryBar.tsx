import { Button, makeStyles, tokens } from '@fluentui/react-components'
import { LockClosedRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { StatusFlow } from './StatusFlow'

const useStyles = makeStyles({
  // 週の帯(承認のバー)と同じ形・同じ位置
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
  weeks: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap' },
})

interface Props {
  /** この月の配信の、状態ごとの件数(未起案 / 承認待ち / 承認済み) */
  counts: { label: string; color: string; n: number }[]
  /** この月の配信の数 */
  total: number
  /** この月にかかる週の数と、そのうち確定した週の数 */
  weeks: number
  confirmedWeeks: number
  /** 確定していない最初の週の週表示へ(なければ undefined = すべて確定) */
  onOpenUnconfirmed?: () => void
}

/**
 * 月の要約の帯(X25)。月の表示・一覧の上に、週の帯と同じ位置で、この月の配信の状態ごとの件数と、確定した週の数を出す。
 * 見るだけ(依頼・承認・確定は週の単位なので、週の表示で行う)。「確定した週」を押すと、確定していない最初の週の週表示へ移る
 */
export function MonthSummaryBar({ counts, total, weeks, confirmedWeeks, onOpenUnconfirmed }: Props) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.root}>
      <span className={s.label}>{t('この月', 'This month')}</span>
      <span className={s.divider} aria-hidden />
      <StatusFlow counts={counts} total={total} />
      <span className={s.divider} aria-hidden />
      {onOpenUnconfirmed ? (
        <Button
          size="small"
          appearance="subtle"
          icon={<LockClosedRegular />}
          onClick={onOpenUnconfirmed}
          title={t('確定していない最初の週を、週の表示で開く', 'Open the first unconfirmed week in the week view')}
        >
          {t(`確定した週 ${confirmedWeeks} / ${weeks}`, `Confirmed weeks ${confirmedWeeks} / ${weeks}`)}
        </Button>
      ) : (
        <span className={s.weeks}>{t(`確定した週 ${confirmedWeeks} / ${weeks}(すべて確定)`, `Confirmed weeks ${confirmedWeeks} / ${weeks} (all confirmed)`)}</span>
      )}
    </div>
  )
}
