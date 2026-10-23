import { useLayoutEffect, useRef, useState } from 'react'
import { makeStyles, Tooltip, tokens } from '@fluentui/react-components'
import { useT } from './i18n'
import { buttonsAt, gridColumns, placedButtons, type ButtonSpec, type HeroKind, type Section, type TemplateLayout, ratioValue } from './templates'
import { cellRows, isTextView } from './cells'
import { SECTION_BG, boxFields, buttonColor } from './tables'

// 見取り図は、受信側のメールの見た目を写したものなので、テーマに依らず固定の配色にする
const HERO_COLOR: Record<HeroKind, string> = { standard: '#cfd2dc', collab: '#b9a9d6', offer: '#f0a5a0' }
const IMG = '#d5d9e0'
const TILE = '#e3e6eb'
const LINE = '#a3a9b4'
const INK = '#3a3f47'
const RED = '#e5484d'
const PANEL = '#eef0f3'

const useStyles = makeStyles({
  thumb: {
    flexShrink: 0,
    backgroundColor: '#fff',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    position: 'relative',
    overflow: 'hidden',
  },
  body: { display: 'grid', alignContent: 'start' },
  free: { color: '#888', textAlign: 'center' },
})

/** 一覧で使う、見取り図の基準の幅 */
const BASE_WIDTH = 84

/**
 * メールの構成の見取り図。ヘッダー、お知らせ帯、ヒーロー(ヘッドラインの見せ方・ボタン)、各セクション、フッターを、
 * 実際のメールに近い縦横比で描く(縦長になる)。free は、自由な並びを示す。
 * width で大きく描ける(管理画面のプレビュー用)。
 * CSS の zoom ではなく寸法を掛け算するのは、zoom だと枠の幅の計算がずれるため
 */
