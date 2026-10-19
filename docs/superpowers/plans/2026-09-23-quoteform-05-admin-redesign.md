# Admin UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Builder, formalar siyahısı və Gutenberg bloku üçün "B" dizaynını (üst zolaq + sol bölmə menyusu + kartlar) tətbiq etmək — davranışa və əlçatan adlara toxunmadan.

**Architecture:** Mövcud React komponentləri qalır; onlara sinif adları, iki yeni etiket prop-u (`visibleLabel`, `hideLabel`) və dörd kiçik yeni komponent (`Button`, `Card`, `SectionNav`, `CopyField`) əlavə olunur. Bütün vizual iş `admin-src/styles/` partial-larında, `.quoteform_builder` kökü altında. Reducer/state/API/REST/sxem/frontend toxunulmur; PHP-də yalnız `Block.php` blok stilini qeyd edir.

**Tech Stack:** React 18 (`@wordpress/element`), `@wordpress/i18n`, SCSS via `@wordpress/scripts` 27, Jest 29 + Testing Library, Playwright, PHPUnit 9.6 (inteqrasiya).

**Spec:** `docs/superpowers/specs/2026-09-23-quoteform-admin-redesign-design.md`

## Global Constraints

- **Əlçatan adlar və rollar dəyişmir.** Yeganə istisna: menyu tabı "Calculations" → "Pricing". Yenilənəcək test sətirləri yalnız bunlardır: `tests/js/admin/EditorScreen.test.js:193`, `tests/e2e/builder.spec.js:83, 98, 120, 198`.
- Mövcud test faylında başqa heç bir sətir dəyişdirilmir. Mövcud test düşürsə, səbəb koddadır — testi "düzəltmə", dayan və hesabat ver.
- Mövcud sinif adları saxlanılır (testlər bunlara bağlıdır): `quoteform_step`, `quoteform_calculation`, `is-selected` (Fields `li`), `quoteform_notice--*`, `quoteform_confirm`, `quoteform_unplaced`, `quoteform_warning`.
- Mövcud DOM sırası dəyişmir (Tab sırası = ekran sırası; CSS `order` qadağandır).
- Bütün admin selektorları `.quoteform_builder` altında; blok selektorları `.quoteform_block` altında.
- Yalnız məntiqi CSS xassələri (`margin-inline-start`, `inset-inline-end`, `padding-inline` …) — RTL faylı avtomatik yaranır.
- Aksent: `var(--wp-admin-theme-color, #2271b1)`.
- PHP 7.4 minimum; PHP dəyişikliyi `make test74`-dən də keçməlidir.
- JS: ESM, uzantısız nisbi importlar, `__()` / `sprintf()` / `_n()` text domain `'quoteform'`.
- Commit **yoxdur** (istifadəçinin qlobal qaydası). "Commit" addımları əvəzinə hər task sonunda `make js` (və lazım olanda `make check`) işlədilir və nəticə hesabata yazılır.
- Hər task sonunda `npm run build` — `buildcheck` `build/`-in təzə olmasını tələb edir.

## Review Focus

1. **`visibleLabel` söz ortasında sonluq** — `"Step 1 title"` + `visibleLabel: "le"` ekranda "le" göstərməməlidir; tam etiketə geri düşməlidir (Task 2 testi).
2. **Boş/rəqəmsiz etiket** — `label` `undefined` və ya rəqəm olduqda `ControlLabel` çökməməlidir (Task 2 testi).
3. **Clipboard API mövcuddur amma rədd edir** (icazə yoxdur, HTTP-də `undefined`) — "Copied." yalan yerə deyilməməlidir; seçim + ipucu göstərilməlidir (Task 10 testi).
4. **Tarix parse olunmur** (`''`, `'garbage'`, `null`) — xam dəyər göstərilməli, "Invalid Date" yox (Task 10 testi).
5. **Sayğac 1 olanda** — "1 item" (tək), "1 items" yox; `_n` işlədilməlidir (Task 3 testi).

---

## Fayl xəritəsi

| Fayl | Məsuliyyət | Task |
|---|---|---|
| `admin-src/styles/_tokens.scss` | CSS dəyişənləri | 1 |
| `admin-src/styles/_base.scss` | kök, düymə, kart, ümumi control, sr-only ehtiyatı | 1 |
| `admin-src/style.scss` | partial-ları import edir | 1 |
| `admin-src/components/Button.js` | variantlı düymə, `forwardRef` | 1 |
| `admin-src/components/Card.js` | ağ kart | 1 |
| `admin-src/components/ControlLabel.js` | `visibleLabel` / `hideLabel` bölgüsü | 2 |
| `admin-src/components/{Text,Select,Number,Toggle}Control.js`, `panels/FormulaEditor.js` | `ControlLabel` istifadəsi | 2 |
| `admin-src/components/SectionNav.js` + `styles/_shell.scss` | sol menyu, üst zolaq | 3, 4 |
| `admin-src/screens/EditorScreen.js` | qabıq | 4, 5 |
| `admin-src/panels/FieldsPanel.js` + `styles/_panels.scss` | Fields | 5 |
| `admin-src/panels/StepsPanel.js` | Steps | 6 |
| `admin-src/panels/CalculationsPanel.js` | Pricing | 7 |
| `admin-src/panels/RulesPanel.js`, `RuleConditionRow.js` | Rules | 8 |
| `admin-src/panels/SettingsPanel.js` | Settings | 9 |
| `admin-src/lib/dates.js`, `components/CopyField.js`, `screens/FormListScreen.js`, `styles/_list.scss` | siyahı | 10 |
| `admin-src/block/style.scss`, `block/index.js`, `block/Edit.js`, `includes/Rendering/Block.php` | blok | 11 |
| `tests/js/admin/visibleLabels.test.js` | görünən etiket qoruyucusu | 12 |

---

### Task 1: Dizayn tokenləri, baza stil, `Button` və `Card`

**Files:**
- Create: `admin-src/styles/_tokens.scss`, `admin-src/styles/_base.scss`
- Modify: `admin-src/style.scss` (tamamilə əvəz)
- Create: `admin-src/components/Button.js`, `admin-src/components/Card.js`
- Test: `tests/js/admin/Button.test.js`

**Interfaces:**
- Produces: `Button` (default export) — props `{ variant = 'secondary' | 'primary' | 'ghost' | 'danger', className, type = 'button', ...rest }`, ref-i `<button>`-a ötürür; render `class="quoteform_button quoteform_button--{variant} {className}"`.
- Produces: `Card` (default export) — props `{ className, children, ...rest }`, render `<div class="quoteform_card {className}">`.
- Produces: CSS dəyişənləri `--qf-*` (aşağıda) və siniflər `.quoteform_button*`, `.quoteform_card`, `.quoteform_empty`, `.quoteform_badge`, `.quoteform_badge--problem`, `.quoteform_badge--dirty`.

- [ ] **Step 1: Write the failing test**

`tests/js/admin/Button.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { createRef } from '@wordpress/element';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Button from '../../../admin-src/components/Button';
import Card from '../../../admin-src/components/Card';

describe( 'Button', () => {
	it( 'is a plain button by default, so it never submits a surrounding form', () => {
		render( <Button>Save</Button> );

		expect( screen.getByRole( 'button', { name: 'Save' } ) ).toHaveAttribute( 'type', 'button' );
	} );

	it( 'carries its variant as a class', () => {
		render( <Button variant="danger">Remove</Button> );

		const button = screen.getByRole( 'button', { name: 'Remove' } );

		expect( button ).toHaveClass( 'quoteform_button', 'quoteform_button--danger' );
	} );

	it( 'defaults to the secondary variant', () => {
		render( <Button>Cancel</Button> );

		expect( screen.getByRole( 'button', { name: 'Cancel' } ) ).toHaveClass( 'quoteform_button--secondary' );
	} );

	it( 'hands its ref to the real button, because screens move focus with it', () => {
		const ref = createRef();

		render( <Button ref={ ref }>Save</Button> );

		expect( ref.current ).toBe( screen.getByRole( 'button', { name: 'Save' } ) );
	} );

	it( 'passes through aria attributes, disabled and clicks', async () => {
		const onClick = jest.fn();

		render(
			<Button aria-label="Back to all forms" onClick={ onClick } className="extra">
				Forms
			</Button>
		);

		const button = screen.getByRole( 'button', { name: 'Back to all forms' } );

		expect( button ).toHaveClass( 'extra' );
		await userEvent.click( button );
		expect( onClick ).toHaveBeenCalledTimes( 1 );
	} );
} );

describe( 'Card', () => {
	it( 'wraps its children in a card', () => {
		render( <Card data-testid="card">hello</Card> );

		expect( screen.getByTestId( 'card' ) ).toHaveClass( 'quoteform_card' );
		expect( screen.getByTestId( 'card' ) ).toHaveTextContent( 'hello' );
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/js/admin/Button.test.js`
Expected: FAIL — `Cannot find module '../../../admin-src/components/Button'`.

- [ ] **Step 3: Write the components**

`admin-src/components/Button.js`:

```js
import { forwardRef } from '@wordpress/element';

/**
 * Builder-in yeganə düymə görünüşü. `ref` real `<button>`-a ötürülür:
 * ekranlar fokusu məhz bu ref-lərlə idarə edir (silmə təsdiqi, saxlama).
 */
const Button = forwardRef( function Button(
	{ variant = 'secondary', className = '', type = 'button', children, ...rest },
	ref
) {
	const classes = [ 'quoteform_button', `quoteform_button--${ variant }`, className ]
		.filter( Boolean )
		.join( ' ' );

	return (
		// eslint-disable-next-line react/button-has-type
		<button ref={ ref } type={ type } className={ classes } { ...rest }>
			{ children }
		</button>
	);
} );

export default Button;
```

`admin-src/components/Card.js`:

