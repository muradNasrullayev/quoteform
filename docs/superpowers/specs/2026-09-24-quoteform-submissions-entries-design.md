# Quoteform — Göndərmə və müraciətlərin idarəsi

**Tarix:** 2026-09-24
**Status:** Təsdiqlənmiş dizayn, implementasiya planları gözlənilir (Plan 06 + Plan 07)
**Əsas spec:** `2026-09-15-quoteform-design.md` — ziddiyyət olarsa o qalib gəlir, **§12-dəki qəsdən sapmalar istisna** (aşağıda §10-da sadalanır, istifadəçi təsdiqi ilə).

---

## 1. Niyə

Plan 01–05 formanı qurmağı, saxlamağı və səhifədə canlı qiymətlə göstərməyi bitirib. Amma ziyarətçi formanı
**göndərə bilmir** — nə submit düyməsi, nə endpoint, nə müraciət cədvəli var. Bu sənəd müştərinin yolunun
son hissəsini (göndərmə) və sayt sahibinin tərəfini (müraciətlərə baxmaq, idarə etmək, eksport) dizayn edir.

Əsas vəd dəyişmir və genişlənir: **ekrandakı qiymət serverin saxladığı qiymətlə eynidir, çünki server onu
brauzerə etibar etmədən, eyni qaydalarla sıfırdan hesablayır.**

## 2. Əhatə

**Daxildir:**
- A — göndərmə axını: submit UX, `GET /session`, `POST /entries`, spam qoruması, server tərəfində görünmə/validasiya/hesablama (PHP runtime, JS ilə paritet), `qform_entries` cədvəli, uğur mesajı/yönləndirmə.
- B — müraciətlərin idarəsi: admin siyahısı (WP_List_Table), filtrlər, New/Read, detal səhifəsi, silmə, toplu əməliyyatlar, CSV eksport.

**Qəsdən kənardadır (sonrakı işlər):**
- Email bildirişləri (əsas spec §13) — ayrıca plan.
- Save & resume (əsas spec §6.3 draft, `PUT/GET /entries/{token}`) — ayrıca plan. Cədvəl onun sütunlarını indidən daşıyır.
- GDPR Export/Erase Personal Data inteqrasiyası və Privacy Policy mətni — istifadəçi qərarı ilə sonraya.
- IP üzrə sürət məhdudiyyəti, müraciətlərdə axtarış qutusu, detal səhifəsində əvvəlki/növbəti naviqasiya — spec-də yoxdur, sonradan asan əlavə olunur.
- WooCommerce inteqrasiyası — v1-dən sonra ayrıca pulsuz modul kimi müzakirə olundu; bu işə daxil deyil.

**Planlara bölgü:**
- **Plan 06:** §3–§6 (runtime PHP-yə köçürmə + paritet, göndərmə endpoint-ləri, cədvəl, səhifədəki submit).
- **Plan 07:** §7–§8 (admin müraciətlər, CSV).

## 3. Arxitektura və data axını

```
Brauzer (son addım)
  │ 1. GET  /quoteform/v1/session?form_id=N  → { nonce, ticket }     (ilk toxunuşda; no-store)
  │ 2. POST /quoteform/v1/entries  { form_id, values, hp, ticket, nonce }   ← total YOXDUR
  ▼
Rest\EntriesController (+ Rest\SessionController)
  ▼
Submissions\SubmissionService
  ├─ Submissions\SpamGuard      → spam: 201 saxta uğur, heç nə saxlanmır
  ├─ Forms\SchemaRepository     → forma published deyil: 404
  ├─ Submissions\InputSanitizer → saxtalaşdırılmış variant: 400
  ├─ Runtime\Visibility → Runtime\Validator → xəta: 422
  ├─ Runtime\Calculator (+ Engine) → xəta olsa belə davam, total = NULL
  └─ Entries\EntryRepository → {prefix}qform_entries
  ▼
201 { success_action, message | redirect_url, total, breakdown }
```

