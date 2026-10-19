# Quoteform — Admin UI yenidən dizaynı

**Tarix:** 2026-09-23
**Status:** Təsdiqlənmiş dizayn, implementasiya planı gözlənilir
**Əsas spec:** `2026-09-15-quoteform-design.md` — ziddiyyət olarsa o qalib gəlir. Bu sənəd ona zidd deyil:
§12-dəki `WP_List_Table` tələbi entry siyahısına aiddir, formalar siyahısına yox.

---

## 1. Niyə

Admin builder (Plan 03) funksional baxımdan tamdır və testlərlə qorunur, amma vizual olaraq demək olar ki,
stilsizdir: `admin-src/style.scss` üç sətirdir, bütün düymələr brauzerin default düymələridir, etiketlər
input-un solunda "Rule 1 condition 1 operator" kimi uzun mətnlərlə düzülür, tablar arasında xətanın harada
olduğu görünmür. Formalar siyahısında tarix ISO formatındadır və istifadəçi formanı səhifəyə necə
yerləşdirəcəyini heç yerdə görmür.

Müştəri tərəfli forma artıq yenidən dizayn olunub (kart görünüşü, `--quoteform-accent`). Bu iş admin tərəfini
eyni keyfiyyət səviyyəsinə gətirir.

## 2. Hədəf və uğur meyarı

- Builder müasir, səliqəli "tətbiq" kimi görünür (istiqamət **B**: üst zolaq + sol bölmə menyusu + kartlar).
- WP admin rəng sxeminə uyğunlaşır (`--wp-admin-theme-color`).
- **Əlçatan adlar və rollar dəyişmir — bir adlandırılmış istisna ilə:** menyu tabı "Calculations" →
  "Pricing" (§4.2). Mövcud Jest (≈960) və e2e (9) testləri bu istisnaya aid sətirlərdən başqa
  dəyişdirilmədən keçir — bu, dizaynın davranışa toxunmadığının əsas sübutudur.
- Üç ekran əhatə olunur: redaktor, formalar siyahısı, Gutenberg bloku.

## 3. Əhatədən kənar (qəsdən)

- **Preview** düyməsi / önizləmə səhifəsi — yeni PHP marşrutu tələb edir; sonrakı "kətan + canlı önizləmə"
  (istiqamət C) işinə aiddir.
- Fields və Steps-in birləşdirilməsi, sürüklə-burax — C işinə aiddir.
- `@wordpress/components`-ə keçid — rədd edilib (bax §9).
- Reducer, state, API client, REST, sxem, frontend — **toxunulmur.** PHP-yə yeganə toxunuş: `Block.php`
  blokun redaktor stilini (`build/style-block.css`) `editor_style` kimi qeyd edir (§7) — hazırda blokun
  heç bir stili yoxdur, stil faylı başqa yolla redaktora çatmır.

## 4. Qabıq (redaktor ekranı)

### 4.1 Üst zolaq

`position: sticky`, WP admin bar-ın altında (`top: var(--wp-admin--admin-bar--height, 32px)`; admin bar 600px-ə
qədər `position: fixed` qalır və ≤782px-də 46px hündürdür — dəyişən bunu özü verir; admin bar yalnız
≤600px-də statik olur, `top: 0` yalnız orada).

Soldan sağa:

1. `← Forms` — hazırkı "Back to all forms" düyməsi. **Görünən mətn "← Forms", əlçatan ad dəyişmir:**
   `aria-label="Back to all forms"` (görünən "Forms" sözü adın içindədir → WCAG 2.5.3 qorunur).
   Mövcud "unsaved changes" axını eynidir.
2. `/` ayırıcı (dekorativ, `aria-hidden`).
3. Forma başlığı inputu — hazırkı `TextControl` (`id="quoteform_form-title"`). Görünüşcə başlıq kimi
   (böyük şrift, border yalnız hover/fokusda), görünən etiket gizlidir, `label` elementi qalır.
4. `● Unsaved changes` — sarı badge (hazırkı `quoteform_editor__dirty`).
5. **Save** — primary düymə; `state.saving` zamanı `disabled` + `aria-busy="true"` və mətnin yanında
   dekorativ spinner (CSS). Mətn "Save" qalır — "Saving…"-ə dəyişmək əlçatan adı dəyişərdi.

