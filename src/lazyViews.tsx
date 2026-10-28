import { Suspense, lazy, type ReactNode } from 'react'
import { Spinner } from '@fluentui/react-components'
import { loadChunk } from './chunkReload'

// 開いたときに読み込む画面(整理 第2段 ④)。最初に開くときに、使わないかもしれない画面のプログラムまで読まないため。
// ここから読み込む(画面のファイルを、ほかのファイルから直接 import すると、分かれない)
export const SettingsDialog = lazy(() => loadChunk(() => import('./SettingsDialog')).then((m) => ({ default: m.SettingsDialog })))
export const ResultsPage = lazy(() => loadChunk(() => import('./ResultsPage')).then((m) => ({ default: m.ResultsPage })))
export const ImpactView = lazy(() => loadChunk(() => import('./ImpactView')).then((m) => ({ default: m.ImpactView })))
export const LearningEffectFloat = lazy(() => loadChunk(() => import('./LearningEffectFloat')).then((m) => ({ default: m.LearningEffectFloat })))
export const LearningHand = lazy(() => loadChunk(() => import('./LearningHand')).then((m) => ({ default: m.LearningHand })))
export const ProductsView = lazy(() => loadChunk(() => import('./ProductsView')).then((m) => ({ default: m.ProductsView })))
export const ResultPeek = lazy(() => loadChunk(() => import('./ResultPeek')).then((m) => ({ default: m.ResultPeek })))
export const ProductionPage = lazy(() => loadChunk(() => import('./ProductionPage')).then((m) => ({ default: m.ProductionPage })))
export const AlertsPage = lazy(() => loadChunk(() => import('./AlertsPage')).then((m) => ({ default: m.AlertsPage })))
export const BulkWorkspace = lazy(() => loadChunk(() => import('./BulkWorkspace')).then((m) => ({ default: m.BulkWorkspace })))
export const TemplateManager = lazy(() => loadChunk(() => import('./TemplateManager')).then((m) => ({ default: m.TemplateManager })))
// 設定の画面の「テンプレート」(テンプレートの管理を、別の大きなフロートで開く)
export const TemplateSettingsPane = lazy(() => loadChunk(() => import('./TemplateFloat')).then((m) => ({ default: m.TemplateSettingsPane })))
export const PolicyManager = lazy(() => loadChunk(() => import('./PolicyManager')).then((m) => ({ default: m.PolicyManager })))
export const PatternPanel = lazy(() => loadChunk(() => import('./PatternPanel')).then((m) => ({ default: m.PatternPanel })))
export const CountryCriteriaPanel = lazy(() => loadChunk(() => import('./CountryCriteriaPanel')).then((m) => ({ default: m.CountryCriteriaPanel })))
export const CountryTemplatesPanel = lazy(() => loadChunk(() => import('./CountryTemplatesPanel')).then((m) => ({ default: m.CountryTemplatesPanel })))
export const CountryLearningsPanel = lazy(() => loadChunk(() => import('./CountryLearningsPanel')).then((m) => ({ default: m.CountryLearningsPanel })))
export const CountryPoliciesPanel = lazy(() => loadChunk(() => import('./CountryPoliciesPanel')).then((m) => ({ default: m.CountryPoliciesPanel })))
export const PeopleManager = lazy(() => loadChunk(() => import('./PeopleManager')).then((m) => ({ default: m.PeopleManager })))
export const HeroLibrary = lazy(() => loadChunk(() => import('./HeroLibrary')).then((m) => ({ default: m.HeroLibrary })))
export const HelpFaqAdmin = lazy(() => loadChunk(() => import('./help/HelpFaqAdmin')).then((m) => ({ default: m.HelpFaqAdmin })))
export const SampleShopPanel = lazy(() => loadChunk(() => import('./SampleShopPanel')).then((m) => ({ default: m.SampleShopPanel })))
export const BrandPanel = lazy(() => loadChunk(() => import('./BrandPanel')).then((m) => ({ default: m.BrandPanel })))
export const DevRequestsDialog = lazy(() => loadChunk(() => import('./DevRequestsDialog')).then((m) => ({ default: m.DevRequestsDialog })))

/** 分けて読み込む画面を、読み込み終えるまで待つ所。画面ごとに置く(ヘッダーなど、ほかの所は消さない) */
export function Later({ children, spin }: { children: ReactNode; /** 待つ間に、くるくるを出す(ページ・設定の欄。窓は出さない) */ spin?: boolean }) {
  return <Suspense fallback={spin ? <Spinner size="small" /> : null}>{children}</Suspense>
}