### 3.1 Yeni qovluqlar

| Qovluq / sinif | Məsuliyyət | WordPress-dən asılı? |
|---|---|---|
| `includes/Runtime/Values` | sahə dəyərinin normallaşdırılması, dəyişənlər (`{key}`, `{key.price}`) | Xeyr |
| `includes/Runtime/Conditions` | şərtin/qaydanın doğruluğu (mühərrik üzərindən) | Xeyr |
| `includes/Runtime/Visibility` | görünən sahələr/addımlar/məcburi sahələr (sabit nöqtəyə qədər, maks. 10 keçid) | Xeyr |
| `includes/Runtime/Validator` | görünən sahələrin validasiyası; mesajlar kənardan ötürülür | Xeyr |
| `includes/Runtime/Calculator` | hesablamalar, total, açılış | Xeyr |
| `includes/Runtime/MoneyFormatter` | `frontend-src/runtime/format.js`-in əkizi | Xeyr |
| `includes/Submissions/*` | `SubmissionService`, `SpamGuard`, `InputSanitizer` | Bəli |
| `includes/Entries/*` | `EntriesTable`, `EntryRepository`, `EntriesListTable`, `EntryDetailPage`, `CsvExporter`, `EntriesMenu` | Bəli |
| `includes/Rest/EntriesController`, `SessionController` | REST | Bəli |

`includes/Runtime/` `includes/Engine/` ilə eyni qaydalara tabedir (layihə CLAUDE.md paritet qaydası 5):
nə `WP_`, nə `wp_`, nə `$wpdb`, nə `add_action`. i18n mesajları `Validator`-a konstruktorda massiv kimi verilir.

### 3.2 Paritet qapısı

`tests/fixtures/submissions.json` — həm Jest (`frontend-src/runtime/`), həm PHPUnit (`includes/Runtime/`) oxuyur.
Hər hal: `schema`, `values` → gözlənilən `visible_fields`, `visible_steps`, `required`, `errors` (açar → xəta **kodu**,
mesaj yox), `total`, `breakdown` (açar + rəqəm). Mühərrik qapısının qaydaları eynilə tətbiq olunur: gözlənilən dəyər
testi keçirmək üçün heç vaxt dəyişdirilmir; runtime-a yeni davranış = yeni fixture halı.

Server brauzerdən **daha sərtdir** (variant whitelist-i, `hidden` sxemdən, uzunluq/tarix yoxlaması). Bu yoxlamalar
`InputSanitizer`-dədir və WordPress-in `sanitize_*` funksiyalarından istifadə edir — ona görə paritet fixture-ına yox,
`InputSanitizer`-in inteqrasiya testlərinə düşür (plan yazılarkən dəqiqləşdi; paritet fixture-ı yalnız WP-dən asılı
olmayan runtime-ı yoxlayır).

Validator xəta **kodları** qaytarır (`required`, `email`, `min`, `max`) — mesajlar ayrıca xəritədən gəlir. Bu, JS və
PHP i18n fərqini paritet müqayisəsindən çıxarır.

Minimum fixture əhatəsi: görünmə zəncirləri (A B-ni, B C-ni göstərir); gizli addımın sahələrinin qiymətə düşməməsi;
`require`/`optional` qaydaları; gizli sahənin məcburiliyinin düşməsi; email regex (`a@b` keçir, `a@@b`, `a b@c` keçmir);
`min`/`max` sərhədləri (bərabər keçir); checkbox qiymət cəmi; toggle; rəqəmə oxşar sətirlər (`"1e3"`, `" 5"`, `"5\n"`,
`"1e400"`); hesablama xətası → `total: null`; heç bir addımda olmayan sahə. Server-only hallar (mövcud olmayan
variant, saxtalaşdırılmış hidden, 501 simvollu text, `2026-13-40` tarixi) — `InputSanitizer` testlərində.

