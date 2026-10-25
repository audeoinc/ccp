import { useState, type ReactNode } from 'react'
import { Badge, Button, Link, Popover, PopoverSurface, PopoverTrigger, Tooltip } from '@fluentui/react-components'
import { CheckmarkCircleRegular, OpenRegular, SendRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import type { NextStep } from './nextStep'

interface Props {
  step: NextStep
  busy?: boolean
  /** 送る前の確かめで、気になる所の数(押した先に一覧が出る) */
  issues?: number
  /** 左のバーのパネルを開く(Popover がない段階は、押したらこれ。Popover の中の「詳しく見る」もこれ) */
  onRun: (step: NextStep) => void
  /**
   * ボタンの真下の Popover で、その場で済ませる中身(承認を依頼する・承認する・差し戻す。simple-ui-review-1 の 8)。
   * close は、済んだ・やめたときに Popover を閉じる。省くと、これまでどおりパネルを開くだけ
   */
  renderQuick?: (close: () => void) => ReactNode
}

/**
 * 次にやることのボタン(SU1 ③)。主のボタンを 1 つだけ出す。自分がやることがあるときだけ出す(SU11。見るだけのボタンにはしない)。
 * 承認を依頼する・承認する・差し戻すは、ボタンの真下の Popover でその場で済ませる(Linear・Asana の形)。詳しく見たい人のために、左のバーのパネルも残す。
 * 制作に渡すは、左のバーの「渡すもの」を開いて行う。どちらも、送る前の確かめの気になる所の数を、ボタンに出す
 */
export function NextAction({ step, busy, issues = 0, onRun, renderQuick }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const spec = {
    requestApproval: { icon: <SendRegular />, label: t('承認を依頼する', 'Request approval'), hint: t('送る前の確かめを見て、その場で承認を依頼します', 'Review the checks and request approval right here') },
    review: { icon: <CheckmarkCircleRegular />, label: t('承認する・差し戻す', 'Approve or request changes'), hint: t('あなたが承認する番です。その場で承認するか、差し戻します', 'It is your turn. Approve or request changes right here') },
    requestProduction: { icon: <SendRegular />, label: t('制作に渡す', 'Hand off to production'), hint: t('左のバーの「渡すもの」を開きます。いちばん上の確かめを見て、制作の担当・締め切りを決めてから渡します', 'Opens “Handoff” in the left bar. Review the checks, set the production assignee and due date, then hand off') },
    openProduction: { icon: <OpenRegular />, label: t('制作のページを開く', 'Open production page'), hint: t('この配信の制作のページを開きます', 'Open the production page for this delivery') },
  }[step]
  const quick = renderQuick && (step === 'requestApproval' || step === 'review')
  const button = (
    <Button type="button" size="small" appearance="primary" icon={spec.icon} disabled={busy} onClick={quick ? undefined : () => onRun(step)} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
      {spec.label}
      {issues > 0 && (
        <Badge size="small" color="warning" shape="rounded" style={{ marginLeft: 6 }} aria-label={t(`確かめる所 ${issues} 件`, `${issues} to check`)}>
          ⚠ {issues}
        </Badge>
      )}
    </Button>
  )
  const hint = issues > 0 ? `${spec.hint}${t(`(確かめる所が ${issues} 件あります)`, ` (${issues} to check)`)}` : spec.hint
  if (!quick)
    return (
      <Tooltip content={hint} relationship="description">
        {button}
      </Tooltip>
    )
  const close = () => setOpen(false)
  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="below-end" withArrow trapFocus>
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={hint} relationship="description">
          {button}
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface aria-label={spec.label} style={{ maxHeight: 'min(70vh, 640px)', overflowY: 'auto' }}>
        {/* 開いているときだけ描く(開くたびに、いまの相手・確かめで始める) */}
        {open && renderQuick(close)}
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <Link
            as="button"
            onClick={() => {
              close()
              onRun(step)
            }}
          >
            {t('左のパネルで詳しく見る', 'Open the panel for details')}
          </Link>
        </div>
      </PopoverSurface>
    </Popover>
  )
}
