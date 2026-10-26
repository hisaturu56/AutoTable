"""パネルのインストール用ファイルを作る。

- dist/PolaroidTable.zxp        ZXP UXP installer などで入れる署名付きファイル（おすすめ）
- dist/PolaroidTable_panel.zip  install.bat で入れる zip（ZXP が使えないとき用）

.zxp の署名には自己署名の証明書（tools/zxp-cert.p12、なければ keytool で作る。git には入れない）を使う。
署名は tools/SignZxp.java（Java 17 以降）で付ける。

zip の中身：
  install.bat               ダブルクリックでパネルを入れる
  uninstall.bat             パネルを消す
  PolaroidTable/            パネル本体（panel/ の中身 + scripts/ のスクリプト）
    jsx/create_table.jsx    scripts/ポロライドテーブル自動作成.jsx のコピー
    jsx/adjust_images.jsx   scripts/キャラ画像の調整.jsx のコピー

Windows で zip を展開したときに日本語のファイル名が化けないよう、zip の中のファイル名は英語にする。
"""
import pathlib
import shutil
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = DIST / "PolaroidTable_panel.zip"
ZXP = DIST / "PolaroidTable.zxp"
STAGE = DIST / "PolaroidTable"
CERT = ROOT / "tools" / "zxp-cert.p12"
CERT_PASSWORD = "polaroidtable"  # 自己署名の証明書用（秘密の情報ではない）

SCRIPTS = {
    "create_table.jsx": "ポロライドテーブル自動作成.jsx",
    "adjust_images.jsx": "キャラ画像の調整.jsx",
}

INSTALL = r"""@echo off
chcp 65001 >nul
setlocal
set "SRC=%~dp0PolaroidTable"
set "DEST=%APPDATA%\Adobe\CEP\extensions\PolaroidTable"

rem 署名なしのパネルを読み込めるようにする（Illustrator のバージョンごとの設定）
for %%v in (9 10 11 12 13 14) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%SRC%" "%DEST%\" /e /i /y /q >nul
if errorlevel 1 (
  echo インストールに失敗しました。
  pause
  exit /b 1
)

echo.
echo ポロライドテーブル自動作成のパネルをインストールしました。
echo Illustrator を再起動して、
echo 「ウィンドウ」→「エクステンション」→「ポロライドテーブル自動作成」を開いてください。
echo.
pause
"""

UNINSTALL = r"""@echo off
chcp 65001 >nul
set "DEST=%APPDATA%\Adobe\CEP\extensions\PolaroidTable"
if exist "%DEST%" rmdir /s /q "%DEST%"
echo ポロライドテーブル自動作成のパネルを削除しました。Illustrator を再起動してください。
pause
"""


def crlf(text):
    return text.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")


def stage():
    """パネルのフォルダ（panel/ + スクリプト）を dist/PolaroidTable に組み立てる"""
    if STAGE.exists():
        shutil.rmtree(STAGE)
    shutil.copytree(ROOT / "panel", STAGE)
    (STAGE / "jsx").mkdir()
    for name, source in SCRIPTS.items():
        shutil.copyfile(ROOT / "scripts" / source, STAGE / "jsx" / name)


def build_zip():
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("install.bat", crlf(INSTALL))
        z.writestr("uninstall.bat", crlf(UNINSTALL))
        for path in sorted(STAGE.rglob("*")):
            if path.is_file():
                z.write(path, "PolaroidTable/" + path.relative_to(STAGE).as_posix())
    print(OUT)


def build_zxp():
    if not CERT.exists():
        subprocess.run(["keytool", "-genkeypair", "-alias", "polaroidtable", "-keyalg", "RSA", "-keysize", "2048",
                        "-validity", "9125", "-storetype", "PKCS12", "-keystore", str(CERT),
                        "-storepass", CERT_PASSWORD, "-keypass", CERT_PASSWORD,
                        "-dname", "CN=PolaroidTable, O=hisaturu56, C=JP"], check=True)
    # ignoreLineBreaks：署名の値を改行なしで書く（ほかのツールでも読みやすい形）
    subprocess.run(["java", "-Dcom.sun.org.apache.xml.internal.security.ignoreLineBreaks=true", str(ROOT / "tools" / "SignZxp.java"), str(STAGE), str(ZXP), str(CERT), CERT_PASSWORD],
                   check=True)


def main():
    DIST.mkdir(exist_ok=True)
    stage()
    build_zip()
    build_zxp()


if __name__ == "__main__":
    main()
