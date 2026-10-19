# Entries Admin Implementation Plan (Plan 07)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sayt sahibi Quoteform → **Entries** ekranında müraciətləri Forms ilə eyni app shell-də görsün: filtrləsin, sıralasın, səhifələsin, açsın (açılan oxunmuş olur), oxunmuş/oxunmamış işarələsin, silsin və cari filtrlə CSV eksport etsin; menyuda oxunmamış say nişanı olsun.

**Architecture:** Server tərəfində filtrlərin yeganə normallaşdırılması `Entries\EntryFilters`-dədir (WP-siz, JS əkizi `admin-src/entries/filters.js`, paritet `tests/fixtures/entry-filters.json`). Bütün SQL `Entries\EntryQuery`-dən keçir — REST siyahısı, qonşu müraciətlər (keyset) və CSV eksportu EYNİ obyekti işlədir. `Entries\EntryPresenter` məbləği (`MoneyFormatter`), tarixi (`wp_date`) və cavabları serverdə hazırlayır; JS-də ikinci format kodu yoxdur. Yeni `Rest\EntriesAdminController` mövcud ictimai `POST /entries` route-una GET əlavə edir; `Admin\EntriesPage` menyunu, nişanı və ayrıca `build/entries.js` paketini qoşur; `Admin\EntriesExport` `admin-post` ilə CSV axıdır. Brauzerdə kiçik URL router (`EntriesApp`) siyahı və detal ekranlarını, tək canlı sahəni (mövcud `createAnnouncer`) və fokus qaydalarını idarə edir.

**Tech Stack:** PHP 7.4+ (WordPress 6.2+, `$wpdb`, REST API, `admin-post`), JavaScript ESM + React (`@wordpress/element`, `@wordpress/api-fetch`, `@wordpress/i18n`, `@wordpress/scripts` webpack), Jest 29 + Testing Library, PHPUnit 9.6 (unit + WP inteqrasiya), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-quoteform-entries-admin-design.md` (bağlayıcı). Əsası: `docs/superpowers/specs/2026-09-24-quoteform-submissions-entries-design.md` — onun §7-si əvəz olunub, §8 (CSV) yeni spec §5 ilə dəqiqləşdirilib, qalan hər şey qüvvədədir. Plan 06 dərsləri: `.superpowers/sdd/2026-09-24-quoteform-06-submissions/progress.md` (R1–R15).

## Global Constraints

- **PHP 7.4 minimum:** `match`, nullsafe `?->`, union tipli imzalar, constructor promotion, `str_contains`/`str_starts_with` **yoxdur**. Hər PHP dəyişikliyi `./bin/phpunit`, `QF_PHP=php:7.4-cli ./bin/phpunit` və `make itest` ilə yoxlanılır.
- **Prefikslər:** PHP `Quoteform\`, option/meta/nonce/hook `qform_`, CSS `.quoteform_`, text domain `'quoteform'`. JS ESM, uzantısız nisbi importlar (`from './filters'`).
- **Commit YOXDUR** (istifadəçinin qlobal qaydası). Hər task "Verify" addımları ilə bitir; executor `git add`/`git commit` işlətmir.
- **Mövcud test faylları dəyişdirilmir.** Yeni assertion-lar yeni fayllara gedir. Mövcud test düşürsə — səbəb koddadır, hesabat ver.
- **Test köməkçi adları** `PHPUnit\Framework\TestCase` / `WP_UnitTestCase` üzvləri ilə toqquşmur (`run`, `count`, `getName`, `fail`, `setUp`, `tearDown`, `runBare`, `toString`). Bu planın köməkçiləri: `seedEntry`, `entryDefaults`, `listed`, `around`, `call`, `export`, `parsed`, `asAdmin`, `asViewer`, `asEditor`, `freshMenus`, `buildMenus`, `entryQueriesDuring`.
- **PHPUnit qüsuru:** istisna mesajları zibil sətirlə əvəz olunur (CLAUDE.md). Test düşəndə səbəbi `docker run --rm -v "$PWD":/app -w /app php:8.2-cli php -r 'require "vendor/autoload.php"; var_dump(...);'` ilə, inteqrasiyada `make site ARGS="eval '...'"` ilə tap.
- **Menyu nişanı:** admin səhifəsi yüklənəndə ən çox **bir** indeksli `COUNT` (`status_read` açarı: `status = 'completed' AND read_at IS NULL`), yalnız `qform_view_entries` olan istifadəçi üçün. Mənbə `EntryRepository::countUnread()` — REST cavablarındakı `unread` də eyni metoddandır.
- **Bir sorğu qurucusu:** siyahı, qonşular və CSV yalnız `Entries\EntryQuery` ilə qurulur; filtr parametrləri yalnız `EntryFilters::normalise()` (PHP) və `normaliseFilters()` (JS) ilə oxunur; ikisi `tests/fixtures/entry-filters.json` ilə kilidlidir. Fixture-ın gözlənilən dəyəri testi keçirmək üçün **heç vaxt** dəyişdirilmir (paritet qaydası).
- **Səhifə ölçüsü:** user meta `qform_entries_per_page`, 1–100-ə sıxılır, default 20, URL-ə yazılmır (`EntryPreferences`).
- **Tarixlər:** `created_at` UTC-dir (`gmdate`). Çevirmə yalnız `wp_timezone()` ilə; `from` = yerli `00:00:00`, `to` = yerli `23:59:59`, UTC-yə çevrilib müqayisə olunur. Göstərmə `wp_date()` ilə serverdə.
- **Dəqiq məbləğ:** SQL-də total müqayisəsi həmişə `CAST(%s AS DECIMAL(18,4))` ilədir (MySQL sətir↔DECIMAL müqayisəsini double-da aparır — 18 rəqəmli total-lar bərabər görünər). Xam `total` cavabda DB-nin onluq sətridir (`total_decimal`), float-dan keçmir. Pul formatı yalnız serverdə (`Runtime\MoneyFormatter`, müraciətin öz snapshot-ı + `$wp_locale` ayırıcıları).
- **Xam saxlama, çıxışda escape (R15):** REST JSON mətni xam qaytarır (esc_html YOX — React onu text node kimi göstərir); `dangerouslySetInnerHTML` Entries kodunda qadağandır (Task 13 testi); PHP-nin HTML çıxışı `esc_*` ilə; inline JSON `wp_json_encode( …, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT )`; idarəedici simvolların silinməsi və CSV injection qoruması YALNIZ CSV-də.
- **Mətn kəsilmir:** istifadəçi mətninə `substr`/`strlen`/`mb_substr` tətbiq olunmur (bayt↔simvol səhvi sinfi aradan qalxır); uzun mətn CSS ilə sarınır/ellipsis olur. Yeganə `strlen` — binar IP sütununun bayt uzunluğu (4/16).
- **SQL:** hər dəyər `$wpdb->prepare()` ilə; hazırlanmış fraqment bir daha `prepare()`-ə verilmir; `LIMIT`/`OFFSET` və id siyahıları `(int)` çevrilməsi ilə; sütun/istiqamət yalnız ağ siyahıdakı literallar. Yalnız `status = 'completed'` sətirlər görünür/dəyişir.
- **Nonce semantikası:** REST — cookie auth + `X-WP-Nonce`, onu `wp-api-fetch` özü əlavə edir (JS heç vaxt nonce qurmur). CSV — `admin-post.php?action=qform_export_entries&_wpnonce=…`, nonce action `qform_export_entries`, URL `add_query_arg()` ilə (**`wp_nonce_url()` YOX** — o `&amp;` qaytarır, JSON-a düşəndə `amp;_wpnonce` gedir və eksport həmişə 403 olur).
- **Tək canlı sahə:** Entries ekranında yalnız bir `aria-live` elementi var — `frontend-src/dom/announce.js`-in `createAnnouncer`-i (kopya yox, import). `Notice` Entries-də `live={ false }` ilə işlənir; xətalar `announce( msg, { force: true } )` ilə elan olunur (eyni xəta təkrar olsa belə səslənsin, R13).
- **Fokus:** səhifə dəyişəndə, detal açılıb-bağlananda, sətirlər silinəndə fokus ekranın `h1`-inə (`tabIndex={ -1 }`); təsdiq ləğv olunanda fokus onu açan düyməyə; fokuslu düymə `disabled` edilmir, əgər yerində qalmalıdırsa (oxunmuş/oxunmamış keçidi).
- **`build/` repodadır:** hər JS/SCSS dəyişikliyindən sonra `npm run build` və `make buildcheck`. `Only in build: … 2.js` kimi sətirlər iCloud nüsxələridir — faylı sil, build-i dəyişmə.
- **e2e dev DB-də qaçır:** əvvəl `make site ARGS="db export --skip-ssl /var/www/html/wp-content/plugins/quoteform/.superpowers/dev-db-backup.sql"`; yalnız testin özünün yaratdığını sil (`null` qoruyucusu, `builder.spec.js` naxışı); sonra 8, 40, 328 formalarının `publish` qaldığını yoxla. Paralel spec-lər nişan sayını dəyişməsin deyə `--workers=1`.

## Review Focus

1. **Yavaş şəbəkədə tez filtr dəyişmək** — köhnə sorğunun gec gələn cavabı yeni siyahını əvəz etmir; siyahı hər yenilənəndə seçim sıfırlanır, ona görə toplu silmə ekranda görünməyən sətirə toxunmur (Task 11 testləri).
2. **Son səhifədəki hər şeyi silmək** (və ya köhnə `&paged=9` linki) — boş "No entries match" yox, yeni son səhifə göstərilir; server səhifəni sıxır, JS URL-i düzəldir (Task 2 və Task 11 testləri).
3. **"New" filtri ilə müraciətləri bir-bir oxumaq** — açılan müraciət oxunur və artıq filtrə uyğun gəlmir, amma Older/Newer hələ də düzgün qonşunu tapır (keyset sıralama mövqeyinə görədir, filtrə üzvlüyə görə yox) (Task 3 və Task 5 testləri).
4. **Endirimli (mənfi) total və ya `\"` olan mətn CSV-də** — `-25.5000` rəqəm kimi qalır (`'` önəki yalnız formula oxşayan mətnə), `C:\"x"` RFC 4180 üzrə düzgün dırnaqlanır, NUL baytlı mətn formula qoruyucusundan yayınmır (Task 6 testləri).
5. **Forma adında `</script>` və ya `&`** (admin `unfiltered_html` ilə yaza bilir) — inline konfiqurasiya `<script>`-dən çıxmır, eksport linkində nonce `&amp;` ilə pozulmur (Task 7 testləri).

---

## Plan yazılarkən dəqiqləşən qərarlar (spec-in susduğu və ya iki cür oxunan yerlər)

| # | Yer | Qərar | Səbəb |
|---|---|---|---|
| D1 | §2.3 "səhifə ölçüsü query string-dədir" ↔ parametr siyahısında `per_page` yoxdur | `per_page` URL-də **yoxdur**, yalnız user meta (`qform_entries_per_page`); JS onu hər GET-də göndərir, server yalnız dəyişəndə yazır | Paylaşılan link başqasının seçimini dəyişməməlidir; tək mənbə |
| D2 | §3.2 "Older / Newer" | Tarix üzrə sıralamada Older/Newer (istiqamətə görə yer dəyişir); total üzrə sıralamada "Previous entry / Next entry" | Total sırasında "köhnə/yeni" yanlış məna verərdi |
| D3 | §4 "tapılmayan id → (deleted form)" | Zibil qutusundakı forma da "silinmiş" sayılır; "Deleted forms" = canlı (zibildə olmayan) forma id-lərinə `NOT IN` | Zibildəki forma redaktə olunmur; filtr və etiket eyni dəstə baxmalıdır |
| D4 | §4 "total filtri aktivdirsə NULL total-lı sətirlər düşmür" | NULL total-lı sətirlər total filtrinin nəticəsinə **daxil olmur**; total üzrə sıralamada hər iki istiqamətdə sonda | SQL semantikası; "hesablama uğursuz" müraciət heç bir məbləğ aralığında deyil |
| D5 | §3.1 "ilk text / ilk email" | İlk **boş olmayan** text/email cavabı | Könüllü birinci sahə (məs. "Company") boş qalanda ad itməsin |
| D6 | §3.1 cədvəldə "Name / Email" | Bir sütun: ad üstdə, email altda (`mailto`) | Cədvəldəki yazılış; dar ekranda sütun sayı azalır |
| D7 | §2.4 `affected` | `delete` — həqiqətən silinən; `read`/`unread` — göstərilən id-lərdən mövcud `completed` müraciət sayı (artıq həmin vəziyyətdə olanlar da) | "0 entries marked as read" çaşdırardı; silmə yarışı isə real sayı tələb edir |
| D8 | §5 "total" sütunu və injection | CSV `Total` = DB-nin dəqiq onluğu (`180.0000`); adi onluq ədəd (mənfi də) `'` önəki almır | Endirimli total mətnə çevrilməsin; float yuvarlaqlaşdırması olmasın |
| D9 | §3.1 "forma adı (redaktora link)" | Builder `?page=quoteform&form=ID` ilə birbaşa redaktoru açır (App.js, Task 13) | Builder-in URL-i yox idi — link heç yerə aparmazdı |
| D10 | §2.1 yalnız `qform_view_entries` olan istifadəçi | Yuxarı menyu birbaşa `quoteform-entries` səhifəsidir; builder səhifəsi bu istifadəçi üçün qeydə alınmır | WordPress-in menyu "reparent" davranışına güvənmədən deterministik |

## Fayl xəritəsi

| Fayl | Məsuliyyət | Task |
|---|---|---|
| `includes/Entries/EntryFilters.php`, `admin-src/entries/filters.js`, `tests/fixtures/entry-filters.json` | filtr/sıralama normallaşdırılması + paritet | 1 |
| `includes/Entries/EntryQuery.php`, `includes/Entries/FormDirectory.php` | WHERE/ORDER/keyset SQL; forma adları, canlı forma id-ləri | 2 |
| `includes/Entries/EntryRepository.php` | `total_decimal`, `page`, `countUnread`, `findCompleted`, `formIdsWithEntries` | 2 |
| `includes/Entries/EntryRepository.php` | `slice`, `neighbours`, `markRead`, `setRead`, `delete` | 3 |
| `includes/Entries/EntryPresenter.php` | siyahı/detal cavabı, pul, tarix, cavablar | 4 |
| `includes/Entries/EntryPreferences.php`, `includes/Rest/EntriesAdminController.php`, `includes/Plugin.php`, `includes/Support/Uninstaller.php` | admin REST, `per_page` meta | 5 |
| `includes/Entries/CsvCell.php`, `includes/Entries/CsvExporter.php`, `includes/Admin/EntriesExport.php` | CSV | 6 |
| `includes/Admin/EntriesPage.php`, `includes/Admin/BuilderPage.php`, `package.json`, `bin/check-build.sh`, `admin-src/entries.js`, `admin-src/entries/EntriesApp.js` (stub), `admin-src/entries/style.scss`, `admin-src/entries/_entries.scss` (başlanğıc) | menyu, nişan, paket | 7 |
| `admin-src/api/client.js`, `admin-src/components/Notice.js`, `admin-src/entries/urlState.js`, `menuBadge.js`, `useAnnouncer.js`, `errors.js` | JS təməli | 8 |
| `admin-src/entries/EntriesTable.js`, `Pagination.js` | cədvəl, sıralama, səhifələmə | 9 |
| `admin-src/entries/FilterBar.js` | filtr zolağı, eksport linki | 10 |
| `admin-src/entries/BulkBar.js`, `EntriesListScreen.js` | siyahı ekranı | 11 |
| `admin-src/entries/EntryDetailScreen.js` | detal ekranı | 12 |
| `admin-src/entries/EntriesApp.js`, `admin-src/entries/_entries.scss`, `admin-src/App.js` | router, stillər, builder deep-link | 13 |
| `tests/e2e/entries.spec.js`, `languages/quoteform.pot` | e2e, POT, tam yoxlama | 14 |

Test infra (yeni): `tests/integration/Support/SeedsEntries.php` (trait, `require_once` ilə qoşulur — `tests/integration` autoload olunmur, fayl adı `Test.php` ilə bitmədiyi üçün PHPUnit onu test kimi yükləmir).

---

### Task 1: Filtr normallaşdırılması — `EntryFilters` + `filters.js` + paritet fixture

**Files:**
- Create: `includes/Entries/EntryFilters.php`
- Create: `admin-src/entries/filters.js`
- Create: `tests/fixtures/entry-filters.json`
- Test: `tests/php/Entries/EntryFiltersTest.php` (vahid, WP-siz), `tests/js/admin/entryFilters.test.js`

**Interfaces:**
- Produces (PHP): `EntryFilters::DECIMAL_PATTERN` (`'/^-?\d{1,14}(?:\.\d{1,4})?$/D'`); `EntryFilters::defaults(): array` → `[ 'form' => null, 'status' => null, 'from' => null, 'to' => null, 'min' => null, 'max' => null, 'orderby' => 'date', 'order' => 'desc' ]`; `EntryFilters::normalise( array $params ): array` (eyni açarlar, eyni sıra; `form` = `int` | `'deleted'` | `null`; `status` = `'new'|'read'|null`; `from`/`to` = `'YYYY-MM-DD'|null`; `min`/`max` = onluq sətir | `null`; `orderby` = `'date'|'total'`; `order` = `'asc'|'desc'`); `EntryFilters::isCalendarDate( string ): bool`.
- Produces (JS, `admin-src/entries/filters.js`): `DEFAULT_FILTERS` (dondurulmuş, eyni açarlar), `DECIMAL_PATTERN`, `isCalendarDate( value ) → boolean`, `normaliseFilters( params ) → filters`, `filtersAreActive( filters ) → boolean` (form/status/from/to/min/max-dan biri `null` deyil), `filterParams( filters ) → { [key]: string }` (null-lar və default sıralama atılır — REST sorğusu, URL və eksport linki üçün tək mənbə).
- Qayda: etibarsız dəyər **səssizcə** default-a düşür (spec §2.3); yalnız sətirlər qəbul olunur (massiv/rəqəm → default); il 1000–9999 (MySQL DATETIME aralığı; həm də JS `Date.UTC` 0–99 illərini 1900-ə köçürür — divergensiya sinfi bağlanır); PCRE `$` `/D` ilə (CLAUDE.md divergensiya #3).

- [ ] **Step 1: Write the shared fixture** — `tests/fixtures/entry-filters.json`:

```json
{
	"cases": [
		{ "name": "no parameters give the defaults", "params": {}, "expected": {} },
		{ "name": "a form id", "params": { "form": "7" }, "expected": { "form": 7 } },
		{ "name": "deleted forms", "params": { "form": "deleted" }, "expected": { "form": "deleted" } },
		{ "name": "a zero-padded form id is not an id", "params": { "form": "07" }, "expected": {} },
		{ "name": "a negative form id", "params": { "form": "-3" }, "expected": {} },
		{ "name": "a fractional form id", "params": { "form": "7.5" }, "expected": {} },
		{ "name": "a 15-digit form id is the longest accepted", "params": { "form": "123456789012345" }, "expected": { "form": 123456789012345 } },
		{ "name": "a 16-digit form id is beyond what JavaScript holds exactly", "params": { "form": "1234567890123456" }, "expected": {} },
		{ "name": "status new", "params": { "status": "new" }, "expected": { "status": "new" } },
		{ "name": "status read", "params": { "status": "read" }, "expected": { "status": "read" } },
		{ "name": "status in capitals is not a status", "params": { "status": "NEW" }, "expected": {} },
		{ "name": "status all means no status filter", "params": { "status": "all" }, "expected": {} },
		{ "name": "a date range", "params": { "from": "2026-09-01", "to": "2026-09-25" }, "expected": { "from": "2026-09-01", "to": "2026-09-25" } },
		{ "name": "a leap day", "params": { "from": "2028-02-29" }, "expected": { "from": "2028-02-29" } },
		{ "name": "a leap day in a common year", "params": { "from": "2026-02-29" }, "expected": {} },
		{ "name": "month thirteen", "params": { "to": "2026-13-01" }, "expected": {} },
		{ "name": "day zero", "params": { "to": "2026-09-00" }, "expected": {} },
		{ "name": "a single-digit month", "params": { "from": "2026-9-05" }, "expected": {} },
		{ "name": "a date followed by a newline", "params": { "from": "2026-09-25\n" }, "expected": {} },
		{ "name": "a year before 1000", "params": { "from": "0999-12-31" }, "expected": {} },
		{ "name": "year zero", "params": { "from": "0000-01-01" }, "expected": {} },
		{ "name": "a total range", "params": { "min": "10", "max": "99.5" }, "expected": { "min": "10", "max": "99.5" } },
		{ "name": "a negative minimum", "params": { "min": "-5.25" }, "expected": { "min": "-5.25" } },
		{ "name": "the widest total the column holds", "params": { "max": "12345678901234.9999" }, "expected": { "max": "12345678901234.9999" } },
		{ "name": "fifteen whole digits do not fit the column", "params": { "max": "123456789012345" }, "expected": {} },
		{ "name": "five decimals do not fit the column", "params": { "min": "0.12345" }, "expected": {} },
		{ "name": "exponent notation", "params": { "min": "1e3" }, "expected": {} },
		{ "name": "a leading space", "params": { "min": " 10" }, "expected": {} },
		{ "name": "a trailing dot", "params": { "min": "10." }, "expected": {} },
		{ "name": "a leading dot", "params": { "min": ".5" }, "expected": {} },
		{ "name": "a total followed by a newline", "params": { "max": "10\n" }, "expected": {} },
		{ "name": "a decimal comma", "params": { "min": "10,5" }, "expected": {} },
		{ "name": "non-ASCII digits", "params": { "min": "\u0661\u0660" }, "expected": {} },
		{ "name": "sorted by total, lowest first", "params": { "orderby": "total", "order": "asc" }, "expected": { "orderby": "total", "order": "asc" } },
		{ "name": "an unknown sort column", "params": { "orderby": "id" }, "expected": {} },
		{ "name": "SQL in the sort parameters", "params": { "orderby": "created_at; DROP TABLE wp_users", "order": "asc; --" }, "expected": {} },
		{ "name": "order in capitals", "params": { "order": "ASC" }, "expected": {} },
		{ "name": "numbers instead of strings", "params": { "form": 7, "min": 10 }, "expected": {} },
		{ "name": "lists instead of strings", "params": { "form": [ "7" ], "status": [ "new" ] }, "expected": {} },
		{ "name": "keys that are not filters are ignored", "params": { "page": "quoteform-entries", "paged": "3", "entry": "41", "rest_route": "/quoteform/v1/entries" }, "expected": {} }
	]
}
```

- [ ] **Step 2: Write the failing PHP test** — `tests/php/Entries/EntryFiltersTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Entries;

use PHPUnit\Framework\TestCase;
use Quoteform\Entries\EntryFilters;

final class EntryFiltersTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>}>
     */
    public function sharedCases(): array
    {
        $fixture = json_decode( (string) file_get_contents( dirname( __DIR__, 2 ) . '/fixtures/entry-filters.json' ), true );
        $cases   = [];

        foreach ( $fixture['cases'] as $case ) {
            $cases[ $case['name'] ] = [ $case['params'], $case['expected'] ];
        }

        return $cases;
    }

    /**
     * @dataProvider sharedCases
     * @param array<string, mixed> $params
     * @param array<string, mixed> $expected
     */
    public function testMatchesTheSharedFixture( array $params, array $expected ): void
    {
        $this->assertSame( array_merge( EntryFilters::defaults(), $expected ), EntryFilters::normalise( $params ) );
    }

    public function testTheDefaultsListEveryFilterInOneOrder(): void
    {
        $this->assertSame(
            [ 'form' => null, 'status' => null, 'from' => null, 'to' => null, 'min' => null, 'max' => null, 'orderby' => 'date', 'order' => 'desc' ],
            EntryFilters::defaults()
        );
    }

    public function testCalendarDatesAreCheckedAgainstTheCalendar(): void
    {
        $this->assertTrue( EntryFilters::isCalendarDate( '2024-02-29' ) );
        $this->assertFalse( EntryFilters::isCalendarDate( '2023-02-29' ) );
        $this->assertFalse( EntryFilters::isCalendarDate( '2023-04-31' ) );
        $this->assertFalse( EntryFilters::isCalendarDate( "2023-04-30\n" ) );
    }
}
```

- [ ] **Step 3: Run it to verify it fails** — `./bin/phpunit --filter EntryFiltersTest` → FAIL (`Class "Quoteform\Entries\EntryFilters" not found` — fatal-lar PHPUnit qüsurundan təsirlənmir).

- [ ] **Step 4: Implement** — `includes/Entries/EntryFilters.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

/**
 * Müraciət siyahısının filtr/sıralama parametrlərinin YEGANƏ oxunuşu (PHP tərəfi).
 *
 * JS əkizi `admin-src/entries/filters.js`-dir; ikisi `tests/fixtures/entry-filters.json`
 * ilə kilidlənib. Etibarsız dəyər səssizcə default-a düşür (spec §2.3), çünki URL
 * istifadəçinin əlindədir və köhnə/pozulmuş link xəta ekranı yox, siyahı göstərməlidir.
 *
 * WordPress-dən asılı deyil.
 */
final class EntryFilters
{
    /** DECIMAL(18,4) sütununa dəqiq sığan onluq: 14 tam + 4 kəsr rəqəmi. */
    public const DECIMAL_PATTERN = '/^-?\d{1,14}(?:\.\d{1,4})?$/D';

    /** 15 rəqəmə qədər: JS `Number` bunu dəqiq saxlayır (2^53 ≈ 9.007e15). */
    private const FORM_PATTERN = '/^[1-9]\d{0,14}$/D';

    private const DATE_PATTERN = '/^(\d{4})-(\d{2})-(\d{2})$/D';

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'form'    => null,
            'status'  => null,
            'from'    => null,
            'to'      => null,
            'min'     => null,
            'max'     => null,
            'orderby' => 'date',
            'order'   => 'desc',
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public static function normalise( array $params ): array
    {
        $filters = self::defaults();

        $form = self::text( $params, 'form' );

        if ( 'deleted' === $form ) {
            $filters['form'] = 'deleted';
        } elseif ( null !== $form && 1 === preg_match( self::FORM_PATTERN, $form ) ) {
            $filters['form'] = (int) $form;
        }

        $status = self::text( $params, 'status' );

        if ( 'new' === $status || 'read' === $status ) {
            $filters['status'] = $status;
        }

        foreach ( [ 'from', 'to' ] as $key ) {
            $value = self::text( $params, $key );

            if ( null !== $value && self::isCalendarDate( $value ) ) {
                $filters[ $key ] = $value;
            }
        }

        foreach ( [ 'min', 'max' ] as $key ) {
            $value = self::text( $params, $key );

            if ( null !== $value && 1 === preg_match( self::DECIMAL_PATTERN, $value ) ) {
                $filters[ $key ] = $value;
            }
        }

        if ( 'total' === self::text( $params, 'orderby' ) ) {
            $filters['orderby'] = 'total';
        }

        if ( 'asc' === self::text( $params, 'order' ) ) {
            $filters['order'] = 'asc';
        }

        return $filters;
    }

    public static function isCalendarDate( string $value ): bool
    {
        if ( 1 !== preg_match( self::DATE_PATTERN, $value, $parts ) ) {
            return false;
        }

        $year = (int) $parts[1];

        return $year >= 1000 && checkdate( (int) $parts[2], (int) $parts[3], $year );
    }

    /**
     * @param array<string, mixed> $params
     */
    private static function text( array $params, string $key ): ?string
    {
        $value = $params[ $key ] ?? null;

        return is_string( $value ) ? $value : null;
    }
}
```

- [ ] **Step 5: Run the PHP test** — `./bin/phpunit --filter EntryFiltersTest` və `QF_PHP=php:7.4-cli ./bin/phpunit --filter EntryFiltersTest` → PASS (40 fixture halı + 2), hər iki versiyada.

- [ ] **Step 6: Write the failing Jest test** — `tests/js/admin/entryFilters.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import fixture from '../../fixtures/entry-filters.json';
import {
	DEFAULT_FILTERS,
	filterParams,
	filtersAreActive,
	isCalendarDate,
	normaliseFilters,
} from '../../../admin-src/entries/filters';

describe( 'normaliseFilters matches the PHP side', () => {
	it.each( fixture.cases.map( ( item ) => [ item.name, item ] ) )( '%s', ( name, item ) => {
		expect( normaliseFilters( item.params ) ).toStrictEqual( { ...DEFAULT_FILTERS, ...item.expected } );
	} );
} );

describe( 'filterParams', () => {
	it( 'leaves out empty filters and the default sort', () => {
		expect( filterParams( DEFAULT_FILTERS ) ).toEqual( {} );
		expect( filterParams( { ...DEFAULT_FILTERS, form: 7, status: 'new', orderby: 'total' } ) ).toEqual( {
			form: '7',
			status: 'new',
			orderby: 'total',
		} );
	} );

	it( 'reads back as the same filters for every fixture case', () => {
		fixture.cases.forEach( ( item ) => {
			const filters = { ...DEFAULT_FILTERS, ...item.expected };

			expect( normaliseFilters( filterParams( filters ) ) ).toStrictEqual( filters );
		} );
	} );
} );

describe( 'filtersAreActive', () => {
	it( 'ignores the sort order', () => {
		expect( filtersAreActive( { ...DEFAULT_FILTERS, orderby: 'total', order: 'asc' } ) ).toBe( false );
		expect( filtersAreActive( { ...DEFAULT_FILTERS, min: '0' } ) ).toBe( true );
	} );
} );

describe( 'isCalendarDate', () => {
	it( 'knows month lengths and leap years', () => {
		expect( isCalendarDate( '2024-02-29' ) ).toBe( true );
		expect( isCalendarDate( '2023-02-29' ) ).toBe( false );
		expect( isCalendarDate( '2023-04-31' ) ).toBe( false );
		expect( isCalendarDate( 20230430 ) ).toBe( false );
	} );
} );

describe( 'DEFAULT_FILTERS', () => {
	it( 'cannot be changed by accident', () => {
		expect( Object.isFrozen( DEFAULT_FILTERS ) ).toBe( true );
	} );
} );
```

- [ ] **Step 7: Run it to verify it fails** — `npx jest tests/js/admin/entryFilters.test.js` → FAIL (`Cannot find module '../../../admin-src/entries/filters'`).

- [ ] **Step 8: Implement** — `admin-src/entries/filters.js`:

```js
/**
 * Müraciət filtrlərinin YEGANƏ oxunuşu (JS tərəfi). PHP əkizi
 * `includes/Entries/EntryFilters.php`-dir; ikisi `tests/fixtures/entry-filters.json`
 * ilə kilidlənib — birini dəyişəndə o birini də dəyiş və hər iki dəsti qaçır.
 */

export const DEFAULT_FILTERS = Object.freeze( {
	form: null,
	status: null,
	from: null,
	to: null,
	min: null,
	max: null,
	orderby: 'date',
	order: 'desc',
} );

// JS `$` sətir sonundakı "\n"-dən əvvəl uyğun gəlmir; PHP tərəfi eyni davranış üçün `/D` işlədir.
export const DECIMAL_PATTERN = /^-?\d{1,14}(?:\.\d{1,4})?$/;

const FORM_PATTERN = /^[1-9]\d{0,14}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FILTER_KEYS = [ 'form', 'status', 'from', 'to', 'min', 'max' ];

export function isCalendarDate( value ) {
	const parts = typeof value === 'string' ? DATE_PATTERN.exec( value ) : null;

	if ( ! parts ) {
		return false;
	}

	const year = Number( parts[ 1 ] );
	const month = Number( parts[ 2 ] );
	const day = Number( parts[ 3 ] );

	if ( year < 1000 || month < 1 || month > 12 || day < 1 ) {
		return false;
	}

	// Növbəti ayın 0-cı günü = bu ayın son günü. İl ≥ 1000 olduğu üçün
	// `Date.UTC`-nin 0–99 illərini 1900-ə köçürməsi bura çatmır.
	return day <= new Date( Date.UTC( year, month, 0 ) ).getUTCDate();
}

function text( params, key ) {
	const value = params && Object.prototype.hasOwnProperty.call( params, key ) ? params[ key ] : undefined;

	return typeof value === 'string' ? value : null;
}

export function normaliseFilters( params ) {
	const filters = { ...DEFAULT_FILTERS };
	const form = text( params, 'form' );

	if ( form === 'deleted' ) {
		filters.form = 'deleted';
	} else if ( form !== null && FORM_PATTERN.test( form ) ) {
		filters.form = Number( form );
	}

	const status = text( params, 'status' );

	if ( status === 'new' || status === 'read' ) {
		filters.status = status;
	}

	[ 'from', 'to' ].forEach( ( key ) => {
		const value = text( params, key );

		if ( value !== null && isCalendarDate( value ) ) {
			filters[ key ] = value;
		}
	} );

	[ 'min', 'max' ].forEach( ( key ) => {
		const value = text( params, key );

		if ( value !== null && DECIMAL_PATTERN.test( value ) ) {
			filters[ key ] = value;
		}
	} );

	if ( text( params, 'orderby' ) === 'total' ) {
		filters.orderby = 'total';
	}

	if ( text( params, 'order' ) === 'asc' ) {
		filters.order = 'asc';
	}

	return filters;
}

export function filtersAreActive( filters ) {
	return FILTER_KEYS.some( ( key ) => filters[ key ] !== null );
}

export function filterParams( filters ) {
	const params = {};

	FILTER_KEYS.forEach( ( key ) => {
		if ( filters[ key ] !== null ) {
			params[ key ] = String( filters[ key ] );
		}
	} );

	if ( filters.orderby !== DEFAULT_FILTERS.orderby ) {
		params.orderby = filters.orderby;
	}

	if ( filters.order !== DEFAULT_FILTERS.order ) {
		params.order = filters.order;
	}

	return params;
}
```

- [ ] **Step 9: Verify** — `npx jest tests/js/admin/entryFilters.test.js` → PASS; `npm test` → hamısı yaşıl; `./bin/phpunit` və `QF_PHP=php:7.4-cli ./bin/phpunit` → yaşıl (say qeyd et). Build dəyişmir (filters.js hələ heç bir girişdən import olunmur).

---
### Task 2: `EntryQuery`, `FormDirectory` və siyahı sorğusu

**Files:**
- Create: `includes/Entries/EntryQuery.php`
- Create: `includes/Entries/FormDirectory.php`
- Modify: `includes/Entries/EntryRepository.php` (`hydrate()`-ə `total_decimal`; yeni `page`, `countUnread`, `findCompleted`, `formIdsWithEntries`)
- Create (test infra): `tests/integration/Support/SeedsEntries.php`
- Test: `tests/integration/EntryQueryTest.php`

**Interfaces:**
- Consumes: `EntryFilters::normalise()`, `EntryFilters::defaults()` (Task 1); `EntriesTable::name()`; `FormPostType::POST_TYPE`.
- Produces:
  - `FormDirectory::all(): array<int, string>` (zibil qutusunda olmayan bütün formalar, id → başlıq, başlığa görə); `FormDirectory::liveIds(): int[]`; `FormDirectory::titles( int[] $ids ): array<int, string>` (tək `get_posts`, `post__in`; zibildəki/olmayan id qaytarılmır → "(deleted form)").
  - `new EntryQuery( array $filters, DateTimeZone $zone, int[] $liveFormIds = [] )`; `EntryQuery::forSite( array $params ): EntryQuery` (xam `$_GET`/REST query → `EntryFilters::normalise()` + `wp_timezone()`; `form = 'deleted'` olanda `FormDirectory::liveIds()`); `filters(): array`; `formId(): ?int`; `where(): string` (`"WHERE …"`, hazırlanmış); `orderBy( bool $reversed = false ): string`; `beyond( array $entry, bool $forward ): string` (Task 3 istifadə edir).
  - `EntryRepository::hydrate()` əlavə açar: `'total_decimal' => ?string` (DB-nin onluq sətri, məs. `'180.0000'`).
  - `EntryRepository::page( EntryQuery $query, int $page, int $perPage ): array{items: array[], total: int, page: int, pages: int}` — `page` son səhifəyə sıxılır, `pages = ceil(total / perPage)` (boş cədvəldə 0, `page` 1).
  - `EntryRepository::countUnread(): int`; `findCompleted( int $id ): ?array`; `formIdsWithEntries(): int[]`.
- Qərarlar: "Deleted forms" = `form_id NOT IN (canlı forma id-ləri)` — zibil qutusundakı forma da "silinmiş" sayılır (siyahıda başlığı yoxdur). Total filtri aktivdirsə `NULL` total-lı (hesablama uğursuz) sətirlər nəticəyə **düşmür** (SQL semantikası). Total üzrə sıralamada `NULL`-lar hər iki istiqamətdə **sonda**.

- [ ] **Step 1: Create the seeding trait** — `tests/integration/Support/SeedsEntries.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration\Support;

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryRepository;

/**
 * `EntryRepository::insert()` vaxtı (`gmdate`) və total-ı (float → `%.4F`) özü
 * hesablayır. Testlərə isə dəqiq `created_at`, float-dan KEÇMƏYƏN onluq total
 * (18 rəqəmli dəyərlər double-da itir) və `read_at` lazımdır — ona görə əvvəl
 * insert(), sonra həmin sütunlar birbaşa yazılır.
 */
trait SeedsEntries
{
    /**
     * @param array<string, mixed> $overrides insert() açarları, üstəgəl `created_at`,
     *        `read_at` (string|null) və `total_decimal` (string|null — `total` sütununa olduğu kimi).
     */
    private function seedEntry( array $overrides = [] ): int
    {
        global $wpdb;

        $columns = [];

        foreach ( [ 'created_at', 'read_at' ] as $column ) {
            if ( array_key_exists( $column, $overrides ) ) {
                $columns[ $column ] = $overrides[ $column ];
                unset( $overrides[ $column ] );
            }
        }

        if ( array_key_exists( 'total_decimal', $overrides ) ) {
            $columns['total'] = $overrides['total_decimal'];
            unset( $overrides['total_decimal'] );
        }

        $id = ( new EntryRepository() )->insert( array_merge( self::entryDefaults(), $overrides ) );

        if ( $id < 1 ) {
            throw new \RuntimeException( 'seedEntry: insert failed: ' . $wpdb->last_error );
        }

        if ( [] !== $columns ) {
            // `null` dəyəri `$wpdb->update()` NULL kimi yazır (WP 4.4+).
            $wpdb->update( EntriesTable::name(), $columns, [ 'id' => $id ] );
        }

        return $id;
    }

    /**
     * @return array<string, mixed>
     */
    private static function entryDefaults(): array
    {
        return [
            'form_id'    => 1,
            'status'     => 'completed',
            'total'      => 100.0,
            'currency'   => 'USD',
            'data'       => [
                'name'  => [ 'label' => 'Your name', 'type' => 'text', 'value' => 'Jane Doe' ],
                'email' => [ 'label' => 'Email', 'type' => 'email', 'value' => 'jane@example.com' ],
            ],
            'breakdown'  => [
                'currency' => 'USD',
                'position' => 'before',
                'decimals' => 2,
                'lines'    => [ [ 'key' => 'total', 'label' => 'Total', 'amount' => 100.0 ] ],
                'error'    => null,
            ],
            'user_id'    => null,
            'ip'         => null,
            'user_agent' => 'Agent',
        ];
    }
}
```

- [ ] **Step 2: Write the failing test** — `tests/integration/EntryQueryTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Entries\FormDirectory;
use Quoteform\Forms\FormPostType;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

final class EntryQueryTest extends WP_UnitTestCase
{
    use SeedsEntries;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
        update_option( 'timezone_string', 'UTC' );
        update_option( 'gmt_offset', 0 );
    }

    /**
     * @param array<string, mixed> $params
     * @return int[]
     */
    private function listed( array $params, int $page = 1, int $perPage = 20 ): array
    {
        return array_column( ( new EntryRepository() )->page( EntryQuery::forSite( $params ), $page, $perPage )['items'], 'id' );
    }

    private function form( string $status = 'publish', string $title = 'Quote' ): int
    {
        return self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => $status, 'post_title' => $title ] );
    }

    public function testOnlyCompletedEntriesAreListedNewestFirst(): void
    {
        $old = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $new = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $this->seedEntry( [ 'status' => 'draft', 'created_at' => '2026-09-22 10:00:00' ] );

        $this->assertSame( [ $new, $old ], $this->listed( [] ) );
    }

    public function testEntriesFromTheSameSecondAreOrderedById(): void
    {
        $first  = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $second = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );

        $this->assertSame( [ $second, $first ], $this->listed( [] ) );
        $this->assertSame( [ $first, $second ], $this->listed( [ 'order' => 'asc' ] ) );
    }

    public function testTheFormFilterKeepsOneForm(): void
    {
        $mine = $this->seedEntry( [ 'form_id' => 7 ] );
        $this->seedEntry( [ 'form_id' => 8 ] );

        $this->assertSame( [ $mine ], $this->listed( [ 'form' => '7' ] ) );
    }

    public function testDeletedFormsMeansMissingOrTrashedForms(): void
    {
        $live    = $this->form();
        $trashed = $this->form( 'trash' );

        $this->seedEntry( [ 'form_id' => $live ] );
        $inTrash = $this->seedEntry( [ 'form_id' => $trashed ] );
        $missing = $this->seedEntry( [ 'form_id' => 999999 ] );

        $this->assertEqualsCanonicalizing( [ $inTrash, $missing ], $this->listed( [ 'form' => 'deleted' ] ) );
        $this->assertSame( [ $live => 'Quote' ], FormDirectory::titles( [ $live, $trashed, 999999 ] ) );
    }

    public function testDeletedFormsWithNoFormsLeftListsEverything(): void
    {
        $a = $this->seedEntry( [ 'form_id' => 5 ] );
        $b = $this->seedEntry( [ 'form_id' => 6 ] );

        $this->assertEqualsCanonicalizing( [ $a, $b ], $this->listed( [ 'form' => 'deleted' ] ) );
    }

    public function testTheStatusFilterSplitsNewFromRead(): void
    {
        $unread = $this->seedEntry();
        $read   = $this->seedEntry( [ 'read_at' => '2026-09-25 09:00:00' ] );

        $this->assertSame( [ $unread ], $this->listed( [ 'status' => 'new' ] ) );
        $this->assertSame( [ $read ], $this->listed( [ 'status' => 'read' ] ) );
    }

    public function testDayBoundariesFollowTheSiteTimezone(): void
    {
        update_option( 'timezone_string', 'Asia/Baku' ); // UTC+4, yay vaxtı yoxdur.

        $justAfterMidnight = $this->seedEntry( [ 'created_at' => '2026-09-24 20:30:00' ] ); // Bakıda 25-i 00:30
        $lastSecondBefore  = $this->seedEntry( [ 'created_at' => '2026-09-24 19:59:59' ] ); // Bakıda 24-ü 23:59:59

        $this->assertSame( [ $justAfterMidnight ], $this->listed( [ 'from' => '2026-09-25', 'to' => '2026-09-25' ] ) );
        $this->assertSame( [ $lastSecondBefore ], $this->listed( [ 'from' => '2026-09-24', 'to' => '2026-09-24' ] ) );
    }

    public function testTheWholeToDayIsIncludedWithAManualOffset(): void
    {
        update_option( 'timezone_string', '' );
        update_option( 'gmt_offset', -5 );

        $lastSecond = $this->seedEntry( [ 'created_at' => '2026-09-26 04:59:59' ] ); // yerli 25-i 23:59:59
        $this->seedEntry( [ 'created_at' => '2026-09-26 05:00:00' ] );               // yerli 26-sı 00:00:00

        $this->assertSame( [ $lastSecond ], $this->listed( [ 'from' => '2026-09-25', 'to' => '2026-09-25' ] ) );
    }

    public function testTheTotalRangeIsInclusiveAndLeavesOutFailedCalculations(): void
    {
        $ten    = $this->seedEntry( [ 'total_decimal' => '10.0000' ] );
        $twenty = $this->seedEntry( [ 'total_decimal' => '20.0000' ] );
        $this->seedEntry( [ 'total_decimal' => '30.0000' ] );
        $failed = $this->seedEntry( [ 'total_decimal' => null ] );

        $this->assertEqualsCanonicalizing( [ $ten, $twenty ], $this->listed( [ 'min' => '10', 'max' => '20' ] ) );
        $this->assertNotContains( $failed, $this->listed( [ 'min' => '-1' ] ) );
        $this->assertContains( $failed, $this->listed( [] ) );
    }

    public function testTotalsAreComparedAsExactDecimals(): void
    {
        $low  = $this->seedEntry( [ 'total_decimal' => '12345678901234.5678' ] );
        $high = $this->seedEntry( [ 'total_decimal' => '12345678901234.5679' ] );

        $this->assertSame( [ $high ], $this->listed( [ 'min' => '12345678901234.5679' ] ) );
        $this->assertSame( [ $low ], $this->listed( [ 'max' => '12345678901234.5678' ] ) );
    }

    public function testSortingByTotalKeepsFailedCalculationsLastBothWays(): void
    {
        $cheap  = $this->seedEntry( [ 'total_decimal' => '5.0000' ] );
        $failed = $this->seedEntry( [ 'total_decimal' => null ] );
        $dear   = $this->seedEntry( [ 'total_decimal' => '50.0000' ] );

        $this->assertSame( [ $dear, $cheap, $failed ], $this->listed( [ 'orderby' => 'total' ] ) );
        $this->assertSame( [ $cheap, $dear, $failed ], $this->listed( [ 'orderby' => 'total', 'order' => 'asc' ] ) );
    }

    public function testAnInjectedSortFallsBackToNewestFirst(): void
    {
        $old = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00', 'total_decimal' => '99.0000' ] );
        $new = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00', 'total_decimal' => '1.0000' ] );

        $this->assertSame( [ $new, $old ], $this->listed( [ 'orderby' => 'total; DROP TABLE wp_users', 'order' => 'asc --' ] ) );
    }

    public function testAPageBeyondTheEndShowsTheLastPage(): void
    {
        for ( $i = 0; $i < 5; $i++ ) {
            $this->seedEntry( [ 'created_at' => sprintf( '2026-09-2%d 10:00:00', $i ) ] );
        }

        $result = ( new EntryRepository() )->page( EntryQuery::forSite( [] ), 9, 2 );

        $this->assertSame( 3, $result['page'] );
        $this->assertSame( 3, $result['pages'] );
        $this->assertSame( 5, $result['total'] );
        $this->assertCount( 1, $result['items'] );
    }

    public function testAnEmptyListIsPageOneOfNone(): void
    {
        $result = ( new EntryRepository() )->page( EntryQuery::forSite( [] ), 4, 20 );

        $this->assertSame( [ 'items' => [], 'total' => 0, 'page' => 1, 'pages' => 0 ], $result );
    }

    public function testTheRawTotalIsTheStoredDecimal(): void
    {
        $this->seedEntry( [ 'total_decimal' => '12345678901234.5678' ] );

        $items = ( new EntryRepository() )->page( EntryQuery::forSite( [] ), 1, 20 )['items'];

        $this->assertSame( '12345678901234.5678', $items[0]['total_decimal'] );
    }

    public function testTheUnreadCountSkipsReadEntriesAndDrafts(): void
    {
        $this->seedEntry();
        $this->seedEntry();
        $this->seedEntry( [ 'read_at' => '2026-09-25 09:00:00' ] );
        $this->seedEntry( [ 'status' => 'draft' ] );

        $this->assertSame( 2, ( new EntryRepository() )->countUnread() );
    }

    public function testFindCompletedIgnoresDrafts(): void
    {
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );
        $done  = $this->seedEntry();

        $this->assertNull( ( new EntryRepository() )->findCompleted( $draft ) );
        $this->assertSame( $done, ( new EntryRepository() )->findCompleted( $done )['id'] );
    }

    public function testFormIdsWithEntriesListsEachFormOnce(): void
    {
        $this->seedEntry( [ 'form_id' => 3 ] );
        $this->seedEntry( [ 'form_id' => 3 ] );
        $this->seedEntry( [ 'form_id' => 9 ] );
        $this->seedEntry( [ 'form_id' => 11, 'status' => 'draft' ] );

        $this->assertEqualsCanonicalizing( [ 3, 9 ], ( new EntryRepository() )->formIdsWithEntries() );
    }

    public function testTheFormDirectoryListsLiveFormsByTitle(): void
    {
        $b = $this->form( 'publish', 'Bravo' );
        $a = $this->form( 'draft', 'Alpha' );
        $this->form( 'trash', 'Charlie' );

        $this->assertSame( [ $a => 'Alpha', $b => 'Bravo' ], FormDirectory::all() );
        $this->assertEqualsCanonicalizing( [ $a, $b ], FormDirectory::liveIds() );
    }
}
```

- [ ] **Step 3: Run it to verify it fails** — `make itest ARGS="--filter EntryQueryTest"` → FAIL (`Class "Quoteform\Entries\EntryQuery" not found`).

- [ ] **Step 4: Create `includes/Entries/FormDirectory.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use Quoteform\Forms\FormPostType;
use WP_Post;

/**
 * Müraciətlərin aid olduğu formalar. `post_status => 'any'` zibil qutusunu
 * (və auto-draft-ı) çıxarır — zibildəki forma müraciətlər üçün "silinmiş"dir,
 * "Deleted forms" filtri də məhz bu dəstin əksidir.
 */
final class FormDirectory
{
    /**
     * @return array<int, string> id → başlıq, başlığa görə
     */
    public static function all(): array
    {
        $forms = [];

        foreach ( get_posts( self::args( [ 'orderby' => 'title', 'order' => 'ASC' ] ) ) as $post ) {
            if ( $post instanceof WP_Post ) {
                $forms[ (int) $post->ID ] = (string) $post->post_title;
            }
        }

        return $forms;
    }

    /**
     * @return int[]
     */
    public static function liveIds(): array
    {
        return array_map( 'intval', get_posts( self::args( [ 'fields' => 'ids' ] ) ) );
    }

    /**
     * Bir sorğu ilə: siyahının cari səhifəsindəki formaların başlıqları.
     *
     * @param int[] $ids
     * @return array<int, string>
     */
    public static function titles( array $ids ): array
    {
        $ids = array_values( array_unique( array_filter( array_map( 'intval', $ids ), static function ( int $id ): bool {
            return $id > 0;
        } ) ) );

        if ( [] === $ids ) {
            return [];
        }

        $titles = [];

        foreach ( get_posts( self::args( [ 'post__in' => $ids, 'orderby' => 'post__in' ] ) ) as $post ) {
            if ( $post instanceof WP_Post ) {
                $titles[ (int) $post->ID ] = (string) $post->post_title;
            }
        }

        return $titles;
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    private static function args( array $extra ): array
    {
        return array_merge(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_status' => 'any',
                'numberposts' => -1,
            ],
            $extra
        );
    }
}
```

- [ ] **Step 5: Create `includes/Entries/EntryQuery.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Müraciət siyahısının SQL-i. REST siyahısı, qonşu müraciətlər və CSV eksportu
 * EYNİ obyektdən keçir — filtrlər bir-birindən ayrıla bilməz (spec §5).
 *
 * Qaydalar:
 * - hər dəyər `$wpdb->prepare()` ilə; hazırlanmış fraqment bir daha prepare()-ə verilmir;
 * - sütun/istiqamət yalnız aşağıdakı literallardır (ağ siyahı);
 * - total müqayisəsi `CAST(%s AS DECIMAL(18,4))` ilədir: MySQL sətri DECIMAL ilə
 *   double kimi müqayisə edir və 18 rəqəmli total-lar bərabər görünür;
 * - `created_at` UTC-dir, gün sərhədləri saytın saat qurşağında hesablanır.
 */
final class EntryQuery
{
    /** @var array<string, mixed> */
    private $filters;

    /** @var DateTimeZone */
    private $zone;

    /** @var int[] */
    private $liveFormIds;

    /**
     * @param array<string, mixed> $filters     EntryFilters::normalise() nəticəsi
     * @param int[]                $liveFormIds yalnız `form = 'deleted'` üçün lazımdır
     */
    public function __construct( array $filters, DateTimeZone $zone, array $liveFormIds = [] )
    {
        $this->filters     = array_merge( EntryFilters::defaults(), $filters );
        $this->zone        = $zone;
        $this->liveFormIds = array_values( array_map( 'intval', $liveFormIds ) );
    }

    /**
     * @param array<string, mixed> $params xam sorğu parametrləri (`$_GET`, REST query)
     */
    public static function forSite( array $params ): self
    {
        $filters = EntryFilters::normalise( $params );

        return new self( $filters, wp_timezone(), 'deleted' === $filters['form'] ? FormDirectory::liveIds() : [] );
    }

    /**
     * @return array<string, mixed>
     */
    public function filters(): array
    {
        return $this->filters;
    }

    public function formId(): ?int
    {
        return is_int( $this->filters['form'] ) ? $this->filters['form'] : null;
    }

    public function where(): string
    {
        global $wpdb;

        $filters = $this->filters;
        $parts   = [ "status = 'completed'" ];

        if ( is_int( $filters['form'] ) ) {
            $parts[] = $wpdb->prepare( 'form_id = %d', $filters['form'] );
        } elseif ( 'deleted' === $filters['form'] && [] !== $this->liveFormIds ) {
            $parts[] = 'form_id NOT IN (' . implode( ',', $this->liveFormIds ) . ')';
        }

        if ( 'new' === $filters['status'] ) {
            $parts[] = 'read_at IS NULL';
        } elseif ( 'read' === $filters['status'] ) {
            $parts[] = 'read_at IS NOT NULL';
        }

        if ( null !== $filters['from'] ) {
            $parts[] = $wpdb->prepare( 'created_at >= %s', $this->utc( $filters['from'], '00:00:00' ) );
        }

        if ( null !== $filters['to'] ) {
            $parts[] = $wpdb->prepare( 'created_at <= %s', $this->utc( $filters['to'], '23:59:59' ) );
        }

        if ( null !== $filters['min'] ) {
            $parts[] = $wpdb->prepare( 'total >= CAST(%s AS DECIMAL(18,4))', $filters['min'] );
        }

        if ( null !== $filters['max'] ) {
            $parts[] = $wpdb->prepare( 'total <= CAST(%s AS DECIMAL(18,4))', $filters['max'] );
        }

        return 'WHERE ' . implode( ' AND ', $parts );
    }

    /**
     * Siyahı sırası; `$reversed` — əks istiqamət (keyset ilə "əvvəlki" sətri tapmaq üçün).
     * Total üzrə sıralamada hesablaması uğursuz (NULL) sətirlər siyahıda həmişə SONDADIR.
     */
    public function orderBy( bool $reversed = false ): string
    {
        $ascending = 'asc' === $this->filters['order'];

        if ( $reversed ) {
            $ascending = ! $ascending;
        }

        $direction = $ascending ? 'ASC' : 'DESC';

        if ( 'total' === $this->filters['orderby'] ) {
            $nulls = $reversed ? 'DESC' : 'ASC';

            return "ORDER BY (total IS NULL) {$nulls}, total {$direction}, id {$direction}";
        }

        return "ORDER BY created_at {$direction}, id {$direction}";
    }

    /**
     * Siyahı sırasında `$entry`-dən SONRA (`$forward`) və ya ƏVVƏL gələn sətirlərin şərti.
     * Şərt sətirin sıralama açarına baxır, filtrə üzvlüyünə yox: "New" filtrində açılıb
     * oxunan müraciətin də qonşuları tapılır.
     *
     * @param array<string, mixed> $entry EntryRepository::hydrate() nəticəsi (id, created_at, total_decimal)
     */
    public function beyond( array $entry, bool $forward ): string
    {
        global $wpdb;

        $ascending = 'asc' === $this->filters['order'];
        $operator  = ( $ascending === $forward ) ? '>' : '<';
        $id        = (int) $entry['id'];

        if ( 'total' !== $this->filters['orderby'] ) {
            return $wpdb->prepare(
                "(created_at {$operator} %s OR (created_at = %s AND id {$operator} %d))",
                (string) $entry['created_at'],
                (string) $entry['created_at'],
                $id
            );
        }

        $total = $entry['total_decimal'];

        if ( null === $total ) {
            // NULL blok siyahının sonundadır: irəli yalnız blok içində, geri isə bütün dolu total-lar + blokda əvvəlkilər.
            return $forward
                ? $wpdb->prepare( "(total IS NULL AND id {$operator} %d)", $id )
                : $wpdb->prepare( "(total IS NOT NULL OR id {$operator} %d)", $id );
        }

        $compare = $wpdb->prepare(
            "(total {$operator} CAST(%s AS DECIMAL(18,4)) OR (total = CAST(%s AS DECIMAL(18,4)) AND id {$operator} %d))",
            (string) $total,
            (string) $total,
            $id
        );

        return $forward ? "(total IS NULL OR {$compare})" : "(total IS NOT NULL AND {$compare})";
    }

    private function utc( string $date, string $time ): string
    {
        return ( new DateTimeImmutable( $date . ' ' . $time, $this->zone ) )
            ->setTimezone( new DateTimeZone( 'UTC' ) )
            ->format( 'Y-m-d H:i:s' );
    }
}
```

- [ ] **Step 6: Extend `includes/Entries/EntryRepository.php`.** In `hydrate()` replace the `'total' => …` line with these two lines (the other keys stay as they are):

```php
            'total'         => null === $row['total'] ? null : (float) $row['total'],
            // DB-nin öz onluq sətri — float-dan keçmir (18 rəqəm double-a sığmır).
            'total_decimal' => null === $row['total'] ? null : (string) $row['total'],
```

Then add these methods after `find()`:

```php
    /**
     * @return array<string, mixed>|null yalnız `completed` müraciət
     */
    public function findCompleted( int $id ): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row(
            $wpdb->prepare( 'SELECT * FROM ' . EntriesTable::name() . " WHERE id = %d AND status = 'completed'", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is ours.
            ARRAY_A
        );

        return is_array( $row ) ? self::hydrate( $row ) : null;
    }

    /**
     * Siyahının bir səhifəsi. İstənən səhifə sondan böyükdürsə son səhifə qaytarılır:
     * son səhifədəki hər şey silinəndə istifadəçi boş "No entries match" yox, yeni son səhifəni görür.
     *
     * @return array{items: array<int, array<string, mixed>>, total: int, page: int, pages: int}
     */
    public function page( EntryQuery $query, int $page, int $perPage ): array
    {
        global $wpdb;

        $table   = EntriesTable::name();
        $where   = $query->where();
        $perPage = max( 1, min( 100, $perPage ) );
        $total   = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} {$where}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery.
        $pages   = (int) ceil( $total / $perPage );
        $page    = max( 1, min( $page, max( 1, $pages ) ) );

        if ( 0 === $total ) {
            return [ 'items' => [], 'total' => 0, 'page' => 1, 'pages' => 0 ];
        }

        $rows = $wpdb->get_results(
            "SELECT * FROM {$table} {$where} " . $query->orderBy() . ' LIMIT ' . $perPage . ' OFFSET ' . ( ( $page - 1 ) * $perPage ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery; ints cast above.
            ARRAY_A
        );

        return [
            'items' => array_map( [ self::class, 'hydrate' ], is_array( $rows ) ? $rows : [] ),
            'total' => $total,
            'page'  => $page,
            'pages' => $pages,
        ];
    }

    /**
     * Menyu nişanı və REST `unread` üçün YEGANƏ mənbə: `status_read` indeksi ilə bir COUNT.
     */
    public function countUnread(): int
    {
        global $wpdb;

        return (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . EntriesTable::name() . " WHERE status = 'completed' AND read_at IS NULL" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- no user input.
    }

    /**
     * @return int[]
     */
    public function formIdsWithEntries(): array
    {
        global $wpdb;

        return array_map( 'intval', $wpdb->get_col( 'SELECT DISTINCT form_id FROM ' . EntriesTable::name() . " WHERE status = 'completed'" ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- no user input.
    }
```

- [ ] **Step 7: Run the test** — `make itest ARGS="--filter EntryQueryTest"` → PASS (19 test). `testTotalsAreComparedAsExactDecimals` düşürsə — `CAST` unudulub (sətir müqayisəsi double-dır).

- [ ] **Step 8: Verify** — `make itest` (bütün inteqrasiya: mövcud `EntryRepositoryTest`, `SubmissionServiceTest` dəyişmədən keçməlidir — `hydrate()`-ə yalnız açar əlavə olunub); `./bin/phpunit` və `QF_PHP=php:7.4-cli ./bin/phpunit` → yaşıl; `docker run --rm -v "$PWD":/app -w /app php:7.4-cli php -l includes/Entries/EntryQuery.php` və `FormDirectory.php` → "No syntax errors".

---
### Task 3: Keyset naviqasiya və yazma əməliyyatları — `slice`, `neighbours`, `markRead`, `setRead`, `delete`

**Files:**
- Modify: `includes/Entries/EntryRepository.php` (yeni metodlar)
- Test: `tests/integration/EntryNavigationTest.php`

**Interfaces:**
- Consumes: `EntryQuery::where()`, `orderBy( bool )`, `beyond( array, bool )`, `forSite()` (Task 2); `EntryRepository::findCompleted()`, `page()`, `hydrate()` (`total_decimal`) (Task 2); `SeedsEntries` trait.
- Produces:
  - `EntryRepository::slice( EntryQuery $query, ?array $after, int $limit, bool $forward = true ): array` — siyahı sırasında `$after`-dən sonrakı (və ya `$forward = false` ilə əvvəlki, yaxından uzağa) `$limit` hidratlanmış müraciət. CSV paketləri (Task 6) və qonşular bununla gəzir — OFFSET yoxdur, eksport zamanı silinən sətir başqasını buraxdırmır.
  - `neighbours( EntryQuery $query, array $entry ): array{previous: ?int, next: ?int}` — `previous` = siyahıda yuxarıdakı, `next` = aşağıdakı.
  - `markRead( int $id ): bool` — yalnız `read_at IS NULL` olanda yazır (`gmdate`); `true` = indi oxundu.
  - `setRead( int[] $ids, bool $read ): int` — mövcud `completed` müraciətlərin sayı (artıq həmin vəziyyətdə olanlar da sayılır; UI "3 entries marked as read." deyir).
  - `delete( int[] $ids ): int` — HƏQİQƏTƏN silinən sətir sayı (artıq silinmiş/olmayan id sayılmır — toplu silmə yarışı, spec §4).

- [ ] **Step 1: Write the failing test** — `tests/integration/EntryNavigationTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

final class EntryNavigationTest extends WP_UnitTestCase
{
    use SeedsEntries;

    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
        EntriesTable::install();
        update_option( 'timezone_string', 'UTC' );
    }

    /**
     * @param array<string, mixed> $params
     * @return array{previous: ?int, next: ?int}
     */
    private function around( int $id, array $params = [] ): array
    {
        $repository = new EntryRepository();

        return $repository->neighbours( EntryQuery::forSite( $params ), $repository->findCompleted( $id ) );
    }

    private function readAt( int $id ): ?string
    {
        global $wpdb;

        $value = $wpdb->get_var( $wpdb->prepare( 'SELECT read_at FROM ' . EntriesTable::name() . ' WHERE id = %d', $id ) );

        return null === $value ? null : (string) $value;
    }

    public function testNewestFirstNeighbours(): void
    {
        $a = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'created_at' => '2026-09-22 10:00:00' ] );

        $this->assertSame( [ 'previous' => $c, 'next' => $a ], $this->around( $b ) );
        $this->assertSame( [ 'previous' => null, 'next' => $b ], $this->around( $c ) );
        $this->assertSame( [ 'previous' => $b, 'next' => null ], $this->around( $a ) );
        $this->assertSame( [ 'previous' => $a, 'next' => $c ], $this->around( $b, [ 'order' => 'asc' ] ) );
    }

    public function testEntriesFromTheSameSecondAreSteppedThroughById(): void
    {
        $first  = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $second = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $third  = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );

        $this->assertSame( [ 'previous' => $third, 'next' => $first ], $this->around( $second ) );
    }

    public function testNeighboursStayInsideTheFilter(): void
    {
        $a = $this->seedEntry( [ 'form_id' => 1, 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'form_id' => 2, 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'form_id' => 1, 'created_at' => '2026-09-22 10:00:00' ] );

        $this->assertSame( [ 'previous' => $b, 'next' => null ], $this->around( $a ) );
        $this->assertSame( [ 'previous' => $c, 'next' => null ], $this->around( $a, [ 'form' => '1' ] ) );
    }

    public function testAnEntryReadOnTheWayStillFindsTheNextNewOne(): void
    {
        $a = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'created_at' => '2026-09-22 10:00:00' ] );

        ( new EntryRepository() )->markRead( $b );

        $this->assertSame( [ 'previous' => $c, 'next' => $a ], $this->around( $b, [ 'status' => 'new' ] ) );
    }

    public function testFailedCalculationsAreReachedFromBothSides(): void
    {
        $dear  = $this->seedEntry( [ 'total_decimal' => '50.0000' ] );
        $cheap = $this->seedEntry( [ 'total_decimal' => '5.0000' ] );
        $nullA = $this->seedEntry( [ 'total_decimal' => null ] );
        $nullB = $this->seedEntry( [ 'total_decimal' => null ] );

        // Ən bahalı əvvəl: dear, cheap, nullB, nullA (NULL blok id DESC).
        $byTotal = [ 'orderby' => 'total' ];
        $this->assertSame( [ 'previous' => $dear, 'next' => $nullB ], $this->around( $cheap, $byTotal ) );
        $this->assertSame( [ 'previous' => $cheap, 'next' => $nullA ], $this->around( $nullB, $byTotal ) );
        $this->assertSame( [ 'previous' => $nullB, 'next' => null ], $this->around( $nullA, $byTotal ) );

        // Ən ucuz əvvəl: cheap, dear, nullA, nullB.
        $cheapFirst = [ 'orderby' => 'total', 'order' => 'asc' ];
        $this->assertSame( [ 'previous' => $cheap, 'next' => $nullA ], $this->around( $dear, $cheapFirst ) );
        $this->assertSame( [ 'previous' => $dear, 'next' => $nullB ], $this->around( $nullA, $cheapFirst ) );
    }

    public function testTotalsThatDifferOnlyInTheLastDecimalAreNotEqual(): void
    {
        // Böyüyü KİÇİK id ilə: double müqayisəsində ikisi bərabər görünsəydi, id tie-breaker onu səhv tərəfə atardı.
        $high = $this->seedEntry( [ 'total_decimal' => '12345678901234.5679' ] );
        $low  = $this->seedEntry( [ 'total_decimal' => '12345678901234.5678' ] );

        $byTotal = [ 'orderby' => 'total' ];
        $this->assertSame( [ 'previous' => $high, 'next' => null ], $this->around( $low, $byTotal ) );
        $this->assertSame( [ 'previous' => null, 'next' => $low ], $this->around( $high, $byTotal ) );
    }

    public function testSlicesWalkTheWholeListOnceInOrder(): void
    {
        foreach ( [ '2026-09-23', '2026-09-20', '2026-09-22', '2026-09-22', '2026-09-21', '2026-09-24', '2026-09-20' ] as $day ) {
            $this->seedEntry( [ 'created_at' => $day . ' 08:00:00' ] );
        }

        $repository = new EntryRepository();
        $query      = EntryQuery::forSite( [] );
        $walked     = [];
        $after      = null;

        do {
            $batch  = $repository->slice( $query, $after, 3 );
            $walked = array_merge( $walked, array_column( $batch, 'id' ) );
            $after  = [] === $batch ? null : end( $batch );
        } while ( 3 === count( $batch ) );

        $this->assertSame( array_column( $repository->page( $query, 1, 20 )['items'], 'id' ), $walked );
    }

    public function testAnEntryIsMarkedReadOnlyOnce(): void
    {
        global $wpdb;

        $id         = $this->seedEntry();
        $repository = new EntryRepository();

        $this->assertTrue( $repository->markRead( $id ) );
        $this->assertNotNull( $this->readAt( $id ) );

        $wpdb->update( EntriesTable::name(), [ 'read_at' => '2026-01-01 00:00:00' ], [ 'id' => $id ] );

        $this->assertFalse( $repository->markRead( $id ) );
        $this->assertSame( '2026-01-01 00:00:00', $this->readAt( $id ) );
    }

    public function testSetReadCountsTheEntriesItCovers(): void
    {
        $fresh = $this->seedEntry();
        $old   = $this->seedEntry( [ 'read_at' => '2026-01-01 00:00:00' ] );
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );

        $repository = new EntryRepository();

        $this->assertSame( 2, $repository->setRead( [ $fresh, $old, $draft, 999999 ], true ) );
        $this->assertNotNull( $this->readAt( $fresh ) );
        $this->assertSame( '2026-01-01 00:00:00', $this->readAt( $old ), 'an earlier read time is kept' );
        $this->assertNull( $this->readAt( $draft ) );

        $this->assertSame( 2, $repository->setRead( [ $fresh, $old ], false ) );
        $this->assertNull( $this->readAt( $fresh ) );
        $this->assertNull( $this->readAt( $old ) );
        $this->assertSame( 0, $repository->setRead( [], true ) );
    }

    public function testDeleteCountsOnlyWhatItRemoved(): void
    {
        $gone  = $this->seedEntry();
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );

        $repository = new EntryRepository();

        $this->assertSame( 1, $repository->delete( [ $gone, $draft, 999999 ] ) );
        $this->assertSame( 0, $repository->delete( [ $gone ] ), 'deleting twice is not an error and removes nothing' );
        $this->assertNotNull( $repository->find( $draft ) );
        $this->assertSame( 0, $repository->delete( [] ) );
    }
}
```

- [ ] **Step 2: Run it to verify it fails** — `make itest ARGS="--filter EntryNavigationTest"` → FAIL (`Call to undefined method … neighbours()`).

- [ ] **Step 3: Add the methods to `includes/Entries/EntryRepository.php`** (after `formIdsWithEntries()`):

```php
    /**
     * Keyset səhifələmə: `$after`-dən sonra (və ya əvvəl) gələn `$limit` müraciət, yaxından uzağa.
     *
     * @param array<string, mixed>|null $after hidratlanmış müraciət və ya siyahının başı üçün null
     * @return array<int, array<string, mixed>>
     */
    public function slice( EntryQuery $query, ?array $after, int $limit, bool $forward = true ): array
    {
        global $wpdb;

        $where = $query->where();

        if ( null !== $after ) {
            $where .= ' AND ' . $query->beyond( $after, $forward );
        }

        $rows = $wpdb->get_results(
            'SELECT * FROM ' . EntriesTable::name() . " {$where} " . $query->orderBy( ! $forward ) . ' LIMIT ' . max( 1, $limit ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery; limit is an int.
            ARRAY_A
        );

        return array_map( [ self::class, 'hydrate' ], is_array( $rows ) ? $rows : [] );
    }

    /**
     * @param array<string, mixed> $entry
     * @return array{previous: ?int, next: ?int}
     */
    public function neighbours( EntryQuery $query, array $entry ): array
    {
        $previous = $this->slice( $query, $entry, 1, false );
        $next     = $this->slice( $query, $entry, 1, true );

        return [
            'previous' => [] === $previous ? null : $previous[0]['id'],
            'next'     => [] === $next ? null : $next[0]['id'],
        ];
    }

    /**
     * Müraciət açılanda: `read_at` yalnız bir dəfə yazılır (spec §3.2).
     */
    public function markRead( int $id ): bool
    {
        global $wpdb;

        $changed = $wpdb->query(
            $wpdb->prepare(
                'UPDATE ' . EntriesTable::name() . " SET read_at = %s WHERE id = %d AND status = 'completed' AND read_at IS NULL", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is ours.
                gmdate( 'Y-m-d H:i:s' ),
                $id
            )
        );

        return 1 === $changed;
    }

    /**
     * @param int[] $ids
     * @return int mövcud `completed` müraciətlərdən neçəsi indi istənən vəziyyətdədir
     */
    public function setRead( array $ids, bool $read ): int
    {
        global $wpdb;

        $in = self::idList( $ids );

        if ( '' === $in ) {
            return 0;
        }

        $table = EntriesTable::name();

        if ( $read ) {
            $wpdb->query( $wpdb->prepare( "UPDATE {$table} SET read_at = %s WHERE status = 'completed' AND read_at IS NULL AND id IN ({$in})", gmdate( 'Y-m-d H:i:s' ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- ids are ints.
        } else {
            $wpdb->query( "UPDATE {$table} SET read_at = NULL WHERE status = 'completed' AND read_at IS NOT NULL AND id IN ({$in})" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- ids are ints.
        }

        return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'completed' AND id IN ({$in})" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- ids are ints.
    }

    /**
     * @param int[] $ids
     * @return int həqiqətən silinən sətir sayı
     */
    public function delete( array $ids ): int
    {
        global $wpdb;

        $in = self::idList( $ids );

        if ( '' === $in ) {
            return 0;
        }

        return (int) $wpdb->query( 'DELETE FROM ' . EntriesTable::name() . " WHERE status = 'completed' AND id IN ({$in})" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- ids are ints.
    }

    /**
     * @param int[] $ids
     */
    private static function idList( array $ids ): string
    {
        $clean = array_values( array_unique( array_filter( array_map( 'intval', $ids ), static function ( int $id ): bool {
            return $id > 0;
        } ) ) );

        return implode( ',', $clean );
    }
```

- [ ] **Step 4: Run the test** — `make itest ARGS="--filter EntryNavigationTest"` → PASS (10 test).

- [ ] **Step 5: Verify** — `make itest` → yaşıl (Task 2 testləri də); `docker run --rm -v "$PWD":/app -w /app php:7.4-cli php -l includes/Entries/EntryRepository.php` → "No syntax errors".

---
### Task 4: `EntryPresenter` — siyahı və detal cavabları

**Files:**
- Create: `includes/Entries/EntryPresenter.php`
- Test: `tests/integration/EntryPresenterTest.php`

**Interfaces:**
- Consumes: `EntryRepository::hydrate()` massivi (`total`, `total_decimal`, `data`, `breakdown`, `read_at`, `created_at`, `ip`, `user_id`, `user_agent`); `Runtime\MoneyFormatter::format( $amount, array $settings, string $thousands, string $point )`; `Runtime\Values::stringify( $raw )` (JS `String()` — `3.0` → `"3"`); `FormDirectory::titles()` nəticəsi.
- Produces:
  - `listItem( array $entry, array $titles ): array` → `{ id: int, form_id: int, form_title: ?string (null = silinmiş/zibildə), is_read: bool, name: string, email: string, total: ?string (xam onluq), total_display: string ('' əgər total null), date: { display, full, iso } }`.
  - `detail( array $entry, array $titles ): array` → `listItem` + `{ answers: [ { key, label, type, display } ], breakdown: { lines: [ { key, label, amount_display } ], error: ?string }, details: { ip: ?string, user_agent: string, user: ?{ id, name, url: ?string }, submitted: { display, full, iso } } }`.
  - `answers( array $entry ): array` (yuxarıdakı forma); `EntryPresenter::display( array $answer ): string` (statik; CSV də işlədir); `formTitle( int $formId, array $titles ): ?string`; `date( string $createdAt ): array{display: string, full: string, iso: string}`; `csvDate( string $createdAt ): string` (`Y-m-d H:i:s`, saytın saat qurşağında).
- Qaydalar: mətn XAM qaytarılır (R15) — `<b>` sətri `<b>` olaraq qalır, `esc_html` YOXDUR (React escape edir; burada escape ekranda `&lt;b&gt;` göstərərdi). Name = snapshot sırası ilə ilk **boş olmayan** `text` cavabı (ilk `text` sahəsi boş qalıbsa — məs. könüllü "Company" — ad itməsin); Email = ilk boş olmayan `email`. Toggle → `Yes`/`No` (tərcümə olunur). Boş cavab → `''` (UI `—` göstərir).

- [ ] **Step 1: Write the failing test** — `tests/integration/EntryPresenterTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryPresenter;
use Quoteform\Entries\EntryRepository;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

final class EntryPresenterTest extends WP_UnitTestCase
{
    use SeedsEntries;

    /** @var array<string, string> */
    private $savedNumberFormat = [];

    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
        EntriesTable::install();
        update_option( 'timezone_string', 'Asia/Baku' );
        update_option( 'date_format', 'F j, Y' );
        update_option( 'time_format', 'g:i a' );

        global $wp_locale;
        $this->savedNumberFormat = $wp_locale->number_format;
    }

    protected function tearDown(): void
    {
        global $wp_locale;
        $wp_locale->number_format = $this->savedNumberFormat;
        parent::tearDown();
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function stored( array $overrides = [] ): array
    {
        return ( new EntryRepository() )->find( $this->seedEntry( $overrides ) );
    }

    public function testAListItemCarriesWhatTheTableShows(): void
    {
        $entry = $this->stored( [ 'form_id' => 7, 'total' => 180.0, 'created_at' => '2026-09-24 21:30:00' ] );
        $item  = ( new EntryPresenter() )->listItem( $entry, [ 7 => 'Cleaning quote' ] );

        $this->assertSame( $entry['id'], $item['id'] );
        $this->assertSame( 7, $item['form_id'] );
        $this->assertSame( 'Cleaning quote', $item['form_title'] );
        $this->assertFalse( $item['is_read'] );
        $this->assertSame( 'Jane Doe', $item['name'] );
        $this->assertSame( 'jane@example.com', $item['email'] );
        $this->assertSame( '180.0000', $item['total'] );
        $this->assertSame( '$180.00', $item['total_display'] );
        $this->assertSame( 'September 25, 2026 1:30 am', $item['date']['display'] );
        $this->assertStringStartsWith( '2026-09-25 01:30:00', $item['date']['full'] );
        $this->assertSame( '2026-09-24T21:30:00Z', $item['date']['iso'] );
    }

    public function testAMissingOrUntitledFormIsNamedHonestly(): void
    {
        $presenter = new EntryPresenter();

        $this->assertNull( $presenter->formTitle( 7, [] ) );
        $this->assertSame( 'Form #7', $presenter->formTitle( 7, [ 7 => '' ] ) );
    }

    public function testAFailedCalculationHasNoTotal(): void
    {
        $item = ( new EntryPresenter() )->listItem( $this->stored( [ 'total' => null ] ), [] );

        $this->assertNull( $item['total'] );
        $this->assertSame( '', $item['total_display'] );
    }

    public function testMoneyUsesTheEntrysOwnFormatAndTheSitesSeparators(): void
    {
        global $wp_locale;
        $wp_locale->number_format = [ 'thousands_sep' => '.', 'decimal_point' => ',' ];

        $entry = $this->stored( [
            'total'     => 1234.5,
            'currency'  => 'EUR',
            'breakdown' => [ 'currency' => 'EUR', 'position' => 'after', 'decimals' => 2, 'lines' => [ [ 'key' => 'base', 'label' => 'Base', 'amount' => 1234.5 ] ], 'error' => null ],
        ] );
        $detail = ( new EntryPresenter() )->detail( $entry, [] );

        $this->assertSame( '1.234,50 €', $detail['total_display'] );
        $this->assertSame( [ [ 'key' => 'base', 'label' => 'Base', 'amount_display' => '1.234,50 €' ] ], $detail['breakdown']['lines'] );
    }

    public function testNameAndEmailSkipEmptyAnswers(): void
    {
        $entry = $this->stored( [
            'data' => [
                'company' => [ 'label' => 'Company', 'type' => 'text', 'value' => '' ],
                'name'    => [ 'label' => 'Name', 'type' => 'text', 'value' => 'Leyla' ],
                'work'    => [ 'label' => 'Work email', 'type' => 'email', 'value' => '' ],
                'home'    => [ 'label' => 'Home email', 'type' => 'email', 'value' => 'leyla@example.com' ],
            ],
        ] );
        $item = ( new EntryPresenter() )->listItem( $entry, [] );

        $this->assertSame( 'Leyla', $item['name'] );
        $this->assertSame( 'leyla@example.com', $item['email'] );
    }

    public function testNoTextOrEmailFieldMeansEmptyStrings(): void
    {
        $item = ( new EntryPresenter() )->listItem( $this->stored( [ 'data' => [ 'rooms' => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3.0 ] ] ] ), [] );

        $this->assertSame( '', $item['name'] );
        $this->assertSame( '', $item['email'] );
    }

    public function testAnswersAreReadyToShowAndStayRaw(): void
    {
        $entry = $this->stored( [
            'data' => [
                'name'   => [ 'label' => 'Name', 'type' => 'text', 'value' => '<b>Jane</b> & "Co"' ],
                'notes'  => [ 'label' => 'Notes', 'type' => 'textarea', 'value' => "Line one\nLine two" ],
                'rooms'  => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3.0 ],
                'area'   => [ 'label' => 'Area', 'type' => 'slider', 'value' => 2.5 ],
                'empty'  => [ 'label' => 'Phone', 'type' => 'tel', 'value' => '' ],
                'plan'   => [ 'label' => 'Plan', 'type' => 'radio', 'value' => 'deep', 'display' => 'Deep clean' ],
                'extras' => [ 'label' => 'Extras', 'type' => 'checkbox', 'value' => [ 'oven', 'fridge' ], 'display' => [ 'Oven', '' ] ],
                'agree'  => [ 'label' => 'Agree', 'type' => 'toggle', 'value' => 1 ],
                'news'   => [ 'label' => 'News', 'type' => 'toggle', 'value' => 0 ],
                'source' => [ 'label' => '', 'type' => 'hidden', 'value' => 'google' ],
            ],
        ] );

        $this->assertSame(
            [
                [ 'key' => 'name', 'label' => 'Name', 'type' => 'text', 'display' => '<b>Jane</b> & "Co"' ],
                [ 'key' => 'notes', 'label' => 'Notes', 'type' => 'textarea', 'display' => "Line one\nLine two" ],
                [ 'key' => 'rooms', 'label' => 'Rooms', 'type' => 'number', 'display' => '3' ],
                [ 'key' => 'area', 'label' => 'Area', 'type' => 'slider', 'display' => '2.5' ],
                [ 'key' => 'empty', 'label' => 'Phone', 'type' => 'tel', 'display' => '' ],
                [ 'key' => 'plan', 'label' => 'Plan', 'type' => 'radio', 'display' => 'Deep clean' ],
                [ 'key' => 'extras', 'label' => 'Extras', 'type' => 'checkbox', 'display' => 'Oven, fridge' ],
                [ 'key' => 'agree', 'label' => 'Agree', 'type' => 'toggle', 'display' => 'Yes' ],
                [ 'key' => 'news', 'label' => 'News', 'type' => 'toggle', 'display' => 'No' ],
                [ 'key' => 'source', 'label' => '', 'type' => 'hidden', 'display' => 'google' ],
            ],
            ( new EntryPresenter() )->answers( $entry )
        );
    }

    public function testTheBreakdownErrorAndMissingAmountsComeThrough(): void
    {
        $entry = $this->stored( [
            'total'     => null,
            'breakdown' => [ 'currency' => 'USD', 'position' => 'before', 'decimals' => 2, 'lines' => [ [ 'key' => 'base', 'label' => 'Base', 'amount' => null ] ], 'error' => 'division_by_zero' ],
        ] );
        $detail = ( new EntryPresenter() )->detail( $entry, [] );

        $this->assertSame( 'division_by_zero', $detail['breakdown']['error'] );
        $this->assertSame( '', $detail['breakdown']['lines'][0]['amount_display'] );
    }

    public function testDetailsNameTheIpBrowserAndUser(): void
    {
        $admin  = self::factory()->user->create( [ 'role' => 'administrator' ] );
        $sender = self::factory()->user->create( [ 'display_name' => 'Sam Sender' ] );
        wp_set_current_user( $admin );

        $entry   = $this->stored( [ 'ip' => inet_pton( '2001:db8::1' ), 'user_id' => $sender, 'user_agent' => 'Firefox/130' ] );
        $details = ( new EntryPresenter() )->detail( $entry, [] )['details'];

        $this->assertSame( '2001:db8::1', $details['ip'] );
        $this->assertSame( 'Firefox/130', $details['user_agent'] );
        $this->assertSame( 'Sam Sender', $details['user']['name'] );
        $this->assertStringContainsString( 'user_id=' . $sender, (string) $details['user']['url'] );
        $this->assertSame( $entry['created_at'], gmdate( 'Y-m-d H:i:s', strtotime( $details['submitted']['iso'] ) ) );
    }

    public function testADeletedUserAndAMissingIpAreSaidPlainly(): void
    {
        $editor = self::factory()->user->create( [ 'role' => 'editor' ] );
        wp_set_current_user( $editor );

        $details = ( new EntryPresenter() )->detail( $this->stored( [ 'user_id' => 987654 ] ), [] )['details'];

        $this->assertNull( $details['ip'] );
        $this->assertSame( [ 'id' => 987654, 'name' => 'Deleted user #987654', 'url' => null ], $details['user'] );
    }

    public function testNoUserMeansNoUserRow(): void
    {
        $this->assertNull( ( new EntryPresenter() )->detail( $this->stored(), [] )['details']['user'] );
    }

    public function testCsvDatesUseTheSiteTimezone(): void
    {
        $this->assertSame( '2026-09-25 01:30:00', ( new EntryPresenter() )->csvDate( '2026-09-24 21:30:00' ) );
    }
}
```

- [ ] **Step 2: Run it to verify it fails** — `make itest ARGS="--filter EntryPresenterTest"` → FAIL (`Class "Quoteform\Entries\EntryPresenter" not found`).

- [ ] **Step 3: Create `includes/Entries/EntryPresenter.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use DateTimeImmutable;
use DateTimeZone;
use Quoteform\Runtime\MoneyFormatter;
use Quoteform\Runtime\Values;
use WP_User;

/**
 * Saxlanmış müraciəti admin ekranı üçün HAZIR şəklə salır (spec §2.4): məbləğ,
 * tarix və cavabların göstərilən mətni serverdədir, JS-də ikinci format kodu yoxdur.
 *
 * Mətn XAM qalır (Plan 06 R15). JSON-a escape yazılmır, çünki React onu text node
 * kimi göstərir — burada esc_html etmək ekranda `&lt;b&gt;` göstərərdi. HTML çap
 * edən hər PHP yeri öz esc_* çağırışını edir.
 */
final class EntryPresenter
{
    /**
     * @param array<string, mixed> $entry  EntryRepository::hydrate()
     * @param array<int, string>   $titles FormDirectory::titles()
     * @return array<string, mixed>
     */
    public function listItem( array $entry, array $titles ): array
    {
        $answers = $this->answers( $entry );

        return [
            'id'            => (int) $entry['id'],
            'form_id'       => (int) $entry['form_id'],
            'form_title'    => $this->formTitle( (int) $entry['form_id'], $titles ),
            'is_read'       => null !== $entry['read_at'],
            'name'          => self::first( $answers, 'text' ),
            'email'         => self::first( $answers, 'email' ),
            'total'         => $entry['total_decimal'],
            'total_display' => null === $entry['total'] ? '' : $this->money( $entry['total'], $entry ),
            'date'          => $this->date( (string) $entry['created_at'] ),
        ];
    }

    /**
     * @param array<string, mixed> $entry
     * @param array<int, string>   $titles
     * @return array<string, mixed>
     */
    public function detail( array $entry, array $titles ): array
    {
        $breakdown = is_array( $entry['breakdown'] ?? null ) ? $entry['breakdown'] : [];
        $lines     = [];

        foreach ( is_array( $breakdown['lines'] ?? null ) ? $breakdown['lines'] : [] as $line ) {
            if ( ! is_array( $line ) ) {
                continue;
            }

            $amount  = $line['amount'] ?? null;
            $lines[] = [
                'key'            => (string) ( $line['key'] ?? '' ),
                'label'          => (string) ( $line['label'] ?? '' ),
                'amount_display' => ( is_int( $amount ) || is_float( $amount ) ) ? $this->money( $amount, $entry ) : '',
            ];
        }

        return array_merge(
            $this->listItem( $entry, $titles ),
            [
                'answers'   => $this->answers( $entry ),
                'breakdown' => [
                    'lines' => $lines,
                    'error' => is_string( $breakdown['error'] ?? null ) ? $breakdown['error'] : null,
                ],
                'details'   => [
                    'ip'         => self::ip( $entry['ip'] ?? null ),
                    'user_agent' => (string) ( $entry['user_agent'] ?? '' ),
                    'user'       => self::user( $entry['user_id'] ?? null ),
                    'submitted'  => $this->date( (string) $entry['created_at'] ),
                ],
            ]
        );
    }

    /**
     * @param array<string, mixed> $entry
     * @return array<int, array{key: string, label: string, type: string, display: string}>
     */
    public function answers( array $entry ): array
    {
        $answers = [];

        foreach ( is_array( $entry['data'] ?? null ) ? $entry['data'] : [] as $key => $answer ) {
            if ( ! is_array( $answer ) ) {
                continue;
            }

            $answers[] = [
                'key'     => (string) $key,
                'label'   => (string) ( $answer['label'] ?? '' ),
                'type'    => (string) ( $answer['type'] ?? '' ),
                'display' => self::display( $answer ),
            ];
        }

        return $answers;
    }

    /**
     * Bir cavabın göstərilən mətni — admin detalı və CSV eyni funksiyanı işlədir.
     *
     * @param array<string, mixed> $answer snapshot elementi: label, type, value, (display)
     */
    public static function display( array $answer ): string
    {
        $value = $answer['value'] ?? '';

        switch ( (string) ( $answer['type'] ?? '' ) ) {
            case 'toggle':
                return ( 1 === $value || true === $value || '1' === $value ) ? __( 'Yes', 'quoteform' ) : __( 'No', 'quoteform' );

            case 'checkbox':
                $labels  = [];
                $display = is_array( $answer['display'] ?? null ) ? array_values( $answer['display'] ) : [];

                foreach ( is_array( $value ) ? array_values( $value ) : [] as $index => $item ) {
                    $label    = $display[ $index ] ?? '';
                    $labels[] = is_string( $label ) && '' !== $label ? $label : self::scalar( $item );
                }

                return implode( ', ', $labels );

            case 'select':
            case 'radio':
                $label = $answer['display'] ?? '';

                return is_string( $label ) && '' !== $label ? $label : self::scalar( $value );
        }

        return self::scalar( $value );
    }

    /**
     * @param array<int, string> $titles
     */
    public function formTitle( int $formId, array $titles ): ?string
    {
        if ( ! array_key_exists( $formId, $titles ) ) {
            return null;
        }

        return '' === trim( $titles[ $formId ] )
            /* translators: %d: form id. */
            ? sprintf( __( 'Form #%d', 'quoteform' ), $formId )
            : $titles[ $formId ];
    }

    /**
     * @return array{display: string, full: string, iso: string}
     */
    public function date( string $createdAt ): array
    {
        $timestamp = self::timestamp( $createdAt );
        $format    = trim( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) );

        return [
            'display' => (string) wp_date( '' === $format ? 'Y-m-d H:i' : $format, $timestamp ),
            'full'    => (string) wp_date( 'Y-m-d H:i:s T', $timestamp ),
            'iso'     => gmdate( 'Y-m-d\TH:i:s\Z', $timestamp ),
        ];
    }

    public function csvDate( string $createdAt ): string
    {
        return (string) wp_date( 'Y-m-d H:i:s', self::timestamp( $createdAt ) );
    }

    /**
     * `created_at` UTC-dir (EntryRepository `gmdate` yazır).
     */
    private static function timestamp( string $createdAt ): int
    {
        return ( new DateTimeImmutable( $createdAt, new DateTimeZone( 'UTC' ) ) )->getTimestamp();
    }

    /**
     * @param int|float            $amount
     * @param array<string, mixed> $entry
     */
    private function money( $amount, array $entry ): string
    {
        global $wp_locale;

        $breakdown = is_array( $entry['breakdown'] ?? null ) ? $entry['breakdown'] : [];
        $settings  = [
            'currency'          => is_string( $breakdown['currency'] ?? null ) ? $breakdown['currency'] : (string) $entry['currency'],
            'currency_position' => $breakdown['position'] ?? 'before',
            'decimals'          => $breakdown['decimals'] ?? 2,
        ];
        $thousands = isset( $wp_locale->number_format['thousands_sep'] ) ? (string) $wp_locale->number_format['thousands_sep'] : ',';
        $point     = isset( $wp_locale->number_format['decimal_point'] ) ? (string) $wp_locale->number_format['decimal_point'] : '.';

        return MoneyFormatter::format( $amount, $settings, $thousands, $point );
    }

    /**
     * @param array<int, array{key: string, label: string, type: string, display: string}> $answers
     */
    private static function first( array $answers, string $type ): string
    {
        foreach ( $answers as $answer ) {
            if ( $type === $answer['type'] && '' !== $answer['display'] ) {
                return $answer['display'];
            }
        }

        return '';
    }

    /**
     * @param mixed $value
     */
    private static function scalar( $value ): string
    {
        if ( is_string( $value ) ) {
            return $value;
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return Values::stringify( $value );
        }

        return '';
    }

    /**
     * @param mixed $packed
     */
    private static function ip( $packed ): ?string
    {
        // Binar sütun: uzunluq BAYTLA ölçülür (4 = IPv4, 16 = IPv6) — burada strlen düzgündür.
        if ( ! is_string( $packed ) || ! in_array( strlen( $packed ), [ 4, 16 ], true ) ) {
            return null;
        }

        $text = inet_ntop( $packed );

        return false === $text ? null : $text;
    }

    /**
     * @param mixed $userId
     * @return array{id: int, name: string, url: ?string}|null
     */
    private static function user( $userId ): ?array
    {
        if ( ! is_int( $userId ) || $userId < 1 ) {
            return null;
        }

        $user = get_userdata( $userId );

        if ( ! $user instanceof WP_User ) {
            return [
                'id'   => $userId,
                /* translators: %d: user id. */
                'name' => sprintf( __( 'Deleted user #%d', 'quoteform' ), $userId ),
                'url'  => null,
            ];
        }

        return [
            'id'   => $userId,
            'name' => (string) $user->display_name,
            'url'  => current_user_can( 'edit_user', $userId ) ? (string) get_edit_user_link( $userId ) : null,
        ];
    }
}
```

- [ ] **Step 4: Run the test** — `make itest ARGS="--filter EntryPresenterTest"` → PASS (12 test).

- [ ] **Step 5: Verify** — `make itest` → yaşıl; `docker run --rm -v "$PWD":/app -w /app php:7.4-cli php -l includes/Entries/EntryPresenter.php` → "No syntax errors"; `grep -n "esc_html\|substr\|mb_substr" includes/Entries/EntryPresenter.php` → heç nə (yalnız şərhdə "strlen" qeyd olunub, kodda `strlen` yalnız `ip()`-də).

---
### Task 5: Admin REST — `EntriesAdminController` + `per_page` seçimi

**Files:**
- Create: `includes/Entries/EntryPreferences.php`
- Create: `includes/Rest/EntriesAdminController.php`
- Modify: `includes/Plugin.php` (`rest_api_init` daxilində bir sətir + `use`)
- Modify: `includes/Support/Uninstaller.php` (user meta silinməsi)
- Test: `tests/integration/EntriesAdminRestTest.php`, `tests/integration/UninstallPreferencesTest.php`

**Interfaces:**
- Consumes: `EntryQuery::forSite()`; `EntryRepository::page/findCompleted/markRead/neighbours/setRead/delete/countUnread` (Task 2–3); `EntryPresenter::listItem/detail` (Task 4); `FormDirectory::titles()`; `Capabilities::VIEW_ENTRIES`, `MANAGE_FORMS`; `FormsController::NAMESPACE` (`'quoteform/v1'`).
- Produces (REST, hamısı cookie + `X-WP-Nonce`):
  - `GET /quoteform/v1/entries?form&status&from&to&min&max&orderby&order&page&per_page` → `200 { items: listItem[], total: int, pages: int, page: int (sıxılmış), per_page: int, unread: int }` — `qform_view_entries`.
  - `GET /quoteform/v1/entries/{id}?<eyni filtrlər>` → `200 detail + { neighbours: { previous: ?int, next: ?int }, unread: int }`; oxunmamışdısa `read_at` yazılır (bir dəfə); `404 { code: 'qform_entry_not_found' }` — `qform_view_entries`.
  - `POST /quoteform/v1/entries/batch { action: 'read'|'unread'|'delete', ids: int[1..100] }` → `200 { affected: int, unread: int }`; sxem pozuntusu `400 rest_invalid_param` — `read`/`unread`: `qform_view_entries`, `delete`: `qform_manage_forms`.
  - `DELETE /quoteform/v1/entries/{id}` → `200 { id, deleted: true, unread }` / `404` — `qform_manage_forms`.
  - `EntryPreferences::META = 'qform_entries_per_page'`, `DEFAULT_PER_PAGE = 20`, `MAX_PER_PAGE = 100`; `perPage( int $userId ): int`; `save( int $userId, $raw ): int` (rəqəm deyilsə saxlanmış dəyər; 1–100-ə sıxılır; yalnız dəyişəndə yazır).
- Qeydlər: ictimai `POST /entries` (`EntriesController`) dəyişmir — WordPress eyni route-a ikinci `register_rest_route()`-u birləşdirir (`override = false`). Filtr parametrləri `get_query_params()`-dan oxunur (JSON body filtr daşıya bilməz); REST arqumenti kimi elan EDİLMİR — etibarsız dəyər 400 yox, default olmalıdır (spec §2.3). `per_page` URL-də saxlanmır; JS onu hər sorğuda göndərir, server yalnız dəyişəndə meta yazır.

- [ ] **Step 1: Write the failing REST test** — `tests/integration/EntriesAdminRestTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryPreferences;
use Quoteform\Forms\FormPostType;
use Quoteform\Support\Capabilities;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_UnitTestCase;
use WP_User;

final class EntriesAdminRestTest extends WP_UnitTestCase
{
    use SeedsEntries;

    /** @var WP_REST_Server */
    private $server;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
        Capabilities::grantToAdministrator();
        update_option( 'timezone_string', 'UTC' );

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;
        do_action( 'rest_api_init' );
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function asAdmin(): int
    {
        $id = self::factory()->user->create( [ 'role' => 'administrator' ] );
        wp_set_current_user( $id );

        return $id;
    }

    /** Redaktor + yalnız müraciət görmə icazəsi. */
    private function asViewer(): int
    {
        $id = self::factory()->user->create( [ 'role' => 'editor' ] );
        ( new WP_User( $id ) )->add_cap( Capabilities::VIEW_ENTRIES );
        wp_set_current_user( $id );

        return $id;
    }

    private function asEditor(): int
    {
        $id = self::factory()->user->create( [ 'role' => 'editor' ] );
        wp_set_current_user( $id );

        return $id;
    }

    /**
     * @param array<string, mixed>      $query
     * @param array<string, mixed>|null $body
     */
    private function call( string $method, string $route, array $query = [], ?array $body = null ): WP_REST_Response
    {
        $request = new WP_REST_Request( $method, $route );
        $request->set_query_params( $query );

        if ( null !== $body ) {
            $request->set_header( 'content-type', 'application/json' );
            $request->set_body( (string) wp_json_encode( $body ) );
        }

        return rest_ensure_response( $this->server->dispatch( $request ) );
    }

    public function testTheAdminMethodsJoinThePublicRoute(): void
    {
        $routes  = $this->server->get_routes();
        $methods = static function ( array $handlers ): array {
            $all = [];

            foreach ( $handlers as $handler ) {
                $all = array_merge( $all, array_keys( $handler['methods'] ) );
            }

            sort( $all );

            return $all;
        };

        $this->assertSame( [ 'GET', 'POST' ], $methods( $routes['/quoteform/v1/entries'] ) );
        $this->assertSame( [ 'DELETE', 'GET' ], $methods( $routes['/quoteform/v1/entries/(?P<id>[\d]+)'] ) );
        $this->assertSame( [ 'POST' ], $methods( $routes['/quoteform/v1/entries/batch'] ) );
    }

    public function testEveryAdminEndpointRefusesAUserWithoutTheCapability(): void
    {
        $id = $this->seedEntry();
        $this->asEditor();

        $this->assertSame( 403, $this->call( 'GET', '/quoteform/v1/entries' )->get_status() );
        $this->assertSame( 403, $this->call( 'GET', '/quoteform/v1/entries/' . $id )->get_status() );
        $this->assertSame( 403, $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'read', 'ids' => [ $id ] ] )->get_status() );
        $this->assertSame( 403, $this->call( 'DELETE', '/quoteform/v1/entries/' . $id )->get_status() );
        $this->assertNull( get_user_meta( get_current_user_id(), EntryPreferences::META, true ) ?: null );
    }

    public function testAViewerCanReadButNotDelete(): void
    {
        $id = $this->seedEntry();
        $this->asViewer();

        $this->assertSame( 200, $this->call( 'GET', '/quoteform/v1/entries' )->get_status() );
        $this->assertSame( 200, $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'read', 'ids' => [ $id ] ] )->get_status() );
        $this->assertSame( 403, $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'delete', 'ids' => [ $id ] ] )->get_status() );
        $this->assertSame( 403, $this->call( 'DELETE', '/quoteform/v1/entries/' . $id )->get_status() );
    }

    public function testTheListIsFilteredAndCountsUnread(): void
    {
        $this->asAdmin();
        $new  = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00', 'read_at' => '2026-09-22 10:00:00' ] );
        $newer = $this->seedEntry( [ 'created_at' => '2026-09-23 10:00:00' ] );

        $data = $this->call( 'GET', '/quoteform/v1/entries', [ 'status' => 'new', 'orderby' => 'nope' ] )->get_data();

        $this->assertSame( [ $newer, $new ], array_column( $data['items'], 'id' ) );
        $this->assertSame( 2, $data['total'] );
        $this->assertSame( 1, $data['pages'] );
        $this->assertSame( 1, $data['page'] );
        $this->assertSame( 20, $data['per_page'] );
        $this->assertSame( 2, $data['unread'] );
        $this->assertSame( [ 'id', 'form_id', 'form_title', 'is_read', 'name', 'email', 'total', 'total_display', 'date' ], array_keys( $data['items'][0] ) );
    }

    public function testAPageBeyondTheEndComesBackAsTheLastPage(): void
    {
        $this->asAdmin();

        for ( $i = 0; $i < 3; $i++ ) {
            $this->seedEntry();
        }

        $data = $this->call( 'GET', '/quoteform/v1/entries', [ 'page' => '7', 'per_page' => '2' ] )->get_data();

        $this->assertSame( 2, $data['page'] );
        $this->assertCount( 1, $data['items'] );
    }

    public function testThePerPageChoiceIsRememberedPerUser(): void
    {
        $admin = $this->asAdmin();

        $this->assertSame( 50, $this->call( 'GET', '/quoteform/v1/entries', [ 'per_page' => '50' ] )->get_data()['per_page'] );
        $this->assertSame( '50', get_user_meta( $admin, EntryPreferences::META, true ) );
        $this->assertSame( 50, $this->call( 'GET', '/quoteform/v1/entries' )->get_data()['per_page'] );
        $this->assertSame( 100, $this->call( 'GET', '/quoteform/v1/entries', [ 'per_page' => '500' ] )->get_data()['per_page'] );
        $this->assertSame( 100, $this->call( 'GET', '/quoteform/v1/entries', [ 'per_page' => 'lots' ] )->get_data()['per_page'] );

        $this->asViewer();
        $this->assertSame( 20, $this->call( 'GET', '/quoteform/v1/entries' )->get_data()['per_page'], 'another user keeps the default' );
    }

    public function testOpeningAnEntryMarksItReadOnce(): void
    {
        global $wpdb;

        $this->asAdmin();
        $id = $this->seedEntry();
        $this->seedEntry();

        $data = $this->call( 'GET', '/quoteform/v1/entries/' . $id )->get_data();

        $this->assertTrue( $data['is_read'] );
        $this->assertSame( 1, $data['unread'] );

        $wpdb->update( EntriesTable::name(), [ 'read_at' => '2026-01-01 00:00:00' ], [ 'id' => $id ] );
        $this->call( 'GET', '/quoteform/v1/entries/' . $id );

        $this->assertSame( '2026-01-01 00:00:00', $wpdb->get_var( $wpdb->prepare( 'SELECT read_at FROM ' . EntriesTable::name() . ' WHERE id = %d', $id ) ) );
    }

    public function testTheDetailCarriesNeighboursForTheCurrentFilters(): void
    {
        $this->asAdmin();
        $a = $this->seedEntry( [ 'form_id' => 1, 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'form_id' => 2, 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'form_id' => 1, 'created_at' => '2026-09-22 10:00:00' ] );

        $this->assertSame( [ 'previous' => $b, 'next' => null ], $this->call( 'GET', '/quoteform/v1/entries/' . $a )->get_data()['neighbours'] );
        $this->assertSame( [ 'previous' => $c, 'next' => null ], $this->call( 'GET', '/quoteform/v1/entries/' . $a, [ 'form' => '1' ] )->get_data()['neighbours'] );
    }

    public function testReadingNewEntriesOneByOneKeepsFindingTheNextNewOne(): void
    {
        $this->asAdmin();
        $a = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'created_at' => '2026-09-22 10:00:00' ] );

        $first = $this->call( 'GET', '/quoteform/v1/entries/' . $c, [ 'status' => 'new' ] )->get_data();
        $this->assertSame( $b, $first['neighbours']['next'] );

        $second = $this->call( 'GET', '/quoteform/v1/entries/' . $b, [ 'status' => 'new' ] )->get_data();
        $this->assertSame( [ 'previous' => null, 'next' => $a ], $second['neighbours'], 'c is read now, so it is no longer a New neighbour' );
    }

    public function testDraftsAndUnknownIdsAreNotFound(): void
    {
        $this->asAdmin();
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );

        foreach ( [ $draft, 999999 ] as $id ) {
            $response = $this->call( 'GET', '/quoteform/v1/entries/' . $id );

            $this->assertSame( 404, $response->get_status() );
            $this->assertSame( 'qform_entry_not_found', $response->get_data()['code'] );
        }
    }

    /**
     * @dataProvider badBatches
     * @param array<string, mixed> $body
     */
    public function testMalformedBatchesAreRejected( array $body ): void
    {
        $this->asAdmin();

        $this->assertSame( 400, $this->call( 'POST', '/quoteform/v1/entries/batch', [], $body )->get_status() );
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function badBatches(): array
    {
        return [
            'no ids'          => [ [ 'action' => 'read', 'ids' => [] ] ],
            '101 ids'         => [ [ 'action' => 'read', 'ids' => range( 1, 101 ) ] ],
            'a word'          => [ [ 'action' => 'read', 'ids' => [ 'abc' ] ] ],
            'zero'            => [ [ 'action' => 'read', 'ids' => [ 0 ] ] ],
            'negative'        => [ [ 'action' => 'delete', 'ids' => [ -4 ] ] ],
            'unknown action'  => [ [ 'action' => 'archive', 'ids' => [ 1 ] ] ],
        ];
    }

    public function testBatchActionsReportWhatTheyTouched(): void
    {
        $this->asAdmin();
        $a = $this->seedEntry();
        $b = $this->seedEntry();

        $this->assertSame( [ 'affected' => 2, 'unread' => 0 ], $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'read', 'ids' => [ $a, $b, $b ] ] )->get_data() );
        $this->assertSame( [ 'affected' => 1, 'unread' => 1 ], $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'unread', 'ids' => [ $a ] ] )->get_data() );
        $this->assertSame( [ 'affected' => 2, 'unread' => 0 ], $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'delete', 'ids' => [ $a, $b, 999999 ] ] )->get_data() );
        $this->assertSame( [ 'affected' => 0, 'unread' => 0 ], $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'delete', 'ids' => [ $a ] ] )->get_data() );
    }

    public function testDeletingOneEntry(): void
    {
        $this->asAdmin();
        $id = $this->seedEntry();

        $this->assertSame( [ 'id' => $id, 'deleted' => true, 'unread' => 0 ], $this->call( 'DELETE', '/quoteform/v1/entries/' . $id )->get_data() );
        $this->assertSame( 404, $this->call( 'DELETE', '/quoteform/v1/entries/' . $id )->get_status() );
    }
}
```

- [ ] **Step 2: Write the failing uninstall test** — `tests/integration/UninstallPreferencesTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntryPreferences;
use Quoteform\Support\Capabilities;
use Quoteform\Support\Uninstaller;
use WP_UnitTestCase;

final class UninstallPreferencesTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    public function testUninstallForgetsEveryUsersPageSize(): void
    {
        $first  = self::factory()->user->create();
        $second = self::factory()->user->create();
        update_user_meta( $first, EntryPreferences::META, 50 );
        update_user_meta( $second, EntryPreferences::META, 100 );
        update_user_meta( $second, 'some_other_plugin', 'kept' );

        Uninstaller::run();

        $this->assertSame( '', get_user_meta( $first, EntryPreferences::META, true ) );
        $this->assertSame( '', get_user_meta( $second, EntryPreferences::META, true ) );
        $this->assertSame( 'kept', get_user_meta( $second, 'some_other_plugin', true ) );
    }
}
```

- [ ] **Step 3: Run both to verify they fail** — `make itest ARGS="--filter 'EntriesAdminRestTest|UninstallPreferencesTest'"` → FAIL (`Class "Quoteform\Entries\EntryPreferences" not found`).

- [ ] **Step 4: Create `includes/Entries/EntryPreferences.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

/**
 * Müraciət siyahısının səhifə ölçüsü — istifadəçinin öz seçimi (spec §3.1).
 * URL-də saxlanmır: paylaşılan link başqasının seçimini dəyişməməlidir.
 */
final class EntryPreferences
{
    public const META             = 'qform_entries_per_page';
    public const DEFAULT_PER_PAGE = 20;
    public const MAX_PER_PAGE     = 100;

    public static function perPage( int $userId ): int
    {
        $stored = $userId > 0 ? (int) get_user_meta( $userId, self::META, true ) : 0;

        return $stored >= 1 && $stored <= self::MAX_PER_PAGE ? $stored : self::DEFAULT_PER_PAGE;
    }

    /**
     * @param mixed $raw
     */
    public static function save( int $userId, $raw ): int
    {
        if ( ! is_numeric( $raw ) ) {
            return self::perPage( $userId );
        }

        $value = max( 1, min( self::MAX_PER_PAGE, (int) $raw ) );

        if ( $userId > 0 && self::perPage( $userId ) !== $value ) {
            update_user_meta( $userId, self::META, $value );
        }

        return $value;
    }
}
```

- [ ] **Step 5: Create `includes/Rest/EntriesAdminController.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rest;

use Quoteform\Entries\EntryPreferences;
use Quoteform\Entries\EntryPresenter;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Entries\FormDirectory;
use Quoteform\Support\Capabilities;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Admin müraciət ekranının REST-i (spec §2.4).
 *
 * İctimai `POST /entries`-ə (EntriesController) toxunmur: eyni route-a yeni
 * metodlar əlavə edir, WordPress onları birləşdirir və hər metodun öz
 * permission_callback-i olur. Filtrlər REST arqumenti kimi elan EDİLMİR:
 * etibarsız dəyər 400 yox, default olmalıdır — oxunuş EntryQuery::forSite()-dədir.
 */
final class EntriesAdminController
{
    public const MAX_BATCH = 100;

    /** @var EntryRepository */
    private $entries;

    /** @var EntryPresenter */
    private $presenter;

    public function __construct( ?EntryRepository $entries = null, ?EntryPresenter $presenter = null )
    {
        $this->entries   = $entries ?? new EntryRepository();
        $this->presenter = $presenter ?? new EntryPresenter();
    }

    public function registerRoutes(): void
    {
        register_rest_route(
            FormsController::NAMESPACE,
            '/entries',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'getItems' ],
                'permission_callback' => [ $this, 'canView' ],
            ]
        );

        register_rest_route(
            FormsController::NAMESPACE,
            '/entries/batch',
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'batch' ],
                'permission_callback' => [ $this, 'canBatch' ],
                'args'                => [
                    'action' => [
                        'type'     => 'string',
                        'required' => true,
                        'enum'     => [ 'read', 'unread', 'delete' ],
                    ],
                    'ids'    => [
                        'type'     => 'array',
                        'required' => true,
                        'minItems' => 1,
                        'maxItems' => self::MAX_BATCH,
                        'items'    => [ 'type' => 'integer', 'minimum' => 1 ],
                    ],
                ],
            ]
        );

        register_rest_route(
            FormsController::NAMESPACE,
            '/entries/(?P<id>[\d]+)',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [ $this, 'getItem' ],
                    'permission_callback' => [ $this, 'canView' ],
                ],
                [
                    'methods'             => 'DELETE',
                    'callback'            => [ $this, 'deleteItem' ],
                    'permission_callback' => [ $this, 'canDelete' ],
                ],
            ]
        );
    }

    public function canView(): bool
    {
        return current_user_can( Capabilities::VIEW_ENTRIES );
    }

    public function canDelete(): bool
    {
        return current_user_can( Capabilities::MANAGE_FORMS );
    }

    public function canBatch( WP_REST_Request $request ): bool
    {
        return 'delete' === $request['action'] ? $this->canDelete() : $this->canView();
    }

    public function getItems( WP_REST_Request $request ): WP_REST_Response
    {
        $query   = EntryQuery::forSite( $request->get_query_params() );
        $perPage = $this->perPage( $request );
        $result  = $this->entries->page( $query, max( 1, (int) $request->get_param( 'page' ) ), $perPage );
        $titles  = FormDirectory::titles( array_column( $result['items'], 'form_id' ) );
        $items   = [];

        foreach ( $result['items'] as $entry ) {
            $items[] = $this->presenter->listItem( $entry, $titles );
        }

        return new WP_REST_Response(
            [
                'items'    => $items,
                'total'    => $result['total'],
                'pages'    => $result['pages'],
                'page'     => $result['page'],
                'per_page' => $perPage,
                'unread'   => $this->entries->countUnread(),
            ],
            200
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function getItem( WP_REST_Request $request )
    {
        $id = (int) $request['id'];

        // Oxunmamışdısa indi oxunur; təkrar açılış read_at-a toxunmur (markRead şərti).
        $this->entries->markRead( $id );

        $entry = $this->entries->findCompleted( $id );

        if ( null === $entry ) {
            return $this->notFound();
        }

        $query = EntryQuery::forSite( $request->get_query_params() );

        return new WP_REST_Response(
            array_merge(
                $this->presenter->detail( $entry, FormDirectory::titles( [ $entry['form_id'] ] ) ),
                [
                    'neighbours' => $this->entries->neighbours( $query, $entry ),
                    'unread'     => $this->entries->countUnread(),
                ]
            ),
            200
        );
    }

    public function batch( WP_REST_Request $request ): WP_REST_Response
    {
        $ids = array_values( array_unique( array_map( 'intval', (array) $request['ids'] ) ) );

        switch ( (string) $request['action'] ) {
            case 'delete':
                $affected = $this->entries->delete( $ids );
                break;
            case 'unread':
                $affected = $this->entries->setRead( $ids, false );
                break;
            default:
                $affected = $this->entries->setRead( $ids, true );
        }

        return new WP_REST_Response( [ 'affected' => $affected, 'unread' => $this->entries->countUnread() ], 200 );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function deleteItem( WP_REST_Request $request )
    {
        $id = (int) $request['id'];

        if ( 0 === $this->entries->delete( [ $id ] ) ) {
            return $this->notFound();
        }

        return new WP_REST_Response( [ 'id' => $id, 'deleted' => true, 'unread' => $this->entries->countUnread() ], 200 );
    }

    private function perPage( WP_REST_Request $request ): int
    {
        $raw = $request->get_param( 'per_page' );

        if ( null === $raw || '' === $raw ) {
            return EntryPreferences::perPage( get_current_user_id() );
        }

        return EntryPreferences::save( get_current_user_id(), $raw );
    }

    private function notFound(): WP_Error
    {
        return new WP_Error( 'qform_entry_not_found', __( 'Entry not found.', 'quoteform' ), [ 'status' => 404 ] );
    }
}
```

- [ ] **Step 6: Register the routes** — `includes/Plugin.php`: add `use Quoteform\Rest\EntriesAdminController;` to the imports and, inside the `rest_api_init` closure, right after `( new EntriesController() )->registerRoutes();`:

```php
                // Eyni `/entries` route-una admin GET-i əlavə edir — ictimai POST-dan SONRA.
                ( new EntriesAdminController() )->registerRoutes();
```

- [ ] **Step 7: Forget the page size on uninstall** — `includes/Support/Uninstaller.php`: add `use Quoteform\Entries\EntryPreferences;`, then in `run()` call the new method on both exits — after `self::cleanCurrentSite();` in the single-site branch (before its `return;`) and inside `if ( empty( $siteIds ) ) {` before `return;`:

```php
            self::deleteUserPreferences();
```

and add the method at the end of the class:

```php
    /**
     * User meta şəbəkə üzrə bir cədvəldədir — hər sayt üçün yox, BİR dəfə silinir.
     * `is_multisite()`-dən sonra çağırılır: `UninstallTest` faylın ilk WordPress
     * çağırışının `is_multisite` olduğunu yoxlayır.
     */
    private static function deleteUserPreferences(): void
    {
        delete_metadata( 'user', 0, EntryPreferences::META, '', true );
    }
```

- [ ] **Step 8: Run the tests** — `make itest ARGS="--filter 'EntriesAdminRestTest|UninstallPreferencesTest'"` → PASS (EntriesAdminRestTest: 13 test, onlardan biri 6 data halı ilə; UninstallPreferencesTest: 1).

- [ ] **Step 9: Verify** — `make itest` → yaşıl (xüsusən `SubmissionRestTest` — ictimai POST dəyişməyib; `PluginTest::testBootCalledAgainDoesNotDuplicateHooksOrRoutes` — `rest_api_init` callback sayı dəyişmir; `UninstallTest` — ilk çağırış hələ də `is_multisite`); `make itest-trash-disabled` → yaşıl; PHP 7.4 lint: `docker run --rm -v "$PWD":/app -w /app php:7.4-cli php -l includes/Rest/EntriesAdminController.php` və `includes/Entries/EntryPreferences.php`.

---
### Task 6: CSV — `CsvCell`, `CsvExporter`, `EntriesExport`

**Files:**
- Create: `includes/Entries/CsvCell.php` (WP-siz)
- Create: `includes/Entries/CsvExporter.php`
- Create: `includes/Admin/EntriesExport.php`
- Modify: `includes/Plugin.php` (`EntriesExport::register();`)
- Test: `tests/php/Entries/CsvCellTest.php` (vahid, PHP 8.2 + 7.4), `tests/integration/CsvExportTest.php`

**Interfaces:**
- Consumes: `EntryQuery::forSite()`, `formId()` (Task 2); `EntryRepository::slice()` (Task 3); `EntryPresenter::answers()`, `formTitle()`, `csvDate()` (Task 4); `FormDirectory::titles()`; `SchemaRepository::find()`, `SchemaRepository::defaults()`, `CorruptSchemaException`; `Runtime\Values::stringify()`; `Capabilities::EXPORT_ENTRIES`.
- Produces:
  - `CsvCell::clean( string $value ): string` — idarəedici simvolları (`\x00–\x08`, `\x0B`, `\x0C`, `\x0E–\x1F`, `\x7F`) silir, sonra `= + - @ TAB CR` ilə başlayan və **adi onluq ədəd olmayan** xananın əvvəlinə `'` qoyur. `CsvCell::line( array $cells ): string` — bir RFC 4180 sətri (`fputcsv`, boş escape simvolu, `\n` ilə bitir).
  - `new CsvExporter( ?EntryRepository, ?SchemaRepository, ?EntryPresenter, int $batchSize = 500 )`; `write( EntryQuery $query, resource $out ): int` (yazılan müraciət sayı).
  - `EntriesExport::ACTION = 'qform_export_entries'`; `register(): void` (`admin_post_qform_export_entries`); `url(): string` (admin-post URL + `_wpnonce`, `&amp;` YOX); `authorize( array $params ): void` (capability, sonra nonce; uğursuz → `wp_die` 403); `filename(): string` (`quoteform-entries-YYYY-MM-DD.csv`, saytın tarixi); `handle(): void` (başlıqlar + axın + `exit`).
- Sütunlar: sabit `ID, Date, Status (New/Read), Total (DB-nin dəqiq onluğu, məs. 180.0000), Currency`. Forma seçilib (və mövcuddur) → formanın **cari** sahələri addım sırası ilə (`html` xaric, başlıq = label, label boşdursa açar) + formanın `visible: true` hesablamaları (başlıq = label, dəyər = müraciətin açılışındakı eyni açarlı sətirin məbləği). All forms / Deleted forms → sabit + `Form` + `Answers` (`Label: dəyər; …`, boş cavablar atılır).
- Paketlər keyset ilə (`slice`), OFFSET yox: eksport zamanı silinən sətir başqa sətiri buraxdırmır.

- [ ] **Step 1: Write the failing unit test** — `tests/php/Entries/CsvCellTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Entries;

use PHPUnit\Framework\TestCase;
use Quoteform\Entries\CsvCell;

final class CsvCellTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public function formulaStarts(): array
    {
        return [
            'equals'          => [ '=1+2', "'=1+2" ],
            'plus'            => [ '+1+2', "'+1+2" ],
            'minus sum'       => [ '-2+3', "'-2+3" ],
            'at'              => [ '@SUM(A1)', "'@SUM(A1)" ],
            'tab'             => [ "\t=1", "'\t=1" ],
            'carriage return' => [ "\r=1", "'\r=1" ],
            'hyperlink'       => [ '=HYPERLINK("http://x")', "'=HYPERLINK(\"http://x\")" ],
        ];
    }

    /**
     * @dataProvider formulaStarts
     */
    public function testCellsThatSpreadsheetsWouldRunGetAQuote( string $raw, string $expected ): void
    {
        $this->assertSame( $expected, CsvCell::clean( $raw ) );
    }

    public function testPlainNumbersStayNumbersEvenWhenNegative(): void
    {
        $this->assertSame( '-25.5000', CsvCell::clean( '-25.5000' ) );
        $this->assertSame( '-5', CsvCell::clean( '-5' ) );
        $this->assertSame( '180.0000', CsvCell::clean( '180.0000' ) );
        $this->assertSame( "'-5\n", CsvCell::clean( "-5\n" ), 'a number with a line break is text' );
    }

    public function testControlCharactersAreRemovedBeforeTheFormulaCheck(): void
    {
        $this->assertSame( 'ab', CsvCell::clean( "a\x00b" ) );
        $this->assertSame( "'=1+2", CsvCell::clean( "\x07=1+2" ), 'a hidden byte must not smuggle a formula past the check' );
        $this->assertSame( "one\ntwo", CsvCell::clean( "one\x0B\ntwo\x7F" ) );
    }

    public function testMultibyteTextIsUntouched(): void
    {
        $this->assertSame( 'Zəhra ✓ 東京', CsvCell::clean( 'Zəhra ✓ 東京' ) );
    }

    public function testALineFollowsRfc4180(): void
    {
        $this->assertSame( "41,\"a,b\",\"say \"\"hi\"\"\",\"one\ntwo\"\n", CsvCell::line( [ '41', 'a,b', 'say "hi"', "one\ntwo" ] ) );
    }

    public function testABackslashBeforeAQuoteIsNotAnEscape(): void
    {
        $line = CsvCell::line( [ 'C:\\"x"' ] );

        $this->assertSame( "\"C:\\\"\"x\"\"\"\n", $line );
        $this->assertSame( [ 'C:\\"x"' ], str_getcsv( rtrim( $line, "\n" ), ',', '"', '' ) );
    }

    public function testEveryCellOfALineIsCleaned(): void
    {
        $this->assertSame( "'=1,ok\n", CsvCell::line( [ '=1', 'ok' ] ) );
    }
}
```

- [ ] **Step 2: Run it to verify it fails** — `./bin/phpunit --filter CsvCellTest` → FAIL (`Class "Quoteform\Entries\CsvCell" not found`).

- [ ] **Step 3: Create `includes/Entries/CsvCell.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

/**
 * CSV xanasının təhlükəsizliyi (yeni spec §5). WordPress-dən asılı deyil.
 *
 * Saxlama XAMDIR (Plan 06 R15) — bu təmizləmə yalnız CSV-yə yazılanda olur.
 */
final class CsvCell
{
    /** Excel/Sheets/Calc bunlarla başlayan xananı formul kimi icra edir. */
    private const TRIGGERS = [ '=', '+', '-', '@', "\t", "\r" ];

    /** Adi onluq ədəd (mənfi də) formul deyil: endirimli `-25.5000` rəqəm kimi qalmalıdır. */
    private const PLAIN_NUMBER = '/^-?\d+(?:\.\d+)?$/D';

    /**
     * TAB, LF, CR xaric C0 idarəedici simvollar və DEL. Bayt səviyyəsində işləyir və
     * UTF-8 üçün təhlükəsizdir: çoxbaytlı simvolun heç bir baytı 0x80-dən kiçik deyil.
     */
    private const CONTROLS = '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/';

    public static function clean( string $value ): string
    {
        // Əvvəl silinir, SONRA yoxlanılır: "\x07=1" gizli baytla formul qoruyucusundan yayınmasın.
        $value = (string) preg_replace( self::CONTROLS, '', $value );

        if ( '' === $value || 1 === preg_match( self::PLAIN_NUMBER, $value ) ) {
            return $value;
        }

        return in_array( $value[0], self::TRIGGERS, true ) ? "'" . $value : $value;
    }

    /**
     * @param array<int, string> $cells
     */
    public static function line( array $cells ): string
    {
        $buffer = fopen( 'php://memory', 'r+' );

        if ( false === $buffer ) {
            return '';
        }

        // Boş escape simvolu (PHP 7.4+) = RFC 4180: dırnaq yalnız ikiqat dırnaqla qaçırılır.
        // Default "\\" ilə `C:\"x"` kimi mətn Excel-in oxuya bilmədiyi xana yazırdı.
        fputcsv( $buffer, array_map( [ self::class, 'clean' ], $cells ), ',', '"', '' );
        rewind( $buffer );
        $line = (string) stream_get_contents( $buffer );
        fclose( $buffer );

        return $line;
    }
}
```

- [ ] **Step 4: Run the unit test on both PHP versions** — `./bin/phpunit --filter CsvCellTest` və `QF_PHP=php:7.4-cli ./bin/phpunit --filter CsvCellTest` → PASS (7 test, onlardan biri 7 data halı ilə). Düşürsə, səbəbi PHPUnit mesajından yox, `docker run --rm -v "$PWD":/app -w /app php:7.4-cli php -r 'require "vendor/autoload.php"; var_dump( Quoteform\Entries\CsvCell::line( [ "C:\\\"x\"" ] ) );'` ilə gör.

- [ ] **Step 5: Write the failing integration test** — `tests/integration/CsvExportTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Admin\EntriesExport;
use Quoteform\Entries\CsvExporter;
use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Support\Capabilities;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

final class CsvExportTest extends WP_UnitTestCase
{
    use SeedsEntries;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
        Capabilities::grantToAdministrator();
        update_option( 'timezone_string', 'Asia/Baku' );
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    /**
     * @param array<string, mixed> $params
     */
    private function export( array $params, int $batchSize = 500 ): string
    {
        $out = fopen( 'php://memory', 'w+' );
        ( new CsvExporter( null, null, null, $batchSize ) )->write( EntryQuery::forSite( $params ), $out );
        rewind( $out );
        $csv = (string) stream_get_contents( $out );
        fclose( $out );

        return $csv;
    }

    /**
     * @return array<int, array<int, string>>
     */
    private function parsed( string $csv ): array
    {
        $in = fopen( 'php://memory', 'w+' );
        fwrite( $in, substr( $csv, 3 ) ); // BOM
        rewind( $in );
        $rows = [];

        while ( false !== ( $row = fgetcsv( $in, 0, ',', '"', '' ) ) ) {
            $rows[] = $row;
        }

        fclose( $in );

        return $rows;
    }

    private function formWithFields(): int
    {
        $id = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Cleaning' ] );

        ( new SchemaRepository() )->save(
            $id,
            [
                'version'       => 1,
                'settings'      => [ 'currency' => 'USD', 'currency_position' => 'before', 'decimals' => 2, 'submit_label' => 'Go', 'success_action' => 'message', 'success_message' => 'Thanks', 'redirect_url' => '', 'save_resume' => false, 'store_ip' => false ],
                'fields'        => [
                    'rooms'  => [ 'key' => 'rooms', 'type' => 'number', 'label' => 'Rooms', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => 1 ],
                    'intro'  => [ 'key' => 'intro', 'type' => 'html', 'label' => '', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => '', 'content' => '<p>Hi</p>' ],
                    'name'   => [ 'key' => 'name', 'type' => 'text', 'label' => 'Your name', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => '' ],
                    'extras' => [ 'key' => 'extras', 'type' => 'checkbox', 'label' => 'Extras', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => [], 'options' => [ [ 'label' => 'Oven', 'value' => 'oven', 'price' => 10 ] ] ],
                    'phone'  => [ 'key' => 'phone', 'type' => 'tel', 'label' => 'Phone', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => '' ],
                ],
                'steps'         => [
                    [ 'key' => 'one', 'title' => 'One', 'description' => '', 'fields' => [ 'intro', 'name', 'rooms' ] ],
                    [ 'key' => 'two', 'title' => 'Two', 'description' => '', 'fields' => [ 'extras', 'phone' ] ],
                ],
                'calculations'  => [
                    [ 'key' => 'base', 'label' => 'Rooms cost', 'expression' => '{rooms} * 40', 'visible' => true ],
                    [ 'key' => 'secret', 'label' => 'Margin', 'expression' => '{base} * 0.2', 'visible' => false ],
                ],
                'rules'         => [],
                'notifications' => [],
            ]
        );

        return $id;
    }

    public function testTheFileStartsWithAByteOrderMark(): void
    {
        $this->assertSame( "\xEF\xBB\xBF", substr( $this->export( [] ), 0, 3 ) );
    }

    public function testAllFormsPutEveryAnswerInOneColumn(): void
    {
        $formId = $this->formWithFields();
        $mine   = $this->seedEntry( [ 'form_id' => $formId, 'created_at' => '2026-09-24 21:30:00', 'total_decimal' => '180.0000' ] );
        $orphan = $this->seedEntry( [ 'form_id' => 999999, 'created_at' => '2026-09-23 10:00:00', 'read_at' => '2026-09-23 11:00:00' ] );

        $rows = $this->parsed( $this->export( [] ) );

        $this->assertSame( [ 'ID', 'Date', 'Status', 'Total', 'Currency', 'Form', 'Answers' ], $rows[0] );
        $this->assertSame( [ (string) $mine, '2026-09-25 01:30:00', 'New', '180.0000', 'USD', 'Cleaning', 'Your name: Jane Doe; Email: jane@example.com' ], $rows[1] );
        $this->assertSame( [ (string) $orphan, 'Read', '(deleted form)' ], [ $rows[2][0], $rows[2][2], $rows[2][5] ] );
    }

    public function testOneFormGetsAColumnPerCurrentFieldAndVisibleCalculation(): void
    {
        $formId = $this->formWithFields();
        $this->seedEntry( [
            'form_id'   => $formId,
            'data'      => [
                'name'    => [ 'label' => 'Name (old label)', 'type' => 'text', 'value' => 'Leyla' ],
                'rooms'   => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3.0 ],
                'extras'  => [ 'label' => 'Extras', 'type' => 'checkbox', 'value' => [ 'oven' ], 'display' => [ 'Oven' ] ],
                'removed' => [ 'label' => 'Gone field', 'type' => 'text', 'value' => 'not exported' ],
            ],
            'breakdown' => [ 'currency' => 'USD', 'position' => 'before', 'decimals' => 2, 'lines' => [ [ 'key' => 'base', 'label' => 'Rooms cost', 'amount' => -12.5 ] ], 'error' => null ],
        ] );

        $rows = $this->parsed( $this->export( [ 'form' => (string) $formId ] ) );

        $this->assertSame( [ 'ID', 'Date', 'Status', 'Total', 'Currency', 'Your name', 'Rooms', 'Extras', 'Phone', 'Rooms cost' ], $rows[0] );
        $this->assertSame( [ 'Leyla', '3', 'Oven', '', '-12.5' ], array_slice( $rows[1], 5 ) );
    }

    public function testTheListsFiltersAndOrderApply(): void
    {
        $old  = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $new  = $this->seedEntry( [ 'created_at' => '2026-09-22 10:00:00' ] );
        $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00', 'read_at' => '2026-09-21 11:00:00' ] );

        $rows = $this->parsed( $this->export( [ 'status' => 'new', 'order' => 'asc' ] ) );

        $this->assertSame( [ (string) $old, (string) $new ], [ $rows[1][0], $rows[2][0] ] );
        $this->assertCount( 3, $rows );
    }

    public function testSmallBatchesStillWriteEveryRowOnceInListOrder(): void
    {
        foreach ( [ '20', '22', '21', '22', '19', '23', '20' ] as $day ) {
            $this->seedEntry( [ 'created_at' => "2026-09-{$day} 08:00:00" ] );
        }

        $rows     = $this->parsed( $this->export( [], 3 ) );
        $expected = array_map( 'strval', array_column( ( new EntryRepository() )->page( EntryQuery::forSite( [] ), 1, 20 )['items'], 'id' ) );

        $this->assertSame( $expected, array_column( array_slice( $rows, 1 ), 0 ) );
    }

    public function testDangerousAndUnusualTextIsSafeAndIntact(): void
    {
        $formId = $this->formWithFields();
        $this->seedEntry( [
            'form_id'       => $formId,
            'total_decimal' => '-25.5000',
            'data'          => [
                'name'  => [ 'label' => 'Your name', 'type' => 'text', 'value' => "\x00=HYPERLINK(\"http://x\")" ],
                'phone' => [ 'label' => 'Phone', 'type' => 'tel', 'value' => "Zəhra ✓\nC:\\\"x\"" ],
            ],
        ] );

        $row = $this->parsed( $this->export( [ 'form' => (string) $formId ] ) )[1];

        $this->assertSame( '-25.5000', $row[3], 'a discount stays a number' );
        $this->assertSame( "'=HYPERLINK(\"http://x\")", $row[5], 'a hidden NUL does not smuggle the formula past the guard' );
        $this->assertSame( "Zəhra ✓\nC:\\\"x\"", $row[8], 'multibyte text, line breaks and a backslash-quote survive' );
    }

    public function testAnExportNeedsTheExportCapability(): void
    {
        wp_set_current_user( self::factory()->user->create( [ 'role' => 'editor' ] ) );

        $this->expectException( 'WPDieException' );
        EntriesExport::authorize( [ '_wpnonce' => wp_create_nonce( EntriesExport::ACTION ) ] );
    }

    public function testAnExportNeedsAFreshNonce(): void
    {
        wp_set_current_user( self::factory()->user->create( [ 'role' => 'administrator' ] ) );

        $this->expectException( 'WPDieException' );
        EntriesExport::authorize( [ '_wpnonce' => 'stale' ] );
    }

    public function testAnAdministratorWithAFreshNonceMayExport(): void
    {
        wp_set_current_user( self::factory()->user->create( [ 'role' => 'administrator' ] ) );

        EntriesExport::authorize( [ '_wpnonce' => wp_create_nonce( EntriesExport::ACTION ) ] );

        $this->addToAssertionCount( 1 );
    }

    public function testTheExportUrlIsARawUrlCarryingItsNonce(): void
    {
        wp_set_current_user( self::factory()->user->create( [ 'role' => 'administrator' ] ) );

        $url = EntriesExport::url();

        $this->assertStringContainsString( 'admin-post.php?action=qform_export_entries&_wpnonce=', $url );
        $this->assertStringNotContainsString( '&amp;', $url );
    }

    public function testTheFileIsNamedForTheSitesDate(): void
    {
        $this->assertSame( 'quoteform-entries-' . wp_date( 'Y-m-d' ) . '.csv', EntriesExport::filename() );
    }

    public function testTheHandlerIsHookedToAdminPost(): void
    {
        $this->assertSame( 10, has_action( 'admin_post_qform_export_entries', [ EntriesExport::class, 'handle' ] ) );
    }
}
```

- [ ] **Step 6: Run it to verify it fails** — `make itest ARGS="--filter CsvExportTest"` → FAIL (`Class "Quoteform\Entries\CsvExporter" not found`).

- [ ] **Step 7: Create `includes/Entries/CsvExporter.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use Quoteform\Forms\CorruptSchemaException;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Runtime\Values;

/**
 * Müraciətlərin CSV-si (yeni spec §5). Siyahı ilə EYNİ EntryQuery-ni işlədir;
 * paketlər keyset ilə oxunur (OFFSET yox) və dərhal axına yazılır.
 */
final class CsvExporter
{
    private const BOM = "\xEF\xBB\xBF";

    /** @var EntryRepository */
    private $entries;

    /** @var SchemaRepository */
    private $forms;

    /** @var EntryPresenter */
    private $presenter;

    /** @var int */
    private $batchSize;

    public function __construct( ?EntryRepository $entries = null, ?SchemaRepository $forms = null, ?EntryPresenter $presenter = null, int $batchSize = 500 )
    {
        $this->entries   = $entries ?? new EntryRepository();
        $this->forms     = $forms ?? new SchemaRepository();
        $this->presenter = $presenter ?? new EntryPresenter();
        $this->batchSize = max( 1, $batchSize );
    }

    /**
     * @param resource $out
     */
    public function write( EntryQuery $query, $out ): int
    {
        $layout  = $this->layout( $query );
        $written = 0;
        $after   = null;

        fwrite( $out, self::BOM );
        fwrite( $out, CsvCell::line( $layout['header'] ) );

        do {
            $batch  = $this->entries->slice( $query, $after, $this->batchSize );
            $titles = null === $layout['fields'] ? FormDirectory::titles( array_column( $batch, 'form_id' ) ) : [];

            foreach ( $batch as $entry ) {
                fwrite( $out, CsvCell::line( $this->row( $entry, $layout, $titles ) ) );
                $written++;
            }

            $after = [] === $batch ? null : $batch[ count( $batch ) - 1 ];
        } while ( count( $batch ) === $this->batchSize );

        return $written;
    }

    /**
     * @return array{header: string[], fields: string[]|null, calculations: string[]}
     */
    private function layout( EntryQuery $query ): array
    {
        $header = [
            __( 'ID', 'quoteform' ),
            __( 'Date', 'quoteform' ),
            __( 'Status', 'quoteform' ),
            __( 'Total', 'quoteform' ),
            __( 'Currency', 'quoteform' ),
        ];
        $schema = $this->formSchema( $query->formId() );

        if ( null === $schema ) {
            $header[] = __( 'Form', 'quoteform' );
            $header[] = __( 'Answers', 'quoteform' );

            return [ 'header' => $header, 'fields' => null, 'calculations' => [] ];
        }

        $fields = $this->fieldKeys( $schema );

        foreach ( $fields as $key ) {
            $header[] = self::heading( $schema['fields'][ $key ], $key );
        }

        $calculations = [];

        foreach ( is_array( $schema['calculations'] ?? null ) ? $schema['calculations'] : [] as $calculation ) {
            if ( ! is_array( $calculation ) || true !== ( $calculation['visible'] ?? false ) || ! is_string( $calculation['key'] ?? null ) ) {
                continue;
            }

            $calculations[] = $calculation['key'];
            $header[]       = self::heading( $calculation, $calculation['key'] );
        }

        return [ 'header' => $header, 'fields' => $fields, 'calculations' => $calculations ];
    }

    /**
     * Yalnız mövcud (zibildə olmayan) forma üçün; pozulmuş sxem → "All forms" görünüşü.
     *
     * @return array<string, mixed>|null
     */
    private function formSchema( ?int $formId ): ?array
    {
        if ( null === $formId || [] === FormDirectory::titles( [ $formId ] ) ) {
            return null;
        }

        try {
            $schema = $this->forms->find( $formId );
        } catch ( CorruptSchemaException $error ) {
            return null;
        }

        return $schema ?? SchemaRepository::defaults();
    }

    /**
     * @param array<string, mixed> $schema
     * @return string[] addım sırası ilə, `html` sahələri xaric
     */
    private function fieldKeys( array $schema ): array
    {
        $fields = is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
        $keys   = [];

        foreach ( is_array( $schema['steps'] ?? null ) ? $schema['steps'] : [] as $step ) {
            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $key ) {
                $key = (string) $key;

                if ( is_array( $fields[ $key ] ?? null ) && 'html' !== ( $fields[ $key ]['type'] ?? '' ) && ! in_array( $key, $keys, true ) ) {
                    $keys[] = $key;
                }
            }
        }

        return $keys;
    }

    /**
     * @param array<string, mixed>                                                  $entry
     * @param array{header: string[], fields: string[]|null, calculations: string[]} $layout
     * @param array<int, string>                                                    $titles
     * @return string[]
     */
    private function row( array $entry, array $layout, array $titles ): array
    {
        $row = [
            (string) $entry['id'],
            $this->presenter->csvDate( (string) $entry['created_at'] ),
            null === $entry['read_at'] ? __( 'New', 'quoteform' ) : __( 'Read', 'quoteform' ),
            (string) ( $entry['total_decimal'] ?? '' ),
            (string) $entry['currency'],
        ];
        $answers = $this->presenter->answers( $entry );

        if ( null === $layout['fields'] ) {
            $parts = [];

            foreach ( $answers as $answer ) {
                if ( '' !== $answer['display'] ) {
                    $parts[] = ( '' !== $answer['label'] ? $answer['label'] : $answer['key'] ) . ': ' . $answer['display'];
                }
            }

            $row[] = $this->presenter->formTitle( (int) $entry['form_id'], $titles ) ?? __( '(deleted form)', 'quoteform' );
            $row[] = implode( '; ', $parts );

            return $row;
        }

        $byKey = [];

        foreach ( $answers as $answer ) {
            $byKey[ $answer['key'] ] = $answer['display'];
        }

        foreach ( $layout['fields'] as $key ) {
            $row[] = $byKey[ $key ] ?? '';
        }

        $amounts = [];

        foreach ( is_array( $entry['breakdown']['lines'] ?? null ) ? $entry['breakdown']['lines'] : [] as $line ) {
            $amount = is_array( $line ) ? ( $line['amount'] ?? null ) : null;

            if ( is_string( $line['key'] ?? null ) && ( is_int( $amount ) || is_float( $amount ) ) ) {
                $amounts[ $line['key'] ] = Values::stringify( $amount );
            }
        }

        foreach ( $layout['calculations'] as $key ) {
            $row[] = $amounts[ $key ] ?? '';
        }

        return $row;
    }

    /**
     * @param array<string, mixed> $item sahə və ya hesablama
     */
    private static function heading( array $item, string $key ): string
    {
        $label = is_string( $item['label'] ?? null ) ? $item['label'] : '';

        return '' !== $label ? $label : $key;
    }
}
```

- [ ] **Step 8: Create `includes/Admin/EntriesExport.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Admin;

use Quoteform\Entries\CsvExporter;
use Quoteform\Entries\EntryQuery;
use Quoteform\Support\Capabilities;

/**
 * `admin-post.php?action=qform_export_entries&_wpnonce=…&<siyahının filtrləri>` →
 * CSV faylı (yeni spec §5). Filtrlər siyahı ilə eyni oxunur (EntryQuery::forSite).
 */
final class EntriesExport
{
    public const ACTION = 'qform_export_entries';

    public static function register(): void
    {
        add_action( 'admin_post_' . self::ACTION, [ self::class, 'handle' ] );
    }

    /**
     * `add_query_arg()` — `wp_nonce_url()` DEYİL: o, URL-i esc_html-dən keçirir və `&amp;`
     * qaytarır; JSON konfiqurasiyaya düşəndə brauzer `amp;_wpnonce` göndərir və eksport
     * həmişə 403 olur.
     */
    public static function url(): string
    {
        return add_query_arg(
            [
                'action'   => self::ACTION,
                '_wpnonce' => wp_create_nonce( self::ACTION ),
            ],
            admin_url( 'admin-post.php' )
        );
    }

    /**
     * @param array<string, mixed> $params
     */
    public static function authorize( array $params ): void
    {
        if ( ! current_user_can( Capabilities::EXPORT_ENTRIES ) ) {
            wp_die( esc_html__( 'Sorry, you are not allowed to export entries.', 'quoteform' ), '', [ 'response' => 403 ] );
        }

        $nonce = isset( $params['_wpnonce'] ) && is_string( $params['_wpnonce'] ) ? $params['_wpnonce'] : '';

        if ( ! wp_verify_nonce( $nonce, self::ACTION ) ) {
            wp_die( esc_html__( 'This export link has expired. Reload the Entries page and try again.', 'quoteform' ), '', [ 'response' => 403 ] );
        }
    }

    public static function filename(): string
    {
        return 'quoteform-entries-' . wp_date( 'Y-m-d' ) . '.csv';
    }

    public static function handle(): void
    {
        $params = wp_unslash( $_GET ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified in authorize().
        $params = is_array( $params ) ? $params : [];

        self::authorize( $params );

        // Axın: bufer qalsa böyük eksport yaddaşda yığılar və başlıqlar gec gedər.
        while ( ob_get_level() > 0 ) {
            ob_end_clean();
        }

        nocache_headers();
        header( 'Content-Type: text/csv; charset=utf-8' );
        header( 'Content-Disposition: attachment; filename="' . self::filename() . '"' );
        header( 'X-Content-Type-Options: nosniff' );

        $out = fopen( 'php://output', 'w' );

        if ( false !== $out ) {
            ( new CsvExporter() )->write( EntryQuery::forSite( $params ), $out );
            fclose( $out );
        }

        exit;
    }
}
```

- [ ] **Step 9: Register the handler** — `includes/Plugin.php`: add `use Quoteform\Admin\EntriesExport;` and, right after `BuilderPage::register();`:

```php
        EntriesExport::register();
```

- [ ] **Step 10: Run the tests** — `make itest ARGS="--filter CsvExportTest"` → PASS (12 test).

- [ ] **Step 11: Verify** — `./bin/phpunit` və `QF_PHP=php:7.4-cli ./bin/phpunit` → yaşıl (CsvCellTest daxil); `make itest` → yaşıl; `docker run --rm -v "$PWD":/app -w /app php:7.4-cli php -l includes/Entries/CsvExporter.php` və `includes/Admin/EntriesExport.php` → "No syntax errors".

---
### Task 7: Menyu, oxunmamış nişanı və ayrıca `entries` paketi

**Files:**
- Create: `includes/Admin/EntriesPage.php`
- Modify: `includes/Admin/BuilderPage.php` (`addMenuPage()`: icazəsiz istifadəçi üçün heç nə; "Forms" alt bəndi)
- Modify: `includes/Plugin.php` (`EntriesPage::register();`)
- Modify: `package.json` (`build`, `start` skriptlərinə `entries=./admin-src/entries.js`)
- Modify: `bin/check-build.sh` (eyni giriş)
- Create: `admin-src/entries.js`, `admin-src/entries/EntriesApp.js` (müvəqqəti stub — Task 13 tam əvəz edir), `admin-src/entries/style.scss`, `admin-src/entries/_entries.scss` (başlanğıc — Task 13 tam əvəz edir)
- Test: `tests/integration/EntriesPageTest.php`, `tests/js/admin/entriesBootstrap.test.js`

**Interfaces:**
- Consumes: `EntryRepository::countUnread()`, `formIdsWithEntries()`; `FormDirectory::all()`; `EntryPreferences::perPage()`; `EntriesExport::url()`; `BuilderPage::MENU_SLUG`; `Capabilities::*`.
- Produces:
  - `EntriesPage::MENU_SLUG = 'quoteform-entries'`, `EntriesPage::HANDLE = 'quoteform-entries'`; `register()` (`admin_menu` prioritet **11** — builder-in 10-dakı menyusundan sonra; `admin_enqueue_scripts`); `addMenuPages()`; `badge( int $count ): string`; `renderRoot()` (`<div class="wrap"><div id="quoteform-entries-root" class="quoteform_builder"></div></div>`); `enqueueAssets( string $hookSuffix )`; `config(): array`.
  - `window.quoteformEntries = { perPage: int, canDelete: bool, canManageForms: bool, canExport: bool, exportUrl: string, builderUrl: string, forms: [ { id, title } ], hasDeletedForms: bool }` (inline, `before`).
  - Nişan markup-ı (JS Task 8 bunu yeniləyir): `<span class="awaiting-mod quoteform_unread-badge count-N"><span class="pending-count" aria-hidden="true">N</span><span class="screen-reader-text">N unread entries</span></span>` — WP nüvəsinin `#adminmenu li span.count-0 { display: none }` qaydası 0-ı gizlədir.
  - Build: `build/entries.js`, `build/entries.asset.php`, `build/style-entries.css`, `build/style-entries-rtl.css`.
- Menyu qaydası (spec §2.1): `qform_manage_forms` olan → Quoteform → **Forms** (`quoteform`) + **Entries** (`quoteform-entries`, əgər `qform_view_entries` də varsa). Yalnız `qform_view_entries` olan → yuxarı menyu birbaşa `quoteform-entries` səhifəsidir (builder səhifəsi bu istifadəçi üçün qeydə ALINMIR — WordPress-in "reparent" məntiqinə güvənilmir). Heç biri yoxdursa — menyu yoxdur və COUNT işləmir.

- [ ] **Step 1: Write the failing PHP test** — `tests/integration/EntriesPageTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Admin\BuilderPage;
use Quoteform\Admin\EntriesPage;
use Quoteform\Entries\EntriesTable;
use Quoteform\Forms\FormPostType;
use Quoteform\Support\Capabilities;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;
use WP_User;

final class EntriesPageTest extends WP_UnitTestCase
{
    use SeedsEntries;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
        Capabilities::grantToAdministrator();
        $this->freshMenus();
    }

    protected function tearDown(): void
    {
        foreach ( [ EntriesPage::HANDLE, 'quoteform-builder' ] as $handle ) {
            wp_dequeue_script( $handle );
            wp_deregister_script( $handle );
            wp_dequeue_style( $handle );
            wp_deregister_style( $handle );
        }

        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function freshMenus(): void
    {
        global $admin_page_hooks, $submenu, $menu, $_wp_submenu_nopriv;

        $admin_page_hooks   = [];
        $submenu            = [];
        $menu               = [];
        $_wp_submenu_nopriv = [];
    }

    private function buildMenus(): void
    {
        BuilderPage::addMenuPage();
        EntriesPage::addMenuPages();
    }

    /**
     * @param string[] $caps
     */
    private function signInWith( string $role, array $caps = [] ): int
    {
        $id   = self::factory()->user->create( [ 'role' => $role ] );
        $user = new WP_User( $id );

        foreach ( $caps as $cap ) {
            $user->add_cap( $cap );
        }

        wp_set_current_user( $id );

        return $id;
    }

    /**
     * @return string[] SQL that touched the entries table while $work ran
     */
    private function entryQueriesDuring( callable $work ): array
    {
        $seen = [];
        $spy  = static function ( $sql ) use ( &$seen ) {
            if ( is_string( $sql ) && false !== strpos( $sql, EntriesTable::name() ) ) {
                $seen[] = $sql;
            }

            return $sql;
        };

        add_filter( 'query', $spy );

        try {
            $work();
        } finally {
            remove_filter( 'query', $spy );
        }

        return $seen;
    }

    /**
     * @return string[]
     */
    private function menuSlugs(): array
    {
        global $menu;

        return array_column( (array) $menu, 2 );
    }

    public function testBootHooksTheEntriesMenuAfterTheBuilderMenu(): void
    {
        $this->assertSame( 11, has_action( 'admin_menu', [ EntriesPage::class, 'addMenuPages' ] ) );
        $this->assertSame( 10, has_action( 'admin_enqueue_scripts', [ EntriesPage::class, 'enqueueAssets' ] ) );
    }

    public function testAnAdministratorSeesFormsThenEntriesWithTheUnreadCount(): void
    {
        global $submenu;

        $this->seedEntry();
        $this->seedEntry();
        $this->seedEntry( [ 'read_at' => '2026-09-25 09:00:00' ] );
        $this->seedEntry( [ 'status' => 'draft' ] );
        $this->signInWith( 'administrator' );

        $this->buildMenus();

        $items = $submenu[ BuilderPage::MENU_SLUG ];

        $this->assertSame( [ BuilderPage::MENU_SLUG, EntriesPage::MENU_SLUG ], array_column( $items, 2 ) );
        $this->assertSame( 'Forms', $items[0][0] );
        $this->assertSame( Capabilities::MANAGE_FORMS, $items[0][1] );
        $this->assertSame( Capabilities::VIEW_ENTRIES, $items[1][1] );
        $this->assertStringContainsString( 'quoteform_unread-badge count-2', $items[1][0] );
        $this->assertStringContainsString( '<span class="pending-count" aria-hidden="true">2</span>', $items[1][0] );
        $this->assertStringContainsString( '2 unread entries', $items[1][0] );
    }

    public function testTheBadgeCostsOneQueryForViewersAndNoneForOthers(): void
    {
        $this->signInWith( 'administrator' );
        $this->assertCount( 1, $this->entryQueriesDuring( [ $this, 'buildMenus' ] ) );

        $this->freshMenus();
        $this->signInWith( 'editor', [ Capabilities::MANAGE_FORMS ] );
        $this->assertSame( [], $this->entryQueriesDuring( [ $this, 'buildMenus' ] ) );
        $this->assertNotContains( EntriesPage::MENU_SLUG, array_column( $GLOBALS['submenu'][ BuilderPage::MENU_SLUG ] ?? [], 2 ) );

        $this->freshMenus();
        $this->signInWith( 'subscriber' );
        $this->assertSame( [], $this->entryQueriesDuring( [ $this, 'buildMenus' ] ) );
        $this->assertSame( [], $this->menuSlugs() );
    }

    public function testSomeoneWhoOnlyReadsEntriesLandsOnEntries(): void
    {
        global $menu, $submenu;

        $this->signInWith( 'editor', [ Capabilities::VIEW_ENTRIES ] );
        $this->buildMenus();

        $this->assertSame( [ EntriesPage::MENU_SLUG ], $this->menuSlugs() );
        $this->assertSame( Capabilities::VIEW_ENTRIES, $menu[ array_key_first( $menu ) ][1] );
        $this->assertArrayNotHasKey( BuilderPage::MENU_SLUG, $submenu );
        $this->assertSame( [ EntriesPage::MENU_SLUG ], array_column( $submenu[ EntriesPage::MENU_SLUG ], 2 ) );
    }

    public function testTheBuilderStillRendersOnceOnItsPage(): void
    {
        $this->signInWith( 'administrator' );
        $this->buildMenus();

        ob_start();
        do_action( (string) get_plugin_page_hookname( BuilderPage::MENU_SLUG, '' ) );
        $html = (string) ob_get_clean();

        $this->assertSame( 1, substr_count( $html, 'id="quoteform-root"' ) );
    }

    public function testAssetsLoadOnlyOnTheEntriesPage(): void
    {
        $this->signInWith( 'administrator' );
        $this->buildMenus();

        $entriesHook = (string) get_plugin_page_hookname( EntriesPage::MENU_SLUG, BuilderPage::MENU_SLUG );

        EntriesPage::enqueueAssets( (string) get_plugin_page_hookname( BuilderPage::MENU_SLUG, '' ) );
        $this->assertFalse( wp_script_is( EntriesPage::HANDLE, 'enqueued' ) );

        EntriesPage::enqueueAssets( $entriesHook );
        BuilderPage::enqueueAssets( $entriesHook );

        $this->assertTrue( wp_script_is( EntriesPage::HANDLE, 'enqueued' ) );
        $this->assertTrue( wp_style_is( EntriesPage::HANDLE, 'enqueued' ) );
        $this->assertFalse( wp_script_is( 'quoteform-builder', 'enqueued' ), 'the builder bundle is not loaded on Entries' );

        /** @var array{dependencies: string[], version: string} $asset */
        $asset  = require QFORM_PATH . 'build/entries.asset.php';
        $script = wp_scripts()->registered[ EntriesPage::HANDLE ];

        $this->assertSame( $asset['dependencies'], $script->deps );
        $this->assertSame( 'quoteform', $script->textdomain );
        $this->assertSame( 'replace', wp_styles()->get_data( EntriesPage::HANDLE, 'rtl' ) );
        $this->assertStringEndsWith( 'build/style-entries.css', wp_styles()->registered[ EntriesPage::HANDLE ]->src );
    }

    public function testTheConfigCannotBreakOutOfItsScriptTag(): void
    {
        $this->signInWith( 'administrator' );
        $title = '</script><script>alert(1)</script> & "Co"';
        $form  = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish', 'post_title' => $title ] );
        $this->assertStringContainsString( '</script>', get_post( $form )->post_title, 'precondition: an administrator may save raw HTML in a title' );
        $this->buildMenus();

        EntriesPage::enqueueAssets( (string) get_plugin_page_hookname( EntriesPage::MENU_SLUG, BuilderPage::MENU_SLUG ) );

        $inline = implode( "\n", (array) wp_scripts()->get_data( EntriesPage::HANDLE, 'before' ) );

        $this->assertStringNotContainsString( '</script', $inline );
        $this->assertStringStartsWith( 'window.quoteformEntries = ', $inline );

        $config = json_decode( substr( $inline, strlen( 'window.quoteformEntries = ' ), -1 ), true );

        $this->assertSame( [ [ 'id' => $form, 'title' => get_post( $form )->post_title ] ], $config['forms'] );
        $this->assertStringContainsString( '&_wpnonce=', $config['exportUrl'] );
        $this->assertStringNotContainsString( '&amp;', $config['exportUrl'] );
        $this->assertTrue( $config['canDelete'] );
        $this->assertTrue( $config['canExport'] );
        $this->assertSame( 20, $config['perPage'] );
        $this->assertFalse( $config['hasDeletedForms'] );
    }

    public function testDeletedFormsAreOfferedOnlyWhenTheirEntriesExist(): void
    {
        $this->signInWith( 'editor', [ Capabilities::VIEW_ENTRIES ] );
        $this->assertFalse( EntriesPage::config()['hasDeletedForms'] );

        $this->seedEntry( [ 'form_id' => 999999 ] );
        $config = EntriesPage::config();

        $this->assertTrue( $config['hasDeletedForms'] );
        $this->assertFalse( $config['canDelete'] );
        $this->assertFalse( $config['canExport'] );
    }

    public function testTheBadgeTextIsTranslatableAndEscaped(): void
    {
        $this->assertStringContainsString( 'count-0', EntriesPage::badge( 0 ) );
        $this->assertStringContainsString( '1 unread entry<', EntriesPage::badge( 1 ) );
        $this->assertStringContainsString( 'count-0', EntriesPage::badge( -3 ) );
    }

    public function testTheRootNodeSharesTheBuilderStyleScope(): void
    {
        ob_start();
        EntriesPage::renderRoot();

        $this->assertStringContainsString( '<div id="quoteform-entries-root" class="quoteform_builder"></div>', (string) ob_get_clean() );
    }
}
```

- [ ] **Step 2: Run it to verify it fails** — `make itest ARGS="--filter EntriesPageTest"` → FAIL (`Class "Quoteform\Admin\EntriesPage" not found`).

- [ ] **Step 3: Change `BuilderPage::addMenuPage()`** — replace the method body in `includes/Admin/BuilderPage.php`:

```php
    public static function addMenuPage(): void
    {
        self::$hookSuffix = '';

        // Forma redaktə edə bilməyən istifadəçi üçün builder səhifəsi qeydə alınmır;
        // müraciət görə bilirsə, yuxarı menyunu EntriesPage özü qurur (spec §2.1).
        if ( ! current_user_can( Capabilities::MANAGE_FORMS ) ) {
            return;
        }

        $hookSuffix = add_menu_page(
            __( 'Quoteform', 'quoteform' ),
            __( 'Quoteform', 'quoteform' ),
            Capabilities::MANAGE_FORMS,
            self::MENU_SLUG,
            [ self::class, 'renderRoot' ],
            'dashicons-calculator',
            26
        );

        // İlk alt bənd "Forms" adlanır (əks halda WordPress yuxarı menyunun adını təkrarlayardı).
        // Callback add_menu_page ilə EYNİ massivdir: eyni hook-a eyni callback ikinci dəfə
        // qoşulmur, səhifə bir dəfə çəkilir (EntriesPageTest bunu yoxlayır).
        add_submenu_page(
            self::MENU_SLUG,
            __( 'Forms', 'quoteform' ),
            __( 'Forms', 'quoteform' ),
            Capabilities::MANAGE_FORMS,
            self::MENU_SLUG,
            [ self::class, 'renderRoot' ]
        );

        self::$hookSuffix = is_string( $hookSuffix ) ? $hookSuffix : '';
    }
```

- [ ] **Step 4: Create `includes/Admin/EntriesPage.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Admin;

use Quoteform\Entries\EntryPreferences;
use Quoteform\Entries\EntryRepository;
use Quoteform\Entries\FormDirectory;
use Quoteform\Support\Capabilities;

/**
 * Quoteform → Entries (yeni spec §2.1–§2.2). Asset-lər yalnız bu səhifənin hook
 * suffix-ində yüklənir; builder paketi burada yüklənmir.
 *
 * Nişan: admin səhifəsi başına ən çox BİR indeksli COUNT və yalnız müraciət görə
 * bilən istifadəçi üçün (admin_menu hər admin yüklənişində bir dəfə işləyir).
 */
final class EntriesPage
{
    public const MENU_SLUG = 'quoteform-entries';
    public const HANDLE    = 'quoteform-entries';

    /** @var string */
    private static $hookSuffix = '';

    public static function register(): void
    {
        // BuilderPage yuxarı menyunu 10-da qurur; Entries ondan SONRA əlavə olunmalıdır.
        add_action( 'admin_menu', [ self::class, 'addMenuPages' ], 11 );
        add_action( 'admin_enqueue_scripts', [ self::class, 'enqueueAssets' ] );
    }

    public static function addMenuPages(): void
    {
        self::$hookSuffix = '';

        if ( ! current_user_can( Capabilities::VIEW_ENTRIES ) ) {
            return;
        }

        $parent = BuilderPage::MENU_SLUG;

        if ( ! current_user_can( Capabilities::MANAGE_FORMS ) ) {
            add_menu_page(
                __( 'Quoteform', 'quoteform' ),
                __( 'Quoteform', 'quoteform' ),
                Capabilities::VIEW_ENTRIES,
                self::MENU_SLUG,
                [ self::class, 'renderRoot' ],
                'dashicons-calculator',
                26
            );

            $parent = self::MENU_SLUG;
        }

        $hookSuffix = add_submenu_page(
            $parent,
            __( 'Entries', 'quoteform' ),
            __( 'Entries', 'quoteform' ) . ' ' . self::badge( ( new EntryRepository() )->countUnread() ),
            Capabilities::VIEW_ENTRIES,
            self::MENU_SLUG,
            [ self::class, 'renderRoot' ]
        );

        self::$hookSuffix = is_string( $hookSuffix ) ? $hookSuffix : '';
    }

    /**
     * WP Comments nişanı ilə eyni markup; `count-0` nüvə CSS-i ilə gizlənir.
     * JS (admin-src/entries/menuBadge.js) eyni sinifləri yeniləyir.
     */
    public static function badge( int $count ): string
    {
        $count = max( 0, $count );

        return sprintf(
            '<span class="awaiting-mod quoteform_unread-badge count-%1$d"><span class="pending-count" aria-hidden="true">%2$s</span><span class="screen-reader-text">%3$s</span></span>',
            $count,
            esc_html( number_format_i18n( $count ) ),
            esc_html(
                sprintf(
                    /* translators: %s: number of unread entries. */
                    _n( '%s unread entry', '%s unread entries', $count, 'quoteform' ),
                    number_format_i18n( $count )
                )
            )
        );
    }

    public static function renderRoot(): void
    {
        echo '<div class="wrap"><div id="quoteform-entries-root" class="quoteform_builder"></div></div>';
    }

    public static function enqueueAssets( string $hookSuffix ): void
    {
        if ( '' === self::$hookSuffix || $hookSuffix !== self::$hookSuffix ) {
            return;
        }

        $assetFile = QFORM_PATH . 'build/entries.asset.php';

        if ( ! file_exists( $assetFile ) ) {
            return;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_enqueue_script( self::HANDLE, QFORM_URL . 'build/entries.js', $asset['dependencies'], $asset['version'], true );

        // Forma adı admin tərəfindən xam yazıla bilər (`</script>`): HEX bayraqları `<`, `>`, `&`,
        // `'`, `"` simvollarını \u-kodlayır ki, data `<script>` teqindən çıxmasın.
        wp_add_inline_script(
            self::HANDLE,
            'window.quoteformEntries = ' . wp_json_encode( self::config(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';',
            'before'
        );

        wp_enqueue_style( self::HANDLE, QFORM_URL . 'build/style-entries.css', [], $asset['version'] );
        wp_style_add_data( self::HANDLE, 'rtl', 'replace' );
        wp_set_script_translations( self::HANDLE, 'quoteform', QFORM_PATH . 'languages' );
    }

    /**
     * @return array<string, mixed>
     */
    public static function config(): array
    {
        $forms     = FormDirectory::all();
        $list      = [];
        $canManage = current_user_can( Capabilities::MANAGE_FORMS );

        foreach ( $forms as $id => $title ) {
            $list[] = [ 'id' => $id, 'title' => $title ];
        }

        return [
            'perPage'         => EntryPreferences::perPage( get_current_user_id() ),
            'canDelete'       => $canManage,
            'canManageForms'  => $canManage,
            'canExport'       => current_user_can( Capabilities::EXPORT_ENTRIES ),
            'exportUrl'       => EntriesExport::url(),
            'builderUrl'      => admin_url( 'admin.php?page=' . BuilderPage::MENU_SLUG ),
            'forms'           => $list,
            'hasDeletedForms' => [] !== array_diff( ( new EntryRepository() )->formIdsWithEntries(), array_keys( $forms ) ),
        ];
    }
}
```

- [ ] **Step 5: Register the page** — `includes/Plugin.php`: add `use Quoteform\Admin\EntriesPage;` and, right after `BuilderPage::register();`:

```php
        EntriesPage::register();
```

- [ ] **Step 6: Add the bundle entry** — in `package.json` replace both scripts:

```json
    "build": "wp-scripts build index=./admin-src/index.js block=./admin-src/block/index.js frontend=./frontend-src/index.js entries=./admin-src/entries.js --output-path=build",
    "start": "wp-scripts start index=./admin-src/index.js block=./admin-src/block/index.js frontend=./frontend-src/index.js entries=./admin-src/entries.js --output-path=build",
```

and in `bin/check-build.sh` the scratch build line:

```bash
npx wp-scripts build index=./admin-src/index.js block=./admin-src/block/index.js frontend=./frontend-src/index.js entries=./admin-src/entries.js --output-path="$scratch" > "$scratch.log" 2>&1 || {
```

- [ ] **Step 7: Write the failing bootstrap test** — `tests/js/admin/entriesBootstrap.test.js`:

```js
/**
 * @jest-environment jsdom
 */

function bootstrap() {
	jest.isolateModules( () => {
		jest.doMock( '../../../admin-src/entries/EntriesApp', () => ( {
			__esModule: true,
			default: ( { config } ) => `entries app for ${ config.perPage } per page`,
		} ) );

		require( '../../../admin-src/entries' );
	} );
}

afterEach( () => {
	jest.resetModules();
	document.body.innerHTML = '';
	delete window.quoteformEntries;
} );

describe( 'the entries bootstrap', () => {
	it( 'mounts the app with the config WordPress printed', async () => {
		document.body.innerHTML = '<div id="quoteform-entries-root"></div>';
		window.quoteformEntries = { perPage: 50 };

		bootstrap();
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

		expect( document.getElementById( 'quoteform-entries-root' ).textContent ).toBe( 'entries app for 50 per page' );
	} );

	it( 'says which WordPress version is needed when createRoot is missing', async () => {
		document.body.innerHTML = '<div id="quoteform-entries-root"></div>';
		jest.doMock( '@wordpress/element', () => require( './wpElement61Stub' ) );

		bootstrap();
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

		expect( document.getElementById( 'quoteform-entries-root' ).textContent ).toContain( '6.2' );
	} );

	it( 'does nothing on pages without the root node', () => {
		expect( () => bootstrap() ).not.toThrow();
		expect( document.body.innerHTML ).toBe( '' );
	} );
} );
```

- [ ] **Step 8: Run it to verify it fails** — `npx jest tests/js/admin/entriesBootstrap.test.js` → FAIL (`Cannot find module '../../../admin-src/entries'`).

- [ ] **Step 9: Create the entry, the stub app and the stylesheet.** `admin-src/entries.js`:

```js
import { createRoot } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import EntriesApp from './entries/EntriesApp';
import './entries/style.scss';

function renderUnsupportedNotice( root ) {
	const notice = document.createElement( 'div' );
	const message = document.createElement( 'p' );

	notice.className = 'notice notice-error';
	message.textContent = __(
		'Quoteform needs WordPress 6.2 or newer. This site runs an older version, so the entries screen cannot start. Please update WordPress and reload this page.',
		'quoteform'
	);

	notice.appendChild( message );
	root.appendChild( notice );
}

const root = document.getElementById( 'quoteform-entries-root' );

if ( root ) {
	if ( typeof createRoot === 'function' ) {
		createRoot( root ).render( <EntriesApp config={ window.quoteformEntries || {} } /> );
	} else {
		renderUnsupportedNotice( root );
	}
}
```

`admin-src/entries/EntriesApp.js` (stub; Task 13 replaces the whole file):

```js
import { __ } from '@wordpress/i18n';

export default function EntriesApp() {
	return <h1>{ __( 'Entries', 'quoteform' ) }</h1>;
}
```

`admin-src/entries/style.scss`:

```scss
// Entries paketi builder ilə eyni əsas stilləri işlədir (kök `.quoteform_builder`),
// amma builder paketini yükləmir — ona görə partial-lar burada ayrıca import olunur.
@import "../styles/tokens";
@import "../styles/base";
@import "../styles/shell";
@import "../styles/list";
@import "./entries";
```

`admin-src/entries/_entries.scss` (başlanğıc; Task 13 tam əvəz edir):

```scss
// Tək canlı sahə `createAnnouncer`-in `<p class="quoteform_sr_only">`-idir; frontend
// stil faylı admində yüklənmir, ona görə gizlətmə qaydası burada da lazımdır.
.quoteform_builder .quoteform_sr_only {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip: rect( 0 0 0 0 );
	white-space: nowrap;
	border: 0;
}
```

- [ ] **Step 10: Build and run both tests** — `npm run build` → `build/entries.js`, `build/entries.asset.php`, `build/style-entries.css`, `build/style-entries-rtl.css` yaranır (`ls build | grep entries`); `npx jest tests/js/admin/entriesBootstrap.test.js` → PASS (3); `make itest ARGS="--filter EntriesPageTest"` → PASS (10 test).

- [ ] **Step 11: Verify** — `make buildcheck` → "build/ matches …" (`Only in build: … 2.js` kimi sətirlər iCloud nüsxələridir — həmin faylları sil, build-i dəyişmə); `make itest` → yaşıl (xüsusən `BuilderPageTest` dəyişmədən keçir); `npm test` → yaşıl; `make up` açıqdırsa `http://localhost:8083/wp-admin/admin.php?page=quoteform-entries` → "Entries" başlığı, menyuda Forms/Entries, konsolda xəta yoxdur.

---
### Task 8: JS təməli — REST funksiyaları, URL vəziyyəti, menyu nişanı, tək canlı sahə

**Files:**
- Modify: `admin-src/api/client.js` (yeni ixraclar; mövcudlar dəyişmir)
- Modify: `admin-src/components/Notice.js` (`live` prop, default `true` — builder davranışı dəyişmir)
- Create: `admin-src/entries/urlState.js`, `admin-src/entries/menuBadge.js`, `admin-src/entries/useAnnouncer.js`, `admin-src/entries/errors.js`
- Test: `tests/js/admin/entriesClient.test.js`, `tests/js/admin/NoticeLive.test.js`, `tests/js/admin/entriesUrlState.test.js`, `tests/js/admin/menuBadge.test.js`, `tests/js/admin/useAnnouncer.test.js`, `tests/js/admin/entryErrors.test.js`

**Interfaces:**
- Consumes: `filters.js` (Task 1): `normaliseFilters`, `filterParams`; `frontend-src/dom/announce.js`: `createAnnouncer( container ) → { announce( message, { force } ), destroy() }` (kopya YOX — eyni modul); `lib/apiErrors.js`: `errorMessage`, `needsReload`; REST (Task 5).
- Produces:
  - `client.js`: `listEntries( params ) → Promise<{ items, total, pages, page, per_page, unread }>`; `getEntry( id, params ) → Promise<detail>`; `updateEntries( action, ids ) → Promise<{ affected, unread }>`; `deleteEntry( id ) → Promise<{ id, deleted, unread }>`. Xətalar mövcud `ApiError` (`code`, `status`, `message`). Nonce-u `wp-api-fetch` middleware-i özü qoyur — bu funksiyalar başlıq qurmur.
  - `Notice( { status, children, onDismiss, live = true } )` — `live={ false }` → `role` atributu yoxdur (Entries tək canlı sahə qaydası).
  - `urlState.js`: `PAGE_SLUG = 'quoteform-entries'`; `parseState( search ) → { filters, paged: int ≥ 1, entry: int | null }`; `buildSearch( { filters, paged, entry } ) → '?page=quoteform-entries&…'` (default-lar yazılmır); `isPlainClick( event ) → boolean` (sol düymə, modifikatorsuz — ctrl/cmd-klik yeni tab açsın).
  - `menuBadge.js`: `formatCount( n ) → string` (`Intl.NumberFormat`, `<html lang>`); `updateMenuBadge( count, root = document )` — `.quoteform_unread-badge` elementlərini (PHP `EntriesPage::badge()` markup-ı) yeniləyir.
  - `useAnnouncer( containerRef ) → announce( message, options )` — stabil funksiya; region `containerRef.current`-ə mount-da əlavə, unmount-da silinir.
  - `errors.js`: `entryErrorMessage( error ) → string`; `isNotFound( error ) → boolean` (`qform_entry_not_found`).

- [ ] **Step 1: Write the failing tests.** `tests/js/admin/entriesClient.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import apiFetch from '@wordpress/api-fetch';

import {
	ApiError,
	deleteEntry,
	getEntry,
	listEntries,
	updateEntries,
} from '../../../admin-src/api/client';

jest.mock( '@wordpress/api-fetch' );

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'entries REST calls', () => {
	it( 'lists with only the parameters that carry a value', async () => {
		apiFetch.mockResolvedValue( { items: [], total: 0, pages: 0, page: 1, per_page: 20, unread: 0 } );

		await listEntries( { form: '7', status: undefined, min: null, max: '', page: 2, per_page: 50 } );

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries?form=7&page=2&per_page=50' } );
	} );

	it( 'lists without a query string when nothing is set', async () => {
		apiFetch.mockResolvedValue( {} );

		await listEntries();

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries' } );
	} );

	it( 'encodes values so a stray ampersand cannot add a parameter', async () => {
		apiFetch.mockResolvedValue( {} );

		await listEntries( { status: 'new&form=1' } );

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries?status=new%26form%3D1' } );
	} );

	it( 'reads one entry with the list filters for its neighbours', async () => {
		apiFetch.mockResolvedValue( { id: 41 } );

		await getEntry( 41, { status: 'new', orderby: 'total' } );

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries/41?status=new&orderby=total' } );
	} );

	it( 'sends batch actions as JSON', async () => {
		apiFetch.mockResolvedValue( { affected: 2, unread: 0 } );

		await expect( updateEntries( 'read', [ 4, 5 ] ) ).resolves.toEqual( { affected: 2, unread: 0 } );
		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/entries/batch',
			method: 'POST',
			data: { action: 'read', ids: [ 4, 5 ] },
		} );
	} );

	it( 'deletes one entry', async () => {
		apiFetch.mockResolvedValue( { id: 9, deleted: true, unread: 3 } );

		await deleteEntry( 9 );

		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/entries/9', method: 'DELETE' } );
	} );

	it( 'turns a REST error into an ApiError with its code and status', async () => {
		apiFetch.mockRejectedValue( { code: 'qform_entry_not_found', message: 'Entry not found.', data: { status: 404 } } );

		const caught = await getEntry( 5 ).catch( ( error ) => error );

		expect( caught ).toBeInstanceOf( ApiError );
		expect( caught.code ).toBe( 'qform_entry_not_found' );
		expect( caught.status ).toBe( 404 );
	} );
} );
```

`tests/js/admin/NoticeLive.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import Notice from '../../../admin-src/components/Notice';

describe( 'Notice live regions', () => {
	it( 'keeps its roles by default', () => {
		render(
			<>
				<Notice status="error">Broken</Notice>
				<Notice status="success">Saved</Notice>
			</>
		);

		expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Broken' );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Saved' );
	} );

	it( 'is a plain box when the screen announces through its own region', () => {
		const { container } = render( <Notice status="error" live={ false }>Broken</Notice> );

		expect( screen.getByText( 'Broken' ) ).toBeInTheDocument();
		expect( container.querySelector( '[role]' ) ).toBeNull();
	} );
} );
```

`tests/js/admin/entriesUrlState.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';
import { buildSearch, isPlainClick, parseState } from '../../../admin-src/entries/urlState';

describe( 'parseState', () => {
	it( 'reads filters, page and the open entry', () => {
		expect( parseState( '?page=quoteform-entries&form=7&status=new&orderby=total&paged=3&entry=41' ) ).toEqual( {
			filters: { ...DEFAULT_FILTERS, form: 7, status: 'new', orderby: 'total' },
			paged: 3,
			entry: 41,
		} );
	} );

	it( 'falls back quietly on values it cannot use', () => {
		expect( parseState( '?page=quoteform-entries&form=abc&paged=0&entry=-2&from=2026-02-30' ) ).toEqual( {
			filters: DEFAULT_FILTERS,
			paged: 1,
			entry: null,
		} );
		expect( parseState( '?paged=2.5&entry=4e2' ) ).toEqual( { filters: DEFAULT_FILTERS, paged: 1, entry: null } );
	} );

	it( 'takes the last copy of a repeated parameter, as PHP does', () => {
		expect( parseState( '?status=read&status=new' ).filters.status ).toBe( 'new' );
	} );
} );

describe( 'buildSearch', () => {
	it( 'keeps the WordPress page slug and leaves defaults out', () => {
		expect( buildSearch( { filters: DEFAULT_FILTERS, paged: 1, entry: null } ) ).toBe( '?page=quoteform-entries' );
	} );

	it( 'writes what differs from the defaults', () => {
		expect(
			buildSearch( { filters: { ...DEFAULT_FILTERS, form: 'deleted', min: '10.5', order: 'asc' }, paged: 2, entry: 9 } )
		).toBe( '?page=quoteform-entries&form=deleted&min=10.5&order=asc&paged=2&entry=9' );
	} );

	it( 'round-trips through parseState', () => {
		const state = { filters: { ...DEFAULT_FILTERS, status: 'read', from: '2026-09-01', to: '2026-09-25' }, paged: 4, entry: null };

		expect( parseState( buildSearch( state ) ) ).toEqual( state );
	} );
} );

describe( 'isPlainClick', () => {
	it( 'lets modified and middle clicks open a new tab', () => {
		expect( isPlainClick( { button: 0 } ) ).toBe( true );
		expect( isPlainClick( { button: 1 } ) ).toBe( false );
		expect( isPlainClick( { button: 0, ctrlKey: true } ) ).toBe( false );
		expect( isPlainClick( { button: 0, metaKey: true } ) ).toBe( false );
		expect( isPlainClick( { button: 0, shiftKey: true } ) ).toBe( false );
		expect( isPlainClick( { button: 0, altKey: true } ) ).toBe( false );
	} );
} );
```

`tests/js/admin/menuBadge.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { updateMenuBadge } from '../../../admin-src/entries/menuBadge';

// PHP EntriesPage::badge( 3 ) ilə eyni markup.
const BADGE = '<a>Entries <span class="awaiting-mod quoteform_unread-badge count-3"><span class="pending-count" aria-hidden="true">3</span><span class="screen-reader-text">3 unread entries</span></span></a>';

beforeEach( () => {
	document.documentElement.lang = 'en-US';
	document.body.innerHTML = `<ul id="adminmenu"><li>${ BADGE }</li></ul>`;
} );

function badge() {
	return document.querySelector( '.quoteform_unread-badge' );
}

describe( 'updateMenuBadge', () => {
	it( 'shows the new count to eyes and to screen readers', () => {
		updateMenuBadge( 1234 );

		expect( badge().className ).toBe( 'awaiting-mod quoteform_unread-badge count-1234' );
		expect( badge().querySelector( '.pending-count' ).textContent ).toBe( '1,234' );
		expect( badge().querySelector( '.screen-reader-text' ).textContent ).toBe( '1,234 unread entries' );
	} );

	it( 'uses the singular for one', () => {
		updateMenuBadge( 1 );

		expect( badge().querySelector( '.screen-reader-text' ).textContent ).toBe( '1 unread entry' );
	} );

	it( 'hides itself at zero the way WordPress does', () => {
		updateMenuBadge( 0 );

		expect( badge().classList.contains( 'count-0' ) ).toBe( true );
	} );

	it( 'treats a missing or broken count as zero', () => {
		updateMenuBadge( undefined );
		expect( badge().classList.contains( 'count-0' ) ).toBe( true );

		updateMenuBadge( -4 );
		expect( badge().classList.contains( 'count-0' ) ).toBe( true );
	} );

	it( 'does nothing when the menu has no badge', () => {
		document.body.innerHTML = '';

		expect( () => updateMenuBadge( 5 ) ).not.toThrow();
	} );
} );
```

`tests/js/admin/useAnnouncer.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { useRef } from 'react';

import useAnnouncer from '../../../admin-src/entries/useAnnouncer';

let announce = null;

function Probe() {
	const ref = useRef( null );

	announce = useAnnouncer( ref );

	return <div data-testid="live" ref={ ref } />;
}

beforeEach( () => {
	jest.useFakeTimers();
} );

afterEach( () => {
	jest.useRealTimers();
} );

describe( 'useAnnouncer', () => {
	it( 'puts exactly one polite region in its container and speaks through it', () => {
		const { getByTestId } = render( <Probe /> );
		const regions = getByTestId( 'live' ).querySelectorAll( '[aria-live]' );

		expect( regions ).toHaveLength( 1 );
		expect( regions[ 0 ] ).toHaveAttribute( 'role', 'status' );

		act( () => {
			announce( '3 entries deleted.' );
			jest.advanceTimersByTime( 600 );
		} );

		expect( regions[ 0 ] ).toHaveTextContent( '3 entries deleted.' );
	} );

	it( 'repeats an identical message when forced', () => {
		const { getByTestId } = render( <Probe /> );
		const region = getByTestId( 'live' ).querySelector( '[aria-live]' );

		act( () => {
			announce( 'Something went wrong.' );
			jest.advanceTimersByTime( 600 );
		} );
		act( () => {
			announce( 'Something went wrong.', { force: true } );
		} );

		expect( region.textContent ).toBe( '' );

		act( () => {
			jest.advanceTimersByTime( 600 );
		} );

		expect( region ).toHaveTextContent( 'Something went wrong.' );
	} );

	it( 'removes its region when the screen goes away', () => {
		const { getByTestId, unmount } = render( <Probe /> );
		const container = getByTestId( 'live' );

		unmount();

		expect( container.querySelector( '[aria-live]' ) ).toBeNull();
		expect( () => announce( 'late' ) ).not.toThrow();
	} );
} );
```

`tests/js/admin/entryErrors.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { ApiError } from '../../../admin-src/api/client';
import { entryErrorMessage, isNotFound } from '../../../admin-src/entries/errors';

describe( 'entry error messages', () => {
	it( 'asks for a reload when the session no longer allows entries', () => {
		const error = new ApiError( { code: 'rest_forbidden', status: 403, message: 'no' } );

		expect( entryErrorMessage( error ) ).toBe( 'You are no longer allowed to see entries. Reload the page and sign in again.' );
	} );

	it( 'recognises a missing entry', () => {
		const error = new ApiError( { code: 'qform_entry_not_found', status: 404, message: 'Entry not found.' } );

		expect( isNotFound( error ) ).toBe( true );
		expect( entryErrorMessage( error ) ).toBe( 'That entry no longer exists.' );
		expect( isNotFound( null ) ).toBe( false );
	} );

	it( 'falls back to the shared messages', () => {
		expect( entryErrorMessage( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) ) ).toBe( 'You appear to be offline.' );
	} );
} );
```

- [ ] **Step 2: Run them to verify they fail** — `npx jest tests/js/admin/entriesClient.test.js tests/js/admin/NoticeLive.test.js tests/js/admin/entriesUrlState.test.js tests/js/admin/menuBadge.test.js tests/js/admin/useAnnouncer.test.js tests/js/admin/entryErrors.test.js` → FAIL (`listEntries is not a function`, `Cannot find module …/urlState`, və s.; NoticeLive-in ikinci testi `role="alert"` tapır).

- [ ] **Step 3: Add the REST calls** — append to `admin-src/api/client.js`:

```js
function queryString( params ) {
	const search = new URLSearchParams();

	Object.keys( params ).forEach( ( key ) => {
		const value = params[ key ];

		if ( value !== null && value !== undefined && value !== '' ) {
			search.set( key, String( value ) );
		}
	} );

	const text = search.toString();

	return text === '' ? '' : `?${ text }`;
}

export function listEntries( params = {} ) {
	return request( { path: `${ NAMESPACE }/entries${ queryString( params ) }` } );
}

export function getEntry( id, params = {} ) {
	return request( { path: `${ NAMESPACE }/entries/${ Number( id ) }${ queryString( params ) }` } );
}

export function updateEntries( action, ids ) {
	return request( {
		path: `${ NAMESPACE }/entries/batch`,
		method: 'POST',
		data: { action, ids },
	} );
}

export function deleteEntry( id ) {
	return request( {
		path: `${ NAMESPACE }/entries/${ Number( id ) }`,
		method: 'DELETE',
	} );
}
```

- [ ] **Step 4: Let `Notice` opt out of being a live region** — replace `admin-src/components/Notice.js`:

```js
import { __ } from '@wordpress/i18n';

/**
 * `live={ false }`: ekran öz tək canlı sahəsi ilə elan edirsə (Entries), bildiriş
 * ikinci canlı sahə olmamalıdır — mesaj görünür, amma `role` daşımır.
 */
export default function Notice( { status = 'info', children, onDismiss, live = true } ) {
	const isError = status === 'error';
	let role;

	if ( live ) {
		role = isError ? 'alert' : 'status';
	}

	return (
		<div className={ `quoteform_notice quoteform_notice--${ status }` } role={ role }>
			<div className="quoteform_notice__body">{ children }</div>
			{ onDismiss && (
				<button
					type="button"
					className="quoteform_notice__dismiss"
					onClick={ onDismiss }
					aria-label={ __( 'Dismiss this notice', 'quoteform' ) }
				>
					{ '×' }
				</button>
			) }
		</div>
	);
}
```

- [ ] **Step 5: Create `admin-src/entries/urlState.js`:**

```js
import { filterParams, normaliseFilters } from './filters';

export const PAGE_SLUG = 'quoteform-entries';

// Filtr id-ləri ilə eyni: 15 rəqəmə qədər (JS Number dəqiq saxlayır).
const POSITIVE = /^[1-9]\d{0,14}$/;

/**
 * URL → ekran vəziyyəti. `Object.fromEntries` təkrar parametrdə SONUNCUNU götürür —
 * PHP `$_GET` də belədir, ona görə eksport linki ekranla eyni filtri görür.
 */
export function parseState( search ) {
	const params = Object.fromEntries( new URLSearchParams( search ) );

	return {
		filters: normaliseFilters( params ),
		paged: POSITIVE.test( params.paged || '' ) ? Number( params.paged ) : 1,
		entry: POSITIVE.test( params.entry || '' ) ? Number( params.entry ) : null,
	};
}

export function buildSearch( { filters, paged, entry } ) {
	const search = new URLSearchParams( { page: PAGE_SLUG, ...filterParams( filters ) } );

	if ( paged > 1 ) {
		search.set( 'paged', String( paged ) );
	}

	if ( entry !== null && entry !== undefined ) {
		search.set( 'entry', String( entry ) );
	}

	return `?${ search.toString() }`;
}

/**
 * Keçidlər əsl `href` daşıyır (yeni tabda açmaq üçün); yalnız adi sol klik
 * səhifə daxilində (history) açılır.
 */
export function isPlainClick( event ) {
	return event.button === 0 && ! event.metaKey && ! event.ctrlKey && ! event.shiftKey && ! event.altKey;
}
```

- [ ] **Step 6: Create `admin-src/entries/menuBadge.js`:**

```js
import { _n, sprintf } from '@wordpress/i18n';

export function formatCount( count ) {
	try {
		return new Intl.NumberFormat( document.documentElement.lang || undefined ).format( count );
	} catch ( error ) {
		// Tanınmayan `lang` teqi (`RangeError`).
		return String( count );
	}
}

/**
 * Menyudakı nişanı (PHP `EntriesPage::badge()` markup-ı) yeni say ilə yeniləyir.
 * `count-0` sinfini WordPress nüvəsinin CSS-i gizlədir.
 */
export function updateMenuBadge( count, root = document ) {
	const value = Number.isInteger( count ) && count > 0 ? count : 0;

	root.querySelectorAll( '.quoteform_unread-badge' ).forEach( ( badge ) => {
		badge.className = `awaiting-mod quoteform_unread-badge count-${ value }`;

		const number = badge.querySelector( '.pending-count' );
		const text = badge.querySelector( '.screen-reader-text' );

		if ( number ) {
			number.textContent = formatCount( value );
		}

		if ( text ) {
			text.textContent = sprintf(
				/* translators: %s: number of unread entries. */
				_n( '%s unread entry', '%s unread entries', value, 'quoteform' ),
				formatCount( value )
			);
		}
	} );
}
```

- [ ] **Step 7: Create `admin-src/entries/useAnnouncer.js`:**

```js
import { useCallback, useEffect, useRef } from '@wordpress/element';

import { createAnnouncer } from '../../frontend-src/dom/announce';

/**
 * Entries ekranının YEGANƏ canlı sahəsi — ziyarətçi formasındakı ilə eyni
 * `createAnnouncer` (kopya deyil). Qaytarılan funksiya stabildir.
 */
export default function useAnnouncer( containerRef ) {
	const announcerRef = useRef( null );

	useEffect( () => {
		const announcer = createAnnouncer( containerRef.current );

		announcerRef.current = announcer;

		return () => {
			announcer.destroy();
			announcerRef.current = null;
		};
	}, [ containerRef ] );

	return useCallback( ( message, options ) => {
		if ( announcerRef.current ) {
			announcerRef.current.announce( message, options );
		}
	}, [] );
}
```

- [ ] **Step 8: Create `admin-src/entries/errors.js`:**

```js
import { __ } from '@wordpress/i18n';

import { errorMessage, needsReload } from '../lib/apiErrors';

export function isNotFound( error ) {
	return !! error && error.code === 'qform_entry_not_found';
}

export function entryErrorMessage( error ) {
	if ( needsReload( error ) ) {
		return __( 'You are no longer allowed to see entries. Reload the page and sign in again.', 'quoteform' );
	}

	if ( isNotFound( error ) ) {
		return __( 'That entry no longer exists.', 'quoteform' );
	}

	return errorMessage( error );
}
```

- [ ] **Step 9: Run the tests** — eyni `npx jest …` əmri → PASS (7 + 2 + 7 + 5 + 3 + 3). `entriesClient`-in "offline" halında `fetch_error` mesajı `client.js`-in `KNOWN_CODE_MESSAGES`-dən gəlir — `entryErrors.test.js` onu ApiError-un öz mesajı ilə yoxlayır.

- [ ] **Step 10: Verify** — `npm test` → hamısı yaşıl (xüsusən mövcud `FormListScreen`, `CopyField`, `EditorScreen` testləri — `Notice`-in default davranışı eynidir); `npm run build` və `make buildcheck` → yaşıl (client.js builder paketinə də düşür; entries paketi hələ bu modulları import etmir).

---
### Task 9: Cədvəl və səhifələmə — `EntriesTable`, `Pagination`

**Files:**
- Create: `admin-src/entries/EntriesTable.js`
- Create: `admin-src/entries/Pagination.js`
- Test: `tests/js/admin/EntriesTable.test.js`, `tests/js/admin/entriesPagination.test.js`

**Interfaces:**
- Consumes: `Button`, `RemoveConfirm` (`components/`); `isPlainClick` (Task 8); REST `listItem` forması (Task 4/5).
- Produces:
  - `EntriesTable( { items, filters, onSort( column ), selected: Set<number>, onToggle( id ), onToggleAll( checked ), entryHref( id ) → string, onOpen( id ), formHref( formId ) → string | null, canDelete, confirmingId: number | null, onAskDelete( item ), onConfirmDelete( item ), onCancelDelete( item ), deleteButtonRef( id, element ), busy } )` — təqdimat komponenti, öz vəziyyəti yoxdur.
  - `tableCaption( filters ) → string` (ekran oxuyucu üçün sıralama təsviri).
  - `Pagination( { page, pages, perPage, onPage( n ), onPerPage( n ) } )`; `pageWindow( page, pages ) → Array<number | 'gap'>` (ilk, son, cari ±2; tək buraxılan nömrə "…" əvəzinə göstərilir); `PER_PAGE_CHOICES = [ 20, 50, 100 ]`.
- Qaydalar: sütunlar spec §3.1 — ☐ · Entry (`#41` + **New**) · Name / Email (bir sütun: ad üstdə, email `mailto`) · Form (redaktor linki və ya "(deleted form)") · Total (`total_display`; `null` → `—` + "Calculation failed") · Date (`title` = tam tarix). Yalnız Total və Date sıralanır; `aria-sort` yalnız aktiv başlıqdadır. Cədvəl üfüqi sürüşən bölgədədir (`role="region"`, `tabIndex={ 0 }`, ad ilə). Bütün mətn React text node-dur.

- [ ] **Step 1: Write the failing tests.** `tests/js/admin/EntriesTable.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EntriesTable, { tableCaption } from '../../../admin-src/entries/EntriesTable';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

function item( id, extra = {} ) {
	return {
		id,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: true,
		name: 'Jane Doe',
		email: 'jane@example.com',
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25, 2026 1:30 am', full: '2026-09-25 01:30:00 +04', iso: '2026-09-24T21:30:00Z' },
		...extra,
	};
}

function setup( overrides = {} ) {
	const props = {
		items: [ item( 41, { is_read: false } ), item( 40 ) ],
		filters: DEFAULT_FILTERS,
		onSort: jest.fn(),
		selected: new Set(),
		onToggle: jest.fn(),
		onToggleAll: jest.fn(),
		entryHref: ( id ) => `?page=quoteform-entries&entry=${ id }`,
		onOpen: jest.fn(),
		formHref: ( formId ) => `admin.php?page=quoteform&form=${ formId }`,
		canDelete: true,
		confirmingId: null,
		onAskDelete: jest.fn(),
		onConfirmDelete: jest.fn(),
		onCancelDelete: jest.fn(),
		deleteButtonRef: jest.fn(),
		busy: false,
		...overrides,
	};

	render( <EntriesTable { ...props } /> );

	return props;
}

function row( id ) {
	return screen.getByRole( 'rowheader', { name: new RegExp( `#${ id }` ) } ).closest( 'tr' );
}

describe( 'EntriesTable', () => {
	it( 'sits in a named, keyboard-scrollable region with a caption', () => {
		setup();

		const region = screen.getByRole( 'region', { name: 'Entries table' } );

		expect( region ).toHaveAttribute( 'tabindex', '0' );
		expect( within( region ).getByRole( 'table', { name: 'Entries, newest first' } ) ).toBeInTheDocument();
	} );

	it( 'marks unread entries as New and bold', () => {
		setup();

		expect( row( 41 ) ).toHaveClass( 'quoteform_entries__row--unread' );
		expect( within( row( 41 ) ).getByText( 'New' ) ).toBeInTheDocument();
		expect( row( 40 ) ).not.toHaveClass( 'quoteform_entries__row--unread' );
		expect( within( row( 40 ) ).queryByText( 'New' ) ).not.toBeInTheDocument();
	} );

	it( 'shows the name and a mailto link, or a dash when there is neither', () => {
		setup( { items: [ item( 41 ), item( 42, { name: '', email: '' } ) ] } );

		expect( within( row( 41 ) ).getByText( 'Jane Doe' ) ).toBeInTheDocument();
		expect( within( row( 41 ) ).getByRole( 'link', { name: 'jane@example.com' } ) ).toHaveAttribute( 'href', 'mailto:jane@example.com' );
		expect( within( row( 42 ) ).getByText( '—' ) ).toBeInTheDocument();
	} );

	it( 'renders submitted text as text, never as markup', () => {
		setup( { items: [ item( 41, { name: '<b>Jane</b><img src=x onerror=alert(1)>' } ) ] } );

		expect( within( row( 41 ) ).getByText( '<b>Jane</b><img src=x onerror=alert(1)>' ) ).toBeInTheDocument();
		expect( row( 41 ).querySelector( 'b, img' ) ).toBeNull();
	} );

	it( 'links the form to its editor, or says the form is gone', () => {
		setup( { items: [ item( 41 ), item( 42, { form_title: null } ) ] } );

		expect( within( row( 41 ) ).getByRole( 'link', { name: 'Cleaning quote' } ) ).toHaveAttribute( 'href', 'admin.php?page=quoteform&form=7' );
		expect( within( row( 42 ) ).getByText( '(deleted form)' ) ).toBeInTheDocument();
	} );

	it( 'shows the form name without a link to someone who cannot edit forms', () => {
		setup( { formHref: () => null } );

		expect( within( row( 41 ) ).getByText( 'Cleaning quote' ) ).toBeInTheDocument();
		expect( within( row( 41 ) ).queryByRole( 'link', { name: 'Cleaning quote' } ) ).not.toBeInTheDocument();
	} );

	it( 'explains a missing total', () => {
		setup( { items: [ item( 41, { total: null, total_display: '' } ) ] } );

		expect( within( row( 41 ) ).getByText( 'Calculation failed' ) ).toBeInTheDocument();
		expect( within( row( 41 ) ).getByText( '—' ) ).toBeInTheDocument();
	} );

	it( 'gives the date its full form on hover and a machine-readable value', () => {
		setup();

		const time = within( row( 41 ) ).getByText( 'Sep 25, 2026 1:30 am' );

		expect( time.tagName ).toBe( 'TIME' );
		expect( time ).toHaveAttribute( 'title', '2026-09-25 01:30:00 +04' );
		expect( time ).toHaveAttribute( 'datetime', '2026-09-24T21:30:00Z' );
	} );

	it( 'announces the sort only on the active column and asks to sort on click', async () => {
		const props = setup( { filters: { ...DEFAULT_FILTERS, orderby: 'total', order: 'asc' } } );
		const user = userEvent.setup();

		expect( screen.getByRole( 'columnheader', { name: /Total/ } ) ).toHaveAttribute( 'aria-sort', 'ascending' );
		expect( screen.getByRole( 'columnheader', { name: /Date/ } ) ).not.toHaveAttribute( 'aria-sort' );
		expect( screen.getByRole( 'table', { name: 'Entries, lowest total first' } ) ).toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Date' } ) );

		expect( props.onSort ).toHaveBeenCalledWith( 'date' );
	} );

	it( 'labels every checkbox and selects all on the page', async () => {
		const props = setup( { selected: new Set( [ 41 ] ) } );
		const user = userEvent.setup();

		expect( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) ).toBeChecked();
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) ).not.toBeChecked();

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) );
		expect( props.onToggle ).toHaveBeenCalledWith( 40 );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } ) );
		expect( props.onToggleAll ).toHaveBeenCalledWith( true );
	} );

	it( 'opens an entry in place on a plain click but lets a modified click open a new tab', () => {
		// jsdom real naviqasiya etmir və bunu konsola yazır; testin sonunda default-u özümüz dayandırırıq.
		const stopNavigation = ( event ) => event.preventDefault();
		document.addEventListener( 'click', stopNavigation );

		try {
			const props = setup();
			const view = screen.getByRole( 'link', { name: 'View entry #41' } );

			expect( view ).toHaveAttribute( 'href', '?page=quoteform-entries&entry=41' );

			fireEvent.click( view, { button: 0, ctrlKey: true } );
			expect( props.onOpen ).not.toHaveBeenCalled();

			fireEvent.click( view, { button: 0 } );
			expect( props.onOpen ).toHaveBeenCalledWith( 41 );
		} finally {
			document.removeEventListener( 'click', stopNavigation );
		}
	} );

	it( 'offers Delete only to someone allowed to delete, with a confirmation', async () => {
		const props = setup( { confirmingId: 41 } );
		const user = userEvent.setup();

		expect( screen.getByRole( 'button', { name: 'Delete entry #41' } ) ).toBeInTheDocument();
		expect( screen.getByText( 'Delete entry #41? This cannot be undone.' ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Delete permanently' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );
		expect( props.onCancelDelete ).toHaveBeenCalledWith( expect.objectContaining( { id: 41 } ) );
	} );

	it( 'hides Delete from someone who may only read', () => {
		setup( { canDelete: false } );

		expect( screen.queryByRole( 'button', { name: /Delete entry/ } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'tableCaption', () => {
	it( 'describes all four orders', () => {
		expect( tableCaption( DEFAULT_FILTERS ) ).toBe( 'Entries, newest first' );
		expect( tableCaption( { ...DEFAULT_FILTERS, order: 'asc' } ) ).toBe( 'Entries, oldest first' );
		expect( tableCaption( { ...DEFAULT_FILTERS, orderby: 'total' } ) ).toBe( 'Entries, highest total first' );
		expect( tableCaption( { ...DEFAULT_FILTERS, orderby: 'total', order: 'asc' } ) ).toBe( 'Entries, lowest total first' );
	} );
} );
```

`tests/js/admin/entriesPagination.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Pagination, { pageWindow } from '../../../admin-src/entries/Pagination';

describe( 'pageWindow', () => {
	it( 'lists every page when there are few', () => {
		expect( pageWindow( 1, 5 ) ).toEqual( [ 1, 2, 3, 4, 5 ] );
	} );

	it( 'keeps the first, the last and two either side of the current page', () => {
		expect( pageWindow( 50, 250 ) ).toEqual( [ 1, 'gap', 48, 49, 50, 51, 52, 'gap', 250 ] );
	} );

	it( 'shows a single skipped number instead of a gap', () => {
		expect( pageWindow( 5, 9 ) ).toEqual( [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ] );
		expect( pageWindow( 1, 9 ) ).toEqual( [ 1, 2, 3, 'gap', 9 ] );
	} );

	it( 'is empty when there are no pages', () => {
		expect( pageWindow( 1, 0 ) ).toEqual( [] );
	} );
} );

describe( 'Pagination', () => {
	it( 'moves between pages and marks the current one', async () => {
		const onPage = jest.fn();
		const user = userEvent.setup();

		render( <Pagination page={ 2 } pages={ 3 } perPage={ 20 } onPage={ onPage } onPerPage={ jest.fn() } /> );

		expect( screen.getByRole( 'navigation', { name: 'Entry list pages' } ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Page 2 of 3' } ) ).toHaveAttribute( 'aria-current', 'page' );

		await user.click( screen.getByRole( 'button', { name: 'Page 3 of 3' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Previous page' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Next page' } ) );

		expect( onPage.mock.calls ).toEqual( [ [ 3 ], [ 1 ], [ 3 ] ] );
	} );

	it( 'disables the arrows at the ends', () => {
		render( <Pagination page={ 1 } pages={ 2 } perPage={ 20 } onPage={ jest.fn() } onPerPage={ jest.fn() } /> );

		expect( screen.getByRole( 'button', { name: 'Previous page' } ) ).toBeDisabled();
		expect( screen.getByRole( 'button', { name: 'Next page' } ) ).toBeEnabled();
	} );

	it( 'hides the page buttons on a single page but keeps the page size choice', async () => {
		const onPerPage = jest.fn();
		const user = userEvent.setup();

		render( <Pagination page={ 1 } pages={ 1 } perPage={ 20 } onPage={ jest.fn() } onPerPage={ onPerPage } /> );

		expect( screen.queryByRole( 'navigation' ) ).not.toBeInTheDocument();

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Per page' } ), '50' );

		expect( onPerPage ).toHaveBeenCalledWith( 50 );
	} );

	it( 'keeps an unusual stored page size selectable', () => {
		render( <Pagination page={ 1 } pages={ 1 } perPage={ 37 } onPage={ jest.fn() } onPerPage={ jest.fn() } /> );

		expect( screen.getByRole( 'combobox', { name: 'Per page' } ) ).toHaveValue( '37' );
	} );
} );
```

- [ ] **Step 2: Run them to verify they fail** — `npx jest tests/js/admin/EntriesTable.test.js tests/js/admin/entriesPagination.test.js` → FAIL (`Cannot find module …/EntriesTable`).

- [ ] **Step 3: Create `admin-src/entries/Pagination.js`:**

```js
import { __, sprintf } from '@wordpress/i18n';

export const PER_PAGE_CHOICES = [ 20, 50, 100 ];

/**
 * 250 səhifəlik siyahı 250 düymə çəkməsin: ilk, son və cari ±2. Aradakı
 * boşluq yalnız bir nömrədirsə, "…" əvəzinə həmin nömrə göstərilir.
 */
export function pageWindow( page, pages ) {
	const numbers = [];

	for ( let number = 1; number <= pages; number += 1 ) {
		if ( number === 1 || number === pages || Math.abs( number - page ) <= 2 ) {
			numbers.push( number );
		}
	}

	const result = [];

	numbers.forEach( ( number, index ) => {
		const previous = numbers[ index - 1 ];

		if ( index > 0 && number - previous === 2 ) {
			result.push( previous + 1 );
		} else if ( index > 0 && number - previous > 2 ) {
			result.push( 'gap' );
		}

		result.push( number );
	} );

	return result;
}

export default function Pagination( { page, pages, perPage, onPage, onPerPage } ) {
	const choices = PER_PAGE_CHOICES.includes( perPage )
		? PER_PAGE_CHOICES
		: [ ...PER_PAGE_CHOICES, perPage ].sort( ( a, b ) => a - b );

	return (
		<div className="quoteform_entries__pagination">
			{ pages > 1 && (
				<nav className="quoteform_list__pages" aria-label={ __( 'Entry list pages', 'quoteform' ) }>
					<button
						type="button"
						onClick={ () => onPage( page - 1 ) }
						disabled={ page <= 1 }
						aria-label={ __( 'Previous page', 'quoteform' ) }
					>
						<span aria-hidden="true">‹</span>
					</button>
					{ pageWindow( page, pages ).map( ( item, index ) =>
						item === 'gap' ? (
							<span key={ `gap-${ index }` } className="quoteform_entries__gap" aria-hidden="true">
								…
							</span>
						) : (
							<button
								key={ item }
								type="button"
								onClick={ () => onPage( item ) }
								aria-current={ item === page ? 'page' : undefined }
								aria-label={ sprintf(
									/* translators: 1: page number. 2: how many pages there are. */
									__( 'Page %1$d of %2$d', 'quoteform' ),
									item,
									pages
								) }
							>
								{ item }
							</button>
						)
					) }
					<button
						type="button"
						onClick={ () => onPage( page + 1 ) }
						disabled={ page >= pages }
						aria-label={ __( 'Next page', 'quoteform' ) }
					>
						<span aria-hidden="true">›</span>
					</button>
				</nav>
			) }
			<label className="quoteform_entries__per-page">
				{ __( 'Per page', 'quoteform' ) }
				<select value={ perPage } onChange={ ( event ) => onPerPage( Number( event.target.value ) ) }>
					{ choices.map( ( choice ) => (
						<option key={ choice } value={ choice }>
							{ choice }
						</option>
					) ) }
				</select>
			</label>
		</div>
	);
}
```

- [ ] **Step 4: Create `admin-src/entries/EntriesTable.js`:**

```js
import { __, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import RemoveConfirm from '../components/RemoveConfirm';
import { isPlainClick } from './urlState';

export function tableCaption( filters ) {
	if ( filters.orderby === 'total' ) {
		return filters.order === 'asc'
			? __( 'Entries, lowest total first', 'quoteform' )
			: __( 'Entries, highest total first', 'quoteform' );
	}

	return filters.order === 'asc'
		? __( 'Entries, oldest first', 'quoteform' )
		: __( 'Entries, newest first', 'quoteform' );
}

function columnLabel( column ) {
	return column === 'total' ? __( 'Total', 'quoteform' ) : __( 'Date', 'quoteform' );
}

function SortHeader( { column, filters, onSort } ) {
	const active = filters.orderby === column;
	let sort;
	let arrow = '';

	if ( active ) {
		sort = filters.order === 'asc' ? 'ascending' : 'descending';
		arrow = filters.order === 'asc' ? '▲' : '▼';
	}

	return (
		<th scope="col" aria-sort={ sort }>
			<button type="button" className="quoteform_entries__sort" onClick={ () => onSort( column ) }>
				{ columnLabel( column ) }
				<span className="quoteform_entries__arrow" aria-hidden="true">
					{ arrow }
				</span>
			</button>
		</th>
	);
}

function NameEmail( { item } ) {
	if ( item.name === '' && item.email === '' ) {
		return <span className="quoteform_entries__none">—</span>;
	}

	return (
		<>
			{ item.name !== '' && <span className="quoteform_entries__name">{ item.name }</span> }
			{ item.email !== '' && (
				<a className="quoteform_entries__email" href={ `mailto:${ item.email }` }>
					{ item.email }
				</a>
			) }
		</>
	);
}

function FormCell( { item, formHref } ) {
	if ( item.form_title === null ) {
		return <em className="quoteform_entries__muted">{ __( '(deleted form)', 'quoteform' ) }</em>;
	}

	const href = formHref( item.form_id );

	return href ? <a href={ href }>{ item.form_title }</a> : <span>{ item.form_title }</span>;
}

function TotalCell( { item } ) {
	if ( item.total === null ) {
		return (
			<>
				<span aria-hidden="true">—</span>{ ' ' }
				<span className="quoteform_entries__muted">{ __( 'Calculation failed', 'quoteform' ) }</span>
			</>
		);
	}

	return item.total_display;
}

export default function EntriesTable( {
	items,
	filters,
	onSort,
	selected,
	onToggle,
	onToggleAll,
	entryHref,
	onOpen,
	formHref,
	canDelete,
	confirmingId,
	onAskDelete,
	onConfirmDelete,
	onCancelDelete,
	deleteButtonRef,
	busy,
} ) {
	const allSelected = items.length > 0 && items.every( ( item ) => selected.has( item.id ) );

	function open( event, id ) {
		if ( ! isPlainClick( event ) ) {
			return;
		}

		event.preventDefault();
		onOpen( id );
	}

	return (
		<div
			className="quoteform_entries__scroll"
			role="region"
			tabIndex={ 0 }
			aria-label={ __( 'Entries table', 'quoteform' ) }
		>
			<table className="quoteform_list__table quoteform_entries__table">
				<caption className="screen-reader-text">{ tableCaption( filters ) }</caption>
				<thead>
					<tr>
						<td className="quoteform_entries__check">
							<input
								type="checkbox"
								checked={ allSelected }
								onChange={ ( event ) => onToggleAll( event.target.checked ) }
								aria-label={ __( 'Select all entries on this page', 'quoteform' ) }
							/>
						</td>
						<th scope="col">{ __( 'Entry', 'quoteform' ) }</th>
						<th scope="col">{ __( 'Name / Email', 'quoteform' ) }</th>
						<th scope="col">{ __( 'Form', 'quoteform' ) }</th>
						<SortHeader column="total" filters={ filters } onSort={ onSort } />
						<SortHeader column="date" filters={ filters } onSort={ onSort } />
						<th scope="col">
							<span className="screen-reader-text">{ __( 'Actions', 'quoteform' ) }</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{ items.map( ( item ) => (
						<tr key={ item.id } className={ item.is_read ? undefined : 'quoteform_entries__row--unread' }>
							<td className="quoteform_entries__check">
								<input
									type="checkbox"
									checked={ selected.has( item.id ) }
									onChange={ () => onToggle( item.id ) }
									aria-label={ sprintf(
										/* translators: %d: entry number. */
										__( 'Select entry #%d', 'quoteform' ),
										item.id
									) }
								/>
							</td>
							<th scope="row">
								<a href={ entryHref( item.id ) } onClick={ ( event ) => open( event, item.id ) }>
									{ `#${ item.id }` }
								</a>
								{ ! item.is_read && (
									<span className="quoteform_entries__new">{ __( 'New', 'quoteform' ) }</span>
								) }
							</th>
							<td className="quoteform_entries__who">
								<NameEmail item={ item } />
							</td>
							<td>
								<FormCell item={ item } formHref={ formHref } />
							</td>
							<td className="quoteform_entries__total">
								<TotalCell item={ item } />
							</td>
							<td>
								<time dateTime={ item.date.iso } title={ item.date.full }>
									{ item.date.display }
								</time>
							</td>
							<td className="quoteform_list__actions">
								<a
									className="quoteform_button quoteform_button--secondary"
									href={ entryHref( item.id ) }
									onClick={ ( event ) => open( event, item.id ) }
									aria-label={ sprintf(
										/* translators: %d: entry number. */
										__( 'View entry #%d', 'quoteform' ),
										item.id
									) }
								>
									{ __( 'View', 'quoteform' ) }
								</a>
								{ canDelete && (
									<Button
										variant="danger"
										ref={ ( element ) => deleteButtonRef( item.id, element ) }
										onClick={ () => onAskDelete( item ) }
										disabled={ busy }
										aria-label={ sprintf(
											/* translators: %d: entry number. */
											__( 'Delete entry #%d', 'quoteform' ),
											item.id
										) }
									>
										{ __( 'Delete', 'quoteform' ) }
									</Button>
								) }
								{ confirmingId === item.id && (
									<RemoveConfirm
										message={ sprintf(
											/* translators: %d: entry number. */
											__( 'Delete entry #%d? This cannot be undone.', 'quoteform' ),
											item.id
										) }
										confirmLabel={ __( 'Delete permanently', 'quoteform' ) }
										cancelLabel={ __( 'Cancel', 'quoteform' ) }
										onConfirm={ () => onConfirmDelete( item ) }
										onCancel={ () => onCancelDelete( item ) }
									/>
								) }
							</td>
						</tr>
					) ) }
				</tbody>
			</table>
		</div>
	);
}
```

- [ ] **Step 5: Run the tests** — `npx jest tests/js/admin/EntriesTable.test.js tests/js/admin/entriesPagination.test.js` → PASS (EntriesTable 14, Pagination 8).

- [ ] **Step 6: Verify** — `npm test` → yaşıl; `npm run build` + `make buildcheck` → yaşıl (komponentlər hələ paketə qoşulmayıb — build dəyişmir).

---
### Task 10: Filtr zolağı və eksport linki — `FilterBar`

**Files:**
- Create: `admin-src/entries/FilterBar.js`
- Test: `tests/js/admin/FilterBar.test.js`

**Interfaces:**
- Consumes: `DEFAULT_FILTERS`, `DECIMAL_PATTERN`, `isCalendarDate`, `filterParams`, `filtersAreActive` (Task 1); `SelectControl`, `Button` (`components/`); `window.quoteformEntries.forms`, `hasDeletedForms`, `exportUrl` (Task 7).
- Produces:
  - `FilterBar( { forms: [ { id, title } ], hasDeletedForms: boolean, filters, onChange( nextFilters ) } )` — select və tarix dəyişikliyi **dərhal**; min/max mətn sahələri `DEBOUNCE_MS = 400` sonra, yalnız dəyər həqiqətən dəyişəndə (yazarkən hər hərfə sorğu getmir). Etibarsız məbləğ (`1e3`) sahədə qalır, `aria-invalid` + izah alır və filtr kimi göndərilmir. Xaricdən gələn dəyişiklik (Clear filters, "geri" düyməsi) sahələri yeniləyir; istifadəçinin öz yazdığı etibarsız mətn isə silinmir.
  - `exportHref( exportUrl, filters ) → string` — nonce-lu admin-post URL-inə cari filtrləri əlavə edir (siyahı ilə eyni `filterParams`).
  - "Clear filters" yalnız filtr aktivdirsə görünür; sıralamanı saxlayır.

- [ ] **Step 1: Write the failing test** — `tests/js/admin/FilterBar.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import FilterBar, { exportHref } from '../../../admin-src/entries/FilterBar';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

const forms = [
	{ id: 7, title: 'Cleaning quote' },
	{ id: 9, title: '' },
];

function Harness( { initial = DEFAULT_FILTERS, onChange, hasDeletedForms = false } ) {
	const [ filters, setFilters ] = useState( initial );

	return (
		<>
			<FilterBar
				forms={ forms }
				hasDeletedForms={ hasDeletedForms }
				filters={ filters }
				onChange={ ( next ) => {
					onChange( next );
					setFilters( next );
				} }
			/>
			<button type="button" onClick={ () => setFilters( { ...DEFAULT_FILTERS, orderby: 'total' } ) }>
				external reset
			</button>
		</>
	);
}

beforeEach( () => {
	jest.useFakeTimers();
} );

afterEach( () => {
	jest.useRealTimers();
} );

function user() {
	return userEvent.setup( { advanceTimers: jest.advanceTimersByTime } );
}

describe( 'FilterBar', () => {
	it( 'applies a form, status or date at once', async () => {
		const onChange = jest.fn();
		const u = user();

		render( <Harness onChange={ onChange } /> );

		await u.selectOptions( screen.getByRole( 'combobox', { name: 'Form' } ), '7' );
		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, form: 7 } );

		await u.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'new' );
		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, form: 7, status: 'new' } );

		// Tarix sahəsinə hərf-hərf yazmaq jsdom-da etibarlı deyil; brauzer kimi tam dəyəri bir dəfəyə veririk.
		fireEvent.change( screen.getByLabelText( 'From' ), { target: { value: '2026-09-01' } } );
		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, form: 7, status: 'new', from: '2026-09-01' } );
	} );

	it( 'names an untitled form by its number and offers deleted forms only when they have entries', () => {
		const { unmount } = render( <Harness onChange={ jest.fn() } /> );

		expect( screen.getByRole( 'option', { name: 'Form #9' } ) ).toBeInTheDocument();
		expect( screen.queryByRole( 'option', { name: 'Deleted forms' } ) ).not.toBeInTheDocument();

		unmount();
		render( <Harness onChange={ jest.fn() } hasDeletedForms /> );

		expect( screen.getByRole( 'option', { name: 'Deleted forms' } ).value ).toBe( 'deleted' );
	} );

	it( 'waits until typing stops before filtering by total, and sends one change', async () => {
		const onChange = jest.fn();
		const u = user();

		render( <Harness onChange={ onChange } /> );

		await u.type( screen.getByLabelText( 'Minimum total' ), '150' );
		expect( onChange ).not.toHaveBeenCalled();

		act( () => {
			jest.advanceTimersByTime( 400 );
		} );

		expect( onChange ).toHaveBeenCalledTimes( 1 );
		expect( onChange ).toHaveBeenCalledWith( { ...DEFAULT_FILTERS, min: '150' } );
	} );

	it( 'keeps an unusable total in the box, flags it and does not filter by it', async () => {
		const onChange = jest.fn();
		const u = user();

		render( <Harness onChange={ onChange } initial={ { ...DEFAULT_FILTERS, max: '90' } } /> );

		const max = screen.getByLabelText( 'Maximum total' );

		await u.clear( max );
		await u.type( max, '1e3' );
		act( () => {
			jest.advanceTimersByTime( 400 );
		} );

		expect( max ).toHaveValue( '1e3' );
		expect( max ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( max ).toHaveAccessibleDescription( 'Use a plain number, like 150 or 99.50.' );
		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, max: null } );
	} );

	it( 'follows filters changed from outside', async () => {
		const u = user();

		render( <Harness onChange={ jest.fn() } initial={ { ...DEFAULT_FILTERS, min: '10', status: 'read' } } /> );

		expect( screen.getByLabelText( 'Minimum total' ) ).toHaveValue( '10' );

		await u.click( screen.getByRole( 'button', { name: 'external reset' } ) );

		expect( screen.getByLabelText( 'Minimum total' ) ).toHaveValue( '' );
		expect( screen.getByRole( 'combobox', { name: 'Status' } ) ).toHaveValue( '' );
	} );

	it( 'clears filters but keeps the sort order', async () => {
		const onChange = jest.fn();
		const u = user();

		render( <Harness onChange={ onChange } initial={ { ...DEFAULT_FILTERS, status: 'new', orderby: 'total', order: 'asc' } } /> );

		await u.click( screen.getByRole( 'button', { name: 'Clear filters' } ) );

		expect( onChange ).toHaveBeenLastCalledWith( { ...DEFAULT_FILTERS, orderby: 'total', order: 'asc' } );
		expect( screen.queryByRole( 'button', { name: 'Clear filters' } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'exportHref', () => {
	const base = 'http://example.test/wp-admin/admin-post.php?action=qform_export_entries&_wpnonce=abc123';

	it( 'adds the current filters to the signed export link', () => {
		const href = exportHref( base, { ...DEFAULT_FILTERS, form: 7, status: 'new', orderby: 'total' } );
		const url = new URL( href );

		expect( url.searchParams.get( '_wpnonce' ) ).toBe( 'abc123' );
		expect( url.searchParams.get( 'action' ) ).toBe( 'qform_export_entries' );
		expect( url.searchParams.get( 'form' ) ).toBe( '7' );
		expect( url.searchParams.get( 'status' ) ).toBe( 'new' );
		expect( url.searchParams.get( 'orderby' ) ).toBe( 'total' );
		expect( href ).not.toContain( '&amp;' );
	} );

	it( 'leaves the link as it is with no filters', () => {
		expect( exportHref( base, DEFAULT_FILTERS ) ).toBe( base );
	} );
} );
```

- [ ] **Step 2: Run it to verify it fails** — `npx jest tests/js/admin/FilterBar.test.js` → FAIL (`Cannot find module …/FilterBar`).

- [ ] **Step 3: Create `admin-src/entries/FilterBar.js`:**

```js
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import SelectControl from '../components/SelectControl';
import {
	DECIMAL_PATTERN,
	DEFAULT_FILTERS,
	filterParams,
	filtersAreActive,
	isCalendarDate,
} from './filters';

export const DEBOUNCE_MS = 400;

export function exportHref( exportUrl, filters ) {
	const params = filterParams( filters );
	const keys = Object.keys( params );

	if ( keys.length === 0 ) {
		return exportUrl;
	}

	const url = new URL( exportUrl, window.location.href );

	keys.forEach( ( key ) => url.searchParams.set( key, params[ key ] ) );

	return url.toString();
}

/**
 * Məbləğ sahəsinin qaralaması. `ownRef` bu sahənin sonuncu göndərdiyi (və ya qəbul etdiyi)
 * dəyəridir: xaricdən FƏRQLİ dəyər gələndə (Clear filters, "geri") qaralama yenilənir, öz
 * göndərdiyi dəyər qayıdanda isə yox — ona görə istifadəçinin yazdığı etibarsız "1e" silinmir.
 */
function useDecimalDraft( value, commit ) {
	const [ draft, setDraft ] = useState( value ?? '' );
	const ownRef = useRef( value );
	const commitRef = useRef( commit );

	commitRef.current = commit;

	useEffect( () => {
		if ( value !== ownRef.current ) {
			ownRef.current = value;
			setDraft( value ?? '' );
		}
	}, [ value ] );

	useEffect( () => {
		const timer = window.setTimeout( () => {
			const next = DECIMAL_PATTERN.test( draft ) ? draft : null;

			if ( next !== ownRef.current ) {
				ownRef.current = next;
				commitRef.current( next );
			}
		}, DEBOUNCE_MS );

		return () => window.clearTimeout( timer );
	}, [ draft ] );

	return [ draft, setDraft, draft !== '' && ! DECIMAL_PATTERN.test( draft ) ];
}

function DecimalField( { id, label, draft, setDraft, invalid } ) {
	const hintId = `${ id }-hint`;

	return (
		<div className="quoteform_control">
			<label htmlFor={ id }>{ label }</label>
			<input
				id={ id }
				type="text"
				inputMode="decimal"
				value={ draft }
				onChange={ ( event ) => setDraft( event.target.value ) }
				aria-invalid={ invalid ? 'true' : undefined }
				aria-describedby={ invalid ? hintId : undefined }
			/>
			{ invalid && (
				<p className="quoteform_help" id={ hintId }>
					{ __( 'Use a plain number, like 150 or 99.50.', 'quoteform' ) }
				</p>
			) }
		</div>
	);
}

export default function FilterBar( { forms, hasDeletedForms, filters, onChange } ) {
	const latest = useRef( { filters, onChange } );

	latest.current = { filters, onChange };

	function update( patch ) {
		latest.current.onChange( { ...latest.current.filters, ...patch } );
	}

	const [ minDraft, setMinDraft, minInvalid ] = useDecimalDraft( filters.min, ( min ) => update( { min } ) );
	const [ maxDraft, setMaxDraft, maxInvalid ] = useDecimalDraft( filters.max, ( max ) => update( { max } ) );

	const formOptions = [
		{ value: '', label: __( 'All forms', 'quoteform' ) },
		...forms.map( ( form ) => ( {
			value: String( form.id ),
			label:
				form.title !== ''
					? form.title
					: sprintf(
							/* translators: %d: form id. */
							__( 'Form #%d', 'quoteform' ),
							form.id
					  ),
		} ) ),
		...( hasDeletedForms ? [ { value: 'deleted', label: __( 'Deleted forms', 'quoteform' ) } ] : [] ),
	];

	function changeForm( value ) {
		let form = null;

		if ( value === 'deleted' ) {
			form = 'deleted';
		} else if ( value !== '' ) {
			form = Number( value );
		}

		update( { form } );
	}

	function changeDate( key, value ) {
		update( { [ key ]: isCalendarDate( value ) ? value : null } );
	}

	return (
		<div className="quoteform_entries__filters" role="group" aria-label={ __( 'Filter entries', 'quoteform' ) }>
			<SelectControl
				id="quoteform_entries-form"
				label={ __( 'Form', 'quoteform' ) }
				value={ filters.form === null ? '' : String( filters.form ) }
				options={ formOptions }
				onChange={ changeForm }
			/>
			<SelectControl
				id="quoteform_entries-status"
				label={ __( 'Status', 'quoteform' ) }
				value={ filters.status === null ? '' : filters.status }
				options={ [
					{ value: '', label: __( 'All', 'quoteform' ) },
					{ value: 'new', label: __( 'New', 'quoteform' ) },
					{ value: 'read', label: __( 'Read', 'quoteform' ) },
				] }
				onChange={ ( value ) => update( { status: value === '' ? null : value } ) }
			/>
			<div className="quoteform_control">
				<label htmlFor="quoteform_entries-from">{ __( 'From', 'quoteform' ) }</label>
				<input
					id="quoteform_entries-from"
					type="date"
					value={ filters.from ?? '' }
					onChange={ ( event ) => changeDate( 'from', event.target.value ) }
				/>
			</div>
			<div className="quoteform_control">
				<label htmlFor="quoteform_entries-to">{ __( 'To', 'quoteform' ) }</label>
				<input
					id="quoteform_entries-to"
					type="date"
					value={ filters.to ?? '' }
					onChange={ ( event ) => changeDate( 'to', event.target.value ) }
				/>
			</div>
			<DecimalField
				id="quoteform_entries-min"
				label={ __( 'Minimum total', 'quoteform' ) }
				draft={ minDraft }
				setDraft={ setMinDraft }
				invalid={ minInvalid }
			/>
			<DecimalField
				id="quoteform_entries-max"
				label={ __( 'Maximum total', 'quoteform' ) }
				draft={ maxDraft }
				setDraft={ setMaxDraft }
				invalid={ maxInvalid }
			/>
			{ filtersAreActive( filters ) && (
				<Button
					onClick={ () => onChange( { ...DEFAULT_FILTERS, orderby: filters.orderby, order: filters.order } ) }
				>
					{ __( 'Clear filters', 'quoteform' ) }
				</Button>
			) }
		</div>
	);
}
```

- [ ] **Step 4: Run the test** — `npx jest tests/js/admin/FilterBar.test.js` → PASS (8). "keeps an unusable total" düşürsə, `useDecimalDraft`-in xarici sinxronlaşması öz göndərdiyi `null`-u "xarici dəyişiklik" sayıb qaralamanı silir — `ownRef` commit-dən ƏVVƏL yenilənməlidir.

- [ ] **Step 5: Verify** — `npm test` → yaşıl; `npm run build` + `make buildcheck` → yaşıl.

---
### Task 11: Siyahı ekranı — `BulkBar` + `EntriesListScreen`

**Files:**
- Create: `admin-src/entries/BulkBar.js`
- Create: `admin-src/entries/EntriesListScreen.js`
- Test: `tests/js/admin/BulkBar.test.js`, `tests/js/admin/EntriesListScreen.test.js`

**Interfaces:**
- Consumes: `listEntries`, `updateEntries`, `deleteEntry`, `ApiError` (Task 8); `EntriesTable`, `Pagination` (Task 9); `FilterBar`, `exportHref` (Task 10); `DEFAULT_FILTERS`, `filterParams`, `filtersAreActive` (Task 1); `buildSearch` (Task 8); `updateMenuBadge`, `formatCount` (Task 8); `entryErrorMessage` (Task 8); `Button`, `Card`, `Notice` (`live={ false }`), `RemoveConfirm`; `shortcodeFor` (`lib/shortcode.js`).
- Produces:
  - `BulkBar( { count, canDelete, busy, onRead(), onUnread(), onDelete() } )` — `count === 0` → heç nə; silmə `RemoveConfirm` ilə ("Delete permanently"); ləğv fokusu Delete düyməsinə qaytarır; seçim sayı dəyişəndə açıq təsdiq bağlanır (köhnə sayla silmək olmaz).
  - `batchMessage( action, affected ) → string` ("3 entries deleted." / "… marked as read." / "… marked as unread.").
  - `EntriesListScreen( { config, filters, paged, onChange( { filters?, paged? } ), onOpen( id ), announce( message, options ), focusOnMount = false, onUnread = updateMenuBadge } )` — router (Task 13) `onChange`-i `replaceState` ilə, `onOpen`-u `pushState` ilə bağlayır.
- Davranış (hamısı testlidir):
  - Hər yükləmə `listEntries( { ...filterParams( filters ), page: paged, per_page: perPage } )`. **Köhnə cavab yenisini əvəz etmir** (effekt təmizlənəndə cavab atılır). Hər yükləmədən sonra seçim və açıq təsdiq sıfırlanır — toplu əməliyyat yalnız ekranda görünən sətirlərə gedir.
  - Server səhifəni sıxıbsa (`result.page !== paged`) → `onChange( { paged: result.page } )`.
  - `onUnread( result.unread )` hər yükləmədə və hər yazma əməliyyatından sonra.
  - Filtr dəyişəndə `paged: 1` və nəticə sayı elan olunur ("3 entries found."); səhifə dəyişəndə, toplu əməliyyatdan və silmədən sonra fokus `h1`-ə; xəta `announce( msg, { force: true } )` + `Notice live={ false }`.
  - Səhifə ölçüsü `per_page` kimi göndərilir (server user meta-ya yazır), `paged` 1-ə qayıdır.
  - Boş hallar: filtr yoxdursa — izah + shortcode ipucu; filtr varsa — "No entries match these filters." + Clear filters.

- [ ] **Step 1: Write the failing BulkBar test** — `tests/js/admin/BulkBar.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BulkBar from '../../../admin-src/entries/BulkBar';

function setup( props = {} ) {
	const handlers = { onRead: jest.fn(), onUnread: jest.fn(), onDelete: jest.fn() };
	const view = render( <BulkBar count={ 3 } canDelete busy={ false } { ...handlers } { ...props } /> );

	return { ...handlers, ...view };
}

describe( 'BulkBar', () => {
	it( 'is absent when nothing is selected', () => {
		setup( { count: 0 } );

		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
	} );

	it( 'says how many are selected and marks them', async () => {
		const { onRead, onUnread } = setup();
		const user = userEvent.setup();

		expect( screen.getByRole( 'group', { name: 'Bulk actions' } ) ).toHaveTextContent( '3 selected' );

		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as unread' } ) );

		expect( onRead ).toHaveBeenCalledTimes( 1 );
		expect( onUnread ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'asks before deleting and gives focus back when cancelled', async () => {
		const { onDelete } = setup();
		const user = userEvent.setup();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );

		expect( screen.getByText( 'Delete 3 entries? This cannot be undone.' ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Delete permanently' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );

		expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toHaveFocus();
		expect( onDelete ).not.toHaveBeenCalled();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( onDelete ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'closes an open confirmation when the selection changes', async () => {
		const { rerender, onRead, onUnread, onDelete } = setup();
		const user = userEvent.setup();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		rerender( <BulkBar count={ 4 } canDelete busy={ false } onRead={ onRead } onUnread={ onUnread } onDelete={ onDelete } /> );

		expect( screen.queryByRole( 'button', { name: 'Delete permanently' } ) ).not.toBeInTheDocument();
	} );

	it( 'offers no Delete to someone who may only read', () => {
		setup( { canDelete: false } );

		expect( screen.queryByRole( 'button', { name: 'Delete' } ) ).not.toBeInTheDocument();
	} );
} );
```

- [ ] **Step 2: Write the failing list-screen test** — `tests/js/admin/EntriesListScreen.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { ApiError, deleteEntry, listEntries, updateEntries } from '../../../admin-src/api/client';
import EntriesListScreen from '../../../admin-src/entries/EntriesListScreen';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listEntries: jest.fn(),
	getEntry: jest.fn(),
	updateEntries: jest.fn(),
	deleteEntry: jest.fn(),
} ) );

const config = {
	perPage: 20,
	canDelete: true,
	canManageForms: true,
	canExport: true,
	exportUrl: 'http://example.test/wp-admin/admin-post.php?action=qform_export_entries&_wpnonce=abc',
	builderUrl: 'http://example.test/wp-admin/admin.php?page=quoteform',
	forms: [ { id: 7, title: 'Cleaning quote' } ],
	hasDeletedForms: false,
};

function item( id, extra = {} ) {
	return {
		id,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: false,
		name: `Person ${ id }`,
		email: `p${ id }@example.com`,
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25, 2026', full: '2026-09-25 01:30:00', iso: '2026-09-24T21:30:00Z' },
		...extra,
	};
}

function result( items, extra = {} ) {
	return { items, total: items.length, pages: 1, page: 1, per_page: 20, unread: 2, ...extra };
}

function Harness( { initialFilters = DEFAULT_FILTERS, initialPaged = 1, onChangeSpy = jest.fn(), announce = jest.fn(), onUnread = jest.fn(), screenConfig = config } ) {
	const [ state, setState ] = useState( { filters: initialFilters, paged: initialPaged } );

	return (
		<EntriesListScreen
			config={ screenConfig }
			filters={ state.filters }
			paged={ state.paged }
			onChange={ ( patch ) => {
				onChangeSpy( patch );
				setState( ( current ) => ( { ...current, ...patch } ) );
			} }
			onOpen={ jest.fn() }
			announce={ announce }
			onUnread={ onUnread }
		/>
	);
}

function deferred() {
	let resolve;
	const promise = new Promise( ( done ) => {
		resolve = done;
	} );

	return { promise, resolve };
}

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'loading the list', () => {
	it( 'asks for the current filters, page and page size and shows the rows', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ), item( 40 ) ] ) );
		const onUnread = jest.fn();

		render( <Harness initialFilters={ { ...DEFAULT_FILTERS, status: 'new' } } initialPaged={ 1 } onUnread={ onUnread } /> );

		expect( await screen.findByText( 'Person 41' ) ).toBeInTheDocument();
		expect( listEntries ).toHaveBeenCalledWith( { status: 'new', page: 1, per_page: 20 } );
		expect( screen.getByText( '2 entries' ) ).toBeInTheDocument();
		expect( onUnread ).toHaveBeenCalledWith( 2 );
	} );

	it( 'never lets a slow earlier answer replace a newer one', async () => {
		const slow = deferred();

		listEntries
			.mockImplementationOnce( () => slow.promise )
			.mockImplementationOnce( () => Promise.resolve( result( [ item( 2, { name: 'Fresh' } ) ] ) ) );

		const props = { config, paged: 1, onChange: jest.fn(), onOpen: jest.fn(), announce: jest.fn(), onUnread: jest.fn() };
		const { rerender } = render( <EntriesListScreen { ...props } filters={ DEFAULT_FILTERS } /> );

		rerender( <EntriesListScreen { ...props } filters={ { ...DEFAULT_FILTERS, status: 'new' } } /> );
		expect( await screen.findByText( 'Fresh' ) ).toBeInTheDocument();

		await act( async () => {
			slow.resolve( result( [ item( 1, { name: 'Stale' } ) ] ) );
		} );

		expect( screen.queryByText( 'Stale' ) ).not.toBeInTheDocument();
		expect( screen.getByText( 'Fresh' ) ).toBeInTheDocument();
	} );

	it( 'moves to the last page the server has when the asked page is gone', async () => {
		listEntries.mockImplementation( ( { page } ) => Promise.resolve( result( [ item( page ) ], { page: 2, pages: 2, total: 21 } ) ) );
		const onChangeSpy = jest.fn();

		render( <Harness initialPaged={ 5 } onChangeSpy={ onChangeSpy } /> );

		await waitFor( () => expect( onChangeSpy ).toHaveBeenCalledWith( { paged: 2 } ) );
	} );

	it( 'shows a plain error, announces it and can try again', async () => {
		listEntries.mockRejectedValueOnce( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) );
		listEntries.mockResolvedValueOnce( result( [ item( 41 ) ] ) );
		const announce = jest.fn();
		const user = userEvent.setup();

		const { container } = render( <Harness announce={ announce } /> );

		expect( await screen.findByText( 'You appear to be offline.' ) ).toBeInTheDocument();
		expect( announce ).toHaveBeenCalledWith( 'You appear to be offline.', { force: true } );
		expect( container.querySelector( '[role="alert"], [role="status"], [aria-live]' ) ).toBeNull();

		await user.click( screen.getByRole( 'button', { name: 'Try again' } ) );

		expect( await screen.findByText( 'Person 41' ) ).toBeInTheDocument();
	} );
} );

describe( 'empty states', () => {
	it( 'explains where entries come from when there are none at all', async () => {
		listEntries.mockResolvedValue( result( [] ) );

		render( <Harness /> );

		expect( await screen.findByText( 'No entries yet. They appear here when visitors send one of your forms.' ) ).toBeInTheDocument();
		expect( screen.getByText( /\[quoteform id="7"\]/ ) ).toBeInTheDocument();
	} );

	it( 'offers to clear filters when nothing matches', async () => {
		listEntries.mockResolvedValue( result( [] ) );
		const onChangeSpy = jest.fn();
		const user = userEvent.setup();

		render( <Harness initialFilters={ { ...DEFAULT_FILTERS, status: 'new', order: 'asc' } } onChangeSpy={ onChangeSpy } /> );

		const card = ( await screen.findByText( 'No entries match these filters.' ) ).closest( '.quoteform_card' );

		await user.click( within( card ).getByRole( 'button', { name: 'Clear filters' } ) );

		expect( onChangeSpy ).toHaveBeenCalledWith( { filters: { ...DEFAULT_FILTERS, order: 'asc' }, paged: 1 } );
	} );
} );

describe( 'sorting, pages and filters', () => {
	it( 'flips the order of the active column and starts other columns highest first', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		const onChangeSpy = jest.fn();
		const user = userEvent.setup();

		render( <Harness onChangeSpy={ onChangeSpy } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'button', { name: 'Date' } ) );
		expect( onChangeSpy ).toHaveBeenLastCalledWith( { filters: { ...DEFAULT_FILTERS, order: 'asc' }, paged: 1 } );

		await user.click( screen.getByRole( 'button', { name: 'Total' } ) );
		expect( onChangeSpy ).toHaveBeenLastCalledWith( { filters: { ...DEFAULT_FILTERS, orderby: 'total', order: 'desc' }, paged: 1 } );
	} );

	it( 'moves focus to the heading after a page change', async () => {
		listEntries.mockImplementation( ( { page } ) =>
			Promise.resolve( result( [ item( page * 100 ) ], { page, pages: 3, total: 50 } ) )
		);
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 100' );

		await user.click( screen.getByRole( 'button', { name: 'Page 2 of 3' } ) );

		expect( await screen.findByText( 'Person 200' ) ).toBeInTheDocument();
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );
	} );

	it( 'sends a new page size and starts again from page one', async () => {
		listEntries.mockImplementation( ( { page } ) => Promise.resolve( result( [ item( 41 ) ], { page, pages: 3, total: 50 } ) ) );
		const user = userEvent.setup();

		render( <Harness initialPaged={ 2 } /> );
		await screen.findByText( 'Person 41' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Per page' } ), '50' );

		await waitFor( () => expect( listEntries ).toHaveBeenLastCalledWith( { page: 1, per_page: 50 } ) );
	} );

	it( 'says how many entries a filter found', async () => {
		listEntries.mockResolvedValueOnce( result( [ item( 41 ), item( 40 ) ] ) ).mockResolvedValueOnce( result( [ item( 41 ) ] ) );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 40' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'new' );

		await waitFor( () => expect( announce ).toHaveBeenCalledWith( '1 entry found.' ) );
	} );

	it( 'links the export to the filters on screen', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );

		render( <Harness initialFilters={ { ...DEFAULT_FILTERS, status: 'read' } } /> );
		await screen.findByText( 'Person 41' );

		const href = screen.getByRole( 'link', { name: 'Export CSV' } ).getAttribute( 'href' );

		expect( href ).toContain( '_wpnonce=abc' );
		expect( href ).toContain( 'status=read' );
	} );

	it( 'hides export and delete from someone without those rights', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );

		render( <Harness screenConfig={ { ...config, canDelete: false, canExport: false, canManageForms: false } } /> );
		await screen.findByText( 'Person 41' );

		expect( screen.queryByRole( 'link', { name: 'Export CSV' } ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'button', { name: 'Delete entry #41' } ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'link', { name: 'Cleaning quote' } ) ).not.toBeInTheDocument();
	} );
} );

describe( 'acting on entries', () => {
	it( 'marks the selected entries, announces it, reloads and focuses the heading', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ), item( 40 ) ] ) );
		updateEntries.mockResolvedValue( { affected: 2, unread: 0 } );
		const announce = jest.fn();
		const onUnread = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } onUnread={ onUnread } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		expect( updateEntries ).toHaveBeenCalledWith( 'read', [ 41, 40 ] );
		expect( announce ).toHaveBeenCalledWith( '2 entries marked as read.', { force: true } );
		expect( onUnread ).toHaveBeenCalledWith( 0 );

		await waitFor( () => expect( listEntries ).toHaveBeenCalledTimes( 2 ) );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );
		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
	} );

	it( 'forgets the selection whenever the list changes, so a bulk delete cannot reach hidden rows', async () => {
		listEntries.mockResolvedValueOnce( result( [ item( 41 ), item( 40 ) ] ) ).mockResolvedValueOnce( result( [ item( 40 ) ] ) );
		const user = userEvent.setup();

		render( <Harness /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		expect( screen.getByRole( 'group', { name: 'Bulk actions' } ) ).toHaveTextContent( '1 selected' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'read' );
		await waitFor( () => expect( screen.queryByText( 'Person 41' ) ).not.toBeInTheDocument() );

		expect( screen.queryByRole( 'group', { name: 'Bulk actions' } ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #40' } ) ).not.toBeChecked();
	} );

	it( 'deletes the selection only after confirmation', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ), item( 40 ) ] ) );
		updateEntries.mockResolvedValue( { affected: 1, unread: 1 } );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select all entries on this page' } ) );
		await user.click( within( screen.getByRole( 'group', { name: 'Bulk actions' } ) ).getByRole( 'button', { name: 'Delete' } ) );

		expect( updateEntries ).not.toHaveBeenCalled();

		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( updateEntries ).toHaveBeenCalledWith( 'delete', [ 41, 40 ] );
		expect( announce ).toHaveBeenCalledWith( '1 entry deleted.', { force: true } );
	} );

	it( 'deletes one row after confirmation and returns focus on cancel', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		deleteEntry.mockResolvedValue( { id: 41, deleted: true, unread: 0 } );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'button', { name: 'Delete entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );

		expect( screen.getByRole( 'button', { name: 'Delete entry #41' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Delete entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( deleteEntry ).toHaveBeenCalledWith( 41 );
		expect( announce ).toHaveBeenCalledWith( 'Entry #41 deleted.', { force: true } );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );
	} );

	it( 'keeps the selection and says so when a bulk action fails', async () => {
		listEntries.mockResolvedValue( result( [ item( 41 ) ] ) );
		updateEntries.mockRejectedValue( new ApiError( { code: 'rest_forbidden', status: 403, message: 'no' } ) );
		const announce = jest.fn();
		const user = userEvent.setup();

		render( <Harness announce={ announce } /> );
		await screen.findByText( 'Person 41' );

		await user.click( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Mark as read' } ) );

		const message = 'You are no longer allowed to see entries. Reload the page and sign in again.';

		expect( await screen.findByText( message ) ).toBeInTheDocument();
		expect( announce ).toHaveBeenCalledWith( message, { force: true } );
		expect( screen.getByRole( 'checkbox', { name: 'Select entry #41' } ) ).toBeChecked();
	} );
} );
```

- [ ] **Step 3: Run them to verify they fail** — `npx jest tests/js/admin/BulkBar.test.js tests/js/admin/EntriesListScreen.test.js` → FAIL (`Cannot find module …/BulkBar`).

- [ ] **Step 4: Create `admin-src/entries/BulkBar.js`:**

```js
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import Button from '../components/Button';
import RemoveConfirm from '../components/RemoveConfirm';

export default function BulkBar( { count, canDelete, busy, onRead, onUnread, onDelete } ) {
	const [ confirming, setConfirming ] = useState( false );
	const deleteRef = useRef( null );

	// Təsdiq açıq ikən seçim dəyişibsə, köhnə saylı sual cavablandırılmamalıdır.
	useEffect( () => {
		setConfirming( false );
	}, [ count ] );

	if ( count === 0 ) {
		return null;
	}

	return (
		<div className="quoteform_entries__bulk" role="group" aria-label={ __( 'Bulk actions', 'quoteform' ) }>
			<span className="quoteform_entries__selected">
				{ sprintf(
					/* translators: %d: number of selected entries. */
					_n( '%d selected', '%d selected', count, 'quoteform' ),
					count
				) }
			</span>
			<Button onClick={ onRead } disabled={ busy }>
				{ __( 'Mark as read', 'quoteform' ) }
			</Button>
			<Button onClick={ onUnread } disabled={ busy }>
				{ __( 'Mark as unread', 'quoteform' ) }
			</Button>
			{ canDelete && (
				<Button variant="danger" ref={ deleteRef } onClick={ () => setConfirming( true ) } disabled={ busy }>
					{ __( 'Delete', 'quoteform' ) }
				</Button>
			) }
			{ confirming && (
				<RemoveConfirm
					message={ sprintf(
						/* translators: %d: number of selected entries. */
						_n( 'Delete %d entry? This cannot be undone.', 'Delete %d entries? This cannot be undone.', count, 'quoteform' ),
						count
					) }
					confirmLabel={ __( 'Delete permanently', 'quoteform' ) }
					cancelLabel={ __( 'Cancel', 'quoteform' ) }
					onConfirm={ () => {
						setConfirming( false );
						onDelete();
					} }
					onCancel={ () => {
						setConfirming( false );
						deleteRef.current?.focus();
					} }
				/>
			) }
		</div>
	);
}
```

- [ ] **Step 5: Create `admin-src/entries/EntriesListScreen.js`:**

```js
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { deleteEntry, listEntries, updateEntries } from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import Notice from '../components/Notice';
import { shortcodeFor } from '../lib/shortcode';
import BulkBar from './BulkBar';
import EntriesTable from './EntriesTable';
import { entryErrorMessage } from './errors';
import FilterBar, { exportHref } from './FilterBar';
import { DEFAULT_FILTERS, filterParams, filtersAreActive } from './filters';
import { formatCount, updateMenuBadge } from './menuBadge';
import Pagination from './Pagination';
import { buildSearch } from './urlState';

export function batchMessage( action, affected ) {
	if ( action === 'delete' ) {
		/* translators: %d: number of entries. */
		return sprintf( _n( '%d entry deleted.', '%d entries deleted.', affected, 'quoteform' ), affected );
	}

	if ( action === 'unread' ) {
		/* translators: %d: number of entries. */
		return sprintf( _n( '%d entry marked as unread.', '%d entries marked as unread.', affected, 'quoteform' ), affected );
	}

	/* translators: %d: number of entries. */
	return sprintf( _n( '%d entry marked as read.', '%d entries marked as read.', affected, 'quoteform' ), affected );
}

export default function EntriesListScreen( {
	config,
	filters,
	paged,
	onChange,
	onOpen,
	announce,
	focusOnMount = false,
	onUnread = updateMenuBadge,
} ) {
	const [ data, setData ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ perPage, setPerPage ] = useState( config.perPage || 20 );
	const [ selected, setSelected ] = useState( () => new Set() );
	const [ busy, setBusy ] = useState( false );
	const [ confirmingId, setConfirmingId ] = useState( null );
	const [ reloadKey, setReloadKey ] = useState( 0 );

	const headingRef = useRef( null );
	const focusAfterLoadRef = useRef( false );
	const announceCountRef = useRef( false );
	const deleteRefs = useRef( {} );
	const pendingFocusRef = useRef( null );
	const latest = useRef( {} );

	latest.current = { onChange, onUnread, announce, paged };

	// Sabit asılılıq: filtr obyektinin şəxsiyyəti yox, dəyəri dəyişəndə yenidən yüklə.
	const filtersKey = JSON.stringify( filterParams( filters ) );
	const forms = Array.isArray( config.forms ) ? config.forms : [];

	useEffect( () => {
		if ( focusOnMount ) {
			headingRef.current?.focus();
		}
	}, [] ); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect( () => {
		// Effekt təmizlənəndə (yeni filtr/səhifə və ya ekran bağlananda) bu sorğunun
		// cavabı atılır: yavaş köhnə cavab yeni siyahının üstünə yazılmır.
		let current = true;

		setLoading( true );

		listEntries( { ...filterParams( filters ), page: paged, per_page: perPage } ).then(
			( result ) => {
				if ( ! current ) {
					return;
				}

				setData( result );
				setError( null );
				setSelected( new Set() );
				setConfirmingId( null );
				setLoading( false );
				latest.current.onUnread( result.unread );

				if ( result.page !== latest.current.paged ) {
					latest.current.onChange( { paged: result.page } );
				}

				if ( focusAfterLoadRef.current ) {
					focusAfterLoadRef.current = false;
					headingRef.current?.focus();
				}

				if ( announceCountRef.current ) {
					announceCountRef.current = false;
					latest.current.announce(
						/* translators: %d: number of entries. */
						sprintf( _n( '%d entry found.', '%d entries found.', result.total, 'quoteform' ), result.total )
					);
				}
			},
			( caught ) => {
				if ( ! current ) {
					return;
				}

				setError( caught );
				setLoading( false );
				latest.current.announce( entryErrorMessage( caught ), { force: true } );
			}
		);

		return () => {
			current = false;
		};
	}, [ filtersKey, paged, perPage, reloadKey ] ); // eslint-disable-line react-hooks/exhaustive-deps

	// `disabled` düymə fokus ala bilmir: fokus `busy` bitəndən SONRA qaytarılır.
	useEffect( () => {
		if ( ! busy && pendingFocusRef.current ) {
			pendingFocusRef.current();
			pendingFocusRef.current = null;
		}
	}, [ busy ] );

	function reload() {
		focusAfterLoadRef.current = true;
		setReloadKey( ( key ) => key + 1 );
	}

	function handleFilters( next ) {
		announceCountRef.current = true;
		onChange( { filters: next, paged: 1 } );
	}

	function handleSort( column ) {
		const order = filters.orderby === column && filters.order === 'desc' ? 'asc' : 'desc';

		onChange( { filters: { ...filters, orderby: column, order }, paged: 1 } );
	}

	function handlePage( page ) {
		if ( page === paged || page < 1 ) {
			return;
		}

		focusAfterLoadRef.current = true;
		onChange( { paged: page } );
	}

	function handlePerPage( value ) {
		setPerPage( value );

		if ( paged !== 1 ) {
			onChange( { paged: 1 } );
		}
	}

	function clearFilters() {
		handleFilters( { ...DEFAULT_FILTERS, orderby: filters.orderby, order: filters.order } );
	}

	function toggle( id ) {
		setSelected( ( current ) => {
			const next = new Set( current );

			if ( next.has( id ) ) {
				next.delete( id );
			} else {
				next.add( id );
			}

			return next;
		} );
	}

	function toggleAll( checked ) {
		setSelected( checked && data ? new Set( data.items.map( ( item ) => item.id ) ) : new Set() );
	}

	async function runBatch( action ) {
		const ids = Array.from( selected );

		if ( ids.length === 0 ) {
			return;
		}

		setBusy( true );

		try {
			const outcome = await updateEntries( action, ids );

			onUnread( outcome.unread );
			announce( batchMessage( action, outcome.affected ), { force: true } );
			reload();
		} catch ( caught ) {
			setError( caught );
			announce( entryErrorMessage( caught ), { force: true } );
		} finally {
			setBusy( false );
		}
	}

	function cancelDelete( item ) {
		setConfirmingId( null );
		deleteRefs.current[ item.id ]?.focus();
	}

	async function confirmDelete( item ) {
		setConfirmingId( null );
		setBusy( true );

		try {
			const outcome = await deleteEntry( item.id );

			onUnread( outcome.unread );
			/* translators: %d: entry number. */
			announce( sprintf( __( 'Entry #%d deleted.', 'quoteform' ), item.id ), { force: true } );
			reload();
		} catch ( caught ) {
			setError( caught );
			announce( entryErrorMessage( caught ), { force: true } );
			pendingFocusRef.current = () => deleteRefs.current[ item.id ]?.focus();
		} finally {
			setBusy( false );
		}
	}

	const formHref =
		config.canManageForms && config.builderUrl
			? ( formId ) => `${ config.builderUrl }&form=${ formId }`
			: () => null;

	return (
		<div className="quoteform_list quoteform_entries">
			<div className="quoteform_list__header">
				<div className="quoteform_entries__title">
					<h1 ref={ headingRef } tabIndex={ -1 }>
						{ __( 'Entries', 'quoteform' ) }
					</h1>
					{ data && (
						<span className="quoteform_entries__count">
							{ sprintf(
								/* translators: %s: number of entries. */
								_n( '%s entry', '%s entries', data.total, 'quoteform' ),
								formatCount( data.total )
							) }
						</span>
					) }
				</div>
				{ config.canExport && (
					<a
						className="quoteform_button quoteform_button--secondary"
						href={ exportHref( config.exportUrl, filters ) }
					>
						{ __( 'Export CSV', 'quoteform' ) }
					</a>
				) }
			</div>

			<FilterBar
				forms={ forms }
				hasDeletedForms={ !! config.hasDeletedForms }
				filters={ filters }
				onChange={ handleFilters }
			/>

			{ error && (
				<Notice status="error" live={ false } onDismiss={ () => setError( null ) }>
					{ entryErrorMessage( error ) }
				</Notice>
			) }

			{ error && ! data && (
				<Button onClick={ () => setReloadKey( ( key ) => key + 1 ) }>{ __( 'Try again', 'quoteform' ) }</Button>
			) }

			<BulkBar
				count={ selected.size }
				canDelete={ !! config.canDelete }
				busy={ busy }
				onRead={ () => runBatch( 'read' ) }
				onUnread={ () => runBatch( 'unread' ) }
				onDelete={ () => runBatch( 'delete' ) }
			/>

			{ loading && ! data && ! error && (
				<p className="quoteform_card quoteform_empty">{ __( 'Loading entries…', 'quoteform' ) }</p>
			) }

			{ data && data.items.length === 0 && filtersAreActive( filters ) && (
				<Card className="quoteform_empty">
					<p>{ __( 'No entries match these filters.', 'quoteform' ) }</p>
					<Button onClick={ clearFilters }>{ __( 'Clear filters', 'quoteform' ) }</Button>
				</Card>
			) }

			{ data && data.items.length === 0 && ! filtersAreActive( filters ) && (
				<Card className="quoteform_empty">
					<span className="dashicons dashicons-email-alt" aria-hidden="true" />
					<p>{ __( 'No entries yet. They appear here when visitors send one of your forms.', 'quoteform' ) }</p>
					{ forms.length > 0 && (
						<p>
							{ sprintf(
								/* translators: %s: a shortcode such as [quoteform id="12"]. */
								__( 'Put a form on a page with its shortcode, for example %s.', 'quoteform' ),
								shortcodeFor( forms[ 0 ].id )
							) }
						</p>
					) }
				</Card>
			) }

			{ data && data.items.length > 0 && (
				<Card aria-busy={ loading ? 'true' : undefined }>
					<EntriesTable
						items={ data.items }
						filters={ filters }
						onSort={ handleSort }
						selected={ selected }
						onToggle={ toggle }
						onToggleAll={ toggleAll }
						entryHref={ ( id ) => buildSearch( { filters, paged, entry: id } ) }
						onOpen={ onOpen }
						formHref={ formHref }
						canDelete={ !! config.canDelete }
						confirmingId={ confirmingId }
						onAskDelete={ ( item ) => setConfirmingId( item.id ) }
						onConfirmDelete={ confirmDelete }
						onCancelDelete={ cancelDelete }
						deleteButtonRef={ ( id, element ) => {
							deleteRefs.current[ id ] = element;
						} }
						busy={ busy }
					/>
				</Card>
			) }

			{ data && data.total > 0 && (
				<Pagination
					page={ data.page }
					pages={ data.pages }
					perPage={ perPage }
					onPage={ handlePage }
					onPerPage={ handlePerPage }
				/>
			) }
		</div>
	);
}
```

- [ ] **Step 6: Run the tests** — `npx jest tests/js/admin/BulkBar.test.js tests/js/admin/EntriesListScreen.test.js` → PASS (BulkBar 5, EntriesListScreen 17).

- [ ] **Step 7: Verify** — `npm test` → yaşıl; `npm run build` + `make buildcheck` → yaşıl.

---
### Task 12: Detal ekranı — `EntryDetailScreen`

**Files:**
- Create: `admin-src/entries/EntryDetailScreen.js`
- Test: `tests/js/admin/EntryDetailScreen.test.js`

**Interfaces:**
- Consumes: `getEntry`, `updateEntries`, `deleteEntry`, `ApiError` (Task 8); `filterParams` (Task 1); `isPlainClick` (Task 8); `entryErrorMessage`, `isNotFound` (Task 8); `updateMenuBadge` (Task 8); `Button`, `Card`, `Notice` (`live={ false }`), `RemoveConfirm`; REST `detail` forması (Task 4/5).
- Produces:
  - `EntryDetailScreen( { id, filters, config, backHref, onBack(), onNavigate( id ), onDeleted(), announce, focusOnMount = false, onUnread = updateMenuBadge } )` — router (Task 13) onu `key={ id }` ilə göstərir: Older/Newer yeni ekran kimi mount olur və fokus `h1`-ə gedir.
  - `neighbourLabels( filters ) → { previous: string, next: string }` — tarix, ən yeni əvvəl: `Newer entry` / `Older entry`; tarix, ən köhnə əvvəl: `Older entry` / `Newer entry`; total üzrə sıralamada `Previous entry` / `Next entry` (orada "köhnə/yeni" yanlış olardı).
- Davranış:
  - Yüklənmə `getEntry( id, filterParams( filters ) )` — qonşular cari filtr və sıralama daxilindədir; server açılanda oxunmuş edir, `onUnread( detail.unread )` menyu nişanını yeniləyir.
  - "Mark as unread" / "Mark as read" — `updateEntries( 'unread' | 'read', [ id ] )`, vəziyyət yerində dəyişir, **detal yenidən yüklənmir** (yenidən yükləmə onu dərhal təkrar oxunmuş edərdi); düymə eyni DOM elementidir və `disabled` edilmir — fokus yerində qalır.
  - Delete — `RemoveConfirm` → `deleteEntry( id )` → elan → `onDeleted()`; ləğv fokusu Delete-ə qaytarır.
  - 404 → "Entry not found." (+ yuxarıdakı "← Back to entries"); başqa xəta → `Notice live={ false }` + Try again, elan `{ force: true }`.
  - Answers: label → dəyər, boş dəyər `—`, çoxsətirli mətn `white-space: pre-wrap` sinfi ilə (CSS Task 13); label boşdursa açar göstərilir. Price breakdown: saxlanmış sətirlər + Total; `breakdown.error` varsa izah. Details: IP (varsa), brauzer, istifadəçi (profil linki varsa), göndərmə vaxtı.

- [ ] **Step 1: Write the failing test** — `tests/js/admin/EntryDetailScreen.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError, deleteEntry, getEntry, updateEntries } from '../../../admin-src/api/client';
import EntryDetailScreen, { neighbourLabels } from '../../../admin-src/entries/EntryDetailScreen';
import { DEFAULT_FILTERS } from '../../../admin-src/entries/filters';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listEntries: jest.fn(),
	getEntry: jest.fn(),
	updateEntries: jest.fn(),
	deleteEntry: jest.fn(),
} ) );

const config = { canDelete: true, canManageForms: true, builderUrl: 'http://example.test/wp-admin/admin.php?page=quoteform' };

function detail( extra = {} ) {
	return {
		id: 41,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: true,
		name: 'Jane',
		email: 'jane@example.com',
		total: '180.0000',
		total_display: '$180.00',
		date: { display: 'Sep 25, 2026 1:30 am', full: '2026-09-25 01:30:00 +04', iso: '2026-09-24T21:30:00Z' },
		answers: [
			{ key: 'name', label: 'Your name', type: 'text', display: '<b>Jane</b>' },
			{ key: 'extras', label: 'Extras', type: 'checkbox', display: 'Oven, Fridge' },
			{ key: 'agree', label: 'Agree', type: 'toggle', display: 'Yes' },
			{ key: 'notes', label: 'Notes', type: 'textarea', display: 'Line one\nLine two' },
			{ key: 'phone', label: 'Phone', type: 'tel', display: '' },
			{ key: 'source', label: '', type: 'hidden', display: 'google' },
		],
		breakdown: { lines: [ { key: 'base', label: 'Rooms', amount_display: '$120.00' }, { key: 'extra', label: 'Extras', amount_display: '' } ], error: null },
		details: {
			ip: '203.0.113.9',
			user_agent: 'Firefox/130',
			user: { id: 3, name: 'Sam', url: 'http://example.test/wp-admin/user-edit.php?user_id=3' },
			submitted: { display: 'Sep 25, 2026 1:30 am', full: '2026-09-25 01:30:00 +04', iso: '2026-09-24T21:30:00Z' },
		},
		neighbours: { previous: 42, next: 40 },
		unread: 4,
		...extra,
	};
}

function setup( props = {} ) {
	const handlers = {
		onBack: jest.fn(),
		onNavigate: jest.fn(),
		onDeleted: jest.fn(),
		announce: jest.fn(),
		onUnread: jest.fn(),
	};

	render(
		<EntryDetailScreen
			id={ 41 }
			filters={ DEFAULT_FILTERS }
			config={ config }
			backHref="?page=quoteform-entries"
			{ ...handlers }
			{ ...props }
		/>
	);

	return handlers;
}

function answer( label ) {
	return screen.getByText( label, { selector: 'dt' } ).nextElementSibling;
}

beforeEach( () => {
	jest.resetAllMocks();
} );

describe( 'EntryDetailScreen', () => {
	it( 'asks for the entry with the list filters and updates the menu badge', async () => {
		getEntry.mockResolvedValue( detail() );
		const { onUnread } = setup( { filters: { ...DEFAULT_FILTERS, status: 'new', orderby: 'total' } } );

		await screen.findByText( 'Answers' );

		expect( getEntry ).toHaveBeenCalledWith( 41, { status: 'new', orderby: 'total' } );
		expect( onUnread ).toHaveBeenCalledWith( 4 );
	} );

	it( 'shows every answer as plain text, with a dash for blanks and the key for unlabeled fields', async () => {
		getEntry.mockResolvedValue( detail() );
		setup();

		await screen.findByText( 'Answers' );

		expect( answer( 'Your name' ) ).toHaveTextContent( '<b>Jane</b>' );
		expect( answer( 'Your name' ).querySelector( 'b' ) ).toBeNull();
		expect( answer( 'Extras' ) ).toHaveTextContent( 'Oven, Fridge' );
		expect( answer( 'Agree' ) ).toHaveTextContent( 'Yes' );
		expect( answer( 'Notes' ).textContent ).toBe( 'Line one\nLine two' );
		expect( answer( 'Notes' ) ).toHaveClass( 'quoteform_entry__value' );
		expect( answer( 'Phone' ) ).toHaveTextContent( '—' );
		expect( answer( 'source' ) ).toHaveTextContent( 'google' );
	} );

	it( 'shows the stored price lines and the total', async () => {
		getEntry.mockResolvedValue( detail() );
		setup();

		const table = await screen.findByRole( 'table', { name: 'Price breakdown' } );

		expect( within( table ).getByRole( 'rowheader', { name: 'Rooms' } ).nextElementSibling ).toHaveTextContent( '$120.00' );
		expect( within( table ).getByRole( 'rowheader', { name: 'Extras' } ).nextElementSibling ).toHaveTextContent( '—' );
		expect( within( table ).getByRole( 'rowheader', { name: 'Total' } ).nextElementSibling ).toHaveTextContent( '$180.00' );
	} );

	it( 'explains a price that could not be worked out', async () => {
		getEntry.mockResolvedValue( detail( { total: null, total_display: '', breakdown: { lines: [], error: 'division_by_zero' } } ) );
		setup();

		expect( await screen.findByText( 'The price could not be worked out when this entry was sent (division_by_zero).' ) ).toBeInTheDocument();
		expect( within( screen.getByRole( 'table', { name: 'Price breakdown' } ) ).getByRole( 'rowheader', { name: 'Total' } ).nextElementSibling ).toHaveTextContent( '—' );
	} );

	it( 'lists the technical details and links the user profile', async () => {
		getEntry.mockResolvedValue( detail() );
		setup();

		await screen.findByText( 'Details' );

		expect( answer( 'IP address' ) ).toHaveTextContent( '203.0.113.9' );
		expect( answer( 'Browser' ) ).toHaveTextContent( 'Firefox/130' );
		expect( within( answer( 'User' ) ).getByRole( 'link', { name: 'Sam' } ) ).toHaveAttribute( 'href', 'http://example.test/wp-admin/user-edit.php?user_id=3' );
	} );

	it( 'leaves out an IP and a user that were not stored', async () => {
		getEntry.mockResolvedValue( detail( { details: { ip: null, user_agent: '', user: null, submitted: detail().details.submitted } } ) );
		setup();

		await screen.findByText( 'Details' );

		expect( screen.queryByText( 'IP address' ) ).not.toBeInTheDocument();
		expect( screen.queryByText( 'User' ) ).not.toBeInTheDocument();
		expect( answer( 'Browser' ) ).toHaveTextContent( '—' );
	} );

	it( 'steps to the neighbours and disables the arrow at the end of the list', async () => {
		getEntry.mockResolvedValue( detail( { neighbours: { previous: 42, next: null } } ) );
		const { onNavigate } = setup();
		const user = userEvent.setup();

		await screen.findByText( 'Answers' );

		expect( screen.getByRole( 'button', { name: 'Older entry' } ) ).toBeDisabled();

		await user.click( screen.getByRole( 'button', { name: 'Newer entry' } ) );

		expect( onNavigate ).toHaveBeenCalledWith( 42 );
	} );

	it( 'marks the entry unread in place, without reading it again', async () => {
		getEntry.mockResolvedValue( detail() );
		updateEntries.mockResolvedValue( { affected: 1, unread: 5 } );
		const { onUnread, announce } = setup();
		const user = userEvent.setup();

		await screen.findByText( 'Answers' );

		const toggle = screen.getByRole( 'button', { name: 'Mark as unread' } );

		await user.click( toggle );

		expect( updateEntries ).toHaveBeenCalledWith( 'unread', [ 41 ] );
		expect( await screen.findByRole( 'button', { name: 'Mark as read' } ) ).toBe( toggle );
		expect( toggle ).toHaveFocus();
		expect( screen.getByText( 'New', { selector: '.quoteform_entry__status' } ) ).toBeInTheDocument();
		expect( onUnread ).toHaveBeenLastCalledWith( 5 );
		expect( announce ).toHaveBeenCalledWith( 'Entry marked as unread.', { force: true } );
		expect( getEntry ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'deletes after confirmation and hands back to the list', async () => {
		getEntry.mockResolvedValue( detail() );
		deleteEntry.mockResolvedValue( { id: 41, deleted: true, unread: 3 } );
		const { onDeleted, onUnread, announce } = setup();
		const user = userEvent.setup();

		await screen.findByText( 'Answers' );

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );
		expect( screen.getByRole( 'button', { name: 'Delete' } ) ).toHaveFocus();

		await user.click( screen.getByRole( 'button', { name: 'Delete' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Delete permanently' } ) );

		expect( deleteEntry ).toHaveBeenCalledWith( 41 );
		expect( onUnread ).toHaveBeenLastCalledWith( 3 );
		expect( announce ).toHaveBeenCalledWith( 'Entry #41 deleted.', { force: true } );
		expect( onDeleted ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'offers no Delete to someone who may only read', async () => {
		getEntry.mockResolvedValue( detail() );
		setup( { config: { ...config, canDelete: false, canManageForms: false } } );

		await screen.findByText( 'Answers' );

		expect( screen.queryByRole( 'button', { name: 'Delete' } ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'link', { name: 'Cleaning quote' } ) ).not.toBeInTheDocument();
	} );

	it( 'says when the entry does not exist', async () => {
		getEntry.mockRejectedValue( new ApiError( { code: 'qform_entry_not_found', status: 404, message: 'Entry not found.' } ) );
		const { onBack } = setup();
		const user = userEvent.setup();

		expect( await screen.findByText( 'Entry not found.' ) ).toBeInTheDocument();

		await user.click( screen.getByRole( 'link', { name: '← Back to entries' } ) );

		expect( onBack ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'shows other failures quietly, announces them and retries', async () => {
		getEntry
			.mockRejectedValueOnce( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) )
			.mockResolvedValueOnce( detail() );
		const { announce } = setup();
		const user = userEvent.setup();

		expect( await screen.findByText( 'You appear to be offline.' ) ).toBeInTheDocument();
		expect( announce ).toHaveBeenCalledWith( 'You appear to be offline.', { force: true } );
		expect( document.querySelector( '[role="alert"]' ) ).toBeNull();

		await user.click( screen.getByRole( 'button', { name: 'Try again' } ) );

		expect( await screen.findByText( 'Answers' ) ).toBeInTheDocument();
	} );

	it( 'takes focus to its heading when opened from the list', async () => {
		getEntry.mockResolvedValue( detail() );
		setup( { focusOnMount: true } );

		expect( screen.getByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus();
		await screen.findByText( 'Answers' );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus() );
	} );
} );

describe( 'neighbourLabels', () => {
	it( 'names the arrows by what they mean in the current order', () => {
		expect( neighbourLabels( DEFAULT_FILTERS ) ).toEqual( { previous: 'Newer entry', next: 'Older entry' } );
		expect( neighbourLabels( { ...DEFAULT_FILTERS, order: 'asc' } ) ).toEqual( { previous: 'Older entry', next: 'Newer entry' } );
		expect( neighbourLabels( { ...DEFAULT_FILTERS, orderby: 'total' } ) ).toEqual( { previous: 'Previous entry', next: 'Next entry' } );
	} );
} );
```

- [ ] **Step 2: Run it to verify it fails** — `npx jest tests/js/admin/EntryDetailScreen.test.js` → FAIL (`Cannot find module …/EntryDetailScreen`).

- [ ] **Step 3: Create `admin-src/entries/EntryDetailScreen.js`:**

```js
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { deleteEntry, getEntry, updateEntries } from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import Notice from '../components/Notice';
import RemoveConfirm from '../components/RemoveConfirm';
import { entryErrorMessage, isNotFound } from './errors';
import { filterParams } from './filters';
import { updateMenuBadge } from './menuBadge';
import { isPlainClick } from './urlState';

export function neighbourLabels( filters ) {
	if ( filters.orderby !== 'date' ) {
		return { previous: __( 'Previous entry', 'quoteform' ), next: __( 'Next entry', 'quoteform' ) };
	}

	return filters.order === 'asc'
		? { previous: __( 'Older entry', 'quoteform' ), next: __( 'Newer entry', 'quoteform' ) }
		: { previous: __( 'Newer entry', 'quoteform' ), next: __( 'Older entry', 'quoteform' ) };
}

function Row( { label, children } ) {
	return (
		<div>
			<dt>{ label }</dt>
			<dd className="quoteform_entry__value">{ children }</dd>
		</div>
	);
}

function Answers( { answers } ) {
	return (
		<Card>
			<h2>{ __( 'Answers', 'quoteform' ) }</h2>
			{ answers.length === 0 ? (
				<p>{ __( 'No answers were saved with this entry.', 'quoteform' ) }</p>
			) : (
				<dl className="quoteform_entry__list">
					{ answers.map( ( item ) => (
						<Row key={ item.key } label={ item.label !== '' ? item.label : item.key }>
							{ item.display !== '' ? item.display : '—' }
						</Row>
					) ) }
				</dl>
			) }
		</Card>
	);
}

function Breakdown( { entry } ) {
	const { lines, error } = entry.breakdown;

	return (
		<Card>
			<h2>{ __( 'Price breakdown', 'quoteform' ) }</h2>
			{ error !== null && (
				<p className="quoteform_entry__error">
					{ sprintf(
						/* translators: %s: the calculation error code, e.g. division_by_zero. */
						__( 'The price could not be worked out when this entry was sent (%s).', 'quoteform' ),
						error
					) }
				</p>
			) }
			<table className="quoteform_entry__breakdown">
				<caption className="screen-reader-text">{ __( 'Price breakdown', 'quoteform' ) }</caption>
				<tbody>
					{ lines.map( ( line, index ) => (
						<tr key={ `${ line.key }-${ index }` }>
							<th scope="row">{ line.label !== '' ? line.label : line.key }</th>
							<td>{ line.amount_display !== '' ? line.amount_display : '—' }</td>
						</tr>
					) ) }
				</tbody>
				<tfoot>
					<tr>
						<th scope="row">{ __( 'Total', 'quoteform' ) }</th>
						<td>{ entry.total === null ? '—' : entry.total_display }</td>
					</tr>
				</tfoot>
			</table>
		</Card>
	);
}

function Details( { details } ) {
	return (
		<Card>
			<h2>{ __( 'Details', 'quoteform' ) }</h2>
			<dl className="quoteform_entry__list">
				{ details.ip !== null && <Row label={ __( 'IP address', 'quoteform' ) }>{ details.ip }</Row> }
				<Row label={ __( 'Browser', 'quoteform' ) }>{ details.user_agent !== '' ? details.user_agent : '—' }</Row>
				{ details.user !== null && (
					<Row label={ __( 'User', 'quoteform' ) }>
						{ details.user.url ? <a href={ details.user.url }>{ details.user.name }</a> : details.user.name }
					</Row>
				) }
				<Row label={ __( 'Submitted', 'quoteform' ) }>
					<time dateTime={ details.submitted.iso } title={ details.submitted.full }>
						{ details.submitted.display }
					</time>
				</Row>
			</dl>
		</Card>
	);
}

export default function EntryDetailScreen( {
	id,
	filters,
	config,
	backHref,
	onBack,
	onNavigate,
	onDeleted,
	announce,
	focusOnMount = false,
	onUnread = updateMenuBadge,
} ) {
	const [ entry, setEntry ] = useState( null );
	const [ error, setError ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ busy, setBusy ] = useState( false );
	const [ confirming, setConfirming ] = useState( false );
	const [ reloadKey, setReloadKey ] = useState( 0 );

	const headingRef = useRef( null );
	const deleteRef = useRef( null );
	const pendingFocusRef = useRef( null );
	const latest = useRef( {} );

	latest.current = { onUnread, announce, filters };

	// Başlıq bütün hallarda (yüklənir / tapılmadı / hazır) eyni yerdədir — fokus dərhal ona.
	useEffect( () => {
		if ( focusOnMount ) {
			headingRef.current?.focus();
		}
	}, [] ); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect( () => {
		let current = true;

		setLoading( true );

		getEntry( id, filterParams( latest.current.filters ) ).then(
			( result ) => {
				if ( ! current ) {
					return;
				}

				setEntry( result );
				setError( null );
				setLoading( false );
				latest.current.onUnread( result.unread );
			},
			( caught ) => {
				if ( ! current ) {
					return;
				}

				setEntry( null );
				setError( caught );
				setLoading( false );
				latest.current.announce( entryErrorMessage( caught ), { force: true } );
			}
		);

		return () => {
			current = false;
		};
	}, [ id, reloadKey ] );

	useEffect( () => {
		if ( ! busy && pendingFocusRef.current ) {
			pendingFocusRef.current();
			pendingFocusRef.current = null;
		}
	}, [ busy ] );

	// Düymə `disabled` EDİLMİR: fokuslu düymə deaktiv olanda brauzer fokusu body-yə atır.
	async function toggleRead() {
		if ( busy || ! entry ) {
			return;
		}

		const read = ! entry.is_read;

		setBusy( true );

		try {
			const outcome = await updateEntries( read ? 'read' : 'unread', [ id ] );

			// Yenidən YÜKLƏMİRİK: GET müraciəti dərhal yenə oxunmuş edərdi.
			setEntry( ( previous ) => ( previous ? { ...previous, is_read: read } : previous ) );
			onUnread( outcome.unread );
			announce(
				read ? __( 'Entry marked as read.', 'quoteform' ) : __( 'Entry marked as unread.', 'quoteform' ),
				{ force: true }
			);
		} catch ( caught ) {
			setError( caught );
			announce( entryErrorMessage( caught ), { force: true } );
		} finally {
			setBusy( false );
		}
	}

	function cancelDelete() {
		setConfirming( false );
		deleteRef.current?.focus();
	}

	async function confirmDelete() {
		setConfirming( false );
		setBusy( true );

		try {
			const outcome = await deleteEntry( id );

			onUnread( outcome.unread );
			/* translators: %d: entry number. */
			announce( sprintf( __( 'Entry #%d deleted.', 'quoteform' ), id ), { force: true } );
			onDeleted();
		} catch ( caught ) {
			setError( caught );
			announce( entryErrorMessage( caught ), { force: true } );
			pendingFocusRef.current = () => deleteRef.current?.focus();
			setBusy( false );
		}
	}

	const labels = neighbourLabels( filters );
	const notFound = isNotFound( error );
	const formHref =
		entry && entry.form_title !== null && config.canManageForms && config.builderUrl
			? `${ config.builderUrl }&form=${ entry.form_id }`
			: null;

	return (
		<div className="quoteform_entries quoteform_entry">
			<div className="quoteform_topbar">
				<a
					className="quoteform_entry__back"
					href={ backHref }
					onClick={ ( event ) => {
						if ( isPlainClick( event ) ) {
							event.preventDefault();
							onBack();
						}
					} }
				>
					{ __( '← Back to entries', 'quoteform' ) }
				</a>
				<span className="quoteform_topbar__sep" aria-hidden="true">
					|
				</span>
				<h1 ref={ headingRef } tabIndex={ -1 }>
					{ sprintf(
						/* translators: %d: entry number. */
						__( 'Entry #%d', 'quoteform' ),
						id
					) }
				</h1>
				{ entry && (
					<span className="quoteform_entry__meta">
						{ entry.form_title === null && (
							<em>{ __( '(deleted form)', 'quoteform' ) }</em>
						) }
						{ entry.form_title !== null && formHref && <a href={ formHref }>{ entry.form_title }</a> }
						{ entry.form_title !== null && ! formHref && <span>{ entry.form_title }</span> }
						{ ' · ' }
						<time dateTime={ entry.date.iso } title={ entry.date.full }>
							{ entry.date.display }
						</time>
						{ ' · ' }
						<span className="quoteform_entry__status">
							{ entry.is_read ? __( 'Read', 'quoteform' ) : __( 'New', 'quoteform' ) }
						</span>
					</span>
				) }
				{ entry && (
					<div className="quoteform_topbar__actions">
						<Button onClick={ toggleRead } aria-busy={ busy ? 'true' : undefined }>
							{ entry.is_read ? __( 'Mark as unread', 'quoteform' ) : __( 'Mark as read', 'quoteform' ) }
						</Button>
						{ config.canDelete && (
							<Button variant="danger" ref={ deleteRef } onClick={ () => setConfirming( true ) } disabled={ busy }>
								{ __( 'Delete', 'quoteform' ) }
							</Button>
						) }
					</div>
				) }
			</div>

			{ confirming && (
				<RemoveConfirm
					message={ sprintf(
						/* translators: %d: entry number. */
						__( 'Delete entry #%d? This cannot be undone.', 'quoteform' ),
						id
					) }
					confirmLabel={ __( 'Delete permanently', 'quoteform' ) }
					cancelLabel={ __( 'Cancel', 'quoteform' ) }
					onConfirm={ confirmDelete }
					onCancel={ cancelDelete }
				/>
			) }

			{ error && ! notFound && (
				<Notice status="error" live={ false } onDismiss={ () => setError( null ) }>
					{ entryErrorMessage( error ) }
				</Notice>
			) }

			{ error && ! notFound && ! entry && (
				<Button onClick={ () => setReloadKey( ( key ) => key + 1 ) }>{ __( 'Try again', 'quoteform' ) }</Button>
			) }

			{ loading && ! entry && <p className="quoteform_card quoteform_empty">{ __( 'Loading entry…', 'quoteform' ) }</p> }

			{ notFound && (
				<Card className="quoteform_empty">
					<p>{ __( 'Entry not found.', 'quoteform' ) }</p>
					<p>{ __( 'It may have been deleted.', 'quoteform' ) }</p>
				</Card>
			) }

			{ entry && (
				<>
					<nav className="quoteform_entry__neighbours" aria-label={ __( 'Entry navigation', 'quoteform' ) }>
						<Button
							onClick={ () => onNavigate( entry.neighbours.previous ) }
							disabled={ entry.neighbours.previous === null }
						>
							<span aria-hidden="true">‹ </span>
							{ labels.previous }
						</Button>
						<Button onClick={ () => onNavigate( entry.neighbours.next ) } disabled={ entry.neighbours.next === null }>
							{ labels.next }
							<span aria-hidden="true"> ›</span>
						</Button>
					</nav>
					<Answers answers={ entry.answers } />
					<Breakdown entry={ entry } />
					<Details details={ entry.details } />
				</>
			) }
		</div>
	);
}
```

- [ ] **Step 4: Run the test** — `npx jest tests/js/admin/EntryDetailScreen.test.js` → PASS (13 + 1).

- [ ] **Step 5: Verify** — `npm test` → yaşıl; `npm run build` + `make buildcheck` → yaşıl.

---
### Task 13: Router, stillər və builder deep-link — `EntriesApp`, `_entries.scss`, `App.js`

**Files:**
- Modify: `admin-src/entries/EntriesApp.js` (Task 7-nin stub-ını TAM əvəz edir)
- Modify: `admin-src/entries/_entries.scss` (Task 7-nin başlanğıcını TAM əvəz edir)
- Modify: `admin-src/App.js` (`&form=ID` ilə birbaşa redaktora açılma)
- Test: `tests/js/admin/EntriesApp.test.js`, `tests/js/admin/entriesNoRawHtml.test.js`, `tests/js/admin/AppDeepLink.test.js`

**Interfaces:**
- Consumes: `parseState`, `buildSearch` (Task 8); `useAnnouncer` (Task 8); `EntriesListScreen` (Task 11); `EntryDetailScreen` (Task 12); `updateMenuBadge` (Task 8, default).
- Produces:
  - `EntriesApp( { config } )` — URL ↔ vəziyyət. Mount-da URL normallaşdırılır (`replaceState` — etibarsız/yad parametrlər atılır). Filtr/sıralama/səhifə dəyişikliyi `replaceState`; detal açma və "← Back" `pushState`; silinmiş detaldan qayıdış `replaceState` (ölü URL tarixçədə qalmasın); `popstate` URL-i yenidən oxuyur. Hər in-app naviqasiyada (açma, bağlama, silmə, geri/irəli) yeni ekran `focusOnMount` ilə mount olur → fokus onun `h1`-inə. İlk yüklənişdə fokus alınmır.
  - Tək canlı sahə: `EntriesApp`-in öz `<div className="quoteform_entries__live">`-i daxilində `useAnnouncer`; ekranlar `announce` prop-u ilə elan edir.
  - `App.js`: `?page=quoteform&form=7` → builder birbaşa 7 nömrəli formanın redaktorunda açılır (Entries-dəki forma linki üçün); redaktor bağlananda `form` parametri URL-dən silinir (`replaceState`).

- [ ] **Step 1: Write the failing router test** — `tests/js/admin/EntriesApp.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError, getEntry, listEntries } from '../../../admin-src/api/client';
import EntriesApp from '../../../admin-src/entries/EntriesApp';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listEntries: jest.fn(),
	getEntry: jest.fn(),
	updateEntries: jest.fn(),
	deleteEntry: jest.fn(),
} ) );

const config = {
	perPage: 20,
	canDelete: true,
	canManageForms: true,
	canExport: true,
	exportUrl: 'http://localhost/wp-admin/admin-post.php?action=qform_export_entries&_wpnonce=abc',
	builderUrl: 'http://localhost/wp-admin/admin.php?page=quoteform',
	forms: [ { id: 7, title: 'Cleaning quote' } ],
	hasDeletedForms: false,
};

function item( id ) {
	return {
		id,
		form_id: 7,
		form_title: 'Cleaning quote',
		is_read: false,
		name: `Person ${ id }`,
		email: '',
		total: '10.0000',
		total_display: '$10.00',
		date: { display: 'Sep 25, 2026', full: '2026-09-25 01:30:00', iso: '2026-09-24T21:30:00Z' },
	};
}

function detail( id ) {
	return {
		...item( id ),
		is_read: true,
		answers: [],
		breakdown: { lines: [], error: null },
		details: { ip: null, user_agent: '', user: null, submitted: item( id ).date },
		neighbours: { previous: null, next: id - 1 },
		unread: 0,
	};
}

function liveRegions( container ) {
	return container.querySelectorAll( '[aria-live], [role="status"], [role="alert"]' );
}

function visit( search ) {
	window.history.replaceState( null, '', `/wp-admin/admin.php${ search }` );
}

beforeEach( () => {
	jest.resetAllMocks();
	listEntries.mockResolvedValue( { items: [ item( 41 ), item( 40 ) ], total: 2, pages: 1, page: 1, per_page: 20, unread: 2 } );
	getEntry.mockImplementation( ( id ) => Promise.resolve( detail( id ) ) );
} );

describe( 'EntriesApp', () => {
	it( 'reads the list state from the address and tidies the address', async () => {
		visit( '?page=quoteform-entries&status=new&orderby=nope&bogus=1' );

		render( <EntriesApp config={ config } /> );

		await screen.findByText( 'Person 41' );

		expect( listEntries ).toHaveBeenCalledWith( { status: 'new', page: 1, per_page: 20 } );
		expect( window.location.search ).toBe( '?page=quoteform-entries&status=new' );
		expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).not.toHaveFocus();
	} );

	it( 'opens an entry as a new history step and comes back to the same list', async () => {
		visit( '?page=quoteform-entries&status=new' );
		const user = userEvent.setup();
		const pushState = jest.spyOn( window.history, 'pushState' );

		render( <EntriesApp config={ config } /> );
		await user.click( await screen.findByRole( 'link', { name: 'View entry #41' } ) );

		expect( pushState ).toHaveBeenLastCalledWith( null, '', '?page=quoteform-entries&status=new&entry=41' );
		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } ) ).toHaveFocus();
		expect( getEntry ).toHaveBeenCalledWith( 41, { status: 'new' } );

		await user.click( screen.getByRole( 'link', { name: '← Back to entries' } ) );

		expect( pushState ).toHaveBeenLastCalledWith( null, '', '?page=quoteform-entries&status=new' );
		await waitFor( () => expect( screen.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toHaveFocus() );

		pushState.mockRestore();
	} );

	it( 'keeps filter changes out of the back button', async () => {
		visit( '?page=quoteform-entries' );
		const user = userEvent.setup();
		const pushState = jest.spyOn( window.history, 'pushState' );

		render( <EntriesApp config={ config } /> );
		await screen.findByText( 'Person 41' );

		await user.selectOptions( screen.getByRole( 'combobox', { name: 'Status' } ), 'read' );

		await waitFor( () => expect( window.location.search ).toBe( '?page=quoteform-entries&status=read' ) );
		expect( pushState ).not.toHaveBeenCalled();

		pushState.mockRestore();
	} );

	it( 'follows the browser back and forward buttons', async () => {
		visit( '?page=quoteform-entries' );

		render( <EntriesApp config={ config } /> );
		await screen.findByText( 'Person 41' );

		act( () => {
			window.history.pushState( null, '', '/wp-admin/admin.php?page=quoteform-entries&entry=5' );
			window.dispatchEvent( new PopStateEvent( 'popstate' ) );
		} );

		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entry #5' } ) ).toHaveFocus();

		act( () => {
			window.history.pushState( null, '', '/wp-admin/admin.php?page=quoteform-entries&form=7' );
			window.dispatchEvent( new PopStateEvent( 'popstate' ) );
		} );

		await waitFor( () => expect( listEntries ).toHaveBeenLastCalledWith( { form: '7', page: 1, per_page: 20 } ) );
	} );

	it( 'steps to a neighbour with the same filters', async () => {
		visit( '?page=quoteform-entries&status=new&entry=41' );
		const user = userEvent.setup();

		render( <EntriesApp config={ config } /> );
		await user.click( await screen.findByRole( 'button', { name: 'Older entry' } ) );

		expect( await screen.findByRole( 'heading', { level: 1, name: 'Entry #40' } ) ).toHaveFocus();
		expect( getEntry ).toHaveBeenLastCalledWith( 40, { status: 'new' } );
		expect( window.location.search ).toBe( '?page=quoteform-entries&status=new&entry=40' );
	} );

	it( 'has exactly one live region on the list, after an error and on an entry', async () => {
		visit( '?page=quoteform-entries' );
		listEntries.mockRejectedValueOnce( new ApiError( { code: 'fetch_error', status: 0, message: 'You appear to be offline.' } ) );
		const user = userEvent.setup();

		const { container } = render( <EntriesApp config={ config } /> );

		await screen.findByText( 'You appear to be offline.' );
		expect( liveRegions( container ) ).toHaveLength( 1 );

		await user.click( screen.getByRole( 'button', { name: 'Try again' } ) );
		await screen.findByText( 'Person 41' );
		expect( liveRegions( container ) ).toHaveLength( 1 );

		await user.click( screen.getByRole( 'link', { name: 'View entry #41' } ) );
		await screen.findByRole( 'heading', { level: 1, name: 'Entry #41' } );
		expect( liveRegions( container ) ).toHaveLength( 1 );
	} );
} );
```

- [ ] **Step 2: Write the failing raw-HTML guard** — `tests/js/admin/entriesNoRawHtml.test.js`:

```js
/**
 * Spec §2.5 / Plan 06 R15: müraciət mətni xam saxlanılır, ona görə Entries kodu
 * HEÇ VAXT HTML kimi render etmir. Bu test mənbəni oxuyur — gələcək dəyişiklik
 * `dangerouslySetInnerHTML` və ya `innerHTML` əlavə etsə düşür.
 */
const fs = require( 'fs' );
const path = require( 'path' );

const root = path.resolve( __dirname, '../../../admin-src' );

function sources( directory ) {
	return fs.readdirSync( directory, { withFileTypes: true } ).flatMap( ( entry ) => {
		const full = path.join( directory, entry.name );

		if ( entry.isDirectory() ) {
			return sources( full );
		}

		return /\.js$/.test( entry.name ) ? [ full ] : [];
	} );
}

describe( 'the entries screen never renders submitted text as HTML', () => {
	const files = [
		path.join( root, 'entries.js' ),
		...sources( path.join( root, 'entries' ) ),
		...[ 'Button', 'Card', 'Notice', 'RemoveConfirm', 'SelectControl', 'ControlLabel', 'FieldError' ].map( ( name ) =>
			path.join( root, 'components', `${ name }.js` )
		),
	];

	it( 'finds the files it guards', () => {
		expect( files.length ).toBeGreaterThan( 15 );
	} );

	it.each( files.map( ( file ) => [ path.relative( root, file ), file ] ) )( '%s', ( name, file ) => {
		const source = fs.readFileSync( file, 'utf8' );

		expect( source ).not.toMatch( /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/ );
	} );
} );
```

- [ ] **Step 3: Write the failing deep-link test** — `tests/js/admin/AppDeepLink.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../../../admin-src/App';
import { ApiError, getForm, listForms } from '../../../admin-src/api/client';

jest.mock( '../../../admin-src/api/client', () => ( {
	...jest.requireActual( '../../../admin-src/api/client' ),
	listForms: jest.fn(),
	getForm: jest.fn(),
	createForm: jest.fn(),
	updateForm: jest.fn(),
	deleteForm: jest.fn(),
} ) );

beforeEach( () => {
	jest.resetAllMocks();
	listForms.mockResolvedValue( { forms: [], total: 0, totalPages: 0 } );
} );

afterEach( () => {
	window.history.replaceState( null, '', '/' );
} );

describe( 'opening the builder from an entry', () => {
	it( 'goes straight to the form named in the address', async () => {
		window.history.replaceState( null, '', '/wp-admin/admin.php?page=quoteform&form=7' );
		getForm.mockRejectedValue( new ApiError( { code: 'qform_form_not_found', status: 404, message: 'Form not found.' } ) );

		render( <App /> );

		await waitFor( () => expect( getForm ).toHaveBeenCalledWith( 7 ) );
		expect( listForms ).not.toHaveBeenCalled();
	} );

	it( 'drops the form from the address when the editor closes', async () => {
		window.history.replaceState( null, '', '/wp-admin/admin.php?page=quoteform&form=7' );
		getForm.mockRejectedValue( new ApiError( { code: 'qform_form_not_found', status: 404, message: 'Form not found.' } ) );
		const user = userEvent.setup();

		render( <App /> );

		await user.click( ( await screen.findAllByRole( 'button', { name: 'Back to all forms' } ) )[ 0 ] );

		expect( window.location.search ).toBe( '?page=quoteform' );
		await waitFor( () => expect( listForms ).toHaveBeenCalled() );
	} );

	it( 'ignores a form value that is not an id', async () => {
		window.history.replaceState( null, '', '/wp-admin/admin.php?page=quoteform&form=7abc' );

		render( <App /> );

		await waitFor( () => expect( listForms ).toHaveBeenCalled() );
		expect( getForm ).not.toHaveBeenCalled();
	} );
} );
```

- [ ] **Step 4: Run them to verify they fail** — `npx jest tests/js/admin/EntriesApp.test.js tests/js/admin/entriesNoRawHtml.test.js tests/js/admin/AppDeepLink.test.js` → FAIL (stub `EntriesApp` yalnız başlıq çəkir; `App` `form` parametrini oxumur). `entriesNoRawHtml` bu mərhələdə keçə bilər — o, reqressiya qoruyucusudur.

- [ ] **Step 5: Replace `admin-src/entries/EntriesApp.js`:**

```js
import { useCallback, useEffect, useRef, useState } from '@wordpress/element';

import EntriesListScreen from './EntriesListScreen';
import EntryDetailScreen from './EntryDetailScreen';
import { buildSearch, parseState } from './urlState';
import useAnnouncer from './useAnnouncer';

/**
 * Entries ekranının kiçik router-i (yeni spec §2.3). Vəziyyətin mənbəyi URL-dir:
 * filtr/sıralama/səhifə `replaceState` (geri düyməsini doldurmur), detal açma və
 * bağlama `pushState` ("geri" siyahıya qaytarır), `popstate` URL-i yenidən oxuyur.
 */
export default function EntriesApp( { config } ) {
	const [ state, setState ] = useState( () => parseState( window.location.search ) );
	const [ navigation, setNavigation ] = useState( 0 );
	const stateRef = useRef( state );
	const liveRef = useRef( null );
	const announce = useAnnouncer( liveRef );

	stateRef.current = state;

	useEffect( () => {
		// Etibarsız və yad parametrlər ünvandan silinir: kopyalanan link ekranda görünəni desin.
		window.history.replaceState( window.history.state, '', buildSearch( stateRef.current ) );

		function onPopState() {
			const next = parseState( window.location.search );

			stateRef.current = next;
			setState( next );
			setNavigation( ( count ) => count + 1 );
		}

		window.addEventListener( 'popstate', onPopState );

		return () => window.removeEventListener( 'popstate', onPopState );
	}, [] );

	const commit = useCallback( ( patch, mode ) => {
		const next = { ...stateRef.current, ...patch };

		if ( mode === 'push' ) {
			window.history.pushState( null, '', buildSearch( next ) );
		} else {
			window.history.replaceState( null, '', buildSearch( next ) );
		}

		stateRef.current = next;
		setState( next );
	}, [] );

	const changeList = useCallback( ( patch ) => commit( patch, 'replace' ), [ commit ] );

	const navigate = useCallback(
		( patch, mode ) => {
			setNavigation( ( count ) => count + 1 );
			commit( patch, mode );
		},
		[ commit ]
	);

	const focusOnMount = navigation > 0;

	return (
		<>
			<div className="quoteform_entries__live" ref={ liveRef } />
			{ state.entry === null ? (
				<EntriesListScreen
					key={ `list-${ navigation }` }
					config={ config }
					filters={ state.filters }
					paged={ state.paged }
					onChange={ changeList }
					onOpen={ ( id ) => navigate( { entry: id }, 'push' ) }
					announce={ announce }
					focusOnMount={ focusOnMount }
				/>
			) : (
				<EntryDetailScreen
					key={ `entry-${ state.entry }-${ navigation }` }
					id={ state.entry }
					filters={ state.filters }
					config={ config }
					backHref={ buildSearch( { ...state, entry: null } ) }
					onBack={ () => navigate( { entry: null }, 'push' ) }
					onNavigate={ ( id ) => navigate( { entry: id }, 'push' ) }
					onDeleted={ () => navigate( { entry: null }, 'replace' ) }
					announce={ announce }
					focusOnMount={ focusOnMount }
				/>
			) }
		</>
	);
}
```

- [ ] **Step 6: Let the builder open a form from the address** — replace `admin-src/App.js`:

```js
import { useState } from '@wordpress/element';

import EditorScreen from './screens/EditorScreen';
import FormListScreen from './screens/FormListScreen';
import { StoreProvider } from './state/StoreContext';

const FORM_ID = /^[1-9]\d{0,14}$/;

/**
 * Entries ekranındakı forma linki `?page=quoteform&form=ID`-dir: builder birbaşa
 * həmin formanın redaktorunda açılır.
 */
function formIdFromAddress() {
	const raw = new URLSearchParams( window.location.search ).get( 'form' );

	return raw !== null && FORM_ID.test( raw ) ? Number( raw ) : null;
}

function forgetFormInAddress() {
	const url = new URL( window.location.href );

	if ( url.searchParams.has( 'form' ) ) {
		url.searchParams.delete( 'form' );
		window.history.replaceState( window.history.state, '', `${ url.pathname }${ url.search }${ url.hash }` );
	}
}

export default function App() {
	const [ editingId, setEditingId ] = useState( formIdFromAddress );
	const [ navigated, setNavigated ] = useState( false );

	function open( id ) {
		setNavigated( true );
		setEditingId( id );
	}

	function close() {
		setNavigated( true );
		setEditingId( null );
		// Yeniləmə (F5) redaktoru təkrar açmasın.
		forgetFormInAddress();
	}

	return (
		<div className="quoteform_builder">
			<StoreProvider>
				{ editingId === null ? (
					<FormListScreen onOpen={ open } focusOnMount={ navigated } />
				) : (
					<EditorScreen formId={ editingId } onClose={ close } focusOnMount={ navigated } />
				) }
			</StoreProvider>
		</div>
	);
}
```

- [ ] **Step 7: Replace `admin-src/entries/_entries.scss`** (bütün Entries stilləri; hamısı `.quoteform_builder` altında):

```scss
// Müraciətlər ekranı (Plan 07). Ümumi stillər (tokens, base, shell, list)
// style.scss-də import olunur; burada yalnız bu ekrana aid olanlar.

// Tək canlı sahə `createAnnouncer`-in `<p class="quoteform_sr_only">`-idir; frontend
// stil faylı admində yüklənmir, ona görə gizlətmə qaydası burada da lazımdır.
.quoteform_builder .quoteform_sr_only {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip: rect( 0 0 0 0 );
	white-space: nowrap;
	border: 0;
}

// --- Siyahı ---------------------------------------------------------------

.quoteform_builder .quoteform_entries__title {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 4px 10px;
}

.quoteform_builder .quoteform_entries__count {
	color: var( --qf-muted );
}

.quoteform_builder .quoteform_entries__filters {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 8px 12px;
	margin: 0 0 var( --qf-gap );
	padding: 12px 16px;
	background: var( --qf-surface );
	border: 1px solid var( --qf-border );
	border-radius: var( --qf-radius );

	.quoteform_control {
		flex: 0 1 180px;
		min-width: 140px;
		margin: 0;
	}

	.quoteform_help {
		margin: 4px 0 0;
		color: var( --qf-danger );
	}
}

.quoteform_builder .quoteform_entries__bulk {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin: 0 0 12px;
	padding: 8px 16px;
	background: var( --qf-accent-soft );
	border: 1px solid var( --qf-border );
	border-radius: var( --qf-radius );

	.quoteform_confirm {
		flex-basis: 100%;
	}
}

.quoteform_builder .quoteform_entries__selected {
	font-weight: 600;
}

.quoteform_builder .quoteform_entries .quoteform_card:has( > .quoteform_entries__scroll ) {
	padding: 0;
}

// Dar ekranda kart görünüşü YOX: cədvəl öz bölgəsində üfüqi sürüşür (spec §3.3).
.quoteform_builder .quoteform_entries__scroll {
	overflow-x: auto;

	&:focus-visible {
		outline: 2px solid var( --qf-accent );
		outline-offset: 2px;
	}
}

.quoteform_builder .quoteform_entries__table {
	min-width: 760px;

	.quoteform_entries__check {
		width: 40px;
	}

	th[scope="row"] {
		font-weight: 400;
		white-space: nowrap;
	}

	.quoteform_entries__row--unread {
		th[scope="row"],
		td {
			font-weight: 600;
		}
	}
}

.quoteform_builder .quoteform_entries__sort {
	padding: 0;
	font: inherit;
	font-weight: 600;
	color: inherit;
	background: none;
	border: 0;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var( --qf-accent );
		outline-offset: 2px;
	}
}

.quoteform_builder .quoteform_entries__arrow {
	margin-inline-start: 4px;
}

.quoteform_builder .quoteform_entries__new {
	display: inline-block;
	margin-inline-start: 6px;
	padding: 0 6px;
	font-size: 11px;
	font-weight: 600;
	line-height: 18px;
	color: #fff;
	background: var( --qf-accent );
	border-radius: 9px;
}

// Uzun ad/email serverdə kəsilmir (bayt/simvol səhvi sinfi); ekranda ellipsis.
.quoteform_builder .quoteform_entries__who {
	max-width: 280px;

	.quoteform_entries__name,
	.quoteform_entries__email {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.quoteform_builder .quoteform_entries__muted {
	font-size: 12px;
	color: var( --qf-muted );
}

.quoteform_builder .quoteform_entries__total {
	white-space: nowrap;
}

.quoteform_builder .quoteform_entries__pagination {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
	gap: 12px;
	margin-top: 12px;

	.quoteform_list__pages {
		margin-top: 0;
	}
}

.quoteform_builder .quoteform_entries__gap {
	align-self: center;
	padding: 0 4px;
	color: var( --qf-muted );
}

.quoteform_builder .quoteform_entries__per-page {
	display: flex;
	align-items: center;
	gap: 6px;
}

// --- Detal ----------------------------------------------------------------

.quoteform_builder .quoteform_entry .quoteform_topbar h1 {
	margin: 0;
	padding: 0;
	font-size: 20px;
	font-weight: 600;
}

.quoteform_builder .quoteform_entry__meta {
	color: var( --qf-muted );
}

.quoteform_builder .quoteform_entry__neighbours {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	margin: 0 0 var( --qf-gap );
}

.quoteform_builder .quoteform_entry > .quoteform_card + .quoteform_card {
	margin-top: var( --qf-gap );
}

.quoteform_builder .quoteform_entry__list {
	display: grid;
	grid-template-columns: minmax( 120px, 240px ) minmax( 0, 1fr );
	gap: 8px 16px;
	margin: 12px 0 0;

	> div {
		display: contents;
	}

	dt {
		font-weight: 600;
	}

	dd {
		margin: 0;
	}
}

// Çoxsətirli cavab sətirlərini saxlayır; uzun sözsüz mətn (user agent, URL) sarınır.
.quoteform_builder .quoteform_entry__value {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

@media ( max-width: 600px ) {
	.quoteform_builder .quoteform_entry__list {
		grid-template-columns: minmax( 0, 1fr );

		dd {
			margin-bottom: 8px;
		}
	}
}

.quoteform_builder .quoteform_entry__breakdown {
	width: 100%;
	margin-top: 12px;
	border-collapse: collapse;

	th,
	td {
		padding: 6px 0;
		border-bottom: 1px solid var( --qf-bg );
	}

	th {
		font-weight: 400;
		text-align: start;
	}

	td {
		text-align: end;
		white-space: nowrap;
	}

	tfoot th,
	tfoot td {
		font-weight: 600;
		border-top: 1px solid var( --qf-border );
		border-bottom: 0;
	}
}

.quoteform_builder .quoteform_entry__error {
	color: var( --qf-danger );
}
```

- [ ] **Step 8: Run the tests** — `npx jest tests/js/admin/EntriesApp.test.js tests/js/admin/entriesNoRawHtml.test.js tests/js/admin/AppDeepLink.test.js` → PASS (6; 1 + hər fayl üçün bir; 3). Mövcud `tests/js/admin/App.test.js` dəyişmədən keçməlidir — jsdom-un default ünvanında `form` yoxdur.

- [ ] **Step 9: Verify** — `npm test` → hamısı yaşıl (say qeyd et); `npm run build` və `make buildcheck` → yaşıl; `gzip -c build/entries.js | wc -c` qeyd et (büdcə yoxdur, amma builder-dən kiçik olmalıdır — `gzip -c build/index.js | wc -c` ilə müqayisə et; builder kodu bu paketdə OLMAMALIDIR: `grep -c "Edit form" build/entries.js` → 0). `make up` açıqdırsa əl ilə: `?page=quoteform-entries` → filtr seç (URL dəyişir, "geri" siyahıdan çıxarır), bir müraciət aç ("geri" siyahıya qaytarır), menyu nişanı azalır; brauzer konsolunda xəta yoxdur.

---
### Task 14: e2e, POT və tam yoxlama

**Files:**
- Create: `tests/e2e/entries.spec.js`
- Modify: `languages/quoteform.pot` (`make makepot` ilə)

**Interfaces:**
- Consumes: hər şey yuxarıda; `tests/e2e/helpers.js` (`BASE_URL`, `restCall`, `signIn`, `withAdmin`). `submission.spec.js`-in `publish()`/`remove()` köməkçiləri ixrac olunmur və mövcud test faylları dəyişdirilmir — ona görə bu spec öz kiçik nüsxəsini saxlayır.
- Təhlükəsizlik qaydaları (Plan 05 hadisəsi, Plan 06 R13/R14):
  - Əvvəl dev DB backup.
  - `fixture` `null` ilə başlayır; `afterAll` yalnız `beforeAll`-un HƏQİQƏTƏN yaratdığını silir (forma, səhifə və yalnız həmin formanın müraciətləri — forma bu qaçışda yaradıldığı üçün onun bütün müraciətləri bizimdir).
  - Admin-in `qform_entries_per_page` seçiminə toxunulmur: REST çağırışlarında `per_page` göndərilmir.
  - `--workers=1`: `submission.spec.js` paralel işləsə, nişan sayını dəyişər.

- [ ] **Step 1: Write the e2e spec** — `tests/e2e/entries.spec.js`:

```js
const fs = require( 'fs' );
const { test, expect } = require( '@playwright/test' );

const { BASE_URL, restCall, signIn, withAdmin } = require( './helpers' );

function schema() {
	return {
		version: 1,
		settings: {
			currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Send my request',
			success_action: 'message', success_message: 'Thanks — request received.', redirect_url: '', save_resume: false, store_ip: false,
		},
		fields: {
			name: { key: 'name', type: 'text', label: 'Your name', help: '', placeholder: '', required: true, default: '' },
			email: { key: 'email', type: 'email', label: 'Email', help: '', placeholder: '', required: true, default: '' },
			rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', placeholder: '', required: true, default: 1, min: 1, max: 10, step: 1 },
		},
		steps: [ { key: 'one', title: 'Your request', description: '', fields: [ 'name', 'email', 'rooms' ] } ],
		calculations: [ { key: 'total', label: 'Rooms', expression: '{rooms} * 50', visible: true } ],
		rules: [],
		notifications: [],
	};
}

async function publish( page, nonce, title ) {
	const created = await restCall( page, nonce, 'POST', '/quoteform/v1/forms', { title } );

	expect( created.status, created.body ).toBe( 201 );

	const fixture = { formId: created.json.id, postId: null, url: null };
	const saved = await restCall( page, nonce, 'PUT', `/quoteform/v1/forms/${ fixture.formId }`, { title, schema: schema() } );

	if ( saved.status !== 200 ) {
		await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );
	}

	expect( saved.status, saved.body ).toBe( 200 );

	// Mövzunun şərh formasında da "Email"/"Website" label-ləri var — getByLabel strict rejimdə iki element tapardı.
	const post = await restCall( page, nonce, 'POST', '/wp/v2/posts', { title, content: `[quoteform id="${ fixture.formId }"]`, status: 'publish', comment_status: 'closed' } );

	if ( post.status !== 201 ) {
		// fixture hələ qaytarılmayıb, afterAll onu görməyəcək — yaratdığımız formanı burada silirik.
		await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );
	}

	expect( post.status, post.body ).toBe( 201 );

	fixture.postId = post.json.id;
	fixture.url = post.json.link;

	return fixture;
}

function badgeCount( text ) {
	return Number( String( text ).replace( /\D/g, '' ) || '0' );
}

test.describe( 'the entries screen', () => {
	test.describe.configure( { mode: 'serial' } );

	// `null` = "heç nə yaratmamışıq". beforeAll düşsə də Playwright afterAll-u işlədir —
	// o zaman heç nəyə toxunulmur.
	let fixture = null;

	test.beforeAll( async ( { browser } ) => {
		await withAdmin( browser, async ( page, nonce ) => {
			fixture = await publish( page, nonce, `Entries e2e ${ Date.now() }` );
		} );
	} );

	test.afterAll( async ( { browser } ) => {
		if ( fixture === null ) {
			return;
		}

		await withAdmin( browser, async ( page, nonce ) => {
			// Forma bu qaçışda yaradılıb, ona görə onun bütün müraciətləri bizimdir.
			const listed = await restCall( page, nonce, 'GET', `/quoteform/v1/entries&form=${ fixture.formId }` );

			expect( listed.status, listed.body ).toBe( 200 );

			const ids = listed.json.items.map( ( item ) => item.id );

			if ( ids.length > 0 ) {
				const removed = await restCall( page, nonce, 'POST', '/quoteform/v1/entries/batch', { action: 'delete', ids } );

				expect( removed.status, removed.body ).toBe( 200 );
			}

			if ( fixture.postId !== null ) {
				await restCall( page, nonce, 'DELETE', `/wp/v2/posts/${ fixture.postId }&force=true` );
			}

			await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );
		} );
	} );

	test( 'a sent quote is listed as new, read when opened, exported and deleted', async ( { browser, page } ) => {
		await signIn( page );
		await page.goto( '/wp-admin/admin.php?page=quoteform-entries' );

		const badge = page.locator( '#adminmenu .quoteform_unread-badge .pending-count' ).first();
		const before = badgeCount( await badge.textContent() );

		// Ziyarətçi (ayrı, giriş etməmiş kontekst) formanı göndərir.
		const visitor = await browser.newContext( { baseURL: BASE_URL } );
		const guest = await visitor.newPage();

		await guest.goto( fixture.url );
		await guest.getByLabel( 'Your name' ).fill( '=HYPERLINK("http://example.test")' );
		await guest.getByLabel( 'Email' ).fill( 'jane@example.com' );
		await guest.getByLabel( 'Rooms' ).fill( '3' );
		await guest.getByRole( 'button', { name: 'Send my request' } ).click();
		await expect( guest.locator( '[data-quoteform-success]' ) ).toContainText( '$150.00', { timeout: 10000 } );
		await visitor.close();

		// Siyahı: New, mətn olduğu kimi, server formatlı total, menyu nişanı +1.
		await page.goto( `/wp-admin/admin.php?page=quoteform-entries&form=${ fixture.formId }` );

		const row = page.getByRole( 'row' ).filter( { hasText: 'jane@example.com' } );

		await expect( row ).toContainText( 'New' );
		await expect( row ).toContainText( '=HYPERLINK("http://example.test")' );
		await expect( row ).toContainText( '$150.00' );
		await expect( badge ).toHaveText( String( before + 1 ) );

		// Açılış: detal, fokus başlıqda, oxunmuş, nişan geri azalır.
		await row.getByRole( 'link', { name: /^View entry #\d+$/ } ).click();

		await expect( page ).toHaveURL( /entry=\d+/ );
		await expect( page.getByRole( 'heading', { level: 1, name: /^Entry #\d+$/ } ) ).toBeFocused();
		await expect( page.locator( '.quoteform_entry__status' ) ).toHaveText( 'Read' );
		await expect( page.getByText( 'jane@example.com' ) ).toBeVisible();
		await expect( badge ).toHaveText( String( before ) );

		// "Geri" siyahıya qaytarır; sətir artıq New deyil.
		await page.goBack();
		await expect( page ).not.toHaveURL( /entry=/ );
		await expect( row ).toBeVisible();
		await expect( row.locator( '.quoteform_entries__new' ) ).toHaveCount( 0 );

		// CSV: bu formanın sütunları, BOM, formul qoruyucusu.
		const downloading = page.waitForEvent( 'download' );

		await page.getByRole( 'link', { name: 'Export CSV' } ).click();

		const download = await downloading;

		expect( download.suggestedFilename() ).toMatch( /^quoteform-entries-\d{4}-\d{2}-\d{2}\.csv$/ );

		const csv = fs.readFileSync( await download.path(), 'utf8' );

		expect( csv.charCodeAt( 0 ) ).toBe( 0xfeff );
		expect( csv ).toContain( 'Your name' );
		expect( csv ).toContain( 'jane@example.com' );
		expect( csv ).toContain( '"\'=HYPERLINK(""http://example.test"")"' );

		// Silmə: təsdiqlə, sonra boş filtr halı və fokus başlıqda.
		await row.getByRole( 'button', { name: /^Delete entry #\d+$/ } ).click();
		await page.getByRole( 'button', { name: 'Delete permanently' } ).click();

		await expect( page.getByText( 'No entries match these filters.' ) ).toBeVisible();
		await expect( page.getByRole( 'heading', { level: 1, name: 'Entries' } ) ).toBeFocused();
	} );

	test( 'filters and sorting survive a reload', async ( { page } ) => {
		await signIn( page );
		await page.goto( `/wp-admin/admin.php?page=quoteform-entries&form=${ fixture.formId }&status=read&orderby=total&order=asc&junk=1` );

		await expect( page.getByRole( 'combobox', { name: 'Form' } ) ).toHaveValue( String( fixture.formId ) );
		await expect( page.getByRole( 'combobox', { name: 'Status' } ) ).toHaveValue( 'read' );
		await expect( page ).toHaveURL( new RegExp( `\\?page=quoteform-entries&form=${ fixture.formId }&status=read&orderby=total&order=asc$` ) );

		await page.reload();

		await expect( page.getByRole( 'combobox', { name: 'Status' } ) ).toHaveValue( 'read' );
	} );
} );
```

Notes: bu spec admin-in `per_page` seçiminə toxunmur (GET-lərdə `per_page` yoxdur); forma `DELETE /forms/{id}` ilə zibil qutusuna gedir (mövcud spec-lərin naxışı). İkinci test müraciət yaratmır — boş siyahıda da filtr və URL vəziyyəti yoxlanır.

- [ ] **Step 2: Back up the dev DB, then run e2e** — `make up` (açıq deyilsə); `make site ARGS="db export --skip-ssl /var/www/html/wp-content/plugins/quoteform/.superpowers/dev-db-backup.sql"`; `make site ARGS="post list --post_type=quoteform --post_status=publish --fields=ID,post_title"` çıxışını yadda saxla; sonra `npm run build && npx playwright test --workers=1` → hamısı yaşıl (mövcud 14 + yeni 2). Düşərsə: `npx playwright show-trace test-results/…/trace.zip`.

- [ ] **Step 3: Confirm the dev site is as it was** — `make site ARGS="post list --post_type=quoteform --post_status=publish --fields=ID,post_title"` → 8, 40, 328 hələ də siyahıdadır və Step 2-dəki çıxışdakı heç bir forma itməyib; bu spec-in müraciəti qalmayıb: `make site ARGS="db query 'SELECT COUNT(*) FROM wp_qform_entries e JOIN wp_posts p ON p.ID = e.form_id WHERE p.post_title LIKE \"Entries e2e%\"' --skip-ssl"` → `0`; admin-in səhifə ölçüsünə toxunulmayıb: `make site ARGS="user meta get admin qform_entries_per_page"` → testdən əvvəlki dəyər (və ya meta yoxdur xətası).

- [ ] **Step 4: POT** — `grep -c '^msgid' languages/quoteform.pot` (əvvəl); `make makepot`; yenidən say (artmalıdır); `grep -n 'unread entr\|Mark as unread\|No entries match these filters\|Delete permanently\|Calculation failed\|This export link has expired\|Deleted user #%d\|Entry #%d' languages/quoteform.pot` → hamısı var (PHP `includes/` və JS `admin-src/` sətirləri birlikdə).

- [ ] **Step 5: Full check** — `make check` (buildcheck, PHP 8.2 + 7.4 vahid, Jest, inteqrasiya, trash-disabled) → hamısı yaşıl; sayları qeyd et. `grep -rn "dangerouslySetInnerHTML" admin-src/entries admin-src/entries.js` → heç nə. `grep -rn "wp_nonce_url" includes/` → heç nə.

- [ ] **Step 6: Report** — hazırlanmış commit mesajını istifadəçiyə göstər və DAYAN (commit yalnız açıq icazə ilə):

```text
feat(entries): admin entries screen with filters, detail, bulk actions and CSV export

- Entries submenu with an unread badge (one indexed COUNT, viewers only)
- Shared EntryFilters/filters.js parity fixture and one EntryQuery for list,
  neighbours and CSV; exact DECIMAL comparisons; site-timezone day bounds
- Admin REST on /entries (GET list/detail, batch read/unread/delete, DELETE)
- React list/detail screens in their own bundle, URL state, single live region
- CSV via admin-post: BOM, formula guard, control-character stripping

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```
