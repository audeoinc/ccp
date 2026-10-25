import { Badge, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { statusLabel, statusRank } from '../status'
import { useT } from '../i18n'

const useStyles = makeStyles({
  // 札そのものは Fluent の Badge。押せるように、見た目のない button で包む
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusMedium,
    ':focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  badge: { whiteSpace: 'nowrap' },
})

/**
 * 上の帯の、承認の状態の札(SU11。2026-10-24 利用者と決めた)。配信日時の右に、色で状態を出す
 * (未起案 = 灰、承認待ち = 黄、承認済み = 緑、差し戻し = 赤)。押すと、左のバーの承認のパネルが開く。
 * 承認の様子は、右上の青いボタンではなく、この札で見せる(青いボタンは、自分がやることがあるときだけ)
 */
export function ApprovalBadge({ status, waiting, changesRequested, reviewers, approved, onOpen }: { status: string; waiting: boolean; changesRequested: boolean; reviewers: number; approved: number; onOpen: () => void }) {
  const s = useStyles()
  const t = useT()
  const rank = statusRank(status)
  // 差し戻しは、配信のステータスが承認待ちのまま、依頼だけが差し戻しになる(server/ccp/approvals.py)ので、依頼の状態を先に見る
  const spec = changesRequested
    ? { color: 'danger' as const, label: t('差し戻し', 'Changes requested'), tip: t('差し戻されました。直して、承認を依頼し直します', 'Changes were requested. Fix and request approval again') }
    : rank >= statusRank('approved')
      ? { color: 'success' as const, label: t('承認済み', 'Approved'), tip: t('承認されました。制作に渡せます', 'Approved. Ready for production') }
      : rank >= statusRank('reviewing')
        ? {
            color: 'warning' as const,
            label: waiting && reviewers > 0 ? t(`承認待ち(${approved}/${reviewers} 人)`, `Awaiting approval (${approved}/${reviewers})`) : t('承認待ち', 'Awaiting approval'),
            tip: waiting ? t('承認を待っています。押すと、相手ごとの状態が見られます', 'Waiting for approval. Click to see each reviewer') : t('承認待ちですが、依頼はまだです', 'Awaiting approval, but not requested yet'),
          }
        : // 一覧・絞り込みと同じ呼び方(未起案)にする
          { color: 'informative' as const, label: statusLabel('not_started'), tip: t('まだ承認を依頼していません', 'Approval not requested yet') }
  return (
    <Tooltip content={spec.tip} relationship="description">
      <button type="button" className={s.button} onClick={onOpen} aria-label={t(`承認の状態: ${spec.label}。承認のパネルを開く`, `Approval: ${spec.label}. Open the approval panel`)}>
        <Badge className={s.badge} appearance="tint" color={spec.color} shape="rounded">
          {spec.label}
        </Badge>
      </button>
    </Tooltip>
  )
}
