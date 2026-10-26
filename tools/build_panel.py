"""パネルのインストール用 zip（dist/PolaroidTable_panel.zip）を作る。

zip の中身：
  install.bat               ダブルクリックでパネルを入れる
  uninstall.bat             パネルを消す
  PolaroidTable/            パネル本体（panel/ の中身 + scripts/ のスクリプト）
    jsx/create_table.jsx    scripts/ポロライドテーブル自動作成.jsx のコピー
    jsx/adjust_images.jsx   scripts/キャラ画像の調整.jsx のコピー

Windows で zip を展開したときに日本語のファイル名が化けないよう、zip の中のファイル名は英語にする。
"""
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "PolaroidTable_panel.zip"

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


def main():
    OUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("install.bat", crlf(INSTALL))
        z.writestr("uninstall.bat", crlf(UNINSTALL))
        for path in sorted((ROOT / "panel").rglob("*")):
            if path.is_file():
                z.write(path, "PolaroidTable/" + path.relative_to(ROOT / "panel").as_posix())
        for name, source in SCRIPTS.items():
            z.write(ROOT / "scripts" / source, "PolaroidTable/jsx/" + name)
    print(OUT)


if __name__ == "__main__":
    main()
