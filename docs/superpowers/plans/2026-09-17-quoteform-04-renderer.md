# Quoteform Frontend Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor opens a page carrying `[quoteform id="12"]`, sees a multi-step quote form, fills it in, and watches the price update live — with conditional logic, step navigation and a final breakdown, in vanilla JavaScript with no React and no jQuery.

**Architecture:** The server filters the stored schema down to what rendering needs and hands it to the page. A vanilla-JS runtime resolves variable values from the DOM, compiles each rule's conditions into the *existing* expression engine, decides what is visible, runs the calculation DAG, and repaints. Three surfaces — shortcode, Gutenberg block, Elementor widget — are thin wrappers over one `FormRenderer`, so there is one render path and one set of bugs.

**Tech Stack:** PHP 7.4, WordPress 6.2+, vanilla ES6 built by `@wordpress/scripts` as a second entry point, the existing `frontend-src/engine/`, Jest, PHPUnit, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-quoteform-design.md`

**Depends on:** Plan 01 (expression engine), Plan 02 (schema + REST), Plan 03 (builder). All three are complete and green.

## Global Constraints

Copied from the spec. Every task's requirements implicitly include this section.

- **PHP 7.4** is the floor. No constructor promotion, named arguments, `match`, union types, nullsafe, `str_contains`/`str_starts_with`. Both the 8.2 and 7.4 suites must pass.
- **WordPress 6.2+** (spec §5.1 — the builder needs `createRoot`, which arrived with core's React 18).
- **The frontend renderer is vanilla JS (ES6), built, with no React and no jQuery dependency** (spec §5.1). This is not a preference; a React bundle on every public page is a defect.
- `declare(strict_types=1);` in every PHP file. Namespace root `Quoteform\`, PSR-4, one class per file, path mirrors namespace.
- **No `eval()` anywhere, ever** — in PHP or JavaScript. `new Function(...)` counts as `eval`. The expression engine exists precisely so no formula is ever evaluated that way.
- **`includes/Engine/` knows nothing** — not WordPress, not forms, not entries, not HTTP (spec §5.4). It takes expression text and variable values and returns a result. Nothing in this plan may weaken that.
- Every user-facing string translatable: `__()` / `esc_html__()` with text domain `quoteform` in PHP, `@wordpress/i18n`'s `__()` in JavaScript, and a `/* translators: */` comment on every placeholder.
- Error codes are stable machine-readable snake_case strings; consumers key off `code`, **never** message text.
- Field types, exactly these thirteen (spec §6.2): `number, text, email, tel, textarea, select, radio, checkbox, toggle, date, slider, hidden, html`.
- Rule operators, exactly these ten (spec §8): `equals, not_equals, greater, greater_or_equal, less, less_or_equal, contains, not_contains, is_empty, is_not_empty`. Rule actions, exactly four: `show, hide, require, optional`; `require`/`optional` apply to a **field** target only.
- **CSS class prefix is `quoteform_`** (spec §3). The builder was renamed to this; the renderer starts there.
- **Keyboard parity (spec §16) is a first-class requirement:** full keyboard navigation, focus moves to the new step's heading on change, no function reachable only by mouse, focus never lost to `<body>`.
- **Performance budgets (spec §18):** frontend JS < 25KB gzipped, frontend CSS < 10KB gzipped, calculation updates debounced at 50ms.
- **Parity is a test gate, not an intention (spec §7.5):** any change to engine behaviour must add cases to `tests/fixtures/expressions.json`, which PHPUnit and Jest both execute.
- The plugin is **fully free**: no licensing, telemetry, phone-home, upsell, "pro" teasers or upgrade prompts. Not in code, not in copy, not in a disabled state.
- **No explanatory code comments.** The few that exist in this codebase are in Azerbaijani and record non-obvious invariants — match that bar or write none.

---

## What the three earlier plans already built

An implementer of this plan sees only their own task. This section is what they can rely on.

### The expression engine — identical APIs in two languages

`frontend-src/engine/index.js` exports:

| Export | Signature | Notes |
|---|---|---|
| `compileExpression` | `( source ) → AST` | Cached; throws `ExpressionError` |
| `evaluateExpression` | `( source, variables ) → value` | Compiles (cached) then evaluates |
| `expressionVariables` | `( source ) → string[]` | Variable names, dots included |
| `orderCalculations` | `( calculations ) → string[]` | Topological order; throws `circular_reference` |
| `evaluateAllCalculations` | `( calculations, variables ) → object` | Prototype-less result object |
| `ExpressionError` | class | `codeSlug`, `position`, `context` — **`codeSlug`, not `code`** |

`includes/Engine/Expression.php` mirrors it in PHP with `Expression::compile()`, `Expression::evaluate()`, `Expression::variables()`, and `CalculationGraph::order()`.

**The seven functions that exist today, in both languages:** `min, max, sum, round, ceil, floor, abs`. `SIGNATURES` in `frontend-src/engine/functions.js` and `Functions::SIGNATURES` in `includes/Engine/Functions.php` are the same map of `name → [min, max|null]`.

### The schema, as stored

Validated by `includes/Forms/SchemaValidator.php` and its five siblings. Shape (spec §6.2): `version`, `settings`, `fields` (a map keyed by field key), `steps` (ordered array, each with `key`, `title`, `description`, `fields`), `calculations` (ordered array of `{ key, expression, label, visible }`), `rules`, `notifications`.

A calculation keyed `total` is required in every schema. Keys match `^[a-z][a-z0-9_]{0,63}$`.

### What is not built, and is not this plan's job

Submission, the `qform_entries` table, server-side recalculation, spam protection, the entries admin screen, CSV export, email notifications and save & resume are all later plans. **This plan renders a form and prices it. It does not submit it.** Do not add a submit button, a POST call, or an entries table — a later plan owns the whole submission path, and splitting it would leave the spec §10 security property ("the client never sends the total") half-implemented across two plans.

---

## Decisions

These were settled before the plan was written. Each names what it costs if it turns out wrong.

### D1 — Conditions compile into the engine, and the engine gains two functions

Spec §8 is explicit: *"Şərtlər ifadə mühərrikinin müqayisə qatına kompilyasiya olunur — ayrıca ikinci məntiq mühərriki yazılmır."* Conditions compile into the expression engine's comparison layer; no second logic engine is written.

Six of the ten operators map to operators the engine already has:

| Operator | Compiles to |
|---|---|
| `equals` | `{field} == value` |
| `not_equals` | `{field} != value` |
| `greater` | `{field} > value` |
| `greater_or_equal` | `{field} >= value` |
| `less` | `{field} < value` |
| `less_or_equal` | `{field} <= value` |

The other four have no primitive: `contains`, `not_contains`, `is_empty`, `is_not_empty`. This gap was found during Plan 03 and deliberately left to this plan.

**Decision: add `contains( haystack, needle )` and `is_empty( value )` to both engines**, and compile the remaining four as `contains(...)`, `!contains(...)`, `is_empty(...)`, `!is_empty(...)`.

Rejected: evaluating conditions in a small separate evaluator. It would be less code today and it directly contradicts the one sentence the spec spends on this, which exists because two logic implementations drift.

The two functions are not condition-only plumbing — `is_empty({notes})` and `contains({extras}, "gift_wrap")` are things a site owner will reasonably write in a price formula. **Cost if wrong:** two functions in the public expression language that turn out to be unused, and their fixtures.

### D2 — WITHDRAWN: `if()` exists, and the help text was right

**This decision was wrong and is recorded rather than deleted.**

It claimed that `admin-src/panels/FormulaEditor.js` advertised an `if()` function that did not exist, and instructed Task 1 to remove it from the help text in favour of the `({a} == "b") * 50` idiom.

`if()` exists in both engines. It is handled in the **evaluator** — `frontend-src/engine/evaluator.js:181` and `includes/Engine/Evaluator.php:228` — not in `functions.js`/`Functions.php`, and `tests/fixtures/expressions.json` already carries seven cases for it.

The error was in how it was checked, not in the reasoning. The decision correctly argued that a useful `if()` needs lazy evaluation, since `if({x} == 0, 0, 100 / {x})` must not evaluate the branch it does not take — and then searched `callFunction`, which is the one place a lazily-evaluated function can never live. The conclusion contradicted its own premise.

Task 1's implementer caught it, refused to delete a true statement about a working feature, and added `contains()` and `is_empty()` to the help text alongside `if()` instead. That is what shipped, and it is correct.

The multiplication idiom remains valid and is worth documenting somewhere, but it is an alternative to `if()`, not a replacement for it.

### D3 — One render path, three thin surfaces

Spec §11. `Rendering\FormRenderer` is the only thing that produces markup. The shortcode, the block and the Elementor widget each resolve a form id and call it. No surface may add markup of its own.

The Elementor widget is registered only when Elementor is actually loaded, and its test asserts that absence of Elementor is silent rather than fatal. **Cost if wrong:** a surface grows a special case and the three drift, which is precisely what the spec forbids.

### D4 — The server filters the schema; calculations survive the filter

Spec §11. What reaches the page is: `settings` (display-relevant keys only), `fields`, `steps`, `calculations` and `rules`. What does not: `notifications` in any form, email addresses, admin notes, and any setting the renderer does not read.

Calculations are sent **including `visible: false` ones**, because `total` depends on them. The spec addresses this directly and it is not a leak: the pricing is reconstructible from the form's behaviour anyway, and the source of truth is the server's own recalculation at submission time (§10).

`SchemaFilter` is an **allowlist**, not a denylist. A new key added to the schema in future must be opted in deliberately, not leak by default. **Cost if wrong:** a later plan adds a schema key the renderer needs and has to remember to allow it — a missing-feature failure, which is the safe direction.

### D5 — Hidden means absent, in both directions

Spec §8.1, the two behaviours competitors get wrong:

1. **A hidden field does not enter the calculation.** Its value resolves to `0` in arithmetic and `""` in comparison — not its last typed value.
2. **A hidden required field does not block validation.** Otherwise the form refuses to submit and the error is on something the user cannot see.

The same applies to steps: a hidden step is skipped, and its fields count for neither calculation nor validation.

This is one rule implemented once, in visibility resolution, and both consumers read it. **Cost if wrong:** it is the single most-reported bug class in form plugins, so getting it wrong is expensive and visible.

### D6 — Visibility is resolved to a fixed point, with a declared cap

Rules can chain: rule A hides field `x`, and rule B's condition tests `x`. Because a hidden field resolves to empty (D5), hiding `x` can change whether B fires, which can change what is hidden.

**Decision: iterate to a fixed point, capped at 10 passes.** If the cap is hit, stop and keep the last state, log once to the console, and leave the form usable (§14.2 — a runtime problem never breaks the form).

A cycle here is not a schema error — the builder cannot detect it, because it depends on values the visitor types. **Cost if wrong:** a pathological schema settles on an arbitrary-but-stable state instead of oscillating, which is the better failure.

### D7 — Live totals are display-only, and the runtime says so

Spec §10 is the security property this whole plan must not undermine: *"Client total-ı heç vaxt göndərmir."* The browser engine exists for the screen only.

Since this plan adds no submission, the rule shows up as a prohibition: **nothing in `frontend-src/` may write a computed total into a form field, a hidden input, or a data attribute intended for transport.** The rendered total lives in a `<output>` that no submission would read.

**Cost if wrong:** the next plan inherits a hidden input full of client-computed money and a DevTools-editable price, which becomes a financial hole the moment payments arrive in v2.

### D8 — A runtime error hides the total and keeps the form alive

Spec §14 level 2. Division by zero, a reference to a field deleted after the page loaded, an expression the browser engine rejects: the total is hidden, one message goes to the console, and the form stays usable.

No alert, no inline error, no white screen, no frozen form. The visitor is not the person who can fix a broken formula. **Cost if wrong:** a visitor sees an error they cannot act on, or worse, a stale price.

---

## File structure

```
frontend-src/
├── index.js                    # entry point: boots every form container on the page
├── engine/                     # EXISTS (Plan 01) — only functions.js changes, in Task 1
├── runtime/
│   ├── values.js               # §7.3 — field state → engine variables
│   ├── conditions.js           # §8/D1 — one rule condition → expression source
│   ├── visibility.js           # §8.1/D5/D6 — which fields and steps are visible
│   ├── calculate.js            # §7.4/D8 — run the DAG, survive runtime errors
│   ├── steps.js                # §9 — navigation over visible steps only
│   ├── validate.js             # §14.2 — client validation, visible fields only
│   └── state.js                # the form's value store and change notification
├── dom/
│   ├── controls.js             # one builder per field type (thirteen)
│   ├── form.js                 # assemble the form from a filtered schema
│   ├── bind.js                 # input events → state
│   └── announce.js             # §16 — aria-live and focus helpers
└── style.scss                  # < 10KB gzipped

includes/Rendering/
├── FormRenderer.php            # §11 — the one render path
├── SchemaFilter.php            # §11/D4 — allowlist filter
├── Shortcode.php               # [quoteform id="12"]
├── Block.php                   # Gutenberg, thin
└── ElementorWidget.php         # Elementor, thin, guarded

tests/js/frontend/              # Jest, jsdom — runtime and DOM
tests/php/Rendering/            # PHPUnit — filter, renderer
tests/integration/RenderingTest.php  # real WordPress — shortcode, enqueue
tests/e2e/renderer.spec.js      # Playwright — the §19 scenario, minus submission
```

Fifteen tasks follow. Each ends with something independently testable.

---
### Task 1: Two engine functions, in both languages, behind the parity gate

Spec §8 says conditions compile into the expression engine. Four of the ten operators have no primitive to compile to. This task adds them — and because it changes engine behaviour, spec §7.5 makes fixtures mandatory, not optional.

**Files:**
- Modify: `frontend-src/engine/functions.js`
- Modify: `includes/Engine/Functions.php`
- Modify: `tests/fixtures/expressions.json`
- Modify: `admin-src/panels/FormulaEditor.js` (the `if()` copy defect — D2)
- Test: `tests/js/admin/FormulaEditor.test.js` (help-text assertion)

**Interfaces:**
- Consumes: `ExpressionError`, `toNumber` (JS); `ExpressionException`, `Values` (PHP)
- Produces: `contains( haystack, needle ) → bool` and `is_empty( value ) → bool` in the expression language, available to every later task and to site owners writing formulas

**The trap, and it is the whole task.** `callFunction` currently does this:

```js
const numbers = args.map( ( argument ) => toNumber( argument, position ) );

switch ( name ) {
    case 'min':
    ...
```

Every argument is coerced to a number *before* the switch. That is correct for the seven arithmetic functions and destroys the two new ones — `contains( {extras}, "gift_wrap" )` would receive `NaN` and a number. The same coercion exists in `Functions::call()` on the PHP side.

So both languages need the value-functions handled **before** the coercion, in their own switch. Two switches, non-numeric first.

**Return booleans, not `1`/`0`.** The engine's comparisons return real booleans (`evaluateBinary`'s `==` returns `equals( left, right )`), unary `!` does `! toBool( operand )`, and `toNumber( true ) === 1`. Returning booleans makes `!contains(...)` work through the existing unary operator and keeps `({a} == 1) * 50` and `contains({a},"b") * 50` behaving identically.

- [ ] **Step 1: Write the failing parity fixtures**

Append to the `cases` array in `tests/fixtures/expressions.json`. Both PHPUnit and Jest read this file, so these cases fail in two languages at once until both implementations exist.

```json
    { "id": "contains-list-hit", "expr": "contains({extras}, \"gift_wrap\")", "vars": { "extras": [ "gift_wrap", "express" ] }, "expect": true },
    { "id": "contains-list-miss", "expr": "contains({extras}, \"none\")", "vars": { "extras": [ "gift_wrap" ] }, "expect": false },
    { "id": "contains-list-empty", "expr": "contains({extras}, \"gift_wrap\")", "vars": { "extras": [] }, "expect": false },
    { "id": "contains-list-no-coercion", "expr": "contains({extras}, 5)", "vars": { "extras": [ "5" ] }, "expect": false },
    { "id": "contains-string-hit", "expr": "contains({notes}, \"urgent\")", "vars": { "notes": "please be urgent" }, "expect": true },
    { "id": "contains-string-miss", "expr": "contains({notes}, \"urgent\")", "vars": { "notes": "no rush" }, "expect": false },
    { "id": "contains-string-empty-haystack", "expr": "contains({notes}, \"urgent\")", "vars": { "notes": "" }, "expect": false },
    { "id": "contains-string-empty-needle", "expr": "contains({notes}, \"\")", "vars": { "notes": "anything" }, "expect": true },
    { "id": "contains-number-haystack", "expr": "contains({rooms}, \"3\")", "vars": { "rooms": 3 }, "expect": false },
    { "id": "contains-null-haystack", "expr": "contains({missing}, \"x\")", "vars": { "missing": null }, "expect": false },
    { "id": "contains-negated", "expr": "!contains({extras}, \"none\")", "vars": { "extras": [ "gift_wrap" ] }, "expect": true },
    { "id": "contains-as-number", "expr": "contains({extras}, \"gift_wrap\") * 50", "vars": { "extras": [ "gift_wrap" ] }, "expect": 50 },

    { "id": "is-empty-unfilled-string", "expr": "is_empty({notes})", "vars": { "notes": "" }, "expect": true },
    { "id": "is-empty-null", "expr": "is_empty({notes})", "vars": { "notes": null }, "expect": true },
    { "id": "is-empty-empty-list", "expr": "is_empty({extras})", "vars": { "extras": [] }, "expect": true },
    { "id": "is-empty-zero-is-not-empty", "expr": "is_empty({rooms})", "vars": { "rooms": 0 }, "expect": false },
    { "id": "is-empty-zero-string-is-not-empty", "expr": "is_empty({rooms})", "vars": { "rooms": "0" }, "expect": false },
    { "id": "is-empty-false-is-not-empty", "expr": "is_empty({agreed})", "vars": { "agreed": false }, "expect": false },
    { "id": "is-empty-text", "expr": "is_empty({notes})", "vars": { "notes": "x" }, "expect": false },
    { "id": "is-empty-list-with-items", "expr": "is_empty({extras})", "vars": { "extras": [ "a" ] }, "expect": false },
    { "id": "is-empty-negated", "expr": "!is_empty({notes})", "vars": { "notes": "x" }, "expect": true },

    { "id": "contains-wrong-arity", "expr": "contains({extras})", "vars": { "extras": [] }, "error": "wrong_argument_count" },
    { "id": "is-empty-wrong-arity", "expr": "is_empty({a}, {b})", "vars": { "a": "", "b": "" }, "error": "wrong_argument_count" }
```

Three of these are load-bearing and will be the first thing a reviewer checks:

- `is-empty-zero-is-not-empty` — a number field answered with `0` is **answered**. Treating `0` as empty would make "0 rooms" trigger an `is_empty` rule, which is wrong and would be very hard for a site owner to diagnose.
- `contains-list-no-coercion` — `contains( [ "5" ], 5 )` is **false**. Spec §7.5 forbids implicit coercion in comparison (`"5" == 5` is false), and `contains` is comparison; it must use the same `equals` the `==` operator uses, not a looser one.
- `contains-string-empty-needle` — the empty string is a substring of everything, which is what every language's substring search does. Pinning it stops someone "fixing" it later.

- [ ] **Step 2: Run the parity suites and watch both fail**

Run: `make test && make js`
Expected: FAIL in both. PHP reports `unknown_function` for `contains`; Jest reports the same. That both fail for the same reason is the parity gate working.

- [ ] **Step 3: Add the signatures**

`frontend-src/engine/functions.js` — extend `SIGNATURES`:

```js
const SIGNATURES = {
	min: [ 1, null ],
	max: [ 1, null ],
	sum: [ 0, null ],
	round: [ 1, 2 ],
	ceil: [ 1, 1 ],
	floor: [ 1, 1 ],
	abs: [ 1, 1 ],
	contains: [ 2, 2 ],
	is_empty: [ 1, 1 ],
};
```

`includes/Engine/Functions.php` — the same two entries in `SIGNATURES`, keeping the file's existing order and formatting. The comment in the JS file says this map mirrors the PHP one; keep that true.

- [ ] **Step 4: Implement the two value functions in JavaScript**

In `frontend-src/engine/functions.js`, add these helpers above `callFunction`:

```js
function isEmptyValue( value ) {
	if ( value === null || value === undefined ) {
		return true;
	}

	if ( Array.isArray( value ) ) {
		return value.length === 0;
	}

	return value === '';
}

function containsValue( haystack, needle ) {
	if ( haystack === null || haystack === undefined ) {
		return false;
	}

	if ( Array.isArray( haystack ) ) {
		return haystack.some( ( item ) => equals( item, needle ) );
	}

	if ( typeof haystack !== 'string' ) {
		return false;
	}

	return typeof needle === 'string' && haystack.indexOf( needle ) !== -1;
}
```

Import `equals` from `./values` alongside the existing `toNumber` import.

Then split the dispatch in `callFunction`. The arity check stays exactly where it is; insert this immediately after it, **before** the `numbers` mapping:

```js
	switch ( name ) {
		case 'contains':
			return containsValue( args[ 0 ], args[ 1 ] );

		case 'is_empty':
			return isEmptyValue( args[ 0 ] );
	}

	const numbers = args.map( ( argument ) => toNumber( argument, position ) );
```

The existing numeric switch below is untouched.

`containsValue` returns `false` for a non-string, non-list haystack rather than stringifying it. `contains( {rooms}, "3" )` where `rooms` is the number `3` is therefore false — deliberately, and fixed by `contains-number-haystack`. Stringifying would make `contains( 13, "3" )` true, which is a trap nobody wants.

- [ ] **Step 5: Implement the same two functions in PHP**

`includes/Engine/Functions.php`. Mirror the JavaScript exactly, including the early-return ordering and the refusal to stringify. PHP 7.4 — no `str_contains`.

```php
    private static function isEmptyValue( $value ): bool
    {
        if ( $value === null ) {
            return true;
        }

        if ( is_array( $value ) ) {
            return count( $value ) === 0;
        }

        return $value === '';
    }

    private static function containsValue( $haystack, $needle ): bool
    {
        if ( $haystack === null ) {
            return false;
        }

        if ( is_array( $haystack ) ) {
            foreach ( $haystack as $item ) {
                if ( Values::equals( $item, $needle ) ) {
                    return true;
                }
            }

            return false;
        }

        if ( ! is_string( $haystack ) || ! is_string( $needle ) ) {
            return false;
        }

        return $needle === '' || strpos( $haystack, $needle ) !== false;
    }
```

`strpos` returns `0` for a match at position zero and `false` for no match, so the `!== false` comparison is required and the `$needle === ''` case is handled before it — `strpos( 'abc', '' )` is `0` in PHP 8 but was a warning in some 7.x builds, and the explicit branch removes the question.

Dispatch them in `Functions::call()` before the numeric coercion, matching the JavaScript structure.

- [ ] **Step 6: Run the parity suites and watch both pass**

Run: `make test && make test74 && make js`
Expected: PASS. The same fixture file drives all three; if PHP 7.4 and 8.2 disagree, stop — that is a genuine defect, not a flake.

- [ ] **Step 7: Correct the builder's help text (D2)**

`admin-src/panels/FormulaEditor.js` tells the user the language has `if()`. It does not, and never did. Replace that string with one that is true and teaches the idiom that replaces it:

```js
					{ __(
						'Numbers, + - * / and ( ), comparisons, and functions like round(), min(), max(), contains() and is_empty(). A comparison is 1 when true, so ({urgency} == "express") * 50 adds 50 only for express.',
						'quoteform'
					) }
```

Update the assertion in `tests/js/admin/FormulaEditor.test.js` that queries the old copy, and **say so explicitly in your report** — a changed existing test always needs its justification.

- [ ] **Step 8: Rebuild and run everything**

Run: `npm run build && make check`
Expected: all five suites green. `buildcheck` will fail if you skip the rebuild — you changed `admin-src/`.

- [ ] **Step 9: Prepare a commit message**

```
feat(engine): add contains() and is_empty() for conditional logic
```

Do not run `git commit`.

---

### Task 2: A second build entry, loaded only where a form is

The builder is one `wp-scripts` entry point. The renderer is a second one. Spec §5.1 forbids React and jQuery in it, and §18 caps it at 25KB gzipped.

**Files:**
- Create: `frontend-src/index.js`
- Create: `frontend-src/style.scss`
- Modify: `package.json`
- Modify: `bin/check-build.sh`
- Test: `tests/js/frontend/boot.test.js`

**Interfaces:**
- Produces: `build/frontend.js`, `build/frontend.asset.php`, `build/style-frontend.css`; a global boot that scans for `[data-quoteform]` containers and mounts one runtime per container

**Why `wp-scripts` and not a second tool.** It already externalises WordPress packages, emits the `.asset.php` dependency manifest that `BuilderPage` relies on, and `bin/check-build.sh` already guards staleness. A second bundler would mean a second config and a second guard. The renderer simply must not *import* React — nothing else is needed to keep it out, and Step 4 proves it.

- [ ] **Step 1: Write the failing boot test**

`tests/js/frontend/boot.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { bootAll } from '../../../frontend-src/index';

const container = ( id, schema ) => {
	const node = document.createElement( 'div' );

	node.setAttribute( 'data-quoteform', String( id ) );
	node.textContent = 'server-rendered fallback';
	window.quoteformData = window.quoteformData || {};
	window.quoteformData[ id ] = schema;

	document.body.appendChild( node );

	return node;
};

const minimalSchema = () => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {},
	steps: [ { key: 'step_one', title: 'One', description: '', fields: [] } ],
	calculations: [ { key: 'total', expression: '0', label: 'Total', visible: true } ],
	rules: [],
} );

