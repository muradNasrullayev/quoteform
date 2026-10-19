# Quoteform — Pulsuz Çox-addımlı Təklif Kalkulyatoru (WordPress plugin)

Qiymət/təklif hesablayan, şərti məntiqli, çox-addımlı forma qurucusu.
**Tam pulsuzdur** — pro versiya, addon satışı, lisenziya və hosted xidmət yoxdur.
Booknetic və digər FSCode məhsulları ilə heç bir kod və ya brend əlaqəsi yoxdur.

**Dil:** Azərbaycanca (danışıq və sənədləşdirmə), İngiliscə (kod, commit, identifikator).

---

## VACİB: Testləri necə qaçırmaq lazımdır

**Bu maşında host `php` və `composer` YOXDUR.** Docker sarğıları istifadə olunur:

```bash
./bin/phpunit                       # PHP 8.2
QF_PHP=php:7.4-cli ./bin/phpunit    # PHP 7.4 — pluginin elan etdiyi MİNİMUM, həmişə yoxla
./bin/phpunit --filter LexerTest    # filtrli qaçış
./bin/composer install              # asılılıqlar
npm test                            # Jest (node/npm nativ işləyir)
```

`composer test` və `phpunit` birbaşa İŞLƏMİR. Sarğıları dəyişmə.

### PHPUnit-in bilinən qüsuru — araşdırma

PHPUnit 9.6.36 bu mühitdə **bütün istisna mesajlarını** bu zibil sətirlə əvəz edir:

```
syntax error, unexpected identifier "SERIALIZATION_FORMAT_USE_UNSER...", expecting "="
```

Həmçinin assertion xətalarının detal bölməsini çap etmir. Bu təsdiqlənmiş alət qüsurudur
(təmiz, ayrıca layihədə üç PHP image-ində təkrar istehsal olunub) — **sizin kodunuzla bağlı deyil.**
Köhnə versiyaya enmək təhlükəsizlik xəbərdarlığına görə bloklanır; 10.x isə PHP 7.4 dəstəyini itirir.

Nəticə: test düşəndə səbəbi PHPUnit-dən görməyəcəksiniz. Əsl səbəbi ayrıca tapın:

```bash
docker run --rm -v "$PWD":/app -w /app php:8.2-cli php -r 'require "vendor/autoload.php"; var_dump(...);'
docker run --rm -v "$PWD":/app -w /app php:8.2-cli php -l includes/Engine/Faylım.php
```

PHP **fatal** xətaları bu qüsurdan təsirlənmir, normal çap olunur.

---

## WordPress dev mühiti (Docker)

Plugini real WordPress-də görmək üçün:

```bash
make up       # WordPress + MySQL qaldırır  → http://localhost:8083
make setup    # təmiz WP qurur və plugini aktivləşdirir (bir dəfə)
make down     # dayandırır
make clean    # konteynerləri VƏ volume-ları silir (DB itir)
```

Admin: `http://localhost:8083/wp-admin` — `admin` / `admin`
Portlar: WP `8083`, MySQL `3319` (maşındakı digər stack-lərlə toqquşmur).

Faydalı əmrlər:

```bash
make site ARGS="plugin list"      # ixtiyari wp-cli əmri
make site ARGS="eval '...'"       # WordPress daxilində PHP icra et
make logs                         # apache loglarını izlə
make shell                        # wp konteynerində bash
```

**Vahid testlər bu mühiti TƏLƏB ETMİR** — mühərrik çərçivədən asılı deyil və testlər
birdəfəlik PHP konteynerlərində qaçır:

```bash
make test      # PHP 8.2
make test74    # PHP 7.4 (minimum)
make js        # Jest
make check     # hər dördü — commit-dən əvvəl bunu işlət
```

### Təsdiqlənmiş vəziyyət

Plugin real WordPress 7.1 / PHP 8.2-də təmiz aktivləşir: fatal yoxdur, `debug.log`
ümumiyyətlə yaradılmır (bir dənə də xəbərdarlıq yoxdur), və PSR-4 autoloader WordPress
kontekstində işləyir — `Expression::evaluate()` və `CalculationGraph::evaluateAll()`
wp-cli `eval` vasitəsilə düzgün nəticə qaytarır.

