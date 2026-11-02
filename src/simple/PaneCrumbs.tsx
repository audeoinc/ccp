// 右のペインの見出し(配信カードの PartPane から切り出した。2026-11-02 Plan と Production の差の 41・55)。
// 何も選んでいないときは「配信の全体」の題と ⓘ、部品を選んでいるときは「配信の全体 › セクション › 部品」のパンくずと ×(Esc)。
// 配信カードと制作の画面で、右のペインの戻り方・見出しの形をそろえるため、どちらもこれを使う
import type { ReactNode } from 'react'
import { Breadcrumb, BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem, Button, InfoLabel, Tooltip, makeStyles } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { useT } from '../i18n'
import { typo } from '../typo'

const useStyles = makeStyles({
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', minWidth: 0 },
  title: typo.heading,
  deselect: { marginLeft: 'auto' },
  // パンくずは長いセクション名でも折り返して、閉じるボタンを押し出さない
  crumbs: { minWidth: 0, '& ol': { flexWrap: 'wrap' } },
  caption: typo.caption,
})

/** パンくずの 1 段。onClick がない段は、押せない(いまいる段) */
export interface PaneCrumb {
  key: string
  label: ReactNode
  onClick?: () => void
}

interface Props {
  /**
   * 部品を選んでいるときの、配信の全体からの道(最初の段は「配信の全体」、最後の段がいま選んでいる部品)。
   * 空なら、何も選んでいない(title と info を出す)
   */
  trail: PaneCrumb[]
  /** 何も選んでいないときの題(省くと「配信の全体」) */
  title?: ReactNode
  /** 何も選んでいないときの題の横の ⓘ(この面で何ができるか・キーの操作) */
  info?: ReactNode
  /** 選ぶのをやめる(× と Esc)。部品を選んでいるときだけ × を出す */
  onDeselect?: () => void
}

export function PaneCrumbs({ trail, title, info, onDeselect }: Props) {
  const s = useStyles()
  const t = useT()
  const heading = title ?? t('配信の全体', 'Whole delivery')
  return (
    <div className={s.head}>
      {trail.length > 0 ? (
        // どこを選んでいるか。上の段を押すと、そこを選び直す(2026-10-28 利用者)
        <Breadcrumb size="small" aria-label={t('選んでいる部品の場所', 'Where the selected part is')} className={s.crumbs}>
          {trail.map((c, i) => (
            <PaneCrumbItem key={c.key} crumb={c} first={i === 0} current={i === trail.length - 1} />
          ))}
        </Breadcrumb>
      ) : info ? (
        <InfoLabel className={s.title} size="medium" weight="semibold" info={info}>
          {heading}
        </InfoLabel>
      ) : (
        <span className={s.title}>{heading}</span>
      )}
      {trail.length > 0 && onDeselect && (
        <Tooltip content={t('選ぶのをやめる(Esc)', 'Deselect (Esc)')} relationship="label">
          <Button className={s.deselect} size="small" appearance="subtle" icon={<DismissRegular />} onClick={onDeselect} />
        </Tooltip>
      )}
    </div>
  )
}

function PaneCrumbItem({ crumb, first, current }: { crumb: PaneCrumb; first: boolean; current: boolean }) {
  return (
    <>
      {!first && <BreadcrumbDivider />}
      <BreadcrumbItem>
        <BreadcrumbButton current={current} onClick={current ? undefined : crumb.onClick}>
          {crumb.label}
        </BreadcrumbButton>
      </BreadcrumbItem>
    </>
  )
}

/**
 * その場の一言の案内(ARCHITECTURE「案内の 3 つの置き方」の 1)。何も選んでいないとき・中身が空のときだけ出す。
 * 出すかどうかは呼ぶ側が決める(show)。部品を選んでいる間も出し続けると、慣れた人には邪魔なだけなので
 */
export function PaneHint({ show = true, children }: { show?: boolean; children: ReactNode }) {
  const s = useStyles()
  if (!show) return null
  return <span className={s.caption}>{children}</span>
}
