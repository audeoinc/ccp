import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { allVariants, isChoose, metricLabel, parseAbTest, parseDecision, targetLabel } from './abTest'
import { useT } from './i18n'

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorPaletteTealBorderActive}`,
    color: tokens.colorPaletteTealForeground2,
    backgroundColor: tokens.colorPaletteTealBackground2,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  },
  // 案から選ぶ(未決定は注意の色、決めたあとは落ち着いた色。X57)
  choose: { border: `1px solid ${tokens.colorPaletteMarigoldBorderActive}`, color: tokens.colorPaletteMarigoldForeground2, backgroundColor: tokens.colorPaletteMarigoldBackground2 },
  decided: { border: `1px solid ${tokens.colorNeutralStroke1}`, color: tokens.colorNeutralForeground2, backgroundColor: tokens.colorNeutralBackground3 },
  // 一覧の列・週の配信の箱
  small: { height: '20px', padding: '0 6px', fontSize: tokens.fontSizeBase100 },
  // 月の配信の箱・時刻の格子(名前の前。幅が狭いため、文字を詰める)
  icon: { height: '16px', padding: '0 3px', fontSize: '10px', lineHeight: '14px', verticalAlign: '-3px', marginRight: '4px' },
})

/**
 * AB テストの配信の印(X55 段階 3)。「A/B」「A/B/C」。マウスを重ねると、比べる要素と判定の指標。
 * AB テストでない配信には何も出さない。月・週・一覧・時刻の格子で、チャネルの札の隣に置く
 */
export function AbBadge({ abTest, size = 'small' }: { abTest?: string | null; size?: 'small' | 'icon' }) {
  const s = useStyles()
  const t = useT()
  const ab = parseAbTest(abTest)
  // 案から選んだあと(X57): どの案に決めたか
  const decided = ab ? null : parseDecision(abTest)
  if (decided)
    return (
      <span
        className={mergeClasses(s.root, s[size], s.decided)}
        role="img"
        aria-label={t(`${decided.variant} 案に決めた`, `Went with variant ${decided.variant}`)}
        title={t(`案から選んだ: ${decided.variant} 案を配信(${decided.rejected.map((r) => r.key).join('・')} 案は配信しない)`, `Chose variant ${decided.variant} (${decided.rejected.map((r) => r.key).join(', ')} not sent)`)}
      >
        {t(`${decided.variant} 案`, `${decided.variant}`)}
      </span>
    )
  if (!ab) return null
  const keys = allVariants(ab)
  if (isChoose(ab))
    return (
      <span
        className={mergeClasses(s.root, s[size], s.choose)}
        role="img"
        aria-label={t(`案から選ぶ(${keys.length} 案。未決定)`, `Choosing between ${keys.length} variants`)}
        title={t(`案から選ぶ: ${keys.join('・')} の ${keys.length} 案から、まだ決まっていない`, `Choosing between ${keys.length} variants (${keys.join(', ')}); not decided yet`)}
      >
        {`${keys.join('/')}?`}
      </span>
    )
  const label = keys.join('/')
  return (
    <span
      className={mergeClasses(s.root, s[size])}
      role="img"
      aria-label={t(`AB テスト(${keys.length} 案)`, `A/B test (${keys.length} variants)`)}
      title={t(`AB テスト: ${keys.length} 案で${targetLabel(ab.target)}を比べる(判定: ${metricLabel(ab.metric)})`, `A/B test: ${keys.length} variants comparing the ${targetLabel(ab.target).toLowerCase()} (judged by ${metricLabel(ab.metric).toLowerCase()})`)}
    >
      {label}
    </span>
  )
}
