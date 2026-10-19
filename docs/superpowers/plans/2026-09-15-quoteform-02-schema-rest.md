# Quoteform Plan 02 — Sxem, Saxlama və REST

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forma sxeminin WordPress-də yaradılması, sərt validasiyası, saxlanılması və REST üzərindən oxunub-yazılması — builder UI-siz, tam test edilə bilən server təbəqəsi.

**Architecture:** Forma `quoteform` CPT-sidir, sxem isə `_qform_schema` post meta-sında JSON kimi yaşayır. Yazma yolunun mərkəzi `SchemaValidator`-dur: o, sxemi tip-tip yoxlayır, ifadələri Plan 01-in mühərriki ilə **kompilyasiya edərək** sınayır və dövri istinadları `CalculationGraph` ilə tutur — yəni sınıq forma heç vaxt bazaya düşmür. REST controller yalnız nazik örtükdür: icazə yoxlayır, validatoru çağırır, nəticəni qaytarır.

**Tech Stack:** PHP 7.4+, WordPress 6.2+, WordPress REST API, PHPUnit 9.6 (vahid) + `wordpress-tests-lib` (inteqrasiya), Docker.

**Spec:** `docs/superpowers/specs/2026-09-15-quoteform-design.md` — xüsusilə §6 (data modeli), §10 (data axını, REST, capability), §14 (xəta idarəetməsi), §15 (təhlükəsizlik).

**Əvvəlki plan:** `docs/superpowers/plans/2026-09-15-quoteform-01-engine.md` — ifadə mühərriki. Tamamlanıb və review-dan keçib.

## Global Constraints

Bu bölmə hər task-ın tələblərinə avtomatik daxildir.

- PHP minimum: **7.4**. WordPress minimum: **6.2** — bu döşəmə bütöv-branch düzəliş raundunda 6.0-dan qaldırıldı, çünki builder `createRoot` işlədir (spec §5.1).
- PHP namespace: `Quoteform\`. PSR-4 kökü: `includes/`.
- Prefiks: `qform_` (funksiya, hook, option, sabit, meta açarı, capability). CSS: `.quoteform_`. Text domain: `quoteform`.
- PHP metod adlandırması: **camelCase**. Sinif adları: PascalCase. Bir sinif = bir fayl, fayl adı sinif adı ilə eyni.
- **`includes/Engine/` TOXUNULMAZ.** Bu plan mühərriki yalnız istifadə edir. Mühərrikdə dəyişiklik lazım görünsə — dayan və eskalasiya et.
- Mühərrikdən kənar kod WordPress-ə sərbəst istinad edə bilər; `Engine/` isə çərçivədən azad qalır.
- Bütün istifadəçi mətnləri `quoteform` text domain ilə tərcümə olunur.
- Bütün DB sorğuları `$wpdb->prepare` ilə; bütün REST yazma əməliyyatları capability yoxlaması tələb edir.
- **Commit qaydası:** plan commit addımlarını ehtiva edir, lakin icra zamanı `git commit` yalnız istifadəçinin açıq icazəsi ilə edilir. İcraçı commit mesajını hazırlayıb göstərir və dayanır.

### Test əmrləri (bu maşında host PHP YOXDUR)

| Nə | Əmr |
|---|---|
| Vahid testlər (WP-siz) | `make test` / `make test74` |
| **İnteqrasiya testləri (WP ilə)** | `make itest` — Task 1-də qurulur |
| JS | `make js` |
| Hamısı | `make check` |
| WP mühiti | `make up`, `make setup` → http://localhost:8083 |

PHPUnit 9.6.36 bu mühitdə bütün **istisna mesajlarını** `syntax error, unexpected identifier "SERIALIZATION_FORMAT_USE_UNSER...", expecting "="` sətri ilə əvəz edir və assertion detallarını çap etmir. Təsdiqlənmiş alət qüsurudur — araşdırma. PHP **fatal** xətaları normal çap olunur. RED sübutunda alətin hərfi çıxışını sitat gətir, sonra əsl səbəbi ayrıca göstər.

---

## Bu planın verdiyi qərarlar

Spec bunları açıq yazmır; plan onları qərara alır və səbəbini qeyd edir.

### Q1 — Açar formatı: `^[a-z][a-z0-9_]{0,63}$`

Sahə və hesablama açarları kiçik hərflə **başlamalıdır**, sonra hərf/rəqəm/alt xətt, maksimum 64 simvol.

Səbəbi sadəcə səliqə deyil. Plan 01-də iki real qüsur məhz açar formatından doğmuşdu: PHP rəqəmə oxşayan massiv açarlarını `int`-ə çevirir (R8 — fatal xəta), JavaScript obyekti isə onları yenidən sıralayır (R5). Açarın hərflə başlamasını tələb etmək bu sinfi **strukturca mümkünsüz** edir — istifadəçi girişindən `"1"` və ya `"2"` açarı heç vaxt yarana bilməz.

Hərflə başlama həmçinin `__proto__` açarını bloklayır. Əlavə olaraq qadağan siyahısı: `constructor`, `prototype`, `hasownproperty`, `tostring`, `valueof`.

### Q2 — Sahə və hesablama açarları toqquşa bilməz

Mühərrik üstələməni dəstəkləyir (hesablama eyni adlı sahəni üstələyir, Plan 01-də fixture ilə kilidlənib) və bu, kitabxana səviyyəsində belə qalır. Lakin **sxemdə** belə toqquşma istifadəçi üçün çaşdırıcıdır: iki fərqli şey eyni ada sahib olur və hansının qalib gəldiyi görünmür. Validator bunu rədd edir.

### Q3 — `total` hesablaması məcburidir

Spec §6.2: `total` qorunmuş açardır və entry cədvəlindəki `total` sütunu ondan gəlir. Validator sxemdə `total` adlı hesablamanın mövcudluğunu tələb edir.

### Q4 — Xəta mövqeləri **UTF-16 kod vahidi** kimi qaytarılır

Mühərrikin lexer-i bayt ofseti verir (PHP sətirləri bayt massividir). Bu ofsetin yeganə istehlakçısı builder-dir və o, JavaScript-dir — JS sətir indeksləri isə UTF-16 kod vahididir. Bayt ofsetini birbaşa ötürsək, qeyri-ASCII simvol daşıyan istənilən ifadədə kursor səhv yerə düşər.

Ona görə çevirmə **REST sərhədində** aparılır: `Support\TextPosition::byteToUtf16()`. Bu, yekun review-un #7 tapıntısına verilən cavabdır.

### Q5 — İfadə mənbəyi ≤ 1000 simvol

Plan 01-in yekun review-u göstərdi ki, heç bir dil ifadə ölçüsünü məhdudlaşdırmır: ~5000 terminli zəncir JavaScript-də `RangeError`, PHP-də isə 100 000-də tutulmayan memory fatal verir — hər ikisi mühərrikin xəta kontraktından kənardır.

Bu planda hədd **saxlama anında** qoyulur, mühərrikə toxunmadan: 1000 simvol. Real formula bundan qat-qat qısadır, müşahidə olunan hər iki çökmə isə bu həddin xeyli yuxarısındadır.

### Q6 — `settings.decimals` 0..6 aralığındadır

`Functions::MAX_PRECISION` 6-dır (Plan 01, R9). Sxem bundan böyük dəqiqlik tələb edərsə, forma işləyəndə `invalid_precision` atardı. Validator bunu saxlama anında tutur.

---

## Fayl Strukturu

| Fayl | Məsuliyyəti |
|---|---|
| `includes/Plugin.php` | Bootstrap: hook qeydiyyatı, servislərin qurulması |
| `includes/Support/Capabilities.php` | Capability sabitləri, rola vermə/geri alma |
| `includes/Support/Activation.php` | Aktivasiya/deaktivasiya hook-ları |
| `includes/Support/TextPosition.php` | Bayt ofseti → UTF-16 kod vahidi çevrilməsi |
| `includes/Forms/FormPostType.php` | `quoteform` CPT qeydiyyatı |
| `includes/Forms/ValidationResult.php` | Xəta yığımı: kod + yol + mesaj |
| `includes/Forms/KeyRules.php` | Açar formatı və qadağan siyahısı (Q1) |
| `includes/Forms/SettingsValidator.php` | `settings` bloku |
| `includes/Forms/FieldValidator.php` | Bir sahə, tipinə görə |
| `includes/Forms/StepValidator.php` | Addımlar və sahə istinadları |
| `includes/Forms/CalculationValidator.php` | İfadə kompilyasiyası, dövr, `total`, uzunluq |
| `includes/Forms/RuleValidator.php` | Şərti məntiq qaydaları |
| `includes/Forms/SchemaValidator.php` | Yuxarıdakıları birləşdirən orkestrator |
| `includes/Forms/SchemaRepository.php` | Post meta-dan oxuma/yazma, default-lar |
| `includes/Rest/FormsController.php` | Beş REST marşrutu |
| `tests/php/Forms/*Test.php` | Vahid testlər (WP-siz işləyənlər) |
| `tests/integration/*Test.php` | WordPress tələb edən testlər |
| `docker/php/Dockerfile` | İnteqrasiya testləri üçün PHP + MySQL client |
| `bin/install-wp-tests.sh` | `wordpress-tests-lib` quraşdırıcısı |

**Sərhəd qaydası:** validator siniflərinin heç biri WordPress-ə istinad etmir (`__()` istisna olmaqla) — onlar saf massiv → `ValidationResult` funksiyalarıdır və WP-siz vahid testlərlə örtülür. WordPress yalnız `Plugin`, `Activation`, `FormPostType`, `SchemaRepository` və `FormsController` səviyyəsində görünür.

Bu, Plan 01-in dərsidir: mühərriki çərçivədən ayırmaq testləri sürətli və dəqiq etdi. Validasiya məntiqi eyni müalicəni alır.

---

## Sxem xəta kodları

Validator mesaj yox, **kod** qaytarır (spec §14 və mühərrikin öz konvensiyası ilə eyni). Builder onları tərcümə edir.

| Kod | Nə vaxt |
|---|---|
| `invalid_type` | Gözlənilən tip deyil (massiv əvəzinə sətir və s.) |
| `missing_field` | Məcburi açar yoxdur |
| `unknown_key` | Sxemdə tanınmayan açar |
| `invalid_key_format` | Q1-ə uyğun deyil |
| `reserved_key` | Qadağan siyahısındadır |
| `duplicate_key` | Təkrarlanır |
| `key_mismatch` | Sahənin daxili `key`-i saxlandığı xəritə açarı ilə üst-üstə düşmür |
| `key_collision` | Sahə və hesablama eyni adı daşıyır (Q2) |
| `unknown_reference` | Mövcud olmayan sahəyə/addıma istinad |
| `missing_total` | `total` hesablaması yoxdur (Q3) |
| `expression_too_long` | 1000 simvolu keçir (Q5) |
| `invalid_expression` | Mühərrik kompilyasiya edə bilmir; `context.engine_code` mühərrikin öz slug-ını daşıyır |
| `circular_reference` | Hesablamalar dövrə təşkil edir |
| `out_of_range` | Ədədi dəyər icazə verilən aralıqdan kənardır |
| `invalid_option` | `select`/`radio`/`checkbox` seçimi yanlışdır |
| `empty_collection` | Boş ola bilməyən massiv boşdur |

---
## Task 1: WordPress inteqrasiya test mühiti

Plan 01-in bütün kodu WordPress-siz işləyirdi, ona görə vahid testlər kifayət edirdi. Bu plan CPT, post meta və REST gətirir — onları yalnız işlək WordPress-də yoxlamaq olar.

**Files:**
- Create: `docker/php/Dockerfile`
- Create: `bin/install-wp-tests.sh`
- Create: `tests/integration/bootstrap.php`
- Create: `phpunit-integration.xml`
- Modify: `tests/php/bootstrap.php` (WordPress `__()` üçün polyfill)
- Modify: `composer.json`, `composer.lock` (`yoast/phpunit-polyfills` dev asılılığı)
- Modify: `docker-compose.yml` (yeni `php` servisi)
- Modify: `Makefile` (`isetup`, `itest` hədəfləri)
- Test: `tests/integration/SmokeTest.php`

**Interfaces:**
- Consumes: mövcud `docker-compose.yml`-dakı `db` servisi (MySQL 8.0, root/root).
- Produces: `make isetup` (bir dəfə qaçırılır, `wordpress-tests-lib` quraşdırır), `make itest` (inteqrasiya dəsti). Vahid dəst (`make test`) toxunulmur və WP-siz qalır.

- [ ] **Step 1: `docker/php/Dockerfile` yarat**

```dockerfile
FROM php:8.2-cli

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		default-mysql-client subversion unzip git \
	&& rm -rf /var/lib/apt/lists/* \
	&& docker-php-ext-install mysqli

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
```

- [ ] **Step 2: `docker-compose.yml`-ə `php` servisi əlavə et**

`cli` servisindən SONRA, `volumes:` blokundan ƏVVƏL əlavə et:

```yaml
  php:
    build: ./docker/php
    depends_on:
      db:
        condition: service_healthy
    environment:
      WP_TESTS_DIR: /wp/wordpress-tests-lib
      WP_CORE_DIR: /wp/wordpress
    volumes:
      - ./:/app
      - wp_test:/wp
    working_dir: /app
```

Və `volumes:` blokuna `wp_test:` əlavə et, belə olsun:

```yaml
volumes:
  db_data:
  wp_data:
  wp_test:
```

- [ ] **Step 3: `bin/install-wp-tests.sh` yarat**

```bash
#!/usr/bin/env bash
# WordPress core + test kitabxanasını `php` konteynerindəki /wp altına quraşdırır.
# Bir dəfə qaçırılır: make isetup
set -euo pipefail

DB_NAME="${1:-wordpress_test}"
DB_USER="${2:-root}"
DB_PASS="${3:-root}"
DB_HOST="${4:-db}"
WP_VERSION="${5:-latest}"

WP_CORE_DIR="${WP_CORE_DIR:-/wp/wordpress}"
WP_TESTS_DIR="${WP_TESTS_DIR:-/wp/wordpress-tests-lib}"

if [ "$WP_VERSION" = "latest" ]; then
	# DİQQƏT: `sed 's/.*"version":"..."/` acgözdür və cavabdakı SONUNCU versiyanı tutur —
	# nəticədə "latest" WordPress 4.7-yə çevrilir və PHPUnit 9 ilə uyuşmur.
	WP_VERSION=$(curl -s https://api.wordpress.org/core/version-check/1.7/ \
		| grep -o '"version":"[^"]*"' | head -1 | sed -n 's/.*"\([^"]*\)"$/\1/p')
fi
echo "WordPress $WP_VERSION"

if [ ! -d "$WP_CORE_DIR" ]; then
	mkdir -p "$WP_CORE_DIR"
	curl -sL "https://wordpress.org/wordpress-${WP_VERSION}.tar.gz" \
		| tar --strip-components=1 -zxf - -C "$WP_CORE_DIR"
fi

if [ ! -d "$WP_TESTS_DIR" ]; then
	mkdir -p "$WP_TESTS_DIR"
	svn co --quiet "https://develop.svn.wordpress.org/tags/${WP_VERSION}/tests/phpunit/includes/" \
		"$WP_TESTS_DIR/includes"
	svn co --quiet "https://develop.svn.wordpress.org/tags/${WP_VERSION}/tests/phpunit/data/" \
		"$WP_TESTS_DIR/data"
fi

if [ ! -f "$WP_TESTS_DIR/wp-tests-config.php" ]; then
	curl -sL "https://develop.svn.wordpress.org/tags/${WP_VERSION}/wp-tests-config-sample.php" \
		-o "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s:dirname( __FILE__ ) . '/src/':'${WP_CORE_DIR}/':" "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s/youremptytestdbnamehere/${DB_NAME}/" "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s/yourusernamehere/${DB_USER}/"        "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s/yourpasswordhere/${DB_PASS}/"        "$WP_TESTS_DIR/wp-tests-config.php"
	sed -i "s|localhost|${DB_HOST}|"               "$WP_TESTS_DIR/wp-tests-config.php"
fi

# --skip-ssl: image-dəki MariaDB client MySQL 8.0-ın öz-imzalı sertifikatına qarşı
# sərt TLS tələb edir və onsuz bazanın yaradılması səssizcə uğursuz olur.
mysqladmin create "$DB_NAME" --user="$DB_USER" --password="$DB_PASS" --host="$DB_HOST" --protocol=tcp --skip-ssl 2>/dev/null \
	|| echo "Baza artıq mövcuddur — davam edilir."

echo "Hazırdır. İnteqrasiya testləri: make itest"
```

`chmod +x bin/install-wp-tests.sh` etməyi unutma.

- [ ] **Step 3b: Vahid test bootstrap-ına `__()` polyfill-i əlavə et**

Validator sinifləri istifadəçiyə göstərilən mesajları `__( ..., 'quoteform' )` ilə tərcümə edir,
lakin onların vahid testləri WordPress-siz qaçır — orada `__()` mövcud deyil və testlər
`Call to undefined function` ilə düşər.

`tests/php/bootstrap.php` faylının SONUNA əlavə et:

```php

/**
 * WordPress-in tərcümə funksiyaları üçün minimal polyfill.
 *
 * Validator sinifləri WordPress-dən asılı DEYİL, lakin istifadəçiyə göstərilən
 * mesajları tərcümə edir. Vahid testlər WordPress yükləmədiyi üçün bu funksiyalar
 * burada mövcud olmalıdır. İnteqrasiya testlərində WordPress-in öz versiyaları işləyir.
 */
if ( ! function_exists( '__' ) ) {
	function __( string $text, string $domain = 'default' ): string { // phpcs:ignore
		unset( $domain );

		return $text;
	}
}

if ( ! function_exists( 'esc_html__' ) ) {
	function esc_html__( string $text, string $domain = 'default' ): string { // phpcs:ignore
		unset( $domain );

		return $text;
	}
}
```

Polyfill `function_exists` ilə qorunur, ona görə inteqrasiya mühitində WordPress-in
öz funksiyaları üstün gəlir.

- [ ] **Step 3c: `yoast/phpunit-polyfills` dev asılılığını əlavə et**

Müasir WordPress-in test dəsti PHPUnit 9 altında bu paketi tələb edir; onsuz
`wordpress-tests-lib` bootstrap-ı işə düşmür.

Run: `./bin/composer require --dev yoast/phpunit-polyfills:^1.1`

Bu, `composer.json` və `composer.lock` fayllarını dəyişir.

- [ ] **Step 4: `tests/integration/bootstrap.php` yarat**

```php
<?php
/**
 * WordPress inteqrasiya testləri üçün bootstrap.
 *
 * Vahid testlərdən (tests/php/) fərqlidir: bu, tam WordPress yükləyir,
 * ona görə CPT, post meta, capability və REST marşrutları yoxlanıla bilir.
 */

declare(strict_types=1);

$qform_tests_dir = getenv( 'WP_TESTS_DIR' ) ?: '/wp/wordpress-tests-lib';

if ( ! file_exists( $qform_tests_dir . '/includes/functions.php' ) ) {
	echo "wordpress-tests-lib tapılmadı: {$qform_tests_dir}\n";
	echo "Əvvəlcə `make isetup` qaçır.\n";
	exit( 1 );
}

require_once $qform_tests_dir . '/includes/functions.php';

tests_add_filter(
	'muplugins_loaded',
	static function () {
		require dirname( __DIR__, 2 ) . '/quoteform.php';
	}
);

require $qform_tests_dir . '/includes/bootstrap.php';
```

- [ ] **Step 5: `phpunit-integration.xml` yarat**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="tests/integration/bootstrap.php"
         colors="true"
         convertDeprecationsToExceptions="false"
         failOnWarning="false">
    <testsuites>
        <testsuite name="integration">
            <directory>tests/integration</directory>
        </testsuite>
    </testsuites>
</phpunit>
```

`convertDeprecationsToExceptions` və `failOnWarning` burda qəsdən söndürülüb: WordPress core-un öz deprecation-ları bizim kodumuzla bağlı deyil və dəsti yalançı şəkildə qırardı. Vahid dəstdə (`phpunit.xml`) hər ikisi açıq qalır.

- [ ] **Step 6: `Makefile`-a hədəflər əlavə et**

`.PHONY` sətrinə `isetup itest` əlavə et, sonra `test74` hədəfindən SONRA:

```makefile
# WordPress test kitabxanasını quraşdırır (bir dəfə, `make up`-dan sonra)
isetup:
	docker compose run --rm php bash bin/install-wp-tests.sh wordpress_test root root db latest

# İnteqrasiya testləri — WordPress TƏLƏB EDİR
itest:
	docker compose run --rm php vendor/bin/phpunit -c phpunit-integration.xml $(ARGS)
```

