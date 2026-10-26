import { Badge, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowUndoRegular, CheckmarkCircleRegular, ClockRegular, EditRegular } from '@fluentui/react-icons'
import { statusRank } from '../status'
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
  // 4 つの状態で同じ幅(いちばん長い「承認待ち(1/2 人)」が収まる幅)。状態が変わっても、右のメールの印と題が左右に動かないように(2026-10-26 利用者)
  badge: { whiteSpace: 'nowrap', width: '132px', justifyContent: 'center' },
  // 未起案は、濃い灰色の塗りつぶし(Fluent の informative の薄い灰色では、ほかの状態の札より弱く見えた。2026-10-26 利用者)
  draft: { backgroundColor: tokens.colorNeutralBackgroundInverted, color: tokens.colorNeutralForegroundInverted },
})

/**
 * 上の帯の、承認の状態の札(SU11。2026-10-24 利用者と決めた)。題の行のいちばん左に、色と印で状態を出す
 * (未起案 = 濃い灰、承認待ち = 黄、承認済み = 緑、差し戻し = 赤)。押すと、左のバーの承認のパネルが開く。
 * English の札は、1 行で同じ幅に収まる短い言葉(Draft / Pending / Approved / Changes)。長い言い方は、tip と aria-label に書く。
 * 薄い札では分かりにくかった(ピン f24d5a87)ので、塗りつぶしの大きい札にし、色だけに頼らず印も付ける。
 * 承認の様子は、右上の青いボタンではなく、この札で見せる(青いボタンは、自分がやることがあるときだけ)
 */
export function ApprovalBadge({ status, waiting, changesRequested, reviewers, approved, onOpen }: { status: string; waiting: boolean; changesRequested: boolean; reviewers: number; approved: number; onOpen: () => void }) {
  const s = useStyles()
  const t = useT()
  const rank = statusRank(status)
  // 差し戻しは、配信のステータスが承認待ちのまま、依頼だけが差し戻しになる(server/ccp/approvals.py)ので、依頼の状態を先に見る
  const spec = changesRequested
    ? { color: 'danger' as const, icon: <ArrowUndoRegular />, label: t('差し戻し', 'Changes'), long: t('差し戻し', 'Changes requested'), tip: t('差し戻されました。直して、承認を依頼し直します', 'Changes were requested. Fix and request approval again') }
    : rank >= statusRank('approved')
      ? { color: 'success' as const, icon: <CheckmarkCircleRegular />, label: t('承認済み', 'Approved'), long: t('承認済み', 'Approved'), tip: t('承認されました。制作に渡せます', 'Approved. Ready for production') }
      : rank >= statusRank('reviewing')
        ? {
            color: 'warning' as const,
            icon: <ClockRegular />,
            label: waiting && reviewers > 0 ? t(`承認待ち(${approved}/${reviewers} 人)`, `Pending (${approved}/${reviewers})`) : t('承認待ち', 'Pending'),
            long: waiting && reviewers > 0 ? t(`承認待ち(${approved}/${reviewers} 人)`, `Awaiting approval (${approved} of ${reviewers})`) : t('承認待ち', 'Awaiting approval'),
            tip: waiting ? t('承認を待っています。押すと、相手ごとの状態が見られます', 'Waiting for approval. Click to see each reviewer') : t('承認待ちですが、依頼はまだです', 'Awaiting approval, but not requested yet'),
          }
        : // 日本語は、一覧・絞り込みと同じ呼び方(未起案)。English は札に収まる Draft(一覧の Not started は、長い言い方として aria-label に)
          { color: 'informative' as const, icon: <EditRegular />, label: t('未起案', 'Draft'), long: t('未起案', 'Not started'), tip: t('まだ承認を依頼していません', 'Approval not requested yet') }
  return (
    <Tooltip content={spec.tip} relationship="description">
      <button type="button" className={s.button} onClick={onOpen} aria-label={t(`承認の状態: ${spec.long}。承認のパネルを開く`, `Approval: ${spec.long}. Open the approval panel`)}>
        <Badge className={mergeClasses(s.badge, spec.color === 'informative' && s.draft)} appearance="filled" size="large" color={spec.color} shape="rounded" icon={spec.icon}>
          {spec.label}
        </Badge>
      </button>
    </Tooltip>
  )
}