```js
export default function Card( { className = '', children, ...rest } ) {
	return (
		<div className={ [ 'quoteform_card', className ].filter( Boolean ).join( ' ' ) } { ...rest }>
			{ children }
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/js/admin/Button.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the token and base stylesheets**

`admin-src/styles/_tokens.scss`:

```scss
// Builder-in bütün rəng və ölçüləri. Aksent WP admin rəng sxemindən gəlir —
// istifadəçi profilində "Ocean" seçəndə builder də onunla dəyişir.
.quoteform_builder,
.quoteform_block {
	--qf-accent: var( --wp-admin-theme-color, #2271b1 );
	--qf-accent-dark: var( --wp-admin-theme-color-darker-10, #135e96 );
	--qf-accent-soft: #f0f6fc;
	--qf-bg: #f0f0f1;
	--qf-surface: #fff;
	--qf-subtle: #f6f7f7;
	--qf-border: #dcdcde;
	--qf-field: #8c8f94;
	--qf-text: #1d2327;
	--qf-muted: #646970;
	--qf-danger: #b32d2e;
	--qf-danger-soft: #fcf0f1;
	--qf-warning: #996800;
	--qf-warning-bg: #fcf9e8;
	--qf-warning-border: #dba617;
	--qf-success: #00a32a;
	--qf-radius: 8px;
	--qf-control-radius: 6px;
	--qf-gap: 16px;
	--qf-shadow: 0 1px 2px rgba( 0, 0, 0, 0.05 );
}
```

`admin-src/styles/_base.scss`:

```scss
.quoteform_builder {
	max-width: 1280px;
	color: var( --qf-text );

	*,
	*::before,
	*::after {
		box-sizing: border-box;
	}

	// WP admininin `.screen-reader-text`-i hər admin səhifəsində var; bu
	// ehtiyat yalnız o stil nədənsə yüklənməyəndə (məs. testlərdə) işləyir.
	.screen-reader-text {
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

	h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}

	h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
}

// --- Düymə ---------------------------------------------------------------

.quoteform_builder .quoteform_button,
.quoteform_block .quoteform_button {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 32px;
	margin: 0;
	padding: 0 12px;
	font: inherit;
	font-size: 13px;
	font-weight: 500;
	line-height: 1;
	color: var( --qf-text );
	white-space: nowrap;
	background: var( --qf-surface );
	border: 1px solid var( --qf-field );
	border-radius: var( --qf-control-radius );
	cursor: pointer;
	transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;

	&:hover:not( :disabled ) {
		background: var( --qf-subtle );
	}

	&:focus-visible {
		outline: 2px solid var( --qf-accent );
		outline-offset: 1px;
	}

	&:disabled {
		cursor: default;
		opacity: 0.5;
	}
}

.quoteform_builder .quoteform_button--primary {
	color: #fff;
	background: var( --qf-accent );
	border-color: var( --qf-accent );

	&:hover:not( :disabled ) {
		background: var( --qf-accent-dark );
		border-color: var( --qf-accent-dark );
	}
}

.quoteform_builder .quoteform_button--ghost {
	color: var( --qf-accent );
	background: transparent;
	border-color: transparent;

	&:hover:not( :disabled ) {
		background: var( --qf-accent-soft );
	}
}

.quoteform_builder .quoteform_button--danger {
	color: var( --qf-danger );
	background: transparent;
	border-color: transparent;

	&:hover:not( :disabled ) {
		background: var( --qf-danger-soft );
	}
}

// Saxlama zamanı: mətn "Save" qalır (əlçatan ad dəyişməsin), yanında spinner.
.quoteform_builder .quoteform_button[aria-busy="true"]::after {
	content: "";
	width: 12px;
	height: 12px;
	border: 2px solid currentColor;
	border-inline-end-color: transparent;
	border-radius: 50%;
	animation: quoteform-spin 0.7s linear infinite;
}

@keyframes quoteform-spin {
	to {
		transform: rotate( 360deg );
	}
}

// --- Kart, nişanlar, boş vəziyyət -----------------------------------------

.quoteform_builder .quoteform_card {
	padding: 16px;
	background: var( --qf-surface );
	border: 1px solid var( --qf-border );
	border-radius: var( --qf-radius );
	box-shadow: var( --qf-shadow );
}

.quoteform_builder .quoteform_badge {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	font-size: 11px;
	font-weight: 500;
	line-height: 1.5;
	color: #50575e;
	white-space: nowrap;
	background: var( --qf-bg );
	border-radius: 999px;
}

.quoteform_builder .quoteform_badge--problem {
	color: var( --qf-danger );
	background: var( --qf-danger-soft );
}

.quoteform_builder .quoteform_badge--dirty {
	color: var( --qf-warning );
	background: var( --qf-warning-bg );
}

.quoteform_builder .quoteform_empty {
	padding: 32px 16px;
	color: var( --qf-muted );
	text-align: center;
}

// --- Ümumi control görünüşü -------------------------------------------------

.quoteform_builder .quoteform_control {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;

	> label {
		font-size: 12px;
		font-weight: 600;
	}

	input:not( [type="checkbox"] ),
	select,
	textarea {
		width: 100%;
		max-width: none;
		min-height: 32px;
		margin: 0;
		padding: 4px 8px;
		font-size: 13px;
		border: 1px solid var( --qf-field );
		border-radius: var( --qf-control-radius );
		box-shadow: none;
	}

	textarea {
		min-height: 64px;
	}

	input:focus,
	select:focus,
	textarea:focus {
		border-color: var( --qf-accent );
		outline: 1px solid var( --qf-accent );
		box-shadow: none;
	}

	[aria-invalid="true"] {
		border-color: var( --qf-danger );
	}
}

// Görünən qısa etiketin ilk hərfi böyüdülür; CSS çevrilməsi əlçatan ada
// təsir etmir ("Calculation 1 key" ekranda "Key" görünür).
.quoteform_builder .quoteform_label-visible {
	display: inline-block;

	&::first-letter {
		text-transform: uppercase;
	}
}

.quoteform_builder .quoteform_control--toggle {
	flex-direction: row;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;

	> label {
		font-size: 13px;
		font-weight: 400;
	}

	> .quoteform_help,
	> .quoteform_field-error {
		flex-basis: 100%;
	}

	input[type="checkbox"] {
		position: relative;
		width: 32px;
		height: 18px;
		margin: 0;
		appearance: none;
		background: var( --qf-field );
		border: 0;
		border-radius: 9px;
		box-shadow: none;
		cursor: pointer;
		transition: background-color 0.15s ease;

		&::before {
			content: "";
			position: absolute;
			inset-block-start: 2px;
			inset-inline-start: 2px;
			width: 14px;
			height: 14px;
			margin: 0;
			background: #fff;
			border-radius: 50%;
			transition: transform 0.15s ease;
		}

		&:checked {
			background: var( --qf-accent );

			&::before {
				transform: translateX( 14px );
			}
		}

		&:focus-visible {
			outline: 2px solid var( --qf-accent );
			outline-offset: 2px;
		}
	}
}

[dir="rtl"] .quoteform_builder .quoteform_control--toggle input[type="checkbox"]:checked::before {
	transform: translateX( -14px );
}

.quoteform_builder .quoteform_help {
	margin: 0;
	font-size: 12px;
	color: var( --qf-muted );
}

.quoteform_builder .quoteform_field-error {
	margin: 0;
	padding: 0;
	font-size: 12px;
	font-weight: 600;
	color: var( --qf-danger );
	list-style: none;

	li::before {
		content: "\26A0\FE0E";
		margin-inline-end: 4px;
	}
}

.quoteform_builder .quoteform_warning,
.quoteform_builder .quoteform_confirm {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin: 0;
	padding: 8px 12px;
	font-size: 13px;
	color: var( --qf-text );
	background: var( --qf-warning-bg );
	border-inline-start: 3px solid var( --qf-warning-border );
	border-radius: var( --qf-control-radius );
}

.quoteform_builder .quoteform_notice {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	margin: 0 0 var( --qf-gap );
	padding: 10px 12px;
	background: var( --qf-surface );
	border: 1px solid var( --qf-border );
	border-inline-start: 4px solid var( --qf-accent );
	border-radius: var( --qf-control-radius );

	&.quoteform_notice--success {
		border-inline-start-color: var( --qf-success );
	}

	&.quoteform_notice--warning {
		border-inline-start-color: var( --qf-warning-border );
	}

	&.quoteform_notice--error {
		border-inline-start-color: var( --qf-danger );
	}

	.quoteform_notice__body {
		flex: 1;

		p {
			margin: 0;
		}
	}

	.quoteform_notice__dismiss {
		padding: 0 4px;
		font-size: 18px;
		line-height: 1;
		color: var( --qf-muted );
		background: none;
		border: 0;
		cursor: pointer;
	}
}

.quoteform_builder .quoteform_move {
	display: inline-flex;

	button {
		width: 28px;
		min-height: 28px;
		padding: 0;
		color: var( --qf-muted );
		background: transparent;
		border: 0;
		border-radius: var( --qf-control-radius );
		cursor: pointer;

		&:hover:not( :disabled ) {
			color: var( --qf-accent );
			background: var( --qf-accent-soft );
		}

		&:disabled {
			opacity: 0.35;
			cursor: default;
		}

		&:focus-visible {
			outline: 2px solid var( --qf-accent );
		}
	}
}

@media ( prefers-reduced-motion: reduce ) {
	.quoteform_builder *,
	.quoteform_builder *::before,
	.quoteform_builder *::after {
		transition: none !important;
		animation: none !important;
	}
}
```

`admin-src/style.scss` (bütün faylı əvəz et):

```scss
@import "./styles/tokens";
@import "./styles/base";
```

(Növbəti task-lar bu siyahıya `shell`, `panels`, `list` əlavə edir.)

- [ ] **Step 6: Build and run the admin suite**

Run: `npm run build && npx jest --selectProjects admin`
Expected: build `compiled successfully`; bütün admin testləri PASS (bu task heç bir mövcud komponenti dəyişmir).

---

### Task 2: `ControlLabel` — qısa görünən etiket, tam əlçatan ad

**Files:**
- Create: `admin-src/components/ControlLabel.js`
- Modify: `admin-src/components/TextControl.js`, `SelectControl.js`, `NumberControl.js`, `ToggleControl.js`, `admin-src/panels/FormulaEditor.js:161`
- Test: `tests/js/admin/ControlLabel.test.js`

**Interfaces:**
- Produces: `splitLabel( label, visibleLabel ) → { hidden: string, visible: string } | null` (named export). `null` = göstəriləcək bölgü yoxdur (tam etiket göstərilir).
- Produces: `ControlLabel` (default) — props `{ htmlFor, label, visibleLabel, hideLabel = false }`.
- Produces: dörd control və `FormulaEditor` indi `visibleLabel?: string` və `hideLabel?: boolean` qəbul edir; başqa heç nə dəyişmir.
- `hideLabel`-li `<label>` elementi `data-quoteform-hidden-label=""` atributu daşıyır (Task 12-nin qoruyucusu buna baxır).

- [ ] **Step 1: Write the failing test**

`tests/js/admin/ControlLabel.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import ControlLabel, { splitLabel } from '../../../admin-src/components/ControlLabel';
import FormulaEditor from '../../../admin-src/panels/FormulaEditor';
import NumberControl from '../../../admin-src/components/NumberControl';
import SelectControl from '../../../admin-src/components/SelectControl';
import TextControl from '../../../admin-src/components/TextControl';
import ToggleControl from '../../../admin-src/components/ToggleControl';

// Görünən, `.screen-reader-text`-dən kənar mətn.
const visibleText = ( label ) =>
	Array.from( label.childNodes )
		.filter( ( node ) => ! ( node.classList && node.classList.contains( 'screen-reader-text' ) ) )
		.map( ( node ) => node.textContent )
		.join( '' );

describe( 'splitLabel', () => {
	it( 'splits a label into a hidden head and a visible tail', () => {
		expect( splitLabel( 'Calculation 1 key', 'key' ) ).toEqual( { hidden: 'Calculation 1 ', visible: 'key' } );
	} );

	it( 'matches the tail case-insensitively but keeps the label’s own letters', () => {
		expect( splitLabel( 'Step 2 title', 'Title' ) ).toEqual( { hidden: 'Step 2 ', visible: 'title' } );
	} );

	it( 'refuses a tail that starts in the middle of a word', () => {
		expect( splitLabel( 'Step 1 title', 'le' ) ).toBeNull();
	} );

	it( 'refuses a tail that is not a tail at all', () => {
		expect( splitLabel( 'Show calculation 1 to the visitor', 'Show to visitor' ) ).toBeNull();
	} );

	it( 'has nothing to split without a visible label', () => {
		expect( splitLabel( 'Currency', undefined ) ).toBeNull();
		expect( splitLabel( 'Currency', '' ) ).toBeNull();
	} );

	it( 'survives a label that is not a string', () => {
		expect( splitLabel( undefined, 'key' ) ).toBeNull();
		expect( splitLabel( 42, '2' ) ).toBeNull();
	} );
} );

describe( 'ControlLabel', () => {
	it( 'keeps the full accessible name when only the tail is shown', () => {
		render(
			<>
				<ControlLabel htmlFor="k" label="Calculation 1 key" visibleLabel="Key" />
				<input id="k" />
			</>
		);

		const input = screen.getByLabelText( 'Calculation 1 key' );
		const label = document.querySelector( 'label[for="k"]' );

		expect( input ).toHaveAttribute( 'id', 'k' );
		expect( visibleText( label ) ).toBe( 'key' );
	} );

	it( 'shows the whole label when the tail does not fit', () => {
		render(
			<>
				<ControlLabel htmlFor="t" label="Step 1 title" visibleLabel="le" />
				<input id="t" />
			</>
		);

		expect( visibleText( document.querySelector( 'label[for="t"]' ) ) ).toBe( 'Step 1 title' );
	} );

	it( 'hides the whole label, but keeps it, when asked to', () => {
		render(
			<>
				<ControlLabel htmlFor="r" label="Rule 1 action" hideLabel />
				<select id="r" />
			</>
		);

		const label = document.querySelector( 'label[for="r"]' );

		expect( screen.getByLabelText( 'Rule 1 action' ) ).toHaveAttribute( 'id', 'r' );
		expect( label ).toHaveClass( 'screen-reader-text' );
		expect( label ).toHaveAttribute( 'data-quoteform-hidden-label' );
	} );
} );

describe( 'the controls pass the new props through', () => {
	const noop = () => {};

	it( 'TextControl', () => {
		render( <TextControl id="a" label="Step 1 title" visibleLabel="Title" value="" onChange={ noop } /> );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveAttribute( 'id', 'a' );
		expect( visibleText( document.querySelector( 'label[for="a"]' ) ) ).toBe( 'title' );
	} );

	it( 'SelectControl', () => {
		render(
			<SelectControl id="b" label="Rule 1 match" hideLabel value="all" onChange={ noop } options={ [ { value: 'all', label: 'All' } ] } />
		);

		expect( screen.getByLabelText( 'Rule 1 match' ) ).toHaveAttribute( 'id', 'b' );
		expect( document.querySelector( 'label[for="b"]' ) ).toHaveClass( 'screen-reader-text' );
	} );

	it( 'NumberControl', () => {
		render( <NumberControl id="c" label="Option 1 price" visibleLabel="Price" value={ 1 } onChange={ noop } /> );

		expect( screen.getByLabelText( 'Option 1 price' ) ).toHaveAttribute( 'id', 'c' );
	} );

	it( 'ToggleControl', () => {
		render( <ToggleControl id="d" label="Required" checked={ false } onChange={ noop } /> );

		expect( screen.getByLabelText( 'Required' ) ).toHaveAttribute( 'id', 'd' );
	} );

	it( 'FormulaEditor', () => {
		render(
			<FormulaEditor
				id="e"
				label="Calculation 1 formula"
				visibleLabel="Formula"
				value="1"
				onChange={ noop }
				knownVariables={ [] }
				priceVariables={ [] }
				errors={ [] }
			/>
		);

		expect( screen.getByLabelText( 'Calculation 1 formula' ) ).toHaveAttribute( 'id', 'e' );
		expect( visibleText( document.querySelector( 'label[for="e"]' ) ) ).toBe( 'formula' );
	} );
} );
```

Qeyd: sətir olmayan etiket (`undefined`, rəqəm) bölünmür — `ControlLabel` onu olduğu kimi `<label>`-ə qoyur, React rəqəmi mətn kimi göstərir.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/js/admin/ControlLabel.test.js`
Expected: FAIL — `Cannot find module '../../../admin-src/components/ControlLabel'`.

- [ ] **Step 3: Write `ControlLabel`**

`admin-src/components/ControlLabel.js`:

```js
/**
 * Etiketi iki hissəyə bölür: gizli baş və görünən sonluq. `<label>`-in
 * ÜMUMİ mətni — yəni əlçatan ad — simvolu-simvoluna eyni qalır, çünki hər
 * iki hissə label-in içindədir; yalnız baş vizual olaraq gizlədilir.
 *
 * Sonluq söz sərhədində başlamalıdır: "Step 1 title" + "le" ekranda "le"
 * göstərərdi. Belə halda (və sonluq uyğun gəlmədikdə) `null` qaytarılır və
 * çağıran tam etiketi göstərir — səhv bölgüdənsə uzun etiket yaxşıdır.
 */
export function splitLabel( label, visibleLabel ) {
	if ( typeof label !== 'string' || typeof visibleLabel !== 'string' || visibleLabel === '' ) {
		return null;
	}

	if ( visibleLabel.length > label.length ) {
		return null;
	}

	const cut = label.length - visibleLabel.length;
	const hidden = label.slice( 0, cut );
	const visible = label.slice( cut );

	if ( visible.toLowerCase() !== visibleLabel.toLowerCase() ) {
		return null;
	}

	if ( hidden !== '' && ! /\s$/.test( hidden ) ) {
		return null;
	}

	return { hidden, visible };
}

export default function ControlLabel( { htmlFor, label, visibleLabel, hideLabel = false } ) {
	if ( hideLabel ) {
		return (
			<label htmlFor={ htmlFor } className="screen-reader-text" data-quoteform-hidden-label="">
				{ label }
			</label>
		);
	}

	const parts = splitLabel( label, visibleLabel );

	if ( parts === null ) {
		return <label htmlFor={ htmlFor }>{ label }</label>;
	}

	return (
		<label htmlFor={ htmlFor }>
			{ parts.hidden !== '' && <span className="screen-reader-text">{ parts.hidden }</span> }
			<span className="quoteform_label-visible">{ parts.visible }</span>
		</label>
	);
}
```

- [ ] **Step 4: Use it in the four controls and in `FormulaEditor`**

Hər faylda: `import ControlLabel from './ControlLabel';` əlavə et (FormulaEditor-da `'../components/ControlLabel'`), destructuring-ə `visibleLabel, hideLabel = false` əlavə et və `<label htmlFor={ id }>{ label }</label>` sətrini bu ilə əvəz et:

```jsx
<ControlLabel htmlFor={ id } label={ label } visibleLabel={ visibleLabel } hideLabel={ hideLabel } />
```

Konkret yerlər:
- `admin-src/components/TextControl.js` — `<label htmlFor={ id }>{ label }</label>` (`quoteform_control` div-inin ilk uşağı).
- `admin-src/components/SelectControl.js` — eyni.
- `admin-src/components/NumberControl.js` — eyni.
- `admin-src/components/ToggleControl.js` — `<input>`-dan sonrakı label (yerini dəyişmə — toggle-da input label-dən əvvəldir).
- `admin-src/panels/FormulaEditor.js:161` — `<label htmlFor={ id }>{ label }</label>`; komponentin props destructuring-inə `visibleLabel` əlavə et (FormulaEditor-a `hideLabel` lazım deyil).

- [ ] **Step 5: Run the new test and the whole admin suite**

Run: `npx jest tests/js/admin/ControlLabel.test.js && npx jest --selectProjects admin`
Expected: PASS. Mövcud testlərin heç biri düşmür — heç bir çağıran hələ yeni prop-ları ötürmür.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: `compiled successfully`.

---

### Task 3: `SectionNav` — sol bölmə menyusu

**Files:**
- Create: `admin-src/components/SectionNav.js`
- Create: `admin-src/styles/_shell.scss`; Modify: `admin-src/style.scss`
- Test: `tests/js/admin/SectionNav.test.js`

**Interfaces:**
- Consumes: —
- Produces: `SectionNav` (default) — props:
  - `label: string` (nav-ın `aria-label`-i),
  - `tabs: Array<{ name: string, label: string, count: number | null, hasProblem: boolean }>`,
  - `current: string`, `onSelect: ( name: string ) => void`.
- Hər tab `<button type="button">` — əlçatan adı **yalnız** `tab.label`; `aria-current="page"` cari tabda; sayğac/problem `aria-describedby` ilə bağlanan `.screen-reader-text` mətnində.
- `describeTab( tab ) → string` (named export): `'11 items'`, `'1 item'`, `'11 items, has a problem'`, `'Has a problem'` (count `null` + problem), `''`.

- [ ] **Step 1: Write the failing test**

`tests/js/admin/SectionNav.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SectionNav, { describeTab } from '../../../admin-src/components/SectionNav';

const tabs = [
	{ name: 'fields', label: 'Fields', count: 11, hasProblem: true },
	{ name: 'steps', label: 'Steps', count: 1, hasProblem: false },
	{ name: 'calculations', label: 'Pricing', count: 0, hasProblem: false },
	{ name: 'settings', label: 'Settings', count: null, hasProblem: false },
];

describe( 'describeTab', () => {
	it( 'counts items with the right plural', () => {
		expect( describeTab( { count: 11, hasProblem: false } ) ).toBe( '11 items' );
		expect( describeTab( { count: 1, hasProblem: false } ) ).toBe( '1 item' );
		expect( describeTab( { count: 0, hasProblem: false } ) ).toBe( '0 items' );
	} );

	it( 'adds the problem after the count', () => {
		expect( describeTab( { count: 11, hasProblem: true } ) ).toBe( '11 items, has a problem' );
	} );

	it( 'describes a problem on a tab without a count', () => {
		expect( describeTab( { count: null, hasProblem: true } ) ).toBe( 'Has a problem' );
	} );

	it( 'says nothing when there is nothing to say', () => {
		expect( describeTab( { count: null, hasProblem: false } ) ).toBe( '' );
	} );
} );

describe( 'SectionNav', () => {
	const renderNav = ( current = 'fields', onSelect = jest.fn() ) =>
		render( <SectionNav label="Builder sections" tabs={ tabs } current={ current } onSelect={ onSelect } /> );

	it( 'names each tab by its label alone, so the count never leaks into the name', () => {
		renderNav();

		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).toBeInTheDocument();
		expect( screen.getByRole( 'button', { name: 'Pricing' } ) ).toBeInTheDocument();
	} );

	it( 'describes the count and the problem', () => {
		renderNav();

		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).toHaveAccessibleDescription( '11 items, has a problem' );
		expect( screen.getByRole( 'button', { name: 'Steps' } ) ).toHaveAccessibleDescription( '1 item' );
	} );

	it( 'has no description for a tab with nothing to describe', () => {
		renderNav();

		expect( screen.getByRole( 'button', { name: 'Settings' } ) ).not.toHaveAttribute( 'aria-describedby' );
	} );

	it( 'marks only the current tab', () => {
		renderNav( 'steps' );

		expect( screen.getByRole( 'button', { name: 'Steps' } ) ).toHaveAttribute( 'aria-current', 'page' );
		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).not.toHaveAttribute( 'aria-current' );
	} );

	it( 'reports the chosen tab', async () => {
		const onSelect = jest.fn();

		renderNav( 'fields', onSelect );
		await userEvent.click( screen.getByRole( 'button', { name: 'Pricing' } ) );

		expect( onSelect ).toHaveBeenCalledWith( 'calculations' );
	} );

	it( 'lives in a labelled navigation landmark', () => {
		renderNav();

		expect( screen.getByRole( 'navigation', { name: 'Builder sections' } ) ).toBeInTheDocument();
	} );
} );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/js/admin/SectionNav.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `SectionNav`**

`admin-src/components/SectionNav.js`:

```js
import { __, _n, sprintf } from '@wordpress/i18n';

/**
 * Sayğac və problem düymənin ADINA yox, TƏSVİRİNƏ gedir: testlər və səslə
 * idarə edən istifadəçilər tabı "Fields" adı ilə tapır, "Fields 11" ilə yox.
 */
export function describeTab( { count, hasProblem } ) {
	const parts = [];

	if ( typeof count === 'number' ) {
		parts.push(
			sprintf(
				/* translators: %d: how many items this builder section holds. */
				_n( '%d item', '%d items', count, 'quoteform' ),
				count
			)
		);
	}

	if ( hasProblem ) {
		parts.push(
			parts.length > 0
				? __( 'has a problem', 'quoteform' )
				: __( 'Has a problem', 'quoteform' )
		);
	}

	return parts.join( ', ' );
}

export default function SectionNav( { label, tabs, current, onSelect } ) {
	return (
		<nav className="quoteform_sections" aria-label={ label }>
			<ul>
				{ tabs.map( ( tab ) => {
					const description = describeTab( tab );
					const descriptionId = `quoteform_section-${ tab.name }-description`;

					return (
						<li key={ tab.name }>
							<button
								type="button"
								className="quoteform_sections__tab"
								onClick={ () => onSelect( tab.name ) }
								aria-current={ current === tab.name ? 'page' : undefined }
								aria-describedby={ description ? descriptionId : undefined }
							>
								<span className="quoteform_sections__label">{ tab.label }</span>
								{ tab.hasProblem && (
									<span className="quoteform_sections__dot" aria-hidden="true" />
								) }
								{ typeof tab.count === 'number' && (
									<span className="quoteform_sections__count" aria-hidden="true">
										{ tab.count }
									</span>
								) }
							</button>
							{ description && (
								<span id={ descriptionId } className="screen-reader-text">
									{ description }
								</span>
							) }
						</li>
					);
				} ) }
			</ul>
		</nav>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/js/admin/SectionNav.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the shell stylesheet**

`admin-src/styles/_shell.scss`:

```scss
// --- Üst zolaq --------------------------------------------------------------

.quoteform_builder .quoteform_topbar {
	position: sticky;
	top: var( --wp-admin--admin-bar--height, 32px );
	z-index: 20;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	margin: 0 0 var( --qf-gap );
	padding: 10px 16px;
	background: var( --qf-surface );
	border: 1px solid var( --qf-border );
	border-radius: var( --qf-radius );
	box-shadow: var( --qf-shadow );
}

@media ( max-width: 782px ) {
	.quoteform_builder .quoteform_topbar {
		top: 0;
	}
}

.quoteform_builder .quoteform_topbar__sep {
	color: var( --qf-border );
}

.quoteform_builder .quoteform_topbar__title {
	flex: 1 1 220px;
	min-width: 0;

	input {
		min-height: 36px;
		padding: 2px 8px;
		font-size: 16px;
		font-weight: 600;
		border-color: transparent;
		background: transparent;

		&:hover {
			border-color: var( --qf-border );
		}

		&:focus {
			background: var( --qf-surface );
		}
	}
}

.quoteform_builder .quoteform_topbar__actions {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-inline-start: auto;
}

// --- Gövdə ---------------------------------------------------------------

.quoteform_builder .quoteform_editor__body {
	display: grid;
	grid-template-columns: 180px minmax( 0, 1fr );
	gap: 20px;
	align-items: start;
}

@media ( max-width: 960px ) {
	.quoteform_builder .quoteform_editor__body {
		grid-template-columns: minmax( 0, 1fr );
	}
}

// --- Sol menyu ---------------------------------------------------------------

.quoteform_builder .quoteform_sections {
	position: sticky;
	top: calc( var( --wp-admin--admin-bar--height, 32px ) + 76px );

	ul {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		margin: 0;
	}
}

.quoteform_builder .quoteform_sections__tab {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	min-height: 36px;
	padding: 0 12px;
	font: inherit;
	font-size: 13px;
	color: #50575e;
	text-align: start;
	background: transparent;
	border: 0;
	border-radius: var( --qf-control-radius );
	cursor: pointer;

	&:hover {
		color: var( --qf-text );
		background: rgba( 0, 0, 0, 0.04 );
	}

	&[aria-current="page"] {
		font-weight: 600;
		color: var( --qf-text );
		background: var( --qf-surface );
		box-shadow: var( --qf-shadow ), inset 3px 0 0 var( --qf-accent );
	}

	&:focus-visible {
		outline: 2px solid var( --qf-accent );
		outline-offset: -2px;
	}
}

.quoteform_builder .quoteform_sections__label {
	flex: 1;
}

.quoteform_builder .quoteform_sections__count {
	font-size: 11px;
	color: var( --qf-muted );
}

.quoteform_builder .quoteform_sections__dot {
	width: 8px;
	height: 8px;
	background: var( --qf-danger );
	border-radius: 50%;
}

@media ( max-width: 960px ) {
	.quoteform_builder .quoteform_sections {
		position: static;

		ul {
			flex-direction: row;
			overflow-x: auto;
		}
	}

	.quoteform_builder .quoteform_sections__tab {
		width: auto;
		white-space: nowrap;
	}
}

// --- Panel başlığı (bütün panellərdə) ---------------------------------------

.quoteform_builder .quoteform_panel__head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px 16px;
	margin-bottom: 12px;
}

.quoteform_builder .quoteform_panel__intro {
	margin: 2px 0 0;
	font-size: 12px;
	color: var( --qf-muted );
}

.quoteform_builder .quoteform_panel > * + * {
	margin-top: 12px;
}
```

`admin-src/style.scss`:

```scss
@import "./styles/tokens";
@import "./styles/base";
@import "./styles/shell";
```

- [ ] **Step 6: Build and run the admin suite**

Run: `npm run build && npx jest --selectProjects admin`
Expected: PASS.

---

### Task 4: Redaktor qabığı — üst zolaq, sol menyu, "Pricing"

**Files:**
- Modify: `admin-src/screens/EditorScreen.js` (yalnız `TAB_LABELS` və əsas `return` bloku, sətir 30–36 və 223–334; yükləmə/xəta vəziyyətlərinin JSX-i dəyişmir)
- Modify (icazə verilmiş istisna): `tests/js/admin/EditorScreen.test.js:193`, `tests/e2e/builder.spec.js:83, 98, 120, 198`
- Test: `tests/js/admin/EditorShell.test.js`

**Interfaces:**
- Consumes: `Button` (Task 1), `ControlLabel` via `TextControl` `hideLabel` (Task 2), `SectionNav` (Task 3), `hasErrorsUnder( index, prefix )` (`admin-src/state/errors.js`).
- Produces: DOM — `.quoteform_topbar`, `.quoteform_topbar__title`, `.quoteform_topbar__actions`, `.quoteform_editor__body`, `.quoteform_editor__content`. Task 5 `.quoteform_editor__content`-in içinə yazır.

- [ ] **Step 1: Look at how EditorScreen tests load a form**

Run: `sed -n 1,110p tests/js/admin/EditorScreen.test.js`
Qeyd et: `getForm`/`updateForm` necə mock olunur, `renderEditor`-a oxşar köməkçinin adı və formanın yüklənməsini necə gözlədiyi. Yeni test faylında **eyni** mock və köməkçi naxışını təkrarla (faylı import etmə — test faylları bir-birindən import etmir).

- [ ] **Step 2: Write the failing test**

`tests/js/admin/EditorShell.test.js` — Step 1-də gördüyün mock/render naxışı ilə (aşağıdakı `jest.mock` bloku və `openEditor` köməkçisi həmin naxışın qısa formasıdır; mövcud faylda fərqli ad varsa, onun işlədiyi `api/client` funksiyalarını eyni cür mock et):

```js
/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditorScreen from '../../../admin-src/screens/EditorScreen';
import { StoreProvider } from '../../../admin-src/state/StoreContext';
import { getForm, updateForm } from '../../../admin-src/api/client';

jest.mock( '../../../admin-src/api/client', () => ( {
	getForm: jest.fn(),
	updateForm: jest.fn(),
} ) );

const form = {
	id: 7,
	title: 'Cleaning',
	schema: {
		version: 1,
		settings: {
			currency: 'USD', currency_position: 'before', decimals: 2, submit_label: 'Go',
			success_action: 'message', success_message: 'Thanks', redirect_url: '',
			save_resume: false, store_ip: false,
		},
		fields: {
			rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', placeholder: '', required: false, default: 1 },
		},
		steps: [ { key: 'one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		calculations: [ { key: 'total', label: 'Total', expression: '{rooms}', visible: true } ],
		rules: [],
		notifications: [],
	},
};

async function openEditor() {
	getForm.mockResolvedValue( form );
	render(
		<StoreProvider>
			<EditorScreen formId={ 7 } onClose={ jest.fn() } />
		</StoreProvider>
	);
	await screen.findByLabelText( 'Form title' );
}

beforeEach( () => {
	jest.clearAllMocks();
} );

describe( 'the editor shell', () => {
	it( 'shows the Calculations section as "Pricing"', async () => {
		const user = userEvent.setup();

		await openEditor();
		await user.click( screen.getByRole( 'button', { name: 'Pricing' } ) );

		expect( screen.getByRole( 'heading', { name: 'Calculations' } ) ).toBeInTheDocument();
	} );

	it( 'no longer has a tab called Calculations', async () => {
		await openEditor();

		expect( screen.queryByRole( 'button', { name: 'Calculations' } ) ).not.toBeInTheDocument();
	} );

	it( 'counts what each section holds', async () => {
		await openEditor();

		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).toHaveAccessibleDescription( '1 item' );
		expect( screen.getByRole( 'button', { name: 'Pricing' } ) ).toHaveAccessibleDescription( '1 item' );
		expect( screen.getByRole( 'button', { name: 'Rules' } ) ).toHaveAccessibleDescription( '0 items' );
	} );

	it( 'points at the section a save error lives in', async () => {
		const user = userEvent.setup();

		await openEditor();
		updateForm.mockRejectedValue( {
			code: 'qform_invalid_schema',
			status: 400,
			message: 'The form has problems.',
			errors: [ { path: 'calculations.0.expression', code: 'x', message: 'Broken.' } ],
		} );
		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'button', { name: 'Pricing' } ) ).toHaveAccessibleDescription(
			'1 item, has a problem'
		);
		expect( screen.getByRole( 'button', { name: 'Fields' } ) ).toHaveAccessibleDescription( '1 item' );
	} );

	it( 'keeps the Save name while saving, and says it is busy', async () => {
		const user = userEvent.setup();
		let resolveSave;

		await openEditor();
		updateForm.mockImplementation( () => new Promise( ( resolve ) => { resolveSave = resolve; } ) );

		const save = screen.getByRole( 'button', { name: 'Save' } );

		await user.click( save );
		expect( save ).toHaveAttribute( 'aria-busy', 'true' );
		expect( save ).toHaveAccessibleName( 'Save' );

		await act( async () => resolveSave( form ) );
		expect( save ).not.toHaveAttribute( 'aria-busy' );
	} );

	it( 'shows "Forms" on the back button but keeps its full name', async () => {
		await openEditor();

		const back = screen.getByRole( 'button', { name: 'Back to all forms' } );

		expect( back ).toHaveTextContent( 'Forms' );
	} );
} );
```

Əgər Step 1 göstərsə ki, mövcud testlər saxlama xətasını başqa formada mock edir (məs. `ApiError` sinfi), `points at the section…` testində **o** formanı işlət — `errors: [ { path, code, message } ]` massivi və `indexErrors` eyni qalır.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/js/admin/EditorShell.test.js`
Expected: FAIL — "Unable to find an accessible element with the role "button" and name "Pricing"".

- [ ] **Step 4: Implement the shell**

`admin-src/screens/EditorScreen.js`:

1. Importlar — əlavə et:

```js
import Button from '../components/Button';
import SectionNav from '../components/SectionNav';
import { EMPTY_INDEX, hasErrorsUnder, indexErrors } from '../state/errors';
```

(mövcud `import { EMPTY_INDEX, indexErrors } from '../state/errors';` sətrini bununla əvəz et.)

2. `TAB_LABELS`-da yalnız bir sətir dəyişir:

```js
	calculations: __( 'Pricing', 'quoteform' ),
```

3. `TAB_LABELS`-dan sonra əlavə et:

```js
function countFor( schema, name ) {
	if ( name === 'fields' ) {
		return Object.keys( schema.fields ).length;
	}

	if ( name === 'settings' ) {
		return null;
	}

	return schema[ name ].length;
}
```

4. Əsas `return (` blokunu (`<div className="quoteform_editor">` ilə başlayan, `state.schema` yüklənəndən sonrakı) tamamilə bununla əvəz et. Diqqət: bütün `ref`-lər, `onClick`-lər, notice-lər, `leaving` bloku və panellərin render şərtləri **eynidir** — dəyişən yalnız yerləşmədir:

```jsx
	const tabs = TABS.map( ( name ) => ( {
		name,
		label: TAB_LABELS[ name ],
		count: countFor( state.schema, name ),
		hasProblem: hasErrorsUnder( errorIndex, name ),
	} ) );

	return (
		<div className="quoteform_editor">
			<h1 ref={ headingRef } tabIndex={ -1 } className="screen-reader-text">
				{ __( 'Edit form', 'quoteform' ) }
			</h1>

			<div className="quoteform_topbar">
				<Button
					variant="ghost"
					ref={ backButtonRef }
					onClick={ handleBack }
					aria-label={ __( 'Back to all forms', 'quoteform' ) }
				>
					<span aria-hidden="true">←</span>
					{ __( 'Forms', 'quoteform' ) }
				</Button>

				<span className="quoteform_topbar__sep" aria-hidden="true">
					/
				</span>

				<div className="quoteform_topbar__title">
					<TextControl
						id="quoteform_form-title"
						label={ __( 'Form title', 'quoteform' ) }
						hideLabel
						value={ state.title }
						onChange={ ( value ) => dispatch( setTitle( value ) ) }
					/>
				</div>

				<div className="quoteform_topbar__actions">
					{ state.dirty && (
						<span className="quoteform_editor__dirty quoteform_badge quoteform_badge--dirty">
							{ __( 'Unsaved changes', 'quoteform' ) }
						</span>
					) }

					<Button
						variant="primary"
						ref={ saveButtonRef }
						onClick={ handleSave }
						disabled={ state.saving }
						aria-busy={ state.saving ? 'true' : undefined }
					>
						{ __( 'Save', 'quoteform' ) }
					</Button>
				</div>
			</div>

			{ leaving && (
				<div className="quoteform_confirm">
					<p>{ __( 'You have unsaved changes. Leave anyway?', 'quoteform' ) }</p>
					<Button
						variant="danger"
						onClick={ () => {
							setLeaving( false );
							onClose();
						} }
					>
						{ __( 'Leave without saving', 'quoteform' ) }
					</Button>
					<Button ref={ stayButtonRef } onClick={ cancelLeaving }>
						{ __( 'Stay here', 'quoteform' ) }
					</Button>
				</div>
			) }

			{ saved && ! state.dirty && (
				<Notice status="success" onDismiss={ () => setSaved( false ) }>
					{ __( 'Saved.', 'quoteform' ) }
				</Notice>
			) }

			{ state.saveError && (
				<Notice status="error" onDismiss={ () => dispatch( dismissSaveError() ) }>
					<p>{ errorMessage( state.saveError ) }</p>
					{ needsReload( state.saveError ) && (
						<Button onClick={ () => window.location.reload() }>
							{ __( 'Reload page', 'quoteform' ) }
						</Button>
					) }
					{ state.saveError.errors.length > 0 && (
						<ul>
							{ state.saveError.errors.map( ( error, index ) => (
								<li key={ `${ error.path }-${ index }` }>
									<code>{ error.path || __( 'the form', 'quoteform' ) }</code>{ ' ' }
									{ error.message }
								</li>
							) ) }
						</ul>
					) }
				</Notice>
			) }

			<div className="quoteform_editor__body">
				<SectionNav
					label={ __( 'Builder sections', 'quoteform' ) }
					tabs={ tabs }
					current={ tab }
					onSelect={ setTab }
				/>

				<div className="quoteform_editor__content">
					{ tab === 'fields' && (
						<>
							<FieldsPanel
								errorIndex={ errorIndex }
								selectedKey={ selectedField }
								onSelect={ setSelectedField }
							/>
							{ selectedField && (
								<FieldEditor
									fieldKey={ selectedField }
									errorIndex={ errorIndex }
									onKeyChange={ setSelectedField }
								/>
							) }
						</>
					) }
					{ tab === 'steps' && <StepsPanel errorIndex={ errorIndex } /> }
					{ tab === 'calculations' && <CalculationsPanel errorIndex={ errorIndex } /> }
					{ tab === 'rules' && <RulesPanel errorIndex={ errorIndex } /> }
					{ tab === 'settings' && <SettingsPanel errorIndex={ errorIndex } /> }
				</div>
			</div>
		</div>
	);
```

Qeyd: "leaving" bloku DOM-da artıq Save-dən sonra, panellərdən əvvəl gəlir. Bu, sənədin sonundan yuxarı köçmədir — fokus `stayButtonRef` ilə idarə olunur, mövcud testlər bunu yoxlayır.

5. Yükləmə/xəta vəziyyətlərindəki `<h1>`-lər toxunulmaz qalır (görünür) — orada üst zolaq yoxdur.

- [ ] **Step 5: Apply the one permitted test rename**

`tests/js/admin/EditorScreen.test.js:193`:

```js
		await user.click( screen.getByRole( 'button', { name: 'Pricing' } ) );
```

`tests/e2e/builder.spec.js` — sətir 83, 98, 120:

```js
		await page.getByRole( 'button', { name: 'Pricing' } ).click();
```

sətir 198:

```js
		await activate( page, tab( page, 'Pricing' ), 'the Pricing tab' );
```

və həmin testdə `expectFocusKept( page, 'the Calculations tab' )` → `expectFocusKept( page, 'the Pricing tab' )` (yalnız mesaj mətni).

Başqa heç bir mövcud test sətrinə toxunma.

- [ ] **Step 6: Add the shell styles to the stylesheet**

`_shell.scss` Task 3-də yazılıb; burada əlavə stil yoxdur. `npm run build`.

- [ ] **Step 7: Run tests**

Run: `npx jest tests/js/admin/EditorShell.test.js && npx jest --selectProjects admin`
Expected: PASS — yeni 6 test və bütün mövcud admin testləri.

---

### Task 5: Fields paneli — siyahı + redaktor iki sütunda

**Files:**
- Modify: `admin-src/screens/EditorScreen.js` (Task 4-də yazılan `tab === 'fields'` bloku)
- Modify: `admin-src/panels/FieldsPanel.js:48-146`, `admin-src/panels/FieldEditor.js:112`
- Create: `admin-src/styles/_panels.scss`; Modify: `admin-src/style.scss`
- Test: `tests/js/admin/FieldsLayout.test.js`

**Interfaces:**
- Consumes: `Button`, `Card` (Task 1).
- Produces: `.quoteform_fields-layout` (grid), `.quoteform_fields-layout__editor` (sticky sütun), boş vəziyyət mətni `Select a field to edit it.`

- [ ] **Step 1: Write the failing test**

`tests/js/admin/FieldsLayout.test.js` — Task 4 Step 2-dəki `jest.mock`, `form`, `openEditor` blokunu olduğu kimi kopyala (bu faylda da lazımdır), sonra:

```js
describe( 'the fields layout', () => {
	it( 'invites you to pick a field while none is selected', async () => {
		await openEditor();

		expect( screen.getByText( 'Select a field to edit it.' ) ).toBeInTheDocument();
	} );

	it( 'replaces the invitation with the editor once a field is picked', async () => {
		const user = userEvent.setup();

		await openEditor();
		await user.click( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) );

		expect( screen.queryByText( 'Select a field to edit it.' ) ).not.toBeInTheDocument();
		expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'rooms' );
	} );
} );
```

(Əgər siyahıdakı düymənin adı `displayName`-ə görə fərqlidirsə — `FieldsPanel.test.js`-də necə tapıldığına bax və eyni adı işlət.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/js/admin/FieldsLayout.test.js`
Expected: FAIL — "Unable to find an element with the text: Select a field to edit it."

- [ ] **Step 3: Implement the layout**

`EditorScreen.js` — `tab === 'fields'` blokunu bununla əvəz et (`Card` import et: `import Card from '../components/Card';`):

```jsx
					{ tab === 'fields' && (
						<div className="quoteform_fields-layout">
							<FieldsPanel
								errorIndex={ errorIndex }
								selectedKey={ selectedField }
								onSelect={ setSelectedField }
							/>
							<div className="quoteform_fields-layout__editor">
								{ selectedField ? (
									<FieldEditor
										fieldKey={ selectedField }
										errorIndex={ errorIndex }
										onKeyChange={ setSelectedField }
									/>
								) : (
									<Card className="quoteform_empty">
										{ __( 'Select a field to edit it.', 'quoteform' ) }
									</Card>
								) }
							</div>
						</div>
					) }
```

`FieldsPanel.js` — yalnız sinif adları və düymə komponenti dəyişir; `ref`, `onClick`, `aria-*`, `li.is-selected`, mətnlər eyni qalır:

- `import Button from '../components/Button';`
- `<section className="quoteform_panel quoteform_card" aria-labelledby="quoteform_fields-heading">` (yalnız `className` dəyişir)
- `<h2>`-ni və `.quoteform_fields__add` div-ini bir başlığa yığ:

```jsx
			<div className="quoteform_panel__head">
				<h2 id="quoteform_fields-heading">{ __( 'Fields', 'quoteform' ) }</h2>
			</div>

			<div className="quoteform_fields__add">
				<label htmlFor="quoteform_new-field-type">{ __( 'Field type', 'quoteform' ) }</label>
				<select
					id="quoteform_new-field-type"
					value={ pendingType }
					onChange={ ( event ) => setPendingType( event.target.value ) }
				>
					{ FIELD_TYPES.map( ( type ) => (
						<option key={ type } value={ type }>
							{ TYPE_LABELS[ type ] }
						</option>
					) ) }
				</select>
				<Button variant="primary" ref={ addButtonRef } onClick={ () => dispatch( addField( pendingType ) ) }>
					{ __( 'Add field', 'quoteform' ) }
				</Button>
			</div>
```

- Boş vəziyyət: `<p>` → `<p className="quoteform_empty">` (mətn eyni).
- Siyahı sətri (`li` və onun `is-selected` sinfi dəyişmir):

```jsx
							<li key={ key } className={ isSelected ? 'is-selected' : undefined }>
								<button
									type="button"
									className="quoteform_fields__name"
									onClick={ () => onSelect( key ) }
									aria-current={ isSelected ? 'true' : undefined }
								>
									{ name }
								</button>
								<span className="quoteform_fields__type quoteform_badge">{ TYPE_LABELS[ field.type ] }</span>
								{ broken && (
									<span className="quoteform_fields__badge quoteform_badge quoteform_badge--problem">
										{ __( 'Has a problem', 'quoteform' ) }
									</span>
								) }
								<Button
									variant="danger"
									ref={ ( el ) => {
										removeButtonRefs.current[ key ] = el;
									} }
									onClick={ () => setConfirming( key ) }
									aria-label={ sprintf(
										/* translators: %s: field label or key. */
										__( 'Remove %s', 'quoteform' ),
										name
									) }
								>
									{ __( 'Remove', 'quoteform' ) }
								</Button>

								{ confirming === key && (
									<span className="quoteform_confirm">
										<span>
											{ __(
												'Removing a field does not remove references to it. Any step, calculation or rule that uses it will report an error until you fix it.',
												'quoteform'
											) }
										</span>
										<Button variant="danger" ref={ confirmButtonRef } onClick={ () => handleRemove( key ) }>
											{ __( 'Remove field', 'quoteform' ) }
										</Button>
										<Button onClick={ () => handleCancelRemove( key ) }>
											{ __( 'Cancel', 'quoteform' ) }
										</Button>
									</span>
								) }
							</li>
```

`FieldEditor.js:112` — `<section className="quoteform_panel quoteform_card" aria-labelledby="quoteform_field-heading">` (yalnız `className` dəyişir).

- [ ] **Step 4: Write the panels stylesheet (Fields part)**

`admin-src/styles/_panels.scss`:

```scss
// --- Fields -------------------------------------------------------------------

.quoteform_builder .quoteform_fields-layout {
	display: grid;
	grid-template-columns: minmax( 0, 1fr ) minmax( 0, 1.15fr );
	gap: 16px;
	align-items: start;
}

.quoteform_builder .quoteform_fields-layout__editor {
	position: sticky;
	top: calc( var( --wp-admin--admin-bar--height, 32px ) + 76px );
}

@media ( max-width: 1100px ) {
	.quoteform_builder .quoteform_fields-layout {
		grid-template-columns: minmax( 0, 1fr );
	}

	.quoteform_builder .quoteform_fields-layout__editor {
		position: static;
	}
}

.quoteform_builder .quoteform_fields__add {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 8px;

	label {
		flex-basis: 100%;
		font-size: 12px;
		font-weight: 600;
	}

	select {
		flex: 1;
		min-height: 32px;
		border-radius: var( --qf-control-radius );
	}
}

.quoteform_builder .quoteform_fields__list {
	margin: 0;
	padding: 0;
	list-style: none;

	> li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin: 0 0 4px;
		padding: 4px 4px 4px 0;
		border: 1px solid transparent;
		border-radius: var( --qf-control-radius );

		&:hover {
			background: var( --qf-subtle );
		}

		&.is-selected {
			background: var( --qf-accent-soft );
			border-color: var( --qf-accent );
		}

		> .quoteform_confirm {
			flex-basis: 100%;
		}
	}
}

.quoteform_builder .quoteform_fields__name {
	flex: 1;
	min-width: 0;
	padding: 6px 10px;
	font: inherit;
	font-weight: 500;
	color: var( --qf-text );
	text-align: start;
	background: none;
	border: 0;
	border-radius: var( --qf-control-radius );
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var( --qf-accent );
	}
}

.quoteform_builder .quoteform_fields-layout__editor .quoteform_panel {
	display: grid;
	gap: 12px;
}
```

`admin-src/style.scss` — `@import "./styles/panels";` sətrini `shell`-dən sonra əlavə et.

- [ ] **Step 5: Run tests and build**

Run: `npm run build && npx jest tests/js/admin/FieldsLayout.test.js && npx jest --selectProjects admin`
Expected: PASS.

---

### Task 6: Steps paneli — kartlar və chip-lər

**Files:**
- Modify: `admin-src/panels/StepsPanel.js:142-311`
- Modify: `admin-src/styles/_panels.scss` (əlavə)
- Test: `tests/js/admin/StepsCards.test.js`

**Interfaces:**
- Consumes: `Button`, `TextControl` `visibleLabel` (Task 2).
- Produces: hər addım `div.quoteform_step.quoteform_card` (mövcud `quoteform_step` sinfi saxlanılır), `.quoteform_step__head`, `.quoteform_step__number`, `.quoteform_chip`.

- [ ] **Step 1: Write the failing test**

`tests/js/admin/StepsCards.test.js` — `StepsPanel.test.js`-in faylın başındakı render köməkçisini (store-u formla dolduran harness) kopyala. Sonra:

```js
const visibleText = ( label ) =>
	Array.from( label.childNodes )
		.filter( ( node ) => ! ( node.classList && node.classList.contains( 'screen-reader-text' ) ) )
		.map( ( node ) => node.textContent )
		.join( '' );

describe( 'step cards', () => {
	it( 'shows short labels but keeps the numbered names', async () => {
		await renderWithOneStep(); // StepsPanel.test.js-dəki köməkçinin adı ilə əvəz et

		const title = screen.getByLabelText( 'Step 1 title' );

		expect( visibleText( document.querySelector( `label[for="${ title.id }"]` ) ) ).toBe( 'title' );
		expect( screen.getByLabelText( 'Step 1 description' ) ).toBeInTheDocument();
	} );

	it( 'numbers each step in its header', async () => {
		await renderWithOneStep();

		expect( document.querySelector( '.quoteform_step__number' ) ).toHaveTextContent( '1' );
	} );

	it( 'shows a field chip whose button is still named for what it does', async () => {
		await renderWithOneStep();

		const takeOff = screen.getByRole( 'button', { name: /^Take off this step: / } );

		expect( takeOff.closest( '.quoteform_chip' ) ).not.toBeNull();
	} );
} );
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/js/admin/StepsCards.test.js`
Expected: FAIL — görünən mətn `'Step 1 title'`, `'title'` gözlənilir.

- [ ] **Step 3: Implement**

`StepsPanel.js`:
- `import Button from '../components/Button';`
- `<section className="quoteform_panel" aria-labelledby="quoteform_steps-heading">` dəyişmir. Mövcud `<h2>` və "Add step" düyməsini bununla əvəz et:

```jsx
			<div className="quoteform_panel__head">
				<div>
					<h2 id="quoteform_steps-heading" ref={ headingRef } tabIndex={ -1 }>
						{ __( 'Steps', 'quoteform' ) }
					</h2>
					<p className="quoteform_panel__intro">
						{ __( 'Visitors move through these one at a time.', 'quoteform' ) }
					</p>
				</div>
				<Button ref={ addButtonRef } onClick={ () => dispatch( addStep() ) }>
					{ __( 'Add step', 'quoteform' ) }
				</Button>
			</div>
```

- Boş mətn `<p>` → `<p className="quoteform_card quoteform_empty">`.
- Hər addımın kartı (sıra dəyişmir: title, description, move, remove, confirm, fields, warning). `div`-in sinfi `quoteform_step quoteform_card`. Title-dan əvvəl başlıq sətri — **görünən, dekorativ** (adı artıq Title inputu daşıyır):

```jsx
					<div className="quoteform_step quoteform_card" key={ step.key || index }>
						<div className="quoteform_step__head" aria-hidden="true">
							<span className="quoteform_step__number">{ number }</span>
							<span className="quoteform_step__name">{ step.title || step.key }</span>
						</div>

						<div className="quoteform_step__texts">
							<TextControl
								id={ `quoteform_step-${ index }-title` }
								label={ sprintf(
									/* translators: %d: step number. */
									__( 'Step %d title', 'quoteform' ),
									number
								) }
								visibleLabel={ __( 'Title', 'quoteform' ) }
								value={ step.title }
								onChange={ ( value ) => dispatch( updateStep( index, { title: value } ) ) }
								errors={ at( 'title' ) }
							/>

							<TextControl
								id={ `quoteform_step-${ index }-description` }
								label={ sprintf(
									/* translators: %d: step number. */
									__( 'Step %d description', 'quoteform' ),
									number
								) }
								visibleLabel={ __( 'Description', 'quoteform' ) }
								value={ step.description }
								onChange={ ( value ) => dispatch( updateStep( index, { description: value } ) ) }
								errors={ at( 'description' ) }
								multiline
							/>
						</div>

						<div className="quoteform_step__tools">
							<MoveButtons
								label={ stepName }
								onMoveUp={ () => dispatch( moveStep( index, 'up' ) ) }
								onMoveDown={ () => dispatch( moveStep( index, 'down' ) ) }
								canMoveUp={ index > 0 }
								canMoveDown={ index < steps.length - 1 }
							/>

							<Button
								variant="danger"
								ref={ ( el ) => {
									removeButtonRefs.current[ step.key ] = el;
								} }
								onClick={ () => setConfirming( step.key ) }
								aria-label={ sprintf(
									/* translators: 1: step number. 2: step title. */
									__( 'Remove step %1$d: %2$s', 'quoteform' ),
									number,
									step.title || step.key
								) }
							>
								{ __( 'Remove step', 'quoteform' ) }
							</Button>
						</div>

						{ confirming === step.key && (
							<span className="quoteform_confirm">
								<span>{ removeConfirmMessage( step ) }</span>
								<Button variant="danger" ref={ confirmButtonRef } onClick={ () => handleRemove( index ) }>
									{ __( 'Remove step', 'quoteform' ) }
								</Button>
								<Button onClick={ () => handleCancelRemove( step.key ) }>
									{ __( 'Cancel', 'quoteform' ) }
								</Button>
							</span>
						) }
```
  Diqqət: mövcud `.quoteform_step__head` aria-hidden olduğu üçün Tab sırasına heç nə əlavə etmir.
- Sahələr siyahısı — `ul.quoteform_step__fields` qalır, hər `li`-yə `className="quoteform_chip"`, "Take off" düyməsinin görünən mətni `✕` olur, `aria-label` dəyişmir:

```jsx
								<li key={ key } className="quoteform_chip">
									<span>{ nameOf( key ) }</span>
									<button
										type="button"
										className="quoteform_chip__remove"
										ref={ ( el ) => {
											takeOffButtonRefs.current[ key ] = el;
										} }
										onClick={ () => handleUnassign( key ) }
										aria-label={ takeOffLabel( nameOf( key ) ) }
									>
										<span aria-hidden="true">✕</span>
									</button>
								</li>
```

  `step.fields.length === 0` xəbərdarlığı (`quoteform_warning`) chip siyahısından sonra, yerində qalır.
- Addımsız sahələr qutusu: `div.quoteform_unplaced`, `h3`, `label`, `select` dəyişmir; yalnız düymə:

```jsx
								<Button
									variant="primary"
									disabled={ ! choices[ key ] }
									onClick={ () => handleAssign( key, Number( choices[ key ] ) ) }
									aria-label={ putOnStepLabel( nameOf( key ) ) }
								>
									{ __( 'Put on step', 'quoteform' ) }
								</Button>
```

- [ ] **Step 4: Styles**

`_panels.scss`-ə əlavə et:

```scss
// --- Steps --------------------------------------------------------------------

.quoteform_builder .quoteform_step {
	display: grid;
	gap: 12px;
}

.quoteform_builder .quoteform_step__head {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
}

.quoteform_builder .quoteform_step__number {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	font-size: 11px;
	color: #50575e;
	background: var( --qf-bg );
	border-radius: 50%;
}

.quoteform_builder .quoteform_step__texts {
	display: grid;
	grid-template-columns: minmax( 0, 1fr ) minmax( 0, 1.4fr );
	gap: 12px;
}

@media ( max-width: 782px ) {
	.quoteform_builder .quoteform_step__texts {
		grid-template-columns: minmax( 0, 1fr );
	}
}

.quoteform_builder .quoteform_step__tools {
	display: flex;
	align-items: center;
	gap: 4px;
}

.quoteform_builder .quoteform_step__fields {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.quoteform_builder .quoteform_chip {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	margin: 0;
	padding-inline: 10px 2px;
	font-size: 12px;
	color: #135e96;
	background: var( --qf-accent-soft );
	border: 1px solid #c5d9ed;
	border-radius: 999px;
}

.quoteform_builder .quoteform_chip__remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	padding: 0;
	font-size: 10px;
	color: var( --qf-muted );
	background: none;
	border: 0;
	border-radius: 50%;
	cursor: pointer;

	&:hover {
		color: var( --qf-danger );
		background: var( --qf-danger-soft );
	}

	&:focus-visible {
		outline: 2px solid var( --qf-accent );
	}
}

.quoteform_builder .quoteform_unplaced {
	padding: 12px 16px;
	background: var( --qf-warning-bg );
	border: 1px dashed var( --qf-warning-border );
	border-radius: var( --qf-radius );

	ul {
		display: grid;
		gap: 8px;
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0;
	}

	label {
		font-size: 12px;
	}

	select {
		min-height: 32px;
		border-radius: var( --qf-control-radius );
	}
}
```

- [ ] **Step 5: Run tests and build**

Run: `npm run build && npx jest tests/js/admin/StepsCards.test.js && npx jest --selectProjects admin`
Expected: PASS (`StepsPanel.test.js:60`-dakı `.quoteform_step` sayı dəyişməz — sinif saxlanılıb).

---

### Task 7: Pricing paneli — hesablama kartları

**Files:**
- Modify: `admin-src/panels/CalculationsPanel.js:71-237`
- Modify: `admin-src/styles/_panels.scss`
- Test: `tests/js/admin/CalculationCards.test.js`

**Interfaces:**
- Consumes: `Button`, `TextControl`/`FormulaEditor` `visibleLabel`.
- Produces: `div.quoteform_calculation.quoteform_card` (e2e `.quoteform_calculation`-a bağlıdır), `.quoteform_calculation__head`, `.quoteform_calculation__key`.

- [ ] **Step 1: Write the failing test**

`tests/js/admin/CalculationCards.test.js` — `CalculationsPanel.test.js`-dəki render köməkçisini kopyala, sonra:

```js
const visibleText = ( label ) =>
	Array.from( label.childNodes )
		.filter( ( node ) => ! ( node.classList && node.classList.contains( 'screen-reader-text' ) ) )
		.map( ( node ) => node.textContent )
		.join( '' );

const visibleLabelOf = ( name ) => {
	const control = screen.getByLabelText( name );

	return visibleText( document.querySelector( `label[for="${ control.id }"]` ) );
};

describe( 'calculation cards', () => {
	it( 'shows short labels for key, label and formula', async () => {
		await renderWithTotal(); // köməkçinin real adı ilə əvəz et

		expect( visibleLabelOf( 'Calculation 1 key' ) ).toBe( 'key' );
		expect( visibleLabelOf( 'Calculation 1 label' ) ).toBe( 'label' );
		expect( visibleLabelOf( 'Calculation 1 formula' ) ).toBe( 'formula' );
	} );

	it( 'keeps the whole visibility label, since a short one would not be part of its name', async () => {
		await renderWithTotal();

		expect( visibleLabelOf( 'Show calculation 1 to the visitor' ) ).toBe( 'Show calculation 1 to the visitor' );
	} );

	it( 'shows the key as a formula token in the card header', async () => {
		await renderWithTotal();

		expect( document.querySelector( '.quoteform_calculation__key' ) ).toHaveTextContent( '{total}' );
	} );
} );
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/js/admin/CalculationCards.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`CalculationsPanel.js`:
- `import Button from '../components/Button';`
- Başlıq:

```jsx
			<div className="quoteform_panel__head">
				<div>
					<h2 id="quoteform_calculations-heading">{ __( 'Calculations', 'quoteform' ) }</h2>
					<p className="quoteform_panel__intro">
						{ __( 'They run top to bottom, so a later one can use an earlier one’s key.', 'quoteform' ) }
					</p>
				</div>
				<Button ref={ addButtonRef } onClick={ () => dispatch( addCalculation() ) }>
					{ __( 'Add calculation', 'quoteform' ) }
				</Button>
			</div>
```

  İki `Notice` (total yoxdur, dövr) başlıqdan **sonra** qalır, "Add calculation" düyməsinin köhnə yeri silinir (yuxarıya köçüb). Diqqət: bu, DOM sırasını dəyişir (Add düyməsi notice-lərdən əvvələ keçir). Bu qəbul ediləndir: notice-lər fokuslanan element deyil, Tab sırası dəyişmir.
- Hər kart:

```jsx
					<div className="quoteform_calculation quoteform_card" key={ index }>
						<div className="quoteform_calculation__head" aria-hidden="true">
							<span className="quoteform_step__number">{ number }</span>
							<span className="quoteform_calculation__name">{ calculation.label || calculation.key }</span>
							{ calculation.key && (
								<code className="quoteform_calculation__key">{ `{${ calculation.key }}` }</code>
							) }
						</div>

						<div className="quoteform_calculation__pair">
							<TextControl
								id={ `quoteform_calc-${ index }-key` }
								label={ sprintf(
									/* translators: %d: calculation number. */
									__( 'Calculation %d key', 'quoteform' ),
									number
								) }
								visibleLabel={ __( 'Key', 'quoteform' ) }
								value={ calculation.key }
								onChange={ ( value ) => dispatch( updateCalculation( index, { key: value } ) ) }
								errors={ at( 'key' ) }
							/>

							{ collidesWithField && (
								<p className="quoteform_warning">
									{ __( 'That key is already used by a field.', 'quoteform' ) }
								</p>
							) }

							{ collidesWithCalculation && (
								<p className="quoteform_warning">
									{ __( 'Two calculations cannot share a key.', 'quoteform' ) }
								</p>
							) }

							<TextControl
								id={ `quoteform_calc-${ index }-label` }
								label={ sprintf(
									/* translators: %d: calculation number. */
									__( 'Calculation %d label', 'quoteform' ),
									number
								) }
								visibleLabel={ __( 'Label', 'quoteform' ) }
								value={ calculation.label }
								onChange={ ( value ) => dispatch( updateCalculation( index, { label: value } ) ) }
								errors={ at( 'label' ) }
							/>
						</div>

						<FormulaEditor
							id={ `quoteform_calc-${ index }-expression` }
							label={ sprintf(
								/* translators: %d: calculation number. */
								__( 'Calculation %d formula', 'quoteform' ),
								number
							) }
							visibleLabel={ __( 'Formula', 'quoteform' ) }
							value={ calculation.expression }
							onChange={ ( value ) => dispatch( updateCalculation( index, { expression: value } ) ) }
							knownVariables={ known.filter( ( name ) => name !== calculation.key ) }
							priceVariables={ priceFieldKeys }
							errors={ at( 'expression' ) }
						/>

						<ToggleControl
							id={ `quoteform_calc-${ index }-visible` }
							label={ sprintf(
								/* translators: %d: calculation number. */
								__( 'Show calculation %d to the visitor', 'quoteform' ),
								number
							) }
							checked={ calculation.visible }
							onChange={ ( value ) => dispatch( updateCalculation( index, { visible: value } ) ) }
							errors={ at( 'visible' ) }
						/>

						<div className="quoteform_step__tools">
							<MoveButtons
								label={ calculationName }
								onMoveUp={ () => handleMove( index, 'up' ) }
								onMoveDown={ () => handleMove( index, 'down' ) }
								canMoveUp={ index > 0 }
								canMoveDown={ index < calculations.length - 1 }
								{ ...moveFocus.refsFor( index ) }
							/>

							<Button
								variant="danger"
								ref={ ( node ) => {
									removeButtonRefs.current[ index ] = node;
								} }
								onClick={ () => setConfirming( index ) }
								aria-label={ removeLabel }
							>
								{ __( 'Remove', 'quoteform' ) }
							</Button>
						</div>
```

  Diqqət: bu blok mövcud koddakı **DOM sırasını** saxlayır: key → iki warning → label → formula → toggle → move → remove → confirm.
- Təsdiq bloku:

```jsx
						{ confirming === index && (
							<span className="quoteform_confirm">
								<span>
									{ sprintf(
										/* translators: %s: calculation key, or its row number while the key is still empty. */
										__( 'Remove “%s”? Anything using it will stop working.', 'quoteform' ),
										calculationName
									) }
								</span>
								<Button
									variant="danger"
									ref={ confirmButtonRef }
									onClick={ () => {
										setConfirming( null );
										dispatch( removeCalculation( index ) );
										addButtonRef.current?.focus();
									} }
								>
									{ sprintf(
										/* translators: %s: calculation key, or its row number while the key is still empty. */
										__( 'Yes, remove %s', 'quoteform' ),
										calculationName
									) }
								</Button>
								<Button
									onClick={ () => {
										setConfirming( null );
										removeButtonRefs.current[ index ]?.focus();
									} }
								>
									{ sprintf(
										/* translators: %s: calculation key, or its row number while the key is still empty. */
										__( 'Keep %s', 'quoteform' ),
										calculationName
									) }
								</Button>
							</span>
						) }
```

- [ ] **Step 4: Styles**

`_panels.scss`-ə əlavə et:

```scss
// --- Pricing ------------------------------------------------------------------

.quoteform_builder .quoteform_calculation {
	display: grid;
	gap: 12px;
}

.quoteform_builder .quoteform_calculation__head {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
}

.quoteform_builder .quoteform_calculation__key {
	padding: 1px 6px;
	font-size: 12px;
	font-weight: 400;
	color: var( --qf-muted );
	background: var( --qf-subtle );
	border-radius: 4px;
}

.quoteform_builder .quoteform_calculation__pair {
	display: grid;
	grid-template-columns: minmax( 0, 1fr ) minmax( 0, 1fr );
	gap: 8px 12px;

	> .quoteform_warning {
		grid-column: 1 / -1;
	}
}

@media ( max-width: 782px ) {
	.quoteform_builder .quoteform_calculation__pair {
		grid-template-columns: minmax( 0, 1fr );
	}
}

.quoteform_builder .quoteform_formula {
	display: grid;
	gap: 4px;

	> label {
		font-size: 12px;
		font-weight: 600;
	}
}

.quoteform_builder .quoteform_formula__input {
	width: 100%;
	min-height: 56px;
	padding: 8px 10px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 13px;
	background: var( --qf-subtle );
	border: 1px solid var( --qf-field );
	border-radius: var( --qf-control-radius );

	&:focus {
		background: var( --qf-surface );
		border-color: var( --qf-accent );
		outline: 1px solid var( --qf-accent );
		box-shadow: none;
	}

	&[aria-invalid="true"] {
		border-color: var( --qf-danger );
	}
}

.quoteform_builder .quoteform_formula__verdict {
	margin: 0;
	font-size: 12px;

	&.is-valid {
		color: var( --qf-success );
	}

	&.is-invalid {
		color: var( --qf-danger );
	}
}

.quoteform_builder .quoteform_formula__help {
	font-size: 12px;
	color: var( --qf-muted );

	summary {
		color: var( --qf-accent );
		cursor: pointer;
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		margin: 0;
		padding: 1px 6px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		background: var( --qf-subtle );
		border-radius: 4px;
	}
}
```

Qeyd: `is-valid`/`is-invalid` — `FormulaEditor`-da `verdict.status` dəyərlərinə bax (`grep -n "status:" admin-src/panels/FormulaEditor.js`); fərqlidirsə, selektorları o dəyərlərlə yaz.

- [ ] **Step 5: Run tests and build**

Run: `npm run build && npx jest tests/js/admin/CalculationCards.test.js && npx jest --selectProjects admin`
Expected: PASS.

---

### Task 8: Rules paneli — cümlə sətri

**Files:**
- Modify: `admin-src/panels/RulesPanel.js:91-303`, `admin-src/panels/RuleConditionRow.js`
- Modify: `admin-src/styles/_panels.scss`
- Test: `tests/js/admin/RuleSentence.test.js`

**Interfaces:**
- Consumes: `Button`, `SelectControl`/`TextControl` `hideLabel`.
- Produces: `RuleConditionRow` yeni prop `match: 'all' | 'any'` (bağlayıcı "and"/"or" üçün). `.quoteform_rule__sentence`, `.quoteform_rule__word`.

- [ ] **Step 1: Check the match values**

Run: `grep -n "MATCH_MODES" -A6 admin-src/state/rules.js`
`MATCH_MODES`-in `value`-larını qeyd et (gözlənilən: `'all'`, `'any'`). Aşağıdakı kod bu iki dəyəri istifadə edir; fərqlidirsə, onları əvəz et.

- [ ] **Step 2: Write the failing test**

`tests/js/admin/RuleSentence.test.js` — `RulesPanel.test.js`-in render köməkçisini kopyala (bir qaydası və iki şərti olan forma ilə). Sonra:

```js
describe( 'the rule sentence', () => {
	it( 'keeps every select findable by its full name', async () => {
		await renderWithRule();

		for ( const name of [ 'Rule 1 target kind', 'Rule 1 target', 'Rule 1 action', 'Rule 1 match' ] ) {
			expect( screen.getByLabelText( name ) ).toBeInTheDocument();
		}
	} );

	it( 'hides those labels, because the sentence is their context', async () => {
		await renderWithRule();

		const action = screen.getByLabelText( 'Rule 1 action' );

		expect( document.querySelector( `label[for="${ action.id }"]` ) ).toHaveClass( 'screen-reader-text' );
	} );

	it( 'keeps the selects in their old order', async () => {
		await renderWithRule();

		const ids = Array.from( document.querySelectorAll( '.quoteform_rule__sentence select' ) ).map( ( el ) => el.id );

		expect( ids ).toEqual( [
			'quoteform_rule-0-target-kind',
			'quoteform_rule-0-target',
			'quoteform_rule-0-action',
			'quoteform_rule-0-match',
		] );
	} );

	it( 'joins conditions with the word that matches the rule', async () => {
		await renderWithRule(); // match: 'all', iki şərt

		const words = Array.from( document.querySelectorAll( '.quoteform_rule-condition .quoteform_rule__word' ) ).map(
			( el ) => el.textContent
		);

		expect( words ).toEqual( [ 'if', 'and' ] );
	} );

	it( 'keeps the condition controls named in full', async () => {
		await renderWithRule();

		expect( screen.getByLabelText( 'Rule 1 condition 2 operator' ) ).toBeInTheDocument();
	} );
} );
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest tests/js/admin/RuleSentence.test.js`
Expected: FAIL.

- [ ] **Step 4: Implement**

`RulesPanel.js`:
- `import Button from '../components/Button';`
- Başlıq:

```jsx
			<div className="quoteform_panel__head">
				<div>
					<h2 id="quoteform_rules-heading">{ __( 'Rules', 'quoteform' ) }</h2>
					<p className="quoteform_panel__intro">
						{ __( 'Show or hide a field or a whole step.', 'quoteform' ) }
					</p>
				</div>
				<Button ref={ addRuleButtonRef } onClick={ () => dispatch( addRule() ) }>
					{ __( 'Add rule', 'quoteform' ) }
				</Button>
			</div>
```

- Boş mətn `<p>` → `<p className="quoteform_card quoteform_empty">`.
- Hər qayda `div.quoteform_rule.quoteform_card`. Dörd select-in sırası dəyişmir; aralarındakı `FieldError`-lar da yerində qalır. Cümlə:

```jsx
						<div className="quoteform_rule__sentence">
							<SelectControl
								id={ `quoteform_rule-${ index }-target-kind` }
								label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Rule %d target kind', 'quoteform' ),
									number
								) }
								hideLabel
								value={ rule.target.kind }
								onChange={ ( value ) =>
									dispatch( updateRule( index, { target: { kind: value, key: '' } } ) )
								}
								options={ TARGET_KINDS }
								errors={ at( 'target.kind' ) }
							/>

							<FieldError id={ `quoteform_rule-${ index }-target-error` } errors={ targetErrors } />

							<SelectControl
								id={ `quoteform_rule-${ index }-target` }
								label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Rule %d target', 'quoteform' ),
									number
								) }
								hideLabel
								value={ rule.target.key }
								onChange={ ( value ) =>
									dispatch(
										updateRule( index, { target: { kind: rule.target.kind, key: value } } )
									)
								}
								options={ targetOptions }
								placeholder={ targetPlaceholder }
								errors={ at( 'target.key' ) }
							/>

							<span className="quoteform_rule__word" aria-hidden="true">
								→
							</span>

							<SelectControl
								id={ `quoteform_rule-${ index }-action` }
								label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Rule %d action', 'quoteform' ),
									number
								) }
								hideLabel
								value={ rule.action }
								onChange={ ( value ) => dispatch( updateRule( index, { action: value } ) ) }
								options={ actionOptions }
								errors={ at( 'action' ) }
							/>

							<span className="quoteform_rule__word" aria-hidden="true">
								{ __( 'when', 'quoteform' ) }
							</span>

							<SelectControl
								id={ `quoteform_rule-${ index }-match` }
								label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Rule %d match', 'quoteform' ),
									number
								) }
								hideLabel
								value={ rule.match }
								onChange={ ( value ) => dispatch( updateRule( index, { match: value } ) ) }
								options={ MATCH_MODES }
								errors={ at( 'match' ) }
							/>
						</div>
