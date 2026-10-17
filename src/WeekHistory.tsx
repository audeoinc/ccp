import { Button, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, makeStyles, tokens } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { CardEvent } from './data/events'
import { actionText } from './weekLabels'
import { locale, useT } from './i18n'
import { statusLabel } from './status'

const useStyles = makeStyles({
  surface: { width: 'min(520px, 94vw)' },
  // 承認の履歴(新しい順)
  history: { display: 'grid', rowGap: '8px', maxHeight: '60vh', overflowY: 'auto', fontSize: tokens.fontSizeBase200 },
  historyRow: { display: 'grid', rowGap: '1px', paddingBottom: '6px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  historyMeta: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  historyText: { color: tokens.colorNeutralForeground1, overflowWrap: 'anywhere' },
  historyNote: { color: tokens.colorNeutralForeground2, overflowWrap: 'anywhere' },
})

interface Props {
  open: boolean
  onClose: () => void
  /** この週の承認の履歴(新しい順) */
  events: CardEvent[]
}

/**
 * 週の承認の履歴(誰が・いつ・何から何にしたか)。いま見ている週についての記録なので、「この画面 ▾」から開く(週の帯は、週を進める操作だけにする)
 */
export function WeekHistory({ open, onClose, events }: Props) {
  const s = useStyles()
  const t = useT()
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={s.surface}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />}>
            {t('この週の承認の履歴', 'Approval history for this week')}
          </DialogTitle>
          <DialogContent>
            <div className={s.history}>
              {events.length === 0 && <span className={s.historyMeta}>{t('まだ記録はありません', 'Nothing recorded yet')}</span>}
              {events.map((e) => (
                <div key={e.id} className={s.historyRow}>
                  <span className={s.historyMeta}>{`${when(e.created_on)} · ${e.actor || t('(名前なし)', '(no name)')}`}</span>
                  <span className={s.historyText}>
                    {e.card_name ? `${e.card_name}: ` : ''}
                    {actionText(t, e.action)}
                    {/* 履歴では、確定と承認済みを読み分けたいので、名前は full で出す */}
                    {e.to_status !== undefined && e.to_status !== null && e.to_status !== e.from_status ? `(${e.from_status ? `${statusLabel(e.from_status, true)} ` : ''}→ ${statusLabel(e.to_status, true)})` : ''}
                  </span>
                  {e.note && <span className={s.historyNote}>{e.note}</span>}
                </div>
              ))}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