Və `check` hədəfini yenilə: `check: test test74 js itest`

- [ ] **Step 7: Smoke testini yaz**

`tests/integration/SmokeTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use WP_UnitTestCase;

final class SmokeTest extends WP_UnitTestCase
{
    public function testWordPressIsLoaded(): void
    {
        $this->assertTrue( defined( 'ABSPATH' ) );
        $this->assertTrue( function_exists( 'wp_insert_post' ) );
    }

    public function testPluginBootstrapRan(): void
    {
        $this->assertTrue( defined( 'QFORM_VERSION' ) );
        $this->assertSame( '0.1.0', QFORM_VERSION );
    }

    public function testEngineAutoloadsInsideWordPress(): void
    {
        $this->assertSame(
            507.0,
            \Quoteform\Engine\Expression::evaluate(
                'round({subtotal} * 1.3, 2)',
                [ 'subtotal' => 390.0 ]
            )
        );
    }
}
```

Üçüncü test təsadüfi deyil: Plan 01-in autoloader-i yalnız PHPUnit-in öz bootstrap-ı ilə sınanmışdı. Bu, onun WordPress prosesində də işlədiyini kilidləyir.

- [ ] **Step 8: Mühiti qur və testləri qaçır**

Run:
```bash
docker compose build php
make up
make isetup
make itest
```
Expected: `OK (3 tests, 4 assertions)`.

`make isetup` ilk dəfə bir neçə dəqiqə çəkir (WordPress core + test kitabxanası endirilir). Sonrakı qaçışlarda `wp_test` volume-u sayəsində ani olur.

- [ ] **Step 9: Vahid dəstin toxunulmadığını təsdiqlə**

Run: `make test && make test74 && make js`
Expected: hamısı əvvəlki kimi yaşıl — inteqrasiya mühiti vahid testlərə heç nə etməyib.

- [ ] **Step 10: Commit hazırla**

```bash
git add docker/ bin/install-wp-tests.sh tests/integration/ phpunit-integration.xml docker-compose.yml Makefile
git commit -m "chore: add wordpress integration test harness"
```

---

## Task 2: Capability-lər və aktivasiya

**Files:**
- Create: `includes/Support/Capabilities.php`
- Create: `includes/Support/Activation.php`
- Test: `tests/integration/CapabilitiesTest.php`

**Interfaces:**
- Consumes: heç nə (ilk məhsul kodu).
- Produces:
  - `Quoteform\Support\Capabilities` — sabitlər `MANAGE_FORMS = 'qform_manage_forms'`, `VIEW_ENTRIES = 'qform_view_entries'`, `EXPORT_ENTRIES = 'qform_export_entries'`; statik `all(): string[]`, `grantToAdministrator(): void`, `revokeFromAllRoles(): void`.
  - `Quoteform\Support\Activation` — statik `activate(): void`, `deactivate(): void`.

Spec §10.2: capability-lər `manage_options`-a birbaşa bağlanmır ki, sayt sahibi lazım gəlsə redaktora yalnız entry görmə icazəsi verə bilsin.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/integration/CapabilitiesTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_UnitTestCase;

final class CapabilitiesTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    public function testAllReturnsTheThreeCapabilities(): void
    {
        $this->assertSame(
            [ 'qform_manage_forms', 'qform_view_entries', 'qform_export_entries' ],
            Capabilities::all()
        );
    }

    public function testActivationGrantsEveryCapabilityToAdministrator(): void
    {
        Activation::activate();

        $role = get_role( 'administrator' );

        foreach ( Capabilities::all() as $capability ) {
            $this->assertTrue( $role->has_cap( $capability ), $capability );
        }
    }

    public function testActivationDoesNotGrantToEditor(): void
    {
        Activation::activate();

        $role = get_role( 'editor' );

        foreach ( Capabilities::all() as $capability ) {
            $this->assertFalse( $role->has_cap( $capability ), $capability );
        }
    }

    public function testRevokeRemovesCapabilitiesFromEveryRole(): void
    {
        Activation::activate();
        Capabilities::revokeFromAllRoles();

        $this->assertFalse( get_role( 'administrator' )->has_cap( 'qform_manage_forms' ) );
    }

    public function testGrantIsIdempotent(): void
    {
        Activation::activate();
        Activation::activate();

        $this->assertTrue( get_role( 'administrator' )->has_cap( 'qform_manage_forms' ) );
    }

    public function testDeactivationKeepsCapabilities(): void
    {
        Activation::activate();
        Activation::deactivate();

        $this->assertTrue(
            get_role( 'administrator' )->has_cap( 'qform_manage_forms' ),
            'Deaktivasiya capability-ləri silməməlidir — plugin yenidən aktivləşdirilə bilər.'
        );
    }
}
```

Sonuncu test bir qərarı kilidləyir: deaktivasiya capability-ləri **silmir**. Plugin müvəqqəti söndürülüb yenidən açıla bilər və hər dəfə icazələrin itməsi sayt sahibi üçün gözlənilməzdir. Silinmə yalnız uninstall-da baş verməlidir (Plan 04).

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make itest ARGS="--filter CapabilitiesTest"`
Expected: FAIL — `Class "Quoteform\Support\Capabilities" not found`.

- [ ] **Step 3: `Capabilities` sinfini yaz**

`includes/Support/Capabilities.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Support;

/**
 * Pluginin öz capability-ləri.
 *
 * `manage_options`-a birbaşa bağlanmır (spec §10.2): sayt sahibi redaktora
 * yalnız entry görmə icazəsi verə bilməlidir, forma redaktəsi olmadan.
 */
final class Capabilities
{
    public const MANAGE_FORMS   = 'qform_manage_forms';
    public const VIEW_ENTRIES   = 'qform_view_entries';
    public const EXPORT_ENTRIES = 'qform_export_entries';

    /**
     * @return string[]
     */
    public static function all(): array
    {
        return [ self::MANAGE_FORMS, self::VIEW_ENTRIES, self::EXPORT_ENTRIES ];
    }

    public static function grantToAdministrator(): void
    {
        $role = get_role( 'administrator' );

        if ( ! $role instanceof \WP_Role ) {
            return;
        }

        foreach ( self::all() as $capability ) {
            $role->add_cap( $capability );
        }
    }

    public static function revokeFromAllRoles(): void
    {
        foreach ( wp_roles()->roles as $slug => $unused ) {
            $role = get_role( $slug );

            if ( ! $role instanceof \WP_Role ) {
                continue;
            }

            foreach ( self::all() as $capability ) {
                $role->remove_cap( $capability );
            }
        }
    }
}
```

- [ ] **Step 4: `Activation` sinfini yaz**

`includes/Support/Activation.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Support;

/**
 * Aktivasiya və deaktivasiya hook-ları.
 *
 * Deaktivasiya capability-ləri QƏSDƏN silmir: plugin müvəqqəti söndürülüb
 * yenidən açıla bilər və hər dəfə icazələrin itməsi gözlənilməzdir.
 * Tam təmizlik uninstall-da aparılır.
 */
final class Activation
{
    public static function activate(): void
    {
        Capabilities::grantToAdministrator();

        flush_rewrite_rules();
    }

    public static function deactivate(): void
    {
        flush_rewrite_rules();
    }
}
```

- [ ] **Step 5: Testlərin keçdiyini təsdiqlə**

Run: `make itest ARGS="--filter CapabilitiesTest"`
Expected: 6 test PASS.

- [ ] **Step 6: Commit hazırla**

```bash
git add includes/Support/Capabilities.php includes/Support/Activation.php tests/integration/CapabilitiesTest.php
git commit -m "feat(support): add plugin capabilities and activation hooks"
```

---
## Task 3: `quoteform` CPT

**Files:**
- Create: `includes/Forms/FormPostType.php`
- Test: `tests/integration/FormPostTypeTest.php`

**Interfaces:**
- Consumes: `Quoteform\Support\Capabilities`.
- Produces: `Quoteform\Forms\FormPostType` — sabit `POST_TYPE = 'quoteform'`, sabit `META_SCHEMA = '_qform_schema'`, statik `register(): void`.

Spec §6.1: CPT `public => false`, `show_ui => false` (öz React səhifəmiz olacaq), `supports => ['title', 'revisions']`. Revizyalar vacibdir — istifadəçi formulu sındırsa, əvvəlki işlək versiyaya qayıda bilir.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/integration/FormPostTypeTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use WP_UnitTestCase;

final class FormPostTypeTest extends WP_UnitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
    }

    public function testPostTypeIsRegistered(): void
    {
        $this->assertTrue( post_type_exists( 'quoteform' ) );
    }

    public function testPostTypeIsHiddenFromTheFrontEndAndTheDefaultUi(): void
    {
        $object = get_post_type_object( 'quoteform' );

        $this->assertFalse( $object->public );
        $this->assertFalse( $object->show_ui );
        $this->assertFalse( $object->publicly_queryable );
    }

    public function testPostTypeSupportsTitleAndRevisions(): void
    {
        $this->assertTrue( post_type_supports( 'quoteform', 'title' ) );
        $this->assertTrue( post_type_supports( 'quoteform', 'revisions' ) );
        $this->assertFalse( post_type_supports( 'quoteform', 'editor' ) );
    }

    public function testPostTypeUsesOurCapability(): void
    {
        $object = get_post_type_object( 'quoteform' );

        $this->assertSame( 'qform_manage_forms', $object->cap->edit_posts );
        $this->assertSame( 'qform_manage_forms', $object->cap->publish_posts );
    }

    public function testSchemaMetaKeyIsExposedAsAConstant(): void
    {
        $this->assertSame( '_qform_schema', FormPostType::META_SCHEMA );
    }

    public function testAFormCanBeCreatedAndReadBack(): void
    {
        $id = wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => 'Cleaning quote',
                'post_status' => 'publish',
            ]
        );

        $this->assertIsInt( $id );
        $this->assertGreaterThan( 0, $id );
        $this->assertSame( 'Cleaning quote', get_post( $id )->post_title );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make itest ARGS="--filter FormPostTypeTest"`
Expected: FAIL — `Class "Quoteform\Forms\FormPostType" not found`.

- [ ] **Step 3: `FormPostType` sinfini yaz**

`includes/Forms/FormPostType.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

use Quoteform\Support\Capabilities;

/**
 * Forma CPT-si.
 *
 * `show_ui` söndürülüb, çünki formalar öz React builder-imizdə redaktə olunur,
 * WordPress-in standart post redaktorunda yox. CPT yenə də seçilib (spec §6.1),
 * çünki trash/restore, revizyalar və capability sistemi hazır gəlir —
 * revizyalar xüsusilə dəyərlidir: sınıq formuldan geri qayıtmaq mümkün olur.
 */
final class FormPostType
{
    public const POST_TYPE   = 'quoteform';
    public const META_SCHEMA = '_qform_schema';