```

  Birinci `FieldError` (`quoteform_rule-${ index }-error`) cümlədən əvvəl, `selfReferencing` xəbərdarlığı və `conditions-error` FieldError-u cümlədən sonra, yerlərində qalır.
- `RuleConditionRow` çağırışına bir prop əlavə et: `match={ rule.match }` (qalan prop-lar eyni).
- Son iki düymə:

```jsx
						<div className="quoteform_step__tools">
							<Button
								variant="ghost"
								ref={ ( node ) => {
									addConditionButtonRefs.current[ index ] = node;
								} }
								onClick={ () => dispatch( addCondition( index ) ) }
								aria-label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Add condition to rule %d', 'quoteform' ),
									number
								) }
							>
								{ __( 'Add condition', 'quoteform' ) }
							</Button>

							<Button
								variant="danger"
								ref={ ( node ) => {
									removeButtonRefs.current[ `rule-${ index }` ] = node;
								} }
								onClick={ () => setConfirming( { type: 'rule', index } ) }
								aria-label={ sprintf(
									/* translators: %d: rule number. */
									__( 'Remove rule %d', 'quoteform' ),
									number
								) }
							>
								{ __( 'Remove rule', 'quoteform' ) }
							</Button>
						</div>
```

  `RemoveConfirm` bloku dəyişmir.

`RuleConditionRow.js`:
- props-a `match` əlavə et.
- `div.quoteform_rule-condition`-un ilk uşağı olaraq (FieldError-dan sonra) bağlayıcı:

```jsx
			<span className="quoteform_rule__word" aria-hidden="true">
				{ conditionIndex === 0
					? __( 'if', 'quoteform' )
					: match === 'any'
					? __( 'or', 'quoteform' )
					: __( 'and', 'quoteform' ) }
			</span>
