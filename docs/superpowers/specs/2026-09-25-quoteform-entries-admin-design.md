# Quoteform — Admin: müraciətlər ekranı (Plan 07)

**Tarix:** 2026-09-25
**Status:** Təsdiqlənmiş dizayn, implementasiya planı gözlənilir (Plan 07)
**Əsas:** `2026-09-24-quoteform-submissions-entries-design.md` §7–§9. Bu sənəd onun **§7-sini əvəz edir**
(WP_List_Table → Forms ilə eyni app shell), §8 (CSV) və §9-u dəqiqləşdirir. Toxunulmayan hər şey o sənəddə qalır.

## 1. Niyə dəyişdi

Plan 06 spec-i Plan 05 admin redizaynından əvvəl yazılmışdı və siyahı üçün `WP_List_Table` nəzərdə tuturdu.
Forms siyahısı artıq öz app shell-imizdədir; Entries standart WP cədvəli olsa, admin iki fərqli dildə danışardı.
İstifadəçi qərarı: **Entries Forms kimi** — eyni shell, eyni komponentlər (React + REST).

## 2. Arxitektura

### 2.1 Menyu
- Quoteform yuxarı menyusu altında **Forms** (mövcud builder) və **Entries** (`?page=quoteform-entries`).
- Entries yanında oxunmamış say nişanı (WP Comments `awaiting-mod` naxışı): `status='completed' AND read_at IS NULL`.
- Yuxarı menyu `qform_view_entries` VƏ YA `qform_manage_forms` olan istifadəçiyə görünür; Forms alt bəndi
  `qform_manage_forms`, Entries `qform_view_entries` tələb edir. Yalnız entry görə bilən redaktor Entries-ə çatır.

### 2.2 Ayrıca JS paketi
- Yeni webpack girişi `admin-src/entries.js` → `build/entries.js` (+ `.asset.php`, stil). Builder kodu bu səhifədə
  yüklənmir. Asset-lər yalnız Entries səhifəsinin hook suffix-ində.
- Ortaq: `admin-src/components/*`, `admin-src/styles/*` (tokens, shell, list), `admin-src/lib/dates.js`,
  `admin-src/api/client.js`. Kök element `<div id="quoteform-entries-root">` `.quoteform_builder` sinfi ilə
  (mövcud stillər eyni əhatədə işləsin).

### 2.3 URL vəziyyəti
- Filtrlər, səhifə, sıralama və açıq müraciət query string-dədir:
  `form`, `status` (`new`/`read`), `from`, `to` (`YYYY-MM-DD`), `min`, `max`, `orderby` (`date`/`total`),
  `order` (`asc`/`desc`), `paged`, `entry`.
- Səhifə ölçüsü URL-də deyil, yalnız user meta-dadır (`qform_entries_per_page`) — paylaşılan link başqasının seçimini dəyişməsin (Plan 07 D1).
- Filtr/sıralama/səhifə dəyişikliyi `history.replaceState`; detal açma/bağlama `pushState` — "geri" düyməsi işləyir.
  `popstate` URL-dən vəziyyəti yenidən oxuyur. Etibarsız parametrlər səssizcə default-a düşür.

### 2.4 REST (`quoteform/v1`, cookie auth + `X-WP-Nonce` — admin apiFetch)

| Endpoint | Nə edir | Capability |
|---|---|---|
| `GET /entries` | siyahı: filtr, sıralama, səhifələmə; cavab `{ items, total, pages, unread }` | `qform_view_entries` |
| `GET /entries/{id}` | detal + əvvəlki/sonrakı id (cari filtr daxilində); oxunmamışdısa `read_at` yazır | `qform_view_entries` |
| `POST /entries/batch` | `{ action: 'read' \| 'unread' \| 'delete', ids: int[] }` → `{ affected }` | read/unread: `view`; delete: `qform_manage_forms` |
| `DELETE /entries/{id}` | tək silmə | `qform_manage_forms` |

