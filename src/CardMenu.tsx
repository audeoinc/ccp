import { useState, type ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Menu,
  MenuDivider,
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
import { ArrowUndoRegular, CopyRegular, DeleteRegular, MoreHorizontalRegular, ProhibitedRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryCardsService } from './data/deliveryCards'
import type { WeekRow } from './data/weeks'
import { cancelDelivery, isCancelled, undoCancel } from './cancel'
import { defaultDuplicateAt, defaultDuplicateName, duplicateDelivery } from './duplicate'
import { confirmedWeekOf } from './weekLock'
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
  /** 複製のあと(新しい配信カードを開く) */
  onDuplicated: (id: string) => Promise<void>
  /** メニューの先頭に足す項目(シンプルな配信カードの「すべて AI で下書き」「詳しい画面へ」など。SU1) */
  extra?: ReactNode
}

/**
 * 配信カードの「…」のメニュー: 複製 / 取りやめにする / 取りやめを取り消す / 削除。
 * 取りやめは、経緯を残すふだんの操作(カレンダーに薄く残る)。削除は、間違えて作ったものを消すためのもので、元に戻せない
 */
export function CardMenu({ card, weeks, onChanged, onDeleted, onDuplicated, extra }: Props) {
  const styles = useStyles()
  const t = useT()
  const [dialog, setDialog] = useState<'duplicate' | 'cancel' | 'delete' | null>(null)
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
            {extra && (
              <>
                {extra}
                <MenuDivider />
              </>
            )}
            <MenuItem icon={<CopyRegular />} onClick={() => setDialog('duplicate')}>
              {t('複製…', 'Duplicate…')}
            </MenuItem>
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

      {dialog === 'duplicate' && <DuplicateDialog card={card} weeks={weeks} onClose={() => setDialog(null)} onDuplicated={onDuplicated} />}

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

/**
 * 配信を複製するダイアログ(配信カードの「…」と、週・月の一覧の右クリックの「複製…」から開く)。
 * 確定した週の日時には複製しない(確定した計画に、黙って配信が増えるため。週をレビューに戻してから作る)
 */
export function DuplicateDialog({ card, weeks, onClose, onDuplicated }: { card: DeliveryCard; weeks: WeekRow[]; onClose: () => void; onDuplicated: (id: string) => Promise<void> }) {
  const styles = useStyles()
  const t = useT()
  const [dupName, setDupName] = useState(() => defaultDuplicateName(card))
  const [dupAt, setDupAt] = useState(() => defaultDuplicateAt(card, weeks))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dupLocked = confirmedWeekOf(weeks, dupAt)
  const duplicate = async () => {
    setBusy(true)
    setError(null)
    try {
      const id = await duplicateDelivery(card, dupName, dupAt)
      onClose()
      await onDuplicated(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t(`「${card.name}」を複製する`, `Duplicate "${card.name}"`)}</DialogTitle>
          <DialogContent className={styles.body}>
            <span>
              {t(
                'テーマ・コピー・テンプレート・載せた商品・AB テストの案を写した、新しい配信カードを作ります。承認・制作への引き継ぎ・素材は写しません(新しい配信は、もう一度承認を通します)',
                'Creates a new delivery card with the same theme, copy, template, products and AB test variants. Approvals, hand-off to production and assets are not copied (the new delivery goes through approval again).',
              )}
            </span>
            <Field label={t('配信名', 'Name')} required size="small">
              <Input value={dupName} onChange={(_, d) => setDupName(d.value)} />
            </Field>
            <Field
              label={t('配信日時', 'Send date and time')}
              required
              size="small"
              validationState={dupLocked ? 'error' : 'none'}
              validationMessage={
                dupLocked
                  ? t('この週は確定しています。ほかの日にするか、週をレビューに戻してから複製してください', 'This week is confirmed. Pick another date, or put the week back in review first.')
                  : undefined
              }
            >
              <Input type="datetime-local" value={dupAt} onChange={(_, d) => setDupAt(d.value)} />
            </Field>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>{t('やめる', 'Back')}</Button>
            <Button
              appearance="primary"
              icon={<CopyRegular />}
              disabled={busy || !dupName.trim() || !dupAt || !!dupLocked}
              onClick={() => void duplicate()}
            >
              {t('複製して開く', 'Duplicate')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
