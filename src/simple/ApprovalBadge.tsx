import { makeStyles, tokens } from '@fluentui/react-components'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowUndoRegular, CheckmarkCircleRegular, ClockRegular, EditRegular } from '@fluentui/react-icons'
import { statusRank } from '../status'
import { useT } from '../i18n'

const useBandStyles = makeStyles({
  // カードの幅いっぱいの 1 行。高さは状態で変えない(長い文は … で切る)。押すと承認のパネルが開く
  band: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    height: '34px',
    boxSizing: 'border-box',
    width: '100%',
    padding: '0 16px 0 12px',
    border: 'none',
    borderLeft: '4px solid var(--band-line)',
    backgroundColor: 'var(--band-bg)',
    fontFamily: 'inherit',
    fontSize: '12px',
    textAlign: 'left',
    cursor: 'pointer',
    flexShrink: 0,
    ':focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  // 状態の文字は 13px(添える文・保存の様子は 12px)。弱く見えたので強めた(2026-10-26 利用者)
  state: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', fontSize: '13px', fontWeight: tokens.fontWeightSemibold, color: 'var(--band-fg)', whiteSpace: 'nowrap', flexShrink: 0, '& svg': { fontSize: '16px' } },
  dot: { color: 'var(--band-sub)', flexShrink: 0 },
  note: { color: 'var(--band-sub)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 },
  save: { color: 'var(--band-sub)', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 'auto' },
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
 * 承認の状態の帯(2026-10-26 利用者と決めた。以前の題の行の札 SU11 の代わり): 配信カード(フロート)のいちばん上に、幅いっぱいの帯を 1 本。
 * 左に状態(印と短い言葉)と、添える文(だれを待っているか・差し戻しの理由など)、右の端に保存の状態。
 * 承認済みの案内(直すと承認待ちに戻る)も、この帯にまとめる
 */
export function ApprovalBand({
  status,
  waiting,
  changesRequested,
  reviewers,
  approved,
  pendingNames,
  changeReason,
  dirty,
  save,
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
  save: ReactNode
  onOpen: () => void
}) {
  const s = useBandStyles()
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
  return (
    <button
      type="button"
      className={s.band}
      style={{ '--band-line': c.line, '--band-bg': c.bg, '--band-fg': c.fg, '--band-sub': c.sub } as CSSProperties}
      onClick={onOpen}
      title={spec.note}
      aria-label={t(`承認の状態: ${spec.label}。${spec.note}。承認のパネルを開く`, `Approval: ${spec.label}. ${spec.note}. Open the approval panel`)}
    >
      <span className={s.state}>
        {spec.icon}
        {spec.label}
      </span>
      <span className={s.dot}>·</span>
      <span className={s.note}>{spec.note}</span>
      <span className={s.save}>{save}</span>
    </button>
  )
}
