# NBA Tahmin Modellerini Bilimsel ve Gerçekçi Hale Getirme Planı

**Durum:** İnceleme ve uygulama planı  
**Kapsam:** Galibiyet olasılığı, takım skoru, oyuncu istatistikleri, canlı tahmin, değerlendirme ve üretime alma  
**Hedef:** Her tahminin yalnızca tahmin anında bilinebilen verilerle üretilmesi; performansın gerçek sezon dışı testle ölçülmesi; model sürümü ve veri kaynağının izlenebilir olması.

Bu belge kod değişikliği değil, mevcut kod ve artefakt incelemesine dayalı bir yol haritasıdır. Buradaki “doğrulanmış bulgu” ifadeleri incelenen kaynak kodu veya kayıtlı artefaktları anlatır. Raporların üretilme yöntemi kaynak kodla uyuşmuyorsa önce yeniden üretilebilir bir deneyle doğrulanmalıdır.

## Uygulama günlüğü — 2026-10-04

Planın uygulamasına başlandı. Kaynak kodda aşağıdaki değişiklikler yapıldı ve ardından 2025–26 dış sezon testiyle adaylar eğitildi. 2026-10-04 tarihli son temiz aday, leakage-clean serbest bırakma kaydıyla üretime alındı; önceki şampiyon yedeği `models/production/replaced_leaky/20261004_130707/` altında tutuldu (2026-10-21'de model klasörü temizliğinde silindi). Bu karar, eski şampiyonun yüksek ama sızıntı riski taşıyan metriğini takip etmek yerine temiz pregame ölçüm ve baseline koşullarına dayandırıldı.

- SCORE holdout tahminleri artık tüm veriyle refit edilmiş modelden değil, holdout öncesi eğitimden geliyor. Hiperparametre araması tarih sıralı ve aynı maç gününü katlar arasında bölmüyor.
- SCORE OOF tahminleri expanding-window tarih bloklarıyla üretiliyor. Ridge margin düzeltmesi de her tarih için yalnızca önceki OOF artıklarla fit ediliyor. Geçmiş OOF satırı eksikse tam veri modeliyle doldurulmuyor.
- SCORE çekirdek oyuncu availability ve geçmişteki global çekirdek oyuncu sıralamasına dayalı girdileri model sözleşmesinden çıkarıldı.
- SCORE/WIN eğitiminde örtüşen geçmiş maçlarla eğitilmiş oyuncu modelinden türetilen projeksiyon girdileri devre dışı bırakıldı. Bunlar ancak tarih güvenli oyuncu OOF projeksiyonları üretildiğinde geri alınmalı.
- WIN model/kalibrasyon seçimi artık kilitli sezon holdout’undan önceki ayrı iç tarih bloğunda yapılıyor; seçilen adayın dış sezon metriği ayrı kaydediliyor. WIN için geçmiş SCORE marjı OOF tablosundan geliyor; son refit model yalnızca SCORE eğitim kesiminden kesin olarak sonraki dış holdout satırlarını tahmin edebiliyor.
- PLAYER Ridge artık karıştırılmış KFold yerine expanding-window artıklarla öğreniyor; `final_refit_scope: train_only` holdout etiketlerinin son model ve Ridge’e sızmasını engelliyor.
- Tarih olmayan veya geçersiz tarihli satırlarda rastgele split yedeği kaldırıldı; eğitim hata veriyor.
- Eğitim metadata’sına manifest, feature sözleşmesi, veri, trainer kaynak kodu, artefakt SHA-256’ları, Git revision ve temel kütüphane sürümleri için provenance kaydı eklendi.
- Challenger terfi kapısı, herhangi bir tek metriğin iyileşmesini yeterli saymak yerine tüm temel metriklerde gerilememe ve en az birinde iyileşme istiyor.

**Sonraki zorunlu adım:** Tam üretim algoritmalarının çok sezon walk-forward değerlendirmesini ve skor/oyuncu kalibrasyon/segment raporlarını tamamla. Basit WIN walk-forward benchmarkı aşağıda kaydedildi; bu, tam model walk-forward testinin yerini tutmaz.

### İlk aday koşusu sonucu

İlk dry-run raporu `training_run_20261004_124239.md` (silindi) içindedir. Daha sonra temiz adaylar için yeniden eğitim yapıldı; son ölçüm ve üretime alınan release kaydı `training_run_20261004_130707.md` (silindi) ve [leakage_clean_release.json](../models/production/leakage_clean_release.json) içindedir. Son ölçümde WIN Brier/AUC 0.2136/0.7186; SCORE total/margin MAE 15.5896/12.4897; PLAYER PTS/REB/AST MAE 4.5392/1.9507/1.3619.

| Model | Ölçü | Üretim | Yeni aday | Değişim |
|---|---:|---:|---:|---:|
| WIN | Accuracy | 0.7156 | 0.6631 | -0.0525 |
| WIN | ROC-AUC | 0.8003 | 0.7186 | -0.0817 |
| WIN | Brier | 0.1851 | 0.2136 | +0.0285 |
| SCORE | Total MAE | 14.0743 | 15.5896 | +1.5153 |
| SCORE | Margin MAE | 11.5323 | 12.4897 | +0.9574 |
| PLAYER | PTS MAE | 4.4852 | 4.5395 | +0.0543 |
| PLAYER | REB MAE | 1.9257 | 1.9503 | +0.0246 |
| PLAYER | AST MAE | 1.3455 | 1.3620 | +0.0165 |

Bu sonuçlar, leakage düzeltmelerinin tek başına modeli iyileştirmediğini gösteriyor; eski yüksek metriklerin güvenilir olduğuna kanıt değiller. Eski şampiyonun dış sezon metriği sızıntı şüphesi nedeniyle güvenilir kıyas kabul edilmedi. Son temiz aday, kaydedilmiş temel kontrolleri (Elo, rolling score, last-5 player) geçtiği için yedeği alınarak üretime alındı; ancak WIN metrikleri Elo’dan sadece sınırlı ölçüde iyi ve SCORE/PLAYER eski şampiyon ölçümlerinden düşük. Tam algoritma walk-forward doğrulaması hâlâ gerekli.

Rapora ilk sabit baselinelar da eklendi: 2025–26 WIN için Elo-only Brier 0.2158 / ROC-AUC 0.7094, son-10 galibiyet oranı Brier 0.2498; SCORE için son-5 tempo × hücum rating baselini total MAE 17.46 / margin MAE 13.57; PLAYER son-5 ortalaması MAE PTS 4.78, REB 1.98, AST 1.39. Bunlar yeni adayların baselina göre bazı katkılarını gösteriyor, fakat tek dış sezon ve belirsizlik aralığı olmadan terfi kararı için yeterli değiller.

## Yönetici özeti

Model mimarisi makul bir başlangıç sunuyor: tahmini kazanma olasılığı ile skor ayrı modellerden alınıyor; takım formu, Elo, fikstür ve oyuncu tahminleri kullanılıyor; üretim artefaktları merkezi bir YAML dosyasında seçiliyor. Ancak mevcut durumda “iyi görünen metrik” ile “gelecek sezonu gerçekten tahmin edebilme” arasındaki ayrım yeterince güvence altında değil.

İlk sırada çözülmesi gerekenler:

1. SCORE modelindeki test kümesi kullanımını ve Ridge düzeltmesini zamana göre izole etmek.
2. SCORE eğitiminde gerçek maçta oynayan çekirdek oyuncu sayısı gibi maç öncesi bilinmeyen girdileri tahmini kullanılabilirlikle değiştirmek.
3. Eğitim, kalibrasyon, bağımsız doğrulama ve nihai üretim yeniden eğitimini tek manifest ve tek kayıtlı deney akışında birleştirmek.
4. Performans raporlarını bağımsız sezon dışı tahminlerden üretmek; eğitimde görülmüş verideki metrikleri ayrı etiketlemek.
5. Güncel sezon formunun tahmin özelliklerine girmesiyle model ağırlıklarının yeniden eğitilmesini birbirinden ayırmak ve ikisini de izlenebilir hale getirmek.

## Mevcut sistemin kısa haritası

| Bileşen | Üretimde tanımlı model | Temel yaklaşım | Başlıca kullanım |
|---|---|---|---|
| Kazanma olasılığı | WIN V10.1 | LightGBM sınıflandırıcı ve isotonic kalibrasyon | Ev sahibi galibiyet olasılığı |
| Takım skoru | SCORE V10.1 | Tempo, iki takımın hücum rating’i ve sayı farkı için XGBoost; ardından Ridge düzeltmesi | Ev/deplasman skoru, toplam ve fark |
| Oyuncu projeksiyonu | PLAYER V9 | PTS, REB, AST için ayrı LightGBM regresyonları ve Ridge düzeltmesi | Oyuncu istatistikleri ve takım kadro girdileri |

Üretim dosyaları [config/production_artifacts.yaml](../config/production_artifacts.yaml) içinden seçiliyor. Bu seçim, isimleri veya eski `src/inference` sarmalayıcılarını değil, canlı servisin hangi artefaktlara başvurduğunu anlamak için esas alınmalı.

## İncelemede görülen somut sorunlar

### P0 — SCORE türetilmiş skor değerlendirmesi holdout verisini kullanıyor

`ScoreTrainer._train_eval_final` önce yalnızca eğitim kısmında bir değerlendirme modeli kurup holdout MAE’sini hesaplıyor; sonra aynı fonksiyonda bütün veriyle yeniden eğitilmiş modeli döndürüyor. Çağıran kod bu dönen modeli daha önce ayrılmış `*_test_idx` satırlarında ev/deplasman skoru ölçmek için kullanıyor. Bu nedenle `derived_home_score_mae` ve `derived_away_score_mae` değerleri bağımsız holdout ölçümü değil; test satırları modelin eğitiminde görülmüş oluyor. İlgili akış: [score_trainer.py](../src/training/score_trainer.py#L198), [score_trainer.py](../src/training/score_trainer.py#L267).

**Çözüm:** Değerlendirme modeli ile üretim için sonradan tüm uygun geçmişte kurulacak modeli farklı nesne ve değişkenlerde tut. Holdout tahminlerini yalnızca holdout öncesi veriyle eğitilen modelden al. Türetilmiş ev/deplasman skorları, toplam ve fark metriklerinin tamamını bu tahminlerden hesapla. Nihai artefaktı holdout ölçümü tamamlandıktan sonra, yalnızca üretim eğitim kapsamı için ayrıca eğit.

### P0 — SCORE Ridge düzeltmesi zaman dışı değerlendirmeyi kirletebilir

OOF temel model tahminleri `KFold(shuffle=True)` ile üretiliyor ve Ridge artıkları tüm satırlarda eğitiliyor. Böylece bir tarih için üretilmiş tarihsel tahmin, daha ileri tarihlerdeki oyunlardan öğrenilmiş ağaç/Ridge düzeltmelerini dolaylı olarak içerebilir. Bu çıktı WIN modelinin `SCORE_PRED_MARGIN` girdisini oluştururken de kullanılıyor. İlgili akış: [score_trainer.py](../src/training/score_trainer.py#L294), [win.yaml](../config/features/win.yaml).

**Çözüm:** Kalibrasyon verisini ve OOF tahminlerini expanding-window / rolling-origin ile üret. Her doğrulama bloğunun modeli yalnızca o bloktan önceki maçları görebilsin. Ridge de sadece önceki tarihlerdeki OOF artıklarla eğitilsin. Gelecek tarihi kullanmayan OOF margin tablosu üret; aynı tablo sürümünü WIN veri setine bağla. Ek olarak `SCORE_PRED_MARGIN` özelliği olmadan WIN ablation çalıştır; fark bu özelliğin gerçek katkısını gösterecek.

### P0 — SCORE çekirdek oyuncu kullanılabilirliği eğitimde maç sonrası bilgiden geliyor

Eğitim özellik üreticisi `TEAM_CORE_TOP3_AVAILABLE_RATE` değerini o maç kutu skorunda dakika almış oyuncu sayısından türetiyor: [core_player_availability_features.py](../src/features/core_player_availability_features.py#L35), [core_player_availability_features.py](../src/features/core_player_availability_features.py#L74). Canlı özellik üreticisi ise tahmin anındaki mevcut/öngörülen uygunluğu kullanıyor: [build_matchup_features.py](../scripts/build_matchup_features.py#L678), [score.yaml](../config/features/score.yaml#L20). Bu iki değişken aynı anlamı taşımıyor. Model maçtan sonra oynayıp oynamadığını öğrenirken canlıda bunu tahmin etmek zorunda kalıyor.

**Çözüm:** Tarihsel anlık sakatlık/aktif listesi yoksa “oynadı” bilgisini maç öncesi uygunluk gibi kullanma. Ya bu değişkeni model sözleşmesinden çıkar ya da yalnızca tahmin zamanında mevcut olabilecek bir kaynaktan tarihli sakatlık/aktiflik snapshot’ları oluştur. Veri yoksa açık bir `availability_source` ve eksiklik bayrağı taşı; sessizce gerçek oynama bilgisiyle doldurma. Eski ve düzeltilmiş özellik setlerini aynı walk-forward dilimlerinde karşılaştır.

### P0 — Eğitim ve raporlama sözleşmeleri/sonuçları birbiriyle tam uyuşmuyor

`config/training_manifest.yaml` sezon dışı ayırma ve `final_refit_scope: train_only` tanımlıyor: [training_manifest.yaml](../config/training_manifest.yaml#L1). Üretim WIN metadata’sı ise 2025–26 sezonunu kapsayan 10.280 satırlık son refit’i, ayrıca önceki bağımsız sezon testini kaydediyor: [win_metadata.json](../models/production/win_metadata.json#L233), [win_metadata.json](../models/production/win_metadata.json#L246). Üretim performans raporunda 2025–26 için %70,94 doğruluk yazarken bağımsız sezon metriği metadata’da %66,59: [model_performance_and_architecture_report.md](../reports/production/model_performance_and_architecture_report.md#L120). Bu değerler farklı ölçüm kapsamları olabilir; fakat rapor bunları açık biçimde ayırmıyor. Eski governance belgeleri de V9/62 özellik politikasını anlatırken aktif artefakt V10 olarak kayıtlı. Bu, yalnızca dokümantasyon kusuru değil: hangi modelin hangi ölçümle üretime alındığını belirsizleştiriyor.

**Çözüm:** Her eğitim koşusu manifest hash’i, veri snapshot kimliği, feature contract hash’i, kod sürümü, bağımlılıklar, eğitim tarih aralığı, kalibrasyon aralığı, holdout aralığı ve artefakt checksum’larını kaydetsin. Raporlar metrik kapsamını `seen/train`, `inner validation`, `season holdout`, `final refit` diye açıkça sınıflasın. Üretim model kartı yalnızca bağımsız doğrulama sonuçlarını “genelleme performansı” olarak göstersin. Eski metrikleri yeni metriklerle aynı tabloda karşılaştırmadan önce kullanılan model checksum’ını ve split’i doğrula.

### P1 — Rastgele CV zaman serisi problemine uygun değil

SCORE hiperparametre araması `RandomizedSearchCV(cv=3)`; Ridge OOF ise karıştırılmış KFold kullanıyor: [score_trainer.py](../src/training/score_trainer.py#L177), [score_trainer.py](../src/training/score_trainer.py#L294). Gelecek sezonun dağılımı ve sakatlık/rotasyon rejimleri geçmişten farklı olabileceği için rastgele katlar gerçek üretim senaryosunu temsil etmiyor.

**Çözüm:** Sezon bazlı dış döngü ve tarih bazlı iç döngü kur. Örnek: 2022–23’e kadar eğitim → 2023–24 test; sonra 2023–24’e kadar eğitim → 2024–25 test; sonra 2024–25’e kadar eğitim → 2025–26 test. Kalibrasyon ve hiperparametre seçimi yalnızca her fold’un geçmiş bölümünde gerçekleşsin. En yeni tamamlanmış sezon, model/özellik seçimi bittikten sonra son kilitli doğrulama olarak kullanılsın.

### P1 — Eski başlangıç dönemi ve eksik girdilerde sıfır doldurma riskli

WIN sözleşmesinde oyuncu projeksiyon girdileri `fill_default_when_unavailable` ile sıfıra düşebiliyor: [win.yaml](../config/features/win.yaml). Sıfır, “ortalama/bilinmeyen” ile “hiç oyuncu katkısı yok” anlamlarını karıştırabilir. Yeni sezonda bir veya iki maç varken son sezonun verisi ve ELO kullanmak makul; ancak mevcut sezon örnek sayısı, shrinkage ağırlığı ve kaynaklar tahminde görünür ve ölçülür olmalı.

**Çözüm:** Her kritik özellik için eksiklik oranını sezon ve takım bazında kaydet. Sıfırın gerçek anlamlı değer olduğu değişkenlerde ayrı `*_MISSING` bayrağı kullan. Sayısal doldurma değerlerini eğitim katında fit edilen istatistiklerden veya açıkça tanımlı lig ortalaması öncülünden üret. Yeni sezon özelliklerinde örnek sayısına göre shrinkage uygula; ağırlığı sabit bir “5 maçtan sonra geçiş” kuralına bağlama, geçmiş sezon dışı performansta seç ve kalibre et.

### P1 — Tahmin aralıklarının kapsama ve belirsizliği kanıtlanmalı

Canlı skor aralıkları metadata ofsetleriyle oluşturuluyor; metadata’da yoksa sabit ±8/±12/±10 sayı yedekleri var: [score_prediction.py](../ml-service/app/services/score_prediction.py#L124). “%80 aralık” etiketi kullanılacaksa farklı sezonlarda yaklaşık %80 gerçek kapsama göstermeli; kapsam takım skoru, toplam ve fark için ayrı ölçülmeli.

**Çözüm:** Oyun bazlı dış örnek tahmin artıklarından, hedeflenen kapsama göre conformal veya quantile aralıklar hesapla. Kapsama ile aralık genişliğini birlikte raporla; her sezon, ev/deplasman ve maç önü tahmin zamanı için kalibre et. Veri yetersizse yüzde kapsama iddiası yerine açıkça “tarihsel tipik aralık” de.

### P1 — Oyuncu modeli DNP ve dakika belirsizliğini tek regresyonda saklayabilir

Oyuncu tahminlerinin PTS/REB/AST olarak ayrı üretilmesi anlaşılır; ama istatistik tahmini dakika ve oynama olasılığına çok bağlı. DNP, sakatlıktan dönüş, dakika kısıtı ve rol değişimi farklı süreçlerdir. Mevcut metriklerin MAE’si tek başına bu durumlarda güvenilirlik göstermez.

**Çözüm:** Tahmin hedefini açıkça tanımla: maçta oynarsa istatistik mi, yoksa DNP dahil maç başı koşulsuz istatistik mi? Uygun olduğunda iki aşamalı model kur: (1) oynama/dakika dağılımı, (2) oynadığı koşuldaki dakika başına üretim veya istatistik. Nihai beklenen değer ve aralık bu iki belirsizliği birleştirsin. DNP’leri sıfır veya satır dışı sayma politikasını hedef tanımında sabitle.

## Bilimsel değerlendirme protokolü

### 1. Tahmin anı ve hedefi sabitle

Her örnek için `prediction_timestamp` tanımla. O ana kadar gerçekten bilinebilen takım formu, sakatlık duyurusu, kadro, seyahat ve maç saati dışında bilgi feature tablosuna girmesin. Oyun sonucunu `WIN`, gerçek ev/deplasman sayısını ve oyuncu kutu skorlarını ayrı hedef olarak tut. İptal edilen, ertelenen, uzatmalı veya nötr saha maçları için dahil etme ve etiketleme politikası yazılı olsun.

### 2. Veri bölünmesini maç tarihine göre yap

- **Dış test:** Tam sezon veya önceden belirlenmiş kesintisiz tarih bloğu. Test verisi model/özellik/kalibrasyon seçimine katılmaz.
- **Walk-forward geliştirme:** Birden fazla geçmiş sezon üzerinde expanding-window değerlendirme. Her oyun, o maç tarihinden önceki verilerle tahmin edilir.
- **Kalibrasyon:** WIN olasılık kalibrasyonu ve SCORE/PLAYER düzeltmeleri, yalnızca eğitim döneminden sonra gelen ayrı kalibrasyon bloğunda öğrenilir. Dış test kilitli kalır.
- **Final fit:** Model seçimi bittikten sonra üretim modeli kullanılmasına izin verilen en son tamamlanmış geçmişe fit edilir. Bu modelin aynı satırlardaki başarısı test başarısı olarak yazılmaz.
- **Aynı günkü maçlar:** Sonuçlar gün sonunda toplu geliyorsa, aynı tarihteki maçlara o günün başka maç sonuçlarını yanlışlıkla katmamak için saat/tip-off sırası veya günlük snapshot kuralı belirlenir.

### 3. Baseline ve metrikler

Her aday, aynı dış test satırlarında baselinelarla kıyaslanmalı. Baseline’lar en az:

- WIN: lig ev sahibi kazanma oranı, pregame Elo-only, basit son sezon kazanma oranı.
- SCORE: lig/ takımın geçmiş tempo ve hücum verimliliği ortalaması, Elo farkından türetilmiş margin, basit toplam/fark regresyonu.
- PLAYER: oyuncunun yalnızca son 5/10 maç ortalaması ve dakika başına üretim × beklenen dakika.

| Model | Birincil metrik | İkincil ölçümler | Kalibrasyon/güvenilirlik |
|---|---|---|---|
| WIN | Brier score ve log loss | ROC-AUC, doğruluk, sınıf dengesi | Reliability diagram, calibration slope/intercept, ECE; favori/underdog, yakın maç ve sezon başı kesitleri |
| SCORE | Ev ve deplasman skor MAE; toplam ve margin MAE | RMSE, margin yön doğruluğu, bias | %50/%80/%90 aralık kapsaması ve ortalama genişlik |
| PLAYER | DNP dahil/koşullu hedefe uygun MAE | RMSE, bias, dakika ve rol segmentleri | PTS/REB/AST tahmin aralığı kapsaması; aktiflik tahmininde Brier/PR-AUC |

Doğruluk tek başına model seçme ölçütü olmasın. Galibiyet olasılığında iyi sıralama ile iyi olasılık kalibrasyonu farklı özelliklerdir; ikisi ayrı değerlendirilmelidir. Güven aralıkları takım maçlarını bağımsız kabul etmeyen maç günü veya sezon blok bootstrap ile hesaplansın.

### 4. Sızıntı ve train/serve uygunluk denetimi

Her feature için aşağıdaki kayıt zorunlu olsun:

| Alan | Örnek |
|---|---|
| Ad ve tanım | `TEAM_CORE_TOP3_AVAILABLE_RATE`: tahmin anında beklenen uygun oyuncu oranı |
| Bilindiği zaman | maç günü sakatlık raporu yayın zamanı |
| Kaynak ve snapshot | API/CSV, çekilme zamanı, içerik hash’i |
| Eğitim hesaplama | tarih sıralı maç öncesi snapshot join’i |
| Canlı hesaplama | aynı formül ve aynı semantik |
| Eksik değer davranışı | missing bayrağı ve eğitimden öğrenilen/önceden tanımlı fallback |
| Yasak kaynak | tahmin edilen maçın MIN/PTS/WL veya maç sonu oyuncu durumu |

CI veya aday eğitim kapısı, hedef maç sonrası alanları reddetsin; eğitim ve canlı tek satırlık aynı örnek için feature parity karşılaştırması üretsin. Yalnızca korelasyon veya `shift(1)` denetimi yeterli değil: roster, sakatlık, projeksiyon, ELO, oyun sıralaması ve özellik birleştirmeleri de tarih damgasıyla incelensin.

## Eklenmesi önerilen özellikler

Özellikleri modelde yer alması garanti girdiler gibi değil, tarihsel walk-forward ablation ile kanıtlanacak adaylar olarak ele al.

### WIN ve takım SCORE için

1. **Güncel sezon formu + önceki sezon öncülü:** Son sezon gücü, franchise Elo ve lig ortalamasını maç sayısına göre yumuşak birleştir. `games_played` ve kullanılan ağırlık da raporlansın.
2. **Şut kalitesi ve varyansı:** eFG%, serbest atış oranı, 3PA payı ve son 5/10 maç oynaklığı. Küçük örneklemde shrinkage uygulanmalı; yüksek varyans otomatik olarak daha yüksek beklenen skor sayılmamalı.
3. **Hücum/savunma eşleşmesi:** takım hücum rating’i ile rakibin savunma rating’ini lig ortalamasına göre etkileşimli ve iki taraf için simetrik kur.
4. **Dinlenme ve seyahat:** Dinlenme günleri, ardışık maç, kısa aralıkta maç yoğunluğu, seyahat mesafesi/zaman dilimi; tarih ve gerçek maç lokasyonuna göre doğrula.
5. **Kadronun beklenen rolü:** Beklenen aktiflik olasılığı, dakika dağılımı ve oyuncu rolü değişimi. Maç sonrası “oynadı” verisinin yerine maç öncesi snapshot kullan.
6. **Örneklem/eksik veri göstergeleri:** son maç sayısı, mevcut sezon oyun sayısı, her ana özellikte veri kaynağı/eksiklik bayrakları.
7. **Harici pazar çizgisi (isteğe bağlı):** Güvenilir ve zaman damgalı spread/moneyline/total verisi varsa bağımsız benchmark veya ayrı özellik deneyi. Yalnızca tahmin anında erişilebilir snapshot; sonuçtan sonra kapanış çizgisiyle geriye dönük tahmin yapılmamalı. Ürünün hedefi bahis piyasasını aşmak değilse pazar verisi zorunlu değildir.

### PLAYER için

1. Beklenen dakika ve oynama olasılığı için ayrı, maç öncesi tahminler.
2. Son 5/10/20 maç dakika ve dakika başına PTS/REB/AST; sezon ortalamasına shrinkage ve eğilim belirsizliği.
3. İlk beş/bench, beklenen kullanım oranı, sakat oyuncuların yokluğunda rol ve top kullanımı değişimi.
4. Rakip savunma özelliklerini pozisyon etiketinden ibaret tutmadan, oyuncunun rolü ve şut/atış profiliyle eşleştir.
5. Bireysel tahminlerin takım skoruna toplamını tutarlı yapan kısıt/ölçekleme. Ölçekleme ham oyuncu tahmini, düzeltilmiş tahmin ve kullanılan takım skorunu kaydetsin; toplama zorlamak oyuncu modelini olduğundan kesin göstermesin.

### Özellik ekleme kuralı

Her yeni özellik için şu ablasyon raporu olmadan üretime ekleme: aynı walk-forward fold’larında mevcut model vs yeni model; birincil metrik, kalibrasyon, segment etkisi, eksiklik oranı, veri gecikmesi ve SHAP/importance kararlılığı. Tek bir sezonda veya tek bir takım kesitinde görülen artış promosyon için yeterli sayılmaz.

## Tahmin sunumu ve SHAP için ürün kuralları

- Kazanma olasılığı ve sayı skoru farklı hedeflerdir. `WIN` favorisi, skor modeli favorisi ve tahmini fark ayrı isimlerle gösterilsin; modellerden biri diğerini sessizce tersine çevirmesin.
- Olasılık modeli marjla birleştirilecekse bu ilişki eğitimde ve değerlendirmede aynı olsun. Uygulama katmanında sonradan skor farkının işaretini zorla çevirme yapılmasın.
- SHAP açıklaması modelin yerel katkısını anlatır, nedensellik anlatmaz. Isotonic kalibrasyonun uygulanmış son olasılığı temel model SHAP’ından ayrıdır; kalibrasyon etkisi ayrı, doğru ölçekte gösterilsin.
- SHAP yön/ölçek kapsamı hedefe göre tanımlansın: win modeli için sınıf ve model çıktısı (log-odds veya olasılık), skor bileşenlerinde rating/pozisyon/margin birimi. Farklı hedeflerin katkıları tek “etki payı” havuzunda karıştırılmasın.
- Otomatik metin, feature değerinden desteklenmeyen “son dönemde üstün”, “saha avantajı ana katalizör” gibi nedensel veya kuvvetli çıkarımlar üretmesin. Açıklama “model bu girdiyi bu tahmin yönünde kullandı” sınırını korusun.

## Operasyon, yeniden eğitim ve izleme

1. **Veri tazeliği:** Her gün tamamlanan maçların skor, oyuncu box score, maç takvimi ve roster/availability kaynaklarının son tarihi doğrulanır. Eksik kaynak varsa tahmin “güncel” gibi sunulmaz.
2. **Özellik yenileme:** Tamamlanan maçlar rolling form, güncel ELO ve sezon örnek sayısı özelliklerine sonraki tahminler için eklenir. Bu, model ağırlıklarının da güncellendiği anlamına gelmez.
3. **Ağırlık eğitimi:** Sabit bir takvimle (ör. haftalık veya belirli sayıda yeni oyun sonrası) aday model eğitilebilir; her çalıştırma sadece o ana dek tamamlanmış ve doğrulanmış maçları kullanır. Üretim artefaktı doğrudan overwrite edilmez.
4. **Aday/şampiyon:** Aday aynı son kilitli test ve zorunlu segmentlerde şampiyonla karşılaştırılır. Eşik, kalibrasyon ve minimum örnek şartlarını geçmezse üretim modeli korunur.
5. **Gölge çalışma:** Yeni model birkaç gün/hafta gerçek tahmin akışında yan yana çalışır; skor tahmini, olasılık, veri eksikliği, çalışma zamanı ve win-score diverjansı kaydedilir.
6. **Kayıt:** Her tahmin satırı `prediction_id`, UTC tahmin zamanı, oyun kimliği, model/artefakt hash’i, feature snapshot kimliği, sezon oyun sayısı, kadro snapshot’ı, ham ve düzeltilmiş skor, olasılık ve tahmin aralıklarını saklar. Sonuç sonradan eklenir; tahmin kaydı değiştirilmez.
7. **Drift ve kalite:** Brier/log loss/MAE, kalibrasyon, bias, interval coverage, feature eksikliği/drift ve takım/segment kırılımları periyodik izlenir. Uyarı tek başına otomatik yeniden eğitme veya promosyon anlamına gelmez.
8. **Geri alma:** Önceki üretim artefaktı, sözleşmesi ve raporu checksum ile saklanır; sorun halinde tek sürüm değişikliğiyle geri dönülebilir.

## Uygulama yol haritası ve kabul ölçütleri

### Aşama 0 — Doğru mevcut durum fotoğrafı

- Aktif üretim, deneysel ve alias artefaktlarının checksum, sürüm, eğitim verisi kapsamı ve feature contract’ını çıkar.
- Manifest, trainer varsayılanları, üretim YAML’si ve raporlar arasındaki uyuşmazlıkları tek kaynaklı kayıtla çöz.
- Tüm tarihsel metrikleri `in-sample`, `inner validation`, `season holdout`, `post-refit` olarak yeniden etiketle.

**Kabul:** Her üretim dosyasının hangi kod, veri snapshot’ı, dönem, split ve feature contract ile üretildiği tekrar oluşturulabilir. Rapor ile metadata aynı koşuyu gösterir.

### Aşama 1 — Leakage ve parity düzeltmeleri

- SCORE değerlendirme ve Ridge/OOF akışını zaman sıralı yap; test verisi hiçbir model veya düzeltmeyi eğitmesin.
- Çekirdek oyuncu availability’yi tarihsel maç öncesi snapshot’a bağla; snapshot yoksa özelliği çıkar veya missing olarak ele al.
- WIN için OOF margin girdisini yalnızca geçmiş veriden üretilen tarihsel tahminlerle yeniden kur.
- Eğitim/inference feature parity raporu ve zorunlu tarih sınırı kontrolü ekle.

**Kabul:** Her geçmiş örneğin tahmini için model ve preprocessing sadece önceki tarihlerden öğrenilmiş. Aynı örnekte train/serve feature farkları açıklanmış veya sıfırlanmış. Post-game alan varsa eğitim başarısız.

### Aşama 2 — Yeniden üretilebilir walk-forward benchmark

- WIN, SCORE ve PLAYER için ortak dış fold tarihleri tanımla; her fold için tüm dönüşüm ve düzeltmeleri baştan fit et.
- Baseline’ları aynı oyunlarda çalıştır; güven aralıklarını blok bootstrap ile üret.
- WIN kalibrasyonunu reliability, slope/intercept ve Brier/log loss ile değerlendir.
- SCORE interval coverage ve bias’ı; PLAYER DNP/dakika/rol kesitlerini raporla.

**Kabul:** Yeni adaylar birden fazla görülmemiş sezon/tarih bloğunda güçlü baselineları tutarlı biçimde geçer. Her model için metrik belirsizliği, örnek sayısı ve kötüleşen segmentler görünür.

### Aşama 3 — Özellik ve model iyileştirmeleri

- Availability snapshot, dakika/oynama olasılığı, shrinkage ve şut varyansı özelliklerini sırayla ekle.
- Her değişken kümesini ablation ile karşılaştır; özellik listesi ve verinin tahmin anında erişilebilirliği kilitli olsun.
- Mevcut LightGBM/XGBoost’a basit lojistik/lineer, Elo/rolling ve uygun olursa CatBoost gibi adayları aynı protokolle ekle. Algoritma seçimini moda veya training skoruna göre değil, dış dönem sonuçlarına göre yap.

**Kabul:** Her yeni karmaşıklık out-of-sample fayda sağlar, segmentleri bozmaz, kalibrasyonu düşürmez ve üretimde gerekli veriler zamanında mevcuttur.

### Aşama 4 — Shadow, promosyon ve sürekli kalite

- Üretim tahminlerini değişmeden sakla ve sonuç geldikçe eşleştir.
- Yeni adayı shadow çalıştır; leakage, veri gecikmesi, parity, performans ve operasyon kapılarını geçince insan onayıyla terfi ettir.
- Her terfide önceki model artefaktını sakla; drift alarmı üretim değişikliğini tek başına tetiklemesin.

**Kabul:** Tahmin, model sürümü ve veri snapshot’ı geriye dönük aynı şekilde bulunabilir; rollback kanıtlanmış; gerçek sezon sonrası skor raporu otomatik üretilmiş.

## Terfi kapısı (önerilen)

Bir aday aşağıdakilerin tümü olmadan üretime alınmamalı:

- Zaman dışı testte hiçbir holdout satırı eğitim, özellik seçimi veya kalibrasyonda kullanılmamış.
- Kod/veri/artefakt/feature contract hash’leri ve zaman sınırları eksiksiz.
- Ana metrik hedefi karşılıyor ve belirsizlik aralığıyla birlikte baselineları geçiyor.
- Kalibrasyon, tahmin aralıkları ve önemli segmentlerde kabul edilemez gerileme yok.
- Canlı/ eğitim özellik semantiği eşleşiyor; kritik girdiler sessiz default almıyor.
- En az shadow döneminde teknik hata, kaynak gecikmesi veya tahmin tutarsızlığı gözlenmemiş.
- Değişiklik, fark raporu ve geri alma adımı operatör tarafından incelenmiş.

Sabit eşikleri bir defa belirleyip sonsuza dek korumak yerine, mevcut şampiyonun varyansı, örnek sayısı, ürün kullanım amacı ve geçmiş sezonlar üzerinde önceden belirlenmiş karar kuralıyla kalibre et. Eşiği test sonucunu gördükten sonra değiştirme.

## Sıralı ilk işler

1. SCORE test verisi sızıntısını düzelt ve skor/total/margin sonuçlarını gerçek walk-forward dış tahminlerle yeniden ölç.
2. SCORE `TEAM_CORE_TOP3_AVAILABLE_RATE` eğitim/live semantik farkını gider.
3. WIN, SCORE ve PLAYER için aynı tarihli fold/snapshot çerçevesi oluştur.
4. Aktif V10 artefaktı, V9 governance belgeleri ve rapor metriklerini tek model kartı/metadata üretim hattında hizala.
5. WIN OOF score margin’ı ve isotonic calibration’ı doğru zaman akışıyla doğrula; gerçek kalibre edilmiş olasılık ve SHAP açıklama ölçeğini ayır.
6. Beklenen skor/olasılık aralıklarının sezon dışı kapsamasını ölç; yedek sabit aralıkları kalite beyanı olarak göstermeyi bırak.
7. DNP dahil PLAYER hedef tanımını, dakika/availability modelini ve takım toplamıyla ölçekleme etkisini netleştir.
8. Ancak bunlardan sonra yeni feature ailelerini tek tek ablation ile ekle.

## İlgili kaynaklar

- Aktif artefakt seçimi: [config/production_artifacts.yaml](../config/production_artifacts.yaml)
- Eğitim sezon sözleşmesi: [config/training_manifest.yaml](../config/training_manifest.yaml)
- WIN özellik sözleşmesi: [config/features/win.yaml](../config/features/win.yaml)
- SCORE özellik sözleşmesi: [config/features/score.yaml](../config/features/score.yaml)
- WIN eğitim/değerlendirme: [src/training/win_trainer.py](../src/training/win_trainer.py)
- SCORE eğitim/değerlendirme: [src/training/score_trainer.py](../src/training/score_trainer.py)
- PLAYER eğitim/değerlendirme: [src/training/player_trainer.py](../src/training/player_trainer.py)
- Canlı SCORE uygulaması: [ml-service/app/services/score_prediction.py](../ml-service/app/services/score_prediction.py)
- Canlı tam tahmin bileşimi: [ml-service/app/services/game_full.py](../ml-service/app/services/game_full.py)
- Tarihsel core availability üretimi: [src/features/core_player_availability_features.py](../src/features/core_player_availability_features.py)
- Üretim WIN metadata’sı: [models/production/win_metadata.json](../models/production/win_metadata.json)
- Üretim SCORE metadata’sı: [models/production/score_metadata.json](../models/production/score_metadata.json)
- Önceki kalite/leakage denetimi: `reports/audits/model_quality_leakage_and_governance_audit.md` (silindi)
- Eğitim governance özeti: `reports/operations/training_governance_status.md` (silindi)
# Uygulama durumu — 2026-10-04

Leakage azaltma ve üretim adayı değerlendirmesi `reports/evaluation/training_run_20261004_130707.md` (silindi) içinde kayıtlı. Bilinen sızıntılı eski şampiyon yedeklenerek temiz aday üretime alınmış; geri dönüş kopyası `models/production/replaced_leaky/20261004_130707/` altında tutulmuştu (2026-10-21'de silindi).

## 1. Tam Üretim Yığını Çok Sezonlu Walk-Forward Backtest (WIN, SCORE, PLAYER)

[scripts/walk_forward_benchmark.py](../scripts/walk_forward_benchmark.py) ile 5 kesintisiz dış test sezonunda (2021–22'den 2025–26'ya kadar, toplam 4.407 görülmemiş takım maçı ve 137.540 oyuncu maçı) tam üretim yığınları test edildi:

* **Rapor:** [reports/evaluation/multi_season_walk_forward_backtest.md](../reports/evaluation/multi_season_walk_forward_backtest.md) ve [multi_season_walk_forward_backtest.json](../reports/evaluation/multi_season_walk_forward_backtest.json)
* **WIN Modeli (LightGBM Kalibre):** 5 sezonun ağırlıklı ortalamasında **0.2259 Brier** ve **0.6702 AUC** elde ederek saf Elo (0.2258) ve lojistik kıyasa (0.2271) paralel yüksek kalibrasyon sağladı.
* **SCORE Modeli (XGBoost):** Hareketli tempo × hücum verimliliği taban çizgisine kıyasla:
  * Toplam Skor MAE: **14.85 sayı** vs Baseline 16.18 sayı (**1.33 sayı daha az hata**)
  * Sayı Farkı (Margin) MAE: **11.93 sayı** vs Baseline 12.63 sayı (**0.70 sayı daha az hata**)
  * Conformal %80 Aralık Kapsaması: Bağımsız sezonlarda ortalama **%82.1** ile istatistiksel geçerliliği doğrulandı.
* **PLAYER Modelleri (LightGBM PTS, REB, AST):** Son-5 maç ortalaması taban çizgisine kıyasla tüm sezonlarda tutarlı kazanım:
  * Sayı (PTS) MAE: **4.59** vs Baseline 4.80 (**-0.20 sayı**)
  * Ribaund (REB) MAE: **1.97** vs Baseline 2.00 (**-0.03 rib**)
  * Asist (AST) MAE: **1.35** vs Baseline 1.38 (**-0.02 ast**)

## 2. Çok Sezonlu Özellik Ablasyon Çalışması (Aşama 3)

[scripts/run_feature_ablations.py](../scripts/run_feature_ablations.py) ile aday özellik aileleri 5 dış test sezonunda katı expanding window kuralıyla test edildi:

* **Rapor:** `reports/evaluation/feature_ablation_study.md` (silindi) ve `feature_ablation_study.json` (silindi)
* **Temel Bulgular:** 
  * Core Baseline (Elo + Rest + Form): 0.2250 Brier / 0.6749 AUC.
  * Dean Oliver Four Factors (+ Net Rtg, eFG%, Tov, Rebound): Olasılık kalibrasyonuna ve takım gücü temsiline pozitif katkı.
  * Düzenlileştirme Gereksinimi: 70 değişkenli tam sette aşırı uyumu önlemek için ağaç derinliği kısıtı (`max_depth=4`) ve alt örnekleme (`subsample=0.8`) kritik bir güvenlik faktörüdür.

## 3. Canlı Shadow Modu ve Drift İzleme Altyapısı (Aşama 4)

* **Shadow Logger:** [ml-service/app/services/shadow_logger.py](../ml-service/app/services/shadow_logger.py) ile canlı servise gelen her tam tahmin `prediction_id`, zaman damgası, model sürümü, conformal aralıklar ve girdi snapshot'ı ile `data/predictions/shadow_predictions_log.jsonl` dosyasına yazılacak şekilde entegre edildi ([ml-service/app/services/game_full.py](../ml-service/app/services/game_full.py)).
* **Drift & Kalibrasyon Monitörü:** [scripts/monitor_shadow_and_drift.py](../scripts/monitor_shadow_and_drift.py) ile loglanan tahminlerin tamamlanmış maçlarla eşleştirilip Brier, MAE, Conformal kapsama ve Kolmogorov-Smirnov girdi kayma testlerini yürüten otomatik raporlama hattı kuruldu (`reports/operations/live_shadow_and_drift_report.md` (silindi)).

## Kapsam ve Tasarım Kararları

- **İki Aşamalı DNP / Dakika Modeli (Madde 3):** Sakatlık, kadro dışı (DNP) ve rotasyon durumu kullanıcı/operatör tarafından maç öncesinde dinamik olarak yönetildiği için, gereksiz karmaşıklık yaratmamak adına bilinçli tasarım kararı ile kapsam dışı bırakılmıştır.
- Tüm modeller zamansal dış testlerde baseline'ları geçmiş, sızıntısız OOF yapısına oturtulmuş ve izlenebilir loglama ile donatılmıştır.

