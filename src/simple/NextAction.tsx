import { Button, Tooltip } from '@fluentui/react-components'
import { CheckmarkCircleRegular, OpenRegular, SendRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import type { NextStep } from './nextStep'

/**
 * 次にやることのボタン(SU1 ③)。主のボタンを 1 つだけ出す。自分がやることがあるときだけ出す(SU11。見るだけのボタンにはしない)。
 * 承認・制作への依頼は、左のバーのパネル(承認・渡すもの)を開いて行う
 */
export function NextAction({ step, busy, onRun }: { step: NextStep; busy?: boolean; onRun: (step: NextStep) => void }) {
  const t = useT()
  const spec = {
    requestApproval: { icon: <SendRegular />, label: t('承認に出す', 'Request approval'), hint: t('左のバーの「承認」を開きます。そこから承認を依頼します', 'Opens “Approval” in the left bar to request approval') },
    review: { icon: <CheckmarkCircleRegular />, label: t('承認する・差し戻す', 'Approve or request changes'), hint: t('あなたが承認する番です。左のバーの「承認」で決めます', 'It is your turn. Decide under “Approval” in the left bar') },
    requestProduction: { icon: <SendRegular />, label: t('制作に依頼', 'Hand off to production'), hint: t('左のバーの「渡すもの」で、担当・締め切りを決めて制作に渡します', 'Set the assignee and due date under “Handoff” in the left bar') },
    openProduction: { icon: <OpenRegular />, label: t('制作のページを開く', 'Open production page'), hint: t('この配信の制作のページを開きます', 'Open the production page for this delivery') },
  }[step]
  return (
    <Tooltip content={spec.hint} relationship="description">
      <Button type="button" size="small" appearance="primary" icon={spec.icon} disabled={busy} onClick={() => onRun(step)} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
        {spec.label}
      </Button>
    </Tooltip>
  )
}
