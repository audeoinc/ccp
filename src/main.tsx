import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import './index.css'
import Root from './Root.tsx'
import { getLang } from './i18n'
import { applyUiScale } from './uiScale'

document.documentElement.lang = getLang()
// 表示の大きさ(X60)は、最初の描画の前に効かせる(大きさが変わって見えるのを避ける)
applyUiScale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
