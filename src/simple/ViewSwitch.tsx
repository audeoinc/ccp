import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { useT } from '../i18n'

const useStyles = makeStyles({
  root: { display: 'inline-flex', flexShrink: 0, padding: '2px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  btn: {
    border: 'none',
    padding: '2px 10px',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': { color: tokens.colorNeutralForeground1 },
  },
  on: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold, boxShadow: tokens.shadow2 },
})

/**
 * 配信カードの見せ方の切り替え(シンプル | 詳しい。SU1)。配信カードの上の帯に置き、最後に選んだ方を、次に開くときにも使う(人の設定 simpleCard.on)。
 * 切り替えても、直している中身はそのまま(同じ CardDetail の描き方だけが替わる)
 */
export function ViewSwitch({ simple, onChange }: { simple: boolean; onChange: (simple: boolean) => void }) {
  const t = useT()
  const s = useStyles()
  return (
    <span className={s.root} role="tablist" aria-label={t('配信カードの見せ方', 'Card view')}>
      <button type="button" role="tab" aria-selected={simple} className={mergeClasses(s.btn, simple && s.on)} onClick={() => onChange(true)} title={t('プレビューを押して直す画面', 'Click the preview to edit')}>
        {t('シンプル', 'Simple')}
      </button>
      <button type="button" role="tab" aria-selected={!simple} className={mergeClasses(s.btn, !simple && s.on)} onClick={() => onChange(false)} title={t('すべての欄と工程が並ぶ画面', 'All fields and steps')}>
        {t('詳しい', 'Full')}
      </button>
    </span>
  )
}