    public static function register(): void
    {
        register_post_type(
            self::POST_TYPE,
            [
                'label'               => __( 'Quote forms', 'quoteform' ),
                'public'              => false,
                'publicly_queryable'  => false,
                'show_ui'             => false,
                'show_in_menu'        => false,
                'show_in_rest'        => false,
                'exclude_from_search' => true,
                'hierarchical'        => false,
                'supports'            => [ 'title', 'revisions' ],
                'capability_type'     => 'post',
                'map_meta_cap'        => false,
                'capabilities'        => [
                    'edit_post'          => Capabilities::MANAGE_FORMS,
                    'read_post'          => Capabilities::MANAGE_FORMS,
                    'delete_post'        => Capabilities::MANAGE_FORMS,
                    'edit_posts'         => Capabilities::MANAGE_FORMS,
                    'edit_others_posts'  => Capabilities::MANAGE_FORMS,
                    'publish_posts'      => Capabilities::MANAGE_FORMS,
                    'read_private_posts' => Capabilities::MANAGE_FORMS,
                    'delete_posts'       => Capabilities::MANAGE_FORMS,
                ],
            ]
        );
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make itest ARGS="--filter FormPostTypeTest"`
Expected: 6 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Forms/FormPostType.php tests/integration/FormPostTypeTest.php
git commit -m "feat(forms): register quoteform custom post type"
```

---

## Task 4: `ValidationResult`

Validasiya zəncirinin bütün halqaları xətaları bura yığır. WordPress-ə istinad etmir, ona görə vahid testlə örtülür.

**Files:**
- Create: `includes/Forms/ValidationResult.php`
- Test: `tests/php/Forms/ValidationResultTest.php`

**Interfaces:**
- Consumes: heç nə.
- Produces: `Quoteform\Forms\ValidationResult` —
  - `addError( string $path, string $code, string $message, array $context = [] ): void`
  - `isValid(): bool`
  - `errorCount(): int`
  - `getErrors(): array` — hər element `[ 'path' => string, 'code' => string, 'message' => string, 'context' => array ]`
  - `merge( ValidationResult $other, string $pathPrefix = '' ): void`
  - `hasErrorAt( string $path ): bool`

Yol formatı nöqtə ilə ayrılır: `fields.room_count.min`, `calculations.1.expression`. Builder həmin yolu oxuyub xətanı düzgün sahənin yanında göstərir.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Forms/ValidationResultTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\ValidationResult;

final class ValidationResultTest extends TestCase
{
    public function testAFreshResultIsValid(): void
    {
        $result = new ValidationResult();

        $this->assertTrue( $result->isValid() );
        $this->assertSame( 0, $result->errorCount() );
        $this->assertSame( [], $result->getErrors() );
    }

    public function testAddingAnErrorMakesItInvalid(): void
    {
        $result = new ValidationResult();
        $result->addError( 'fields.a.label', 'missing_field', 'Label is required.' );

        $this->assertFalse( $result->isValid() );
        $this->assertSame( 1, $result->errorCount() );
    }

    public function testErrorCarriesPathCodeMessageAndContext(): void
    {
        $result = new ValidationResult();
        $result->addError( 'settings.decimals', 'out_of_range', 'Too many decimals.', [ 'max' => 6 ] );

        $this->assertSame(
            [
                [
                    'path'    => 'settings.decimals',
                    'code'    => 'out_of_range',
                    'message' => 'Too many decimals.',
                    'context' => [ 'max' => 6 ],
                ],
            ],
            $result->getErrors()
        );
    }

    public function testContextDefaultsToAnEmptyArray(): void
    {
        $result = new ValidationResult();
        $result->addError( 'a', 'invalid_type', 'Bad.' );

        $this->assertSame( [], $result->getErrors()[0]['context'] );
    }

    public function testErrorsKeepInsertionOrder(): void
    {
        $result = new ValidationResult();
        $result->addError( 'b', 'invalid_type', 'Second.' );
        $result->addError( 'a', 'invalid_type', 'First.' );

        $this->assertSame( [ 'b', 'a' ], array_column( $result->getErrors(), 'path' ) );
    }

    public function testMergeAppendsTheOtherResultsErrors(): void
    {
        $first = new ValidationResult();
        $first->addError( 'a', 'invalid_type', 'A.' );

        $second = new ValidationResult();
        $second->addError( 'b', 'invalid_type', 'B.' );

        $first->merge( $second );

        $this->assertSame( [ 'a', 'b' ], array_column( $first->getErrors(), 'path' ) );
    }

    public function testMergeAppliesThePathPrefix(): void
    {
        $outer = new ValidationResult();

        $inner = new ValidationResult();
        $inner->addError( 'min', 'out_of_range', 'Too small.' );

        $outer->merge( $inner, 'fields.room_count' );

        $this->assertSame( 'fields.room_count.min', $outer->getErrors()[0]['path'] );
    }

    public function testMergeWithAnEmptyPrefixLeavesThePathAlone(): void
    {
        $outer = new ValidationResult();

        $inner = new ValidationResult();
        $inner->addError( 'min', 'out_of_range', 'Too small.' );

        $outer->merge( $inner, '' );

        $this->assertSame( 'min', $outer->getErrors()[0]['path'] );
    }

    public function testMergeWithAnEmptyChildPathUsesThePrefixAlone(): void
    {
        $outer = new ValidationResult();

        $inner = new ValidationResult();
        $inner->addError( '', 'empty_collection', 'No calculations.' );

        $outer->merge( $inner, 'calculations' );

        $this->assertSame( 'calculations', $outer->getErrors()[0]['path'] );
    }

    public function testMergingAValidResultChangesNothing(): void
    {
        $outer = new ValidationResult();
        $outer->merge( new ValidationResult(), 'fields' );

        $this->assertTrue( $outer->isValid() );
    }

    public function testHasErrorAtFindsAnExactPath(): void
    {
        $result = new ValidationResult();
        $result->addError( 'fields.a.label', 'missing_field', 'Label is required.' );

        $this->assertTrue( $result->hasErrorAt( 'fields.a.label' ) );
        $this->assertFalse( $result->hasErrorAt( 'fields.a' ) );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make test ARGS="--filter ValidationResultTest"`
Expected: FAIL — `Class "Quoteform\Forms\ValidationResult" not found`.

- [ ] **Step 3: `ValidationResult` sinfini yaz**

`includes/Forms/ValidationResult.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxem validasiyasının xəta yığımı.
 *
 * Xətalar MESAJLA yox, KODLA identifikasiya olunur — mühərrikin öz konvensiyası ilə eyni.
 * Mesaj insanın oxuması üçündür və tərcümə olunur; builder isə koda və yola görə davranır.
 *
 * Yol nöqtə ilə ayrılır (`fields.room_count.min`) ki, builder xətanı düzgün
 * sahənin yanında göstərə bilsin.
 */
final class ValidationResult
{
    /** @var array<int, array{path: string, code: string, message: string, context: array<string, mixed>}> */
    private $errors = [];

    /**
     * @param array<string, mixed> $context
     */
    public function addError( string $path, string $code, string $message, array $context = [] ): void
    {
        $this->errors[] = [
            'path'    => $path,
            'code'    => $code,
            'message' => $message,
            'context' => $context,
        ];
    }

    public function isValid(): bool
    {
        return $this->errors === [];
    }

    public function errorCount(): int
    {
        return count( $this->errors );
    }

    /**
     * @return array<int, array{path: string, code: string, message: string, context: array<string, mixed>}>
     */
    public function getErrors(): array
    {
        return $this->errors;
    }

    public function merge( ValidationResult $other, string $pathPrefix = '' ): void
    {
        foreach ( $other->getErrors() as $error ) {
            if ( $pathPrefix !== '' ) {
                // Alt validator kolleksiyanın ÖZÜ haqqında xəta verə bilər (boş yol).
                // Belə halda prefiks tək başına düzgün yoldur — `calculations.` deyil, `calculations`.
                $error['path'] = $error['path'] === ''
                    ? $pathPrefix
                    : $pathPrefix . '.' . $error['path'];
            }

            $this->errors[] = $error;
        }
    }

    public function hasErrorAt( string $path ): bool
    {
        foreach ( $this->errors as $error ) {
            if ( $error['path'] === $path ) {
                return true;
            }
        }

        return false;
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make test ARGS="--filter ValidationResultTest"` və `make test74 ARGS="--filter ValidationResultTest"`
Expected: hər ikisində 11 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Forms/ValidationResult.php tests/php/Forms/ValidationResultTest.php
git commit -m "feat(forms): add schema validation result collector"
```

---
## Task 5: `KeyRules` və `TextPosition`

İki kiçik saf köməkçi. Hər ikisi WordPress-siz işləyir və vahid testlə örtülür.

**Files:**
- Create: `includes/Forms/KeyRules.php`
- Create: `includes/Support/TextPosition.php`
- Test: `tests/php/Forms/KeyRulesTest.php`
- Test: `tests/php/Support/TextPositionTest.php`

**Interfaces:**
- Consumes: `Quoteform\Forms\ValidationResult`.
- Produces:
  - `Quoteform\Forms\KeyRules` — `isValidFormat( string $key ): bool`, `isReserved( string $key ): bool`, `validate( string $key, string $path, ValidationResult $result ): bool`
  - `Quoteform\Support\TextPosition` — `byteToUtf16( string $source, int $byteOffset ): int`

**Niyə belədir (Q1 və Q4):** açarın kiçik hərflə başlaması rəqəmə oxşayan açarları struktur olaraq mümkünsüz edir — Plan 01-də məhz onlar iki qüsur doğurmuşdu (PHP `int`-ə çevirir və fatal verirdi; JS obyekti yenidən sıralayırdı). Mövqe çevrilməsi isə lexer-in bayt ofsetini builder-in başa düşdüyü UTF-16 kod vahidinə keçirir.

- [ ] **Step 1: Uğursuz testləri yaz**

`tests/php/Forms/KeyRulesTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\KeyRules;
use Quoteform\Forms\ValidationResult;

final class KeyRulesTest extends TestCase
{
    /**
     * @dataProvider validKeys
     */
    public function testAcceptsValidKeys( string $key ): void
    {
        $this->assertTrue( KeyRules::isValidFormat( $key ), $key );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public function validKeys(): array
    {
        return [
            'sadə'            => [ 'total' ],
            'alt xətt ilə'    => [ 'room_count' ],
            'rəqəm daxil'     => [ 'step2' ],
            'tək hərf'        => [ 'a' ],
            'maksimum uzunluq'=> [ 'a' . str_repeat( 'b', 63 ) ],
        ];
    }

    /**
     * @dataProvider invalidKeys
     */
    public function testRejectsInvalidKeys( string $key ): void
    {
        $this->assertFalse( KeyRules::isValidFormat( $key ), $key );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public function invalidKeys(): array
    {
        return [
            'boş'                  => [ '' ],
            'rəqəmlə başlayır'     => [ '2' ],
            'rəqəmlə başlayır uzun'=> [ '2nd_step' ],
            'alt xətt ilə başlayır'=> [ '_private' ],
            'proto'                => [ '__proto__' ],
            'böyük hərf'           => [ 'Total' ],
            'defis'                => [ 'room-count' ],
            'boşluq'               => [ 'room count' ],
            'nöqtə'                => [ 'room.count' ],
            'qeyri-ASCII'          => [ 'otaq' . "\u{0259}" ],
            'çox uzun'             => [ 'a' . str_repeat( 'b', 64 ) ],
        ];
    }

    public function testNumericLikeKeysAreImpossible(): void
    {
        foreach ( [ '1', '2', '10', '0' ] as $key ) {
            $this->assertFalse(
                KeyRules::isValidFormat( $key ),
                'Rəqəmə oxşayan açar PHP-də int-ə çevrilir və JS-də yenidən sıralanır.'
            );
        }
    }

    /**
     * @dataProvider reservedKeys
     */
    public function testRejectsReservedKeys( string $key ): void
    {
        $this->assertTrue( KeyRules::isReserved( $key ), $key );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public function reservedKeys(): array
    {
        return [
            'constructor'     => [ 'constructor' ],
            'prototype'       => [ 'prototype' ],
            'hasownproperty'  => [ 'hasownproperty' ],
            'tostring'        => [ 'tostring' ],
            'valueof'         => [ 'valueof' ],
        ];
    }

    public function testOrdinaryKeysAreNotReserved(): void
    {
        $this->assertFalse( KeyRules::isReserved( 'total' ) );
        $this->assertFalse( KeyRules::isReserved( 'room_count' ) );
    }

    public function testValidateRecordsAFormatError(): void
    {
        $result = new ValidationResult();

        $this->assertFalse( KeyRules::validate( '2nd', 'fields.2nd', $result ) );
        $this->assertSame( 'invalid_key_format', $result->getErrors()[0]['code'] );
        $this->assertSame( 'fields.2nd', $result->getErrors()[0]['path'] );
    }

    public function testValidateRecordsAReservedError(): void
    {
        $result = new ValidationResult();

        $this->assertFalse( KeyRules::validate( 'constructor', 'fields.constructor', $result ) );
        $this->assertSame( 'reserved_key', $result->getErrors()[0]['code'] );
    }

    public function testValidateAddsNothingForAGoodKey(): void
    {
        $result = new ValidationResult();

        $this->assertTrue( KeyRules::validate( 'room_count', 'fields.room_count', $result ) );
        $this->assertTrue( $result->isValid() );
    }
}
```

`tests/php/Support/TextPositionTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Support;

use PHPUnit\Framework\TestCase;
use Quoteform\Support\TextPosition;

final class TextPositionTest extends TestCase
{
    public function testAsciiOffsetsAreUnchanged(): void
    {
        $this->assertSame( 0, TextPosition::byteToUtf16( '{a} + 1', 0 ) );
        $this->assertSame( 4, TextPosition::byteToUtf16( '{a} + 1', 4 ) );
        $this->assertSame( 7, TextPosition::byteToUtf16( '{a} + 1', 7 ) );
    }

    public function testNegativeAndZeroOffsetsReturnZero(): void
    {
        $this->assertSame( 0, TextPosition::byteToUtf16( 'abc', -5 ) );
        $this->assertSame( 0, TextPosition::byteToUtf16( 'abc', 0 ) );
    }

    public function testTwoByteCharacterCountsAsOneUnit(): void
    {
        // "é" UTF-8-də 2 baytdır, UTF-16-da 1 kod vahididir.
        $source = "\u{00E9}x";

        $this->assertSame( 1, TextPosition::byteToUtf16( $source, 2 ) );
        $this->assertSame( 2, TextPosition::byteToUtf16( $source, 3 ) );
    }

    public function testThreeByteCharacterCountsAsOneUnit(): void
    {
        // "日" UTF-8-də 3 baytdır, UTF-16-da 1 kod vahididir.
        $source = "\u{65E5}x";

        $this->assertSame( 1, TextPosition::byteToUtf16( $source, 3 ) );
        $this->assertSame( 2, TextPosition::byteToUtf16( $source, 4 ) );
    }

    public function testFourByteCharacterCountsAsTwoUnits(): void
    {
        // "😀" UTF-8-də 4 baytdır, UTF-16-da SURROQAT CÜTdür — 2 kod vahidi.
        $source = "\u{1F600}x";

        $this->assertSame( 2, TextPosition::byteToUtf16( $source, 4 ) );
        $this->assertSame( 3, TextPosition::byteToUtf16( $source, 5 ) );
    }

    public function testMixedScriptExpression(): void
    {
        // Yekun review-un #7 tapıntısı: `1 + "日本" # 2` ifadəsində
        // PHP bayt 13 deyir, JS isə 9-cu kod vahidini gözləyir.
        $source = '1 + "' . "\u{65E5}\u{672C}" . '" # 2';

        $this->assertSame( 9, TextPosition::byteToUtf16( $source, 13 ) );
    }

    public function testOffsetBeyondTheStringIsClamped(): void
    {
        $this->assertSame( 3, TextPosition::byteToUtf16( 'abc', 99 ) );
    }
}
```

- [ ] **Step 2: Testlərin uğursuz olduğunu təsdiqlə**

Run: `make test ARGS="--filter 'KeyRulesTest|TextPositionTest'"`
Expected: FAIL — hər iki sinif tapılmır.

- [ ] **Step 3: `KeyRules` sinfini yaz**

`includes/Forms/KeyRules.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sahə və hesablama açarlarının qaydaları.
 *
 * Açar KİÇİK HƏRFLƏ BAŞLAMALIDIR. Bu, səliqə məsələsi deyil: Plan 01-də iki real
 * qüsur məhz açar formatından doğmuşdu — PHP rəqəmə oxşayan massiv açarlarını
 * `int`-ə çevirir (fatal xəta verirdi), JavaScript obyekti isə onları qalan
 * açarlardan əvvələ sıralayır. Hərflə başlamağı tələb etmək bu sinfi
 * istifadəçi girişindən gələ bilməz edir.
 *
 * Hərflə başlama həm də `__proto__` açarını bloklayır.
 */
final class KeyRules
{
    private const PATTERN = '/^[a-z][a-z0-9_]{0,63}$/';

    /**
     * JavaScript obyekt üzvləri ilə qarışa biləcək adlar.
     *
     * @var string[]
     */
    private const RESERVED = [
        'constructor',
        'prototype',
    ];

    public static function isValidFormat( string $key ): bool
    {
        return preg_match( self::PATTERN, $key ) === 1;
    }

    public static function isReserved( string $key ): bool
    {
        return in_array( $key, self::RESERVED, true );
    }

    public static function validate( string $key, string $path, ValidationResult $result ): bool
    {
        if ( ! self::isValidFormat( $key ) ) {
            $result->addError(
                $path,
                'invalid_key_format',
                __( 'A key must start with a lowercase letter and may contain only lowercase letters, digits and underscores (max 64 characters).', 'quoteform' ),
                [ 'key' => $key ]
            );

            return false;
        }

        if ( self::isReserved( $key ) ) {
            $result->addError(
                $path,
                'reserved_key',
                __( 'This key is reserved and cannot be used.', 'quoteform' ),
                [ 'key' => $key ]
            );

            return false;
        }

        return true;
    }
}
```

- [ ] **Step 4: `TextPosition` sinfini yaz**

`includes/Support/TextPosition.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Support;

/**
 * Bayt ofsetini UTF-16 kod vahidi ofsetinə çevirir.
 *
 * Mühərrikin lexer-i bayt ofseti verir, çünki PHP sətirləri bayt massividir.
 * Həmin ofsetin yeganə istehlakçısı builder-dir və o, JavaScript-dir —
 * JS sətir indeksləri isə UTF-16 kod vahididir. Bayt ofsetini birbaşa ötürsək,
 * qeyri-ASCII simvol daşıyan istənilən ifadədə kursor səhv yerə düşər.
 *
 * mbstring QƏSDƏN istifadə edilmir: rəsmi PHP Docker image-lərində o, default
 * olaraq qurulmur. Hesablama birbaşa UTF-8 baytları üzərində aparılır.
 */
final class TextPosition
{
    public static function byteToUtf16( string $source, int $byteOffset ): int
    {
        if ( $byteOffset <= 0 ) {
            return 0;
        }

        $prefix = substr( $source, 0, $byteOffset );
        $length = strlen( $prefix );
        $units  = 0;

        for ( $index = 0; $index < $length; $index++ ) {
            $byte = ord( $prefix[ $index ] );

            // Davam baytı (10xxxxxx) yeni simvol başlatmır.
            if ( ( $byte & 0xC0 ) === 0x80 ) {
                continue;
            }

            // Dörd baytlıq ardıcıllıq (11110xxx) UTF-16-da surroqat cütdür.
            $units += ( ( $byte & 0xF8 ) === 0xF0 ) ? 2 : 1;
        }

        return $units;
    }
}
```

- [ ] **Step 5: Testlərin keçdiyini təsdiqlə**

Run: `make test ARGS="--filter 'KeyRulesTest|TextPositionTest'"`
Expected: PASS.

- [ ] **Step 6: PHP 7.4-də də təsdiqlə**

Run: `make test74 ARGS="--filter 'KeyRulesTest|TextPositionTest'"`
Expected: PASS.

- [ ] **Step 7: Commit hazırla**

```bash
git add includes/Forms/KeyRules.php includes/Support/TextPosition.php tests/php/Forms/KeyRulesTest.php tests/php/Support/TextPositionTest.php
git commit -m "feat(forms): add key rules and byte-to-utf16 position mapping"
```

---
## Task 6: `SettingsValidator`

**Files:**
- Create: `includes/Forms/SettingsValidator.php`
- Test: `tests/php/Forms/SettingsValidatorTest.php`

**Interfaces:**
- Consumes: `ValidationResult`.
- Produces: `Quoteform\Forms\SettingsValidator` — `validate( $settings ): ValidationResult`.

**Qaydalar** (spec §6.2 + Q6):

| Açar | Qayda |
|---|---|
| `currency` | üç böyük hərf (`USD`, `AZN`) |
| `currency_position` | `before` və ya `after` |
| `decimals` | tam ədəd, **0..6** — `Functions::MAX_PRECISION` səbəbindən (Q6) |
| `submit_label` | boş olmayan sətir |
| `success_action` | `message` və ya `redirect` |
| `success_message` | `success_action = message` olduqda boş olmamalıdır |
| `redirect_url` | `success_action = redirect` olduqda düzgün URL olmalıdır |
| `save_resume`, `store_ip` | boolean |

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Forms/SettingsValidatorTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\SettingsValidator;

final class SettingsValidatorTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private function validSettings(): array
    {
        return [
            'currency'          => 'USD',
            'currency_position' => 'before',
            'decimals'          => 2,
            'submit_label'      => 'Get my quote',
            'success_action'    => 'message',
            'success_message'   => 'Thanks.',
            'redirect_url'      => '',
            'save_resume'       => true,
            'store_ip'          => false,
        ];
    }

    /**
     * @param array<string, mixed> $overrides
     * @return string[]
     */
    private function codesFor( array $overrides ): array
    {
        $settings = array_merge( $this->validSettings(), $overrides );

        return array_column( ( new SettingsValidator() )->validate( $settings )->getErrors(), 'code' );
    }

    public function testValidSettingsProduceNoErrors(): void
    {
        $this->assertSame( [], $this->codesFor( [] ) );
    }

    public function testSettingsMustBeAnArray(): void
    {
        $result = ( new SettingsValidator() )->validate( 'not an array' );

        $this->assertSame( [ 'invalid_type' ], array_column( $result->getErrors(), 'code' ) );
    }

    public function testCurrencyMustBeThreeUppercaseLetters(): void
    {
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency' => 'usd' ] ) );
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency' => 'US' ] ) );
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency' => 'USDD' ] ) );
        $this->assertSame( [], $this->codesFor( [ 'currency' => 'AZN' ] ) );
    }

    public function testCurrencyPositionIsRestricted(): void
    {
        $this->assertSame( [], $this->codesFor( [ 'currency_position' => 'after' ] ) );
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'currency_position' => 'middle' ] ) );
    }

    public function testDecimalsMustBeAnIntegerBetweenZeroAndSix(): void
    {
        $this->assertSame( [], $this->codesFor( [ 'decimals' => 0 ] ) );
        $this->assertSame( [], $this->codesFor( [ 'decimals' => 6 ] ) );
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( [ 'decimals' => 7 ] ) );
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( [ 'decimals' => -1 ] ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'decimals' => '2' ] ) );
    }

    public function testDecimalsUpperBoundMatchesTheEnginesMaxPrecision(): void
    {
        // Functions::MAX_PRECISION 6-dır. Sxem daha böyük dəqiqlik tələb etsə,
        // forma işləyəndə invalid_precision atardı — bunu saxlama anında tuturuq.
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( [ 'decimals' => 8 ] ) );
    }

    public function testSubmitLabelCannotBeEmpty(): void
    {
        $this->assertSame( [ 'missing_field' ], $this->codesFor( [ 'submit_label' => '' ] ) );
        $this->assertSame( [ 'missing_field' ], $this->codesFor( [ 'submit_label' => '   ' ] ) );
    }

    public function testSuccessActionIsRestricted(): void
    {
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( [ 'success_action' => 'explode' ] ) );
    }

    public function testMessageActionRequiresAMessage(): void
    {
        $this->assertSame(
            [ 'missing_field' ],
            $this->codesFor( [ 'success_action' => 'message', 'success_message' => '' ] )
        );
    }

    public function testRedirectActionRequiresAValidUrl(): void
    {
        $this->assertSame(
            [ 'missing_field' ],
            $this->codesFor( [ 'success_action' => 'redirect', 'redirect_url' => '' ] )
        );

        $this->assertSame(
            [ 'invalid_option' ],
            $this->codesFor( [ 'success_action' => 'redirect', 'redirect_url' => 'not a url' ] )
        );

        $this->assertSame(
            [],
            $this->codesFor( [ 'success_action' => 'redirect', 'redirect_url' => 'https://example.com/thanks' ] )
        );
    }

    public function testRedirectUrlIsIgnoredWhenTheActionIsMessage(): void
    {
        $this->assertSame( [], $this->codesFor( [ 'success_action' => 'message', 'redirect_url' => 'nonsense' ] ) );
    }

    public function testBooleanFlagsMustBeBoolean(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'save_resume' => 'yes' ] ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'store_ip' => 1 ] ) );
    }

    public function testMissingKeysAreReported(): void
    {
        $settings = $this->validSettings();
        unset( $settings['currency'] );

        $result = ( new SettingsValidator() )->validate( $settings );

        $this->assertTrue( $result->hasErrorAt( 'currency' ) );
        $this->assertSame( 'missing_field', $result->getErrors()[0]['code'] );
    }

    public function testUnknownKeysAreReported(): void
    {
        $this->assertSame( [ 'unknown_key' ], $this->codesFor( [ 'colour' => 'blue' ] ) );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make test ARGS="--filter SettingsValidatorTest"`
Expected: FAIL — `Class "Quoteform\Forms\SettingsValidator" not found`.

- [ ] **Step 3: `SettingsValidator` sinfini yaz**

`includes/Forms/SettingsValidator.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxemin `settings` bloku.
 *
 * `decimals` üst həddi (6) təsadüfi deyil: mühərrikin `Functions::MAX_PRECISION`
 * sabiti ilə eynidir. Daha böyük dəqiqlik tələb edən sxem forma işləyəndə
 * `invalid_precision` atardı — bunu saxlama anında tutmaq daha yaxşıdır.
 */
final class SettingsValidator
{
    private const MAX_DECIMALS = 6;

    private const ALLOWED_KEYS = [
        'currency',
        'currency_position',
        'decimals',
        'submit_label',
        'success_action',
        'success_message',
        'redirect_url',
        'save_resume',
        'store_ip',
    ];

    /**
     * @param mixed $settings
     */
    public function validate( $settings ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $settings ) ) {
            $result->addError( '', 'invalid_type', __( 'Settings must be an object.', 'quoteform' ) );

            return $result;
        }

        foreach ( array_keys( $settings ) as $key ) {
            if ( ! in_array( $key, self::ALLOWED_KEYS, true ) ) {
                $result->addError( (string) $key, 'unknown_key', __( 'Unknown setting.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( self::ALLOWED_KEYS as $key ) {
            if ( ! array_key_exists( $key, $settings ) ) {
                $hasMissingKey = true;
                $result->addError( $key, 'missing_field', __( 'This setting is required.', 'quoteform' ) );
            }
        }

        if ( $hasMissingKey ) {
            return $result;
        }

        if ( ! is_string( $settings['currency'] ) || preg_match( '/^[A-Z]{3}$/', $settings['currency'] ) !== 1 ) {
            $result->addError( 'currency', 'invalid_option', __( 'Currency must be a three-letter code such as USD.', 'quoteform' ) );
        }

        if ( ! in_array( $settings['currency_position'], [ 'before', 'after' ], true ) ) {
            $result->addError( 'currency_position', 'invalid_option', __( 'Currency position must be "before" or "after".', 'quoteform' ) );
        }

        if ( ! is_int( $settings['decimals'] ) ) {
            $result->addError( 'decimals', 'invalid_type', __( 'Decimals must be a whole number.', 'quoteform' ) );
        } elseif ( $settings['decimals'] < 0 || $settings['decimals'] > self::MAX_DECIMALS ) {
            $result->addError(
                'decimals',
                'out_of_range',
                __( 'Decimals must be between 0 and 6.', 'quoteform' ),
                [ 'min' => 0, 'max' => self::MAX_DECIMALS ]
            );
        }

        if ( ! is_string( $settings['submit_label'] ) || trim( $settings['submit_label'] ) === '' ) {
            $result->addError( 'submit_label', 'missing_field', __( 'The submit button needs a label.', 'quoteform' ) );
        }

        if ( ! in_array( $settings['success_action'], [ 'message', 'redirect' ], true ) ) {
            $result->addError( 'success_action', 'invalid_option', __( 'Success action must be "message" or "redirect".', 'quoteform' ) );
        } elseif ( $settings['success_action'] === 'message' ) {
            if ( ! is_string( $settings['success_message'] ) || trim( $settings['success_message'] ) === '' ) {
                $result->addError( 'success_message', 'missing_field', __( 'A success message is required.', 'quoteform' ) );
            }
        } else {
            if ( ! is_string( $settings['redirect_url'] ) || trim( $settings['redirect_url'] ) === '' ) {
                $result->addError( 'redirect_url', 'missing_field', __( 'A redirect URL is required.', 'quoteform' ) );
            } elseif ( filter_var( $settings['redirect_url'], FILTER_VALIDATE_URL ) === false ) {
                $result->addError( 'redirect_url', 'invalid_option', __( 'The redirect URL is not valid.', 'quoteform' ) );
            }
        }

        foreach ( [ 'save_resume', 'store_ip' ] as $flag ) {
            if ( ! is_bool( $settings[ $flag ] ) ) {
                $result->addError( $flag, 'invalid_type', __( 'This setting must be true or false.', 'quoteform' ) );
            }
        }

        return $result;
    }
}
```

**Diqqət:** əskik və ya artıq açar aşkarlandıqda funksiya erkən qayıdır. Səbəb budur ki, sonrakı yoxlamalar həmin açarların mövcudluğunu güman edir — əks halda `undefined index` xətası alardıq. Builder əvvəlcə struktur xətalarını göstərir, sonra dəyər xətalarını.

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make test ARGS="--filter SettingsValidatorTest"` və `make test74 ARGS="--filter SettingsValidatorTest"`
Expected: hər ikisində 14 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Forms/SettingsValidator.php tests/php/Forms/SettingsValidatorTest.php
git commit -m "feat(forms): validate schema settings block"
```

---
## Task 7: `FieldValidator`

Bir sahəni tipinə görə yoxlayır. Spec §6.2-dəki 13 tip dəstəklənir.

**Files:**
- Create: `includes/Forms/FieldValidator.php`
- Test: `tests/php/Forms/FieldValidatorTest.php`

**Interfaces:**
- Consumes: `ValidationResult`, `KeyRules`.
- Produces: `Quoteform\Forms\FieldValidator` — `validate( string $key, $field ): ValidationResult`, statik `types(): string[]`.

Qaytarılan `ValidationResult`-dakı yollar sahəyə nisbidir (`label`, `options.0.value`); orkestrator onları `fields.<key>` prefiksi ilə birləşdirir.

**Tip cədvəli:**

| Tip | Əlavə açarlar |
|---|---|
| `number`, `slider` | `min`, `max`, `step` |
| `select`, `radio`, `checkbox` | `options` |
| `html` | `content` |
| `text`, `email`, `tel`, `textarea`, `toggle`, `date`, `hidden` | — |

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Forms/FieldValidatorTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\FieldValidator;

final class FieldValidatorTest extends TestCase
{
    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function numberField( array $overrides = [] ): array
    {
        return array_merge(
            [
                'key'         => 'room_count',
                'type'        => 'number',
                'label'       => 'How many rooms?',
                'help'        => '',
                'placeholder' => '',
                'required'    => true,
                'default'     => 1,
                'min'         => 0,
                'max'         => 20,
                'step'        => 1,
            ],
            $overrides
        );
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function radioField( array $overrides = [] ): array
    {
        return array_merge(
            [
                'key'         => 'urgency',
                'type'        => 'radio',
                'label'       => 'How soon?',
                'help'        => '',
                'placeholder' => '',
                'required'    => true,
                'default'     => 'standard',
                'options'     => [
                    [ 'label' => 'Standard', 'value' => 'standard', 'price' => 0 ],
                    [ 'label' => 'Express', 'value' => 'express', 'price' => 60 ],
                ],
            ],
            $overrides
        );
    }

    /**
     * @param array<string, mixed> $field
     * @return string[]
     */
    private function codesFor( array $field, string $key = null ): array
    {
        $key = $key ?? ( is_string( $field['key'] ?? null ) ? $field['key'] : 'x' );

        return array_column( ( new FieldValidator() )->validate( $key, $field )->getErrors(), 'code' );
    }

    public function testAllThirteenTypesAreSupported(): void
    {
        $this->assertSame(
            [ 'number', 'text', 'email', 'tel', 'textarea', 'select', 'radio', 'checkbox', 'toggle', 'date', 'slider', 'hidden', 'html' ],
            FieldValidator::types()
        );
    }

    public function testAValidNumberFieldPasses(): void
    {
        $this->assertSame( [], $this->codesFor( $this->numberField() ) );
    }

    public function testAValidRadioFieldPasses(): void
    {
        $this->assertSame( [], $this->codesFor( $this->radioField() ) );
    }

    public function testFieldMustBeAnArray(): void
    {
        $result = ( new FieldValidator() )->validate( 'a', 'not an array' );

        $this->assertSame( [ 'invalid_type' ], array_column( $result->getErrors(), 'code' ) );
    }

    public function testUnknownTypeIsRejected(): void
    {
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $this->numberField( [ 'type' => 'signature' ] ) ) );
    }

    public function testKeyInsideTheFieldMustMatchTheMapKey(): void
    {
        $codes = $this->codesFor( $this->numberField( [ 'key' => 'other' ] ), 'room_count' );

        $this->assertContains( 'key_mismatch', $codes );
    }

    public function testKeyMustFollowTheKeyRules(): void
    {
        $this->assertContains( 'invalid_key_format', $this->codesFor( $this->numberField( [ 'key' => '2nd' ] ), '2nd' ) );
    }

    public function testLabelIsRequiredForVisibleTypes(): void
    {
        $this->assertSame( [ 'missing_field' ], $this->codesFor( $this->numberField( [ 'label' => '' ] ) ) );
    }

    public function testLabelIsNotRequiredForHiddenAndHtml(): void
    {
        $hidden = [
            'key' => 'source', 'type' => 'hidden', 'label' => '', 'help' => '',
            'placeholder' => '', 'required' => false, 'default' => 'web',
        ];

        $html = [
            'key' => 'intro', 'type' => 'html', 'label' => '', 'help' => '',
            'placeholder' => '', 'required' => false, 'default' => '',
            'content' => '<p>Welcome</p>',
        ];

        $this->assertSame( [], $this->codesFor( $hidden ) );
        $this->assertSame( [], $this->codesFor( $html ) );
    }

    public function testRequiredMustBeBoolean(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->numberField( [ 'required' => 'yes' ] ) ) );
    }

    public function testNumberRangeMustBeNumericAndOrdered(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->numberField( [ 'min' => 'zero' ] ) ) );
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( $this->numberField( [ 'min' => 30, 'max' => 20 ] ) ) );
        $this->assertSame( [], $this->codesFor( $this->numberField( [ 'min' => 5, 'max' => 5 ] ) ) );
    }

    public function testStepMustBePositive(): void
    {
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( $this->numberField( [ 'step' => 0 ] ) ) );
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( $this->numberField( [ 'step' => -1 ] ) ) );
        $this->assertSame( [], $this->codesFor( $this->numberField( [ 'step' => 0.5 ] ) ) );
    }

    public function testOptionTypesRequireANonEmptyOptionList(): void
    {
        $this->assertSame( [ 'empty_collection' ], $this->codesFor( $this->radioField( [ 'options' => [] ] ) ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->radioField( [ 'options' => 'nope' ] ) ) );
    }

    public function testEachOptionNeedsLabelValueAndPrice(): void
    {
        $codes = $this->codesFor(
            $this->radioField( [ 'options' => [ [ 'label' => 'Only label' ] ] ] )
        );

        $this->assertSame( [ 'missing_field', 'missing_field' ], $codes );
    }

    public function testOptionPriceMustBeNumeric(): void
    {
        $codes = $this->codesFor(
            $this->radioField(
                [ 'options' => [ [ 'label' => 'A', 'value' => 'a', 'price' => 'free' ] ] ]
            )
        );

        $this->assertSame( [ 'invalid_type' ], $codes );
    }

    public function testOptionValuesMustBeUnique(): void
    {
        $codes = $this->codesFor(
            $this->radioField(
                [
                    'options' => [
                        [ 'label' => 'A', 'value' => 'same', 'price' => 0 ],
                        [ 'label' => 'B', 'value' => 'same', 'price' => 0 ],
                    ],
                ]
            )
        );

        $this->assertSame( [ 'duplicate_key' ], $codes );
    }

    public function testOptionErrorPathsPointAtTheOffendingOption(): void
    {
        $result = ( new FieldValidator() )->validate(
            'urgency',
            $this->radioField(
                [
                    'options' => [
                        [ 'label' => 'A', 'value' => 'a', 'price' => 0 ],
                        [ 'label' => 'B', 'value' => 'b', 'price' => 'free' ],
                    ],
                ]
            )
        );

        $this->assertSame( 'options.1.price', $result->getErrors()[0]['path'] );
    }

    public function testHtmlFieldRequiresContent(): void
    {
        $html = [
            'key' => 'intro', 'type' => 'html', 'label' => '', 'help' => '',
            'placeholder' => '', 'required' => false, 'default' => '', 'content' => '',
        ];

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $html ) );
    }

    public function testKeysThatDoNotBelongToTheTypeAreRejected(): void
    {
        $this->assertSame( [ 'unknown_key' ], $this->codesFor( $this->numberField( [ 'options' => [] ] ) ) );
    }

    public function testMissingCommonKeyIsReported(): void
    {
        $field = $this->numberField();
        unset( $field['help'] );

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $field ) );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make test ARGS="--filter FieldValidatorTest"`
Expected: FAIL — `Class "Quoteform\Forms\FieldValidator" not found`.

- [ ] **Step 3: `FieldValidator` sinfini yaz**

`includes/Forms/FieldValidator.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Bir sahəni tipinə görə yoxlayır.
 *
 * Qaytarılan yollar sahəyə NİSBİDİR (`label`, `options.1.price`) — orkestrator
 * onları `fields.<key>` prefiksi ilə birləşdirir.
 */