```

- Üç control-un (`-field` SelectControl, `-operator` SelectControl, `-value` TextControl) hər birinə yalnız `hideLabel` prop-u əlavə et; qalan prop-lar olduğu kimi.
- `import Button from '../components/Button';` və "Remove condition" düyməsi:

```jsx
			<Button
				variant="danger"
				ref={ removeButtonRef }
				disabled={ disableRemove }
				onClick={ onRequestRemove }
				aria-label={ removeLabel }
			>
				{ __( 'Remove condition', 'quoteform' ) }
			</Button>
```

`admin-src/components/RemoveConfirm.js` — `return` bloku (`import Button from './Button';`):

```jsx
		<span className="quoteform_confirm">
			<span>{ message }</span>
			<Button variant="danger" ref={ confirmButtonRef } onClick={ onConfirm }>
				{ confirmLabel }
			</Button>
			<Button onClick={ onCancel }>{ cancelLabel }</Button>
		</span>
```

- [ ] **Step 5: Styles**

`_panels.scss`-ə əlavə et:

```scss
// --- Rules --------------------------------------------------------------------

.quoteform_builder .quoteform_rule {
	display: grid;
	gap: 10px;
}

.quoteform_builder .quoteform_rule__sentence,
.quoteform_builder .quoteform_rule-condition {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 8px;

	.quoteform_control {
		flex: 0 1 auto;
		min-width: 140px;
	}

	.quoteform_field-error,
	.quoteform_confirm {
		flex-basis: 100%;
	}
}

