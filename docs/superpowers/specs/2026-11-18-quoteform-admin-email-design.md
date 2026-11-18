# Quoteform — Admin email bildirişi (dizayn)

Tarix: 2026-11-18 · Əsas spec: `2026-09-15-quoteform-design.md` §13

## Niyə

Readme və FAQ açıq deyir: "Will I get an email? — Not in this version." Təklif formasında
sahibkarın ilk gözlədiyi şey müraciətdən dərhal xəbər tutmaqdır. Hazırda o, Entries ekranına
girməlidir. Bu, pluginin ən böyük boşluğudur.

## Məqsədlər

- Müraciət saxlananda sayt sahibi (bir və ya bir neçə ünvan) email alır.
- Email-də: forma adı, cavablar, qiymətin açılışı, ümumi qiymət, Entries ekranına keçid.
- Hər forma öz alıcısını və mövzusunu seçir.
- Email getməsə belə, entry saxlanır (spec §13).

## Qeyri-məqsədlər (bu buraxılışda)

- Müştəriyə email — ayrıca buraxılış, öz relay qoruması ilə (istifadəçi qərarı: variant C).
- Redaktə olunan email mətni və `{field_key}` shortcode-ları — müştəri email-i ilə birlikdə gəlir.
- SMTP ayarları — bu, SMTP plugin-lərinin işidir; biz `wp_mail` çağırırıq.
- Növbə (queue) və təkrar göndərmə.

## Anti-məqsədlər

- Formadan gələn mətn email başlığına (header) yeni sətir kimi düşməməlidir (header injection).
- Email ünvanları ictimai səhifəyə çıxmamalıdır (`SchemaFilter` icazə siyahısı).
- Spam kimi tutulan müraciət email göndərməməlidir.
- SMTP xətası müştəriyə xəta kimi görünməməli və entry-ni itirməməlidir.

## Yanaşmalar

| | Yanaşma | Qərar |
|---|---|---|
| A | Sabit şablon; formaya görə: aç/bağla, alıcılar, mövzu | **Seçildi** (istifadəçi) |
| B | Tam redaktə olunan şablon, shortcode-lar | Müştəri email-i ilə birlikdə gəlir; admin email-i üçün dəyəri iş həcminə dəymir |
| C | Bütün formalar üçün bir global ayar | Pluginin bütün ayarları formaya bağlıdır; formaya görə fərqli alıcı ehtiyacını ödəmir |

## Dizayn

### Sxem

Mövcud `notifications` siyahısı (`SchemaRepository::defaults()`, `SchemaValidator` artıq onu
siyahı kimi yoxlayır) bir element alır:

```json
"notifications": [
  { "type": "admin", "enabled": true, "to": "", "subject": "New quote: {form_name} — {total}" }
]
```

- `to` — vergüllə ayrılmış ünvanlar. Boş sətir = göndərmə anında `get_option('admin_email')`.
  Bu yolla sayt email-i dəyişəndə formalar da avtomatik yenilənir.
- `subject` — yalnız üç placeholder: `{form_name}`, `{total}`, `{entry_id}`.
- Siyahı formatı müştəri email-ini ikinci element (`type: "customer"`) kimi əlavə etməyə imkan verir.

### Validasiya (`NotificationValidator`, `SchemaValidator`-dan çağırılır)

- Ən çox 1 element; `type` yalnız `admin` (bu buraxılışda).
- Açarlar dəqiq: `type`, `enabled`, `to`, `subject` — naməlum və ya əskik açar xətadır
  (`SettingsValidator`-un nümunəsi).
- `enabled` bool.
- `to`: boş və ya 1–10 ünvan, hər biri `is_email()`-dən keçir.
- `subject`: boş deyil, ən çox 200 simvol, `\r` və `\n` yoxdur.
- Sxemin qalan validasiya qaydaları dəyişmir.

### Göndərmə

`SubmissionService::submit()` entry uğurla saxlanandan (`$saved > 0`) sonra yeni
`AdminNotifier`-i çağırır. Spam yolu (`isSpam`) və 4xx/5xx yolları email göndərmir.

`AdminNotifier`:

1. Bildiriş yoxdursa və ya `enabled` false-dursa — heç nə etmir.
2. Alıcıları həll edir (boş → `admin_email`).
3. Mövzunu qurur: placeholder-ləri əvəz edir, sonra bütün `\r`/`\n`-i silir.
4. HTML mətni qurur: cavablar cədvəli (snapshot-un `display`/`value`-su), breakdown sətirləri,
   ümumi qiymət (`MoneyFormatter`, submission-la eyni format), Entries keçidi
   `admin.php?page=quoteform-entries&entry={id}`. Bütün dəyərlər `esc_html()`, keçid `esc_url()`.
5. `Reply-To`: snapshot-dakı ilk `email` sahəsinin dəyəri, `is_email()`-dən keçirsə.
   Sahibkar "Reply" basıb müştəriyə birbaşa yazır.
6. `wp_mail()` çağırır. `false` qaytarsa və ya istisna atsa — tutur, `qform_mail_failure`
   option-una son xətanın vaxtını və entry id-sini yazır. Müştəriyə cavab yenə 201-dir.

Göndərmə sinxrondur (CF7 və WPForms kimi). WP-Cron etibarsızdır və aşağı trafikli saytda
email-i saatlarla gecikdirər.

### Builder

`SettingsPanel`-ə "Notifications" kartı:

```
Notifications
[✓] Email me when someone submits this form
Send to   [ admin@site.com                      ]
          Leave empty to use the site email (admin@site.com).
Subject   [ New quote: {form_name} — {total}    ]
          You can use {form_name}, {total} and {entry_id}.
```

Toggle bağlı olanda iki sahə gizlənir. Xətalar mövcud `FieldError` ilə göstərilir.

### Default-lar və mövcud formalar

- Yeni forma: bildiriş açıqdır, `to` boşdur (site email).
- Mövcud forma (`notifications: []`): email getmir. Builder kartı "bağlı" göstərir.
  Yeniləmə sahibkarın xəbəri olmadan email göndərməyə başlamır. Readme changelog bunu deyir:
  "Turn on notifications in each form's Settings."

### Xəta göstəricisi

`qform_mail_failure` option-u varsa, Entries ekranında xəbərdarlıq çıxır:
"The last notification email could not be sent (entry #41). Check your site's email setup."
Növbəti uğurlu göndərmə option-u silir. Uninstaller option-u silir.

## Testlər

- Unit (PHPUnit, 8.2 + 7.4): `NotificationValidator` — hər qayda, header injection, 11 ünvan.
- Integration: `SubmissionServiceTest`-də `pre_wp_mail` filtri ilə tutulan email —
  alıcı, mövzu, Reply-To, escape olunmuş `<script>` cavabı, spam yolunda email olmaması,
  `wp_mail` false → entry saxlanır + option yazılır.
- Integration: `SchemaFilter::forDisplay()` çıxışında `notifications` yoxdur.
- Jest: `SettingsPanel` kartı — toggle sahələri gizlədir, xətalar göstərilir.
- Mühərrik dəyişmir — paritet fixture-ları dəyişmir.

## Sənədlər

Readme: "What this version does not do" və FAQ "Will I get an email?" yenilənir; changelog qeydi.

## Builder-in öz qərarına qalanlar

- Email HTML-inin vizual üslubu (sadə, inline CSS, cədvəl).
- Sinif adları və faylların yerləşdiyi qovluq (`includes/Notifications/`, spec §5.3 belə deyir).
- Uninstaller-də option silinməsinin yeri.