final class FieldValidator
{
    private const COMMON_KEYS = [ 'key', 'type', 'label', 'help', 'placeholder', 'required', 'default' ];

    /** @var array<string, string[]> */
    private const TYPE_KEYS = [
        'number'   => [ 'min', 'max', 'step' ],
        'text'     => [],
        'email'    => [],
        'tel'      => [],
        'textarea' => [],
        'select'   => [ 'options' ],
        'radio'    => [ 'options' ],
        'checkbox' => [ 'options' ],
        'toggle'   => [],
        'date'     => [],
        'slider'   => [ 'min', 'max', 'step' ],
        'hidden'   => [],
        'html'     => [ 'content' ],
    ];

    /** @var string[] Etiket tələb etməyən tiplər. */
    private const LABEL_OPTIONAL = [ 'hidden', 'html' ];

    /**
     * @return string[]
     */
    public static function types(): array
    {
        return array_keys( self::TYPE_KEYS );
    }

    /**
     * @param mixed $field
     */
    public function validate( string $key, $field ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $field ) ) {
            $result->addError( '', 'invalid_type', __( 'A field must be an object.', 'quoteform' ) );

            return $result;
        }

        $type = $field['type'] ?? null;

        if ( ! is_string( $type ) || ! isset( self::TYPE_KEYS[ $type ] ) ) {
            $result->addError(
                'type',
                'invalid_option',
                __( 'Unknown field type.', 'quoteform' ),
                [ 'type' => is_string( $type ) ? $type : null ]
            );

            return $result;
        }

        $allowed = array_merge( self::COMMON_KEYS, self::TYPE_KEYS[ $type ] );

        foreach ( array_keys( $field ) as $present ) {
            if ( ! in_array( $present, $allowed, true ) ) {
                $result->addError( (string) $present, 'unknown_key', __( 'This key does not belong to this field type.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( $allowed as $expected ) {
            if ( ! array_key_exists( $expected, $field ) ) {
                $hasMissingKey = true;
                $result->addError( $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
            }
        }

        if ( $hasMissingKey ) {
            return $result;
        }

        if ( ! is_string( $field['key'] ) || $field['key'] !== $key ) {
            $result->addError(
                'key',
                'key_mismatch',
                __( 'The field key must match the key it is stored under.', 'quoteform' ),
                [ 'expected' => $key ]
            );
        } else {
            KeyRules::validate( $field['key'], 'key', $result );
        }

        if ( ! in_array( $type, self::LABEL_OPTIONAL, true ) ) {
            if ( ! is_string( $field['label'] ) || trim( $field['label'] ) === '' ) {
                $result->addError( 'label', 'missing_field', __( 'A field needs a label.', 'quoteform' ) );
            }
        }

        foreach ( [ 'help', 'placeholder' ] as $text ) {
            if ( ! is_string( $field[ $text ] ) ) {
                $result->addError( $text, 'invalid_type', __( 'This value must be text.', 'quoteform' ) );
            }
        }

        if ( ! is_bool( $field['required'] ) ) {
            $result->addError( 'required', 'invalid_type', __( 'Required must be true or false.', 'quoteform' ) );
        }

        if ( in_array( $type, [ 'number', 'slider' ], true ) ) {
            $this->validateRange( $field, $result );
        }

        if ( in_array( $type, [ 'select', 'radio', 'checkbox' ], true ) ) {
            $this->validateOptions( $field['options'], $result );
        }

        if ( $type === 'html' && ( ! is_string( $field['content'] ) || trim( $field['content'] ) === '' ) ) {
            $result->addError( 'content', 'missing_field', __( 'An HTML block needs content.', 'quoteform' ) );
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $field
     */
    private function validateRange( array $field, ValidationResult $result ): void
    {
        foreach ( [ 'min', 'max', 'step' ] as $key ) {
            if ( ! is_int( $field[ $key ] ) && ! is_float( $field[ $key ] ) ) {
                $result->addError( $key, 'invalid_type', __( 'This value must be a number.', 'quoteform' ) );

                return;
            }
        }

        if ( $field['min'] > $field['max'] ) {
            $result->addError(
                'min',
                'out_of_range',
                __( 'The minimum cannot be greater than the maximum.', 'quoteform' ),
                [ 'min' => $field['min'], 'max' => $field['max'] ]
            );
        }

        if ( $field['step'] <= 0 ) {
            $result->addError( 'step', 'out_of_range', __( 'The step must be greater than zero.', 'quoteform' ) );
        }
    }

    /**
     * @param mixed $options
     */
    private function validateOptions( $options, ValidationResult $result ): void
    {
        if ( ! is_array( $options ) ) {
            $result->addError( 'options', 'invalid_type', __( 'Options must be a list.', 'quoteform' ) );

            return;
        }

        if ( $options === [] ) {
            $result->addError( 'options', 'empty_collection', __( 'This field needs at least one option.', 'quoteform' ) );

            return;
        }

        $seen = [];

        foreach ( $options as $index => $option ) {
            $path = 'options.' . $index;

            if ( ! is_array( $option ) ) {
                $result->addError( $path, 'invalid_type', __( 'An option must be an object.', 'quoteform' ) );

                continue;
            }

            if ( ! isset( $option['label'] ) || ! is_string( $option['label'] ) || trim( $option['label'] ) === '' ) {
                $result->addError( $path . '.label', 'missing_field', __( 'An option needs a label.', 'quoteform' ) );
            }

            if ( ! isset( $option['value'] ) || ! is_string( $option['value'] ) || trim( $option['value'] ) === '' ) {
                $result->addError( $path . '.value', 'missing_field', __( 'An option needs a value.', 'quoteform' ) );

                continue;
            }

            if ( ! array_key_exists( 'price', $option ) || ( ! is_int( $option['price'] ) && ! is_float( $option['price'] ) ) ) {
                $result->addError( $path . '.price', 'invalid_type', __( 'An option price must be a number.', 'quoteform' ) );
            }

            if ( isset( $seen[ $option['value'] ] ) ) {
                $result->addError(
                    $path . '.value',
                    'duplicate_key',
                    __( 'Option values must be unique within a field.', 'quoteform' ),
                    [ 'value' => $option['value'] ]
                );
            }

            $seen[ $option['value'] ] = true;
        }
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make test ARGS="--filter FieldValidatorTest"` və `make test74 ARGS="--filter FieldValidatorTest"`
Expected: hər ikisində 20 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Forms/FieldValidator.php tests/php/Forms/FieldValidatorTest.php
git commit -m "feat(forms): validate field definitions by type"
```

---
## Task 8: `StepValidator`

**Files:**
- Create: `includes/Forms/StepValidator.php`
- Test: `tests/php/Forms/StepValidatorTest.php`

**Interfaces:**
- Consumes: `ValidationResult`, `KeyRules`.
- Produces: `Quoteform\Forms\StepValidator` — `validate( $steps, array $fieldKeys ): ValidationResult`.

**Qaydalar:** addım siyahısı boş ola bilməz; hər addımda `key`, `title`, `description`, `fields`; addım açarları unikal və `KeyRules`-a uyğun; istinad olunan hər sahə mövcud olmalıdır; **hər sahə tam olaraq bir addıma aid olmalıdır** — nə yetim qalmalı, nə iki addımda təkrarlanmalı.

Yetim sahə xüsusilə vacibdir: sahə sxemdə var, amma heç bir addımda göstərilmirsə, müştəri onu heç vaxt doldura bilməz, lakin hesablama ona istinad edə bilər — nəticədə qiymət həmişə sıfır komponenti ilə hesablanar və səbəbi görünməz.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Forms/StepValidatorTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\StepValidator;

final class StepValidatorTest extends TestCase
{
    /**
     * @return array<int, array<string, mixed>>
     */
    private function steps(): array
    {
        return [
            [
                'key'         => 'step_property',
                'title'       => 'Your property',
                'description' => '',
                'fields'      => [ 'room_count', 'bathrooms' ],
            ],
            [
                'key'         => 'step_timing',
                'title'       => 'Timing',
                'description' => '',
                'fields'      => [ 'urgency' ],
            ],
        ];
    }

    /**
     * @return string[]
     */
    private function fieldKeys(): array
    {
        return [ 'room_count', 'bathrooms', 'urgency' ];
    }

    /**
     * @param array<int, mixed> $steps
     * @return string[]
     */
    private function codesFor( $steps, array $fieldKeys = null ): array
    {
        $result = ( new StepValidator() )->validate( $steps, $fieldKeys ?? $this->fieldKeys() );

        return array_column( $result->getErrors(), 'code' );
    }

    public function testValidStepsPass(): void
    {
        $this->assertSame( [], $this->codesFor( $this->steps() ) );
    }

    public function testStepsMustBeAList(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( 'nope' ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'a' => [] ] ) );
    }

    public function testStepsCannotBeEmpty(): void
    {
        $this->assertSame( [ 'empty_collection' ], $this->codesFor( [] ) );
    }

    public function testEachStepNeedsAllFourKeys(): void
    {
        $steps = $this->steps();
        unset( $steps[0]['description'] );

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $steps ) );
    }

    public function testUnknownKeyInAStepIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['colour'] = 'blue';

        $this->assertSame( [ 'unknown_key' ], $this->codesFor( $steps ) );
    }

    public function testStepKeyMustFollowTheKeyRules(): void
    {
        $steps = $this->steps();
        $steps[0]['key'] = '2nd';

        $this->assertSame( [ 'invalid_key_format' ], $this->codesFor( $steps ) );
    }

    public function testStepKeysMustBeUnique(): void
    {
        $steps = $this->steps();
        $steps[1]['key'] = $steps[0]['key'];

        $this->assertSame( [ 'duplicate_key' ], $this->codesFor( $steps ) );
    }

    public function testStepTitleCannotBeEmpty(): void
    {
        $steps = $this->steps();
        $steps[0]['title'] = '   ';

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $steps ) );
    }

    public function testAStepNeedsAtLeastOneField(): void
    {
        $steps = $this->steps();
        $steps[1]['fields'] = [];

        $codes = $this->codesFor( $steps );

        $this->assertContains( 'empty_collection', $codes );
    }

    public function testReferencingAnUnknownFieldIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['fields'][] = 'ghost';

        $codes = $this->codesFor( $steps );

        $this->assertContains( 'unknown_reference', $codes );
    }

    public function testAFieldCannotAppearInTwoSteps(): void
    {
        $steps = $this->steps();
        $steps[1]['fields'][] = 'room_count';

        $this->assertSame( [ 'duplicate_key' ], $this->codesFor( $steps ) );
    }

    public function testAFieldCannotAppearTwiceInOneStep(): void
    {
        $steps = $this->steps();
        $steps[0]['fields'][] = 'room_count';

        $this->assertSame( [ 'duplicate_key' ], $this->codesFor( $steps ) );
    }

    public function testErrorPathsPointAtTheOffendingStep(): void
    {
        $steps = $this->steps();
        $steps[1]['title'] = '';

        $result = ( new StepValidator() )->validate( $steps, $this->fieldKeys() );

        $this->assertSame( '1.title', $result->getErrors()[0]['path'] );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make test ARGS="--filter StepValidatorTest"`
Expected: FAIL — `Class "Quoteform\Forms\StepValidator" not found`.

- [ ] **Step 3: `StepValidator` sinfini yaz**

`includes/Forms/StepValidator.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Addımlar və onların sahə istinadları.
 *
 * Bir sahə iki addımda göstərilə bilməz. YETİM sahə (heç bir addımda olmayan)
 * isə burada YOX, `SchemaValidator`-da yoxlanılır: onun xəta yolu sxem kökünə
 * nisbi olmalıdır (`fields.<key>`), burada verilsəydi `steps` prefiksi ilə
 * birləşib mənasız `steps.fields.<key>` yoluna çevrilərdi.
 */
final class StepValidator
{
    private const STEP_KEYS = [ 'key', 'title', 'description', 'fields' ];

    /**
     * @param mixed    $steps
     * @param string[] $fieldKeys
     */
    public function validate( $steps, array $fieldKeys ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $steps ) || ( $steps !== [] && array_keys( $steps ) !== range( 0, count( $steps ) - 1 ) ) ) {
            $result->addError( '', 'invalid_type', __( 'Steps must be a list.', 'quoteform' ) );

            return $result;
        }

        if ( $steps === [] ) {
            $result->addError( '', 'empty_collection', __( 'A form needs at least one step.', 'quoteform' ) );

            return $result;
        }

        $seenStepKeys = [];
        $placedFields = [];

        foreach ( $steps as $index => $step ) {
            $path = (string) $index;

            if ( ! is_array( $step ) ) {
                $result->addError( $path, 'invalid_type', __( 'A step must be an object.', 'quoteform' ) );

                continue;
            }

            foreach ( array_keys( $step ) as $present ) {
                if ( ! in_array( $present, self::STEP_KEYS, true ) ) {
                    $result->addError( $path . '.' . $present, 'unknown_key', __( 'Unknown key in step.', 'quoteform' ) );
                }
            }

            foreach ( self::STEP_KEYS as $expected ) {
                if ( ! array_key_exists( $expected, $step ) ) {
                    $result->addError( $path . '.' . $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                }
            }

            if ( array_key_exists( 'key', $step ) ) {
                if ( ! is_string( $step['key'] ) ) {
                    $result->addError( $path . '.key', 'invalid_type', __( 'A step key must be text.', 'quoteform' ) );
                } elseif ( KeyRules::validate( $step['key'], $path . '.key', $result ) ) {
                    if ( isset( $seenStepKeys[ $step['key'] ] ) ) {
                        $result->addError( $path . '.key', 'duplicate_key', __( 'Step keys must be unique.', 'quoteform' ) );
                    }

                    $seenStepKeys[ $step['key'] ] = true;
                }
            }

            if ( array_key_exists( 'title', $step ) && ( ! is_string( $step['title'] ) || trim( $step['title'] ) === '' ) ) {
                $result->addError( $path . '.title', 'missing_field', __( 'A step needs a title.', 'quoteform' ) );
            }

            if ( ! is_string( $step['description'] ?? '' ) ) {
                $result->addError( $path . '.description', 'invalid_type', __( 'The description must be text.', 'quoteform' ) );
            }

            if ( array_key_exists( 'fields', $step ) ) {
                $this->validateStepFields( $step['fields'], $path, $fieldKeys, $placedFields, $result );
            }
        }

        return $result;
    }

    /**
     * @param mixed                 $fields
     * @param string[]              $fieldKeys
     * @param array<string, string> $placedFields
     */
    private function validateStepFields( $fields, string $path, array $fieldKeys, array &$placedFields, ValidationResult $result ): void
    {
        if ( ! is_array( $fields ) || ( $fields !== [] && array_keys( $fields ) !== range( 0, count( $fields ) - 1 ) ) ) {
            $result->addError( $path . '.fields', 'invalid_type', __( 'Step fields must be a list.', 'quoteform' ) );

            return;
        }

        if ( $fields === [] ) {
            $result->addError( $path . '.fields', 'empty_collection', __( 'A step needs at least one field.', 'quoteform' ) );

            return;
        }

        foreach ( $fields as $position => $fieldKey ) {
            $fieldPath = $path . '.fields.' . $position;

            if ( ! is_string( $fieldKey ) ) {
                $result->addError( $fieldPath, 'invalid_type', __( 'A field reference must be text.', 'quoteform' ) );

                continue;
            }

            if ( ! in_array( $fieldKey, $fieldKeys, true ) ) {
                $result->addError(
                    $fieldPath,
                    'unknown_reference',
                    __( 'This step refers to a field that does not exist.', 'quoteform' ),
                    [ 'field' => $fieldKey ]
                );

                continue;
            }

            if ( isset( $placedFields[ $fieldKey ] ) ) {
                $result->addError(
                    $fieldPath,
                    'duplicate_key',
                    __( 'A field can appear on only one step.', 'quoteform' ),
                    [ 'field' => $fieldKey, 'first_seen' => $placedFields[ $fieldKey ] ]
                );

                continue;
            }

            $placedFields[ $fieldKey ] = $fieldPath;
        }
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make test ARGS="--filter StepValidatorTest"` və `make test74 ARGS="--filter StepValidatorTest"`
Expected: hər ikisində 13 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Forms/StepValidator.php tests/php/Forms/StepValidatorTest.php
git commit -m "feat(forms): validate steps and field placement"
```

---
## Task 9: `CalculationValidator`

Bu, planın mühərriklə inteqrasiya olunan yeganə hissəsidir və sxem validasiyasının ən dəyərli qapısıdır: **sınıq formul heç vaxt bazaya düşmür.**

**Files:**
- Create: `includes/Forms/CalculationValidator.php`
- Test: `tests/php/Forms/CalculationValidatorTest.php`

**Interfaces:**
- Consumes: `ValidationResult`, `KeyRules`, `Quoteform\Support\TextPosition`, və Plan 01-dən `Quoteform\Engine\Expression` (`compile()`, `variables()`), `Quoteform\Engine\CalculationGraph` (`order()`), `Quoteform\Engine\ExpressionException` (`getCodeSlug()`, `getPosition()`).
- Produces: `Quoteform\Forms\CalculationValidator` — `validate( $calculations, array $fieldTypes ): ValidationResult`.

`$fieldTypes` — `açar => tip` xəritəsidir (`[ 'urgency' => 'radio' ]`). Tip lazımdır, çünki `{urgency.price}` yalnız seçim tipli sahələr üçün mənalıdır.

**Yoxlamalar:**

| Yoxlama | Kod |
|---|---|
| Siyahı, boş deyil | `invalid_type`, `empty_collection` |
| Dörd açar: `key`, `expression`, `label`, `visible` | `missing_field`, `unknown_key` |
| Açar formatı və unikallıq | `invalid_key_format`, `reserved_key`, `duplicate_key` |
| İfadə uzunluğu ≤ 1000 (Q5) | `expression_too_long` |
| **Mühərrik kompilyasiya edə bilirmi** | `invalid_expression` + `context.engine_code` + UTF-16 mövqe |
| İstinad olunan dəyişənlər mövcuddurmu | `unknown_reference` |
| `total` hesablaması varmı (Q3) | `missing_total` |
| **Dövri istinad** | `circular_reference` |

`.price` yalnız `select`, `radio`, `checkbox`, `toggle` sahələrində icazəlidir (spec §7.3).

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Forms/CalculationValidatorTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\CalculationValidator;

final class CalculationValidatorTest extends TestCase
{
    /**
     * @return array<string, string>
     */
    private function fieldTypes(): array
    {
        return [
            'room_count' => 'number',
            'bathrooms'  => 'number',
            'urgency'    => 'radio',
            'notes'      => 'textarea',
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function calculations(): array
    {
        return [
            [
                'key'        => 'subtotal',
                'expression' => '{room_count} * 50 + {bathrooms} * 120',
                'label'      => 'Subtotal',
                'visible'    => false,
            ],
            [
                'key'        => 'total',
                'expression' => 'round({subtotal} + {urgency.price}, 2)',
                'label'      => 'Total',
                'visible'    => true,
            ],
        ];
    }

    /**
     * @param mixed $calculations
     * @return string[]
     */
    private function codesFor( $calculations ): array
    {
        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );

        return array_column( $result->getErrors(), 'code' );
    }

    public function testValidCalculationsPass(): void
    {
        $this->assertSame( [], $this->codesFor( $this->calculations() ) );
    }

    public function testCalculationsMustBeANonEmptyList(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( 'nope' ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'a' => [] ] ) );
        $this->assertSame( [ 'empty_collection' ], $this->codesFor( [] ) );
    }

    public function testEachCalculationNeedsAllFourKeys(): void
    {
        $calculations = $this->calculations();
        unset( $calculations[0]['label'] );

        $this->assertContains( 'missing_field', $this->codesFor( $calculations ) );
    }

    public function testUnknownKeyIsRejected(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['colour'] = 'blue';

        $this->assertContains( 'unknown_key', $this->codesFor( $calculations ) );
    }

    public function testKeyMustFollowTheKeyRules(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['key'] = '2nd';

        $this->assertContains( 'invalid_key_format', $this->codesFor( $calculations ) );
    }

    public function testKeysMustBeUnique(): void
    {
        $calculations   = $this->calculations();
        $calculations[] = [ 'key' => 'subtotal', 'expression' => '1', 'label' => 'Dup', 'visible' => false ];

        $this->assertContains( 'duplicate_key', $this->codesFor( $calculations ) );
    }

    public function testVisibleMustBeBoolean(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['visible'] = 'yes';

        $this->assertContains( 'invalid_type', $this->codesFor( $calculations ) );
    }

    public function testTotalIsRequired(): void
    {
        $calculations = [ $this->calculations()[0] ];

        $this->assertSame( [ 'missing_total' ], $this->codesFor( $calculations ) );
    }

    public function testExpressionCannotBeEmpty(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = '   ';

        $this->assertContains( 'missing_field', $this->codesFor( $calculations ) );
    }

    public function testExpressionLengthIsCapped(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = '1 + ' . str_repeat( '1 + ', 300 ) . '1';

        $this->assertContains( 'expression_too_long', $this->codesFor( $calculations ) );
    }

    public function testBrokenExpressionIsRejectedWithTheEngineCode(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = '{room_count} * ';

        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );
        $error  = $result->getErrors()[0];

        $this->assertSame( 'invalid_expression', $error['code'] );
        $this->assertSame( 'unexpected_token', $error['context']['engine_code'] );
        $this->assertArrayHasKey( 'position', $error['context'] );
    }

    public function testExpressionErrorPositionIsInUtf16CodeUnits(): void
    {
        $calculations = $this->calculations();
        // "日本" ASCII-də 6 bayt, UTF-16-da 2 kod vahididir.
        $calculations[0]['expression'] = '1 + "' . "\u{65E5}\u{672C}" . '" # 2';

        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );

        $this->assertSame( 9, $result->getErrors()[0]['context']['position'] );
    }

    public function testUnknownVariableIsRejected(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = '{ghost} * 2';

        $codes = $this->codesFor( $calculations );

        $this->assertContains( 'unknown_reference', $codes );
    }

    public function testACalculationMayReferenceAnotherCalculation(): void
    {
        $this->assertSame( [], $this->codesFor( $this->calculations() ) );
    }

    public function testPriceSuffixIsAllowedOnOptionFields(): void
    {
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{subtotal} + {urgency.price}';

        $this->assertSame( [], $this->codesFor( $calculations ) );
    }

    public function testPriceSuffixIsRejectedOnNonOptionFields(): void
    {
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{subtotal} + {notes.price}';

        $this->assertContains( 'unknown_reference', $this->codesFor( $calculations ) );
    }

    public function testUnknownSuffixIsRejected(): void
    {
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{subtotal} + {urgency.colour}';

        $this->assertContains( 'unknown_reference', $this->codesFor( $calculations ) );
    }

    public function testDirectCycleIsRejected(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b}', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'b', 'expression' => '{a}', 'label' => 'B', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertContains( 'circular_reference', $this->codesFor( $calculations ) );
    }

    public function testSelfReferenceIsRejected(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{a} + 1', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertContains( 'circular_reference', $this->codesFor( $calculations ) );
    }

    public function testACycleIsStillReportedAlongsideAnUnrelatedError(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b} + 1', 'label' => 'A', 'visible' => false, 'colour' => 'blue' ],
            [ 'key' => 'b', 'expression' => '{a} + 1', 'label' => 'B', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '{a}', 'label' => 'Total', 'visible' => true ],
        ];

        $codes = $this->codesFor( $calculations );

        $this->assertContains( 'unknown_key', $codes );
        $this->assertContains( 'circular_reference', $codes );
    }

    public function testCycleIsNotCheckedWhenAnExpressionFailedToCompile(): void
    {
        // Sınıq ifadə varsa, qraf qurula bilməz — iki xəta əvəzinə bir aydın xəta göstəririk.
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b} * ', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '{a}', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertSame( [ 'invalid_expression' ], $this->codesFor( $calculations ) );
    }

    public function testErrorPathPointsAtTheOffendingCalculation(): void
    {
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{ghost}';

        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );

        $this->assertSame( '1.expression', $result->getErrors()[0]['path'] );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make test ARGS="--filter CalculationValidatorTest"`
Expected: FAIL — `Class "Quoteform\Forms\CalculationValidator" not found`.

- [ ] **Step 3: `CalculationValidator` sinfini yaz**

`includes/Forms/CalculationValidator.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