## 4. Server tərəfində göndərmə

### 4.1 Endpoint-lər

| Metod | Yol | Giriş | Cavab |
|---|---|---|---|
| GET | `/quoteform/v1/session?form_id=N` | public | `200 { nonce, ticket }`, `Cache-Control: no-store` |
| POST | `/quoteform/v1/entries` | public + nonce | `201` / `400` / `403` / `404` / `422` |

Əsas spec §10.1-dəki `POST /entries` qalır; `GET /session` yenidir (§10).

### 4.2 Spam qoruması (`SpamGuard`)

- **Honeypot:** `hp` sahəsi boş olmalıdır.
- **Ticket:** `"{form_id}.{issued_at}.{hmac}"`, `hmac = hash_hmac('sha256', form_id.'|'.issued_at, wp_salt('nonce'))`.
  Etibarlıdır, əgər imza düzgündür, forma eynidir, `3 ≤ now − issued_at ≤ 86400` saniyə.
- Spam (honeypot doludur, ticket etibarsız/yoxdur, çox tez, çox köhnə) → **201 adi uğur cavabı, heç nə saxlanmır.**
  Cavab formanın `success_action`-ına uyğundur (mesaj və ya redirect), `total`/`breakdown` daşımır.
- Saat və gizli açar `SpamGuard`-a kənardan ötürülür (test üçün).

### 4.3 Nonce

Action `qform_submit`, `wp_create_nonce` / `wp_verify_nonce`. Uğursuz → `403 { code: 'qform_expired' }`.
Nonce səhifəyə yazılmır (keşlənmiş səhifədə köhnəlməsin) — yalnız `/session`-dan gəlir.

### 4.4 Dəyərlərin qəbulu (`InputSanitizer`)

| Tip | Qayda |
|---|---|
| text, tel | xam sətir (yalnız etibarsız UTF-8 rədd), uzunluq həddi; brauzerlə eyni dəyər qiymətləndirilir — çıxışda HƏMİŞƏ escape (admin, email); maks. 500 simvol (artığı → 400) |
| textarea | xam sətir (yalnız etibarsız UTF-8 rədd), uzunluq həddi; brauzerlə eyni dəyər qiymətləndirilir — çıxışda HƏMİŞƏ escape (admin, email); maks. 5000 simvol (artığı → 400) |
| email | xam sətir (yalnız etibarsız UTF-8 rədd), uzunluq həddi; brauzerlə eyni dəyər qiymətləndirilir — çıxışda HƏMİŞƏ escape (admin, email); maks. 500 simvol; format xətası Validator-da (`/^[^@\s]+@[^@\s]+$/`, JS ilə eyni) |
| number, slider | mühərrikin `NUMERIC_STRING` qaydası; uyğun deyilsə `''` |
| date | `YYYY-MM-DD` və etibarlı təqvim tarixi, ya `''`; əks halda 400 |
| select, radio | dəyər variantlardan biri, ya `''`; əks halda **400** |
| checkbox | massiv; hər element variantlardan biri (əks halda 400); təkrarlar atılır |
| toggle | 0 / 1 |
| hidden | **brauzerdən gələn nəzərə alınmır** — sxemin `default`-u |
| html; heç bir addımda olmayan sahə | gələn nəzərə alınmır — sxemin `default`-u (brauzerin başlanğıc vəziyyəti ilə eyni) |
| sxemdə olmayan açarlar | atılır |

`400` cavabı `{ code: 'qform_bad_request' }` — saxtalaşdırılmış sorğu üçündür, adi ziyarətçi onu görmür.

### 4.5 Görünmə, validasiya, hesablama

- `Visibility` — JS `resolveVisibility`-nin əkizi.
- `Validator` — **bütün görünən addımların** görünən sahələri (brauzer addım-addım yoxlayır, server hamısını).
  Xəta → `422 { code: 'qform_invalid_submission', errors: { açar: mesaj }, step: 'xətalı ilk görünən addımın açarı' }`.
