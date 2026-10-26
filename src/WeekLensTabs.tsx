import { useLayoutEffect, useRef, useState } from 'react'
import { Tab, TabList, makeStyles, tokens } from '@fluentui/react-components'
import { useT } from './i18n'
import type { WeekLens } from './WeekView'

const useStyles = makeStyles({
  // 週の表示の中身のいちばん上の段。上の帯には段を足さない(週とほかの表示で、帯の高さが変わらないように)
  row: { position: 'relative', display: 'flex', marginBottom: tokens.spacingVerticalS },
  // 「週」のボタンの下から、タブの枠までのつなぎの線。週の下位の選択だと、見て分かるように
  stem: { position: 'absolute', width: '2px', backgroundColor: tokens.colorBrandStroke2, pointerEvents: 'none' },
  box: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorBrandBackground2,
    padding: `0 ${tokens.spacingHorizontalXS}`,
  },
})

// つなぎの線を、タブの枠のどこに当てるか(枠の左端から)
const STEM_X = 24

/** 週の見方(商品 / 進み具合 / 時刻 / 前週と比べる)。週の表示のときだけ出し、「週」のボタン(anchor)から下に生える形に置く */
export function WeekLensTabs({ anchor, lens, onChange }: { anchor: HTMLElement | null; lens: WeekLens; onChange: (v: WeekLens) => void }) {
  const s = useStyles()
  const t = useT()
  const rowRef = useRef<HTMLDivElement>(null)
  // 「週」のボタンの真ん中の位置(この段の左端から)と、ボタンの下端からこの段の上端までの高さ
  const [pos, setPos] = useState<{ x: number; rise: number } | null>(null)
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!anchor || !row) return
    const measure = () => {
      const a = anchor.getBoundingClientRect()
      const r = row.getBoundingClientRect()
      setPos({ x: Math.round(a.left - r.left + a.width / 2), rise: Math.max(0, Math.round(r.top - a.bottom)) })
    }
    measure()
    // 幅が変わって、上の帯が折り返したときも、つなぎを合わせ直す
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    ro.observe(anchor)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [anchor])
  return (
    <div ref={rowRef} className={s.row}>
      {pos && <span className={s.stem} aria-hidden style={{ left: pos.x - 1, top: -pos.rise, height: pos.rise }} />}
      <div className={s.box} style={{ marginLeft: pos ? Math.max(0, pos.x - STEM_X) : 0 }}>
        <TabList size="small" selectedValue={lens} onTabSelect={(_, d) => onChange(d.value as WeekLens)} aria-label={t('週の見方', 'Week lens')}>
          <Tab value="products">{t('商品', 'Products')}</Tab>
          <Tab value="progress">{t('進み具合', 'Progress')}</Tab>
          <Tab value="time">{t('時刻', 'Time')}</Tab>
          <Tab value="compare">{t('前週と比べる', 'vs last week')}</Tab>
        </TabList>
      </div>
    </div>
  )
}