"Saved." və saxlama xətası notice-ləri zolağın altında, məzmunun üstündə göstərilir (komponent eynidir).
"Leave anyway?" təsdiqi səhifənin sonundan zolağın altına köçür (sarı xəbərdarlıq zolağı); fokus
idarəsi (`stayButtonRef`) dəyişmir.

Səhifənin `<h1>Edit form</h1>` başlığı qalır (fokus hədəfidir, `headingRef`), amma vizual olaraq
`.screen-reader-text`-dir — görünən başlıq rolunu zolaqdakı forma adı oynayır.

### 4.2 Gövdə

İki sütunlu grid: `sol menyu (180px) | məzmun (1fr)`, maksimum en 1280px.

**Sol menyu (`SectionNav`)** — hazırkı `<nav aria-label="Builder sections">` + `aria-current="page"`
semantikası qalır, sadəcə vertikal düzülür. Sıra və görünən adlar:

| Tab | Görünən ad | Sayğac |
|---|---|---|
| `fields` | Fields | `Object.keys(schema.fields).length` |
| `steps` | Steps | `schema.steps.length` |
| `calculations` | **Pricing** | `schema.calculations.length` |
| `rules` | Rules | `schema.rules.length` |
| `settings` | Settings | — |

Daxili tab açarı `calculations` və panelin `<h2>Calculations</h2>` başlığı **dəyişmir** — yalnız menyu
düyməsi "Pricing"dir.

**"Pricing" — yeganə əlçatan ad dəyişikliyi.** Düymənin əlçatan adı da "Pricing" olur. Görünən mətn
"Pricing", ad isə "Calculations" qalsaydı, WCAG 2.5.3 (Label in Name) pozulardı — səslə idarə edən
istifadəçi "click Pricing" deyib düyməni tapmazdı. Nəticə: tabı `name: 'Calculations'` ilə axtaran
test sətirləri `'Pricing'`-ə yenilənir — `tests/js/admin/EditorScreen.test.js:193` və
`tests/e2e/builder.spec.js:83, 98, 120, 198`. Başqa heç bir ad dəyişmir.

**Sayğac və xəta nöqtəsi.** `hasErrorsUnder(errorIndex, '<tab açarı>')` doğrudursa (məs. `'fields'`,
`'calculations'`, `'settings'` — funksiya prefiksi özü seqment sərhədində yoxlayır), menyu elementinin yanında qırmızı nöqtə. Sayğac və nöqtə **ada daxil edilmir** — ad tam
olaraq "Fields", "Steps" və s. qalır (testlər adı tam uyğunluqla axtarır). Onlar düymənin
`aria-describedby`-si ilə bağlanan gizli mətndədir: `"11 items"`, `"11 items, has a problem"`.
Vizual rəqəm və nöqtə `aria-hidden`-dir (iki dəfə oxunmasın).

**Dar ekran (< 960px):** menyu üfüqi, üfüqi sürüşən zolağa çevrilir, məzmunun üstündə.

## 5. Panellər

Ümumi naxış: panel başlığı (`<h2>` — mövcud id-lər saxlanılır) + bir cümləlik izah + sağda "Add …" düyməsi;
altında elementlər ağ kartlarda.

### 5.1 Fields

İki sütun: sol — sahələr siyahısı (kart), sağ — seçilmiş sahənin `FieldEditor`-u (kart, `position: sticky`).
- Siyahı sətri: ad, tip badge-i, "Has a problem" qırmızı badge-i, ghost "Remove".
- Seçilmiş sətir aksent border + açıq fon (`aria-current="true"` artıq var).
- "Field type" select + "Add field" siyahının başında.
- Heç bir sahə seçilməyibsə sağ sütunda boz boş vəziyyət: "Select a field to edit it."
- < 1100px: iki sütun alt-alta düşür (redaktor siyahının altında — indiki DOM sırası).

### 5.2 Steps

