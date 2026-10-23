// この国で使う決まり(ST8)。⚙ →「国」→「この国で使う決まり」で開く。
// マーケティングの決まり(policy_rules)は共通で 1 つ持ち、どの国で使うかだけを国の適用の表(ST7)に持つ。
// 決まりの「市場」の列は、決めていないときの既定として読む(空 = ブランド全体の決まりで全部の国、書いてあれば その国だけ。法律・表記など)。
// 中身が国で違う決まりは、適用では表せないので、別の決まりとして持つ(「方針・決まり」で足す)。決まりの id は rule_id(取り込み直しても変わらない)
import { useEffect, useState } from 'react'
import { Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, Button, MessageBar, MessageBarBody, Select, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { PolicyRulesService } from './data/policyRules'
import type { PolicyRule } from './models/policyRules'
import { CountryApplyList } from './CountryApplyList'
import { ResizableSurface } from './ResizableSurface'
import { countryOptions } from './status'
import { optionLabel, useT } from './i18n'

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
}

const marketsOf = (r: PolicyRule) => (r.market ?? '').split(',').filter(Boolean)

export function CountryPoliciesDialog({ open, onClose, country: headerCountry }: Props) {
  const s = useStyles()
  const t = useT()
  const [picked, setPicked] = useState(String(countryOptions[0]?.value ?? ''))
  const country = headerCountry || picked
  const nameOf = (code: string) => optionLabel(countryOptions.find((o) => String(o.value) === code)?.label) || code
  const [rules, setRules] = useState<PolicyRule[] | null>(null)
  // 読めなかったとき(サーバーが混んでいるときなど)は、「決まりがない」と見分けがつくように、そう出す
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    PolicyRulesService.getAll({ top: 5000 })
      .then((r) => {
        // 開き直したときに、前の失敗を消す
        setError(r.success ? null : (r.error?.message ?? 'error'))
        if (r.success) setRules(r.data ?? [])
      })
      .catch((e: unknown) => setError(String(e)))
  }, [open])

  const list = (rules ?? []).filter((r) => r.rule_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.rule_id ?? '').localeCompare(b.rule_id ?? ''))
  const marketOf = new Map(list.map((r) => [r.rule_id!, marketsOf(r)]))
  // 見出し: ブランド全体 → この国の決まり → ほかの国の決まり(既定で使うものから並べる)
  const groupOf = (r: PolicyRule) => {
    const m = marketsOf(r)
    if (m.length === 0) return 0
    return m.includes(country) ? 1 : 2
  }
  const groupName = [t('ブランド全体の決まり(市場の指定なし)', 'Brand-wide rules (no market)'), t('この国の決まり', 'Rules for this country'), t('ほかの国の決まり', 'Rules for other countries')]
  const items = [...list]
    .sort((a, b) => groupOf(a) - groupOf(b))
    .map((r) => ({
      id: r.rule_id!,
      label: `${r.rule_id} ${r.title ?? ''}`.trim(),
      description: [r.strength, marketsOf(r).join(',') || t('全市場', 'All markets'), r.body ?? ''].filter(Boolean).join(' · '),
      group: groupName[groupOf(r)],
    }))

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <ResizableSurface sizeKey="countryPolicies">
        <DialogBody>
          <DialogTitle>{t('この国で使う決まり', 'Rules used in this country')}</DialogTitle>
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
                'マーケティングの決まりは全部の国で共通です。決めていなければ、決まりの「市場」のとおりに使います(空ならブランド全体の決まりとして全部の国、書いてあればその国だけ)。印を変えると、この国の AI の依頼と週の上限に効きます(この国の全員に効きます)。中身が国で違う決まりは、ここでは表せないので、「方針・決まり」で別の決まりとして足してください。',
                'Marketing rules are shared across countries. Undecided rules follow their Market column (empty = brand-wide, used everywhere; otherwise only those countries). Changing a check affects this country’s AI requests and weekly limits (applies to everyone on this country). Rules whose content differs by country cannot be expressed here — add them as separate rules in Marketing policies.',
              )}
            </span>
            {error ? (
              <MessageBar intent="error" layout="multiline">
                <MessageBarBody>{t(`決まりを読めませんでした。閉じて、開き直してください(${error})`, `Could not load the rules. Close and open this again (${error})`)}</MessageBarBody>
              </MessageBar>
            ) : rules === null ? (
              <Spinner size="small" />
            ) : items.length === 0 ? (
              <span className={s.note}>{t('決まりはまだありません(⚙ →「方針・決まり」で取り込めます)', 'No rules yet (import them in ⚙ → Marketing policies).')}</span>
            ) : (
              <CountryApplyList
                kind="policy"
                country={country}
                countryName={nameOf(country)}
                items={items}
                defaultUse={(id) => {
                  const m = marketOf.get(id) ?? []
                  return m.length === 0 || m.includes(country)
                }}
              />
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
