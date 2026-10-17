import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { LockClosedRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { isLockedStatus } from './status'

const useStyles = makeStyles({
  lock: { flexShrink: 0, verticalAlign: 'middle', color: tokens.colorNeutralForeground3 },
})

/**
 * 週が確定した配信の鍵マーク(バックログ U6)。「確定」を週だけの言葉にしたので、配信は「承認済み」に、これを添えて見分ける
 */
export function LockMark({ status, className }: { status?: string | null; className?: string }) {
  const styles = useStyles()
  const t = useT()
  if (!isLockedStatus(status)) return null
  const text = t('週が確定しています(変えるときは理由が必要です)', 'The week is confirmed (changes need a reason)')
  return <LockClosedRegular className={mergeClasses(styles.lock, className)} aria-label={text} title={text} />
}
