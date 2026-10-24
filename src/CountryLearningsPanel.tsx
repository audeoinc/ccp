// この国で使う学び(ST5)。設定の画面(ST10)の「国」→「使う学び」の中身。
// 学び(過去の配信の「次に生かすメモ」)は共通で 1 つ持ち、どの国で使うかだけを国の適用の表(ST7)に持つ。
// 出元の国では、決めていなければ使う。ほかの国では、決めていなければ使わない(国で客層が違うので、黙って全部の国に効かせない)。
// 配信カードの「これまでの学び」でも、ほかの国の学びを 1 件ずつ決められる。ここは、まとめて見直す所
import { useEffect, useMemo, useState } from 'react'
import { MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { CountryApplyList } from './CountryApplyList'
import { countryOptions } from './status'
import { locale, optionLabel, useT } from './i18n'

const useStyles = makeStyles({
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
})

interface Props {
  /** 国のコード(設定の画面で決まっている) */
  country: string
  countryName: string
  /** すべての配信(学びの出元の国・名前を引く) */
  cards: DeliveryCard[]
}

export function CountryLearningsPanel({ country, countryName, cards }: Props) {
  const s = useStyles()
  const t = useT()
  const nameOf = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code
  const [results, setResults] = useState<DeliveryResult[] | null>(null)
  // 読めなかったとき(サーバーが混んでいるときなど)は、「学びがない」と見分けがつくように、そう出す
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    DeliveryResultsService.getAll()
      .then((r) => {
        setError(r.success ? null : (r.error?.message ?? 'error'))
        if (r.success) setResults(r.data ?? [])
      })
      .catch((e: unknown) => setError(String(e)))
  }, [])

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  // 学び = メモのある配信結果。この国の学びを先に、ほかの国の学びは国ごとにまとめる(新しい順)
  const learnings = useMemo(
    () =>
      (results ?? [])
        .filter((r) => r.notes?.trim() && r.delivery_card_id && byId.has(r.delivery_card_id))
        .map((r) => {
          const c = byId.get(r.delivery_card_id!)!
          return { id: r.id, origin: String(c.country ?? ''), name: c.name ?? '', at: r.sent_at ?? c.scheduled_at ?? '', notes: r.notes!.trim() }
        })
        .sort((a, b) => Number(b.origin === country) - Number(a.origin === country) || a.origin.localeCompare(b.origin) || b.at.localeCompare(a.at)),
    [results, byId, country],
  )
  const originOf = new Map(learnings.map((l) => [l.id, l.origin]))
  const items = learnings.map((l) => ({
    id: l.id,
    label: `${l.at ? new Date(l.at).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : ''} ${l.name}`.trim(),
    description: l.notes.replace(/\n/g, ' / '),
    group: l.origin === country ? t('この国の学び', 'Learnings from this country') : t(`${nameOf(l.origin)}の学び`, `Learnings from ${nameOf(l.origin)}`),
  }))

  if (error)
    return (
      <MessageBar intent="error" layout="multiline">
        <MessageBarBody>{t(`学びを読めませんでした。ほかの項目を開いてから、開き直してください(${error})`, `Could not load the learnings. Open another item and come back (${error})`)}</MessageBarBody>
      </MessageBar>
    )
  if (results === null) return <Spinner size="small" />
  if (items.length === 0) return <span className={s.note}>{t('学び(結果の「次に生かすメモ」)はまだありません', 'No learnings (notes for next time) yet.')}</span>
  return <CountryApplyList key={country} kind="learning" country={country} countryName={countryName} items={items} defaultUse={(id) => originOf.get(id) === country} />
}
