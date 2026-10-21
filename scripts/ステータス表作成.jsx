#target illustrator
/*
 * ステータス表作成.jsx
 * キャラクター用の基礎ステータス表を自動で作成する（AE/Premiere 用に1パーツ1レイヤーで出力）
 *
 * 使い方：Illustrator で ファイル → スクリプト → その他のスクリプト… からこのファイルを選択
 *        ダイアログで「行数」「列数」「キャラ欄の有無」を選んで OK
 *        （ドキュメントが開いていなければ 1920×1080 の RGB ドキュメントを新規作成します）
 * サイズや色を変えたいときは、下の CONFIG を書き換えてください。単位はすべて px です。
 */
(function () {
    var CONFIG = {
        outer:  { w: 1500, h: 590 },   // ① 外枠（下地・背景）
        header: { w: 1490, h: 30 },    // ② ヘッダー
        body:   { w: 1490, h: 545 },   // ③ 表の本体（マス目になる範囲）
        edgeMargin: 5,                 // 外枠の上下フチからヘッダー／本体までの余白
        gap: 5,                        // マス同士の間隔

        defaultRows: 6,                // ダイアログの初期値：行数
        defaultCols: 5,                // ダイアログの初期値：ステータス欄の列数（キャラ欄は含まない）
        defaultCharacter: true,        // ダイアログの初期値：キャラ欄あり

        cornerRadius: 0,               // マス目の角丸（0 で角丸なし）

        rough: { enabled: true, size: 1, detail: 100 },  // ラフ（入力値・ギザギザ）。enabled はダイアログの初期値

        colors: {                      // RGB
            outer:  [128, 128, 128],
            header: [48, 48, 48],
            cell:   [48, 48, 48]
        },

        separateLayers: true           // true: 1パーツ1レイヤー（動画用）／false: 「テーブル」レイヤー1つにまとめる
    };

    var opts = showDialog();
    if (!opts) return;

    var doc = app.documents.length ? app.activeDocument
                                   : app.documents.add(DocumentColorSpace.RGB, 1920, 1080);

    // アクティブなアートボードの中央を基準にする [左, 上, 右, 下]（Y は上が大きい）
    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var cx = (ab[0] + ab[2]) / 2;
    var cy = (ab[1] + ab[3]) / 2;

    // ---- 位置計算 ----
    var outerLeft = cx - CONFIG.outer.w / 2;
    var outerTop  = cy + CONFIG.outer.h / 2;

    var headerLeft = cx - CONFIG.header.w / 2;
    var headerTop  = outerTop - CONFIG.edgeMargin;

    var bodyLeft = cx - CONFIG.body.w / 2;
    var bodyTop  = (outerTop - CONFIG.outer.h + CONFIG.edgeMargin) + CONFIG.body.h;

    // 行の高さ：例）6行なら (545 - 5×5) ÷ 6 = 86.6667。キャラ欄はこの高さの正方形
    var cellH = (CONFIG.body.h - CONFIG.gap * (opts.rows - 1)) / opts.rows;

    var statX = opts.character ? bodyLeft + cellH + CONFIG.gap : bodyLeft;
    var statW = (bodyLeft + CONFIG.body.w) - statX;
    var colW  = (statW - CONFIG.gap * (opts.cols - 1)) / opts.cols;

    if (cellH <= 0 || colW <= 0) {
        alert("マスのサイズが0以下になります。行数・列数を減らしてください。");
        return;
    }

    // ---- 作成（先に作ったものほどレイヤーの下になる） ----
    var tableLayer = null;
    if (!CONFIG.separateLayers) {
        tableLayer = doc.layers.add();
        tableLayer.name = "テーブル";
    }

    var items = [];
    items.push(makeRect("外枠", outerTop, outerLeft, CONFIG.outer.w, CONFIG.outer.h, 0, CONFIG.colors.outer));
    items.push(makeRect("ヘッダー", headerTop, headerLeft, CONFIG.header.w, CONFIG.header.h, 0, CONFIG.colors.header));

    for (var r = 0; r < opts.rows; r++) {
        var top = bodyTop - r * (cellH + CONFIG.gap);
        if (opts.character) {
            items.push(makeRect("行" + (r + 1) + "_キャラ", top, bodyLeft, cellH, cellH, CONFIG.cornerRadius, CONFIG.colors.cell));
        }
        for (var c = 0; c < opts.cols; c++) {
            var left = statX + c * (colW + CONFIG.gap);
            items.push(makeRect("行" + (r + 1) + "_列" + (c + 1), top, left, colW, cellH, CONFIG.cornerRadius, CONFIG.colors.cell));
        }
    }

    var roughFailed = false;
    if (opts.rough) {
        var roughXML = '<LiveEffect name="Adobe Roughen"><Dict data="'
                     + 'R size ' + CONFIG.rough.size
                     + ' R detail ' + CONFIG.rough.detail
                     + ' I absoluteness 1 I roundness 0 "/></LiveEffect>';
        for (var i = 0; i < items.length; i++) {
            try {
                items[i].applyEffect(roughXML);
            } catch (e) {
                roughFailed = true;
            }
        }
    }

    app.redraw();
    alert("ステータス表を作成しました（" + opts.rows + "行 × " + opts.cols + "列"
        + (opts.character ? "＋キャラ欄" : "") + (opts.rough ? "、ラフあり" : "、ラフなし")
        + "、" + items.length + " パーツ）\n"
        + "マスの高さ：" + round(cellH) + " px ／ ステータス欄の列幅：" + round(colW) + " px"
        + (roughFailed ? "\n\n※ラフ効果を適用できませんでした。効果メニューから手動で適用してください。" : ""));

    function showDialog() {
        var dlg = new Window("dialog", "ステータス表作成");
        dlg.alignChildren = "left";

        var g1 = dlg.add("group");
        g1.add("statictext", undefined, "行数：");
        var rowsInput = g1.add("edittext", undefined, String(CONFIG.defaultRows));
        rowsInput.characters = 4;

        var g2 = dlg.add("group");
        g2.add("statictext", undefined, "列数：");
        var colsInput = g2.add("edittext", undefined, String(CONFIG.defaultCols));
        colsInput.characters = 4;
        g2.add("statictext", undefined, "（キャラ欄を除く）");

        var charCheck = dlg.add("checkbox", undefined, "左端にキャラ欄（正方形）を入れる");
        charCheck.value = CONFIG.defaultCharacter;

        var roughCheck = dlg.add("checkbox", undefined, "ラフ効果をかける（手描き風のギザギザ）");
        roughCheck.value = CONFIG.rough.enabled;

        var btns = dlg.add("group");
        btns.alignment = "right";
        btns.add("button", undefined, "キャンセル", { name: "cancel" });
        btns.add("button", undefined, "OK", { name: "ok" });

        rowsInput.active = true;
        if (dlg.show() !== 1) return null;

        var rows = parseInt(rowsInput.text, 10);
        var cols = parseInt(colsInput.text, 10);
        if (!(rows >= 1) || !(cols >= 1)) {
            alert("行数・列数には1以上の整数を入力してください。");
            return null;
        }
        return { rows: rows, cols: cols, character: charCheck.value, rough: roughCheck.value };
    }

    function makeRect(name, top, left, w, h, radius, rgb) {
        var container = tableLayer;
        if (CONFIG.separateLayers) {
            container = doc.layers.add();
            container.name = name;
        }
        var p = radius > 0 ? container.pathItems.roundedRectangle(top, left, w, h, radius, radius)
                           : container.pathItems.rectangle(top, left, w, h);
        p.name = name;
        p.stroked = false;
        p.filled = true;
        p.fillColor = rgbColor(rgb);
        return p;
    }

    function rgbColor(rgb) {
        var col = new RGBColor();
        col.red = rgb[0];
        col.green = rgb[1];
        col.blue = rgb[2];
        return col;
    }

    function round(n) {
        return Math.round(n * 10000) / 10000;
    }
})();
