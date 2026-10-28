// 引き出し(ChooseDrawer)を閉じる関数を、中の帯(TrialBar)へ渡す。
// 「確定」したら引き出しを閉じる、を部品ごとに書かず 1 か所にするため(2026-10-29 利用者: このパーツを使っている所すべてで共通の動きに)。
// 「やめる」では閉じない(別の候補を続けて試せるように)
import { createContext } from 'react'

export const DrawerCloseContext = createContext<(() => void) | null>(null)
