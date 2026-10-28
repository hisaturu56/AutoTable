"""パネルのインストール用ファイルを作る。

- dist/AutoTable.zxp        ZXP UXP installer などで入れる署名付きファイル

できたファイルは download/ にもコピーする（GitHub からダウンロードできるように、download/ は git に入れる）

.zxp の署名には自己署名の証明書（tools/zxp-cert.p12、なければ keytool で作る。git には入れない）を使う。
署名は tools/SignZxp.java（Java 17 以降）で付ける。

.zxp の中身：panel/ の中身 + scripts/ のスクリプト
    jsx/create_table.jsx    scripts/テーブル自動作成.jsx のコピー
    jsx/adjust_images.jsx   scripts/キャラ画像の調整.jsx のコピー
    jsx/export_png.jsx      scripts/表の書き出し.jsx のコピー

日本語のファイル名が化けないよう、中のファイル名は英語にする。
（2026-10-28 まで作っていた install.bat 入りの zip（予備）はなくした）
"""
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
DOWNLOAD = ROOT / "download"
ZXP = DIST / "AutoTable.zxp"
STAGE = DIST / "AutoTable"
CERT = ROOT / "tools" / "zxp-cert.p12"
CERT_PASSWORD = "autotable"  # 自己署名の証明書用（秘密の情報ではない）

SCRIPTS = {
    "create_table.jsx": "テーブル自動作成.jsx",
    "adjust_images.jsx": "キャラ画像の調整.jsx",
    "export_png.jsx": "表の書き出し.jsx",
}


def stage():
    """パネルのフォルダ（panel/ + スクリプト）を dist/AutoTable に組み立てる"""
    if STAGE.exists():
        shutil.rmtree(STAGE)
    shutil.copytree(ROOT / "panel", STAGE)
    (STAGE / "jsx").mkdir()
    for name, source in SCRIPTS.items():
        shutil.copyfile(ROOT / "scripts" / source, STAGE / "jsx" / name)


def build_zxp():
    if not CERT.exists():
        subprocess.run(["keytool", "-genkeypair", "-alias", "autotable", "-keyalg", "RSA", "-keysize", "2048",
                        "-validity", "9125", "-storetype", "PKCS12", "-keystore", str(CERT),
                        "-storepass", CERT_PASSWORD, "-keypass", CERT_PASSWORD,
                        "-dname", "CN=AutoTable, O=hisaturu56, C=JP"], check=True)
    # ignoreLineBreaks：署名の値を改行なしで書く（ほかのツールでも読みやすい形）
    subprocess.run(["java", "-Dcom.sun.org.apache.xml.internal.security.ignoreLineBreaks=true", str(ROOT / "tools" / "SignZxp.java"), str(STAGE), str(ZXP), str(CERT), CERT_PASSWORD],
                   check=True)


def main():
    DIST.mkdir(exist_ok=True)
    stage()
    build_zxp()
    DOWNLOAD.mkdir(exist_ok=True)
    shutil.copyfile(ZXP, DOWNLOAD / ZXP.name)
    print(DOWNLOAD)


if __name__ == "__main__":
    main()
