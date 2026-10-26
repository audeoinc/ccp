import { useId, useState, type ReactElement, type ReactNode } from 'react'
import { Button, Tab, TabList, ToggleButton, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChevronUpRegular, DismissRegular } from '@fluentui/react-icons'
import { useT } from './i18n'

/*
 * 「選び直す」の共通の枠(SU3)。メイン画像の入れ替え・商品の差し替え・部品の画像の選び直しで同じ形にする。
 * 下に伸びるだけだと開いたことが分かりにくく、中の選び方も並列に見えなかったので、
 * 枠と見出し(閉じる ×)で元の表示と分け、選び方は TabList で並べて、選んだタブの中身だけを出す。
 * 開くのは対象(画像・商品)の真下のボタンから(ChooseDrawer)。ボタンと枠を同じ色の線でつなげ、引き出しを開けたように見せる(2026-10-24 利用者と決めた)。
 */

const useStyles = makeStyles({
  root: {
    display: 'grid',
    minWidth: 0,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    overflow: 'hidden',
  },
  // ボタンから引き出した枠: ボタンの下の角とつながるよう、左上の角を立て、線の色をボタンにそろえる
  attached: { borderTopLeftRadius: 0, border: `1px solid ${tokens.colorBrandStroke1}` },
  drawer: { display: 'grid', justifyItems: 'start', minWidth: 0 },
  drawerPanel: { justifySelf: 'stretch' },
  // 開いている間のボタン: 押されたままの見た目で、下の線をなくして枠の見出しと同じ色にし、枠の上の線に 1px 重ねてつなぐ
  triggerOpen: {
    position: 'relative',
    zIndex: 1,
    marginBottom: '-1px',
    border: `1px solid ${tokens.colorBrandStroke1}`,
    borderBottomColor: tokens.colorBrandBackground2,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
    ':hover': { backgroundColor: tokens.colorBrandBackground2Hover, color: tokens.colorNeutralForeground1, borderBottomColor: tokens.colorBrandBackground2 },
    ':hover:active': { backgroundColor: tokens.colorBrandBackground2Pressed, color: tokens.colorNeutralForeground1 },
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    padding: '6px 6px 6px 12px',
    backgroundColor: tokens.colorBrandBackground2,
    borderBottom: `1px solid ${tokens.colorBrandStroke2}`,
  },
  title: { flexGrow: 1, minWidth: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  // 部品のペインは狭いので、横にはみ出してスクロールさせず、折り返して全部の選び方を見せる
  tabs: { flexWrap: 'wrap', padding: '2px 4px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  body: { display: 'grid', rowGap: '10px', padding: '12px', minWidth: 0 },
  // 枠と見出しのない形(商品のフロートの中。フロートが枠と題を持つので、枠の中にもう 1 つ枠を作らない)
  bare: { border: 'none', borderRadius: 0, boxShadow: 'none', backgroundColor: 'transparent' },
  bareTabs: { padding: 0 },
  bareBody: { padding: '12px 0 0' },
})

export interface ChooseTab<V extends string> {
  value: V
  label: ReactNode
  icon?: ReactElement
  content: ReactNode
}

interface Props<V extends string> {
  title: ReactNode
  tabs: ChooseTab<V>[]
  /** 最初に開くタブ(渡さなければ、先頭) */
  defaultTab?: V
  /** 閉じる。渡さなければ × を出さない(まだ何も選んでいなくて、閉じられないとき) */
  onClose?: () => void
  /** ボタンから引き出した枠(ChooseDrawer の中で使う) */
  attached?: boolean
  /** 枠と見出し(題・×)を出さず、タブと中身だけ(置いた所が枠と題を持つとき) */
  bare?: boolean
  /**
   * タブの代わりに出す中身(候補の詳しい情報など)。タブと中身は隠すだけで消さない
   * (戻ったときに、選んでいたタブ・検索の文字・AI とのやり取りがそのまま残るように)
   */
  override?: ReactNode
  id?: string
}

export function ChoosePanel<V extends string>({ title, tabs, defaultTab, onClose, attached, bare, override, id }: Props<V>) {
  const s = useStyles()
  const t = useT()
  const [tab, setTab] = useState<V>(defaultTab ?? tabs[0].value)
  const current = tabs.find((x) => x.value === tab) ?? tabs[0]
  return (
    <section id={id} className={mergeClasses(s.root, attached && s.attached, bare && s.bare)} aria-label={typeof title === 'string' ? title : undefined}>
      {!bare && (
        <div className={s.head}>
          <span className={s.title}>{title}</span>
          {onClose && <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} title={t('閉じる', 'Close')} />}
        </div>
      )}
      <TabList className={mergeClasses(s.tabs, bare && s.bareTabs)} style={override ? { display: 'none' } : undefined} size="small" selectedValue={current.value} onTabSelect={(_, d) => setTab(d.value as V)}>
        {tabs.map((x) => (
          <Tab key={x.value} value={x.value} icon={x.icon}>
            {x.label}
          </Tab>
        ))}
      </TabList>
      <div className={mergeClasses(s.body, bare && s.bareBody)} style={override ? { display: 'none' } : undefined} role="tabpanel">
        {current.content}
      </div>
      {override && <div className={mergeClasses(s.body, bare && s.bareBody)}>{override}</div>}
    </section>
  )
}

interface DrawerProps<V extends string> extends Omit<Props<V>, 'attached' | 'id' | 'onClose'> {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 開くボタンの文言(例: 入れ替える・差し替える) */
  label: ReactNode
  icon?: ReactElement
  disabled?: boolean
  /** 閉じられない(まだ何も選んでいない)ときは false。ボタンも × も出さず、枠だけを出す */
  closable?: boolean
}

/**
 * 対象の真下に置く「選び直す」のボタンと、そこから引き出す枠(SU3)。同じボタンをもう一度押すか、枠の × で閉じる。
 * 開いている間は、ボタンが押されたままの見た目(▲)で、枠とつながる
 */
export function ChooseDrawer<V extends string>({ open, onOpenChange, label, icon, disabled, closable = true, ...panel }: DrawerProps<V>) {
  const s = useStyles()
  const t = useT()
  const id = useId()
  if (!closable) return open ? <ChoosePanel {...panel} /> : null
  return (
    <div className={s.drawer}>
      <ToggleButton
        size="small"
        appearance={open ? 'secondary' : 'primary'}
        checked={open}
        className={open ? s.triggerOpen : undefined}
        icon={open ? <ChevronUpRegular /> : icon}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={open ? t('閉じる', 'Close') : undefined}
        onClick={() => onOpenChange(!open)}
      >
        {label}
      </ToggleButton>
      {open && (
        <div className={s.drawerPanel}>
          <ChoosePanel {...panel} id={id} attached onClose={() => onOpenChange(false)} />
        </div>
      )}
    </div>
  )
}