- Mövcud ictimai `POST /entries` (göndəriş) dəyişmir; eyni route-a yeni metodlar əlavə olunur, hər metodun öz
  `permission_callback`-i var.
- `ids` 1–100 element, yalnız müsbət tam ədədlər; artığı `400`.
- Məbləğlər **serverdə** formatlanır (`Runtime\MoneyFormatter`, müraciətin saxlanmış valyuta/format snapshot-ı ilə).
  Cavabda həm xam `total` (string|null), həm `total_display` (string) olur. JS-də ikinci format kodu yoxdur.
- Detal cavabı Answers-i hazır şəkildə verir: `[{ key, label, type, display }]` — checkbox/radio üçün variant
  label-ləri, toggle `Yes`/`No` (tərcümə olunur), boş `''` (UI `—` göstərir).

### 2.5 Təhlükəsizlik
- Plan 06 R15: müraciət mətni xam saxlanılır. React mətni hər zaman text node kimi göstərir;
  `dangerouslySetInnerHTML` Entries kodunda qadağandır (test yoxlayır).
- Bütün yazma əməliyyatları: REST nonce + capability. CSV: `admin-post` nonce + `qform_export_entries`.

## 3. Ekranlar

### 3.1 Siyahı
- **Üst zolaq:** "Entries" + ümumi say; sağda **Export CSV** (yalnız `qform_export_entries` olana).
- **Filtr zolağı:** Form (All forms / hər forma / "Deleted forms" — silinmiş formaların müraciətləri varsa),
  Status (All / New / Read), tarix aralığı (from–to), total aralığı (min–max), **Clear filters**.
  Dəyişiklik siyahını avtomatik yeniləyir (mətn/rəqəm sahələri üçün qısa debounce).
- **Cədvəl** (`<table>`, `<caption>`):

| Sütun | Məzmun |
|---|---|
| ☐ | "Select entry #41" |
| Entry | `#41` + oxunmamışsa **New** nişanı; oxunmamış sətir qalın |
| Name / Email | snapshot-dakı ilk `text` / ilk `email` sahəsi; email `mailto`; yoxdursa `—` |
| Form | forma adı (redaktora link); silinibsə "(deleted form)" |
| Total | `total_display`; `NULL` → `—` + "Calculation failed" izahı |
| Date | saytın saat qurşağında; `title`-da tam tarix |

- Sıralama: Date və Total başlıqları (`aria-sort`); default Date desc.
- Sətir əməliyyatları: View, Delete.
- **Toplu zolaq** (seçim olanda): "N selected · Mark as read · Mark as unread · Delete". Silmə `RemoveConfirm` ilə.
  Nəticə announcer ilə elan olunur ("3 entries deleted.").
- **Səhifələmə:** `‹ 1 2 3 ›` + "Per page: 20 / 50 / 100"; seçim user meta-da (`qform_entries_per_page`).
- **Boş hallar:** heç müraciət yoxdur → izah + shortcode ipucu; filtrə uyğun yoxdur → "No entries match" + Clear filters.

### 3.2 Detal (`&entry=ID`)
- **Üst zolaq:** "← Back to entries" · "Entry #41" · forma · tarix · status; sağda **Mark as unread**, **Delete**.
- **Older / Newer** oxları — cari filtr və sıralama daxilində qonşu müraciətlər (sərhəddə deaktiv).
- **Answers:** label → dəyər; çoxsətirli mətn sətirləri qoruyur (`white-space: pre-wrap`); boş `—`.
- **Price breakdown:** saxlanmış sətirlər + total (göndərmə anının formatı); `breakdown.error` varsa izah.
- **Details:** IP (saxlanıbsa), brauzer (user agent), istifadəçi (profilə link), göndərmə vaxtı.
- Açılanda oxunmamışdısa oxunur; menyu nişanı və siyahıdakı `unread` yenilənir. Təkrar açılış `read_at`-ı dəyişmir.
- Mövcud olmayan id → "Entry not found" + "Back to entries".