Hər addım bir kart: dairəvi nömrə, başlıq, `MoveButtons` (↑↓, ghost), "Remove step" (danger).
Title və description yan-yana (g2). "Fields on this step" altında sahələr **chip** kimi: chip-in
✕ düyməsi hazırkı "Take off" düyməsidir (əlçatan ad `Take off this step: %s` dəyişmir, görünən mətn "✕").
Addımsız sahələr (`quoteform_unplaced`) addım kartlarının altında sarı kəsik-xətli qutuda — "Put %s on"
select-i və "Put on step" düyməsi yalnız orada olur (mövcud davranış). "Step N title/description"
etiketləri `visibleLabel` ilə "Title"/"Description" görünür.

### 5.3 Pricing (Calculations)

Hər hesablama bir kart: nömrə, label, boz monospace `{key}`, ↑↓, "Remove" (danger).
Label və Key yan-yana; Formula monospace, açıq boz fonda, tam en; altında "valid/invalid" statusu;
"What can I use here?" `<details>`-i formulanın altında. Görünüş toggle-ı tam etiketini saxlayır
("Show calculation 1 to the visitor") — qısa "Show to visitor" tam adın sonluğu deyil (§5.6).
`FormulaEditor` da `visibleLabel` qəbul edir.

### 5.4 Rules