use Quoteform\Engine\CalculationGraph;
use Quoteform\Engine\Expression;
use Quoteform\Engine\ExpressionException;
use Quoteform\Support\TextPosition;

/**
 * Hesablamaları yoxlayır — sxem validasiyasının ən dəyərli qapısı.
 *
 * İfadələr burada HƏQİQƏTƏN kompilyasiya olunur, yəni sınıq formul bazaya düşmür.
 * Dövri istinad da burada tutulur, müştəri formanı açanda yox (spec §14.1).
 *
 * Mövqelər UTF-16 kod vahidinə çevrilir: mühərrik bayt ofseti verir, builder isə
 * JavaScript-dir və sətirləri UTF-16 kod vahidi ilə indeksləyir.
 */
final class CalculationValidator
{
    private const MAX_EXPRESSION_LENGTH = 1000;

    private const CALCULATION_KEYS = [ 'key', 'expression', 'label', 'visible' ];

    private const REQUIRED_CALCULATION = 'total';

    /** @var string[] `.price` şəkilçisi yalnız bu tiplərdə mənalıdır (spec §7.3). */
    private const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox', 'toggle' ];

    /**
     * @param mixed                 $calculations
     * @param array<string, string> $fieldTypes açar => tip
     */
    public function validate( $calculations, array $fieldTypes ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $calculations ) || ( $calculations !== [] && array_keys( $calculations ) !== range( 0, count( $calculations ) - 1 ) ) ) {
            $result->addError( '', 'invalid_type', __( 'Calculations must be a list.', 'quoteform' ) );

            return $result;
        }

        if ( $calculations === [] ) {
            $result->addError( '', 'empty_collection', __( 'A form needs at least one calculation.', 'quoteform' ) );

            return $result;
        }

        $keys = $this->collectKeys( $calculations, $result );

        if ( ! in_array( self::REQUIRED_CALCULATION, $keys, true ) ) {
            $result->addError(
                '',
                'missing_total',
                __( 'A form must have a calculation called "total".', 'quoteform' ),
                [ 'required' => self::REQUIRED_CALCULATION ]
            );
        }

        $compiled   = true;
        $structural = true;

        foreach ( $calculations as $index => $calculation ) {
            if ( ! is_array( $calculation ) || ! isset( $calculation['key'] ) || ! isset( $calculation['expression'] ) ) {
                $structural = false;

                continue;
            }

            if ( ! $this->validateExpression( (string) $index, $calculation['expression'], $keys, $fieldTypes, $result ) ) {
                $compiled = false;
            }
        }

        if ( $compiled && $structural ) {
            $this->validateGraph( $calculations, $result );
        }

        return $result;
    }

    /**
     * @param array<int, mixed> $calculations
     * @return string[]
     */
    private function collectKeys( array $calculations, ValidationResult $result ): array
    {
        $keys = [];

        foreach ( $calculations as $index => $calculation ) {
            $path = (string) $index;

            if ( ! is_array( $calculation ) ) {
                $result->addError( $path, 'invalid_type', __( 'A calculation must be an object.', 'quoteform' ) );

                continue;
            }

            foreach ( array_keys( $calculation ) as $present ) {
                if ( ! in_array( $present, self::CALCULATION_KEYS, true ) ) {
                    $result->addError( $path . '.' . $present, 'unknown_key', __( 'Unknown key in calculation.', 'quoteform' ) );
                }
            }

            foreach ( self::CALCULATION_KEYS as $expected ) {
                if ( ! array_key_exists( $expected, $calculation ) ) {
                    $result->addError( $path . '.' . $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                }
            }

            if ( isset( $calculation['label'] ) && ( ! is_string( $calculation['label'] ) || trim( $calculation['label'] ) === '' ) ) {
                $result->addError( $path . '.label', 'missing_field', __( 'A calculation needs a label.', 'quoteform' ) );
            }

            if ( array_key_exists( 'visible', $calculation ) && ! is_bool( $calculation['visible'] ) ) {
                $result->addError( $path . '.visible', 'invalid_type', __( 'Visible must be true or false.', 'quoteform' ) );
            }

            if ( ! isset( $calculation['key'] ) || ! is_string( $calculation['key'] ) ) {
                continue;
            }

            if ( ! KeyRules::validate( $calculation['key'], $path . '.key', $result ) ) {
                continue;
            }

            if ( in_array( $calculation['key'], $keys, true ) ) {
                $result->addError( $path . '.key', 'duplicate_key', __( 'Calculation keys must be unique.', 'quoteform' ) );

                continue;
            }

            $keys[] = $calculation['key'];
        }

        return $keys;
    }

    /**
     * @param mixed                 $expression
     * @param string[]              $calculationKeys
     * @param array<string, string> $fieldTypes
     */
    private function validateExpression( string $path, $expression, array $calculationKeys, array $fieldTypes, ValidationResult $result ): bool
    {
        $path .= '.expression';

        if ( ! is_string( $expression ) || trim( $expression ) === '' ) {
            $result->addError( $path, 'missing_field', __( 'A calculation needs an expression.', 'quoteform' ) );

            return false;
        }

        if ( strlen( $expression ) > self::MAX_EXPRESSION_LENGTH ) {
            $result->addError(
                $path,
                'expression_too_long',
                __( 'This expression is too long.', 'quoteform' ),
                [ 'length' => strlen( $expression ), 'max' => self::MAX_EXPRESSION_LENGTH ]
            );

            return false;
        }

        try {
            Expression::compile( $expression );
            $variables = Expression::variables( $expression );
        } catch ( ExpressionException $exception ) {
            $result->addError(
                $path,
                'invalid_expression',
                __( 'This expression could not be understood.', 'quoteform' ),
                [
                    'engine_code' => $exception->getCodeSlug(),
                    'position'    => TextPosition::byteToUtf16( $expression, $exception->getPosition() ),
                ]
            );

            return false;
        }

        foreach ( $variables as $variable ) {
            if ( ! $this->variableResolves( $variable, $calculationKeys, $fieldTypes ) ) {
                $result->addError(
                    $path,
                    'unknown_reference',
                    __( 'This expression refers to something that does not exist.', 'quoteform' ),
                    [ 'variable' => $variable ]
                );
            }
        }

        return true;
    }

    /**
     * @param string[]              $calculationKeys
     * @param array<string, string> $fieldTypes
     */
    private function variableResolves( string $variable, array $calculationKeys, array $fieldTypes ): bool
    {
        if ( strpos( $variable, '.' ) === false ) {
            return in_array( $variable, $calculationKeys, true ) || isset( $fieldTypes[ $variable ] );
        }

        [ $base, $suffix ] = explode( '.', $variable, 2 );

        if ( $suffix !== 'price' ) {
            return false;
        }

        return isset( $fieldTypes[ $base ] ) && in_array( $fieldTypes[ $base ], self::PRICE_BEARING_TYPES, true );
    }

    /**
     * @param array<int, mixed> $calculations
     */
    private function validateGraph( array $calculations, ValidationResult $result ): void
    {
        $graphInput = [];

        foreach ( $calculations as $calculation ) {
            $graphInput[] = [
                'key'        => $calculation['key'],
                'expression' => $calculation['expression'],
            ];
        }

        try {
            CalculationGraph::order( $graphInput );
        } catch ( ExpressionException $exception ) {
            $result->addError(
                '',
                $exception->getCodeSlug(),
                __( 'The calculations reference each other in a loop.', 'quoteform' ),
                $exception->getContext()
            );
        }
    }
}
```

**Niyə qraf yalnız kompilyasiyadan sonra yoxlanılır:** sınıq ifadə varsa, `Expression::variables()` onu oxuya bilmir və qraf natamam qurulardı. İki qarışıq xəta əvəzinə bir aydın xəta göstərmək daha faydalıdır.

**Niyə qapı `$result->isValid()` DEYİL:** `validateGraph()` hər hesablamanın `key` və `expression` açarlarını birbaşa oxuyur, ona görə struktur tamlığı tələb olunur — bunu `$structural` bayrağı verir. Lakin `unknown_key` və ya yanlış `label` kimi dəyər səviyyəli xəta qrafın qurulmasına mane olmur. `isValid()` ilə qapılsaydı, bir dənə artıq açar ən dəyərli diaqnostikanı — dövri istinadı — gizlədər və istifadəçini lazımsız ikinci dövrəyə salardı.

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make test ARGS="--filter CalculationValidatorTest"` və `make test74 ARGS="--filter CalculationValidatorTest"`
Expected: hər ikisində 22 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Forms/CalculationValidator.php tests/php/Forms/CalculationValidatorTest.php
git commit -m "feat(forms): validate calculations against the expression engine"
```

---
## Task 10: `RuleValidator`

**Files:**
- Create: `includes/Forms/RuleValidator.php`
- Test: `tests/php/Forms/RuleValidatorTest.php`

**Interfaces:**
- Consumes: `ValidationResult`.
- Produces: `Quoteform\Forms\RuleValidator` — `validate( $rules, array $fieldKeys, array $stepKeys ): ValidationResult`, statik `operators(): string[]`.

Spec §8-dəki qayda forması:

```json
{ "target": { "kind": "field|step", "key": "..." }, "action": "show|hide|require|optional",
  "match": "all|any", "conditions": [ { "field": "...", "operator": "...", "value": ... } ] }