- `Calculator` — total + açılış. Hesablama xətası (məs. 0-a bölmə) → müraciət **yenə saxlanılır**, `total = NULL`,
  açılışa `{ "error": "<kod>" }` yazılır (əsas spec §14.3).

### 4.6 Saxlama

- `data` — yalnız görünən sahələr, **snapshot formatında**:
  `{ "bedrooms": { "label": "Bedrooms", "type": "slider", "value": 3 } }`; checkbox/radio/select üçün əlavə
  `"display"` (variant label-ləri).
- `breakdown` — `{ "currency": "USD", "position": "before", "decimals": 2, "lines": [ { "key", "label", "amount" } ], "error": null }`.
- `status = 'completed'`, `currency` settings-dən, `user_id` (daxil olubsa), `user_agent` (255 simvol),
  `ip` yalnız `settings.store_ip = true` olduqda (`inet_pton`).
- Uğur: `201 { success_action: 'message', message, total, breakdown }` və ya `{ success_action: 'redirect', redirect_url }`.
  `total`/`breakdown` serverin hesabladığıdır (formatlanmış sətirlərlə).

## 5. Səhifədəki forma: göndərmə təcrübəsi

- Son görünən addımda "Next" əvəzinə submit düyməsi — mətni `settings.submit_label`, primary görünüş.
  Şərt son addımı gizlədərsə, düymə avtomatik yeni son addıma keçir (mövcud görünən-addım naviqasiyası).
- Forma yüklənəndə (mount) `GET /session`; göndərmədən əvvəl yoxdursa və ya 1 saatdan köhnədirsə yenidən (nonce).
  **Ticket yenilənmədə saxlanılır** (23 saatdan köhnə deyilsə) — yeni ticket "çox təzə" olardı. Göndərmədən əvvəl ticket
  3.5 saniyədən təzədirsə, brauzer qalan müddəti gözləyir: tez klikləyən real ziyarətçinin müraciəti spam sayılıb itmir.
  (Plan yazılarkən dəqiqləşdi: "ilk toxunuşda" almaq, birinci toxunuş elə submit kliki olanda ticket-i 0 saniyəlik edirdi.)
- Klik: cari addımın brauzer validasiyası → `POST`. Gedərkən düymə `disabled` + `aria-busy`, mətn dəyişmir,
  "Sending…" elan edilir; ikinci klik ikinci göndəriş yaratmır.

| Cavab | Ziyarətçi görür |
|---|---|
| 201 + message | Forma yerində uğur paneli: mesaj + **serverin** total/açılışı; fokus panelə; mesaj elan olunur |
| 201 + redirect | `window.location.assign(redirect_url)` |
| 422 | Xətalar sahələrin altında; forma xətalı ilk addıma qayıdır; fokus ilk xətalı sahəyə; "N fields need attention" |
| 403 qform_expired | Sessiya bir dəfə yenilənir, avtomatik təkrar; yenə uğursuz → ümumi xəta |
| 400/404/5xx/şəbəkə | Düymə üstündə xəta zolağı: "We couldn't send your quote. Please try again."; cavablar qalır |

- Uzunluq limitləri brauzerdə də tətbiq olunur: text/tel inputları `maxlength="500"`, textarea `maxlength="5000"`
  (`frontend-src/dom/controls.js`) — adi ziyarətçi server limitinə (§4.4, 400) heç vaxt çatmır.
- Uğur cavabında `total`/`breakdown` olmaya bilər (spam saxta uğuru onları daşımır, hesablama xətasında `total` null-dur)
  — panel onda yalnız mesajı göstərir.
- Honeypot: JS yerləşdirir; ekrandan kənar sarğı (`display:none` yox), `aria-hidden`, input `tabindex="-1"`,
  `autocomplete="off"`, inandırıcı ad (`website`).
