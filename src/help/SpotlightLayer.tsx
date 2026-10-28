// スポットライトの層(X83)。光らせる名前(spotlight.ts)に当たる部品に、脈打つ枠を重ねる。
// 画面を移った直後は部品がまだ出ていないことがあるので、少しのあいだ探し直す。しばらくたつか、どこかを押すと消える
import { useEffect, useState } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { useT } from '../i18n'
import { Z } from '../layers'
import { getUiScale } from '../uiScale'
import { findByNames, setSpotlight, useSpotlight } from './spotlight'

// 光らせておく長さ(ms)と、見つかるまで探し直す長さ
const SHOW_MS = 8000
const SEARCH_MS = 3000

const useStyles = makeStyles({
  layer: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: Z.spotlight },
  ring: {
    position: 'absolute',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusMedium,
    border: `2px solid ${tokens.colorPaletteMarigoldBorderActive}`,
    boxShadow: `0 0 0 4px ${tokens.colorPaletteMarigoldBackground2}`,
    animationName: {
      '0%': { boxShadow: `0 0 0 2px ${tokens.colorPaletteMarigoldBackground2}` },
      '50%': { boxShadow: `0 0 0 8px ${tokens.colorPaletteMarigoldBackground2}` },
      '100%': { boxShadow: `0 0 0 2px ${tokens.colorPaletteMarigoldBackground2}` },
    },
    animationDuration: '1.2s',
    animationIterationCount: 'infinite',
  },
  note: {
    position: 'absolute',
    left: '50%',
    bottom: '24px',
    transform: 'translateX(-50%)',
    padding: '6px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackgroundInverted,
    color: tokens.colorNeutralForegroundInverted,
    fontSize: tokens.fontSizeBase200,
    boxShadow: tokens.shadow8,
  },
})

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** 「？ 聞く」のフロートの中は光らせない(答えの文字に当たってしまうため) */
const inHelp = (el: Element) => !!el.closest('[data-help-float]')

export function SpotlightLayer() {
  const s = useStyles()
  const t = useT()
  const { names, version } = useSpotlight()
  const [boxes, setBoxes] = useState<Box[]>([])
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (names.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBoxes([])
      setMissing(false)
      return
    }
    const started = Date.now()
    let found = false
    // 位置はスクロール・画面の移り変わりで変わるので、光らせているあいだは測り直す。表示の大きさ(zoom)で割って、層の中の位置にする
    const update = () => {
      const z = getUiScale() || 1
      const next = findByNames(names, inHelp).map((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left / z - 4, top: r.top / z - 4, width: r.width / z + 8, height: r.height / z + 8 }
      })
      if (next.length && !found) {
        found = true
        findByNames(names, inHelp)[0]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      }
      setBoxes((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
      setMissing(!found && Date.now() - started > SEARCH_MS)
    }
    update()
    const timer = window.setInterval(update, 250)
    const end = window.setTimeout(() => setSpotlight([]), SHOW_MS)
    // どこかを押したら消す(押したのが光らせた部品でも。押せば、もう見つけているため)。押した直後の「画面で示す」の押下では消さない
    const arm = window.setTimeout(() => window.addEventListener('pointerdown', stop, true), 300)
    function stop() {
      setSpotlight([])
    }
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(end)
      window.clearTimeout(arm)
      window.removeEventListener('pointerdown', stop, true)
    }
  }, [names, version])

  if (names.length === 0) return null
  return (
    <div className={s.layer} aria-hidden>
      {boxes.map((b, i) => (
        <div key={i} className={s.ring} style={b} />
      ))}
      {missing && boxes.length === 0 && <div className={s.note}>{t('この画面には、答えのボタン・欄が見つかりませんでした', 'The buttons or fields in the answer were not found on this screen')}</div>}
    </div>
  )
}
