import { useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody, Select, makeStyles, tokens } from '@fluentui/react-components'
import { ResizableSurface } from './ResizableSurface'
import { AutoTextarea } from './AutoTextarea'
import { PolicyEdit, type RuleInput } from './data/policyEdit'
import { tr, useT } from './i18n'
import { RULE_STRENGTHS, RULE_TARGETS, type PolicyRule } from './models/policyRules'

const useStyles = makeStyles({
  surface: { width: 'min(760px, (94vw / var(--ui-zoom, 1)))', maxWidth: 'none' },
  form: { display: 'grid', rowGap: '10px' },
  two: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '10px' },
  three: { display: 'grid', gridTemplateColumns: '180px 1fr 1fr', columnGap: '10px', alignItems: 'start' },
  checks: { display: 'flex', flexWrap: 'wrap', columnGap: '4px' },
  checkRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '10px', alignItems: 'start' },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  warn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
})

/** 確かめ方の種類(POLICY_FORMAT.md の 3.3)。画面では種類と値に分けて入れ、保存のときに 1 つの文にする */
type CheckKind = '' | 'limit' | 'exclude_word' | 'exclude_re' | 'include_re' | 'exclude_stage'
const CHECK_KINDS: CheckKind[] = ['', 'limit', 'exclude_word', 'exclude_re', 'include_re', 'exclude_stage']

const checkLabel = (k: CheckKind) =>
  k === 'limit'
    ? tr('上限 週 N 回(同じ商品を同じ週に載せる回数)', 'Weekly cap (times per week for the same product)')
    : k === 'exclude_word'
      ? tr('含めない(言葉)', 'Must not contain (word)')
      : k === 'exclude_re'
        ? tr('含めない(/正規表現/)', 'Must not contain (/regex/)')
        : k === 'include_re'
          ? tr('含める(/正規表現/)', 'Must contain (/regex/)')
          : k === 'exclude_stage'
            ? tr('除く 段階=(商品の段階)', 'Exclude stage= (product stage)')
            : tr('なし(AI に伝えるだけ)', 'None (tell AI only)')

/** 保存してある 1 つの文を、種類と値に分ける */
function splitCheck(spec?: string | null): { kind: CheckKind; value: string } {
  const s = (spec ?? '').trim()
  let m: RegExpMatchArray | null
  if ((m = s.match(/^上限\s+週\s+(\d+)\s*回$/))) return { kind: 'limit', value: m[1] }
  if ((m = s.match(/^除く\s+段階\s*=\s*(\S+)$/))) return { kind: 'exclude_stage', value: m[1] }
  if ((m = s.match(/^含める\s+\/(.+)\/$/))) return { kind: 'include_re', value: m[1] }
  if ((m = s.match(/^含めない\s+\/(.+)\/$/))) return { kind: 'exclude_re', value: m[1] }
  if ((m = s.match(/^含めない\s+(\S.*)$/))) return { kind: 'exclude_word', value: m[1] }
  return { kind: '', value: s }
}
function joinCheck(kind: CheckKind, value: string): string {
  const v = value.trim()
  if (!kind || !v) return ''
  return kind === 'limit' ? `上限 週 ${v} 回` : kind === 'exclude_stage' ? `除く 段階=${v}` : kind === 'include_re' ? `含める /${v}/` : kind === 'exclude_re' ? `含めない /${v}/` : `含めない ${v}`
}

const targetLabel = (key: string): string =>
  (
    ({
      theme: tr('テーマ', 'Theme'),
      selection: tr('商品の選定', 'Product selection'),
      hero: tr('メイン画像', 'Hero image'),
      headline: tr('ヘッドライン・見出し', 'Headline'),
      copy: tr('コピー', 'Copy'),
      instructions: tr('制作指示', 'Production notes'),
      schedule: tr('配信日時', 'Schedule'),
    }) as Record<string, string>
  )[key] ?? key

interface Props {
  /** 直すとき(なければ足す) */
  rule?: PolicyRule
  /** 足すときの、最初の中身(週の上限のひな形など) */
  initial?: RuleInput
  /** 使える市場(すでにある決まりと配信から) */
  markets: string[]
  /** 保存したあと。added は、新しく足した決まりの番号(一覧で、いちばん上に印つきで出すため) */
  onDone: (message: string, added?: string) => void | Promise<void>
  onClose: () => void
}

/**
 * マーケティングの決まりを、画面で足す・直す(X61)。項目は取り込みのファイル(POLICY_FORMAT.md の 3 章)と同じ。
 * 確かめはサーバーが取り込みと同じ読み分けで行う。取り込んだ決まりを直すと、同じファイルを取り込み直したときにファイルの内容に戻る
 */
