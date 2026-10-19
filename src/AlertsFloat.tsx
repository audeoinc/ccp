import type { ReactNode } from 'react'
import { Button, Dialog, DialogSurface, makeStyles, tokens } from '@fluentui/react-components'
import { AlertRegular, DismissRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { CopyLinkButton } from './CopyLinkButton'

const useStyles = makeStyles({
  // 配信カード・詳しい結果と同じ、全画面に近いフロート
  surface: { width: 'min(1640px, 96vw)', maxWidth: 'none', height: '94vh', maxHeight: '94vh', padding: '16px 20px', overflowY: 'auto', backgroundColor: tokens.colorNeutralBackground2 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', marginBottom: '12px' },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  close: { marginLeft: 'auto' },
})

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * アラートのフロート。見ていた計画・結果の画面の上に重ねて開き、閉じれば元の場所(期間・見せ方・絞り込み)に戻る(PRINCIPLES 1-1)。
 * ここから開いた配信カードは、さらに上に重なり、閉じるとこのフロートに戻る
 */
export function AlertsFloat({ open, onClose, children }: Props) {
  const s = useStyles()
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={s.surface} aria-label={t('アラート', 'Alerts')}>
        <div className={s.head}>
          <AlertRegular fontSize={20} />
          <h2 className={s.title}>{t('アラート', 'Alerts')}</h2>
          <span className={s.close}>
            <CopyLinkButton />
          </span>
          <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('アラートを閉じる', 'Close alerts')} onClick={onClose} />
        </div>
        {children}
      </DialogSurface>
    </Dialog>
  )
}
