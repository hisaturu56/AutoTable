#target illustrator
/*
 * 表の書き出し.jsx
 * アートボード（表）を、背景透過の PNG で「素材」フォルダへ書き出す
 *
 * 使い方：実行する
 *   - アートボードが 1 つなら、そのまま書き出す
 *   - 複数あるときは、どれを書き出すかチェックボックスで選ぶ画面を出す（最初は今のアートボードだけにチェック）
 *   - ファイル名はアートボード名（テーブル自動作成で付けた表の名前）
 *   - 保存先・書き出し方は、テーブル自動作成・キャラ画像の調整と同じ
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
    var active = doc.artboards.getActiveArtboardIndex();

    var indexes = doc.artboards.length > 1 ? pickArtboards() : [0];
    if (!indexes || !indexes.length) return;

    var done = [];
    for (var i = 0; i < indexes.length; i++) {
        var dest = exportPNG(indexes[i], doc.artboards[indexes[i]].name);
        if (dest) done.push(dest.fsName);
    }
    doc.artboards.setActiveArtboardIndex(active);
    if (done.length) alert("PNG を " + done.length + " 枚書き出しました：\n" + done.join("\n"));

    // ================================================================

    // 書き出すアートボードをチェックボックスで選ぶ。キャンセルなら null
    function pickArtboards() {
        var dlg = new Window("dialog", "PNG で書き出す");
        dlg.alignChildren = "fill";
        dlg.add("statictext", undefined, "書き出すアートボード（表）にチェックを入れてください");
        var panel = dlg.add("panel", undefined, "アートボード");
        panel.alignChildren = "left";
        var checks = [];
        for (var i = 0; i < doc.artboards.length; i++) {
            var c = panel.add("checkbox", undefined, (i + 1) + "：" + doc.artboards[i].name);
            c.value = i === active;
            checks.push(c);
        }
        var all = dlg.add("group");
        var allOn = all.add("button", undefined, "全部選ぶ");
        var allOff = all.add("button", undefined, "全部外す");
        allOn.onClick = function () { for (var k = 0; k < checks.length; k++) checks[k].value = true; };
        allOff.onClick = function () { for (var k = 0; k < checks.length; k++) checks[k].value = false; };

        var btns = dlg.add("group");
        btns.alignment = "right";
        btns.add("button", undefined, "書き出す", { name: "ok" });
        btns.add("button", undefined, "キャンセル", { name: "cancel" });
        if (dlg.show() !== 1) return null;

        var result = [];
        for (var j = 0; j < checks.length; j++) if (checks[j].value) result.push(j);
        if (!result.length) alert("アートボードが選ばれていません。");
        return result;
    }

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
