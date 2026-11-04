// 面の左のバーで開く欄(1 つだけ開く。開いている欄をもう一度押すとしまう)。計画・制作・結果の 3 つの面で同じ形(optimize-survey の 2 章。2026-11-02)。
// しまっている間も、最後に開いた欄の中身を描いておく(しまう動きの間に、中身が先に消えないように = panel)。
// moving は、開け閉めの動きの間(260ms)だけ true。面の枠(StageFrame)に渡すと、その間はプレビューの倍率を合わせ直さない
import { useState } from 'react'

export function useSidePanel<S extends string>(initial: S | null, fallback: S) {
  const [side, setSide] = useState<S | null>(initial)
  const [lastSide, setLastSide] = useState<S>(initial ?? fallback)
  const [moving, setMoving] = useState(false)
  /** 欄を開く(open: 必ず開く。省略は、開いている欄を押したらしまう)。開いた欄(しまったら null)を返す */
  const show = (v: S, open = false): S | null => {
    const next = !open && side === v ? null : v
    setSide(next)
    if (next) setLastSide(next)
    if (next !== side) {
      setMoving(true)
      window.setTimeout(() => setMoving(false), 260)
    }
    return next
  }
  return { side, setSide, lastSide, panel: side ?? lastSide, moving, show }
}
