import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { ArrowUndoRegular, DeleteRegular, MoreHorizontalRegular, ProhibitedRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryCardsService } from './data/deliveryCards'
import type { WeekRow } from './data/weeks'
import { cancelDelivery, isCancelled, undoCancel } from './cancel'
import { logEvent } from './history'
import { useT } from './i18n'

const useStyles = makeStyles({
  danger: { color: tokens.colorPaletteRedForeground1 },
  dangerBtn: { backgroundColor: tokens.colorPaletteRedBackground3, color: tokens.colorNeutralForegroundOnBrand, ':hover': { backgroundColor: tokens.colorPaletteRedForeground1, color: tokens.colorNeutralForegroundOnBrand } },
  body: { display: 'grid', rowGap: '10px' },
})

interface Props {
  card: DeliveryCard
  weeks: WeekRow[]
  /** 取りやめ・取り消しのあと(配信カードを読み直す) */
  onChanged: () => Promise<void>
  /** 削除のあと(配信カードを閉じる) */
  onDeleted: () => Promise<void>
}

/**
 * 配信カードの「…」のメニュー: 取りやめにする / 取りやめを取り消す / 削除。
 * 取りやめは、経緯を残すふだんの操作(カレンダーに薄く残る)。削除は、間違えて作ったものを消すためのもので、元に戻せない
 */
export function CardMenu({ card, weeks, onChanged, onDeleted }: Props) {
  const styles = useStyles()
  const t = useT()
  const [dialog, setDialog] = useState<'cancel' | 'delete' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelled = isCancelled(card)

  const run = async (fn: () => Promise<void>, after: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setDialog(null)
      await after()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const remove = () =>
    run(async () => {
      // 履歴には、配信名を残す(配信を消しても、何を消したかが読めるように)
      await logEvent({ action: 'status', card: { id: card.id, name: card.name, scheduledAt: card.scheduled_at }, from: card.status, note: t('配信カードを削除した', 'Deleted the delivery card') })
      await DeliveryCardsService.delete(card.id)
    }, onDeleted)

  return (
    <>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('その他の操作', 'More actions')} />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {cancelled ? (
              <MenuItem icon={<ArrowUndoRegular />} onClick={() => void run(() => undoCancel(card), onChanged)}>
                {t('取りやめを取り消す', 'Undo cancellation')}
              </MenuItem>
            ) : (
              <MenuItem icon={<ProhibitedRegular />} onClick={() => { setReason(''); setError(null); setDialog('cancel') }}>
                {t('取りやめにする…', 'Cancel delivery…')}
              </MenuItem>
            )}
            <MenuItem icon={<DeleteRegular className={styles.danger} />} onClick={() => { setError(null); setDialog('delete') }}>
              <span className={styles.danger}>{t('削除…', 'Delete…')}</span>
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>

      <Dialog open={dialog === 'cancel'} onOpenChange={(_, d) => !d.open && setDialog(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t(`「${card.name}」を取りやめにする`, `Cancel "${card.name}"`)}</DialogTitle>
            <DialogContent className={styles.body}>
              <span>
                {t(
                  '取りやめた配信は、消さずに残ります(カレンダーに薄く出て、アラート・週の確認・件数からは外れます)。確定した週の配信なら、週の確定は解けます',
                  'The delivery is kept (shown faded in the calendar, and left out of alerts, week checks and counts). If the week is confirmed, it goes back to review.',
                )}
              </span>
              <Field label={t('取りやめの理由', 'Reason')} required size="small">
                <Textarea value={reason} onChange={(_, d) => setReason(d.value)} rows={3} />
              </Field>
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDialog(null)}>{t('やめる', 'Back')}</Button>
              <Button appearance="primary" disabled={busy || !reason.trim()} onClick={() => void run(() => cancelDelivery(card, reason, weeks), onChanged)}>
                {t('取りやめにする', 'Cancel delivery')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(_, d) => !d.open && setDialog(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t(`「${card.name}」を削除する`, `Delete "${card.name}"`)}</DialogTitle>
            <DialogContent className={styles.body}>
              <span>
                {t(
                  '削除は、間違えて作った配信カードを消すためのものです。元に戻せません。載せた商品・メモ・結果も一緒に消えます。経緯を残したいときは「取りやめ」を使ってください',
                  'Delete is for delivery cards created by mistake. It cannot be undone, and its products, notes and results are deleted too. To keep the history, use Cancel instead.',
                )}
              </span>
              {error && (
                <MessageBar intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDialog(null)}>{t('やめる', 'Back')}</Button>
              <Button className={styles.dangerBtn} icon={<DeleteRegular />} disabled={busy} onClick={() => void remove()}>
                {t('削除する', 'Delete')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}
