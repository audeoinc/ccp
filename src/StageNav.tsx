import { Fragment, useState, type ReactNode } from 'react'
import { Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChevronRightRegular } from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { ProductionRequest } from './models/productionRequests'
import { productionView, type ProductionView } from './useProductionRequests'
import { statusLabel } from './status'
import { canGoProduction } from './productionGate'
import { FACE_COLOR, FACE_TINT, type Face } from './faces'
import { tr, useT } from './i18n'

const useStyles = makeStyles({
  root: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', flexShrink: 0 },
  // 段の札。いまの段は面の色の枠と地(FaceBadge と同じ見た目)、ほかは薄い文字のボタン
  stage: {
    display: 'inline-flex',
    alignItems: 'baseline',
    columnGap: '6px',
    height: '26px',
    padding: '0 8px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusMedium,
    border: '1.5px solid transparent',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    lineHeight: '22px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground3,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':disabled': { cursor: 'default', opacity: 0.45, backgroundColor: 'transparent' },
  },
  current: { cursor: 'default', ':hover': { backgroundColor: 'unset' } },
  name: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightBold, letterSpacing: '0.04em' },
  state: { fontSize: tokens.fontSizeBase100 },
  arrow: { color: tokens.colorNeutralForeground4, fontSize: '12px' },
})

const SHORT: Record<ProductionView, () => string> = {
  not_approved: () => tr('承認のあと', 'After approval'),
  draft: () => tr('依頼の前', 'Not requested'),
  requested: () => tr('依頼済み', 'Requested'),
  in_progress: () => tr('制作中', 'In production'),
  done: () => tr('確認待ち', 'To check'),
  checked: () => tr('確認済み', 'Checked'),
  sent: () => tr('送った', 'Sent'),
  stale: () => tr('依頼し直す', 'Request again'),
}

interface Props {
  /** いま見ているフロートの段 */
  face: Face
  card: DeliveryCard
  /** その配信の、いちばん新しい制作の依頼 */
  production?: ProductionRequest
  /** 押した段のフロートに切り替える(同じ配信のまま)。なければ、いまの段の札だけを出す */
  onGo?: (face: Face) => void
  /** PLAN の札のすぐ右に置くもの(シンプルな配信カードの「直す | 渡す」。PLAN の中の切り替えなので、段の帯の中に置き、別の帯を作らない) */
  planSlot?: ReactNode
}

/**
 * 配信の段階の帯(2026-10-19、利用者の要望: 配信カードから、計画・制作・結果を行き来したい)。
 * 3 つのフロート(配信カード・制作のページ・詳しい結果)の題名の左に出し、押すと同じ配信の隣の段に切り替える。
 * 段ごとに短い状態を添えるので、この配信がいまどこまで進んでいるかも分かる。まだ入れない段は押せない(承認前の制作、配信日前の結果)
 */
export function StageNav({ face, card, production, onGo, planSlot }: Props) {
  const s = useStyles()
  const t = useT()
  const pv = productionView(card, production)
  // いまの時刻は、開いたときに 1 回だけ測る(描くたびに変わらないように)
  const [now] = useState(() => Date.now())
  const sent = !!card.scheduled_at && new Date(card.scheduled_at).getTime() <= now
  const stages: { face: Face; name: string; state: string; enabled: boolean; why?: string }[] = [
    { face: 'calendar', name: 'PLAN', state: statusLabel(card.status), enabled: true },
    {
      face: 'production',
      name: 'PRODUCTION',
      state: SHORT[pv](),
      enabled: canGoProduction(card) || !!production,
      why: t('承認されたら、制作に進めます', 'You can move to production after approval'),
    },
    { face: 'results', name: 'RESULTS', state: sent ? t('結果を見る', 'See results') : t('配信の前', 'Not sent yet'), enabled: sent, why: t('配信日のあとに、結果を見られます', 'Results are available after the send date') },
  ]
  const shown = onGo ? stages : stages.filter((x) => x.face === face)
  return (
    <nav className={s.root} aria-label={t('配信の段階', 'Delivery stages')}>
      {shown.map((x, i) => {
        const here = x.face === face
        const button = (
          <button
            type="button"
            className={mergeClasses(s.stage, here && s.current)}
            style={here ? { color: FACE_COLOR[x.face], backgroundColor: FACE_TINT[x.face], borderColor: FACE_COLOR[x.face] } : undefined}
            disabled={!here && !x.enabled}
            aria-current={here ? 'step' : undefined}
            onClick={() => !here && onGo?.(x.face)}
          >
            <span className={s.name}>{x.name}</span>
            <span className={s.state}>{x.state}</span>
          </button>
        )
        return (
          <Fragment key={x.face}>
            {i > 0 && <ChevronRightRegular className={s.arrow} />}
            {!here && !x.enabled && x.why ? (
              <Tooltip content={x.why} relationship="description">
                <span>{button}</span>
              </Tooltip>
            ) : (
              button
            )}
            {x.face === 'calendar' && planSlot}
          </Fragment>
        )
      })}
    </nav>
  )
}
