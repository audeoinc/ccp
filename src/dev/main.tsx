// 開発用の画面(/dev/)の入り口。CCP の画面(src/main.tsx)とは別のページとしてビルドする(vite.config.ts の input)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../fonts'
import '../index.css'
import { DevRoot } from './DevApp'

document.documentElement.lang = 'ja'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DevRoot />
  </StrictMode>,
)
