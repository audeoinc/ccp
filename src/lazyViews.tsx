import { Suspense, lazy, useState, type ComponentProps, type ReactNode } from 'react'
import { Spinner } from '@fluentui/react-components'
import { loadChunk } from './chunkReload'
import { loadSimpleProduction, loadedSimpleProduction } from './simpleProductionChunk'
import { loadCardDetail, loadedCardDetail } from './cardDetailChunk'

// 開いたときに読み込む画面(整理 第2段 ④)。最初に開くときに、使わないかもしれない画面のプログラムまで読まないため。
// ここから読み込む(画面のファイルを、ほかのファイルから直接 import すると、分かれない)
export const SettingsDialog = lazy(() => loadChunk(() => import('./SettingsDialog')).then((m) => ({ default: m.SettingsDialog })))
export const ResultsPage = lazy(() => loadChunk(() => import('./ResultsPage')).then((m) => ({ default: m.ResultsPage })))
export const ImpactView = lazy(() => loadChunk(() => import('./ImpactView')).then((m) => ({ default: m.ImpactView })))
export const LearningEffectFloat = lazy(() => loadChunk(() => import('./LearningEffectFloat')).then((m) => ({ default: m.LearningEffectFloat })))
export const LearningHand = lazy(() => loadChunk(() => import('./LearningHand')).then((m) => ({ default: m.LearningHand })))
export const ProductsView = lazy(() => loadChunk(() => import('./ProductsView')).then((m) => ({ default: m.ProductsView })))
// 結果のシンプルな画面(X89)
export const SimpleResultsPage = lazy(() => loadChunk(() => import('./results/SimpleResultsPage')).then((m) => ({ default: m.SimpleResultsPage })))
export const SimpleProductionPage = lazy(() => loadSimpleProduction().then((m) => ({ default: m.SimpleProductionPage })))
/**
 * 制作のシンプルな画面。読み終わっていれば、lazy を通さずに描く(lazy は、読み終わっていても最初の 1 回は待つので、その間なにも出ない)。
 * どちらで描くかは、出したときに決めて変えない(途中で替えると、作り直しになるため)
 */
export function SimpleProductionView(props: ComponentProps<typeof SimpleProductionPage>) {
  const [Loaded] = useState(loadedSimpleProduction)
  return Loaded ? <Loaded {...props} /> : <SimpleProductionPage {...props} />
}
const CardDetailLazy = lazy(() => loadCardDetail().then((m) => ({ default: m.CardDetail })))
/**
 * 配信カード。読み終わっていれば、lazy を通さずに描く(制作の画面と同じ。lazy は、読み終わっていても最初の 1 回は待つので、その間なにも出ない)。
 * 読み終わる前に開いたときだけ、読み込みを待つ(その間は Later の外の窓を出さない)
 */
export function CardDetailView(props: ComponentProps<typeof CardDetailLazy>) {
  const [Loaded] = useState(loadedCardDetail)
  return Loaded ? <Loaded {...props} /> : <CardDetailLazy {...props} />
}
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
export const FeaturesManager = lazy(() => loadChunk(() => import('./FeaturesManager')).then((m) => ({ default: m.FeaturesManager })))
export const HelpFaqAdmin = lazy(() => loadChunk(() => import('./help/HelpFaqAdmin')).then((m) => ({ default: m.HelpFaqAdmin })))
export const SampleShopPanel = lazy(() => loadChunk(() => import('./SampleShopPanel')).then((m) => ({ default: m.SampleShopPanel })))
export const BrandPanel = lazy(() => loadChunk(() => import('./BrandPanel')).then((m) => ({ default: m.BrandPanel })))
export const DevRequestsDialog = lazy(() => loadChunk(() => import('./DevRequestsDialog')).then((m) => ({ default: m.DevRequestsDialog })))

/** 分けて読み込む画面を、読み込み終えるまで待つ所。画面ごとに置く(ヘッダーなど、ほかの所は消さない) */
export function Later({ children, spin }: { children: ReactNode; /** 待つ間に、くるくるを出す(ページ・設定の欄。窓は出さない) */ spin?: boolean }) {
  return <Suspense fallback={spin ? <Spinner size="small" /> : null}>{children}</Suspense>
}
