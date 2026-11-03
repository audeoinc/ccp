"""開発元の本番(Cloud Run + Cloud SQL)だけで使う仕組み。

利用先に渡すリリース(npm run release:aws)には、このフォルダを入れない。
ここの外のコードは、このフォルダがなくても動くようにする(import は try / except ImportError で囲む)。
"""


def db_controller():
    """DB の自動起動・停止(dbctl)を有効にしていれば、その controller を返す(ccp/dbready.py から呼ばれる)"""
    from . import dbctl

    return dbctl.controller() if dbctl.enabled() else None
