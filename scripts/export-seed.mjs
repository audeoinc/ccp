// 初期データ(docs/*.csv → src/mock/seed.ts)を、DB に入れる形(server/seed.json)に書き出す。
//   npm run seed:export
// モック(撮影用)と本番・Workbench の初期データが、同じ元データから始まるようにするため。seed.ts を直したら、これを実行して seed.json もコミットする。
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({
  configFile: false,
  root,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
})
try {
  const m = await server.ssrLoadModule('/src/mock/seed.ts')
  const data = {
    hero_images: m.heroes,
    products: m.products,
    campaigns: m.campaigns,
    delivery_cards: m.cards,
    delivery_products: m.deliveryProducts,
    weekly_performances: m.weekly,
    product_policies: m.policies,
    layout_templates: m.layoutTemplates,
    card_notes: m.cardNotes,
    weeks: m.weeks,
    delivery_results: m.deliveryResults,
    change_logs: m.changeLogs,
    users: m.users,
    approval_groups: m.approvalGroups,
    approval_group_members: m.approvalGroupMembers,
    approval_rules: m.approvalRules,
    approval_requests: m.approvalRequests,
    approval_reviewers: m.approvalReviewers,
    notifications: m.notifications,
    production_requests: m.productionRequests,
    note_reactions: m.noteReactions,
    product_metrics: m.productMetrics,
    category_metrics: m.categoryMetrics,
  }
  writeFileSync(join(root, 'server', 'seed.json'), JSON.stringify(data, null, 1) + '\n')
  for (const [k, v] of Object.entries(data)) console.log(k, v.length)
} finally {
  await server.close()
}
