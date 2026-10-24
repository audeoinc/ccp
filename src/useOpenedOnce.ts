import { useState } from 'react'

/**
 * 一度でも開いたか。閉じている窓を、開くまでは描かないために使う(整理 第2段 ③)。
 * 一度開いたら、閉じても描いたままにする(窓の中の状態(選んだタブなど)と、閉じるときの動きを、これまでと同じにするため)
 */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open)
  // 描いている途中に覚える(React の「前の値から状態を決める」書き方。効果を待たずに、その回から描く)
  if (open && !opened) setOpened(true)
  return opened || open
}