describe( 'bootAll', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		window.quoteformData = {};
	} );

	it( 'mounts one runtime per container', () => {
		container( 12, minimalSchema() );
		container( 13, minimalSchema() );

		expect( bootAll( document ) ).toHaveLength( 2 );
	} );

	it( 'replaces the server-rendered fallback', () => {
		const node = container( 12, minimalSchema() );

		bootAll( document );

		expect( node.textContent ).not.toContain( 'server-rendered fallback' );
	} );

	it( 'leaves a container alone when its schema is missing', () => {
		const node = document.createElement( 'div' );

		node.setAttribute( 'data-quoteform', '99' );
		node.textContent = 'server-rendered fallback';
		document.body.appendChild( node );

		expect( () => bootAll( document ) ).not.toThrow();
		expect( node.textContent ).toContain( 'server-rendered fallback' );
	} );

	it( 'survives one form that throws, without taking the others down', () => {
		const { createForm } = require( '../../../frontend-src/dom/form' );

		createForm.mockImplementationOnce( () => {
			throw new Error( 'malformed schema' );
		} );

		container( 12, minimalSchema() );
		const healthy = container( 13, minimalSchema() );

		expect( () => bootAll( document ) ).not.toThrow();
		expect( healthy.textContent ).not.toContain( 'server-rendered fallback' );
	} );

	it( 'ships no React and no jQuery, by manifest as well as by bundle', () => {
		const fs = require( 'fs' );
		const path = require( 'path' );
		const manifest = fs.readFileSync(
			path.join( __dirname, '../../../build/frontend.asset.php' ),
			'utf8'
		);

		expect( manifest ).toMatch( /'dependencies'\s*=>\s*array\(\s*\)/ );
	} );
} );
```

Two of these need their reasoning stated, because the obvious version of each does not work.

**The throwing-form test mocks `createForm` rather than passing a bad schema.** A `null` schema is caught by `bootAll`'s own `if ( ! schema ) return;` guard *before* `createForm` is ever called, so it exercises the missing-schema branch and never enters the `try`/`catch` at all — the safety net could be deleted entirely and the test would still pass. `bootAll`'s actual contract is "one form that throws does not stop the others", independent of *why* it throws, so the throw is injected. Add `jest.mock( '../../../frontend-src/dom/form' )` at the top of the file and have the factory return a `createForm` whose default implementation empties the container, so the other boot tests keep working.

**The manifest assertion is the real React guard; the bundle grep is not.** `build/frontend.asset.php` is what Task 4 enqueues from, so it is what decides whether WordPress loads React on a public page. A substring search of the bundle misses the case that matters: `@wordpress/dependency-extraction-webpack-plugin` externalises `import 'react'` to the global `React` — capital R, which a lowercase `'react'` search does not match — and externalises any `@wordpress/*` import to `wp.<name>`, which contains no "react" substring at all. So `import { createElement } from '@wordpress/element'` would pass a bundle grep while silently adding `wp-element` and `react` to the dependency manifest, and every public page would load React. Keep the bundle grep as a second line of defence; the manifest assertion is the one that would actually fail.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest --selectProjects frontend --testPathPattern boot`
Expected: FAIL — the `frontend` Jest project does not exist yet.

- [ ] **Step 3: Add the Jest project**

`jest.config.js` gains a third project alongside `engine` and `admin`:

```js
		{
			displayName: 'frontend',
			testEnvironment: 'jsdom',
			testMatch: [ '<rootDir>/tests/js/frontend/**/*.test.js' ],
			moduleNameMapper: {
				'\\.(css|scss)$': '<rootDir>/tests/js/admin/styleStub.js',
			},
		},
```

No `@wordpress/element` mapping — the renderer does not use it, and leaving the mapping out means an accidental React import fails loudly in tests rather than quietly working.

- [ ] **Step 4: Add the entry point**

`frontend-src/index.js`:

```js
import './style.scss';

import { createForm } from './dom/form';

export function bootAll( root ) {
	const containers = root.querySelectorAll( '[data-quoteform]' );
	const mounted = [];

	containers.forEach( ( container ) => {
		const id = container.getAttribute( 'data-quoteform' );
		const schema = ( window.quoteformData || {} )[ id ];

		if ( ! schema ) {
			return;
		}

		try {
			mounted.push( createForm( container, schema ) );
		} catch ( error ) {
			// eslint-disable-next-line no-console
			console.error( '[quoteform]', error );
		}
	} );

	return mounted;
}

document.addEventListener( 'DOMContentLoaded', () => {
	bootAll( document );
} );
```

`createForm` arrives in Task 11. Until then, stub it in `frontend-src/dom/form.js` as a function that empties the container and returns an object — the boot test asserts the fallback is replaced, not what replaces it, so the stub satisfies it honestly and Task 11 fills it in.

- [ ] **Step 5: Wire the second entry into the build**

`package.json` — `wp-scripts build` discovers multiple entries from a `--webpack-src-dir` root only for `index.js`, so the two entries are declared explicitly:

```json
    "build": "wp-scripts build index=./admin-src/index.js frontend=./frontend-src/index.js --output-path=build",
    "start": "wp-scripts start index=./admin-src/index.js frontend=./frontend-src/index.js --output-path=build",
```

**The `name=path` form is required, not stylistic.** Passing the two entries as bare paths — `wp-scripts build admin-src/index.js frontend-src/index.js` — makes webpack derive each output name from the entry's **basename**, and both files are called `index.js`. The second silently overwrites the first, so the admin bundle disappears and the builder stops working, with no error. Naming the entries explicitly is what keeps them apart.

That emits `build/index.js` + `build/index.asset.php` for the builder and `build/frontend.js` + `build/frontend.asset.php` for the renderer, plus **two** stylesheets per entry — `style-<name>.css` and `style-<name>-rtl.css`.

Run `npm run build` and confirm the emitted filenames rather than assuming them; Task 4 enqueues by those names.

- [ ] **Step 6: Prove React is not in the bundle**

This is the constraint most likely to rot silently, and Step 1 already carries both halves of the guard: a substring search of `build/frontend.js`, and — the one that actually bites — an assertion that `build/frontend.asset.php`'s `dependencies` array is empty.

Both read built artefacts, so they need `npm run build` to have run. Inside `make check` that is guaranteed, because `check` runs `buildcheck` first and `buildcheck` fails when `build/` is missing or stale. If the file is absent the test must **fail with a message naming `npm run build`**, never skip — a skipped test can go years without running, which is exactly how React would enter the bundle unnoticed.

- [ ] **Step 7: Extend the build guard**

`bin/check-build.sh` compares `build/` against a scratch compile and fails on any difference, including files present in one tree only. **It does need a change**: its own rebuild command must use the same named-entry form as `package.json`, or the scratch compile produces a different set of files than `build/` holds and the guard reports staleness that is not there.

Make that change, then prove the guard both ways: run `make buildcheck` after a clean build and confirm it passes, then delete `build/frontend.js` and confirm it fails naming that file. Put both runs in your report.

**Also check `jest.config.js`'s existing `engine` project.** Its `testMatch` is broad enough to pick up `tests/js/frontend/`, which would run the new jsdom tests a second time under node and fail on the stylesheet import. Add the new directory to its ignore list.

- [ ] **Step 8: Check the size budget**

Run: `npx gzip-size build/frontend.js` or `gzip -c build/frontend.js | wc -c`
Expected: comfortably under 25,600 bytes at this stage — the file is nearly empty. Record the number. Task 15 checks it again when the renderer is complete, and the budget is a spec requirement (§18), not a guideline.

- [ ] **Step 9: Run everything**

Run: `make check`
Expected: all suites green, plus the new `frontend` project.

- [ ] **Step 10: Prepare a commit message**

```
build: add the frontend renderer entry point
```

Do not run `git commit`.

---
### Task 3: `SchemaFilter` — an allowlist, not a denylist

Spec §11: the schema is filtered before it reaches the page. Notification templates, email addresses and admin-only settings must not be in the HTML source of a public page.

**Files:**
- Create: `includes/Rendering/SchemaFilter.php`
- Test: `tests/php/Rendering/SchemaFilterTest.php`

**Interfaces:**
- Produces: `SchemaFilter::forDisplay( array $schema ) → array`

**Allowlist, and the reason it matters.** A denylist (`unset( $schema['notifications'] )`) leaks every key added to the schema in future, silently and publicly, the day someone adds it. An allowlist fails the other way: a later plan adds a key the renderer needs and has to opt it in, which shows up as a missing feature in testing rather than as customer email addresses in page source.

**Calculations are kept in full, including `visible: false`.** Spec §11 addresses this directly: `total` depends on them, live calculation is impossible without them, the pricing is reconstructible from the form's behaviour anyway, and the source of truth is the server's own recalculation. Do not "improve" this by stripping invisible calculations — the form would price incorrectly.

- [ ] **Step 1: Write the failing tests**

`tests/php/Rendering/SchemaFilterTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Rendering;

use PHPUnit\Framework\TestCase;
use Quoteform\Rendering\SchemaFilter;

final class SchemaFilterTest extends TestCase
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
                'success_message'   => 'Thank you.',
                'redirect_url'      => 'https://example.com/thanks',
                'store_ip'          => true,
                'admin_note'        => 'internal only',
            ],
            'fields'        => [ 'rooms' => [ 'key' => 'rooms', 'type' => 'number', 'label' => 'Rooms' ] ],
            'steps'         => [ [ 'key' => 'step_one', 'title' => 'One', 'description' => '', 'fields' => [ 'rooms' ] ] ],
            'calculations'  => [
                [ 'key' => 'subtotal', 'expression' => '{rooms} * 50', 'label' => 'Subtotal', 'visible' => false ],
                [ 'key' => 'total', 'expression' => '{subtotal}', 'label' => 'Total', 'visible' => true ],
            ],
            'rules'         => [
                [
                    'target'     => [ 'kind' => 'field', 'key' => 'rooms' ],
                    'action'     => 'show',
                    'match'      => 'all',
                    'conditions' => [ [ 'field' => 'urgency', 'operator' => 'equals', 'value' => 'express' ] ],
                ],
            ],
            'notifications' => [
                [ 'to' => 'owner@example.com', 'subject' => 'New quote', 'body' => 'Internal template' ],
            ],
        ];
    }

    public function testKeepsWhatTheRendererNeeds(): void
    {
        $filtered = SchemaFilter::forDisplay( $this->schema() );

        $this->assertSame( 1, $filtered['version'] );
        $this->assertSame( $this->schema()['fields'], $filtered['fields'] );
        $this->assertSame( $this->schema()['steps'], $filtered['steps'] );
        $this->assertSame( $this->schema()['rules'], $filtered['rules'] );
    }

    public function testDropsNotificationsEntirely(): void
    {
        $filtered = SchemaFilter::forDisplay( $this->schema() );

        $this->assertArrayNotHasKey( 'notifications', $filtered );
    }

    public function testNoEmailAddressSurvivesAnywhere(): void
    {
        $encoded = json_encode( SchemaFilter::forDisplay( $this->schema() ) );

        $this->assertStringNotContainsString( 'owner@example.com', (string) $encoded );
        $this->assertStringNotContainsString( 'internal only', (string) $encoded );
    }

    public function testKeepsInvisibleCalculationsBecauseTotalDependsOnThem(): void
    {
        $filtered = SchemaFilter::forDisplay( $this->schema() );

        $this->assertCount( 2, $filtered['calculations'] );
        $this->assertSame( 'subtotal', $filtered['calculations'][0]['key'] );
        $this->assertFalse( $filtered['calculations'][0]['visible'] );
    }

    public function testKeepsOnlyDisplaySettings(): void
    {
        $settings = SchemaFilter::forDisplay( $this->schema() )['settings'];

        $this->assertSame(
            [ 'currency', 'currency_position', 'decimals' ],
            array_keys( $settings )
        );
    }

    public function testAnUnknownSettingDoesNotLeak(): void
    {
        $schema = $this->schema();
        $schema['settings']['secret_api_key'] = 'sk_live_xxx';

        $settings = SchemaFilter::forDisplay( $schema )['settings'];

        $this->assertArrayNotHasKey( 'secret_api_key', $settings );
    }

    public function testAnUnknownTopLevelKeyDoesNotLeak(): void
    {
        $schema = $this->schema();
        $schema['webhooks'] = [ [ 'url' => 'https://internal.example/hook' ] ];

        $filtered = SchemaFilter::forDisplay( $schema );

        $this->assertArrayNotHasKey( 'webhooks', $filtered );
    }

    public function testMissingSectionsBecomeEmptyRatherThanAbsent(): void
    {
        $filtered = SchemaFilter::forDisplay( [ 'version' => 1 ] );

        $this->assertSame( [], $filtered['fields'] );
        $this->assertSame( [], $filtered['steps'] );
        $this->assertSame( [], $filtered['calculations'] );
        $this->assertSame( [], $filtered['rules'] );
    }
}
```

This test uses plain `json_encode`, not `wp_json_encode`. The unit suite runs against a mock WordPress bootstrap (`tests/php/bootstrap.php`) that defines `__` and `esc_html__` but **not** `wp_json_encode` — calling it here would fatal. `SchemaFilter` itself calls no WordPress function at all, so the unit suite is the right home for it; `FormRenderer`'s real `wp_json_encode` is exercised by the integration tests in Task 4.

`testAnUnknownSettingDoesNotLeak` and `testAnUnknownTopLevelKeyDoesNotLeak` are the two that prove it is an allowlist. A denylist implementation passes every other test in this file and fails exactly those two — which is the point of writing them.

`testMissingSectionsBecomeEmptyRatherThanAbsent` matters because the renderer iterates these sections. Returning them absent would make every consumer write a guard.

- [ ] **Step 2: Run them and watch them fail**

Run: `make test -- --filter SchemaFilterTest`
Expected: FAIL — class not found.

- [ ] **Step 3: Implement the filter**

`includes/Rendering/SchemaFilter.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

/**
 * Sxemin yalnız render üçün lazım olan hissəsi (spec §11).
 *
 * İCAZƏ SİYAHISIDIR, qadağa siyahısı deyil: gələcəkdə sxemə əlavə olunan
 * hər açar susqunluqla ictimai səhifəyə sızmaq əvəzinə, qəsdən bura
 * yazılmalıdır.
 */
final class SchemaFilter
{
    private const DISPLAY_SETTINGS = [ 'currency', 'currency_position', 'decimals' ];

