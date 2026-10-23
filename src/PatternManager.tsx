// 国ごとの配信の型(ST9。BACKLOG 13 章)。⚙ →「国」→「配信の型」で開く。
// 国ごとに、曜日・時刻・チャネル・種類・テンプレートの決まった組を「型」として持つ。「まとめて作る」が、この型どおりに枠(種類・テンプレートが入った状態)を作る。
// 型は既定値で縛りではない(作った枠・配信で変えられる)。作るときに写すので、型を変えても、もう作った配信には効かない。
// テンプレートは id だけ持ち、作るときの最新の版を使う。決めたこと(利用者 2026-10-22): 毎週同じ曜日の型だけ・セールや祝日の週も型は替えない・同じ日・チャネルに 2 本以上ありうる(時刻と並び順で見分ける)
import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, DeleteRegular, DismissRegular } from '@fluentui/react-icons'
import { DeliveryPatternsService } from './data/deliveryPatterns'
import { ResizableSurface } from './ResizableSurface'
import type { DeliveryPattern, DeliveryPatternFields } from './models/deliveryPatterns'
import { CHANNEL_EMAIL, channelOptions, countryOptions } from './status'
import { THEME_TYPES, themeTypeLabel } from './themeTypes'
import { templateOptions, type TemplateChannel } from './templates'
import { optionLabel, useT } from './i18n'

const useStyles = makeStyles({
  surface: { width: 'min(980px, 96vw)', maxWidth: '96vw' },
  content: { display: 'flex', flexDirection: 'column', gap: '10px' },
  row: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  table: { display: 'grid', gridTemplateColumns: '92px 104px 120px 150px minmax(160px, 1fr) minmax(120px, 1fr) 32px', columnGap: '8px', rowGap: '6px', alignItems: 'center' },
  day: { gridColumn: '1 / -1', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '6px', marginTop: '4px' },
  empty: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, gridColumn: '2 / -1' },
})

/** 曜日の名前(0 = 日曜。週の表示と同じく、日曜から並べる) */
const weekdayName = (t: ReturnType<typeof useT>, d: number) => [t('日曜', 'Sun'), t('月曜', 'Mon'), t('火曜', 'Tue'), t('水曜', 'Wed'), t('木曜', 'Thu'), t('金曜', 'Fri'), t('土曜', 'Sat')][d] ?? ''

interface Props {
  open: boolean
  onClose: () => void
  /** ヘッダーで選んでいる国(「すべての国」のときは空。画面の中で選ぶ) */
  country: string
  /** 型を変えたら(「まとめて作る」が読み直す) */
  onChanged?: () => void
}