### Buraxılış qeydi

`bin/`, `docker-compose.yml`, `Makefile`, `tests/`, `.superpowers/` — bunlar dev alətləridir
və wp.org-a göndəriləcək zip-də **olmamalıdır**. Buraxılış paketi hazırlayan skript
(Plan 03) bunları istisna etməlidir.

### Plan 02 üçün boşluq

Hazırkı mühit plugini işlətmək üçün kifayətdir, lakin **WordPress inteqrasiya testləri
üçün test-lib qurulmayıb.** Plan 02 CPT, REST və sxem validasiyası gətirəndə
`wordpress-tests-lib` əsaslı ayrıca `php` servisi lazım olacaq (stockradar layihəsindəki
`docker/php` + `bin/setup-tests.sh` nümunəsinə bax). Spec §19-un tələb etdiyi Playwright
E2E ssenarisi də həmin mərhələdə qurulmalıdır.

---

## VACİB: Paritet qaydası — bu layihənin əsas vədi

İfadə mühərriki **qəsdən iki dəfə** yazılıb:

- **PHP** (`includes/Engine/`) — serverdə, **səlahiyyətli qiyməti** hesablayır
- **JavaScript** (`frontend-src/engine/`) — brauzerdə, müştərinin izlədiyi **canlı totalı** verir

Səbəb: müştəri qiymətin dərhal dəyişdiyini görməlidir, amma server brauzerin göndərdiyi
rəqəmə etibar etməməlidir. **Client heç vaxt total göndərmir** — server sıfırdan yenidən hesablayır.

Risk: iki mühərrik bir-birindən ayrılsa, müştəri ekranda bir qiymət görür, emailə başqası düşür.

İki fixture faylı bunun qarşısını alır və **hər iki dildən keçirilir**:

- `tests/fixtures/expressions.json` — 85 hal
- `tests/fixtures/calculations.json` — 16 hal

**Qaydalar:**

1. Mühərrikə hər yeni funksiya, operator və ya davranış əlavə edən dəyişiklik fixture halı əlavə etməlidir.
2. Bir tərəfi dəyişəndə **mütləq** digərini də dəyiş və hər iki dəsti qaçır.
3. Fixture halının gözlənilən dəyərini testi keçirmək üçün **heç vaxt dəyişmə** — uyğunsuzluq
   qapının istehsal etmək üçün var olduğu siqnaldır, aradan qaldırılası maneə deyil.
4. `eval()` heç bir yerdə, heç bir dildə.
5. `includes/Engine/` və `frontend-src/engine/` WordPress-ə istinad etmir — nə `WP_`, nə `wp_`,
   nə `$wpdb`, nə `add_action`. Mühərrik çərçivədən asılı deyil.

### Artıq tapılmış dörd divergensiya (hamısı düzəlib və fixture ilə kilidlənib)

Bunlar sizə harada axtarmağı göstərir:

| # | Nə idi |
|---|---|
| 1 | PHP siyahıları `==` (boş), JS `===` (sərt) ilə müqayisə edirdi |
| 2 | PHP rəqəmə oxşayan hesablama açarında **fatal** verirdi (`(int)` çevrilməsi) |
| 3 | PCRE-nin `$`-ı sonuncu sətir sonunu qəbul edir, JS-inki yox → `"5\n"` fərqli davranırdı |
| 4 | Non-finite dəyərlər (`"1e400"`) rədd edilmirdi; `min`/`max` iki dildə fərqlənirdi |

Naxış aydındır: fərqlər **kənar hallarda** yaşayır — regex anchorları, non-finite ədədlər,
konteyner dəyərləri, JS obyektinin açar sıralaması.

---

## Texnologiya və konvensiyalar

PHP 7.4+ (hard minimum), WordPress 6.0+, PSR-4, PHPUnit 9.6; JavaScript ESM, Jest 29, Babel.