    /**
     * @param array<string, mixed> $schema
     *
     * @return array<string, mixed>
     */
    public static function forDisplay( array $schema ): array
    {
        return [
            'version'      => isset( $schema['version'] ) ? (int) $schema['version'] : 1,
            'settings'     => self::settings( $schema ),
            'fields'       => self::section( $schema, 'fields' ),
            'steps'        => self::section( $schema, 'steps' ),
            'calculations' => self::section( $schema, 'calculations' ),
            'rules'        => self::section( $schema, 'rules' ),
        ];
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array<string, mixed>
     */
    private static function settings( array $schema ): array
    {
        $settings = isset( $schema['settings'] ) && is_array( $schema['settings'] ) ? $schema['settings'] : [];
        $kept     = [];

        foreach ( self::DISPLAY_SETTINGS as $key ) {
            if ( array_key_exists( $key, $settings ) ) {
                $kept[ $key ] = $settings[ $key ];
            }
        }

        return $kept;
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array<mixed>
     */
    private static function section( array $schema, string $key ): array
    {
        return isset( $schema[ $key ] ) && is_array( $schema[ $key ] ) ? $schema[ $key ] : [];
    }
}
```

`DISPLAY_SETTINGS` is iterated in its own order, not the schema's, so the key order of the output is fixed and `testKeepsOnlyDisplaySettings` can assert on it.

- [ ] **Step 4: Run them and watch them pass**

Run: `make test -- --filter SchemaFilterTest` and `make test74 -- --filter SchemaFilterTest`
Expected: PASS, 8 tests, both PHP versions.

- [ ] **Step 5: Prepare a commit message**

```
feat(rendering): filter the schema before it reaches the page
```

Do not run `git commit`.

---

### Task 4: `FormRenderer` and the shortcode

Spec §11: one render path. This task builds it and the first of its three surfaces.

**Files:**
- Create: `includes/Rendering/FormRenderer.php`
- Create: `includes/Rendering/Shortcode.php`
- Modify: `includes/Plugin.php`
- Test: `tests/php/Rendering/FormRendererTest.php`
- Test: `tests/integration/RenderingTest.php`

**Interfaces:**
- Consumes: `SchemaFilter::forDisplay()` (Task 3), `SchemaRepository` and `FormPostType` (Plan 02)
- Produces: `FormRenderer::render( int $formId ) → string` and a registered `[quoteform]` shortcode

**What the markup must be.** A container the runtime mounts into, carrying the form id, plus a server-rendered fallback that says something useful when JavaScript never runs. The schema goes to the page through `wp_add_inline_script` on the renderer handle, keyed by form id, so two forms on one page do not collide.

Do **not** print the schema with `wp_localize_script` — it stringifies nested values and would corrupt numbers and booleans in the schema. `wp_add_inline_script` with `wp_json_encode` keeps types intact.

- [ ] **Step 1: Write the failing renderer tests**

`tests/php/Rendering/FormRendererTest.php` exercises the markup with a stubbed repository:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Rendering;

use PHPUnit\Framework\TestCase;
use Quoteform\Rendering\FormRenderer;

final class FormRendererTest extends TestCase
{
    public function testRendersAContainerCarryingTheFormId(): void
    {
        $html = FormRenderer::container( 12 );

        $this->assertStringContainsString( 'data-quoteform="12"', $html );
        $this->assertStringContainsString( 'class="quoteform_form"', $html );
    }

    public function testRendersANoScriptFallbackThatSaysSomethingUseful(): void
    {
        $html = FormRenderer::container( 12 );

        $this->assertStringContainsString( '<noscript>', $html );
        $this->assertStringContainsString( 'JavaScript', $html );
    }

    public function testEscapesTheFormIdRatherThanTrustingIt(): void
    {
        $html = FormRenderer::container( 0 );

        $this->assertStringContainsString( 'data-quoteform="0"', $html );
        $this->assertStringNotContainsString( '<script', $html );
    }

    public function testTwoFormsProduceDistinctContainerIds(): void
    {
        $this->assertNotSame(
            FormRenderer::container( 12 ),
            FormRenderer::container( 13 )
        );
    }
}
```

- [ ] **Step 2: Write the failing integration tests**

`tests/integration/RenderingTest.php` runs against real WordPress, because the parts worth testing here are the parts a unit test cannot reach — that the shortcode is registered, that assets load only when a form is actually on the page, and that the schema reaches the page with its types intact.

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use WP_UnitTestCase;

final class RenderingTest extends WP_UnitTestCase
{
    private int $formId;

    public function set_up(): void
    {
        parent::set_up();

        $this->formId = (int) self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE ] );

        ( new SchemaRepository() )->save( $this->formId, SchemaRepository::defaults() );
    }

    public function testTheShortcodeIsRegistered(): void
    {
        $this->assertTrue( shortcode_exists( 'quoteform' ) );
    }

    public function testTheShortcodeRendersAContainer(): void
    {
        $html = do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $this->assertStringContainsString( 'data-quoteform="' . $this->formId . '"', $html );
    }

    public function testAnUnknownIdRendersNothingRatherThanAnError(): void
    {
        $html = do_shortcode( '[quoteform id="999999"]' );

        $this->assertSame( '', trim( $html ) );
    }

    public function testAnIdOfADifferentPostTypeRendersNothing(): void
    {
        $postId = (int) self::factory()->post->create( [ 'post_type' => 'post' ] );

        $this->assertSame( '', trim( do_shortcode( '[quoteform id="' . $postId . '"]' ) ) );
    }

    public function testTheRendererAssetsAreNotEnqueuedOnAPageWithoutAForm(): void
    {
        do_action( 'wp_enqueue_scripts' );

        $this->assertFalse( wp_script_is( 'quoteform-renderer', 'enqueued' ) );
    }

    public function testTheRendererAssetsAreEnqueuedOnceTheShortcodeRuns(): void
    {
        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $this->assertTrue( wp_script_is( 'quoteform-renderer', 'enqueued' ) );
        $this->assertTrue( wp_style_is( 'quoteform-renderer', 'enqueued' ) );
    }

    public function testTheSchemaReachesThePageWithItsTypesIntact(): void
    {
        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertStringContainsString( '"decimals":2', $joined );
        $this->assertStringNotContainsString( '"decimals":"2"', $joined );
    }

    public function testTheSchemaOnThePageCarriesNoNotifications(): void
    {
        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertStringNotContainsString( 'notifications', $joined );
    }

    public function testTwoShortcodesOnOnePageBothReachTheRuntime(): void
    {
        $second = (int) self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE ] );
        ( new SchemaRepository() )->save( $second, SchemaRepository::defaults() );

        do_shortcode( '[quoteform id="' . $this->formId . '"]' );
        do_shortcode( '[quoteform id="' . $second . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertStringContainsString( '"' . $this->formId . '":', $joined );
        $this->assertStringContainsString( '"' . $second . '":', $joined );
    }
}
```

`testTheSchemaReachesThePageWithItsTypesIntact` is the one that catches `wp_localize_script`: it stringifies everything, so `decimals` would arrive as `"2"` and the renderer's rounding would be driven by a string.

**These tests need a `tearDown()`.** WordPress's test harness does not reset `$wp_scripts` and `$wp_styles` between tests, so a handle enqueued by one test is still enqueued in the next and the negative assertions pass or fail depending on execution order. `tests/integration/BuilderPageTest.php` already carries the pattern — mirror it, deregistering both handles.

`testTwoShortcodesOnOnePageBothReachTheRuntime` is the one that catches a runtime built around a single global instead of a map keyed by id.

- [ ] **Step 3: Run both and watch them fail**

Run: `make test -- --filter FormRendererTest` then `make itest -- --filter RenderingTest`
Expected: FAIL — classes not found, shortcode not registered.

- [ ] **Step 4: Implement the renderer**

`includes/Rendering/FormRenderer.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

use Quoteform\Forms\CorruptSchemaException;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;

/**
 * Yeganə render yolu (spec §11). Shortcode, blok və Elementor widget-i
 * yalnız forma id-sini həll edib buranı çağırır; heç biri öz markup-unu
 * əlavə etmir.
 */
final class FormRenderer
{
    public const HANDLE = 'quoteform-renderer';

    /** @var array<int, bool> */
    private static $printed = [];

    /** @var SchemaRepository */
    private $repository;

    public function __construct( ?SchemaRepository $repository = null )
    {
        $this->repository = $repository ?? new SchemaRepository();
    }

    public function render( int $formId ): string
    {
        if ( ! $this->repository->exists( $formId ) ) {
            return '';
        }

        try {
            $schema = $this->repository->find( $formId );
        } catch ( CorruptSchemaException $exception ) {
            return '';
        }

        $this->enqueue();
        $this->publishSchema( $formId, SchemaFilter::forDisplay( $schema ?? SchemaRepository::defaults() ) );

        return self::container( $formId );
    }

    public static function container( int $formId ): string
    {
        return sprintf(
            '<div class="quoteform_form" data-quoteform="%1$d"><noscript>%2$s</noscript></div>',
            $formId,
            esc_html__( 'This quote form needs JavaScript to calculate prices.', 'quoteform' )
        );
    }

    private function enqueue(): void
    {
        if ( wp_script_is( self::HANDLE, 'enqueued' ) ) {
            return;
        }

        $assetFile = QFORM_PATH . 'build/frontend.asset.php';

        if ( ! file_exists( $assetFile ) ) {
            return;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_enqueue_script( self::HANDLE, QFORM_URL . 'build/frontend.js', $asset['dependencies'], $asset['version'], true );
        wp_enqueue_style( self::HANDLE, QFORM_URL . 'build/style-frontend.css', [], $asset['version'] );
        wp_style_add_data( self::HANDLE, 'rtl', 'replace' );
        wp_set_script_translations( self::HANDLE, 'quoteform', QFORM_PATH . 'languages' );
    }

    /**
     * @param array<string, mixed> $schema
     */
    private function publishSchema( int $formId, array $schema ): void
    {
        if ( isset( self::$printed[ $formId ] ) ) {
            return;
        }

        self::$printed[ $formId ] = true;

        wp_add_inline_script(
            self::HANDLE,
            sprintf(
                'window.quoteformData = Object.assign( window.quoteformData || {}, %1$s );',
                (string) wp_json_encode( [ (string) $formId => $schema ] )
            ),
            'after'
        );
    }
}
```

**Use the filenames `npm run build` actually emitted in Task 2.** This code assumes `build/frontend.js`, `build/frontend.asset.php` and `build/style-frontend.css`. If wp-scripts named them differently, the emitted names win and this file follows them — say so in your report.

**The repository's read method is `find()`, not `get()`.** `SchemaRepository` exposes `find( int $formId ): ?array`, `save()` and `exists()`. `find()` returns `null` when the form exists but has no schema meta yet — a form created and never saved — and throws `CorruptSchemaException` only when the meta exists and is not an array. So the `null` case renders the default form and the exception case renders nothing. `includes/Rest/FormsController.php` uses the same `find()` pattern; follow it.

**The schema is published as one JSON object, not by bracket assignment.** `window.quoteformData[12] = {…}` emits the literal text `[12]`, so a test asserting the page contains `"12":` could never pass against it. Encoding `[ (string) $formId => $schema ]` and merging with `Object.assign` emits `{"12":{…}}`, which is both what the test looks for and what makes two forms on one page merge rather than overwrite.

The `$printed` guard means the same form twice on one page publishes its schema once. The `wp_script_is` guard means the assets enqueue once regardless of how many forms there are.

- [ ] **Step 5: Implement the shortcode**

`includes/Rendering/Shortcode.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

final class Shortcode
{
    public const TAG = 'quoteform';

    public static function register(): void
    {
        add_shortcode( self::TAG, [ self::class, 'render' ] );
    }

    /**
     * @param array<string, mixed>|string $attributes
     */
    public static function render( $attributes ): string
    {
        $parsed = shortcode_atts( [ 'id' => 0 ], is_array( $attributes ) ? $attributes : [], self::TAG );
        $formId = (int) $parsed['id'];

        if ( $formId < 1 ) {
            return '';
        }

        $renderer = new FormRenderer();

        return $renderer->render( $formId );
    }
}
```

Register it from `includes/Plugin.php` wherever the other `init`-time registrations happen, and add a `has_action` assertion for it in whichever existing test covers `Plugin`'s wiring — Plan 02 learned the hard way that wiring which nothing asserts can be deleted entirely with a green suite.

- [ ] **Step 6: Run both suites and watch them pass**

Run: `make test -- --filter FormRendererTest` then `make itest -- --filter RenderingTest`
Expected: PASS — 4 unit tests, 9 integration tests.

- [ ] **Step 7: Prepare a commit message**

```
feat(rendering): add FormRenderer and the [quoteform] shortcode
```

Do not run `git commit`.

---
### Task 5: The block and the Elementor widget — thin, and provably thin

Spec §11: three surfaces, one render path. A surface that grows markup of its own is the beginning of three divergent bug sets.

**Files:**
- Create: `includes/Rendering/Block.php`
- Create: `includes/Rendering/ElementorWidget.php`
- Modify: `includes/Plugin.php`
- Test: `tests/integration/RenderingSurfacesTest.php`

**Interfaces:**
- Consumes: `FormRenderer::render()` (Task 4)
- Produces: a `quoteform/form` dynamic block and, when Elementor is present, a `quoteform` widget

**The test that keeps them thin.** Every surface must produce **byte-identical** output to the shortcode for the same form id. That single assertion is worth more than any amount of review discipline: the moment a surface adds a wrapper div, it fails.

- [ ] **Step 1: Write the failing tests**

`tests/integration/RenderingSurfacesTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Rendering\Block;
use Quoteform\Rendering\ElementorWidget;
use WP_UnitTestCase;

final class RenderingSurfacesTest extends WP_UnitTestCase
{
    private int $formId;

    public function set_up(): void
    {
        parent::set_up();

        $this->formId = (int) self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE ] );

        ( new SchemaRepository() )->save( $this->formId, SchemaRepository::defaults() );
    }

    public function testTheBlockIsRegistered(): void
    {
        $this->assertTrue( \WP_Block_Type_Registry::get_instance()->is_registered( 'quoteform/form' ) );
    }

    public function testTheBlockProducesExactlyWhatTheShortcodeProduces(): void
    {
        $viaShortcode = do_shortcode( '[quoteform id="' . $this->formId . '"]' );
        $viaBlock     = Block::render( [ 'formId' => $this->formId ] );

        $this->assertSame( $viaShortcode, $viaBlock );
    }

    public function testTheBlockRendersNothingWithoutAFormId(): void
    {
        $this->assertSame( '', Block::render( [] ) );
        $this->assertSame( '', Block::render( [ 'formId' => 0 ] ) );
    }

    public function testTheBlockRendersNothingForAnUnknownForm(): void
    {
        $this->assertSame( '', Block::render( [ 'formId' => 999999 ] ) );
    }

    public function testElementorRegistrationIsSilentWhenElementorIsAbsent(): void
    {
        $this->assertFalse( did_action( 'elementor/loaded' ) > 0 );

        ElementorWidget::register();

        $this->assertTrue( true );
    }
}
```

`testElementorRegistrationIsSilentWhenElementorIsAbsent` is deliberately modest: Elementor is not installed in this container, so what can honestly be proved is that its absence is silent rather than fatal. Do not fake an Elementor class to claim more — say plainly in your report that the widget's behaviour under a real Elementor is unverified, and that a site with Elementor is where it must be checked by hand.

- [ ] **Step 2: Run them and watch them fail**

Run: `make itest -- --filter RenderingSurfacesTest`
Expected: FAIL — classes not found.

- [ ] **Step 3: Implement the block**

`includes/Rendering/Block.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

final class Block
{
    public const NAME = 'quoteform/form';

    public static function register(): void
    {
        register_block_type(
            self::NAME,
            [
                'api_version'     => 2,
                'attributes'      => [
                    'formId' => [
                        'type'    => 'number',
                        'default' => 0,
                    ],
                ],
                'render_callback' => [ self::class, 'render' ],
            ]
        );
    }

    /**
     * @param array<string, mixed> $attributes
     */
    public static function render( array $attributes ): string
    {
        $formId = isset( $attributes['formId'] ) ? (int) $attributes['formId'] : 0;

        if ( $formId < 1 ) {
            return '';
        }

        $renderer = new FormRenderer();

        return $renderer->render( $formId );
    }
}
```

The block has no editor script in this plan — it is a dynamic block whose only attribute is a form id, and building its editor UI is a separate piece of work that does not change what a visitor sees. Say so in your report rather than leaving it implied.

- [ ] **Step 4: Implement the Elementor widget**

`includes/Rendering/ElementorWidget.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

/**
 * Elementor yalnız quraşdırılıbsa qeydiyyatdan keçir. `elementor/loaded`
 * baş verməyibsə sinif iyerarxiyası ümumiyyətlə mövcud deyil, ona görə
 * widget sinfi məhz qeydiyyat anında, funksiyanın içində elan olunur.
 */
final class ElementorWidget
{
    public static function register(): void
    {
        if ( ! did_action( 'elementor/loaded' ) ) {
            return;
        }

        add_action( 'elementor/widgets/register', [ self::class, 'registerWidget' ] );
    }

    public static function registerWidget( $widgetsManager ): void
    {
        require_once __DIR__ . '/elementor-widget-class.php';

        $widgetsManager->register( new \Quoteform\Rendering\Elementor\FormWidget() );
    }
}
```

The widget class itself lives in `includes/Rendering/elementor-widget-class.php` and `extends \Elementor\Widget_Base`, because a file with that `extends` clause cannot be loaded at all when Elementor is absent — PSR-4 autoloading it would fatal the moment anything touched the class name. Its `render()` does nothing but call `FormRenderer::render()` with the selected id.

If you find a cleaner arrangement that keeps the same property — **no reference to an Elementor class on any code path where Elementor is absent** — take it and explain it.

- [ ] **Step 5: Wire both into `Plugin.php`**

Register the block on `init` and the Elementor widget on `plugins_loaded` (Elementor announces itself before `init`). Add `has_action` assertions for both, for the same reason as Task 4.

- [ ] **Step 6: Run and watch them pass**

Run: `make itest -- --filter RenderingSurfacesTest`
Expected: PASS, 5 tests.

- [ ] **Step 7: Prepare a commit message**

```
feat(rendering): add the block and Elementor surfaces
```

Do not run `git commit`.

---

### Task 6: Variable resolution — the §7.3 table, and the inconsistency in it

This is where a field's DOM state becomes an engine variable. Spec §7.3 exists because *"iki implementasiya arasında ən çox burada fərq yaranır"* — this is where the two engines diverge most.

**Files:**
- Create: `frontend-src/runtime/values.js`
- Modify: `includes/Forms/CalculationValidator.php` (see the decision below)
- Modify: `admin-src/state/fields.js` (the mirrored constant)
- Test: `tests/js/frontend/values.test.js`
- Test: `tests/php/Forms/CalculationValidatorTest.php` (the changed case)

**Interfaces:**
- Produces: `variablesFor( schema, state, visibleFields ) → object` — a flat map of engine variable names to values, including `key.price` entries

**The table, verbatim from spec §7.3:**

| Field type | `{key}` returns | `{key.price}` returns |
|---|---|---|
| number, slider | float | — |
| toggle | `1` / `0` | see the decision below |
| select, radio | the selected `value` (string) | the selected option's `price` |
| checkbox (multiple) | array of selected values | sum of the selected options' prices |
| text, email, tel, textarea | string | — |
| date | ISO string (`YYYY-MM-DD`) | — |
| empty / unfilled | `0` in arithmetic, `""` in comparison | `0` |

**Do not implement the last row.** "0 in arithmetic, `""` in comparison" is not a value a resolver can return — it is what the *engine* already does with `""`. `toNumber( '' )` is `0` and `equals( '', x )` compares as a string, and there is a fixture for each. So an unfilled field resolves to `''` and the engine's existing coercion does the rest. Returning `0` here instead would break comparison; returning a special sentinel would break both.

#### The decision this task has to make: `toggle` and `.price`

`CalculationValidator::PRICE_BEARING_TYPES` is `[ 'select', 'radio', 'checkbox', 'toggle' ]`, mirrored in `admin-src/state/fields.js`. But a toggle has **no options** — `FieldValidator`'s type map gives `'toggle' => []`, and the builder's `TYPE_EXTRA_KEYS.toggle` is `[]` too.

So `{gift_wrap.price}` passes validation today and has nothing to resolve to. The spec's table says it should return "the option price if selected", but there is no option and no place in the schema to put one.

**Decision: remove `toggle` from `PRICE_BEARING_TYPES` in both languages.** A toggle already returns `1`/`0`, so pricing one is `{gift_wrap} * 15` — which is shorter than `{gift_wrap.price}`, needs no schema change, and reads more clearly.

The alternative — adding a `price` key to toggle fields — means a schema change, a validator change, a builder control and a migration concern, for something multiplication already expresses.

Nothing has shipped (the branch has zero commits), so no stored schema can be relying on the old behaviour. One existing PHPUnit case asserts a toggle is price-bearing; update it to assert the opposite and **call it out in your report** as a deliberate behaviour change, not a fix.

Update the spec's §7.3 table in the same task so the document and the code agree, with one sentence recording why.

- [ ] **Step 1: Write the failing tests**

`tests/js/frontend/values.test.js`:

```js
import { variablesFor } from '../../../frontend-src/runtime/values';

const field = ( key, type, extra = {} ) => ( { key, type, label: key, ...extra } );

const options = [
	{ label: 'Standard', value: 'standard', price: 0 },
	{ label: 'Express', value: 'express', price: 60 },
	{ label: 'Gift wrap', value: 'gift_wrap', price: 15 },
];

const schema = {
	fields: {
		rooms: field( 'rooms', 'number' ),
		area: field( 'area', 'slider' ),
		gift: field( 'gift', 'toggle' ),
		urgency: field( 'urgency', 'select', { options } ),
		plan: field( 'plan', 'radio', { options } ),
		extras: field( 'extras', 'checkbox', { options } ),
		notes: field( 'notes', 'textarea' ),
		when: field( 'when', 'date' ),
	},
};

const allVisible = () => new Set( Object.keys( schema.fields ) );