export function PatternManager({ open, onClose, country: headerCountry, onChanged }: Props) {
  const s = useStyles()
  const t = useT()
  const [country, setCountry] = useState(headerCountry || String(countryOptions[0]?.value ?? ''))
  const [rows, setRows] = useState<DeliveryPattern[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async (co: string) => {
    const r = await DeliveryPatternsService.getAll({ filter: `country eq '${co}'` })
    if (!r.success) return setError(r.error?.message ?? t('型を読めませんでした', 'Could not load patterns'))
    setRows(r.data ?? [])
  }

  useEffect(() => {
    if (!open) return
    const co = headerCountry || country
    // 描画のあとで読む(effect の中で直接 state を変えない)
    const id = window.setTimeout(() => {
      setCountry(co)
      void load(co)
    })
    return () => window.clearTimeout(id)
    // 開いたときと、ヘッダーの国が変わったとき
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, headerCountry])

  // 曜日 → 時刻・並び順の順
  const byDay = useMemo(() => {
    const m = new Map<number, DeliveryPattern[]>()
    for (const r of rows ?? []) m.set(r.weekday ?? 1, [...(m.get(r.weekday ?? 1) ?? []), r])
    for (const list of m.values()) list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return m
  }, [rows])

  /** 1 つの項目を変えて、すぐ保存する */
  const patch = async (row: DeliveryPattern, p: Partial<DeliveryPatternFields>) => {
    setError(null)
    // チャネルを変えて、テンプレートがそのチャネルのものでなくなったら、テンプレートを外す
    const next = { ...row, ...p }
    if (p.channel && next.layout_key && !templateOptions(p.channel as TemplateChannel).some((o) => o.id === next.layout_key)) next.layout_key = ''
    setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? next : r)))
    const r = await DeliveryPatternsService.update(row.id, { ...p, ...(next.layout_key !== row.layout_key ? { layout_key: next.layout_key } : {}) })
    if (!r.success) setError(r.error?.message ?? t('保存できませんでした', 'Could not save'))
    onChanged?.()
  }

  const add = async (weekday: number) => {
    setBusy(true)
    setError(null)
    const same = byDay.get(weekday) ?? []
    const r = await DeliveryPatternsService.create({
      name: '',
      country,
      weekday,
      time: same.at(-1)?.time ?? '10:00',
      channel: CHANNEL_EMAIL,
      sort_order: same.length,
    })
    setBusy(false)
    if (!r.success) return setError(r.error?.message ?? t('足せませんでした', 'Could not add'))
    await load(country)
    onChanged?.()
  }

  const remove = async (row: DeliveryPattern) => {
    if (!window.confirm(t('この型を消します(もう作った配信は、そのままです)。よろしいですか?', 'Delete this pattern? Deliveries already created are kept.'))) return
    try {
      await DeliveryPatternsService.delete(row.id)
    } catch (e) {
      return setError(e instanceof Error ? e.message : t('消せませんでした', 'Could not delete'))
    }
    setRows((rs) => (rs ?? []).filter((x) => x.id !== row.id))
    onChanged?.()
  }

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="patterns" className={s.surface}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={onClose} />}>
            {t('配信の型(国ごと)', 'Delivery patterns (per country)')}
          </DialogTitle>
          <DialogContent className={s.content}>
            <div className={s.row}>
              <span className={s.label}>{t('国', 'Country')}</span>
              {headerCountry ? (
                <span>{optionLabel(countryOptions.find((o) => String(o.value) === headerCountry)?.label)}</span>
              ) : (
                <Select
                  size="small"
                  value={country}
                  onChange={(_, d) => {
                    setCountry(d.value)
                    setRows(null)
                    void load(d.value)
                  }}
                >
                  {countryOptions.map((o) => (
                    <option key={o.value} value={String(o.value)}>
                      {optionLabel(o.label)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <span className={s.hint}>
              {t(
                '毎週の決まった配信を、曜日ごとに「型」として持ちます。「新規作成 ▾」の「まとめて作る」は、この型どおりに枠(種類・テンプレートが入った状態)を作ります。型は既定値なので、作った枠・配信では自由に変えられます。型を変えても、もう作った配信は変わりません。テンプレートは、作るときの最新の版を使います。',
                'Weekly deliveries, kept as patterns per weekday. “Create in bulk” makes slots from these patterns (with type and template filled in). Patterns are only defaults: you can change any slot or delivery. Changing a pattern does not change deliveries already made. Templates use their latest version at creation.',
              )}
            </span>
            {error && (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {!rows ? (
              <Spinner size="small" label={t('読んでいます', 'Loading')} />
            ) : (
              <div className={s.table}>
                <span className={s.label}>{t('時刻', 'Time')}</span>
                <span className={s.label}>{t('チャネル', 'Channel')}</span>
                <span className={s.label}>{t('種類', 'Type')}</span>
                <span className={s.label}>{t('テンプレート', 'Template')}</span>
                <span className={s.label}>{t('型の名前(なくてもよい)', 'Name (optional)')}</span>
                <span className={s.label}>{t('メモ', 'Note')}</span>
                <span />
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const list = byDay.get(d) ?? []
                  return (
                    <div key={d} style={{ display: 'contents' }}>
                      <div className={s.day}>
                        <span>{weekdayName(t, d)}</span>{' '}
                        <Button size="small" appearance="subtle" icon={<AddRegular />} disabled={busy} onClick={() => void add(d)}>
                          {t('型を足す', 'Add')}
                        </Button>
                      </div>
                      {list.length === 0 && <span className={s.empty}>{t('この曜日の型はありません', 'No patterns on this day')}</span>}
                      {list.map((r) => (
                        <div key={r.id} style={{ display: 'contents' }}>
                          <Input size="small" type="time" defaultValue={r.time ?? ''} onBlur={(e) => e.target.value !== (r.time ?? '') && void patch(r, { time: e.target.value })} aria-label={t('時刻', 'Time')} />
                          <Select size="small" value={r.channel ?? CHANNEL_EMAIL} onChange={(_, v) => void patch(r, { channel: v.value })} aria-label={t('チャネル', 'Channel')}>
                            {channelOptions.map((o) => (
                              <option key={o.value} value={String(o.value)}>
                                {optionLabel(o.label)}
                              </option>
                            ))}
                          </Select>
                          <Select size="small" value={r.theme_type ?? ''} onChange={(_, v) => void patch(r, { theme_type: v.value })} aria-label={t('種類', 'Type')}>
                            <option value="">{t('(決めない)', '(not set)')}</option>
                            {THEME_TYPES.map((x) => (
                              <option key={x} value={x}>
                                {themeTypeLabel(x)}
                              </option>
                            ))}
                          </Select>
                          <Select size="small" value={r.layout_key ?? ''} onChange={(_, v) => void patch(r, { layout_key: v.value })} aria-label={t('テンプレート', 'Template')}>
                            <option value="">{t('(AI が選ぶ)', '(AI chooses)')}</option>
                            {templateOptions((r.channel === 'app' ? 'push' : 'email') as TemplateChannel).map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </Select>
                          <Input size="small" defaultValue={r.name ?? ''} placeholder={t('例: 週末のセール', 'e.g. Weekend sale')} onBlur={(e) => e.target.value !== (r.name ?? '') && void patch(r, { name: e.target.value })} aria-label={t('型の名前', 'Pattern name')} />
                          <Input size="small" defaultValue={r.note ?? ''} onBlur={(e) => e.target.value !== (r.note ?? '') && void patch(r, { note: e.target.value })} aria-label={t('メモ', 'Note')} />
                          <Button size="small" appearance="subtle" icon={<DeleteRegular />} aria-label={t('この型を消す', 'Delete this pattern')} onClick={() => void remove(r)} />
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