.quoteform_builder .quoteform_rule-condition {
	padding: 6px 8px;
	background: var( --qf-subtle );
	border-radius: var( --qf-control-radius );
}

.quoteform_builder .quoteform_rule__word {
	min-width: 24px;
	font-size: 12px;
	color: var( --qf-muted );
}
```

- [ ] **Step 6: Run tests and build**

Run: `npm run build && npx jest tests/js/admin/RuleSentence.test.js && npx jest --selectProjects admin`
Expected: PASS.

---

### Task 9: Settings — üç kart

**Files:**
- Modify: `admin-src/panels/SettingsPanel.js:23-116`
- Modify: `admin-src/styles/_panels.scss`
- Test: `tests/js/admin/SettingsGroups.test.js`

**Interfaces:**
- Consumes: `Card`.
- Produces: `.quoteform_settings-group`, `.quoteform_settings-group__row`.

- [ ] **Step 1: Write the failing test**

`tests/js/admin/SettingsGroups.test.js` — `SettingsPanel.test.js`-in `settings`, `Harness` və `load` köməkçilərini kopyala. Sonra:

```js
describe( 'settings groups', () => {
	it( 'groups the settings under three headings', async () => {
		await renderLoaded(); // SettingsPanel.test.js-dəki yükləmə axını

		for ( const name of [ 'Money', 'After submitting', 'Visitors' ] ) {
			expect( screen.getByRole( 'heading', { name } ) ).toBeInTheDocument();
		}
	} );

	it( 'puts each control under its heading', async () => {
		await renderLoaded();

		const money = screen.getByRole( 'heading', { name: 'Money' } ).closest( '.quoteform_settings-group' );
		const visitors = screen.getByRole( 'heading', { name: 'Visitors' } ).closest( '.quoteform_settings-group' );

		expect( money ).toContainElement( screen.getByLabelText( 'Currency' ) );
		expect( money ).toContainElement( screen.getByLabelText( 'Decimal places' ) );
		expect( visitors ).toContainElement( screen.getByLabelText( 'Let visitors save and resume' ) );
	} );

	it( 'keeps the success action a select', async () => {
		await renderLoaded();

		expect( screen.getByRole( 'combobox', { name: 'After a successful submission' } ) ).toBeInTheDocument();
	} );
} );
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/js/admin/SettingsGroups.test.js`
Expected: FAIL — heading "Money" tapılmır.

- [ ] **Step 3: Implement**

`SettingsPanel.js` — `import Card from '../components/Card';`. Control-ların sırası və prop-ları dəyişmir; `return` blokunu tamamilə bununla əvəz et:

```jsx
	return (
		<section className="quoteform_panel" aria-labelledby="quoteform_settings-heading">
			<div className="quoteform_panel__head">
				<h2 id="quoteform_settings-heading">{ __( 'Settings', 'quoteform' ) }</h2>
			</div>

			<Card className="quoteform_settings-group">
				<h3>{ __( 'Money', 'quoteform' ) }</h3>
				<div className="quoteform_settings-group__row">
					<TextControl
						id="quoteform_currency"
						label={ __( 'Currency', 'quoteform' ) }
						value={ settings.currency }
						onChange={ change( 'currency' ) }
						errors={ errors( 'currency' ) }
						help={ __( 'A three-letter code such as USD or EUR.', 'quoteform' ) }
					/>

					<SelectControl
						id="quoteform_currency-position"
						label={ __( 'Currency position', 'quoteform' ) }
						value={ settings.currency_position }
						onChange={ change( 'currency_position' ) }
						errors={ errors( 'currency_position' ) }
						options={ [
							{ value: 'before', label: __( 'Before the number', 'quoteform' ) },
							{ value: 'after', label: __( 'After the number', 'quoteform' ) },
						] }
					/>

					<NumberControl
						id="quoteform_decimals"
						label={ __( 'Decimal places', 'quoteform' ) }
						value={ settings.decimals }
						onChange={ change( 'decimals' ) }
						errors={ errors( 'decimals' ) }
						min={ 0 }
						max={ 6 }
						step={ 1 }
					/>
				</div>
			</Card>

			<Card className="quoteform_settings-group">
				<h3>{ __( 'After submitting', 'quoteform' ) }</h3>

				<TextControl
					id="quoteform_submit-label"
					label={ __( 'Submit button label', 'quoteform' ) }
					value={ settings.submit_label }
					onChange={ change( 'submit_label' ) }
					errors={ errors( 'submit_label' ) }
				/>

				<SelectControl
					id="quoteform_success-action"
					label={ __( 'After a successful submission', 'quoteform' ) }
					value={ settings.success_action }
					onChange={ change( 'success_action' ) }
					errors={ errors( 'success_action' ) }
					options={ [
						{ value: 'message', label: __( 'Show a message', 'quoteform' ) },
						{ value: 'redirect', label: __( 'Redirect to a URL', 'quoteform' ) },
					] }
				/>

				{ settings.success_action === 'redirect' ? (
					<TextControl
						id="quoteform_redirect-url"
						label={ __( 'Redirect URL', 'quoteform' ) }
						value={ settings.redirect_url }
						onChange={ change( 'redirect_url' ) }
						errors={ errors( 'redirect_url' ) }
						help={ __( 'Must start with http:// or https://.', 'quoteform' ) }
					/>
				) : (
					<TextControl
						id="quoteform_success-message"
						label={ __( 'Success message', 'quoteform' ) }
						value={ settings.success_message }
						onChange={ change( 'success_message' ) }
						errors={ errors( 'success_message' ) }
						multiline
					/>
				) }
			</Card>

			<Card className="quoteform_settings-group">
				<h3>{ __( 'Visitors', 'quoteform' ) }</h3>

				<ToggleControl
					id="quoteform_save-resume"
					label={ __( 'Let visitors save and resume', 'quoteform' ) }
					checked={ settings.save_resume }
					onChange={ change( 'save_resume' ) }
					errors={ errors( 'save_resume' ) }
				/>

				<ToggleControl
					id="quoteform_store-ip"
					label={ __( 'Store the visitor’s IP address with each entry', 'quoteform' ) }
					checked={ settings.store_ip }
					onChange={ change( 'store_ip' ) }
					errors={ errors( 'store_ip' ) }
				/>
			</Card>
		</section>
	);
