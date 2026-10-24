import { useState, type ReactNode } from 'react'
import { Badge, Button, Spinner, Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowUndoRegular, CheckmarkCircleRegular, LockClosedRegular, SendRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { WeekRow, WeekStatus } from './data/weeks'
import type { CardNote } from './data/cardNotes'
import { locale, useT } from './i18n'
import { statusRank } from './status'
import { StatusFlow } from './StatusFlow'
import { scopeLabel, type WeekScope } from './weekLock'
import { confirmDialog } from './confirm'

const useStyles = makeStyles({
  // 記録・資料(名前・履歴・PDF)と、週を進める操作の間の区切り
  root: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: '12px',
    rowGap: '6px',
    padding: '8px 12px',
    marginBottom: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  // 週の状態の印の横の、状態ごとの件数
  // かたまり(承認 / 確定)。左から右へ、配信の承認を進めて、週を確定する流れ
  group: { display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '10px', rowGap: '6px' },
  // 確定のかたまりは右端へ
  confirmGroup: { marginLeft: 'auto' },
  divider: { alignSelf: 'stretch', width: '1px', backgroundColor: tokens.colorNeutralStroke2 },
  // 確定後の変更(理由つき)の一覧。帯の下の行に出す
  changes: { flexBasis: '100%', display: 'grid', rowGap: '2px', paddingTop: '6px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: tokens.fontSizeBase200 },
  changesHead: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold },
  changeRow: { color: tokens.colorNeutralForeground2, overflowWrap: 'anywhere' },
  name: { width: '140px' },
  // 国・チャネルを決めていないときの説明
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  segment: { display: 'inline-flex', alignItems: 'center', columnGap: '6px' },
})

interface Props {
  /** この週の行(まだ行がなければ undefined = 確定前) */
  week?: WeekRow
  /** この週の配信(絞り込みを反映しない、すべての配信) */
  cards: DeliveryCard[]
  /** 確定した週の配信を変えたときの理由(すべての配信の分。この週の、最後の確定より後のものだけを出す) */
  changes?: CardNote[]
  /** 週の未依頼の配信を、種別ごとの既定の相手で、まとめて承認の依頼にする(U6。App 側で行う) */
  onRequestAll?: () => Promise<void>
  /** まとめて依頼する配信の数(未承認で、依頼中の依頼がないもの) */
  toRequest?: number
  /** 自分宛ての依頼を、まとめて承認する(U6。App 側で行う) */
  onApproveMine?: () => Promise<void>
  /** この週の、自分宛ての依頼の数 */
  mine?: number
  /** 「あなた」が選ばれているか(依頼・承認には要る) */
  hasMe?: boolean
  /** 週の状態を変える(確定 / 確定の取り消し。週の配信のステータスも、まとめて進める。App 側で行う) */
  onChange: (status: WeekStatus) => Promise<void>
  /** 確定の前に直すことの数(確認の一覧で、問題のある項目の数)。確定の確認に使う */
  toFix?: number
  /** 確定の前に直すことのボタン(WeekChecklist)。週を進める操作の、すぐ左に置く */
  fix?: ReactNode
  /** 選んでいる確定の前に直すことの札(WeekCheckChip)。出たり消えたりするので、左側に置く */
  fixChip?: ReactNode
  /** この週の状態ごとの件数(未起案 / 承認待ち / 承認済み。週の状態の印の横に、名前つきで出す) */
  statusCounts?: { label: string; color: string; n: number }[]
}

const STATUS_APPROVED = 'approved'

/**
 * 週の帯 = 承認のバー(バックログ U6。2026-10-17 から、承認プロセスのセッションが受け持つ)。週は 確定前 → 確定 の 2 つだけ(データの値 draft / review は、どちらも「確定前」として見せる)。
 * 左から右へ: 週の状態 │ 承認(件数を 未起案 › 承認待ち › 承認済み n / 全体 の流れで出し、そのすぐ右に、まとめて依頼・自分宛てを承認)│ 確定(直すこと → 週を確定)。
 * 件数と、それを進める操作を隣に置き、配信ごとの承認と、週の確定を、区切りで分ける(利用者の指摘: 件数と操作が離れ、4 つのボタンが 1 かたまりに見えた)。
 * 確定は、週のすべての配信を「確定」(見せ方は 承認済み + 鍵)にする(承認されていない配信があれば、件数を出して確かめる)
 */
export function WeekReviewBar({ week, cards, changes = [], onRequestAll, toRequest = 0, onApproveMine, mine = 0, hasMe = false, onChange, toFix = 0, fix, fixChip, statusCounts = [] }: Props) {
  const styles = useStyles()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const status: WeekStatus = week?.status ?? 'draft'
  const confirmed = status === 'confirmed'
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const notApproved = cards.filter((c) => statusRank(c.status) < statusRank(STATUS_APPROVED)).length
  // 確定後の変更: この週の配信の、最後に確定した日時より後の理由。もう一度確定すると、それより前のものは出なくなる
  const cardName = new Map(cards.map((c) => [c.id, c.name]))
  // 日時は、文字列ではなく時刻で比べる(サーバーとブラウザで、ISO の書き方が違うことがあるため)
  const ms = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
  const since = ms(week?.confirmed_at)
  const reopened =
    !confirmed && since > 0
      ? changes
          .filter((n) => n.delivery_card_id && cardName.has(n.delivery_card_id) && ms(n.created_on) > since)
          .sort((a, b) => ms(a.created_on) - ms(b.created_on))
      : []

  const run = async (f: () => Promise<void>, confirmText?: string) => {
    if (confirmText && !(await confirmDialog(confirmText))) return
    setBusy(true)
    try {
      await f()
    } finally {
      setBusy(false)
    }
  }

  const needMe = !hasMe ? t('右上の「あなた」を選んでください', 'Choose who you are (top right) first') : null

  return (
    <div className={styles.root}>
      {/* 帯の主語: この週の状態(週の表示にしかない帯に置くので、月・一覧に切り替えても、ツールバーの位置は変わらない) */}
      <WeekStatusBadge week={week} />
      <span className={styles.divider} aria-hidden />
      {/* 承認(配信ごと): 件数の流れと、それを進める操作 */}
      <span className={styles.group}>
        <StatusFlow counts={statusCounts} total={cards.length} />
        {!confirmed && (
          <>
            {onRequestAll && (
              <Tooltip
                content={
                  needMe ??
                  t('まだ承認されておらず、依頼も出ていない配信を、既定の依頼先(⚙ の「承認の決まり」)に、まとめて依頼します(既定の依頼先がなければ、依頼しません)', 'Requests approval for every delivery that is not approved and has no open request, from the default approvers (⚙ Approval rules). Nothing is requested if there are none.')
                }
                relationship="description"
              >
                <Button
                  size="small"
                  icon={<SendRegular />}
                  disabled={busy || toRequest === 0 || !hasMe}
                  onClick={() => void run(onRequestAll, t(`未依頼の配信 ${toRequest} 件を、まとめて承認の依頼にします。よろしいですか?`, `Request approval for ${toRequest} delivery(ies)?`))}
                >
                  {t(`まとめて依頼(${toRequest})`, `Request all (${toRequest})`)}
                </Button>
              </Tooltip>
            )}
            {onApproveMine && (
              <Tooltip content={needMe ?? t('この週の、自分宛ての依頼を、まとめて承認します(差し戻すときは、配信カードで 1 本ずつ)', 'Approves every request in this week that is addressed to you (to send one back, open its card)')} relationship="description">
                <Button
                  size="small"
                  icon={<CheckmarkCircleRegular />}
                  disabled={busy || mine === 0 || !hasMe}
                  onClick={() => void run(onApproveMine, t(`自分宛ての依頼 ${mine} 件を、まとめて承認します。よろしいですか?`, `Approve ${mine} request(s) addressed to you?`))}
                >
                  {t(`自分宛てを承認(${mine})`, `Approve mine (${mine})`)}
                </Button>
              </Tooltip>
            )}
          </>
        )}
        {fixChip}
      </span>
      {/* 確定(週): 確定の前に直すこと → 週を確定 */}
      <span className={`${styles.group} ${styles.confirmGroup}`}>
        {busy && <Spinner size="extra-tiny" />}
        <span className={styles.divider} aria-hidden />
        {fix}
        {!confirmed && (
              <Tooltip content={t('週を確定します。すべての配信に鍵がかかり、変えるには理由が要ります', 'Confirms the week. Every delivery is locked and changes need a reason.')} relationship="description">
                <Button
                  size="small"
                  appearance="primary"
                  icon={<LockClosedRegular />}
                  disabled={busy || cards.length === 0}
                  onClick={() =>
                    void run(
                      () => onChange('confirmed'),
                      notApproved > 0 || toFix > 0
                        ? [
                            toFix > 0 ? t(`確定の前に直すことが ${toFix} 件残っています(「週を確定」の左の印)。`, `${toFix} item(s) to fix before confirming are left (see the mark next to Confirm week).`) : '',
                            notApproved > 0 ? t(`承認されていない配信が ${notApproved} 件あります。週を確定すると、承認なしで鍵がかかります。`, `${notApproved} deliveries are not approved yet. Confirming the week locks them without approval.`) : '',
                            t('よろしいですか?', 'Continue?'),
                          ].filter(Boolean).join(' ')
                        : undefined,
                    )
                  }
                >
                  {t('週を確定', 'Confirm week')}
                </Button>
              </Tooltip>
        )}
        {confirmed && (
              <Button
                size="small"
                appearance="subtle"
                icon={<ArrowUndoRegular />}
                disabled={busy}
                onClick={() => void run(() => onChange('review'), t('確定を取り消します。配信の鍵は外れ、ステータスは「承認済み」に戻ります。よろしいですか?', 'Undo the confirmation? Deliveries are unlocked and go back to Approved.'))}
              >
                {t('確定を取り消す', 'Undo confirmation')}
              </Button>
        )}
      </span>
      {reopened.length > 0 && (
        <div className={styles.changes}>
          <span className={styles.changesHead}>{t(`確定後の変更 ${reopened.length} 件(もう一度確定してください)`, `${reopened.length} change(s) after confirmation (confirm the week again)`)}</span>
          {reopened.map((n) => (
            <span key={n.id} className={styles.changeRow}>
              {`${when(n.created_on)} ・ ${cardName.get(n.delivery_card_id!) ?? ''}${n.author ? `(${n.author})` : ''}: ${n.body ?? ''}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 週の状態(確定前 / 確定)の印。週の帯の左端に置く(帯の主語。ツールバーに置くと、月に切り替えたときに、ほかのボタンの位置がずれるため)。
 * 確定した日時は、マウスを重ねると出す
 */
export function WeekStatusBadge({ week }: { week?: WeekRow }) {
  const t = useT()
  const confirmed = week?.status === 'confirmed'
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const tip = confirmed
    ? t(`週の状態: 確定(${when(week?.confirmed_at)})。配信には鍵がかかっています`, `Week status: Confirmed (${when(week?.confirmed_at)}). Deliveries are locked.`)
    : t('週の状態: 確定前(配信ごとに承認を進め、そろったら「週を確定」)', 'Week status: Not confirmed (approve each delivery, then confirm the week)')
  return (
    <Tooltip content={tip} relationship="description">
      {confirmed ? (
        <Badge appearance="filled" color="success" icon={<LockClosedRegular />} tabIndex={0}>{t('確定', 'Confirmed')}</Badge>
      ) : (
        <Badge appearance="outline" color="informative" tabIndex={0}>{t('確定前', 'Not confirmed')}</Badge>
      )}
    </Tooltip>
  )
}

/**
 * 国かチャネルを「すべて」にしているときの週の帯(ST3・W8)。週の提出・確定・振り返りは国・チャネルの組ごとなので、
 * 組ごとの状態と配信の数を並べ、押すとその組に絞って、いつもの週の帯(WeekReviewBar)を出す
 */
export function WeekScopeBar({ segments, onPick }: { segments: { scope: WeekScope; week?: WeekRow; n: number }[]; onPick: (scope: WeekScope) => void }) {
  const styles = useStyles()
  const t = useT()
  return (
    <div className={styles.root}>
      <span className={styles.hint}>
        {t('週の提出・確定は、国とチャネルごとです。組を選ぶと、承認・確定ができます', 'Weeks are confirmed per country and channel. Pick one to approve and confirm.')}
      </span>
      {segments.length === 0 && <span className={styles.hint}>{t('(この週の配信はまだありません。上の国とチャネルを選んでください)', '(No deliveries this week yet. Choose a country and channel above.)')}</span>}
      {segments.map(({ scope, week, n }) => (
        <Button key={`${scope.country}|${scope.channel}`} size="small" appearance="subtle" onClick={() => onPick(scope)}>
          <span className={styles.segment}>
            {scopeLabel(scope)}
            <WeekStatusBadge week={week} />
            {t(`${n} 本`, `${n}`)}
          </span>
        </Button>
      ))}
    </div>
  )
}
