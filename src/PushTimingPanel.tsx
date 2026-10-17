import { Field, Select, makeStyles, tokens } from '@fluentui/react-components'
import { locale, useT } from './i18n'
import type { Audience } from './pushLink'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px', minWidth: 0 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  send: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  warn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
})

interface Props {
  /** 送る日時(左の配信情報で決める。datetime-local の値) */
  scheduledAt: string
  audience: string
  onAudience: (v: Audience) => void
}

/** アプリの配信カードの「⑥ 時刻・相手」。送る日時(表示)・送る相手(開く画面は「⑤ リンク先」) */
export function PushTimingPanel({ scheduledAt, audience, onAudience }: Props) {
  const styles = useStyles()
  const t = useT()
  const when = scheduledAt ? new Date(scheduledAt).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  const audiences: { v: Audience; label: string }[] = [
    { v: 'all', label: t('アプリの利用者全員', 'All app users') },
    { v: 'members', label: t('会員だけ', 'Members only') },
    { v: 'inactive30', label: t('30 日以上、アプリを開いていない人', 'Inactive for 30+ days') },
    { v: 'notOpenedEmail', label: t('同じ施策のメールを開いていない人', 'Did not open the related email') },
  ]
  return (
    <div className={styles.root}>
      <div>
        <div className={styles.caption}>{t('送る日時(左の配信情報で変えられます)', 'Send time (change it in Delivery info on the left)')}</div>
        <div className={styles.send}>{when || t('(未設定)', '(not set)')}</div>
      </div>
      <Field label={t('送る相手', 'Audience')} size="small">
        <Select size="small" value={audience} onChange={(_, d) => onAudience(d.value as Audience)}>
          <option value="" disabled>{t('選んでください', 'Choose')}</option>
          {audiences.map((a) => (
            <option key={a.v} value={a.v}>{a.label}</option>
          ))}
        </Select>
      </Field>
      {!audience && <span className={styles.warn}>{t('送る相手を決めると、この工程が完了します。', 'Choose who gets it to complete this step.')}</span>}
    </div>
  )
}