- `FormRenderer` səhifəyə bir dəfə `window.quoteformConfig = { restUrl }` (`rest_url('quoteform/v1/')`) çap edir — hər forma üçün təkrarlanan `quoteformData`-dan ayrı, çünki bir səhifədə bir neçə forma ola bilər. `fetch` (apiFetch yox);
  frontend bundle büdcəsi (25 KB gzip) qorunur.

## 6. Data modeli və quraşdırma

`{prefix}qform_entries` — əsas spec §6.3-dəki sxem **olduğu kimi**, üstəgəl:

```sql
  read_at  DATETIME NULL,
  KEY status_read (status, read_at)
```

- `Entries\EntriesTable::install()` — `dbDelta`, `qform_db_version` option-u.
- Aktivasiyada qurulur; əlavə olaraq `init`-də versiya yoxlanılır (plugin yeniləndikdə aktivasiya hook-u işləmir;
  `admin_init` yetməzdi — yeniləmədən sonra admin-ə girilməsə, ön səhifədən göndərişlər olmayan cədvələ yazılardı).
  Yoxlama yalnız autoload option oxunuşudur.
- Multisite: hər saytın öz cədvəli; network aktivasiyasında hər sayt; `wp_initialize_site`-da yeni sayt.
- `Uninstaller` — hər saytda `DROP TABLE` + `delete_option('qform_db_version')`.
- Forma silinəndə müraciətlər **silinmir**; siyahıda "(deleted form)".

## 7. Admin: müraciətlərin idarəsi

> **Əvəz olunub:** bu bölmə `2026-09-25-quoteform-entries-admin-design.md` ilə əvəz edilib (Entries Forms kimi app shell-də, WP_List_Table yox). §8 də orada dəqiqləşdirilib.

### 7.1 Menyu

Quoteform menyusunun altında **Forms** (mövcud builder) və **Entries**. Entries yanında oxunmamış say nişanı
(WP Comments `awaiting-mod` naxışı; `status='completed' AND read_at IS NULL`).

### 7.2 Siyahı (`WP_List_Table`)

Sütunlar: ☐ · **Entry** (`#41` + `New` nişanı) · **Name** · **Email** · **Form** · **Total** · **Date**.

- **Name/Email avtomatik:** snapshot-dakı ilk `text` tipli sahə → Name, ilk `email` → Email (mailto). Yoxdursa `—`.
- **Total** müraciətin öz valyutası/formatı ilə (breakdown snapshot); `NULL` → `—` + "calculation failed" izahı.
- **Date** saytın saat qurşağında (`wp_date`).
- Sıralama: Date, Total. Səhifədə 20 (Screen Options ilə dəyişir).
- Filtrlər: Form (select), Status (All / New / Read), tarix aralığı (from–to), total aralığı (min–max).
- Sətir əməliyyatları: View, Delete. Toplu: Delete, Mark as read, Mark as unread.

### 7.3 Detal (`?page=quoteform-entries&entry=ID`)