export function RuleEditDialog({ rule, initial, markets, onDone, onClose }: Props) {
  const s = useStyles()
  const t = useT()
  const start: RuleInput = rule
    ? {
        rule_id: rule.rule_id ?? '',
        title: rule.title ?? '',
        applies_to: rule.applies_to ?? '',
        strength: rule.strength ?? 'should',
        market: rule.market ?? '',
        channel: rule.channel ?? '',
        period_start: rule.period_start ?? '',
        period_end: rule.period_end ?? '',
        check_spec: rule.check_spec ?? '',
        body: rule.body ?? '',
      }
    : (initial ?? { rule_id: '', title: '', applies_to: '', strength: 'should', market: '', channel: '', check_spec: '', body: '' })
  const [form, setForm] = useState<RuleInput>(start)
  const first = splitCheck(start.check_spec)
  const [checkKind, setCheckKind] = useState<CheckKind>(first.kind)
  const [checkValue, setCheckValue] = useState(first.value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof RuleInput>(k: K, v: RuleInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const has = (csv: string, x: string) => csv.split(',').map((v) => v.trim()).includes(x)
  const toggle = (k: 'applies_to' | 'market' | 'channel', x: string, on: boolean) => {
    const cur = form[k].split(',').map((v) => v.trim()).filter(Boolean)
    set(k, (on ? [...new Set([...cur, x])] : cur.filter((v) => v !== x)).join(','))
  }
  const imported = !!rule && rule.source_file !== '画面で作成'
  const allMarkets = [...new Set(['JP', 'US', ...markets])].sort()

  const save = async () => {
    setBusy(true)
    setError(null)
    const input: RuleInput = { ...form, check_spec: joinCheck(checkKind, checkValue) || null, period_start: form.period_start || null, period_end: form.period_end || null }
    try {
      const res = rule ? await PolicyEdit.update(rule.id, input) : await PolicyEdit.create(input)
      const notes = res.problems.map((p) => p.message).join(' / ')
      await onDone((rule ? tr(`決まり ${input.rule_id} を直しました`, `Updated rule ${input.rule_id}`) : tr(`決まり ${input.rule_id} を足しました`, `Added rule ${input.rule_id}`)) + (notes ? tr(`(気になること: ${notes})`, ` (note: ${notes})`) : ''), rule ? undefined : input.rule_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && !busy && onClose()}>
      <ResizableSurface sizeKey="ruleEdit" className={s.surface}>
        <DialogBody>
          <DialogTitle>{rule ? t(`決まりを直す — ${rule.rule_id}`, `Edit rule — ${rule.rule_id}`) : t('決まりを足す', 'Add a rule')}</DialogTitle>
          <DialogContent>
            <div className={s.form}>
              {imported && (
                <MessageBar intent="warning" layout="multiline">
                  <MessageBarBody>
                    {t(
                      `この決まりはファイル「${rule?.source_file}」から取り込んだものです。ここで直せますが、同じファイルを取り込み直すと、ファイルの内容に戻ります。直した内容を残すなら、一覧の「Markdown に書き出す」で元のファイルも直してください。`,
                      `This rule was imported from "${rule?.source_file}". You can edit it here, but re-importing that file restores the file's version. To keep the change, also update the file using "Export as Markdown".`,
                    )}
                  </MessageBarBody>
                </MessageBar>
              )}
              <div className={s.three}>
                <Field label={t('番号', 'Id')} required size="small" hint={t('英数字と - _。ファイルをまたいで重ならないもの', 'Letters, digits, - and _. Unique across files')}>
                  <Input size="small" value={form.rule_id} onChange={(_, d) => set('rule_id', d.value)} placeholder="R-LIMIT-001" />
                </Field>
                <Field label={t('題名', 'Title')} required size="small" style={{ gridColumn: 'span 2' }}>
                  <Input size="small" value={form.title} onChange={(_, d) => set('title', d.value)} />
                </Field>
              </div>
              <Field label={t('対象(効く AI の依頼。1 つ以上)', 'Applies to (AI tasks; at least one)')} size="small">
                <div className={s.checks}>
                  {RULE_TARGETS.map((x) => (
                    <Checkbox key={x} label={targetLabel(x)} checked={has(form.applies_to, x)} onChange={(_, d) => toggle('applies_to', x, !!d.checked)} />
                  ))}
                </div>
              </Field>
              <div className={s.two}>
                <Field label={t('強さ', 'Strength')} size="small">
                  <Select size="small" value={form.strength} onChange={(_, d) => set('strength', d.value)}>
                    {RULE_STRENGTHS.map((x) => (
                      <option key={x} value={x}>
                        {x === 'must' ? t('必ず守る(must)', 'Must') : x === 'should' ? t('なるべく(should)', 'Should') : t('背景(info)', 'Info')}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('期間(空はいつでも)', 'Period (empty = always)')} size="small">
                  <div className={s.two}>
                    <Input size="small" type="date" value={form.period_start ?? ''} onChange={(_, d) => set('period_start', d.value)} aria-label={t('始まり', 'Start')} />
                    <Input size="small" type="date" value={form.period_end ?? ''} onChange={(_, d) => set('period_end', d.value)} aria-label={t('終わり', 'End')} />
                  </div>
                </Field>
              </div>
              <div className={s.two}>
                <Field label={t('市場(選ばなければ、すべて)', 'Markets (none = all)')} size="small">
                  <div className={s.checks}>
                    {allMarkets.map((m) => (
                      <Checkbox key={m} label={m} checked={has(form.market, m)} onChange={(_, d) => toggle('market', m, !!d.checked)} />
                    ))}
                  </div>
                </Field>
                <Field label={t('チャネル(選ばなければ、両方)', 'Channels (none = both)')} size="small">
                  <div className={s.checks}>
                    <Checkbox label={t('メール', 'Email')} checked={has(form.channel, 'email')} onChange={(_, d) => toggle('channel', 'email', !!d.checked)} />
                    <Checkbox label={t('アプリ', 'App')} checked={has(form.channel, 'app')} onChange={(_, d) => toggle('channel', 'app', !!d.checked)} />
                  </div>
                </Field>
              </div>
              <div className={s.checkRow}>
                <Field label={t('確かめ方(機械で確認する。must だけ)', 'Check (machine-checked; must only)')} size="small">
                  <Select size="small" value={checkKind} onChange={(_, d) => setCheckKind(d.value as CheckKind)}>
                    {CHECK_KINDS.map((k) => (
                      <option key={k || 'none'} value={k}>{checkLabel(k)}</option>
                    ))}
                  </Select>
                </Field>
                {checkKind && (
                  <Field
                    label={checkKind === 'limit' ? t('週に何回まで', 'Times per week') : checkKind === 'exclude_stage' ? t('段階(例: 在庫調整)', 'Stage (e.g. clearance)') : checkKind === 'exclude_word' ? t('含めない言葉', 'Word') : t('正規表現(/ は付けない)', 'Regex (without /)')}
                    size="small"
                    hint={joinCheck(checkKind, checkValue) ? t(`保存する形: ${joinCheck(checkKind, checkValue)}`, `Saved as: ${joinCheck(checkKind, checkValue)}`) : undefined}
                  >
                    <Input size="small" type={checkKind === 'limit' ? 'number' : 'text'} min={1} value={checkValue} onChange={(_, d) => setCheckValue(d.value)} />
                  </Field>
                )}
              </div>
              {checkKind && form.strength !== 'must' && <span className={s.warn}>{t('確かめ方は「必ず守る(must)」の決まりだけで使われます(週の上限もそう)', 'Checks are used only by Must rules (the weekly cap too)')}</span>}
              {checkKind === 'limit' && <span className={s.note}>{t('週の上限は、この決まりが配信の国・チャネル・配信日に当てはまれば、⚙ のアラートの条件の「週の上限」より優先されます(いくつも当てはまれば、いちばん小さい数)', 'When this rule matches a delivery’s country, channel and date, it overrides the weekly cap in ⚙ Alert settings (the smallest wins if several match)')}</span>}
              <Field label={t('本文(AI にそのまま渡す。300 字まで)', 'Body (passed to AI as is; up to 300 chars)')} size="small" hint={`${form.body.length} / 300`}>
                <AutoTextarea heightKey="RuleEditDialog.form_body" size="small" rows={4} value={form.body} onChange={(_, d) => set('body', d.value)} />
              </Field>
              {error && (
                <MessageBar intent="error" layout="multiline">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={onClose}>{t('やめる', 'Cancel')}</Button>
            <Button appearance="primary" disabled={busy || !form.rule_id.trim() || !form.title.trim()} onClick={() => void save()}>
              {busy ? t('保存しています…', 'Saving…') : t('保存', 'Save')}
            </Button>
          </DialogActions>
        </DialogBody>
      </ResizableSurface>
    </Dialog>
  )
}
