# 見本の画面を返すだけのサーバー(preview/server.py)。標準の部品だけなので、依存を入れない。
# 見本のファイルは、この中に入れない(置き場所のフォルダを、読み取り専用で /site につなぐ)
FROM python:3.12-slim
WORKDIR /app
COPY server.py .
ENV PYTHONUNBUFFERED=1
CMD ["python", "server.py"]
