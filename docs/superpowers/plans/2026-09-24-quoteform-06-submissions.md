# Submissions Implementation Plan (Plan 06)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ziyarətçi formanı göndərə bilsin: server görünməni, validasiyanı və qiyməti brauzerə etibar etmədən (JS ilə paritetli PHP runtime ilə) yenidən hesablasın, müraciəti `qform_entries` cədvəlinə yazsın, ziyarətçi uğur mesajını və ya yönləndirməni görsün.

**Architecture:** `frontend-src/runtime/`-in PHP əkizi `includes/Runtime/`-də (WP-dən asılı deyil), paritet `tests/fixtures/submissions.json` + `money.json` ilə kilidlənir. `Submissions\SubmissionService` axını idarə edir (SpamGuard → InputSanitizer → Runtime → EntryRepository). İki public REST route: `GET /session` (nonce + imzalı ticket, `no-store`) və `POST /entries`. Frontend `runtime/client.js` (şəbəkə) + `dom/submit.js` (UI) ilə `form.js`-ə qoşulur.

**Tech Stack:** PHP 7.4+ (WordPress 6.2+, `$wpdb`, `dbDelta`, REST API), JavaScript ESM (Jest 29, jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-quoteform-submissions-entries-design.md` (Plan 06 = §3–§6). Əsas spec: `docs/superpowers/specs/2026-09-15-quoteform-design.md`.

## Global Constraints

- **Paritet qaydaları (CLAUDE.md):** runtime-a yeni davranış → fixture halı; bir tərəfi dəyişəndə digərini də dəyiş və hər iki dəsti qaçır; **fixture-ın gözlənilən dəyərini testi keçirmək üçün heç vaxt dəyişmə** — uyğunsuzluq tapıntıdır, hesabat ver.
- `includes/Runtime/` və `includes/Engine/` WordPress-ə istinad etmir: nə `WP_`, nə `wp_`, nə `$wpdb`, nə `add_action`, nə `__()`.
- `eval()` heç yerdə.
- PHP 7.4 minimum: `match`, nullsafe `?->`, union tipli imzalar, constructor promotion, `str_contains`/`str_starts_with` **yoxdur**. Hər PHP dəyişikliyi `./bin/phpunit` və `QF_PHP=php:7.4-cli ./bin/phpunit` ilə yoxlanılır.
- Client total göndərmir; server sıfırdan hesablayır.
- Prefikslər: PHP `Quoteform\`, option/nonce/hook `qform_`, CSS `.quoteform_`, text domain `'quoteform'`.
- Mövcud test fayllarının sətirləri dəyişdirilmir, brief açıq icazə verməyibsə. Mövcud test düşürsə — səbəb koddadır.
- Commit **yoxdur** (istifadəçinin qlobal qaydası). "Commit" addımı yerinə `npm test` + müvafiq PHP dəstləri + `npm run build`.
- e2e işlətməzdən əvvəl dev DB backup: `make site ARGS="db export --skip-ssl /var/www/html/wp-content/plugins/quoteform/.superpowers/dev-db-backup.sql"`; sonra 8, 40, 328 nömrəli formaların `publish` qaldığını yoxla.
- Frontend bundle büdcəsi: `build/frontend.js` gzip < 25 KB.

## Review Focus

1. **Tez klikləyən real ziyarətçi** (forma yüklənəndən 3 saniyə keçmədən göndərir) — client ticket-in 3.5 s olmasını gözləyir, müraciət spam sayılıb itmir (Task 12 testi).
2. **Saxtalaşdırılmış variant/hidden dəyər** heç vaxt daha ucuz total vermir — variant 400, hidden sxemdən (Task 9, 10 testləri).
3. **Köhnəlmiş nonce** (keşlənmiş səhifə) → 403 → bir dəfə avtomatik yenilənib təkrar; yenilənmə köhnə ticket-i saxlayır (Task 12 testi, Task 14 e2e).
4. **Hesablama xətası** (0-a bölmə) → müraciət `total = NULL` ilə saxlanılır, ziyarətçi mesajı total-sız görür (Task 10 testi).
5. **Plain permalink REST URL-i** (`?rest_route=`) — client hər iki URL formasını düzgün qurur (Task 12 testi; e2e mühiti plain permalink-dir).

---

## Fayl xəritəsi

| Fayl | Məsuliyyət | Task |
|---|---|---|
| `frontend-src/runtime/validate.js` | xəta **kodları** (`validateFields`, `validateVisible`), `validateStep` mesaj örtüyü | 1 |
| `frontend-src/runtime/evaluate.js` | `evaluateSubmission` — paritet fasadı | 2 |
| `tests/fixtures/submissions.json` | runtime paritet halları | 2 |
| `includes/Engine/Values.php` | `isNumericString` public olur | 3 |
| `includes/Runtime/Values.php` | dəyər normallaşdırma, dəyişənlər | 3 |
| `includes/Runtime/Conditions.php`, `Visibility.php` | şərtlər, görünmə | 4 |
| `includes/Runtime/Validator.php`, `Calculator.php`, `Evaluation.php` | validasiya kodları, hesablama, fasad | 5 |
| `includes/Runtime/MoneyFormatter.php`, `tests/fixtures/money.json` | pul formatı + paritet | 6 |
| `includes/Entries/EntriesTable.php` | cədvəl, versiya, multisite, drop | 7 |
| `includes/Entries/EntryRepository.php` | insert/find | 8 |
| `includes/Submissions/SpamGuard.php`, `InputSanitizer.php`, `BadSubmission.php` | spam, dəyər qəbulu | 9 |
| `includes/Submissions/SubmissionService.php` | axın | 10 |
| `includes/Rest/SessionController.php`, `EntriesController.php` | REST | 11 |
| `includes/Rendering/FormRenderer.php`, `frontend-src/dom/controls.js`, `frontend-src/runtime/client.js` | config, maxlength, şəbəkə | 12 |
| `frontend-src/dom/submit.js`, `frontend-src/dom/form.js`, `frontend-src/style.scss` | submit UI | 13 |
| `tests/e2e/submission.spec.js` | e2e | 14 |

---

### Task 1: JS validator xəta kodlarına keçir

**Files:**
- Modify: `frontend-src/runtime/validate.js` (tamamilə əvəz)
- Test: `tests/js/frontend/validate-codes.test.js` (yeni); mövcud `tests/js/frontend/validate.test.js` **dəyişmədən** keçməlidir

**Interfaces:**
- Produces: `EMAIL_PATTERN: RegExp`; `fieldErrorCode( field, value, required ) → 'required'|'email'|'min'|'max'|null`; `validateFields( schema, keys, state, visibility ) → { [key]: code }`; `validateVisible( schema, state, visibility ) → { [key]: code }` (bütün görünən addımlar, sxem sırası); `errorMessage( code, field ) → string`; `validateStep( schema, step, state, visibility ) → { [key]: message }` (mövcud imza və mesajlar).
- Davranış dəyişikliyi (qəsdən, spec §3.2): rəqəm/slider sahəsində boşluq **normallaşdırılmış** dəyərlə ölçülür — `" 5"`, `"5\n"`, `"abc"` boş sayılır (UI-dan gəlmir; PHP ilə eyni olsun deyə). `min`/`max` normallaşdırılmış ədədlə müqayisə olunur.

- [ ] **Step 1: Write the failing test** — `tests/js/frontend/validate-codes.test.js`:

```js
import {
	EMAIL_PATTERN,
	fieldErrorCode,
	validateFields,
	validateVisible,
	errorMessage,
} from '../../../frontend-src/runtime/validate';

const number = { key: 'rooms', type: 'number', label: 'Rooms', min: 1, max: 10 };
const email = { key: 'email', type: 'email', label: 'Email' };
const toggle = { key: 'agree', type: 'toggle', label: 'Agree' };
const extras = { key: 'extras', type: 'checkbox', label: 'Extras', options: [] };

const vis = ( fields, required = [], steps = [ 'one', 'two' ] ) => ( {
	fields: new Set( fields ),
	required: new Set( required ),
	steps: new Set( steps ),
} );

describe( 'fieldErrorCode', () => {
	it( 'names a blank required field', () => {
		expect( fieldErrorCode( number, '', true ) ).toBe( 'required' );
		expect( fieldErrorCode( toggle, false, true ) ).toBe( 'required' );
		expect( fieldErrorCode( extras, [], true ) ).toBe( 'required' );
	} );

	it( 'treats a number field holding a non-number as blank', () => {
		expect( fieldErrorCode( number, ' 5', true ) ).toBe( 'required' );
		expect( fieldErrorCode( number, '5\n', true ) ).toBe( 'required' );
		expect( fieldErrorCode( number, ' 5', false ) ).toBeNull();
	} );

	it( 'reads zero as an answer and numeric strings as numbers', () => {
		expect( fieldErrorCode( number, 0, false ) ).toBe( 'min' );
		expect( fieldErrorCode( number, '3', true ) ).toBeNull();
	} );

	it( 'reports the bound that was crossed', () => {
		expect( fieldErrorCode( number, 11, false ) ).toBe( 'max' );
		expect( fieldErrorCode( number, 10, false ) ).toBeNull();
		expect( fieldErrorCode( number, 1, false ) ).toBeNull();
		expect( fieldErrorCode( number, '1e400', false ) ).toBe( 'max' );
	} );

	it( 'checks the email shape only when something was typed', () => {
		expect( fieldErrorCode( email, '', false ) ).toBeNull();
		expect( fieldErrorCode( email, 'a@b', false ) ).toBeNull();
		expect( fieldErrorCode( email, 'a@@b', false ) ).toBe( 'email' );
		expect( fieldErrorCode( email, 'a b@c', false ) ).toBe( 'email' );
		expect( fieldErrorCode( email, 'a b@c', false ) ).toBe( 'email' );
	} );
} );

describe( 'EMAIL_PATTERN', () => {
	it( 'uses exactly the whitespace JavaScript calls \\s', () => {
		const spaces = [ '\t', '\n', '\v', '\f', '\r', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '　', '﻿' ];

		spaces.forEach( ( space ) => {
			expect( /\s/.test( space ) ).toBe( true );
			expect( EMAIL_PATTERN.test( `a${ space }b@c` ) ).toBe( false );
		} );
		expect( EMAIL_PATTERN.test( 'a\u0085b@c' ) ).toBe( true );
	} );
} );

describe( 'validateFields / validateVisible', () => {
	const schema = {
		fields: { rooms: number, email, token: { key: 'token', type: 'hidden', label: '' } },
		steps: [
			{ key: 'one', fields: [ 'rooms', 'token' ] },
			{ key: 'two', fields: [ 'email' ] },
		],
	};

	it( 'skips hidden, silent and unknown fields', () => {
		const errors = validateFields( schema, [ 'rooms', 'token', 'ghost' ], { rooms: '' }, vis( [ 'token' ], [ 'rooms', 'token' ] ) );

		expect( errors ).toEqual( {} );
	} );

	it( 'walks every visible step in schema order', () => {
		const errors = validateVisible( schema, { rooms: 0, email: 'x' }, vis( [ 'rooms', 'email' ] ) );

		expect( Object.keys( errors ) ).toEqual( [ 'rooms', 'email' ] );
		expect( errors ).toEqual( { rooms: 'min', email: 'email' } );
	} );

	it( 'ignores fields on a hidden step', () => {
		expect( validateVisible( schema, { email: 'x' }, vis( [ 'email' ], [], [ 'one' ] ) ) ).toEqual( {} );
	} );
} );

describe( 'errorMessage', () => {
	it( 'turns each code into the sentence the visitor reads', () => {
		expect( errorMessage( 'required', number ) ).toBe( 'This field is required.' );
		expect( errorMessage( 'email', email ) ).toBe( 'Enter an email address.' );
		expect( errorMessage( 'min', number ) ).toBe( 'Enter 1 or more.' );
		expect( errorMessage( 'max', number ) ).toBe( 'Enter 10 or less.' );
	} );
} );
```

- [ ] **Step 2: Run to verify it fails** — `npx jest tests/js/frontend/validate-codes.test.js` → FAIL (`EMAIL_PATTERN` / `fieldErrorCode` undefined).

- [ ] **Step 3: Replace `frontend-src/runtime/validate.js`:**

```js
import { __, sprintf } from '@wordpress/i18n';

import { visibleSteps } from './steps';
import { normaliseValue } from './values';

const SILENT_TYPES = [ 'hidden', 'html' ];
const NUMERIC_TYPES = [ 'number', 'slider' ];

// JavaScript-in `\s` sinfi, açıq yazılmış halda. Açıq yazılır ki, PHP
// (includes/Runtime/Validator.php) EYNİ dəsti istifadə edə bilsin — PCRE-nin
// `\s`-i bu dəstlə üst-üstə düşmür (NBSP, U+FEFF), yəni gizli divergensiya olardı.
const WHITESPACE = '\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff';

export const EMAIL_PATTERN = new RegExp( `^[^@${ WHITESPACE }]+@[^@${ WHITESPACE }]+$` );

const isTicked = ( value ) => value === true || value === 1 || value === '1';

// Rəqəm sahəsində boşluq NORMALLAŞDIRILMIŞ dəyərlə ölçülür: " 5" və "5\n"
// rəqəm deyil, yəni cavab da deyil. UI bu dəyərləri yaratmır; qayda PHP
// tərəfi ilə (Runtime\Validator) eyni nəticə üçündür.
function isBlank( field, value ) {
	if ( field.type === 'toggle' ) {
		return ! isTicked( value );
	}

	if ( Array.isArray( value ) ) {
		return value.length === 0;
	}

	if ( NUMERIC_TYPES.indexOf( field.type ) !== -1 ) {
		return normaliseValue( field, value ) === '';
	}

	return value === undefined || value === null || value === '';
}

export function fieldErrorCode( field, value, required ) {
	if ( isBlank( field, value ) ) {
		return required ? 'required' : null;
	}

	if ( field.type === 'email' && ! EMAIL_PATTERN.test( String( value ) ) ) {
		return 'email';
	}

	if ( NUMERIC_TYPES.indexOf( field.type ) !== -1 ) {
		const numeric = normaliseValue( field, value );

		if ( typeof field.min === 'number' && numeric < field.min ) {
			return 'min';
		}

		if ( typeof field.max === 'number' && numeric > field.max ) {
			return 'max';
		}
	}

	return null;
}

export function validateFields( schema, keys, state, visibility ) {
	const fields = schema.fields || {};
	const errors = {};

	keys.forEach( ( key ) => {
		const field = fields[ key ];

		if ( ! field || ! visibility.fields.has( key ) || SILENT_TYPES.indexOf( field.type ) !== -1 ) {
			return;
		}

		const code = fieldErrorCode( field, state[ key ], visibility.required.has( key ) );

		if ( code !== null ) {
			errors[ key ] = code;
		}
	} );

	return errors;
}

export function validateVisible( schema, state, visibility ) {
	const keys = [];

	visibleSteps( schema, visibility ).forEach( ( step ) => {
		( step.fields || [] ).forEach( ( key ) => keys.push( key ) );
	} );

	return validateFields( schema, keys, state, visibility );
}

export function errorMessage( code, field ) {
	if ( code === 'required' ) {
		return __( 'This field is required.', 'quoteform' );
	}

	if ( code === 'email' ) {
		return __( 'Enter an email address.', 'quoteform' );
	}

	if ( code === 'min' ) {
		return sprintf(
			/* translators: %s: the smallest allowed number. */
			__( 'Enter %s or more.', 'quoteform' ),
			field.min
		);
	}

	return sprintf(
		/* translators: %s: the largest allowed number. */
		__( 'Enter %s or less.', 'quoteform' ),
		field.max
	);
}

export function validateStep( schema, step, state, visibility ) {
	const codes = validateFields( schema, step.fields || [], state, visibility );
	const errors = {};

	Object.keys( codes ).forEach( ( key ) => {
		errors[ key ] = errorMessage( codes[ key ], schema.fields[ key ] );
	} );

	return errors;
}
```

- [ ] **Step 4: Run** `npx jest tests/js/frontend/validate-codes.test.js tests/js/frontend/validate.test.js` → PASS; then `npm test` → all green.

---

### Task 2: JS paritet fasadı və `submissions.json`

**Files:**
- Create: `frontend-src/runtime/evaluate.js`, `tests/fixtures/submissions.json`, `tests/js/frontend/submissions-parity.test.js`

**Interfaces:**
- Consumes: Task 1 `validateVisible`.
- Produces: `evaluateSubmission( schema, state ) → { visible_fields: string[] (sorted), visible_steps: string[] (schema order), required: string[] (sorted), errors: {key: code}, total: number|null, breakdown: [{key,label,amount}], calc_error: string|null }`. PHP `Runtime\Evaluation::run()` (Task 5) returns the same shape.
- Fixture format: `{ "schemas": { name: schema }, "cases": [ { "id", "schema": name, "values": {…}, "expect": { visible_fields, visible_steps, required, errors, total, breakdown: [{key, amount}], calc_error } } ] }`.

Gözlənilən dəyərlər **əl ilə**, qaydalardan hesablanıb (hər halda şərh `note`-dadır). JS implementasiyası onlara uyğun gəlmirsə — fixture-ı dəyişmə, hesabat ver.

- [ ] **Step 1: Create `tests/fixtures/submissions.json`:**

```json
{
  "version": 1,
  "_comment": "Runtime paritet qapısı: eyni fayl tests/js/frontend/submissions-parity.test.js və tests/php/Runtime/SubmissionParityTest.php tərəfindən oxunur. Gözlənilən dəyərlər əl ilə hesablanıb; testi keçirmək üçün DƏYİŞDİRİLMİR.",
  "schemas": {
    "basic": {
      "version": 1,
      "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 },
      "fields": {
        "rooms": { "key": "rooms", "type": "number", "label": "Rooms", "required": true, "default": 1, "min": 1, "max": 10 },
        "service": { "key": "service", "type": "radio", "label": "Service", "required": true, "default": "standard", "options": [ { "label": "Standard", "value": "standard", "price": 0 }, { "label": "Deep", "value": "deep", "price": 60 } ] },
        "extras": { "key": "extras", "type": "checkbox", "label": "Extras", "required": false, "default": [], "options": [ { "label": "Oven", "value": "oven", "price": 25 }, { "label": "Fridge", "value": "fridge", "price": 20 } ] },
        "pets": { "key": "pets", "type": "toggle", "label": "Pets", "required": false, "default": false },
        "email": { "key": "email", "type": "email", "label": "Email", "required": true, "default": "" },
        "notes": { "key": "notes", "type": "textarea", "label": "Notes", "required": false, "default": "" }
      },
      "steps": [
        { "key": "one", "title": "One", "description": "", "fields": [ "rooms", "service" ] },
        { "key": "two", "title": "Two", "description": "", "fields": [ "extras", "pets" ] },
        { "key": "three", "title": "Three", "description": "", "fields": [ "email", "notes" ] }
      ],
      "calculations": [
        { "key": "base", "label": "Rooms", "expression": "{rooms} * 40", "visible": true },
        { "key": "addons", "label": "Extras", "expression": "{service.price} + {extras.price}", "visible": true },
        { "key": "total", "label": "Total", "expression": "{base} + {addons} + {pets} * 15", "visible": false }
      ],
      "rules": []
    },
    "rules": {
      "version": 1,
      "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 },
      "fields": {
        "kind": { "key": "kind", "type": "select", "label": "Kind", "required": false, "default": "home", "options": [ { "label": "Home", "value": "home", "price": 0 }, { "label": "Office", "value": "office", "price": 100 } ] },
        "size": { "key": "size", "type": "number", "label": "Size", "required": false, "default": 1 },
        "express": { "key": "express", "type": "toggle", "label": "Express", "required": false, "default": false },
        "express_note": { "key": "express_note", "type": "text", "label": "Express note", "required": false, "default": "" },
        "office_floor": { "key": "office_floor", "type": "number", "label": "Floor", "required": false, "default": "" },
        "company": { "key": "company", "type": "text", "label": "Company", "required": true, "default": "" },
        "pets": { "key": "pets", "type": "toggle", "label": "Pets", "required": false, "default": false }
      },
      "steps": [
        { "key": "s1", "title": "S1", "description": "", "fields": [ "kind", "size", "express" ] },
        { "key": "s2", "title": "S2", "description": "", "fields": [ "express_note", "office_floor", "company" ] },
        { "key": "s3", "title": "S3", "description": "", "fields": [ "pets" ] }
      ],
      "calculations": [
        { "key": "line", "label": "Size", "expression": "{size} * 10", "visible": true },
        { "key": "total", "label": "Total", "expression": "{kind.price} + {line} + {office_floor} * 5", "visible": false }
      ],
      "rules": [
        { "target": { "kind": "field", "key": "express_note" }, "action": "hide", "match": "all", "conditions": [ { "field": "express", "operator": "equals", "value": false } ] },
        { "target": { "kind": "step", "key": "s2" }, "action": "hide", "match": "all", "conditions": [ { "field": "kind", "operator": "equals", "value": "home" } ] },
        { "target": { "kind": "field", "key": "office_floor" }, "action": "require", "match": "all", "conditions": [ { "field": "kind", "operator": "equals", "value": "office" } ] },
        { "target": { "kind": "field", "key": "pets" }, "action": "hide", "match": "all", "conditions": [ { "field": "office_floor", "operator": "greater", "value": 10 } ] },
        { "target": { "kind": "field", "key": "company" }, "action": "optional", "match": "all", "conditions": [ { "field": "size", "operator": "greater_or_equal", "value": 5 } ] }
      ]
    },
    "unplaced": {
      "version": 1,
      "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 },
      "fields": {
        "shown": { "key": "shown", "type": "number", "label": "Shown", "required": false, "default": 2 },
        "secret": { "key": "secret", "type": "number", "label": "Secret", "required": false, "default": 7 }
      },
      "steps": [ { "key": "one", "title": "One", "description": "", "fields": [ "shown" ] } ],
      "calculations": [ { "key": "total", "label": "Total", "expression": "{shown} + {secret}", "visible": true } ],
      "rules": []
    },
    "calc": {
      "version": 1,
      "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 },
      "fields": { "n": { "key": "n", "type": "number", "label": "N", "required": false, "default": 0 } },
      "steps": [ { "key": "one", "title": "One", "description": "", "fields": [ "n" ] } ],
      "calculations": [
        { "key": "line", "label": "Line", "expression": "10 / {n}", "visible": true },
        { "key": "total", "label": "Total", "expression": "{line} + 1", "visible": false }
      ],
      "rules": []
    }
  },
  "cases": [
    {
      "id": "basic-defaults",
      "note": "email boş və məcburidir; base=1*40; addons=0+0; total=40+0+0*15",
      "schema": "basic",
      "values": { "rooms": 1, "service": "standard", "extras": [], "pets": false, "email": "", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "email": "required" }, "total": 40, "breakdown": [ { "key": "base", "amount": 40 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "basic-everything-chosen",
      "note": "base=3*40=120; addons=60+(25+20)=105; total=120+105+1*15=240",
      "schema": "basic",
      "values": { "rooms": 3, "service": "deep", "extras": [ "oven", "fridge" ], "pets": true, "email": "jane@example.com", "notes": "Ring twice" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": {}, "total": 240, "breakdown": [ { "key": "base", "amount": 120 }, { "key": "addons", "amount": 105 } ], "calc_error": null }
    },
    {
      "id": "number-on-upper-bound",
      "schema": "basic",
      "values": { "rooms": 10, "service": "standard", "extras": [], "pets": false, "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": {}, "total": 400, "breakdown": [ { "key": "base", "amount": 400 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "number-above-upper-bound",
      "note": "validasiya xətası hesablamanı dayandırmır",
      "schema": "basic",
      "values": { "rooms": 11, "service": "standard", "extras": [], "pets": false, "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "rooms": "max" }, "total": 440, "breakdown": [ { "key": "base", "amount": 440 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "number-below-lower-bound",
      "note": "0 boş deyil — cavabdır, amma min=1-dən kiçikdir",
      "schema": "basic",
      "values": { "rooms": 0, "service": "standard", "extras": [], "pets": false, "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "rooms": "min" }, "total": 0, "breakdown": [ { "key": "base", "amount": 0 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "numeric-string-counts",
      "schema": "basic",
      "values": { "rooms": "3", "service": "standard", "extras": [], "pets": false, "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": {}, "total": 120, "breakdown": [ { "key": "base", "amount": 120 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "padded-numeric-string-is-blank",
      "note": "\" 5\" NUMERIC_STRING-ə uyğun deyil → '' → məcburi xəta; dəyişən '' → 0",
      "schema": "basic",
      "values": { "rooms": " 5", "service": "standard", "extras": [], "pets": false, "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "rooms": "required" }, "total": 0, "breakdown": [ { "key": "base", "amount": 0 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "trailing-newline-is-blank",
      "note": "PCRE /D olmadan PHP \"5\\n\"-i rəqəm sayardı (məlum divergensiya #3)",
      "schema": "basic",
      "values": { "rooms": "5\n", "service": "standard", "extras": [], "pets": false, "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "rooms": "required" }, "total": 0, "breakdown": [ { "key": "base", "amount": 0 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "overflowing-number",
      "note": "\"1e400\" → Infinity: max xətası; mühərrik not_finite verir → total null, açılış boş",
      "schema": "basic",
      "values": { "rooms": "1e400", "service": "standard", "extras": [], "pets": false, "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "rooms": "max" }, "total": null, "breakdown": [], "calc_error": "not_finite" }
    },
    {
      "id": "string-toggle-counts",
      "note": "toggle \"1\" → 1; total=40+0+15",
      "schema": "basic",
      "values": { "rooms": 1, "service": "standard", "extras": [], "pets": "1", "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": {}, "total": 55, "breakdown": [ { "key": "base", "amount": 40 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "email-needs-one-at-sign",
      "schema": "basic",
      "values": { "rooms": 1, "service": "standard", "extras": [], "pets": false, "email": "a@@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "email": "email" }, "total": 40, "breakdown": [ { "key": "base", "amount": 40 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "email-rejects-a-space",
      "schema": "basic",
      "values": { "rooms": 1, "service": "standard", "extras": [], "pets": false, "email": "a b@c", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "email": "email" }, "total": 40, "breakdown": [ { "key": "base", "amount": 40 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "email-rejects-a-no-break-space",
      "note": "U+00A0 JS \\s-dədir; PHP açıq sinifdən istifadə etməsə keçərdi",
      "schema": "basic",
      "values": { "rooms": 1, "service": "standard", "extras": [], "pets": false, "email": "a b@c", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": { "email": "email" }, "total": 40, "breakdown": [ { "key": "base", "amount": 40 }, { "key": "addons", "amount": 0 } ], "calc_error": null }
    },
    {
      "id": "unknown-checkbox-option-costs-nothing",
      "note": "runtime səviyyəsində naməlum variant 0-dır (server InputSanitizer onu 400 ilə rədd edir — Task 9)",
      "schema": "basic",
      "values": { "rooms": 1, "service": "standard", "extras": [ "oven", "sauna" ], "pets": false, "email": "a@b", "notes": "" },
      "expect": { "visible_fields": [ "email", "extras", "notes", "pets", "rooms", "service" ], "visible_steps": [ "one", "two", "three" ], "required": [ "email", "rooms", "service" ], "errors": {}, "total": 65, "breakdown": [ { "key": "base", "amount": 40 }, { "key": "addons", "amount": 25 } ], "calc_error": null }
    },
    {
      "id": "rules-home-defaults",
      "note": "r1 express_note-u, r2 s2-ni gizlədir; s2-nin sahələri düşür; company-nin məcburiliyi düşür; total=0+10+''*5",
      "schema": "rules",
      "values": { "kind": "home", "size": 1, "express": false, "express_note": "", "office_floor": "", "company": "", "pets": false },
      "expect": { "visible_fields": [ "express", "kind", "pets", "size" ], "visible_steps": [ "s1", "s3" ], "required": [], "errors": {}, "total": 10, "breakdown": [ { "key": "line", "amount": 10 } ], "calc_error": null }
    },
    {
      "id": "rules-office-high-floor",
      "note": "r3 office_floor-u məcburi edir; r4 (12>10) pets-i gizlədir; company boşdur; total=100+20+60",
      "schema": "rules",
      "values": { "kind": "office", "size": 2, "express": true, "express_note": "", "office_floor": 12, "company": "", "pets": false },
      "expect": { "visible_fields": [ "company", "express", "express_note", "kind", "office_floor", "size" ], "visible_steps": [ "s1", "s2", "s3" ], "required": [ "company", "office_floor" ], "errors": { "company": "required" }, "total": 180, "breakdown": [ { "key": "line", "amount": 20 } ], "calc_error": null }
    },
    {
      "id": "rules-required-by-rule-is-blank",
      "note": "office_floor qayda ilə məcburi, boşdur; ''>10 yalan → pets görünür; total=100+10+0",
      "schema": "rules",
      "values": { "kind": "office", "size": 1, "express": false, "express_note": "", "office_floor": "", "company": "Acme", "pets": false },
      "expect": { "visible_fields": [ "company", "express", "kind", "office_floor", "pets", "size" ], "visible_steps": [ "s1", "s2", "s3" ], "required": [ "company", "office_floor" ], "errors": { "office_floor": "required" }, "total": 110, "breakdown": [ { "key": "line", "amount": 10 } ], "calc_error": null }
    },
    {
      "id": "rules-stale-value-on-hidden-step-settles",
      "note": "1-ci keçid: office_floor=50 görünür sayılır → pets gizlənir; 2-ci keçid: s2 gizli, office_floor '' → pets görünür; 3-cü keçid eynidir. total=0+10+0",
      "schema": "rules",
      "values": { "kind": "home", "size": 1, "express": false, "express_note": "", "office_floor": 50, "company": "", "pets": false },
      "expect": { "visible_fields": [ "express", "kind", "pets", "size" ], "visible_steps": [ "s1", "s3" ], "required": [], "errors": {}, "total": 10, "breakdown": [ { "key": "line", "amount": 10 } ], "calc_error": null }
    },
    {
      "id": "rules-optional-overrides-required",
      "note": "r5 (5>=5) company-ni ixtiyari edir; r3 office_floor-u məcburi; total=100+50+15",
      "schema": "rules",
      "values": { "kind": "office", "size": 5, "express": false, "express_note": "", "office_floor": 3, "company": "", "pets": false },
      "expect": { "visible_fields": [ "company", "express", "kind", "office_floor", "pets", "size" ], "visible_steps": [ "s1", "s2", "s3" ], "required": [ "office_floor" ], "errors": {}, "total": 165, "breakdown": [ { "key": "line", "amount": 50 } ], "calc_error": null }
    },
    {
      "id": "unplaced-field-keeps-its-value",
      "note": "addımsız sahə görünən sayılır və hesablamaya düşür; validasiya etmir",
      "schema": "unplaced",
      "values": { "shown": 2, "secret": 7 },
      "expect": { "visible_fields": [ "secret", "shown" ], "visible_steps": [ "one" ], "required": [], "errors": {}, "total": 9, "breakdown": [ { "key": "total", "amount": 9 } ], "calc_error": null }
    },
    {
      "id": "calculation-error-is-reported-not-thrown",
      "schema": "calc",
      "values": { "n": 0 },
      "expect": { "visible_fields": [ "n" ], "visible_steps": [ "one" ], "required": [], "errors": {}, "total": null, "breakdown": [], "calc_error": "division_by_zero" }
    },
    {
      "id": "calculation-succeeds",
      "schema": "calc",
      "values": { "n": 2 },
      "expect": { "visible_fields": [ "n" ], "visible_steps": [ "one" ], "required": [], "errors": {}, "total": 6, "breakdown": [ { "key": "line", "amount": 5 } ], "calc_error": null }
    }
  ]
}
```

- [ ] **Step 2: Write the parity test** — `tests/js/frontend/submissions-parity.test.js`:

```js
import fixtures from '../../fixtures/submissions.json';
import { clearExpressionCache } from '../../../frontend-src/engine';
import { evaluateSubmission } from '../../../frontend-src/runtime/evaluate';

const closeOrNull = ( actual, expected ) => {
	if ( expected === null ) {
		expect( actual ).toBeNull();
		return;
	}

	expect( actual ).toBeCloseTo( expected, 9 );
};

describe( 'submission parity fixtures', () => {
	it( 'has unique case ids', () => {
		const ids = fixtures.cases.map( ( testCase ) => testCase.id );

		expect( new Set( ids ).size ).toBe( ids.length );
	} );

	it( 'names only schemas it defines', () => {
		fixtures.cases.forEach( ( testCase ) => {
			expect( fixtures.schemas[ testCase.schema ] ).toBeDefined();
		} );
	} );

	describe.each( fixtures.cases.map( ( testCase ) => [ testCase.id, testCase ] ) )( '%s', ( id, testCase ) => {
		it( 'matches the shared fixture', () => {
			clearExpressionCache();

			const actual = evaluateSubmission( fixtures.schemas[ testCase.schema ], testCase.values );
			const expected = testCase.expect;

			expect( actual.visible_fields ).toEqual( expected.visible_fields );
			expect( actual.visible_steps ).toEqual( expected.visible_steps );
			expect( actual.required ).toEqual( expected.required );
			expect( actual.errors ).toEqual( expected.errors );
			expect( actual.calc_error ).toBe( expected.calc_error );
			closeOrNull( actual.total, expected.total );
			expect( actual.breakdown.map( ( row ) => row.key ) ).toEqual( expected.breakdown.map( ( row ) => row.key ) );
			expected.breakdown.forEach( ( row, index ) => closeOrNull( actual.breakdown[ index ].amount, row.amount ) );
		} );
	} );
} );
```

- [ ] **Step 3: Run to verify it fails** — `npx jest tests/js/frontend/submissions-parity.test.js` → FAIL (module `evaluate` not found).

- [ ] **Step 4: Create `frontend-src/runtime/evaluate.js`:**

```js
import { calculate } from './calculate';
import { visibleSteps } from './steps';
import { validateVisible } from './validate';
import { variablesFor } from './values';
import { resolveVisibility } from './visibility';

/**
 * Göndərilən formanın tam qiymətləndirilməsi — serverin (includes/Runtime/
 * Evaluation.php) etdiyinin EYNİSİ. Paritet qapısı (tests/fixtures/
 * submissions.json) bu iki funksiyanı müqayisə edir; açar adları ona görə
 * snake_case-dir və PHP massivinin açarları ilə üst-üstə düşür.
 */
export function evaluateSubmission( schema, state ) {
	const visibility = resolveVisibility( schema, state );
	const variables = variablesFor( schema, state, visibility.fields );
	const result = calculate( schema, variables );

	return {
		visible_fields: [ ...visibility.fields ].sort(),
		visible_steps: visibleSteps( schema, visibility ).map( ( step ) => step.key ),
		required: [ ...visibility.required ].sort(),
		errors: validateVisible( schema, state, visibility ),
		total: result.total,
		breakdown: result.breakdown.map( ( row ) => ( { key: row.key, label: row.label, amount: row.amount } ) ),
		calc_error: result.error,
	};
}
```

- [ ] **Step 5: Run** `npx jest tests/js/frontend/submissions-parity.test.js` → PASS (22 cases). Any failing case = a disagreement between the hand-derived expectation and the JS runtime: **do not edit the fixture**; report the case, the expected and actual values, and your reading of which side is wrong. Then `npm test` → green.

---

### Task 3: PHP `Runtime\Values`

**Files:**
- Modify: `includes/Engine/Values.php` — `private static function isNumericString` → `public static function isNumericString` (yalnız görünmə dəyişir; docblock-a bir sətir: "Runtime\Values da istifadə edir").
- Create: `includes/Runtime/Values.php`
- Test: `tests/php/Runtime/ValuesTest.php`

**Interfaces:**
- Produces (all static): `Values::normalise( array $field, $raw )` → `float|int|string|array` (toggle → `0|1`, number → `float|''`, checkbox → list, rest → string); `Values::normaliseConditionValue( array $field, $raw )`; `Values::emptyFor( array $field )`; `Values::variablesFor( array $schema, array $state, array $visibleFields ): array` — `$visibleFields` is `array<string,true>`; `Values::stringify( $raw ): string` (JS `String()`).

- [ ] **Step 1: Write the failing test** — `tests/php/Runtime/ValuesTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Runtime\Values;

final class ValuesTest extends TestCase
{
    private const NUMBER   = [ 'key' => 'n', 'type' => 'number' ];
    private const TOGGLE   = [ 'key' => 't', 'type' => 'toggle' ];
    private const CHECKBOX = [ 'key' => 'c', 'type' => 'checkbox', 'options' => [ [ 'value' => 'a', 'price' => 5 ], [ 'value' => 'b', 'price' => 7 ] ] ];
    private const RADIO    = [ 'key' => 'r', 'type' => 'radio', 'options' => [ [ 'value' => 'x', 'price' => 10 ], [ 'value' => 'y', 'price' => 'free' ] ] ];
    private const TEXT     = [ 'key' => 's', 'type' => 'text' ];

    public function testNumbersFollowTheEnginesNumericRule(): void
    {
        $this->assertSame( 3.0, Values::normalise( self::NUMBER, '3' ) );
        $this->assertSame( 3.0, Values::normalise( self::NUMBER, 3 ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, ' 5' ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, "5\n" ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, 'abc' ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, null ) );
        $this->assertTrue( is_infinite( Values::normalise( self::NUMBER, '1e400' ) ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, INF ) );
    }

    public function testTogglesBecomeZeroOrOne(): void
    {
        $this->assertSame( 1, Values::normalise( self::TOGGLE, true ) );
        $this->assertSame( 1, Values::normalise( self::TOGGLE, 1 ) );
        $this->assertSame( 1, Values::normalise( self::TOGGLE, '1' ) );
        $this->assertSame( 0, Values::normalise( self::TOGGLE, false ) );
        $this->assertSame( 0, Values::normalise( self::TOGGLE, 'yes' ) );
        $this->assertSame( 0, Values::normalise( self::TOGGLE, null ) );
    }

    public function testCheckboxesAreLists(): void
    {
        $this->assertSame( [ 'a' ], Values::normalise( self::CHECKBOX, [ 'a' ] ) );
        $this->assertSame( [], Values::normalise( self::CHECKBOX, 'a' ) );
    }

    public function testOtherTypesBecomeStringsTheWayJavaScriptWouldPrintThem(): void
    {
        $this->assertSame( 'hi', Values::normalise( self::TEXT, 'hi' ) );
        $this->assertSame( '', Values::normalise( self::TEXT, '' ) );
        $this->assertSame( '5', Values::normalise( self::TEXT, 5 ) );
        $this->assertSame( '1.5', Values::normalise( self::TEXT, 1.5 ) );
        $this->assertSame( 'true', Values::normalise( self::TEXT, true ) );
        $this->assertSame( 'a,b', Values::normalise( self::TEXT, [ 'a', 'b' ] ) );
    }

    public function testConditionValuesForListsAreStrings(): void
    {
        $this->assertSame( 'a', Values::normaliseConditionValue( self::CHECKBOX, 'a' ) );
        $this->assertSame( 0, Values::normaliseConditionValue( self::TOGGLE, false ) );
    }

    public function testVariablesCarryPricesAndBlankHiddenFields(): void
    {
        $schema = [ 'fields' => [ 'c' => self::CHECKBOX, 'r' => self::RADIO, 'n' => self::NUMBER ] ];
        $state  = [ 'c' => [ 'a', 'b', 'zzz' ], 'r' => 'y', 'n' => '4' ];

        $variables = Values::variablesFor( $schema, $state, [ 'c' => true, 'r' => true ] );

        $this->assertSame( [ 'a', 'b', 'zzz' ], $variables['c'] );
        $this->assertSame( 12, $variables['c.price'] );
        $this->assertSame( 'y', $variables['r'] );
        $this->assertSame( 0, $variables['r.price'], 'a non-numeric price counts as 0' );
        $this->assertSame( '', $variables['n'], 'a hidden field is blank' );
        $this->assertArrayNotHasKey( 'n.price', $variables );
    }

    public function testAnUnchosenSingleChoiceCostsNothing(): void
    {
        $variables = Values::variablesFor( [ 'fields' => [ 'r' => self::RADIO ] ], [ 'r' => '' ], [ 'r' => true ] );

        $this->assertSame( 0, $variables['r.price'] );
    }
}
```

- [ ] **Step 2: Run** `./bin/phpunit --filter ValuesTest` → FAIL (class not found).

- [ ] **Step 3: Create `includes/Runtime/Values.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

use Quoteform\Engine\Values as EngineValues;

/**
 * frontend-src/runtime/values.js-in PHP əkizi. WordPress-dən asılı DEYİL.
 *
 * Hər qərar JS tərəfi ilə eyni olmalıdır — fərq tests/fixtures/submissions.json
 * tərəfindən tutulur. JS-in `String()` və `Number()` davranışları burada açıq
 * şəkildə təkrarlanır (`stringify()`), çünki PHP-nin öz çevrilmələri fərqlidir
 * (`(string) true === '1'`, JS-də isə `'true'`).
 */
final class Values
{
    private const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox' ];
    private const NUMERIC_TYPES       = [ 'number', 'slider' ];
    private const MULTI_TYPES         = [ 'checkbox' ];

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return mixed
     */
    public static function normalise( array $field, $raw )
    {
        $type = $field['type'] ?? '';

        if ( in_array( $type, self::MULTI_TYPES, true ) ) {
            return is_array( $raw ) ? array_values( $raw ) : [];
        }

        if ( 'toggle' === $type ) {
            return ( true === $raw || 1 === $raw || 1.0 === $raw || '1' === $raw ) ? 1 : 0;
        }

        if ( null === $raw || '' === $raw ) {
            return '';
        }

        if ( in_array( $type, self::NUMERIC_TYPES, true ) ) {
            if ( is_int( $raw ) || is_float( $raw ) ) {
                // JS: String(Infinity) === 'Infinity' rəqəm qaydasına uyğun gəlmir → ''.
                return is_finite( (float) $raw ) ? (float) $raw : '';
            }

            $text = self::stringify( $raw );

            return EngineValues::isNumericString( $text ) ? (float) $text : '';
        }

        return self::stringify( $raw );
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return mixed
     */
    public static function normaliseConditionValue( array $field, $raw )
    {
        if ( in_array( $field['type'] ?? '', self::MULTI_TYPES, true ) ) {
            return self::stringify( $raw );
        }

        return self::normalise( $field, $raw );
    }

    /**
     * @param array<string, mixed> $field
     * @return array<int, mixed>|string
     */
    public static function emptyFor( array $field )
    {
        return in_array( $field['type'] ?? '', self::MULTI_TYPES, true ) ? [] : '';
    }

    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $state
     * @param array<string, true>  $visibleFields
     * @return array<string, mixed>
     */
    public static function variablesFor( array $schema, array $state, array $visibleFields ): array
    {
        $fields    = is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
        $variables = [];

        foreach ( $fields as $key => $field ) {
            $key   = (string) $key;
            $value = isset( $visibleFields[ $key ] )
                ? self::normalise( $field, $state[ $key ] ?? null )
                : self::emptyFor( $field );

            $variables[ $key ] = $value;

            if ( ! in_array( $field['type'] ?? '', self::PRICE_BEARING_TYPES, true ) ) {
                continue;
            }

            if ( in_array( $field['type'], self::MULTI_TYPES, true ) ) {
                $sum = 0;

                foreach ( $value as $selected ) {
                    $sum += self::optionPrice( $field, $selected );
                }

                $variables[ $key . '.price' ] = $sum;

                continue;
            }

            $variables[ $key . '.price' ] = '' === $value ? 0 : self::optionPrice( $field, $value );
        }

        return $variables;
    }

    /**
     * JS `String( value )`. Yalnız normallaşdırmanın və şərt dəyərlərinin
     * ehtiyac duyduğu tiplər üçün dəqiqdir; float-ların eksponent yazılışı
     * ən yaxın JS formasına gətirilir.
     *
     * @param mixed $raw
     */
    public static function stringify( $raw ): string
    {
        if ( is_string( $raw ) ) {
            return $raw;
        }

        if ( null === $raw ) {
            return 'null';
        }

        if ( is_bool( $raw ) ) {
            return $raw ? 'true' : 'false';
        }

        if ( is_int( $raw ) ) {
            return (string) $raw;
        }

        if ( is_float( $raw ) ) {
            return self::numberToString( $raw );
        }

        if ( is_array( $raw ) ) {
            $parts = [];

            foreach ( $raw as $item ) {
                $parts[] = null === $item ? '' : self::stringify( $item );
            }

            return implode( ',', $parts );
        }

        return '';
    }

    private static function numberToString( float $number ): string
    {
        if ( is_nan( $number ) ) {
            return 'NaN';
        }

        if ( is_infinite( $number ) ) {
            return $number > 0 ? 'Infinity' : '-Infinity';
        }

        if ( 0.0 === $number ) {
            return '0';
        }

        if ( floor( $number ) === $number && abs( $number ) < 1e21 ) {
            return sprintf( '%.0f', $number );
        }

        $encoded = (string) json_encode( $number );

        return str_replace( '.0e', 'e', $encoded );
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $value
     * @return int|float
     */
    private static function optionPrice( array $field, $value )
    {
        $options = is_array( $field['options'] ?? null ) ? $field['options'] : [];

        foreach ( $options as $option ) {
            if ( is_array( $option ) && array_key_exists( 'value', $option ) && $option['value'] === $value ) {
                $price = $option['price'] ?? null;

                return ( is_int( $price ) || is_float( $price ) ) ? $price : 0;
            }
        }

        return 0;
    }
}
```

- [ ] **Step 4: Run** `./bin/phpunit --filter ValuesTest` → PASS; then `./bin/phpunit` and `QF_PHP=php:7.4-cli ./bin/phpunit` → green (engine suites included — `isNumericString` visibility change must not break them).

---

### Task 4: PHP `Runtime\Conditions` və `Runtime\Visibility`

**Files:**
- Create: `includes/Runtime/Conditions.php`, `includes/Runtime/Visibility.php`
- Test: `tests/php/Runtime/VisibilityTest.php`

**Interfaces:**
- Consumes: Task 3 `Values`.
- Produces: `Conditions::holds( array $condition, array $variables, array $schema ): bool`; `Conditions::ruleFires( array $rule, array $variables, array $schema ): bool`; `Visibility::resolve( array $schema, array $state ): array{fields: array<string,true>, steps: array<string,true>, required: array<string,true>}`.

- [ ] **Step 1: Write the failing test** — `tests/php/Runtime/VisibilityTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Expression;
use Quoteform\Runtime\Conditions;
use Quoteform\Runtime\Visibility;

final class VisibilityTest extends TestCase
{
    protected function setUp(): void
    {
        Expression::clearCache();
    }

    private function schema( array $rules ): array
    {
        return [
            'fields' => [
                'kind'  => [ 'key' => 'kind', 'type' => 'select', 'required' => false, 'options' => [ [ 'value' => 'home' ], [ 'value' => 'office' ] ] ],
                'floor' => [ 'key' => 'floor', 'type' => 'number', 'required' => true ],
                'extras' => [ 'key' => 'extras', 'type' => 'checkbox', 'options' => [ [ 'value' => 'oven' ] ] ],
            ],
            'steps'  => [
                [ 'key' => 'one', 'fields' => [ 'kind', 'extras' ] ],
                [ 'key' => 'two', 'fields' => [ 'floor' ] ],
            ],
            'rules'  => $rules,
        ];
    }

    public function testEveryOperatorAgreesWithTheEngine(): void
    {
        $variables = [ 'n' => 5.0, 'list' => [ 'oven' ], 's' => '' ];
        $schema    = [ 'fields' => [ 'n' => [ 'type' => 'number' ], 'list' => [ 'type' => 'checkbox' ], 's' => [ 'type' => 'text' ] ] ];
        $holds     = static function ( string $field, string $operator, $value = null ) use ( $variables, $schema ): bool {
            $condition = [ 'field' => $field, 'operator' => $operator ];

            if ( func_num_args() > 2 ) {
                $condition['value'] = $value;
            }

            return Conditions::holds( $condition, $variables, $schema );
        };

        $this->assertTrue( $holds( 'n', 'equals', 5 ) );
        $this->assertTrue( $holds( 'n', 'not_equals', 4 ) );
        $this->assertTrue( $holds( 'n', 'greater', 4 ) );
        $this->assertTrue( $holds( 'n', 'greater_or_equal', 5 ) );
        $this->assertTrue( $holds( 'n', 'less', 6 ) );
        $this->assertTrue( $holds( 'n', 'less_or_equal', 5 ) );
        $this->assertTrue( $holds( 'list', 'contains', 'oven' ) );
        $this->assertTrue( $holds( 'list', 'not_contains', 'sauna' ) );
        $this->assertTrue( $holds( 's', 'is_empty' ) );
        $this->assertFalse( $holds( 's', 'is_not_empty' ) );
    }

    public function testABrokenConditionIsFalseNotAnError(): void
    {
        $this->assertFalse( Conditions::holds( [ 'field' => 'ghost', 'operator' => 'equals', 'value' => 1 ], [], [ 'fields' => [] ] ) );
        $this->assertFalse( Conditions::holds( [ 'field' => 'n', 'operator' => 'nonsense', 'value' => 1 ], [ 'n' => 1 ], [ 'fields' => [] ] ) );
    }

    public function testARuleWithoutConditionsNeverFires(): void
    {
        $this->assertFalse( Conditions::ruleFires( [ 'match' => 'all', 'conditions' => [] ], [], [ 'fields' => [] ] ) );
    }

    public function testAnyAndAll(): void
    {
        $true  = [ 'field' => 'n', 'operator' => 'equals', 'value' => 1 ];
        $false = [ 'field' => 'n', 'operator' => 'equals', 'value' => 2 ];
        $vars  = [ 'n' => 1.0 ];
        $s     = [ 'fields' => [ 'n' => [ 'type' => 'number' ] ] ];

        $this->assertTrue( Conditions::ruleFires( [ 'match' => 'any', 'conditions' => [ $false, $true ] ], $vars, $s ) );
        $this->assertFalse( Conditions::ruleFires( [ 'match' => 'all', 'conditions' => [ $false, $true ] ], $vars, $s ) );
    }

    public function testAHiddenStepTakesItsFieldsAndTheirRequirementWithIt(): void
    {
        $rules = [ [ 'target' => [ 'kind' => 'step', 'key' => 'two' ], 'action' => 'hide', 'match' => 'all', 'conditions' => [ [ 'field' => 'kind', 'operator' => 'equals', 'value' => 'home' ] ] ] ];

        $resolved = Visibility::resolve( $this->schema( $rules ), [ 'kind' => 'home', 'floor' => '', 'extras' => [] ] );

        $this->assertSame( [ 'kind' => true, 'extras' => true ], $resolved['fields'] );
        $this->assertSame( [ 'one' => true ], $resolved['steps'] );
        $this->assertSame( [], $resolved['required'] );
    }

    public function testRulesAboutUnknownTargetsAreIgnored(): void
    {
        $rules = [ [ 'target' => [ 'kind' => 'field', 'key' => 'ghost' ], 'action' => 'hide', 'match' => 'all', 'conditions' => [ [ 'field' => 'kind', 'operator' => 'equals', 'value' => 'home' ] ] ] ];

        $resolved = Visibility::resolve( $this->schema( $rules ), [ 'kind' => 'home' ] );

        $this->assertArrayNotHasKey( 'ghost', $resolved['fields'] );
        $this->assertCount( 3, $resolved['fields'] );
    }
}
```

- [ ] **Step 2: Run** `./bin/phpunit --filter VisibilityTest` → FAIL.

- [ ] **Step 3: Create `includes/Runtime/Conditions.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

use Quoteform\Engine\Expression;

/**
 * frontend-src/runtime/conditions.js-in PHP əkizi. Şərt mühərrik ifadəsinə
 * çevrilir, yəni müqayisə qaydaları (sətir/rəqəm, boşluq) mühərrikin öz
 * paritetli qaydalarıdır — burada ikinci bir müqayisə dili YOXDUR.
 */
final class Conditions
{
    private const VALUE = '__value';

    private const SOURCES = [
        'equals'           => '{%s} == {__value}',
        'not_equals'       => '{%s} != {__value}',
        'greater'          => '{%s} > {__value}',
        'greater_or_equal' => '{%s} >= {__value}',
        'less'             => '{%s} < {__value}',
        'less_or_equal'    => '{%s} <= {__value}',
        'contains'         => 'contains({%s}, {__value})',
        'not_contains'     => '!contains({%s}, {__value})',
        'is_empty'         => 'is_empty({%s})',
        'is_not_empty'     => '!is_empty({%s})',
    ];

    /**
     * @param array<string, mixed> $condition
     * @param array<string, mixed> $variables
     * @param array<string, mixed> $schema
     */
    public static function holds( array $condition, array $variables, array $schema ): bool
    {
        $operator = $condition['operator'] ?? null;

        if ( ! is_string( $operator ) || ! isset( self::SOURCES[ $operator ] ) ) {
            return false;
        }

        // JS: template.replace( '%s', undefined ) → "{undefined}" — naməlum dəyişən, false.
        $field  = $condition['field'] ?? null;
        $source = str_replace( '%s', is_string( $field ) ? $field : 'undefined', self::SOURCES[ $operator ] );

        $variables[ self::VALUE ] = self::resolveValue( $condition, $schema );

        try {
            return self::truthy( Expression::evaluate( $source, $variables ) );
        } catch ( \Throwable $error ) {
            return false;
        }
    }

    /**
     * @param array<string, mixed> $rule
     * @param array<string, mixed> $variables
     * @param array<string, mixed> $schema
     */
    public static function ruleFires( array $rule, array $variables, array $schema ): bool
    {
        $conditions = is_array( $rule['conditions'] ?? null ) ? $rule['conditions'] : [];

        if ( [] === $conditions ) {
            return false;
        }

        $any = 'any' === ( $rule['match'] ?? null );

        foreach ( $conditions as $condition ) {
            $holds = is_array( $condition ) && self::holds( $condition, $variables, $schema );

            if ( $any && $holds ) {
                return true;
            }

            if ( ! $any && ! $holds ) {
                return false;
            }
        }

        return ! $any;
    }

    /**
     * @param array<string, mixed> $condition
     * @param array<string, mixed> $schema
     * @return mixed
     */
    private static function resolveValue( array $condition, array $schema )
    {
        if ( ! array_key_exists( 'value', $condition ) ) {
            return '';
        }

        $key   = $condition['field'] ?? null;
        $field = is_string( $key ) && isset( $schema['fields'][ $key ] ) && is_array( $schema['fields'][ $key ] )
            ? $schema['fields'][ $key ]
            : null;

        return null === $field ? $condition['value'] : Values::normaliseConditionValue( $field, $condition['value'] );
    }

    /**
     * JS `Boolean( value )`.
     *
     * @param mixed $value
     */
    private static function truthy( $value ): bool
    {
        if ( null === $value || false === $value || '' === $value ) {
            return false;
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return ! is_nan( (float) $value ) && 0.0 !== (float) $value;
        }

        return true;
    }
}
```

- [ ] **Step 4: Create `includes/Runtime/Visibility.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

/**
 * frontend-src/runtime/visibility.js-in PHP əkizi: qaydalar sabit nöqtəyə
 * qədər (maks. 10 keçid) təkrar tətbiq olunur. Hər keçid SIFIRDAN başlayır,
 * amma dəyişənləri əvvəlki keçidin görünən sahələrindən hesablayır.
 */
final class Visibility
{
    private const MAX_PASSES = 10;

    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $state
     * @return array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>}
     */
    public static function resolve( array $schema, array $state ): array
    {
        $resolved = self::initial( $schema );
        $previous = '';

        for ( $pass = 0; $pass < self::MAX_PASSES; $pass++ ) {
            $variables = Values::variablesFor( $schema, $state, $resolved['fields'] );

            $resolved = self::initial( $schema );
            self::applyRules( $schema, $variables, $resolved );
            self::dropHiddenSteps( $schema, $resolved );
            self::dropRequiredForHiddenFields( $resolved );

            $current = self::signature( $resolved );

            if ( $current === $previous ) {
                return $resolved;
            }

            $previous = $current;
        }

        return $resolved;
    }

    /**
     * @param array<string, mixed> $schema
     * @return array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>}
     */
    private static function initial( array $schema ): array
    {
        $fields   = [];
        $required = [];
        $steps    = [];

        foreach ( self::fields( $schema ) as $key => $field ) {
            $fields[ (string) $key ] = true;

            if ( true === ( $field['required'] ?? null ) ) {
                $required[ (string) $key ] = true;
            }
        }

        foreach ( self::steps( $schema ) as $step ) {
            if ( isset( $step['key'] ) && is_string( $step['key'] ) ) {
                $steps[ $step['key'] ] = true;
            }
        }

        return [ 'fields' => $fields, 'steps' => $steps, 'required' => $required ];
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array<string, mixed>                                                                          $variables
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $resolved
     */
    private static function applyRules( array $schema, array $variables, array &$resolved ): void
    {
        $rules = is_array( $schema['rules'] ?? null ) ? $schema['rules'] : [];

        foreach ( $rules as $rule ) {
            if ( ! is_array( $rule ) ) {
                continue;
            }

            $target  = is_array( $rule['target'] ?? null ) ? $rule['target'] : [];
            $isField = 'field' === ( $target['kind'] ?? null );
            $key     = $target['key'] ?? null;

            if ( ! is_string( $key ) || ! self::targetExists( $schema, $isField, $key ) ) {
                continue;
            }

            if ( ! Conditions::ruleFires( $rule, $variables, $schema ) ) {
                continue;
            }

            $collection = $isField ? 'fields' : 'steps';
            $action     = $rule['action'] ?? null;

            if ( 'show' === $action ) {
                $resolved[ $collection ][ $key ] = true;
            } elseif ( 'hide' === $action ) {
                unset( $resolved[ $collection ][ $key ] );
            } elseif ( $isField && 'require' === $action ) {
                $resolved['required'][ $key ] = true;
            } elseif ( $isField && 'optional' === $action ) {
                unset( $resolved['required'][ $key ] );
            }
        }
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $resolved
     */
    private static function dropHiddenSteps( array $schema, array &$resolved ): void
    {
        foreach ( self::steps( $schema ) as $step ) {
            $key = $step['key'] ?? null;

            if ( ! is_string( $key ) || isset( $resolved['steps'][ $key ] ) ) {
                continue;
            }

            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $fieldKey ) {
                unset( $resolved['fields'][ (string) $fieldKey ] );
            }
        }
    }

    /**
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $resolved
     */
    private static function dropRequiredForHiddenFields( array &$resolved ): void
    {
        foreach ( array_keys( $resolved['required'] ) as $key ) {
            if ( ! isset( $resolved['fields'][ $key ] ) ) {
                unset( $resolved['required'][ $key ] );
            }
        }
    }

    /**
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $resolved
     */
    private static function signature( array $resolved ): string
    {
        $parts = [];

        foreach ( [ 'fields', 'steps', 'required' ] as $name ) {
            $keys = array_map( 'strval', array_keys( $resolved[ $name ] ) );
            sort( $keys, SORT_STRING );
            $parts[] = implode( ',', $keys );
        }

        return implode( '|', $parts );
    }

    /**
     * @param array<string, mixed> $schema
     */
    private static function targetExists( array $schema, bool $isField, string $key ): bool
    {
        if ( $isField ) {
            return isset( self::fields( $schema )[ $key ] );
        }

        foreach ( self::steps( $schema ) as $step ) {
            if ( ( $step['key'] ?? null ) === $key ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<string, array<string, mixed>>
     */
    private static function fields( array $schema ): array
    {
        return is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<int, array<string, mixed>>
     */
    private static function steps( array $schema ): array
    {
        $steps = is_array( $schema['steps'] ?? null ) ? $schema['steps'] : [];

        return array_values( array_filter( $steps, 'is_array' ) );
    }
}
```

- [ ] **Step 5: Run** `./bin/phpunit --filter VisibilityTest` → PASS; full PHP suites on 8.2 and 7.4 → green.

---

### Task 5: PHP `Validator`, `Calculator`, `Evaluation` + PHP paritet testi

**Files:**
- Create: `includes/Runtime/Validator.php`, `includes/Runtime/Calculator.php`, `includes/Runtime/Evaluation.php`
- Test: `tests/php/Runtime/SubmissionParityTest.php`, `tests/php/Runtime/ValidatorTest.php`

**Interfaces:**
- Consumes: Tasks 3–4; `Quoteform\Engine\CalculationGraph::evaluateAll( array $calculations, array $variables ): array`; `ExpressionException::getCodeSlug()`.
- Produces: `Validator::EMAIL_PATTERN`; `Validator::fieldErrorCode( array $field, $value, bool $required ): ?string`; `Validator::validateVisible( array $schema, array $state, array $visibility ): array<string,string>`; `Validator::firstErrorStep( array $schema, array $visibility, array $errors ): ?string`; `Calculator::calculate( array $schema, array $variables ): array{total: ?float, breakdown: list<array{key: string, label: string, amount: ?float}>, error: ?string}`; `Evaluation::run( array $schema, array $state ): array` — same keys as JS `evaluateSubmission` plus `visibility` (raw sets, for SubmissionService).

- [ ] **Step 1: Write the failing tests.**

`tests/php/Runtime/SubmissionParityTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Expression;
use Quoteform\Runtime\Evaluation;

/**
 * tests/fixtures/submissions.json — eyni faylı Jest də oxuyur
 * (tests/js/frontend/submissions-parity.test.js).
 */
final class SubmissionParityTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>}>
     */
    public function caseProvider(): array
    {
        $path    = __DIR__ . '/../../fixtures/submissions.json';
        $decoded = json_decode( (string) file_get_contents( $path ), true );

        if ( ! is_array( $decoded ) || ! isset( $decoded['cases'], $decoded['schemas'] ) ) {
            throw new \RuntimeException( 'Fixture file is malformed: ' . $path );
        }

        $provided = [];

        foreach ( $decoded['cases'] as $case ) {
            $provided[ $case['id'] ] = [ $case, $decoded['schemas'][ $case['schema'] ] ];
        }

        return $provided;
    }

    /**
     * @dataProvider caseProvider
     * @param array<string, mixed> $case
     * @param array<string, mixed> $schema
     */
    public function testFixtureCase( array $case, array $schema ): void
    {
        Expression::clearCache();

        $actual   = Evaluation::run( $schema, $case['values'] );
        $expected = $case['expect'];

        $this->assertSame( $expected['visible_fields'], $actual['visible_fields'], 'visible_fields' );
        $this->assertSame( $expected['visible_steps'], $actual['visible_steps'], 'visible_steps' );
        $this->assertSame( $expected['required'], $actual['required'], 'required' );
        $this->assertEquals( $expected['errors'], $actual['errors'], 'errors' );
        $this->assertSame( $expected['calc_error'], $actual['calc_error'], 'calc_error' );
        $this->assertCloseOrNull( $expected['total'], $actual['total'], 'total' );
        $this->assertSame(
            array_column( $expected['breakdown'], 'key' ),
            array_column( $actual['breakdown'], 'key' ),
            'breakdown keys'
        );

        foreach ( $expected['breakdown'] as $index => $row ) {
            $this->assertCloseOrNull( $row['amount'], $actual['breakdown'][ $index ]['amount'], 'breakdown ' . $row['key'] );
        }
    }

    /**
     * @param mixed $expected
     * @param mixed $actual
     */
    private function assertCloseOrNull( $expected, $actual, string $what ): void
    {
        if ( null === $expected ) {
            $this->assertNull( $actual, $what );

            return;
        }

        $this->assertEqualsWithDelta( (float) $expected, $actual, 1e-9, $what );
    }
}
```

`tests/php/Runtime/ValidatorTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Runtime\Validator;

final class ValidatorTest extends TestCase
{
    public function testTheEmailPatternUsesJavaScriptsWhitespaceSet(): void
    {
        $spaces = [ "\t", "\n", "\x0B", "\f", "\r", ' ', "\u{00A0}", "\u{1680}", "\u{2000}", "\u{200A}", "\u{2028}", "\u{2029}", "\u{202F}", "\u{205F}", "\u{3000}", "\u{FEFF}" ];

        foreach ( $spaces as $space ) {
            $this->assertSame( 'email', Validator::fieldErrorCode( [ 'type' => 'email' ], "a{$space}b@c", false ), bin2hex( $space ) );
        }

        $this->assertNull( Validator::fieldErrorCode( [ 'type' => 'email' ], "a\u{0085}b@c", false ), 'U+0085 is not JavaScript whitespace' );
    }

    public function testInvalidUtf8IsNotAnEmailAddress(): void
    {
        $this->assertSame( 'email', Validator::fieldErrorCode( [ 'type' => 'email' ], "a\xC3@b", false ) );
    }

    public function testTheFirstErrorStepFollowsSchemaOrder(): void
    {
        $schema     = [ 'steps' => [ [ 'key' => 'one', 'fields' => [ 'a' ] ], [ 'key' => 'two', 'fields' => [ 'b' ] ] ] ];
        $visibility = [ 'fields' => [ 'a' => true, 'b' => true ], 'steps' => [ 'one' => true, 'two' => true ], 'required' => [] ];

        $this->assertSame( 'two', Validator::firstErrorStep( $schema, $visibility, [ 'b' => 'required' ] ) );
        $this->assertSame( 'one', Validator::firstErrorStep( $schema, $visibility, [ 'b' => 'required', 'a' => 'min' ] ) );
        $this->assertNull( Validator::firstErrorStep( $schema, $visibility, [] ) );
    }
}
```

- [ ] **Step 2: Run** `./bin/phpunit --filter 'SubmissionParityTest|ValidatorTest'` → FAIL (classes missing).

- [ ] **Step 3: Create `includes/Runtime/Validator.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

/**
 * frontend-src/runtime/validate.js-in PHP əkizi. Mesaj yox, KOD qaytarır
 * (`required`, `email`, `min`, `max`) — mesajları WordPress qatı
 * (Submissions\SubmissionService) tərcümə edir, runtime WP-dən asılı qalmır.
 */
final class Validator
{
    private const SILENT_TYPES  = [ 'hidden', 'html' ];
    private const NUMERIC_TYPES = [ 'number', 'slider' ];

    // JS `\s`-in açıq yazılışı (validate.js-dəki WHITESPACE ilə EYNİ dəst).
    private const WHITESPACE = '\x{9}\x{A}\x{B}\x{C}\x{D}\x{20}\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    public const EMAIL_PATTERN = '/^[^@' . self::WHITESPACE . ']+@[^@' . self::WHITESPACE . ']+$/uD';

    /**
     * @param array<string, mixed> $field
     * @param mixed                $value
     */
    public static function fieldErrorCode( array $field, $value, bool $required ): ?string
    {
        if ( self::isBlank( $field, $value ) ) {
            return $required ? 'required' : null;
        }

        $type = $field['type'] ?? '';

        // preg_match() yanlış UTF-8-də `false` qaytarır — bu da ünvan deyil.
        if ( 'email' === $type && 1 !== preg_match( self::EMAIL_PATTERN, Values::stringify( $value ) ) ) {
            return 'email';
        }

        if ( in_array( $type, self::NUMERIC_TYPES, true ) ) {
            $numeric = Values::normalise( $field, $value );
            $min     = $field['min'] ?? null;
            $max     = $field['max'] ?? null;

            if ( ( is_int( $min ) || is_float( $min ) ) && $numeric < $min ) {
                return 'min';
            }

            if ( ( is_int( $max ) || is_float( $max ) ) && $numeric > $max ) {
                return 'max';
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array<string, mixed>                                                                          $state
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $visibility
     * @return array<string, string>
     */
    public static function validateVisible( array $schema, array $state, array $visibility ): array
    {
        $fields = is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
        $errors = [];

        foreach ( self::visibleSteps( $schema, $visibility ) as $step ) {
            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $key ) {
                $key   = (string) $key;
                $field = $fields[ $key ] ?? null;

                if ( ! is_array( $field ) || ! isset( $visibility['fields'][ $key ] ) || in_array( $field['type'] ?? '', self::SILENT_TYPES, true ) ) {
                    continue;
                }

                $code = self::fieldErrorCode( $field, $state[ $key ] ?? null, isset( $visibility['required'][ $key ] ) );

                if ( null !== $code ) {
                    $errors[ $key ] = $code;
                }
            }
        }

        return $errors;
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $visibility
     * @param array<string, string>                                                                         $errors
     */
    public static function firstErrorStep( array $schema, array $visibility, array $errors ): ?string
    {
        foreach ( self::visibleSteps( $schema, $visibility ) as $step ) {
            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $key ) {
                if ( isset( $errors[ (string) $key ] ) ) {
                    return (string) $step['key'];
                }
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $visibility
     * @return array<int, array<string, mixed>>
     */
    public static function visibleSteps( array $schema, array $visibility ): array
    {
        $steps   = is_array( $schema['steps'] ?? null ) ? $schema['steps'] : [];
        $visible = [];

        foreach ( $steps as $step ) {
            if ( is_array( $step ) && is_string( $step['key'] ?? null ) && isset( $visibility['steps'][ $step['key'] ] ) ) {
                $visible[] = $step;
            }
        }

        return $visible;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $value
     */
    private static function isBlank( array $field, $value ): bool
    {
        $type = $field['type'] ?? '';

        if ( 'toggle' === $type ) {
            return ! ( true === $value || 1 === $value || 1.0 === $value || '1' === $value );
        }

        if ( is_array( $value ) ) {
            return [] === $value;
        }

        if ( in_array( $type, self::NUMERIC_TYPES, true ) ) {
            return '' === Values::normalise( $field, $value );
        }

        return null === $value || '' === $value;
    }
}
```

- [ ] **Step 4: Create `includes/Runtime/Calculator.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

use Quoteform\Engine\CalculationGraph;
use Quoteform\Engine\ExpressionException;

/**
 * frontend-src/runtime/calculate.js-in PHP əkizi (formatlama xaric — o
 * MoneyFormatter-dədir). Hesablama xətası atılmır, `error` kodu kimi qayıdır:
 * müraciət yenə saxlanılmalıdır (əsas spec §14.3).
 */
final class Calculator
{
    private const TOTAL_KEY = 'total';

    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $variables
     * @return array{total: ?float, breakdown: array<int, array{key: string, label: string, amount: ?float}>, error: ?string}
     */
    public static function calculate( array $schema, array $variables ): array
    {
        $calculations = is_array( $schema['calculations'] ?? null ) ? array_values( array_filter( $schema['calculations'], 'is_array' ) ) : [];

        try {
            $values = CalculationGraph::evaluateAll( $calculations, $variables );
        } catch ( ExpressionException $error ) {
            return [ 'total' => null, 'breakdown' => [], 'error' => $error->getCodeSlug() ];
        } catch ( \Throwable $error ) {
            return [ 'total' => null, 'breakdown' => [], 'error' => 'calculation_failed' ];
        }

        $breakdown = [];

        foreach ( $calculations as $calculation ) {
            if ( true !== ( $calculation['visible'] ?? null ) ) {
                continue;
            }

            $key = (string) ( $calculation['key'] ?? '' );

            $breakdown[] = [
                'key'    => $key,
                'label'  => is_string( $calculation['label'] ?? null ) ? $calculation['label'] : '',
                'amount' => self::number( $values[ $key ] ?? null ),
            ];
        }

        return [
            'total'     => self::number( $values[ self::TOTAL_KEY ] ?? null ),
            'breakdown' => $breakdown,
            'error'     => null,
        ];
    }

    /**
     * @param mixed $value
     */
    private static function number( $value ): ?float
    {
        return ( is_int( $value ) || is_float( $value ) ) ? (float) $value : null;
    }
}
```

- [ ] **Step 5: Create `includes/Runtime/Evaluation.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

/**
 * Göndərilən formanın tam qiymətləndirilməsi — frontend-src/runtime/evaluate.js
 * ilə EYNİ nəticə (paritet: tests/fixtures/submissions.json).
 */
final class Evaluation
{
    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $state
     * @return array{visibility: array, visible_fields: string[], visible_steps: string[], required: string[], errors: array<string, string>, total: ?float, breakdown: array, calc_error: ?string}
     */
    public static function run( array $schema, array $state ): array
    {
        $visibility = Visibility::resolve( $schema, $state );
        $variables  = Values::variablesFor( $schema, $state, $visibility['fields'] );
        $result     = Calculator::calculate( $schema, $variables );

        return [
            'visibility'     => $visibility,
            'visible_fields' => self::sortedKeys( $visibility['fields'] ),
            'visible_steps'  => array_map(
                static function ( array $step ): string {
                    return (string) $step['key'];
                },
                Validator::visibleSteps( $schema, $visibility )
            ),
            'required'       => self::sortedKeys( $visibility['required'] ),
            'errors'         => Validator::validateVisible( $schema, $state, $visibility ),
            'total'          => $result['total'],
            'breakdown'      => $result['breakdown'],
            'calc_error'     => $result['error'],
        ];
    }

    /**
     * @param array<string, true> $set
     * @return string[]
     */
    private static function sortedKeys( array $set ): array
    {
        $keys = array_map( 'strval', array_keys( $set ) );
        sort( $keys, SORT_STRING );

        return $keys;
    }
}
```

- [ ] **Step 6: Run** `./bin/phpunit --filter 'SubmissionParityTest|ValidatorTest'` → PASS (22 parity cases). A failing parity case is a real divergence — **do not edit the fixture**; report case id, expected, actual. Then `./bin/phpunit`, `QF_PHP=php:7.4-cli ./bin/phpunit`, `npm test` → green.

---

### Task 6: `MoneyFormatter` + `money.json` paritet

**Files:**
- Create: `includes/Runtime/MoneyFormatter.php`, `tests/fixtures/money.json`, `tests/php/Runtime/MoneyParityTest.php`, `tests/js/frontend/money-parity.test.js`

**Interfaces:**
- Consumes: `Quoteform\Engine\Functions::roundHalfAwayFromZero( float $value, int $precision ): float`; JS `formatMoney( amount, settings )` (`frontend-src/runtime/format.js`, unchanged).
- Produces: `MoneyFormatter::format( $amount, array $settings, string $thousands = ',', string $decimalPoint = '.' ): string`.

- [ ] **Step 1: Create `tests/fixtures/money.json`:**

```json
{
  "_comment": "Pul formatı paritet halları. JS en-US (jsdom-da document.lang boşdur → FALLBACK_LOCALE), PHP ',' və '.' ayırıcıları ilə yoxlanılır. Gözlənilən dəyərlər əl ilə yazılıb.",
  "cases": [
    { "id": "grouping-and-decimals", "amount": 1234.5, "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 }, "expect": "$1,234.50" },
    { "id": "negative-sign-before-symbol", "amount": -1234.5, "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 }, "expect": "-$1,234.50" },
    { "id": "half-rounds-away-from-zero", "amount": 0.005, "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 }, "expect": "$0.01" },
    { "id": "symbol-after", "amount": 1234.5, "settings": { "currency": "AZN", "currency_position": "after", "decimals": 2 }, "expect": "1,234.50 ₼" },
    { "id": "unknown-currency-uses-its-code", "amount": 1, "settings": { "currency": "XYZ", "currency_position": "before", "decimals": 2 }, "expect": "XYZ1.00" },
    { "id": "zero-decimals-rounds", "amount": 1234.5, "settings": { "currency": "USD", "currency_position": "before", "decimals": 0 }, "expect": "$1,235" },
    { "id": "null-is-a-dash", "amount": null, "settings": { "currency": "EUR", "currency_position": "before", "decimals": 2 }, "expect": "—" },
    { "id": "string-is-a-dash", "amount": "5", "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 }, "expect": "—" },
    { "id": "missing-decimals-means-two", "amount": 2.5, "settings": { "currency": "USD", "currency_position": "before" }, "expect": "$2.50" },
    { "id": "negative-zero-has-no-sign", "amount": -0.001, "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 }, "expect": "$0.00" },
    { "id": "millions", "amount": 1234567.891, "settings": { "currency": "USD", "currency_position": "before", "decimals": 2 }, "expect": "$1,234,567.89" }
  ]
}
```

- [ ] **Step 2: Write both tests.**

`tests/js/frontend/money-parity.test.js`:

```js
import fixtures from '../../fixtures/money.json';
import { formatMoney } from '../../../frontend-src/runtime/format';

describe( 'money parity fixtures', () => {
	it.each( fixtures.cases.map( ( testCase ) => [ testCase.id, testCase ] ) )( '%s', ( id, testCase ) => {
		expect( formatMoney( testCase.amount, testCase.settings ) ).toBe( testCase.expect );
	} );
} );
```

`tests/php/Runtime/MoneyParityTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Runtime\MoneyFormatter;

final class MoneyParityTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function caseProvider(): array
    {
        $decoded  = json_decode( (string) file_get_contents( __DIR__ . '/../../fixtures/money.json' ), true );
        $provided = [];

        foreach ( $decoded['cases'] as $case ) {
            $provided[ $case['id'] ] = [ $case ];
        }

        return $provided;
    }

    /**
     * @dataProvider caseProvider
     * @param array<string, mixed> $case
     */
    public function testFixtureCase( array $case ): void
    {
        $this->assertSame( $case['expect'], MoneyFormatter::format( $case['amount'], $case['settings'] ) );
    }

    public function testSeparatorsComeFromTheCaller(): void
    {
        $settings = [ 'currency' => 'EUR', 'currency_position' => 'after', 'decimals' => 2 ];

        $this->assertSame( '1.234,50 €', MoneyFormatter::format( 1234.5, $settings, '.', ',' ) );
    }
}
```

- [ ] **Step 3: Run** `npx jest tests/js/frontend/money-parity.test.js` → PASS already (it pins the existing JS formatter; if a case fails, the JS formatter disagrees with the hand-written expectation — report, do not edit). `./bin/phpunit --filter MoneyParityTest` → FAIL (class missing).

- [ ] **Step 4: Create `includes/Runtime/MoneyFormatter.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

use Quoteform\Engine\Functions;

/**
 * frontend-src/runtime/format.js-in PHP əkizi. JS ayırıcıları brauzerin
 * dilindən (`toLocaleString`) alır; PHP onları çağırandan alır (WordPress
 * qatı `$wp_locale`-dən ötürür) — runtime WP-dən asılı qalmır.
 */
final class MoneyFormatter
{
    private const SYMBOLS = [
        'USD' => '$',
        'EUR' => '€',
        'GBP' => '£',
        'JPY' => '¥',
        'AUD' => 'A$',
        'CAD' => 'C$',
        'CHF' => 'CHF',
        'SEK' => 'kr',
        'NOK' => 'kr',
        'DKK' => 'kr',
        'PLN' => 'zł',
        'TRY' => '₺',
        'AZN' => '₼',
        'RUB' => '₽',
        'INR' => '₹',
        'BRL' => 'R$',
        'ZAR' => 'R',
        'NZD' => 'NZ$',
    ];

    /**
     * @param mixed                $amount
     * @param array<string, mixed> $settings
     */
    public static function format( $amount, array $settings, string $thousands = ',', string $decimalPoint = '.' ): string
    {
        if ( ! ( is_int( $amount ) || is_float( $amount ) ) || ! is_finite( (float) $amount ) ) {
            return '—';
        }

        $decimals = is_int( $settings['decimals'] ?? null ) ? $settings['decimals'] : 2;
        $rounded  = Functions::roundHalfAwayFromZero( (float) $amount, $decimals );
        $currency = is_string( $settings['currency'] ?? null ) ? $settings['currency'] : '';
        $symbol   = self::SYMBOLS[ $currency ] ?? $currency;
        $digits   = number_format( abs( $rounded ), $decimals, $decimalPoint, $thousands );
        $body     = 'after' === ( $settings['currency_position'] ?? null ) ? $digits . ' ' . $symbol : $symbol . $digits;

        return $rounded < 0 ? '-' . $body : $body;
    }
}
```

- [ ] **Step 5: Run** `./bin/phpunit --filter MoneyParityTest` → PASS; both PHP versions + `npm test` → green.

---

### Task 7: `EntriesTable` — cədvəl, versiya, multisite, silmə

**Files:**
- Create: `includes/Entries/EntriesTable.php`
- Modify: `includes/Support/Activation.php` (`activate( bool $networkWide = false )`), `includes/Support/Uninstaller.php` (`cleanCurrentSite()`-ə `EntriesTable::drop()`), `includes/Plugin.php` (iki hook)
- Test: `tests/integration/EntriesTableTest.php`

**Interfaces:**
- Produces: `EntriesTable::VERSION = '1'`, `EntriesTable::OPTION = 'qform_db_version'`, `EntriesTable::name(): string`, `install(): void`, `maybeUpgrade(): void`, `drop(): void`, `installForActivation( bool $networkWide ): void`, `onNewSite( \WP_Site $site ): void`.

**Test infrastructure note:** WP test suite `CREATE TABLE` → `CREATE TEMPORARY TABLE` və `DROP TABLE` → `DROP TEMPORARY TABLE` çevirir; `SHOW TABLES` müvəqqəti cədvəlləri göstərmir, `SHOW COLUMNS FROM` göstərir. Ona görə testlər mövcudluğu `SHOW COLUMNS` ilə yoxlayır və hər `setUp()` əvvəlcə `drop()`, sonra `install()` edir.

- [ ] **Step 1: Write the failing test** — `tests/integration/EntriesTableTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use Quoteform\Support\Uninstaller;
use WP_UnitTestCase;

final class EntriesTableTest extends WP_UnitTestCase
{
    private const COLUMNS = [ 'id', 'form_id', 'status', 'total', 'currency', 'data', 'breakdown', 'resume_token', 'current_step', 'user_id', 'ip', 'user_agent', 'read_at', 'created_at', 'updated_at' ];

    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    /** @return string[] */
    private function columns(): array
    {
        global $wpdb;

        $wpdb->suppress_errors( true );
        $columns = $wpdb->get_col( 'SHOW COLUMNS FROM ' . EntriesTable::name() );
        $wpdb->suppress_errors( false );

        return is_array( $columns ) ? $columns : [];
    }

    public function testInstallCreatesEveryColumnAndRecordsTheVersion(): void
    {
        EntriesTable::install();

        foreach ( self::COLUMNS as $column ) {
            $this->assertContains( $column, $this->columns() );
        }

        $this->assertSame( EntriesTable::VERSION, get_option( EntriesTable::OPTION ) );
    }

    public function testTheTableIsPrefixed(): void
    {
        global $wpdb;

        $this->assertSame( $wpdb->prefix . 'qform_entries', EntriesTable::name() );
    }

    public function testMaybeUpgradeInstallsWhenTheVersionIsMissing(): void
    {
        EntriesTable::maybeUpgrade();

        $this->assertNotEmpty( $this->columns() );
        $this->assertSame( EntriesTable::VERSION, get_option( EntriesTable::OPTION ) );
    }

    public function testMaybeUpgradeLeavesACurrentTableAlone(): void
    {
        EntriesTable::install();

        $creates = 0;
        $counter = static function ( string $query ) use ( &$creates ): string {
            if ( false !== stripos( $query, 'CREATE' ) ) {
                $creates++;
            }

            return $query;
        };

        add_filter( 'query', $counter );
        EntriesTable::maybeUpgrade();
        remove_filter( 'query', $counter );

        $this->assertSame( 0, $creates );
    }

    public function testDropRemovesTheTableAndTheVersion(): void
    {
        EntriesTable::install();
        EntriesTable::drop();

        $this->assertSame( [], $this->columns() );
        $this->assertFalse( get_option( EntriesTable::OPTION ) );
    }

    public function testActivationInstallsTheTable(): void
    {
        Activation::activate();

        $this->assertNotEmpty( $this->columns() );
    }

    public function testUninstallDropsTheTable(): void
    {
        EntriesTable::install();

        Uninstaller::run();

        $this->assertSame( [], $this->columns() );
    }
}
```

- [ ] **Step 2: Run** `make itest ARGS="--filter EntriesTableTest"` → FAIL (class missing).

- [ ] **Step 3: Create `includes/Entries/EntriesTable.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use WP_Site;

/**
 * `{prefix}qform_entries` cədvəli (əsas spec §6.3 + `read_at`, yeni spec §6).
 *
 * Plugin yeniləndikdə aktivasiya hook-u İŞLƏMİR, ona görə versiya `init`-də
 * də yoxlanılır (`maybeUpgrade`, yalnız autoload option oxunuşu).
 */
final class EntriesTable
{
    public const VERSION = '1';
    public const OPTION  = 'qform_db_version';

    public static function name(): string
    {
        global $wpdb;

        return $wpdb->prefix . 'qform_entries';
    }

    public static function install(): void
    {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $table   = self::name();
        $charset = $wpdb->get_charset_collate();

        // dbDelta formatı: hər sütun ayrı sətirdə, PRIMARY KEY-dən sonra İKİ boşluq.
        $sql = "CREATE TABLE {$table} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  form_id bigint(20) unsigned NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  total decimal(18,4) DEFAULT NULL,
  currency char(3) NOT NULL DEFAULT 'USD',
  data longtext NOT NULL,
  breakdown longtext DEFAULT NULL,
  resume_token char(32) DEFAULT NULL,
  current_step smallint(5) unsigned NOT NULL DEFAULT 0,
  user_id bigint(20) unsigned DEFAULT NULL,
  ip varbinary(16) DEFAULT NULL,
  user_agent varchar(255) DEFAULT NULL,
  read_at datetime DEFAULT NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  PRIMARY KEY  (id),
  KEY form_status (form_id,status),
  KEY status_read (status,read_at),
  KEY created (created_at),
  UNIQUE KEY resume (resume_token)
) {$charset};";

        dbDelta( $sql );

        update_option( self::OPTION, self::VERSION );
    }

    public static function maybeUpgrade(): void
    {
        if ( self::VERSION !== get_option( self::OPTION ) ) {
            self::install();
        }
    }

    public static function drop(): void
    {
        global $wpdb;

        $wpdb->query( 'DROP TABLE IF EXISTS ' . self::name() ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- table name is ours.

        delete_option( self::OPTION );
    }

    public static function installForActivation( bool $networkWide ): void
    {
        if ( ! is_multisite() || ! $networkWide ) {
            self::install();

            return;
        }

        foreach ( get_sites( [ 'fields' => 'ids', 'number' => 0 ] ) as $siteId ) {
            switch_to_blog( (int) $siteId );
            self::install();
            restore_current_blog();
        }
    }

    public static function onNewSite( WP_Site $site ): void
    {
        switch_to_blog( (int) $site->blog_id );
        self::install();
        restore_current_blog();
    }
}
```

- [ ] **Step 4: Wire it in.**

`includes/Support/Activation.php` — `activate()` becomes:

```php
    public static function activate( bool $networkWide = false ): void
    {
        Capabilities::grantToAdministrator();
        EntriesTable::installForActivation( $networkWide );

        flush_rewrite_rules();
    }
```
(+ `use Quoteform\Entries\EntriesTable;`)

`includes/Support/Uninstaller.php` — `cleanCurrentSite()`:

```php
    private static function cleanCurrentSite(): void
    {
        Capabilities::revokeFromAllRoles();

        self::deleteAllForms();

        EntriesTable::drop();
    }
```
(+ `use Quoteform\Entries\EntriesTable;`; `uninstall.php`'s own autoloader already maps `Quoteform\` → `includes/`.)

`includes/Plugin.php` — after the `init` actions:

```php
        add_action( 'init', [ EntriesTable::class, 'maybeUpgrade' ], 5 );
        add_action( 'wp_initialize_site', [ EntriesTable::class, 'onNewSite' ], 20 );
```
(+ `use Quoteform\Entries\EntriesTable;`)

- [ ] **Step 5: Run** `make itest ARGS="--filter EntriesTableTest"` → PASS; then full `make itest`, `make itest-trash-disabled`, `./bin/phpunit`, `QF_PHP=php:7.4-cli ./bin/phpunit` → green (existing UninstallTest/PluginTest must still pass).

---

### Task 8: `EntryRepository`

**Files:**
- Create: `includes/Entries/EntryRepository.php`
- Test: `tests/integration/EntryRepositoryTest.php`

**Interfaces:**
- Produces: `EntryRepository::insert( array $entry ): int` — keys `form_id:int, status:string, total:?float, currency:string, data:array, breakdown:array, user_id:?int, ip:?string (binary), user_agent:?string`; returns new id or `0` on failure. `EntryRepository::find( int $id ): ?array` — same keys decoded (`data`/`breakdown` arrays, `total` `?float`, `id`, `created_at`, `read_at`). (Plan 07 adds listing/filtering.)

- [ ] **Step 1: Write the failing test** — `tests/integration/EntryRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryRepository;
use WP_UnitTestCase;

final class EntryRepositoryTest extends WP_UnitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
        EntriesTable::install();
    }

    private function entry( array $overrides = [] ): array
    {
        return array_merge(
            [
                'form_id'    => 12,
                'status'     => 'completed',
                'total'      => 240.0,
                'currency'   => 'USD',
                'data'       => [ 'rooms' => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3.0 ] ],
                'breakdown'  => [ 'currency' => 'USD', 'position' => 'before', 'decimals' => 2, 'lines' => [ [ 'key' => 'base', 'label' => 'Rooms', 'amount' => 120.0 ] ], 'error' => null ],
                'user_id'    => null,
                'ip'         => null,
                'user_agent' => 'Test agent',
            ],
            $overrides
        );
    }

    public function testAnInsertedEntryComesBackTheSame(): void
    {
        $repository = new EntryRepository();
        $id         = $repository->insert( $this->entry() );
        $found      = $repository->find( $id );

        $this->assertGreaterThan( 0, $id );
        $this->assertSame( 12, $found['form_id'] );
        $this->assertSame( 'completed', $found['status'] );
        $this->assertSame( 240.0, $found['total'] );
        $this->assertSame( 'USD', $found['currency'] );
        $this->assertSame( 'Rooms', $found['data']['rooms']['label'] );
        $this->assertSame( 120.0, (float) $found['breakdown']['lines'][0]['amount'] );
        $this->assertNull( $found['user_id'] );
        $this->assertNull( $found['read_at'] );
        $this->assertMatchesRegularExpression( '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $found['created_at'] );
    }

    public function testAMissingTotalIsStoredAsNull(): void
    {
        $repository = new EntryRepository();
        $found      = $repository->find( $repository->insert( $this->entry( [ 'total' => null ] ) ) );

        $this->assertNull( $found['total'] );
    }

    public function testTheIpIsStoredAsBinary(): void
    {
        $repository = new EntryRepository();
        $found      = $repository->find( $repository->insert( $this->entry( [ 'ip' => inet_pton( '203.0.113.9' ) ] ) ) );

        $this->assertSame( '203.0.113.9', inet_ntop( $found['ip'] ) );
    }

    public function testFindReturnsNullForAnUnknownId(): void
    {
        $this->assertNull( ( new EntryRepository() )->find( 999999 ) );
    }

    public function testInsertReportsFailureAsZero(): void
    {
        global $wpdb;

        EntriesTable::drop();
        $wpdb->suppress_errors( true );
        $id = ( new EntryRepository() )->insert( $this->entry() );
        $wpdb->suppress_errors( false );

        $this->assertSame( 0, $id );
    }
}
```

- [ ] **Step 2: Run** `make itest ARGS="--filter EntryRepositoryTest"` → FAIL.

- [ ] **Step 3: Create `includes/Entries/EntryRepository.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Entries;

/**
 * `qform_entries` üzərində yazma/oxuma. Bütün sorğular `$wpdb->insert()` və
 * `$wpdb->prepare()` iləndir (əsas spec §15). Vaxtlar GMT-də saxlanılır.
 */
final class EntryRepository
{
    /**
     * @param array<string, mixed> $entry
     */
    public function insert( array $entry ): int
    {
        global $wpdb;

        $now = gmdate( 'Y-m-d H:i:s' );

        // `null` dəyərləri `$wpdb->insert()` NULL kimi yazır (WP 4.4+).
        $inserted = $wpdb->insert(
            EntriesTable::name(),
            [
                'form_id'    => (int) $entry['form_id'],
                'status'     => (string) $entry['status'],
                'total'      => null === $entry['total'] ? null : (string) $entry['total'],
                'currency'   => (string) $entry['currency'],
                'data'       => (string) wp_json_encode( $entry['data'] ),
                'breakdown'  => (string) wp_json_encode( $entry['breakdown'] ),
                'user_id'    => $entry['user_id'],
                'ip'         => $entry['ip'],
                'user_agent' => $entry['user_agent'],
                'created_at' => $now,
                'updated_at' => $now,
            ]
        );

        return $inserted ? (int) $wpdb->insert_id : 0;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find( int $id ): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row(
            $wpdb->prepare( 'SELECT * FROM ' . EntriesTable::name() . ' WHERE id = %d', $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is ours.
            ARRAY_A
        );

        return is_array( $row ) ? self::hydrate( $row ) : null;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function hydrate( array $row ): array
    {
        $data      = json_decode( (string) $row['data'], true );
        $breakdown = json_decode( (string) ( $row['breakdown'] ?? '' ), true );

        return [
            'id'         => (int) $row['id'],
            'form_id'    => (int) $row['form_id'],
            'status'     => (string) $row['status'],
            'total'      => null === $row['total'] ? null : (float) $row['total'],
            'currency'   => (string) $row['currency'],
            'data'       => is_array( $data ) ? $data : [],
            'breakdown'  => is_array( $breakdown ) ? $breakdown : [],
            'user_id'    => null === $row['user_id'] ? null : (int) $row['user_id'],
            'ip'         => $row['ip'],
            'user_agent' => $row['user_agent'],
            'read_at'    => $row['read_at'],
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }
}
```

- [ ] **Step 4: Run** `make itest ARGS="--filter EntryRepositoryTest"` → PASS; full `make itest` → green.

---

### Task 9: `SpamGuard` və `InputSanitizer`

**Files:**
- Create: `includes/Submissions/SpamGuard.php`, `includes/Submissions/InputSanitizer.php`, `includes/Submissions/BadSubmission.php`
- Test: `tests/php/Submissions/SpamGuardTest.php` (vahid — WP yoxdur), `tests/integration/InputSanitizerTest.php`

**Interfaces:**
- Produces: `SpamGuard::MIN_SECONDS = 3`, `SpamGuard::MAX_SECONDS = 86400`; `new SpamGuard( string $secret, callable $clock )`; `SpamGuard::fromWordPress(): self` (secret `wp_salt( 'nonce' )`, clock `time`); `issueTicket( int $formId ): string`; `isSpam( int $formId, $honeypot, $ticket ): bool`.
- Produces: `InputSanitizer::sanitize( array $schema, $values ): array<string, mixed>` (every schema field present); throws `BadSubmission` (extends `\RuntimeException`) on tampering.

- [ ] **Step 1: Write the failing tests.**

`tests/php/Submissions/SpamGuardTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Submissions;

use PHPUnit\Framework\TestCase;
use Quoteform\Submissions\SpamGuard;

final class SpamGuardTest extends TestCase
{
    private function guardAt( int $now ): SpamGuard
    {
        return new SpamGuard( 'secret', static function () use ( $now ): int {
            return $now;
        } );
    }

    private function ticketAt( int $issuedAt, int $formId = 7 ): string
    {
        return $this->guardAt( $issuedAt )->issueTicket( $formId );
    }

    public function testATicketMustBeAtLeastThreeSecondsOld(): void
    {
        $ticket = $this->ticketAt( 1000 );

        $this->assertTrue( $this->guardAt( 1002 )->isSpam( 7, '', $ticket ) );
        $this->assertFalse( $this->guardAt( 1003 )->isSpam( 7, '', $ticket ) );
    }

    public function testATicketExpiresAfterADay(): void
    {
        $ticket = $this->ticketAt( 1000 );

        $this->assertFalse( $this->guardAt( 1000 + 86400 )->isSpam( 7, '', $ticket ) );
        $this->assertTrue( $this->guardAt( 1000 + 86401 )->isSpam( 7, '', $ticket ) );
    }

    public function testATicketBelongsToOneForm(): void
    {
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 8, '', $this->ticketAt( 1000, 7 ) ) );
    }

    public function testATamperedTicketIsSpam(): void
    {
        $ticket = $this->ticketAt( 1000 );
        [ $form, , $mac ] = explode( '.', $ticket );

        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', "{$form}.999.{$mac}" ) );
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', 'garbage' ) );
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', '' ) );
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', null ) );
    }

    public function testATicketFromAnotherSecretIsSpam(): void
    {
        $foreign = ( new SpamGuard( 'other', static function (): int {
            return 1000;
        } ) )->issueTicket( 7 );

        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', $foreign ) );
    }

    public function testAFilledHoneypotIsSpam(): void
    {
        $ticket = $this->ticketAt( 1000 );

        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, 'http://spam.example', $ticket ) );
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, [ 'x' ], $ticket ) );
        $this->assertFalse( $this->guardAt( 2000 )->isSpam( 7, '', $ticket ) );
    }
}
```

`tests/integration/InputSanitizerTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Submissions\BadSubmission;
use Quoteform\Submissions\InputSanitizer;
use WP_UnitTestCase;

final class InputSanitizerTest extends WP_UnitTestCase
{
    private function schema(): array
    {
        return [
            'fields' => [
                'name'    => [ 'key' => 'name', 'type' => 'text', 'default' => '' ],
                'notes'   => [ 'key' => 'notes', 'type' => 'textarea', 'default' => '' ],
                'email'   => [ 'key' => 'email', 'type' => 'email', 'default' => '' ],
                'rooms'   => [ 'key' => 'rooms', 'type' => 'number', 'default' => 1 ],
                'day'     => [ 'key' => 'day', 'type' => 'date', 'default' => '' ],
                'service' => [ 'key' => 'service', 'type' => 'radio', 'default' => 'a', 'options' => [ [ 'value' => 'a' ], [ 'value' => 'b' ] ] ],
                'extras'  => [ 'key' => 'extras', 'type' => 'checkbox', 'default' => [], 'options' => [ [ 'value' => 'x' ], [ 'value' => 'y' ] ] ],
                'agree'   => [ 'key' => 'agree', 'type' => 'toggle', 'default' => false ],
                'source'  => [ 'key' => 'source', 'type' => 'hidden', 'default' => 'google' ],
                'intro'   => [ 'key' => 'intro', 'type' => 'html', 'default' => '' ],
                'secret'  => [ 'key' => 'secret', 'type' => 'number', 'default' => 7 ],
            ],
            'steps'  => [
                [ 'key' => 'one', 'fields' => [ 'name', 'notes', 'email', 'rooms', 'day', 'service', 'extras', 'agree', 'source', 'intro' ] ],
            ],
        ];
    }

    private function clean( array $values ): array
    {
        return ( new InputSanitizer() )->sanitize( $this->schema(), $values );
    }

    private function assertBad( array $values ): void
    {
        try {
            $this->clean( $values );
            $this->fail( 'Expected BadSubmission for ' . wp_json_encode( $values ) );
        } catch ( BadSubmission $expected ) {
            $this->addToAssertionCount( 1 );
        }
    }

    public function testTextIsSanitisedAndCapped(): void
    {
        $this->assertSame( 'Jane', $this->clean( [ 'name' => " <b>Jane</b> " ] )['name'] );
        $this->assertSame( str_repeat( 'a', 500 ), $this->clean( [ 'name' => str_repeat( 'a', 500 ) ] )['name'] );
        $this->assertBad( [ 'name' => str_repeat( 'a', 501 ) ] );
        $this->assertBad( [ 'notes' => str_repeat( 'a', 5001 ) ] );
        $this->assertBad( [ 'name' => [ 'array' ] ] );
    }

    public function testNumbersFollowTheNumericRule(): void
    {
        $this->assertSame( 3.0, $this->clean( [ 'rooms' => '3' ] )['rooms'] );
        $this->assertSame( 3.0, $this->clean( [ 'rooms' => 3 ] )['rooms'] );
        $this->assertSame( '', $this->clean( [ 'rooms' => ' 3' ] )['rooms'] );
    }

    public function testDatesMustBeRealCalendarDates(): void
    {
        $this->assertSame( '2026-09-24', $this->clean( [ 'day' => '2026-09-24' ] )['day'] );
        $this->assertSame( '', $this->clean( [ 'day' => '' ] )['day'] );
        $this->assertBad( [ 'day' => '2026-13-40' ] );
        $this->assertBad( [ 'day' => '24.09.2026' ] );
    }

    public function testChoicesMustBeOptions(): void
    {
        $this->assertSame( 'b', $this->clean( [ 'service' => 'b' ] )['service'] );
        $this->assertSame( '', $this->clean( [ 'service' => '' ] )['service'] );
        $this->assertBad( [ 'service' => 'z' ] );
        $this->assertSame( [ 'y', 'x' ], $this->clean( [ 'extras' => [ 'y', 'x', 'y' ] ] )['extras'] );
        $this->assertBad( [ 'extras' => [ 'x', 'sauna' ] ] );
        $this->assertBad( [ 'extras' => 'x' ] );
    }

    public function testTogglesAreZeroOrOne(): void
    {
        $this->assertSame( 1, $this->clean( [ 'agree' => true ] )['agree'] );
        $this->assertSame( 0, $this->clean( [ 'agree' => false ] )['agree'] );
        $this->assertBad( [ 'agree' => 'maybe' ] );
    }

    public function testTheBrowserCannotChooseHiddenOrUnplacedValues(): void
    {
        $clean = $this->clean( [ 'source' => 'tampered', 'secret' => 999, 'intro' => '<script>' ] );

        $this->assertSame( 'google', $clean['source'] );
        $this->assertSame( 7, $clean['secret'] );
        $this->assertSame( '', $clean['intro'] );
    }

    public function testUnknownKeysAreDroppedAndMissingOnesAreEmpty(): void
    {
        $clean = $this->clean( [ 'ghost' => 'boo' ] );

        $this->assertArrayNotHasKey( 'ghost', $clean );
        $this->assertSame( '', $clean['name'] );
        $this->assertSame( [], $clean['extras'] );
        $this->assertSame( 0, $clean['agree'] );
    }

    public function testValuesMustBeAnObject(): void
    {
        $this->expectException( BadSubmission::class );

        ( new InputSanitizer() )->sanitize( $this->schema(), 'nope' );
    }
}
```

- [ ] **Step 2: Run** `./bin/phpunit --filter SpamGuardTest` and `make itest ARGS="--filter InputSanitizerTest"` → FAIL.

- [ ] **Step 3: Create the three classes.**

`includes/Submissions/BadSubmission.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Submissions;

/**
 * Brauzerin interfeysindən gələ bilməyən göndəriş (saxtalaşdırma): naməlum
 * variant, uzun mətn, yanlış tarix. REST onu 400 `qform_bad_request` edir.
 */
final class BadSubmission extends \RuntimeException
{
}
```

`includes/Submissions/SpamGuard.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Submissions;

/**
 * Honeypot + serverin imzaladığı ticket (yeni spec §4.2). Ticket
 * `{form_id}.{issued_at}.{hmac}`-dir; vaxtı SERVER yazır və imzalayır, yəni
 * brauzerin saatına etibar edilmir. Saat və açar kənardan gəlir (test üçün).
 */
final class SpamGuard
{
    public const MIN_SECONDS = 3;
    public const MAX_SECONDS = 86400;

    /** @var string */
    private $secret;

    /** @var callable(): int */
    private $clock;

    public function __construct( string $secret, callable $clock )
    {
        $this->secret = $secret;
        $this->clock  = $clock;
    }

    public static function fromWordPress(): self
    {
        return new self( wp_salt( 'nonce' ), 'time' );
    }

    public function issueTicket( int $formId ): string
    {
        $issuedAt = (int) ( $this->clock )();

        return $formId . '.' . $issuedAt . '.' . $this->sign( $formId, $issuedAt );
    }

    /**
     * @param mixed $honeypot
     * @param mixed $ticket
     */
    public function isSpam( int $formId, $honeypot, $ticket ): bool
    {
        if ( ! is_string( $honeypot ) || '' !== $honeypot ) {
            return true;
        }

        if ( ! is_string( $ticket ) ) {
            return true;
        }

        $parts = explode( '.', $ticket );

        if ( 3 !== count( $parts ) || ! ctype_digit( $parts[0] ) || ! ctype_digit( $parts[1] ) ) {
            return true;
        }

        $issuedAt = (int) $parts[1];

        if ( (int) $parts[0] !== $formId || ! hash_equals( $this->sign( $formId, $issuedAt ), $parts[2] ) ) {
            return true;
        }

        $age = (int) ( $this->clock )() - $issuedAt;

        return $age < self::MIN_SECONDS || $age > self::MAX_SECONDS;
    }

    private function sign( int $formId, int $issuedAt ): string
    {
        return hash_hmac( 'sha256', $formId . '|' . $issuedAt, $this->secret );
    }
}
```

`includes/Submissions/InputSanitizer.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Submissions;

use Quoteform\Engine\Values as EngineValues;

/**
 * Brauzerdən gələn dəyərlərin qəbulu (yeni spec §4.4). Server burada
 * brauzerdən DAHA SƏRTDİR: interfeysin yarada bilmədiyi hər şey
 * BadSubmission-dır; brauzerin seçə bilmədiyi dəyərlər (hidden, html,
 * heç bir addımda olmayan sahə) sxemin `default`-undan götürülür.
 */
final class InputSanitizer
{
    private const TEXT_LIMIT     = 500;
    private const TEXTAREA_LIMIT = 5000;

    /**
     * @param array<string, mixed> $schema
     * @param mixed                $values
     * @return array<string, mixed>
     */
    public function sanitize( array $schema, $values ): array
    {
        if ( ! is_array( $values ) ) {
            throw new BadSubmission( 'values' );
        }

        $fields = is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
        $placed = $this->placedKeys( $schema );
        $clean  = [];

        foreach ( $fields as $key => $field ) {
            $key  = (string) $key;
            $type = $field['type'] ?? '';

            if ( 'hidden' === $type || 'html' === $type || ! isset( $placed[ $key ] ) ) {
                $clean[ $key ] = $field['default'] ?? '';

                continue;
            }

            $clean[ $key ] = $this->one( $field, $values[ $key ] ?? null );
        }

        return $clean;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return mixed
     */
    private function one( array $field, $raw )
    {
        switch ( $field['type'] ?? '' ) {
            case 'text':
            case 'tel':
            case 'email':
                return sanitize_text_field( $this->text( $raw, self::TEXT_LIMIT ) );

            case 'textarea':
                return sanitize_textarea_field( $this->text( $raw, self::TEXTAREA_LIMIT ) );

            case 'number':
            case 'slider':
                return $this->number( $raw );

            case 'date':
                return $this->date( $raw );

            case 'select':
            case 'radio':
                return $this->choice( $field, $raw );

            case 'checkbox':
                return $this->choices( $field, $raw );

            case 'toggle':
                return $this->toggle( $raw );
        }

        return '';
    }

    /**
     * @param mixed $raw
     */
    private function text( $raw, int $limit ): string
    {
        if ( null === $raw ) {
            return '';
        }

        if ( is_int( $raw ) || is_float( $raw ) ) {
            $raw = (string) $raw;
        }

        if ( ! is_string( $raw ) || mb_strlen( $raw ) > $limit ) {
            throw new BadSubmission( 'text' );
        }

        return $raw;
    }

    /**
     * @param mixed $raw
     * @return float|string
     */
    private function number( $raw )
    {
        if ( is_int( $raw ) || is_float( $raw ) ) {
            return is_finite( (float) $raw ) ? (float) $raw : '';
        }

        if ( null === $raw || '' === $raw ) {
            return '';
        }

        if ( ! is_string( $raw ) ) {
            throw new BadSubmission( 'number' );
        }

        return EngineValues::isNumericString( $raw ) ? (float) $raw : '';
    }

    /**
     * @param mixed $raw
     */
    private function date( $raw ): string
    {
        if ( null === $raw || '' === $raw ) {
            return '';
        }

        if ( ! is_string( $raw ) || 1 !== preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/D', $raw, $parts ) || ! checkdate( (int) $parts[2], (int) $parts[3], (int) $parts[1] ) ) {
            throw new BadSubmission( 'date' );
        }

        return $raw;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     */
    private function choice( array $field, $raw ): string
    {
        if ( null === $raw || '' === $raw ) {
            return '';
        }

        if ( ! is_string( $raw ) || ! in_array( $raw, $this->optionValues( $field ), true ) ) {
            throw new BadSubmission( 'choice' );
        }

        return $raw;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return string[]
     */
    private function choices( array $field, $raw ): array
    {
        if ( null === $raw ) {
            return [];
        }

        if ( ! is_array( $raw ) ) {
            throw new BadSubmission( 'choices' );
        }

        $allowed = $this->optionValues( $field );
        $chosen  = [];

        foreach ( $raw as $value ) {
            if ( ! is_string( $value ) || ! in_array( $value, $allowed, true ) ) {
                throw new BadSubmission( 'choices' );
            }

            if ( ! in_array( $value, $chosen, true ) ) {
                $chosen[] = $value;
            }
        }

        return $chosen;
    }

    /**
     * @param mixed $raw
     */
    private function toggle( $raw ): int
    {
        if ( true === $raw || 1 === $raw || '1' === $raw ) {
            return 1;
        }

        if ( null === $raw || false === $raw || 0 === $raw || '0' === $raw || '' === $raw ) {
            return 0;
        }

        throw new BadSubmission( 'toggle' );
    }

    /**
     * @param array<string, mixed> $field
     * @return string[]
     */
    private function optionValues( array $field ): array
    {
        $values = [];

        foreach ( is_array( $field['options'] ?? null ) ? $field['options'] : [] as $option ) {
            if ( is_array( $option ) && is_string( $option['value'] ?? null ) ) {
                $values[] = $option['value'];
            }
        }

        return $values;
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<string, true>
     */
    private function placedKeys( array $schema ): array
    {
        $placed = [];

        foreach ( is_array( $schema['steps'] ?? null ) ? $schema['steps'] : [] as $step ) {
            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $key ) {
                $placed[ (string) $key ] = true;
            }
        }

        return $placed;
    }
}
```

- [ ] **Step 4: Run** `./bin/phpunit --filter SpamGuardTest` (8.2 + 7.4) and `make itest ARGS="--filter InputSanitizerTest"` → PASS; full suites green.

---

### Task 10: `SubmissionService`

**Files:**
- Create: `includes/Submissions/SubmissionService.php`
- Test: `tests/integration/SubmissionServiceTest.php`

**Interfaces:**
- Consumes: `SchemaRepository::find()`, `FormPostType::POST_TYPE`, `EntryRepository`, `SpamGuard`, `InputSanitizer`, `Runtime\Evaluation`, `Runtime\Validator::firstErrorStep`, `Runtime\MoneyFormatter`.
- Produces: `SubmissionService::NONCE_ACTION = 'qform_submit'`; `SubmissionService::isPublishedForm( int $formId ): bool`; `new SubmissionService( ?SchemaRepository, ?EntryRepository, ?SpamGuard, ?InputSanitizer )` (nulls → defaults); `submit( array $request, array $context ): array{status: int, body: array}` where `$request = { form_id, values, hp, ticket }`, `$context = { user_id: int, ip: ?string (text), user_agent: string }`.

Response bodies:
- 201 message: `{ success_action: 'message', message: string, total: ?string, breakdown: [ { label, formatted } ] }`
- 201 redirect: `{ success_action: 'redirect', redirect_url: string }`
- spam 201: like the above but `total: null, breakdown: []` (redirect unchanged)
- 400: `{ code: 'qform_bad_request', message }`; 404: `{ code: 'qform_not_found', message }`; 422: `{ code: 'qform_invalid_submission', message, errors: { key: message }, step: ?string }`; 500: `{ code: 'qform_save_failed', message }`.

- [ ] **Step 1: Write the failing test** — `tests/integration/SubmissionServiceTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryRepository;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Submissions\SpamGuard;
use Quoteform\Submissions\SubmissionService;
use WP_UnitTestCase;

final class SubmissionServiceTest extends WP_UnitTestCase
{
    private const NOW = 1790000000;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
    }

    private function schema( array $settings = [] ): array
    {
        return [
            'version'       => 1,
            'settings'      => array_merge(
                [ 'currency' => 'USD', 'currency_position' => 'before', 'decimals' => 2, 'submit_label' => 'Go', 'success_action' => 'message', 'success_message' => 'Thanks!', 'redirect_url' => '', 'save_resume' => false, 'store_ip' => false ],
                $settings
            ),
            'fields'        => [
                'rooms'   => [ 'key' => 'rooms', 'type' => 'number', 'label' => 'Rooms', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => 1, 'min' => 1, 'max' => 10, 'step' => 1 ],
                'service' => [ 'key' => 'service', 'type' => 'radio', 'label' => 'Service', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => 'standard', 'options' => [ [ 'label' => 'Standard', 'value' => 'standard', 'price' => 0 ], [ 'label' => 'Deep', 'value' => 'deep', 'price' => 60 ] ] ],
                'source'  => [ 'key' => 'source', 'type' => 'hidden', 'label' => '', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => 'google' ],
                'email'   => [ 'key' => 'email', 'type' => 'email', 'label' => 'Email', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => '' ],
            ],
            'steps'         => [
                [ 'key' => 'one', 'title' => 'One', 'description' => '', 'fields' => [ 'rooms', 'service', 'source' ] ],
                [ 'key' => 'two', 'title' => 'Two', 'description' => '', 'fields' => [ 'email' ] ],
            ],
            'calculations'  => [
                [ 'key' => 'base', 'label' => 'Rooms', 'expression' => '{rooms} * 40 + {service.price}', 'visible' => true ],
                [ 'key' => 'total', 'label' => 'Total', 'expression' => '{base}', 'visible' => false ],
            ],
            'rules'         => [],
            'notifications' => [],
        ];
    }

    private function form( array $schema, string $status = 'publish' ): int
    {
        $id = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => $status, 'post_title' => 'Quote' ] );
        ( new SchemaRepository() )->save( $id, $schema );

        return $id;
    }

    private function service(): SubmissionService
    {
        $guard = new SpamGuard( 'secret', static function (): int {
            return self::NOW;
        } );

        return new SubmissionService( null, null, $guard, null );
    }

    private function ticket( int $formId, int $age = 10 ): string
    {
        return ( new SpamGuard( 'secret', static function () use ( $age ): int {
            return self::NOW - $age;
        } ) )->issueTicket( $formId );
    }

    private function submit( int $formId, array $values, array $extra = [], array $context = [] ): array
    {
        return $this->service()->submit(
            array_merge( [ 'form_id' => $formId, 'values' => $values, 'hp' => '', 'ticket' => $this->ticket( $formId ) ], $extra ),
            array_merge( [ 'user_id' => 0, 'ip' => '203.0.113.9', 'user_agent' => 'Agent' ], $context )
        );
    }

    private function rows(): array
    {
        global $wpdb;

        return $wpdb->get_results( 'SELECT * FROM ' . EntriesTable::name(), ARRAY_A );
    }

    public function testAGoodSubmissionIsSavedAndPricedByTheServer(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 3, 'service' => 'deep', 'email' => 'a@b', 'source' => 'tampered' ] );

        $this->assertSame( 201, $result['status'] );
        $this->assertSame( 'message', $result['body']['success_action'] );
        $this->assertSame( 'Thanks!', $result['body']['message'] );
        $this->assertSame( '$180.00', $result['body']['total'] );
        $this->assertSame( [ [ 'label' => 'Rooms', 'formatted' => '$180.00' ] ], $result['body']['breakdown'] );

        $rows  = $this->rows();
        $entry = EntryRepository::hydrate( $rows[0] );

        $this->assertCount( 1, $rows );
        $this->assertSame( 'completed', $entry['status'] );
        $this->assertSame( 180.0, $entry['total'] );
        $this->assertSame( [ 'label' => 'Service', 'type' => 'radio', 'value' => 'deep', 'display' => 'Deep' ], $entry['data']['service'] );
        $this->assertSame( 'google', $entry['data']['source']['value'], 'hidden values come from the schema' );
        $this->assertSame( 'USD', $entry['breakdown']['currency'] );
        $this->assertSame( 'Rooms', $entry['breakdown']['lines'][0]['label'] );
        $this->assertNull( $entry['ip'], 'store_ip is off' );
        $this->assertSame( 'Agent', $entry['user_agent'] );
    }

    public function testTheIpIsKeptOnlyWhenTheFormAsksForIt(): void
    {
        $formId = $this->form( $this->schema( [ 'store_ip' => true ] ) );
        $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ] );

        $this->assertSame( '203.0.113.9', inet_ntop( $this->rows()[0]['ip'] ) );
    }

    public function testInvalidAnswersComeBackWithMessagesAndTheirStep(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 11, 'service' => 'standard', 'email' => '' ] );

        $this->assertSame( 422, $result['status'] );
        $this->assertSame( 'qform_invalid_submission', $result['body']['code'] );
        $this->assertSame( 'Enter 10 or less.', $result['body']['errors']['rooms'] );
        $this->assertSame( 'This field is required.', $result['body']['errors']['email'] );
        $this->assertSame( 'one', $result['body']['step'] );
        $this->assertSame( [], $this->rows() );
    }

    public function testATamperedChoiceIsABadRequest(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'free', 'email' => 'a@b' ] );

        $this->assertSame( 400, $result['status'] );
        $this->assertSame( 'qform_bad_request', $result['body']['code'] );
        $this->assertSame( [], $this->rows() );
    }

    public function testSpamLooksLikeSuccessButIsNotSaved(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ], [ 'hp' => 'filled' ] );

        $this->assertSame( 201, $result['status'] );
        $this->assertSame( 'Thanks!', $result['body']['message'] );
        $this->assertNull( $result['body']['total'] );
        $this->assertSame( [], $result['body']['breakdown'] );
        $this->assertSame( [], $this->rows() );
    }

    public function testATooFreshTicketIsSpam(): void
    {
        $formId = $this->form( $this->schema() );
        $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ], [ 'ticket' => $this->ticket( $formId, 1 ) ] );

        $this->assertSame( [], $this->rows() );
    }

    public function testARedirectFormAnswersWithItsUrl(): void
    {
        $formId = $this->form( $this->schema( [ 'success_action' => 'redirect', 'redirect_url' => 'https://example.com/thanks' ] ) );
        $result = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ] );

        $this->assertSame( 201, $result['status'] );
        $this->assertSame( [ 'success_action' => 'redirect', 'redirect_url' => 'https://example.com/thanks' ], $result['body'] );
    }

    public function testACalculationErrorStillSavesTheEntry(): void
    {
        $schema                                   = $this->schema();
        $schema['calculations'][0]['expression'] = '{rooms} / 0';
        $formId                                   = $this->form( $schema );
        $result                                   = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ] );
        $entry                                    = EntryRepository::hydrate( $this->rows()[0] );

        $this->assertSame( 201, $result['status'] );
        $this->assertNull( $result['body']['total'] );
        $this->assertNull( $entry['total'] );
        $this->assertSame( 'division_by_zero', $entry['breakdown']['error'] );
    }

    /**
     * @dataProvider unavailableStatuses
     */
    public function testOnlyPublishedFormsAcceptSubmissions( string $status ): void
    {
        $formId = $this->form( $this->schema(), $status );

        $this->assertSame( 404, $this->submit( $formId, [] )['status'] );
    }

    /** @return array<string, array{0: string}> */
    public function unavailableStatuses(): array
    {
        return [ 'draft' => [ 'draft' ], 'trash' => [ 'trash' ], 'private' => [ 'private' ] ];
    }

    public function testAnUnknownFormIsNotFound(): void
    {
        $this->assertSame( 404, $this->submit( 999999, [] )['status'] );
    }

    public function testAnOtherPostTypeIsNotAForm(): void
    {
        $postId = self::factory()->post->create( [ 'post_status' => 'publish' ] );

        $this->assertFalse( SubmissionService::isPublishedForm( $postId ) );
    }
}
```

(`SchemaRepository::save()` returns bool and only checks the post exists — see `includes/Forms/SchemaRepository.php:116`.)

- [ ] **Step 2: Run** `make itest ARGS="--filter SubmissionServiceTest"` → FAIL.

- [ ] **Step 3: Create `includes/Submissions/SubmissionService.php`:**

```php
<?php

declare(strict_types=1);

namespace Quoteform\Submissions;

use Quoteform\Entries\EntryRepository;
use Quoteform\Forms\CorruptSchemaException;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Runtime\Evaluation;
use Quoteform\Runtime\MoneyFormatter;
use Quoteform\Runtime\Validator;
use WP_Post;

/**
 * Göndərmə axınının sahibi (yeni spec §3, §4). Qiymət burada SIFIRDAN
 * hesablanır; brauzerin göndərdiyi heç bir rəqəmə etibar edilmir.
 */
final class SubmissionService
{
    public const NONCE_ACTION = 'qform_submit';

    /** @var SchemaRepository */
    private $forms;

    /** @var EntryRepository */
    private $entries;

    /** @var SpamGuard */
    private $spam;

    /** @var InputSanitizer */
    private $sanitizer;

    public function __construct( ?SchemaRepository $forms = null, ?EntryRepository $entries = null, ?SpamGuard $spam = null, ?InputSanitizer $sanitizer = null )
    {
        $this->forms     = $forms ?? new SchemaRepository();
        $this->entries   = $entries ?? new EntryRepository();
        $this->spam      = $spam ?? SpamGuard::fromWordPress();
        $this->sanitizer = $sanitizer ?? new InputSanitizer();
    }

    public static function isPublishedForm( int $formId ): bool
    {
        $post = get_post( $formId );

        return $post instanceof WP_Post && FormPostType::POST_TYPE === $post->post_type && 'publish' === $post->post_status;
    }

    /**
     * @param array<string, mixed> $request
     * @param array<string, mixed> $context
     * @return array{status: int, body: array<string, mixed>}
     */
    public function submit( array $request, array $context ): array
    {
        $formId = (int) ( $request['form_id'] ?? 0 );
        $schema = $this->publishedSchema( $formId );

        if ( null === $schema ) {
            return $this->failure( 404, 'qform_not_found', __( 'This form is not available.', 'quoteform' ) );
        }

        $settings = is_array( $schema['settings'] ?? null ) ? $schema['settings'] : [];

        if ( $this->spam->isSpam( $formId, $request['hp'] ?? '', $request['ticket'] ?? null ) ) {
            return [ 'status' => 201, 'body' => $this->successBody( $settings, null, [] ) ];
        }

        try {
            $state = $this->sanitizer->sanitize( $schema, $request['values'] ?? [] );
        } catch ( BadSubmission $error ) {
            return $this->failure( 400, 'qform_bad_request', __( 'This submission could not be accepted.', 'quoteform' ) );
        }

        $evaluation = Evaluation::run( $schema, $state );

        if ( [] !== $evaluation['errors'] ) {
            return [
                'status' => 422,
                'body'   => [
                    'code'    => 'qform_invalid_submission',
                    'message' => __( 'Some answers need attention.', 'quoteform' ),
                    'errors'  => $this->messages( $schema, $evaluation['errors'] ),
                    'step'    => Validator::firstErrorStep( $schema, $evaluation['visibility'], $evaluation['errors'] ),
                ],
            ];
        }

        $total = null === $evaluation['calc_error'] ? $evaluation['total'] : null;

        $saved = $this->entries->insert(
            [
                'form_id'    => $formId,
                'status'     => 'completed',
                'total'      => $total,
                'currency'   => is_string( $settings['currency'] ?? null ) ? $settings['currency'] : 'USD',
                'data'       => $this->snapshot( $schema, $state, $evaluation['visibility']['fields'] ),
                'breakdown'  => [
                    'currency' => $settings['currency'] ?? 'USD',
                    'position' => $settings['currency_position'] ?? 'before',
                    'decimals' => $settings['decimals'] ?? 2,
                    'lines'    => $evaluation['breakdown'],
                    'error'    => $evaluation['calc_error'],
                ],
                'user_id'    => ( (int) ( $context['user_id'] ?? 0 ) ) > 0 ? (int) $context['user_id'] : null,
                'ip'         => $this->ip( $settings, $context['ip'] ?? null ),
                'user_agent' => substr( (string) ( $context['user_agent'] ?? '' ), 0, 255 ),
            ]
        );

        if ( 0 === $saved ) {
            return $this->failure( 500, 'qform_save_failed', __( 'Your answers could not be saved. Please try again.', 'quoteform' ) );
        }

        return [ 'status' => 201, 'body' => $this->successBody( $settings, $total, $evaluation['breakdown'] ) ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function publishedSchema( int $formId ): ?array
    {
        if ( $formId < 1 || ! self::isPublishedForm( $formId ) ) {
            return null;
        }

        try {
            return $this->forms->find( $formId );
        } catch ( CorruptSchemaException $error ) {
            return null;
        }
    }

    /**
     * @param array<string, mixed>                                              $settings
     * @param array<int, array{key: string, label: string, amount: ?float}>     $breakdown
     * @return array<string, mixed>
     */
    private function successBody( array $settings, ?float $total, array $breakdown ): array
    {
        if ( 'redirect' === ( $settings['success_action'] ?? null ) ) {
            return [ 'success_action' => 'redirect', 'redirect_url' => (string) ( $settings['redirect_url'] ?? '' ) ];
        }

        $lines = [];

        foreach ( $breakdown as $line ) {
            $lines[] = [ 'label' => $line['label'], 'formatted' => $this->money( $line['amount'], $settings ) ];
        }

        return [
            'success_action' => 'message',
            'message'        => (string) ( $settings['success_message'] ?? '' ),
            'total'          => null === $total ? null : $this->money( $total, $settings ),
            'breakdown'      => null === $total ? [] : $lines,
        ];
    }

    /**
     * @param mixed                $amount
     * @param array<string, mixed> $settings
     */
    private function money( $amount, array $settings ): string
    {
        global $wp_locale;

        $thousands = isset( $wp_locale->number_format['thousands_sep'] ) ? (string) $wp_locale->number_format['thousands_sep'] : ',';
        $point     = isset( $wp_locale->number_format['decimal_point'] ) ? (string) $wp_locale->number_format['decimal_point'] : '.';

        return MoneyFormatter::format( $amount, $settings, $thousands, $point );
    }

    /**
     * @param array<string, mixed>  $schema
     * @param array<string, string> $codes
     * @return array<string, string>
     */
    private function messages( array $schema, array $codes ): array
    {
        $messages = [];

        foreach ( $codes as $key => $code ) {
            $field = $schema['fields'][ $key ] ?? [];

            switch ( $code ) {
                case 'required':
                    $messages[ $key ] = __( 'This field is required.', 'quoteform' );
                    break;
                case 'email':
                    $messages[ $key ] = __( 'Enter an email address.', 'quoteform' );
                    break;
                case 'min':
                    /* translators: %s: the smallest allowed number. */
                    $messages[ $key ] = sprintf( __( 'Enter %s or more.', 'quoteform' ), $field['min'] ?? '' );
                    break;
                default:
                    /* translators: %s: the largest allowed number. */
                    $messages[ $key ] = sprintf( __( 'Enter %s or less.', 'quoteform' ), $field['max'] ?? '' );
            }
        }

        return $messages;
    }

    /**
     * Sahənin label-i və tipi dəyərlə BİRLİKDƏ saxlanılır (yeni spec §4.6):
     * sonra sxem dəyişsə də köhnə müraciət düzgün oxunur.
     *
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $state
     * @param array<string, true>  $visible
     * @return array<string, array<string, mixed>>
     */
    private function snapshot( array $schema, array $state, array $visible ): array
    {
        $snapshot = [];

        foreach ( is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [] as $key => $field ) {
            $key  = (string) $key;
            $type = (string) ( $field['type'] ?? '' );

            if ( 'html' === $type || ! isset( $visible[ $key ] ) ) {
                continue;
            }

            $entry = [ 'label' => (string) ( $field['label'] ?? '' ), 'type' => $type, 'value' => $state[ $key ] ?? '' ];

            if ( 'select' === $type || 'radio' === $type ) {
                $entry['display'] = $this->optionLabel( $field, $entry['value'] );
            } elseif ( 'checkbox' === $type ) {
                $entry['display'] = array_map(
                    function ( $value ) use ( $field ): string {
                        return $this->optionLabel( $field, $value );
                    },
                    is_array( $entry['value'] ) ? $entry['value'] : []
                );
            }

            $snapshot[ $key ] = $entry;
        }

        return $snapshot;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $value
     */
    private function optionLabel( array $field, $value ): string
    {
        foreach ( is_array( $field['options'] ?? null ) ? $field['options'] : [] as $option ) {
            if ( is_array( $option ) && ( $option['value'] ?? null ) === $value ) {
                return (string) ( $option['label'] ?? '' );
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $settings
     * @param mixed                $ip
     */
    private function ip( array $settings, $ip ): ?string
    {
        if ( true !== ( $settings['store_ip'] ?? false ) || ! is_string( $ip ) || false === filter_var( $ip, FILTER_VALIDATE_IP ) ) {
            return null;
        }

        $packed = inet_pton( $ip );

        return false === $packed ? null : $packed;
    }

    /**
     * @return array{status: int, body: array<string, mixed>}
     */
    private function failure( int $status, string $code, string $message ): array
    {
        return [ 'status' => $status, 'body' => [ 'code' => $code, 'message' => $message ] ];
    }
}
```

- [ ] **Step 4: Run** `make itest ARGS="--filter SubmissionServiceTest"` → PASS; full `make itest` → green.

---

### Task 11: REST — `SessionController` və `EntriesController`

**Files:**
- Create: `includes/Rest/SessionController.php`, `includes/Rest/EntriesController.php`
- Modify: `includes/Plugin.php` (`rest_api_init` closure registers both)
- Test: `tests/integration/SubmissionRestTest.php`

**Interfaces:**
- Consumes: Task 10.
- Produces: `GET /quoteform/v1/session?form_id=N` → `200 { nonce, ticket }` + `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, `404 qform_not_found`; `POST /quoteform/v1/entries` (JSON `{ form_id, values, hp, ticket, nonce }`) → `403 qform_expired` on a bad nonce, otherwise the service's status/body.

REST note: requests without `X-WP-Nonce` run as user 0 even with a login cookie (core `rest_cookie_check_errors`). The session nonce and the submit check are therefore both user-0 nonces — consistent — and `user_id` is stored as `NULL` for everyone in Plan 06.

- [ ] **Step 1: Write the failing test** — `tests/integration/SubmissionRestTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Submissions\SpamGuard;
use Quoteform\Submissions\SubmissionService;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

final class SubmissionRestTest extends WP_UnitTestCase
{
    private $server;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;
        do_action( 'rest_api_init' );
    }

    private function form( string $status = 'publish' ): int
    {
        $id = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => $status ] );

        ( new SchemaRepository() )->save(
            $id,
            [
                'version'       => 1,
                'settings'      => [ 'currency' => 'USD', 'currency_position' => 'before', 'decimals' => 2, 'submit_label' => 'Go', 'success_action' => 'message', 'success_message' => 'Thanks!', 'redirect_url' => '', 'save_resume' => false, 'store_ip' => false ],
                'fields'        => [ 'rooms' => [ 'key' => 'rooms', 'type' => 'number', 'label' => 'Rooms', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => 1 ] ],
                'steps'         => [ [ 'key' => 'one', 'title' => 'One', 'description' => '', 'fields' => [ 'rooms' ] ] ],
                'calculations'  => [ [ 'key' => 'total', 'label' => 'Total', 'expression' => '{rooms} * 50', 'visible' => true ] ],
                'rules'         => [],
                'notifications' => [],
            ]
        );

        return $id;
    }

    private function oldTicket( int $formId ): string
    {
        return ( new SpamGuard( wp_salt( 'nonce' ), static function (): int {
            return time() - 10;
        } ) )->issueTicket( $formId );
    }

    private function post( array $body )
    {
        $request = new WP_REST_Request( 'POST', '/quoteform/v1/entries' );
        $request->set_header( 'content-type', 'application/json' );
        $request->set_body( (string) wp_json_encode( $body ) );

        return $this->server->dispatch( $request );
    }

    public function testTheSessionHandsOutANonceAndATicketThatNoCacheMayKeep(): void
    {
        $formId  = $this->form();
        $request = new WP_REST_Request( 'GET', '/quoteform/v1/session' );
        $request->set_param( 'form_id', $formId );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( 1, wp_verify_nonce( $data['nonce'], SubmissionService::NONCE_ACTION ) );
        $this->assertStringStartsWith( $formId . '.', $data['ticket'] );
        $this->assertStringContainsString( 'no-store', $response->get_headers()['Cache-Control'] );
    }

    public function testThereIsNoSessionForAnUnpublishedForm(): void
    {
        $request = new WP_REST_Request( 'GET', '/quoteform/v1/session' );
        $request->set_param( 'form_id', $this->form( 'draft' ) );

        $this->assertSame( 404, $this->server->dispatch( $request )->get_status() );
    }

    public function testAStaleNonceIsReportedSoTheBrowserCanRetry(): void
    {
        $formId   = $this->form();
        $response = $this->post( [ 'form_id' => $formId, 'values' => [ 'rooms' => 2 ], 'hp' => '', 'ticket' => $this->oldTicket( $formId ), 'nonce' => 'stale' ] );

        $this->assertSame( 403, $response->get_status() );
        $this->assertSame( 'qform_expired', $response->get_data()['code'] );
    }

    public function testASubmissionIsCreated(): void
    {
        $formId   = $this->form();
        $response = $this->post( [ 'form_id' => $formId, 'values' => [ 'rooms' => 2 ], 'hp' => '', 'ticket' => $this->oldTicket( $formId ), 'nonce' => wp_create_nonce( SubmissionService::NONCE_ACTION ) ] );

        $this->assertSame( 201, $response->get_status() );
        $this->assertSame( '$100.00', $response->get_data()['total'] );
    }

    public function testValidationErrorsAre422(): void
    {
        $formId   = $this->form();
        $response = $this->post( [ 'form_id' => $formId, 'values' => [ 'rooms' => '' ], 'hp' => '', 'ticket' => $this->oldTicket( $formId ), 'nonce' => wp_create_nonce( SubmissionService::NONCE_ACTION ) ] );

        $this->assertSame( 422, $response->get_status() );
        $this->assertSame( 'one', $response->get_data()['step'] );
    }
}
```

- [ ] **Step 2: Run** `make itest ARGS="--filter SubmissionRestTest"` → FAIL (404 no route).

- [ ] **Step 3: Create the controllers.**

`includes/Rest/SessionController.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rest;

use Quoteform\Submissions\SpamGuard;
use Quoteform\Submissions\SubmissionService;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Nonce və ticket səhifəyə YAZILMIR (keşlənmiş səhifədə köhnələrdi) — brauzer
 * onları bu endpoint-dən alır. Cavab heç bir keşdə saxlanmamalıdır.
 */
final class SessionController
{
    public function registerRoutes(): void
    {
        register_rest_route(
            'quoteform/v1',
            '/session',
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'session' ],
                'permission_callback' => '__return_true',
                'args'                => [
                    'form_id' => [ 'type' => 'integer', 'required' => true, 'minimum' => 1 ],
                ],
            ]
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function session( WP_REST_Request $request )
    {
        $formId = (int) $request['form_id'];

        if ( ! SubmissionService::isPublishedForm( $formId ) ) {
            return new WP_Error( 'qform_not_found', __( 'This form is not available.', 'quoteform' ), [ 'status' => 404 ] );
        }

        $response = new WP_REST_Response(
            [
                'nonce'  => wp_create_nonce( SubmissionService::NONCE_ACTION ),
                'ticket' => SpamGuard::fromWordPress()->issueTicket( $formId ),
            ]
        );

        $response->header( 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0' );

        return $response;
    }
}
```

`includes/Rest/EntriesController.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rest;

use Quoteform\Submissions\SubmissionService;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class EntriesController
{
    /** @var SubmissionService|null */
    private $service;

    public function __construct( ?SubmissionService $service = null )
    {
        $this->service = $service;
    }

    public function registerRoutes(): void
    {
        register_rest_route(
            'quoteform/v1',
            '/entries',
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'create' ],
                'permission_callback' => '__return_true',
                'args'                => [
                    'form_id' => [ 'type' => 'integer', 'required' => true, 'minimum' => 1 ],
                    'values'  => [ 'type' => 'object', 'default' => [] ],
                    'hp'      => [ 'type' => 'string', 'default' => '' ],
                    'ticket'  => [ 'type' => 'string', 'default' => '' ],
                    'nonce'   => [ 'type' => 'string', 'default' => '' ],
                ],
            ]
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function create( WP_REST_Request $request )
    {
        if ( ! wp_verify_nonce( (string) $request['nonce'], SubmissionService::NONCE_ACTION ) ) {
            return new WP_Error( 'qform_expired', __( 'Your session expired. Please try again.', 'quoteform' ), [ 'status' => 403 ] );
        }

        $service = $this->service ?? new SubmissionService();
        $result  = $service->submit(
            [
                'form_id' => (int) $request['form_id'],
                'values'  => $request['values'],
                'hp'      => $request['hp'],
                'ticket'  => $request['ticket'],
            ],
            [
                'user_id'    => get_current_user_id(),
                'ip'         => isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : null,
                'user_agent' => isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '',
            ]
        );

        return new WP_REST_Response( $result['body'], $result['status'] );
    }
}
```

`includes/Plugin.php` — the `rest_api_init` closure becomes:

```php
        add_action(
            'rest_api_init',
            static function (): void {
                ( new FormsController() )->registerRoutes();
                ( new SessionController() )->registerRoutes();
                ( new EntriesController() )->registerRoutes();
            }
        );
```
(+ `use Quoteform\Rest\EntriesController;` and `use Quoteform\Rest\SessionController;`)

- [ ] **Step 4: Run** `make itest ARGS="--filter SubmissionRestTest"` → PASS; `make check` → green.

---

### Task 12: Frontend config, `maxlength`, `runtime/client.js`

**Files:**
- Modify: `includes/Rendering/FormRenderer.php` (`enqueue()` adds `window.quoteformConfig`), `frontend-src/dom/controls.js` (`maxlength`)
- Create: `frontend-src/runtime/client.js`
- Test: `tests/js/frontend/client.test.js`, `tests/integration/RenderingConfigTest.php`; `tests/js/frontend/controls.test.js` **unchanged** (new assertions go to a new file `tests/js/frontend/controls-limits.test.js`)

**Interfaces:**
- Produces: `window.quoteformConfig = { restUrl: string }` (printed once, before `quoteformData`); `endpoint( restUrl, path, query ) → string`; `createClient( { restUrl, formId, fetchImpl, now, wait } ) → { ensureSession(): Promise, submit( values, honeypot ): Promise<{ status: number, body: object|null }> }` — constants `SESSION_TTL_MS = 3600000`, `TICKET_REUSE_MS = 82800000` (23 h), `MIN_TICKET_AGE_MS = 3500`.

- [ ] **Step 1: Write the failing tests.**

`tests/js/frontend/client.test.js`:

```js
import { createClient, endpoint } from '../../../frontend-src/runtime/client';

const json = ( status, body ) => Promise.resolve( { ok: status >= 200 && status < 300, status, json: () => Promise.resolve( body ) } );

function setup( { responses, start = 0 } = {} ) {
	let clock = start;
	const calls = [];
	const waits = [];
	const queue = [ ...responses ];
	const fetchImpl = jest.fn( ( url, init ) => {
		calls.push( { url, init } );
		const next = queue.shift();

		return typeof next === 'function' ? next() : next;
	} );
	const client = createClient( {
		restUrl: 'https://site.test/wp-json/quoteform/v1/',
		formId: '7',
		fetchImpl,
		now: () => clock,
		wait: ( ms ) => {
			waits.push( ms );
			clock += ms;
			return Promise.resolve();
		},
	} );

	return { client, calls, waits, tick: ( ms ) => ( clock += ms ) };
}

describe( 'endpoint', () => {
	it( 'builds pretty-permalink URLs', () => {
		expect( endpoint( 'https://s/wp-json/quoteform/v1/', 'session', { form_id: 7 } ) ).toBe( 'https://s/wp-json/quoteform/v1/session?form_id=7' );
	} );

	it( 'builds plain-permalink URLs', () => {
		expect( endpoint( 'https://s/index.php?rest_route=/quoteform/v1/', 'session', { form_id: 7 } ) ).toBe( 'https://s/index.php?rest_route=/quoteform/v1/session&form_id=7' );
		expect( endpoint( 'https://s/index.php?rest_route=/quoteform/v1/', 'entries' ) ).toBe( 'https://s/index.php?rest_route=/quoteform/v1/entries' );
	} );
} );

describe( 'createClient', () => {
	it( 'reuses a session younger than an hour', async () => {
		const { client, calls, tick } = setup( { responses: [ json( 200, { nonce: 'n1', ticket: 't1' } ), json( 200, { nonce: 'n2', ticket: 't2' } ) ] } );

		await client.ensureSession();
		tick( 59 * 60 * 1000 );
		await client.ensureSession();
		expect( calls ).toHaveLength( 1 );

		tick( 2 * 60 * 1000 );
		await client.ensureSession();
		expect( calls ).toHaveLength( 2 );
		expect( calls[ 0 ].init.cache ).toBe( 'no-store' );
	} );

	it( 'waits until the ticket is old enough, so a quick visitor is not taken for a bot', async () => {
		const { client, waits, calls } = setup( { responses: [ json( 200, { nonce: 'n', ticket: 't' } ), json( 201, { success_action: 'message' } ) ] } );

		const result = await client.submit( { rooms: 1 }, '' );

		expect( waits ).toEqual( [ 3500 ] );
		expect( result.status ).toBe( 201 );
		expect( JSON.parse( calls[ 1 ].init.body ) ).toEqual( { form_id: 7, values: { rooms: 1 }, hp: '', ticket: 't', nonce: 'n' } );
	} );

	it( 'does not wait for a ticket that is already old enough', async () => {
		const { client, waits, tick } = setup( { responses: [ json( 200, { nonce: 'n', ticket: 't' } ), json( 201, {} ) ] } );

		await client.ensureSession();
		tick( 10000 );
		await client.submit( {}, '' );

		expect( waits ).toEqual( [] );
	} );

	it( 'renews an expired nonce once, keeping the old ticket', async () => {
		const { client, calls, tick } = setup( {
			responses: [
				json( 200, { nonce: 'n1', ticket: 'old' } ),
				json( 403, { code: 'qform_expired' } ),
				json( 200, { nonce: 'n2', ticket: 'fresh' } ),
				json( 201, { success_action: 'message' } ),
			],
		} );

		await client.ensureSession();
		tick( 10000 );
		const result = await client.submit( {}, '' );

		expect( result.status ).toBe( 201 );
		expect( JSON.parse( calls[ 3 ].init.body ) ).toMatchObject( { nonce: 'n2', ticket: 'old' } );
	} );

	it( 'gives up after one renewal', async () => {
		const { client, tick } = setup( {
			responses: [
				json( 200, { nonce: 'n1', ticket: 't' } ),
				json( 403, { code: 'qform_expired' } ),
				json( 200, { nonce: 'n2', ticket: 't2' } ),
				json( 403, { code: 'qform_expired' } ),
			],
		} );

		await client.ensureSession();
		tick( 10000 );

		expect( ( await client.submit( {}, '' ) ).status ).toBe( 403 );
	} );

	it( 'turns a network failure into status 0', async () => {
		const { client } = setup( { responses: [ () => Promise.reject( new Error( 'offline' ) ) ] } );

		expect( await client.submit( {}, '' ) ).toEqual( { status: 0, body: null } );
	} );

	it( 'survives a body that is not JSON', async () => {
		const broken = () => Promise.resolve( { ok: false, status: 500, json: () => Promise.reject( new Error( 'html' ) ) } );
		const { client, tick } = setup( { responses: [ json( 200, { nonce: 'n', ticket: 't' } ), broken ] } );

		await client.ensureSession();
		tick( 10000 );

		expect( await client.submit( {}, '' ) ).toEqual( { status: 500, body: null } );
	} );
} );
```

`tests/js/frontend/controls-limits.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { buildControl } from '../../../frontend-src/dom/controls';

describe( 'length limits', () => {
	it.each( [ [ 'text', '500' ], [ 'email', '500' ], [ 'tel', '500' ], [ 'textarea', '5000' ] ] )( '%s is capped at %s characters', ( type, limit ) => {
		const control = buildControl( { key: 'f', type, label: 'F', help: '', required: false }, 'ns' );

		expect( control.input.getAttribute( 'maxlength' ) ).toBe( limit );
	} );

	it( 'leaves numbers alone', () => {
		const control = buildControl( { key: 'f', type: 'number', label: 'F', help: '', required: false }, 'ns' );

		expect( control.input.hasAttribute( 'maxlength' ) ).toBe( false );
	} );
} );
```

`tests/integration/RenderingConfigTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Rendering\FormRenderer;
use WP_UnitTestCase;

final class RenderingConfigTest extends WP_UnitTestCase
{
    public function testThePageLearnsWhereTheRestApiIs(): void
    {
        FormPostType::register();
        $formId = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish' ] );
        ( new SchemaRepository() )->save( $formId, SchemaRepository::defaults() );

        ( new FormRenderer() )->render( $formId );

        $inline = implode( "\n", (array) wp_scripts()->get_data( FormRenderer::HANDLE, 'before' ) );

        $this->assertStringContainsString( 'window.quoteformConfig', $inline );
        $this->assertStringContainsString( wp_json_encode( rest_url( 'quoteform/v1/' ) ), $inline );
    }
}
```

(If `build/frontend.asset.php` is missing the renderer does not enqueue; run `npm run build` first — `make check` guarantees a fresh build.)

- [ ] **Step 2: Run** the three tests → FAIL.

- [ ] **Step 3: Implement.**

`frontend-src/runtime/client.js`:

```js
const SESSION_TTL_MS = 60 * 60 * 1000;
const TICKET_REUSE_MS = 23 * 60 * 60 * 1000;
const MIN_TICKET_AGE_MS = 3500;

/**
 * REST ünvanı plain permalink-də `…/index.php?rest_route=/quoteform/v1/`
 * formasındadır — sorğu parametri `?` yox, `&` ilə qoşulmalıdır.
 */
export function endpoint( restUrl, path, query = {} ) {
	const base = `${ restUrl }${ path }`;
	const pairs = Object.keys( query ).map(
		( key ) => `${ encodeURIComponent( key ) }=${ encodeURIComponent( query[ key ] ) }`
	);

	if ( pairs.length === 0 ) {
		return base;
	}

	return `${ base }${ base.indexOf( '?' ) === -1 ? '?' : '&' }${ pairs.join( '&' ) }`;
}

async function readJson( response ) {
	try {
		return await response.json();
	} catch ( error ) {
		return null;
	}
}

/**
 * Göndərmə üçün şəbəkə qatı. Ticket yenilənmədə SAXLANILIR: server onu
 * "3 saniyədən təzə" olanda spam sayır, yəni yeni ticket (məsələn, köhnəlmiş
 * nonce yenilənəndə) ziyarətçinin göndərişini səssizcə itirərdi.
 */
export function createClient( {
	restUrl,
	formId,
	fetchImpl = ( ...args ) => window.fetch( ...args ),
	now = () => Date.now(),
	wait = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) ),
} ) {
	let session = null;

	async function refreshSession() {
		const response = await fetchImpl( endpoint( restUrl, 'session', { form_id: formId } ), {
			credentials: 'same-origin',
			cache: 'no-store',
		} );
		const body = await readJson( response );

		if ( ! response.ok || ! body || typeof body.nonce !== 'string' || typeof body.ticket !== 'string' ) {
			throw new Error( 'quoteform: no session' );
		}

		const keepTicket = session !== null && now() - session.ticketAt < TICKET_REUSE_MS;

		session = {
			nonce: body.nonce,
			fetchedAt: now(),
			ticket: keepTicket ? session.ticket : body.ticket,
			ticketAt: keepTicket ? session.ticketAt : now(),
		};

		return session;
	}

	function ensureSession() {
		if ( session !== null && now() - session.fetchedAt < SESSION_TTL_MS ) {
			return Promise.resolve( session );
		}

		return refreshSession();
	}

	async function post( values, honeypot ) {
		const response = await fetchImpl( endpoint( restUrl, 'entries' ), {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				form_id: Number( formId ),
				values,
				hp: honeypot,
				ticket: session.ticket,
				nonce: session.nonce,
			} ),
		} );

		return { status: response.status, body: await readJson( response ) };
	}

	async function submit( values, honeypot ) {
		try {
			await ensureSession();

			const age = now() - session.ticketAt;

			if ( age < MIN_TICKET_AGE_MS ) {
				await wait( MIN_TICKET_AGE_MS - age );
			}

			let result = await post( values, honeypot );

			if ( result.status === 403 && result.body && result.body.code === 'qform_expired' ) {
				await refreshSession();
				result = await post( values, honeypot );
			}

			return result;
		} catch ( error ) {
			return { status: 0, body: null };
		}
	}

	return { ensureSession, submit };
}
```

`frontend-src/dom/controls.js` — in `buildSimple()` after `input.name = id;`:

```js
	const limit = TEXT_LIMITS[ field.type ];

	if ( limit ) {
		input.maxLength = limit;
	}
```
in `buildTextarea()` after the textarea's `name` is set: `input.maxLength = TEXT_LIMITS.textarea;`, and near the top constants:

```js
// Server (Submissions\InputSanitizer) bu limitdən uzun mətni rədd edir;
// brauzer də eyni limiti qoyur ki, adi ziyarətçi ona heç vaxt çatmasın.
const TEXT_LIMITS = { text: 500, email: 500, tel: 500, textarea: 5000 };
```

`includes/Rendering/FormRenderer.php` — at the end of `enqueue()` (after `wp_set_script_translations`):

```php
        wp_add_inline_script(
            self::HANDLE,
            sprintf( 'window.quoteformConfig = window.quoteformConfig || { restUrl: %s };', (string) wp_json_encode( rest_url( 'quoteform/v1/' ) ) ),
            'before'
        );
```

- [ ] **Step 4: Run** the three new tests → PASS; `npm run build`; `npm test`; `make itest` → green.

---

### Task 13: Submit düyməsi, uğur paneli, xəta zolağı (`form.js`)

**Files:**
- Create: `frontend-src/dom/submit.js`
- Modify: `frontend-src/dom/form.js`, `frontend-src/style.scss`
- Test: `tests/js/frontend/submit-flow.test.js`

**Interfaces:**
- Consumes: Task 12 `createClient`; `window.quoteformConfig.restUrl`.
- Ruling R1 (controller): the error banner has **no** `role` — the form keeps exactly one live region (`tests/js/frontend/a11y.test.js` "holds exactly one live region"); the failure message is announced through the existing announcer instead.
- Produces: `createForm( container, schema, options = {} )` — new optional `options.client` (`{ ensureSession, submit }`) and `options.navigate( url )` (default `window.location.assign`). Default client: `createClient( { restUrl: window.quoteformConfig.restUrl, formId } )` when config exists, else `null` (clicking submit then shows the error banner). Markup hooks: `[data-quoteform-submit]`, `.quoteform_submit_error` (no role), `[data-quoteform-success]`, `.quoteform_hp` (honeypot wrapper).

- [ ] **Step 1: Write the failing test** — `tests/js/frontend/submit-flow.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

const schema = ( rules = [] ) => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Get my quote' },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', required: true, default: 1, min: 1, max: 10 },
		email: { key: 'email', type: 'email', label: 'Email', help: '', required: true, default: '' },
	},
	steps: [
		{ key: 'one', title: 'One', description: '', fields: [ 'rooms' ] },
		{ key: 'two', title: 'Two', description: '', fields: [ 'email' ] },
	],
	calculations: [ { key: 'total', label: 'Total', expression: '{rooms} * 50', visible: true } ],
	rules,
} );

const hideStepTwo = [ { target: { kind: 'step', key: 'two' }, action: 'hide', match: 'all', conditions: [ { field: 'rooms', operator: 'greater', value: 5 } ] } ];

function mount( { rules, respond, navigate } = {} ) {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );

	const client = {
		ensureSession: jest.fn( () => Promise.resolve() ),
		submit: jest.fn( () => Promise.resolve( respond || { status: 201, body: { success_action: 'message', message: 'Thanks!', total: '$50.00', breakdown: [ { label: 'Total', formatted: '$50.00' } ] } } ) ),
	};
	const form = createForm( container, schema( rules ), { client, navigate: navigate || jest.fn() } );

	return { container, form, client };
}

const q = ( container, selector ) => container.querySelector( selector );
const click = ( element ) => element.dispatchEvent( new Event( 'click', { bubbles: true } ) );
const byId = ( container, suffix ) => container.querySelector( `#${ q( container, '.quoteform' ).id }_${ suffix }` );

function type( container, key, value ) {
	const input = byId( container, key );

	input.value = String( value );
	input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	jest.advanceTimersByTime( 60 );
}

// Göndərmə zənciri bir neçə `await` keçir; sabit sayda mikrotask gözləmək
// hər birini bitirir (fake timer-lər `setImmediate`-i də saxtalaşdırır).
async function flush() {
	for ( let tick = 0; tick < 20; tick++ ) {
		await Promise.resolve();
	}
}

beforeEach( () => {
	jest.useFakeTimers();
	document.body.innerHTML = '';
} );

afterEach( () => {
	jest.useRealTimers();
} );

describe( 'submitting', () => {
	it( 'opens a session as soon as the form is on the page', () => {
		const { client } = mount();

		expect( client.ensureSession ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'shows the submit button only on the last visible step', () => {
		const { container } = mount();

		expect( q( container, '[data-quoteform-submit]' ) ).toBeNull();
		click( q( container, '[data-quoteform-next]' ) );
		expect( q( container, '[data-quoteform-submit]' ).textContent ).toBe( 'Get my quote' );
		expect( q( container, '[data-quoteform-next]' ) ).toBeNull();
	} );

	it( 'moves the submit button when a rule hides the last step', () => {
		const { container } = mount( { rules: hideStepTwo } );

		type( container, 'rooms', 6 );

		expect( q( container, '[data-quoteform-submit]' ) ).not.toBeNull();
	} );

	it( 'checks the current step before sending', async () => {
		const { container, client } = mount();

		click( q( container, '[data-quoteform-next]' ) );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( client.submit ).not.toHaveBeenCalled();
		expect( byId( container, 'email_error' ).textContent ).toBe( 'This field is required.' );
	} );

	it( 'sends the answers and the honeypot, and shows the server’s price', async () => {
		const { container, client } = mount();

		click( q( container, '[data-quoteform-next]' ) );
		type( container, 'email', 'a@b' );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( client.submit ).toHaveBeenCalledWith( expect.objectContaining( { rooms: 1, email: 'a@b' } ), '' );

		const panel = q( container, '[data-quoteform-success]' );

		expect( panel.textContent ).toContain( 'Thanks!' );
		expect( panel.textContent ).toContain( '$50.00' );
		expect( document.activeElement ).toBe( panel );
		expect( q( container, '.quoteform_steps' ).hidden ).toBe( true );
	} );

	it( 'shows only the message when the server sends no total', async () => {
		const { container } = mount( { rules: hideStepTwo, respond: { status: 201, body: { success_action: 'message', message: 'Thanks!', total: null, breakdown: [] } } } );

		type( container, 'rooms', 6 );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( q( container, '[data-quoteform-success]' ).textContent ).toBe( 'Thanks!' );
	} );

	it( 'follows a redirect', async () => {
		const navigate = jest.fn();
		const { container } = mount( { rules: hideStepTwo, navigate, respond: { status: 201, body: { success_action: 'redirect', redirect_url: 'https://example.com/thanks' } } } );

		type( container, 'rooms', 6 );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( navigate ).toHaveBeenCalledWith( 'https://example.com/thanks' );
	} );

	it( 'takes the visitor back to the step the server complained about', async () => {
		const { container } = mount( { respond: { status: 422, body: { code: 'qform_invalid_submission', errors: { rooms: 'Enter 10 or less.' }, step: 'one' } } } );

		click( q( container, '[data-quoteform-next]' ) );
		type( container, 'email', 'a@b' );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		expect( q( container, '[data-quoteform-step]' ).getAttribute( 'data-quoteform-step' ) ).toBe( 'one' );
		expect( byId( container, 'rooms_error' ).textContent ).toBe( 'Enter 10 or less.' );
		expect( document.activeElement ).toBe( byId( container, 'rooms' ) );
	} );

	it( 'keeps the answers and says so when sending fails', async () => {
		const { container } = mount( { rules: hideStepTwo, respond: { status: 0, body: null } } );

		type( container, 'rooms', 6 );
		click( q( container, '[data-quoteform-submit]' ) );
		await flush();

		const banner = q( container, '.quoteform_submit_error' );

		expect( banner.hidden ).toBe( false );
		expect( banner.hasAttribute( 'role' ) ).toBe( false );
		expect( container.querySelectorAll( 'output, [role="status"], [role="alert"], [role="log"], [aria-live]' ) ).toHaveLength( 1 );
		expect( byId( container, 'rooms' ).value ).toBe( '6' );
		expect( q( container, '[data-quoteform-submit]' ).disabled ).toBe( false );
	} );

	it( 'sends once, however often the button is pressed', async () => {
		const { container, client } = mount( { rules: hideStepTwo } );

		type( container, 'rooms', 6 );
		const button = q( container, '[data-quoteform-submit]' );

		click( button );
		click( button );
		await flush();

		expect( client.submit ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'is busy while sending, and keeps its name', () => {
		const { container } = mount( { rules: hideStepTwo } );

		type( container, 'rooms', 6 );
		const button = q( container, '[data-quoteform-submit]' );

		click( button );

		expect( button.getAttribute( 'aria-busy' ) ).toBe( 'true' );
		expect( button.textContent ).toBe( 'Get my quote' );
	} );

	it( 'hides the honeypot from people and assistive technology', () => {
		const { container } = mount();
		const trap = q( container, '.quoteform_hp' );

		expect( trap.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
		expect( trap.querySelector( 'input' ).tabIndex ).toBe( -1 );
		expect( trap.querySelector( 'input' ).getAttribute( 'autocomplete' ) ).toBe( 'off' );
	} );
} );
```

- [ ] **Step 2: Run** `npx jest tests/js/frontend/submit-flow.test.js` → FAIL.

- [ ] **Step 3: Create `frontend-src/dom/submit.js`:**

```js
import { __ } from '@wordpress/i18n';

export function createSubmitUi( { label } ) {
	const button = document.createElement( 'button' );

	button.type = 'button';
	button.className = 'quoteform_nav_button quoteform_submit';
	button.setAttribute( 'data-quoteform-submit', '' );
	button.textContent = label || __( 'Send', 'quoteform' );

	// Zolaq canlı sahə DEYİL (role yoxdur): formada tək canlı sahə qaydası var
	// (tests/js/frontend/a11y.test.js — iki sahə bir-birini kəsir). Mesaj
	// form.js-də mövcud announcer vasitəsilə elan olunur.
	const banner = document.createElement( 'p' );

	banner.className = 'quoteform_submit_error';
	banner.hidden = true;

	return {
		button,
		banner,
		setBusy( busy ) {
			button.disabled = busy;

			if ( busy ) {
				button.setAttribute( 'aria-busy', 'true' );
			} else {
				button.removeAttribute( 'aria-busy' );
			}
		},
		showError( message ) {
			banner.hidden = ! message;
			banner.textContent = message || '';
		},
	};
}

// Honeypot: insan onu görmür (ekrandan kənar — `display:none` botlara tanışdır),
// klaviatura ona çatmır, ekran oxuyucu onu oxumur. Doldurulubsa, server
// göndərişi spam sayır.
export function buildHoneypot( namespace ) {
	const wrapper = document.createElement( 'div' );

	wrapper.className = 'quoteform_hp';
	wrapper.setAttribute( 'aria-hidden', 'true' );

	const label = document.createElement( 'label' );

	label.htmlFor = `${ namespace }_website`;
	label.textContent = __( 'Website', 'quoteform' );

	const input = document.createElement( 'input' );

	input.type = 'text';
	input.id = `${ namespace }_website`;
	input.name = 'website';
	input.tabIndex = -1;
	input.setAttribute( 'autocomplete', 'off' );

	wrapper.appendChild( label );
	wrapper.appendChild( input );

	return { element: wrapper, input };
}

// Mesaj mətn kimi göstərilir (textContent): sayt sahibinin yazdığı mətn HTML
// kimi yorumlanmır. Qiymət SERVERİN hesabladığıdır.
export function buildSuccessPanel( body ) {
	const panel = document.createElement( 'div' );

	panel.className = 'quoteform_success';
	panel.setAttribute( 'tabindex', '-1' );
	panel.setAttribute( 'data-quoteform-success', '' );

	const message = document.createElement( 'p' );

	message.className = 'quoteform_success_message';
	message.textContent = body.message || __( 'Thank you. Your request has been sent.', 'quoteform' );
	panel.appendChild( message );

	if ( typeof body.total !== 'string' ) {
		return panel;
	}

	const list = document.createElement( 'ul' );

	list.className = 'quoteform_breakdown';

	( Array.isArray( body.breakdown ) ? body.breakdown : [] ).forEach( ( row ) => {
		const item = document.createElement( 'li' );
		const name = document.createElement( 'span' );
		const amount = document.createElement( 'span' );

		name.className = 'quoteform_breakdown_label';
		name.textContent = row.label;
		amount.className = 'quoteform_breakdown_amount';
		amount.textContent = row.formatted;
		item.appendChild( name );
		item.appendChild( amount );
		list.appendChild( item );
	} );

	const totalRow = document.createElement( 'div' );
	const totalLabel = document.createElement( 'span' );
	const total = document.createElement( 'span' );

	totalRow.className = 'quoteform_total_row';
	totalLabel.className = 'quoteform_total_label';
	totalLabel.textContent = __( 'Total', 'quoteform' );
	total.className = 'quoteform_total';
	total.textContent = body.total;
	totalRow.appendChild( totalLabel );
	totalRow.appendChild( total );

	panel.appendChild( list );
	panel.appendChild( totalRow );

	return panel;
}
```

- [ ] **Step 4: Integrate into `frontend-src/dom/form.js`.**

Imports — add:

```js
import { __, _n, sprintf } from '@wordpress/i18n';
import { createClient } from '../runtime/client';
import { buildHoneypot, buildSuccessPanel, createSubmitUi } from './submit';
```
(replace the existing `import { __, sprintf } from '@wordpress/i18n';`)

Signature: `export function createForm( container, schema, options = {} ) {`

After `const announcer = createAnnouncer( root );` and the `backButton`/`nextButton` creation, add:

```js
	const config = typeof window !== 'undefined' ? window.quoteformConfig : undefined;
	const client =
		options.client ||
		( config && typeof config.restUrl === 'string' ? createClient( { restUrl: config.restUrl, formId } ) : null );
	const navigate = options.navigate || ( ( url ) => window.location.assign( url ) );
	const submitUi = createSubmitUi( { label: settings.submit_label } );
	const honeypot = buildHoneypot( namespace );
	const failureMessage = __( 'We couldn’t send your quote. Please try again.', 'quoteform' );
	let submitting = false;
	let finished = false;

	root.insertBefore( submitUi.banner, navHost );
	root.appendChild( honeypot.element );

	if ( client ) {
		client.ensureSession().catch( () => {} );
	}
```

`paintNavigation` — the `reconcile( navHost, … )` call becomes:

```js
		reconcile( navHost, [
			...( active && position.index > 0 ? [ backButton ] : [] ),
			...( active && position.index < position.total - 1 ? [ nextButton ] : [] ),
			...( active && isLastStep( position ) ? [ submitUi.button ] : [] ),
		] );
```

`refresh()` — first line inside: `if ( finished ) { return; }`

Add, after `move()`:

```js
	function showServerErrors( errors, stepKey ) {
		const values = state.get();
		const available = visibleSteps( schema, resolveVisibility( schema, values ) );

		if ( stepKey && available.some( ( step ) => step.key === stepKey ) ) {
			currentKey = stepKey;
		}

		refresh();

		Object.keys( controls ).forEach( ( key ) => controls[ key ].setError( errors[ key ] || null ) );

		const step = available.find( ( candidate ) => candidate.key === currentKey );
		const invalid = step ? firstInvalidInput( step, errors ) : null;

		if ( invalid ) {
			invalid.focus();
		} else {
			focusStep();
		}

		const count = Object.keys( errors ).length;

		announcer.announce(
			sprintf(
				/* translators: %d: how many answers the server rejected. */
				_n( '%d field needs attention.', '%d fields need attention.', count, 'quoteform' ),
				count
			)
		);
	}

	function showSuccess( body ) {
		finished = true;

		Array.from( root.children ).forEach( ( child ) => {
			if ( child.getAttribute( 'role' ) !== 'status' ) {
				child.hidden = true;
			}
		} );

		const panel = buildSuccessPanel( body );

		root.appendChild( panel );
		panel.focus();
		announcer.announce( panel.querySelector( '.quoteform_success_message' ).textContent );
	}

	async function onSubmit() {
		if ( submitting || finished ) {
			return;
		}

		const values = state.get();
		const visible = resolveVisibility( schema, values );
		const available = visibleSteps( schema, visible );
		const from = settleStep( schema, available, currentKey );

		if ( ! mayLeave( available, from, values, visible ) ) {
			return;
		}

		submitUi.showError( null );

		if ( ! client ) {
			fail();
			return;
		}

		submitting = true;
		submitUi.setBusy( true );
		announcer.announce( __( 'Sending…', 'quoteform' ) );

		const result = await client.submit( values, honeypot.input.value );

		submitting = false;
		submitUi.setBusy( false );

		if ( result.status === 201 && result.body ) {
			if ( result.body.success_action === 'redirect' && typeof result.body.redirect_url === 'string' && result.body.redirect_url !== '' ) {
				navigate( result.body.redirect_url );
				return;
			}

			showSuccess( result.body );
			return;
		}

		if ( result.status === 422 && result.body && result.body.errors ) {
			showServerErrors( result.body.errors, result.body.step );
			return;
		}

		fail();
	}

	function fail() {
		submitUi.showError( failureMessage );
		announcer.announce( failureMessage );
	}

	const onSubmitClick = () => {
		onSubmit();
	};

	submitUi.button.addEventListener( 'click', onSubmitClick );
	detachers.push( () => submitUi.button.removeEventListener( 'click', onSubmitClick ) );
```

Note on the announcer: the submit handler's `announce()` calls go through the existing 500 ms debounced live region; the last message wins, which is the intent (e.g. the step announcement from `refresh()` inside `showServerErrors` is replaced by the error count).

- [ ] **Step 5: Styles** — append to `frontend-src/style.scss`:

```scss
// --- Göndərmə ------------------------------------------------------------

.quoteform .quoteform_submit {
	margin-inline-start: auto;
	color: var( --quoteform-on-accent );
	background: var( --quoteform-accent );
}

.quoteform .quoteform_submit[aria-busy="true"] {
	cursor: progress;
	opacity: 0.7;
}

.quoteform_submit_error {
	margin: 0;
	padding: 0.6em 0.8em;
	font-size: 0.9375em;
	font-weight: 600;
	color: var( --quoteform-error );
	border-inline-start: 3px solid var( --quoteform-error );
	border-radius: var( --quoteform-control-radius );
}

// Honeypot ekrandan kənardadır; `display:none` botların tanıdığı işarədir.
.quoteform_hp {
	position: absolute;
	inset-inline-start: -10000px;
	width: 1px;
	height: 1px;
	overflow: hidden;
}

.quoteform_success {
	display: flex;
	flex-direction: column;
	gap: 0.75em;
}

.quoteform_success:focus {
	outline: none;
}

.quoteform_success:focus-visible {
	outline: 2px solid var( --quoteform-accent );
	outline-offset: 4px;
}

.quoteform_success_message {
	margin: 0;
	font-size: 1.125em;
	font-weight: 600;
}
```

- [ ] **Step 6: Run** `npx jest tests/js/frontend/submit-flow.test.js` → PASS; `npm test` (every existing frontend test, incl. `form-steps`, `a11y`, `boot`, must still pass) → green; `npm run build`; `gzip -c build/frontend.js | wc -c` < 25600.

---

### Task 14: e2e, POT, tam yoxlama

**Files:**
- Create: `tests/e2e/submission.spec.js`
- Modify: `languages/quoteform.pot` (via `make makepot`)

**Interfaces:**
- Consumes: everything above; `tests/e2e/helpers.js` (`withAdmin`, `restCall`, `BASE_URL`).

- [ ] **Step 1: Write the e2e spec** — `tests/e2e/submission.spec.js`:

```js
const { test, expect } = require( '@playwright/test' );

const { restCall, withAdmin } = require( './helpers' );

function schema( rules = [] ) {
	return {
		version: 1,
		settings: {
			currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Get my quote',
			success_action: 'message', success_message: 'Thanks — we got it.', redirect_url: '', save_resume: false, store_ip: false,
		},
		fields: {
			rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', placeholder: '', required: true, default: 1, min: 1, max: 10, step: 1 },
			email: { key: 'email', type: 'email', label: 'Email', help: '', placeholder: '', required: true, default: '' },
		},
		steps: [
			{ key: 'one', title: 'Your home', description: '', fields: [ 'rooms' ] },
			{ key: 'two', title: 'Your email', description: '', fields: [ 'email' ] },
		],
		calculations: [ { key: 'total', label: 'Rooms', expression: '{rooms} * 50', visible: true } ],
		rules,
		notifications: [],
	};
}

const hideStepTwo = [ { target: { kind: 'step', key: 'two' }, action: 'hide', match: 'all', conditions: [ { field: 'rooms', operator: 'greater', value: 5 } ] } ];

async function publish( page, nonce, title, formSchema ) {
	const created = await restCall( page, nonce, 'POST', '/quoteform/v1/forms', { title } );

	expect( created.status, created.body ).toBe( 201 );

	const saved = await restCall( page, nonce, 'PUT', `/quoteform/v1/forms/${ created.json.id }`, { title, schema: formSchema } );

	expect( saved.status, saved.body ).toBe( 200 );

	const post = await restCall( page, nonce, 'POST', '/wp/v2/posts', { title, content: `[quoteform id="${ created.json.id }"]`, status: 'publish' } );

	expect( post.status, post.body ).toBe( 201 );

	return { formId: created.json.id, postId: post.json.id, url: post.json.link };
}

async function remove( page, nonce, fixture ) {
	if ( ! fixture ) {
		return;
	}

	await restCall( page, nonce, 'DELETE', `/wp/v2/posts/${ fixture.postId }&force=true` );
	await restCall( page, nonce, 'DELETE', `/quoteform/v1/forms/${ fixture.formId }` );
}

test.describe( 'sending a quote', () => {
	let twoSteps = null;
	let shortcut = null;

	test.beforeAll( async ( { browser } ) => {
		const run = Date.now();

		await withAdmin( browser, async ( page, nonce ) => {
			twoSteps = await publish( page, nonce, `Submit two steps ${ run }`, schema() );
			shortcut = await publish( page, nonce, `Submit shortcut ${ run }`, schema( hideStepTwo ) );
		} );
	} );

	test.afterAll( async ( { browser } ) => {
		await withAdmin( browser, async ( page, nonce ) => {
			await remove( page, nonce, twoSteps );
			await remove( page, nonce, shortcut );
		} );
	} );

	test( 'a visitor sends the form and sees the price the server worked out', async ( { page } ) => {
		await page.goto( twoSteps.url );
		await page.getByLabel( 'Rooms' ).fill( '3' );
		await page.getByRole( 'button', { name: 'Next' } ).click();
		await page.getByLabel( 'Email' ).fill( 'jane@example.com' );
		await page.getByRole( 'button', { name: 'Get my quote' } ).click();

		const panel = page.locator( '[data-quoteform-success]' );

		await expect( panel ).toBeVisible( { timeout: 10000 } );
		await expect( panel ).toContainText( 'Thanks — we got it.' );
		await expect( panel ).toContainText( '$150.00' );
		await expect( panel ).toBeFocused();
	} );

	test( 'the submit button moves to the last step a rule leaves visible', async ( { page } ) => {
		await page.goto( shortcut.url );
		await page.getByLabel( 'Rooms' ).fill( '6' );

		await expect( page.getByRole( 'button', { name: 'Next' } ) ).toHaveCount( 0 );
		await page.getByRole( 'button', { name: 'Get my quote' } ).click();
		await expect( page.locator( '[data-quoteform-success]' ) ).toContainText( '$300.00', { timeout: 10000 } );
	} );

	test( 'a stale nonce from a cached page is renewed without the visitor noticing', async ( { page } ) => {
		let sessions = 0;

		await page.route( /quoteform(%2F|\/)v1(%2F|\/)session/, async ( route ) => {
			sessions += 1;
			const response = await route.fetch();
			const body = await response.json();

			await route.fulfill( { response, json: sessions === 1 ? { ...body, nonce: 'stale' } : body } );
		} );

		await page.goto( shortcut.url );
		await page.getByLabel( 'Rooms' ).fill( '7' );
		await page.getByRole( 'button', { name: 'Get my quote' } ).click();

		await expect( page.locator( '[data-quoteform-success]' ) ).toContainText( '$350.00', { timeout: 10000 } );
		expect( sessions ).toBe( 2 );
	} );

	test( 'the whole flow works from the keyboard', async ( { page } ) => {
		await page.goto( shortcut.url );
		await page.getByLabel( 'Rooms' ).fill( '6' );
		await page.getByRole( 'button', { name: 'Get my quote' } ).focus();
		await page.keyboard.press( 'Enter' );

		await expect( page.locator( '[data-quoteform-success]' ) ).toBeFocused( { timeout: 10000 } );
	} );
} );
```

Notes: `afterAll` runs only against fixtures that `beforeAll` created (`null` otherwise) — the Plan 05 incident pattern cannot occur here. Entries created by these tests stay in the dev DB; Plan 07's admin screen can delete them.

- [ ] **Step 2: Back up the dev DB, then run e2e** — `make site ARGS="db export --skip-ssl /var/www/html/wp-content/plugins/quoteform/.superpowers/dev-db-backup.sql"`; `make e2e` → all green (existing 10 + new 4). Afterwards: `make site ARGS="post list --post_type=quoteform --post_status=publish --fields=ID,post_title"` — forms 8, 40, 328 still listed. Confirm rows were written: `make site ARGS="db query 'SELECT id, form_id, status, total FROM wp_qform_entries ORDER BY id DESC LIMIT 5' --skip-ssl"`.

- [ ] **Step 3: POT** — `make makepot`; `grep -c msgid languages/quoteform.pot` before/after; `grep -n "Get my quote\|fields need attention\|Sending" languages/quoteform.pot` (the submit label comes from the schema, so only the fixed strings appear: "Sending…", "%d field needs attention.", "We couldn’t send your quote. Please try again.", "Website", "Total", "Send").

- [ ] **Step 4: Full check** — `make check` (buildcheck, PHP 8.2 + 7.4 unit, Jest, integration, trash-disabled) → all green; record counts. `gzip -c build/frontend.js | wc -c` < 25600.
