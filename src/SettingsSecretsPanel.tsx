// ⚙ → 全社 →「秘密の設定」(settings.setup)。パスワード・鍵を書くだけの欄。値は読み返せない(入っているかだけ)
import { useEffect, useState } from 'react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, InfoLabel, Input, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import { DeleteRegular, SaveRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
import { SecretsService, type SecretItem, type SecretName, type SecretsView } from './data/secrets'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  row: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalM, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  name: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  env: { fontSize: '10px', color: tokens.colorNeutralForeground3 },
  input: { display: 'flex', alignItems: 'flex-end', gap: tokens.spacingHorizontalS },
  grow: { flexGrow: 1, minWidth: 0 },
  note: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
})

interface Labels {
  name: string
  info: string
  after?: string
}

function Row({ item, labels, onChange }: { item: SecretItem; labels: Labels; onChange: (v: SecretsView) => void }) {
  const s = useStyles()
  const t = useT()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [asking, setAsking] = useState(false)
  const run = async (call: () => ReturnType<typeof SecretsService.list>, wrote: boolean) => {
    setBusy(true)
    setError('')
    setSaved(false)
    const r = await call()
    setBusy(false)
    if (!r.data) return setError(r.error ?? '')
    // 書いた値は、欄にも残さない(読み返せないものを、画面に置いたままにしない)
    setValue('')
    setSaved(wrote)
    onChange(r.data)
  }
  return (
    <div className={s.row}>
      <div className={s.head}>
        <span className={s.name}>{labels.name}</span>
        {item.locked && item.set ? (
          <Badge appearance="tint" color="informative">{t('環境から', 'From environment')}</Badge>
        ) : item.set ? (
          <Badge appearance="tint" color="success">{t('入っています', 'Set')}</Badge>
        ) : (
          <Badge appearance="tint" color="warning">{t('入っていません', 'Not set')}</Badge>
        )}
        <span className={s.env}>{item.name}</span>
      </div>
      {item.locked ? (
        <span className={s.note}>
          {item.set
            ? t('環境から渡された値(Secrets など)です。画面では変えられません。渡している所で変えてください。', 'Provided by the environment (Secrets, etc.). It cannot be changed here; change it where it is provided.')
            : t('この環境では、画面から書きません(CCP_ENV_FILE=off)。要るときは、環境変数で渡して、サーバーを起動し直してください。', 'This environment does not accept values from the screen (CCP_ENV_FILE=off). If needed, pass it as an environment variable and restart the server.')}
        </span>
      ) : (
        <div className={s.input}>
          <Field className={s.grow} validationState={error ? 'error' : 'none'} validationMessage={error || undefined} label={<InfoLabel info={labels.info}>{item.set ? t('新しい値', 'New value') : t('値', 'Value')}</InfoLabel>}>
            <Input type="password" autoComplete="new-password" value={value} disabled={busy} onChange={(_, d) => setValue(d.value)} />
          </Field>
          <Button appearance="primary" icon={<SaveRegular />} disabled={busy || !value.trim()} onClick={() => void run(() => SecretsService.write(item.name, value), true)}>
            {t('保存', 'Save')}
          </Button>
          {item.set && (
            <Button icon={<DeleteRegular />} disabled={busy} onClick={() => setAsking(true)}>
              {t('消す', 'Remove')}
            </Button>
          )}
          {busy && <Spinner size="extra-tiny" />}
        </div>
      )}
      {saved && (
        <MessageBar intent="success" layout="multiline">
          <MessageBarBody>{labels.after ?? t('保存しました。もう効いています。', 'Saved. It is already in effect.')}</MessageBarBody>
        </MessageBar>
      )}
      <Dialog open={asking} onOpenChange={(_, d) => setAsking(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t(`${labels.name}を消しますか?`, `Remove ${labels.name}?`)}</DialogTitle>
            <DialogContent>{t('すぐに効きます。元の値には戻せません(もう一度入れ直してください)。', 'Takes effect immediately. The old value cannot be restored; you would have to enter it again.')}</DialogContent>
            <DialogActions>
              <Button onClick={() => setAsking(false)}>{t('やめる', 'Cancel')}</Button>
              <Button
                appearance="primary"
                onClick={() => {
                  setAsking(false)
                  void run(() => SecretsService.remove(item.name), false)
                }}
              >
                {t('消す', 'Remove')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}

export function SettingsSecretsPanel() {
  const s = useStyles()
  const t = useT()
  const [view, setView] = useState<SecretsView | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void SecretsService.list().then((r) => {
      if (!alive) return
      if (r.data) setView(r.data)
      else setError(r.error ?? '')
    })
    return () => {
      alive = false
    }
  }, [])
  const labels: Record<SecretName, Labels> = {
    APP_PASSWORD: {
      name: t('画面のパスワード', 'App password'),
      info: t('ログイン(SSO)を使わないときに、画面を開くのに要るパスワードです。8 文字以上。自分で決めます。', 'Password needed to open the app when SSO is not used. At least 8 characters. You choose it.'),
      after: t('保存しました。もう効いています。次の操作で、ブラウザーがパスワードを聞いてきたら、いま入れた値を入れてください(ユーザー名は何でも構いません)。', 'Saved and in effect. If the browser asks for a password on your next action, enter this value (any user name works).'),
    },
    OIDC_CLIENT_SECRET: {
      name: t('ログインのクライアントシークレット', 'SSO client secret'),
      info: t('Entra ID などの「アプリの登録」→「証明書とシークレット」で作った値です。期限が切れるとログインできなくなるので、新しい値を作って入れ直します。', 'The value created under App registration → Certificates & secrets in Entra ID (or your provider). Login stops when it expires; create a new one and enter it here.'),
    },
    AI_OUTLET_TOKEN: {
      name: t('AI の出口の合言葉', 'AI outlet token'),
      info: t('AI の出口の層に送る合言葉です。層を作った人に聞きます。出口の URL は ⚙ →「AI の設定」で入れ、そこの「試す」で確認できます。', 'Token sent to the AI outlet layer. Ask whoever runs the layer. The outlet URL is set in Settings → AI settings, where you can test it.'),
    },
  }
  return (
    <div className={s.root}>
      {error && (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!view && !error && <Spinner size="small" />}
      {view?.items.map((item) => <Row key={item.name} item={item} labels={labels[item.name]} onChange={setView} />)}
      {view?.fileMode === 'default' && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            {t(
              `値は、このサーバーの ${view.file} に書きます。コンテナでは、入れ替えや再起動で消えます。Secrets Manager などから環境変数で渡してください。消えない置き場所(EFS など)に置くなら、環境変数 CCP_ENV_FILE でファイルを指します。すべて環境変数で渡すなら、CCP_ENV_FILE=off でこの欄を閉じられます。`,
              `Values are written to ${view.file} on this server. In a container, they are lost when it is replaced or restarted. Pass them as environment variables from a secrets manager. To keep the file on durable storage (EFS, etc.), point the CCP_ENV_FILE environment variable at it. If everything comes from environment variables, CCP_ENV_FILE=off closes these fields.`,
            )}
          </MessageBarBody>
        </MessageBar>
      )}
      {view?.fileMode === 'chosen' && (
        <MessageBar intent="info" layout="multiline">
          <MessageBarBody>
            {t(
              `値は、指定されたファイル ${view.file} に書きます。サーバーが 2 台以上なら、どのサーバーからも同じファイルが見える置き場所にしてください。`,
              `Values are written to the specified file ${view.file}. With two or more servers, every server must see the same file.`,
            )}
          </MessageBarBody>
        </MessageBar>
      )}
    </div>
  )
}