Başlıq (Entry #ID, forma, tarix, status) · **Answers** (label → dəyər; checkbox/radio variant label-ləri; toggle Yes/No)
· **Price breakdown** (saxlanmış sətirlər + total; göndərmə anının formatı) · **Details** (IP varsa, brauzer,
istifadəçi) · Delete (təsdiqlə). Açılanda `read_at` doldurulur.

### 7.4 Capability-lər

| Əməliyyat | Capability |
|---|---|
| Siyahı, detal, oxunmuş/oxunmamış | `qform_view_entries` |
| CSV eksport | `qform_export_entries` |
| Silmə (tək və toplu) | `qform_manage_forms` |

Bütün yazma əməliyyatları nonce + capability yoxlaması ilə (əsas spec §15).

## 8. CSV eksport

`admin-post.php?action=qform_export_entries` + cari filtrlər + nonce; streaming (`php://output`), 500 sətirlik paketlər.

- **Bir forma seçilib:** sabit sütunlar (id, date, status, total, currency) + formanın **cari** sahələri üzrə bir sütun
  (sütun başlığı = label; müraciətdə olmayan sahə boş) + açılış sətirləri üzrə sütunlar.
- **All forms:** sabit sütunlar + form + "Answers" (`Label: dəyər; …`).
- **CSV injection:** `=`, `+`, `-`, `@`, TAB, CR ilə başlayan xananın əvvəlinə `'`.
- UTF-8 BOM (Excel). Tarix saytın saat qurşağında. Fayl adı `quoteform-entries-YYYY-MM-DD.csv`.

## 9. Əlçatanlıq və i18n

- Submit düyməsi, uğur paneli, xəta zolağı — mövcud `announce.js` canlı sahəsindən elan; fokus idarəsi yuxarıda.
- Honeypot əlçatanlıq ağacından kənardadır.
- Admin siyahısı/detal — WP core naxışları (WP_List_Table, `.wrap`, `.wp-heading-inline`).
- Bütün yeni sətirlər `'quoteform'` domain-i ilə; `make makepot` plan sonunda.

## 10. Əsas spec-dən qəsdən sapmalar (istifadəçi təsdiqi ilə)

| Əsas spec | Bu sənəd | Səbəb |
|---|---|---|
| §12 "siyahıda göstər" işarələnmiş sahələr | Avtomatik Name (ilk text) + Email (ilk email) | Sxem/builder/validator dəyişikliyi olmadan dəyər; istifadəçi seçdi |
| §6.3 status yalnız draft/completed | + `read_at` (New/Read) | Status sahəsini "oxunub" mənası ilə yükləməmək |
| §15 "minimum doldurma vaxtı" | Serverin imzaladığı ticket ilə ölçülür | Brauzerin vaxtına etibar edilmir; keşlə uyğun |
| §10.1 endpoint siyahısı | + `GET /session` | Keşlənmiş səhifələrdə nonce köhnəlməsin |
| §12 silmə haqqında susur | Silmə `qform_manage_forms` tələb edir | Baxmaq icazəsi silmə icazəsi olmamalıdır |
| §4.4-ün ilk variantı: mətn `sanitize_text_field` / `sanitize_textarea_field` ilə | **Ruling R15:** text/tel/email/textarea xam saxlanılır (yalnız etibarsız UTF-8 → 400, uzunluq həddi) | Paritet: server brauzerin qiymətləndirdiyi eyni sətri qiymətləndirməlidir (`"MEMBER "` trim olunsa, brauzerin gizlətdiyi məcburi sahə 422 verirdi); escape çıxışda |

## 11. Yoxlama

1. **Paritet:** `submissions.json` Jest + PHPUnit (PHP 8.2 və 7.4), §3.2 əhatəsi.
2. **PHP vahid:** `SpamGuard` (saat/açar inject), `InputSanitizer` (hər tip), `MoneyFormatter` (JS `format.js` ilə eyni hallar).
3. **İnteqrasiya:** `EntriesTable` install/upgrade (+ multisite yeni sayt), `EntryRepository` (filtrlər, sıralama, say),
   `EntriesController`/`SessionController` (201/400/403/404/422/spam, no-store başlığı), `CsvExporter` (injection, BOM,
   sütunlar, filtrlər), capability-lər, `Uninstaller` DROP.
4. **Jest (frontend):** submit düyməsinin yeri, hər cavab növü, ikiqat klik, sessiya yenilənməsi, honeypot markup-ı.
5. **e2e:** real göndəriş → müraciət bazada; gizlədilmiş son addım; honeypot; köhnəlmiş nonce; 422-dən sonra düzgün addım;
   admin: müraciət siyahıda "New", detal açılanda "Read", CSV yüklənir.
6. `make check` + `make e2e` (e2e-dən əvvəl dev DB backup — Plan 05 hadisəsi).
