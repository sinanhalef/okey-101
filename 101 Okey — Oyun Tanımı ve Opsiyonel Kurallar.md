# 101 Okey — Oyun Tanımı ve Opsiyonel Kurallar

Sep 25, 2026 · @sinan

## Amaç ve okuma kılavuzu

Bu belge, 4 kişilik 101 Okey oyununun eksiksiz bir kural tanımıdır; kod değil, bir yazılımcının (veya Claude'un) oyunu birebir uygulayabileceği bir şartnamedir. Yapı iki katmanlıdır: **Temel oyun** her zaman geçerlidir; **Opsiyonel kurallar** masa kurulurken tek tek açılıp kapatılan (on/off) modüllerdir.

Okuma kuralları:

- "Yapılmalı / yapılamaz" ifadeleri kesin kuraldır; motor bunları zorlamalıdır.
- Sayısal değerler (101, 202, çarpanlar) varsayılandır; aksi belirtilmedikçe masa ayarından değiştirilebilir parametre olarak düşünülmelidir.
- Bir opsiyonel kural temel kuralla çelişirse, açık olduğu sürece opsiyonel kural geçerlidir.

### Terimler sözlüğü

| Terim | Anlamı |
| --- | --- |
| Taş | Oyunun her bir parçası (renk + sayı). |
| Istaka | Her oyuncunun taşlarını dizdiği kişisel rafı; diğer oyuncular göremez. |
| Deste / orta | Dağıtımdan sonra kapalı duran, çekilecek taş yığını. |
| Gösterge | Dağıtım sonunda yüzü açık konan taş; okeyi belirler. |
| Göstergenin eşi | Gösterge ile aynı renk ve sayıdaki ikinci taş; K3 açıksa çiftlerde joker olur. |
| Okey | Göstergenin aynı renkte bir üst sayısı; joker görevi görür. |
| Sahte okey | Üzerinde sayı olmayan 2 özel taş; okey taşının yerini tutar (joker değildir). |
| Yandan almak | Soldaki oyuncunun az önce attığı taşı destenin yerine almak. |
| Açmak (el açmak) | İlk kez yere per veya çift indirmek; baraj (101 veya 5 çift) şartı var. |
| Per / seri | Yere indirilen geçerli taş grubu (aynı sayı farklı renk ya da aynı renk ardışık sayı). |
| Çift | Aynı renk ve sayıdaki iki taş. İstisna: okey (ve K3 açıksa göstergenin eşi) herhangi bir taşla çift olur. |
| İşlemek | Açmış bir oyuncunun masadaki mevcut perlere taş eklemesi. |
| İşlek | Masadaki bir pere işlenebilecek taş; atılması cezalıdır. |
| Okey çalmak | Masadaki okeyin yerine temsil ettiği gerçek taşı koyup okeyi almak (2.6). |
| Bitmek | Elindeki tüm taşları yere indirip son taşı atarak eli kapatmak. |
| El | Dağıtımdan birinin bitmesine (veya destenin tükenmesine) kadar geçen oyun. |
| Oyun / maç | Önceden belirlenen sayıda elin toplamı. |
| Ceza puanı | Kötü puan; oyun sonunda en düşük toplam kazanır. |

## 1. Taşlar, oyuncular, dağıtım

### 1.1 Taş seti

Oyun 106 taşla oynanır: 104 numaralı taş + 2 sahte okey.

- 4 renk: kırmızı, sarı, mavi, siyah.
- Her renkte 1'den 13'e kadar sayılar, her taştan **2 adet** (4 renk × 13 sayı × 2 = 104).
- 2 adet sahte okey (sayısız, özel desenli taş).
- Bir taşın **puan değeri** üzerindeki sayıdır (1 = 1 puan, 13 = 13 puan). İstisnalar: okey ve sahte okey (1.4).
- Birbirinin tamamen aynısı olan iki taş (örn. iki adet kırmızı 7) oyun kurallarında eşdeğerdir; motor bunları ayırt etmek için kendi içinde bir kimlik (id) tutabilir.

### 1.2 Oyuncular ve mod

- Tam olarak 4 oyuncu vardır; saat yönünün tersine oynanır; herkes taşını sağına atar.
- **Tekli mod:** herkes kendi puanı için oynar.
- **Eşli mod:** karşılıklı oturan iki oyuncu takımdır; puanları el sonunda toplanır (bkz. 3.5).
- Her oyuncu için "sol komşu" = kendisinden önce oynayan, "sağ komşu" = kendisinden sonra oynayan kişidir. Oyuncu taşı **sol komşusundan** yandan alır ve **sağ komşusuna** atar.

### 1.3 Dağıtım

1. Taşlar karıştırılır.
2. Dağıtıcı her elde bir sonraki oyuncuya geçer (sırayla döner).
3. Başlayan oyuncuya (dağıtıcının sağındaki) **22 taş**, diğer üç oyuncuya **21'er taş** verilir. Toplam 85 taş dağıtılır.
4. Kalan taşlardan biri yüzü açık konur: bu **gösterge**dir. Kalan 20 taş kapalı **deste**yi oluşturur.
5. Gösterge sahte okey çıkarsa yeniden çekilir (sahte okey desteye karıştırılır ve yeni bir taş açılır).

Not: fiziksel oyundaki istif yapma, zar atma vb. ritüeller dijital versiyonda gerekmez; sonuç (22/21/21/21 + gösterge + deste) aynı olmalıdır.

### 1.4 Gösterge, okey ve sahte okey

- **Okey** = göstergeyle aynı renkte, sayısı bir fazla olan taş. Gösterge 13 ise okey aynı rengin 1'idir. Örnek: gösterge sarı 5 → okey sarı 6.
- Oyunda okey olan taştan 2 adet vardır (gösterge ile aynı renk ve sayıdaki taşın ise oyunda 1 tane daha kalmıştır).
- **Okey jokerdir:** herhangi bir perde veya çiftte istenen herhangi bir taşın yerine geçer. Yere indirildiğinde yerine geçtiği taşın puanını alır.
- **Sahte okey joker değildir:** sadece okey taşının kendisini temsil eder. Örneğin okey sarı 6 ise sahte okey her yerde "sarı 6" olarak kullanılır ve 6 puan değerindedir.
- Okey otomatik olarak joker olmaz. Oyuncu istakasındaki okeye dokunursa taş ters çevrilir ve joker olarak işaretlenir. Çevrilmemiş okey kendi değeriyle (örn. sarı 6) normal taş olarak kullanılır.

## 2. Oyunun akışı

### 2.1 Tur yapısı

Başlayan oyuncu (22 taşlı) ilk turunda taş çekmez; sadece isterse açar ve bir taş atar. Sonraki her tur şu sırayla ilerler:

1. **Çek:** Desteden kapalı bir taş çek **veya** sol komşunun son attığı taşı al (yandan alma, 2.2).
2. **Opsiyonel eylemler** (sırası serbest, birden fazla kez): el açmak (2.3–2.4), açtıysa işlemek (2.5), okey değiştirmek (2.6).
3. **At:** Tam olarak bir taşı sağ komşunun önüne yüzü açık at. Tur biter.

Bir oyuncunun istakasında tur sonunda her zaman 21 taştan az ya da eşit taş kalır; atılmadan tur bitmez (bitme hariç, 2.7).

### 2.2 Yandan alma

- Sadece sol komşunun **bir önceki turda attığı** taş alınabilir; daha eski atılmış taşlar alınamaz.
- Yandan alınan taş **aynı tur içinde yere indirilmek zorundadır**:
  - Oyuncu henüz açmadıysa, o tur o taşı da kullanarak açmak zorundadır.
  - Seriyle açmışsa: işler, yeni bir perde kullanır veya (2.5'e göre) yeni bir çiftte kullanır.
  - Çiftle açmışsa: yeni bir çiftte kullanır (eşiyle, okeyle veya K3 açıksa göstergenin eşiyle) ya da işler. Örnek: çiftle açmış oyuncuya soldan 6 geldi, elinde 7 var, yerde 8-9-10 duruyor; 6 ve 7'yi işleyip peri 6-7-8-9-10 yapar.
- Bu şart sağlanamazsa taş geri konur ve oyuncu +101 ceza yer (K10 açıksa ceza yok, taş yine geri konur). Taş hiçbir durumda oyuncunun elinde kalmaz.
- K5 (çifte gitme) açıksa, çifte giden oyuncu için bu zorunluluk yoktur.
- Atıldığında cezası yazılmış bir taş (işlek veya okey, bkz. 2.8) yandan alınamaz.
- Motor, oyuncu yandan almaya çalıştığında o taşla geçerli bir açılış/işleme mümkün mü diye kontrol **etmez** (oyuncu risk alır); tur sonunda şartın sağlanıp sağlanmadığını kontrol eder.

### 2.3 Seri ile açma (101 barajı)

Oyuncu elindeki perleri ilk kez yere indirirken indirdiği taşların puan toplamı **en az 101** olmalıdır. Geçerli per türleri:

- **Aynı sayı, farklı renk (per):** 3 veya 4 taş; aynı renkten iki taş olamaz. Örn. kırmızı 9, mavi 9, siyah 9.
- **Aynı renk, ardışık sayı (seri):** en az 3 taş, üst sınır yok. Örn. sarı 4-5-6-7.
- 1 sadece 1 olarak kullanılır: 1-2-3 geçerlidir; 12-13-1 ve 13-1-2 geçersizdir.
- Okey herhangi bir perde herhangi bir taşın yerine geçer ve yerine geçtiği taşın puanını alır.
- Açılışta yandan alınan taş da sayılır.

Açılış aynı tur içinde tek seferde yapılır: 101'e ulaşan perlerin hepsi aynı anda indirilir. Açılıştan sonra aynı tur içinde işleme de yapılabilir.

### 2.4 Çift ile açma

- Oyuncu alternatif olarak **en az 5 çift** indirerek açabilir. Puan barajı yoktur (K4 açıksa çift sayısı barajı yükselir).
- Çift = aynı renk ve sayıdaki iki taş. İstisna: okey herhangi bir taşla çift olur; K3 açıksa göstergenin eşi de.
- Çiftle açan oyuncu **hiçbir zaman per indiremez** (ne seri ne aynı sayı). Sonradan yeni çift indirebilir ve işleyebilir (2.5).
- Çiftle açmanın bedeli: el sonunda elde kalan taşların iki katı ceza sayılır (3.1). Oyun içi cezalar (işlek, okey atma vb.) çift açıldı diye ikiye katlanmaz.

### 2.5 İşleme

- Sadece açmış oyuncu işleyebilir.
- İşleme, masadaki **herhangi bir oyuncunun** perine taş eklemektir; sonuç yine geçerli bir per olmalıdır (seriyi uçtan uzatmak veya 3'lü sayı perini 4'e tamamlamak).
- **Seriyle açmış oyuncu** istediği zaman baraj şartı olmadan yeni per indirebilir. Masada çiftle açmış en az bir oyuncu varsa **yeni çift de indirebilir**; bu çiftler çift açan oyuncunun önüne konur.
- **Çiftle açmış oyuncu** per indiremez; işleyebilir ve yeni çift indirebilir.
- **İşleme sınırı:** çiftle açmış oyuncu bir turda aynı perin aynı ucuna en fazla 2 taş işleyebilir. Örnek: yerde 7-8-9 varken 5-6 işlenebilir, 4-5-6 işlenemez; aynı tur hem 5-6 hem 10-11 işlenebilir. Bu sınır sadece çiftle açmış oyuncular için geçerlidir; seriyle açanlar için sınır yoktur.
- Mevcut bir çifte üçüncü taş eklenemez; "çiftlere işleme" yeni çift indirmek demektir.

### 2.6 Okey çalma

- Masadaki bir perde veya çiftte okey varsa, okeyin temsil ettiği gerçek taşı elinde tutan **açmış** oyuncu, o taşı yerine koyup okeyi alabilir (okey çalmak).
- Örnek: rakip kırmızı 7 + okey çiftiyle açtı. Ben 101 ile seri açtım. Elimdeki kırmızı 7'yi o çifte koyup okeyi alırım.
- Okey karşı takımdan çalınırsa, okeyi yere indirmiş olan takım **+101** ceza yer. Tekli modda okeyi indiren oyuncu +101 yer.
- Göstergenin eşiyle (K3) yapılmış çiftte gösterge eşi alınamaz.
- Çalınan okey aynı tur kullanılmak zorundadır; K8 açıksa elde saklanabilir.

### 2.7 Bitiş

- Açmış bir oyuncu, elindeki tüm taşları yere indirir ve **son taşı atarak** biter. Atılacak son taş mutlaka olmalıdır; elinde hiç taş kalmayana kadar indirip atmadan bitmek geçersizdir.
- **Okeyle bitmek:** son atılan taş okey ise ceza çarpanı artar (3.2).
- **Elden bitmek:** oyuncu daha önce hiç açmamışken tek turda tüm elini açıp bitirir; ceza çarpanı artar (3.2).
- **Deste tükenmesi:** deste bittiği halde kimse bitmemişse el biter; herkes eldeki taşlara göre ceza alır, biten olmadığı için -101 kimseye verilmez. Açmamışlar 202, açmışlar elde kalan kadar ceza yer (3.1).

### 2.8 Oyun sırasında yasaklar

- İşlek taşı (masadaki bir pere uyan taş) atmak cezalıdır (+101).
- Okeyi atmak (bitiş hariç) cezalıdır (+101).
- Yandan alınan taşı kullanmamak cezalıdır (2.2).
- Cezası yazılmış atılan taş (işlek veya okey) yandan **alınamaz**; aksi halde aynı taş için iki kez ceza doğardı.
- Varsayılan olarak motor bu cezaları otomatik yazar. K9 açıksa cezalar ancak rakibin "İŞLEK!" butonuna basmasıyla yazılır.

### 2.9 Tur süresi

- Her oyuncunun tur başına süresi vardır; varsayılan **30 sn** (masa ayarından değiştirilebilir parametre).
- Süre, sıra oyuncuya geldiğinde başlar; oyuncu taş attığı anda durur ve süre sıradaki oyuncuya geçer.
- Oyuncu o tur açarsa süresine **+30 sn** eklenir.
- O tur işlediği her taş için **+5 sn** eklenir.
- Açtıktan sonra indirdiği her yeni per veya çift için **+10 sn** eklenir.
- K9 açıksa haksız "İŞLEK!" basan oyuncunun bir sonraki tur süresi **5 sn** kısalır.
- **Süre dolunca:** oyuncu henüz taş çekmediyse motor desteden bir taş çeker. Ardından elindeki **işlek olmayan en düşük taşı** yana atar; elindeki tüm taşlar işlekse en düşüğünü atar (işlek cezası normal şekilde yazılır). Okey otomatik olarak asla atılmaz.

## 3. Puanlama ve oyun sonu

Puanlar ceza puanıdır: el sonunda herkesin cezası toplamına eklenir, oyun sonunda **en düşük toplam kazanır**. Biten oyuncu negatif puan (ödül) alır.

### 3.1 El sonu temel puanları

| Oyuncunun durumu | Ceza (normal bitiş) |
| --- | --- |
| Biten oyuncu | -101 |
| Seriyle açmış, bitmemiş | Elde kalan taşların puan toplamı |
| Çiftle açmış, bitmemiş | Elde kalan taşların puan toplamı × 2 |
| Hiç açmamış | 202 |

- Elde kalan okey 101 puan sayılır. Elde kalan sahte okey, okeyin temsil ettiği taşın puanını alır.
- Elde kalan taşlar hesaplanırken taşların oluşturabileceği perler dikkate alınmaz; hepsi tek tek toplanır.

* **Aşım cezası:** açmış bir oyuncunun 3.1'e göre hesaplanan cezası (çift açanda elde kalan × 2) 202'yi geçerse +101 ek ceza yer. Örn. çift açan oyuncunun elinde 101'den fazla puan kalırsa. Ek ceza 3.2 çarpanlarından etkilenmez.

### 3.2 Çarpanlar

Bitiş şekli, biten oyuncu **dışındaki** herkesin cezasını ve biten oyuncunun ödülünü çarpar:

| Bitiş şekli | Çarpan |
| --- | --- |
| Seriyle açıp normal bitiş | ×1 |
| Çiftle açıp bitiş | ×2 |
| Okeyle bitiş (son atılan taş okey) | ×2 |
| Elden bitiş (seri) | ×2 |
| Elden bitiş (çift) | ×4 |

- Birden fazla koşul varsa çarpanlar birbiriyle çarpılır (örn. çiftle açıp okeyle bitiş = ×4; çift elden okeyle bitiş = ×8). Üst sınır yoktur.
- Örnek: çiftle açan oyuncu bittiğinde, hiç açmamış oyuncu 202 × 2 = **404** yer; biten oyuncu -101 × 2 = -202 alır.
- Çarpan, 3.3'teki oyun içi cezalara uygulanmaz.

### 3.3 Oyun içi cezalar

Oyun sırasında anında yazılır, el sonu puanına eklenir:

| İhlal | Ceza |
| --- | --- |
| Yandan alınan taşı aynı tur kullanmamak (taş geri konur; K10 açıksa ceza yok) | +101 |
| İşlek taşı atmak | +101 |
| Okeyi atmak (bitiş hariç) | +101 |
| Okeyi karşı takıma çaldırmak (2.6) | +101, okeyi indiren takıma (tekli modda oyuncuya) |

Oyun içi cezalar, çiftle açmış olmak dahil hiçbir çarpandan etkilenmez. Opsiyonel kuralların cezaları (K2, K5, K9) kendi bölümlerinde tanımlıdır.

### 3.4 Oyun uzunluğu

- Oyun, masa kurulurken seçilen sayıda elden oluşur (5, 7, 9 veya 11 el; varsayılan 9).
- Son elden sonra toplam cezası en düşük oyuncu (veya takım) kazanır. Eşitlikte oyun berabere biter.

### 3.5 Eşli mod puanlama

- Takım puanı = iki takım arkadaşının el cezalarının toplamı.
- Bir oyuncu biterse takım arkadaşı, elinde ne kalırsa kalsın **0** ceza yer; biten oyuncu -101 alır (3.2 çarpanlarıyla). Normal bitişte takımın el toplamı -101'dir.
- **Bitiş ödülü (parametre):** (a) biten oyuncu -101 alır; (b) bunun yerine karşı takım +101 yer. İkisi aynı mantık; masa kurucu seçer.

## 4. Opsiyonel kurallar (on/off)

Her kural bağımsız bir modüldür: kimliği (K1, K2…), varsayılan durumu (açık/kapalı), varsa parametreleri ve temel kuralın hangi maddesini değiştirdiği tanımlanır. Masa kurucu kuralları tek tek açar; açık kurallar oyuncular masaya oturmadan önce herkese gösterilir.

| Kimlik | Kural | Varsayılan | Değiştirdiği madde |
| --- | --- | --- | --- |
| K1 | İlk tur yandan almak yok | Kapalı | 2.2 |
| K2 | Yandan açtırma cezası | Kapalı | 3.3 |
| K3 | Göstergenin eşi çiftte joker | Kapalı | Sözlük, 2.4, 2.5, 2.6 |
| K4 | Katlamalı açma | Kapalı | 2.3, 2.4 |
| K5 | Çifte gitme deklarasyonu | Kapalı | 2.2, 2.4, 3.1, 3.2 |
| K6 | Yüksek açılış bonusu | Kapalı | yeni |
| K7 | Üçlü sayma (mod 3) | Kapalı | el değeri gösterimi |
| K8 | Çalınan okeyi saklama | Kapalı | 2.6 |
| K9 | Manuel işlek/okey okuma | Kapalı | 2.8, 2.9, 3.3 |
| K10 | Cezasız iade | Kapalı | 2.2, 3.3 |

### K1 — İlk tur yandan almak yok

- **Tanım:** Her elin ilk tam turunda (ilk 4 atış) atılan taşlar yandan alınamaz; herkes desteden çeker.
- İlk 4 atıştan sonra yandan alma normal kurallara (2.2) döner.
- Maçtaki her elde geçerlidir.

### K2 — Yandan açtırma cezası

- **Tanım:** Bir oyuncu, sol komşusunun attığı taşı yandan alıp o tur açarsa, **taşı atan oyuncu** anında ceza yer.
- **Ceza (K2'nin kendi parametreleri):** yandan alınan taşın puanı × 10 (seriyle açılış) veya × 20 (çiftle açılış). ×20, 3.2'deki çift çarpanından gelmez; K2'ye özgü sabit bir değerdir.
- Örnekler: 10 alınıp seriyle açıldı → atan 100 yer; 7 alınıp çiftle açıldı → atan 140 yer.
- Serbest taktik örneği: sol komşu "ilk turda açamaz" diye yüksek bir 7 atar. Elinde 4 çift olan oyuncu 7'yi alır, okeyle veya (K3 açıksa) göstergenin eşiyle çift yapar ve 5 çiftle açar → atan 140 yer.
- Oyun içi cezadır (3.3): anında yazılır, hiçbir çarpandan etkilenmez.
- Sadece açılış turunda geçerlidir; açmış oyuncunun sonradan yandan alıp indirmesi cezasızdır.
- Sahte okey alındıysa temsil ettiği taşın puanı kullanılır.
- Çifte giden oyuncuya (K5) da uygulanır; sadece açtığı turda yandan aldığı taş sayılır.

### K3 — Göstergenin eşi çiftte joker

- **Tanım:** Göstergenin oyundaki eşi (gösterge ile aynı renk ve sayıdaki ikinci taş), **sadece çift oluştururken** joker gibi davranır: herhangi bir taşla çift sayılır. Örnek: gösterge eşi + kırmızı 7 geçerli bir çifttir.
- Açılışta 5 çift barajına (K4 açıksa katlamalı barajına) dahildir; açtıktan sonra yeni çift indirmede de kullanılabilir (2.5).
- Perlerde joker değildir; orada normal taş olarak kullanılır.
- Okeyin aksine, göstergenin eşiyle yapılmış çiftten gösterge eşi **alınamaz** (2.6).
- Yanına hangi taşın konacağını oyuncu seçer; el sonu cezasını düşürmek için elindeki en yüksek taşı koymak mantıklıdır. Okeyle eşleştirmek teknik olarak serbesttir, ama anlamsızdır.

### K4 — Katlamalı açma

- **Tanım:** Masada bir oyuncu açtıktan sonra, sonra açacak her oyuncunun barajı yükselir.
- **Seri:** yeni baraj = o ana kadar yapılmış en yüksek seri açılışın toplamı + 1. Örn. ilk açan 112 ile açtıysa sonraki en az 113 ile açmalıdır. K7 gösterimiyle: 35 yan 1 (106) açıldıysa sonraki en az 35 yan 2 (107) ile açar.
- **Çift:** yeni baraj = o ana kadar yapılmış en yüksek çift açılışın çift sayısı + 1. Örn. ilk çift açan 5 çiftle açtıysa sonraki en az 6 çiftle açmalıdır.
- Seri ve çift zincirleri birbirinden bağımsızdır.
- **Kapalıyken (katlamasız):** baraj her zaman 101 / 5 çifttir.

### K5 — Çifte gitme deklarasyonu

- **Tanım:** Henüz açmamış bir oyuncu, herhangi bir turunda "çifte gidiyorum" diye deklare edebilir. Deklarasyon tüm masaya görünür ve geri alınamaz.
- **Etkileri (deklare eden oyuncu için, el boyunca):**
  - Yandan istediği kadar taş alabilir; aldığı taşı aynı tur kullanma zorunluluğu (2.2) ve cezası kalkar. Bu, açtıktan sonra da geçerlidir: oyunu uzatmak için soldan çekmeye devam edebilir.
  - Sadece çiftle açabilir; seri ile açamaz.
  - Attığı taşlar sağ komşusu tarafından yandan **alınamaz** (açtıktan sonra da). İstisna: sağ komşu da çifte gidiyorsa alabilir.
  - El sonunda açamamışsa ceza 202 yerine **404**'tür. 3.2 çarpanları buna da uygulanır: biri çiftle biterse 404 × 2 = **808**.
  - Açtıktan sonra yandan alıp şansa bir taş daha indirirse ceza yazılmaz (K2 sadece açılış turunda geçerlidir).
- K2 açıksa çifte giden oyuncunun açılış turuna da uygulanır (geçici karar, ileride gözden geçirilecek).

### K6 — Yüksek açılış bonusu

- **Tanım:** Seriyle **150 veya üstü** toplamla, ya da çiftle **7 veya daha fazla** çiftle açan oyuncu bonus alır.
- **Bonus (parametre, iki mod):** (a) açan oyuncu anında -101 alır; (b) diğer oyuncular +101 yer (eşlide karşı takım, tekli modda diğer üç oyuncunun her biri). Masa kurucu birini seçer.
- Oyun içi puandır; el sonu çarpanlarından (3.2) etkilenmez.
- Eşik sabittir: K4 barajı yükseltse de bonus eşiği 150 / 7 çift kalır. Aynı elde birden fazla oyuncu bonus alabilir (örn. çift açılışlar 5 → 7 → 8: ikinci ve üçüncü açan bonus alır).

### K7 — Üçlü sayma (mod 3)

- **Tanım:** Oyuncunun elindeki taşların puan toplamı ve açılış değerleri 3'lük gruplar + kalan olarak gösterilir. Amaç, eldeki değeri kolay okumaktır.
- **Formül:** n puan → "q yan r"; q = n'nin 3'e bölümü (tam kısım), r = n mod 3. Kalan 0 ise sadece q yazılır.
- Örnekler: 101 → 33 yan 2; 125 → 41 yan 2; 106 → 35 yan 1; 99 → 33.
- Puan değerleri, cezalar ve puan tablosu değişmez; normal sayılarla yazılır.

### K8 — Çalınan okeyi saklama

- **Kapalıyken (varsayılan):** yerden çalınan okey (2.6) aynı tur kullanılmak zorundadır.
- **Açıkken:** çalınan okey elde saklanabilir. El sonunda elde kalırsa 101 ceza sayılır (3.1).

### K9 — Manuel işlek/okey okuma

- **Kapalıyken (varsayılan):** motor işlek taş veya okey atımını otomatik algılar ve +101 yazar.
- **Açıkken:** ceza otomatik yazılmaz. Böyle bir taş atıldığında rakip takıma bir **"İŞLEK!"** butonu gösterilir. Rakip takımdan biri, sıradaki oyuncu taş çekmeden önce butona basarsa +101 yazılır; sıradaki oyuncu taş çektiği anda fırsat kapanır.
- Ceza yazılırsa (her iki modda) o taş yandan alınamaz (2.8). Basılmazsa ceza yazılmaz ve taş normal şekilde yandan alınabilir.
- Amaç: oyunu kızıştırmak, dikkat ödüllendirmek.
- Tekli modda atan oyuncu dışındaki herkes basabilir; ceza her durumda taşı atan oyuncuya yazılır. Haksız basmanın (taş aslında işlek değilse) puan cezası yoktur; basan oyuncunun bir sonraki tur süresi 5 sn kısalır (2.9).

### K10 — Cezasız iade

- **Kapalıyken (varsayılan):** yandan alıp aynı tur kullanamayan oyuncu +101 yer ve taşı geri koyar (2.2).
- **Açıkken:** oyuncu ceza yemez, sadece taşı geri koyar.
- Her iki modda taş oyuncunun elinde kalmaz.

### Kural etkileşimleri

- K1 + K5: çifte giden oyuncu da ilk tur yandan alamaz (K1 önceliklidir).
- K2 + K5: K2 sadece çifte gidenin açılış turunda geçerlidir; sonrasında yandan alıp indirmek cezasızdır.
- K2 + K3: yandan alınan taş göstergenin eşiyle çift yapılarak açılışta kullanılırsa K2 çift cezası (×20) uygulanır.
- K3 + K4: göstergenin eşiyle yapılan çift, katlamalı çift barajındaki çift sayısına dahildir.
- K4 + K6: bonus eşiği sabittir; aynı elde birden fazla oyuncu bonus alabilir.
- K4 + K7: katlamalı baraj da "q yan r" gösterimiyle gösterilir.
- K5 + K10: çifte giden oyuncu için iade kuralı zaten uygulanmaz.
- K9 + 2.2: cezası yazılmayan işlek veya okey yandan alınabilir; yazılan alınamaz.
- Yeni kural eklerken aynı şablon kullanılmalı: tanım, parametreler, örnek, değiştirdiği madde, diğer kurallarla etkileşim.
