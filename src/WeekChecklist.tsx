import { useState } from 'react'
import { Button, Popover, PopoverSurface, PopoverTrigger, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CheckmarkCircleFilled, DismissRegular, OpenRegular, WarningFilled } from '@fluentui/react-icons'
import { useT } from './i18n'
import type { CheckItem, CheckKey } from './reviewChecks'
import { checkAction, checkHint, checkTitle } from './weekLabels'

const useStyles = makeStyles({
  root: { display: 'inline-flex', alignItems: 'center', columnGap: '4px' },
  // 印のボタン(問題があればオレンジの ⚠ と数、なければ緑の ✓)
  trigger: { minWidth: 'auto', fontWeight: tokens.fontWeightSemibold },
  warn: { color: tokens.colorPaletteDarkOrangeForeground1 },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  // 選んでいる項目(週の表示で、該当の配信・商品を目立たせている間)。何で見ているかを隠さない
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '4px',
    maxWidth: '260px',
    padding: '2px 4px 2px 10px',
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  chipText: { overflow: 'hidden', textOverflow: 'ellipsis' },
  panel: { display: 'grid', rowGap: '6px', width: '440px', maxHeight: '440px', overflowY: 'auto' },
  head: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  caption: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase200 },
  // 項目の行(押すと選ぶ。もう一度押すと外す)
  item: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    columnGap: '8px',
    alignItems: 'start',
    width: '100%',
    padding: '6px 8px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemOn: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  icon: { marginTop: '2px' },
  title: { fontWeight: tokens.fontWeightSemibold },
  action: { color: tokens.colorNeutralForeground2 },
  count: { fontWeight: tokens.fontWeightSemibold },
  // 選んだ項目の中身と、最初の配信を開くボタン
  details: { display: 'grid', rowGap: '4px', padding: '6px 8px 8px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  detailList: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px' },
  hint: { color: tokens.colorNeutralForeground3 },
  open: { justifySelf: 'start' },
  more: {
    justifySelf: 'start',
    padding: '2px 0',
    border: 'none',
    background: 'none',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForegroundLink,
    cursor: 'pointer',
    ':hover': { textDecoration: 'underline' },
  },
})

interface Props {
  items: CheckItem[]
  /** 選んでいる項目(null は選んでいない) */
  selected: CheckKey | null
  onSelect: (key: CheckKey | null) => void
  /** 項目にかかわる配信の、最初の 1 本を開く(配信カードの「保存して次へ」で、続きを順に開ける) */
  onOpen?: (cardIds: string[]) => void
}

/**
 * 週を確定する前に直すこと(確認の一覧。W4)。週の帯の「週を確定」の左に、印 1 つにたたんで置く(1 行を取らないように)。
 * 印は、問題のある項目の数(なければ ✓)。押すと、項目と「何をするか」を重ねて出す(画面は移らない)。
 * 項目を選ぶと、週の表示で該当の配信・商品が目立ち、「最初の配信を開く」から、配信カードの「保存して次へ」で順に直していける。
 * 問題のない項目は、消さずに「OK の項目」として、押すと出す(PRINCIPLES 2-2)
 */
