"""Mulakat notlari PDF'ini uretir. Yeni tanim eklemek icin SECTIONS listesine bolum ekle."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

FONT_DIR = Path("/System/Library/Fonts/Supplemental")
pdfmetrics.registerFont(TTFont("Body", str(FONT_DIR / "Arial.ttf")))
pdfmetrics.registerFont(TTFont("Body-Bold", str(FONT_DIR / "Arial Bold.ttf")))
pdfmetrics.registerFont(TTFont("Body-Italic", str(FONT_DIR / "Arial Italic.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic")

INK = colors.HexColor("#1f2933")
MUTED = colors.HexColor("#52606d")
RULE = colors.HexColor("#d9dee3")
TINT = colors.HexColor("#f3f5f7")

H1 = ParagraphStyle("H1", fontName="Body-Bold", fontSize=22, leading=28, textColor=INK, spaceAfter=4)
SUB = ParagraphStyle("Sub", fontName="Body", fontSize=10.5, leading=15, textColor=MUTED, spaceAfter=18)
H2 = ParagraphStyle("H2", fontName="Body-Bold", fontSize=15, leading=20, textColor=INK, spaceBefore=6, spaceAfter=8)
H3 = ParagraphStyle("H3", fontName="Body-Bold", fontSize=11.5, leading=16, textColor=INK, spaceBefore=12, spaceAfter=4)
P = ParagraphStyle("P", fontName="Body", fontSize=10.5, leading=16, textColor=INK, alignment=TA_LEFT, spaceAfter=6)
PK = ParagraphStyle("PK", parent=P)
CELL = ParagraphStyle("Cell", parent=P, fontSize=10, leading=14, spaceAfter=0)
CELL_B = ParagraphStyle("CellB", parent=CELL, fontName="Body-Bold")
CALLOUT = ParagraphStyle("Callout", parent=P, fontSize=11, leading=17, spaceAfter=0)


def callout(text):
    t = Table([[Paragraph(text, CALLOUT)]], colWidths=[16.4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TINT),
        ("LINEBEFORE", (0, 0), (0, -1), 3, INK),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return [Spacer(1, 4), t, Spacer(1, 8)]


def table(rows, widths):
    data = [[Paragraph(c, CELL_B if i == 0 else CELL) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * cm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [t, Spacer(1, 8)]


def calibration():
    s = [Paragraph("1. Kalibrasyon", H2)]
    s += callout("<b>Kalibrasyon:</b> modelin verdiği olasılığın, gerçekleşen orana yakınlığı. "
                 "Model \"%70 olasılıkla kazanır\" dediği maçların <b>yüzde kaçı gerçekten kazanılmış</b>? "
                 "Yaklaşık %70 ise model kalibredir.")

    s.append(Paragraph("Hava durumu benzetmesi", H3))
    s.append(Paragraph(
        "Bir hava durumu uygulaması \"%70 olasılıkla yağmur yağar\" diyor. Bir yıl boyunca takip edip bu cümleyi "
        "kurduğu bütün günleri topluyorsun. Bu günlerin yüzde kaçında yağmur yağmış? Yaklaşık %70'inde "
        "yağmışsa uygulama <b>kalibre</b>dir. Yalnızca %40'ında yağmışsa uygulama abartıyordur.", P))

    s.append(Paragraph("Maça uyarlarsak", H3))
    s.append(Paragraph(
        "Model \"Lakers bu maçı %70 olasılıkla kazanır\" diyor. Modelin bu olasılığı verdiği 100 maçı bir araya "
        "getiriyoruz ve soruyoruz: bunların yüzde kaçında ev sahibi gerçekten kazanmış?", PK))
    s += table([
        ["Gerçekte kazanılan oran", "Anlamı"],
        ["%70", "Kalibre. Model dürüst."],
        ["%90", "Model fazla çekingen. Daha emin olabilirdi."],
        ["%50", "Model fazla iddialı. \"%70 olasılıkla\" diyor ama gerçekte yazı tura gibi."],
    ], [5, 11.4])

    s.append(Paragraph("Doğruluk (accuracy) neden yetmiyor?", H3))
    s.append(Paragraph(
        "İki model aynı maçlarda favoriyi doğru seçiyor, yani doğrulukları aynı. Ama biri hep \"%99\", "
        "diğeri \"%65\" diyor. Gerçekte favoriler %65 kazanıyorsa ilki yanlış bir güven veriyor, ikincisi "
        "belirsizliğini doğru söylüyor.", P))
    s += table([
        ["", "Model A", "Model B"],
        ["Söylediği", "%99 kazanır", "%65 kazanır"],
        ["Gerçekte favoriler", "%65 kazanıyor", "%65 kazanıyor"],
        ["Sonuç", "Kalibre değil", "Kalibre"],
    ], [4.4, 6, 6])
    s.append(Paragraph(
        "Olasılığı bir karar için kullanıyorsan (risk, bahis) güvenilir olması gerekir. "
        "\"%99\" gören biri büyük risk alır ve yanılınca çok kaybeder.", P))

    s.append(Paragraph("Nasıl kontrol edilir?", H3))
    s.append(Paragraph(
        "Tek bir maça bakılmaz. Modelin benzer olasılık verdiği maçlar bir gruba toplanır ve o grubun yüzde "
        "kaçının gerçekten kazanıldığına bakılır. Projeden gerçek değerler (5 sezon walk-forward, ev sahibi "
        "galibiyeti):", PK))
    s += table([
        ["Modelin verdiği olasılık", "Maç sayısı", "Ortalama olasılık", "Gerçekten kazanılan"],
        ["%70-80", "949", "%74.6", "%73.5"],
        ["%80-100", "719", "%86.1", "%84.7"],
        ["%40-50", "978", "%45.3", "%50.0"],
    ], [4, 3.4, 4.6, 4.4])
    s.append(Paragraph(
        "İlk iki satırda verilen olasılık ile gerçekten kazanılan oran yaklaşık 1 puan farkla örtüşüyor, yani "
        "kalibre. Üçüncü satır zayıf: model ortalama %45 olasılık vermiş, gerçekte %50 kazanılmış. Bu farkların tek sayıya özeti <b>ECE</b>'dir (bantlardaki sapmanın "
        "maç sayısıyla ağırlıklı ortalaması). Bizim modelde <b>0.0153</b>, yani ortalama sapma yaklaşık 1.5 puan; "
        "0'a ne kadar yakınsa o kadar iyi.", P))
    s.append(Paragraph(
        "<b>Brier skoru</b> bu kontrolü ayırt ediciliği de katarak tek sayıya sıkıştırır. Kalibre olmak tek başına "
        "iyi olmak değildir: her maça \"%50\" diyen model de kalibreye yakındır ama hiçbir şeyi ayırt etmez.", P))

    s.append(Paragraph("Canlı izlemeden gerçek bir örnek", H3))
    s.append(Paragraph(
        "2026-27 kilitli sezonunda maç öncesi dondurulan tahminler (106 maç, sürümler karışık). Burada "
        "olasılık, modelin kazanır dediği takım için verilen olasılıktır:", PK))
    s += table([
        ["Modelin verdiği olasılık", "Maç", "Ortalama olasılık", "Gerçekten kazanılan"],
        ["%50-60", "35", "%55.2", "%34.3"],
        ["%60-70", "35", "%64.8", "%62.9"],
        ["%70-80", "29", "%74.5", "%82.8"],
        ["%80-100", "7", "%84.7", "%71.4"],
    ], [4.4, 2.4, 4.6, 5])
    s.append(Paragraph(
        "Okunuşu: modelin ortalama %84.7 olasılıkla kazanır dediği 7 maçın %71.4'ü (5'i) kazanılmış. "
        "%60-70 bandı neredeyse tam tutuyor. %50-60 bandında ise ortalama %55 olasılık verilen 35 maçın yalnızca "
        "%34.3'ü kazanılmış, yani model orada fazla iddialı. Bantlar küçük (7 maçta tek galibiyet oranı 14 puan "
        "oynatır), bu yüzden şimdilik uyarı olarak izleniyor, hüküm olarak değil.", P))

    s.append(Paragraph("Aynı tablo geçmiş 5 sezon için (sızıntısız walk-forward)", H3))
    s.append(Paragraph(
        "Her sezon yalnızca öncesindeki sezonlarla eğitilmiş modelle tahmin edildi (6,276 maç). Aşağıda canlı "
        "tabloyla aynı biçimde, favori denen takımın olasılığına göre bantlar. Sütunlar: modelin dediği / "
        "gerçekleşen.", PK))
    cc = json.loads((ROOT / "reports/evaluation/multi_season_walk_forward_backtest.json").read_text())["win_confidence_calibration"]
    labels = [b["label"] for b in cc["pooled"]["bands"]]
    rows = [["Sezon"] + [f"%{l[:-1]}" for l in labels] + ["ECE"]]
    live = {"50-60%": (55.2, 34.3), "60-70%": (64.8, 62.9), "70-80%": (74.5, 82.8), "80-100%": (84.7, 71.4)}
    def cell(b):
        return f"%{b['mean_confidence'] * 100:.1f} / %{b['accuracy'] * 100:.1f}"
    for season, tab in [*cc["by_season"].items(), ("5 sezon", cc["pooled"])]:
        by = {b["label"]: b for b in tab["bands"]}
        rows.append([season] + [cell(by[l]) if l in by else "-" for l in labels] + [f"{tab['ece'] * 100:.1f} puan"])
    rows.append(["2026-27 canlı"] + [f"%{live[l][0]} / %{live[l][1]}" for l in labels] + ["-"])
    s += table(rows, [2.6, 3.0, 3.0, 3.0, 3.0, 2.2])
    s.append(Paragraph(
        "Okunuşu: 5 sezon boyunca %50-60 bandında model ortalama %54.9 vermiş, gerçekte %53.0 kazanılmış, yani "
        "canlıdaki %34.3 gibi bir sapma geçmişte hiçbir sezonda görülmedi (en kötü sezon %49.7). Bu, canlı "
        "sonucun büyük olasılıkla küçük örneklem gürültüsü olduğunu, ama izlenmeye değer kaldığını gösteriyor. "
        "Sezonlar arasında ECE 0.8 ile 3.3 puan arasında değişiyor (2022-23 en zayıf), yani tek bir sezon "
        "tek başına kesin bir hüküm vermez.", P))

    s.append(Paragraph("Dikkat: tek maç değil, toplu bakılır", H3))
    s.append(Paragraph(
        "Model bir maça \"%70 olasılıkla kazanır\" deyip o maçı kaybedebilir, bu yanlış demek değildir: %30'luk bir "
        "ihtimal zaten vardı. Kalibrasyon, bu olasılığı verdiği çok sayıda maçın yüzde kaçının kazanıldığına "
        "bakar.", P))

    s.append(Paragraph("Bu projede", H3))
    s.append(Paragraph(
        "WIN modeli sade bir lojistik regresyon. Bu tür modeller yüzdeleri genelde zaten iyi kalibre "
        "üretir, bu yüzden ek bir kalibrasyon katmanı kazanç getirmedi. Kalibrasyon düzeltmesi gerekseydi, "
        "sızıntıyı önlemek için modelin eğitim verisinde değil, katlamalı (out-of-fold) tahminlerde "
        "öğrenilirdi.", P))
    s += callout("<b>Mülakat cümlesi:</b> \"Modelin verdiği olasılıklar uzun vadede gerçekleşme "
                 "oranlarıyla örtüşüyor. Bunu doğruluğa değil, Brier skoruna bakarak doğruladım.\"")
    return s


def brier():
    s = [PageBreak(), Paragraph("2. Brier Skoru", H2)]
    s += callout("<b>Brier skoru:</b> modelin olasılık tahminlerinin gerçek sonuçlardan ortalama ne kadar "
                 "uzak olduğunu ölçen hata sayısı. Düşük olması iyidir.")

    s.append(Paragraph("Nasıl hesaplanır?", H3))
    s.append(Paragraph(
        "Her maç için modelin olasılığı ve gerçek sonuç var. Kazandıysa sonuç <b>1</b>, kaybettiyse <b>0</b>. "
        "Hata, aradaki farkın karesidir. Bütün maçların hatasının ortalaması Brier skorudur.", P))

    s.append(Paragraph("Üç maçlık örnek", H3))
    s += table([
        ["Maç", "Model dedi", "Gerçek", "Fark", "Hata (fark²)"],
        ["1", "0.70", "1 (kazandı)", "0.30", "0.09"],
        ["2", "0.70", "0 (kaybetti)", "0.70", "0.49"],
        ["3", "0.60", "1 (kazandı)", "0.40", "0.16"],
    ], [2, 3.6, 4, 3, 3.8])
    s.append(Paragraph("Brier = (0.09 + 0.49 + 0.16) / 3 = <b>0.247</b>", P))
    s.append(Paragraph(
        "Kare alınmasının sebebi büyük yanlışları daha sert cezalandırmaktır. 0.70'lik fark 0.49 ceza verirken "
        "0.30'luk fark sadece 0.09 verir. Yani \"çok emin ol ve yanıl\" en pahalı hatadır.", P))

    s.append(Paragraph("Sayı ne anlama geliyor?", H3))
    s += table([
        ["Strateji", "Brier"],
        ["Mükemmel model (hep doğru ve %100 emin)", "0.000"],
        ["Bizim model (5 sezon ortalaması)", "<b>0.2098</b>"],
        ["Saf Elo baseline", "0.2157"],
        ["Hep \"%50\" de (hiç bilgi yok)", "0.250"],
        ["Her maça \"%100\" deyip yarısında yanılan", "0.500"],
    ], [11.4, 5])
    s.append(Paragraph(
        "0.250, \"hiçbir şey bilmeme\" çizgisidir. Ondan aşağı inmek öğrenmiş olmak demektir. NBA'de tek maç çok "
        "gürültülü olduğu için 0.20 civarı iyi bir bölgedir, 0.10 gibi değerler gerçekçi değildir.", P))

    s.append(Paragraph("Neden doğruluk yerine Brier?", H3))
    s.append(Paragraph(
        "Doğruluk sadece \"favori kazandı mı\" diye bakar, %51 ile %99 aynı sayılır. Brier olasılığın kendisini "
        "değerlendirir: %99 deyip yanılan çok cezalanır, %51 deyip yanılan neredeyse hiç.", P))

    s.append(Paragraph("Kalibrasyonla bağlantısı", H3))
    s.append(Paragraph(
        "Kalibrasyon bir özellik, Brier ise bir puandır. Brier'in içinde kalibrasyon bir parça olarak yer alır. "
        "Brier üç parçadan oluşur:", PK))
    s += table([
        ["Parça", "Ne demek", "Brier'e etkisi"],
        ["Belirsizlik", "Maçların doğal rastgeleliği, modelle ilgisi yok. NBA'de ~0.25", "Sabit taban"],
        ["Ayrıştırma", "Farklı maçlara farklı olasılık verip kazananı kaybedenden ayırabilmek", "Düşürür (iyi)"],
        ["Kalibrasyon hatası", "Söylenen yüzde ile gerçek oran arasındaki fark", "Yükseltir (kötü)"],
    ], [3.6, 9.2, 3.6])
    s.append(Paragraph(
        "Örnek: bir grup maçta ev sahibi gerçekte %70 kazanıyor. İki model aynı maçları aynı gruba koyuyor, "
        "fark sadece söyledikleri yüzde:", PK))
    s += table([
        ["", "Dediği", "Gerçek", "Brier"],
        ["Model A", "%70", "%70", "0.21"],
        ["Model B", "%90", "%70", "0.25"],
    ], [4, 4, 4, 4.4])
    s.append(Paragraph(
        "Aynı maçlar, aynı sıralama, sadece yüzde dürüst değil ve Brier 0.21'den 0.25'e çıkıyor. Fark 0.04, tam "
        "olarak (0.90 - 0.70)² yani söylenen ile gerçek arasındaki farkın karesi.", P))

    s.append(Paragraph("İyi kalibrasyon tek başına yetmez", H3))
    s += table([
        ["", "Kalibre", "Ayrıştırıyor", "Brier"],
        ["Hep %50 diyen model", "Evet", "Hayır", "0.25 (kötü)"],
        ["Cesur ama abartan model", "Hayır", "Evet", "Orta"],
        ["<b>İyi model</b>", "<b>Evet</b>", "<b>Evet</b>", "<b>~0.21</b>"],
    ], [6, 3, 3.4, 4])
    s.append(Paragraph(
        "Kısacası kötü kalibrasyon Brier'i kötüleştirir, ama düşük Brier tek başına kalibrasyonu kanıtlamaz. "
        "Bunu görmek için yukarıdaki kontrol tablosuna ayrıca bakılır.", P))

    s.append(Paragraph("Bu projede", H3))
    s.append(Paragraph(
        "WIN modeli 5 sezon walk-forward testte Brier <b>0.2098</b> aldı, saf Elo baseline'ı 0.2157. Fark yaklaşık "
        "0.006. Küçük görünür ama güven aralığı sıfırı içermiyor ([-0.0079, -0.0038]) ve model 5 sezonun 5'inde de "
        "Elo'dan iyi. Elo zaten güçlü bir baseline olduğu için küçük ama tutarlı bir fark değerlidir. Brier'in "
        "neredeyse tamamı ayrıştırmadan geliyor, kalibrasyon hatası çok küçük.", P))
    s += callout("<b>Mülakat cümlesi:</b> \"Olasılık ürettiğim için doğruluk yerine Brier skoruna baktım. Brier, "
                 "hem yüzdelerin dürüstlüğünü hem de maçları ayırt edebilmeyi ölçer. 0.25 hiç bilgi olmayan "
                 "çizgi, bizim model 0.2098 ve güçlü Elo baseline'ını 5 sezonun hepsinde geçiyor.\"")
    return s


def logloss():
    s = [PageBreak(), Paragraph("3. Log Loss", H2)]
    s += callout("<b>Log loss:</b> Brier'e çok benzeyen ikinci bir hata sayısı. Farkı, kendinden emin olup "
                 "yanılmayı çok daha sert cezalandırmasıdır. Düşük olması iyidir.")

    s.append(Paragraph("Nasıl hesaplanır?", H3))
    s.append(Paragraph(
        "Brier, tahmin ile sonuç arasındaki farkın karesine bakıyordu. Log loss şuna bakar: <b>model, gerçekte "
        "olan şeye ne kadar olasılık vermişti?</b> Hata, -ln(gerçekleşen sonuca verilen olasılık) olarak "
        "hesaplanır, sonra maçların ortalaması alınır. (ln, hesap makinesindeki doğal logaritma tuşudur. "
        "Detayı bilmek gerekmez, aşağıdaki tabloyu okumak yeter.)", P))

    s.append(Paragraph("Üç maçlık örnek (Brier'dekiyle aynı)", H3))
    s += table([
        ["Maç", "Model dedi", "Gerçek", "Gerçeğe verilen olasılık", "Hata"],
        ["1", "%70 kazanır", "kazandı", "0.70", "0.357"],
        ["2", "%70 kazanır", "kaybetti", "0.30", "1.204"],
        ["3", "%60 kazanır", "kazandı", "0.60", "0.511"],
    ], [1.6, 3.6, 3, 5, 3.2])
    s.append(Paragraph("Log loss = (0.357 + 1.204 + 0.511) / 3 = <b>0.691</b>", P))
    s.append(Paragraph(
        "Maç 2'de model kaybeden tarafa %30 vermişti, yani olanı düşük ihtimal saymıştı. Hata büyük.", P))

    s.append(Paragraph("Asıl fark: aşırı özgüven cezası", H3))
    s.append(Paragraph("Model bir tarafa \"kazanır\" dedi ve o taraf <b>kaybetti</b>. Tek maçta alınan ceza:", PK))
    s += table([
        ["Modelin verdiği olasılık", "Brier cezası", "Log loss cezası"],
        ["%50", "0.25", "0.69"],
        ["%60", "0.36", "0.92"],
        ["%70", "0.49", "1.20"],
        ["%90", "0.81", "2.30"],
        ["%99", "0.96", "<b>4.61</b>"],
        ["%100", "1.00", "<b>sonsuz</b>"],
    ], [6, 5, 5.4])
    s.append(Paragraph(
        "Brier'in tek maçtaki cezası en fazla 1'dir. Log loss'ta sınır yoktur: %99 deyip yanılmak %90 deyip "
        "yanılmanın iki katı pahalıdır, \"kesin\" deyip yanılmak ise sonsuz. Yani log loss \"asla %100 deme\" "
        "diyen bir ölçüdür.", P))

    s.append(Paragraph("Sayı ne anlama geliyor?", H3))
    s += table([
        ["Strateji", "Log loss"],
        ["Mükemmel model", "0.000"],
        ["Bizim model (5 sezon ortalaması)", "<b>0.6065</b>"],
        ["Hep \"%50\" de (hiç bilgi yok)", "0.693"],
    ], [11.4, 5])
    s.append(Paragraph("Brier'deki 0.250 çizgisinin karşılığı burada 0.693'tür. Altına inmek öğrenmiş olmak demektir.", P))

    s.append(Paragraph("Bu projede", H3))
    s.append(Paragraph(
        "Lojistik regresyon eğitilirken zaten log loss'u küçülterek öğrenir. Bu yüzden eğitim kriteri ile "
        "ölçtüğümüz metrik aynı ailedendir ve yüzdeler doğal olarak kalibre çıkar. \"Ek kalibrasyon gerekmedi\" "
        "demenin sebebi budur. Ana rapor sayımız Brier, log loss ise yardımcı kontroldür.", P))
    s += callout("<b>Mülakat cümlesi:</b> \"Brier'e ek olarak log loss'a da baktım. İkisi de olasılığın "
                 "dürüstlüğünü puanlar, ama log loss kendinden emin yanlışları çok daha sert cezalandırır. "
                 "Modelim 0.6065, hiç bilgi olmayan çizgi 0.693.\"")
    return s


def connection():
    s = [Spacer(1, 10), Paragraph("4. Üçünün Birbiriyle Bağlantısı", H2)]
    s += callout("Kalibrasyon bir <b>özellik</b>, Brier ve log loss bu özelliği (ayrıştırmayla birlikte) "
                 "ölçen iki <b>puandır</b>. Üçü de aynı soruya bakar: model olasılığı dürüstçe söylüyor mu?")

    s.append(Paragraph("Tek bakışta", H3))
    s += table([
        ["", "Kalibrasyon", "Brier", "Log loss"],
        ["Ne o?", "Yüzdeler gerçekle tutuyor mu", "Hata karesinin ortalaması", "Gerçeğe verilen olasılığın -ln'i"],
        ["Tür", "Özellik", "Puan", "Puan"],
        ["Tek sayı mı?", "Hayır, tabloyla görülür", "Evet", "Evet"],
        ["Hiç bilgi yok çizgisi", "-", "0.250", "0.693"],
        ["Bizim model", "İyi (ek düzeltme gerekmedi)", "0.2098", "0.6065"],
        ["Uç yanlışlara", "-", "Sert", "Çok daha sert"],
    ], [3.6, 4.6, 4, 4.2])

    s.append(Paragraph("Kim kimi etkiliyor?", H3))
    s += table([
        ["Durum", "Kalibrasyon", "Brier", "Log loss"],
        ["Yüzdeler abartılı ya da çekingen", "Bozulur", "Kötüleşir", "Kötüleşir (uçlarda çok)"],
        ["Maçları iyi ayırıyor", "Etkilemez", "İyileşir", "İyileşir"],
        ["Hep %50 diyor", "Kalibre", "0.250", "0.693"],
    ], [6, 3.2, 3.2, 4])
    s.append(Paragraph(
        "Kalibrasyon bozulursa iki puan da kötüleşir. Ama düşük puan tek başına kalibrasyonu kanıtlamaz, çünkü "
        "içinde ayrıştırma da vardır. Kalibrasyonu görmek için kontrol tablosuna ayrıca bakılır.", P))

    s.append(Paragraph("Hangisini ne için kullanıyoruz?", H3))
    s += table([
        ["Soru", "Bakılan şey"],
        ["Yüzdeler dürüst mü?", "Kalibrasyon tablosu"],
        ["Genel olarak ne kadar iyi?", "Brier (ana rapor sayısı)"],
        ["Uçlarda aşırı iddialı mı?", "Log loss (yardımcı kontrol)"],
        ["İkisi aynı yönü gösteriyor mu?", "Evet ise güven artar, değilse uç tahminlerde sorun vardır"],
    ], [7, 9.4])
    s += callout("<b>Mülakat cümlesi:</b> \"Olasılık ürettiğim için doğruluk yerine kalibrasyona, Brier'e ve "
                 "log loss'a baktım. Üçü aynı soruyu farklı açıdan sorar: yüzdelerim dürüst mü, maçları "
                 "ayırabiliyor muyum ve aşırı özgüvenli hatalar yapıyor muyum.\"")
    return s


def baseline():
    s = [PageBreak(), Paragraph("5. Baseline", H2)]
    s += callout("<b>Baseline:</b> akıllı bir model kurmadan, basit ve bedava bir yöntemle ne elde ederdim? "
                 "Modelin değeri, bu yöntemle aradaki farktır.")

    s.append(Paragraph("Neden gerekli?", H3))
    s.append(Paragraph(
        "\"Brier 0.2098\" tek başına bir şey söylemez. İyi mi kötü mü? Aynı maçlarda basit bir yöntem 0.2157 "
        "veriyorsa model gerçekten bir şey öğrenmiştir. Kıyas yoksa \"iyi\" kelimesi boş kalır.", P))

    s.append(Paragraph("İyi ve kötü baseline", H3))
    s += table([
        ["", "Kötü baseline", "İyi baseline"],
        ["Örnek", "\"Hep ev sahibi kazanır\" de", "Elo"],
        ["Sorun", "Çok kolay yenilir, kendini kandırırsın", "Güçlüdür, geçmek zordur"],
        ["Anlamı", "Kazansan da bir şey kanıtlamaz", "Geçersen gerçek değer üretmişsindir"],
    ], [2.6, 6.8, 7])
    s.append(Paragraph(
        "Bu projede eskiden zayıf baseline'lar vardı. Güçlü olanlarla (Elo, son 10 maç, EMA-10) değiştirdik, "
        "yani kendi başarımızı daha zor bir sınavla ölçtük.", P))

    s.append(Paragraph("Projedeki üç baseline", H3))
    s += table([
        ["Model", "Baseline", "Fikri"],
        ["WIN", "Saf Elo + ev sahibi avantajı", "Sadece takım güç puanı"],
        ["SCORE", "Son 10 maçın ortalama sayısı", "\"Son zamanlarda ne attıysa onu atar\""],
        ["PLAYER", "EMA-10", "Oyuncunun yakın formu"],
    ], [2.6, 6.8, 7])

    s.append(Paragraph("Gerçek sonuçlar: model baseline'a karşı", H3))
    s.append(Paragraph(
        "5 sezonluk walk-forward test (2021-22 ile 2025-26, 6.276 görülmemiş maç). Kaynak: "
        "<font name=\"Body-Italic\">reports/evaluation/multi_season_walk_forward_backtest.md</font>.", PK))
    s += table([
        ["Metrik", "Model", "Baseline", "Fark anlamlı mı?"],
        ["WIN Brier (düşük iyi)", "0.2098", "Elo 0.2157", "Evet, 5/5 sezon"],
        ["WIN log loss", "0.6065", "Elo ~0.620", "Evet, 5/5 sezon"],
        ["WIN doğruluk", "%66.25", "Elo %65.54", "-"],
        ["Margin MAE (sayı)", "10.85", "Son 10: 11.41", "Evet"],
        ["Total MAE (sayı)", "14.87", "Son 10: 14.95", "<b>Hayır</b>"],
        ["PTS MAE", "4.46", "EMA-10: 4.63", "5/5 sezon"],
    ], [4.6, 3, 4.4, 4.4])
    s.append(Paragraph(
        "Dürüst okuma: WIN için fark küçük ama tutarlı. Toplam skorda model baseline'dan ayrışmıyor, bunu "
        "saklamak yerine kendimiz söylüyoruz. 2026-27 canlı örneği henüz küçük, yaklaşık 300 maçta yeniden "
        "bakılacak.", P))
    s += callout("<b>Mülakat cümlesi:</b> \"Modelimi güçlü baseline'larla kıyasladım: galibiyette saf Elo, "
                 "skorda son 10 maç ortalaması, oyuncuda EMA-10. Baseline ne kadar güçlüyse kazanç o kadar "
                 "değerli olur. Elo'yu 5 sezonun 5'inde geçiyorum, toplam skorda ise baseline'dan ayrışmadığımı "
                 "açıkça raporluyorum.\"")
    return s


def elo():
    s = [Spacer(1, 10), Paragraph("6. Elo", H2)]
    s += callout("<b>Elo:</b> her takıma tek bir güç puanı veren ve bu puanı her maç sonucuyla güncelleyen "
                 "sistem. Satrançtaki reyting sistemiyle aynı mantık.")

    s.append(Paragraph("Nasıl çalışır?", H3))
    s.append(Paragraph(
        "1) Her takım aynı puanla başlar (projede 1500). 2) Maçtan önce puan farkına bakılır, fark büyüdükçe "
        "güçlü takımın kazanma ihtimali artar. 3) Maç oynanır. Beklenmedik sonuç puanı çok, beklenen sonuç az "
        "değiştirir. 4) Kazanan puan alır, kaybeden aynı miktarda kaybeder.", P))

    s.append(Paragraph("Elo neden güçlü baseline?", H3))
    s.append(Paragraph(
        "Sadece geçmiş sonuçlardan öğrenir ve takım gücünü tek puana sıkıştırır. NBA'de tek başına bile %65 "
        "doğruluk ve 0.2157 Brier verir. Üstüne bir şey eklemek zordur, çünkü takım gücü bilgisinin çoğunu "
        "zaten taşır. Modelimiz Elo'ya dinlenme, back-to-back ve rotasyon bilgisi ekler, kazanç bu yüzden küçük "
        "ama tutarlıdır.", P))
    s.append(Paragraph("Puan farkı kaç yüzde eder?", H3))
    s += table([
        ["Elo farkı", "Güçlü takımın kazanma ihtimali"],
        ["0", "%50"],
        ["100", "%64"],
        ["200", "%76"],
    ], [5, 11.4])
    s.append(Paragraph(
        "Ev sahibi takımın puanına ayrıca +50 eklenir (ev sahibi avantajı). Formül: "
        "olasılık = 1 / (1 + 10<super>-fark/400</super>).", P))

    s.append(Paragraph("Projenin Elo ayarları", H3))
    s += table([
        ["Ayar", "Değer", "Ne işe yarar"],
        ["Başlangıç puanı", "1500", "Herkesin ortak çıkış noktası"],
        ["K katsayısı", "10", "Tek maçın puanı ne kadar oynattığı"],
        ["Ev sahibi avantajı", "+50 puan", "Ev sahipleri ~%55 kazanır"],
        ["Sezon geçişi", "0.6", "Yeni sezonda puanlar 1500'e doğru kısmen geri çekilir (kadrolar değişir)"],
        ["Marj çarpanı (MOV)", "0.2 ile 3.5 arası", "Büyük farkla kazanmak puanı daha çok oynatır, favorinin farkı ise az"],
    ], [4, 3.4, 9])
    s.append(Paragraph(
        "K, ev sahibi avantajı ve sezon geçişi kendi geçmiş verimizde grid ile ayarlandı: eski ayarlar "
        "(K=20, avantaj 100, geçiş 0.75) 0.648 log loss verirken yeni ayar 0.625 verdi. Yani baseline'ı bile "
        "kendimiz güçlendirdik, bu da modeli geçmeyi zorlaştırır.", P))

    s.append(Paragraph("Gerçek örnek 1: 2026-27 açılış puanları", H3))
    s += table([
        ["En yüksek", "Puan", "En düşük", "Puan"],
        ["NYK", "1645", "BKN", "1351"],
        ["OKC", "1644", "MEM", "1357"],
        ["SAS", "1631", "WAS", "1368"],
    ], [4, 4, 4, 4.4])
    s.append(Paragraph("En üst ile en alttaki takım arasında yaklaşık 294 puan fark var.", P))

    s.append(Paragraph("Gerçek örnek 2: bir maçın baştan sona hesabı", H3))
    s.append(Paragraph(
        "20 Ekim 2026, sezonun ilk günü: NYK (ev sahibi) - PHI. Bu sonuçlar projenin Elo motoruyla "
        "doğrulandı.", PK))
    s += table([
        ["Adım", "Değer"],
        ["NYK açılış puanı", "1645.15"],
        ["PHI açılış puanı", "1566.00"],
        ["Ev sahibi avantajı eklenince fark", "1645.15 + 50 - 1566.00 = 129.15"],
        ["Elo'nun verdiği NYK kazanma ihtimali", "%67.8"],
        ["Gerçek sonuç", "PHI 106 - NYK 100 (sürpriz)"],
        ["Bu maçın Brier hatası (Elo)", "(0.678 - 0)² = 0.459"],
        ["Bu maçın log loss hatası (Elo)", "-ln(1 - 0.678) = 1.132"],
        ["Marj çarpanı", "2.07 (sürpriz, 6 sayı fark)"],
        ["Puan değişimi", "10 x 2.07 x (0 - 0.678) = -14.0"],
        ["Yeni puanlar", "NYK 1631.1, PHI 1580.0"],
    ], [7.4, 9])
    s.append(Paragraph(
        "Marj çarpanı olmasaydı değişim yalnızca -6.8 olurdu. Sürpriz sonuçlar sistemi daha çok oynatır.", P))

    s.append(Paragraph("Gerçek örnek 3: Elo ile model ayrıştığında", H3))
    s.append(Paragraph(
        "2026-27 canlı ledger'ında, maç başlamadan dondurulmuş v15 tahminleri arasında Elo ile modelin en çok "
        "ayrıştığı iki maç. Biri modelin, diğeri Elo'nun lehine.", PK))
    s += table([
        ["Maç (ev sahibi önce)", "Elo", "Model", "Sonuç", "Brier: model / Elo"],
        ["30 Ekim, GSW - LAL", "%42.2", "%74.3", "GSW 17 farkla kazandı", "0.066 / 0.334"],
        ["31 Ekim, MEM - SAC", "%66.7", "%31.8", "MEM 31 farkla kazandı", "0.465 / 0.111"],
    ], [4.2, 1.8, 2, 4.8, 3.6])
    s.append(Paragraph(
        "Tek maç hiçbir şey kanıtlamaz: model birinde Elo'dan iyi, diğerinde çok daha kötü. Önemli olan yüzlerce "
        "maçın ortalaması ve güven aralığıdır, yani bir sonraki konu.", P))

    s += callout("<b>Mülakat cümlesi:</b> \"Elo, takım gücünü tek puanla tutan ve her maçta kendini güncelleyen "
                 "güçlü bir baseline. Ayarlarını kendimiz grid ile güçlendirdik. Modelim onu 5 sezonun 5'inde "
                 "Brier'de geçiyor, ama fark küçük, çünkü Elo zaten takım gücü bilgisinin çoğunu taşıyor.\"")
    return s


def walk_forward():
    s = [PageBreak(), Paragraph("7. Walk-Forward ve Veri Sızıntısı", H2)]
    s += callout("<b>Veri sızıntısı:</b> modelin, gerçek hayatta o anda bilemeyeceği bir bilgiyi görmesi. "
                 "<b>Walk-forward:</b> zamanı gerçek sırasıyla oynamak, yani her zaman sadece geçmişle eğitip "
                 "hemen sonraki dönemi test etmek.")

    s.append(Paragraph("Sızıntı: sınavda cevap anahtarı", H3))
    s.append(Paragraph(
        "Öğrenci sınava girerken cevap anahtarını gizlice görmüş. Notu 100 çıkar ama gerçekten öğrendiği "
        "anlamına gelmez. Sızıntılı model de backtestte harika görünür, canlıda çöker.", P))
    s += table([
        ["Sızıntı türü", "Örnek", "Sonuç"],
        ["Maçın kendisini istatistiğe katmak", "\"Son 10 maç ortalaması\" hesabına bugünkü maçı da dahil etmek",
         "Model sonucu zaten görmüştür"],
        ["Rastgele bölme", "Maçları karıştırıp %80 eğitim, %20 test yapmak",
         "Gelecekteki maç eğitimde, geçmiştekiler testte kalabilir"],
        ["Aynı veride kalibrasyon", "Modeli ve kalibrasyonu aynı veride öğrenmek",
         "Kalibrasyon olduğundan iyi görünür"],
        ["Test setine bakarak ayar", "Hiperparametreyi test sonucuna göre seçmek",
         "Test artık \"görülmemiş\" değildir"],
    ], [4.4, 6.4, 5.6])

    s.append(Paragraph("Walk-forward: projedeki beş katlama", H3))
    s.append(Paragraph(
        "Eğitim penceresi her adımda büyür (expanding window). Her sezonun sonucu, o sezonu hiç görmemiş bir "
        "modelden gelir.", PK))
    s += table([
        ["Katlama", "Eğitim", "Test", "Test maçı"],
        ["1", "2020-21", "2021-22", "1.256"],
        ["2", "2020-21 ile 2021-22", "2022-23", "1.248"],
        ["3", "2020-21 ile 2022-23", "2023-24", "1.259"],
        ["4", "2020-21 ile 2023-24", "2024-25", "1.256"],
        ["5", "2020-21 ile 2024-25", "2025-26", "1.257"],
    ], [2.4, 6.4, 3.8, 3.8])
    s.append(Paragraph(
        "Toplam 6.276 görülmemiş maç. Rastgele bölmede model gelecekteki maçla eğitilip geçmişi tahmin "
        "edebilir, walk-forward bunu engeller.", P))

    s.append(Paragraph("Projede sızıntıyı nasıl engelledik?", H3))
    s += table([
        ["Önlem", "Ne yapıyor"],
        ["shift(1)", "Takım ve oyuncu istatistikleri bir maç geriye kaydırılarak hesaplanır. Kodda 41 yerde "
                     "kullanılıyor, bir maçın özelliği o maçın kendi sonucunu içeremez."],
        ["OOF kalibrasyon", "Kalibrasyon, eğitim verisi içinde zaman sıralı 3 parçaya bölünerek (out-of-fold) "
                            "öğrenilir. Model kendi tahminleriyle kalibre edilmez."],
        ["Sızıntı testleri", "Örneğin bu gecenin gerçek dakikalarının özelliklere karışmadığını kontrol eder."],
        ["Kilitli sezon", "2026-27, model eğitimi, hiperparametre ve özellik seçiminde hiç kullanılmaz."],
    ], [4, 12.4])

    s.append(Paragraph("Gerçek bir hata hikâyesi: train-serve skew", H3))
    s.append(Paragraph(
        "Sızıntının kuzeni: özellik eğitimde bir şekilde, canlıda başka şekilde hesaplanıyor. Projede bulduğumuz "
        "örnek: playoff maçlarında <b>IS_PLAYOFF</b> hep 0 dönüyordu, çünkü başka sütunlar onu gölgeliyordu. "
        "Eğitimde doğruydu, canlıda yanlıştı.", P))
    s += table([
        ["", "Düzeltmeden önce", "Düzeltmeden sonra"],
        ["Canlı toplam skor tahminleri", "Yaklaşık 7.5 sayı yüksek", "Normal"],
        ["Offline ile canlı arasındaki fark", "+0.109", "-0.002"],
    ], [6.4, 5, 5])
    s.append(Paragraph(
        "Bu tek hata farkın yaklaşık %95'ini açıklıyordu. Bu yüzden eğitim ve canlı hesapları karşılaştıran "
        "parite testleri tutuyoruz.", P))

    s.append(Paragraph("Dürüst sınırlar", H3))
    s += table([
        ["Sınır", "Ne anlama geliyor"],
        ["Aynı katlamalara tekrar tekrar baktık",
         "Özellik ve model kararlarını 2021-22 ile 2025-26 sonuçlarına bakarak verdik. Bu, sonuçları hafif "
         "iyimser yapabilir. Bu yüzden 2026-27 kilitli: gerçekten dokunulmamış bir sınav."],
        ["Elo ayarları tüm geçmişte yapıldı",
         "K, ev sahibi avantajı ve sezon geçişi 2020-21 ile 2025-26 üzerinde seçildi. Elo aynı zamanda modelin "
         "özelliği (ELO_DIFF) olduğu için bu ayar hem baseline'a hem modele yarar. Etkinin yönü belirsiz, "
         "kilitli sezon bu yüzden önemli."],
        ["\"Kimin oynamadığı\" bilgisi",
         "Backtestte kadro eksikliği o maçın kendi kaydından, canlıda sakatlık raporundan ve \"önceki maçta "
         "oynayan oynar\" varsayımından geliyor. WIN kazancının büyük kısmı bu özelliklerden. Ölçtük, aşağıda."],
        ["Sakatlık raporu eşleşmesi",
         "Raporda 209 farklı oyuncu vardı, 194'ü kimlikle eşleşti. Kalan 15: 8 çaylak (maç kaydı yok), 7 takas "
         "edilmiş oyuncu, 1 isim ayrıştırma hatası (\"Udeh, Jr., Ernest\", düzeltildi). Takas edilen oyuncu yeni "
         "takımda oynayana kadar rotasyona girmiyor, eğitimde de öyle; yani tutarlı ama o oyuncunun OUT bilgisi "
         "kullanılmıyor."],
    ], [5, 11.4])

    s.append(Paragraph("Kadro bilgisi: kazancın ne kadarı canlıda kalıyor?", H3))
    s.append(Paragraph(
        "Aynı walk-forward'ı farklı kadro varsayımlarıyla çalıştırdık (6.276 maç). \"Canlı varsayım\" sakatlık "
        "raporunu içermez, yani canlıda elde edilecek bilginin alt sınırıdır.", PK))
    s += table([
        ["Varyant", "Brier", "Log loss", "Elo'ya fark"],
        ["Maç kaydındaki gerçek kadro (rapor rakamı)", "0.2098", "0.6065", "-0.0059"],
        ["Aynı model, canlı varsayımla test", "0.2135", "0.6159", "-0.0022"],
        ["Canlı varsayımla yeniden eğitilmiş", "0.2124", "0.6132", "-0.0033"],
        ["Kadro özellikleri hiç yok", "0.2141", "0.6170", "-0.0016"],
        ["Saf Elo", "0.2157", "0.6203", "-"],
    ], [7.4, 2.6, 2.8, 3.6])
    s.append(Paragraph(
        "Gerçek kadro bilgisiyle kazanç -0.0059 görünüyor, ama bu bilgi maç bitmeden bilinmiyor. Canlı varsayımla "
        "kazanç yaklaşık -0.0022 ile -0.0033 arasına iniyor; ilki için %95 aralık [-0.0041, -0.0002], yani Elo'yu "
        "hâlâ geçiyor ama marjinal. Sakatlık raporu bu farkın bir kısmını geri getiriyor; ne kadarını, canlı "
        "defter büyüdükçe görülecek.", P))
    s += callout("<b>Mülakat cümlesi:</b> \"Rastgele bölme yerine expanding-window walk-forward kullandım: her "
                 "sezon yalnızca önceki sezonlarla eğitilmiş modelle test edildi, 6.276 görülmemiş maç. "
                 "Özellikler shift(1) ile, kalibrasyon OOF. Aynı katlamalara tekrar baktığım için 2026-27'yi "
                 "kilitleyip tahminleri maç öncesi dondurarak canlı izliyorum. Kendi iyimserliğimi de ölçtüm: kadro "
                 "özelliklerini canlıdaki gibi yalnızca önceki maçtan türettiğimde Elo karşısındaki kazanç 0.0059'dan "
                 "0.0022'ye iniyor, hâlâ anlamlı ama küçük.\"")
    return s


def bootstrap():
    s = [PageBreak(), Paragraph("8. Bootstrap Güven Aralığı", H2)]
    s += callout("<b>Soru:</b> modelin baseline'a karşı farkı gerçek mi, yoksa şanslı bir örnek mi? "
                 "<b>Bootstrap:</b> aynı veriyi yapay olarak tekrar tekrar \"yeniden oynayıp\" farkın ne kadar "
                 "oynadığına bakmak. Yeni veri toplamaya gerek yoktur.")

    s.append(Paragraph("Nasıl çalışır?", H3))
    s += table([
        ["Adım", "Ne yapılır"],
        ["1", "Her maç için fark hesaplanır: model hatası eksi baseline hatası"],
        ["2", "Bu listeden yerine koyarak rastgele yeniden örnekleme yapılır. Aynı gün birden çok kez çıkabilir, "
              "bazı günler hiç çıkmayabilir"],
        ["3", "Her yeniden örneklemede farkın ortalaması hesaplanır"],
        ["4", "Bu 2.000 kez tekrarlanır, elde 2.000 \"alternatif gerçeklik\" olur"],
        ["5", "Bu 2.000 ortalamanın ortadaki %95'i, %95 güven aralığıdır"],
    ], [2, 14.4])

    s.append(Paragraph("Nasıl okunur?", H3))
    s.append(Paragraph("Tek kural: aralık sıfırı içeriyor mu?", PK))
    s += table([
        ["Aralık", "Anlamı"],
        ["Tamamen sıfırın altında (örn. -0.0079 ile -0.0038)", "Fark gerçek, model daha iyi"],
        ["Sıfırı içine alıyor (örn. -0.115 ile +0.014)", "Fark şans olabilir, anlamlı değil"],
    ], [8.4, 8])

    s.append(Paragraph("Projedeki iki özel seçim", H3))
    s += table([
        ["Seçim", "Neden"],
        ["Paired (eşli)", "Fark her maç için model ile baseline'ın aynı maçtaki hatası arasında alınır. "
                          "Maçın zorluğu ikisi için aynı olduğundan karşılaştırma çok daha keskin olur."],
        ["Date-block (tarih bloğu)", "Aynı gün oynanan maçlar birlikte örneklenir, çünkü maçlar tamamen bağımsız "
                                     "değildir. Tek tek maç örneklemek aralığı olduğundan dar gösterirdi."],
        ["Ayarlar", "2.000 tekrar, sabit seed (42), en az 5 blok şartı."],
    ], [4.4, 12])

    s.append(Paragraph("Gerçek sonuçlar", H3))
    s.append(Paragraph(
        "Kaynak: walk-forward raporu. Fark = model kaybı eksi baseline kaybı, negatif model lehine.", PK))
    s += table([
        ["Karşılaştırma", "Ortalama fark", "%95 aralık", "Yorum", "Kazanılan sezon"],
        ["WIN Brier / Elo", "-0.0059", "[-0.0079, -0.0038]", "Model daha iyi", "5/5"],
        ["SCORE margin MAE / son 10", "-0.567", "[-0.674, -0.452]", "Model daha iyi", "5/5"],
        ["SCORE total MAE / son 10", "-0.081", "[-0.157, <b>+0.001</b>]", "<b>Sınırda, anlamlı değil</b>", "4/5"],
    ], [4.4, 2.6, 3.6, 3.4, 2.4])
    s.append(Paragraph(
        "Total MAE en öğretici satırdır. Model nokta tahminde 0.081 sayı daha iyi, 5 sezonun 4'ünü kazanmış ve "
        "\"model daha iyi olasılığı\" %97.5 çıkıyor. Ama aralığın üst ucu +0.001, yani sıfırın hemen üstünde: sınırda, "
        "ve 0.08 sayı pratikte önemsiz. Bu yüzden \"model daha iyi\" demiyoruz. SCORE modeli burada üretim "
        "hattıyla (bağlam düzeltmesi dahil) ölçülüyor.", P))
    s.append(Paragraph(
        "PLAYER için de aynı yöntemle aralık hesaplandı (satır başına mutlak hata farkı, tarih bloklarıyla): PTS "
        "-0.171 [-0.182, -0.161], REB -0.063 [-0.067, -0.059], AST -0.053 [-0.056, -0.050]. Üçü de sıfırın "
        "belirgin altında.", P))

    s.append(Paragraph("Aralık ile sezon tutarlılığı birbirini tamamlar", H3))
    s += table([
        ["", "Neye bakar", "Zayıf yanı"],
        ["Güven aralığı", "Farkın şansa bağlı olup olmadığı", "Tek rakam, sezonlar arası değişimi göstermez"],
        ["Kazanılan sezon (5/5)", "Farkın tekrarlanıp tekrarlanmadığı", "Sayı az, sadece 5 sezon"],
    ], [4.4, 5.8, 6.2])
    s.append(Paragraph(
        "WIN'de ikisi de olumlu, total skorda aralık olumsuz. Bu yüzden WIN için güvenle, total skor için "
        "çekinceyle konuşuyoruz.", P))

    s.append(Paragraph("Total skorda anlamlılığa ulaşmak neden zor?", H3))
    s.append(Paragraph(
        "Maç başına paired MAE farkının standart sapması yaklaşık 3.05 sayı. Tek bir sezonun (~1.250 maç) "
        "kayma payı yaklaşık 0.086, yani bir sezonda 0.17'den küçük kazancı gürültüden ayırmak mümkün değil. "
        "Total skorda elimizdeki kazanç 0.05 civarı, bu ölçeğin çok altında.", P))
    s += callout("<b>Mülakat cümlesi:</b> \"Farkın şans olup olmadığını paired, date-block bootstrap ile test "
                 "ettim: aynı gün oynanan maçları birlikte örnekleyerek 2.000 tekrarla %95 aralık çıkardım. WIN "
                 "Brier'de aralık sıfırın altında ve 5 sezonun 5'inde model önde. Toplam skorda nokta tahmin "
                 "lehime olsa da aralık sıfırı kapsıyor, bunu kazanç saymıyorum.\"")
    return s


def ledger():
    s = [PageBreak(), Paragraph("9. Kilitli Sezon ve Paper Ledger", H2)]
    s += callout("<b>Kilitli sezon:</b> 2026-27, model eğitimi, ayar ve özellik seçiminde hiç kullanılmaz, yalnızca "
                 "izlenir. <b>Paper ledger:</b> her maçtan önce tahminin dondurulup deftere yazılması. "
                 "Sonradan değiştirilemez.")

    s.append(Paragraph("Neden gerekli?", H3))
    s.append(Paragraph(
        "Walk-forward'da sızıntıyı engelledik, ama kararları (hangi özellik, hangi model) aynı sonuçlara bakarak "
        "verdik. Aynı sınava defalarca girip cevabı görmüş gibiyiz, bu hafif iyimserliğe yol açabilir. Çözüm: "
        "hiç dokunmadığımız, geleceğe ait bir sınav.", P))

    s.append(Paragraph("Defter nasıl çalışıyor?", H3))
    s += table([
        ["Özellik", "Nasıl yapılıyor"],
        ["Ne zaman", "Maç başlamadan yaklaşık 15 dakika önce"],
        ["Kim yazıyor", "GitHub Actions. Bilgisayar kapalıyken de çalışır, maliyet sıfır"],
        ["Sıklık", "Maç saatlerinde her 10 dakikada bir"],
        ["Güncel bilgi", "Resmi NBA sakatlık raporu otomatik uygulanır"],
        ["Değişmezlik", "Deftere yazılmış maç bir daha yazılmaz, başlamış maç atlanır"],
        ["Geç kayıt", "Maç başladıktan sonra yazılan kayıt ölçüme girmez"],
    ], [3.6, 12.8])
    s.append(Paragraph(
        "Bu, \"tahmini maçtan sonra yazdım\" ihtimalini ortadan kaldırır. Her kayıt zaman damgası ve model "
        "sürümüyle donmuştur.", P))

    s.append(Paragraph("Sürüm ve kaynak ayrımı", H3))
    s += table([
        ["Etiket", "Neden ayrı tutuluyor"],
        ["Model sürümü (v11, v12, v15)", "Eski sürümün kötü sonucu yenisini kirletmez, yeni sürümün iyi sonucu "
                                         "eskileri gizlemez"],
        ["Kaynak: live", "Gerçek dondurulmuş tahmin"],
        ["Kaynak: backfill", "Sonradan, maç tarihinden önceki verilerle üretildi, sakatlık raporu yok. "
                             "Dondurulmuş çağrı sayılmaz, ölçüme girmez"],
    ], [5.4, 11])

    s.append(Paragraph("Gerçek sonuçlar: v15 canlı, 63 maç (3 Kasım 2026)", H3))
    s.append(Paragraph("Kaynak: ledger raporu. Fark = model eksi baseline, negatif model lehine.", PK))
    s += table([
        ["Metrik", "Model", "Baseline", "Fark", "%95 aralık", "Anlamlı mı?"],
        ["Brier", "0.1963", "Elo 0.2070", "-0.0106", "[-0.0345, +0.0213]", "Hayır"],
        ["Toplam MAE", "16.25", "Son 10: 16.53", "-0.30", "[-0.90, +0.52]", "Hayır"],
        ["Margin MAE", "11.13", "Son 10: 11.76", "-0.53", "[-1.85, +1.09]", "Hayır"],
    ], [2.8, 1.8, 3.2, 2, 4, 2.6])
    s.append(Paragraph(
        "Model nokta tahminde her metrikte baseline'ın önünde, ama 63 maç çok az ve aralıklar sıfırı kapsıyor. "
        "Dürüst cümle: <b>yön olumlu, kanıt henüz yok.</b> Eski sürümler küçük örneklerde Elo'nun gerisindeydi "
        "(v11 live 12 maç, v12 live 7 maç), bunlar da çok küçük olduğundan kanıt sayılmaz.", P))

    s.append(Paragraph("Defter neyi kanıtlayabilir?", H3))
    s.append(Paragraph(
        "Aralığın genişliği maç sayısının karekökü ile küçülür. 63 maçta yarı genişlik yaklaşık 0.028. Kaba "
        "bir ölçekleme (rapordan alınmış bir rakam değil, tahmin):", PK))
    s += table([
        ["Maç sayısı", "Yaklaşık yarı genişlik (Brier)"],
        ["63", "±0.028"],
        ["300", "±0.013"],
        ["~1.230 (tam sezon)", "±0.006"],
    ], [6, 10.4])
    s.append(Paragraph(
        "Backtest'te model Elo'yu sadece 0.006 farkla geçiyordu. Yani tam bir sezon bile bu küçük farkı tek başına "
        "anlamlı yapmaya yetmez. \"~300 maçta yeniden bakacağız\" eşiği küçük farkı kanıtlamak için değil, büyük "
        "bir sorunu (model Elo'dan belirgin kötü, kalibrasyon bozuk, canlıda hata) erken yakalamak içindir.", P))

    s.append(Paragraph("Canlı izlemenin bir faydası daha", H3))
    s.append(Paragraph(
        "Canlıda sistem gerçek koşullarda çalışır: sakatlık raporu yayın saatleri, eksik veri, API hataları. "
        "Backtest bunları göremez. Ledger bu yüzden hem \"model iyi mi\" hem \"sistem sağlam mı\" sorusunu "
        "cevaplar. Playoff'taki IS_PLAYOFF hatası da canlı ile offline farkına bakılarak bulundu.", P))
    s += callout("<b>Mülakat cümlesi:</b> \"Backtest'te aynı katlamalara defalarca baktığım için iyimser "
                 "olabileceğinden 2026-27'yi kilitledim ve her maçtan önce tahminleri GitHub Actions ile "
                 "dondurup defterde saklıyorum. 63 canlı maçta model Elo'nun Brier'de önünde ama aralık sıfırı "
                 "kapsıyor, yani kanıt henüz yok. Küçük farkı kanıtlamak için bir sezondan fazlası gerekir, "
                 "defterin asıl işi büyük sorunları erken yakalamak.\"")
    return s


def mae_conformal():
    s = [PageBreak(), Paragraph("10. MAE ve Conformal Aralık", H2)]
    s += callout("Şimdiye kadar <b>olasılık</b> tahminlerini (WIN) konuştuk. Skor ve oyuncu modelleri ise "
                 "<b>sayı</b> tahmin eder. Cetvelleri <b>MAE</b>, belirsizlik ölçüleri <b>conformal aralıktır</b>.")

    s.append(Paragraph("MAE: ortalama mutlak hata", H3))
    s.append(Paragraph(
        "Tahminin gerçekten ortalama kaç birim saptığı. Her maç için |gerçek - tahmin| alınır, hepsinin "
        "ortalaması bulunur. Düşük olması iyidir.", P))
    s += table([
        ["Maç", "Tahmin", "Gerçek", "Mutlak hata"],
        ["1", "225", "231", "6"],
        ["2", "225", "212", "13"],
        ["3", "225", "226", "1"],
    ], [3, 4.4, 4.4, 4.6])
    s.append(Paragraph("MAE = (6 + 13 + 1) / 3 = <b>6.7 sayı</b>. Yön önemli değil, sadece büyüklük.", P))

    s.append(Paragraph("Projedeki gerçek değerler (5 sezon walk-forward)", H3))
    s += table([
        ["Hedef", "Model MAE", "Baseline MAE", "Anlamı"],
        ["Toplam skor", "14.87", "Son 10: 14.95", "Toplamı ortalama ~15 sayı yanlış"],
        ["Sayı farkı (margin)", "10.85", "Son 10: 11.41", "Farkı ortalama ~11 sayı yanlış"],
        ["Oyuncu sayısı (PTS)", "4.46", "EMA-10: 4.63", "~4.5 sayı"],
        ["Oyuncu ribaundu (REB)", "1.86", "EMA-10: 1.93", "~1.9 ribaund"],
        ["Oyuncu asisti (AST)", "1.28", "EMA-10: 1.33", "~1.3 asist"],
    ], [4.6, 2.6, 3.8, 5.4])
    s.append(Paragraph(
        "\"15 sayı hata çok değil mi?\" Bir maçın toplam sayısı doğası gereği çok gürültülüdür. Baseline da 14.95 "
        "ile hemen yanındadır, yani hatanın büyük kısmı kaçınılmaz gürültüdür. Önemli olan mutlak büyüklük değil, "
        "baseline'a göre farktır.", P))

    s.append(Paragraph("Neden MAE?", H3))
    s += table([
        ["Sebep", "Açıklama"],
        ["Okunması kolay", "Doğrudan sayı biriminde (sayı, ribaund)"],
        ["Aşırı sonuçlara dayanıklı", "Blowout ve uzatma, karesel metrikler (RMSE) kadar ortalamayı bozmaz"],
        ["Eğitim hedefiyle uyumlu", "Oyuncu modellerinde eğitim hedefi L1 (medyan) kaybıdır. Medyan tahmin etmek "
                                    "MAE'yi küçültür"],
    ], [4.6, 11.8])
    s.append(Paragraph(
        "Yan metrik: margin tahmininin işaretine bakarak kazananı seçmek %66.67 doğruluk verir, son-10 baseline "
        "%61.40 (v13 terfi kaydı, 6.276 maç). Anlamlılık: margin farkı -0.57 sayı, aralık [-0.674, -0.452], "
        "gerçek. Toplam skor farkı -0.081, aralık sıfırı kapsıyor, anlamlı değil.", P))

    s.append(Paragraph("Conformal aralık", H3))
    s.append(Paragraph(
        "Nokta tahmin (\"toplam 225\") bir şey söyler ama ne kadar güvenebileceğimizi söylemez. Conformal aralık "
        "\"225 ± ne kadar?\" sorusunun dürüst cevabıdır. Modelin geçmiş hatalarına bakar:", PK))
    s += table([
        ["Adım", "Ne yapılır"],
        ["1", "Modelin görmediği veride her maç için |gerçek - tahmin| hesaplanır"],
        ["2", "Bu hataların %80'inin altında kaldığı değer bulunur (80. yüzdelik, küçük bir sonlu örnek "
              "düzeltmesiyle)"],
        ["3", "Yeni tahminin etrafına bu yarıçap konur: tahmin ± yarıçap"],
    ], [2, 14.4])
    s.append(Paragraph(
        "Yani \"geçmişte hataların %80'i bu kadardı, bundan sonra da öyle olması beklenir.\" Veri dağılımı "
        "hakkında bir varsayım (normal dağılım gibi) gerekmez, doğrudan gözlenen hatalara dayanır.", P))

    s.append(Paragraph("Üretim modelinin gerçek yarıçapları", H3))
    s += table([
        ["Hedef", "%50 aralık", "%80 aralık", "%90 aralık"],
        ["Toplam skor", "± 12.5", "± 24.0", "± 30.7"],
        ["Sayı farkı", "± 8.8", "± 17.1", "± 22.5"],
    ], [4.4, 3.8, 3.8, 4.4])
    s.append(Paragraph(
        "Örnek: model toplam 225 derse %80 aralık yaklaşık 201 ile 249. Aralıklar geniştir, çünkü maçlar gerçekten "
        "gürültülüdür. Bu genişlik modelin kusuru değil, bilginin dürüstçe ifadesidir.", P))

    s.append(Paragraph("Aralık gerçekten çalışıyor mu?", H3))
    s.append(Paragraph(
        "%80 aralık, görülmemiş maçların yaklaşık %80'ini kapsamalıdır. Bu, kalibrasyonun aralık versiyonudur: "
        "dediğin yüzde, gerçekleşen yüzdeyle örtüşüyor mu? Temiz test için her walk-forward katında yarıçap "
        "yalnızca o katın eğitim sezonlarından öğrenilir ve test sezonuna uygulanır.", PK))
    s += table([
        ["Sezon", "Toplam kapsama", "Margin kapsama"],
        ["2021-22", "%80.3", "%78.9"],
        ["2022-23", "%77.9", "%84.0"],
        ["2023-24", "%81.3", "%78.2"],
        ["2024-25", "%78.5", "%79.9"],
        ["2025-26", "%78.4", "%77.8"],
        ["<b>Ortalama</b>", "<b>%79.3</b>", "<b>%79.8</b>"],
    ], [5.4, 5.4, 5.6])
    s.append(Paragraph(
        "Hedef %80, sonuç %79.3 ve %79.8: hafif dar, kabul edilebilir. Sezon bazında %78 ile %84 arası "
        "dalgalanma doğaldır (margin sütunu, playoff maçlarında playoff'a özel yarıçapı da içerir). (İlk sürümde tek bir üretim yarıçapı tüm sezonlara uygulanmıştı ve %80.5 çıkmıştı; "
        "o yarıçap test sezonlarını da gördüğü için bağımsız bir test değildi, bu tablo düzeltilmiş sürümdür.)", P))

    s.append(Paragraph("Dürüst sınırlar", H3))
    s += table([
        ["Sınır", "Ne anlama geliyor"],
        ["Genişlik hep aynı", "Her maça aynı yarıçap uygulanır. Dengeli bir maç ile blowout adayı aynı bantla "
                              "gösterilir. Maça göre genişlik ayarlayan yöntemler var, basit olanı seçtik."],
        ["Yalnızca SCORE modelinde", "Oyuncu modellerine conformal aralık eklenmedi."],
        ["Canlı toplam MAE yüksek", "63 canlı maçta 16.25 (backtest 14.87), ama baseline da aynı yönde (16.53). "
                                    "Örnek küçük, sonuç çıkarmak için erken."],
    ], [4.8, 11.6])

    s.append(Paragraph("İki aile yan yana", H3))
    s += table([
        ["", "Olasılık tahmini (WIN)", "Sayı tahmini (SCORE, PLAYER)"],
        ["Doğruluk cetveli", "Brier, log loss", "MAE"],
        ["Dürüstlük kontrolü", "Kalibrasyon", "Conformal kapsama"],
        ["Baseline", "Elo", "Son 10 maç, EMA-10"],
        ["Anlamlılık", "Bootstrap aralığı", "Bootstrap (SCORE), sezon tutarlılığı (PLAYER)"],
    ], [4, 5.6, 6.8])
    s += callout("<b>Mülakat cümlesi:</b> \"Skor ve oyuncu modellerinde ana metrik MAE: toplamda 14.87, "
                 "margin'de 10.85, oyuncu sayısında 4.46. Baseline'ı yalnızca margin'de ve oyuncularda anlamlı "
                 "geçiyorum, toplam skorda geçmiyorum. Belirsizliği conformal aralıkla gösteriyorum: geçmiş "
                 "hataların %80'inin altında kaldığı yarıçapı tahminin etrafına koyuyorum. Yarıçapı her katta "
                 "yalnızca eğitim sezonlarından öğrenip test sezonuna uyguladığımda %80 aralık maçların %79.3'ünü "
                 "kapsıyor, yani aralıklar kalibre.\"")
    return s


def win_model():
    s = [PageBreak(), Paragraph("11. WIN Modeli: Baştan Sona", H2)]
    s += callout("<b>Bir cümleyle:</b> Bir maçın ev sahibi galibiyet olasılığını tahmin eden, 11 özellikli, kalibre "
                 "edilmemiş bir Lojistik Regresyon. Tüm özellikler maç öncesi bilgiden üretiliyor. Değerlendirmeyi 5 "
                 "sezonluk sızıntısız walk-forward ile yaptım ve saf Elo'ya karşı farkın anlamlı olduğunu bootstrap ile "
                 "gösterdim: Brier 0.2098'e karşı 0.2157.")

    s.append(Paragraph("Problem", H3))
    s.append(Paragraph(
        "İkili sınıflandırma, hedef <b>WIN</b>. Çıktı karar değil olasılık. Amaç iyi kalibre bir olasılık, bu yüzden ana "
        "metrik Brier, yardımcı metrik ROC-AUC. Accuracy yalnızca okunabilirlik için. Her maç iki satır (ev ve deplasman "
        "bakış açısı); özelliklerin çoğu \"kendi eksi rakip\" farkı olduğu için taraf seçimi simetrik.", P))

    s.append(Paragraph("Veri", H3))
    s.append(Paragraph(
        "NBA'in resmi istatistik verisi: takım ve oyuncu kutu skorları, program, sakatlık raporu. Eğitim seti 2020-21'den "
        "2025-26'ya 6 sezon, <b>14.780 takım-maç satırı</b> (yaklaşık 7.390 maç). <b>2026-27 kilitli sezon</b>: hiçbir "
        "eğitim, seçim ya da ayar için kullanılmaz, yalnızca ileriye dönük canlı izleme. Her özellik <b>shift(1)</b> ile "
        "yalnızca o maçtan önceki bilgiyi kullanır.", P))

    s.append(Paragraph("11 özellik", H3))
    s += table([
        ["Grup", "Özellik", "Ne yakalıyor"],
        ["Güç", "ELO_DIFF", "Sürekli Elo farkı. En güçlü sinyal"],
        ["Güç", "CLEAN_NET_RTG_DIFF_LAST_10", "Son 10 maç net rating farkı, garbage time temizlenmiş"],
        ["Güç", "WINRATE_DIFF_LAST_10", "Son 10 maç galibiyet oranı farkı (katsayısı negatif, aşağıya bak)"],
        ["Bağlam", "IS_HOME, IS_B2B, OPP_IS_B2B, REST_DIFF", "Saha, ardışık maç, dinlenme farkı"],
        ["Kadro", "ABS_DIFF", "Eksik oyuncuların Game Score farkı"],
        ["Kadro", "MISSING_ROT_MINS_DIFF", "Rotasyondan eksik dakika farkı (20+ dakika oynayanlar)"],
        ["Kadro", "ACTIVE_WT_GS_DIFF", "Sahadaki kadronun dakika ağırlıklı Game Score'u"],
        ["Kadro", "ROT_CONTINUITY_DIFF", "Kadro sürekliliği (katkısı neredeyse sıfır, dürüstçe söyle)"],
    ], [2, 5.8, 8.6])
    s.append(Paragraph(
        "<b>Elo:</b> K=10, ev sahibi avantajı 50 puan, sezonlar arası regresyon 0.6, skor farkı çarpanı. Sabitler "
        "log-loss için grid ile ayarlandı. Bu ayar test sezonlarını da içeren aralıkta yapıldı; aynı Elo hem modelde hem "
        "baseline'da olduğu için kıyas adil, ama mutlak sayılar hafif iyimser.", P))

    s.append(Paragraph("Eğitim süreci", H3))
    s.append(Paragraph(
        "1) Sezon dosyaları birleştirilir, tarihe göre sıralanır. 2) Özellik matrisi üretilir; hedefle korelasyonu 0.95 ve "
        "üstü olan sütunlar şüpheli sayılır. 3) Zamansal bölme (kronolojik). 4) Üç aile yarışır: Lojistik Regresyon, L1 "
        "Lojistik, LightGBM. 5) <b>Aile seçimi</b> eğitim aralığında 4 genişleyen pencere katının ortalama Brier'iyle: LR "
        "0.2120, L1 0.2125, LightGBM 0.2155. 6) <b>Kalibrasyon seçimi</b> (kalibrasyonsuz, sigmoid, isotonic) iç holdout'ta: "
        "kalibrasyonsuz kazandı. 7) Holdout metrikleri holdout'u hiç görmemiş modelle hesaplanır; gönderilen model sonra "
        "tüm uygun satırlarla yeniden eğitilir.", P))
    s.append(Paragraph(
        "Aile seçiminin hikâyesi: tek bir iç blokta LightGBM 2023-24 fold'unda 0.001 Brier farkla kazanıp test "
        "sezonunda 0.017 AUC kaybetti. Bu yüzden seçimi tek blok yerine 4 katın ortalamasına taşıdık.", P))

    s.append(Paragraph("Değerlendirme: 5 sezon walk-forward, 6.276 görülmemiş maç", H3))
    s += table([
        ["", "Model", "Saf Elo", "Sabit %50"],
        ["Brier", "<b>0.2098</b>", "0.2157", "0.25"],
        ["ROC-AUC", "<b>0.7206</b>", "0.7017", "-"],
        ["Accuracy", "<b>%66.25</b>", "%65.54", "-"],
    ], [3.6, 4, 4, 4.8])
    s.append(Paragraph(
        "5 sezonun 5'inde Elo'dan iyi. Fark -0.0059, tarih blok bootstrap ile %95 güven aralığı [-0.0079, -0.0038]; "
        "sıfırı içermiyor. En zayıf sezon 2022-23 (AUC 0.668, accuracy %62). Kalibrasyon: havuzlanmış ECE 0.0098, "
        "bantlarda model dediği ile gerçekleşen birbirine yakın (50-60 bandı hafif aşırı güvenli: 54.9 dedi, 53.0 tuttu).", P))

    s.append(Paragraph("Korumalar ve testler", H3))
    s.append(Paragraph(
        "Terfi kapıları: Brier ve AUC eşikleri, champion-challenger (hiçbir metrikte 0.002'den fazla kötüleşme yok, en az "
        "bir net kazanç), baseline kapısı (Brier Elo'dan düşük, AUC Elo'ya eşit ya da yüksek). Özellik korumaları: sabit "
        "sütun, çok eksik sütun, 0.98 üzeri korelasyonlu çiftler, lineer bağımlılık, permutation importance. "
        "Train-serve paritesi testi. Dokümandaki rakamlar JSON'dan otomatik üretilir, eski rakam testi kırar.", P))

    s.append(Paragraph("Bilinen sınırlar (önce sen söyle)", H3))
    s.append(Paragraph(
        "<b>1) Availability look-ahead:</b> Eğitim ve backtest 4 kadro özelliğini maçın kendi kutu skorundan alıyor (kim "
        "gerçekten oynadı); canlıda sakatlık raporu ve önceki maçın kadrosu kullanılıyor. Elo'ya göre Brier kazancı "
        "~0.006'dan canlıya benzer koşulda ~0.002'ye düşüyor. <b>2)</b> Backtest yalnızca ev sahibi satırlarıyla eğitiyor, "
        "trainer iki satırı birden kullanıyor (aynı model, küçük fark). <b>3)</b> Trainer'ın holdout rakamı (Brier "
        "0.2005) son ~1.470 maçlık dilim; baş sayı walk-forward'dur. <b>4)</b> Tavana yakınız: özellik eklemekle "
        "kazanç küçüldü, yeni bilgi (hakem, yıldız dinlenmesi) gerekir.", P))
    return s


def win_hard_questions():
    s = [PageBreak(), Paragraph("12. Zor Sorular ve Cevaplar (WIN)", H2)]

    s.append(Paragraph("Neden Lojistik Regresyon, neden LightGBM değil?", H3))
    s.append(Paragraph(
        "Veri küçük (~7.400 maç) ve sinyal zayıf; gürültülü küçük veride esnek modeller gürültüyü ezberler. "
        "ELO_DIFF zaten log-odds ölçeğinde, yani lojistik regresyonun varsayımına uyuyor. Ve ölçtüm: eğitim aralığında 4 "
        "katın ortalama Brier'i LR 0.2120, LightGBM 0.2155. Seçim kuralı yalnızca eğitim aralığına bakıyor, test setinde "
        "seçmedim. Ek avantaj: yorumlanabilir katsayılar, basit train-serve paritesi, ucuz ve kararlı. "
        "<b>Dikkat:</b> \"LightGBM kötüdür\" demiyorum; bu veri ve özellik setiyle kazanç getirmedi. Oyuncu modelinde "
        "LightGBM kullanıyorum.", P))

    s.append(Paragraph("Sızıntıyı nasıl engelledin? shift(1) ne yapıyor?", H3))
    s.append(Paragraph(
        "Sızıntı, tahmin anında bilinemeyecek bilginin modele girmesi. <b>Özellik düzeyi:</b> son 10 maç gibi özellikler "
        "takımın kronolojik maç listesi üzerinde hesaplanıp bir satır kaydırılıyor; t. maçın özelliği yalnızca t-1'e kadar "
        "olan maçlardan geliyor. Kaydırma olmasa son-10 ortalaması tahmin ettiğim maçın sonucunu da içerirdi. Elo'da "
        "PRE_GAME_ELO maçtan önceki değer, güncelleme maçtan sonra. <b>Bölme düzeyi:</b> rastgele değil kronolojik, "
        "walk-forward; kalibrasyon ve aile seçimi katları da satıra göre değil tarihe göre bölünüyor. <b>Kilitli "
        "sezon:</b> 2026-27 hiçbir ayar için kullanılmadı. <b>Bilinçli dışarıda bırakılanlar:</b> oyuncu projeksiyon "
        "özellikleri (oyuncu modeli aynı maçların sonuçlarıyla eğitildiği için sızıntı olurdu) ve SCORE modelinin sayı "
        "farkı girdisi.", P))
    s.append(Paragraph(
        "<b>Kalan sızıntılar:</b> availability look-ahead (yukarıda) ve Elo sabitlerinin test sezonlarını da içeren "
        "aralıkta ayarlanması. İkincisi kıyası bozmaz çünkü aynı Elo iki tarafta da var.", P))

    s.append(Paragraph("Katsayısı negatif çıkan özelliği nasıl açıklarsın?", H3))
    s.append(Paragraph(
        "WINRATE_DIFF_LAST_10 katsayısı -0.25. Katsayı diğer özellikler sabitken <b>kısmi etkiyi</b> gösterir. Elo farkı "
        "uzun vadeli gücü zaten taşıyor ve son 10 maç galibiyet oranıyla güçlü ilişkili. Elo sabitken geriye kalan, "
        "\"Elo'nun beklediğinden fazla mı kazandı\" bilgisi; bu kısmen şans olduğu için ortalamaya dönüş beklenir. "
        "Özellik işe yarıyor: çıkarılınca holdout log loss yaklaşık +0.0074 artıyor. <b>Dürüst sınır:</b> regresyon "
        "yorumu bir hipotez, nedensellik iddia etmiyorum.", P))

    s.append(Paragraph("Model kalibre mi? Neden kalibrasyon yöntemi eklemedin?", H3))
    s.append(Paragraph(
        "Evet, çoğunlukla: havuzlanmış ECE 0.0098. Tahmin edilen kazananın olasılığına göre 4 banda ayırıp \"model dediği "
        "ile gerçekleşen\" kıyaslıyorum: 50-60 bandı 54.9 / 53.0, 60-70 bandı 64.8 / 65.0, 70-80 bandı 74.7 / 73.9, 80-100 "
        "bandı 85.7 / 85.1. Sigmoid ve isotonic'i zaman sıralı katlarla denedim: kalibrasyonsuz Brier 0.2050, sigmoid "
        "0.2055, yani kazanç yok. Lojistik regresyon log loss'u doğrudan minimize ettiği için zaten makul kalibre; "
        "kalibrasyon ek veri ve ek aşırı uyum riski getirir. <b>Zayıf nokta:</b> düşük güven bandı hafif aşırı güvenli "
        "(2022-23'te 54.6 dedi, 49.7 tuttu). ECE bant sayısına duyarlı, tek başına değil tabloyla sun.", P))

    s.append(Paragraph("Daha fazla geçmiş sezon eklesen faydalı olur mu?", H3))
    s.append(Paragraph(
        "Ölçtüm: öğrenme eğrisi 2 eğitim sezonundan sonra düz. 2025-26 test sezonunda Brier 1 sezonla 0.2011, 5 sezonla "
        "0.2007. Elo'ya karşı kazanç da eğitim verisiyle büyümüyor. Az parametreli bir model ikinci sezondan sonra "
        "doyuyor, o yüzden eski sezonlar için API geri doldurmasına değmez.", P))
    return s


def score_and_player():
    s = [PageBreak(), Paragraph("13. SCORE ve Oyuncu Modeli", H2)]
    s += callout("Her model için ezber kalıbı: <b>ne tahmin ediyor, hangi baseline'a karşı, sonuç ne, sınırı ne.</b> "
                 "WIN ana çalışmam; diğer ikisi aynı veri hattının üstüne kurulu.")

    s.append(Paragraph("SCORE modeli", H3))
    s += table([
        ["Madde", "Özet"],
        ["Ne tahmin ediyor", "Toplam sayı ve sayı farkı (ev eksi deplasman), ayrıca %80 conformal aralık."],
        ["Mimari", "Toplam = tempo x (ev + deplasman hücum reytingi) / 100 (Ridge'ler). Fark ayrı bir Ridge, girdisi WIN'in "
                   "11 özelliği. Ridge ile zamansal OOF artık düzeltmesi (saha ve gösterge değişkenleri)."],
        ["Baseline", "İki takımın son 10 maç attığı/yediği sayılardan basit tahmin."],
        ["Toplam sayı", "MAE 14.87 vs 14.95 (-0.08, %0.5). <b>Anlamlı değil</b>, CI [-0.157, +0.001] sıfırı kapsıyor."],
        ["Sayı farkı", "MAE 10.85 vs 11.41 (-0.57, %5). <b>Anlamlı</b>, CI [-0.674, -0.452]. Kazanan tarafı bulma %66.7 vs %61.4."],
        ["Sınır", "Toplamda anlamlı kazanç yok. Aralıklar geniş: %80 aralık toplamda ±24, farkta ±17.1 (MAE ~15 iken). "
                  "Kapsama hedefte (toplam %79.3, fark %79.8)."],
    ], [3.4, 13])
    s.append(Paragraph(
        "<b>Neden toplam, farktan zor?</b> Toplam, tempo ve hücum verimliliği gürültüsünün birleşimi ve son 10 maç "
        "ortalaması zaten güçlü bir tahminci. Fark ise güç farkı bilgisi (Elo, net rating) içerdiği için model ek değer "
        "katabiliyor.", P))

    s.append(Paragraph("Oyuncu modeli", H3))
    s += table([
        ["Madde", "Özet"],
        ["Ne tahmin ediyor", "Maçta süre alması beklenen her oyuncunun sayı (PTS), ribaund (REB), asist (AST). Üç ayrı LightGBM, 24 özellik."],
        ["Girdiler", "Form (son 5, EMA-10, dakika başına üretim, dakika trendi, kullanım), bağlam (saha, playoff, dinlenme, "
                     "pozisyon bayrakları, rakibin o pozisyona izin verdiği üretim), takım rotasyon bağlamı."],
        ["Kayıp fonksiyonu", "<b>L1 (medyan)</b>: metrik MAE olduğu için doğrudan onu minimize eder; dağılım çarpık, L2 uç "
                             "değerlerden etkilenirdi."],
        ["Baseline", "Oyuncunun kendi EMA-10 ortalaması."],
        ["Sonuç (140.378 satır)", "PTS 4.460 vs 4.632 (%3.7), REB 1.864 vs 1.927 (%3.3), AST 1.279 vs 1.332 (%3.9). "
                                  "Üçünde 5/5 sezon, tüm CI'lar sıfırın altında."],
        ["Sınır", "Kazanç anlamlı ama küçük (%3-4). Hatanın büyük kısmı o gece kaç dakika oynayacağı belirsizliği. "
                  "Nokta (medyan) tahmini veriyor, dağılım vermiyor."],
    ], [3.4, 13])
    s.append(Paragraph(
        "<b>Neden oyuncu tahminlerini WIN'e girdi yapmadın?</b> Oyuncu modeli aynı maçların sonuçlarıyla eğitildi; geçmiş "
        "tahminlerini WIN eğitimine vermek hedef sızıntısı olurdu. Tarih güvenli OOF üretilene kadar kapalı.", P))

    s.append(Paragraph("Üçünü bağlayan hikâye", H3))
    s.append(Paragraph(
        "Ortak veri hattı (aynı Elo ve kadro özellikleri), ortak değerlendirme (aynı walk-forward, aynı bootstrap, her "
        "birinin kendi basit baseline'ı) ve dürüst sonuç tablosu: WIN küçük ama anlamlı, SCORE farkta anlamlı toplamda "
        "değil, oyuncu hepsinde anlamlı ama %3-4. Üçünde de kazanç büyük değil ve bunu önce ben söylüyorum.", P))
    return s


def closed_ideas():
    s = [PageBreak(), Paragraph("14. Ölçüp Kapattığım Fikirler", H2)]
    s += callout("\"Tükendi\" demek yerine <b>neyi, nasıl ölçtüğümü ve neden kapattığımı</b> anlatıyorum. Rastgele deneme "
                 "yapıp tek bir iyi sonucu sunmaktan daha güvenilir durur.")

    s.append(Paragraph("Sonuçlar", H3))
    s += table([
        ["Fikir", "Sonuç", "Neden"],
        ["Koşullu genişlikli aralıklar", "Kazanç yok",
         "Ölçek modeli (playoff, sezon günü, tahmini toplam/fark, Elo, kadro) hatanın büyüklüğünü öngöremedi: test "
         "sezonlarında korelasyon ~0. Aralıklar %1-2 daha dar ama aynı oranda daha az kapsıyor, aralık skoru kötüleşti."],
        ["Playoff'a özel sayı farkı yarıçapı", "<b>Eklendi</b>",
         "Playoff margin hataları daha büyük. Tek yarıçapla playoff kapsaması %74.3, ayrı yarıçapla (±19.6) %77.9. "
         "Toplam ve normal sezon değişmedi."],
        ["Daha fazla geçmiş sezon", "Gereksiz", "WIN öğrenme eğrisi 2 sezondan sonra düz (Brier 0.2011 ile 0.2007)."],
        ["Hakem verisi (toplam sayı için)", "Yapılmadı",
         "Beklenen kazanç küçük ve 5 sezonluk güven aralığıyla (~0.08'in altı) ayırt edilemez. Emek büyük."],
        ["Daha önce denenenler", "Kazanç yok",
         "Oyuncu etki reytingleri, seyahat/saat dilimi/rakım, sezon yenilik ağırlıkları, ilk 5 bayrakları, kutu skoru "
         "fırsat özellikleri."],
        ["Bahis piyasası çizgisi", "Kapsam dışı",
         "En güçlü toplam tahmincisi olurdu ama model bağımsız olmaktan çıkıp piyasa türevi olurdu; bilerek çıkarıldı."],
    ], [4.2, 2.6, 9.6])

    s.append(Paragraph("Playoff yarıçapı hikâyesi", H3))
    s.append(Paragraph(
        "Koşullu aralık deneyi başarısız oldu ama alt kırılımda bir şey çıktı: playoff sayı farkı sistematik az "
        "kapsanıyordu (5 sezonda 4'ünde %72-75). Playoff artıklarından ayrı bir %80 yarıçapı hesapladım (359 playoff "
        "maçı, ±19.6). Eğitim, metadata, API ve ScorePredictor aynı yardımcıyı kullanıyor, walk-forward playoff "
        "kapsamasını ayrı raporluyor. Sınırlar: hedef %80'in hâlâ altında (%77.9), playoff örneği küçük ve sezonlar "
        "arası gürültülü, 2021-22 fold'unda yarıçap öğrenilemedi.", P))

    s.append(Paragraph("Mülakat cümlesi", H3))
    s += callout("\"Aralıkları koşullu genişlikle denedim; hatanın büyüklüğü öngörülebilir çıkmadı. Ama analiz "
                 "sırasında playoff sayı farkının sistematik olarak az kapsandığını buldum ve yalnızca orada ayrı bir "
                 "yarıçap kullandım.\"")

    s.append(Paragraph("Geriye kalan iş: canlı izleme", H3))
    s.append(Paragraph(
        "Asıl test 2026-27 defteri. Canlı %50-60 bandı (35 maçta %34) büyük ihtimalle gürültü (~2.5 standart hata) ama "
        "bantlar yaklaşık 100 maça ulaşana kadar izlenir. Modelleme tarafında yeni bilgi kaynağı olmadan anlamlı iş "
        "kalmadı.", P))
    return s


SECTIONS = [calibration, brier, logloss, connection, baseline, elo, walk_forward, bootstrap, ledger,
            mae_conformal, win_model, win_hard_questions, score_and_player, closed_ideas]


def glue(story):
    """Baslik ve giris cumlelerini ardindaki ilk blokla (tablo/paragraf) tek blokta tutar."""
    out, pending = [], []
    for f in story:
        if isinstance(f, Paragraph) and f.style.name in ("H3", "PK"):
            pending.append(f)
        elif pending:
            out.append(KeepTogether(pending + [f]))
            pending = []
        elif isinstance(f, Table):
            out.append(KeepTogether([f]))
        else:
            out.append(f)
    return out + pending


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("mulakat_notlari.pdf")
    doc = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=2.3 * cm, rightMargin=2.3 * cm,
                            topMargin=1.9 * cm, bottomMargin=1.9 * cm,
                            title="Mülakat Notları - NBA Model App", author="NBA Model App")
    story = [Paragraph("Mülakat Notları", H1),
             Paragraph("NBA Model App için temel kavramlar, sade anlatımla.", SUB)]
    for build in SECTIONS:
        story += build()
    story = glue(story)
    while story and isinstance(story[-1], Spacer):
        story.pop()
    trimmed = []
    for f in story:
        if isinstance(f, PageBreak):
            while trimmed and isinstance(trimmed[-1], Spacer):
                trimmed.pop()
        trimmed.append(f)
    story = trimmed

    def footer(canvas, d):
        canvas.setFont("Body", 8.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(2.3 * cm, 1.2 * cm, "NBA Model App - Mülakat Notları")
        canvas.drawRightString(A4[0] - 2.3 * cm, 1.2 * cm, str(d.page))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(out)


if __name__ == "__main__":
    main()
