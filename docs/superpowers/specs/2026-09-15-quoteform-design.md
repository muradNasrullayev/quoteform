# Quoteform — Dizayn Sənədi

**Tarix:** 2026-09-15
**Status:** Təsdiqlənmiş dizayn, implementasiya planı gözlənilir
**Repo:** `~/Documents/projects/quoteform`

---

## 1. Xülasə

Quoteform — WordPress üçün pulsuz, çox-addımlı, şərti məntiqli forma qurucusudur və **qiymət/təklif hesablayan formalar** üzərində ixtisaslaşır.

Məhsul tam pulsuz olacaq: pro versiya, addon satışı, lisenziya və ya hosted xidmət yoxdur. Booknetic və digər FSCode məhsulları ilə heç bir kod və ya brend əlaqəsi yoxdur.

---

## 2. Pozisiyalanma

### 2.1 Niyə ümumi forma qurucusu deyil

Ümumi forma bazarı doymuşdur: WPForms Lite 5,000,000+, Contact Form 7 10,000,000+ quraşdırmaya malikdir. Pulsuz, yeni bir məhsulun bu sahədə fundamental fərqləndirici olmadan görünmə şansı yoxdur.

### 2.2 Seçilmiş niş: kalkulyator/təklif formaları

Bu nişdə mənzərə tamamilə fərqlidir (2026-09-15 tarixinə wordpress.org-dan yoxlanılıb):

| Plugin | Aktiv quraşdırma | Pulsuz versiyada şərti məntiq | Pulsuz versiyada çox-addım |
|---|---|---|---|
| Calculated Fields Form | 40,000+ | Məhdud — JS formula yazmaq tələb olunur | Xeyr (Pro) |
| Cost Calculator Builder | 20,000+ | Xeyr (Pro) | Xeyr (Pro) |
| Calculator Builder | 1,000+ | Xeyr | Xeyr |

İki nəticə:

1. Ən böyük oyunçu 40k-dır, 5M deyil — giriş maneəsi qat-qat aşağıdır.
2. Bizim iki əsas funksiyamız (şərti məntiq və çox-addım) **hər üç rəqibdə paywall arxasındadır**. Wedge realdır və ölçülə bilir.

### 2.3 Hədəf istifadəçi

Qiymətini konfiqurasiyaya görə hesablayan xidmət biznesləri: təmizlik, təmir/renovasiya, daşınma, fotoqrafiya, tədbir təşkilatı, çap, veb-studiya. Onların ehtiyacı sadə "əlaqə forması" deyil — müştəri konfiqurasiya seçir, qiymət canlı dəyişir, nəticədə təklif yaranır.

### 2.4 Fərqləndiricilər

- Şərti məntiq və çox-addım **pulsuzdur**.
- İstifadəçi JavaScript yazmır (rəqiblərin əsas UX problemi).
- Hesablamanın açılışı (breakdown) həm admin, həm müştəri üçün göstərilir — rəqiblərdə yoxdur.
- Frontend yüngüldür: React yoxdur, jQuery asılılığı yoxdur.
- Əlçatanlıq (a11y) birinci sinif tələbdir, sonradan yamaq deyil.

---

## 3. Ad və identifikatorlar

