import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { CSSProperties } from 'react'
import { ArrowUndoRegular, CheckmarkCircleRegular, ClockRegular, EditRegular } from '@fluentui/react-icons'
import { statusRank } from '../status'
import { useT } from '../i18n'

const useChipStyles = makeStyles({
  // 題の行の中の小さな札(2026-10-28 利用者: 黒い帯をやめ、上を詰める)。押すと承認のパネルが開く
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '4px',
    height: '24px',
    boxSizing: 'border-box',
    padding: '0 10px 0 8px',
    border: '1px solid var(--band-line)',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: 'var(--band-bg)',
    color: 'var(--band-fg)',
    fontFamily: 'inherit',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    flexShrink: 0,
    '& svg': { fontSize: '14px' },
    ':focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '1px' },
  },
  // 差し戻しの理由・承認済みを直したときの案内は、見落とすと困るので、札の横に短く(長い文は … で切り、全文は札のツールチップ)
  note: { fontSize: '12px', color: tokens.colorNeutralForeground3, minWidth: 0, maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  warn: { color: tokens.colorStatusWarningForeground3 },
})

/**
 * 帯の色(線・背景・状態の文字・添える文と保存の様子)。札と同じ色の並び(未起案 = 濃い灰、承認待ち = 黄、承認済み = 緑、差し戻し = 赤)。
 * 未起案だけは、札のときと同じ濃い灰色の塗りつぶしに白系の文字(薄い灰色では、ほかの状態より弱く見えた。2026-10-26 利用者)
 */
const BAND_COLORS = {
  draft: { line: tokens.colorNeutralForegroundInverted, bg: tokens.colorNeutralBackgroundInverted, fg: tokens.colorNeutralForegroundInverted, sub: tokens.colorNeutralForegroundInverted2 },
  pending: { line: tokens.colorStatusWarningBorderActive, bg: tokens.colorStatusWarningBackground2, fg: tokens.colorStatusWarningForeground3, sub: tokens.colorNeutralForeground3 },
  approved: { line: tokens.colorStatusSuccessBorderActive, bg: tokens.colorStatusSuccessBackground2, fg: tokens.colorStatusSuccessForeground1, sub: tokens.colorNeutralForeground3 },
  changes: { line: tokens.colorStatusDangerBorderActive, bg: tokens.colorStatusDangerBackground2, fg: tokens.colorStatusDangerForeground1, sub: tokens.colorNeutralForeground3 },
}

/**
 * 承認の状態の札(2026-10-28 利用者: 以前の幅いっぱいの帯 ApprovalBand をやめ、題の行の中に小さく)。
 * 状態(印と短い言葉)を札に、添える文(だれを待っているか・差し戻しの理由など)はツールチップに。
 * 差し戻しの理由と、承認済みを直したときの案内(保存すると承認待ちに戻る)だけは、札の横にも短く出す
 */
export function ApprovalChip({
  status,
  waiting,
  changesRequested,
  reviewers,
  approved,
  pendingNames,
  changeReason,
  dirty,
  onOpen,
}: {
  status: string
  waiting: boolean
  changesRequested: boolean
  reviewers: number
  approved: number
  pendingNames: string[]
  changeReason: string
  dirty: boolean
  onOpen: () => void
}) {
  const s = useChipStyles()
  const t = useT()
  const rank = statusRank(status)
  const names = pendingNames.filter(Boolean)
  const spec = changesRequested
    ? {
        kind: 'changes' as const,
        icon: <ArrowUndoRegular />,
        label: t('差し戻し', 'Changes'),
        note: changeReason ? t(`理由: ${changeReason}`, `Reason: ${changeReason}`) : t('直して、承認を依頼し直します', 'Fix it and request approval again'),
      }
    : rank >= statusRank('approved')
      ? {
          kind: 'approved' as const,
          icon: <CheckmarkCircleRegular />,
          label: t('承認済み', 'Approved'),
          // 承認済みの案内(以前は別の帯に出していた)。書き換えたら、保存で承認待ちに戻ることを言う
          note: dirty ? t('保存すると承認待ちに戻り、承認の依頼からやり直しになります', 'Saving puts it back to pending and needs a new approval request') : t('直すと承認待ちに戻ります', 'Editing puts it back to pending'),
        }
      : rank >= statusRank('reviewing')
        ? {
            kind: 'pending' as const,
            icon: <ClockRegular />,
            label: waiting && reviewers > 0 ? t(`承認待ち(${approved}/${reviewers} 人)`, `Pending (${approved}/${reviewers})`) : t('承認待ち', 'Pending'),
            note: !waiting
              ? t('承認の依頼はまだです', 'Approval not requested yet')
              : names.length
                ? t(`${names.join('さん、')}さんの承認を待っています`, `Waiting for ${names.join(', ')} to approve`)
                : t('承認を待っています', 'Waiting for approval'),
          }
        : { kind: 'draft' as const, icon: <EditRegular />, label: t('未起案', 'Draft'), note: t('まだ承認を依頼していません', 'Approval not requested yet') }
  const c = BAND_COLORS[spec.kind]
  const vars = { '--band-line': c.line, '--band-bg': c.bg, '--band-fg': c.fg, '--band-sub': c.sub } as CSSProperties
  const inline = spec.kind === 'changes' || (spec.kind === 'approved' && dirty)
  return (
    <>
      <button
        type="button"
        className={s.chip}
        style={vars}
        onClick={onOpen}
        title={spec.note}
        aria-label={t(`承認の状態: ${spec.label}。${spec.note}。承認のパネルを開く`, `Approval: ${spec.label}. ${spec.note}. Open the approval panel`)}
      >
        {spec.icon}
        {spec.label}
      </button>
      {inline && <span className={mergeClasses(s.note, spec.kind === 'approved' && s.warn)} title={spec.note}>{spec.note}</span>}
    </>
  )
}
