#target illustrator
/*
 * 表の書き出し.jsx
 * 今のアートボード（表）を、背景透過の PNG で「素材」フォルダへ書き出す
 *
 * 使い方：書き出したい表のアートボードを選んで（表をクリックすると、そのアートボードが選ばれる）実行する
 *   - ファイル名はアートボード名（ポロライドテーブル自動作成で付けた表の名前）
 *   - 保存先・書き出し方は、ポロライドテーブル自動作成・キャラ画像の調整と同じ
 */

(function () {
    var CONFIG = {
        exportFolderName: "素材"   // Illustrator ファイルと同じ場所にあるこのフォルダへ保存（なければ作る）
    };

    if (!app.documents.length) {
        alert("ドキュメントが開いていません。");
        return;
    }
    var doc = app.activeDocument;
    var index = doc.artboards.getActiveArtboardIndex();
    var name = doc.artboards[index].name;

    var dest = exportPNG(index, name);
    if (dest) alert("PNG を書き出しました（アートボード " + (index + 1) + "「" + name + "」）：\n" + dest.fsName);

    // ================================================================

    function exportPNG(index, name) {
        var fileName = name.replace(/[\\\/:*?"<>|]/g, "_") + ".png";  // ファイル名に使えない文字は _ に
        var dest = null;
        var folder = materialFolder();
        if (folder) {
            dest = new File(folder.fsName + "/" + fileName);
            if (dest.exists && !confirm("「" + CONFIG.exportFolderName + "」フォルダに同じ名前の PNG があります。上書きしますか？\n"
                    + dest.fsName + "\n\n「いいえ」を選ぶと、保存先を選ぶ画面を出します。")) {
                dest = dest.saveDlg("PNG の保存先", "*.png");
            }
        } else {
            dest = new File(fileName).saveDlg("PNG の保存先", "*.png");
        }
        if (!dest) return null;

        doc.selection = null;
        doc.artboards.setActiveArtboardIndex(index);
        var o = new ExportOptionsPNG24();
        o.antiAliasing = true;
        o.transparency = true;
        o.artBoardClipping = true;
        o.horizontalScale = 100;
        o.verticalScale = 100;
        doc.exportFile(dest, ExportType.PNG24, o);
        return dest;
    }

    // Illustrator ファイルと同じ場所の「素材」フォルダ（なければ作る）。ファイルが未保存なら null
    function materialFolder() {
        var base = null;
        try {
            if (doc.fullName && doc.fullName.exists) base = doc.fullName.parent;
        } catch (e) {
            base = null;
        }
        if (!base) return null;
        var folder = new Folder(base.fsName + "/" + CONFIG.exportFolderName);
        if (folder.exists || folder.create()) return folder;
        return null;
    }
})();