```

Bu, mövcud faylın `return`-u ilə sətir-sətir müqayisə edilməlidir: yeni olan yalnız `panel__head` div-i, üç `Card`, üç `h3` və `settings-group__row` div-idir.

- [ ] **Step 4: Styles**

```scss
// --- Settings -----------------------------------------------------------------

.quoteform_builder .quoteform_settings-group {
	display: grid;
	gap: 12px;

	h3 {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: var( --qf-muted );
		text-transform: uppercase;
	}
}

.quoteform_builder .quoteform_settings-group__row {
	display: grid;
	grid-template-columns: repeat( 3, minmax( 0, 1fr ) );
	gap: 12px;
}

@media ( max-width: 782px ) {
	.quoteform_builder .quoteform_settings-group__row {
		grid-template-columns: minmax( 0, 1fr );
	}
}
```

- [ ] **Step 5: Run tests and build**

Run: `npm run build && npx jest tests/js/admin/SettingsGroups.test.js && npx jest --selectProjects admin`
Expected: PASS.

---

### Task 10: Formalar siyahısı — tarix, shortcode, kart

**Files:**
- Create: `admin-src/lib/dates.js`, `admin-src/components/CopyField.js`, `admin-src/styles/_list.scss`
- Modify: `admin-src/screens/FormListScreen.js:111-246`, `admin-src/style.scss`
- Test: `tests/js/admin/dates.test.js`, `tests/js/admin/CopyField.test.js`, `tests/js/admin/FormListLayout.test.js`

**Interfaces:**
- Produces: `formatModified( raw: unknown, locale?: string ) → string` — ISO-nu `Intl.DateTimeFormat( locale, { dateStyle: 'medium', timeStyle: 'short' } )` ilə formatlayır; parse olunmursa `String( raw ?? '' )`.
- Produces: `shortcodeFor( id: number ) → string` — `[quoteform id="N"]` (eyni faylda, `admin-src/lib/dates.js` yox — `admin-src/lib/shortcode.js`).
- Produces: `CopyField` — props `{ id, value, label }`.

- [ ] **Step 1: Write the failing tests**

`tests/js/admin/dates.test.js`:

```js
import { formatModified } from '../../../admin-src/lib/dates';
import { shortcodeFor } from '../../../admin-src/lib/shortcode';

