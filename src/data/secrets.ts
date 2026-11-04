// ⚙ →「秘密の設定」(settings.setup)。サーバーは server/ccp/secretstore.py の /api/settings/secrets(管理する人だけ)。
// 値は返ってこない。入っているか・環境から渡されているかだけ。撮影・デモ用のビルドでは、身代わり(src/mock/secrets.ts)に差し替える
import { callApi } from '../gcp/services'

export type SecretName = 'APP_PASSWORD' | 'OIDC_CLIENT_SECRET' | 'AI_OUTLET_TOKEN'

export interface SecretItem {
  name: SecretName
  set: boolean
  /** 環境から渡された値(Secrets など)。画面では変えられない */
  locked: boolean
}

export interface SecretsView {
  items: SecretItem[]
  /** 値を書くファイル */
  file: string
  /** default = 既定の場所(コンテナなどでは消える)/ chosen = CCP_ENV_FILE で場所を指定 / off = 画面では書かない */
  fileMode: 'default' | 'chosen' | 'off'
}

type Res = { data?: SecretsView; error?: string }

async function call(method: string, url: string, body?: unknown): Promise<Res> {
  const r = await callApi<SecretsView>(method, url, body)
  return r.success && r.data !== undefined ? { data: r.data } : { error: r.error?.message ?? 'error' }
}

export const SecretsService = {
  list: () => call('GET', '/api/settings/secrets'),
  write: (name: SecretName, value: string) => call('PUT', `/api/settings/secrets/${name}`, { value }),
  remove: (name: SecretName) => call('DELETE', `/api/settings/secrets/${name}`),
}
