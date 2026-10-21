import { useEffect, useState } from 'react'
import { Button, Select, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, SplitVerticalRegular, SubtractRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { MAX_CELL_COLS, MAX_CELL_ROWS, cellAt, cellRows, mergeCells, normalizeCells, plainCells, splitCell, type Cell } from './cells'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px' },
  bar: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap', fontSize: '12px' },
  label: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  count: { minWidth: '16px', textAlign: 'center' },
  grid: { display: 'grid', gap: '3px', width: 'fit-content', userSelect: 'none', touchAction: 'none' },
  // なぞるためのマス(下に敷く)
  base: { width: '40px', height: '40px', borderRadius: '3px', backgroundColor: tokens.colorNeutralBackground3, cursor: 'crosshair' },
  baseOn: { backgroundColor: tokens.colorBrandBackground2, outline: `1.5px dashed ${tokens.colorBrandStroke1}` },
  // 枠(上に重ねる。押す・なぞるのは下のマスで受ける)
  cell: {
    pointerEvents: 'none',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '3px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  cellBig: { backgroundColor: tokens.colorNeutralBackground4 },
  cellSelected: { border: `2px solid ${tokens.colorBrandStroke1}`, color: tokens.colorBrandForeground1 },
  hint: { fontSize: '11px', color: tokens.colorNeutralForeground3 },
})

/**
 * マス目の部品の編集(テンプレート管理)。列の数と行の数を決め、マスをなぞると 1 つの枠にまとまる(表計算のセルの結合と同じ)。
 * 枠を押して選び、「分ける」で 1 マスずつに戻す。枠の番号は、商品の載る順(上の行から、同じ行は左から)
 */
export function CellEditor({ cols, cells, maxSlots, onChange }: { cols: number; cells: Cell[]; maxSlots: number; onChange: (cols: number, cells: Cell[]) => void }) {
  const s = useStyles()
  const t = useT()
  const rows = Math.max(1, cellRows(cells))
  // なぞっている四角(押したマスと、いま指しているマス)
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const rect = drag
    ? { c: Math.min(drag.a[0], drag.b[0]), r: Math.min(drag.a[1], drag.b[1]), w: Math.abs(drag.a[0] - drag.b[0]) + 1, h: Math.abs(drag.a[1] - drag.b[1]) + 1 }
    : null

  // 指を離したら、なぞった四角を 1 つの枠にまとめる(1 マスだけなら、その枠を選ぶ)。マス目の外で離しても終える
  useEffect(() => {
    if (!drag || !rect) return
    const up = () => {
      setDrag(null)
      if (rect.w === 1 && rect.h === 1) {
        const i = cellAt(cells, rect.c, rect.r)
        setSelected((v) => (v === i ? null : i))
        return
      }
      const next = mergeCells(cols, rows, cells, rect)
      setSelected(cellAt(next, rect.c, rect.r))
      onChange(cols, next)
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  })

  const setCols = (n: number) => {
    setSelected(null)
    onChange(n, normalizeCells(n, rows, cells.filter((x) => x.c + x.w <= n)).slice(0, maxSlots))
  }
  const setRows = (n: number) => {
    setSelected(null)
    onChange(cols, normalizeCells(cols, n, cells.filter((x) => x.r + x.h <= n)))
  }
  const sel = selected !== null ? cells[selected] : undefined
  // 行を足すと 1 マスの枠が列の数だけ増えるので、枠の上限を超えるなら足せない
  const canAddRow = rows < MAX_CELL_ROWS && cells.length + cols <= maxSlots

  return (
    <div className={s.root}>
      <div className={s.bar}>
        <span className={s.label}>{t('列', 'Columns')}</span>
        <Select size="small" value={String(cols)} onChange={(_, d) => setCols(Number(d.value))} aria-label={t('列の数', 'Columns')}>
          {Array.from({ length: MAX_CELL_COLS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n} disabled={plainCells(n, 1).length > maxSlots}>
              {n}
            </option>
          ))}
        </Select>
        <span className={s.label}>{t('行', 'Rows')}</span>
        <Button size="small" appearance="subtle" icon={<SubtractRegular />} disabled={rows <= 1} onClick={() => setRows(rows - 1)} aria-label={t('行を減らす', 'Remove a row')} />
        <span className={s.count}>{rows}</span>
        <Button size="small" appearance="subtle" icon={<AddRegular />} disabled={!canAddRow} onClick={() => setRows(rows + 1)} aria-label={t('行を足す', 'Add a row')} />
        <span className={s.label}>{t(`枠 ${cells.length} 点`, `${cells.length} slots`)}</span>
        {sel && sel.w * sel.h > 1 && (
          <Button size="small" appearance="outline" icon={<SplitVerticalRegular />} onClick={() => { onChange(cols, splitCell(cols, rows, cells, selected!)); setSelected(null) }}>
            {t('この枠を分ける', 'Split this slot')}
          </Button>
        )}
      </div>
      <div className={s.grid} style={{ gridTemplateColumns: `repeat(${cols}, 40px)`, gridTemplateRows: `repeat(${rows}, 40px)` }}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const c = i % cols
          const r = Math.floor(i / cols)
          const on = !!rect && c >= rect.c && c < rect.c + rect.w && r >= rect.r && r < rect.r + rect.h
          return (
            <div
              key={`b${i}`}
              className={mergeClasses(s.base, on && s.baseOn)}
              style={{ gridColumn: c + 1, gridRow: r + 1 }}
              onPointerDown={(e) => {
                e.preventDefault()
                setDrag({ a: [c, r], b: [c, r] })
              }}
              onPointerEnter={() => setDrag((d) => (d ? { ...d, b: [c, r] } : d))}
            />
          )
        })}
        {cells.map((x, i) => (
          <div
            key={`c${i}`}
            className={mergeClasses(s.cell, x.w * x.h > 1 && s.cellBig, selected === i && s.cellSelected)}
            style={{ gridColumn: `${x.c + 1} / span ${x.w}`, gridRow: `${x.r + 1} / span ${x.h}`, opacity: drag ? 0.5 : 1 }}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <span className={s.hint}>{t('マスをなぞると 1 つの枠にまとまります。枠を押して「この枠を分ける」で戻せます。番号は商品の載る順です。', 'Drag across cells to merge them into one slot. Click a slot and use "Split" to undo. Numbers show the order products appear in.')}</span>
    </div>
  )
}
