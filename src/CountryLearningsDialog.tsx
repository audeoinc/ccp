// この国で使う学び(ST5)。⚙ →「国」→「この国で使う学び」で開く。
// 学び(過去の配信の「次に生かすメモ」)は共通で 1 つ持ち、どの国で使うかだけを国の適用の表(ST7)に持つ。
// 出元の国では、決めていなければ使う。ほかの国では、決めていなければ使わない(国で客層が違うので、黙って全部の国に効かせない)。
// 配信カードの「これまでの学び」でも、ほかの国の学びを 1 件ずつ決められる。ここは、まとめて見直す所
import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, Button, Select, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { CountryApplyList } from './CountryApplyList'
import { ResizableSurface } from './ResizableSurface'
import { countryOptions } from './status'
import { locale, optionLabel, useT } from './i18n'

const useStyles = makeStyles({
  body: { display: 'grid', rowGap: '14px' },
  row: { display: 'flex', alignItems: 'center', gap: '8px' },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
})

interface Props {
  open: boolean
  onClose: () => void
  /** ヘッダーで選んでいる国(「すべての国」のときは空。画面の中で選ぶ) */
  country: string
  /** すべての配信(学びの出元の国・名前を引く) */
  cards: DeliveryCard[]
}

export function CountryLearningsDialog({ open, onClose, country: headerCountry, cards }: Props) {
  const s = useStyles()
  const t = useT()
  const [picked, setPicked] = useState(String(countryOptions[0]?.value ?? ''))
  const country = headerCountry || picked
  const nameOf = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code
  const [results, setResults] = useState<DeliveryResult[] | null>(null)
  useEffect(() => {
    if (!open) return
    DeliveryResultsService.getAll()
      .then((r) => setResults(r.success ? (r.data ?? []) : []))
      .catch(() => setResults([]))
  }, [open])

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

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="countryLearnings">
        <DialogBody>
          <DialogTitle>{t('この国で使う学び', 'Learnings used in this country')}</DialogTitle>
          <DialogContent className={s.body}>
            <div className={s.row}>
              <span className={s.label}>{t('国', 'Country')}</span>
              {headerCountry ? (
                <span>{nameOf(country)}</span>
              ) : (
                <Select size="small" value={country} onChange={(_, d) => setPicked(d.value)}>
                  {countryOptions.map((o) => (
                    <option key={o.value} value={String(o.value)}>
                      {optionLabel(o.label)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <span className={s.note}>
              {t(
                '学びは全部の国で共通です。この国の学びは、決めていなければ使います。ほかの国の学びは、国で客層が違うので、決めていなければ使いません(使えそうなものに印を付けます)。印の付いた学びだけが、この国の配信カードの「これまでの学び」と AI の下書きに渡ります(この国の全員に効きます)。残す・様子を見る・外すの判定は、結果の面の「効果」→「学びの評価」で、国ごとに決めます。',
                'Learnings are shared across countries. This country’s own learnings are used unless you decide otherwise. Learnings from other countries are not used unless you check them, since audiences differ. Only checked learnings appear in this country’s delivery cards and AI drafts (applies to everyone on this country). Keep / watch / retire is decided per country in Results → Impact → Evaluate learnings.',
              )}
            </span>
            {results === null ? (
              <Spinner size="small" />
            ) : items.length === 0 ? (
              <span className={s.note}>{t('学び(結果の「次に生かすメモ」)はまだありません', 'No learnings (notes for next time) yet.')}</span>
            ) : (
              <CountryApplyList kind="learning" country={country} countryName={nameOf(country)} items={items} defaultUse={(id) => originOf.get(id) === country} />
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              {t('閉じる', 'Close')}
            </Button>
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