| Nə | Dəyər |
|---|---|
| Brend | Quoteform |
| wp.org slug | `quoteform` (2026-09-15-də boş olduğu təsdiqləndi) |
| Display Name | `Quoteform – Multi-Step Quote Calculator & Conditional Logic Forms` |
| PHP namespace | `Quoteform\` |
| Funksiya/hook/option prefiksi | `qform_` |
| DB cədvəl prefiksi | `{wp_prefix}qform_` |
| CSS sinif prefiksi | `.quoteform_` |
| Text domain | `quoteform` |

**Ad riskinin qiymətləndirilməsi:** wp.org qaydaları Display Name-in başqasının trademark-ı və ya "common term" ilə başlamasını qadağan edir. `quoteform` bitişik yazılmış coined compound-dur (Quform, FormCraft kimi təsdiqlənmiş nümunələr mövcuddur), ona görə risk orta hesab olunur. `quoteform.com` Porkbun marketplace-də satışdadır — arxasında aktiv məhsul yoxdur, yəni trademark münaqişəsi riski yoxdur. `quoteform.io` və `quoteform.app` sərbəstdir.

**Qeyd:** wp.org slug-ı təsdiqdən sonra yalnız bir dəfə dəyişdirilə bilir və review komandası bu tələbləri çətinliklə qəbul edir. Ad ilk təqdimatda düzgün olmalıdır.

---

## 4. Əhatə

### 4.1 v1.0-a daxildir

- Hesablama mühərriki (təhlükəsiz ifadə dili)
- Şərti məntiq (sahə və addım səviyyəsində)
- Çox-addımlı sihirbaz
- Entry idarəetməsi + CSV eksport
- Email bildirişi (admin + müştəri)
- Save & resume
- Spam qoruması (honeypot + minimum doldurma vaxtı)

### 4.2 v1.0-dan qəsdən kənardadır

| Funksiya | Səbəb |
|---|---|
| Ödəniş (Stripe/PayPal) | Webhook, refund, idempotency, PCI məsuliyyəti — v1.0-ı aylarla gecikdirər. v2-yə. |
| Fayl yükləmə | Təhlükəsizlik və storage idarəetməsi ayrıca iş həcmidir. |
| PDF təklif eksportu | Dəyərlidir, amma nüvə axını üçün məcburi deyil. |
| CRM/Zapier inteqrasiyaları | İstifadəçi bazası olmadan prioritet deyil. |
| Hesablama analitikası | v1.0 üçün lazımsız. |
| Xarici captcha (Turnstile/reCAPTCHA) | Honeypot v1.0 üçün kifayətdir; v1.1-də əlavə olunur. |

---

## 5. Arxitektura

### 5.1 Texniki minimum

- PHP 7.4+
- WordPress 6.2+
- Admin builder: React 18, `@wordpress/scripts` ilə build. Minimum 6.2-dir, çünki builder `@wordpress/element`-in `createRoot`-una söykənir, o isə core React 18-ə keçdiyi 6.2-də gəlib; 6.0/6.1 React 17 daşıyır və `createRoot` vermir.
- Frontend renderer: vanilla JS (ES6), build olunmuş, React və jQuery asılılığı **yoxdur**

### 5.2 Seçilmiş yanaşma və rədd edilənlər

**Seçilən: müstəqil React builder + yüngül vanilla frontend.**

Rədd edilən alternativlər:

- *Gutenberg-native (forma bloklardan qurulur).* Builder yazmaq lazım gəlmir, amma şərti məntiq və formula redaktoru blok sidebar-ının dar sahəsinə sığmır, çox-addım isə inner-block kimi yöndəmsizdir. Bizim əsas funksiyamız məhz o mürəkkəb məntiqdir — onu zəiflədən arxitektura qəbuledilməzdir.
- *jQuery builder, build step yoxdur.* Ən sadə başlanğıc, amma şərti məntiq qrafı və formula redaktoru ciddi state idarəetməsi tələb edir. Calculated Fields Form-un köhnəlmiş UX-i məhz buradan gəlir — rəqibin zəifliyini təkrarlamaq olmaz.

### 5.3 Kod strukturu

```
quoteform/
├── quoteform.php              # plugin headers, bootstrap
├── includes/
│   ├── Plugin.php             # yüklənmə, hook qeydiyyatı
│   ├── Forms/                 # CPT, sxem validasiyası
│   ├── Entries/               # cədvəl, repository, CSV eksport
│   ├── Engine/                # ifadə parseri + evaluator (PHP) — WP-dən asılı DEYİL
│   ├── Rendering/             # FormRenderer, shortcode, block, Elementor
│   ├── Notifications/         # email
│   ├── Rest/                  # REST controller-lər
│   └── Support/               # capability, sanitizasiya, locale helper-ləri
├── admin-src/                 # React builder mənbəyi
├── frontend-src/              # vanilla renderer mənbəyi
│   └── engine/                # ifadə mühərrikinin JS implementasiyası
├── build/                     # kompilyasiya olunmuş asset-lər
├── languages/
├── tests/
│   ├── fixtures/expressions.json   # PARİTET QAPISI — PHP və JS eyni faylı oxuyur
│   ├── php/                   # PHPUnit
│   ├── js/                    # Jest
│   └── e2e/                   # Playwright
└── docs/
```

### 5.4 Ən vacib memarlıq sərhədi

`includes/Engine/` **heç nə bilmir** — nə WordPress, nə forma, nə entry, nə HTTP. O, sadəcə ifadə mətni və dəyişən dəyərləri alıb nəticə qaytarır.

Bu təcridin səbəbi funksionaldır, estetik deyil: eyni mühərrik `frontend-src/engine/` içində JS-də də yazılacaq və ikisi hərfi mənada eyni nəticəni verməlidir. WordPress-dən asılı olmayan mühərrik həm izolyasiya ilə test edilə bilir, həm də iki dildə eyni formada saxlanıla bilir.

---

## 6. Data modeli

### 6.1 Formalar → CPT `quoteform`

Forma sxemi JSON kimi post meta-da (`_qform_schema`) saxlanılır.

CPT seçilməsinin səbəbi: siyahı cədvəli, trash/restore, revizyalar, capability sistemi və üçüncü tərəf duplikasiya pluginləri hazır gəlir. Revizyalar xüsusən dəyərlidir — istifadəçi formulu sındırsa, əvvəlki işlək versiyaya qayıda bilir.

CPT `public => false`, `show_ui => false` (öz React səhifəmiz var), `supports => ['title', 'revisions']`.

### 6.2 Sxem strukturu

```json
{
  "version": 1,
  "settings": {
    "currency": "USD",
    "currency_position": "before",
    "decimals": 2,
    "submit_label": "Get my quote",
    "success_action": "message",
    "success_message": "Thanks — your quote is on the way.",
    "redirect_url": "",
    "save_resume": true,
    "store_ip": false
  },
  "steps": [
    {
      "key": "step_property",
      "title": "Your property",
      "description": "",
      "fields": ["room_count", "bathrooms"]
    }
  ],
  "fields": {
    "room_count": {
      "key": "room_count",
      "type": "number",
      "label": "How many rooms?",
      "help": "",
      "placeholder": "",
      "required": true,
      "default": 1,
      "min": 0,
      "max": 20,
      "step": 1
    },
    "urgency": {
      "key": "urgency",
      "type": "radio",
      "label": "How soon?",
      "required": true,
      "options": [
        { "label": "Standard", "value": "standard", "price": 0 },
        { "label": "Express", "value": "express", "price": 60 }
      ]
    }
  },
  "calculations": [
    {
      "key": "subtotal",
      "expression": "{room_count} * 50 + {bathrooms} * 120",
      "label": "Subtotal",
      "visible": false
    },
    {
      "key": "total",
      "expression": "round(if({urgency} == \"express\", {subtotal} * 1.3, {subtotal}), 2)",
      "label": "Total",
      "visible": true
    }
  ],
  "rules": [
    {
      "target": { "kind": "field", "key": "express_note" },
      "action": "show",
      "match": "all",
      "conditions": [
        { "field": "urgency", "operator": "equals", "value": "express" }
      ]
    }
  ],
  "notifications": []
}
```

Yuxarıdakı nümunə qısaldılıb: `bathrooms` və `express_note` sahələrinin tərifləri göstərilməyib.

`total` **qorunmuş hesablama açarıdır** — entry cədvəlindəki `total` sütunu məhz ondan gəlir. Sxemdə `total` yoxdursa, validasiya xəta verir.

Dəstəklənən sahə tipləri (v1.0): `number, text, email, tel, textarea, select, radio, checkbox, toggle, date, slider, hidden, html`.

### 6.3 Cavablar → `{prefix}qform_entries`

Post meta burada yaramır: minlərlə cavab `wp_posts`/`wp_postmeta` cədvəllərini şişirdir və filtrasiya ilə CSV eksportunu ağırlaşdırır.

```sql
CREATE TABLE {prefix}qform_entries (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  form_id       BIGINT UNSIGNED NOT NULL,
  status        VARCHAR(20)     NOT NULL DEFAULT 'draft',
  total         DECIMAL(18,4)   NULL,
  currency      CHAR(3)         NOT NULL DEFAULT 'USD',
  data          LONGTEXT        NOT NULL,
  breakdown     LONGTEXT        NULL,
  resume_token  CHAR(32)        NULL,
  current_step  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  user_id       BIGINT UNSIGNED NULL,
  ip            VARBINARY(16)   NULL,
  user_agent    VARCHAR(255)    NULL,
  created_at    DATETIME        NOT NULL,
  updated_at    DATETIME        NOT NULL,
  PRIMARY KEY (id),
  KEY form_status (form_id, status),
  KEY created (created_at),
  UNIQUE KEY resume (resume_token)
);
```

**Save & resume ayrıca cədvəl tələb etmir.** Yarımçıq forma `status = 'draft'` olan bir entry-dir; tamamlananda eyni sətir `status = 'completed'` olur. Bu, bir cədvəli, bir repozitoriyanı və draft ilə entry arasında sinxronizasiya problemini aradan qaldırır.

`ip` sütunu yalnız `settings.store_ip = true` olduqda doldurulur (GDPR). Tamamlanmamış draft-lar konfiqurasiya edilə bilən müddətdən sonra (default 30 gün) cron ilə təmizlənir.

---

## 7. İfadə mühərriki

### 7.1 Dil

İstifadəçi JavaScript yazmır. Bunun əvəzinə məhdud, təhlükəsiz ifadə dili:

```
{room_count} * 50 + {bathrooms} * 120
if({urgency} == "express", {subtotal} * 1.3, {subtotal})
round(max({subtotal}, 99), 2)
```

- **Dəyişənlər:** `{field_key}` və `{calculation_key}`
- **Literal-lar:** rəqəm, sətir (`"..."` və ya `'...'`), `true`, `false`
- **Operatorlar:** `+ - * / %`, mötərizə, unar `-` və `!`
- **Müqayisə:** `== != > < >= <=`
- **Məntiqi:** `&& ||`
- **Funksiyalar:** `if(cond, a, b)`, `min(...)`, `max(...)`, `round(x, d=0)`, `ceil(x)`, `floor(x)`, `abs(x)`, `sum(...)`

Prioritet (aşağıdan yuxarı): `||` → `&&` → müqayisə → `+ -` → `* / %` → unar → mötərizə/funksiya.

### 7.2 Parser

Tokenizer → precedence-climbing (Pratt) parser → AST → evaluator.

**`eval()` heç bir yerdə istifadə olunmur** — nə PHP-də, nə JS-də. Səbəb ikiqatdır: təhlükəsizlik, və AST üzərində insani xəta mesajı vermək imkanı (`{bathroms}` adlı sahə yoxdur — `{bathrooms}` nəzərdə tutmusunuz?).

AST hər sorğuda bir dəfə parse olunur və statik map-də keşlənir.

### 7.3 Dəyişən dəyərlərinin həlli

Bu qaydalar açıq yazılmalıdır, çünki iki implementasiya arasında ən çox burada fərq yaranır:

| Sahə tipi | `{key}` nəyi qaytarır | `{key.price}` nəyi qaytarır |
|---|---|---|
| number, slider | float | — |
| toggle | `1` / `0` | — |
| select, radio | seçilmiş `value` (sətir) | seçilmiş option-un `price` dəyəri |
| checkbox (çoxlu) | seçilmiş dəyərlər massivi | seçilmiş option qiymətlərinin cəmi |
| text, email, tel, textarea | sətir | — |
| date | ISO sətir (`YYYY-MM-DD`) | — |
| boş / doldurulmamış | arifmetikada `0`, müqayisədə `""` | `0` |

`toggle`-ın öz option-u yoxdur, ona görə öz qiyməti yoxdur; onun əvəzinə vurma işlədilir — `{gift_wrap} * 15`.

Gizlədilmiş sahə **tipindən asılı olmayaraq** §8.1-dəki boş dəyərə həll olunur — bu cədvəldəki tipə görə fərqlənən sətir yuxarıdakı deyil, §8.1-in qaydasıdır: gizli `toggle` `1`/`0` yox, `""`-dir, çünki `is_empty()` "soruşulmayıb" ilə "xeyr cavabı verilib"-i məhz bununla ayırır.

Şərtlərdə massiv dəyərləri üçün `contains` operatoru mövcuddur.

### 7.4 Hesablama sırası

Hesablamalar bir-birinə istinad edə bilir (`{subtotal}` → `{total}`), ona görə onlar DAG təşkil edir və topoloji sıra ilə həll olunur. **Dövri istinad saxlama anında aşkarlanır** və saxlamağa icazə verilmir.

### 7.5 Paritet — ən kritik texniki tələb

Mühərrik iki dəfə yazılır (PHP + JS) və onlar heç vaxt fərqli nəticə verməməlidir. Əks halda istifadəçi ekranda $450 görür, emailə $470 düşür.

**Həll: `tests/fixtures/expressions.json`.** Fayl `{id, expr, vars, expect}` və ya `{id, expr, vars, error}` yazılarından ibarətdir. PHPUnit və Jest **eyni faylı** oxuyur və hər ikisi keçməlidir. Mühərrikə yeni funksiya və ya davranış əlavə edən hər dəyişiklik fixture əlavə etməyə məcburdur. Paritet beləliklə niyyət yox, test qapısı olur.

Açıq şəkildə təsbit edilməli davranışlar:

- **Yuvarlaqlaşdırma:** `round()` half-away-from-zero-dur. PHP-nin `round()`-u belədir, amma JS-in `Math.round()`-u half-toward-`+Infinity`-dir və mənfi ədədlərdə fərqlənir (`Math.round(-2.5) === -2`, PHP-də `-3`). JS implementasiyası bunu əl ilə düzəltməlidir və fixture-lar mənfi halları örtməlidir.
- **Float dəqiqliyi:** hər iki dil IEEE-754 float64 istifadə edir, ona görə daxili hesablama paritetlidir. Yuvarlaqlaşdırma yalnız göstərilmə və `total` saxlanılması anında tətbiq olunur.
- **0-a bölmə:** xəta qaytarır (`division_by_zero`), `Infinity` və ya `NaN` yox.
- **Sətir/rəqəm müqayisəsi:** implicit coercion yoxdur; `"5" == 5` yalnış qaytarır. Bu, hər iki dildə eyni davranış üçün məcburidir.

---

## 8. Şərti məntiq

Bir qayda:

```json
{
  "target": { "kind": "field|step", "key": "..." },
  "action": "show|hide|require|optional",
  "match": "all|any",
  "conditions": [
    { "field": "urgency", "operator": "equals", "value": "express" }
  ]
}
```

Operatorlar: `equals, not_equals, greater, greater_or_equal, less, less_or_equal, contains, not_contains, is_empty, is_not_empty`.

Şərtlər ifadə mühərrikinin müqayisə qatına kompilyasiya olunur — **ayrıca ikinci məntiq mühərriki yazılmır.**

### 8.1 İki kritik davranış

Rəqiblərin müntəzəm səhv etdiyi məqamlar, dizayna açıq şəkildə yazılır:

1. **Gizlədilmiş sahə hesablamaya girmir.** Gizli sahənin dəyəri hesablamada `0`/`""` kimi həll olunur. Əks halda görünməyən sahə qiyməti şişirdir və istifadəçi səbəbini tapa bilmir.
2. **Gizlədilmiş məcburi sahə validasiyanı bloklamır.** Əks halda forma göndərilmir, xəta isə görünməyən sahədədir — bu, forma pluginlərinin ən çox şikayət alınan baqıdır.

Eyni qayda addımlara da aiddir: gizlədilmiş addım atlanır və onun sahələri nə hesablamaya, nə validasiyaya girir.

---

## 9. Çox-addımlı model

- `steps` massivi sıra ilə göstərilir.
- Şərti məntiq addımı gizlədə bilir; naviqasiya yalnız **görünən** addımlar üzərində işləyir.
- Progress indikatoru da görünən addımlara görə hesablanır (`addım 2 / 4`, gizli addım saymır).
- Validasiya hər "Next" düyməsində həmin addımın görünən sahələri üçün işləyir.
- Son addımda hesablamanın açılışı (breakdown) göstərilir.

---

## 10. Data axını

```
Builder (React) ──REST──► sxem validasiyası (server) ──► post meta
                                                            │