### 3.3 Əlçatanlıq
- Formada olduğu kimi tək canlı sahə (mövcud announcer). Səhifə dəyişəndə və detal açılıb-bağlananda fokus başlığa.
- Ekran dar olanda cədvəl kart görünüşünə keçmir — üfüqi sürüşən konteyner (`tabindex="0"`, `role="region"`, ad ilə).

## 4. Server sorğuları və kənar hallar

- Hamısı `$wpdb->prepare`; `orderby` ağ siyahı (`created_at`, `total`, `id` tie-breaker), `order` yalnız ASC/DESC;
  `per_page` 1–100-ə sıxılır; yalnız `status = 'completed'` sətirlər (draft — gələcək save & resume üçün).
- **Tarix:** admin saytın saat qurşağında seçir; server `from 00:00:00` və `to 23:59:59` yerli vaxtı UTC-yə çevirib
  `created_at` (UTC) ilə müqayisə edir. `to` günü tam daxildir.
- **Total:** DECIMAL sütunu üzrə; total filtri aktivdirsə `NULL` total-lı sətirlər düşmür.
- **Oxunmamış say:** `status_read` indeksli bir `COUNT`; menyu nişanı eyni metoddan.
- **Name/Email:** yalnız qaytarılan səhifənin sətirləri üçün PHP-də snapshot-dan çıxarılır (sütun yoxdur).
- **Silinmiş forma:** forma adı üçün tək `WP_Query`/`get_posts` (`post__in`), tapılmayan id → "(deleted form)";
  "Deleted forms" filtri mövcud formaların id-lərinə `NOT IN`.
- **Toplu silmə yarışı:** artıq silinmiş id-lər səhv sayılmır; `affected` real silinən sayı qaytarır.
- Axtarış qutusu yoxdur (YAGNI; sonra əlavə etmək asandır).

## 5. CSV (əsas spec §8 + dəqiqləşdirmə)

- `admin-post.php?action=qform_export_entries` + cari filtrlər (siyahı ilə EYNİ sorğu qurucusu) + nonce; streaming,
  500 sətirlik paketlər.
- Forma seçilib: sabit sütunlar (id, date, status, total, currency) + formanın **cari** sahələri (başlıq = label) +
  açılış sətirləri. All forms: sabit sütunlar + form + "Answers" (`Label: dəyər; …`).
- CSV injection: `=`, `+`, `-`, `@`, TAB, CR ilə başlayan xananın əvvəlinə `'`.
- **Yeni:** idarəedici simvollar (`\x00–\x08`, `\x0B`, `\x0C`, `\x0E–\x1F`, `\x7F`) yalnız CSV-də silinir (Plan 06 R15:
  saxlanma xamdır).
- UTF-8 BOM; tarix saytın saat qurşağında; fayl adı `quoteform-entries-YYYY-MM-DD.csv`.

## 6. Yoxlama

1. **PHP inteqrasiya:** hər yeni endpoint üçün capability-siz `403`; filtrlər (forma, status, tarix sərhədləri
   saat qurşağı ilə, total, deleted forms); sıralama ağ siyahısı (inyeksiya cəhdi default-a düşür); səhifələmə;
   batch (read/unread/delete, 100-dən artıq id → 400); `read_at` bir dəfə; qonşu id-lər; `total_display`;
   `CsvExporter` (injection, BOM, idarəedici simvollar, forma sütunları, silinmiş forma, çoxbaytlı mətn); menyu nişanı.
2. **Jest:** URL ↔ vəziyyət (parse/serialize, etibarsız dəyərlər), filtr zolağı, toplu zolaq, sıralama `aria-sort`,
   səhifələmə, boş hallar, detal render (checkbox label-ləri, toggle, boş, `<b>` mətn kimi), Older/Newer, tək canlı
   sahə, `dangerouslySetInnerHTML` yoxdur.
3. **e2e:** göndər → Entries-də **New** + menyu nişanı artır → aç → **Read** → CSV yüklənir və məzmunu yoxlanılır →
   sil. Dev formaları (8, 40, 328) qorunur; DB backup əvvəlcədən.
4. `make check`, `make makepot`.
