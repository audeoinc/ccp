import { Badge, Button, Tooltip } from '@fluentui/react-components'
import { CheckmarkCircleRegular, OpenRegular, SendRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import type { NextStep } from './nextStep'

/**
 * 次にやることのボタン(SU1 ③)。主のボタンを 1 つだけ出す。自分がやることがあるときだけ出す(SU11。見るだけのボタンにはしない)。
 * 承認・制作への依頼は、左のバーのパネル(承認・渡すもの)を開いて行う。パネルのいちばん上に送る前の確かめが出るので、ここには気になる所の数だけ出す
 */
export function NextAction({ step, busy, issues = 0, onRun }: { step: NextStep; busy?: boolean; /** 送る前の確かめで、気になる所の数(押した先のパネルの上に一覧が出る) */ issues?: number; onRun: (step: NextStep) => void }) {
  const t = useT()
  const spec = {
    requestApproval: { icon: <SendRegular />, label: t('承認を依頼する', 'Request approval'), hint: t('左のバーの「承認」を開きます。いちばん上の確かめを見てから、承認を依頼します', 'Opens “Approval” in the left bar. Review the checks at the top, then request approval') },
    review: { icon: <CheckmarkCircleRegular />, label: t('承認する・差し戻す', 'Approve or request changes'), hint: t('あなたが承認する番です。左のバーの「承認」で決めます', 'It is your turn. Decide under “Approval” in the left bar') },
    requestProduction: { icon: <SendRegular />, label: t('制作に渡す', 'Hand off to production'), hint: t('左のバーの「渡すもの」を開きます。いちばん上の確かめを見て、制作の担当・締め切りを決めてから渡します', 'Opens “Handoff” in the left bar. Review the checks, set the production assignee and due date, then hand off') },
    openProduction: { icon: <OpenRegular />, label: t('制作のページを開く', 'Open production page'), hint: t('この配信の制作のページを開きます', 'Open the production page for this delivery') },
  }[step]
  return (
    <Tooltip content={issues > 0 ? `${spec.hint}${t(`(確かめる所が ${issues} 件あります)`, ` (${issues} to check)`)}` : spec.hint} relationship="description">
      <Button type="button" size="small" appearance="primary" icon={spec.icon} disabled={busy} onClick={() => onRun(step)} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
        {spec.label}
        {issues > 0 && (
          <Badge size="small" color="warning" shape="rounded" style={{ marginLeft: 6 }} aria-label={t(`確かめる所 ${issues} 件`, `${issues} to check`)}>
            ⚠ {issues}
          </Badge>
        )}
      </Button>
    </Tooltip>
  )
}
