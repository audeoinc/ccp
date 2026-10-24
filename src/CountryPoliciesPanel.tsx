// この国で使う決まり(ST8)。設定の画面(ST10)の「国」→「使う決まり」の中身。
// マーケティングの決まり(policy_rules)は共通で 1 つ持ち、どの国で使うかだけを国の適用の表(ST7)に持つ。
// 決まりの「市場」の列は、決めていないときの既定として読む(空 = ブランド全体の決まりで全部の国、書いてあれば その国だけ。法律・表記など)。
// 中身が国で違う決まりは、適用では表せないので、別の決まりとして持つ(全社の「方針・決まり」で足す)。決まりの id は rule_id(取り込み直しても変わらない)
import { useEffect, useState } from 'react'
import { MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { PolicyRulesService } from './data/policyRules'
import type { PolicyRule } from './models/policyRules'
import { CountryApplyList } from './CountryApplyList'
import { useT } from './i18n'

const useStyles = makeStyles({
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
})

interface Props {
  /** 国のコード(設定の画面で決まっている) */
  country: string
  countryName: string
}

const marketsOf = (r: PolicyRule) => (r.market ?? '').split(',').filter(Boolean)

export function CountryPoliciesPanel({ country, countryName }: Props) {
  const s = useStyles()
  const t = useT()
  const [rules, setRules] = useState<PolicyRule[] | null>(null)
  // 読めなかったとき(サーバーが混んでいるときなど)は、「決まりがない」と見分けがつくように、そう出す
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    PolicyRulesService.getAll({ top: 5000 })
      .then((r) => {
        setError(r.success ? null : (r.error?.message ?? 'error'))
        if (r.success) setRules(r.data ?? [])
      })
      .catch((e: unknown) => setError(String(e)))
  }, [])

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

  if (error)
    return (
      <MessageBar intent="error" layout="multiline">
        <MessageBarBody>{t(`決まりを読めませんでした。ほかの項目を開いてから、開き直してください(${error})`, `Could not load the rules. Open another item and come back (${error})`)}</MessageBarBody>
      </MessageBar>
    )
  if (rules === null) return <Spinner size="small" />
  if (items.length === 0) return <span className={s.note}>{t('決まりはまだありません(全社の「方針・決まり」で取り込めます)', 'No rules yet (import them in Company → Marketing policies).')}</span>
  return (
    <CountryApplyList
      key={country}
      kind="policy"
      country={country}
      countryName={countryName}
      items={items}
      defaultUse={(id) => {
        const m = marketOf.get(id) ?? []
        return m.length === 0 || m.includes(country)
      }}
    />
  )
}
