// パネル（CEP 拡張）を署名付きの .zxp にまとめる。ZXP UXP installer などで入れるためのファイル
// Adobe の ZXPSignCmd と同じ形式（XML 署名を META-INF/signatures.xml に入れた zip）で作る
//
// 使い方：java tools/SignZxp.java <パネルのフォルダ> <出力 .zxp> <証明書 .p12> <パスワード>
// tools/build_panel.py から呼ばれる

import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.zip.*;
import javax.xml.crypto.*;
import javax.xml.crypto.dom.DOMURIReference;
import javax.xml.crypto.dsig.*;
import javax.xml.crypto.dsig.dom.*;
import javax.xml.crypto.dsig.keyinfo.*;
import javax.xml.crypto.dsig.spec.*;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.*;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.w3c.dom.*;

public class SignZxp {
    static final String MIMETYPE = "application/vnd.adobe.air-ucf-package+zip";
    static final String SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
    static final String RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";

    public static void main(String[] args) throws Exception {
        Path root = Paths.get(args[0]);
        Path out = Paths.get(args[1]);
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (InputStream in = Files.newInputStream(Paths.get(args[2]))) {
            ks.load(in, args[3].toCharArray());
        }
        String alias = ks.aliases().nextElement();
        PrivateKey key = (PrivateKey) ks.getKey(alias, args[3].toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

        // 署名する中身（パネルのフォルダの全ファイル）
        List<String> files = new ArrayList<>();
        try (var walk = Files.walk(root)) {
            walk.filter(Files::isRegularFile).forEach(p -> files.add(root.relativize(p).toString().replace('\\', '/')));
        }
        Collections.sort(files);

        byte[] signatures = sign(root, files, key, cert);
        verify(root, signatures);

        // zip：mimetype を最初に無圧縮で入れる
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(out))) {
            byte[] mime = MIMETYPE.getBytes("US-ASCII");
            ZipEntry e = new ZipEntry("mimetype");
            e.setMethod(ZipEntry.STORED);
            e.setSize(mime.length);
            CRC32 crc = new CRC32();
            crc.update(mime);
            e.setCrc(crc.getValue());
            zip.putNextEntry(e);
            zip.write(mime);
            zip.closeEntry();
            for (String f : files) {
                zip.putNextEntry(new ZipEntry(f));
                zip.write(Files.readAllBytes(root.resolve(f)));
                zip.closeEntry();
            }
            zip.putNextEntry(new ZipEntry("META-INF/signatures.xml"));
            zip.write(signatures);
            zip.closeEntry();
        }
        System.out.println(out);
    }

    static byte[] sign(Path root, List<String> files, PrivateKey key, X509Certificate cert) throws Exception {
        XMLSignatureFactory fac = XMLSignatureFactory.getInstance("DOM");
        DigestMethod sha256 = fac.newDigestMethod(SHA256, null);

        List<Reference> fileRefs = new ArrayList<>();
        for (String f : files) fileRefs.add(fac.newReference(f, sha256));
        Manifest manifest = fac.newManifest(fileRefs, "PackageContents");
        XMLObject object = fac.newXMLObject(Collections.singletonList(manifest), null, null, null);

        Transform c14n = fac.newTransform(CanonicalizationMethod.INCLUSIVE, (TransformParameterSpec) null);
        Reference packageRef = fac.newReference("#PackageContents", sha256, Collections.singletonList(c14n), null, null);
        SignedInfo si = fac.newSignedInfo(
                fac.newCanonicalizationMethod(CanonicalizationMethod.INCLUSIVE, (C14NMethodParameterSpec) null),
                fac.newSignatureMethod(RSA_SHA256, null),
                Collections.singletonList(packageRef));
        KeyInfoFactory kif = fac.getKeyInfoFactory();
        KeyInfo ki = kif.newKeyInfo(Collections.singletonList(kif.newX509Data(Collections.singletonList(cert))));
        XMLSignature sig = fac.newXMLSignature(si, ki, Collections.singletonList(object), "PackageSignature", "PackageSignatureValue");

        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        Document doc = dbf.newDocumentBuilder().newDocument();
        Element signaturesEl = doc.createElement("signatures");
        doc.appendChild(signaturesEl);

        DOMSignContext ctx = new DOMSignContext(key, signaturesEl);
        ctx.setURIDereferencer(new FileDereferencer(root, fac.getURIDereferencer()));
        sig.sign(ctx);

        Transformer t = TransformerFactory.newInstance().newTransformer();
        t.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        t.setOutputProperty(OutputKeys.STANDALONE, "no");
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        t.transform(new DOMSource(doc), new StreamResult(bos));
        return bos.toByteArray();
    }

    // 作った署名を読み直して確かめる（ファイルの中身と署名が合っているか）
    static void verify(Path root, byte[] signatures) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        Document doc = dbf.newDocumentBuilder().parse(new ByteArrayInputStream(signatures));
        Element sigEl = (Element) doc.getElementsByTagNameNS(XMLSignature.XMLNS, "Signature").item(0);
        XMLSignatureFactory fac = XMLSignatureFactory.getInstance("DOM");
        DOMValidateContext ctx = new DOMValidateContext(new X509KeySelector(), sigEl);
        ctx.setURIDereferencer(new FileDereferencer(root, fac.getURIDereferencer()));
        ctx.setProperty("org.jcp.xml.dsig.secureValidation", Boolean.FALSE);
        XMLSignature sig = fac.unmarshalXMLSignature(ctx);
        if (!sig.validate(ctx)) throw new IllegalStateException("署名の確認に失敗しました");
        for (Object o : sig.getObjects()) {
            for (Object c : ((XMLObject) o).getContent()) {
                if (c instanceof Manifest m) {
                    for (Object r : m.getReferences()) {
                        if (!((Reference) r).validate(ctx)) throw new IllegalStateException("ファイルの確認に失敗しました：" + ((Reference) r).getURI());
                    }
                }
            }
        }
    }

    // ファイル名の参照はパネルのフォルダの中のファイルとして読む。#PackageContents などは標準の読み方
    static class FileDereferencer implements URIDereferencer {
        final Path root;
        final URIDereferencer fallback;
        FileDereferencer(Path root, URIDereferencer fallback) { this.root = root; this.fallback = fallback; }
        public Data dereference(URIReference ref, XMLCryptoContext ctx) throws URIReferenceException {
            String uri = ref.getURI();
            if (uri != null && !uri.startsWith("#")) {
                try {
                    return new OctetStreamData(new ByteArrayInputStream(Files.readAllBytes(root.resolve(uri))), uri, null);
                } catch (IOException e) {
                    throw new URIReferenceException(e);
                }
            }
            return fallback.dereference(ref, ctx);
        }
    }

    static class X509KeySelector extends KeySelector {
        public KeySelectorResult select(KeyInfo keyInfo, KeySelector.Purpose purpose, AlgorithmMethod method, XMLCryptoContext context) throws KeySelectorException {
            for (Object o : keyInfo.getContent()) {
                if (o instanceof X509Data xd) {
                    for (Object c : xd.getContent()) {
                        if (c instanceof X509Certificate cert) {
                            final PublicKey pk = cert.getPublicKey();
                            return () -> pk;
                        }
                    }
                }
            }
            throw new KeySelectorException("証明書が見つかりません");
        }
    }
}
