// 差出人の名前(設定の画面で、全社の既定と国の上書きを決める。ST10)。設定を読み直したら描き直す。
// 大きい画面の部品の中で設定の変わりを受け取らなくてよいように、名前の所だけをこの部品にする
import { brandFor, useCountrySettings } from './countrySettings'

export function SenderName({ country, initial = false }: { country?: string | null; /** 頭の 1 文字だけ(アプリのアイコン) */ initial?: boolean }) {
  useCountrySettings()
  const name = brandFor(country).senderName
  return <>{initial ? name.slice(0, 1).toUpperCase() : name}</>
}