```

`require` və `optional` yalnız sahəyə tətbiq olunur — addımı "məcburi" etmək mənasızdır.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Forms/RuleValidatorTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\RuleValidator;

final class RuleValidatorTest extends TestCase
{
    /**
     * @return array<int, array<string, mixed>>
     */
    private function rules(): array
    {
        return [
            [
                'target'     => [ 'kind' => 'field', 'key' => 'express_note' ],
                'action'     => 'show',
                'match'      => 'all',
                'conditions' => [
                    [ 'field' => 'urgency', 'operator' => 'equals', 'value' => 'express' ],
                ],
            ],
        ];
    }

    /**
     * @param mixed $rules
     * @return string[]
     */
    private function codesFor( $rules ): array
    {
        $result = ( new RuleValidator() )->validate(
            $rules,
            [ 'urgency', 'express_note', 'room_count' ],
            [ 'step_property', 'step_timing' ]
        );

        return array_column( $result->getErrors(), 'code' );
    }

    public function testTheTenOperatorsAreSupported(): void
    {
        $this->assertSame(
            [
                'equals', 'not_equals', 'greater', 'greater_or_equal', 'less',
                'less_or_equal', 'contains', 'not_contains', 'is_empty', 'is_not_empty',
            ],
            RuleValidator::operators()
        );
    }

    public function testValidRulesPass(): void
    {
        $this->assertSame( [], $this->codesFor( $this->rules() ) );
    }

    public function testAnEmptyRuleListIsFine(): void
    {
        $this->assertSame( [], $this->codesFor( [] ) );
    }

    public function testRulesMustBeAList(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( 'nope' ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'a' => [] ] ) );
    }

    public function testEachRuleNeedsAllFourKeys(): void
    {
        $rules = $this->rules();
        unset( $rules[0]['match'] );

        $this->assertContains( 'missing_field', $this->codesFor( $rules ) );
    }

    public function testUnknownKeyIsRejected(): void
    {
        $rules = $this->rules();
        $rules[0]['colour'] = 'blue';

        $this->assertContains( 'unknown_key', $this->codesFor( $rules ) );
    }

    public function testTargetKindIsRestricted(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['kind'] = 'planet';

        $this->assertContains( 'invalid_option', $this->codesFor( $rules ) );
    }

    public function testTargetFieldMustExist(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['key'] = 'ghost';

        $this->assertContains( 'unknown_reference', $this->codesFor( $rules ) );
    }

    public function testTargetStepMustExist(): void
    {
        $rules = $this->rules();
        $rules[0]['target'] = [ 'kind' => 'step', 'key' => 'ghost_step' ];

        $this->assertContains( 'unknown_reference', $this->codesFor( $rules ) );
    }

    public function testAStepTargetIsAcceptedWhenItExists(): void
    {
        $rules = $this->rules();
        $rules[0]['target'] = [ 'kind' => 'step', 'key' => 'step_timing' ];

        $this->assertSame( [], $this->codesFor( $rules ) );
    }

    public function testActionIsRestricted(): void
    {
        $rules = $this->rules();
        $rules[0]['action'] = 'explode';

        $this->assertContains( 'invalid_option', $this->codesFor( $rules ) );
    }

    public function testRequireActionIsRejectedForAStepTarget(): void
    {
        $rules = $this->rules();
        $rules[0]['target'] = [ 'kind' => 'step', 'key' => 'step_timing' ];
        $rules[0]['action'] = 'require';

        $this->assertContains( 'invalid_option', $this->codesFor( $rules ) );
    }

    public function testMatchIsRestricted(): void
    {
        $rules = $this->rules();
        $rules[0]['match'] = 'some';

        $this->assertContains( 'invalid_option', $this->codesFor( $rules ) );
    }

    public function testConditionsCannotBeEmpty(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = [];

        $this->assertContains( 'empty_collection', $this->codesFor( $rules ) );
    }

    public function testConditionFieldMustExist(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][0]['field'] = 'ghost';

        $this->assertContains( 'unknown_reference', $this->codesFor( $rules ) );
    }

    public function testConditionOperatorIsRestricted(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][0]['operator'] = 'sorta_equals';

        $this->assertContains( 'invalid_option', $this->codesFor( $rules ) );
    }

    public function testEmptinessOperatorsDoNotNeedAValue(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = [ [ 'field' => 'urgency', 'operator' => 'is_empty' ] ];

        $this->assertSame( [], $this->codesFor( $rules ) );
    }

    public function testOtherOperatorsRequireAValue(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = [ [ 'field' => 'urgency', 'operator' => 'equals' ] ];

        $this->assertContains( 'missing_field', $this->codesFor( $rules ) );
    }

    public function testARuleCannotTargetAFieldItAlsoTestsOn(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['key']          = 'urgency';
        $rules[0]['conditions'][0]['field'] = 'urgency';

        $this->assertContains( 'unknown_reference', $this->codesFor( $rules ) );
    }

    public function testErrorPathPointsAtTheOffendingCondition(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][] = [ 'field' => 'ghost', 'operator' => 'equals', 'value' => 'x' ];

        $result = ( new RuleValidator() )->validate(
            $rules,
            [ 'urgency', 'express_note', 'room_count' ],
            [ 'step_property', 'step_timing' ]
        );

        $this->assertSame( '0.conditions.1.field', $result->getErrors()[0]['path'] );
    }
}
```

Sondan üçüncü test bir məntiq tələsini kilidləyir: qayda öz şərtinin yoxladığı sahəni gizlədə bilməz. Əks halda sahə gizlənən kimi şərt yalan olur, sahə yenidən görünür və sonsuz dövrə yaranır.

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make test ARGS="--filter RuleValidatorTest"`
Expected: FAIL — `Class "Quoteform\Forms\RuleValidator" not found`.

- [ ] **Step 3: `RuleValidator` sinfini yaz**

`includes/Forms/RuleValidator.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Şərti məntiq qaydaları (spec §8).
 *
 * `require` və `optional` yalnız sahəyə tətbiq olunur — addımı məcburi etmək mənasızdır.
 *
 * Qayda öz şərtinin yoxladığı sahəni hədəf ala bilməz: sahə gizlənən kimi şərt
 * yalan olar, sahə yenidən görünər və sonsuz dövrə yaranar.
 */
final class RuleValidator
{
    private const RULE_KEYS = [ 'target', 'action', 'match', 'conditions' ];

    private const ACTIONS = [ 'show', 'hide', 'require', 'optional' ];

    /** @var string[] Yalnız sahəyə tətbiq olunan əməllər. */
    private const FIELD_ONLY_ACTIONS = [ 'require', 'optional' ];

    private const OPERATORS = [
        'equals',
        'not_equals',
        'greater',
        'greater_or_equal',
        'less',
        'less_or_equal',
        'contains',
        'not_contains',
        'is_empty',
        'is_not_empty',
    ];

    /** @var string[] Dəyər tələb etməyən operatorlar. */
    private const VALUELESS_OPERATORS = [ 'is_empty', 'is_not_empty' ];

    /**
     * @return string[]
     */
    public static function operators(): array
    {
        return self::OPERATORS;
    }

