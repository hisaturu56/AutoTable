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
    var ROUGH_SIZE = 1;  // ラフの大きさ（px。ポロライドテーブル自動作成の CONFIG.rough.size と同じ）
    var NUMBER_RATIO = 46 / 40;  // 数字の大きさ ÷ 文字の大きさ（ポロライドテーブル自動作成の CONFIG と同じ割合）
    var MATERIAL_FOLDER = "素材";
    var IMAGE_FILTER = "画像:*.png;*.jpg;*.jpeg;*.psd;*.tif;*.tiff;*.ai;*.eps;*.pdf;*.svg";

    // ---- 表を作る ----

    // CSV を選ぶ（複数選べる）。それぞれ 1 列目が画像ファイルか（キャラ欄ありか）も返す
    function pickCSVs() {
        var files = File.openDialog("CSV ファイルを選んでください（Ctrl や Shift で複数選べます）", "*.csv", true);
        if (!files) return json([]);
        if (!(files instanceof Array)) files = [files];
        var list = [];
        for (var i = 0; i < files.length; i++) {
            list.push({ path: files[i].fsName, name: decodeURI(files[i].name).replace(/\.csv$/i, ""), hasImages: csvHasImages(files[i]) });
        }
        return json(list);
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

    // 台本を自動で選ぶための名前：ドキュメント名と、配置した画像などのファイル名（拡張子を取る。500 個まで）
    //   key は、手で選んだ台本を覚えておくときの見分け（保存してあればファイルの場所、なければ名前）
    function docNames() {
        var doc = activeDoc();
        if (!doc) return json(null);
        var key = doc.name;
        try {
            if (doc.fullName && doc.fullName.exists) key = doc.fullName.fsName;
        } catch (e) {}
        var names = [{ name: doc.name.replace(/\.[^.]+$/, ""), kind: "ドキュメント" }];
        var seen = {};
        for (var i = 0; i < doc.placedItems.length && names.length < 500; i++) {
            var n = null;
            try {
                n = decodeURI(doc.placedItems[i].file.name).replace(/\.[^.]+$/, "");
            } catch (e) {
                n = null;  // リンクが切れている画像
            }
            if (n && !seen[n]) {
                seen[n] = true;
                names.push({ name: n, kind: "ファイル" });
            }
        }
        return json({ key: key, names: names });
    }

    // パネルの設定で表を作る。scriptPath は create_table.jsx の場所
    function createTable(scriptPath, options) {
        $.global.PT_CREATE_OPTIONS = options;
        $.global.PT_RESULT = null;
        $.global.PT_RESULT_BOARD = null;
        try {
            $.evalFile(new File(scriptPath));
        } finally {
            $.global.PT_CREATE_OPTIONS = null;
        }
        var msg = $.global.PT_RESULT, board = $.global.PT_RESULT_BOARD;
        $.global.PT_RESULT = null;
        $.global.PT_RESULT_BOARD = null;
        return json({ message: msg || "", board: board === null || board === undefined ? -1 : board });
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
                        var cell = cellShape(group);
                        if (!cell || !group.textFrames.length) continue;
                        var b = cell.geometricBounds;
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

    // マスのグループの中の、文字ではない最初のもの（マスの形。ラフを固定すると長方形ではなくなることがある）
    function cellShape(group) {
        for (var i = 0; i < group.pageItems.length; i++) {
            if (group.pageItems[i].typename !== "TextFrame") return group.pageItems[i];
        }
        return null;
    }

    // マスの { left, top, w, h }。ラフを固定したマス（点がたくさんある形）は、ギザギザの分（1 px）だけ内側にする
    function cellBox(shape) {
        var b = shape.geometricBounds;
        var inset = 0;
        try {
            if (shape.typename !== "PathItem" || shape.pathPoints.length > 4) inset = ROUGH_SIZE;
        } catch (e) {}
        return { left: b[0] + inset, top: b[1] - inset, w: b[2] - b[0] - inset * 2, h: b[1] - b[3] - inset * 2 };
    }

    // ---- 仕上げ：ラフをかけて、土台を 1 枚の画像にする ----

    var FINISHED_NAME = "土台（画像）";
    var ROUGH_NOTE = "ラフ";  // ラフをかけた形の note（二重にかけないように）
    var ROUGH_XML = '<LiveEffect name="Adobe Roughen"><Dict data="R asiz ' + ROUGH_SIZE + ' R size ' + ROUGH_SIZE
                  + ' R absoluteness 1 R dtal 100 R roundness 0 "/></LiveEffect>';  // ポロライドテーブル自動作成のラフと同じ設定

    // アートボードの表の仕上げ。rough：下地・ヘッダー・マスにラフをかける／raster：土台を 72 ppi の画像 1 枚にする（くっつける）
    //   ラフだけのとき：ラフを「アピアランスを分割」で固定する
    //   画像にするとき：写しを画像にして（書き出す PNG と同じ解像度なので見た目は同じ）「下地」レイヤーのいちばん下に置き、
    //     元の下地・ヘッダー・マスは隠して残す（マスの位置を、文字の大きさ・キャラ画像の調整に使うため）
    //   もう画像にしてある表は、前の画像を消して元の形から作り直す
    //   キャラ画像と文字には何もしない
    function finishTable(board, rough, raster) {
        var doc = activeDoc();
        if (!doc || !doc.artboards[board]) return json(null);
        var t = tableOnArtboard(doc, board);
        if (!t) return json({ none: true });

        // 前に画像にしてあれば、消して元の形を出す
        var redone = false;
        for (var f = t.outer.pageItems.length - 1; f >= 0; f--) {
            if (t.outer.pageItems[f].name === FINISHED_NAME) { t.outer.pageItems[f].remove(); redone = true; }
        }
        if (redone) {
            showShapes(t.outer);
            showShapes(t.header);
            for (var c = 0; c < t.table.groupItems.length; c++) {
                var cs = cellShape(t.table.groupItems[c]);
                if (cs) cs.hidden = false;
            }
        }

        // 下地 → ヘッダー → マス の順（あとのものほど上）
        var items = [];
        collectShapes(t.outer, items);
        collectShapes(t.header, items);
        for (var g = 0; g < t.table.groupItems.length; g++) {
            var shape = cellShape(t.table.groupItems[g]);
            if (shape) items.push(shape);
        }
        if (!items.length) return json({ none: true });

        // ラフ：まだかけていない長方形にだけかける（note に「ラフ」と残して、二重にかけないように）
        var roughed = [];
        if (rough) {
            for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (it.typename === "PathItem" && it.pathPoints.length <= 4 && it.note !== ROUGH_NOTE) {
                    it.applyEffect(ROUGH_XML);
                    it.note = ROUGH_NOTE;
                    roughed.push(it);
                }
            }
            // 画像にしないときは、ラフを固定して軽くする
            if (!raster && roughed.length) {
                doc.selection = null;
                for (var k = 0; k < roughed.length; k++) roughed[k].selected = true;
                app.executeMenuCommand("expandStyle");
                doc.selection = null;
            }
        }

        var result = null;
        if (raster) {
            var temp = t.outer.groupItems.add();
            for (var d = 0; d < items.length; d++) items[d].duplicate(temp, ElementPlacement.PLACEATBEGINNING);
            // 画像にする範囲：ラフのはみ出しも含め、外側に向けて整数の px にそろえる（ぼやけないように）
            var vb = temp.visibleBounds;
            var pad = ROUGH_SIZE + 1;
            var bounds = [Math.floor(vb[0] - pad), Math.ceil(vb[1] + pad), Math.ceil(vb[2] + pad), Math.floor(vb[3] - pad)];
            var o = new RasterizeOptions();
            o.resolution = 72;
            o.transparency = true;
            o.antiAliasingMethod = AntiAliasingMethod.ARTOPTIMIZED;
            o.backgroundBlack = false;
            o.clippingMask = false;
            o.padding = 0;
            result = doc.rasterize(temp, bounds, o);  // temp（写し）は画像に置き換わる
            result.name = FINISHED_NAME;
            result.move(t.outer, ElementPlacement.PLACEATEND);
            for (var h = 0; h < items.length; h++) items[h].hidden = true;
        }

        // アートボードが表にぴったり合わせてあれば、ラフのはみ出しも入るように合わせ直す
        var ab = doc.artboards[board];
        var ar = ab.artboardRect, tb = t.bounds;
        if (Math.abs(ar[0] - tb[0]) <= 3 && Math.abs(ar[1] - tb[1]) <= 3 && Math.abs(ar[2] - tb[2]) <= 3 && Math.abs(ar[3] - tb[3]) <= 3) {
            var rb = result ? result.visibleBounds : visibleOf(t.outer);
            ab.artboardRect = [Math.floor(Math.min(tb[0], rb[0])), Math.ceil(Math.max(tb[1], rb[1])),
                               Math.ceil(Math.max(tb[2], rb[2])), Math.floor(Math.min(tb[3], rb[3]))];
        }
        app.redraw();
        return json({ done: true, roughed: roughed.length, raster: !!result, redone: redone });
    }

    function showShapes(layer) {
        for (var i = 0; i < layer.pathItems.length; i++) layer.pathItems[i].hidden = false;
    }

    function collectShapes(layer, list) {
        for (var i = layer.pathItems.length - 1; i >= 0; i--) list.push(layer.pathItems[i]);
    }

    // アートボードの上の表：{ outer, header, table（レイヤー）, bounds（下地の外側） }
    function tableOnArtboard(doc, board) {
        var r = doc.artboards[board].artboardRect;
        var found = null;
        (function walk(container) {
            var outer = null, header = null, table = null;
            for (var i = 0; i < container.layers.length; i++) {
                var n = container.layers[i].name;
                if (n === "下地") outer = container.layers[i];
                if (n === "ヘッダー") header = container.layers[i];
                if (n === TABLE_LAYER) table = container.layers[i];
            }
            if (outer && header && table && outer.pageItems.length) {
                var b = (outer.pathItems.length ? outer.pathItems[0] : outer.pageItems[0]).geometricBounds;  // 元の下地
                var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
                if (cx >= r[0] && cx <= r[2] && cy <= r[1] && cy >= r[3]) { found = { outer: outer, header: header, table: table, bounds: visibleOf(outer) }; return; }
            }
            for (var j = 0; j < container.layers.length && !found; j++) walk(container.layers[j]);
        })(doc);
        return found;
    }

    // レイヤーの中の見えている形の外側（ラフのはみ出しを含む）
    function visibleOf(layer) {
        var vb = null;
        for (var i = 0; i < layer.pageItems.length; i++) {
            var it = layer.pageItems[i];
            if (it.hidden) continue;
            var b = it.visibleBounds;
            vb = vb ? [Math.min(vb[0], b[0]), Math.max(vb[1], b[1]), Math.max(vb[2], b[2]), Math.min(vb[3], b[3])] : b;
        }
        return vb || [0, 0, 0, 0];
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
        var empties = emptyCells(doc);
        var emptyList = [];
        for (var e = 0; e < empties.length; e++) {
            emptyList.push({ id: e, board: artboardOfBox(doc, empties[e].box), name: "行" + empties[e].row + "（画像なし）", row: empties[e].row });
        }
        return json({
            boards: boardList,
            images: images,
            empties: emptyList,
            selected: selectedTarget(doc, targets),
            active: doc.artboards.getActiveArtboardIndex()
        });
    }

    // 画像の入っていないキャラ欄のマス（表を作るときに「なし」にしたところ）
    //   テーブルレイヤーの「行N_キャラ」のマスで、同じ表の「キャラ画像」レイヤーに「行N_…」の画像がないもの
    function emptyCells(doc) {
        var list = [];
        (function walk(container) {
            var layers = container.layers;
            var table = null, images = null;
            for (var i = 0; i < layers.length; i++) {
                if (layers[i].name === TABLE_LAYER) table = layers[i];
                if (layers[i].name === IMAGE_LAYER) images = layers[i];
            }
            if (table) {
                var has = {};
                if (images) {
                    for (var g = 0; g < images.groupItems.length; g++) {
                        var m = /^行(\d+)_/.exec(images.groupItems[g].name);
                        if (m) has[m[1]] = true;
                    }
                }
                for (var c = 0; c < table.groupItems.length; c++) {
                    var cell = table.groupItems[c];
                    var r = /^行(\d+)_キャラ$/.exec(cell.name);
                    if (!r || has[r[1]]) continue;
                    var shape = cellShape(cell);
                    if (!shape) continue;
                    list.push({ parent: container, row: parseInt(r[1], 10), box: cellBox(shape) });
                }
            }
            for (var j = 0; j < layers.length; j++) {
                if (layers[j].name !== TABLE_LAYER && layers[j].name !== IMAGE_LAYER) walk(layers[j]);
            }
        })(doc);
        return list;
    }

    function artboardOfBox(doc, box) {
        var cx = box.left + box.w / 2, cy = box.top - box.h / 2;
        for (var i = 0; i < doc.artboards.length; i++) {
            var r = doc.artboards[i].artboardRect;
            if (cx >= r[0] && cx <= r[2] && cy <= r[1] && cy >= r[3]) return i;
        }
        return doc.artboards.getActiveArtboardIndex();
    }

    // 画像の入っていないキャラ欄に画像を入れる（表を作るときと同じ入れ方。1 行目はロゴとして切り抜かずに収める）
    //   戻り値：入れた画像の名前（「行N_ファイル名」）。キャンセルなら null
    function addImage(emptyId) {
        var doc = activeDoc();
        if (!doc) return json(null);
        var cell = emptyCells(doc)[emptyId];
        if (!cell) return json(null);
        var from = materialFolder(false);
        var f = from ? from.openDlg("入れる画像を選ぶ（行" + cell.row + "）", IMAGE_FILTER, false)
                     : File.openDialog("入れる画像を選ぶ（行" + cell.row + "）", IMAGE_FILTER, false);
        if (!f) return json(null);

        var g = placeInCell(cell.parent, cell.row, cell.box, f);
        app.redraw();
        return json({ name: g.name, logo: cell.row === 1 });
    }

    // キャラ欄のマスに画像を入れる（表を作るときと同じ入れ方。1 行目はロゴとして切り抜かずに収める）
    //   parent：表のレイヤー（中に「キャラ画像」レイヤーを作る）、box：マスの { left, top, w, h }
    function placeInCell(parent, row, box, f) {
        // 同じ表の「キャラ画像」レイヤー（なければ作って、表の中のいちばん上へ）
        var layer = null;
        try { layer = parent.layers.getByName(IMAGE_LAYER); } catch (e) { layer = null; }
        if (!layer) {
            layer = parent.layers.add();
            layer.name = IMAGE_LAYER;
            layer.zOrder(ZOrderMethod.BRINGTOFRONT);
        }
        var g = layer.groupItems.add();
        // 行の番号の順に並ぶように、自分より後ろの行の画像のすぐ上に置く
        for (var i = 0; i < layer.groupItems.length; i++) {
            var other = layer.groupItems[i];
            var m = /^行(\d+)_/.exec(other.name);
            if (other !== g && m && parseInt(m[1], 10) > row) {
                g.move(other, ElementPlacement.PLACEBEFORE);
                break;
            }
            if (i === layer.groupItems.length - 1) g.move(layer, ElementPlacement.PLACEATEND);
        }
        g.name = "行" + row + "_" + decodeURI(f.name).replace(/\.[^.]+$/, "");
        var img = g.placedItems.add();
        img.file = f;
        var b = box;
        if (row === 1) {
            var pad = 15;  // ロゴの余白
            var s = Math.min((b.w - pad * 2) / img.width, (b.h - pad * 2) / img.height) * 100;
            img.resize(s, s);
            img.position = [b.left + (b.w - img.width) / 2, b.top - (b.h - img.height) / 2];
        } else {
            var scale = Math.max(b.w / img.width, b.h / img.height) * 100;
            img.resize(scale, scale);
            img.position = [b.left + (b.w - img.width) / 2, b.top];  // 上ぞろえ
            g.pathItems.rectangle(b.top, b.left, b.w, b.h);       // グループのいちばん上のパスで切り抜く
            g.clipped = true;
        }
        return g;
    }

    // 表の「キャラ画像」レイヤーの、行 row の画像（グループ）。なければ null
    function rowImage(parent, row) {
        var layer = null;
        try { layer = parent.layers.getByName(IMAGE_LAYER); } catch (e) { return null; }
        for (var i = 0; i < layer.groupItems.length; i++) {
            var m = /^行(\d+)_/.exec(layer.groupItems[i].name);
            if (m && parseInt(m[1], 10) === row) return layer.groupItems[i];
        }
        return null;
    }

    // アートボードの表のキャラ欄を全部集める：[{ parent, row, box, label, note, image }]
    function charCells(doc, board) {
        var r = doc.artboards[board].artboardRect;
        var list = [];
        (function walk(container) {
            var table = null;
            for (var i = 0; i < container.layers.length; i++) if (container.layers[i].name === TABLE_LAYER) table = container.layers[i];
            if (table) {
                var texts = {};
                for (var t = 0; t < table.groupItems.length; t++) {
                    var tm = /^行(\d+)_列1$/.exec(table.groupItems[t].name);
                    if (tm && table.groupItems[t].textFrames.length) texts[tm[1]] = table.groupItems[t].textFrames[0].contents;
                }
                for (var c = 0; c < table.groupItems.length; c++) {
                    var cell = table.groupItems[c];
                    var m = /^行(\d+)_キャラ$/.exec(cell.name);
                    if (!m) continue;
                    var shape = cellShape(cell);
                    if (!shape) continue;
                    var box = cellBox(shape);
                    var cx = box.left + box.w / 2, cy = box.top - box.h / 2;
                    if (cx < r[0] || cx > r[2] || cy > r[1] || cy < r[3]) continue;
                    var row = parseInt(m[1], 10);
                    list.push({ parent: container, row: row, box: box,
                                label: texts[m[1]] || "", note: cell.note || "", image: rowImage(container, row) });
                }
            }
            for (var j = 0; j < container.layers.length; j++) {
                if (container.layers[j].name !== TABLE_LAYER && container.layers[j].name !== IMAGE_LAYER) walk(container.layers[j]);
            }
        })(doc);
        list.sort(function (a, b) { return a.row - b.row; });
        return list;
    }

    // アートボードの表のキャラ欄に、画像をまとめて入れる・変える画面
    //   表を作るときに CSV・Notion に書いてあった画像のファイル名（マスのメモ）が「素材」フォルダにあれば、最初から入る予定にしておく
    //   今の画像は「そのまま」にしておけば、調整した位置・大きさも残る
    function bulkImages(board) {
        var doc = activeDoc();
        if (!doc || !doc.artboards[board]) return json(null);
        var cells = charCells(doc, board);
        if (!cells.length) return json({ none: true });
        var folder = materialFolder(false);
        var filter = $.os.indexOf("Windows") >= 0 ? IMAGE_FILTER : function (f) {
            return f instanceof Folder || /\.(png|jpe?g|psd|tiff?|ai|eps|pdf|svg)$/i.test(f.name);
        };

        var dlg = new Window("dialog", "キャラ画像をまとめて入れる・変える");
        dlg.alignChildren = "fill";
        dlg.add("statictext", undefined, "「" + doc.artboards[board].name + "」のキャラ欄に入れる画像を選んでください");
        var panel = dlg.add("panel", undefined, "キャラ欄");
        panel.alignChildren = "fill";
        var states = [];
        for (var i = 0; i < cells.length; i++) states.push(addRow(panel, cells[i]));
        dlg.add("statictext", undefined, "「そのまま」の画像は、調整した位置・大きさも変わりません。「選ぶ…」は「素材」フォルダから開きます");
        var btns = dlg.add("group");
        btns.alignment = "right";
        btns.add("button", undefined, "OK", { name: "ok" });
        btns.add("button", undefined, "キャンセル", { name: "cancel" });
        if (dlg.show() !== 1) return json(null);

        var placed = 0, removed = 0;
        for (var k = 0; k < cells.length; k++) {
            var st = states[k], cell = cells[k];
            if (st.action === "keep") continue;
            if (cell.image) { cell.image.remove(); removed++; }
            if (st.action === "set") { placeInCell(cell.parent, cell.row, cell.box, st.file); placed++; }
        }
        app.redraw();
        return json({ placed: placed, removed: removed });

        function addRow(parent, cell) {
            var st = { action: "keep", file: null };
            var g = parent.add("group");
            var lbl = g.add("statictext", undefined, cell.row === 1 ? "1行目（ロゴ）" : cell.row + "行目　" + cell.label);
            lbl.preferredSize.width = 170;
            var text;
            if (cell.image) {
                text = cell.image.name.replace(/^行\d+_/, "") + "（そのまま）";
            } else if (cell.note) {
                var f = folder ? new File(folder.fsName + "/" + cell.note) : null;
                if (f && f.exists) {
                    st = { action: "set", file: f };
                    text = cell.note + "（入れる）";
                } else {
                    text = "（なし）見つかりません：" + cell.note;
                }
            } else {
                text = "（なし）";
            }
            var nameText = g.add("statictext", undefined, text);
            nameText.preferredSize.width = 280;
            var pick = g.add("button", undefined, "選ぶ…");
            var none = g.add("button", undefined, "なし");
            pick.onClick = function () {
                var from = st.file ? st.file.parent : folder;
                var f = from ? from.openDlg("画像を選ぶ（" + (cell.row === 1 ? "ロゴ" : cell.label || cell.row + "行目") + "）", filter, false)
                             : File.openDialog("画像を選ぶ", filter, false);
                if (!f) return;
                st.action = "set";
                st.file = f;
                if (f.parent) folder = f.parent;  // 次の行も同じフォルダから開く
                nameText.text = decodeURI(f.name) + "（入れる）";
            };
            none.onClick = function () {
                st.action = cell.image ? "remove" : "keep";
                st.file = null;
                nameText.text = cell.image ? "（なし）今の画像を外す" : "（なし）";
            };
            return st;
        }
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
        pickCSVs: pickCSVs,
        docNames: docNames,
        getTextSize: getTextSize,
        finishTable: finishTable,
        addImage: addImage,
        bulkImages: bulkImages,
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
