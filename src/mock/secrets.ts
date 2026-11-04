// 撮影・デモ用: 秘密の設定(src/data/secrets.ts)の身代わり。値はどこにも残さず、入っているかだけをメモリに持つ
import type { SecretItem, SecretsService as Real, SecretsView } from '../data/secrets'

const items: SecretItem[] = [
  { name: 'APP_PASSWORD', set: true, locked: false },
  { name: 'OIDC_CLIENT_SECRET', set: true, locked: true },
  { name: 'AI_OUTLET_TOKEN', set: false, locked: false },
]
const view = (): SecretsView => ({ items: items.map((i) => ({ ...i })), file: '/srv/ccp/server/ccp.env', fileMode: 'default' })
const wait = () => new Promise((r) => setTimeout(r, 400))

export const SecretsService: typeof Real = {
  list: async () => ({ data: view() }),
  write: async (name, value) => {
    await wait()
    if (name === 'APP_PASSWORD' && value.length < 8) return { error: '8 文字以上にしてください' }
    items.find((i) => i.name === name)!.set = true
    return { data: view() }
  },
  remove: async (name) => {
    await wait()
    items.find((i) => i.name === name)!.set = false
    return { data: view() }
  },
}
