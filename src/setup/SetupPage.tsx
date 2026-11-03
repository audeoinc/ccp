// 初期設定の画面(settings.setup。2026-11-03 利用者「忘れていても問題ないように」)。
// 起動に要る設定が足りない(DB のつなぎ先がない・DB につながらない)とき、サーバーは初期設定の状態で動き、画面はこれだけを出す。
// 人が手順を覚えていなくても、上から順に入れれば動き出すように: 項目ごとに「何を入れるか・どこで調べるか」を書き、
// 「つながるか確認」が通らないと保存しない(次へ進めない)。途中でやめても、済んでいない最初の段から始まる。
// DB がないので、機能の公開・非公開には従わない(いつも出す)。守りは、サーバーのログに出る合言葉。サーバーは server/ccp/setup.py
import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Field,
  InfoLabel,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { CheckmarkCircleRegular, PlugConnectedRegular, SaveRegular } from '@fluentui/react-icons'
import { SetupService, setSetupKey, type SetupResult, type SetupState, type SetupStep, type SetupStepId } from '../data/setup'
import { useT } from '../i18n'
import { typo } from '../typo'

const useStyles = makeStyles({
  page: { display: 'flex', justifyContent: 'center', padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`, boxSizing: 'border-box' },
  col: { width: '100%', maxWidth: '760px', display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalL },
  title: { fontSize: tokens.fontSizeBase600, fontWeight: tokens.fontWeightSemibold },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  card: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  head: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, cursor: 'pointer' },
  num: { ...typo.heading },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', columnGap: tokens.spacingHorizontalM, rowGap: tokens.spacingVerticalS, alignItems: 'start' },
  actions: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  key: { display: 'flex', alignItems: 'flex-end', columnGap: tokens.spacingHorizontalS },
  grow: { flex: 1 },
})

const ORDER: SetupStepId[] = ['db', 'google', 'assets', 'password']

function StepBadge({ step, current }: { step: SetupStep; current: boolean }) {
  const t = useT()
  // あとでにした段は、⚙ の「設定の状態」でも足りない行に出る。ここでも目に付く色にする
  if (step.skipped) return <Badge appearance="tint" color="warning">{t('あとで', 'Later')}</Badge>
  if (step.done) return <Badge appearance="tint" color="success">{t('済み', 'Done')}</Badge>
  if (current) return <Badge appearance="filled" color="brand">{t('いま', 'Now')}</Badge>
  return <Badge appearance="tint" color="informative">{t('まだ', 'Not yet')}</Badge>
}

/** 合言葉を入れる所(サーバーのログを見られる人だけが、初期設定を進められるように) */
function KeyGate({ onEnter }: { onEnter: () => void }) {
  const s = useStyles()
  const t = useT()
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)
  const enter = async () => {
    setSetupKey(value.trim())
    const r = await SetupService.state()
    if (r.data?.keyRequired) setWrong(true)
    else onEnter()
  }
  return (
    <Card className={s.card}>
      <div className={s.key}>
        <Field
          className={s.grow}
          validationState={wrong ? 'error' : 'none'}
          validationMessage={wrong ? t('合言葉が違います', 'Wrong passphrase') : undefined}
          label={
            <InfoLabel info={t('サーバーを起動したターミナル(サーバーのログ)に、「初期設定が要ります」と一緒に出ています。起動し直すと変わります。', 'Shown in the terminal (server log) where the server was started, next to "Setup required". It changes when the server restarts.')}>
              {t('合言葉', 'Passphrase')}
            </InfoLabel>
          }
        >
          <Input value={value} onChange={(_, d) => setValue(d.value)} onKeyDown={(e) => e.key === 'Enter' && void enter()} />
        </Field>
        <Button appearance="primary" disabled={!value.trim()} onClick={() => void enter()}>
          {t('始める', 'Start')}
        </Button>
      </div>
    </Card>
  )
}

/** 段の中身(欄・確認・保存)。値は段ごとに持ち、保存で確かめが通ったときだけ書く */
function StepBody({ step, onSaved }: { step: SetupStep; onSaved: (s: SetupState) => void }) {
  const s = useStyles()
  const t = useT()
  const [form, setForm] = useState<Record<string, string>>({ ...step.values })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setResult(null)
  }
  const run = async (save: boolean) => {
    setBusy(true)
    setError('')
    const r = save ? await SetupService.save(step.id, form) : await SetupService.test(step.id, form)
    setBusy(false)
    if (!r.data) return setError(r.error ?? '')
    setResult(r.data)
    if (save && r.data.ok && r.data.state) onSaved(r.data.state)
  }
  const skip = async () => {
    const r = await SetupService.skip(step.id)
    if (r.data) onSaved(r.data)
    else setError(r.error ?? '')
  }
  // 項目ごとに「何を入れるか・どこで調べるか」を ⓘ に書く(手順書を探しに行かなくても済むように)
  const field = (key: string, label: string, info: string, opts: { type?: 'password'; placeholder?: string } = {}) => (
    <Field label={<InfoLabel info={info}>{label}</InfoLabel>}>
      <Input type={opts.type} value={form[key] ?? ''} placeholder={opts.placeholder} disabled={step.locked} onChange={(_, d) => set(key, d.value)} />
    </Field>
  )
  return (
    <>
      {step.locked && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>{t('この段の値は、環境から渡されています(Secrets・環境変数など)。画面では変えられません。確かめるだけです。', 'These values come from the environment (Secrets, environment variables). They cannot be changed here; you can only check them.')}</MessageBarBody>
        </MessageBar>
      )}
      {step.id === 'db' && (
        <div className={s.grid}>
          {field('host', t('ホスト', 'Host'), t('PostgreSQL のサーバーの名前か IP。同じ機械なら localhost。マネージドの DB なら、その DB の画面の「エンドポイント」。分からなければ、サーバーを立てた人に聞きます。', 'PostgreSQL server name or IP. localhost if on the same machine. For a managed DB, its "endpoint". Ask whoever set up the server.'))}
          {field('port', t('ポート', 'Port'), t('ふつうは 5432。', 'Usually 5432.'))}
          {field('name', t('DB の名前', 'Database name'), t('CCP 用に作った DB の名前(例 ccp)。先に PostgreSQL で作っておきます。', 'The database created for CCP (e.g. ccp). Create it in PostgreSQL first.'))}
          {field('user', t('ユーザー', 'User'), t('その DB に書けるユーザー(例 ccp_app)。', 'A user that can write to that database (e.g. ccp_app).'))}
          {field('password', t('パスワード', 'Password'), t('そのユーザーのパスワード。記号(@ や :)はそのまま入れてかまいません。入れた値は二度と画面に出しません。', 'That user’s password. Symbols such as @ and : are fine as is. It is never shown again.'), {
            type: 'password',
            placeholder: step.secretSet ? t('入っています(変えないなら空のまま)', 'Set (leave blank to keep)') : '',
          })}
        </div>
      )}
      {step.id === 'google' && (
        <div className={s.grid}>
          {field('project', t('Google Cloud のプロジェクト(ID)', 'Google Cloud project (ID)'), t('Vertex AI(AI)と BigQuery を使うプロジェクトの ID。Google Cloud の画面の上の、プロジェクトの選択に出ています。認証(サービスアカウント)は、画面では入れず、環境から渡します。', 'The project ID used for Vertex AI and BigQuery (shown in the project picker in the Google Cloud console). Credentials (service account) are provided by the environment, not here.'))}
          {field('location', t('場所', 'Location'), t('Vertex AI を呼ぶ場所。ふつうは global。', 'Where Vertex AI is called. Usually global.'))}
        </div>
      )}
      {step.id === 'assets' &&
        field('dir', t('写真の置き場所(フォルダ)', 'Photo folder'), t('商品・メイン画像の写真を置くフォルダの絶対パス(例 /srv/ccp/images)。サーバーを動かすユーザーが書ける所にします。なければ作ります。サーバーを 2 台以上にするときは、共有の置き場所が要ります。', 'Absolute path of the folder for product and main images (e.g. /srv/ccp/images). The server user must be able to write there; it is created if missing. With two or more servers, use shared storage.'))}
      {step.id === 'password' && (
        <>
          {field('password', t('画面のパスワード', 'App password'), t('CCP の画面を開くときに聞くパスワード(8 文字以上)。保存すると、すぐにブラウザがパスワードを聞きます(ユーザー名は何でもよい)。入口の手前でログイン(SSO など)を守っているなら、「あとで」でかまいません。', 'Password asked when opening CCP (8+ characters). After saving, the browser asks for it right away (any user name). If a sign-in (SSO etc.) protects the entrance, choose "Later".'), {
            type: 'password',
            placeholder: step.secretSet ? t('入っています(変えないなら空のまま)', 'Set (leave blank to keep)') : '',
          })}
        </>
      )}
      {result && (
        <MessageBar intent={result.ok ? 'success' : 'error'} layout="multiline">
          <MessageBarBody>{result.message}</MessageBarBody>
        </MessageBar>
      )}
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      <div className={s.actions}>
        {busy && <Spinner size="extra-tiny" />}
        <Button icon={<PlugConnectedRegular />} disabled={busy} onClick={() => void run(false)}>
          {step.id === 'assets' ? t('書けるか確認', 'Test') : step.id === 'password' ? t('使えるか確認', 'Test') : t('つながるか確認', 'Test')}
        </Button>
        {!step.locked && (
          <Button appearance="primary" icon={<SaveRegular />} disabled={busy} onClick={() => void run(true)}>
            {t('確認して保存', 'Test and save')}
          </Button>
        )}
        {step.id !== 'db' && !step.done && (
          <Button appearance="subtle" disabled={busy} onClick={() => void skip()}>
            {t('あとで', 'Later')}
          </Button>
        )}
      </div>
    </>
  )
}

export function SetupPage() {
  const s = useStyles()
  const t = useT()
  const [state, setState] = useState<SetupState | null>(null)
  const [open, setOpen] = useState<SetupStepId | 'finish' | null>(null)
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)

  const take = useCallback((st: SetupState) => {
    setState(st)
    // 済んでいない最初の段を開く(途中でやめても、続きから)
    setOpen(st.steps ? (st.steps.find((x) => !x.done)?.id ?? 'finish') : null)
  }, [])
  const read = useCallback(async () => {
    const r = await SetupService.state()
    if (r.data) take(r.data)
    else setError(r.error ?? '')
  }, [take])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開いたときに、いまの設定を読む
    void read()
  }, [read])

  const finish = async () => {
    setFinishing(true)
    const r = await SetupService.finish()
    setFinishing(false)
    if (!r.data) return setError(r.error ?? '')
    // ふつうの画面を、最初から読み込み直す(設定の画面は ⚙ → 全社 →「設定の状態」へ)
    location.replace(location.pathname)
  }

  const names: Record<SetupStepId, string> = {
    db: t('DB(PostgreSQL)', 'Database (PostgreSQL)'),
    google: t('Google Cloud(AI・BigQuery)', 'Google Cloud (AI, BigQuery)'),
    assets: t('写真の置き場所', 'Photo storage'),
    password: t('画面のパスワード', 'App password'),
  }
  const steps = state?.steps ?? []
  const dbDone = steps.find((x) => x.id === 'db')?.done
  return (
    <div className={s.page}>
      <div className={s.col}>
        <span className={s.title}>{t('初期設定', 'First-time setup')}</span>
        <span className={s.note}>
          {t('このサーバーを動かすのに要る設定が、まだそろっていません。上から順に入れてください。どの段も、確認が通ると保存されます。途中でやめても、次に開くと続きから始まります。', 'Settings needed to run this server are not complete yet. Fill them in from the top. Each step is saved once its check passes. If you stop midway, you resume where you left off.')}
        </span>
        {state?.reason && (
          <MessageBar intent="warning" layout="multiline">
            <MessageBarBody>{state.reason}</MessageBarBody>
          </MessageBar>
        )}
        {error && (
          <MessageBar intent="error" layout="multiline">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {!state && !error && <Spinner size="small" />}
        {state?.keyRequired && <KeyGate onEnter={() => void read()} />}
        {ORDER.map((id, i) => {
          const step = steps.find((x) => x.id === id)
          if (!step) return null
          return (
            <Card key={id} className={s.card}>
              <div className={s.head} role="button" tabIndex={0} aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(open === id ? null : id)}>
                <span className={s.num}>
                  {i + 1}. {names[id]}
                </span>
                <StepBadge step={step} current={open === id} />
              </div>
              {open === id && <StepBody step={step} onSaved={take} />}
            </Card>
          )
        })}
        {steps.length > 0 && (
          <Card className={s.card}>
            <div className={s.head}>
              <span className={s.num}>5. {t('始める', 'Start')}</span>
            </div>
            <span className={s.note}>
              {t(
                'DB の段が済めば、始められます。BigQuery の表の場所と AI のモデルは、始めたあとに ⚙ → 全社 →「設定の状態」で、足りない所と直し方を見ながら入れます(「直す」でその画面に移ります)。',
                'You can start once the database step is done. BigQuery locations and the AI model are set afterwards in Settings → Company → "Settings health", which shows what is missing and how to fix it.',
              )}
            </span>
            {state?.file && <span className={s.note}>{t(`値は ${state.file} に書きました(秘密を含むので、人に渡さない・Git に入れない)。`, `Values were written to ${state.file} (contains secrets; do not share or commit).`)}</span>}
            <div className={s.actions}>
              {finishing && <Spinner size="extra-tiny" />}
              <Button appearance="primary" icon={<CheckmarkCircleRegular />} disabled={!dbDone || finishing} onClick={() => void finish()}>
                {t('始める', 'Start')}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
