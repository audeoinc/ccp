import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * いつも同じ関数を返し、呼ばれたときは、最後の描画の f を呼ぶ。
 * memo にした部品(Preview など)に渡す関数を、描き直しのたびに作り直さないため(作り直すと、memo が効かずに描き直される)。
 * 描画の途中では呼ばない(押した・落としたなどの、出来事の中で呼ぶ)
 */
export function useStableCallback<A extends unknown[], R>(f: (...args: A) => R): (...args: A) => R {
  const ref = useRef(f)
  useLayoutEffect(() => {
    ref.current = f
  })
  return useCallback((...args: A) => ref.current(...args), [])
}