describe( 'variablesFor', () => {
	it( 'returns numbers for number and slider fields', () => {
		const vars = variablesFor( schema, { rooms: '3', area: '55.5' }, allVisible() );

		expect( vars.rooms ).toBe( 3 );
		expect( vars.area ).toBe( 55.5 );
	} );

	it( 'returns 1 or 0 for a toggle', () => {
		expect( variablesFor( schema, { gift: true }, allVisible() ).gift ).toBe( 1 );
		expect( variablesFor( schema, { gift: false }, allVisible() ).gift ).toBe( 0 );
	} );

	it( 'returns the selected value for select and radio', () => {
		const vars = variablesFor( schema, { urgency: 'express', plan: 'standard' }, allVisible() );

		expect( vars.urgency ).toBe( 'express' );
		expect( vars.plan ).toBe( 'standard' );
	} );

	it( 'returns the selected option price for select and radio', () => {
		const vars = variablesFor( schema, { urgency: 'express', plan: 'standard' }, allVisible() );

		expect( vars[ 'urgency.price' ] ).toBe( 60 );
		expect( vars[ 'plan.price' ] ).toBe( 0 );
	} );

	it( 'returns an array for a checkbox and the sum of its prices', () => {
		const vars = variablesFor( schema, { extras: [ 'express', 'gift_wrap' ] }, allVisible() );

		expect( vars.extras ).toEqual( [ 'express', 'gift_wrap' ] );
		expect( vars[ 'extras.price' ] ).toBe( 75 );
	} );

	it( 'returns an empty array and a zero price for an untouched checkbox', () => {
		const vars = variablesFor( schema, {}, allVisible() );

		expect( vars.extras ).toEqual( [] );
		expect( vars[ 'extras.price' ] ).toBe( 0 );
	} );

	it( 'returns strings for text-like fields and dates', () => {
		const vars = variablesFor( schema, { notes: 'hello', when: '2026-09-17' }, allVisible() );

		expect( vars.notes ).toBe( 'hello' );
		expect( vars.when ).toBe( '2026-09-17' );
	} );

	it( 'resolves an unfilled field to an empty string, not to zero', () => {
		const vars = variablesFor( schema, {}, allVisible() );

		expect( vars.rooms ).toBe( '' );
		expect( vars.notes ).toBe( '' );
	} );

	it( 'gives no price variable to a type that cannot carry one', () => {
		const vars = variablesFor( schema, { rooms: '3', gift: true }, allVisible() );

		expect( vars ).not.toHaveProperty( 'rooms.price' );
		expect( vars ).not.toHaveProperty( 'gift.price' );
	} );

	it( 'resolves a hidden field to empty and its price to zero', () => {
		const visible = allVisible();
		visible.delete( 'urgency' );
		visible.delete( 'extras' );

		const vars = variablesFor(
			schema,
			{ urgency: 'express', extras: [ 'gift_wrap' ] },
			visible
		);

		expect( vars.urgency ).toBe( '' );
		expect( vars[ 'urgency.price' ] ).toBe( 0 );
		expect( vars.extras ).toEqual( [] );
		expect( vars[ 'extras.price' ] ).toBe( 0 );
	} );

	it( 'ignores a selected value that is not among the options', () => {
		const vars = variablesFor( schema, { urgency: 'deleted_option' }, allVisible() );

		expect( vars.urgency ).toBe( 'deleted_option' );
		expect( vars[ 'urgency.price' ] ).toBe( 0 );
	} );

	it( 'treats a non-numeric entry in a number field as unfilled', () => {
		const vars = variablesFor( schema, { rooms: 'abc' }, allVisible() );

		expect( vars.rooms ).toBe( '' );
	} );
} );
```

Three of these carry most of the weight:

- `resolves a hidden field to empty and its price to zero` is spec §8.1 behaviour 1, the single most-reported bug class in form plugins. It is implemented **here**, once, so every consumer inherits it rather than each remembering.
- `resolves an unfilled field to an empty string, not to zero` is the row the table describes and the resolver must not implement.
- `ignores a selected value that is not among the options` is what happens when a site owner deletes an option that a visitor's stale page still has selected. The value survives for display, the price is `0`, and nothing throws.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern values`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

`frontend-src/runtime/values.js`:

```js
const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox' ];
const NUMERIC_TYPES = [ 'number', 'slider' ];
const MULTI_TYPES = [ 'checkbox' ];

const NUMERIC_STRING = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function optionPrice( field, value ) {
	const options = Array.isArray( field.options ) ? field.options : [];
	const match = options.find( ( option ) => option.value === value );

	return match && typeof match.price === 'number' ? match.price : 0;
}

function rawValue( field, state ) {
	const stored = state[ field.key ];

	if ( MULTI_TYPES.indexOf( field.type ) !== -1 ) {
		return Array.isArray( stored ) ? stored : [];
	}

	if ( field.type === 'toggle' ) {
		return stored === true || stored === 1 || stored === '1' ? 1 : 0;
	}

	if ( stored === undefined || stored === null || stored === '' ) {
		return '';
	}

	if ( NUMERIC_TYPES.indexOf( field.type ) !== -1 ) {
		return NUMERIC_STRING.test( String( stored ) ) ? Number( stored ) : '';
	}

	return String( stored );
}

export function variablesFor( schema, state, visibleFields ) {
	const fields = schema.fields || {};
	const variables = {};

	Object.keys( fields ).forEach( ( key ) => {
		const field = fields[ key ];
		const visible = visibleFields.has( key );
		const value = visible ? rawValue( field, state ) : emptyFor( field );

		variables[ key ] = value;

		if ( PRICE_BEARING_TYPES.indexOf( field.type ) === -1 ) {
			return;
		}

		if ( MULTI_TYPES.indexOf( field.type ) !== -1 ) {
			variables[ `${ key }.price` ] = value.reduce(
				( total, selected ) => total + optionPrice( field, selected ),
				0
			);

			return;
		}

		variables[ `${ key }.price` ] = value === '' ? 0 : optionPrice( field, value );
	} );

	return variables;
}

function emptyFor( field ) {
	return MULTI_TYPES.indexOf( field.type ) !== -1 ? [] : '';
}
```

`NUMERIC_STRING` already exists in `frontend-src/engine/values.js`, where a long comment explains that the PHP twin needs a `D` modifier the JavaScript does not — but it is **module-private there, not exported**. Add `export` to it and import it here. Do not copy the pattern: two copies of a regex whose correctness depends on a subtle cross-language parity argument is exactly the kind of duplication that drifts silently. Exporting a const changes no behaviour, and the engine's own tests will confirm that.

`rawValue` returns `''` rather than `0` for a number field containing text, because a half-typed `-` or `1e` is not a number yet and must not price the form as zero-and-valid.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest --selectProjects frontend --testPathPattern values`
Expected: PASS, 12 tests.

- [ ] **Step 5: Remove `toggle` from the price-bearing types**

`includes/Forms/CalculationValidator.php`:

```php
    /** @var string[] `.price` şəkilçisi yalnız bu tiplərdə mənalıdır (spec §7.3). */
    private const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox' ];
```

`admin-src/state/fields.js`:

```js
/** `CalculationValidator::PRICE_BEARING_TYPES`-in eynisi (spec §7.3). */
export const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox' ];
```

**There is no PHPUnit case asserting a toggle accepts `.price`** — the controller checked before dispatching, so do not spend time hunting for one. What does exist, and must change with it:

`admin-src/panels/FormulaEditor.js` carries the user-facing message

```
'Only “.price” works here, and only on a dropdown, radio, checkbox or toggle field: %s.'
```

Drop `toggle` from it, so it reads `…on a dropdown, radio or checkbox field: %s.` Three assertions in `tests/js/admin/FormulaEditor.test.js` quote that message verbatim and must be updated with it.

This is the visible half of the change: the constant decides what validates, and this sentence is what tells a site owner why. Changing one without the other leaves the builder explaining a rule it no longer enforces. List every test you changed in your report with its before and after.

- [ ] **Step 6: Correct spec §7.3**

In `docs/superpowers/specs/2026-09-15-quoteform-design.md`, change the `toggle` row's `{key.price}` cell from an option price to `—`, and add one sentence beneath the table:

> `toggle` has no options, so it carries no price of its own; multiply instead — `{gift_wrap} * 15`.

- [ ] **Step 7: Run everything**

Run: `npm run build && make check`
Expected: all suites green, including both PHP versions.

- [ ] **Step 8: Prepare a commit message**

```
feat(renderer): resolve field values into engine variables
```

Do not run `git commit`.

---
### Task 7: Conditions compile into the engine

Spec §8, decision D1. Ten operators become expression source that the existing engine evaluates. No second logic engine.

**Files:**
- Create: `frontend-src/runtime/conditions.js`
- Test: `tests/js/frontend/conditions.test.js`

**Interfaces:**
- Consumes: `evaluateExpression` from `frontend-src/engine`; `contains` and `is_empty` from Task 1
- Produces: `conditionHolds( condition, variables, schema ) → boolean` and `ruleFires( rule, variables, schema ) → boolean`
- Also produces, by extracting it from Task 6's code: `normaliseValue( field, raw )` exported from `frontend-src/runtime/values.js`

**The condition's value must be normalised to its field's type first — this is not optional.**

The builder stores a condition's `value` through a plain text control (`admin-src/panels/RuleConditionRow.js`), so it is **always a string**, and `RuleValidator` does not type it either. Task 6's resolver returns a **number** for `number`, `slider` and `toggle` fields, exactly as spec §7.3 requires.

`equals()` (`frontend-src/engine/values.js`) returns `false` immediately when the two operands' types differ, because spec §7.5 forbids implicit coercion. So a site owner's rule *"rooms equals 3"* compares the number `3` against the string `'3'` and is **permanently false** — and so is *"gift equals 1"*. Left unhandled, conditional logic silently never fires on any numeric or toggle field, which is most of what a quote calculator is built from.

Normalise the value the same way the field's own value is normalised: look the field up in the schema, and put `condition.value` through the same type rules `frontend-src/runtime/values.js` applies to that field's type. Like compares to like, and the no-coercion rule keeps its teeth for the cases it was written for.

**The normaliser has to be extracted before it can be shared.** Task 6 put the per-type rules inside `rawValue( field, state )`, which reads `state[ field.key ]` and then normalises it. A condition's value is a bare value with no state to read it from, so `rawValue` is not reusable as it stands.

Split it: `normaliseValue( field, raw )` holds the type rules and is **exported**, and `rawValue( field, state )` becomes a two-line caller that looks the value up and hands it over. Nothing about Task 6's behaviour changes — its twelve tests must still pass untouched, and if any of them needs editing, stop and say so, because that would mean the split changed semantics.

Then normalise the condition's value with the same function. Reimplementing the type table here instead would be two copies of it, which is precisely the drift spec §7.5 exists to prevent.

The valueless operators (`is_empty`, `is_not_empty`) carry no value and need none of this.

**The value never goes into the expression text.** A condition's `value` comes from the schema, which comes from a site owner typing into the builder. Building `{urgency} == "express"` by string concatenation means deciding what happens when the value contains `"`, `\`, a newline, or `{`. Every one of those is a parse error at a visitor's browser, for a form that saved cleanly.

Instead the value is passed as a **variable**:

```
{urgency} == {__value}
```

with `__value` supplied in the variables map for that one evaluation. The lexer accepts a leading underscore (`isIdentifierStart` allows `_`), and field keys must match `^[a-z][a-z0-9_]{0,63}$` — lowercase, first character a letter — so `__value` **cannot collide with any field key**. The value also keeps its type: a numeric condition value stays a number rather than becoming a quoted string that compares as text.

This is the same reasoning as the no-`eval` rule one level down: do not build code out of data when you can pass the data.

**The ten operators:**

| Operator | Expression source |
|---|---|
| `equals` | `{field} == {__value}` |
| `not_equals` | `{field} != {__value}` |
| `greater` | `{field} > {__value}` |
| `greater_or_equal` | `{field} >= {__value}` |
| `less` | `{field} < {__value}` |
| `less_or_equal` | `{field} <= {__value}` |
| `contains` | `contains({field}, {__value})` |
| `not_contains` | `!contains({field}, {__value})` |
| `is_empty` | `is_empty({field})` |
| `is_not_empty` | `!is_empty({field})` |

- [ ] **Step 1: Write the failing tests**

`tests/js/frontend/conditions.test.js`:

```js
import { conditionHolds, ruleFires } from '../../../frontend-src/runtime/conditions';

const condition = ( field, operator, value ) =>
	value === undefined ? { field, operator } : { field, operator, value };

describe( 'conditionHolds', () => {
	it( 'compares equality without coercing types', () => {
		expect( conditionHolds( condition( 'a', 'equals', 'express' ), { a: 'express' } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'equals', 'express' ), { a: 'standard' } ) ).toBe( false );
		expect( conditionHolds( condition( 'a', 'equals', 5 ), { a: '5' } ) ).toBe( false );
	} );

	it( 'handles the five ordering operators numerically', () => {
		expect( conditionHolds( condition( 'a', 'not_equals', 2 ), { a: 3 } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'greater', 2 ), { a: 3 } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'greater_or_equal', 3 ), { a: 3 } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'less', 4 ), { a: 3 } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'less_or_equal', 3 ), { a: 3 } ) ).toBe( true );
	} );

	it( 'tests membership of a checkbox array', () => {
		expect( conditionHolds( condition( 'a', 'contains', 'gift' ), { a: [ 'gift', 'express' ] } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'contains', 'none' ), { a: [ 'gift' ] } ) ).toBe( false );
		expect( conditionHolds( condition( 'a', 'not_contains', 'none' ), { a: [ 'gift' ] } ) ).toBe( true );
	} );

	it( 'tests emptiness without treating zero as empty', () => {
		expect( conditionHolds( condition( 'a', 'is_empty' ), { a: '' } ) ).toBe( true );
		expect( conditionHolds( condition( 'a', 'is_empty' ), { a: 0 } ) ).toBe( false );
		expect( conditionHolds( condition( 'a', 'is_not_empty' ), { a: 'x' } ) ).toBe( true );
	} );

	it( 'passes a value containing quotes and braces through untouched', () => {
		const awkward = 'he said "go" \\ {rooms}';

		expect( conditionHolds( condition( 'a', 'equals', awkward ), { a: awkward } ) ).toBe( true );
	} );

	it( 'is false rather than throwing when the operator is unknown', () => {
		expect( conditionHolds( condition( 'a', 'sideways', 1 ), { a: 1 } ) ).toBe( false );
	} );

	it( 'is false rather than throwing when the field no longer exists', () => {
		expect( conditionHolds( condition( 'ghost', 'equals', 'x' ), {} ) ).toBe( false );
	} );

	it( 'compares a number field against the string the builder stored', () => {
		expect( conditionHolds( condition( 'rooms', 'equals', '3' ), { rooms: 3 }, schema ) ).toBe( true );
		expect( conditionHolds( condition( 'rooms', 'greater', '2' ), { rooms: 3 }, schema ) ).toBe( true );
		expect( conditionHolds( condition( 'rooms', 'equals', '4' ), { rooms: 3 }, schema ) ).toBe( false );
	} );

	it( 'compares a toggle against the string the builder stored', () => {
		expect( conditionHolds( condition( 'gift', 'equals', '1' ), { gift: 1 }, schema ) ).toBe( true );
		expect( conditionHolds( condition( 'gift', 'equals', '0' ), { gift: 0 }, schema ) ).toBe( true );
	} );

	it( 'leaves a text field comparing as text', () => {
		expect( conditionHolds( condition( 'urgency', 'equals', 'express' ), { urgency: 'express' }, schema ) ).toBe( true );
		expect( conditionHolds( condition( 'urgency', 'equals', '5' ), { urgency: '5' }, schema ) ).toBe( true );
	} );
} );

describe( 'ruleFires', () => {
	const rule = ( match, conditions ) => ( {
		target: { kind: 'field', key: 'target' },
		action: 'show',
		match,
		conditions,
	} );

	it( 'requires every condition when match is all', () => {
		const conditions = [ condition( 'a', 'equals', 1 ), condition( 'b', 'equals', 2 ) ];

		expect( ruleFires( rule( 'all', conditions ), { a: 1, b: 2 } ) ).toBe( true );
		expect( ruleFires( rule( 'all', conditions ), { a: 1, b: 9 } ) ).toBe( false );
	} );

	it( 'requires one condition when match is any', () => {
		const conditions = [ condition( 'a', 'equals', 1 ), condition( 'b', 'equals', 2 ) ];

		expect( ruleFires( rule( 'any', conditions ), { a: 1, b: 9 } ) ).toBe( true );
		expect( ruleFires( rule( 'any', conditions ), { a: 9, b: 9 } ) ).toBe( false );
	} );

	it( 'does not fire on an empty condition list', () => {
		expect( ruleFires( rule( 'all', [] ), {} ) ).toBe( false );
		expect( ruleFires( rule( 'any', [] ), {} ) ).toBe( false );
	} );
} );
```

`conditionHolds` therefore takes the schema as a third argument, so it can look up the field's type. The three normalisation tests above are the ones that would have caught the defect: without them, `conditionHolds( { field: 'rooms', operator: 'equals', value: '3' }, { rooms: 3 } )` returns `false` and a form's entire conditional logic quietly stops working.

Two more are the ones that matter most:

- `passes a value containing quotes and braces through untouched` is the whole argument for passing the value as a variable. Any implementation that builds the expression by concatenation fails it, and it fails in a way a site owner would otherwise only discover in production.
- `does not fire on an empty condition list` fixes a genuine ambiguity. A vacuous `all` is conventionally true, which would make a rule with no conditions hide its target permanently the moment a site owner deletes the last condition. Both modes return `false`, so an unfinished rule does nothing.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern conditions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the compiler**

`frontend-src/runtime/conditions.js`:

```js
import { evaluateExpression } from '../engine';

import { normaliseValue } from './values';

const VALUE = '__value';

const SOURCES = {
	equals: `{%s} == {${ VALUE }}`,
	not_equals: `{%s} != {${ VALUE }}`,
	greater: `{%s} > {${ VALUE }}`,
	greater_or_equal: `{%s} >= {${ VALUE }}`,
	less: `{%s} < {${ VALUE }}`,
	less_or_equal: `{%s} <= {${ VALUE }}`,
	contains: `contains({%s}, {${ VALUE }})`,
	not_contains: `!contains({%s}, {${ VALUE }})`,
	is_empty: 'is_empty({%s})',
	is_not_empty: '!is_empty({%s})',
};

function resolveValue( condition, schema ) {
	if ( condition.value === undefined ) {
		return '';
	}

	const field = schema && schema.fields ? schema.fields[ condition.field ] : undefined;

	return field ? normaliseValue( field, condition.value ) : condition.value;
}

export function conditionHolds( condition, variables, schema ) {
	const template = SOURCES[ condition.operator ];

	if ( ! template ) {
		return false;
	}

	const source = template.replace( '%s', condition.field );

	try {
		return Boolean(
			evaluateExpression( source, {
				...variables,
				[ VALUE ]: resolveValue( condition, schema ),
			} )
		);
	} catch ( error ) {
		return false;
	}
}

export function ruleFires( rule, variables, schema ) {
	const conditions = Array.isArray( rule.conditions ) ? rule.conditions : [];

	if ( conditions.length === 0 ) {
		return false;
	}

	if ( rule.match === 'any' ) {
		return conditions.some( ( condition ) => conditionHolds( condition, variables, schema ) );
	}

	return conditions.every( ( condition ) => conditionHolds( condition, variables, schema ) );
}
```

`condition.field` goes into the expression text, and that is safe for a different reason than the value: field keys are validated against `^[a-z][a-z0-9_]{0,63}$` on save, so they cannot contain a brace or a quote. **Say this in your report** rather than leaving a reader to wonder why one is interpolated and the other is not — and if you find a path where an unvalidated key could reach here, stop and report it.

The `catch` returning `false` is spec §14 level 2: a deleted field or a malformed condition makes the rule not fire, rather than breaking the page.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest --selectProjects frontend --testPathPattern conditions`
Expected: PASS, 10 tests.

- [ ] **Step 5: Prepare a commit message**

```
feat(renderer): compile rule conditions into the expression engine
```

Do not run `git commit`.

---

### Task 8: Visibility — the rule competitors get wrong, implemented once

Spec §8.1 names the two behaviours other form plugins routinely get wrong, and decision D5 makes them one rule with one implementation.

**Files:**
- Create: `frontend-src/runtime/visibility.js`
- Test: `tests/js/frontend/visibility.test.js`

**Interfaces:**
- Consumes: `ruleFires( rule, variables, schema )` (Task 7 — the third argument is required, see below), `variablesFor( schema, state, visibleFields )` (Task 6)
- Produces: `resolveVisibility( schema, state ) → { fields: Set, steps: Set, required: Set }`

**Three outputs, because three consumers need different things.** `fields` and `steps` drive rendering and are also what Task 6 reads back to zero out hidden values. `required` is the effective requiredness after `require`/`optional` rules, which validation reads — and which must exclude hidden fields entirely (§8.1 behaviour 2).

**`ruleFires` takes the schema, and omitting it breaks conditional logic silently.** Task 7 normalises a condition's stored value to its field's type before comparing, because the builder stores every condition value as a string while a `number`, `slider` or `toggle` field resolves to a number — and spec §7.5 forbids implicit coercion, so `3` never equals `'3'`. That normalisation needs the schema to look the field's type up. Call it with all three arguments; passing two makes every rule on a numeric or toggle field permanently false, and no test in *this* task would notice.

**The circularity, and why it iterates.** Hiding a field makes its value resolve to empty (D5), which can change whether another rule fires, which can hide something else. So visibility and values are mutually dependent and must be resolved to a fixed point.

D6 caps this at **10 passes**. If the cap is reached, keep the last state, log once, and leave the form usable. A cycle here is not a schema error the builder could have caught — it depends on what the visitor typed — so the correct behaviour is a stable arbitrary answer, not a broken form.

- [ ] **Step 1: Write the failing tests**

`tests/js/frontend/visibility.test.js`:

```js
import { resolveVisibility } from '../../../frontend-src/runtime/visibility';