Hər qayda bir kart. Birinci sətir **cümlə** kimi bir sırada (flex-wrap), **DOM sırası ilə** —
vizual sıranı CSS `order` ilə dəyişmək Tab sırasını ekran sırasından ayırardı (WCAG 2.4.3):
`[target kind] [target] → [action] · when [match]` (məs. "Field · Pets → Show · when All conditions
must match"). Şərtlər altında boz sətirlərdə: `if|and [field] [operator] [value] [Remove condition]`.
"→", "when", "if/and" dekorativ bağlayıcılardır (`aria-hidden`). Cümlədəki dörd select və şərt
sətirlərinin select/inputları `hideLabel` alır — əlçatan adları olduğu kimi qalır.

### 5.5 Settings

Üç kart, hər birinin kiçik böyük hərfli başlığı (`<h3>`):
- **Money:** Currency, Currency position, Decimal places (üç sütun).
- **After submitting:** Submit button label, "After a successful submission" (**select olaraq qalır** —
  radio-ya çevirmək rolu dəyişərdi), Redirect URL / Success message.
- **Visitors:** Let visitors save and resume, Store the visitor's IP address (switch görünüşlü toggle).

### 5.6 Ümumi qaydalar

- **Qısa görünən etiket + tam əlçatan ad.** `TextControl`, `SelectControl`, `NumberControl`,
  `ToggleControl`-a iki yeni, bir-birini istisna edən prop:
  - `visibleLabel` — tam label-in **sonluğu** (böyük/kiçik hərfə həssas olmayan müqayisə). Label mətni
    iki hissəyə bölünür: `<label><span class="screen-reader-text">Calculation 1 </span><span class="quoteform_label-visible">formula</span></label>`.
    `label` elementinin mətni — yəni əlçatan ad — **simvolu-simvoluna eyni qalır**; görünən hissənin ilk
    hərfi CSS ilə böyüdülür (`::first-letter`, `display: inline-block`) — CSS çevrilməsi ada təsir etmir.
    Görünən söz adın içindədir → WCAG 2.5.3 qorunur. `visibleLabel` sonluq deyilsə, komponent tam label-i
    göstərir (təhlükəsiz geri dönüş).
  - `hideLabel` — label tamamilə `.screen-reader-text`. **Yalnız** üç yerdə icazəlidir: Rules
    cümləsindəki select/inputlar (kontekst cümlənin özüdür), üst zolaqdakı forma başlığı inputu və
    siyahıdakı Shortcode `CopyField`-i (kontekst sütun başlığıdır). Hamısında `label` elementi və
    əlçatan ad olduğu kimi qalır.
- **Remove** düymələri danger-ghost (qırmızı mətn). Inline təsdiq qutuları (`quoteform_confirm`,
  `RemoveConfirm`) sarı xəbərdarlıq zolağı kimi stillənir; fokus davranışı dəyişmir.
- **Boş vəziyyətlər** kartın içində, mərkəzdə, "Add …" düyməsi ilə.
- `quoteform_warning` — sarı zolaq; `FieldError` — qırmızı mətn + ⚠ nişanı (rəng tək siqnal deyil).

## 6. Formalar siyahısı

Eyni qabıq, sol menyusuz.
- Başlıq zolağı: `<h1>Quoteform</h1>` (görünür) + sağda primary "Create a form".
- Cədvəl ağ kartda. Sütunlar: **Form** | **Shortcode** | **Last modified** | **Actions**.
  - Form: qalın **mətn** (düymə deyil — "Edit" ilə eyni işi görən ikinci Tab dayanacağı yaratmırıq)
    + altında boz `ID 328`. "Edit" düyməsi və əlçatan adı (`Edit “%1$s” (form %2$d)`) Actions-da qalır.
  - **Shortcode (yeni):** `CopyField` — readonly input `[quoteform id="328"]` + "Copy" düyməsi.
  - Last modified: `form.modified` → `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })`;
    `locale` — `document.documentElement.lang` (WP bunu admin dilinə qoyur), boşdursa brauzer default-u.
    Tarix parse olunmursa xam dəyər göstərilir.
  - Actions: "Edit" (secondary), "Trash" (danger-ghost).
- Boş vəziyyət: kalkulyator ikonu (dashicon), "No forms yet. Create your first one.", primary düymə.
- Səhifələmə kartın altında sağda: mövcud nömrələnmiş düymələr (`<nav aria-label="Form list pages">`,
  `aria-current="page"`) kiçik kvadrat düymələr kimi stillənir; markup dəyişmir.

### 6.1 `CopyField`

- Props: `value`, `label` (əlçatan ad, məs. `Shortcode for “%s”`).
- Klik: `navigator.clipboard?.writeText` varsa və uğurlu olarsa → statusda "Copied." (1.5s sonra təmizlənir).
- Clipboard API yoxdursa (HTTP sayt) və ya rədd edilərsə → input-un mətni seçilir (`select()`) və statusda
  "Press Ctrl+C to copy." (macOS-da "⌘C").
- Status: komponentin öz `role="status"` elementi.

## 7. Gutenberg bloku

Kətanda WP placeholder görünüşünə yaxın kart (`quoteform_block`):
başlıqda kalkulyator dashicon + "Quote form"; altında "Which form?" select; seçiləndə yaşıl nöqtə ilə
"Visitors will see “…” here."; problem halları (`quoteform_block__problem`) sarı zolaq.
Stil `admin-src/block/style.scss`-dədir və `admin-src/block/index.js`-dən import olunur → wp-scripts onu
`build/style-block.css` (+ RTL) kimi çıxarır. `Block.php` onu `quoteform-block-editor` handle-ı ilə
`wp_register_style` edir və `register_block_type`-a `editor_style` kimi ötürür (skriptlə eyni naxış:
manifest/fayl yoxdursa, stil sadəcə qeyd olunmur, blok yenə qeyd olunur). Frontend bundle-a toxunulmur.
Blokun kətanı WP 6.3+-da iframe-dir və orada WP admininin `common.css`-i yoxdur — ona görə blok stili
`.screen-reader-text` üçün öz ehtiyat qaydasını daşıyır.

## 8. Dizayn sistemi

`admin-src/style.scss` → partial-lara bölünür (`admin-src/styles/`):
`_tokens.scss`, `_shell.scss`, `_controls.scss`, `_panels.scss`, `_list.scss`; blok üçün ayrıca
`admin-src/block/style.scss`.

Tokenlər (`.quoteform_builder` üzərində):

| Token | Dəyər |
|---|---|
| `--qf-accent` | `var(--wp-admin-theme-color, #2271b1)` |
| `--qf-accent-dark` | `var(--wp-admin-theme-color-darker-10, #135e96)` |
| `--qf-bg` | `#f0f0f1` |
| `--qf-surface` | `#fff` |
| `--qf-border` | `#dcdcde` |
| `--qf-field` | `#8c8f94` |
| `--qf-text` / `--qf-muted` | `#1d2327` / `#646970` |
| `--qf-danger` / `--qf-warning-bg` / `--qf-success` | `#b32d2e` / `#fcf9e8` / `#00a32a` |
| `--qf-radius` / `--qf-control-radius` | `8px` / `6px` |

Qaydalar: bütün selektorlar `.quoteform_builder` altında (WP admininin qalanına sızma yoxdur);
yalnız məntiqi xassələr (`margin-inline-*`, `inset-inline-*`) — `wp-scripts`-in yaratdığı RTL faylı
düzgün işləsin; fokus halqası `2px solid var(--qf-accent)`; `prefers-reduced-motion` hörmət olunur.

**Yeni kiçik komponentlər** (`admin-src/components/`):

| Komponent | Nə edir |
|---|---|
| `Button` | `variant: primary \| secondary \| ghost \| danger`; `forwardRef` (mövcud ref-lər üçün); `type="button"` default |
| `Card` | `<div class="quoteform_card">` + ixtiyari başlıq sətri |
| `SectionNav` | §4.2 — tablar, sayğac, xəta nöqtəsi |
| `CopyField` | §6.1 |

Mövcud düymələr tədricən `Button`-a keçirilir; `ref`, `onClick`, `disabled`, `aria-*` eyni qalır.

## 9. Rədd edilən yanaşmalar

- **`@wordpress/components`-ə keçid** — 8 komponent + 14 test faylı yenidən yazılmalı idi; Jest WP
  paketlərini React-versiya fərqlərinə görə qəsdən stub-la əvəz edir (Plan 03 qərarı); bundle böyüyür və
  WP 6.2–7.x arasında markup dəyişə bilir. Vizual qazanc öz CSS-imizlə də əldə olunur.
- **Hibrid (WP `button-primary` + öz CSS)** — iki dizayn dili qarışır.

## 10. Əlçatanlıq

- Bütün mövcud əlçatan adlar, rollar və fokus idarəsi dəyişmir (§2).
- Vizual gizlətmə üçün WP-nin öz `.screen-reader-text` sinfi.
- Kontrast: mətn ≥ 4.5:1, UI sərhədləri ≥ 3:1 (`#8c8f94` input border ağ fonda 3.3:1).
- Rəng heç vaxt tək siqnal deyil: xəta nöqtəsi + əlçatan mətn; xəta mesajı + ⚠.

## 11. Yoxlama

1. **Mövcud dəstlər dəyişmədən keçir:** `make check` (PHP 8.2/7.4, Jest, inteqrasiya, buildcheck) və
   `make e2e`. Mövcud test faylına dəyişiklik yalnız o halda caizdir ki, test **markup detalını**
   (məs. sinif adı) yoxlasın, davranışı yox — belə hal olarsa, plan onu ayrıca adlandırır.
2. **Yeni Jest testləri:**
   - `SectionNav`: sayğaclar, xəta nöqtəsi, əlçatan ad formatı, `aria-current`, "Pricing" etiketi.
   - `visibleLabel`: əlçatan ad dəyişmir; sonluq olmayan `visibleLabel` tam label-ə geri düşür.
   - `CopyField`: clipboard uğurlu; clipboard yoxdur → seçim + ipucu; clipboard rədd edir → eyni.
   - Tarix formatı: etibarlı ISO → formatlanmış; etibarsız → xam dəyər.
   - Siyahı: shortcode sütunu `[quoteform id="N"]` göstərir.
   - Üst zolaq: saxlama zamanı Save `aria-busy="true"`, adı "Save" qalır.
3. **Görünən etiket qoruyucusu:** hər panel üçün test — `hideLabel` işarəsi daşımayan hər `label`
   elementinin `.screen-reader-text`-dən kənar mətni boş deyil (səhvən tam gizlədilmiş etiketi tutur);
   `hideLabel`-li label-lər yalnız §5.6-da icazə verilən üç yerdə tapılır.
4. **Vizual:** Playwright ilə hər ekran/panel üçün əvvəl/sonra ekran görüntüləri, 1280px və 782px;
   ən azı bir fərqli admin rəng sxemində (məs. "Ocean") aksentin dəyişdiyi yoxlanılır.
