#target illustrator
/*
 * キャラ画像の調整.jsx
 * テーブル自動作成で入れたキャラ画像の、拡大率と位置をスライダーで調整する
 *
 * 使い方：Illustrator で ファイル → スクリプト → その他のスクリプト… からこのファイルを選択
 *   - アートボード（表）を選んでから、その表の「キャラ画像」レイヤーの画像を一覧から選ぶ
 *     （先にキャラ画像を選択しておくと、その画像が最初から選ばれた状態になる）
 *   - スライダーか数値で、拡大率・横・縦を変えると、その場で表に反映される
 *   - 「同じ表の画像を全部この画像と同じにする」で、同じ表のほかのキャラ画像にも同じ拡大率・位置を当てはめる
 *     （キャラごとに絵が違うので、そのあと 1 枚ずつ微調整する）
 *   - 「画像を差し替える…」で、選んでいる画像を別の画像に入れ替える（切り抜きの枠はそのまま）
 *   - OK で確定、キャンセルで開く前の状態に戻す（書き出しはパネルの「PNG で書き出す」で）
 *
 * 拡大率 100% ＝ マスにちょうど隙間なく入る大きさ
 * 横・縦 0 ＝ 画像の中心がマスの中心。横は右がプラス、縦は下がプラス（Illustrator の表示と同じ向き）
 */

