// テンプレートの「使える国」(ST1)。設定の画面(ST10)の「国」→「使うテンプレート」の中身。
// テンプレートは共通で 1 つ持ち(国ごとに写しを作らない)、どの国で使うかだけを国の適用の表(ST7)に持つ。
// テンプレートの編集の画面には手を入れず、国の設定の側に置く(見た目の中身ではないので、変えても新しい版を作らない)。
// 使わないにしても、その国ですでに使った配信は、版の中身で描くので崩れない。選択肢から消えるだけ。
// 見本の縮小を並べて、実物を見ながら決める(ST10。縮小は配信カードのテンプレートの選び方と同じ。マウスを乗せると大きく見える)
import { CountryApplyList } from './CountryApplyList'
import { PushThumb } from './PushThumb'
import { TemplateThumb } from './TemplateThumb'
import { templateOptions, useTemplates } from './templates'
import { useT } from './i18n'

interface Props {
  /** 国のコード(設定の画面で決まっている) */
  country: string
  countryName: string
}

export function CountryTemplatesPanel({ country, countryName }: Props) {
  const t = useT()
  useTemplates()
  // 使わない(無効)のテンプレートは、どの国でも出ないので並べない
  const items = [
    ...templateOptions('email').map((o) => ({ id: o.id, label: o.label, description: o.description, group: t('メール', 'Email'), thumb: <TemplateThumb layout={o} free={o.id === 'free'} maxHeight={170} zoom /> })),
    ...templateOptions('push').map((o) => ({ id: o.id, label: o.label, description: o.description, group: t('アプリ', 'App'), thumb: o.push ? <PushThumb spec={o.push} width={110} /> : <TemplateThumb layout={o} maxHeight={170} zoom /> })),
  ]
  return <CountryApplyList key={country} kind="template" country={country} countryName={countryName} items={items} />
}