describe( 'formatModified', () => {
	it( 'turns the REST timestamp into a readable date', () => {
		const text = formatModified( '2026-09-16T15:28:58', 'en-GB' );

		expect( text ).toContain( '2026' );
		expect( text ).toContain( '15:28' );
		expect( text ).not.toContain( 'T' );
	} );

	it( 'gives back what it could not read, instead of "Invalid Date"', () => {
		expect( formatModified( 'garbage', 'en-GB' ) ).toBe( 'garbage' );
		expect( formatModified( '', 'en-GB' ) ).toBe( '' );
		expect( formatModified( null, 'en-GB' ) ).toBe( '' );
		expect( formatModified( undefined, 'en-GB' ) ).toBe( '' );
	} );

	it( 'falls back to the browser locale for a locale it does not know', () => {
		expect( () => formatModified( '2026-09-16T15:28:58', 'not a locale!!' ) ).not.toThrow();
	} );
} );

describe( 'shortcodeFor', () => {
	it( 'builds the shortcode a page needs', () => {
		expect( shortcodeFor( 328 ) ).toBe( '[quoteform id="328"]' );
	} );
} );
```

`tests/js/admin/CopyField.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CopyField from '../../../admin-src/components/CopyField';

const renderField = () =>
	render( <CopyField id="sc-1" value='[quoteform id="1"]' label="Shortcode for “Cleaning”" /> );

afterEach( () => {
	delete navigator.clipboard;
} );

describe( 'CopyField', () => {
	it( 'shows the value in a read-only box named for what it is', () => {
		renderField();

		const box = screen.getByRole( 'textbox', { name: 'Shortcode for “Cleaning”' } );

		expect( box ).toHaveValue( '[quoteform id="1"]' );
		expect( box ).toHaveAttribute( 'readonly' );
	} );

	it( 'copies and says so when the clipboard works', async () => {
		const writeText = jest.fn().mockResolvedValue( undefined );

		Object.defineProperty( navigator, 'clipboard', { value: { writeText }, configurable: true } );
		renderField();

		await userEvent.click( screen.getByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } ) );

		expect( writeText ).toHaveBeenCalledWith( '[quoteform id="1"]' );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Copied.' );
	} );

	it( 'selects the text and tells you how to copy when there is no clipboard', async () => {
		renderField();

		await userEvent.click( screen.getByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } ) );

		const box = screen.getByRole( 'textbox' );

		expect( box.selectionStart ).toBe( 0 );
		expect( box.selectionEnd ).toBe( box.value.length );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( /to copy\.$/ );
		expect( screen.getByRole( 'status' ) ).not.toHaveTextContent( 'Copied.' );
	} );

	it( 'does not claim success when the clipboard refuses', async () => {
		const writeText = jest.fn().mockRejectedValue( new Error( 'denied' ) );

		Object.defineProperty( navigator, 'clipboard', { value: { writeText }, configurable: true } );
		renderField();

		await userEvent.click( screen.getByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } ) );

		expect( screen.getByRole( 'status' ) ).not.toHaveTextContent( 'Copied.' );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( /to copy\.$/ );
	} );

	it( 'clears the message after a moment', async () => {
		jest.useFakeTimers();

		const writeText = jest.fn().mockResolvedValue( undefined );

		Object.defineProperty( navigator, 'clipboard', { value: { writeText }, configurable: true } );
		renderField();

		const user = userEvent.setup( { advanceTimers: jest.advanceTimersByTime } );

		await user.click( screen.getByRole( 'button', { name: 'Copy shortcode for “Cleaning”' } ) );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Copied.' );

		act( () => {
			jest.advanceTimersByTime( 2000 );
		} );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( '' );

		jest.useRealTimers();
	} );
} );
```

`tests/js/admin/FormListLayout.test.js` — `FormListScreen.test.js`-in `listForms` mock-unu kopyala (bir forma: `{ id: 328, title: 'Cleaning', modified: '2026-09-16T15:28:58' }`), sonra:

```js
describe( 'the form list layout', () => {
	it( 'offers the shortcode for each form', async () => {
		await renderList();

		expect( await screen.findByRole( 'textbox', { name: 'Shortcode for “Cleaning”' } ) ).toHaveValue(
			'[quoteform id="328"]'
		);
	} );

	it( 'shows a readable date, not the raw timestamp', async () => {
		await renderList();
		await screen.findByText( 'Cleaning' );

		expect( screen.queryByText( '2026-09-16T15:28:58' ) ).not.toBeInTheDocument();
	} );

	it( 'shows the form id under its title', async () => {
		await renderList();

		expect( await screen.findByText( 'ID 328' ) ).toBeInTheDocument();
	} );
} );
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/js/admin/dates.test.js tests/js/admin/CopyField.test.js tests/js/admin/FormListLayout.test.js`
Expected: FAIL — modullar yoxdur.

- [ ] **Step 3: Implement the helpers**

`admin-src/lib/dates.js`:

```js
function formatterFor( locale ) {
	const options = { dateStyle: 'medium', timeStyle: 'short' };

	try {
		return new Intl.DateTimeFormat( locale || undefined, options );
	} catch ( error ) {
		// Tanınmayan locale teqi (`RangeError`) — brauzerin öz dilinə düş.
		return new Intl.DateTimeFormat( undefined, options );
	}
}

/**
 * REST `modified`-i oxunaqlı tarixə çevirir. Oxuya bilmədiyini olduğu kimi
 * qaytarır: "Invalid Date" yazmaqdansa xam dəyəri göstərmək yaxşıdır.
 */
export function formatModified( raw, locale ) {
	if ( typeof raw !== 'string' || raw === '' ) {
		return raw === null || raw === undefined ? '' : String( raw );
	}

	const date = new Date( raw );

	if ( Number.isNaN( date.getTime() ) ) {
		return raw;
	}

	return formatterFor( locale ).format( date );
}
```

`admin-src/lib/shortcode.js`:

```js
export function shortcodeFor( id ) {
	return `[quoteform id="${ Number( id ) }"]`;
}
```

`admin-src/components/CopyField.js`:

```js
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import Button from './Button';

const CLEAR_AFTER_MS = 1500;

function copyHint() {
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test( navigator.platform || '' );

	return mac ? __( 'Press ⌘C to copy.', 'quoteform' ) : __( 'Press Ctrl+C to copy.', 'quoteform' );
}

/**
 * Clipboard API yalnız təhlükəsiz kontekstdə (HTTPS, localhost) var. HTTP
 * saytda və ya icazə rədd ediləndə mətn seçilir və istifadəçiyə qısayol
 * deyilir — "Copied." heç vaxt yalandan deyilmir.
 */
export default function CopyField( { id, value, label } ) {
	const inputRef = useRef( null );
	const [ message, setMessage ] = useState( '' );

	useEffect( () => {
		if ( message === '' ) {
			return undefined;
		}

		const timer = setTimeout( () => setMessage( '' ), CLEAR_AFTER_MS );

		return () => clearTimeout( timer );
	}, [ message ] );

	function selectAll() {
		inputRef.current?.focus();
		inputRef.current?.select();
	}

	async function handleCopy() {
		const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;

		if ( clipboard && typeof clipboard.writeText === 'function' ) {
			try {
				await clipboard.writeText( value );
				setMessage( __( 'Copied.', 'quoteform' ) );

				return;
			} catch ( error ) {
				// İcazə yoxdur — aşağıdakı əl ilə yola düş.
			}
		}

		selectAll();
		setMessage( copyHint() );
	}

	return (
		<div className="quoteform_copy">
			<label htmlFor={ id } className="screen-reader-text" data-quoteform-hidden-label="">
				{ label }
			</label>
			<input
				id={ id }
				ref={ inputRef }
				type="text"
				className="quoteform_copy__value"
				value={ value }
				readOnly
				onFocus={ ( event ) => event.target.select() }
			/>
			<Button
				variant="ghost"
				onClick={ handleCopy }
				aria-label={ sprintf(
					/* translators: %s: what is being copied, e.g. “Shortcode for “Cleaning””. */
					__( 'Copy %s', 'quoteform' ),
					label.charAt( 0 ).toLowerCase() + label.slice( 1 )
				) }
			>
				{ __( 'Copy', 'quoteform' ) }
			</Button>
			<span className="quoteform_copy__status" role="status">
				{ message }
			</span>
		</div>
	);
}
```

Qeyd: düymənin adı "Copy shortcode for “Cleaning”" — görünən "Copy" sözü adın içindədir (WCAG 2.5.3).
Qeyd 2: `CopyField`-in `<label>`-i qəsdən gizlidir (sütun başlığı "Shortcode" görünən kontekstdir) və `data-quoteform-hidden-label` daşıyır — spec §5.6-dakı üçüncü icazəli yer.

- [ ] **Step 4: Rework the list screen**

`FormListScreen.js`:
- Importlar: `Button`, `Card`, `CopyField`, `formatModified` (`../lib/dates`), `shortcodeFor` (`../lib/shortcode`).
- Başlıq:

```jsx
			<div className="quoteform_list__header">
				<h1 ref={ headingRef } tabIndex={ -1 }>
					{ __( 'Quoteform', 'quoteform' ) }
				</h1>
				<Button variant="primary" ref={ createButtonRef } onClick={ handleCreate } disabled={ busy }>
					{ __( 'Create a form', 'quoteform' ) }
				</Button>
			</div>
```

- "Try again" → `<Button onClick={ load }>`.
- Yükləmə: `<p className="quoteform_card quoteform_empty">`.
- Boş vəziyyət:

```jsx
				<Card className="quoteform_empty">
					<span className="dashicons dashicons-calculator" aria-hidden="true" />
					<p>{ __( 'No forms yet. Create your first one.', 'quoteform' ) }</p>
				</Card>
