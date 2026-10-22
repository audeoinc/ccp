import { useCallback, useRef, useState } from 'react'

/** 戻せる回数の上限(開いている間だけの履歴なので、多くは持たない) */
const LIMIT = 30

/**
 * 元に戻すの履歴(SU1 ⑫)。反映(保存)のたびに、その前の中身を積む。配信カードを開いている間だけ持つ
 * (閉じたあとは、変更の記録 change_logs で見る)
 */
export function useUndo<T>() {
  const stack = useRef<T[]>([])
  // 履歴の中身は ref に持ち、描画には件数だけを使う(取り出した値を、その場で使えるように)
  const [size, setSize] = useState(0)
  const push = useCallback((v: T) => {
    stack.current = [...stack.current.slice(-(LIMIT - 1)), v]
    setSize(stack.current.length)
  }, [])
  const pop = useCallback((): T | undefined => {
    const v = stack.current[stack.current.length - 1]
    stack.current = stack.current.slice(0, -1)
    setSize(stack.current.length)
    return v
  }, [])
  return { canUndo: size > 0, push, pop }
}