(function () {
    var CONFIG = {
        imageLayerName: "キャラ画像",
        zoom: { min: 100, max: 400 },  // 拡大率スライダーの範囲（%）。100 より小さいとマスに隙間ができる
        moveRange: 1.5,                // 横・縦スライダーの範囲（マスの大きさの何倍まで動かせるか）
        exportFolderName: "素材",       // 差し替える画像を選ぶときに開くフォルダ（Illustrator ファイルと同じ場所）
        filter: "画像:*.png;*.jpg;*.jpeg;*.psd;*.tif;*.tiff;*.ai;*.eps;*.pdf;*.svg"
    };

    if (!app.documents.length) {
        alert("ドキュメントが開いていません。");
        return;
    }
    var doc = app.activeDocument;

    var targets = [];
    collectTargets(doc.layers, "");
    if (!targets.length) {
        alert("「" + CONFIG.imageLayerName + "」レイヤーに、切り抜いたキャラ画像が見つかりません。");
        return;
    }

    // 開く前の状態（キャンセルで戻す）と、画像が入っているアートボード
    var originals = [];
    var boards = [];  // 画像があるアートボードの番号
    for (var i = 0; i < targets.length; i++) {
        originals.push(saveState(targets[i]));
        targets[i].artboard = artboardIndexOf(targets[i]);
        if (indexOf(boards, targets[i].artboard) < 0) boards.push(targets[i].artboard);
    }
    boards.sort(function (a, b) { return a - b; });

    // 最初に選ぶ画像：選択中の画像 → 今のアートボードの最初の画像 → 一番最初の画像
    var current = selectedTarget();
    if (current < 0) {
        var activeBoard = doc.artboards.getActiveArtboardIndex();
        for (var a = 0; a < targets.length && current < 0; a++) {
            if (targets[a].artboard === activeBoard) current = a;
        }
    }
    if (current < 0) current = 0;
    var shown = [];  // 画像の一覧に出している targets の番号

    // ---- ダイアログ ----
    var dlg = new Window("dialog", "キャラ画像の調整");
    dlg.alignChildren = "fill";

    var boardGroup = dlg.add("group");
    boardGroup.add("statictext", undefined, "アートボード：").preferredSize.width = 80;
    var boardList = boardGroup.add("dropdownlist");
    for (var b = 0; b < boards.length; b++) boardList.add("item", (boards[b] + 1) + "：" + doc.artboards[boards[b]].name);
    boardList.preferredSize.width = 360;

    var pickGroup = dlg.add("group");
    pickGroup.add("statictext", undefined, "画像：").preferredSize.width = 80;
    var list = pickGroup.add("dropdownlist");
    list.preferredSize.width = 360;

    var panel = dlg.add("panel", undefined, "拡大率と位置");
    panel.alignChildren = "fill";
    var zoomRow = addSliderRow(panel, "拡大率（%）", CONFIG.zoom.min, CONFIG.zoom.max);
    var xRow = addSliderRow(panel, "横（px）", -100, 100);
    var yRow = addSliderRow(panel, "縦（px）", -100, 100);
    panel.add("statictext", undefined, "横は右がプラス、縦は下がプラス。数値を入れて Enter でも変えられます");

    var tools = dlg.add("group");
    var fitBtn = tools.add("button", undefined, "マスに合わせる（100%・中央）");
    var topBtn = tools.add("button", undefined, "上ぞろえに戻す");
    var revertBtn = tools.add("button", undefined, "この画像を元に戻す");
    var copyBtn = dlg.add("button", undefined, "同じ表の画像を全部この画像と同じにする（拡大率・位置）");
    var replaceBtn = dlg.add("button", undefined, "画像を差し替える…");

    var btns = dlg.add("group");
    btns.alignment = "right";
    btns.add("button", undefined, "OK", { name: "ok" });
    btns.add("button", undefined, "キャンセル", { name: "cancel" });

    boardList.onChange = function () {
        if (!boardList.selection) return;
        fillImages(boards[boardList.selection.index]);
    };
    list.onChange = function () {
        if (!list.selection) return;
        current = shown[list.selection.index];
        selectOnly(targets[current]);
        refresh();
    };
    zoomRow.onValue = function (v) { applyZoom(targets[current], v); refresh(); };
    xRow.onValue = function (v) { applyOffset(targets[current], v, null); refresh(); };
    yRow.onValue = function (v) { applyOffset(targets[current], null, v); refresh(); };
    fitBtn.onClick = function () {
        applyZoom(targets[current], 100);
        applyOffset(targets[current], 0, 0);
        refresh();
    };
    topBtn.onClick = function () {
        var tg = targets[current];
        var cb = clipBox(tg);
        applyOffset(tg, null, (tg.image.height - cb.h) / 2);  // 画像の上端をマスの上端に合わせる
        refresh();
    };
    copyBtn.onClick = function () {
        var src = targets[current];
        var zoom = currentZoom(src);
        var off = currentOffset(src);
        var srcBox = clipBox(src);
        var count = 0;
        for (var i = 0; i < targets.length; i++) {
            if (i === current || targets[i].layer !== src.layer) continue;
            // マスの大きさが違うときは、ずれをマスの大きさに合わせて伸び縮みさせる
            var k = clipBox(targets[i]).w / srcBox.w;
            applyZoom(targets[i], zoom);
            applyOffset(targets[i], off.x * k, off.y * k);
            count++;
        }
        selectOnly(src);
        refresh();
        if (!count) alert("同じ表に、ほかのキャラ画像がありません。");
    };
    replaceBtn.onClick = function () {
        var tg = targets[current];
        var from = materialFolder(false);
        try {
            if (!from && tg.image.file) from = tg.image.file.parent;
        } catch (e) {}
        var filter = $.os.indexOf("Windows") >= 0 ? CONFIG.filter : function (f) {
            return f instanceof Folder || /\.(png|jpe?g|psd|tiff?|ai|eps|pdf|svg)$/i.test(f.name);
        };
        var f = from ? from.openDlg("差し替える画像を選ぶ", filter, false)
                     : File.openDialog("差し替える画像を選ぶ", filter, false);
        if (!f) return;
        tg.image.file = f;
        // 新しい画像をマスいっぱい・上ぞろえにする
        applyZoom(tg, 100);
        var cb = clipBox(tg);
        applyOffset(tg, 0, (tg.image.height - cb.h) / 2);
        // 名前を「行番号_ファイル名」に変える（例：行2_リンゴ）
        var rowPart = tg.group.name.replace(/_.*$/, "");
        tg.group.name = rowPart + "_" + decodeURI(f.name).replace(/\.[^.]+$/, "");
        setListText(tg, tg.group.name);
        refresh();
    };
    revertBtn.onClick = function () {
        restoreState(targets[current], originals[current]);
        refresh();
    };

    boardList.selection = indexOf(boards, targets[current].artboard);
    fillImages(targets[current].artboard);

    if (dlg.show() !== 1) {
        for (var k = 0; k < targets.length; k++) restoreState(targets[k], originals[k]);
        app.redraw();
    }

    // ================================================================

    // アートボードの画像だけを一覧に出す。今の画像がそのアートボードになければ最初の画像を選ぶ
    function fillImages(board) {
        list.removeAll();
        shown = [];
        for (var i = 0; i < targets.length; i++) {
            if (targets[i].artboard !== board) continue;
            shown.push(i);
            list.add("item", targets[i].group.name);
        }
        var pos = indexOf(shown, current);
        list.selection = pos >= 0 ? pos : 0;
        list.onChange();  // 画像の選択と値の表示を変える（選択を変えただけでは呼ばれないことがあるため）
    }

    function setListText(tg, text) {
        for (var i = 0; i < shown.length; i++) {
            if (targets[shown[i]] === tg) list.items[i].text = text;
        }
    }

    function indexOf(array, value) {
        for (var i = 0; i < array.length; i++) if (array[i] === value) return i;
        return -1;
    }

    // 「キャラ画像」レイヤー（どの階層でも）の中の、切り抜きグループを集める
    function collectTargets(layers, parentName) {
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.name === CONFIG.imageLayerName) {
                for (var g = 0; g < layer.groupItems.length; g++) {
                    var group = layer.groupItems[g];
                    if (!group.clipped || !group.placedItems.length || !group.pathItems.length) continue;
                    targets.push({
                        group: group,
                        image: group.placedItems[0],
                        clip: group.pathItems[0],
                        layer: layer
                    });
                }
            }
            collectTargets(layer.layers, layer.name);
        }
    }

    // 選択中のものが入っている切り抜きグループを探す
    function selectedTarget() {
        var sel = doc.selection;
        if (!sel || !sel.length) return -1;
        for (var s = 0; s < sel.length; s++) {
            for (var item = sel[s]; item && item.typename !== "Layer" && item.typename !== "Document"; item = item.parent) {
                for (var i = 0; i < targets.length; i++) {
                    if (targets[i].group === item) return i;
                }
            }
        }
        return -1;
    }

    function selectOnly(tg) {
        try {
            doc.selection = null;
            tg.group.selected = true;
        } catch (e) {}
        app.redraw();
    }

    function clipBox(tg) {
        var b = tg.clip.geometricBounds;
        return { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, w: b[2] - b[0], h: b[1] - b[3] };
    }

    // マスにちょうど隙間なく入る大きさを 100% としたときの、今の拡大率
    function currentZoom(tg) {
        var cb = clipBox(tg);
        var cover = Math.max(cb.w / tg.image.width, cb.h / tg.image.height);
        return 100 / cover;
    }

    // 画像の中心とマスの中心のずれ（横は右、縦は下がプラス）
    function currentOffset(tg) {
        var cb = clipBox(tg);
        var p = tg.image.position;
        return { x: p[0] + tg.image.width / 2 - cb.cx, y: cb.cy - (p[1] - tg.image.height / 2) };
    }

    // 中心のずれを保ったまま拡大率を変える
    function applyZoom(tg, zoom) {
        var off = currentOffset(tg);
        var ratio = zoom / currentZoom(tg) * 100;
        tg.image.resize(ratio, ratio);
        applyOffset(tg, off.x, off.y);
    }

    function applyOffset(tg, x, y) {
        var off = currentOffset(tg);
        if (x === null) x = off.x;
        if (y === null) y = off.y;
        var cb = clipBox(tg);
        tg.image.position = [cb.cx + x - tg.image.width / 2, cb.cy - y + tg.image.height / 2];
        app.redraw();
    }

    function saveState(tg) {
        var file = null;
        try { file = tg.image.file; } catch (e) {}
        return { w: tg.image.width, h: tg.image.height, pos: tg.image.position, file: file, name: tg.group.name };
    }

    function restoreState(tg, st) {
        var file = null;
        try { file = tg.image.file; } catch (e) {}
        if (st.file && (!file || file.fsName !== st.file.fsName)) {
            tg.image.file = st.file;  // 差し替えた画像を元に戻す
        }
        if (tg.group.name !== st.name) {
            tg.group.name = st.name;
            setListText(tg, st.name);
        }
        tg.image.width = st.w;
        tg.image.height = st.h;
        tg.image.position = st.pos;
        app.redraw();
    }

    // 選んでいる画像の今の値をスライダーと数値に反映する
    function refresh() {
        var tg = targets[current];
        var cb = clipBox(tg);
        var range = Math.round(Math.max(cb.w, cb.h) * CONFIG.moveRange);
        xRow.setRange(-range, range);
        yRow.setRange(-range, range);
        var off = currentOffset(tg);
        zoomRow.set(currentZoom(tg));
        xRow.set(off.x);
        yRow.set(off.y);
    }

    // Illustrator ファイルと同じ場所の「素材」フォルダ。ファイルが未保存なら null。create が true なら、なければ作る
    function materialFolder(create) {
        var base = null;
        try {
            if (doc.fullName && doc.fullName.exists) base = doc.fullName.parent;
        } catch (e) {
            base = null;
        }
        if (!base) return null;
        var folder = new Folder(base.fsName + "/" + CONFIG.exportFolderName);
        if (folder.exists) return folder;
        if (create && folder.create()) return folder;
        return null;
    }

    // 画像が入っている表のアートボード（マスの中心を含むアートボード）
    function artboardIndexOf(tg) {
        var cb = clipBox(tg);
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = doc.artboards[i].artboardRect;
            if (cb.cx >= r[0] && cb.cx <= r[2] && cb.cy <= r[1] && cb.cy >= r[3]) return i;
        }
        return doc.artboards.getActiveArtboardIndex();
    }

    // スライダーと数値入力の 1 行
    function addSliderRow(parent, label, min, max) {
        var g = parent.add("group");
        var lbl = g.add("statictext", undefined, label);
        lbl.preferredSize.width = 90;
        var slider = g.add("slider", undefined, min, min, max);
        slider.preferredSize.width = 260;
        var field = g.add("edittext", undefined, "0");
        field.characters = 6;
        var row = {
            onValue: null,
            set: function (v) {
                slider.value = Math.max(slider.minvalue, Math.min(slider.maxvalue, v));
                field.text = String(Math.round(v * 10) / 10);
            },
            setRange: function (a, b) {
                slider.minvalue = a;
                slider.maxvalue = b;
            }
        };
        slider.onChanging = function () {
            field.text = String(Math.round(slider.value));
            if (row.onValue) row.onValue(slider.value);
        };
        field.onChange = function () {
            var v = parseFloat(field.text);
            if (isNaN(v)) return;
            if (row.onValue) row.onValue(v);
        };
        return row;
    }
})();
