// 初期設定の画面(settings.setup)。サーバーは server/ccp/setup.py の /api/setup/…。
// 初期設定の間は DB がないので、ほかのサービスを通さずに直接呼ぶ。合言葉(サーバーのログに出る)を見出し x-ccp-setup-key で送る。
// 撮影・デモ用のビルドでは、メモリ上に持つ身代わり(src/mock/setup.ts)に差し替える
import { appPath } from '../appRoot'

export type SetupStepId = 'db' | 'google' | 'assets' | 'password'

export interface SetupStep {
  id: SetupStepId
  done: boolean
  skipped?: boolean
  /** 環境から渡された値(Secrets など)。画面では変えられない */
  locked: boolean
  values: Record<string, string>
  /** 秘密(パスワード)が入っている。値は返さない */
  secretSet?: boolean
}

export interface SetupState {
  needed: boolean
  reason?: string
  /** 合言葉がまだ(または違う) */
  keyRequired?: boolean
  steps?: SetupStep[]
  /** 値を書くファイル */
  file?: string
}

export interface SetupResult {
  ok: boolean
  message: string
  state?: SetupState
}

type Res<T> = { data?: T; error?: string; code?: string }

let key = ''
try {
  key = sessionStorage.getItem('ccp.setupKey') ?? ''
} catch {
  // 覚えられない環境では、開くたびに入れてもらう
}

export function setSetupKey(k: string): void {
  key = k
  try {
    sessionStorage.setItem('ccp.setupKey', k)
  } catch {
    // 同上
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<Res<T>> {
  try {
    const res = await fetch(appPath(url), {
      method,
      headers: { 'x-ccp-setup-key': key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: T; error?: { message: string; code?: string } } | null
    if (!json) return { error: `サーバーの応答が正しくありません(${res.status})` }
    return json.success ? { data: json.data } : { error: json.error?.message ?? 'error', code: json.error?.code }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export const SetupService = {
  state: () => call<SetupState>('GET', '/api/setup/state'),
  /** 保存の前に確かめる(何も書かない) */
  test: (step: SetupStepId, values: Record<string, string>) => call<SetupResult>('POST', `/api/setup/test/${step}`, values),
  /** 確かめて、通ったときだけ書く */
  save: (step: SetupStepId, values: Record<string, string>) => call<SetupResult>('POST', `/api/setup/save/${step}`, values),
  skip: (step: SetupStepId) => call<SetupState>('POST', `/api/setup/skip/${step}`),
  finish: () => call<{ needed: boolean }>('POST', '/api/setup/finish'),
}