    /**
     * @param mixed    $rules
     * @param string[] $fieldKeys
     * @param string[] $stepKeys
     */
    public function validate( $rules, array $fieldKeys, array $stepKeys ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $rules ) || ( $rules !== [] && array_keys( $rules ) !== range( 0, count( $rules ) - 1 ) ) ) {
            $result->addError( '', 'invalid_type', __( 'Rules must be a list.', 'quoteform' ) );

            return $result;
        }

        foreach ( $rules as $index => $rule ) {
            $this->validateRule( (string) $index, $rule, $fieldKeys, $stepKeys, $result );
        }

        return $result;
    }

    /**
     * @param mixed    $rule
     * @param string[] $fieldKeys
     * @param string[] $stepKeys
     */
    private function validateRule( string $path, $rule, array $fieldKeys, array $stepKeys, ValidationResult $result ): void
    {
        if ( ! is_array( $rule ) ) {
            $result->addError( $path, 'invalid_type', __( 'A rule must be an object.', 'quoteform' ) );

            return;
        }

        foreach ( array_keys( $rule ) as $present ) {
            if ( ! in_array( $present, self::RULE_KEYS, true ) ) {
                $result->addError( $path . '.' . $present, 'unknown_key', __( 'Unknown key in rule.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( self::RULE_KEYS as $expected ) {
            if ( ! array_key_exists( $expected, $rule ) ) {
                $result->addError( $path . '.' . $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                $hasMissingKey = true;
            }
        }

        if ( $hasMissingKey ) {
            return;
        }

        $kind = $this->validateTarget( $path, $rule['target'], $fieldKeys, $stepKeys, $result );

        if ( ! in_array( $rule['action'], self::ACTIONS, true ) ) {
            $result->addError( $path . '.action', 'invalid_option', __( 'Unknown rule action.', 'quoteform' ) );
        } elseif ( $kind === 'step' && in_array( $rule['action'], self::FIELD_ONLY_ACTIONS, true ) ) {
            $result->addError(
                $path . '.action',
                'invalid_option',
                __( 'This action can only be applied to a field.', 'quoteform' ),
                [ 'action' => $rule['action'] ]
            );
        }

        if ( ! in_array( $rule['match'], [ 'all', 'any' ], true ) ) {
            $result->addError( $path . '.match', 'invalid_option', __( 'Match must be "all" or "any".', 'quoteform' ) );
        }

        $targetKey = is_array( $rule['target'] ) && isset( $rule['target']['key'] ) && is_string( $rule['target']['key'] )
            ? $rule['target']['key']
            : null;

        $this->validateConditions( $path, $rule['conditions'], $fieldKeys, $kind === 'field' ? $targetKey : null, $result );
    }

    /**
     * @param mixed    $target
     * @param string[] $fieldKeys
     * @param string[] $stepKeys
     */
    private function validateTarget( string $path, $target, array $fieldKeys, array $stepKeys, ValidationResult $result ): ?string
    {
        if ( ! is_array( $target ) || ! isset( $target['kind'], $target['key'] ) ) {
            $result->addError( $path . '.target', 'invalid_type', __( 'A rule target needs a kind and a key.', 'quoteform' ) );

            return null;
        }

        if ( ! in_array( $target['kind'], [ 'field', 'step' ], true ) ) {
            $result->addError( $path . '.target.kind', 'invalid_option', __( 'Target kind must be "field" or "step".', 'quoteform' ) );

            return null;
        }

        $known = $target['kind'] === 'field' ? $fieldKeys : $stepKeys;

        if ( ! is_string( $target['key'] ) || ! in_array( $target['key'], $known, true ) ) {
            $result->addError(
                $path . '.target.key',
                'unknown_reference',
                __( 'This rule targets something that does not exist.', 'quoteform' ),
                [ 'key' => is_string( $target['key'] ) ? $target['key'] : null ]
            );
        }

        return $target['kind'];
    }

    /**
     * @param mixed    $conditions
     * @param string[] $fieldKeys
     */
    private function validateConditions( string $path, $conditions, array $fieldKeys, ?string $targetKey, ValidationResult $result ): void
    {
        $path .= '.conditions';

        if ( ! is_array( $conditions ) || ( $conditions !== [] && array_keys( $conditions ) !== range( 0, count( $conditions ) - 1 ) ) ) {
            $result->addError( $path, 'invalid_type', __( 'Conditions must be a list.', 'quoteform' ) );

            return;
        }

        if ( $conditions === [] ) {
            $result->addError( $path, 'empty_collection', __( 'A rule needs at least one condition.', 'quoteform' ) );

            return;
        }

        foreach ( $conditions as $index => $condition ) {
            $conditionPath = $path . '.' . $index;

            if ( ! is_array( $condition ) || ! isset( $condition['field'], $condition['operator'] ) ) {
                $result->addError( $conditionPath, 'invalid_type', __( 'A condition needs a field and an operator.', 'quoteform' ) );

                continue;
            }

            if ( ! is_string( $condition['field'] ) || ! in_array( $condition['field'], $fieldKeys, true ) ) {
                $result->addError(
                    $conditionPath . '.field',
                    'unknown_reference',
                    __( 'This condition tests a field that does not exist.', 'quoteform' ),
                    [ 'field' => is_string( $condition['field'] ) ? $condition['field'] : null ]
                );

                continue;
            }

            if ( $targetKey !== null && $condition['field'] === $targetKey ) {
                $result->addError(
                    $conditionPath . '.field',
                    'unknown_reference',
                    __( 'A rule cannot test the same field it targets — that would loop forever.', 'quoteform' ),
                    [ 'field' => $condition['field'] ]
                );

                continue;
            }

            if ( ! in_array( $condition['operator'], self::OPERATORS, true ) ) {
                $result->addError( $conditionPath . '.operator', 'invalid_option', __( 'Unknown condition operator.', 'quoteform' ) );

                continue;
            }

            if ( ! in_array( $condition['operator'], self::VALUELESS_OPERATORS, true ) && ! array_key_exists( 'value', $condition ) ) {
                $result->addError( $conditionPath . '.value', 'missing_field', __( 'This operator needs a value.', 'quoteform' ) );
            }
        }
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make test ARGS="--filter RuleValidatorTest"` və `make test74 ARGS="--filter RuleValidatorTest"`
Expected: hər ikisində 20 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Forms/RuleValidator.php tests/php/Forms/RuleValidatorTest.php
git commit -m "feat(forms): validate conditional logic rules"
```

---
## Task 11: `SchemaValidator` (orkestrator)

**Files:**
- Create: `includes/Forms/SchemaValidator.php`
- Test: `tests/php/Forms/SchemaValidatorTest.php`

**Interfaces:**
- Consumes: `SettingsValidator`, `FieldValidator`, `StepValidator`, `CalculationValidator`, `RuleValidator`, `KeyRules`, `ValidationResult`.
- Produces: `Quoteform\Forms\SchemaValidator` — `validate( $schema ): ValidationResult`, sabit `CURRENT_VERSION = 1`.

**Əlavə qaydalar** (alt validatorların görə bilmədikləri):

- `version` tam ədəd və `CURRENT_VERSION`-a bərabər olmalıdır
- `fields` assosiativ xəritədir (siyahı deyil) və boş ola bilməz
- hər sahənin xəritədəki açarı `KeyRules`-a uyğun olmalıdır
- **sahə və hesablama açarları toqquşa bilməz** (Q2)

- [ ] **Step 1: Uğursuz testi yaz**

`tests/php/Forms/SchemaValidatorTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\SchemaValidator;

final class SchemaValidatorTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private function schema(): array
    {
        return [
            'version'  => 1,
            'settings' => [
                'currency'          => 'USD',
                'currency_position' => 'before',
                'decimals'          => 2,
                'submit_label'      => 'Get my quote',
                'success_action'    => 'message',
                'success_message'   => 'Thanks.',
                'redirect_url'      => '',
                'save_resume'       => true,
                'store_ip'          => false,
            ],
            'steps'    => [
                [
                    'key'         => 'step_property',
                    'title'       => 'Your property',
                    'description' => '',
                    'fields'      => [ 'room_count', 'urgency' ],
                ],
            ],
            'fields'   => [
                'room_count' => [
                    'key' => 'room_count', 'type' => 'number', 'label' => 'Rooms',
                    'help' => '', 'placeholder' => '', 'required' => true,
                    'default' => 1, 'min' => 0, 'max' => 20, 'step' => 1,
                ],
                'urgency'    => [
                    'key' => 'urgency', 'type' => 'radio', 'label' => 'How soon?',
                    'help' => '', 'placeholder' => '', 'required' => true, 'default' => 'standard',
                    'options' => [
                        [ 'label' => 'Standard', 'value' => 'standard', 'price' => 0 ],
                        [ 'label' => 'Express', 'value' => 'express', 'price' => 60 ],
                    ],
                ],
            ],
            'calculations' => [
                [
                    'key' => 'total', 'label' => 'Total', 'visible' => true,
                    'expression' => 'round({room_count} * 50 + {urgency.price}, 2)',
                ],
            ],
            'rules'         => [],
            'notifications' => [],
        ];
    }

    /**
     * @param mixed $schema
     * @return string[]
     */
    private function codesFor( $schema ): array
    {
        return array_column( ( new SchemaValidator() )->validate( $schema )->getErrors(), 'code' );
    }

    public function testAValidSchemaPasses(): void
    {
        $this->assertSame( [], $this->codesFor( $this->schema() ) );
    }

    public function testSchemaMustBeAnArray(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( 'nope' ) );
    }

    public function testVersionMustMatchTheCurrentVersion(): void
    {
        $this->assertSame( 1, SchemaValidator::CURRENT_VERSION );

        $schema = $this->schema();
        $schema['version'] = 2;

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $schema ) );
    }

    public function testVersionMustBeAnInteger(): void
    {
        $schema = $this->schema();
        $schema['version'] = '1';

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $schema ) );
    }

    public function testTopLevelKeysAreRequired(): void
    {
        $schema = $this->schema();
        unset( $schema['rules'] );

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $schema ) );
    }

    public function testUnknownTopLevelKeyIsRejected(): void
    {
        $schema = $this->schema();
        $schema['colour'] = 'blue';

        $this->assertSame( [ 'unknown_key' ], $this->codesFor( $schema ) );
    }

    public function testFieldsMustBeANonEmptyMap(): void
    {
        $schema = $this->schema();
        $schema['fields'] = [];

        $this->assertContains( 'empty_collection', $this->codesFor( $schema ) );
    }

    public function testFieldsMustNotBeAList(): void
    {
        $schema = $this->schema();
        $schema['fields'] = [ $this->schema()['fields']['room_count'] ];

        $this->assertContains( 'invalid_type', $this->codesFor( $schema ) );
    }

    public function testFieldMapKeyMustFollowTheKeyRules(): void
    {
        $schema = $this->schema();
        $field  = $schema['fields']['room_count'];
        unset( $schema['fields']['room_count'] );
        $field['key'] = '2nd';
        $schema['fields']['2nd'] = $field;
        $schema['steps'][0]['fields'] = [ '2nd', 'urgency' ];
        $schema['calculations'][0]['expression'] = 'round({urgency.price}, 2)';

        $this->assertContains( 'invalid_key_format', $this->codesFor( $schema ) );
    }

    public function testFieldAndCalculationKeysCannotCollide(): void
    {
        $schema = $this->schema();
        $schema['calculations'][] = [
            'key' => 'room_count', 'expression' => '1', 'label' => 'Clash', 'visible' => false,
        ];

        $this->assertContains( 'key_collision', $this->codesFor( $schema ) );
    }

    public function testSettingsErrorsArePrefixed(): void
    {
        $schema = $this->schema();
        $schema['settings']['decimals'] = 9;

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertSame( 'settings.decimals', $result->getErrors()[0]['path'] );
    }

    public function testFieldErrorsArePrefixedWithTheFieldKey(): void
    {
        $schema = $this->schema();
        $schema['fields']['room_count']['label'] = '';

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertSame( 'fields.room_count.label', $result->getErrors()[0]['path'] );
    }

    public function testStepErrorsArePrefixed(): void
    {
        $schema = $this->schema();
        $schema['steps'][0]['title'] = '';

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertSame( 'steps.0.title', $result->getErrors()[0]['path'] );
    }

    public function testCalculationErrorsArePrefixed(): void
    {
        $schema = $this->schema();
        $schema['calculations'][0]['expression'] = '{ghost}';

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertSame( 'calculations.0.expression', $result->getErrors()[0]['path'] );
    }

    public function testRuleErrorsArePrefixed(): void
    {
        $schema = $this->schema();
        $schema['rules'] = [
            [
                'target' => [ 'kind' => 'field', 'key' => 'ghost' ],
                'action' => 'show', 'match' => 'all',
                'conditions' => [ [ 'field' => 'urgency', 'operator' => 'equals', 'value' => 'express' ] ],
            ],
        ];

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertSame( 'rules.0.target.key', $result->getErrors()[0]['path'] );
    }

    public function testAFieldNotPlacedOnAnyStepIsReported(): void
    {
        $schema = $this->schema();
        $schema['fields']['forgotten'] = [
            'key' => 'forgotten', 'type' => 'text', 'label' => 'Forgotten',
            'help' => '', 'placeholder' => '', 'required' => false, 'default' => '',
        ];

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertSame( 'unknown_reference', $result->getErrors()[0]['code'] );
        $this->assertSame( 'fields.forgotten', $result->getErrors()[0]['path'] );
    }

    public function testNotificationsMustBeAList(): void
    {
        $schema = $this->schema();
        $schema['notifications'] = 'nope';

        $this->assertContains( 'invalid_type', $this->codesFor( $schema ) );
    }

    public function testABrokenExpressionIsCaughtAtSaveTime(): void
    {
        $schema = $this->schema();
        $schema['calculations'][0]['expression'] = 'round({room_count} * ';

        $this->assertContains( 'invalid_expression', $this->codesFor( $schema ) );
    }

    public function testACircularReferenceIsCaughtAtSaveTime(): void
    {
        $schema = $this->schema();
        $schema['calculations'] = [
            [ 'key' => 'a', 'expression' => '{b}', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'b', 'expression' => '{a}', 'label' => 'B', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertContains( 'circular_reference', $this->codesFor( $schema ) );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make test ARGS="--filter SchemaValidatorTest"`
Expected: FAIL — `Class "Quoteform\Forms\SchemaValidator" not found`.

- [ ] **Step 3: `SchemaValidator` sinfini yaz**

`includes/Forms/SchemaValidator.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxemin bütövlükdə validasiyası.
 *
 * Alt validatorları çağırır və onların nisbi yollarını mütləq yola çevirir
 * (`decimals` → `settings.decimals`), ona görə builder xətanı düzgün
 * sahənin yanında göstərə bilir.
 */
final class SchemaValidator
{
    public const CURRENT_VERSION = 1;

    private const TOP_LEVEL_KEYS = [ 'version', 'settings', 'steps', 'fields', 'calculations', 'rules', 'notifications' ];

    /**
     * @param mixed $schema
     */
    public function validate( $schema ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $schema ) ) {
            $result->addError( '', 'invalid_type', __( 'A schema must be an object.', 'quoteform' ) );

            return $result;
        }

        foreach ( array_keys( $schema ) as $present ) {
            if ( ! in_array( $present, self::TOP_LEVEL_KEYS, true ) ) {
                $result->addError( (string) $present, 'unknown_key', __( 'Unknown key in schema.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( self::TOP_LEVEL_KEYS as $expected ) {
            if ( ! array_key_exists( $expected, $schema ) ) {
                $hasMissingKey = true;
                $result->addError( $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
            }
        }

        if ( $hasMissingKey ) {
            return $result;
        }

        if ( ! is_int( $schema['version'] ) ) {
            $result->addError( 'version', 'invalid_type', __( 'Schema version must be a whole number.', 'quoteform' ) );

            return $result;
        }

        if ( $schema['version'] !== self::CURRENT_VERSION ) {
            $result->addError(
                'version',
                'invalid_option',
                __( 'Unsupported schema version.', 'quoteform' ),
                [ 'expected' => self::CURRENT_VERSION, 'given' => $schema['version'] ]
            );

            return $result;
        }

        $result->merge( ( new SettingsValidator() )->validate( $schema['settings'] ), 'settings' );

        $fieldTypes = $this->validateFields( $schema['fields'], $result );
        $fieldKeys  = array_keys( $fieldTypes );

        $result->merge( ( new StepValidator() )->validate( $schema['steps'], $fieldKeys ), 'steps' );

        $this->validateFieldPlacement( $schema['steps'], $fieldKeys, $result );

        $result->merge( ( new CalculationValidator() )->validate( $schema['calculations'], $fieldTypes ), 'calculations' );

        $this->validateKeyCollisions( $fieldKeys, $schema['calculations'], $result );

        $stepKeys = $this->collectStepKeys( $schema['steps'] );

        $result->merge( ( new RuleValidator() )->validate( $schema['rules'], $fieldKeys, $stepKeys ), 'rules' );

        if ( ! is_array( $schema['notifications'] ) ) {
            $result->addError( 'notifications', 'invalid_type', __( 'Notifications must be a list.', 'quoteform' ) );
        }

        return $result;
    }

    /**
     * @param mixed $fields
     * @return array<string, string> açar => tip
     */
    private function validateFields( $fields, ValidationResult $result ): array
    {
        if ( ! is_array( $fields ) ) {
            $result->addError( 'fields', 'invalid_type', __( 'Fields must be an object.', 'quoteform' ) );

            return [];
        }

        if ( $fields === [] ) {
            $result->addError( 'fields', 'empty_collection', __( 'A form needs at least one field.', 'quoteform' ) );

            return [];
        }

        if ( array_keys( $fields ) === range( 0, count( $fields ) - 1 ) ) {
            $result->addError( 'fields', 'invalid_type', __( 'Fields must be keyed by field key, not a list.', 'quoteform' ) );

            return [];
        }

        $validator = new FieldValidator();
        $types     = [];

        foreach ( $fields as $key => $field ) {
            $key  = (string) $key;
            $path = 'fields.' . $key;

            if ( ! KeyRules::validate( $key, $path, $result ) ) {
                continue;
            }

            $result->merge( $validator->validate( $key, $field ), $path );

            if ( is_array( $field ) && isset( $field['type'] ) && is_string( $field['type'] ) ) {
                $types[ $key ] = $field['type'];
            }
        }

        return $types;
    }

    /**
     * Heç bir addıma yerləşdirilməyən sahələri tapır.
     *
     * Bu yoxlama `StepValidator`-da DEYİL, çünki xəta yolu sxem kökünə nisbi
     * olmalıdır (`fields.<key>`). Orada verilsəydi, `steps` prefiksi ilə
     * birləşib mənasız `steps.fields.<key>` yoluna çevrilərdi.
     *
     * Yetim sahə təhlükəlidir: müştəri onu doldura bilmir, amma hesablama ona
     * istinad edə bilər — qiymət səssizcə sıfır komponenti ilə çıxar.
     *
     * @param mixed    $steps
     * @param string[] $fieldKeys
     */
    private function validateFieldPlacement( $steps, array $fieldKeys, ValidationResult $result ): void
    {
        if ( ! is_array( $steps ) ) {
            return;
        }

        $placed = [];

        foreach ( $steps as $step ) {
            if ( ! is_array( $step ) || ! isset( $step['fields'] ) || ! is_array( $step['fields'] ) ) {
                continue;
            }

            foreach ( $step['fields'] as $fieldKey ) {
                if ( is_string( $fieldKey ) ) {
                    $placed[ $fieldKey ] = true;
                }
            }
        }

        foreach ( $fieldKeys as $fieldKey ) {
            if ( ! isset( $placed[ $fieldKey ] ) ) {
                $result->addError(
                    'fields.' . $fieldKey,
                    'unknown_reference',
                    __( 'This field is not placed on any step, so nobody can fill it in.', 'quoteform' ),
                    [ 'field' => $fieldKey ]
                );
            }
        }
    }

    /**
     * @param string[] $fieldKeys
     * @param mixed    $calculations
     */
    private function validateKeyCollisions( array $fieldKeys, $calculations, ValidationResult $result ): void
    {
        if ( ! is_array( $calculations ) ) {
            return;
        }

        foreach ( $calculations as $index => $calculation ) {
            if ( ! is_array( $calculation ) || ! isset( $calculation['key'] ) || ! is_string( $calculation['key'] ) ) {
                continue;
            }

            if ( in_array( $calculation['key'], $fieldKeys, true ) ) {
                $result->addError(
                    'calculations.' . $index . '.key',
                    'key_collision',
                    __( 'A calculation cannot have the same key as a field.', 'quoteform' ),
                    [ 'key' => $calculation['key'] ]
                );
            }
        }
    }

    /**
     * @param mixed $steps
     * @return string[]
     */
    private function collectStepKeys( $steps ): array
    {
        if ( ! is_array( $steps ) ) {
            return [];
        }

        $keys = [];

        foreach ( $steps as $step ) {
            if ( is_array( $step ) && isset( $step['key'] ) && is_string( $step['key'] ) ) {
                $keys[] = $step['key'];
            }
        }

        return $keys;
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make test ARGS="--filter SchemaValidatorTest"` və `make test74 ARGS="--filter SchemaValidatorTest"`
Expected: hər ikisində 19 test PASS.

- [ ] **Step 5: Bütün vahid dəsti qaçır**

Run: `make test && make test74`
Expected: Plan 01-in testləri ilə birlikdə hamısı yaşıl.

- [ ] **Step 6: Commit hazırla**

```bash
git add includes/Forms/SchemaValidator.php tests/php/Forms/SchemaValidatorTest.php
git commit -m "feat(forms): add schema validation orchestrator"
```

---
## Task 12: `SchemaRepository`

**Files:**
- Create: `includes/Forms/SchemaRepository.php`
- Test: `tests/integration/SchemaRepositoryTest.php`

**Interfaces:**
- Consumes: `FormPostType` (`POST_TYPE`, `META_SCHEMA`), `SchemaValidator` (`CURRENT_VERSION`).
- Produces: `Quoteform\Forms\SchemaRepository` —
  - `defaults(): array` — yeni forma üçün **validasiyadan keçən** minimal sxem
  - `find( int $formId ): ?array` — sxem yoxdursa `null`
  - `save( int $formId, array $schema ): bool`
  - `exists( int $formId ): bool`

`defaults()` təsadüfi nümunə deyil: testi onun `SchemaValidator`-dan keçdiyini yoxlayır. Yeni formanın ilk andan etibarlı olması builder üçün vacibdir — əks halda istifadəçi heç nə etmədən xəta ekranı görər.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/integration/SchemaRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Forms\SchemaValidator;
use WP_UnitTestCase;

final class SchemaRepositoryTest extends WP_UnitTestCase
{
    /** @var SchemaRepository */
    private $repository;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        $this->repository = new SchemaRepository();
    }

    private function createForm(): int
    {
        return (int) wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => 'Test form',
                'post_status' => 'publish',
            ]
        );
    }

    public function testDefaultsPassValidation(): void
    {
        $result = ( new SchemaValidator() )->validate( SchemaRepository::defaults() );

        $this->assertTrue(
            $result->isValid(),
            'Yeni formanın default sxemi validasiyadan keçməlidir: '
                . wp_json_encode( $result->getErrors() )
        );
    }

    public function testDefaultsUseTheCurrentSchemaVersion(): void
    {
        $this->assertSame( SchemaValidator::CURRENT_VERSION, SchemaRepository::defaults()['version'] );
    }

    public function testFindReturnsNullForAFormWithoutASchema(): void
    {
        $this->assertNull( $this->repository->find( $this->createForm() ) );
    }

    public function testFindReturnsNullForAMissingPost(): void
    {
        $this->assertNull( $this->repository->find( 999999 ) );
    }

    public function testSaveThenFindRoundTripsTheSchema(): void
    {
        $formId = $this->createForm();
        $schema = SchemaRepository::defaults();

        $this->assertTrue( $this->repository->save( $formId, $schema ) );
        $this->assertSame( $schema, $this->repository->find( $formId ) );
    }

    public function testSaveOverwritesAPreviousSchema(): void
    {
        $formId = $this->createForm();

        $first = SchemaRepository::defaults();
        $this->repository->save( $formId, $first );

        $second = SchemaRepository::defaults();
        $second['settings']['currency'] = 'AZN';
        $this->repository->save( $formId, $second );

        $this->assertSame( 'AZN', $this->repository->find( $formId )['settings']['currency'] );
    }

    public function testSaveRejectsAPostOfTheWrongType(): void
    {
        $postId = (int) wp_insert_post( [ 'post_type' => 'post', 'post_title' => 'Blog post' ] );

        $this->assertFalse( $this->repository->save( $postId, SchemaRepository::defaults() ) );
    }

    public function testExistsReflectsWhetherAFormIsThere(): void
    {
        $formId = $this->createForm();

        $this->assertTrue( $this->repository->exists( $formId ) );
        $this->assertFalse( $this->repository->exists( 999999 ) );
    }

    public function testExistsIsFalseForAPostOfTheWrongType(): void
    {
        $postId = (int) wp_insert_post( [ 'post_type' => 'post', 'post_title' => 'Blog post' ] );

        $this->assertFalse( $this->repository->exists( $postId ) );
    }

    public function testNestedStructuresSurviveTheRoundTrip(): void
    {
        $formId = $this->createForm();
        $schema = SchemaRepository::defaults();

        $schema['rules'] = [
            [
                'target'     => [ 'kind' => 'field', 'key' => 'quantity' ],
                'action'     => 'show',
                'match'      => 'all',
                'conditions' => [ [ 'field' => 'quantity', 'operator' => 'greater', 'value' => 5 ] ],
            ],
        ];

        $this->repository->save( $formId, $schema );

        $this->assertSame( $schema['rules'], $this->repository->find( $formId )['rules'] );
    }

    public function testBooleanAndNumericTypesSurviveTheRoundTrip(): void
    {
        $formId = $this->createForm();
        $schema = SchemaRepository::defaults();

        $this->repository->save( $formId, $schema );
        $loaded = $this->repository->find( $formId );

        $this->assertIsBool( $loaded['settings']['save_resume'] );
        $this->assertIsInt( $loaded['settings']['decimals'] );
        $this->assertIsBool( $loaded['calculations'][0]['visible'] );
    }
}
```

Son test bir tələni kilidləyir: WordPress post meta-nı serialize edərkən tipləri qoruyur, amma JSON kimi saxlasaq və `json_decode(..., true)` ilə oxusaq, `true`/`1` fərqi itə bilər. Sxem validasiyası tipə sərt baxdığı üçün bu, saxlamadan sonra formanın "etibarsız" olmasına gətirib çıxarardı.

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make itest ARGS="--filter SchemaRepositoryTest"`
Expected: FAIL — `Class "Quoteform\Forms\SchemaRepository" not found`.

- [ ] **Step 3: `SchemaRepository` sinfini yaz**

`includes/Forms/SchemaRepository.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sxemin post meta-da saxlanması.
 *
 * Sxem massiv kimi saxlanılır, JSON sətri kimi yox: WordPress meta-nı özü
 * serialize edir və tipləri qoruyur. JSON sətri kimi saxlasaq, `true` ilə `1`
 * fərqi itər və sxem yenidən oxunanda validasiyadan keçməzdi.
 */
final class SchemaRepository
{
    /**
     * Yeni formanın başlanğıc sxemi.
     *
     * Bu sxem `SchemaValidator`-dan keçməlidir — testi bunu yoxlayır.
     * Yeni forma ilk andan etibarlı olmalıdır, əks halda istifadəçi
     * heç nə etmədən xəta ekranı görər.
     *
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'version'  => SchemaValidator::CURRENT_VERSION,
            'settings' => [
                'currency'          => 'USD',
                'currency_position' => 'before',
                'decimals'          => 2,
                'submit_label'      => __( 'Get my quote', 'quoteform' ),
                'success_action'    => 'message',
                'success_message'   => __( 'Thanks — your quote is on the way.', 'quoteform' ),
                'redirect_url'      => '',
                'save_resume'       => true,
                'store_ip'          => false,
            ],
            'steps'    => [
                [
                    'key'         => 'step_one',
                    'title'       => __( 'Your details', 'quoteform' ),
                    'description' => '',
                    'fields'      => [ 'quantity' ],
                ],
            ],
            'fields'   => [
                'quantity' => [
                    'key'         => 'quantity',
                    'type'        => 'number',
                    'label'       => __( 'How many?', 'quoteform' ),
                    'help'        => '',
                    'placeholder' => '',
                    'required'    => true,
                    'default'     => 1,
                    'min'         => 1,
                    'max'         => 100,
                    'step'        => 1,
                ],
            ],
            'calculations' => [
                [
                    'key'        => 'total',
                    'expression' => 'round({quantity} * 100, 2)',
                    'label'      => __( 'Total', 'quoteform' ),
                    'visible'    => true,
                ],
            ],
            'rules'         => [],
            'notifications' => [],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find( int $formId ): ?array
    {
        if ( ! $this->exists( $formId ) ) {
            return null;
        }

        $schema = get_post_meta( $formId, FormPostType::META_SCHEMA, true );

        return is_array( $schema ) ? $schema : null;
    }

    /**
     * @param array<string, mixed> $schema
     */
    public function save( int $formId, array $schema ): bool
    {
        if ( ! $this->exists( $formId ) ) {
            return false;
        }

        update_post_meta( $formId, FormPostType::META_SCHEMA, $schema );

        return true;
    }

    public function exists( int $formId ): bool
    {
        $post = get_post( $formId );

        return $post !== null && $post->post_type === FormPostType::POST_TYPE;
    }
}
```

**Qeyd:** `update_post_meta` dəyər dəyişməyibsə `false` qaytarır, ona görə onun nəticəsi qaytarılmır — `save()` yalnız formanın mövcudluğunu bildirir.

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make itest ARGS="--filter SchemaRepositoryTest"`
Expected: 11 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Forms/SchemaRepository.php tests/integration/SchemaRepositoryTest.php
git commit -m "feat(forms): add schema repository with valid defaults"
```

---
## Task 13: `FormsController` — oxuma marşrutları

**Files:**
- Create: `includes/Rest/FormsController.php`
- Test: `tests/integration/FormsControllerReadTest.php`

**Interfaces:**
- Consumes: `SchemaRepository`, `FormPostType`, `Capabilities`.
- Produces: `Quoteform\Rest\FormsController` — sabit `NAMESPACE = 'quoteform/v1'`, `registerRoutes(): void`, `getItems( \WP_REST_Request $request )`, `getItem( \WP_REST_Request $request )`, `checkPermission(): bool`.

**Cavab forması** (Plan 03 builder-i bundan asılı olacaq):

```
GET /quoteform/v1/forms      → [ { "id": 12, "title": "Cleaning", "modified": "2026-09-15T11:20:45" } ]
GET /quoteform/v1/forms/12   → { "id": 12, "title": "Cleaning", "schema": { ... } }
```

- [ ] **Step 1: Uğursuz testi yaz**

`tests/integration/FormsControllerReadTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Rest\FormsController;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

final class FormsControllerReadTest extends WP_UnitTestCase
{
    /** @var WP_REST_Server */
    private $server;

    protected function setUp(): void
    {
        parent::setUp();

        FormPostType::register();
        Activation::activate();

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        ( new FormsController() )->registerRoutes();

        do_action( 'rest_api_init' );
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function loginAsManager(): void
    {
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );
    }

    private function loginAsSubscriber(): void
    {
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'subscriber' ] ) );
    }

    private function createForm( string $title = 'Cleaning quote' ): int
    {
        $formId = (int) wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => $title,
                'post_status' => 'publish',
            ]
        );

        ( new SchemaRepository() )->save( $formId, SchemaRepository::defaults() );

        return $formId;
    }

    public function testRoutesAreRegistered(): void
    {
        $routes = $this->server->get_routes();

        $this->assertArrayHasKey( '/quoteform/v1/forms', $routes );
        $this->assertArrayHasKey( '/quoteform/v1/forms/(?P<id>[\d]+)', $routes );
    }

    public function testListRequiresTheManageCapability(): void
    {
        $this->loginAsSubscriber();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) );

        $this->assertSame( 403, $response->get_status() );
    }

    public function testListRejectsLoggedOutVisitors(): void
    {
        wp_set_current_user( 0 );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) );

        $this->assertSame( 401, $response->get_status() );
    }

    public function testListReturnsForms(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) );
        $data     = $response->get_data();

        $this->assertSame( 200, $response->get_status() );
        $this->assertCount( 1, $data );
        $this->assertSame( $formId, $data[0]['id'] );
        $this->assertSame( 'Cleaning quote', $data[0]['title'] );
        $this->assertArrayHasKey( 'modified', $data[0] );
    }

    public function testListDoesNotIncludeTheSchema(): void
    {
        $this->loginAsManager();
        $this->createForm();

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $this->assertArrayNotHasKey( 'schema', $data[0] );
    }

    public function testListExcludesTrashedForms(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();
        wp_trash_post( $formId );

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $this->assertSame( [], $data );
    }

    public function testListExcludesOtherPostTypes(): void
    {
        $this->loginAsManager();
        wp_insert_post( [ 'post_type' => 'post', 'post_title' => 'Blog post', 'post_status' => 'publish' ] );

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $this->assertSame( [], $data );
    }

    public function testSingleFormReturnsTheSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );
        $data     = $response->get_data();

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( $formId, $data['id'] );
        $this->assertSame( SchemaRepository::defaults(), $data['schema'] );
    }

    public function testSingleFormFallsBackToDefaultsWhenNoSchemaIsStored(): void
    {
        $this->loginAsManager();

        $formId = (int) wp_insert_post(
            [ 'post_type' => FormPostType::POST_TYPE, 'post_title' => 'Bare', 'post_status' => 'publish' ]
        );

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) )->get_data();

        $this->assertSame( SchemaRepository::defaults(), $data['schema'] );
    }

    public function testSingleFormReturns404ForAMissingForm(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/999999' ) );

        $this->assertSame( 404, $response->get_status() );
        $this->assertSame( 'qform_form_not_found', $response->get_data()['code'] );
    }

    public function testSingleFormReturns404ForAPostOfTheWrongType(): void
    {
        $this->loginAsManager();
        $postId = (int) wp_insert_post( [ 'post_type' => 'post', 'post_title' => 'Blog post' ] );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $postId ) );

        $this->assertSame( 404, $response->get_status() );
    }

    public function testSingleFormRequiresTheManageCapability(): void
    {
        $formId = $this->createForm();
        $this->loginAsSubscriber();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 403, $response->get_status() );
    }
}
```

`testSingleFormFallsBackToDefaultsWhenNoSchemaIsStored` bir qərarı kilidləyir: sxemi olmayan forma xəta yox, default sxem qaytarır. Builder beləliklə yeni formanı heç bir xüsusi hal olmadan aça bilir.

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make itest ARGS="--filter FormsControllerReadTest"`
Expected: FAIL — `Class "Quoteform\Rest\FormsController" not found`.

- [ ] **Step 3: `FormsController` sinfini yaz (yalnız oxuma marşrutları)**

`includes/Rest/FormsController.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rest;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Support\Capabilities;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Formaların REST interfeysi.
 *
 * Controller nazikdir: icazəni yoxlayır, repozitoriyanı çağırır, cavabı formalaşdırır.
 * Validasiya məntiqi burada deyil — o, `SchemaValidator`-dadır və WordPress-siz test edilir.
 */
final class FormsController
{
    public const NAMESPACE = 'quoteform/v1';

    /** @var SchemaRepository */
    private $repository;

    public function __construct( ?SchemaRepository $repository = null )
    {
        $this->repository = $repository ?? new SchemaRepository();
    }

    public function registerRoutes(): void
    {
        register_rest_route(
            self::NAMESPACE,
            '/forms',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'getItems' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                ],
            ]
        );

        register_rest_route(
            self::NAMESPACE,
            '/forms/(?P<id>[\d]+)',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'getItem' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                    'args'                => [
                        'id' => [
                            'required'          => true,
                            'validate_callback' => static function ( $value ) {
                                return is_numeric( $value ) && (int) $value > 0;
                            },
                        ],
                    ],
                ],
            ]
        );
    }

    public function checkPermission(): bool
    {
        return current_user_can( Capabilities::MANAGE_FORMS );
    }

    public function getItems( WP_REST_Request $request ): WP_REST_Response
    {
        unset( $request );

        $posts = get_posts(
            [
                'post_type'      => FormPostType::POST_TYPE,
                'post_status'    => [ 'publish', 'draft' ],
                'numberposts'    => 100,
                'orderby'        => 'modified',
                'order'          => 'DESC',
                'suppress_filters' => false,
            ]
        );

        $items = [];

        foreach ( $posts as $post ) {
            $items[] = [
                'id'       => (int) $post->ID,
                'title'    => $post->post_title,
                'modified' => mysql_to_rfc3339( $post->post_modified_gmt ),
            ];
        }

        return new WP_REST_Response( $items, 200 );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function getItem( WP_REST_Request $request )
    {
        $formId = (int) $request['id'];

        if ( ! $this->repository->exists( $formId ) ) {
            return $this->notFound();
        }

        $post   = get_post( $formId );
        $schema = $this->repository->find( $formId );

        return new WP_REST_Response(
            [
                'id'     => $formId,
                'title'  => $post->post_title,
                'schema' => $schema ?? SchemaRepository::defaults(),
            ],
            200
        );
    }

    protected function notFound(): WP_Error
    {
        return new WP_Error(
            'qform_form_not_found',
            __( 'Form not found.', 'quoteform' ),
            [ 'status' => 404 ]
        );
    }
}
```

- [ ] **Step 4: Testlərin keçdiyini təsdiqlə**

Run: `make itest ARGS="--filter FormsControllerReadTest"`
Expected: 12 test PASS.

- [ ] **Step 5: Commit hazırla**

```bash
git add includes/Rest/FormsController.php tests/integration/FormsControllerReadTest.php
git commit -m "feat(rest): add form list and read endpoints"
```

---
## Task 14: `FormsController` — yazma marşrutları

**Files:**
- Modify: `includes/Rest/FormsController.php`
- Test: `tests/integration/FormsControllerWriteTest.php`

**Interfaces:**
- Consumes: Task 13-dəki `FormsController`, `SchemaValidator`, `SchemaRepository`.
- Produces: `createItem()`, `updateItem()`, `deleteItem()` metodları və uyğun marşrutlar.

**Validasiya xətasının cavab forması** — builder bundan asılı olacaq:

```json
{
  "code": "qform_invalid_schema",
  "message": "The form could not be saved.",
  "data": {
    "status": 400,
    "errors": [
      { "path": "calculations.0.expression", "code": "invalid_expression",
        "message": "...", "context": { "engine_code": "unexpected_token", "position": 14 } }
    ]
  }
}
```

- [ ] **Step 1: Uğursuz testi yaz**

`tests/integration/FormsControllerWriteTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Rest\FormsController;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

