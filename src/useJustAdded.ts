// 足した行の印と並び(2026-10-23 利用者と決めた画面の部品の決まり 1。見出しの「＋ ○○を足す」は ListHeader)。
// 足した行は、一覧のいちばん上に出し、少しのあいだ印を付ける(どこに入ったかを探さなくてよいように)。
// 名前の順・期日の順などで並ぶ一覧も、並びは変えず、この画面を開いている間に足した行だけを上に出す(閉じて開き直すと、いつもの並びに戻る)
import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'

/** 印を付けておく長さ */
const FRESH_MS = 4000

const useStyles = makeStyles({
  // 左に色の帯を付け、背景をひと呼吸だけ色づけてから戻す
  fresh: {
    boxShadow: `inset 3px 0 0 ${tokens.colorBrandStroke1}`,
    animationName: {
      from: { backgroundColor: tokens.colorBrandBackground2 },
      to: { backgroundColor: 'transparent' },
    },
    animationDuration: `${FRESH_MS}ms`,
    animationTimingFunction: 'ease-in',
    '@media (prefers-reduced-motion: reduce)': { animationName: 'none' },
  },
})

export function useJustAdded() {
  const s = useStyles()
  // 足した順(新しいものが先)
  const [added, setAdded] = useState<string[]>([])
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  /** 足した行の id を知らせる(いくつでも) */
  const mark = useCallback((...ids: (string | undefined | null)[]) => {
    const list = ids.filter((x): x is string => !!x)
    if (!list.length) return
    setAdded((a) => [...list.reverse(), ...a.filter((x) => !list.includes(x))])
    setFresh((f) => new Set([...f, ...list]))
    timers.current.push(
      window.setTimeout(() =>
        setFresh((f) => {
          const next = new Set(f)
          list.forEach((x) => next.delete(x))
          return next
        }),
      FRESH_MS),
    )
  }, [])

  /** いつもの並びに戻す(閉じても消えずに残る画面で、開き直したとき) */
  const clear = useCallback(() => {
    setAdded([])
    setFresh(new Set())
  }, [])

  /** 一覧の並びはそのままに、足した行だけを上に出す */
  const order = <T>(list: T[], idOf: (x: T) => string): T[] => {
    if (!added.length) return list
    const byId = new Map(list.map((x) => [idOf(x), x]))
    const top = added.map((id) => byId.get(id)).filter((x): x is T => x !== undefined)
    return [...top, ...list.filter((x) => !added.includes(idOf(x)))]
  }

  /** 足したばかりの行に付ける class(印が消えたら undefined) */
  const freshClass = (id: string) => (fresh.has(id) ? s.fresh : undefined)

  return { mark, clear, order, freshClass }
}