export function WeekChecklist({ items, selected, onSelect, onOpen }: Props) {
  const s = useStyles()
  const t = useT()
  const [showOk, setShowOk] = useState(false)
  const todo = items.filter((i) => !i.ok)
  const okItems = items.filter((i) => i.ok)

  const row = (i: CheckItem) => {
    const on = i.key === selected
    return (
      <div key={i.key}>
        <button type="button" className={mergeClasses(s.item, on && s.itemOn)} aria-pressed={on} onClick={() => onSelect(on ? null : i.key)}>
          {i.ok ? <CheckmarkCircleFilled className={mergeClasses(s.icon, s.ok)} /> : <WarningFilled className={mergeClasses(s.icon, s.warn)} />}
          <span>
            <span className={s.title}>{checkTitle(t, i.key)}</span>
            {!i.ok && <div className={s.action}>{`→ ${checkAction(t, i.key)}`}</div>}
          </span>
          <span className={s.count}>{i.total !== undefined ? `${i.count} / ${i.total}` : i.count}</span>
        </button>
        {on && (
          <div className={s.details}>
            <span className={s.hint}>{checkHint(t, i.key)}</span>
            <span className={s.detailList}>
              {i.details.length > 0 ? i.details.map((d, k) => <span key={k}>{d}</span>) : <span className={s.hint}>{t('ありません', 'None')}</span>}
            </span>
            {!i.ok && i.cardIds.length > 0 && onOpen && (
              <>
                <Button size="small" appearance="primary" icon={<OpenRegular />} className={s.open} onClick={() => onOpen(i.cardIds)}>
                  {t(`最初の配信を開く(${i.cardIds.length} 本)`, `Open the first delivery (${i.cardIds.length})`)}
                </Button>
                <span className={s.hint}>{t('配信カードの「保存して次へ」で、この項目の配信を順に開けます。', 'Use “Save and next” on the delivery card to go through them in order.')}</span>
              </>
            )}
            {!i.ok && i.cardIds.length === 0 && <span className={s.hint}>{t('週の表示で、該当する商品が目立ちます。', 'Matching products are highlighted in the week view.')}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <span className={s.root}>
      <Popover withArrow positioning="below-end">
        <Tooltip
          content={todo.length ? t(`確定の前に直すこと ${todo.length} 件(押すと一覧)`, `${todo.length} to fix before confirming (click for the list)`) : t('確定の前に直すことはありません(押すと一覧)', 'Nothing to fix before confirming (click for the list)')}
          relationship="label"
        >
          <PopoverTrigger disableButtonEnhancement>
            <Button
              size="small"
              appearance="subtle"
              className={s.trigger}
              icon={todo.length ? <WarningFilled className={s.warn} /> : <CheckmarkCircleFilled className={s.ok} />}
            >
              {/* 確定の前の確認だと分かるよう、数だけでなく「直すこと」と添える(承認のバーの並びの見直し 2026-10-17) */}
              {todo.length ? <span className={s.warn}>{t(`直すこと ${todo.length}`, `${todo.length} to fix`)}</span> : t('直すことなし', 'Nothing to fix')}
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverSurface>
          <div className={s.panel}>
            <span className={s.head}>{todo.length ? t(`確定の前に直すこと(${todo.length})`, `Fix before confirming (${todo.length})`) : t('確定の前に直すことはありません', 'Nothing to fix before confirming')}</span>
            <span className={s.caption}>{t('項目を押すと、週の表示で該当の配信・商品が目立ちます。', 'Click an item to highlight the matching deliveries and products in the week view.')}</span>
            {todo.map(row)}
            {okItems.length > 0 && (
              <button type="button" className={s.more} aria-expanded={showOk} onClick={() => setShowOk(!showOk)}>
                {showOk ? t('OK の項目を隠す', 'Hide OK items') : t(`OK の項目(${okItems.length})`, `OK items (${okItems.length})`)}
              </button>
            )}
            {showOk && okItems.map(row)}
          </div>
        </PopoverSurface>
      </Popover>
    </span>
  )
}

/**
 * 選んでいる項目の札(週の表示で、何を目立たせているかを隠さない。PRINCIPLES 1-4)。
 * 出たり消えたりするので、右寄せのボタンの位置がずれないよう、週の帯の左側に置く(PRINCIPLES 2-2)
 */
export function WeekCheckChip({ items, selected, onSelect }: Pick<Props, 'items' | 'selected' | 'onSelect'>) {
  const s = useStyles()
  const t = useT()
  const current = items.find((i) => i.key === selected)
  if (!current) return null
  return (
    <span className={s.chip}>
      <span className={s.chipText}>{t(`選択中: ${checkTitle(t, current.key)}`, `Showing: ${checkTitle(t, current.key)}`)}</span>
      <Button size="small" appearance="transparent" icon={<DismissRegular />} aria-label={t('選択を外す', 'Clear selection')} onClick={() => onSelect(null)} />
    </span>
  )
}
