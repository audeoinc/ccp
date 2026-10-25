// 確かめの窓を描く所(confirm.ts の confirmDialog で開く)。App に 1 つだけ置く
import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, makeStyles } from '@fluentui/react-components'
import { answerConfirm, useConfirmAsk } from './confirm'
import { tr, useT } from './i18n'

const useStyles = makeStyles({
  // 小さい確かめの窓は、大きさを変えない(決まりの例外。ARCHITECTURE「見た目の約束事」)
  surface: { maxWidth: '480px' },
  message: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  // 見た目は、ほかの窓と同じく「やめる」「OK」の順(右に OK)
  last: { order: 1 },
})

export function ConfirmHost() {
  const s = useStyles()
  const t = useT()
  const ask = useConfirmAsk()
  // 閉じる動きの間も、最後の問いを出しておく(答えるとすぐ空になり、空の窓が一瞬見えるため)
  const [shown, setShown] = useState(ask)
  if (ask && ask !== shown) setShown(ask)
  return (
    // Esc・外を押したら、キャンセル(ブラウザの窓と同じ)。alert の窓は Esc で閉じないので、modal にする
    <Dialog open={!!ask} modalType="modal" onOpenChange={(_, d) => !d.open && answerConfirm(false)}>
      <DialogSurface className={s.surface}>
        <DialogBody>
          <DialogContent className={s.message}>{shown?.message}</DialogContent>
          <DialogActions>
            {/* ブラウザの窓と同じく、OK に最初の焦点を置く(Enter で進める)。Fluent の窓は先頭のボタンに焦点を置くので、OK を先に置き、並びだけ右にする */}
            <Button appearance="primary" className={s.last} onClick={() => answerConfirm(true)}>
              {shown?.okLabel ?? tr('OK', 'OK')}
            </Button>
            <Button appearance="secondary" onClick={() => answerConfirm(false)}>
              {t('やめる', 'Cancel')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
