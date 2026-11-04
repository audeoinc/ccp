// AI の設定(settings.ai。⚙ → 全社 →「AI の設定」。管理する人だけ。2026-11-03 利用者「できるだけ DB に」)。
// Gemini のモデル・考える深さ・同時に呼ぶ数と、AI の出口の URL・待ち時間を、DB に持つ(サーバーは server/ccp/appsettings.py)。
// 保存したら、起動し直さずに次の AI の呼び出しから効く。出口の合言葉・Google の認証は秘密なので、ここに置かない(環境のまま)
// モデルは、サーバーが Vertex AI から読んだ「いま使える一覧」から選ぶ(読めなければ前の一覧かコードの一覧。一覧にないものは「そのほか」で書く)。
// 「試す」で短く 1 回呼べる。保存のときもサーバーが自動で試し、通らなければ保存しない(試し忘れて AI が止まる、をなくす。2026-11-03 利用者)
import { useCallback, useEffect, useState } from 'react'
import { Button, Field, InfoLabel, Input, MessageBar, MessageBarBody, Select, SpinButton, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { ArrowClockwiseRegular, PlayRegular, SaveRegular } from '@fluentui/react-icons'
import { AppSettingsService, type AiModels, type AiTry, type SettingsView } from './data/appSettings'
import { CopiedFromEnv, SettingsHistory } from './SettingsChanges'
import { locale, useT } from './i18n'
import { typo } from './typo'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, maxWidth: '640px', minWidth: 0 },
  group: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  // 欄の上をそろえる(片方の下に補足が付いても、もう片方が下がらないように)
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS, alignItems: 'start' },
  outlet: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', columnGap: tokens.spacingHorizontalM, alignItems: 'start' },
  narrow: { maxWidth: '160px' },
  actions: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  sub: { ...typo.heading },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
})

