/*
 * host.jsx（パネル用）
 * パネル（index.html）から呼ばれる Illustrator 側の処理。結果は JSON の文字列で返す
 *
 * - 表を作る：jsx/create_table.jsx（ポロライドテーブル自動作成.jsx）を、パネルの設定で実行する
 * - 画像調整：キャラ画像の拡大率・位置を変える（キャラ画像の調整.jsx と同じ計算）
 * - 書き出し：アートボードを「素材」フォルダへ PNG で書き出す（表の書き出し.jsx と同じ書き出し方）
 */

$.global.PT = (function () {  // $.evalFile で読み込んでも、どこからでも PT で呼べるように
    var IMAGE_LAYER = "キャラ画像";
    var TABLE_LAYER = "テーブル";
    var NUMBER_RATIO = 46 / 40;  // 数字の大きさ ÷ 文字の大きさ（ポロライドテーブル自動作成の CONFIG と同じ割合）
    var MATERIAL_FOLDER = "素材";
    var IMAGE_FILTER = "画像:*.png;*.jpg;*.jpeg;*.psd;*.tif;*.tiff;*.ai;*.eps;*.pdf;*.svg";

    // ---- 表を作る ----

    // CSV を選ぶ。1 列目が画像ファイルか（キャラ欄ありか）も返す
    function pickCSV() {
        var f = File.openDialog("CSV ファイルを選んでください", "*.csv");
        if (!f) return json(null);
        return json({ path: f.fsName, name: decodeURI(f.name), hasImages: csvHasImages(f) });
    }

    function csvHasImages(f) {
        f.encoding = "UTF-8";
        if (!f.open("r")) return false;
        var lines = f.read().replace(/^﻿/, "").split(/\r\n|\r|\n/);
        f.close();
        var found = false;
        for (var i = 0; i < lines.length; i++) {
            if (!lines[i]) continue;
            var first = lines[i].charAt(0) === '"' ? lines[i].replace(/^"([^"]*)".*$/, "$1") : lines[i].split(",")[0];
            first = first.replace(/^\s+|\s+$/g, "");
            if (!first) continue;
            if (!/\.(png|jpe?g|psd|tiff?|gif|bmp|ai|eps|pdf|svg)$/i.test(first)) return false;
            found = true;
        }
        return found;
    }

    // パネルの設定で表を作る。scriptPath は create_table.jsx の場所
    function createTable(scriptPath, options) {
        $.global.PT_CREATE_OPTIONS = options;
        $.global.PT_RESULT = null;
        try {
            $.evalFile(new File(scriptPath));
        } finally {
            $.global.PT_CREATE_OPTIONS = null;
        }
        var msg = $.global.PT_RESULT;
        $.global.PT_RESULT = null;
        return json({ message: msg || "" });
    }

    // ---- 文字の大きさ ----

    // アートボードの表の文字の今の大きさ（文字・数字の pt）
    function getTextSize(board) {
        var doc = activeDoc();
        if (!doc || !doc.artboards[board]) return json(null);
        var texts = tableTexts(doc, board);
        if (!texts.length) return json({ count: 0 });
        var text = null;
        for (var i = 0; i < texts.length && text === null; i++) {
            if (!texts[i].isNumber) text = texts[i].tf.textRange.characterAttributes.size;
        }
        if (text === null) text = texts[0].tf.textRange.characterAttributes.size / NUMBER_RATIO;
        return json({ count: texts.length, text: text, number: text * NUMBER_RATIO });
    }

    // アートボードの表の文字を、まとめてこの大きさにする（数字は文字の 46/40 倍）。マスの中央の位置は保つ
    function setTextSize(board, textPt) {
        var doc = activeDoc();
        if (!doc || !doc.artboards[board] || !(textPt > 0)) return json(null);
        var texts = tableTexts(doc, board);
        for (var i = 0; i < texts.length; i++) {
            var t = texts[i];
            var size = t.tf.textRange.characterAttributes.size;
            var next = t.isNumber ? textPt * NUMBER_RATIO : textPt;
            var f = next / size;
            if (Math.abs(f - 1) < 0.0001) continue;
            // 文字の形は基準点（中央ぞろえの行の基準点）を中心に f 倍になるので、
            // 文字の中心（＝マスの中心）とのずれも f 倍になる分を戻して、マスの中央に保つ
            var a = t.tf.anchor;
            t.tf.textRange.characterAttributes.size = next;
            t.tf.translate((t.cx - a[0]) * (1 - f), (t.cy - a[1]) * (1 - f));
        }
        app.redraw();
        return getTextSize(board);
    }

    // アートボードの中にある「テーブル」レイヤーのマスの文字（マスの中心も一緒に）
    function tableTexts(doc, board) {
        var r = doc.artboards[board].artboardRect;
        var list = [];
        (function walk(layers) {
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                if (layer.name === TABLE_LAYER) {
                    for (var g = 0; g < layer.groupItems.length; g++) {
                        var group = layer.groupItems[g];
                        if (!group.pathItems.length || !group.textFrames.length) continue;
                        var b = group.pathItems[0].geometricBounds;
                        var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
                        if (cx < r[0] || cx > r[2] || cy > r[1] || cy < r[3]) continue;
                        for (var t = 0; t < group.textFrames.length; t++) {
                            var tf = group.textFrames[t];
                            list.push({ tf: tf, cx: cx, cy: cy, isNumber: /^-?[\d,]+(\.\d+)?$/.test(tf.contents) });
                        }
                    }
                }
                walk(layer.layers);
            }
        })(doc.layers);
        return list;
    }

    // ---- 画像調整 ----

    // 一覧：アートボード（全部）・画像・選択中の画像
    function listImages() {
        var doc = activeDoc();
        if (!doc) return json({ boards: [], images: [], selected: -1, active: -1 });
        var targets = collectTargets(doc);
        var images = [];
        for (var i = 0; i < targets.length; i++) {
            images.push({ id: i, board: artboardOf(doc, targets[i]), name: targets[i].group.name });
        }
        var boardList = [];
        for (var k = 0; k < doc.artboards.length; k++) boardList.push({ index: k, name: doc.artboards[k].name });
        return json({
            boards: boardList,
            images: images,
            selected: selectedTarget(doc, targets),
            active: doc.artboards.getActiveArtboardIndex()
        });
    }

    // 画像の今の値（拡大率・横・縦）と、スライダーの範囲
    function getImage(id) {
        var tg = target(id);
        if (!tg) return json(null);
        var cb = clipBox(tg);
        var off = currentOffset(tg);
        return json({ zoom: currentZoom(tg), x: off.x, y: off.y, range: Math.round(Math.max(cb.w, cb.h) * 1.5) });
    }

    // 拡大率・横・縦を変える（null の値は変えない）
    function setImage(id, zoom, x, y) {
        var tg = target(id);
        if (!tg) return json(null);
        if (zoom !== null) applyZoom(tg, zoom);
        if (x !== null || y !== null) applyOffset(tg, x, y);
        app.redraw();
        return getImage(id);
    }

    // マスに合わせる（100%・中央）
    function fitImage(id) {
        return setImage(id, 100, 0, 0);
    }

    // 上ぞろえ（画像の上端をマスの上端に）
    function topImage(id) {
        var tg = target(id);
        if (!tg) return json(null);
        return setImage(id, null, null, (tg.image.height - clipBox(tg).h) / 2);
    }

    // 同じ表のほかのキャラ画像を、この画像と同じ拡大率・位置にする
    function copyToTable(id) {
        var doc = activeDoc();
        var targets = collectTargets(doc);
        var src = targets[id];
        if (!src) return json({ count: 0 });
        var zoom = currentZoom(src), off = currentOffset(src), srcBox = clipBox(src);
        var count = 0;
        for (var i = 0; i < targets.length; i++) {
            if (i === id || targets[i].layer !== src.layer) continue;
            var k = clipBox(targets[i]).w / srcBox.w;  // マスの大きさが違うときは、ずれを伸び縮みさせる
            applyZoom(targets[i], zoom);
            applyOffset(targets[i], off.x * k, off.y * k);
            count++;
        }
        app.redraw();
        return json({ count: count });
    }

    // 画像を差し替える（切り抜きの枠はそのまま、マスいっぱい・上ぞろえ。名前も「行番号_ファイル名」に）
    function replaceImage(id) {
        var tg = target(id);
        if (!tg) return json(null);
        var from = materialFolder(false);
        try {
            if (!from && tg.image.file) from = tg.image.file.parent;
        } catch (e) {}
        var f = from ? from.openDlg("差し替える画像を選ぶ", IMAGE_FILTER, false)
                     : File.openDialog("差し替える画像を選ぶ", IMAGE_FILTER, false);
        if (!f) return json(null);
        tg.image.file = f;
        applyZoom(tg, 100);
        applyOffset(tg, 0, (tg.image.height - clipBox(tg).h) / 2);
        tg.group.name = tg.group.name.replace(/_.*$/, "") + "_" + decodeURI(f.name).replace(/\.[^.]+$/, "");
        app.redraw();
        return json({ name: tg.group.name });
    }

    // Illustrator で画像を選択状態にする
    function selectImage(id) {
        var tg = target(id);
        if (!tg) return json(null);
        try {
            activeDoc().selection = null;
            tg.group.selected = true;
        } catch (e) {}
        app.redraw();
        return json(true);
    }

    // ---- 書き出し ----

    function listArtboards() {
        var doc = activeDoc();
        if (!doc) return json({ artboards: [], active: -1 });
        var list = [];
        for (var i = 0; i < doc.artboards.length; i++) list.push({ index: i, name: doc.artboards[i].name });
        return json({ artboards: list, active: doc.artboards.getActiveArtboardIndex() });
    }

    // アートボードを PNG で書き出す。indexes はアートボードの番号の配列
    function exportArtboards(indexes) {
        var doc = activeDoc();
        if (!doc) return json({ files: [] });
        var active = doc.artboards.getActiveArtboardIndex();
        var files = [];
        for (var i = 0; i < indexes.length; i++) {
            var dest = exportPNG(doc, indexes[i]);
            if (dest) files.push(dest.fsName);
        }
        doc.artboards.setActiveArtboardIndex(active);
        return json({ files: files });
    }

    function exportPNG(doc, index) {
        var fileName = doc.artboards[index].name.replace(/[\\\/:*?"<>|]/g, "_") + ".png";
        var dest = null;
        var folder = materialFolder(true);
        if (folder) {
            dest = new File(folder.fsName + "/" + fileName);
            if (dest.exists && !confirm("「" + MATERIAL_FOLDER + "」フォルダに同じ名前の PNG があります。上書きしますか？\n"
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

    // ---- 共通 ----

    function activeDoc() {
        return app.documents.length ? app.activeDocument : null;
    }

    // 「キャラ画像」レイヤー（どの階層でも）の中の、切り抜きグループ。番号（id）はこの並び順
    function collectTargets(doc) {
        var targets = [];
        (function walk(layers) {
            for (var i = 0; i < layers.length; i++) {
                var layer = layers[i];
                if (layer.name === IMAGE_LAYER) {
                    for (var g = 0; g < layer.groupItems.length; g++) {
                        var group = layer.groupItems[g];
                        if (!group.clipped || !group.placedItems.length || !group.pathItems.length) continue;
                        targets.push({ group: group, image: group.placedItems[0], clip: group.pathItems[0], layer: layer });
                    }
                }
                walk(layer.layers);
            }
        })(doc.layers);
        return targets;
    }

    function target(id) {
        var doc = activeDoc();
        return doc ? collectTargets(doc)[id] || null : null;
    }

    function selectedTarget(doc, targets) {
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

    function artboardOf(doc, tg) {
        var cb = clipBox(tg);
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = doc.artboards[i].artboardRect;
            if (cb.cx >= r[0] && cb.cx <= r[2] && cb.cy <= r[1] && cb.cy >= r[3]) return i;
        }
        return doc.artboards.getActiveArtboardIndex();
    }

    function clipBox(tg) {
        var b = tg.clip.geometricBounds;
        return { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, w: b[2] - b[0], h: b[1] - b[3] };
    }

    // マスにちょうど隙間なく入る大きさを 100% としたときの、今の拡大率
    function currentZoom(tg) {
        var cb = clipBox(tg);
        return 100 / Math.max(cb.w / tg.image.width, cb.h / tg.image.height);
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
    }

    // Illustrator ファイルと同じ場所の「素材」フォルダ。未保存なら null。create が true なら、なければ作る
    function materialFolder(create) {
        var doc = activeDoc();
        var base = null;
        try {
            if (doc && doc.fullName && doc.fullName.exists) base = doc.fullName.parent;
        } catch (e) {
            base = null;
        }
        if (!base) return null;
        var folder = new Folder(base.fsName + "/" + MATERIAL_FOLDER);
        if (folder.exists) return folder;
        if (create && folder.create()) return folder;
        return null;
    }

    function indexOf(array, value) {
        for (var i = 0; i < array.length; i++) if (array[i] === value) return i;
        return -1;
    }

    // ExtendScript には JSON がないので、結果を JSON の文字列にする
    function json(v) {
        if (v === null || v === undefined) return "null";
        if (typeof v === "number") return isFinite(v) ? String(v) : "null";
        if (typeof v === "boolean") return String(v);
        if (typeof v === "string") {
            return '"' + v.replace(/[\\"\u0000-\u001f]/g, function (c) {
                var map = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };
                return map[c] || "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4);
            }) + '"';
        }
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(json(v[i]));
            return "[" + a.join(",") + "]";
        }
        var parts = [];
        for (var k in v) if (v.hasOwnProperty(k)) parts.push(json(k) + ":" + json(v[k]));
        return "{" + parts.join(",") + "}";
    }

    return {
        pickCSV: pickCSV,
        getTextSize: getTextSize,
        setTextSize: setTextSize,
        createTable: createTable,
        listImages: listImages,
        getImage: getImage,
        setImage: setImage,
        fitImage: fitImage,
        topImage: topImage,
        copyToTable: copyToTable,
        replaceImage: replaceImage,
        selectImage: selectImage,
        listArtboards: listArtboards,
        exportArtboards: exportArtboards
    };
})();
