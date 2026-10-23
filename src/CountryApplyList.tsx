// 「この国で使う」の一覧(ST7)。共通のマスタ(テンプレート・学び・ポリシー)のうち、その国で使うものに印を付ける。
// 種類ごとに画面を作らず、この部品を使い回す(並べるもの・既定は呼ぶ側が渡す)。
// 変えると国の全員に効くので、確かめてから保存し、変えた人・日時を残す(src/countryApply.ts)
import { useState } from 'react'
import { Badge, Button, Checkbox, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components'
import { appliesIn, applyDecided, applyHistory, saveApply, useCountryApply, type ApplyKind } from './countryApply'
import { myName } from './history'
import { locale, useT } from './i18n'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px' },
  group: { display: 'grid', rowGap: '2px' },
  label: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
  desc: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  actions: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  history: { margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, maxHeight: '140px', overflowY: 'auto' },
})

export interface ApplyItem {
  id: string
  label: string
  description?: string
  /** 見出しでまとめる(例: メール / アプリ) */
  group?: string
}

interface Props {
  kind: ApplyKind
  /** 国のコード(US / JP) */
  country: string
  /** 国の名前(確かめる文に出す) */
  countryName: string
  items: ApplyItem[]
  onSaved?: () => void
}

export function CountryApplyList({ kind, country, countryName, items, onSaved }: Props) {
  const s = useStyles()
  const t = useT()
  useCountryApply()
  // 変えた所だけを持つ(id → 使うか)。国を替えたら捨てる
  const [draft, setDraft] = useState<{ country: string; map: Map<string, boolean> }>({ country, map: new Map() })
  const edits = draft.country === country ? draft.map : new Map<string, boolean>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = (id: string) => appliesIn(kind, id, country)
  const shown = (id: string) => edits.get(id) ?? current(id)
  const changes = [...edits.entries()].filter(([id, use]) => use !== current(id)).map(([id, use]) => ({ id, use }))
  const set = (id: string, use: boolean) => setDraft({ country, map: new Map(edits).set(id, use) })
  const groups = [...new Set(items.map((x) => x.group ?? ''))]
  const nameOf = (id: string) => items.find((x) => x.id === id)?.label ?? id
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '')
  const past = applyHistory(kind, country)

  const save = async () => {
    if (!window.confirm(t(`${countryName}の全員に効きます。保存しますか?`, `This applies to everyone working on ${countryName}. Save?`))) return
    setBusy(true)
    setError(null)
    try {
      await saveApply(kind, country, changes, myName() || t('(名前なし)', '(no name)'))
      setDraft({ country, map: new Map() })
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.root}>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {groups.map((g) => (
        <div key={g} className={s.group}>
          {g && <span className={s.label}>{g}</span>}
          {items
            .filter((x) => (x.group ?? '') === g)
            .map((x) => (
              <div key={x.id} className={s.row}>
                <Checkbox checked={shown(x.id)} onChange={(_, d) => set(x.id, !!d.checked)} label={x.label} />
                {!applyDecided(kind, x.id, country) && !edits.has(x.id) && (
                  <Badge size="small" appearance="outline" title={t('まだ決めていないので、既定(使う)です', 'Not decided yet, so the default (use) applies')}>
                    {t('既定', 'Default')}
                  </Badge>
                )}
                {x.description && <span className={s.desc} title={x.description}>{x.description}</span>}
              </div>
            ))}
        </div>
      ))}
      <div className={s.actions}>
        <Button appearance="primary" size="small" disabled={changes.length === 0 || busy} onClick={() => void save()}>
          {changes.length ? t(`保存(${changes.length} 件を変える)`, `Save (${changes.length} changes)`) : t('保存', 'Save')}
        </Button>
        {changes.length > 0 && (
          <Button size="small" appearance="subtle" onClick={() => setDraft({ country, map: new Map() })}>
            {t('変えたのを戻す', 'Discard changes')}
          </Button>
        )}
      </div>
      <div>
        <span className={s.label}>{t('変えた記録', 'Change history')}</span>
        {past.length === 0 ? (
          <div className={s.note}>{t('まだ変えていません(すべて既定)', 'Not changed yet (all defaults)')}</div>
        ) : (
          <ul className={s.history}>
            {past.slice(0, 30).map((h, i) => (
              <li key={i}>
                {when(h.entry.at)} {h.entry.by}: {nameOf(h.id)} {h.entry.use ? t('を使う', '→ use') : t('を使わない', '→ not used')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
