import { Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { shownOnlyToDeveloper, useFeatureVersion } from './featureFlags'
import { useT } from './i18n'

const useStyles = makeStyles({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 4px',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    fontSize: '10px',
    lineHeight: '14px',
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
})

/**
 * 入口の横の小さい「非公開」の印(X87)。開発者だから見えている機能にだけ出す(開発者が、一般の人の見え方とまちがえないように)。
 * 段 ② で、isOn を入れた入口の横に置く
 */
export function FeatureBadge({ id }: { id: string }) {
  const s = useStyles()
  const t = useT()
  useFeatureVersion()
  if (!shownOnlyToDeveloper(id)) return null
  return (
    <Tooltip content={t(`一般の人には出ていません(${id})。開発者なので見えています`, `Not shown to general users (${id}). You see it because you are a developer`)} relationship="description">
      <span className={s.badge}>{t('非公開', 'Not public')}</span>
    </Tooltip>
  )
}
