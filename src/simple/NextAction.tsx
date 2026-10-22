import { Button, Tooltip } from '@fluentui/react-components'
import { ArrowRightRegular, CheckmarkRegular, OpenRegular, SendRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import type { NextStep } from './nextStep'

/**
 * 次にやることのボタン(SU1 ③)。主のボタンを 1 つだけ出す。
 * コミュニケーションのペイン(段階 d)ができるまでは、承認・制作への依頼は、今の配信カード(承認のバー・プロセスのペイン)に移って行う
 */
export function NextAction({ step, busy, onRun }: { step: NextStep; busy?: boolean; onRun: (step: NextStep) => void }) {
  const t = useT()
  const spec = {
    check: { icon: <CheckmarkRegular />, label: t('確認した', 'Mark as checked'), hint: t('AI がまとめて作った中身を確かめたら押します(保存して「AI 下書き・未確認」の印を外します)', 'Press after checking the AI-drafted content (saves and clears the “AI draft, unchecked” mark)') },
    requestApproval: { icon: <SendRegular />, label: t('承認に出す', 'Request approval'), hint: t('詳しい画面のプロセスのペインで、承認を依頼します', 'Request approval in the process pane of the full view') },
    watchApproval: { icon: <ArrowRightRegular />, label: t('承認の様子を見る', 'See approval status'), hint: t('詳しい画面のプロセスのペインで、承認の様子を見ます', 'See approval status in the process pane of the full view') },
    requestProduction: { icon: <SendRegular />, label: t('制作に依頼', 'Hand off to production'), hint: t('詳しい画面のプロセスのペインの「引き継ぎ」で、制作に依頼します', 'Hand off in the Handoff tab of the full view') },
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