function Thumb({ layout, free = false, width = BASE_WIDTH }: { layout: TemplateLayout; free?: boolean; width?: number }) {
  const s = useStyles()
  const t = useT()
  const k = width / BASE_WIDTH
  const px = (n: number) => Math.max(1, Math.round(n * k))
  const offer = layout.hero === 'offer'
  const heroText = layout.heroText ?? 'band'

  const line = (w: string, h = 2, color = LINE) => <div style={{ height: px(h), width: w, margin: '0 auto', background: color }} />
  // ボタンの部品。1 つの部品のボタンを横に並べる(塗り / 枠線は、ボタンごと)
  const blocks = placedButtons(layout)
  const pills = (buttons: ButtonSpec[], key: number) => (
    <div key={key} style={{ display: 'grid', gridTemplateColumns: `repeat(${buttons.length}, 1fr)`, gap: px(3), padding: `${px(1)}px ${px(buttons.length === 1 ? 24 : 8)}px` }}>
      {buttons.map((b) => (
        <div key={b.id} style={{ height: px(5), borderRadius: 99, background: b.style === 'outline' ? '#fff' : offer ? RED : '#222', border: b.style === 'outline' ? '1px solid #222' : 'none' }} />
      ))}
    </div>
  )
  const pillsAt = (at: number) => buttonsAt(blocks, at, layout.sections.length).map(pills)
  // 名前・価格の 2 行(価格は、セールのヒーローのとき赤)
  const caption = (color = LINE) => (
    <div style={{ display: 'grid', gap: px(1), paddingTop: px(1) }}>
      <div style={{ height: px(1.5), width: '80%', background: color }} />
      <div style={{ height: px(1.5), width: '40%', background: offer ? RED : color }} />
    </div>
  )

  // ---- ヒーロー
  const heroBg = HERO_COLOR[layout.hero]
  // 写真の形を選んでいれば、その形(T8 の 8.6)
  const heroAspect = (fallback: string) => (layout.heroStyle?.ratio ? String(ratioValue(layout.heroStyle.ratio)) : fallback)
  const hero =
    heroText === 'overlay' ? (
      <>
        <div style={{ aspectRatio: heroAspect('4 / 5'), background: heroBg, display: 'grid', alignContent: 'center', gap: px(3) }}>
          {line('70%', 4, '#fff')}
          {line('50%', 4, '#fff')}
        </div>
        {line('70%')}
      </>
    ) : heroText === 'below' ? (
      <>
        <div style={{ aspectRatio: heroAspect('1 / 1'), background: heroBg }} />
        {line('55%', 3, INK)}
        {line('70%')}
      </>
    ) : (
      <div style={{ aspectRatio: heroAspect('8 / 3'), background: heroBg, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%', background: 'rgba(0,0,0,0.28)', display: 'grid', alignContent: 'center', paddingLeft: px(4) }}>
          <div style={{ height: px(2), width: '50%', background: '#fff' }} />
        </div>
      </div>
    )

  // ---- セクション(商品の枠の形)
  const section = (sec: Section, i: number) => {
    const n = gridColumns(sec)
    const slots = Array.from({ length: sec.slots }, (_, j) => j)
    let body: React.ReactNode
    switch (sec.kind) {
      case 'photos':
        body = (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: px(1) }}>
            {slots.map((j) => (
              <div key={j} style={{ aspectRatio: '4 / 5', background: TILE }} />
            ))}
          </div>
        )
        break
      case 'wide':
        body = slots.map((j) => (
          <div key={j} style={{ aspectRatio: '1 / 1', background: IMG, display: 'grid', alignContent: 'end', padding: px(3) }}>
            {caption('#fff')}
          </div>
        ))
        break
      case 'cells': {
        // 箱: 1 マスは正方形(説明を並べる見せ方は、横長の行)。見せ方ごとに、写真・名前・説明の線を描く
        const cols = sec.cols ?? 2
        const rows = Math.max(1, cellRows(sec.cells ?? []))
        const text = isTextView(sec.view)
        const lines = (
          <div style={{ display: 'grid', alignContent: 'center', gap: px(1.5), padding: px(2) }}>
            <div style={{ height: px(2), width: '80%', background: INK }} />
            <div style={{ height: px(1.5), width: '90%', background: LINE }} />
            <div style={{ height: px(1.5), width: '40%', background: offer ? RED : LINE }} />
          </div>
        )
        body = (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: px(2), aspectRatio: text ? `${cols * 2} / ${rows}` : `${cols} / ${rows}` }}>
            {(sec.cells ?? []).map((x, j) => (
              <div key={j} style={{ gridColumn: `${x.c + 1} / span ${x.w}`, gridRow: `${x.r + 1} / span ${x.h}`, minHeight: 0, display: 'grid', ...(text ? { gridTemplateColumns: '1fr 1fr', background: PANEL } : { background: x.w * x.h > 1 ? IMG : TILE, alignContent: 'end' }) }}>
                {text ? (
                  sec.view === 'story' && j % 2 === 1 ? (
                    <>
                      <div style={{ background: IMG }} />
                      {lines}
                    </>
                  ) : (
                    <>
                      {sec.view === 'story' ? lines : <div style={{ background: TILE }} />}
                      {sec.view === 'story' ? <div style={{ background: IMG }} /> : lines}
                    </>
                  )
                ) : (
                  sec.view !== 'photo' && <div style={{ padding: px(2), background: 'rgba(255,255,255,0.85)' }}>{caption()}</div>
                )}
              </div>
            ))}
          </div>
        )
        break
      }
      case 'table': {
        // 表: 部品をマスの位置に描く。行の高さは、その行の部品で決める(写真の箱は正方形、文を並べる箱は横長、ボタン・テキストは低く)
        const cols = sec.cols ?? 1
        const rows = sec.rows ?? 0
        const parts = sec.parts ?? []
        const inner = width - px(6)
        const colW = (inner - (cols - 1) * px(2)) / cols
        const rowH = Array.from({ length: rows }, (_, r) => {
          const on = parts.filter((p) => r >= p.r && r < p.r + p.h)
          // 画像・動画は、選んだ形の高さ(省略は横に広い 2:1)
          const media = on.filter((p) => p.type === 'media' && p.h === 1).map((p) => (p.w * colW) / ratioValue(p.ratio ?? 'wide'))
          if (media.length > 0) return Math.max(...media)
          if (on.some((p) => p.type === 'box' && p.h === 1 && !isTextView(p.view))) return colW
          if (on.some((p) => p.type === 'box' && isTextView(p.view))) return Math.max(colW * 0.6, inner * 0.3)
          if (on.some((p) => p.type === 'box')) return colW * 0.8
          if (on.some((p) => p.type === 'text')) return px(10)
          if (on.some((p) => p.type === 'button')) return px(8)
          return px(5)
        })
        const lines = (
          <div style={{ display: 'grid', alignContent: 'center', gap: px(1.5), padding: px(2) }}>
            <div style={{ height: px(2), width: '80%', background: INK }} />
            <div style={{ height: px(1.5), width: '90%', background: LINE }} />
            <div style={{ height: px(1.5), width: '40%', background: offer ? RED : LINE }} />
          </div>
        )
        // 部品を 1 つ描く(area: 置く場所。均等に並べる行では、帯の中に順に並べるので、場所は持たない)
        const draw = (p: (typeof parts)[number], place: React.CSSProperties = {}) => {
              const area = { ...place, minHeight: 0, minWidth: 0 }
              if (p.type === 'box') {
                if (isTextView(p.view)) {
                  return (
                    <div key={p.id} style={{ ...area, display: 'grid', gridTemplateColumns: '1fr 1fr', background: PANEL }}>
                      <div style={{ background: IMG }} />
                      {lines}
                    </div>
                  )
                }
                return (
                  <div key={p.id} style={{ ...area, position: 'relative', display: 'grid', alignContent: 'end', background: p.w * p.h > 1 ? IMG : TILE }}>
                    {/* 箱の「出すもの」: バッジは左上の小さな印、名前・価格は下の帯 */}
                    {boxFields(p).includes('badge') && <div style={{ position: 'absolute', top: px(2), left: px(2), width: px(8), height: px(3), background: p.priceStyle === 'sale' ? RED : INK }} />}
                    {(boxFields(p).includes('name') || boxFields(p).includes('price')) && <div style={{ padding: px(2), background: 'rgba(255,255,255,0.85)' }}>{caption()}</div>}
                  </div>
                )
              }
              if (p.type === 'button') {
                return (
                  <div key={p.id} style={{ ...area, display: 'grid', alignContent: 'center', padding: `0 ${p.w === cols && cols > 1 ? '20%' : px(2) + 'px'}` }}>
                    {/* 文字のリンクは、細い線だけ(枠のない文字) */}
                    {p.style === 'text' ? (
                      <div style={{ height: px(1.5), width: '50%', justifySelf: 'center', background: buttonColor(p, offer) }} />
                    ) : (
                      <div style={{ height: px(5), borderRadius: 99, background: p.style === 'outline' ? '#fff' : buttonColor(p, offer), border: p.style === 'outline' ? `1px solid ${buttonColor(p, offer)}` : 'none' }} />
                    )}
                  </div>
                )
              }
              if (p.type === 'text') {
                return (
                  <div key={p.id} style={{ ...area, display: 'grid', alignContent: 'center', gap: px(1.5) }}>
                    <div style={{ height: px(1.5), width: '90%', background: LINE }} />
                    <div style={{ height: px(1.5), width: '70%', background: LINE }} />
                  </div>
                )
              }
              if (p.type === 'media') {
                return (
                  <div key={p.id} style={{ ...area, display: 'grid', placeItems: 'center', background: p.src ? `center / cover no-repeat url("${p.src.replace(/"/g, '%22')}")` : IMG }}>
                    {p.video && <div style={{ width: px(6), height: px(6), borderRadius: '50%', background: 'rgba(0,0,0,0.55)' }} />}
                  </div>
                )
              }
              return <div key={p.id} style={area} />
        }
        // 均等に並べる行は、行いっぱいの帯の中で、中身のある部品を同じ幅で並べる
        const even = sec.evenRows ?? []
        body = (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: rowH.map((h) => `${Math.round(h)}px`).join(' '), gap: px(2) }}>
            {parts.filter((p) => !even.includes(p.r)).map((p) => draw(p, { gridColumn: `${p.c + 1} / span ${p.w}`, gridRow: `${p.r + 1} / span ${p.h}` }))}
            {even.map((r) => {
              const row = parts.filter((p) => p.r === r && p.type !== 'empty').sort((a, b) => a.c - b.c)
              return (
                <div key={`even${r}`} style={{ gridColumn: '1 / -1', gridRow: r + 1, display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, row.length)}, 1fr)`, gap: px(2) }}>
                  {row.map((p) => draw(p))}
                </div>
              )
            })}
          </div>
        )
        break
      }
      case 'mosaic': {
        // 3 点で 1 組。大きい 1 点が、縦 2 行分を使う
        const groups = Array.from({ length: Math.ceil(sec.slots / 3) }, (_, g) => g)
        body = groups.map((g) => (
          <div key={g} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: px(2), aspectRatio: '1 / 1' }}>
            <div style={{ background: IMG, gridRow: '1 / 3', gridColumn: sec.flip ? 2 : 1 }} />
            <div style={{ background: TILE, gridColumn: sec.flip ? 1 : 2, gridRow: 1 }} />
            <div style={{ background: TILE, gridColumn: sec.flip ? 1 : 2, gridRow: 2 }} />
          </div>
        ))
        break
      }
      case 'story':
        // 1 点ごとに、写真と文の左右を入れ替える
        body = slots.map((j) => {
          const text = (
            <div style={{ display: 'grid', alignContent: 'center', gap: px(1.5), padding: px(3) }}>
              <div style={{ height: px(1.5), width: '45%', background: LINE }} />
              <div style={{ height: px(2), width: '85%', background: INK }} />
              <div style={{ height: px(1.5), width: '35%', background: offer ? RED : LINE }} />
              <div style={{ height: px(1.5), width: '90%', background: '#c7ccd4', marginTop: px(2) }} />
              <div style={{ height: px(1.5), width: '70%', background: '#c7ccd4' }} />
            </div>
          )
          const img = <div style={{ aspectRatio: '3 / 4', background: IMG }} />
          return (
            <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: PANEL }}>
              {j % 2 === 0 ? (
                <>
                  {text}
                  {img}
                </>
              ) : (
                <>
                  {img}
                  {text}
                </>
              )}
            </div>
          )
        })
        break
      case 'feature':
        body = slots.map((j) => (
          <div key={j} style={{ display: 'grid', gridTemplateColumns: '44% 1fr', gap: px(3), alignItems: 'center' }}>
            <div style={{ aspectRatio: '3 / 4', background: TILE }} />
            <div style={{ display: 'grid', gap: px(1.5) }}>
              <div style={{ height: px(2), width: '80%', background: INK }} />
              <div style={{ height: px(1.5), width: '90%', background: LINE }} />
              <div style={{ height: px(1.5), width: '40%', background: offer ? RED : LINE }} />
            </div>
          </div>
        ))
        break
      default:
        body = (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: px(2) }}>
            {slots.map((j) => (
              <div key={j}>
                <div style={{ aspectRatio: '3 / 4', background: TILE }} />
                {caption()}
              </div>
            ))}
          </div>
        )
    }
    return (
      <div key={i} style={{ display: 'grid', gap: px(2), paddingTop: px(3), ...(sec.bg ? { background: SECTION_BG[sec.bg], padding: px(2) } : {}), ...(sec.divider ? { borderTop: `1px solid ${LINE}` } : {}) }}>
        {sec.categoryHeading && line('40%', 2.5, INK)}
        {sec.copy !== false && line('55%', 1.5, '#c7ccd4')}
        {body}
        {pillsAt(i + 1)}
      </div>
    )
  }

  return (
    <div className={s.thumb} style={{ width }}>
      <div className={s.body} style={{ padding: px(3), rowGap: px(3) }}>
        <div style={{ height: px(5), background: '#222' }} />
        {layout.topBar && <div style={{ height: px(4), background: '#555' }} />}
        {hero}
        {pillsAt(0)}
        {/* ヒーローのすぐ下の表(セクションの番号には数えない。番号 -2 で、セクションの後のボタンを重ねない) */}
        {layout.heroTable && (layout.heroTable.parts ?? []).some((p) => p.type !== 'empty') && section(layout.heroTable, -2)}
        {free ? (
          // 見出し + 2 列のまとまりが続き、いくつでも足せる(点線の枠)ことを描く
          <>
            {section({ kind: 'grid', slots: 2, categoryHeading: true, copy: false }, 0)}
            {section({ kind: 'grid', slots: 4, categoryHeading: true, copy: false }, 1)}
            <div className={s.free} style={{ fontSize: px(7), padding: px(2), border: '1px dashed #bbb', borderRadius: 2 }}>{t('＋ いくつでも', '+ any number')}</div>
          </>
        ) : (
          layout.sections.map(section)
        )}
        <div style={{ height: px(12), background: PANEL, marginTop: px(4) }} />
      </div>
    </div>
  )
}

/** 全体が、高さ maxHeight に収まるように、縮小して描く(切り取らない)。縮小は transform(寸法は、縮小後の大きさで確保する) */
function FitThumb({ layout, free, width, maxHeight }: { layout: TemplateLayout; free: boolean; width: number; maxHeight: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState(0)
  useLayoutEffect(() => {
    if (ref.current) setNatural(ref.current.offsetHeight)
  }, [layout, free, width])
  const scale = natural > 0 ? Math.min(1, maxHeight / natural) : 1
  return (
    <div style={{ flexShrink: 0, width: Math.round(width * scale), height: natural > 0 ? Math.round(natural * scale) : undefined }}>
      <div ref={ref} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <Thumb layout={layout} free={free} width={width} />
      </div>
    </div>
  )
}

/**
 * メールの構成の見取り図。maxHeight を指定すると(一覧用)、全体が、その高さに収まるように縮小して見せる。
 * zoom を付けると、マウスを重ねたときに、大きい見取り図を、横に表示する。
 */
export function TemplateThumb({ layout, free = false, width = BASE_WIDTH, maxHeight, zoom = false }: { layout: TemplateLayout; free?: boolean; width?: number; maxHeight?: number; zoom?: boolean }) {
  const small = maxHeight ? <FitThumb layout={layout} free={free} width={width} maxHeight={maxHeight} /> : <Thumb layout={layout} free={free} width={width} />
  if (!zoom) return small
  return (
    <Tooltip
      relationship="description"
      positioning="after"
      showDelay={150}
      hideDelay={0}
      withArrow
      content={{ children: <FitThumb layout={layout} free={free} width={190} maxHeight={560} />, style: { maxWidth: 'none', padding: 6 } }}
    >
      <div style={{ flexShrink: 0 }}>{small}</div>
    </Tooltip>
  )
}