// 「そのほか」を選んだ印(モデルの名前にはならない値)
const OTHER = '__other__'
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

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
  const [models, setModels] = useState<AiModels | null>(null)
  const [other, setOther] = useState(false)
  const [tried, setTried] = useState<AiTry | null>(null)
  // 保存のときの自動の試しが通らなかった(理由を見たうえで「それでも保存する」を出す)
  const [refused, setRefused] = useState(false)

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
  const readModels = useCallback(async (refresh = false) => {
    const r = await AppSettingsService.aiModels(refresh)
    if (r.data) setModels(r.data)
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開いたときに、使えるモデルの一覧を読む(サーバーが 1 日覚えている)
    void readModels()
  }, [readModels])

  const set = (key: string, v: string | number) => {
    setForm((f) => ({ ...f, [key]: v }))
    setSaved(false)
    setTried(null)
    setRefused(false)
  }
  const tryNow = async () => {
    setBusy(true)
    setError('')
    const r = await AppSettingsService.tryAi(form)
    setBusy(false)
    if (r.data) setTried(r.data)
    else setError(r.error ?? '')
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
  const save = async (force = false) => {
    setBusy(true)
    setError('')
    setTried(null)
    const r = await AppSettingsService.save('ai', form, force)
    setBusy(false)
    if (!r.data) {
      setRefused(r.code === 'try_failed')
      return setError(r.error ?? '')
    }
    setRefused(false)
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
  const model = String(form.model ?? '')
  const names = models?.models ?? [String(view.values.model)]
  const showOther = other || !names.includes(model)
  const outlet = !!String(form.outlet_url ?? '').trim()
  return (
    <div className={s.root}>
      <CopiedFromEnv view={view} />
      {/* 組ごとに見出しを付けて分ける(2026-11-03 利用者「レイアウトが変」: 2 列に組の違う欄が並び、補足の行で片方の列だけが下がっていた)。
          2 列にするのは組の中だけで、欄の上をそろえる。補足(一覧を読んだ時刻・読み直す)は、欄の下に 1 行で */}
      <section className={s.group}>
        <span className={s.sub}>{t('使うモデル', 'Model')}</span>
        <div className={s.row}>
          <Field label={<InfoLabel info={t('Vertex AI の Gemini のモデル。一覧は、いまこの環境で使えるもの。一覧にないものは「そのほか」で名前を書きます。', 'The Vertex AI Gemini model. The list shows models available in this environment now. Choose "Other" to type a name.')}>{label('model')}</InfoLabel>}>
            <Select
              value={showOther ? OTHER : model}
              onChange={(_, d) => {
                setOther(d.value === OTHER)
                if (d.value !== OTHER) set('model', d.value)
              }}
            >
              {names.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER}>{t('そのほか(名前を書く)', 'Other (type a name)')}</option>
            </Select>
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
          {showOther && (
            <Field label={t('モデルの名前', 'Model name')}>
              <Input value={model} placeholder={String(view.defaults.model)} onChange={(_, d) => set('model', d.value)} />
            </Field>
          )}
        </div>
        <span className={s.note}>
          {!models ? (
            <Spinner size="extra-tiny" />
          ) : models.live ? (
            t(`いま使えるモデルの一覧(${when(models.at)} に読んだもの)`, `Models available now (read ${when(models.at)})`)
          ) : models.builtin ? (
            t(`いまの一覧を読めませんでした。既定の一覧を出しています(${models.error})`, `Could not read the current list; showing the built-in list (${models.error})`)
          ) : (
            t(`いまの一覧を読めませんでした(${when(models.at)} 時点の一覧です。${models.error})`, `Could not read the current list (showing the list as of ${when(models.at)}; ${models.error})`)
          )}
          <Button size="small" appearance="transparent" icon={<ArrowClockwiseRegular />} disabled={!models} onClick={() => void readModels(true)}>
            {t('一覧を読み直す', 'Reload list')}
          </Button>
        </span>
        {outlet && <span className={s.note}>{t('AI の出口を使っているあいだは、モデルは効きません(出口の向こうの AI が決めます)。', 'While the AI outlet is used, the model has no effect (the AI behind the outlet decides).')}</span>}
      </section>
      <section className={s.group}>
        <InfoLabel
          className={s.sub}
          info={t('入れると、AI をすべて、この URL の層(ほかの AI)に頼みます。層に送る合言葉は、サーバーの環境変数(AI_OUTLET_TOKEN)に置きます。', 'When set, all AI calls go to the layer at this URL (another AI). The token for the layer stays in the server environment (AI_OUTLET_TOKEN).')}
        >
          {t('AI の出口(空なら Gemini)', 'AI outlet (blank = Gemini)')}
        </InfoLabel>
        <div className={s.outlet}>
          <Field label={t('URL', 'URL')}>
            <Input value={String(form.outlet_url ?? '')} placeholder="http://127.0.0.1:8090/ask" onChange={(_, d) => set('outlet_url', d.value)} />
          </Field>
          <Field label={t('待ち時間(秒)', 'Timeout (seconds)')}>{num('outlet_timeout', 5, 600)}</Field>
        </div>
      </section>
      <section className={s.group}>
        <span className={s.sub}>{t('呼び方', 'Calls')}</span>
        <Field className={s.narrow} label={<InfoLabel info={t('AI を同時に呼ぶ数の上限。混み合い(429)が出るときは減らします。AI の出口を使うときも効きます。', 'Upper limit of simultaneous AI calls. Lower it if you see 429 (busy). Also applies to the AI outlet.')}>{label('concurrency')}</InfoLabel>}>
          {num('concurrency', 1, 32)}
        </Field>
      </section>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {tried && (
        <MessageBar intent={tried.ok ? 'success' : 'error'} layout="multiline">
          <MessageBarBody>
            {tried.ok
              ? tried.via === 'outlet'
                ? t(`AI の出口で使えます(${tried.seconds} 秒)`, `Works through the AI outlet (${tried.seconds}s)`)
                : t(`使えます(${tried.model}・${tried.seconds} 秒)`, `Works (${tried.model}, ${tried.seconds}s)`)
              : t(`呼べませんでした: ${tried.message}`, `Could not call AI: ${tried.message}`)}
          </MessageBarBody>
        </MessageBar>
      )}
      {saved && (
        <MessageBar intent="success">
          <MessageBarBody>{t('保存しました。次の AI の呼び出しから効きます。', 'Saved. Applies from the next AI call.')}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.actions}>
        {busy && <Spinner size="extra-tiny" />}
        <Button size="small" icon={<PlayRegular />} disabled={busy} onClick={() => void tryNow()}>
          {t('試す', 'Test')}
        </Button>
        <Button size="small" appearance="primary" icon={<SaveRegular />} disabled={busy || !dirty} onClick={() => void save()}>
          {t('保存', 'Save')}
        </Button>
        {/* 自動の試しが通らなかったときだけ。いまの設定のまま動いているので、理由を読んでから押す(この画面は管理する人だけ) */}
        {refused && (
          <Button size="small" appearance="subtle" disabled={busy} onClick={() => void save(true)}>
            {t('それでも保存する', 'Save anyway')}
          </Button>
        )}
      </div>
      <span className={s.sub}>{t('変えた記録', 'Change history')}</span>
      <SettingsHistory view={view} label={label} />
    </div>
  )
}