```

  (mətn eynidir; mövcud testlər onu `getByText` ilə tapır.)
- Cədvəl `Card`-ın içində; sütunlar: Form, Shortcode, Last modified, Actions. Hər sətir:

```jsx
								<tr key={ form.id }>
									<td>
										<strong className="quoteform_list__title">{ form.title }</strong>
										<span className="quoteform_list__id">
											{ sprintf(
												/* translators: %d: form id. */
												__( 'ID %d', 'quoteform' ),
												form.id
											) }
										</span>
									</td>
									<td>
										<CopyField
											id={ `quoteform_shortcode-${ form.id }` }
											value={ shortcodeFor( form.id ) }
											label={ sprintf(
												/* translators: %s: form title. */
												__( 'Shortcode for “%s”', 'quoteform' ),
												form.title
											) }
										/>
									</td>
									<td>
										<time dateTime={ form.modified }>
											{ formatModified( form.modified, document.documentElement.lang ) }
										</time>
									</td>
									<td className="quoteform_list__actions">
										<Button
											onClick={ () => onOpen( form.id ) }
											aria-label={ sprintf(
												/* translators: 1: form title, 2: form id. */
												__( 'Edit “%1$s” (form %2$d)', 'quoteform' ),
												form.title,
												form.id
											) }
										>
											{ __( 'Edit', 'quoteform' ) }
										</Button>
										<Button
											variant="danger"
											ref={ ( el ) => {
												trashButtonRefs.current[ form.id ] = el;
											} }
											onClick={ () => setConfirming( form ) }
											disabled={ busy }
											aria-label={ sprintf(
												/* translators: 1: form title, 2: form id. */
												__( 'Move “%1$s” to trash (form %2$d)', 'quoteform' ),
												form.title,
												form.id
											) }
										>
											{ __( 'Trash', 'quoteform' ) }
										</Button>
										{ confirming && confirming.id === form.id && (
											<span className="quoteform_confirm">
												<span>
													{ sprintf(
														/* translators: %s: form title. */
														__( 'Move “%s” to the trash?', 'quoteform' ),
														confirming.title
													) }
												</span>
												<Button
													variant="danger"
													ref={ confirmButtonRef }
													onClick={ () => handleDelete( confirming ) }
												>
													{ __( 'Move to trash', 'quoteform' ) }
												</Button>
												<Button onClick={ () => handleCancelDelete( confirming ) }>
													{ __( 'Cancel', 'quoteform' ) }
												</Button>
											</span>
										) }
									</td>
								</tr>
```

  `thead`-ə `<th scope="col">{ __( 'Shortcode', 'quoteform' ) }</th>` əlavə et (Form-dan sonra).
  Diqqət: `form.title` indi `<strong>`-dadır — `getByText( 'Cleaning' )` yenə tapır.
  Diqqət 2: `FormListScreen.test.js:571` `closest( 'tr' )` işlədir — sətir hələ də `tr`-dir.
- Səhifələmə: `nav.quoteform_list__pages` və düymələr dəyişmir (yalnız CSS).

- [ ] **Step 5: Styles**

`admin-src/styles/_list.scss`:

```scss
.quoteform_builder .quoteform_list__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin: 8px 0 16px;

	h1 {
		margin: 0;
		padding: 0;
		font-size: 23px;
		font-weight: 400;
	}
}

.quoteform_builder .quoteform_list .quoteform_card:has( > .quoteform_list__table ) {
	padding: 0;
	overflow-x: auto;
}

.quoteform_builder .quoteform_list__table {
	width: 100%;
	border-collapse: collapse;

	th,
	td {
		padding: 12px 16px;
		text-align: start;
		vertical-align: middle;
		border-bottom: 1px solid var( --qf-bg );
	}

	th {
		font-size: 12px;
		font-weight: 600;
		color: var( --qf-muted );
		background: var( --qf-subtle );
	}

	tr:last-child td {
		border-bottom: 0;
	}

	time {
		font-size: 13px;
		color: var( --qf-muted );
		white-space: nowrap;
	}
}

.quoteform_builder .quoteform_list__title {
	display: block;
	font-weight: 600;
}

.quoteform_builder .quoteform_list__id {
	font-size: 12px;
	color: var( --qf-muted );
}

.quoteform_builder .quoteform_list__actions {
	white-space: nowrap;

	.quoteform_confirm {
		margin-top: 8px;
		white-space: normal;
	}
}

.quoteform_builder .quoteform_copy {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
}

.quoteform_builder .quoteform_copy__value {
	width: 17em;
	min-height: 28px;
	padding: 2px 8px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 12px;
	background: var( --qf-subtle );
	border: 1px solid var( --qf-border );
	border-radius: var( --qf-control-radius );
}

.quoteform_builder .quoteform_copy__status {
	flex-basis: 100%;
	min-height: 1em;
	font-size: 11px;
	color: var( --qf-success );
}

.quoteform_builder .quoteform_list .quoteform_empty .dashicons {
	width: 40px;
	height: 40px;
	font-size: 40px;
	color: var( --qf-field );
}

.quoteform_builder .quoteform_list__pages {
	display: flex;
	justify-content: flex-end;
	gap: 4px;
	margin-top: 12px;

	button {
		min-width: 32px;
		min-height: 32px;
		font: inherit;
		background: var( --qf-surface );
		border: 1px solid var( --qf-border );
		border-radius: var( --qf-control-radius );
		cursor: pointer;

		&[aria-current="page"] {
			font-weight: 600;
			color: #fff;
			background: var( --qf-accent );
			border-color: var( --qf-accent );
		}

		&:focus-visible {
			outline: 2px solid var( --qf-accent );
			outline-offset: 1px;
		}
	}
}
```

`admin-src/style.scss` — `@import "./styles/list";` əlavə et.

- [ ] **Step 6: Run tests and build**

Run: `npm run build && npx jest tests/js/admin/dates.test.js tests/js/admin/CopyField.test.js tests/js/admin/FormListLayout.test.js && npx jest --selectProjects admin`
Expected: PASS. Mövcud `FormListScreen.test.js` də keçməlidir.

---

### Task 11: Gutenberg bloku — kart görünüşü və redaktor stili

**Files:**
- Create: `admin-src/block/style.scss`
- Modify: `admin-src/block/index.js` (1 import), `admin-src/block/Edit.js` (başlıq markup-ı)
- Modify: `includes/Rendering/Block.php`
- Test: `tests/integration/RenderingSurfacesTest.php` (iki yeni metod). `tests/js/admin/blockEdit.test.js`-ə **toxunma** — mövcud dəst Edit-in davranışını onsuz da örtür.

**Interfaces:**
- Produces: `Block::EDITOR_STYLE_HANDLE = 'quoteform-block-editor-style'`; `build/style-block.css` (+ `-rtl`).

- [ ] **Step 1: Write the failing PHP integration test**

`tests/integration/RenderingSurfacesTest.php`-ə `testTheBlockCarriesAnEditorScript`-dən sonra əlavə et:

```php
    /**
     * Blokun kətanı WP 6.3+-da iframe-dir: admin səhifəsinin stilləri ora
     * düşmür. Blokun görünüşünü redaktora çatdıran yeganə yol budur.
     */
    public function testTheBlockCarriesAnEditorStyle(): void
    {
        $blockType = \WP_Block_Type_Registry::get_instance()->get_registered( Block::NAME );

        $this->assertNotNull( $blockType );
        $this->assertContains( Block::EDITOR_STYLE_HANDLE, $blockType->editor_style_handles );
        $this->assertTrue( wp_style_is( Block::EDITOR_STYLE_HANDLE, 'registered' ) );
        $this->assertFileExists( QFORM_PATH . 'build/style-block.css' );
    }

    public function testTheEditorStyleIsNeverEnqueuedByRenderingAForm(): void
    {
        Block::render( [ 'formId' => $this->formId ] );

        $this->assertFalse( wp_style_is( Block::EDITOR_STYLE_HANDLE, 'enqueued' ) );
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `make itest ARGS="--filter testTheBlockCarriesAnEditorStyle"`
Expected: FAIL — `Undefined constant Quoteform\Rendering\Block::EDITOR_STYLE_HANDLE` (fatal xəta — PHPUnit-in bilinən qüsuru fatal-ları normal çap edir).

- [ ] **Step 3: Write the block stylesheet and import it**

`admin-src/block/style.scss`:

```scss
@import "../styles/tokens";

// Blokun kətanı iframe-dir və orada WP admininin `common.css`-i yoxdur,
// ona görə `.screen-reader-text` burada öz qaydasını daşıyır.
.quoteform_block {
	display: grid;
	gap: 10px;
	padding: 16px 18px;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	font-size: 13px;
	color: var( --qf-text );
	background: var( --qf-surface );
	border: 1px solid var( --qf-border );
	border-radius: var( --qf-radius );
	box-shadow: var( --qf-shadow );

	.screen-reader-text {
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

	p {
		margin: 0;
	}

	.quoteform_control {
		display: grid;
		gap: 4px;

		label {
			font-weight: 600;
		}

		select {
			width: 100%;
			max-width: 360px;
			min-height: 32px;
			border: 1px solid var( --qf-field );
			border-radius: var( --qf-control-radius );
		}
	}
}

.quoteform_block__name {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 14px;
	font-weight: 600;

	.dashicons {
		color: var( --qf-accent );
	}
}

.quoteform_block__chosen {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var( --qf-muted );

	&::before {
		content: "";
		width: 8px;
		height: 8px;
		background: var( --qf-success );
		border-radius: 50%;
	}
}

.quoteform_block__problem {
	padding: 8px 12px;
	background: var( --qf-warning-bg );
	border-inline-start: 3px solid var( --qf-warning-border );
	border-radius: var( --qf-control-radius );
}
```

`admin-src/block/index.js` — importların sonuna:

```js
import './style.scss';
```

`admin-src/block/Edit.js` — yalnız başlıq sətri:

```jsx
			<p className="quoteform_block__name">
				<span className="dashicons dashicons-calculator" aria-hidden="true" />
				{ __( 'Quote form', 'quoteform' ) }
			</p>
```

- [ ] **Step 4: Register the style in PHP**

`includes/Rendering/Block.php`:

```php
    public const EDITOR_STYLE_HANDLE = 'quoteform-block-editor-style';
```

`register()`-də `editor_script` blokundan sonra:

```php
        if ( self::registerEditorStyle() ) {
            $arguments['editor_style'] = self::EDITOR_STYLE_HANDLE;
        }
```

Sinfin sonuna:

```php
    /**
     * Skriptlə eyni qayda: fayl yoxdursa stil sadəcə qeyd olunmur, blok YENƏ
     * DƏ qeyd olunur. Versiya skriptin manifestindən gəlir — ikisi eyni
     * build-dən çıxır.
     */
    private static function registerEditorStyle(): bool
    {
        if ( wp_style_is( self::EDITOR_STYLE_HANDLE, 'registered' ) ) {
            return true;
        }

        $styleFile = QFORM_PATH . 'build/style-block.css';
        $assetFile = QFORM_PATH . 'build/block.asset.php';

        if ( ! file_exists( $styleFile ) || ! file_exists( $assetFile ) ) {
            return false;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_register_style(
            self::EDITOR_STYLE_HANDLE,
            QFORM_URL . 'build/style-block.css',
            [],
            $asset['version']
        );

        wp_style_add_data( self::EDITOR_STYLE_HANDLE, 'rtl', 'replace' );

        return true;
    }
```

- [ ] **Step 5: Build, then run PHP and JS**

Run: `npm run build && ls build/style-block.css build/style-block-rtl.css && make itest && make test && make test74 && npx jest --selectProjects admin`
Expected: iki fayl mövcuddur; inteqrasiya testləri (yeni 2 daxil) PASS; vahid testlər PASS hər iki PHP versiyasında; Jest PASS (`blockEdit.test.js:133` `label` siyahısı dəyişməyib — başlığa `label` əlavə olunmayıb).

- [ ] **Step 6: Check the frontend bundle did not grow**

Run: `ls -l build/frontend.js build/style-frontend.css`
Expected: ölçülər Task 11-dən əvvəlki ilə eynidir (blok stili frontend-ə düşmür).

---

### Task 12: Görünən etiket qoruyucusu, tam yoxlama və vizual keçid

**Files:**
- Test: `tests/js/admin/visibleLabels.test.js`

**Interfaces:**
- Consumes: bütün əvvəlki task-lar.

- [ ] **Step 1: Write the guard test**

`tests/js/admin/visibleLabels.test.js` — Task 4-ün `jest.mock`/`form`/`openEditor` blokunu kopyala; formaya bir qayda əlavə et (`rules: [ { target: { kind: 'field', key: 'rooms' }, action: 'hide', match: 'all', conditions: [ { field: 'rooms', operator: 'equals', value: '1' } ] } ]`) və Rules-da label-ların hamısı render olunsun. Sonra:

```js
const TABS = [ 'Fields', 'Steps', 'Pricing', 'Rules', 'Settings' ];

// `hideLabel` yalnız bu iki yerdə icazəlidir (spec §5.6).
const mayHide = ( label ) =>
	label.htmlFor === 'quoteform_form-title' ||
	/^quoteform_rule-\d+-/.test( label.htmlFor ) ||
	/^quoteform_shortcode-\d+$/.test( label.htmlFor );

const visibleText = ( label ) =>
	Array.from( label.childNodes )
		.filter( ( node ) => ! ( node.classList && node.classList.contains( 'screen-reader-text' ) ) )
		.map( ( node ) => node.textContent )
		.join( '' )
		.trim();

describe( 'every label a sighted person needs is on screen', () => {
	it.each( TABS )( 'in the %s section', async ( name ) => {
		const user = userEvent.setup();

		await openEditor();
		await user.click( screen.getByRole( 'button', { name } ) );

		if ( name === 'Fields' ) {
			await user.click( screen.getByRole( 'button', { name: 'Rooms (rooms)' } ) );
		}

		const labels = Array.from( document.querySelectorAll( 'label' ) );

		expect( labels.length ).toBeGreaterThan( 0 );

		for ( const label of labels ) {
			if ( label.hasAttribute( 'data-quoteform-hidden-label' ) ) {
				expect( mayHide( label ) ).toBe( true );
			} else {
				expect( visibleText( label ) ).not.toBe( '' );
			}
		}
	} );
} );
```

- [ ] **Step 2: Run it**

Run: `npx jest tests/js/admin/visibleLabels.test.js`
Expected: PASS. Düşərsə — hansısa label səhvən tam gizlədilib və ya icazəsiz yerdə `hideLabel` işlədilib; kodu düzəlt, testi yox.

- [ ] **Step 3: Full suite**

Run: `make check`
Expected: `buildcheck` OK; PHP 8.2 və 7.4 OK; Jest bütün dəstlər PASS; inteqrasiya (yeni 2 test daxil) OK; trash-disabled OK.

- [ ] **Step 4: End-to-end**

Run: `make up` (işləmirsə) və `make e2e`
Expected: 9/9 PASS — xüsusilə "the whole builder is driven with the keyboard alone" (yeni Tab sırası fokus itirmir).

- [ ] **Step 5: Visual pass (Playwright MCP və ya əl ilə)**

`admin`/`admin` ilə daxil ol, "Home cleaning quote" formasını aç və ekran görüntülərini `.superpowers/screens/` altına saxla (git-ignore):
- 1280×900: siyahı, Fields (sahə seçilmiş), Steps, Pricing, Rules (bir qayda əlavə edib), Settings.
- 782×900: Fields və Rules (menyu üfüqi, sütunlar alt-alta).
- Users → Profile → Admin Color Scheme = "Ocean" → Fields: aksent (Save, seçilmiş tab zolağı) dəyişməlidir. Sonra "Default"-a qaytar.
- Yeni səhifə → "Quote form" bloku əlavə et → kart görünüşü, forma seç → yaşıl nöqtəli mətn.

Hər ekranda yoxla: mətn kəsilmir, horizontal scroll yoxdur (siyahı cədvəli istisna — o öz kartında sürüşür), fokus halqası görünür.

- [ ] **Step 6: Report**

Hesabatda: hər dəstin sayları, e2e nəticəsi, ekran görüntülərinin siyahısı və tapılan vizual problemlər. Commit **etmə** — hazır commit mesajını yaz:

```
feat(admin): app shell, section nav and card layout for the builder

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```