| Nə | Dəyər |
|---|---|
| PHP namespace | `Quoteform\` (kök: `includes/`) |
| Prefiks | `qform_` (funksiya, hook, option, sabit, DB cədvəli) |
| CSS prefiksi | `.quoteform_` |
| Text domain | `quoteform` |
| PHP metod | camelCase; sinif PascalCase; bir sinif = bir fayl |
| JS | ESM, camelCase; uzantısız nisbi importlar (`from './errors'`) |
| wp.org slug | `quoteform` |

**Test köməkçisi adlandırarkən diqqət:** `PHPUnit\Framework\TestCase`-in üzv adlarını işlətmə —
`run`, `count`, `toString`, `getName`, `fail`, `setUp`, `tearDown`, `runBare`, `onNotSuccessfulTest`.
`private function run()` bütün dəsti fatal xəta ilə dayandırır.

---

## Vəziyyət

**Plan 01 (ifadə mühərriki) tamamlanıb.** PHPUnit 183 test / 423 assertion (PHP 8.2 və 7.4),
Jest 171 test / 9 dəst — hamısı yaşıl.

**Commit YOXDUR.** Branch `feature/expression-engine`, 54 izlənməyən fayl.
Bu, istifadəçinin açıq qərarı idi (icra zamanı commit edilməsin). Git qoruması hələ yoxdur.

### Açıq iş

- **R9 (tövsiyə: əvvəlcə bunu düzəlt) — canlı paritet pozuntusu, bir sətir.**
  `round(1.5, 18446744073709551616)` PHP-də `2.0`, JS-də `invalid_precision` verir.
  Səbəb: `Functions::call()` precision-u `(int)` ilə çevirir və PHP həddi aşan float üçün `0` qaytarır,
  yəni `MAX_PRECISION` qoruyucusuna `0` çatır. Düzəliş: `(int)` çevrilməsindən **əvvəl** float-ı
  `MAX_PRECISION` ilə tutuşdur. Fixture halı əlavə et.
- **R10 — paritet qorunur, doğruluq yox.** Yuvarlaqlaşdırma epsilonu nisbidir və `|scaled| ≥ 5e14`-də
  0.5-i keçir: `round(999999999.99, 6)` hər iki dildə `999999999.990001` verir. Müştəri ekranı ilə
  email arasında fərq yaratmır. Miqyasa həssas alternativ sinfi tamamilə aradan qaldırar.
- İki kod şərhi (`Functions.php` epsilon və precision haqqında) R9/R10-dan sonra düzəldilməlidir —
  hazırda sahib olmadıqları təhlükəsizliyi iddia edirlər.

### Növbəti planlar

- **Plan 02** — CPT `quoteform`, sxem validasiyası, REST endpoint-ləri, React builder
- **Plan 03** — frontend renderer, göndərmə, entry saxlama, email, save & resume

Plan 02-yə köçürüləsi qərarlar: xəta mövqeyi konvensiyası (PHP bayt, JS UTF-16 — kod nöqtəsi seçilməlidir);
sxem validasiyası `__proto__`/`constructor` açarlarını rədd etməlidir; ifadə ölçüsü/dərinlik həddi;
`Expression::clearCache()` CSV eksport dövründə çağırılmalıdır.

---

## Sənədlər

| Fayl | Nə var |
|---|---|
| `docs/superpowers/specs/2026-09-15-quoteform-design.md` | Dizayn spesifikasiyası — **bağlayıcı avtoritet** |
| `docs/superpowers/plans/2026-09-15-quoteform-01-engine.md` | Plan 01, 15 task, hər faylın tam kodu ilə |
| `.superpowers/sdd/2026-09-15-quoteform-01-engine/progress.md` | **İcra ledger-i:** 12 qərar, bütün review tapıntıları, hazır commit mesajları |
| `.superpowers/sdd/.../task-*-report.md` | Hər task-ın hesabatı, TDD sübutu ilə |

Spec ilə plan ziddiyyət təşkil edərsə, **spec qalib gəlir**.
