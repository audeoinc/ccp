// AI の設定(settings.ai。⚙ → 全社 →「AI の設定」。管理する人だけ。2026-11-03 利用者「できるだけ DB に」)。
// Gemini のモデル・考える深さ・同時に呼ぶ数と、AI の出口の URL・待ち時間を、DB に持つ(サーバーは server/ccp/appsettings.py)。
// 保存したら、起動し直さずに次の AI の呼び出しから効く。出口の合言葉・Google の認証は秘密なので、ここに置かない(環境のまま)
import { useEffect, useState } from 'react'
import { Button, Field, InfoLabel, Input, MessageBar, MessageBarBody, Select, SpinButton, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { SaveRegular } from '@fluentui/react-icons'
import { AppSettingsService, type SettingsView } from './data/appSettings'
import { CopiedFromEnv, SettingsHistory } from './SettingsChanges'
import { useT } from './i18n'
import { typo } from './typo'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, maxWidth: '640px', minWidth: 0 },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalM },
  actions: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  sub: { ...typo.heading },
})

const thinkingName = (v: string, t: ReturnType<typeof useT>) =>
  ({ minimal: t('最小(いちばん速い)', 'Minimal (fastest)'), low: t('少し(速さ優先)', 'Low (speed first)'), medium: t('ふつう', 'Medium'), high: t('深く(遅い)', 'High (slow)') })[v] ?? v

export function AiSettingsPanel() {
  const s = useStyles()
  const t = useT()
  const [view, setView] = useState<SettingsView | null>(null)
  const [form, setForm] = useState<Record<string, string | number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const take = (v: SettingsView) => {
    setView(v)
    setForm({ ...v.values })
  }
  useEffect(() => {
    let alive = true
    void AppSettingsService.get('ai').then((r) => {
      if (!alive) return
      if (r.data) take(r.data)
      else setError(r.error ?? '')
    })
    return () => {
      alive = false
    }
  }, [])

  const set = (key: string, v: string | number) => {
    setForm((f) => ({ ...f, [key]: v }))
    setSaved(false)
  }
  const label = (key: string) =>
    ({
      model: t('モデル', 'Model'),
      thinking: t('考える深さ', 'Thinking'),
      concurrency: t('同時に呼ぶ数', 'Concurrency'),
      outlet_url: t('AI の出口', 'AI outlet'),
      outlet_timeout: t('待ち時間', 'Timeout'),
    })[key] ?? key
  const dirty = !!view && Object.keys(form).some((k) => String(form[k]) !== String(view.values[k]))
  const save = async () => {
    setBusy(true)
    setError('')
    const r = await AppSettingsService.save('ai', form)
    setBusy(false)
    if (!r.data) return setError(r.error ?? '')
    take(r.data)
    setSaved(true)
  }

  if (!view) return error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : <Spinner size="tiny" />
  const num = (key: string, min: number, max: number) => (
    <SpinButton
      value={Number(form[key])}
      min={min}
      max={max}
      onChange={(_, d) => {
        const v = d.value ?? Number(d.displayValue)
        if (Number.isFinite(v)) set(key, v as number)
      }}
    />
  )
  return (
    <div className={s.root}>
      <CopiedFromEnv view={view} />
      <div className={s.row}>
        <Field label={<InfoLabel info={t('Vertex AI の Gemini のモデルの名前。その環境で使えるものにします。', 'The Vertex AI Gemini model name. Use one available in this environment.')}>{label('model')}</InfoLabel>}>
          <Input value={String(form.model ?? '')} placeholder={String(view.defaults.model)} onChange={(_, d) => set('model', d.value)} />
        </Field>
        <Field label={<InfoLabel info={t('深いほど、答えはよくなるが遅くなります。1 回の下書きで 6〜9 回呼ぶので、ふだんは「少し」。', 'Deeper is better but slower. A draft calls AI 6–9 times, so "Low" is the usual choice.')}>{label('thinking')}</InfoLabel>}>
          <Select value={String(form.thinking ?? '')} onChange={(_, d) => set('thinking', d.value)}>
            {(view.choices.thinking ?? []).map((v) => (
              <option key={v} value={v}>
                {thinkingName(v, t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={<InfoLabel info={t('AI を同時に呼ぶ数の上限。混み合い(429)が出るときは減らします。AI の出口を使うときも効きます。', 'Upper limit of simultaneous AI calls. Lower it if you see 429 (busy). Also applies to the AI outlet.')}>{label('concurrency')}</InfoLabel>}>
          {num('concurrency', 1, 32)}
        </Field>
      </div>
      <div className={s.row}>
        <Field
          label={
            <InfoLabel info={t('入れると、AI をすべて、この URL の層(ほかの AI)に頼みます。空なら Gemini。層に送る合言葉は、サーバーの環境変数(AI_OUTLET_TOKEN)に置きます。', 'When set, all AI calls go to the layer at this URL (another AI). Blank = Gemini. The token for the layer stays in the server environment (AI_OUTLET_TOKEN).')}>
              {t('AI の出口の URL(空なら Gemini)', 'AI outlet URL (blank = Gemini)')}
            </InfoLabel>
          }
        >
          <Input value={String(form.outlet_url ?? '')} placeholder="http://127.0.0.1:8090/ask" onChange={(_, d) => set('outlet_url', d.value)} />
        </Field>
        <Field label={t('出口の待ち時間(秒)', 'Outlet timeout (seconds)')}>{num('outlet_timeout', 5, 600)}</Field>
      </div>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {saved && (
        <MessageBar intent="success">
          <MessageBarBody>{t('保存しました。次の AI の呼び出しから効きます。', 'Saved. Applies from the next AI call.')}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.actions}>
        {busy && <Spinner size="extra-tiny" />}
        <Button size="small" appearance="primary" icon={<SaveRegular />} disabled={busy || !dirty} onClick={() => void save()}>
          {t('保存', 'Save')}
        </Button>
      </div>
      <span className={s.sub}>{t('変えた記録', 'Change history')}</span>
      <SettingsHistory view={view} label={label} />
    </div>
  )
}