Frontend: sxem ──► vanilla renderer ──► canlı total (YALNIZ GÖSTƏRİŞ)
                                                            │
Göndərmə: yalnız xam sahə dəyərləri ───────────────────────►│
                                                            ▼
                        PHP mühərriki total-ı SIFIRDAN yenidən hesablayır
                                                            ▼
                                    entry + breakdown saxlanılır ──► email
```

**Client total-ı heç vaxt göndərmir.** Brauzerdəki mühərrik yalnız ekran üçündür; həqiqət mənbəyi serverdəki hesablamadır. Bu olmasa, DevTools-dan qiyməti dəyişmək mümkündür — və v2-də ödəniş gələndə bu, birbaşa maliyyə deşiyinə çevrilər.

### 10.1 REST endpoint-ləri

| Metod | Yol | Giriş | Təyinat |
|---|---|---|---|
| GET | `/quoteform/v1/forms` | `qform_manage_forms` | Forma siyahısı |
| GET | `/quoteform/v1/forms/{id}` | `qform_manage_forms` | Sxemi oxu |
| POST | `/quoteform/v1/forms` | `qform_manage_forms` | Yeni forma |
| PUT | `/quoteform/v1/forms/{id}` | `qform_manage_forms` | Sxemi saxla (validasiya ilə) |
| DELETE | `/quoteform/v1/forms/{id}` | `qform_manage_forms` | Trash-a at |
| POST | `/quoteform/v1/entries` | public + nonce | Forma göndər |
| PUT | `/quoteform/v1/entries/{token}` | public + token | Draft avtosaxlama |
| GET | `/quoteform/v1/entries/{token}` | public + token | Draft-ı bərpa et |
| GET | `/quoteform/v1/entries` | `qform_view_entries` | Admin siyahısı |

CSV eksportu REST-dən yox, `admin-post.php` üzərindən streaming olaraq verilir (memory limitinə dəyməmək üçün).

### 10.2 Capability-lər

Öz capability-lərimiz: `qform_manage_forms`, `qform_view_entries`, `qform_export_entries`. Aktivasiyada `administrator` roluna verilir. `manage_options`-a birbaşa bağlanmır ki, sayt sahibi lazım gəlsə redaktora entry görmə icazəsi verə bilsin.

---

## 11. Göstərmə səthləri

Üç giriş nöqtəsi: shortcode `[quoteform id="12"]`, Gutenberg bloku, Elementor widget-i.

Blok və widget **nazik örtükdür** — hər üçü eyni `Rendering\FormRenderer` sinfini çağırır. Üç ayrı render yolu saxlamaq üç ayrı baq dəsti deməkdir.

Sxem frontend-ə ötürülərkən **filtrlənir**: yalnız render və canlı hesablama üçün lazım olan hissələr göndərilir. Bildiriş şablonları, email ünvanları, admin qeydləri və daxili parametrlər client-ə çıxmır.

Hesablama ifadələri isə — `visible: false` olanlar da daxil — client-ə göndərilməlidir, çünki `total` onlardan asılıdır və onlarsız canlı hesablama mümkün deyil. Bu, təhlükəsizlik problemi deyil: qiymət formulu onsuz da formanın davranışından geri qurula bilər, və həqiqət mənbəyi server hesablamasıdır (bax §10).

---

## 12. Entry idarəetməsi

- Admin siyahısı `WP_List_Table` üzərində — sıralama, səhifələmə, toplu əməliyyatlar və tanış görünüş hazır gəlir.
- Sütunlar: tarix, forma, total, status, və formada "siyahıda göstər" işarələnmiş sahələr.
- Filtrlər: forma, status, tarix aralığı, total aralığı.
- **Detal görünüşündə hesablamanın açılışı:** sadəcə "Total: $450" deyil, `3 otaq × $50 = $150`, `2 vanna × $120 = $240`, `express +30% = $60`. Bu, "niyə bu qiymət çıxdı?" sualını həm sayt sahibi, həm müştəri üçün bağlayır; rəqiblərin heç birində yoxdur və dəstək yükünü ciddi azaldır. Breakdown göndərmə anında hesablanıb `breakdown` sütununda saxlanılır ki, sonradan sxem dəyişsə belə tarixi dəqiqlik qorunsun.
- CSV eksportu streaming şəkildə yazılır və aktiv filtrlərə hörmət edir.

---

## 13. Email bildirişi

İki şablon: admin bildirişi və müştəriyə təklif.

Shortcode-lar: `{field_key}`, `{total}`, `{breakdown}`, `{form_name}`, `{entry_date}`, `{entry_id}`, `{resume_link}`.

Göndərmə `wp_mail` üzərindən gedir. **Email göndərilməsə belə, entry saxlanılır** — bunlar ayrı əməliyyatlardır və SMTP problemi müştəri məlumatının itməsinə səbəb olmamalıdır. Uğursuzluq admin-də göstərilən log-a yazılır.

---

## 14. Xəta idarəetməsi

Üç səviyyə, hər birində fərqli düzgün davranış:

**1. Qurma vaxtı (builder).** Formula yazılan anda parse olunur. Xəta varsa sahə qırmızılanır, mesaj insani formada göstərilir və **saxlamağa icazə verilmir.** Sınıq forma heç vaxt yayıma çıxmır. Dövri istinad və olmayan sahəyə istinad da burada tutulur.

**2. İstifadəçi vaxtı (frontend).** Runtime xətası (0-a bölmə, silinmiş sahəyə istinad) formanı sındırmır: total gizlədilir, konsola log düşür, forma göndərilə bilən qalır. İstifadəçi heç vaxt ağ ekran və ya donmuş forma görmür.

**3. Göndərmə vaxtı (server).** Server validasiyası həqiqət mənbəyidir; client validasiyası yalnız UX-dir və ona heç vaxt etibar edilmir. Serverdə hesablama xətası baş verərsə, entry `total = NULL` və xəta qeydi ilə saxlanılır — müştəri məlumatı itmir.

---

## 15. Təhlükəsizlik

- Client heç vaxt total göndərmir; server sıfırdan yenidən hesablayır (bax §10).
- `eval()` və dinamik kod icrası yoxdur.
- Bütün REST yazma əməliyyatları nonce + capability yoxlaması tələb edir.
- Public endpoint-lər (göndərmə, draft) nonce ilə qorunur; draft əməliyyatları əlavə olaraq `resume_token` tələb edir.
- Bütün sahə dəyərləri tipə görə sanitizasiya olunur; çıxışda escape edilir.
- Bütün DB sorğuları `$wpdb->prepare` ilə.
- Spam: honeypot sahəsi + minimum doldurma vaxtı yoxlaması.
- `resume_token` kriptoqrafik olaraq təsadüfidir: `bin2hex(random_bytes(16))` — 32 hex simvol. Token yalnız öz draft-ına giriş verir, tamamlanmış entry-də etibarsız olur.

---

## 16. Əlçatanlıq (a11y)

Çox-addımlı formalarda bu adətən zəif olur, ona görə birinci sinif tələb kimi yazılır:

- Klaviatura ilə tam naviqasiya; heç bir funksiya yalnız siçana bağlı deyil.
- Addım dəyişəndə fokus yeni addımın başlığına keçir.
- Total dəyişikliyi `aria-live="polite"` ilə elan olunur.
- Addım vəziyyəti ekran oxuyucuya ötürülür (`addım 2 / 4`).
- Xəta mesajları `aria-describedby` ilə sahəyə bağlanır.
- Rəng tək məlumat daşıyıcısı deyil.
- Hədəf: render olunmuş formada Lighthouse a11y balı 100.

---

## 17. i18n

- Bütün istifadəçi mətnləri `quoteform` text domain ilə.
- `languages/` qovluğu, `.pot` faylı build zamanı yaradılır.
- Rəqəm və valyuta formatlaması WP locale-a hörmət edir.
- JS tərəfdə `wp.i18n` istifadə olunur.

---

## 18. Performans hədəfləri

| Metrik | Hədəf |
|---|---|
| Frontend JS bundle | < 25KB gzipped |
| Frontend CSS | < 10KB gzipped |
| jQuery asılılığı | Yoxdur |
| Frontend React | Yoxdur |
| Hesablama yenilənməsi | 50ms debounce, DAG yenidən hesablanması |
| Admin asset-ləri | Yalnız plugin səhifələrində yüklənir |

---

## 19. Test strategiyası

| Səviyyə | Alət | Əhatə |
|---|---|---|
| Paritet | PHPUnit + Jest, ortaq `expressions.json` | İfadə mühərrikinin iki implementasiyası — məcburi qapı |
| Vahid (PHP) | PHPUnit | Engine, sxem validasiyası, entry repository, CSV, breakdown |
| Vahid (JS) | Jest | JS mühərriki, şərti məntiq qrafı, renderer state |
| Uçdan-uca | Playwright | Bir tam ssenari (aşağıda) |

**Playwright ssenarisi:** çox-addımlı formanı doldur → şərti addımın atlandığını təsdiqlə → canlı total-ı yoxla → göndər → admin-də entry-nin və breakdown-un düzgün olduğunu təsdiqlə. Real baqların çoxunu tutan yeganə test növü budur.

**Əlavə təhlükəsizlik testi:** göndərmə sorğusuna əl ilə `total` sahəsi əlavə edildikdə serverin onu nəzərə almadığını təsdiqləyən test.

Mühit: docker WordPress konteyneri.

---

## 20. wp.org təqdimat qeydləri

- Slug bir dəfə seçilir və praktiki olaraq dəyişmir — `quoteform` ilk təqdimatda düzgün olmalıdır.
- Readme-də keyword stuffing olmamalıdır (review komandası bunu bağlama səbəbi sayır).
- Xarici servisə heç bir sorğu yoxdur — bu, review prosesini əhəmiyyətli dərəcədə sadələşdirir.
- Bütün asset-lər lokaldır; CDN istifadə olunmur.
- `build/` qovluğu repo-ya daxil edilir (wp.org build pipeline işlətmir).

---

## 21. Uğur meyarları

| Meyar | Hədəf |
|---|---|
| wp.org təsdiqi | İlk təqdimatda, slug dəyişikliyi olmadan |
| Aktiv quraşdırma (12 ay) | 5,000+ |
| Reytinq | 4.5+ |
| Frontend bundle | < 25KB gzipped |
| Lighthouse a11y | 100 |
| Paritet testləri | 100% keçir, hər buraxılışda |

---

## 22. Açıq suallar

Yoxdur. Dizayn implementasiya planına keçmək üçün hazırdır.
