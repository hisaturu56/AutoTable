#target illustrator
/*
 * ポロライドテーブル自動作成.jsx
 * キャラクター用の基礎ステータス表を自動で作成する
 *
 * 使い方：Illustrator で ファイル → スクリプト → その他のスクリプト… からこのファイルを選択
 *   - 「CSVを選ぶ…」でデータを選ぶと、行数・列数はデータから自動で決まり、文字と画像も入る
 *   - CSV を選ばなければ、行数・列数を指定して空の表を作る
 *   - アートボードに何かあれば（2 つ目以降の表）、新しいアートボードを右に追加して作る。アートボード名は表の名前（CSV のファイル名）
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
        // 表全体（下地）の位置と大きさの初期値。実行時のダイアログで変えられる
        // イラレの表示と同じ値（基準点＝中心、Y はアートボードの上端から下向き）
        layout: { x: 960, y: 540, w: 1505, h: 592.5 },   // 初期値はアートボード（1920×1080）の中心
        // ヘッダーとテーブルは下地から自動で計算する（初期値なら ヘッダー 1490×30、テーブル 1490×540）
        headerHeight: 30,
        margin: 7.5,                   // 下地のフチからヘッダー・テーブルまでの余白、ヘッダーとテーブルの間
        gap: 7.5,                      // マス同士の間隔
        settingsFile: Folder.userData + "/PolaroidTable_layout.txt",  // 前回入力した値を覚えておくファイル

        // このレイヤーがドキュメントにあれば、その長方形を使う（「テーブル」の長方形をマス目に加工する）
        layerNames: { outer: "下地", header: "ヘッダー", table: "テーブル", image: "キャラ画像" },  // キャラ画像はテーブルの上の別レイヤー

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

        // マスの文字。フォントが見つからなければ既定のフォント
        // ヘッダーの帯の文字は AE でアニメーションさせるので、ここでは入れない
        //
        // 文字の大きさは表全体でそろえ、マスの大きさに合わせて決める：
        //   1. マスの高さが refCellHeight のときに size になる比率で、マスの高さに比例させる（size が上限）
        //   2. 一番長い文字がマスの幅（左右 padding を除く）に収まるところまで、表全体をまとめて縮める
        //   文字と数字は同じ割合で縮むので、文字と数字の大きさのバランスは変わらない
        // 基準のマスの高さ。参考画像では 3〜7 行まで文字の大きさは同じ（高さ 約 36 px）だったので、
        // 7 行のマスの高さ（初期値の表で 70.714 px）までは size のまま、これより低いマスで縮め始める
        refCellHeight: 70.714,
        text: {
            family: "Noto Sans JP", style: "Black",
            size: 40,                  // 基準の大きさ（参考画像の「タフィー」の高さ 約 36 px に合わせた値）
            padding: 12,               // マスの左右に空ける余白
            formatNumbers: true        // 数字だけの値に 3 桁区切りのカンマを付ける（3088 → 3,088）
        },

        // 数字だけの値の文字。縦位置はカンマを除いた数字の高さで中央に合わせる
        //（カンマが下にはみ出す分、全体で中央に合わせると上に寄って見えるため）
        number: {
            family: "Bahnschrift", style: "Bold",
            size: 46,                  // 基準の大きさ（参考画像の数字の高さ、カンマを除いて約 32 px）
            offsetY: 0                 // さらに下げたいときは正の値（px）
        },

        image: {
            valign: "top",             // キャラ画像をマスに合わせる位置："top"（顔が見えやすい）／"center"
            logoPadding: 15,           // 1 行目（項目名の行）の画像（ロゴ）は切り抜かずに、この余白を空けてマスに収める
            filter: "画像:*.png;*.jpg;*.jpeg;*.psd;*.tif;*.tiff;*.ai;*.eps;*.pdf;*.svg"
        },

        // 2 つ目以降の表は、新しいアートボードを右に追加して作る
        newArtboard: { w: 1920, h: 1080, gap: 100 },

        defaultFitArtboard: true,      // ダイアログの初期値：アートボードを表にぴったり合わせる
        defaultExport: true,           // ダイアログの初期値：PNG で書き出す
        exportFolderName: "素材"        // Illustrator ファイルと同じ場所にあるこの名前のフォルダ。キャラ画像をここから探し、PNG もここへ保存（なければ作る）
    };

    var opts = showDialog();
    if (!opts) return;

    var data = null;
    if (opts.csvFile) {
        data = readCSV(opts.csvFile);
        if (!data) return;
        opts.rows = data.length;
        opts.character = hasImageColumn(data);
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

    // 表の名前：CSV のファイル名（例：(テスト)表作成テスト用台本_1_基礎ステータス比較）。CSV がなければ「表1」「表2」…
    // アートボード名・レイヤー名・PNG のファイル名に使う
    var tableName = opts.csvFile ? decodeURI(opts.csvFile.name).replace(/\.csv$/i, "") : "";

    var textFont   = findFont(CONFIG.text.family, CONFIG.text.style);
    var numberFont = findFont(CONFIG.number.family, CONFIG.number.style);
    var missingFonts = [];
    if (!textFont) missingFonts.push(CONFIG.text.family + " " + CONFIG.text.style);
    if (!numberFont) missingFonts.push(CONFIG.number.family + " " + CONFIG.number.style);
    var missingImages = [];
    var roughTargets = [];

    // キャラ欄があるときは、行ごとに入れる画像を選ぶ画面を出す（CSV に書いた画像が初期値）
    var images = [];
    if (opts.character) {
        images = pickImages();
        if (!images) return;
    }

    // ---- 下地・ヘッダー・テーブル ----
    // 「テーブル」レイヤー（一番上の階層）に長方形があれば、それをマス目に加工する（手で用意した下地・ヘッダーも使う）
    // それ以外は、表ごとに「表の名前」のレイヤーを作り、その中に 下地・ヘッダー・テーブル を作る（作ったものにはラフをかける）
    var layerRoot = doc;
    var tableLayer = findLayer(CONFIG.layerNames.table);
    var templateRect = tableLayer && tableLayer.pathItems.length ? tableLayer.pathItems[0] : null;
    var newArtboard = false;

    if (!templateRect) {
        tableLayer = null;
        // 今のアートボードにもう何かあれば（1 つ目の表など）、新しいアートボードを右に追加する
        if (!artboardIsEmpty(abIndex)) {
            abIndex = addArtboard();
            ab = doc.artboards[abIndex].artboardRect;
            newArtboard = true;
        }
        if (!tableName) tableName = "表" + (abIndex + 1);
        layerRoot = doc.layers.add();
        layerRoot.name = uniqueLayerName(tableName);
    }
    if (!tableName) tableName = "表" + (abIndex + 1);
    doc.artboards[abIndex].name = uniqueArtboardName(tableName, abIndex);

    // 下から 下地 → ヘッダー → テーブル の順に重なるように作る
    var specs = layoutSpecs(opts.layout);
    var outerRect  = existingOrNewRect(CONFIG.layerNames.outer, specs.outer, CONFIG.colors.outer);
    var headerRect = existingOrNewRect(CONFIG.layerNames.header, specs.header, CONFIG.colors.header);
    var body;
    if (templateRect) {
        body = boundsToBox(templateRect.geometricBounds);
    } else {
        tableLayer = layerRoot.layers.add();
        tableLayer.name = CONFIG.layerNames.table;
        body = specToBox(specs.body);
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
    var cellTexts = [];
    for (var r = 0; r < opts.rows; r++) {
        var top = body.top - r * (cellH + CONFIG.gap);
        var row = data ? data[r] : [];
        var col = 0;
        if (opts.character) {
            var charCell = makeCell("行" + (r + 1) + "_キャラ", top, body.left, cellH, cellH);
            if (images[r]) {
                var imageName = "行" + (r + 1) + "_" + (r === 0 ? "ロゴ" : (row[1] || "キャラ"));
                placeImage(imageLayerFor(), imageName, images[r], top, body.left, cellH, cellH, r === 0);
            }
            col = 1;
        }
        for (var c = 0; c < opts.cols; c++) {
            var left = statX + c * (colW + CONFIG.gap);
            var cell = makeCell("行" + (r + 1) + "_列" + (c + 1), top, left, colW, cellH);
            var value = row[col + c];
            if (value) cellTexts.push(addCellText(cell.group, value, top, left, colW, cellH));
        }
    }
    if (templateRect) templateRect.remove();  // 元の「テーブル」の長方形はマス目に置き換える

    var textScale = layoutCellTexts(cellTexts, cellH);

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

    var fitted = null;
    if (opts.fitArtboard) {
        fitted = fitArtboardToTable([outerRect, headerRect].concat(cells), opts.rough && !roughFailed);
    }
    var exported = null;
    if (opts.exportPNG) {
        exported = exportPNG(doc.artboards[abIndex].name);
    }

    var msg = "ステータス表を作成しました（" + opts.rows + "行 × " + opts.cols + "列"
            + (opts.character ? "＋キャラ欄" : "") + (opts.rough ? "、ラフあり" : "、ラフなし") + "）\n"
            + "マスの高さ：" + round(cellH) + " px ／ 列幅：" + round(colW) + " px\n"
            + "文字の大きさ：文字 " + round(CONFIG.text.size * textScale) + " pt ／ 数字 " + round(CONFIG.number.size * textScale) + " pt";
    msg += "\n\nアートボード：" + (abIndex + 1) + "「" + doc.artboards[abIndex].name + "」" + (newArtboard ? "（新しく追加）" : "");
    if (fitted) msg += "\nアートボードを表に合わせました：" + fitted.w + " × " + fitted.h + " px";
    if (exported) msg += "\n\nPNG を書き出しました：\n" + exported.fsName;
    if (missingFonts.length) msg += "\n\n※次のフォントが見つからないため、既定のフォントを使いました：\n" + missingFonts.join("\n");
    if (missingImages.length) msg += "\n\n※見つからなかった画像：\n" + missingImages.join("\n");
    if (roughFailed) msg += "\n\n※ラフ効果を適用できませんでした。効果メニューから手動で適用してください。";
    alert(msg);

    // ================================================================

    function showDialog() {
        var dlg = new Window("dialog", "ポロライドテーブル自動作成");
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
        var charCheck = sizePanel.add("checkbox", undefined, "左端にキャラ欄（正方形）を入れる");
        charCheck.value = CONFIG.defaultCharacter;
        sizePanel.add("statictext", undefined, "※ CSV を使うときは、1 列目が画像ファイルならキャラ欄ありになります");

        var layoutPanel = dlg.add("panel", undefined, "表全体（下地）の位置と大きさ（px・基準点は中心）");
        layoutPanel.alignChildren = "left";
        var saved = loadLayout();
        var g4 = layoutPanel.add("group");
        g4.add("statictext", undefined, "X：");
        var xInput = g4.add("edittext", undefined, String(saved.x));
        xInput.characters = 7;
        g4.add("statictext", undefined, "Y：");
        var yInput = g4.add("edittext", undefined, String(saved.y));
        yInput.characters = 7;
        var g5 = layoutPanel.add("group");
        g5.add("statictext", undefined, "幅：");
        var wInput = g5.add("edittext", undefined, String(saved.w));
        wInput.characters = 7;
        g5.add("statictext", undefined, "高さ：");
        var hInput = g5.add("edittext", undefined, String(saved.h));
        hInput.characters = 7;
        var resetBtn = layoutPanel.add("button", undefined, "初期値に戻す");
        layoutPanel.add("statictext", undefined, "※ 下地・ヘッダー・テーブルがすでにあるときは、そちらの位置を使います");
        resetBtn.onClick = function () {
            xInput.text = String(CONFIG.layout.x);
            yInput.text = String(CONFIG.layout.y);
            wInput.text = String(CONFIG.layout.w);
            hInput.text = String(CONFIG.layout.h);
        };

        var optPanel = dlg.add("panel", undefined, "オプション");
        optPanel.alignChildren = "left";
        var roughCheck = optPanel.add("checkbox", undefined, "ラフ効果をかける（手描き風のギザギザ）");
        roughCheck.value = CONFIG.rough.enabled;
        var fitCheck = optPanel.add("checkbox", undefined, "作成後、アートボードを表にぴったり合わせる（ラフのはみ出しも含む）");
        fitCheck.value = CONFIG.defaultFitArtboard;
        var exportCheck = optPanel.add("checkbox", undefined, "作成後、アートボードを PNG で書き出す（背景透過）");
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
        var layout = {
            x: parseFloat(xInput.text), y: parseFloat(yInput.text),
            w: parseFloat(wInput.text), h: parseFloat(hInput.text)
        };
        if (isNaN(layout.x) || isNaN(layout.y) || !(layout.w > 0) || !(layout.h > 0)) {
            alert("位置と大きさには数値を入力してください（幅・高さは 0 より大きい値）。");
            return null;
        }
        var minW = CONFIG.margin * 2, minH = CONFIG.margin * 3 + CONFIG.headerHeight;
        if (layout.w <= minW || layout.h <= minH) {
            alert("表が小さすぎます。幅は " + minW + " px、高さは " + minH + " px より大きくしてください。");
            return null;
        }
        saveLayout(layout);
        return {
            layout: layout,
            csvFile: csvFile,
            rows: rows,
            cols: cols,
            character: charCheck.value,
            rough: roughCheck.value,
            fitArtboard: fitCheck.value,
            exportPNG: exportCheck.value
        };
    }

    // 下地の位置と大きさから、ヘッダーとテーブルの位置と大きさを計算する（余白はすべて margin）
    function layoutSpecs(l) {
        var m = CONFIG.margin, hh = CONFIG.headerHeight;
        var top = l.y - l.h / 2;
        var innerW = l.w - m * 2;
        var bodyH = l.h - m * 3 - hh;
        return {
            outer:  { x: l.x, y: l.y, w: l.w, h: l.h },
            header: { x: l.x, y: top + m + hh / 2, w: innerW, h: hh },
            body:   { x: l.x, y: top + m + hh + m + bodyH / 2, w: innerW, h: bodyH }
        };
    }

    // 前回入力した位置と大きさを読む（なければ初期値）
    function loadLayout() {
        var l = { x: CONFIG.layout.x, y: CONFIG.layout.y, w: CONFIG.layout.w, h: CONFIG.layout.h };
        var f = new File(CONFIG.settingsFile);
        try {
            if (f.exists && f.open("r")) {
                var v = f.read().split(",");
                f.close();
                if (v.length === 4) {
                    var n = [parseFloat(v[0]), parseFloat(v[1]), parseFloat(v[2]), parseFloat(v[3])];
                    if (!isNaN(n[0]) && !isNaN(n[1]) && n[2] > 0 && n[3] > 0) {
                        l = { x: n[0], y: n[1], w: n[2], h: n[3] };
                    }
                }
            }
        } catch (e) {}
        return l;
    }

    function saveLayout(l) {
        var f = new File(CONFIG.settingsFile);
        try {
            if (f.open("w")) {
                f.write([l.x, l.y, l.w, l.h].join(","));
                f.close();
            }
        } catch (e) {}
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

    // 1 列目が画像ファイル（空欄も可）だけなら、キャラ欄ありの表とみなす
    function hasImageColumn(rows) {
        var found = false;
        for (var i = 0; i < rows.length; i++) {
            var v = rows[i][0] || "";
            if (v === "") continue;
            if (!/\.(png|jpe?g|psd|tiff?|gif|bmp|ai|eps|pdf|svg)$/i.test(v)) return false;
            found = true;
        }
        return found;
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
            return layerRoot.layers.getByName(name);
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
            layer = layerRoot.layers.add();
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

    // マスに文字を入れる（大きさと位置は、全部のマスを作ったあとに layoutCellTexts でそろえる）
    function addCellText(container, value, top, left, w, h) {
        var text = CONFIG.text.formatNumbers ? formatNumber(value) : value;
        var isNumber = /^-?[\d,]+(\.\d+)?$/.test(text);

        var tf = container.textFrames.add();
        tf.contents = text;
        styleText(tf, isNumber ? numberFont : textFont, isNumber ? CONFIG.number.size : CONFIG.text.size);
        tf.textRange.paragraphAttributes.justification = Justification.CENTER;
        return { tf: tf, text: text, isNumber: isNumber, top: top, left: left, w: w, h: h };
    }

    // 表全体の文字の大きさをそろえ、各マスの中央に置く。使った倍率を返す
    function layoutCellTexts(list, cellH) {
        // 1. マスの高さに比例（基準より大きいマスでも、基準の大きさを上限にする）
        var scale = Math.min(1, cellH / CONFIG.refCellHeight);

        // 2. 一番はみ出す文字がマスの幅に収まるように、表全体をまとめて縮める
        //   （いまは基準の大きさで入っているので、幅は基準の大きさで測る）
        for (var i = 0; i < list.length; i++) {
            var maxW = list[i].w - CONFIG.text.padding * 2;
            var needed = maxW / list[i].tf.width;
            if (needed < scale) scale = needed;
        }

        for (var j = 0; j < list.length; j++) {
            var t = list[j];
            var base = t.isNumber ? CONFIG.number.size : CONFIG.text.size;
            t.tf.textRange.characterAttributes.size = base * scale;
            if (t.isNumber) {
                // 縦位置はカンマ・小数点を除いた数字だけの形で中央に合わせる
                alignByGlyphs(t.tf, t.left + t.w / 2, t.top - t.h / 2 - CONFIG.number.offsetY * scale, t.text.replace(/[,.]/g, ""));
            } else {
                alignByGlyphs(t.tf, t.left + t.w / 2, t.top - t.h / 2);
            }
        }
        return scale;
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
    // キャラ画像のレイヤー（テーブルの上）。なければ作る
    var imageLayer = null;
    function imageLayerFor() {
        if (imageLayer) return imageLayer;
        imageLayer = findLayer(CONFIG.layerNames.image);
        if (!imageLayer) {
            imageLayer = layerRoot.layers.add();
            imageLayer.name = CONFIG.layerNames.image;
        }
        imageLayer.zOrder(ZOrderMethod.BRINGTOFRONT);
        return imageLayer;
    }

    // 画像をマスに入れる
    // キャラ画像：マスいっぱいに拡大し、マスの形で切り抜く（あとでグループの中の画像を動かして調整できる）
    // ロゴ（fitInside）：切り抜かずに、余白を空けてマスの中に収める
    function placeImage(container, name, file, top, left, w, h, fitInside) {
        var g = container.groupItems.add();
        g.name = name;
        var img = g.placedItems.add();
        img.file = file;

        if (fitInside) {
            var pad = CONFIG.image.logoPadding;
            var s = Math.min((w - pad * 2) / img.width, (h - pad * 2) / img.height) * 100;
            img.resize(s, s);
            img.position = [left + (w - img.width) / 2, top - (h - img.height) / 2];
            return g;
        }

        var scale = Math.max(w / img.width, h / img.height) * 100;
        img.resize(scale, scale);
        var imgTop = CONFIG.image.valign === "center" ? top - (h - img.height) / 2 : top;
        img.position = [left + (w - img.width) / 2, imgTop];

        g.pathItems.rectangle(top, left, w, h);  // グループの一番上のパスがクリップに使われる
        g.clipped = true;
        return g;
    }

    // キャラ欄の行ごとに、入れる画像を選ぶ画面。CSV に書いた画像（見つかれば）を初期値にする
    // 「選ぶ…」は「素材」フォルダから開く。キャンセルなら null（表を作らずに終わる）
    function pickImages() {
        var files = [];
        var notFound = [];  // CSV に書いてあるのに見つからなかった画像
        var startFolder = materialFolder(false) || (opts.csvFile ? opts.csvFile.parent : null);
        var filter = $.os.indexOf("Windows") >= 0 ? CONFIG.image.filter : function (f) {
            return f instanceof Folder || /\.(png|jpe?g|psd|tiff?|ai|eps|pdf|svg)$/i.test(f.name);
        };

        var dlg = new Window("dialog", "キャラ画像を選ぶ");
        dlg.alignChildren = "fill";
        dlg.add("statictext", undefined, "キャラ欄に入れる画像を選んでください（入れた後に Illustrator で位置や大きさを調整できます）");
        var panel = dlg.add("panel", undefined, "キャラ欄");
        panel.alignChildren = "fill";

        for (var r = 0; r < opts.rows; r++) {
            var row = data ? data[r] : [];
            var label = r === 0 ? "1行目（ロゴ）" : (r + 1) + "行目" + (row[1] ? "　" + row[1] : "");
            var initial = null;
            var note = "（なし）";
            if (row[0]) {
                var f = resolveFile(row[0]);
                if (f.exists) initial = f;
                else { note = "見つかりません：" + row[0]; notFound[r] = row[0]; }
            }
            files.push(initial);
            addRow(panel, r, label, initial ? decodeURI(initial.name) : note);
        }

        var btns = dlg.add("group");
        btns.alignment = "right";
        btns.add("button", undefined, "OK", { name: "ok" });
        btns.add("button", undefined, "キャンセル", { name: "cancel" });
        if (dlg.show() !== 1) return null;

        for (var i = 0; i < files.length; i++) {
            if (!files[i] && notFound[i]) missingImages.push(notFound[i]);
        }
        return files;

        function addRow(parent, index, label, name) {
            var g = parent.add("group");
            var lbl = g.add("statictext", undefined, label);
            lbl.preferredSize.width = 160;
            var nameText = g.add("statictext", undefined, name);
            nameText.preferredSize.width = 260;
            var pick = g.add("button", undefined, "選ぶ…");
            var clear = g.add("button", undefined, "なし");
            pick.onClick = function () {
                var from = files[index] ? files[index].parent : startFolder;
                var f = from ? from.openDlg("画像を選ぶ（" + label + "）", filter, false)
                             : File.openDialog("画像を選ぶ（" + label + "）", filter, false);
                if (f) {
                    files[index] = f;
                    nameText.text = decodeURI(f.name);
                    if (f.parent) startFolder = f.parent;  // 次の行も同じフォルダから開く
                }
            };
            clear.onClick = function () {
                files[index] = null;
                nameText.text = "（なし）";
            };
        }
    }

    // 画像ファイルを探す順番：そのままのパス → 「素材」フォルダ → CSV のあるフォルダ
    // 「素材」フォルダでは、フォルダ名を除いたファイル名だけでも探す（images/タフィー.png → 素材/タフィー.png）
    function resolveFile(path) {
        var f = new File(path);
        if (f.exists) return f;
        var candidates = [];
        var folder = materialFolder(false);
        if (folder) {
            candidates.push(folder.fsName + "/" + path);
            candidates.push(folder.fsName + "/" + path.replace(/^.*[\/\\]/, ""));
        }
        if (opts.csvFile) candidates.push(opts.csvFile.parent.fsName + "/" + path);
        for (var i = 0; i < candidates.length; i++) {
            var c = new File(candidates[i]);
            if (c.exists) return c;
        }
        return f;
    }

    // アートボードを表（下地・ヘッダー・マス）にぴったり合わせる
    // ラフのはみ出しも含め、端がぼやけないよう外側に向けて整数の px にそろえる
    function fitArtboardToTable(items, roughApplied) {
        var vb = null;
        for (var k = 0; k < items.length; k++) {
            if (!items[k]) continue;
            var b = items[k].visibleBounds;
            vb = vb ? [Math.min(vb[0], b[0]), Math.max(vb[1], b[1]), Math.max(vb[2], b[2]), Math.min(vb[3], b[3])] : b;
        }
        if (!vb) return null;

        // 見た目の範囲（visibleBounds）にラフのはみ出しが含まれていないときは、ラフの大きさの分だけ広げる
        var pad = 0;
        if (roughApplied && roughTargets.length) {
            var g = roughTargets[0].geometricBounds, v = roughTargets[0].visibleBounds;
            var same = Math.abs(g[0] - v[0]) < 0.01 && Math.abs(g[1] - v[1]) < 0.01
                    && Math.abs(g[2] - v[2]) < 0.01 && Math.abs(g[3] - v[3]) < 0.01;
            if (same) pad = CONFIG.rough.size;
        }
        var rect = [Math.floor(vb[0] - pad), Math.ceil(vb[1] + pad), Math.ceil(vb[2] + pad), Math.floor(vb[3] - pad)];
        doc.artboards[abIndex].artboardRect = rect;
        return { w: rect[2] - rect[0], h: rect[1] - rect[3] };
    }

    // アートボードの上に何か（表など）があるか
    function artboardIsEmpty(index) {
        try {
            doc.artboards.setActiveArtboardIndex(index);
            doc.selection = null;
            doc.selectObjectsOnActiveArtboard();
            var empty = doc.selection.length === 0;
            doc.selection = null;
            return empty;
        } catch (e) {
            return true;
        }
    }

    // 一番右のアートボードのさらに右に、新しいアートボードを追加して、その番号を返す
    function addArtboard() {
        var maxRight = -Infinity;
        var top = doc.artboards[0].artboardRect[1];
        for (var i = 0; i < doc.artboards.length; i++) {
            maxRight = Math.max(maxRight, doc.artboards[i].artboardRect[2]);
        }
        var n = CONFIG.newArtboard;
        var left = maxRight + n.gap;
        doc.artboards.add([left, top, left + n.w, top - n.h]);
        var index = doc.artboards.length - 1;
        doc.artboards.setActiveArtboardIndex(index);
        return index;
    }

    // 同じ名前があれば「名前 (2)」のように番号を付ける
    function uniqueArtboardName(name, selfIndex) {
        var used = {};
        for (var i = 0; i < doc.artboards.length; i++) {
            if (i !== selfIndex) used[doc.artboards[i].name] = true;
        }
        return uniqueName(name, used);
    }

    function uniqueLayerName(name) {
        var used = {};
        for (var i = 0; i < doc.layers.length; i++) used[doc.layers[i].name] = true;
        return uniqueName(name, used);
    }

    function uniqueName(name, used) {
        if (!used[name]) return name;
        for (var k = 2; ; k++) {
            if (!used[name + " (" + k + ")"]) return name + " (" + k + ")";
        }
    }

    // アクティブなアートボードを背景透過の PNG で書き出す
    // Illustrator ファイルが保存済みなら、同じ場所の「素材」フォルダへ自動で保存（フォルダがなければ作る）
    // 未保存のときやフォルダを作れないときは、保存先を選ぶ画面を出す
    function exportPNG(name) {
        var defaultName = name.replace(/[\\\/:*?"<>|]/g, "_") + ".png";  // ファイル名に使えない文字は _ に
        var csvFile = opts.csvFile;
        var dest = null;
        var folder = materialFolder(true);
        if (folder) {
            dest = new File(folder.fsName + "/" + defaultName);
            if (dest.exists && !confirm("「" + CONFIG.exportFolderName + "」フォルダに同じ名前の PNG があります。上書きしますか？\n"
                    + dest.fsName + "\n\n「いいえ」を選ぶと、保存先を選ぶ画面を出します。")) {
                dest = dest.saveDlg("PNG の保存先", "*.png");
            }
        } else {
            var start = csvFile ? csvFile.parent.fsName + "/" : "";
            dest = new File(start + defaultName).saveDlg("PNG の保存先", "*.png");
        }
        if (!dest) return null;

        doc.artboards.setActiveArtboardIndex(abIndex);
        var o = new ExportOptionsPNG24();
        o.antiAliasing = true;
        o.transparency = true;
        o.artBoardClipping = true;
        o.horizontalScale = 100;
        o.verticalScale = 100;
        doc.exportFile(dest, ExportType.PNG24, o);
        return dest;
    }

    // Illustrator ファイルと同じ場所の「素材」フォルダ。ファイルが未保存なら null
    // create が true なら、フォルダがないときに作る
    function materialFolder(create) {
        var base = null;
        try {
            if (doc.fullName && doc.fullName.exists) base = doc.fullName.parent;
        } catch (e) {
            base = null;  // 一度も保存していないドキュメント
        }
        if (!base) return null;
        var folder = new Folder(base.fsName + "/" + CONFIG.exportFolderName);
        if (folder.exists) return folder;
        if (create && folder.create()) return folder;
        return null;
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
