#target illustrator
/*
 * ステータス表作成.jsx
 * キャラクター用の基礎ステータス表を自動で作成する
 *
 * 使い方：Illustrator で ファイル → スクリプト → その他のスクリプト… からこのファイルを選択
 *   - 「CSVを選ぶ…」でデータを選ぶと、行数・列数はデータから自動で決まり、文字と画像も入る
 *   - CSV を選ばなければ、行数・列数を指定して空の表を作る
 *   （ドキュメントが開いていなければ 1920×1080 の RGB ドキュメントを新規作成します）
 *
 * CSV の形式（UTF-8）：CSV の1行がそのまま表の1行になる。1行目は項目名の行
 *   キャラ欄ありのときは、1列目が画像ファイルのパス（CSV からの相対パスか絶対パス。空欄なら画像なし）
 *   images/無限大ロゴ.png,キャラクター,HP,攻撃力,防御力,エネルギー
 *   images/タフィー.png,タフィー,3088,5088,4353,3618
 *
 * サイズや色、フォントを変えたいときは、下の CONFIG を書き換えてください。単位はすべて px です。
 */
(function () {
    var CONFIG = {
        // サイズと位置はイラレの表示と同じ値（基準点＝中心、Y はアートボードの上端から下向き）
        outer:  { w: 1505, h: 592.5, x: 960, y: 545 },      // 下地
        header: { w: 1490, h: 30,    x: 960, y: 271.25 },   // ヘッダー
        body:   { w: 1490, h: 540,   x: 960, y: 563.75 },   // テーブル（マス目になる範囲）
        gap: 7.5,                      // マス同士の間隔

        // このレイヤーがドキュメントにあれば、その長方形を使う（「テーブル」の長方形をマス目に加工する）
        layerNames: { outer: "下地", header: "ヘッダー", table: "テーブル" },

        defaultRows: 6,                // ダイアログの初期値：行数（CSV を使わないとき）
        defaultCols: 5,                // ダイアログの初期値：列数（キャラ欄は含まない）
        defaultCharacter: true,        // ダイアログの初期値：キャラ欄あり

        cornerRadius: 0,               // マス目の角丸（0 で角丸なし）

        // ラフ：サイズ 1 px（入力値）、詳細 100/inch、ギザギザ。マスの長方形だけにかけ、文字と画像にはかけない
        rough: { enabled: true, size: 1, detail: 100 },  // enabled はダイアログの初期値

        colors: {                      // RGB（新しく作るときの色）
            outer:  [128, 128, 128],   // #808080
            header: [48, 48, 48],      // #303030
            cell:   [48, 48, 48],      // #303030
            text:   [215, 215, 215]
        },

        // マスの文字。フォントが見つからなければ既定のフォント。マスに入りきらなければ自動で縮める
        // ヘッダーの帯の文字は AE でアニメーションさせるので、ここでは入れない
        text: {
            family: "Noto Sans JP", style: "Black",
            size: 40,                  // 参考画像の「タフィー」の高さ（約 36 px）に合わせた値
            padding: 12,               // マスの左右に空ける余白
            formatNumbers: true        // 数字だけの値に 3 桁区切りのカンマを付ける（3088 → 3,088）
        },

        // 数字だけの値の文字。縦位置はカンマを除いた数字の高さで中央に合わせる
        //（カンマが下にはみ出す分、全体で中央に合わせると上に寄って見えるため）
        number: {
            family: "Bahnschrift", style: "Bold",
            size: 46,                  // 参考画像の数字の高さ（カンマを除いて約 32 px）に合わせた値
            offsetY: 0                 // さらに下げたいときは正の値（px）
        },

        image: {
            valign: "top"              // キャラ画像をマスに合わせる位置："top"（顔が見えやすい）／"center"
        },

        defaultExport: true            // ダイアログの初期値：PNG で書き出す
    };

    var opts = showDialog();
    if (!opts) return;

    var data = null;
    if (opts.csvFile) {
        data = readCSV(opts.csvFile);
        if (!data) return;
        opts.rows = data.length;
        var maxLen = 0;
        for (var d = 0; d < data.length; d++) maxLen = Math.max(maxLen, data[d].length);
        opts.cols = maxLen - (opts.character ? 1 : 0);
        if (opts.cols < 1) {
            alert("CSV の列が足りません。キャラ欄ありのときは「画像」の列も含めてください。");
            return;
        }
    }

    var doc = app.documents.length ? app.activeDocument
                                   : app.documents.add(DocumentColorSpace.RGB, 1920, 1080);

    // アクティブなアートボード [左, 上, 右, 下]（スクリプトの座標は Y が上向き）
    var abIndex = doc.artboards.getActiveArtboardIndex();
    var ab = doc.artboards[abIndex].artboardRect;

    var textFont   = findFont(CONFIG.text.family, CONFIG.text.style);
    var numberFont = findFont(CONFIG.number.family, CONFIG.number.style);
    var missingFonts = [];
    if (!textFont) missingFonts.push(CONFIG.text.family + " " + CONFIG.text.style);
    if (!numberFont) missingFonts.push(CONFIG.number.family + " " + CONFIG.number.style);
    var missingImages = [];
    var roughTargets = [];

    // ---- 下地・ヘッダー・テーブル：レイヤーごとに、あれば使い、なければ作る（作ったものにはラフをかける） ----
    var tableLayer = findLayer(CONFIG.layerNames.table);
    var templateRect = tableLayer && tableLayer.pathItems.length ? tableLayer.pathItems[0] : null;

    if (tableLayer && !templateRect) {
        alert("「" + CONFIG.layerNames.table + "」レイヤーに長方形がありません。\n"
            + "すでにマス目になっている場合は、元の長方形に戻してから実行してください。");
        return;
    }

    // 下から 下地 → ヘッダー → テーブル の順に重なるように作る
    var outerRect  = existingOrNewRect(CONFIG.layerNames.outer, CONFIG.outer, CONFIG.colors.outer);
    var headerRect = existingOrNewRect(CONFIG.layerNames.header, CONFIG.header, CONFIG.colors.header);
    var body;
    if (templateRect) {
        body = boundsToBox(templateRect.geometricBounds);
    } else {
        tableLayer = doc.layers.add();
        tableLayer.name = CONFIG.layerNames.table;
        body = specToBox(CONFIG.body);
    }


    // ---- マス目の計算 ----
    // 行の高さ：例）6行なら (540 - 7.5×5) ÷ 6 = 83.75。キャラ欄はこの高さの正方形
    var cellH = (body.h - CONFIG.gap * (opts.rows - 1)) / opts.rows;

    var statX = opts.character ? body.left + cellH + CONFIG.gap : body.left;
    var statW = (body.left + body.w) - statX;
    var colW  = (statW - CONFIG.gap * (opts.cols - 1)) / opts.cols;

    if (cellH <= 0 || colW <= 0) {
        alert("マスのサイズが0以下になります。行数・列数を減らしてください。");
        return;
    }

    // ---- マスを作る（1マス＝1グループ：長方形・画像・文字） ----
    var cells = [];
    for (var r = 0; r < opts.rows; r++) {
        var top = body.top - r * (cellH + CONFIG.gap);
        var row = data ? data[r] : [];
        var col = 0;
        if (opts.character) {
            var charCell = makeCell("行" + (r + 1) + "_キャラ", top, body.left, cellH, cellH);
            if (row[0]) placeImage(charCell.group, row[0], top, body.left, cellH, cellH);
            col = 1;
        }
        for (var c = 0; c < opts.cols; c++) {
            var left = statX + c * (colW + CONFIG.gap);
            var cell = makeCell("行" + (r + 1) + "_列" + (c + 1), top, left, colW, cellH);
            var value = row[col + c];
            if (value) addCellText(cell.group, value, top, left, colW, cellH);
        }
    }
    if (templateRect) templateRect.remove();  // 元の「テーブル」の長方形はマス目に置き換える

    var roughFailed = false;
    if (opts.rough) {
        // asiz：入力値のサイズ／size：パーセントのサイズ／absoluteness 1：入力値／dtal：詳細／roundness 0：ギザギザ
        var roughXML = '<LiveEffect name="Adobe Roughen"><Dict data="'
                     + 'R asiz ' + CONFIG.rough.size
                     + ' R size ' + CONFIG.rough.size
                     + ' R absoluteness 1'
                     + ' R dtal ' + CONFIG.rough.detail
                     + ' R roundness 0 "/></LiveEffect>';
        for (var i = 0; i < roughTargets.length; i++) {
            try {
                roughTargets[i].applyEffect(roughXML);
            } catch (e) {
                roughFailed = true;
            }
        }
    }

    // マスの長方形だけを選択して終わる（ラフが効いていなければ「効果 → 最後の効果を適用」でまとめてかけられる）
    doc.selection = null;
    for (var s = 0; s < roughTargets.length; s++) roughTargets[s].selected = true;
    app.redraw();

    var exported = null;
    if (opts.exportPNG) {
        exported = exportTablePNG(outerRect ? [outerRect] : cells, opts.csvFile);
    }

    var msg = "ステータス表を作成しました（" + opts.rows + "行 × " + opts.cols + "列"
            + (opts.character ? "＋キャラ欄" : "") + (opts.rough ? "、ラフあり" : "、ラフなし") + "）\n"
            + "マスの高さ：" + round(cellH) + " px ／ 列幅：" + round(colW) + " px";
    if (exported) msg += "\n\nPNG を書き出しました：\n" + exported.fsName;
    if (missingFonts.length) msg += "\n\n※次のフォントが見つからないため、既定のフォントを使いました：\n" + missingFonts.join("\n");
    if (missingImages.length) msg += "\n\n※見つからなかった画像：\n" + missingImages.join("\n");
    if (roughFailed) msg += "\n\n※ラフ効果を適用できませんでした。効果メニューから手動で適用してください。";
    alert(msg);

    // ================================================================

    function showDialog() {
        var dlg = new Window("dialog", "ステータス表作成");
        dlg.alignChildren = "fill";

        var dataPanel = dlg.add("panel", undefined, "データ");
        dataPanel.alignChildren = "left";
        var csvLabel = dataPanel.add("statictext", undefined, "（CSV を選ばないと空の表を作ります）");
        csvLabel.characters = 40;
        var csvBtns = dataPanel.add("group");
        var pickBtn  = csvBtns.add("button", undefined, "CSVを選ぶ…");
        var clearBtn = csvBtns.add("button", undefined, "クリア");

        var sizePanel = dlg.add("panel", undefined, "サイズ（CSV を使わないとき）");
        sizePanel.alignChildren = "left";
        var g1 = sizePanel.add("group");
        g1.add("statictext", undefined, "行数：");
        var rowsInput = g1.add("edittext", undefined, String(CONFIG.defaultRows));
        rowsInput.characters = 4;
        var g2 = sizePanel.add("group");
        g2.add("statictext", undefined, "列数：");
        var colsInput = g2.add("edittext", undefined, String(CONFIG.defaultCols));
        colsInput.characters = 4;
        g2.add("statictext", undefined, "（キャラ欄を除く）");

        var optPanel = dlg.add("panel", undefined, "オプション");
        optPanel.alignChildren = "left";
        var charCheck = optPanel.add("checkbox", undefined, "左端にキャラ欄（正方形）を入れる");
        charCheck.value = CONFIG.defaultCharacter;
        var roughCheck = optPanel.add("checkbox", undefined, "ラフ効果をかける（手描き風のギザギザ）");
        roughCheck.value = CONFIG.rough.enabled;
        var exportCheck = optPanel.add("checkbox", undefined, "作成後に表の部分を PNG で書き出す");
        exportCheck.value = CONFIG.defaultExport;

        var btns = dlg.add("group");
        btns.alignment = "right";
        btns.add("button", undefined, "キャンセル", { name: "cancel" });
        btns.add("button", undefined, "OK", { name: "ok" });

        var csvFile = null;
        pickBtn.onClick = function () {
            var f = File.openDialog("CSV ファイルを選んでください", "*.csv");
            if (f) {
                csvFile = f;
                csvLabel.text = decodeURI(f.name);
                sizePanel.enabled = false;
            }
        };
        clearBtn.onClick = function () {
            csvFile = null;
            csvLabel.text = "（CSV を選ばないと空の表を作ります）";
            sizePanel.enabled = true;
        };

        if (dlg.show() !== 1) return null;

        var rows = parseInt(rowsInput.text, 10);
        var cols = parseInt(colsInput.text, 10);
        if (!csvFile && (!(rows >= 1) || !(cols >= 1))) {
            alert("行数・列数には1以上の整数を入力してください。");
            return null;
        }
        return {
            csvFile: csvFile,
            rows: rows,
            cols: cols,
            character: charCheck.value,
            rough: roughCheck.value,
            exportPNG: exportCheck.value
        };
    }

    function readCSV(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) {
            alert("CSV を開けませんでした：\n" + file.fsName);
            return null;
        }
        var text = file.read();
        file.close();
        if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);

        var rows = parseCSV(text);
        if (!rows.length) {
            alert("CSV にデータがありません。");
            return null;
        }
        return rows;
    }

    // ダブルクォートで囲んだ値（カンマや改行を含む値）にも対応する
    function parseCSV(text) {
        var rows = [], row = [], field = "", quoted = false;
        for (var i = 0; i < text.length; i++) {
            var ch = text.charAt(i);
            if (quoted) {
                if (ch === '"') {
                    if (text.charAt(i + 1) === '"') { field += '"'; i++; }
                    else quoted = false;
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                quoted = true;
            } else if (ch === ",") {
                row.push(trim(field)); field = "";
            } else if (ch === "\n") {
                row.push(trim(field)); field = "";
                pushRow(rows, row); row = [];
            } else if (ch !== "\r") {
                field += ch;
            }
        }
        row.push(trim(field));
        pushRow(rows, row);
        return rows;
    }

    function pushRow(rows, row) {
        for (var i = 0; i < row.length; i++) {
            if (row[i] !== "") { rows.push(row); return; }
        }
    }

    function findLayer(name) {
        try {
            return doc.layers.getByName(name);
        } catch (e) {
            return null;
        }
    }

    // イラレ表示の値（中心・Y 下向き）をスクリプトの座標（左上・Y 上向き）に変換する
    function specToBox(spec) {
        return { left: ab[0] + spec.x - spec.w / 2, top: ab[1] - (spec.y - spec.h / 2), w: spec.w, h: spec.h };
    }

    function boundsToBox(b) {
        return { left: b[0], top: b[1], w: b[2] - b[0], h: b[1] - b[3] };
    }

    function existingOrNewRect(layerName, spec, rgb) {
        var layer = findLayer(layerName);
        if (layer && layer.pathItems.length) return layer.pathItems[0];

        if (!layer) {
            layer = doc.layers.add();
            layer.name = layerName;
            // 既存のレイヤーを隠さないように重なり順を整える（下地は一番下、ヘッダーはテーブルのすぐ下）
            if (layerName === CONFIG.layerNames.outer) {
                layer.zOrder(ZOrderMethod.SENDTOBACK);
            } else if (tableLayer) {
                layer.move(tableLayer, ElementPlacement.PLACEAFTER);
            }
        }
        var box = specToBox(spec);
        var p = styleRect(layer.pathItems.rectangle(box.top, box.left, box.w, box.h), layerName, rgb);
        roughTargets.push(p);
        return p;
    }

    function makeCell(name, top, left, w, h) {
        var g = tableLayer.groupItems.add();
        g.name = name;
        var radius = CONFIG.cornerRadius;
        var p = radius > 0 ? g.pathItems.roundedRectangle(top, left, w, h, radius, radius)
                           : g.pathItems.rectangle(top, left, w, h);
        styleRect(p, name, CONFIG.colors.cell);
        roughTargets.push(p);
        var cell = { group: g, rect: p };
        cells.push(p);
        return cell;
    }

    function styleRect(p, name, rgb) {
        p.name = name;
        p.stroked = false;
        p.filled = true;
        p.fillColor = rgbColor(rgb);
        return p;
    }

    function addCellText(container, value, top, left, w, h) {
        var text = CONFIG.text.formatNumbers ? formatNumber(value) : value;
        var isNumber = /^-?[\d,]+(\.\d+)?$/.test(text);
        var size = isNumber ? CONFIG.number.size : CONFIG.text.size;

        var tf = container.textFrames.add();
        tf.contents = text;
        styleText(tf, isNumber ? numberFont : textFont, size);
        tf.textRange.paragraphAttributes.justification = Justification.CENTER;

        var maxW = w - CONFIG.text.padding * 2;
        if (tf.width > maxW) {
            tf.textRange.characterAttributes.size = size * maxW / tf.width;
        }
        if (isNumber) {
            // 縦位置はカンマ・小数点を除いた数字だけの形で中央に合わせる
            alignByGlyphs(tf, left + w / 2, top - h / 2 - CONFIG.number.offsetY, text.replace(/[,.]/g, ""));
        } else {
            alignByGlyphs(tf, left + w / 2, top - h / 2);
        }
        return tf;
    }

    function styleText(tf, font, size) {
        var attr = tf.textRange.characterAttributes;
        if (font) attr.textFont = font;
        attr.size = size;
        attr.fillColor = rgbColor(CONFIG.colors.text);
    }

    // 文字の見た目（アウトライン化した形）の中心を (x, y) に合わせる
    // verticalText を渡すと、縦位置はその文字列の形で測る（同じ書式・同じベースラインのまま）
    function alignByGlyphs(tf, x, y, verticalText) {
        var b = outlineBounds(tf, null);
        var vb = verticalText ? outlineBounds(tf, verticalText) : b;
        tf.translate(x - (b[0] + b[2]) / 2, y - (vb[1] + vb[3]) / 2);
    }

    function outlineBounds(tf, contents) {
        var dup = tf.duplicate();
        try {
            if (contents !== null) dup.contents = contents;
            var outline = dup.createOutline();
            var b = outline.geometricBounds;
            outline.remove();
            return b;
        } catch (e) {
            try { dup.remove(); } catch (e2) {}
            return tf.geometricBounds;
        }
    }

    // 画像をマスいっぱいに拡大・縮小し、マスの形でクリップする
    function placeImage(container, path, top, left, w, h) {
        var file = resolveFile(path);
        if (!file.exists) {
            missingImages.push(path);
            return null;
        }
        var g = container.groupItems.add();
        g.name = "画像";
        var img = g.placedItems.add();
        img.file = file;

        var scale = Math.max(w / img.width, h / img.height) * 100;
        img.resize(scale, scale);
        var imgTop = CONFIG.image.valign === "center" ? top - (h - img.height) / 2 : top;
        img.position = [left + (w - img.width) / 2, imgTop];

        g.pathItems.rectangle(top, left, w, h);  // グループの一番上のパスがクリップに使われる
        g.clipped = true;
        return g;
    }

    function resolveFile(path) {
        var f = new File(path);
        if (f.exists || !opts.csvFile) return f;
        return new File(opts.csvFile.parent.fsName + "/" + path);
    }

    // 表の部分だけを PNG で書き出す（一時的に表ぴったりのアートボードを作る）
    function exportTablePNG(items, csvFile) {
        var defaultName = csvFile ? decodeURI(csvFile.name).replace(/\.csv$/i, "") + ".png" : "ステータス表.png";
        var dest = (csvFile ? new File(csvFile.parent.fsName + "/" + defaultName) : new File(defaultName)).saveDlg("PNG の保存先", "*.png");
        if (!dest) return null;

        var vb = items[0].visibleBounds;  // ラフで少しはみ出す分も含める
        for (var k = 1; k < items.length; k++) {
            var b = items[k].visibleBounds;
            vb = [Math.min(vb[0], b[0]), Math.max(vb[1], b[1]), Math.max(vb[2], b[2]), Math.min(vb[3], b[3])];
        }
        var rect = [Math.floor(vb[0]), Math.ceil(vb[1]), Math.ceil(vb[2]), Math.floor(vb[3])];
        var tmp = doc.artboards.add(rect);
        var tmpIndex = doc.artboards.length - 1;
        doc.artboards.setActiveArtboardIndex(tmpIndex);

        var o = new ExportOptionsPNG24();
        o.antiAliasing = true;
        o.transparency = true;
        o.artBoardClipping = true;
        o.horizontalScale = 100;
        o.verticalScale = 100;
        try {
            doc.exportFile(dest, ExportType.PNG24, o);
        } finally {
            doc.artboards.setActiveArtboardIndex(abIndex);
            tmp.remove();
        }
        return dest;
    }

    // フォント名（ファミリー名とスタイル名）でフォントを探す。見つからなければ PostScript 名でも探す
    function findFont(family, style) {
        for (var i = 0; i < app.textFonts.length; i++) {
            var f = app.textFonts[i];
            if (f.family === family && f.style === style) return f;
        }
        try {
            return app.textFonts.getByName(family.replace(/\s+/g, "") + "-" + style);  // 例：NotoSansJP-Black
        } catch (e) {
            return null;
        }
    }

    function formatNumber(s) {
        if (!/^-?\d{4,}$/.test(s)) return s;
        return s.replace(/\B(?=(\d{3})+$)/g, ",");
    }

    function rgbColor(rgb) {
        var col = new RGBColor();
        col.red = rgb[0];
        col.green = rgb[1];
        col.blue = rgb[2];
        return col;
    }

    function trim(s) {
        return String(s).replace(/^\s+|\s+$/g, "");
    }

    function round(n) {
        return Math.round(n * 10000) / 10000;
    }
})();