final class FormsControllerWriteTest extends WP_UnitTestCase
{
    /** @var WP_REST_Server */
    private $server;

    protected function setUp(): void
    {
        parent::setUp();

        FormPostType::register();
        Activation::activate();

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        ( new FormsController() )->registerRoutes();

        do_action( 'rest_api_init' );
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function loginAsManager(): void
    {
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );
    }

    private function createFormViaRest( string $title = 'New quote form' ): int
    {
        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => $title ] );

        return (int) $this->server->dispatch( $request )->get_data()['id'];
    }

    public function testCreateReturns201AndTheDefaultSchema(): void
    {
        $this->loginAsManager();

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => 'Cleaning quote' ] );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 201, $response->get_status() );
        $this->assertGreaterThan( 0, $data['id'] );
        $this->assertSame( 'Cleaning quote', $data['title'] );
        $this->assertSame( SchemaRepository::defaults(), $data['schema'] );
    }

    public function testCreateStoresTheDefaultSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $this->assertSame( SchemaRepository::defaults(), ( new SchemaRepository() )->find( $formId ) );
    }

    public function testCreateRequiresATitle(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'POST', '/quoteform/v1/forms' ) );

        $this->assertSame( 400, $response->get_status() );
    }

    public function testCreateRequiresTheManageCapability(): void
    {
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'subscriber' ] ) );

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => 'Nope' ] );

        $this->assertSame( 403, $this->server->dispatch( $request )->get_status() );
    }

    public function testUpdateSavesAValidSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['settings']['currency'] = 'AZN';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Renamed', 'schema' => $schema ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( 'AZN', ( new SchemaRepository() )->find( $formId )['settings']['currency'] );
        $this->assertSame( 'Renamed', get_post( $formId )->post_title );
    }

    public function testUpdateRejectsABrokenExpression(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['calculations'][0]['expression'] = 'round({quantity} * ';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Broken', 'schema' => $schema ] );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'qform_invalid_schema', $data['code'] );
        $this->assertSame( 'calculations.0.expression', $data['data']['errors'][0]['path'] );
        $this->assertSame( 'invalid_expression', $data['data']['errors'][0]['code'] );
        $this->assertSame( 'unexpected_token', $data['data']['errors'][0]['context']['engine_code'] );
    }

    public function testARejectedUpdateLeavesTheStoredSchemaUntouched(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['calculations'][0]['expression'] = '{ghost}';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Broken', 'schema' => $schema ] );
        $this->server->dispatch( $request );

        $this->assertSame(
            SchemaRepository::defaults(),
            ( new SchemaRepository() )->find( $formId ),
            'Sınıq sxem bazaya düşməməlidir.'
        );
    }

    public function testUpdateRejectsACircularReference(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['calculations'] = [
            [ 'key' => 'a', 'expression' => '{b}', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'b', 'expression' => '{a}', 'label' => 'B', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Loop', 'schema' => $schema ] );

        $data = $this->server->dispatch( $request )->get_data();

        $this->assertSame( 'circular_reference', $data['data']['errors'][0]['code'] );
    }

    public function testUpdateReturnsEveryErrorNotJustTheFirst(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['settings']['decimals']          = 9;
        $schema['fields']['quantity']['label']   = '';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Two problems', 'schema' => $schema ] );

        $errors = $this->server->dispatch( $request )->get_data()['data']['errors'];

        $this->assertGreaterThanOrEqual( 2, count( $errors ) );
    }

    public function testUpdateReturns404ForAMissingForm(): void
    {
        $this->loginAsManager();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/999999' );
        $request->set_body_params( [ 'title' => 'Ghost', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 404, $this->server->dispatch( $request )->get_status() );
    }

    public function testUpdateRequiresTheManageCapability(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        wp_set_current_user( $this->factory->user->create( [ 'role' => 'subscriber' ] ) );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Nope', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 403, $this->server->dispatch( $request )->get_status() );
    }

    public function testDeleteTrashesTheForm(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( 'trash', get_post_status( $formId ) );
    }

    public function testDeleteReturns404ForAMissingForm(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/999999' ) );

        $this->assertSame( 404, $response->get_status() );
    }
}
```

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make itest ARGS="--filter FormsControllerWriteTest"`
Expected: FAIL — marşrutlar qeydiyyatda deyil (404).

- [ ] **Step 3: `registerRoutes()`-u genişləndir**

`includes/Rest/FormsController.php`-dəki `/forms` marşrut massivinə `GET` girişindən SONRA əlavə et:

```php
                [
                    'methods'             => 'POST',
                    'callback'            => [ $this, 'createItem' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                    'args'                => [
                        'title' => [
                            'required'          => true,
                            'type'              => 'string',
                            'sanitize_callback' => 'sanitize_text_field',
                            'validate_callback' => static function ( $value ) {
                                return is_string( $value ) && trim( $value ) !== '';
                            },
                        ],
                    ],
                ],
```

Və `/forms/(?P<id>[\d]+)` marşrut massivinə `GET` girişindən SONRA:

```php
                [
                    'methods'             => 'PUT, PATCH',
                    'callback'            => [ $this, 'updateItem' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                    'args'                => [
                        'title' => [
                            'required'          => true,
                            'type'              => 'string',
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                        'schema' => [
                            'required' => true,
                            'type'     => 'object',
                        ],
                    ],
                ],
                [
                    'methods'             => 'DELETE',
                    'callback'            => [ $this, 'deleteItem' ],
                    'permission_callback' => [ $this, 'checkPermission' ],
                ],
```

- [ ] **Step 4: Yazma metodlarını əlavə et**

`notFound()` metodundan ƏVVƏL əlavə et:

```php
    /**
     * @return WP_REST_Response|WP_Error
     */
    public function createItem( WP_REST_Request $request )
    {
        $formId = wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => (string) $request['title'],
                'post_status' => 'publish',
            ],
            true
        );

        if ( is_wp_error( $formId ) ) {
            return new WP_Error(
                'qform_create_failed',
                __( 'The form could not be created.', 'quoteform' ),
                [ 'status' => 500 ]
            );
        }

        $schema = SchemaRepository::defaults();

        $this->repository->save( (int) $formId, $schema );

        return new WP_REST_Response(
            [
                'id'     => (int) $formId,
                'title'  => (string) $request['title'],
                'schema' => $schema,
            ],
            201
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function updateItem( WP_REST_Request $request )
    {
        $formId = (int) $request['id'];

        if ( ! $this->repository->exists( $formId ) ) {
            return $this->notFound();
        }

        $schema = $request['schema'];
        $result = ( new SchemaValidator() )->validate( $schema );

        if ( ! $result->isValid() ) {
            return new WP_Error(
                'qform_invalid_schema',
                __( 'The form could not be saved.', 'quoteform' ),
                [
                    'status' => 400,
                    'errors' => $result->getErrors(),
                ]
            );
        }

        wp_update_post(
            [
                'ID'         => $formId,
                'post_title' => (string) $request['title'],
            ]
        );

        $this->repository->save( $formId, $schema );

        return new WP_REST_Response(
            [
                'id'     => $formId,
                'title'  => (string) $request['title'],
                'schema' => $schema,
            ],
            200
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function deleteItem( WP_REST_Request $request )
    {
        $formId = (int) $request['id'];

        if ( ! $this->repository->exists( $formId ) ) {
            return $this->notFound();
        }

        wp_trash_post( $formId );

        return new WP_REST_Response( [ 'id' => $formId, 'deleted' => true ], 200 );
    }
```

Faylın başına `use Quoteform\Forms\SchemaValidator;` əlavə et.

**Diqqət:** validasiya uğursuz olduqda `wp_update_post` və `save` ÇAĞIRILMIR — sınıq sxem bazaya düşmür. `testARejectedUpdateLeavesTheStoredSchemaUntouched` məhz bunu kilidləyir.

- [ ] **Step 5: Testlərin keçdiyini təsdiqlə**

Run: `make itest ARGS="--filter FormsControllerWriteTest"`
Expected: 13 test PASS.

- [ ] **Step 6: Commit hazırla**

```bash
git add includes/Rest/FormsController.php tests/integration/FormsControllerWriteTest.php
git commit -m "feat(rest): add form create, update and delete endpoints"
```

---

## Task 15: Plugin bootstrap və uçdan-uca yoxlama

**Files:**
- Create: `includes/Plugin.php`
- Modify: `quoteform.php` (bootstrap çağırışı)
- Test: `tests/integration/PluginTest.php`

**Interfaces:**
- Consumes: `Activation`, `FormPostType`, `FormsController`.
- Produces: `Quoteform\Plugin` — statik `boot(): void`.

- [ ] **Step 1: Uğursuz testi yaz**

`tests/integration/PluginTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Plugin;
use Quoteform\Rest\FormsController;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

final class PluginTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    public function testBootRegistersThePostTypeOnInit(): void
    {
        Plugin::boot();

        do_action( 'init' );

        $this->assertTrue( post_type_exists( FormPostType::POST_TYPE ) );
    }

    public function testBootRegistersTheRestRoutes(): void
    {
        Plugin::boot();

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();

        do_action( 'rest_api_init' );

        $this->assertArrayHasKey( '/quoteform/v1/forms', $wp_rest_server->get_routes() );
    }

    public function testBootIsIdempotent(): void
    {
        Plugin::boot();
        Plugin::boot();

        do_action( 'init' );

        $this->assertTrue( post_type_exists( FormPostType::POST_TYPE ) );
    }

    /**
     * Uçdan-uca: forma yaradılır, sxem redaktə olunur, saxlanılır və geri oxunur —
     * hamısı REST üzərindən, builder-in edəcəyi kimi.
     */
    public function testEndToEndFormLifecycleOverRest(): void
    {
        FormPostType::register();
        Activation::activate();
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        ( new FormsController() )->registerRoutes();
        do_action( 'rest_api_init' );

        // 1. Yarat
        $create = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $create->set_body_params( [ 'title' => 'Cleaning quote' ] );
        $created = $wp_rest_server->dispatch( $create );

        $this->assertSame( 201, $created->get_status() );
        $formId = $created->get_data()['id'];

        // 2. Siyahıda görünsün
        $list = $wp_rest_server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();
        $this->assertSame( [ $formId ], array_column( $list, 'id' ) );

        // 3. Sxemi redaktə et — otaq sayına görə qiymət
        $schema = SchemaRepository::defaults();
        $schema['fields']['quantity']['label'] = 'How many rooms?';
        $schema['calculations'][0]['expression'] = 'round({quantity} * 50, 2)';

        $update = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $update->set_body_params( [ 'title' => 'Cleaning quote', 'schema' => $schema ] );

        $this->assertSame( 200, $wp_rest_server->dispatch( $update )->get_status() );

        // 4. Geri oxu
        $read = $wp_rest_server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 'How many rooms?', $read->get_data()['schema']['fields']['quantity']['label'] );

        // 5. Saxlanılmış ifadə mühərrikdə işləsin
        $this->assertSame(
            150.0,
            \Quoteform\Engine\Expression::evaluate(
                $read->get_data()['schema']['calculations'][0]['expression'],
                [ 'quantity' => 3.0 ]
            )
        );

        // 6. Sil
        $this->assertSame(
            200,
            $wp_rest_server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId ) )->get_status()
        );
        $this->assertSame( 'trash', get_post_status( $formId ) );
    }
}
```

Beşinci addım bu planın əsas vədini kilidləyir: REST-dən keçib bazaya düşən ifadə həqiqətən mühərrikdə işləyir.

- [ ] **Step 2: Testin uğursuz olduğunu təsdiqlə**

Run: `make itest ARGS="--filter PluginTest"`
Expected: FAIL — `Class "Quoteform\Plugin" not found`.

- [ ] **Step 3: `Plugin` sinfini yaz**

`includes/Plugin.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform;

use Quoteform\Forms\FormPostType;
use Quoteform\Rest\FormsController;
use Quoteform\Support\Activation;

/**
 * Pluginin bootstrap-ı.
 *
 * Yalnız hook qeydiyyatı aparır — heç bir iş burada görülmür.
 * Aktivasiya hook-ları faylın yüklənməsi anında qeyd olunmalıdır,
 * `init`-də yox, çünki WordPress onları daha erkən çağırır.
 */
final class Plugin
{
    /** @var bool */
    private static $booted = false;

    public static function boot(): void
    {
        if ( self::$booted ) {
            return;
        }

        self::$booted = true;

        if ( defined( 'QFORM_FILE' ) ) {
            register_activation_hook( QFORM_FILE, [ Activation::class, 'activate' ] );
            register_deactivation_hook( QFORM_FILE, [ Activation::class, 'deactivate' ] );
        }

        add_action( 'init', [ FormPostType::class, 'register' ] );

        add_action(
            'rest_api_init',
            static function (): void {
                ( new FormsController() )->registerRoutes();
            }
        );
    }
}
```

- [ ] **Step 4: `quoteform.php`-ni yenilə**

Faylın sonuna, `require_once QFORM_PATH . 'vendor/autoload.php';` sətrindən SONRA əlavə et:

```php

Quoteform\Plugin::boot();
```

- [ ] **Step 5: Testlərin keçdiyini təsdiqlə**

Run: `make itest ARGS="--filter PluginTest"`
Expected: 4 test PASS.

- [ ] **Step 6: Bütün dəstləri qaçır**

Run: `make check`
Expected: vahid (PHP 8.2 və 7.4), Jest və inteqrasiya — hamısı yaşıl.

- [ ] **Step 7: Real WordPress-də yoxla**

Run:
```bash
make up
make setup
make site ARGS="plugin list"
make site ARGS="eval 'var_dump( post_type_exists( \"quoteform\" ) );'"
```
Expected: plugin `active`, `bool(true)`.

- [ ] **Step 8: Commit hazırla**

```bash
git add includes/Plugin.php quoteform.php tests/integration/PluginTest.php
git commit -m "feat: wire plugin bootstrap and register hooks"
```

---

## Planın Sonu — Nə Alındı

- `quoteform` CPT, öz capability-ləri ilə
- Sxemin sərt validasiyası: tiplər, açar qaydaları, addım istinadları, şərti məntiq, və **ifadələrin həqiqi kompilyasiyası** — sınıq formul bazaya düşmür
- Dövri istinadın saxlama anında tutulması
- Beş REST marşrutu, hər biri capability ilə qorunan
- Xəta kodları və UTF-16 mövqeləri ilə builder-ə hazır cavab forması
- WordPress inteqrasiya test mühiti

**Növbəti plan (03 — React builder):** bu REST interfeysini idarə edən admin SPA. Sxem forması və xəta kodları artıq sabitdir, ona görə builder onların üzərinə qurula bilər.

**Plan 04-ə köçürülən işlər:** entries cədvəli, göndərmə axını, frontend renderer, email, save & resume, CSV eksportu, uninstall təmizliyi.
