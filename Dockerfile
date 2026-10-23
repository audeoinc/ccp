# CCP(Campaign Contents Planner)の GCP 版: Cloud Run 用のコンテナ。
# 1 段目で画面(GCP 版のビルド)を作り、2 段目の Python のサーバーが、それを配信する(1 プロセス)。
#   普段は npm run deploy:gcp(cloudbuild.yaml の kaniko で、層をキャッシュしてビルドする。手順は docs/GCP.md)
# 層のキャッシュが効くように、変わりにくいもの(依存の一覧 → 依存の導入)を先に、変わりやすいもの(ソース)を後に置く。

FROM node:26-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
# 画面のビルドに要るものだけを入れる(サーバー・文書だけを変えたときは、ビルドの層もキャッシュから使える)。
# 画面のビルドが、ここにないファイルを読むようになったら、ここに足す。
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public public
COPY src src
# 開発用の画面(/dev/)の入り口。vite.config.ts の input にあるので、ないとビルドが止まる(本番では CCP_DEVTOOLS を設定しないので、/dev/ は 404)
COPY dev dev
RUN npx vite build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY server/requirements.txt server/requirements-hosted.txt server/
RUN pip install -r server/requirements.txt -r server/requirements-hosted.txt
COPY server server
COPY --from=web /app/dist-gcp dist-gcp
WORKDIR /app/server
# Cloud Run は PORT(既定 8080)でリッスンさせる
ENV PORT=8080 \
    STATIC_DIR=/app/dist-gcp
CMD exec uvicorn ccp.main:app --host 0.0.0.0 --port ${PORT}
