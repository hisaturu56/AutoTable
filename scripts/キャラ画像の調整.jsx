#target illustrator
/*
 * キャラ画像の調整.jsx
 * ポロライドテーブル自動作成で入れたキャラ画像の、拡大率と位置をスライダーで調整する
 *
 * 使い方：Illustrator で ファイル → スクリプト → その他のスクリプト… からこのファイルを選択
 *   - 「キャラ画像」レイヤーの画像が一覧に出るので、調整したい画像を選ぶ
 *     （先にキャラ画像を選択しておくと、その画像が最初から選ばれた状態になる）
 *   - スライダーか数値で、拡大率・横・縦を変えると、その場で表に反映される
 *   - OK で確定、キャンセルで開く前の状態に戻す
 *
 * 拡大率 100% ＝ マスにちょうど隙間なく入る大きさ
 * 横・縦 0 ＝ 画像の中心がマスの中心。横は右がプラス、縦は下がプラス（Illustrator の表示と同じ向き）
 */

(function () {
    var CONFIG = {
        imageLayerName: "キャラ画像",
        zoom: { min: 100, max: 400 },  // 拡大率スライダーの範囲（%）。100 より小さいとマスに隙間ができる
        moveRange: 1.5                 // 横・縦スライダーの範囲（マスの大きさの何倍まで動かせるか）
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

    // 開く前の状態（キャンセルで戻す）
    var originals = [];
    for (var i = 0; i < targets.length; i++) originals.push(saveState(targets[i]));

    var current = 0;
    var selected = selectedTarget();
    if (selected >= 0) current = selected;

    // ---- ダイアログ ----
    var dlg = new Window("dialog", "キャラ画像の調整");
    dlg.alignChildren = "fill";

    var pickGroup = dlg.add("group");
    pickGroup.add("statictext", undefined, "画像：");
    var list = pickGroup.add("dropdownlist");
    for (var t = 0; t < targets.length; t++) list.add("item", targets[t].label);
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

    var btns = dlg.add("group");
    btns.alignment = "right";
    btns.add("button", undefined, "OK", { name: "ok" });
    btns.add("button", undefined, "キャンセル", { name: "cancel" });

    list.onChange = function () {
        if (!list.selection) return;
        current = list.selection.index;
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
    revertBtn.onClick = function () {
        restoreState(targets[current], originals[current]);
        refresh();
    };

    list.selection = current;
    selectOnly(targets[current]);
    refresh();

    if (dlg.show() !== 1) {
        for (var k = 0; k < targets.length; k++) restoreState(targets[k], originals[k]);
        app.redraw();
    }

    // ================================================================

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
                        label: (parentName ? parentName + " ／ " : "") + group.name
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
        return { w: tg.image.width, h: tg.image.height, pos: tg.image.position };
    }

    function restoreState(tg, st) {
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