const baseSchema = ( rules ) => ( {
	fields: {
		urgency: { key: 'urgency', type: 'select', label: 'Urgency', options: [
			{ label: 'Standard', value: 'standard', price: 0 },
			{ label: 'Express', value: 'express', price: 60 },
		] },
		notes: { key: 'notes', type: 'textarea', label: 'Notes', required: true },
		rooms: { key: 'rooms', type: 'number', label: 'Rooms' },
	},
	steps: [
		{ key: 'step_one', title: 'One', description: '', fields: [ 'urgency', 'rooms' ] },
		{ key: 'step_two', title: 'Two', description: '', fields: [ 'notes' ] },
	],
	calculations: [ { key: 'total', expression: '0', label: 'Total', visible: true } ],
	rules: rules || [],
} );

const rule = ( kind, key, action, conditions, match = 'all' ) => ( {
	target: { kind, key },
	action,
	match,
	conditions,
} );

describe( 'resolveVisibility', () => {
	it( 'shows everything when there are no rules', () => {
		const { fields, steps } = resolveVisibility( baseSchema(), {} );

		expect( [ ...fields ].sort() ).toEqual( [ 'notes', 'rooms', 'urgency' ] );
		expect( [ ...steps ].sort() ).toEqual( [ 'step_one', 'step_two' ] );
	} );

	it( 'hides a field when a hide rule fires', () => {
		const schema = baseSchema( [
			rule( 'field', 'notes', 'hide', [ { field: 'urgency', operator: 'equals', value: 'standard' } ] ),
		] );

		expect( resolveVisibility( schema, { urgency: 'standard' } ).fields.has( 'notes' ) ).toBe( false );
		expect( resolveVisibility( schema, { urgency: 'express' } ).fields.has( 'notes' ) ).toBe( true );
	} );

	it( 'hides a step, and its fields with it', () => {
		const schema = baseSchema( [
			rule( 'step', 'step_two', 'hide', [ { field: 'urgency', operator: 'equals', value: 'standard' } ] ),
		] );

		const resolved = resolveVisibility( schema, { urgency: 'standard' } );

		expect( resolved.steps.has( 'step_two' ) ).toBe( false );
		expect( resolved.fields.has( 'notes' ) ).toBe( false );
	} );

	it( 'makes a hidden required field not required', () => {
		const schema = baseSchema( [
			rule( 'field', 'notes', 'hide', [ { field: 'urgency', operator: 'equals', value: 'standard' } ] ),
		] );

		expect( resolveVisibility( schema, { urgency: 'standard' } ).required.has( 'notes' ) ).toBe( false );
		expect( resolveVisibility( schema, { urgency: 'express' } ).required.has( 'notes' ) ).toBe( true );
	} );

	it( 'applies require and optional rules to a visible field', () => {
		const required = baseSchema( [
			rule( 'field', 'rooms', 'require', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );
		const optional = baseSchema( [
			rule( 'field', 'notes', 'optional', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		expect( resolveVisibility( required, { urgency: 'express' } ).required.has( 'rooms' ) ).toBe( true );
		expect( resolveVisibility( optional, { urgency: 'express' } ).required.has( 'notes' ) ).toBe( false );
	} );

	it( 'ignores a require rule aimed at a step', () => {
		const schema = baseSchema( [
			rule( 'step', 'step_two', 'require', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		expect( () => resolveVisibility( schema, { urgency: 'express' } ) ).not.toThrow();
		expect( resolveVisibility( schema, { urgency: 'express' } ).steps.has( 'step_two' ) ).toBe( true );
	} );

	it( 'treats a hidden field as empty when a later rule tests it', () => {
		const schema = baseSchema( [
			rule( 'field', 'urgency', 'hide', [ { field: 'rooms', operator: 'greater', value: 2 } ] ),
			rule( 'field', 'notes', 'hide', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		const resolved = resolveVisibility( schema, { rooms: 5, urgency: 'express' } );

		expect( resolved.fields.has( 'urgency' ) ).toBe( false );
		expect( resolved.fields.has( 'notes' ) ).toBe( true );
	} );

	it( 'settles rather than hanging when two rules chase each other', () => {
		const schema = baseSchema( [
			rule( 'field', 'urgency', 'hide', [ { field: 'notes', operator: 'is_empty' } ] ),
			rule( 'field', 'notes', 'hide', [ { field: 'urgency', operator: 'is_empty' } ] ),
		] );

		const resolved = resolveVisibility( schema, { urgency: '', notes: '' } );

		expect( resolved.fields ).toBeInstanceOf( Set );
	} );

	it( 'lets the last rule win when two disagree', () => {
		const schema = baseSchema( [
			rule( 'field', 'rooms', 'hide', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
			rule( 'field', 'rooms', 'show', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		expect( resolveVisibility( schema, { urgency: 'express' } ).fields.has( 'rooms' ) ).toBe( true );
	} );

	it( 'ignores a rule aimed at something that no longer exists', () => {
		const schema = baseSchema( [
			rule( 'field', 'ghost', 'hide', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
			rule( 'step', 'ghost_step', 'hide', [ { field: 'urgency', operator: 'equals', value: 'express' } ] ),
		] );

		expect( () => resolveVisibility( schema, { urgency: 'express' } ) ).not.toThrow();
	} );
} );
```

`treats a hidden field as empty when a later rule tests it` is the test that forces the fixed-point loop. A single-pass implementation passes every other test in this file and fails that one — it would evaluate rule two against `urgency: 'express'` because rule one had not been applied yet.

`lets the last rule win when two disagree` settles an ambiguity the spec leaves open. Last-wins matches document order, which is the order the site owner sees in the builder's rules panel, so the resolution is visible to them rather than arbitrary.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern visibility`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

`frontend-src/runtime/visibility.js`:

```js
import { ruleFires } from './conditions';
import { variablesFor } from './values';

const MAX_PASSES = 10;

function initialState( schema ) {
	const fields = new Set( Object.keys( schema.fields || {} ) );
	const steps = new Set( ( schema.steps || [] ).map( ( step ) => step.key ) );
	const required = new Set(
		Object.keys( schema.fields || {} ).filter( ( key ) => schema.fields[ key ].required === true )
	);

	return { fields, steps, required };
}

function applyRules( schema, variables, resolved ) {
	( schema.rules || [] ).forEach( ( rule ) => {
		const target = rule.target || {};
		const isField = target.kind === 'field';
		const collection = isField ? resolved.fields : resolved.steps;
		const exists = isField
			? Object.prototype.hasOwnProperty.call( schema.fields || {}, target.key )
			: ( schema.steps || [] ).some( ( step ) => step.key === target.key );

		if ( ! exists || ! ruleFires( rule, variables, schema ) ) {
			return;
		}

		if ( rule.action === 'show' ) {
			collection.add( target.key );
		} else if ( rule.action === 'hide' ) {
			collection.delete( target.key );
		} else if ( isField && rule.action === 'require' ) {
			resolved.required.add( target.key );
		} else if ( isField && rule.action === 'optional' ) {
			resolved.required.delete( target.key );
		}
	} );
}

function dropHiddenSteps( schema, resolved ) {
	( schema.steps || [] ).forEach( ( step ) => {
		if ( resolved.steps.has( step.key ) ) {
			return;
		}

		( step.fields || [] ).forEach( ( key ) => resolved.fields.delete( key ) );
	} );
}

function dropRequiredForHiddenFields( resolved ) {
	[ ...resolved.required ].forEach( ( key ) => {
		if ( ! resolved.fields.has( key ) ) {
			resolved.required.delete( key );
		}
	} );
}

function signature( resolved ) {
	return [
		[ ...resolved.fields ].sort().join( ',' ),
		[ ...resolved.steps ].sort().join( ',' ),
		[ ...resolved.required ].sort().join( ',' ),
	].join( '|' );
}

export function resolveVisibility( schema, state ) {
	let resolved = initialState( schema );
	let previous = '';

	for ( let pass = 0; pass < MAX_PASSES; pass++ ) {
		const variables = variablesFor( schema, state, resolved.fields );

		resolved = initialState( schema );
		applyRules( schema, variables, resolved );
		dropHiddenSteps( schema, resolved );
		dropRequiredForHiddenFields( resolved );

		const current = signature( resolved );

		if ( current === previous ) {
			return resolved;
		}

		previous = current;
	}

	// eslint-disable-next-line no-console
	console.warn( '[quoteform] visibility did not settle; using the last state.' );

	return resolved;
}
```

`dropRequiredForHiddenFields` runs **last** in each pass, after both `applyRules` and `dropHiddenSteps`, and it is what implements spec §8.1 behaviour 2. Without it a field hidden by a `hide` rule — or by its step being hidden — stays in `required`, and validation blocks on an error the visitor cannot see. An explicit `optional` rule is not the only way a required field stops being required; being invisible is the other, and it is the common one.

Each pass rebuilds from the schema's own defaults and re-applies every rule against the variables the *previous* pass produced. Rebuilding rather than mutating is what makes `show` able to undo a previous pass's `hide`; an implementation that accumulated deletions could never re-show anything.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest --selectProjects frontend --testPathPattern visibility`
Expected: PASS, 10 tests.

- [ ] **Step 5: Prepare a commit message**

```
feat(renderer): resolve field and step visibility from rules
```

Do not run `git commit`.

---
### Task 9: Calculations, formatting and the breakdown

Spec §7.4 (the DAG), §9 (the breakdown on the last step), §14 level 2 (a runtime error never breaks the form) and D7 (the total is display-only).

**Files:**
- Create: `frontend-src/runtime/calculate.js`
- Create: `frontend-src/runtime/format.js`
- Test: `tests/js/frontend/calculate.test.js`
- Test: `tests/js/frontend/format.test.js`

**Interfaces:**
- Consumes: `evaluateAllCalculations` and `ExpressionError` from `frontend-src/engine`
- Produces: `calculate( schema, variables ) → { values, total, breakdown, error }` and `formatMoney( amount, settings ) → string`

**D7 restated as a prohibition, because this is the file where it could be violated.** The returned `total` is a number for display. Nothing in this module may write it into an input, a hidden field, or a `data-` attribute meant for transport. The next plan adds submission and the server recalculates from raw field values; a client-supplied total arriving with the submission would be a price a visitor can edit in DevTools.

- [ ] **Step 1: Write the failing formatting tests**

`tests/js/frontend/format.test.js`:

```js
import { formatMoney } from '../../../frontend-src/runtime/format';

const settings = ( overrides ) => ( {
	currency: 'USD',
	currency_position: 'before',
	decimals: 2,
	...overrides,
} );

describe( 'formatMoney', () => {
	it( 'puts the symbol before the amount', () => {
		expect( formatMoney( 1234.5, settings() ) ).toBe( '$1,234.50' );
	} );

	it( 'puts the symbol after the amount when asked', () => {
		expect( formatMoney( 1234.5, settings( { currency_position: 'after', currency: 'EUR' } ) ) ).toBe( '1,234.50 €' );
	} );

	it( 'honours the decimal setting', () => {
		expect( formatMoney( 1234.567, settings( { decimals: 0 } ) ) ).toBe( '$1,235' );
		expect( formatMoney( 1234.5, settings( { decimals: 3 } ) ) ).toBe( '$1,234.500' );
	} );

	it( 'rounds half away from zero, matching the engine', () => {
		expect( formatMoney( 2.5, settings( { decimals: 0 } ) ) ).toBe( '$3' );
		expect( formatMoney( -2.5, settings( { decimals: 0 } ) ) ).toBe( '-$3' );
	} );

	it( 'falls back to the currency code when there is no known symbol', () => {
		expect( formatMoney( 10, settings( { currency: 'XYZ' } ) ) ).toBe( 'XYZ10.00' );
	} );

	it( 'shows a dash rather than NaN when the amount is not a number', () => {
		expect( formatMoney( null, settings() ) ).toBe( '—' );
		expect( formatMoney( NaN, settings() ) ).toBe( '—' );
	} );
} );
```

`rounds half away from zero, matching the engine` is the one that matters. `Math.round( -2.5 )` is `-2` in JavaScript and `-3` in PHP, and spec §7.5 calls that out as a named parity hazard. The engine already exports `roundHalfAwayFromZero` for exactly this — **import it rather than writing a second rounding rule.** A display that rounds differently from the engine shows one number and stores another, which is the §7.5 failure in its most visible form.

- [ ] **Step 2: Write the failing calculation tests**

`tests/js/frontend/calculate.test.js`:

```js
import { calculate } from '../../../frontend-src/runtime/calculate';

const schema = ( calculations ) => ( {
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	calculations,
} );

const chain = [
	{ key: 'subtotal', expression: '{rooms} * 50', label: 'Subtotal', visible: true },
	{ key: 'fee', expression: '{subtotal} * 0.1', label: 'Service fee', visible: false },
	{ key: 'total', expression: '{subtotal} + {fee}', label: 'Total', visible: true },
];

describe( 'calculate', () => {
	it( 'resolves calculations that depend on each other', () => {
		const result = calculate( schema( chain ), { rooms: 2 } );

		expect( result.values.subtotal ).toBe( 100 );
		expect( result.values.fee ).toBe( 10 );
		expect( result.total ).toBe( 110 );
	} );

	it( 'includes invisible calculations in the maths but not the breakdown', () => {
		const result = calculate( schema( chain ), { rooms: 2 } );

		expect( result.breakdown.map( ( row ) => row.key ) ).toEqual( [ 'subtotal', 'total' ] );
		expect( result.values.fee ).toBe( 10 );
	} );

	it( 'formats every breakdown row', () => {
		const result = calculate( schema( chain ), { rooms: 2 } );

		expect( result.breakdown[ 0 ] ).toEqual( { key: 'subtotal', label: 'Subtotal', amount: 100, formatted: '$100.00' } );
	} );

	it( 'reports a runtime error instead of throwing', () => {
		const result = calculate(
			schema( [ { key: 'total', expression: '{rooms} / 0', label: 'Total', visible: true } ] ),
			{ rooms: 2 }
		);

		expect( result.error ).toBe( 'division_by_zero' );
		expect( result.total ).toBeNull();
		expect( result.breakdown ).toEqual( [] );
	} );

	it( 'reports a reference to a field that no longer exists', () => {
		const result = calculate(
			schema( [ { key: 'total', expression: '{ghost} * 2', label: 'Total', visible: true } ] ),
			{}
		);

		expect( result.error ).toBe( 'unknown_variable' );
		expect( result.total ).toBeNull();
	} );

	it( 'reports a circular reference rather than looping', () => {
		const result = calculate(
			schema( [
				{ key: 'a', expression: '{b}', label: 'A', visible: true },
				{ key: 'b', expression: '{a}', label: 'B', visible: true },
				{ key: 'total', expression: '0', label: 'Total', visible: true },
			] ),
			{}
		);

		expect( result.error ).toBe( 'circular_reference' );
	} );

	it( 'returns a null total when the schema has no total calculation', () => {
		const result = calculate(
			schema( [ { key: 'subtotal', expression: '10', label: 'Subtotal', visible: true } ] ),
			{}
		);

		expect( result.total ).toBeNull();
		expect( result.error ).toBeNull();
	} );

	it( 'never returns the total as a string', () => {
		const result = calculate( schema( chain ), { rooms: 2 } );

		expect( typeof result.total ).toBe( 'number' );
	} );
} );
```

`includes invisible calculations in the maths but not the breakdown` is the spec §11 rule from the other side: the invisible `fee` is sent to the page and used, and the visitor never sees a row for it.

`returns a null total when the schema has no total calculation` covers a form saved before `total` was required, or one whose `total` was renamed. The server would reject it on save today, but a page can be open with an older schema.

- [ ] **Step 3: Run both and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern 'calculate|format'`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement formatting**

`frontend-src/runtime/format.js`:

```js
import { roundHalfAwayFromZero } from '../engine/functions';

const SYMBOLS = {
	USD: '$',
	EUR: '€',
	GBP: '£',
	JPY: '¥',
	AUD: 'A$',
	CAD: 'C$',
	CHF: 'CHF',
	SEK: 'kr',
	NOK: 'kr',
	DKK: 'kr',
	PLN: 'zł',
	TRY: '₺',
	AZN: '₼',
	RUB: '₽',
	INR: '₹',
	BRL: 'R$',
	ZAR: 'R',
	NZD: 'NZ$',
};

export function formatMoney( amount, settings ) {
	if ( typeof amount !== 'number' || ! isFinite( amount ) ) {
		return '—';
	}

	const decimals = Number.isInteger( settings.decimals ) ? settings.decimals : 2;
	const rounded = roundHalfAwayFromZero( amount, decimals );
	const symbol = SYMBOLS[ settings.currency ] || settings.currency || '';
	const negative = rounded < 0;

	const digits = Math.abs( rounded ).toLocaleString( documentLocale(), {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	} );

	const body = settings.currency_position === 'after' ? `${ digits } ${ symbol }` : `${ symbol }${ digits }`;

	return negative ? `-${ body }` : body;
}

function documentLocale() {
	const lang = typeof document !== 'undefined' ? document.documentElement.lang : '';

	return lang || 'en-US';
}
```

`roundHalfAwayFromZero` is imported from the engine, not reimplemented. The sign is taken off before formatting and put back afterwards so that a negative amount reads `-$3` rather than `$-3`.

If `frontend-src/engine/functions.js` does not export `roundHalfAwayFromZero`, add the export — it already exists as a named function in that file.

- [ ] **Step 5: Implement calculation**

`frontend-src/runtime/calculate.js`:

```js
import { evaluateAllCalculations } from '../engine';

import { formatMoney } from './format';

const TOTAL_KEY = 'total';

export function calculate( schema, variables ) {
	const calculations = Array.isArray( schema.calculations ) ? schema.calculations : [];
	const settings = schema.settings || {};

	let values;

	try {
		values = evaluateAllCalculations( calculations, variables );
	} catch ( error ) {
		return {
			values: null,
			total: null,
			breakdown: [],
			error: error && error.codeSlug ? error.codeSlug : 'calculation_failed',
		};
	}

	const total = typeof values[ TOTAL_KEY ] === 'number' ? values[ TOTAL_KEY ] : null;

	const breakdown = calculations
		.filter( ( calculation ) => calculation.visible === true )
		.map( ( calculation ) => ( {
			key: calculation.key,
			label: calculation.label,
			amount: typeof values[ calculation.key ] === 'number' ? values[ calculation.key ] : null,
			formatted: formatMoney( values[ calculation.key ], settings ),
		} ) );

	return { values, total, breakdown, error: null };
}
```

`error` carries the engine's `codeSlug`, not its message — consumers key off the code, never the text (Global Constraints). The fallback `'calculation_failed'` covers a throw that is not an `ExpressionError`.

- [ ] **Step 6: Run both and watch them pass**

Run: `npx jest --selectProjects frontend --testPathPattern 'calculate|format'`
Expected: PASS, 6 formatting tests and 8 calculation tests.

- [ ] **Step 7: Prepare a commit message**

```
feat(renderer): evaluate calculations and format the breakdown
```

Do not run `git commit`.

---

### Task 10: The thirteen field controls

One builder per field type. They produce DOM only — no state, no rules, no calculation. Spec §16 makes the label and error wiring a requirement rather than a nicety.

**Files:**
- Create: `frontend-src/dom/controls.js`
- Test: `tests/js/frontend/controls.test.js`

**Interfaces:**
- Produces: `buildControl( field, formId ) → { wrapper, input, setError }`

**Every control, without exception:**

- a `<label>` bound by `for`/`id`, and the id is namespaced by form id so two forms on one page do not collide
- `aria-describedby` pointing at the help text and, when set, the error — the same pattern the builder uses
- `aria-invalid="true"` only while an error is shown
- `required` reflected as `aria-required`, never as the HTML `required` attribute, because effective requiredness is decided by rules at runtime (Task 8) and the browser's own validation would fight it
- a `setError( message | null )` function, so Task 13 never touches DOM structure

`hidden` renders an `<input type="hidden">` with **neither a label nor a help paragraph** — there is nothing for a visitor to read, so both would be noise in the accessibility tree. `html` renders its `content` as markup — the content was sanitised with `wp_kses_post` on save, so it is safe to inject, and re-escaping it here would show the visitor literal tags. **Use `innerHTML` for that one type only, and say so in your report.**

- [ ] **Step 1: Write the failing tests**

`tests/js/frontend/controls.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { buildControl } from '../../../frontend-src/dom/controls';

const field = ( type, extra = {} ) => ( {
	key: 'rooms',
	type,
	label: 'How many rooms?',
	help: 'Count bedrooms only.',
	placeholder: '',
	required: false,
	default: '',
	...extra,
} );

const options = [
	{ label: 'Standard', value: 'standard', price: 0 },
	{ label: 'Express', value: 'express', price: 60 },
];

describe( 'buildControl', () => {
	it( 'binds the label to the input', () => {
		const { wrapper, input } = buildControl( field( 'text' ), 12 );

		const label = wrapper.querySelector( 'label' );

		expect( label.getAttribute( 'for' ) ).toBe( input.id );
		expect( label.textContent ).toContain( 'How many rooms?' );
	} );

	it( 'namespaces ids by form so two forms do not collide', () => {
		const first = buildControl( field( 'text' ), 12 );
		const second = buildControl( field( 'text' ), 13 );

		expect( first.input.id ).not.toBe( second.input.id );
	} );

	it( 'describes the input with its help text', () => {
		const { wrapper, input } = buildControl( field( 'text' ), 12 );

		const help = wrapper.querySelector( '.quoteform_help' );

		expect( input.getAttribute( 'aria-describedby' ) ).toContain( help.id );
	} );

	it( 'marks a required field with aria-required and not with required', () => {
		const { input } = buildControl( field( 'text', { required: true } ), 12 );

		expect( input.getAttribute( 'aria-required' ) ).toBe( 'true' );
		expect( input.hasAttribute( 'required' ) ).toBe( false );
	} );

	it( 'shows and clears an error, and wires it to the input', () => {
		const { wrapper, input, setError } = buildControl( field( 'text' ), 12 );

		setError( 'This field is required.' );

		const error = wrapper.querySelector( '.quoteform_error' );

		expect( error.textContent ).toBe( 'This field is required.' );
		expect( input.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
		expect( input.getAttribute( 'aria-describedby' ) ).toContain( error.id );

		setError( null );

		expect( wrapper.querySelector( '.quoteform_error' ).textContent ).toBe( '' );
		expect( input.hasAttribute( 'aria-invalid' ) ).toBe( false );
	} );

	it.each( [
		[ 'number', 'INPUT', 'number' ],
		[ 'text', 'INPUT', 'text' ],
		[ 'email', 'INPUT', 'email' ],
		[ 'tel', 'INPUT', 'tel' ],
		[ 'date', 'INPUT', 'date' ],
		[ 'slider', 'INPUT', 'range' ],
		[ 'toggle', 'INPUT', 'checkbox' ],
		[ 'hidden', 'INPUT', 'hidden' ],
	] )( 'renders %s as a %s of type %s', ( type, tag, inputType ) => {
		const { input } = buildControl( field( type ), 12 );

		expect( input.tagName ).toBe( tag );
		expect( input.type ).toBe( inputType );
	} );

	it( 'renders a textarea', () => {
		expect( buildControl( field( 'textarea' ), 12 ).input.tagName ).toBe( 'TEXTAREA' );
	} );

	it( 'renders a select with its options and a placeholder choice', () => {
		const { input } = buildControl( field( 'select', { options } ), 12 );

		expect( input.tagName ).toBe( 'SELECT' );
		expect( [ ...input.options ].map( ( option ) => option.value ) ).toEqual( [ '', 'standard', 'express' ] );
	} );

	it( 'renders radios as a fieldset with one input per option', () => {
		const { wrapper } = buildControl( field( 'radio', { options } ), 12 );

		expect( wrapper.querySelector( 'fieldset' ) ).not.toBeNull();
		expect( wrapper.querySelectorAll( 'input[type="radio"]' ) ).toHaveLength( 2 );
		expect( wrapper.querySelector( 'legend' ).textContent ).toContain( 'How many rooms?' );
	} );

	it( 'gives every radio in a group the same name and distinct ids', () => {
		const { wrapper } = buildControl( field( 'radio', { options } ), 12 );

		const radios = [ ...wrapper.querySelectorAll( 'input[type="radio"]' ) ];

		expect( new Set( radios.map( ( radio ) => radio.name ) ).size ).toBe( 1 );
		expect( new Set( radios.map( ( radio ) => radio.id ) ).size ).toBe( 2 );
	} );

	it( 'renders checkboxes as a fieldset with one input per option', () => {
		const { wrapper } = buildControl( field( 'checkbox', { options } ), 12 );

		expect( wrapper.querySelectorAll( 'input[type="checkbox"]' ) ).toHaveLength( 2 );
	} );

	it( 'renders an html block as markup rather than as text', () => {
		const { wrapper } = buildControl(
			{ key: 'intro', type: 'html', content: '<p>Read <strong>this</strong>.</p>' },
			12
		);

		expect( wrapper.querySelector( 'strong' ) ).not.toBeNull();
		expect( wrapper.textContent ).not.toContain( '<strong>' );
	} );

	it( 'gives a hidden field no label and no help', () => {
		const { wrapper } = buildControl( field( 'hidden' ), 12 );

		expect( wrapper.querySelector( 'label' ) ).toBeNull();
		expect( wrapper.querySelector( '.quoteform_help' ) ).toBeNull();
	} );

	it( 'applies min, max and step to number and slider fields', () => {
		const { input } = buildControl( field( 'number', { min: 1, max: 9, step: 0.5 } ), 12 );

		expect( input.min ).toBe( '1' );
		expect( input.max ).toBe( '9' );
		expect( input.step ).toBe( '0.5' );
	} );

	it( 'returns null for a type it does not recognise', () => {
		expect( buildControl( field( 'quantum' ), 12 ) ).toBeNull();
	} );
} );
```

**Two tests the first draft of this suite was missing, added after a reviewer killed neither with a one-line mutation.** Write them alongside the rest:

- `setError` on a **group** must fan out across *every* option input — `aria-invalid` and the error id in `aria-describedby` on all of them, and `setError( null )` reversing all of it on all of them. Without this, replacing `buildGroup`'s whole `setError` with a no-op survives the suite untouched. Assert across every option; asserting on the first one alone lets a partial no-op through.
- A freshly built control's `aria-describedby` must contain the help id and **not** the error id. Without this, an implementation that always lists the error id passes, and the "only while an error is shown" half of the contract is unguarded.

`gives every radio in a group the same name and distinct ids` is the one that catches the classic mistake: reusing the field id for every radio, which silently breaks label association so clicking a label focuses the wrong option.

`returns null for a type it does not recognise` is how a schema from a newer version degrades — the unknown field is skipped and the rest of the form renders, rather than the page dying.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern controls`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the controls**

`frontend-src/dom/controls.js` — build it around one shared wrapper and a per-type input builder. The shared part owns the label, the help paragraph, the error paragraph, the `aria-describedby` composition and `setError`; the per-type part owns only the input element.

The structure to follow:

```js
const SIMPLE_INPUTS = {
	number: 'number',
	text: 'text',
	email: 'email',
	tel: 'tel',
	date: 'date',
	slider: 'range',
	hidden: 'hidden',
	toggle: 'checkbox',
};

const GROUP_TYPES = [ 'radio', 'checkbox' ];

export function buildControl( field, formId ) {
	if ( field.type === 'html' ) {
		return buildHtmlBlock( field, formId );
	}

	if ( GROUP_TYPES.indexOf( field.type ) !== -1 ) {
		return buildGroup( field, formId );
	}

	if ( field.type === 'select' ) {
		return buildSelect( field, formId );
	}

	if ( Object.prototype.hasOwnProperty.call( SIMPLE_INPUTS, field.type ) ) {
		return buildSimple( field, formId );
	}

	if ( field.type === 'textarea' ) {
		return buildTextarea( field, formId );
	}

	return null;
}
```

Write each builder in full. Shared rules every one of them obeys:

- the input id is `quoteform_${ formId }_${ field.key }`, and a group's option ids append `_${ index }`
- the help paragraph's id is the input id plus `_help`, the error's plus `_error`
- **the class names are a contract, not a detail:** the wrapper is `quoteform_control`, the help paragraph `quoteform_help`, the error paragraph `quoteform_error`. The tests query by these, and Task 14's stylesheet targets them — an implementation that invents its own names passes nothing and styles nothing
- `aria-describedby` lists the help id always and the error id only while an error is set
- a group uses `<fieldset>` and `<legend>`, and the legend carries the label — a `<label>` cannot describe a set of radios
- `setError` writes text content, never `innerHTML`
- a `select` opens with an **empty-valued placeholder option** before the schema's own options, so an untouched select reads as "nothing chosen" rather than silently meaning the first option. Its label is the field's `placeholder` when one is set, and an em dash otherwise

The `html` type is the single exception to the escaping rule: its content was run through `wp_kses_post` when the form was saved, so assigning it with `innerHTML` renders the markup the site owner wrote. Escaping it would show them their own tags as text. Every other string from the schema — labels, help, placeholders, option labels — goes in with `textContent`.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest --selectProjects frontend --testPathPattern controls`
Expected: PASS, 24 tests (22 from the list above, plus the two gap-closing tests; the `it.each` block counts as eight).

- [ ] **Step 5: Prepare a commit message**

```
feat(renderer): build the thirteen field controls
```

Do not run `git commit`.

---
### Task 11: State, assembly and binding — the form becomes one object

This is where Tasks 6 to 10 become a working form. Everything before this was testable in isolation; this task is the integration point.

**Files:**
- Create: `frontend-src/runtime/state.js`
- Create: `frontend-src/dom/form.js`
- Create: `frontend-src/dom/bind.js`
- Modify: `frontend-src/index.js` (replace the Task 2 stub)
- Test: `tests/js/frontend/state.test.js`
- Test: `tests/js/frontend/form.test.js`

**Interfaces:**
- Consumes: `buildControl` (Task 10), `resolveVisibility` (Task 8), `variablesFor` (Task 6), `calculate` (Task 9)
- Produces: `createForm( container, schema ) → { destroy, getState, refresh }`, which `bootAll` already calls

**The 50ms debounce is a spec requirement (§18), not a nicety.** Every keystroke in a number field would otherwise re-resolve visibility (up to ten passes) and re-run the whole calculation DAG. Debounce the *recalculation*, never the state write — the value must land immediately so nothing can read a stale state.

**Defaults come from the schema, once.** Each field's `default` seeds the state at construction. Do not re-apply defaults on later refreshes: a visitor who clears a field means it to be empty.

- [ ] **Step 1: Write the failing state tests**

`tests/js/frontend/state.test.js`:

```js
import { createState } from '../../../frontend-src/runtime/state';

const schema = {
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', default: 1 },
		notes: { key: 'notes', type: 'textarea', label: 'Notes', default: '' },
		extras: { key: 'extras', type: 'checkbox', label: 'Extras', default: [] },
	},
};

describe( 'createState', () => {
	it( 'seeds itself from the schema defaults', () => {
		expect( createState( schema ).get() ).toEqual( { rooms: 1, notes: '', extras: [] } );
	} );

	it( 'notifies a subscriber when a value changes', () => {
		const state = createState( schema );
		const seen = [];

		state.subscribe( ( next ) => seen.push( next.rooms ) );
		state.set( 'rooms', 4 );

		expect( seen ).toEqual( [ 4 ] );
	} );

	it( 'does not notify when the value is unchanged', () => {
		const state = createState( schema );
		const seen = [];

		state.subscribe( () => seen.push( true ) );
		state.set( 'rooms', 1 );

		expect( seen ).toEqual( [] );
	} );

	it( 'treats an array value as changed only when its contents differ', () => {
		const state = createState( schema );
		const seen = [];

		state.subscribe( () => seen.push( true ) );
		state.set( 'extras', [] );
		state.set( 'extras', [ 'gift' ] );
		state.set( 'extras', [ 'gift' ] );

		expect( seen ).toHaveLength( 1 );
	} );

	it( 'hands out a copy, so a caller cannot mutate it from outside', () => {
		const state = createState( schema );

		state.get().rooms = 99;

		expect( state.get().rooms ).toBe( 1 );
	} );

	it( 'stops notifying after unsubscribe', () => {
		const state = createState( schema );
		const seen = [];
		const stop = state.subscribe( () => seen.push( true ) );

		stop();
		state.set( 'rooms', 7 );

		expect( seen ).toEqual( [] );
	} );
} );
```

`does not notify when the value is unchanged` is what stops a re-render loop: a repaint writes values back into inputs, which fires `input` events, which would write state again. Identity checking breaks that cycle at the source. This is the same no-op-identity discipline the builder's reducer uses, for the same reason.

- [ ] **Step 2: Write the failing assembly tests**

`tests/js/frontend/form.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

const schema = ( overrides ) => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', default: 1, required: false },
		urgency: {
			key: 'urgency',
			type: 'select',
			label: 'Urgency',
			help: '',
			default: '',
			required: false,
			options: [
				{ label: 'Standard', value: 'standard', price: 0 },
				{ label: 'Express', value: 'express', price: 60 },
			],
		},
	},
	steps: [ { key: 'step_one', title: 'Your property', description: '', fields: [ 'rooms', 'urgency' ] } ],
	calculations: [
		{ key: 'total', expression: '{rooms} * 50 + {urgency.price}', label: 'Total', visible: true },
	],
	rules: [],
	...overrides,
} );

const mount = ( custom ) => {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );

	return { container, form: createForm( container, custom || schema() ) };
};

describe( 'createForm', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'renders one control per field in the step', () => {
		const { container } = mount();

		expect( container.querySelector( '#quoteform_12_rooms' ) ).not.toBeNull();
		expect( container.querySelector( '#quoteform_12_urgency' ) ).not.toBeNull();
	} );

	it( 'shows the total from the schema defaults on first paint', () => {
		const { container } = mount();

		expect( container.querySelector( '[data-quoteform-total]' ).textContent ).toBe( '$50.00' );
	} );

	it( 'updates the total after the debounce when a value changes', () => {
		const { container } = mount();
		const input = container.querySelector( '#quoteform_12_rooms' );

		input.value = '3';
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );

		expect( container.querySelector( '[data-quoteform-total]' ).textContent ).toBe( '$50.00' );

		jest.advanceTimersByTime( 60 );

		expect( container.querySelector( '[data-quoteform-total]' ).textContent ).toBe( '$150.00' );
	} );

	it( 'prices a select through its option price', () => {
		const { container } = mount();
		const select = container.querySelector( '#quoteform_12_urgency' );

		select.value = 'express';
		select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( container.querySelector( '[data-quoteform-total]' ).textContent ).toBe( '$110.00' );
	} );

	it( 'hides a field when a rule says so, and removes it from the price', () => {
		const withRule = schema( {
			rules: [
				{
					target: { kind: 'field', key: 'urgency' },
					action: 'hide',
					match: 'all',
					conditions: [ { field: 'rooms', operator: 'greater', value: 2 } ],
				},
			],
		} );

		const { container } = mount( withRule );
		const select = container.querySelector( '#quoteform_12_urgency' );

		select.value = 'express';
		select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( container.querySelector( '[data-quoteform-total]' ).textContent ).toBe( '$110.00' );

		const rooms = container.querySelector( '#quoteform_12_rooms' );
		rooms.value = '3';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( container.querySelector( '#quoteform_12_urgency' ) ).toBeNull();
		expect( container.querySelector( '[data-quoteform-total]' ).textContent ).toBe( '$150.00' );
	} );

	it( 'hides the total and keeps the form usable when a formula breaks', () => {
		const broken = schema( {
			calculations: [ { key: 'total', expression: '{rooms} / 0', label: 'Total', visible: true } ],
		} );

		const { container } = mount( broken );

		expect( container.querySelector( '[data-quoteform-total]' ).hidden ).toBe( true );
		expect( container.querySelector( '#quoteform_12_rooms' ) ).not.toBeNull();
	} );

	it( 'writes no computed total into any input', () => {
		const { container } = mount();

		jest.advanceTimersByTime( 60 );

		const inputs = [ ...container.querySelectorAll( 'input, textarea, select' ) ];

		inputs.forEach( ( input ) => {
			expect( input.value ).not.toBe( '50' );
			expect( input.name ).not.toContain( 'total' );
		} );
	} );

	it( 'keeps the visitor typing position when an unrelated field repaints', () => {
		const { container } = mount();
		const notes = container.querySelector( '#quoteform_12_rooms' );

		notes.focus();
		notes.value = '2';
		notes.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );

		expect( document.activeElement ).toBe( container.querySelector( '#quoteform_12_rooms' ) );
	} );

	it( 'removes its listeners on destroy', () => {
		const { container, form } = mount();

		form.destroy();

		expect( container.innerHTML ).toBe( '' );
	} );
} );
```

Two of these guard decisions rather than behaviour:

- `writes no computed total into any input` is D7 as a test. It is cheap now and it is the thing that stops the next plan inheriting a DevTools-editable price.
- `keeps the visitor typing position when an unrelated field repaints` is the Task 12 Critical of the builder plan, arriving in a new place: a repaint that rebuilds the DOM wholesale destroys the focused element. **Repaint by updating what changed, not by re-rendering the step.** Only add and remove controls whose visibility actually changed.

- [ ] **Step 3: Run both and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern 'state|form'`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the state store**

`frontend-src/runtime/state.js`:

```js
function sameValue( left, right ) {
	if ( Array.isArray( left ) && Array.isArray( right ) ) {
		return left.length === right.length && left.every( ( item, index ) => item === right[ index ] );
	}

	return left === right;
}

export function createState( schema ) {
	const fields = schema.fields || {};
	const values = {};
	const subscribers = new Set();

	Object.keys( fields ).forEach( ( key ) => {
		const fallback = Array.isArray( fields[ key ].default ) ? [ ...fields[ key ].default ] : fields[ key ].default;

		values[ key ] = fallback === undefined ? '' : fallback;
	} );

	const get = () => ( { ...values } );

	return {
		get,
		set( key, value ) {
			if ( sameValue( values[ key ], value ) ) {
				return;
			}

			values[ key ] = value;
			subscribers.forEach( ( subscriber ) => subscriber( get() ) );
		},
		subscribe( subscriber ) {
			subscribers.add( subscriber );

			return () => subscribers.delete( subscriber );
		},
	};
}
```

- [ ] **Step 5: Implement binding and assembly**

`frontend-src/dom/bind.js` reads a control's DOM value into the shape Task 6 expects: a checkbox group becomes an array of checked values, a toggle becomes a boolean, everything else becomes its string value. It attaches one `input` and one `change` listener per control and returns a detach function.

**Three facts about what Task 10 actually returns, which decide how this is written:**

- A group's `input` is **only the first option's element** (`inputs[ 0 ]`), and a group with no options has no `input` at all. Attaching the listeners to `control.input` would therefore hear the first radio and miss every other one. Attach them to `control.wrapper` instead — `input` and `change` both bubble — and read the value by querying the wrapper for its checked inputs rather than through `control.input`.
- An `html` block returns `input: null`. It holds no value, so bind must skip it rather than dereference it.
- `buildControl` returns `null` for a type it does not recognise. `createForm` skips those fields and renders the rest, which is the forward-compatibility contract Task 10 established.

`frontend-src/dom/form.js` owns the lifecycle. Three things the tests pin down that are easy to miss:

- **The form id comes from the container.** `createForm( container, schema )` takes no third argument, yet `buildControl( field, formId )` needs one and the tests assert ids like `quoteform_12_rooms`. Read it from `container.getAttribute( 'data-quoteform' )` — `bootAll` already reads the same attribute to find the schema, so the two can never disagree.
- **The first paint is synchronous.** `shows the total from the schema defaults on first paint` reads the total without advancing any timer. Run one recalculation immediately at construction; the 50ms debounce applies only to *subsequent* state changes.
- **`calculate()` returns `total` as a number, not a string.** `$50.00` comes from passing it through `formatMoney( total, schema.settings )` — the same function the breakdown rows already use. A raw `String( total )` renders `50` and fails.

1. `createState( schema )`
2. build the step's controls with `buildControl`, keeping a map of `key → control`
3. append a `<output data-quoteform-total>` and a breakdown list
4. subscribe to state; on change, schedule a recalculation 50ms later
5. recalculation: `resolveVisibility` → `variablesFor` → `calculate` → repaint
6. repaint: toggle each control's presence to match visibility, write the total, rebuild the breakdown list, and hide the total when `error` is non-null
7. `destroy()` detaches every listener and empties the container

Steps are Task 12; for now render every visible step's fields in order, which is what the tests above expect.

The repaint must not rebuild controls that are staying — that is what `keeps the visitor typing position` enforces. Keep the control map and move nodes, rather than regenerating them.

- [ ] **Step 6: Replace the Task 2 stub**

The stub lives in `frontend-src/dom/form.js` itself, not in `frontend-src/index.js` — `index.js` imports `createForm` and needs no edit. Writing the real `dom/form.js` therefore *is* the replacement.

Re-run Task 2's boot tests afterwards. Be careful about what a green run proves here: those tests `jest.mock` the whole `dom/form` module, so they never loaded the stub and will not load the real implementation either. A pass is not evidence that `createForm` works under `bootAll`. Check that separately — mounting the real `createForm` against `boot.test.js`'s own minimal schema is enough — and report what you did, because the mock is deliberate (the "survives one broken form" test needs `createForm` to throw on demand) and dismantling it would cost more than it buys.

- [ ] **Step 7: Run everything**

Run: `npx jest --selectProjects frontend` then `npm run build && make check`
Expected: PASS throughout.

- [ ] **Step 8: Prepare a commit message**

```
feat(renderer): assemble the form and wire live recalculation
```

Do not run `git commit`.

---

### Task 12: Steps — navigation over what is visible

Spec §9. Navigation, the progress indicator and per-step validation all operate on **visible** steps only, and the step number the visitor sees counts visible steps.

**Files:**
- Create: `frontend-src/runtime/steps.js`
- Modify: `frontend-src/dom/form.js`
- Test: `tests/js/frontend/steps.test.js`
- Test: `tests/js/frontend/form-steps.test.js`

**Interfaces:**
- Consumes: `resolveVisibility` (Task 8)
- Produces: `visibleSteps( schema, visibility ) → step[]`, `stepPosition( steps, currentKey ) → { index, total }`, and navigation wired into `createForm`

**The rule that makes this non-trivial.** A hidden step is not skipped at navigation time — it does not exist. "Step 2 of 4" counts visible steps, so hiding one makes it "step 2 of 3", and the numbering does not jump. Navigating forward from the last visible step does nothing rather than landing on a hidden one.

**Focus moves to the new step's heading (§16).** The heading carries `tabIndex="-1"` so it can receive focus programmatically without entering the tab order. This is the pattern the builder already uses, and the trap is the same: never focus an element in the same commit that reveals it if it is still `hidden`.

- [ ] **Step 1: Write the failing navigation tests**

`tests/js/frontend/steps.test.js`:

```js
import { stepPosition, visibleSteps } from '../../../frontend-src/runtime/steps';

const schema = {
	steps: [
		{ key: 'one', title: 'One', description: '', fields: [] },
		{ key: 'two', title: 'Two', description: '', fields: [] },
		{ key: 'three', title: 'Three', description: '', fields: [] },
		{ key: 'four', title: 'Four', description: '', fields: [] },
	],
};

const visibility = ( keys ) => ( { steps: new Set( keys ) } );

describe( 'visibleSteps', () => {
	it( 'keeps schema order', () => {
		const steps = visibleSteps( schema, visibility( [ 'four', 'one', 'three' ] ) );

		expect( steps.map( ( step ) => step.key ) ).toEqual( [ 'one', 'three', 'four' ] );
	} );

	it( 'returns an empty list when everything is hidden', () => {
		expect( visibleSteps( schema, visibility( [] ) ) ).toEqual( [] );
	} );
} );

describe( 'stepPosition', () => {
	it( 'counts only visible steps', () => {
		const steps = visibleSteps( schema, visibility( [ 'one', 'three', 'four' ] ) );

		expect( stepPosition( steps, 'three' ) ).toEqual( { index: 1, total: 3 } );
		expect( stepPosition( steps, 'four' ) ).toEqual( { index: 2, total: 3 } );
	} );

	it( 'reports index -1 for a step that is no longer visible', () => {
		const steps = visibleSteps( schema, visibility( [ 'one', 'four' ] ) );

		expect( stepPosition( steps, 'two' ).index ).toBe( -1 );
	} );
} );
```

- [ ] **Step 2: Write the failing integration tests**

`tests/js/frontend/form-steps.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

const threeSteps = ( rules ) => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: '', default: 1, required: false },
		details: { key: 'details', type: 'text', label: 'Details', help: '', default: '', required: false },
		notes: { key: 'notes', type: 'text', label: 'Notes', help: '', default: '', required: false },
	},
	steps: [
		{ key: 'one', title: 'Your property', description: '', fields: [ 'rooms' ] },
		{ key: 'two', title: 'Extra details', description: '', fields: [ 'details' ] },
		{ key: 'three', title: 'Anything else', description: '', fields: [ 'notes' ] },
	],
	calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
	rules: rules || [],
} );

const hideStepTwoWhenRoomsOverTwo = [
	{
		target: { kind: 'step', key: 'two' },
		action: 'hide',
		match: 'all',
		conditions: [ { field: 'rooms', operator: 'greater', value: 2 } ],
	},
];

const mount = ( schema ) => {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );

	return { container, form: createForm( container, schema ) };
};

const setRooms = ( container, value ) => {
	const input = container.querySelector( '#quoteform_12_rooms' );

	input.value = String( value );
	input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	jest.advanceTimersByTime( 60 );
};

const next = ( container ) =>
	container.querySelector( '[data-quoteform-next]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

const back = ( container ) =>
	container.querySelector( '[data-quoteform-back]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

const progress = ( container ) => container.querySelector( '[data-quoteform-progress]' ).textContent;

describe( 'step navigation', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'counts every step when none is hidden', () => {
		const { container } = mount( threeSteps() );

		expect( progress( container ) ).toBe( 'Step 1 of 3' );
	} );

	it( 'stops counting a step once a rule hides it', () => {
		const { container } = mount( threeSteps( hideStepTwoWhenRoomsOverTwo ) );

		expect( progress( container ) ).toBe( 'Step 1 of 3' );

		setRooms( container, 3 );

		expect( progress( container ) ).toBe( 'Step 1 of 2' );
	} );

	it( 'skips the hidden step entirely rather than landing on it', () => {
		const { container } = mount( threeSteps( hideStepTwoWhenRoomsOverTwo ) );

		setRooms( container, 3 );
		next( container );

		expect( container.querySelector( '#quoteform_12_notes' ) ).not.toBeNull();
		expect( container.querySelector( '#quoteform_12_details' ) ).toBeNull();
		expect( progress( container ) ).toBe( 'Step 2 of 2' );
	} );

	it( 'walks through every step when none is hidden', () => {
		const { container } = mount( threeSteps() );

		next( container );

		expect( container.querySelector( '#quoteform_12_details' ) ).not.toBeNull();

		next( container );

		expect( container.querySelector( '#quoteform_12_notes' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 3 of 3' );
	} );

	it( 'moves focus to the new step heading', () => {
		const { container } = mount( threeSteps() );

		next( container );

		const heading = container.querySelector( '[data-quoteform-step] h2, [data-quoteform-step] h3' );

		expect( document.activeElement ).toBe( heading );
		expect( heading.getAttribute( 'tabindex' ) ).toBe( '-1' );
	} );

	it( 'goes back to the previous visible step', () => {
		const { container } = mount( threeSteps( hideStepTwoWhenRoomsOverTwo ) );

		setRooms( container, 3 );
		next( container );
		back( container );

		expect( container.querySelector( '#quoteform_12_rooms' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 1 of 2' );
	} );

	it( 'offers no Back on the first step and no Next on the last', () => {
		const { container } = mount( threeSteps() );

		expect( container.querySelector( '[data-quoteform-back]' ) ).toBeNull();

		next( container );
		next( container );

		expect( container.querySelector( '[data-quoteform-next]' ) ).toBeNull();
		expect( container.querySelector( '[data-quoteform-back]' ) ).not.toBeNull();
	} );

	it( 'moves the visitor off a step that becomes hidden under them', () => {
		const { container } = mount( threeSteps( hideStepTwoWhenRoomsOverTwo ) );

		next( container );

		expect( container.querySelector( '#quoteform_12_details' ) ).not.toBeNull();

		back( container );
		setRooms( container, 3 );
		next( container );

		expect( container.querySelector( '#quoteform_12_notes' ) ).not.toBeNull();
		expect( progress( container ) ).toBe( 'Step 2 of 2' );
	} );

	it( 'shows something rather than nothing when every step is hidden', () => {
		const hideAll = [ 'one', 'two', 'three' ].map( ( key ) => ( {
			target: { kind: 'step', key },
			action: 'hide',
			match: 'all',
			conditions: [ { field: 'mode', operator: 'equals', value: 'all' } ],
		} ) );

		const schema = threeSteps( hideAll );

		schema.fields.mode = { key: 'mode', type: 'hidden', label: '', help: '', default: 'all', required: false };

		const { container } = mount( schema );

		expect( container.querySelector( '[data-quoteform-step]' ) ).toBeNull();
		expect( container.querySelector( '[data-quoteform-next]' ) ).toBeNull();
		expect( container.querySelector( '[data-quoteform-empty]' ).textContent.trim() ).not.toBe( '' );
	} );
} );
```

Two of these are the ones an implementation will miss.

`moves the visitor off a step that becomes hidden under them` happens whenever a visitor goes back and changes an answer that hides the step they had been standing on. An implementation holding the current step by **index** rather than by key passes every other test here and shows a blank step for this one.

`shows something rather than nothing when every step is hidden` is a schema a site owner can absolutely build by accident. The form must degrade to a message, not to an empty box with a total floating in it.

**Why that fixture drives the rule off a `mode` field that belongs to no step, rather than off `rooms`.** `dropHiddenSteps` deletes the fields of every hidden step, so a rule conditioned on `rooms` destroys its own input: pass 1 hides all three steps, which erases `rooms`; pass 2 sees `rooms` empty, the condition no longer holds, and everything comes back; pass 3 hides it all again. The fixed-point loop never settles, burns all ten passes, logs its warning, and returns whichever state pass ten happened to land on — which is *everything visible*. The test would then pass while exercising none of the behaviour it names. A field that lives in no step is never dropped, so the condition keeps its input and the loop settles on the second pass.

**And the empty-state note needs its own hook, `[data-quoteform-empty]`.** Asserting on the container's aggregate `textContent` does not work here, however natural it looks: the summary renders even with no steps, so `container.textContent` reads `"…Total$0.00$0.00"` and the assertion passes with the empty-state note deleted entirely — which is precisely the "empty box with a total floating in it" this test exists to forbid. Assert on the note's own element, so the test fails when the note is gone.

Note also what the assertions do **not** do: they never click Next. With no visible step there is no Next button, so a helper that dereferences `querySelector( '[data-quoteform-next]' )` would throw a `TypeError` inside the very `expect( … ).not.toThrow()` meant to prove the form stays calm. Asserting the button's absence is both safer and a tighter statement of the requirement.

The `[data-quoteform-next]`, `[data-quoteform-back]`, `[data-quoteform-progress]` and `[data-quoteform-step]` hooks are part of the contract these tests pin — use those exact attributes in Task 12 Step 5 so the end-to-end suite can rely on them too.

Both navigation controls are `<button type="button">`. The explicit type is not decoration: a bare `<button>` inside a `<form>` defaults to `type="submit"`, so pressing Next would reload the page instead of advancing a step. Task 14 asserts this directly; getting it right here saves a round.

- [ ] **Step 3: Run both and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern 'steps'`
Expected: FAIL.

- [ ] **Step 4: Implement `steps.js`**

```js
export function visibleSteps( schema, visibility ) {
	return ( schema.steps || [] ).filter( ( step ) => visibility.steps.has( step.key ) );
}

export function stepPosition( steps, currentKey ) {
	return {
		index: steps.findIndex( ( step ) => step.key === currentKey ),
		total: steps.length,
	};
}
```

- [ ] **Step 5: Wire navigation into the form**

In `frontend-src/dom/form.js`, hold the current step **by key**, never by index — an index means something different the moment visibility changes, which is exactly when it must not.

On every repaint, recompute the visible steps. If the current key is no longer among them, move to the nearest visible step at or before the old position. Render only the current step's controls, plus Back and Next buttons and a progress element whose text comes from `stepPosition`.

```js
const progressText = ( position ) =>
	sprintf(
		/* translators: 1: current step number. 2: total number of steps. */
		__( 'Step %1$d of %2$d', 'quoteform' ),
		position.index + 1,
		position.total
	);
```

Import `__` and `sprintf` from `@wordpress/i18n` — it is externalised by wp-scripts, so it costs nothing in the bundle and keeps the renderer translatable, which §17 requires.

After a step change, focus the new step's heading. Do it after the DOM is in place, not in the same statement that inserts it.

- [ ] **Step 6: Run everything**

Run: `npx jest --selectProjects frontend` then `npm run build && make check`
Expected: PASS.

- [ ] **Step 7: Prepare a commit message**

```
feat(renderer): navigate visible steps with progress and focus
```

Do not run `git commit`.

---
### Task 13: Client validation — UX only, and visible fields only

Spec §14 level 3 is blunt about what this is worth: *"server validasiyası həqiqət mənbəyidir; client validasiyası yalnız UX-dir və ona heç vaxt etibar edilmir."* This task exists so a visitor is told about an empty field before they move on, not to protect anything.

**Files:**
- Create: `frontend-src/runtime/validate.js`
- Modify: `frontend-src/dom/form.js`
- Test: `tests/js/frontend/validate.test.js`

**Interfaces:**
- Consumes: `resolveVisibility` (Task 8) for the effective `required` set
- Produces: `validateStep( schema, step, state, visibility ) → { [ fieldKey ]: message }`

**Spec §8.1 behaviour 2 lives here.** A required field that a rule has hidden must not block anything. `resolveVisibility` already excludes hidden fields from its `required` set (Task 8), so validation reads that set and inherits the rule rather than re-deriving it. **Do not read `field.required` here** — that is the schema's static value, not the effective one.

- [ ] **Step 1: Write the failing tests**

`tests/js/frontend/validate.test.js`:

```js
import { validateStep } from '../../../frontend-src/runtime/validate';

const schema = {
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', required: true, min: 0, max: 9 },
		email: { key: 'email', type: 'email', label: 'Email', required: true },
		notes: { key: 'notes', type: 'textarea', label: 'Notes', required: false },
		extras: { key: 'extras', type: 'checkbox', label: 'Extras', required: true, options: [] },
	},
	steps: [ { key: 'one', title: 'One', description: '', fields: [ 'rooms', 'email', 'notes', 'extras' ] } ],
};

const step = schema.steps[ 0 ];

const visibility = ( required, fields ) => ( {
	fields: new Set( fields || [ 'rooms', 'email', 'notes', 'extras' ] ),
	steps: new Set( [ 'one' ] ),
	required: new Set( required ),
} );

describe( 'validateStep', () => {
	it( 'reports an empty required field', () => {
		const errors = validateStep( schema, step, { rooms: '', email: '', extras: [] }, visibility( [ 'rooms' ] ) );

		expect( errors.rooms ).toBeTruthy();
		expect( errors.email ).toBeUndefined();
	} );

	it( 'accepts zero as an answer to a required number field', () => {
		const errors = validateStep( schema, step, { rooms: 0 }, visibility( [ 'rooms' ] ) );

		expect( errors.rooms ).toBeUndefined();
	} );

	it( 'reports an empty required checkbox group', () => {
		const errors = validateStep( schema, step, { extras: [] }, visibility( [ 'extras' ] ) );

		expect( errors.extras ).toBeTruthy();
	} );

	it( 'does not report a required field that a rule has hidden', () => {
		const errors = validateStep(
			schema,
			step,
			{ rooms: '' },
			visibility( [], [ 'email', 'notes', 'extras' ] )
		);

		expect( errors.rooms ).toBeUndefined();
	} );

	it( 'reports a malformed email only when something was typed', () => {
		expect( validateStep( schema, step, { email: 'not-an-email' }, visibility( [] ) ).email ).toBeTruthy();
		expect( validateStep( schema, step, { email: '' }, visibility( [] ) ).email ).toBeUndefined();
	} );

	it( 'reports a number outside its range', () => {
		expect( validateStep( schema, step, { rooms: -1 }, visibility( [] ) ).rooms ).toBeTruthy();
		expect( validateStep( schema, step, { rooms: 20 }, visibility( [] ) ).rooms ).toBeTruthy();
		expect( validateStep( schema, step, { rooms: 5 }, visibility( [] ) ).rooms ).toBeUndefined();
	} );

	it( 'checks only the step it was given', () => {
		const twoSteps = {
			...schema,
			steps: [
				{ key: 'one', title: 'One', description: '', fields: [ 'rooms' ] },
				{ key: 'two', title: 'Two', description: '', fields: [ 'email' ] },
			],
		};

		const errors = validateStep( twoSteps, twoSteps.steps[ 0 ], {}, visibility( [ 'rooms', 'email' ] ) );

		expect( errors.rooms ).toBeTruthy();
		expect( errors.email ).toBeUndefined();
	} );

	it( 'returns an empty object when everything is fine', () => {
		const errors = validateStep(
			schema,
			step,
			{ rooms: 3, email: 'a@example.com', notes: '', extras: [ 'x' ] },
			visibility( [ 'rooms', 'email', 'extras' ] )
		);

		expect( errors ).toEqual( {} );
	} );
} );
```

`accepts zero as an answer to a required number field` and `reports a number outside its range` look similar and are not: the first says `0` is *an answer* rather than a blank, the second says a number can still fall outside its bounds. An implementation that treats `0` as empty fails the first, and the bug it represents — "0 rooms" being rejected as unanswered — is one a site owner would struggle to report clearly.

**The fixture's `min` is `0` on purpose.** With `min: 1`, the two tests would contradict each other outright: `rooms: 0` would be simultaneously required-and-answered (no error) and below its minimum (an error), and no implementation could satisfy both — requiredness has no bearing on range checking. `min: 0` lets each test isolate what it names, which is why the out-of-range case reaches for `-1` rather than `0`.

`does not report a required field that a rule has hidden` is spec §8.1 behaviour 2, and it is the reason this function takes `visibility` rather than reading `field.required`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern validate`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

`frontend-src/runtime/validate.js`. Messages go through `@wordpress/i18n`. The email check is deliberately loose — a single `@` with something either side — because the server and the mail transport are the real arbiters and a strict regex rejects valid addresses.

```js
import { __, sprintf } from '@wordpress/i18n';

const isBlank = ( value ) => {
	if ( Array.isArray( value ) ) {
		return value.length === 0;
	}

	return value === undefined || value === null || value === '';
};

export function validateStep( schema, step, state, visibility ) {
	const errors = {};

	( step.fields || [] ).forEach( ( key ) => {
		const field = ( schema.fields || {} )[ key ];

		if ( ! field || ! visibility.fields.has( key ) ) {
			return;
		}

		const value = state[ key ];

		if ( visibility.required.has( key ) && isBlank( value ) ) {
			errors[ key ] = __( 'This field is required.', 'quoteform' );

			return;
		}

		if ( isBlank( value ) ) {
			return;
		}

		if ( field.type === 'email' && ! /^[^@\s]+@[^@\s]+$/.test( String( value ) ) ) {
			errors[ key ] = __( 'Enter an email address.', 'quoteform' );

			return;
		}

		if ( field.type === 'number' || field.type === 'slider' ) {
			const numeric = Number( value );

			if ( typeof field.min === 'number' && numeric < field.min ) {
				errors[ key ] = sprintf(
					/* translators: %s: the smallest allowed number. */
					__( 'Enter %s or more.', 'quoteform' ),
					field.min
				);
			} else if ( typeof field.max === 'number' && numeric > field.max ) {
				errors[ key ] = sprintf(
					/* translators: %s: the largest allowed number. */
					__( 'Enter %s or less.', 'quoteform' ),
					field.max
				);
			}
		}
	} );

	return errors;
}
```

`isBlank` treats `0` as filled, which is the whole point of the pair of tests above.

**One more skip, on the same principle as §8.1 behaviour 2.** `required` is a common key for *every* field type in `includes/Forms/FieldValidator.php`, so a schema carrying `{ type: 'hidden', required: true }` passes server validation — and a `hidden` field's `setError` is deliberately a no-op, as is an `html` block's. Such a field can therefore fail validation, block Next, and display **nothing anywhere**: an unrecoverable dead end with no message and no way forward.

So `validateStep` skips any field type with no error surface — `hidden` and `html`. The rule behind §8.1 behaviour 2 is "never block a visitor on a field they cannot see"; a hidden field is one they can neither see nor fix, so blocking on it is the same defect arriving by a different route. Add a test: a required `hidden` field with an empty value produces no error and does not stop Next.

The deeper fix belongs upstream — `FieldValidator` should arguably reject `required: true` on a type that cannot show an error — but that is a server contract change outside this plan.

- [ ] **Step 4: Wire it into Next**

In `frontend-src/dom/form.js`, run `validateStep` when Next is pressed. If it returns any errors, do not advance: call each control's `setError`, and move focus to the **first** control with an error so a keyboard user is taken to the problem rather than left to hunt. Clear a field's error when its value next changes.

Add one test to `tests/js/frontend/form-steps.test.js` proving Next does not advance while an error stands, and one proving focus lands on the first invalid control.

- [ ] **Step 5: Run everything**

Run: `npx jest --selectProjects frontend` then `npm run build && make check`
Expected: PASS.

- [ ] **Step 6: Prepare a commit message**

```
feat(renderer): validate the current step before advancing
```

Do not run `git commit`.

---

### Task 14: Announcements and the accessibility sweep

Spec §16 makes this a first-class requirement with a number attached: *"Hədəf: render olunmuş formada Lighthouse a11y balı 100."* Everything before this task built the structure; this one proves it works for someone who cannot see it.

**Files:**
- Create: `frontend-src/dom/announce.js`
- Modify: `frontend-src/dom/form.js`
- Create: `frontend-src/style.scss` (the real one — Task 2 created a stub)
- Test: `tests/js/frontend/announce.test.js`
- Test: `tests/js/frontend/a11y.test.js`

**Interfaces:**
- Produces: `createAnnouncer( container ) → { announce, destroy }`

**One §9 requirement this plan had not assigned to any task, and it lands here.** Spec §9's last line reads *"Son addımda hesablamanın açılışı (breakdown) göstərilir"* — the **breakdown** belongs on the last step. Note precisely what that does and does not say: it is the itemised breakdown that is last-step-only. The **total** stays visible throughout, because a live running price is the entire point of the plugin and §9's own progress rules assume the visitor can see what their answers are costing as they go.

So: keep `[data-quoteform-total]` on every step, and render the breakdown list only when the current step is the last **visible** one. Add a test for each half — the breakdown absent on a non-final step and present on the final one, and the total present on both. Task 11's single-step fixtures are unaffected (their only step is also the last one), which is why this surfaced late rather than earlier.

**Four things §16 asks for that are not yet in place:**

1. The total is announced with `aria-live="polite"` when it changes.
2. The step state reaches a screen reader as text, not only as a visual position.
3. Colour is never the only carrier of meaning — an error must have text and an icon or prefix, not only a red border.
4. Focus moves to the new step's heading (Task 12 did this; this task tests it).

**The live-region trap.** A region that is created and populated in the same tick is often not announced at all, because the screen reader never saw it empty. Create the live region once at mount, empty, and write into it later. Also debounce announcements — the total changes on every recalculation, and announcing every intermediate value while someone types is worse than announcing none.

- [ ] **Step 1: Write the failing announcer tests**

`tests/js/frontend/announce.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { createAnnouncer } from '../../../frontend-src/dom/announce';

describe( 'createAnnouncer', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	const mount = () => {
		const container = document.createElement( 'div' );

		document.body.appendChild( container );

		return { container, announcer: createAnnouncer( container ) };
	};

	it( 'creates the live region empty, at mount', () => {
		const { container } = mount();
		const region = container.querySelector( '[aria-live]' );

		expect( region ).not.toBeNull();
		expect( region.getAttribute( 'aria-live' ) ).toBe( 'polite' );
		expect( region.textContent ).toBe( '' );
	} );

	it( 'is visually hidden but not hidden from assistive technology', () => {
		const { container } = mount();
		const region = container.querySelector( '[aria-live]' );

		expect( region.hasAttribute( 'hidden' ) ).toBe( false );
		expect( region.getAttribute( 'aria-hidden' ) ).toBeNull();
		expect( region.className ).toContain( 'quoteform_sr_only' );
	} );

	it( 'announces after the debounce, once', () => {
		const { container, announcer } = mount();

		announcer.announce( 'Total $50.00' );
		announcer.announce( 'Total $100.00' );
		announcer.announce( 'Total $150.00' );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( '' );

		jest.advanceTimersByTime( 600 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'Total $150.00' );
	} );

	it( 'does not repeat an identical message', () => {
		const { container, announcer } = mount();

		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 600 );
		container.querySelector( '[aria-live]' ).textContent = 'cleared by test';
		announcer.announce( 'Total $50.00' );
		jest.advanceTimersByTime( 600 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toBe( 'cleared by test' );
	} );

	it( 'removes its region on destroy', () => {
		const { container, announcer } = mount();

		announcer.destroy();

		expect( container.querySelector( '[aria-live]' ) ).toBeNull();
	} );
} );
```

`is visually hidden but not hidden from assistive technology` is the mistake worth pinning: `hidden` or `display: none` on a live region removes it from the accessibility tree entirely, so it announces nothing. The region must be positioned off-screen instead, which is what `quoteform_sr_only` does.

- [ ] **Step 2: Write the failing accessibility tests**

`tests/js/frontend/a11y.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { createForm } from '../../../frontend-src/dom/form';

const schema = () => ( {
	version: 1,
	settings: { currency: 'USD', currency_position: 'before', decimals: 2 },
	fields: {
		rooms: { key: 'rooms', type: 'number', label: 'Rooms', help: 'Bedrooms only.', default: 1, required: true },
		extras: {
			key: 'extras',
			type: 'checkbox',
			label: 'Extras',
			help: '',
			default: [],
			required: false,
			options: [ { label: 'Gift wrap', value: 'gift', price: 15 } ],
		},
		notes: { key: 'notes', type: 'text', label: 'Notes', help: '', default: '', required: false },
	},
	steps: [
		{ key: 'one', title: 'Your property', description: '', fields: [ 'rooms', 'extras' ] },
		{ key: 'two', title: 'Anything else', description: '', fields: [ 'notes' ] },
	],
	calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
	rules: [],
} );

const mount = () => {
	const container = document.createElement( 'div' );

	container.setAttribute( 'data-quoteform', '12' );
	document.body.appendChild( container );
	createForm( container, schema() );

	return container;
};

const accessibleName = ( container, input ) => {
	const label = container.querySelector( `label[for="${ input.id }"]` );

	if ( label ) {
		return label.textContent.trim();
	}

	const fieldset = input.closest( 'fieldset' );

	return fieldset ? fieldset.querySelector( 'legend' ).textContent.trim() : '';
};

describe( 'accessibility', () => {
	beforeEach( () => {
		document.body.innerHTML = '';
		jest.useFakeTimers();
	} );

	afterEach( () => {
		jest.useRealTimers();
	} );

	it( 'gives every visible control an accessible name', () => {
		const container = mount();
		const inputs = [ ...container.querySelectorAll( 'input:not([type="hidden"]), select, textarea' ) ];

		expect( inputs.length ).toBeGreaterThan( 0 );

		inputs.forEach( ( input ) => {
			expect( accessibleName( container, input ) ).not.toBe( '' );
		} );
	} );

	it( 'describes a control with its help text', () => {
		const container = mount();
		const rooms = container.querySelector( '#quoteform_12_rooms' );
		const help = container.querySelector( '#quoteform_12_rooms_help' );

		expect( rooms.getAttribute( 'aria-describedby' ) ).toContain( help.id );
		expect( help.textContent ).toBe( 'Bedrooms only.' );
	} );

	it( 'exposes the progress as text, not only as position', () => {
		const container = mount();

		expect( container.querySelector( '[data-quoteform-progress]' ).textContent ).toBe( 'Step 1 of 2' );
	} );

	it( 'creates one empty polite live region at mount', () => {
		const container = mount();
		const regions = container.querySelectorAll( '[aria-live]' );

		expect( regions ).toHaveLength( 1 );
		expect( regions[ 0 ].getAttribute( 'aria-live' ) ).toBe( 'polite' );
		expect( regions[ 0 ].textContent ).toBe( '' );
	} );

	it( 'announces the total after it changes', () => {
		const container = mount();
		const rooms = container.querySelector( '#quoteform_12_rooms' );

		rooms.value = '4';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 700 );

		expect( container.querySelector( '[aria-live]' ).textContent ).toContain( '$200.00' );
	} );

	it( 'ties an error to its input and marks it invalid', () => {
		const container = mount();
		const rooms = container.querySelector( '#quoteform_12_rooms' );

		rooms.value = '';
		rooms.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		jest.advanceTimersByTime( 60 );
		container.querySelector( '[data-quoteform-next]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

		const error = container.querySelector( '#quoteform_12_rooms_error' );

		expect( error.textContent.trim() ).not.toBe( '' );
		expect( rooms.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
		expect( rooms.getAttribute( 'aria-describedby' ) ).toContain( error.id );
	} );

	it( 'marks a required field with aria-required rather than the required attribute', () => {
		const container = mount();
		const rooms = container.querySelector( '#quoteform_12_rooms' );

		expect( rooms.getAttribute( 'aria-required' ) ).toBe( 'true' );
		expect( rooms.hasAttribute( 'required' ) ).toBe( false );
	} );

	it( 'uses real buttons that cannot submit anything', () => {
		const container = mount();
		const next = container.querySelector( '[data-quoteform-next]' );

		expect( next.tagName ).toBe( 'BUTTON' );
		expect( next.getAttribute( 'type' ) ).toBe( 'button' );
	} );

	it( 'moves focus to the heading of the step it just opened', () => {
		const container = mount();

		container.querySelector( '[data-quoteform-next]' ).dispatchEvent( new Event( 'click', { bubbles: true } ) );

		expect( document.activeElement.textContent ).toContain( 'Anything else' );
	} );

	it( 'gives nothing a positive tabindex', () => {
		const container = mount();
		const positive = [ ...container.querySelectorAll( '[tabindex]' ) ].filter(
			( node ) => Number( node.getAttribute( 'tabindex' ) ) > 0
		);

		expect( positive ).toEqual( [] );
	} );

	it( 'groups checkboxes in a fieldset with a legend', () => {
		const container = mount();
		const fieldset = container.querySelector( 'fieldset' );

		expect( fieldset ).not.toBeNull();
		expect( fieldset.querySelector( 'legend' ).textContent ).toContain( 'Extras' );
	} );
} );
```

`gives nothing a positive tabindex` is a cheap guard against the classic regression of someone "fixing" tab order with `tabindex="3"`, which breaks it for everyone else on the page.

`creates one empty polite live region at mount` is worth its line: two regions announce twice, and a region created already populated often announces nothing at all, because the screen reader never observed it change.

**But that test has a blind spot you must close by hand, and it is the interesting defect in this whole plan.** `querySelectorAll( '[aria-live]' )` sees only *explicit* attributes. Several elements are live regions by virtue of being that element: `<output>` carries an implicit `role="status"`, which carries an implicit `aria-live="polite"` and `aria-atomic="true"`. So a total rendered as `<output>` is a second polite live region firing on the **50ms** recalculation debounce — a visitor typing `1`→`2`→`0` hears three intermediate prices — and the attribute assertion above passes cleanly while it happens.

Render the total as a plain `<span>` (keeping its `data-quoteform-total` hook), and add a test that sweeps for implicit regions rather than for one tag name: assert the container holds no `output`, `[role="status"]`, `[role="alert"]`, `[role="log"]` or `[aria-live]` node other than the announcer's. That phrasing still holds when someone later reaches for a different implicitly-live element.

- [ ] **Step 3: Run both and watch them fail**

Run: `npx jest --selectProjects frontend --testPathPattern 'announce|a11y'`
Expected: FAIL.

- [ ] **Step 4: Implement the announcer**

`frontend-src/dom/announce.js`:

```js
const DELAY = 500;

export function createAnnouncer( container ) {
	const region = document.createElement( 'p' );

	region.className = 'quoteform_sr_only';
	region.setAttribute( 'aria-live', 'polite' );
	region.setAttribute( 'role', 'status' );
	container.appendChild( region );

	let timer = null;
	let last = '';

	return {
		announce( message ) {
			window.clearTimeout( timer );

			if ( message === last ) {
				return;
			}

			timer = window.setTimeout( () => {
				last = message;
				region.textContent = message;
			}, DELAY );
		},
		destroy() {
			window.clearTimeout( timer );
			region.remove();
		},
	};
}
```

500ms rather than the calculation's 50ms: the visual total should keep up with typing, and a screen reader should not.

**The clear comes before the identity check, and the order is the whole point.** Returning early on an identical message while a timer is still pending leaves that stale timer armed: a visitor types `2`, undoes it back to `1` inside the same 500ms, and the announcement for `$100` still fires while the screen reads `$50`. Clearing first means an undone change cancels its own announcement, which is what a visitor doing the undoing expects.

**One thing to remove while you are here.** `[data-quoteform-total]` currently carries `aria-live` from an earlier task. That makes it a second live region, firing on the *50ms* recalculation debounce — the exact trap described above, announcing every intermediate value while someone types. The verbatim test `creates one empty polite live region at mount` asserts there is exactly one `[aria-live]` in the container, so it must go; the total still reaches a screen reader, through the announcer, at the announcer's pace.

- [ ] **Step 5: Write the stylesheet**

`frontend-src/style.scss`. Keep it under 10KB gzipped (§18) and make it plain — a form that inherits the theme's typography looks at home, and heavy styling fights every theme it meets.

It must contain at minimum:

```scss
.quoteform_sr_only {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip: rect(0 0 0 0);
	white-space: nowrap;
	border: 0;
}
```

That class is load-bearing, not decoration: it is what keeps the live region in the accessibility tree while off-screen.

Style the control wrapper, label, help, error, step, progress, total, breakdown and the navigation buttons. Error state gets a border **and** text — never colour alone (§16).

- [ ] **Step 6: Wire announcements into the form**

Announce the total when it changes, and the step when it changes. Compose both messages through `@wordpress/i18n`:

```js
	announcer.announce(
		sprintf(
			/* translators: 1: step number. 2: total steps. 3: formatted total. */
			__( 'Step %1$d of %2$d. Total %3$s.', 'quoteform' ),
			position.index + 1,
			position.total,
			formatted
		)
	);
```

- [ ] **Step 7: Check the size budgets**

Run: `npm run build && gzip -c build/frontend.js | wc -c && gzip -c build/style-frontend.css | wc -c`
Expected: under 25,600 and 10,240 bytes respectively. Record both numbers in your report. If either is over, report it rather than trimming tests to fit — the budget is a spec requirement and a breach is a finding, not a formatting problem.

- [ ] **Step 8: Run everything**

Run: `make check`
Expected: PASS.

- [ ] **Step 9: Prepare a commit message**

```
feat(renderer): announce totals and steps to assistive technology
```

Do not run `git commit`.

---

### Task 15: The end-to-end pass

Spec §19 names one Playwright scenario as the test that catches most real bugs. Its full form ends at the admin entry, which needs submission — a later plan. This task implements everything up to that point, in a real browser against real WordPress.

**Files:**
- Create: `tests/e2e/renderer.spec.js`
- Modify: `tests/e2e/builder.spec.js` (it creates the form this suite renders)

**Interfaces:**
- Consumes: the running stack at `http://localhost:8083`, a built bundle

**What this catches that 100+ jsdom tests cannot:** a bundle that does not load, an asset enqueued with the wrong handle, a schema that does not survive `wp_json_encode`, a CSS rule that hides the total, a step transition that works in jsdom and not in Chromium.

The scenario, from §19 minus submission:

> fill in a multi-step form → confirm the conditional step is skipped → check the live total

- [ ] **Step 1: Create the fixture form**

The suite needs a form with two fields, three steps and a rule that hides the middle one. Building it through the builder UI would make this suite depend on every builder bug; building it through the REST API is faster and more robust.

Add a helper to `tests/e2e/renderer.spec.js` that signs in, creates a form over `POST /wp-json/quoteform/v1/forms`, then `PUT`s a schema with:

- `rooms` (number, default 1, label `Rooms`) and `urgency` (select: standard 0, express 60, label `Urgency`) on step one
- a `details` field on step two
- step two hidden by a rule when `rooms` is greater than 2
- a `notes` field on step three
- `total` = `{rooms} * 50 + {urgency.price}`

**The step titles are load-bearing, not filler.** The scenario asserts `getByRole( 'heading', { name: 'Notes' } )` after pressing Next, and a step's heading renders its **title**, not the label of the field inside it. So step three's title must be exactly `Notes`. Likewise the two `getByLabel` calls depend on the field labels above being exactly `Rooms` and `Urgency`.

The arithmetic the scenario asserts: `$50.00` at rest (rooms 1, nothing chosen), `$110.00` once `express` is chosen (1 × 50 + 60), and `$210.00` at three rooms (3 × 50 + 60) — the rule hides step *two*, and `urgency` lives on step one, so its 60 stays in the price.

Then publish a post whose content is `[quoteform id="…"]` and visit it.

Use the REST nonce the way `tests/e2e/builder.spec.js` already does — read that file rather than inventing a second approach.

- [ ] **Step 2: Write the scenario**

```js
const { test, expect } = require( '@playwright/test' );

test.describe( 'the rendered form', () => {
	test( 'prices a multi-step form live and skips a hidden step', async ( { page } ) => {
		// … set up via REST, visit the post …

		await expect( page.getByText( 'Step 1 of 3' ) ).toBeVisible();
		await expect( page.locator( '[data-quoteform-total]' ) ).toHaveText( '$50.00' );

		await page.getByLabel( 'Urgency' ).selectOption( 'express' );
		await expect( page.locator( '[data-quoteform-total]' ) ).toHaveText( '$110.00' );

		await page.getByLabel( 'Rooms' ).fill( '3' );
		await expect( page.locator( '[data-quoteform-total]' ) ).toHaveText( '$210.00' );
		await expect( page.getByText( 'Step 1 of 2' ) ).toBeVisible();

		await page.getByRole( 'button', { name: 'Next' } ).click();

		await expect( page.getByRole( 'heading', { name: 'Notes' } ) ).toBeVisible();
	} );

	test( 'is driven entirely by the keyboard, and never drops focus', async ( { page } ) => {
		// … visit the post …

		// Tab to each control in turn, activate it, and after every activation assert
		// document.activeElement is not <body>. Follow the shape of the keyboard test
		// in tests/e2e/builder.spec.js — it presses Tab until the located element IS
		// activeElement, never calls .focus(), and asserts on <body> rather than
		// filtering it out.
	} );

	test( 'keeps working when a formula is broken', async ( { page } ) => {
		// … PUT a schema whose total divides by zero, visit the post …

		await expect( page.locator( '[data-quoteform-total]' ) ).toBeHidden();
		await expect( page.getByLabel( 'Rooms' ) ).toBeEditable();
	} );

	test( 'sends no computed total to the server', async ( { page } ) => {
		// … visit the post, change a value …

		const html = await page.content();

		expect( html ).not.toMatch( /name="[^"]*total[^"]*"/ );
	} );
} );
```

Write each body in full. The second test is the §16 floor in a real browser and must follow the builder suite's proven shape rather than a new one — that suite's keyboard test was rewritten precisely because its first version could not fail.

The fourth test is D7 checked at the only layer that matters: what is actually in the page.

- [ ] **Step 3: Run it**

Run: `make e2e`
Expected: the builder's four tests plus these four, all passing in Chromium.

`make e2e` drives a shared, long-running database and leaves real posts behind. Delete the forms and posts your runs create and say exactly what you deleted.

- [ ] **Step 4: Confirm nothing else moved**

Run: `make check`
Expected: every suite green, `buildcheck` green.

- [ ] **Step 5: Prepare a commit message**

```
test(renderer): drive the rendered form end to end in a real browser
```

Do not run `git commit`.

---

## Self-Review

Run against the spec with fresh eyes, before execution begins.

**1. Spec coverage.**

| Spec section | Task |
|---|---|
| §5.1 vanilla JS, no React, no jQuery | 2 (and its bundle assertion) |
| §7.3 variable resolution | 6 |
| §7.4 calculation order | 9 (via `evaluateAllCalculations`) |
| §7.5 parity fixtures | 1 |
| §8 conditions compile into the engine | 1, 7 |
| §8.1 hidden field and hidden required field | 6, 8, 13 |
| §9 multi-step, visible-only navigation, breakdown | 9, 12, 14 (breakdown on the last step) |
| §11 three surfaces, filtered schema | 3, 4, 5 |
| §14 level 2 runtime errors | 7, 9, 11 |
| §16 accessibility | 10, 12, 14, 15 |
| §17 i18n | every task using `@wordpress/i18n`; §17's POT step already exists |
| §18 performance budgets | 2, 14 |
| §19 test strategy | 15 |

Not covered, and deliberately: §6.3 entries, §10 submission, §12 entry management, §13 email, §15 spam. All belong to later plans, and the "What is not built" section says so.

**2. Placeholder scan.** The first draft of this plan left three steps describing tests rather than giving them — Task 12 Step 2, Task 14 Step 2 and Task 15 Step 2 — with the rationale that their DOM does not exist until earlier tasks in this same plan build it.

That is the identical rationalisation Plan 03 made, and Plan 03 was wrong twice: one placeholder hid a control whose label collided so the plan's own tests could not have been written, and the other hid a whole panel whose specification had never been thought through. A placeholder marks the part that has not been reasoned about, which is exactly where the defects are.

**Tasks 12 and 14 are now written out in full.** Doing so forced four decisions that the prose had left open: the `[data-quoteform-next]`, `[data-quoteform-back]`, `[data-quoteform-progress]` and `[data-quoteform-step]` attribute hooks are now a pinned contract rather than an implementer's choice; the every-step-hidden case surfaced as something a site owner can build by accident and now has a test; the live region's count is asserted, not assumed; and the error id convention (`…_error`) is fixed.

Task 15's two remaining bodies stay as described rather than written. That is a deliberate and narrower exception: they are Playwright tests against a stack whose REST setup this plan cannot rehearse, and the suite they must imitate — the builder's keyboard test — already exists in the repository for the implementer to read. **It is still the weaker part of this plan, and it is recorded here rather than hidden.**

**3. Type consistency.** `variablesFor( schema, state, visibleFields )` takes a `Set` and Task 8 passes `resolved.fields`, a `Set` — consistent. `resolveVisibility` returns `{ fields, steps, required }` and Tasks 12 and 13 read exactly those. `calculate` returns `{ values, total, breakdown, error }` and Task 11 reads all four. `buildControl` returns `{ wrapper, input, setError }` and Tasks 11 and 13 use all three. `FormRenderer::HANDLE` is `quoteform-renderer` and the Task 4 integration tests assert that string.

One name to watch: Task 2 predicts `build/frontend.js`, `build/frontend.asset.php` and `build/style-frontend.css`, and Task 4's PHP hard-codes them. Task 2 Step 5 requires the implementer to record what wp-scripts **actually** emitted, and Task 4 says the emitted names win. If they differ, both tasks change together.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-17-quoteform-04-renderer.md`.
