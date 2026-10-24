import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Caption1, Slider, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, SubtractRegular } from '@fluentui/react-icons'
import { loadPref, savePref } from './settings'
import { useT } from './i18n'
import { PREF } from './prefKeys'

// 配信カードのプレビューと同じ範囲・同じ既定(全体)。操作をそろえる(2026-10-19、利用者の要望)
const ZOOM_MIN = 0.15
const ZOOM_MAX = 1.2
const ZOOM_KEY = PREF.productionPreviewZoom

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, rowGap: '4px' },
  bar: { display: 'flex', alignItems: 'center', columnGap: '2px', minWidth: 0 },
  heading: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  slider: { width: '80px', minWidth: 0 },
  label: { width: '34px', textAlign: 'right' },
  frame: { flexGrow: 1, minHeight: 0, width: '100%', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1 },
})

function loadZoom(): number | 'fit' {
  const v = loadPref<unknown>(ZOOM_KEY, 'fit')
  if (v === 'fit') return 'fit'
  return typeof v === 'number' && v >= ZOOM_MIN && v <= ZOOM_MAX ? v : 'fit'
}

/**
 * HTML をアプリの画面と切り離した枠(iframe)で描き、縮小・拡大と「全体」(枠に収める)を付ける。
 * 倍率は枠の中の文書に zoom を掛ける(枠の外から測るので、sandbox は allow-same-origin だけ。HTML の中のスクリプトは動かない)
 */
/** heading は、操作と同じ行の左に出す見出し(ペインの見出しの行を 1 行にまとめる)。onFrame は、枠(iframe)を外へ渡す(制作のページのピンが、枠の中に印を足すため) */
export function HtmlPreviewFrame({ html, title, heading, headingClassName, onFrame }: { html: string; title: string; heading?: ReactNode; headingClassName?: string; onFrame?: (el: HTMLIFrameElement | null) => void }) {
  const s = useStyles()
  const t = useT()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [zoom, setZoomState] = useState<number | 'fit'>(loadZoom)
  const [fitZoom, setFitZoom] = useState(1)
  const setZoom = (z: number | 'fit') => {
    savePref(ZOOM_KEY, z)
    setZoomState(z)
  }

  // 倍率を掛け直す。「全体」は、倍率 1 での幅・高さを測り、枠に収まる倍率にする
  const apply = useCallback(() => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!frame || !doc?.documentElement) return
    const root = doc.documentElement
    if (zoom !== 'fit') {
      root.style.zoom = String(zoom)
      return
    }
    root.style.zoom = '1'
    const h = root.scrollHeight
    // メールは中央の決まった幅の箱なので、その箱の幅で測る(枠いっぱいに広がる本文の幅で測ると、縮まない)
    const first = doc.body?.firstElementChild as HTMLElement | null
    const w = Math.max(first?.offsetWidth ?? 0, 1)
    const byHeight = h > 0 ? (frame.clientHeight - 8) / h : 1
    const byWidth = (frame.clientWidth - 8) / w
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, byHeight, byWidth))
    root.style.zoom = String(z)
    setFitZoom(z)
  }, [zoom])

  // 倍率を変えたとき・枠の大きさが変わったとき(HTML が変わったときは、読み込み直しの onLoad で掛け直す)
  useEffect(() => {
    apply()
    const frame = frameRef.current
    if (!frame) return
    const ro = new ResizeObserver(apply)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [apply])

  useEffect(() => {
    onFrame?.(frameRef.current)
    return () => onFrame?.(null)
  }, [onFrame])

  const shown = zoom === 'fit' ? fitZoom : zoom
  const step = (d: number) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((shown + d) * 20) / 20)))

  return (
    <div className={s.root}>
      <div className={s.bar}>
        <span className={mergeClasses(headingClassName, s.heading)}>{heading}</span>
        <Button size="small" appearance="subtle" icon={<SubtractRegular />} onClick={() => step(-0.1)} aria-label={t('縮小', 'Zoom out')} />
        <Slider
          size="small"
          className={s.slider}
          min={ZOOM_MIN * 100}
          max={ZOOM_MAX * 100}
          step={5}
          value={Math.round(shown * 100)}
          onChange={(_, d) => setZoom(d.value / 100)}
          aria-label={t('プレビューの倍率', 'Preview zoom')}
        />
        <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => step(0.1)} aria-label={t('拡大', 'Zoom in')} />
        <Caption1 className={s.label}>{Math.round(shown * 100)}%</Caption1>
        {/* 配信カードと同じく、ボタンの文字は押したときの動き(全体表示のときは「100%」で戻る) */}
        <Button
          size="small"
          appearance={zoom === 'fit' ? 'primary' : 'outline'}
          onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')}
          aria-label={zoom === 'fit' ? t('100% の倍率に戻す', 'Reset to 100%') : t('メール全体を表示', 'Fit the whole email')}
        >
          {zoom === 'fit' ? '100%' : t('全体', 'Fit')}
        </Button>
      </div>
      <iframe ref={frameRef} className={s.frame} title={title} sandbox="allow-same-origin" srcDoc={html} onLoad={apply} />
    </div>
  )
}
