# Quoteform Builder (Plan 03) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React admin interface that lets a site owner create, edit and save a Quoteform schema — settings, fields, steps, calculations and conditional rules — against the REST API Plan 02 delivered.

**Architecture:** A single admin page mounts one React app built with `@wordpress/scripts`. The app holds the whole schema in one `useReducer` store and talks to `quoteform/v1` through a thin REST client. The server stays authoritative: every save posts the full schema and the server's coded errors are indexed by their `path` and rendered beside the control that owns them. The formula editor calls the browser copy of the expression engine for instant feedback, which is safe precisely because Plan 01 proved the two engines agree.

**Tech Stack:** React 18 via `@wordpress/element` (WordPress's own bundled copy — React is never shipped), `@wordpress/scripts` for the build, `@wordpress/api-fetch` for REST, `@wordpress/i18n` for translation, Jest + `@testing-library/react` with jsdom for component tests, Playwright for one end-to-end pass.

**Spec:** `docs/superpowers/specs/2026-09-15-quoteform-design.md`

**Depends on:** Plan 01 (`docs/superpowers/plans/2026-09-15-quoteform-01-engine.md`) and Plan 02 (`docs/superpowers/plans/2026-09-15-quoteform-02-schema-rest.md`), both complete.

---

## Global Constraints

Copied from the spec. Every task's requirements implicitly include this section.

- **PHP 7.4** is the floor for any PHP this plan adds. No constructor promotion, named arguments, `match`, union types, nullsafe, `str_contains`/`str_starts_with`.
- **WordPress 6.2+**. Admin builder is **React 18 built with `@wordpress/scripts`** (spec §5.1). The floor is 6.2 and not 6.0 because the bootstrap uses `createRoot`, which `@wordpress/element` only exposes from 6.2, when core moved to React 18.
- **React is never bundled.** The app uses WordPress's own React through `@wordpress/element`; `wp-scripts` externalises it and emits the dependency list. Shipping a second React into wp-admin is a defect, not a trade-off.
- **No jQuery** anywhere in this plan.
- Namespace root `Quoteform\`, PSR-4, one class per file, path mirrors namespace. `declare(strict_types=1);` in every PHP file.
- **No `eval()` anywhere, ever** — in PHP or in JavaScript. The expression engine exists so that no formula is ever `eval`'d. `new Function(...)` counts as `eval` and is equally forbidden.
- Every user-facing string translatable: `__()` / `esc_html__()` with text domain `quoteform` in PHP, `@wordpress/i18n`'s `__()` with the same domain in JavaScript (spec §17).
- **Admin assets load only on plugin pages** (spec §18). A script enqueued globally in wp-admin is a defect.
- Error codes are stable machine-readable snake_case strings; the builder keys off `code` and `path`, **never** the message text.
- Field, step and calculation keys match `^[a-z][a-z0-9_]{0,63}$`.
- A calculation keyed `total` is required in every schema (spec §6.2).
- Field types, exactly these thirteen (spec §6.2): `number, text, email, tel, textarea, select, radio, checkbox, toggle, date, slider, hidden, html`.
- Rule operators, exactly these ten (spec §8): `equals, not_equals, greater, greater_or_equal, less, less_or_equal, contains, not_contains, is_empty, is_not_empty`.
- Rule actions, exactly these four: `show, hide, require, optional`. `require` and `optional` apply to a **field** target only, never a step.
- **Keyboard parity (spec §16):** no builder function may be reachable only with a mouse. This is a hard requirement, not a polish item — it is why this plan uses no drag-and-drop library.
- The plugin is **fully free**: no licensing, telemetry, phone-home, upsell, "pro" teasers, or upgrade prompts. Not in code, not in copy, not in a disabled state.

---

## What Plan 02 already built, and which parts this plan consumes

The builder is a client of an API that exists and is tested. Read these before starting; do not re-derive them.

**REST, namespace `quoteform/v1`** (`includes/Rest/FormsController.php`). Every route requires the capability `qform_manage_forms`; a caller without it gets 401 logged out or 403 logged in, on every route, including for a form id that does not exist — the API is deliberately not an id oracle.

| Method | Route | Success | Body |
|---|---|---|---|
| `GET` | `/forms` | 200 | `[ { "id": 12, "title": "Cleaning", "modified": "2026-09-15T11:20:45" } ]`, plus `X-WP-Total` and `X-WP-TotalPages` headers; takes `page` and `per_page` |
| `GET` | `/forms/{id}` | 200 | `{ "id": 12, "title": "Cleaning", "schema": { ... } }` |
| `POST` | `/forms` | 201 | `{ "id", "title", "schema" }` — creates from `SchemaRepository::defaults()`; takes `title` only |
| `PUT` | `/forms/{id}` | 200 | `{ "id", "title", "schema" }` — takes `title` and `schema` |
| `DELETE` | `/forms/{id}` | 200 | `{ "id": 12, "deleted": true }` |

`PATCH` is deliberately **not** registered: both `title` and `schema` are required, so a partial update was never possible and advertising the verb was worse than not advertising it.

**The validation-error response** — the contract this whole plan renders:

```json
{
  "code": "qform_invalid_schema",
  "message": "The form could not be saved.",
  "data": {
    "status": 400,
    "errors": [
      { "path": "settings.decimals", "code": "out_of_range",
        "message": "...", "context": { "min": 0, "max": 6 } },
      { "path": "calculations.0.expression", "code": "invalid_expression",
        "message": "...", "context": { "engine_code": "unexpected_token", "position": 19 } }
    ]
  }
}
```

`errors` reaches the client verbatim — nothing reshaped, nothing truncated, every `path` and `context` intact, and **all** errors, not just the first. That is verified by an integration test.

**Other REST error codes you must handle:**

| Code | Status | Meaning |
|---|---|---|
| `qform_invalid_schema` | 400 | The schema failed validation. `data.errors` is populated. Also used when `schema` is not an object at all, carrying a single `invalid_type` error at the empty path — so there is exactly one error shape for every schema problem. |
| `qform_form_not_found` | 404 | No such form, wrong post type, or the form is in the trash. |
| `qform_schema_corrupt` | 500 | The stored meta is not an array. **The builder must refuse to offer an editor**, because saving over it would destroy recoverable data. |
| `qform_create_failed` / `qform_update_failed` | 500 | The write did not land. Nothing was saved. |
| `rest_trash_not_supported` | 501 | The site has the trash disabled, so a delete would be permanent. |
| `rest_invalid_param`, `rest_missing_callback_param` | 400 | WordPress's own argument validation — no `errors` array. |
| `rest_forbidden` | 401 / 403 | Not authorised. |
| `fetch_error` | — | `apiFetch`'s own code for a dropped connection. Its message is in WordPress's `default` text domain, not ours. |
| `invalid_json` | — | `apiFetch`'s own code when the body is not JSON — an HTML proxy page, or a PHP fatal. `status` is unavailable. |

**Error-code vocabulary used inside `data.errors`** (all snake_case, all stable): `invalid_type`, `missing_field`, `unknown_key`, `invalid_option`, `out_of_range`, `empty_collection`, `duplicate_key`, `unknown_reference`, `key_mismatch`, `key_collision`, `invalid_key_format`, `reserved_key`, `circular_reference`, `missing_total`, `invalid_expression`, `expression_too_long`.

Two of these need explanation because the builder renders them specially:

- `invalid_expression` carries `context.engine_code` (the engine's own slug, e.g. `unexpected_token`) and `context.position` — **a UTF-16 code-unit offset**, converted server-side precisely so a JavaScript caret lands in the right place. Use it directly as a string index; do not re-convert it.
- `circular_reference` appears in two places with one meaning: calculations that reference each other in a loop, and a rule whose condition tests a field on the very step it hides.

**The JavaScript expression engine** (`frontend-src/engine/index.js`), which the formula editor calls directly. The exported names are longer than you might guess — use them exactly:

- `compileExpression( source )` — throws `ExpressionError` on a bad formula
- `expressionVariables( source )` — the variable names a formula references
- `evaluateExpression( source, variables )`
- `orderCalculations( calculations )` — throws `ExpressionError` with `codeSlug` `circular_reference` on a loop, or `duplicate_calculation_key` on a repeated key
- `evaluateAllCalculations( calculations, variables )`
- `clearExpressionCache()`, `expressionCacheSize()`
- `ExpressionError` — `codeSlug`, `position`, `context`, plus the usual `message`

`position` from a thrown `ExpressionError` is already a UTF-16 offset in JavaScript, because JavaScript string indices are UTF-16 code units. The server converts; the browser does not have to.

---

## Decisions

Recorded here so no task re-litigates them mid-flight.

**D1 — React comes from WordPress, not from us.** `@wordpress/scripts` externalises `@wordpress/element`, `@wordpress/api-fetch` and `@wordpress/i18n` to the `wp-*` script handles WordPress already enqueues, and writes the handle list into a generated `.asset.php`. The build output therefore carries our code only. *Cost if wrong:* a second React in wp-admin, hundreds of kilobytes, and two reconcilers fighting over the same DOM.

**D2 — State lives in one `useReducer`, exposed through one Context.** No Redux, no Zustand, no external state library. The schema is a single JSON document; a reducer over that document is the natural shape, and it keeps the dependency list at zero. *Cost if wrong:* if the reducer grows unmanageable, splitting it is a later refactor, not a rewrite.

**D3 — Reordering uses Up/Down buttons, not drag-and-drop.** Spec §16 requires that no function be mouse-only. Drag-and-drop that is also fully keyboard-operable is a substantial amount of work and a bundle cost; buttons are keyboard-operable by construction and screen-reader-legible. *Cost if wrong:* reordering a twenty-field form is tedious. That is an acceptable v1.0 trade for an accessibility guarantee the spec makes a first-class requirement.

**D4 — Client-side validation is a convenience, never a gate.** Save always posts the full schema and always renders what the server says. The client may warn early — an unknown variable in a formula, a duplicate key — but it must never block a save the server would have accepted, and must never accept one the server would reject. The server is the only authority. *Cost if wrong:* a user sees an error twice, or once late. Both are far better than a client that disagrees with storage.

**D5 — Field keys are generated from the label, then frozen once used.** A new field gets a key slugified from its label. The key stays editable while nothing references it, and becomes read-only as soon as a calculation, rule or step references it — renaming it there would break those references silently. A rename-with-rewrite feature is out of scope for v1.0. *Cost if wrong:* a user who wants to rename a referenced key must delete and rebuild it.

**D6 — The formula editor validates through the JS engine on every keystroke, debounced 150ms.** It reports the engine's own `codeSlug` and puts a caret marker at `position`. This is safe because Plan 01's fixture gate proves the two engines agree; it is *useful* because a round trip to the server for every keystroke is not. *Cost if wrong:* nothing — the server still validates on save.

**D7 — One save button, whole-document PUT.** No per-field autosave, no partial updates (the API does not offer them). The app tracks a dirty flag and guards navigation. *Cost if wrong:* a long editing session risks more work on a failed save. Mitigated by the save button being always available and errors being precise.

**D8 — `qform_schema_corrupt` opens no editor.** The builder shows a plain explanation and a link to the form list. It must not offer a blank canvas, because pressing Save on it would overwrite a value still recoverable from `wp_postmeta`. *Cost if wrong:* a user with a corrupt form cannot fix it from the UI and needs a developer. That is the correct trade against silent data loss.

**D9 — Component tests exercise real DOM behaviour.** `@testing-library/react` with jsdom, driving components the way a person does — type into the field, click the button, assert what is on screen. No shallow rendering, no asserting on internal state, no snapshot tests. A test that asserts a component "rendered" proves nothing.

**D10 — The admin page is a custom menu page, not a CPT screen.** The `quoteform` post type is registered with `show_ui => false` and `show_in_rest => false` deliberately; the builder is the only editing surface. *Cost if wrong:* none — this is already how Plan 02 registered it.

---

## Explicitly out of scope for this plan

Named here so no task drifts into them.

- **The frontend renderer.** Spec §11's vanilla-JS form renderer, the shortcode, the Gutenberg block and the Elementor widget are all Plan 04.
- **Evaluating conditional rules.** The builder *edits* rules; it never runs them. Note for Plan 04's spec work: the engine currently has **no primitive** for `contains`, `not_contains`, `is_empty` or `is_not_empty`, and `Values::compare()` throws on lists — so spec §8's promise that conditions compile into the engine's comparison layer needs four new engine functions, in both languages, with shared fixtures. That is a real gap and it belongs to Plan 04, not here.
- **Entries, CSV export, email notifications, save & resume, spam protection.** Plan 04.
- **Schema version history / revision restore.** WordPress revisions do not cover post meta, so the schema is not currently revisioned at all despite the CPT declaring `supports( 'revisions' )`. Closing that needs `_wp_post_revision_fields` and `wp_restore_post_revision` hooks plus UI. It is a real gap in spec §6.1's reasoning and needs a product decision before it is planned.
- **A live preview of the form inside the builder.** Tempting, but it would require the Plan 04 renderer and rule evaluation. YAGNI until both exist.
- **Renaming a key and rewriting its references** (see D5).

---

## File structure

New source lives under `admin-src/`, which spec §5.3 already reserves for exactly this. `wp-scripts` compiles it into `build/`.

```
admin-src/
├── index.js                     # entry: mounts <App/> into the admin page's root node
├── api/
│   └── client.js                # REST calls + error normalisation. The only module that knows about HTTP.
├── state/
│   ├── reducer.js               # top level: id, title, settings, dirty/saving, delegation
│   ├── actions.js               # action creators — the reducer's only public vocabulary
│   ├── fields.js                # pure slice reducer for schema.fields      (Task 8)
│   ├── steps.js                 # pure slice reducer for schema.steps       (Task 10)
│   ├── calculations.js          # pure slice reducer for schema.calculations (Task 11)
│   ├── rules.js                 # pure slice reducer for schema.rules       (Task 12)
│   ├── errors.js                # indexes server errors by path; answers errorsFor(path)
│   └── StoreContext.js          # Provider + useStore/useDispatch hooks
├── lib/
│   ├── keys.js                  # slugify a label into a key; uniqueness; reserved-key check
│   └── reorder.js               # pure move-up / move-down on an array
├── screens/
│   ├── FormListScreen.js        # the list of forms; create and delete
│   └── EditorScreen.js          # the editing surface; owns load + save
├── panels/
│   ├── SettingsPanel.js
│   ├── FieldsPanel.js           # the field list: add, remove, reorder, select
│   ├── FieldEditor.js           # one field's properties, dispatching on type
│   ├── StepsPanel.js            # steps and which fields sit on each
│   ├── CalculationsPanel.js     # calculation list + the formula editor
│   └── RulesPanel.js            # conditional rules
├── components/
│   ├── FieldError.js            # renders the server errors for one path
│   ├── TextControl.js           # label + input + error + aria wiring
│   ├── SelectControl.js
│   ├── NumberControl.js
│   ├── ToggleControl.js
│   ├── MoveButtons.js           # the Up/Down pair from D3
│   └── Notice.js                # a dismissible status message
└── style.scss                   # compiled to build/style-index.css by wp-scripts

includes/Admin/
└── BuilderPage.php              # registers the menu page, enqueues the built assets

tests/js/admin/                  # Jest + @testing-library/react, jsdom environment
tests/e2e/                       # Playwright
```

Each file has one responsibility. `client.js` is the only module that knows HTTP exists; the `state/` slice files are the only modules that transform the schema, and each owns exactly one top-level key of it; `errors.js` is the only module that understands the server's error shape. Each slice ships with the panel that edits it, so a reviewer can reject the fields work while approving the steps work. Panels compose controls and dispatch actions — they hold no state of their own beyond transient UI state such as which field is selected.

---

## Task dependency map

Later tasks consume earlier ones. Nothing here is circular.

```
1  tooling + admin page + mount
   └─ 2  REST client
        └─ 3  schema reducer + actions
             ├─ 4  error index
             │    └─ 5  shared controls
             │         ├─ 7  settings panel
             │         ├─ 8  fields panel
             │         │    └─ 9  field editor (13 types)
             │         ├─ 10 steps panel
             │         ├─ 11 calculations panel + formula editor
             │         └─ 12 rules panel
             └─ 6  form list screen
                  └─ 13 editor screen: load, save, error surfacing
                       └─ 14 end-to-end pass
```

---

### Task 1: Build tooling, admin page, and the mount point

This task delivers an empty but real React app: a menu page in wp-admin that loads a compiled bundle and renders one line of text. Nothing after it can be tested until this works, so get it right before moving on.

**Files:**
- Modify: `package.json`
- Create: `admin-src/index.js`
- Create: `admin-src/App.js`
- Create: `admin-src/style.scss`
- Create: `includes/Admin/BuilderPage.php`
- Modify: `includes/Plugin.php`
- Modify: `jest.config.js`
- Create: `tests/js/setup-admin.js`
- Test: `tests/js/admin/App.test.js`
- Test: `tests/integration/BuilderPageTest.php`
- Modify: `.gitignore` (nothing to add — `/build/` is already un-ignored deliberately; confirm it is not listed)

**Interfaces:**
- Produces: `Quoteform\Admin\BuilderPage` — constant `MENU_SLUG = 'quoteform'`, static `register(): void`, static `addMenuPage(): void`, static `renderRoot(): void`, static `enqueueAssets( string $hookSuffix ): void`.
- Produces: `admin-src/App.js` default export `App` — a React component taking no props.

**Why `@wordpress/scripts` and not a hand-rolled webpack config:** it externalises `@wordpress/element`, `@wordpress/api-fetch` and `@wordpress/i18n` onto the `wp-element`, `wp-api-fetch` and `wp-i18n` script handles WordPress already registers, and writes the resulting handle list into `build/index.asset.php`. That file is how PHP learns the dependencies without anyone maintaining a list by hand. Depending on `wp-api-fetch` also matters for Task 2: WordPress attaches the REST root URL and a nonce middleware to that handle, so `apiFetch` arrives already authenticated for the logged-in user.

- [ ] **Step 1: Add the build and test dependencies**

Run, from the plugin root:

```bash
npm install --save-dev @wordpress/scripts@^27 @testing-library/react@^14 @testing-library/dom@^9 @testing-library/user-event@^14 @testing-library/jest-dom@^6 jest-environment-jsdom@^29
```

Expected: `package.json` gains those `devDependencies` and `package-lock.json` updates. Do not add `react` or `react-dom` — D1 forbids bundling React.

- [ ] **Step 2: Add the build scripts**

In `package.json`, the `scripts` block becomes:

```json
  "scripts": {
    "build": "wp-scripts build --webpack-src-dir=admin-src --output-path=build",
    "start": "wp-scripts start --webpack-src-dir=admin-src --output-path=build",
    "test": "jest"
  },
```

Leave `name`, `version`, `private` and `license` exactly as they are.

- [ ] **Step 3: Write the failing component test**

`tests/js/admin/App.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import App from '../../../admin-src/App';

describe( 'App', () => {
	it( 'renders the builder heading', () => {
		render( <App /> );

		expect(
			screen.getByRole( 'heading', { name: 'Quoteform' } )
		).toBeInTheDocument();
	} );
} );
```

- [ ] **Step 4: Teach Jest about JSX and jsdom**

`jest.config.js` becomes two projects, so the existing WordPress-free engine tests keep running exactly as they did:

```js
module.exports = {
	projects: [
		{
			displayName: 'engine',
			testEnvironment: 'node',
			testMatch: [ '<rootDir>/tests/js/**/*.test.js' ],
			testPathIgnorePatterns: [ '<rootDir>/tests/js/admin/' ],
		},
		{
			displayName: 'admin',
			testEnvironment: 'jsdom',
			testMatch: [ '<rootDir>/tests/js/admin/**/*.test.js' ],
			setupFilesAfterEnv: [ '<rootDir>/tests/js/setup-admin.js' ],
			moduleNameMapper: {
				'\\.(css|scss)$': '<rootDir>/tests/js/admin/styleStub.js',
			},
		},
	],
};
```

`tests/js/setup-admin.js`:

```js
import '@testing-library/jest-dom';
```

`tests/js/admin/styleStub.js`:

```js
module.exports = {};
```

Babel must understand JSX and the automatic runtime. `babel.config.js` becomes:

```js
module.exports = {
	presets: [
		[ '@babel/preset-env', { targets: { node: 'current' } } ],
		[ '@babel/preset-react', { runtime: 'automatic' } ],
	],
};
```

Install that preset:

```bash
npm install --save-dev @babel/preset-react@^7
```

**A trap worth knowing:** `@wordpress/element` re-exports React, but under Jest it resolves to the real npm package, which is not installed (D1). Map it to React's own runtime for tests only, by adding to the `admin` project's `moduleNameMapper`:

```js
				'^@wordpress/element$': '<rootDir>/tests/js/admin/wpElementStub.js',
```

`tests/js/admin/wpElementStub.js`:

```js
const React = require( 'react' );

module.exports = {
	...React,
	createRoot: require( 'react-dom/client' ).createRoot,
};
```

That needs React present as a dev dependency only — it is never bundled:

```bash
npm install --save-dev react@^18 react-dom@^18
```

This is the one place React appears, and it appears under `devDependencies`. If you find yourself adding it to `dependencies`, stop: that is D1 being violated.

- [ ] **Step 5: Run the test and watch it fail**

Run: `npx jest --selectProjects admin`

Expected: FAIL — `Cannot find module '../../../admin-src/App'`. The component does not exist yet.

- [ ] **Step 6: Write the component**

`admin-src/App.js`:

```js
import { __ } from '@wordpress/i18n';

export default function App() {
	return (
		<div className="qform-builder">
			<h1>{ __( 'Quoteform', 'quoteform' ) }</h1>
		</div>
	);
}
```

`admin-src/index.js`:

```js
import { createRoot } from '@wordpress/element';

import App from './App';
import './style.scss';

const root = document.getElementById( 'quoteform-root' );

if ( root ) {
	createRoot( root ).render( <App /> );
}
```

`admin-src/style.scss`:

```scss
.qform-builder {
	max-width: 1100px;
}
```

Mapping `@wordpress/i18n` is not needed: it is a real npm package and `wp-scripts` externalises it at build time while Jest resolves the package normally. Install it as a dev dependency so Jest can:

```bash
npm install --save-dev @wordpress/i18n@^4
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx jest --selectProjects admin`
Expected: PASS — 1 test.

Then confirm nothing regressed: `npm test`
Expected: both projects green; the engine project still reports its full count.

- [ ] **Step 8: Write the failing PHP test**

`tests/integration/BuilderPageTest.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Admin\BuilderPage;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_UnitTestCase;

final class BuilderPageTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    public function testBootHooksTheMenuPageOntoAdminMenu(): void
    {
        $this->assertSame(
            10,
            has_action( 'admin_menu', [ BuilderPage::class, 'addMenuPage' ] )
        );
    }

    public function testBootHooksTheAssetEnqueueOntoAdminEnqueueScripts(): void
    {
        $this->assertSame(
            10,
            has_action( 'admin_enqueue_scripts', [ BuilderPage::class, 'enqueueAssets' ] )
        );
    }

    public function testTheMenuPageRequiresOurCapability(): void
    {
        global $admin_page_hooks, $submenu, $menu;

        $admin_page_hooks = [];
        $submenu          = [];
        $menu             = [];

        Activation::activate();
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );

        BuilderPage::addMenuPage();

        $slugs = array_column( $menu, 2 );

        $this->assertContains( BuilderPage::MENU_SLUG, $slugs );

        foreach ( $menu as $entry ) {
            if ( $entry[2] === BuilderPage::MENU_SLUG ) {
                $this->assertSame( Capabilities::MANAGE_FORMS, $entry[1] );
            }
        }
    }

    public function testAssetsAreNotEnqueuedOnAnUnrelatedAdminScreen(): void
    {
        BuilderPage::enqueueAssets( 'edit.php' );

        $this->assertFalse( wp_script_is( 'quoteform-builder', 'enqueued' ) );
        $this->assertFalse( wp_style_is( 'quoteform-builder', 'enqueued' ) );
    }

    public function testTheRootNodeIsRendered(): void
    {
        ob_start();
        BuilderPage::renderRoot();
        $html = (string) ob_get_clean();

        $this->assertStringContainsString( 'id="quoteform-root"', $html );
    }
}
```

- [ ] **Step 9: Run it and watch it fail**

Run: `make itest ARGS="--filter BuilderPageTest"`
Expected: FAIL. PHPUnit will print its known-defective `syntax error, unexpected identifier "SERIALIZATION_FORMAT_USE_UNSER...", expecting "="` message; the true cause is that `Quoteform\Admin\BuilderPage` does not exist yet.

- [ ] **Step 10: Write the admin page**

`includes/Admin/BuilderPage.php`:

```php
<?php

declare(strict_types=1);

namespace Quoteform\Admin;

use Quoteform\Support\Capabilities;

/**
 * Builder-in wp-admin səhifəsi.
 *
 * Asset-lər YALNIZ bu səhifədə yüklənir (spec §18). `add_menu_page()`
 * qaytardığı hook suffix-i saxlanılır, çünki `admin_enqueue_scripts`
 * ona görə filtrlənir — səhifə sluq-u ilə müqayisə etmək kifayət deyil.
 */
final class BuilderPage
{
    public const MENU_SLUG = 'quoteform';

    /** @var string */
    private static $hookSuffix = '';

    public static function register(): void
    {
        add_action( 'admin_menu', [ self::class, 'addMenuPage' ] );
        add_action( 'admin_enqueue_scripts', [ self::class, 'enqueueAssets' ] );
    }

    public static function addMenuPage(): void
    {
        $hookSuffix = add_menu_page(
            __( 'Quoteform', 'quoteform' ),
            __( 'Quoteform', 'quoteform' ),
            Capabilities::MANAGE_FORMS,
            self::MENU_SLUG,
            [ self::class, 'renderRoot' ],
            'dashicons-calculator',
            26
        );

        self::$hookSuffix = is_string( $hookSuffix ) ? $hookSuffix : '';
    }

    public static function renderRoot(): void
    {
        echo '<div class="wrap"><div id="quoteform-root"></div></div>';
    }

    public static function enqueueAssets( string $hookSuffix ): void
    {
        if ( self::$hookSuffix === '' || $hookSuffix !== self::$hookSuffix ) {
            return;
        }

        $assetFile = QFORM_PATH . 'build/index.asset.php';

        if ( ! file_exists( $assetFile ) ) {
            return;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_enqueue_script(
            'quoteform-builder',
            QFORM_URL . 'build/index.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        // `@wordpress/scripts` a `style.scss` importunu HƏMİŞƏ `style-index.css`
        // adlandırır (Gutenberg-in style/editor bölgüsü konvensiyası), ona görə
        // `index.css` 404 verər.
        wp_enqueue_style(
            'quoteform-builder',
            QFORM_URL . 'build/style-index.css',
            [ 'wp-components' ],
            $asset['version']
        );

        wp_set_script_translations( 'quoteform-builder', 'quoteform', QFORM_PATH . 'languages' );
    }
}
```

- [ ] **Step 11: Wire it into the bootstrap**

In `includes/Plugin.php`, add the import and one line inside `boot()`, after the `init` hook and before the `rest_api_init` one:

```php
use Quoteform\Admin\BuilderPage;
```

```php
        BuilderPage::register();
```

`BuilderPage::register()` only adds hooks, so calling it from `boot()` is correct and keeps the `$booted` guard meaningful.

- [ ] **Step 12: Run the tests and watch them pass**

Run: `make itest ARGS="--filter BuilderPageTest"`
Expected: PASS — 5 tests.

Then the whole suite: `make check`
Expected: every suite green, with the integration count up by 5 and the JS count up by 1.

- [ ] **Step 13: Build the bundle and look at it in a browser**

Run: `npm run build`
Expected: `build/index.js`, `build/style-index.css` and `build/index.asset.php` appear. Note the CSS name — `wp-scripts` renames a `style.scss` chunk to `style-index.css`, and enqueuing `index.css` silently 404s. Open `build/index.asset.php` and confirm `dependencies` contains `wp-element` and `wp-i18n` — that is the proof React is external rather than bundled.

Then open `http://localhost:8083/wp-admin/` (admin / admin) and confirm a **Quoteform** menu item exists and its page shows the heading. Confirm with the browser's network panel that `index.js` loads on that page and **does not** load on Dashboard or Posts.

- [ ] **Step 14: Prepare a commit message**

```
feat(admin): add the builder admin page and its build pipeline
```

Do not run `git commit` — this project has zero commits by explicit instruction from its author, and the commit decision is theirs.

---

### Task 2: The REST client

One module owns every HTTP call. Everything above it deals in plain data and a single normalised error shape, so no panel ever has to know what a 400 looks like.

**Files:**
- Create: `admin-src/api/client.js`
- Test: `tests/js/admin/client.test.js`

**Interfaces:**
- Consumes: `@wordpress/api-fetch` (available because Task 1 depends on the `wp-api-fetch` handle, which WordPress ships pre-configured with the REST root and a nonce middleware).
- Produces, all returning Promises:
  - `listForms( { page = 1, perPage = 20 } = {} ) → { forms, total, totalPages }`
  - `getForm( id ) → { id, title, schema }`
  - `createForm( title ) → { id, title, schema }`
  - `updateForm( id, { title, schema } ) → { id, title, schema }`
  - `deleteForm( id ) → { id, deleted }`
  - `ApiError` — a class with `code`, `status`, `message`, `errors` (an array, empty when the server sent none)

**The normalisation rule, and why it exists:** the server speaks two error dialects. Schema problems arrive as `qform_invalid_schema` with a populated `data.errors`; WordPress's own argument validation arrives as `rest_invalid_param` with no `errors` at all. Panels must not each learn both. `ApiError` always exposes an `errors` array — empty when the server sent none — so a caller can render `errors` unconditionally and fall back to `message` when it is empty.

- [ ] **Step 1: Write the failing tests**

`tests/js/admin/client.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import apiFetch from '@wordpress/api-fetch';

import {
	ApiError,
	createForm,
	deleteForm,
	getForm,
	listForms,
	updateForm,
} from '../../../admin-src/api/client';

jest.mock( '@wordpress/api-fetch' );

describe( 'listForms', () => {
	it( 'returns the forms and the totals from the response headers', async () => {
		apiFetch.mockResolvedValue( {
			body: [ { id: 3, title: 'Cleaning', modified: '2026-09-15T11:20:45' } ],
			headers: new Headers( { 'X-WP-Total': '41', 'X-WP-TotalPages': '3' } ),
		} );

		const result = await listForms( { page: 2, perPage: 20 } );

		expect( result.forms ).toEqual( [
			{ id: 3, title: 'Cleaning', modified: '2026-09-15T11:20:45' },
		] );
		expect( result.total ).toBe( 41 );
		expect( result.totalPages ).toBe( 3 );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms?page=2&per_page=20',
			parse: false,
		} );
	} );

	it( 'falls back to zero totals when the headers are absent', async () => {
		apiFetch.mockResolvedValue( { body: [], headers: new Headers() } );

		const result = await listForms();

		expect( result.total ).toBe( 0 );
		expect( result.totalPages ).toBe( 0 );
	} );
} );

describe( 'getForm', () => {
	it( 'requests one form by id', async () => {
		apiFetch.mockResolvedValue( { id: 7, title: 'Quote', schema: { version: 1 } } );

		const form = await getForm( 7 );

		expect( form.id ).toBe( 7 );
		expect( apiFetch ).toHaveBeenCalledWith( { path: '/quoteform/v1/forms/7' } );
	} );
} );

describe( 'createForm', () => {
	it( 'posts the title', async () => {
		apiFetch.mockResolvedValue( { id: 9, title: 'New form', schema: {} } );

		await createForm( 'New form' );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms',
			method: 'POST',
			data: { title: 'New form' },
		} );
	} );
} );

describe( 'updateForm', () => {
	it( 'puts the whole document', async () => {
		const schema = { version: 1, settings: {} };
		apiFetch.mockResolvedValue( { id: 7, title: 'Quote', schema } );

		await updateForm( 7, { title: 'Quote', schema } );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms/7',
			method: 'PUT',
			data: { title: 'Quote', schema },
		} );
	} );
} );

describe( 'deleteForm', () => {
	it( 'deletes by id', async () => {
		apiFetch.mockResolvedValue( { id: 7, deleted: true } );

		await deleteForm( 7 );

		expect( apiFetch ).toHaveBeenCalledWith( {
			path: '/quoteform/v1/forms/7',
			method: 'DELETE',
		} );
	} );
} );

describe( 'error normalisation', () => {
	it( 'keeps every validation error, with its path and context intact', async () => {
		apiFetch.mockRejectedValue( {
			code: 'qform_invalid_schema',
			message: 'The form could not be saved.',
			data: {
				status: 400,
				errors: [
					{
						path: 'settings.decimals',
						code: 'out_of_range',
						message: 'Too many decimals.',
						context: { min: 0, max: 6 },
					},
					{
						path: 'calculations.0.expression',
						code: 'invalid_expression',
						message: 'Broken formula.',
						context: { engine_code: 'unexpected_token', position: 19 },
					},
				],
			},
		} );

		expect.assertions( 5 );

		try {
			await updateForm( 7, { title: 'x', schema: {} } );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ApiError );
			expect( error.code ).toBe( 'qform_invalid_schema' );
			expect( error.status ).toBe( 400 );
			expect( error.errors ).toHaveLength( 2 );
			expect( error.errors[ 1 ].context.position ).toBe( 19 );
		}
	} );

	it( 'gives an empty errors array when the server sent none', async () => {
		apiFetch.mockRejectedValue( {
			code: 'rest_invalid_param',
			message: 'Invalid parameter(s): title',
			data: { status: 400, params: { title: 'Invalid.' } },
		} );

		expect.assertions( 3 );

		try {
			await createForm( '' );
		} catch ( error ) {
			expect( error.code ).toBe( 'rest_invalid_param' );
			expect( error.errors ).toEqual( [] );
			expect( error.message ).toBe( 'Invalid parameter(s): title' );
		}
	} );

	it( 'survives a rejection that is not shaped like a WordPress error at all', async () => {
		apiFetch.mockRejectedValue( new TypeError( 'Failed to fetch' ) );

		expect.assertions( 3 );

		try {
			await getForm( 7 );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ApiError );
			expect( error.code ).toBe( 'qform_network_error' );
			expect( error.errors ).toEqual( [] );
		}
	} );
} );
```

That last case matters more than it looks — but be precise about what actually happens. `@wordpress/api-fetch` intercepts most of these itself and gives them codes of its own:

| What went wrong | What `apiFetch` rejects with |
|---|---|
| dropped connection | `{ code: 'fetch_error', message: 'You are probably offline.' }` |
| HTML proxy page, or a PHP fatal | `{ code: 'invalid_json', … }` — no `data`, so `status` is lost |
| a non-2xx under `parse: false` | a bare `Response` — **no `code` at all** |
| an aborted request as a `DOMException` | a numeric `code` (`20`), not a string |

Only the last two reach the no-usable-code fallback, which is why the code tests `typeof raw.code !== 'string'` rather than truthiness — a numeric `code` would otherwise leak through as `ApiError { code: 20 }`.

`fetch_error` and `invalid_json` are codes the builder will really meet, so they belong in the vocabulary the later panels branch on.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern client`
Expected: FAIL — `Cannot find module '../../../admin-src/api/client'`.

- [ ] **Step 3: Write the client**

`admin-src/api/client.js`:

```js
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';

const NAMESPACE = '/quoteform/v1';

/**
 * Serverin İKİ xəta ləhcəsi var: sxem problemləri `data.errors` ilə,
 * WordPress-in öz arqument validasiyası isə onsuz gəlir. Panellər hər
 * ikisini ayrıca öyrənməsin deyə `errors` HƏMİŞƏ massivdir.
 */
export class ApiError extends Error {
	constructor( { code, status, message, errors } ) {
		super( message );

		this.name = 'ApiError';
		this.code = code;
		this.status = status;
		this.errors = errors;
	}
}

function toApiError( raw ) {
	if ( ! raw || typeof raw.code !== 'string' ) {
		return new ApiError( {
			code: 'qform_network_error',
			status: 0,
			message: __(
				'The server could not be reached. Check your connection and try again.',
				'quoteform'
			),
			errors: [],
		} );
	}

	const data = raw.data || {};

	return new ApiError( {
		code: raw.code,
		status: typeof data.status === 'number' ? data.status : 0,
		message: raw.message || '',
		errors: Array.isArray( data.errors ) ? data.errors : [],
	} );
}

async function request( options ) {
	try {
		return await apiFetch( options );
	} catch ( raw ) {
		throw toApiError( raw );
	}
}

function headerNumber( headers, name ) {
	const value = headers && typeof headers.get === 'function' ? headers.get( name ) : null;
	const parsed = Number.parseInt( value, 10 );

	return Number.isNaN( parsed ) ? 0 : parsed;
}

export async function listForms( { page = 1, perPage = 20 } = {} ) {
	const response = await request( {
		path: `${ NAMESPACE }/forms?page=${ page }&per_page=${ perPage }`,
		parse: false,
	} );

	return {
		forms: response.body,
		total: headerNumber( response.headers, 'X-WP-Total' ),
		totalPages: headerNumber( response.headers, 'X-WP-TotalPages' ),
	};
}

export function getForm( id ) {
	return request( { path: `${ NAMESPACE }/forms/${ id }` } );
}

export function createForm( title ) {
	return request( {
		path: `${ NAMESPACE }/forms`,
		method: 'POST',
		data: { title },
	} );
}

export function updateForm( id, { title, schema } ) {
	return request( {
		path: `${ NAMESPACE }/forms/${ id }`,
		method: 'PUT',
		data: { title, schema },
	} );
}

export function deleteForm( id ) {
	return request( {
		path: `${ NAMESPACE }/forms/${ id }`,
		method: 'DELETE',
	} );
}
```

**On `parse: false` in `listForms`, and the trap in it.** `apiFetch` normally hands back parsed JSON and throws the headers away. The list needs `X-WP-Total`, so it asks for the raw `Response` instead. That changes **two** things, and the second one is easy to miss:

- It resolves with the raw `Response`. `response.body` is therefore an unread `ReadableStream`, **not** the parsed array — you must `await response.json()`.
- It changes the *error* path too. `parseAndThrowError( response, false )` does `throw response`, so a non-2xx rejects with a bare `Response`, which has **no `code`**. Without special handling, a genuine 403 normalises to "check your connection" and the real status is lost.

So `request()` has to know when `parse: false` was used and read `code`, `status` and `errors` off the `Response` itself. A mocked test cannot catch either of these — see the note on real-package coverage below.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern client`
Expected: PASS — 9 tests.

- [ ] **Step 5: Prepare a commit message**

```
feat(admin): add the REST client and normalise the server's two error shapes
```

Do not run `git commit`.

---

### Task 3: The store — top-level reducer, actions and context

The spine. One reducer holds the loaded form and its dirty state; later tasks add slice reducers for fields, steps, calculations and rules, and this reducer delegates to them. Building the delegation seam now means those tasks add a branch rather than restructure anything.

**Files:**
- Create: `admin-src/state/reducer.js`
- Create: `admin-src/state/actions.js`
- Create: `admin-src/state/StoreContext.js`
- Test: `tests/js/admin/reducer.test.js`
- Test: `tests/js/admin/StoreContext.test.js`

**Interfaces:**
- Produces: `initialState` — `{ id: null, title: '', schema: null, dirty: false, saving: false, loadError: null, saveError: null }`
- Produces: `reducer( state, action ) → state` — pure, never mutates its input
- Produces action creators from `actions.js`: `loadStarted()`, `loadSucceeded( form )`, `loadFailed( apiError )`, `setTitle( title )`, `setSetting( key, value )`, `saveStarted()`, `saveSucceeded( form )`, `saveFailed( apiError )`, `dismissSaveError()`
- Produces: `StoreProvider`, `useStore()`, `useDispatch()` from `StoreContext.js`
- Consumes: `ApiError` from Task 2 (only as an opaque value carried in state)

**The dirty rule, stated once:** any action that changes `title` or any part of `schema` sets `dirty: true`. `loadSucceeded` and `saveSucceeded` both set it back to `false`, because in both cases what is on screen matches what is stored. Nothing else touches it. Later tasks that add slice actions must go through the same delegation branch so they inherit this rule rather than each remembering it.

- [ ] **Step 1: Write the failing reducer tests**

`tests/js/admin/reducer.test.js`:

```js
import { reducer, initialState } from '../../../admin-src/state/reducer';
import {
	dismissSaveError,
	loadFailed,
	loadStarted,
	loadSucceeded,
	saveFailed,
	saveStarted,
	saveSucceeded,
	setSetting,
	setTitle,
} from '../../../admin-src/state/actions';

const form = {
	id: 7,
	title: 'Cleaning quote',
	schema: {
		version: 1,
		settings: { currency: 'USD', decimals: 2 },
		fields: {},
		steps: [],
		calculations: [],
		rules: [],
		notifications: [],
	},
};

describe( 'loading', () => {
	it( 'starts clean and empty', () => {
		expect( initialState.id ).toBeNull();
		expect( initialState.schema ).toBeNull();
		expect( initialState.dirty ).toBe( false );
	} );

	it( 'stores the loaded form and is not dirty', () => {
		const state = reducer( initialState, loadSucceeded( form ) );

		expect( state.id ).toBe( 7 );
		expect( state.title ).toBe( 'Cleaning quote' );
		expect( state.schema.settings.currency ).toBe( 'USD' );
		expect( state.dirty ).toBe( false );
		expect( state.loadError ).toBeNull();
	} );

	it( 'clears a previous load error when a load starts', () => {
		const failed = reducer( initialState, loadFailed( { code: 'qform_form_not_found' } ) );
		const restarted = reducer( failed, loadStarted() );

		expect( failed.loadError.code ).toBe( 'qform_form_not_found' );
		expect( restarted.loadError ).toBeNull();
	} );
} );

describe( 'editing', () => {
	it( 'sets the title and becomes dirty', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const state = reducer( loaded, setTitle( 'Renamed' ) );

		expect( state.title ).toBe( 'Renamed' );
		expect( state.dirty ).toBe( true );
	} );

	it( 'sets one setting without disturbing the others', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const state = reducer( loaded, setSetting( 'decimals', 4 ) );

		expect( state.schema.settings.decimals ).toBe( 4 );
		expect( state.schema.settings.currency ).toBe( 'USD' );
		expect( state.dirty ).toBe( true );
	} );

	it( 'never mutates the state it was given', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const before = JSON.stringify( loaded );

		reducer( loaded, setSetting( 'decimals', 6 ) );

		expect( JSON.stringify( loaded ) ).toBe( before );
	} );

	it( 'ignores edits when nothing is loaded', () => {
		const state = reducer( initialState, setSetting( 'decimals', 4 ) );

		expect( state ).toBe( initialState );
	} );
} );

describe( 'saving', () => {
	it( 'marks saving and clears the previous save error', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const failed = reducer( loaded, saveFailed( { code: 'qform_invalid_schema', errors: [] } ) );
		const state = reducer( failed, saveStarted() );

		expect( failed.saveError.code ).toBe( 'qform_invalid_schema' );
		expect( state.saving ).toBe( true );
		expect( state.saveError ).toBeNull();
	} );

	it( 'is clean again after a successful save, and takes the server copy', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const edited = reducer( loaded, setTitle( 'Renamed' ) );
		const saved = reducer( edited, saveSucceeded( { ...form, title: 'Renamed' } ) );

		expect( saved.dirty ).toBe( false );
		expect( saved.saving ).toBe( false );
		expect( saved.title ).toBe( 'Renamed' );
	} );

	it( 'stays dirty when the save fails', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const edited = reducer( loaded, setTitle( 'Renamed' ) );
		const failed = reducer( edited, saveFailed( { code: 'qform_invalid_schema', errors: [] } ) );

		expect( failed.dirty ).toBe( true );
		expect( failed.saving ).toBe( false );
		expect( failed.saveError.code ).toBe( 'qform_invalid_schema' );
	} );

	it( 'dismisses the save error without touching the document', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );
		const failed = reducer( loaded, saveFailed( { code: 'qform_invalid_schema', errors: [] } ) );
		const state = reducer( failed, dismissSaveError() );

		expect( state.saveError ).toBeNull();
		expect( state.schema ).toEqual( failed.schema );
	} );
} );

describe( 'unknown actions', () => {
	it( 'returns the same state object', () => {
		const loaded = reducer( initialState, loadSucceeded( form ) );

		expect( reducer( loaded, { type: 'nothing/at/all' } ) ).toBe( loaded );
	} );
} );
```

Two of those deserve a word. "Never mutates the state it was given" catches the single most common React bug — a reducer that edits in place, so components never re-render and the UI silently stops tracking the document. "Ignores edits when nothing is loaded" catches the crash where a stray action arrives before the load resolves and the reducer dereferences `state.schema.settings` on `null`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern reducer`
Expected: FAIL — `Cannot find module '../../../admin-src/state/reducer'`.

- [ ] **Step 3: Write the actions**

`admin-src/state/actions.js`:

```js
export const LOAD_STARTED = 'load/started';
export const LOAD_SUCCEEDED = 'load/succeeded';
export const LOAD_FAILED = 'load/failed';
export const SET_TITLE = 'form/setTitle';
export const SET_SETTING = 'settings/set';
export const SAVE_STARTED = 'save/started';
export const SAVE_SUCCEEDED = 'save/succeeded';
export const SAVE_FAILED = 'save/failed';
export const DISMISS_SAVE_ERROR = 'save/dismissError';

export const loadStarted = () => ( { type: LOAD_STARTED } );
export const loadSucceeded = ( form ) => ( { type: LOAD_SUCCEEDED, form } );
export const loadFailed = ( error ) => ( { type: LOAD_FAILED, error } );

export const setTitle = ( title ) => ( { type: SET_TITLE, title } );
export const setSetting = ( key, value ) => ( { type: SET_SETTING, key, value } );

export const saveStarted = () => ( { type: SAVE_STARTED } );
export const saveSucceeded = ( form ) => ( { type: SAVE_SUCCEEDED, form } );
export const saveFailed = ( error ) => ( { type: SAVE_FAILED, error } );
export const dismissSaveError = () => ( { type: DISMISS_SAVE_ERROR } );
```

- [ ] **Step 4: Write the reducer**

`admin-src/state/reducer.js`:

```js
import {
	DISMISS_SAVE_ERROR,
	LOAD_FAILED,
	LOAD_STARTED,
	LOAD_SUCCEEDED,
	SAVE_FAILED,
	SAVE_STARTED,
	SAVE_SUCCEEDED,
	SET_SETTING,
	SET_TITLE,
} from './actions';

export const initialState = {
	id: null,
	title: '',
	schema: null,
	dirty: false,
	saving: false,
	loadError: null,
	saveError: null,
};

/**
 * Sxemi dəyişən HƏR əməliyyat buradan keçir, ona görə `dirty: true`
 * bir yerdə yazılır və hər slice-ın onu ayrıca yadda saxlaması lazım gəlmir.
 */
function editSchema( state, produce ) {
	if ( state.schema === null ) {
		return state;
	}

	const next = produce( state.schema );

	// Hər slice reduseri heç nə dəyişmədikdə ÖZ girişini qaytarır
	// (`moveUp( list, 0 )`, mövcud olmayan indeks, və s.). Bu siqnal
	// burada tutulmasa, siyahının BİRİNCİ elementində "Yuxarı" düyməsini
	// basmaq formanı "dəyişdi" sayar və saxlanmamış-dəyişiklik xəbərdarlığını
	// işə salar — baş verməmiş redaktə üçün.
	if ( next === state.schema ) {
		return state;
	}

	return { ...state, schema: next, dirty: true };
}

export function reducer( state, action ) {
	switch ( action.type ) {
		case LOAD_STARTED:
			return { ...state, loadError: null };

		case LOAD_SUCCEEDED:
			return {
				...state,
				id: action.form.id,
				title: action.form.title,
				schema: action.form.schema,
				dirty: false,
				saving: false,
				loadError: null,
				saveError: null,
			};

		case LOAD_FAILED:
			// Sxem yoxdursa, saxlanmamış dəyişiklik də ola bilməz — `dirty`
			// qalsaydı, naviqasiya mühafizəsi artıq mövcud olmayan sənəd
			// üstündə işə düşərdi.
			return { ...state, schema: null, dirty: false, loadError: action.error };

		case SET_TITLE:
			if ( state.schema === null ) {
				return state;
			}

			return { ...state, title: action.title, dirty: true };

		case SET_SETTING:
			return editSchema( state, ( schema ) => {
				// Producer heç nə dəyişmədikdə ÖZ girişini qaytarmalıdır —
				// tikişdəki eyniyyət yoxlaması məhz bu siqnala baxır. Hər slice
				// reduseri də eyni qaydaya tabedir.
				if ( schema.settings[ action.key ] === action.value ) {
					return schema;
				}

				return {
					...schema,
					settings: { ...schema.settings, [ action.key ]: action.value },
				};
			} );

		case SAVE_STARTED:
			return { ...state, saving: true, saveError: null };

		case SAVE_SUCCEEDED:
			return {
				...state,
				id: action.form.id,
				title: action.form.title,
				schema: action.form.schema,
				dirty: false,
				saving: false,
				saveError: null,
			};

		case SAVE_FAILED:
			return { ...state, saving: false, saveError: action.error };

		case DISMISS_SAVE_ERROR:
			return { ...state, saveError: null };

		default:
			return state;
	}
}
```

`editSchema` is the delegation seam. Tasks 8, 10, 11 and 12 each add one `case` that calls it with their slice function — for example `editSchema( state, ( schema ) => { const fields = fieldsReducer( schema.fields, action ); return fields === schema.fields ? schema : { ...schema, fields }; } )`. They never write `dirty` themselves — but they **must** return the schema unchanged when their slice did, or the no-op check above never fires.

- [ ] **Step 5: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern reducer`
Expected: PASS — 12 tests.

- [ ] **Step 6: Write the failing context test**

`tests/js/admin/StoreContext.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded, setTitle } from '../../../admin-src/state/actions';

const form = {
	id: 3,
	title: 'Before',
	schema: { version: 1, settings: {}, fields: {}, steps: [], calculations: [], rules: [], notifications: [] },
};

function Probe() {
	const { title, dirty } = useStore();
	const dispatch = useDispatch();

	return (
		<div>
			<p>title: { title }</p>
			<p>dirty: { dirty ? 'yes' : 'no' }</p>
			<button onClick={ () => dispatch( loadSucceeded( form ) ) }>load</button>
			<button onClick={ () => dispatch( setTitle( 'After' ) ) }>rename</button>
		</div>
	);
}

describe( 'StoreContext', () => {
	it( 'threads state and dispatch through the tree', async () => {
		const user = userEvent.setup();

		render(
			<StoreProvider>
				<Probe />
			</StoreProvider>
		);

		await user.click( screen.getByRole( 'button', { name: 'load' } ) );
		expect( screen.getByText( 'title: Before' ) ).toBeInTheDocument();
		expect( screen.getByText( 'dirty: no' ) ).toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'rename' } ) );
		expect( screen.getByText( 'title: After' ) ).toBeInTheDocument();
		expect( screen.getByText( 'dirty: yes' ) ).toBeInTheDocument();
	} );

	it( 'throws a useful error when a hook is used outside the provider', () => {
		const spy = jest.spyOn( console, 'error' ).mockImplementation( () => {} );

		expect( () => render( <Probe /> ) ).toThrow( /StoreProvider/ );

		spy.mockRestore();
	} );
} );
```

The second test is worth the four lines: without it, using a hook outside the provider gives `Cannot destructure property 'title' of 'null'`, thrown from a component that has nothing to do with the mistake.

- [ ] **Step 7: Run it and watch it fail**

Run: `npx jest --selectProjects admin --testPathPattern StoreContext`
Expected: FAIL — module not found.

- [ ] **Step 8: Write the context**

`admin-src/state/StoreContext.js`:

```js
import { createContext, useContext, useReducer } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { initialState, reducer } from './reducer';

const StateContext = createContext( null );
const DispatchContext = createContext( null );

export function StoreProvider( { children } ) {
	const [ state, dispatch ] = useReducer( reducer, initialState );

	return (
		<DispatchContext.Provider value={ dispatch }>
			<StateContext.Provider value={ state }>{ children }</StateContext.Provider>
		</DispatchContext.Provider>
	);
}

export function useStore() {
	const state = useContext( StateContext );

	if ( state === null ) {
		throw new Error(
			__( 'useStore must be used inside a StoreProvider.', 'quoteform' )
		);
	}

	return state;
}

export function useDispatch() {
	const dispatch = useContext( DispatchContext );

	if ( dispatch === null ) {
		throw new Error(
			__( 'useDispatch must be used inside a StoreProvider.', 'quoteform' )
		);
	}

	return dispatch;
}
```

State and dispatch live in **two** contexts on purpose: a component that only dispatches does not re-render when the document changes. With one combined context every button in the builder re-renders on every keystroke.

- [ ] **Step 9: Run it and watch it pass**

Run: `npx jest --selectProjects admin --testPathPattern StoreContext`
Expected: PASS — 2 tests.

Then `npm test`
Expected: both projects green.

- [ ] **Step 10: Prepare a commit message**

```
feat(admin): add the schema store, its actions and its React context
```

Do not run `git commit`.

---

### Task 4: The error index

The server answers with a flat list of errors, each carrying a dot-separated `path`. Controls need two questions answered fast: *what is wrong with me?* and *is anything wrong anywhere beneath me?* — the second so a field in a list can carry a badge without its editor being open.

**Files:**
- Create: `admin-src/state/errors.js`
- Test: `tests/js/admin/errors.test.js`

**Interfaces:**
- Produces: `indexErrors( errors ) → ErrorIndex` — accepts `null`, `undefined` or a non-array without throwing
- Produces: `errorsFor( index, path ) → Error[]` — errors at exactly that path, in server order
- Produces: `hasErrorsUnder( index, prefix ) → boolean` — true when anything at or beneath `prefix` has an error
- Produces: `EMPTY_INDEX` — a shared empty index, so components have something to use before a save has ever failed

**The prefix rule, and the trap in it:** `hasErrorsUnder( index, 'fields.room' )` must be **false** when the only error is at `fields.room_count.label`. A naive `path.startsWith( prefix )` returns true, and the builder puts an error badge on the wrong field. A prefix matches only at a segment boundary: the path must equal the prefix, or begin with the prefix followed by a dot.

- [ ] **Step 1: Write the failing tests**

`tests/js/admin/errors.test.js`:

```js
import {
	EMPTY_INDEX,
	errorsFor,
	hasErrorsUnder,
	indexErrors,
} from '../../../admin-src/state/errors';

const errors = [
	{ path: 'settings.decimals', code: 'out_of_range', message: 'Too many.', context: {} },
	{ path: 'fields.room_count.label', code: 'missing_field', message: 'Needs a label.', context: {} },
	{ path: 'fields.room_count.min', code: 'invalid_type', message: 'Must be a number.', context: {} },
	{ path: '', code: 'missing_total', message: 'Needs a total.', context: {} },
];

describe( 'indexErrors', () => {
	it( 'survives being given nothing', () => {
		expect( errorsFor( indexErrors( null ), 'settings.decimals' ) ).toEqual( [] );
		expect( errorsFor( indexErrors( undefined ), 'settings.decimals' ) ).toEqual( [] );
		expect( errorsFor( indexErrors( 'nope' ), 'settings.decimals' ) ).toEqual( [] );
	} );

	it( 'ignores entries with no usable path', () => {
		const index = indexErrors( [ { code: 'weird' }, { path: 42, code: 'weirder' } ] );

		expect( hasErrorsUnder( index, '' ) ).toBe( false );
	} );
} );

describe( 'errorsFor', () => {
	it( 'returns the errors at exactly that path, in order', () => {
		const index = indexErrors( errors );
		const found = errorsFor( index, 'fields.room_count.min' );

		expect( found ).toHaveLength( 1 );
		expect( found[ 0 ].code ).toBe( 'invalid_type' );
	} );

	it( 'keeps several errors on one path, in server order', () => {
		const index = indexErrors( [
			{ path: 'settings.currency', code: 'invalid_type', message: 'a', context: {} },
			{ path: 'settings.currency', code: 'invalid_option', message: 'b', context: {} },
		] );

		expect( errorsFor( index, 'settings.currency' ).map( ( e ) => e.code ) ).toEqual( [
			'invalid_type',
			'invalid_option',
		] );
	} );

	it( 'returns an empty array for a path with no errors', () => {
		expect( errorsFor( indexErrors( errors ), 'settings.currency' ) ).toEqual( [] );
	} );

	it( 'finds the document-level error at the empty path', () => {
		expect( errorsFor( indexErrors( errors ), '' )[ 0 ].code ).toBe( 'missing_total' );
	} );

	it( 'reads from the empty index without throwing', () => {
		expect( errorsFor( EMPTY_INDEX, 'anything' ) ).toEqual( [] );
	} );
} );

describe( 'hasErrorsUnder', () => {
	it( 'is true for an exact match', () => {
		expect( hasErrorsUnder( indexErrors( errors ), 'settings.decimals' ) ).toBe( true );
	} );

	it( 'is true for an ancestor', () => {
		expect( hasErrorsUnder( indexErrors( errors ), 'fields.room_count' ) ).toBe( true );
		expect( hasErrorsUnder( indexErrors( errors ), 'fields' ) ).toBe( true );
	} );

	it( 'does NOT match a partial segment', () => {
		expect( hasErrorsUnder( indexErrors( errors ), 'fields.room' ) ).toBe( false );
		expect( hasErrorsUnder( indexErrors( errors ), 'setting' ) ).toBe( false );
	} );

	it( 'is false for an unrelated prefix', () => {
		expect( hasErrorsUnder( indexErrors( errors ), 'calculations' ) ).toBe( false );
	} );
} );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern errors`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the index**

`admin-src/state/errors.js`:

```js
export const EMPTY_INDEX = Object.freeze( { byPath: new Map(), paths: Object.freeze( [] ) } );

export function indexErrors( errors ) {
	if ( ! Array.isArray( errors ) ) {
		return EMPTY_INDEX;
	}

	const byPath = new Map();

	errors.forEach( ( error ) => {
		if ( ! error || typeof error.path !== 'string' ) {
			return;
		}

		const existing = byPath.get( error.path );

		if ( existing ) {
			existing.push( error );
		} else {
			byPath.set( error.path, [ error ] );
		}
	} );

	// Siyahılar donduruulur, çünki `errorsFor()` indeksin İÇİNDƏKİ massivi
	// qaytarır. Donmasaydı, render edən komponentin `errors.sort(...)` kimi
	// yerində-dəyişən bir çağırışı indeksin özünü korlayardı və həmin yol üçün
	// bütün sonrakı axtarışlar səhv sıra qaytarardı. Donmuş massivdə belə
	// çağırış dərhal istisna atır — sükutla korlanmaqdansa səsli sınmaq yaxşıdır.
	byPath.forEach( ( list ) => Object.freeze( list ) );

	return Object.freeze( { byPath, paths: Object.freeze( Array.from( byPath.keys() ) ) } );
}

export function errorsFor( index, path ) {
	return index.byPath.get( path ) || [];
}

/**
 * Prefiks YALNIZ seqment sərhədində uyğun gəlir. Sadə `startsWith`
 * işlədilsəydi, `fields.room` prefiksi `fields.room_count.label`
 * xətasını tutardı və builder nişanı SƏHV sahənin üstünə qoyardı.
 */
export function hasErrorsUnder( index, prefix ) {
	if ( prefix === '' ) {
		return index.paths.length > 0;
	}

	return index.paths.some(
		( path ) => path === prefix || path.startsWith( `${ prefix }.` )
	);
}
```

`hasErrorsUnder( index, '' )` being "any error at all" is deliberate: the document root is the ancestor of everything, and the save banner uses it.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern errors`
Expected: PASS — 11 tests.

- [ ] **Step 5: Prepare a commit message**

```
feat(admin): index server errors by path, matching only on segment boundaries
```

Do not run `git commit`.

---

### Task 5: Shared controls

Every panel is built from these. Each control owns its own label, its own error rendering, and its own accessibility wiring, so no panel has to remember any of it — which is the only realistic way to hold spec §16 across a builder this size.

**Files:**
- Create: `admin-src/components/FieldError.js`
- Create: `admin-src/components/TextControl.js`
- Create: `admin-src/components/NumberControl.js`
- Create: `admin-src/components/SelectControl.js`
- Create: `admin-src/components/ToggleControl.js`
- Create: `admin-src/components/MoveButtons.js`
- Create: `admin-src/components/Notice.js`
- Test: `tests/js/admin/controls.test.js`

**Interfaces:**
- Consumes: `errorsFor`, `EMPTY_INDEX` (Task 4)
- Produces:
  - `<FieldError id errors />` — renders nothing when `errors` is empty
  - `<TextControl id label value onChange errors help multiline disabled />`
  - `<NumberControl id label value onChange errors help min max step />`
  - `<SelectControl id label value onChange options errors help />` where `options` is `[ { value, label } ]`
  - `<ToggleControl id label checked onChange errors help />`
  - `<MoveButtons label onMoveUp onMoveDown canMoveUp canMoveDown />`
  - `<Notice status children onDismiss />` where `status` is `'error' | 'warning' | 'success' | 'info'`

**The accessibility contract every control honours:**
- the label is a real `<label for>` pointing at the input's `id` — never a `<div>` that merely looks like a label
- when there are errors, the input gets `aria-invalid="true"`
- help text and error text are linked through `aria-describedby`, so a screen reader announces them as part of the field rather than as loose text
- the error text is never the only signal — it is text, not a colour

- [ ] **Step 1: Write the failing tests**

`tests/js/admin/controls.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FieldError from '../../../admin-src/components/FieldError';
import MoveButtons from '../../../admin-src/components/MoveButtons';
import Notice from '../../../admin-src/components/Notice';
import NumberControl from '../../../admin-src/components/NumberControl';
import SelectControl from '../../../admin-src/components/SelectControl';
import TextControl from '../../../admin-src/components/TextControl';
import ToggleControl from '../../../admin-src/components/ToggleControl';

const oneError = [ { path: 'x', code: 'missing_field', message: 'This is required.', context: {} } ];

describe( 'FieldError', () => {
	it( 'renders nothing when there are no errors', () => {
		const { container } = render( <FieldError id="x-error" errors={ [] } /> );

		expect( container ).toBeEmptyDOMElement();
	} );

	it( 'renders every message', () => {
		render(
			<FieldError
				id="x-error"
				errors={ [
					{ code: 'a', message: 'First problem.' },
					{ code: 'b', message: 'Second problem.' },
				] }
			/>
		);

		expect( screen.getByText( 'First problem.' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Second problem.' ) ).toBeInTheDocument();
	} );
} );

describe( 'TextControl', () => {
	it( 'associates its label with its input', () => {
		render( <TextControl id="title" label="Form title" value="Quote" onChange={ () => {} } /> );

		expect( screen.getByLabelText( 'Form title' ) ).toHaveValue( 'Quote' );
	} );

	it( 'reports each keystroke', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render( <TextControl id="title" label="Form title" value="" onChange={ onChange } /> );

		await user.type( screen.getByLabelText( 'Form title' ), 'Hi' );

		expect( onChange ).toHaveBeenCalledTimes( 2 );
		expect( onChange ).toHaveBeenLastCalledWith( 'i' );
	} );

	it( 'marks itself invalid and describes the error', () => {
		render(
			<TextControl id="title" label="Form title" value="" onChange={ () => {} } errors={ oneError } />
		);

		const input = screen.getByLabelText( 'Form title' );

		expect( input ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( input ).toHaveAccessibleDescription( 'This is required.' );
	} );

	it( 'describes its help text when there is no error', () => {
		render(
			<TextControl
				id="title"
				label="Form title"
				value=""
				onChange={ () => {} }
				help="Shown at the top of the form."
			/>
		);

		const input = screen.getByLabelText( 'Form title' );

		expect( input ).toHaveAccessibleDescription( 'Shown at the top of the form.' );
		expect( input ).not.toHaveAttribute( 'aria-invalid' );
	} );

	it( 'renders a textarea when multiline', () => {
		render(
			<TextControl id="msg" label="Message" value="" onChange={ () => {} } multiline />
		);

		expect( screen.getByLabelText( 'Message' ).tagName ).toBe( 'TEXTAREA' );
	} );
} );

describe( 'NumberControl', () => {
	it( 'reports a number, not a string', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render( <NumberControl id="dec" label="Decimals" value={ 2 } onChange={ onChange } /> );

		await user.clear( screen.getByLabelText( 'Decimals' ) );
		await user.type( screen.getByLabelText( 'Decimals' ), '4' );

		expect( onChange ).toHaveBeenLastCalledWith( 4 );
	} );

	it( 'reports an empty box as null rather than NaN', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render( <NumberControl id="dec" label="Decimals" value={ 2 } onChange={ onChange } /> );

		await user.clear( screen.getByLabelText( 'Decimals' ) );

		expect( onChange ).toHaveBeenLastCalledWith( null );
	} );
} );

describe( 'SelectControl', () => {
	it( 'renders its options and reports the chosen value', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render(
			<SelectControl
				id="pos"
				label="Currency position"
				value="before"
				onChange={ onChange }
				options={ [
					{ value: 'before', label: 'Before' },
					{ value: 'after', label: 'After' },
				] }
			/>
		);

		await user.selectOptions( screen.getByLabelText( 'Currency position' ), 'after' );

		expect( onChange ).toHaveBeenCalledWith( 'after' );
	} );
} );

describe( 'ToggleControl', () => {
	it( 'is a real checkbox and reports a boolean', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		render(
			<ToggleControl id="req" label="Required" checked={ false } onChange={ onChange } />
		);

		await user.click( screen.getByRole( 'checkbox', { name: 'Required' } ) );

		expect( onChange ).toHaveBeenCalledWith( true );
	} );
} );

describe( 'MoveButtons', () => {
	it( 'names what it moves, so a screen reader is not read "Up, Up, Up"', () => {
		render(
			<MoveButtons
				label="Rooms"
				onMoveUp={ () => {} }
				onMoveDown={ () => {} }
				canMoveUp
				canMoveDown
			/>
		);

		expect( screen.getByRole( 'button', { name: 'Move Rooms up' } ) ).toBeEnabled();
		expect( screen.getByRole( 'button', { name: 'Move Rooms down' } ) ).toBeEnabled();
	} );

	it( 'disables the ends rather than hiding them, so the layout does not jump', () => {
		render(
			<MoveButtons
				label="Rooms"
				onMoveUp={ () => {} }
				onMoveDown={ () => {} }
				canMoveUp={ false }
				canMoveDown
			/>
		);

		expect( screen.getByRole( 'button', { name: 'Move Rooms up' } ) ).toBeDisabled();
	} );

	it( 'moves on click', async () => {
		const user = userEvent.setup();
		const onMoveUp = jest.fn();

		render(
			<MoveButtons label="Rooms" onMoveUp={ onMoveUp } onMoveDown={ () => {} } canMoveUp canMoveDown />
		);

		await user.click( screen.getByRole( 'button', { name: 'Move Rooms up' } ) );

		expect( onMoveUp ).toHaveBeenCalled();
	} );
} );

describe( 'Notice', () => {
	it( 'announces an error assertively', () => {
		render( <Notice status="error">Something went wrong.</Notice> );

		const notice = screen.getByRole( 'alert' );

		expect( notice ).toHaveTextContent( 'Something went wrong.' );
	} );

	it( 'announces success politely, not as an alert', () => {
		render( <Notice status="success">Saved.</Notice> );

		expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument();
		expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Saved.' );
	} );

	it( 'dismisses when asked', async () => {
		const user = userEvent.setup();
		const onDismiss = jest.fn();

		render(
			<Notice status="error" onDismiss={ onDismiss }>
				Something went wrong.
			</Notice>
		);

		await user.click( screen.getByRole( 'button', { name: 'Dismiss this notice' } ) );

		expect( onDismiss ).toHaveBeenCalled();
	} );
} );
```

`toHaveAccessibleDescription` is doing real work here: it fails unless `aria-describedby` actually points at an element that exists. Asserting the attribute's raw value would pass for a dangling reference, which is exactly the bug that makes a screen reader announce nothing.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern controls`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write FieldError**

`admin-src/components/FieldError.js`:

```js
export default function FieldError( { id, errors } ) {
	if ( ! errors || errors.length === 0 ) {
		return null;
	}

	return (
		<ul className="qform-field-error" id={ id }>
			{ errors.map( ( error, index ) => (
				<li key={ `${ error.code }-${ index }` }>{ error.message }</li>
			) ) }
		</ul>
	);
}
```

- [ ] **Step 4: Write the input controls**

`admin-src/components/TextControl.js`:

```js
import FieldError from './FieldError';

export default function TextControl( {
	id,
	label,
	value,
	onChange,
	errors = [],
	help = '',
	multiline = false,
	disabled = false,
} ) {
	const hasErrors = errors.length > 0;
	const errorId = `${ id }-error`;
	const helpId = `${ id }-help`;
	// Xəta VƏ kömək mətni eyni anda göstərilir. Köməyi xəta zamanı gizlətmək
	// ipucunu məhz ehtiyac duyulan anda yox edir — format qaydasını izah edən odur.
	const describedBy =
		[ hasErrors ? errorId : null, help ? helpId : null ].filter( Boolean ).join( ' ' ) ||
		undefined;
	const Tag = multiline ? 'textarea' : 'input';

	return (
		<div className="qform-control">
			<label htmlFor={ id }>{ label }</label>
			<Tag
				id={ id }
				type={ multiline ? undefined : 'text' }
				value={ value }
				disabled={ disabled }
				aria-invalid={ hasErrors ? 'true' : undefined }
				aria-describedby={ describedBy }
				onChange={ ( event ) => onChange( event.target.value ) }
			/>
			{ help && (
				<p className="qform-help" id={ helpId }>
					{ help }
				</p>
			) }
			<FieldError id={ errorId } errors={ errors } />
		</div>
	);
}
```

`admin-src/components/NumberControl.js`:

```js
import FieldError from './FieldError';

export default function NumberControl( {
	id,
	label,
	value,
	onChange,
	errors = [],
	help = '',
	min,
	max,
	step,
} ) {
	const hasErrors = errors.length > 0;
	const errorId = `${ id }-error`;
	const helpId = `${ id }-help`;
	// Xəta VƏ kömək mətni eyni anda göstərilir. Köməyi xəta zamanı gizlətmək
	// ipucunu məhz ehtiyac duyulan anda yox edir — format qaydasını izah edən odur.
	const describedBy =
		[ hasErrors ? errorId : null, help ? helpId : null ].filter( Boolean ).join( ' ' ) ||
		undefined;

	return (
		<div className="qform-control">
			<label htmlFor={ id }>{ label }</label>
			<input
				id={ id }
				type="number"
				value={ value === null || value === undefined ? '' : value }
				min={ min }
				max={ max }
				step={ step }
				aria-invalid={ hasErrors ? 'true' : undefined }
				aria-describedby={ describedBy }
				onChange={ ( event ) => {
					const raw = event.target.value;

					if ( raw === '' ) {
						onChange( null );
						return;
					}

					const parsed = Number( raw );

					onChange( Number.isNaN( parsed ) ? null : parsed );
				} }
			/>
			{ help && (
				<p className="qform-help" id={ helpId }>
					{ help }
				</p>
			) }
			<FieldError id={ errorId } errors={ errors } />
		</div>
	);
}
```

Reporting `null` for an empty box rather than `NaN` matters downstream: `NaN` survives into the schema, `JSON.stringify` turns it into `null` anyway, and the server then reports `invalid_type` on a field the user was halfway through typing. `null` at least means the same thing on both sides.

`admin-src/components/SelectControl.js`:

```js
import { __, sprintf } from '@wordpress/i18n';

import FieldError from './FieldError';

export default function SelectControl( {
	id,
	label,
	value,
	onChange,
	options = [],
	errors = [],
	help = '',
} ) {
	const hasErrors = errors.length > 0;
	const errorId = `${ id }-error`;
	const helpId = `${ id }-help`;
	// Xəta VƏ kömək mətni eyni anda göstərilir. Köməyi xəta zamanı gizlətmək
	// ipucunu məhz ehtiyac duyulan anda yox edir — format qaydasını izah edən odur.
	const describedBy =
		[ hasErrors ? errorId : null, help ? helpId : null ].filter( Boolean ).join( ' ' ) ||
		undefined;

	return (
		<div className="qform-control">
			<label htmlFor={ id }>{ label }</label>
			<select
				id={ id }
				value={ value }
				aria-invalid={ hasErrors ? 'true' : undefined }
				aria-describedby={ describedBy }
				onChange={ ( event ) => onChange( event.target.value ) }
			>
				{ ! options.some( ( option ) => option.value === value ) && (
					// Siyahıda olmayan dəyər üçün React heç nəyi seçili göstərmir və
					// brauzer sıfırıncı seçimə düşür — istifadəçi SƏHV dəyəri görür,
					// üstəlik gördüyü seçimi seçməklə düzəldə bilmir, çünki artıq
					// seçili olanı seçmək hadisə yaratmır.
					<option value={ value } disabled>
						{ sprintf(
							/* translators: %s: the stored value, which is not one of the options. */
							__( 'Unrecognised value: %s', 'quoteform' ),
							String( value )
						) }
					</option>
				) }
				{ options.map( ( option ) => (
					<option key={ option.value } value={ option.value }>
						{ option.label }
					</option>
				) ) }
			</select>
			{ help && (
				<p className="qform-help" id={ helpId }>
					{ help }
				</p>
			) }
			<FieldError id={ errorId } errors={ errors } />
		</div>
	);
}
```

`admin-src/components/ToggleControl.js`:

```js
import FieldError from './FieldError';

export default function ToggleControl( { id, label, checked, onChange, errors = [], help = '' } ) {
	const hasErrors = errors.length > 0;
	const errorId = `${ id }-error`;
	const helpId = `${ id }-help`;
	// Xəta VƏ kömək mətni eyni anda göstərilir. Köməyi xəta zamanı gizlətmək
	// ipucunu məhz ehtiyac duyulan anda yox edir — format qaydasını izah edən odur.
	const describedBy =
		[ hasErrors ? errorId : null, help ? helpId : null ].filter( Boolean ).join( ' ' ) ||
		undefined;

	return (
		<div className="qform-control qform-control--toggle">
			<input
				id={ id }
				type="checkbox"
				checked={ checked }
				aria-invalid={ hasErrors ? 'true' : undefined }
				aria-describedby={ describedBy }
				onChange={ ( event ) => onChange( event.target.checked ) }
			/>
			<label htmlFor={ id }>{ label }</label>
			{ help && (
				<p className="qform-help" id={ helpId }>
					{ help }
				</p>
			) }
			<FieldError id={ errorId } errors={ errors } />
		</div>
	);
}
```

A real `<input type="checkbox">` rather than a styled `<div role="switch">`: it is keyboard-operable, announced correctly and form-associated without a line of extra code.

- [ ] **Step 5: Write MoveButtons and Notice**

`admin-src/components/MoveButtons.js`:

```js
import { __, sprintf } from '@wordpress/i18n';

export default function MoveButtons( { label, onMoveUp, onMoveDown, canMoveUp, canMoveDown } ) {
	return (
		<span className="qform-move">
			<button
				type="button"
				onClick={ onMoveUp }
				disabled={ ! canMoveUp }
				aria-label={ sprintf(
					/* translators: %s: the name of the item being moved. */
					__( 'Move %s up', 'quoteform' ),
					label
				) }
			>
				{ '↑' }
			</button>
			<button
				type="button"
				onClick={ onMoveDown }
				disabled={ ! canMoveDown }
				aria-label={ sprintf(
					/* translators: %s: the name of the item being moved. */
					__( 'Move %s down', 'quoteform' ),
					label
				) }
			>
				{ '↓' }
			</button>
		</span>
	);
}
```

The arrows are the visible label and the `aria-label` carries the name, so a screen-reader user hears "Move Rooms up" rather than a list of identical "Up" buttons. Disabling at the ends rather than hiding keeps the row from reflowing as items move.

`admin-src/components/Notice.js`:

```js
import { __ } from '@wordpress/i18n';

export default function Notice( { status = 'info', children, onDismiss } ) {
	const isError = status === 'error';

	return (
		<div
			className={ `qform-notice qform-notice--${ status }` }
			role={ isError ? 'alert' : 'status' }
		>
			<div className="qform-notice__body">{ children }</div>
			{ onDismiss && (
				<button
					type="button"
					className="qform-notice__dismiss"
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

`role="alert"` interrupts a screen reader; `role="status"` waits for a pause. An error is worth interrupting for, a "Saved" is not — and a builder that interrupts on every success becomes unusable with a screen reader on.

- [ ] **Step 6: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern controls`
Expected: PASS — 16 tests.

- [ ] **Step 7: Prepare a commit message**

```
feat(admin): add the shared controls, with their labels and aria wiring
```

Do not run `git commit`.

---

### Task 6: The form list screen

The first thing a site owner sees. It lists forms, creates one, opens one, and deletes one — and it is where three of the API's less obvious failure modes have to be handled honestly rather than swallowed.

**Files:**
- Create: `admin-src/screens/FormListScreen.js`
- Test: `tests/js/admin/FormListScreen.test.js`

**Interfaces:**
- Consumes: `listForms`, `createForm`, `deleteForm`, `ApiError` (Task 2); `Notice` (Task 5)
- Produces: `<FormListScreen onOpen />` where `onOpen( id )` is called when a form is chosen. The screen does **not** know how navigation works — Task 13 decides that.

**Three failure modes this screen owns:**
- `rest_trash_not_supported` (501) on delete means the site has the trash switched off, so deleting would be permanent and the server refused. Say exactly that; do not present it as a generic failure.
- `rest_forbidden` (401/403) means the user lost the capability mid-session. Offer a reload, not a retry.
- Anything else: show the server's message, keep the list on screen, and let the user try again.

Deletion asks for confirmation first. It trashes rather than destroys, so the wording should say so — "Move to trash", not "Delete forever".

- [ ] **Step 1: Write the failing tests**

`tests/js/admin/FormListScreen.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FormListScreen from '../../../admin-src/screens/FormListScreen';
import { ApiError, createForm, deleteForm, listForms } from '../../../admin-src/api/client';

// `jest.mock()` tək başına MODULU BÜTÖV avtomock edir — `ApiError` də daxil
// olmaqla. Avtomock edilmiş sinif konstruktorda verilən vəziyyəti SÜKUTLA atır,
// ona görə `error.code` və `error.errors` `undefined` olur və koda görə
// budaqlanan hər test yalan nəticə verir. Fabrika ilə real sinfi saxlayıb
// yalnız funksiyaları stub edirik.
jest.mock( '../../../admin-src/api/client', () => {
	const actual = jest.requireActual( '../../../admin-src/api/client' );

	return {
		...actual,
		listForms: jest.fn(),
		getForm: jest.fn(),
		createForm: jest.fn(),
		updateForm: jest.fn(),
		deleteForm: jest.fn(),
	};
} );

const twoForms = {
	forms: [
		{ id: 3, title: 'Cleaning quote', modified: '2026-09-15T11:20:45' },
		{ id: 4, title: 'Moving quote', modified: '2026-09-14T09:00:00' },
	],
	total: 2,
	totalPages: 1,
};

beforeEach( () => {
	jest.clearAllMocks();
} );

describe( 'listing', () => {
	it( 'shows the forms it loaded', async () => {
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		expect( await screen.findByText( 'Cleaning quote' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Moving quote' ) ).toBeInTheDocument();
	} );

	it( 'says so when there are none, instead of showing an empty table', async () => {
		listForms.mockResolvedValue( { forms: [], total: 0, totalPages: 0 } );

		render( <FormListScreen onOpen={ () => {} } /> );

		expect(
			await screen.findByText( 'No forms yet. Create your first one.' )
		).toBeInTheDocument();
	} );

	it( 'reports a failed load and keeps the create button usable', async () => {
		listForms.mockRejectedValue(
			new ApiError( { code: 'qform_network_error', status: 0, message: 'No connection.', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'No connection.' );
		expect( screen.getByRole( 'button', { name: 'Create a form' } ) ).toBeEnabled();
	} );
} );

describe( 'opening', () => {
	it( 'opens the form that was clicked', async () => {
		const user = userEvent.setup();
		const onOpen = jest.fn();
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ onOpen } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Edit Moving quote' } ) );

		expect( onOpen ).toHaveBeenCalledWith( 4 );
	} );
} );

describe( 'creating', () => {
	it( 'creates a form and opens it immediately', async () => {
		const user = userEvent.setup();
		const onOpen = jest.fn();
		listForms.mockResolvedValue( twoForms );
		createForm.mockResolvedValue( { id: 9, title: 'Untitled form', schema: {} } );

		render( <FormListScreen onOpen={ onOpen } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Create a form' } ) );

		await waitFor( () => expect( onOpen ).toHaveBeenCalledWith( 9 ) );
		expect( createForm ).toHaveBeenCalledWith( 'Untitled form' );
	} );

	it( 'reports a failed create without navigating anywhere', async () => {
		const user = userEvent.setup();
		const onOpen = jest.fn();
		listForms.mockResolvedValue( twoForms );
		createForm.mockRejectedValue(
			new ApiError( { code: 'qform_create_failed', status: 500, message: 'Could not create.', errors: [] } )
		);

		render( <FormListScreen onOpen={ onOpen } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Create a form' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not create.' );
		expect( onOpen ).not.toHaveBeenCalled();
	} );
} );

describe( 'deleting', () => {
	it( 'asks before trashing, and does nothing if refused', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Move Cleaning quote to trash' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Cancel' } ) );

		expect( deleteForm ).not.toHaveBeenCalled();
		expect( screen.getByText( 'Cleaning quote' ) ).toBeInTheDocument();
	} );

	it( 'trashes on confirmation and drops the row', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockResolvedValue( { id: 3, deleted: true } );

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Move Cleaning quote to trash' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		await waitFor( () =>
			expect( screen.queryByText( 'Cleaning quote' ) ).not.toBeInTheDocument()
		);
		expect( screen.getByText( 'Moving quote' ) ).toBeInTheDocument();
		expect( deleteForm ).toHaveBeenCalledWith( 3 );
	} );

	it( 'explains that the site has the trash switched off', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockRejectedValue(
			new ApiError( {
				code: 'rest_trash_not_supported',
				status: 501,
				message: 'The trash is not supported.',
				errors: [],
			} )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Move Cleaning quote to trash' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'This site has the trash switched off, so deleting a form would be permanent. Quoteform will not do that.'
		);
		expect( screen.getByText( 'Cleaning quote' ) ).toBeInTheDocument();
	} );

	it( 'tells the user to reload when the capability is gone', async () => {
		const user = userEvent.setup();
		listForms.mockResolvedValue( twoForms );
		deleteForm.mockRejectedValue(
			new ApiError( { code: 'rest_forbidden', status: 403, message: 'Sorry.', errors: [] } )
		);

		render( <FormListScreen onOpen={ () => {} } /> );

		await user.click( await screen.findByRole( 'button', { name: 'Move Cleaning quote to trash' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Move to trash' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'You are no longer allowed to manage forms. Reload the page and sign in again.'
		);
	} );
} );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern FormListScreen`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the screen**

`admin-src/screens/FormListScreen.js`:

```js
import { useCallback, useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { createForm, deleteForm, listForms } from '../api/client';
import Notice from '../components/Notice';

function messageFor( error ) {
	if ( error.code === 'rest_trash_not_supported' ) {
		return __(
			'This site has the trash switched off, so deleting a form would be permanent. Quoteform will not do that.',
			'quoteform'
		);
	}

	if ( error.code === 'rest_forbidden' ) {
		return __(
			'You are no longer allowed to manage forms. Reload the page and sign in again.',
			'quoteform'
		);
	}

	return error.message;
}

export default function FormListScreen( { onOpen } ) {
	const [ forms, setForms ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ busy, setBusy ] = useState( false );
	const [ confirming, setConfirming ] = useState( null );

	const load = useCallback( async () => {
		setLoading( true );
		setError( null );

		try {
			const result = await listForms();

			setForms( result.forms );
		} catch ( caught ) {
			setError( caught );
		} finally {
			setLoading( false );
		}
	}, [] );

	useEffect( () => {
		load();
	}, [ load ] );

	async function handleCreate() {
		setBusy( true );
		setError( null );

		try {
			const form = await createForm( __( 'Untitled form', 'quoteform' ) );

			onOpen( form.id );
		} catch ( caught ) {
			setError( caught );
		} finally {
			setBusy( false );
		}
	}

	async function handleDelete( form ) {
		setConfirming( null );
		setBusy( true );
		setError( null );

		try {
			await deleteForm( form.id );

			setForms( ( current ) => current.filter( ( item ) => item.id !== form.id ) );
		} catch ( caught ) {
			setError( caught );
		} finally {
			setBusy( false );
		}
	}

	return (
		<div className="qform-list">
			<div className="qform-list__header">
				<h1>{ __( 'Quoteform', 'quoteform' ) }</h1>
				<button type="button" onClick={ handleCreate } disabled={ busy }>
					{ __( 'Create a form', 'quoteform' ) }
				</button>
			</div>

			{ error && (
				<Notice status="error" onDismiss={ () => setError( null ) }>
					{ messageFor( error ) }
				</Notice>
			) }

			{ loading && <p>{ __( 'Loading forms…', 'quoteform' ) }</p> }

			{ ! loading && forms.length === 0 && ! error && (
				<p>{ __( 'No forms yet. Create your first one.', 'quoteform' ) }</p>
			) }

			{ forms.length > 0 && (
				<table className="qform-list__table">
					<thead>
						<tr>
							<th scope="col">{ __( 'Form', 'quoteform' ) }</th>
							<th scope="col">{ __( 'Last modified', 'quoteform' ) }</th>
							<th scope="col">{ __( 'Actions', 'quoteform' ) }</th>
						</tr>
					</thead>
					<tbody>
						{ forms.map( ( form ) => (
							<tr key={ form.id }>
								<td>{ form.title }</td>
								<td>{ form.modified }</td>
								<td>
									<button
										type="button"
										onClick={ () => onOpen( form.id ) }
										aria-label={ sprintf(
											/* translators: %s: form title. */
											__( 'Edit %s', 'quoteform' ),
											form.title
										) }
									>
										{ __( 'Edit', 'quoteform' ) }
									</button>
									<button
										type="button"
										onClick={ () => setConfirming( form ) }
										disabled={ busy }
										aria-label={ sprintf(
											/* translators: %s: form title. */
											__( 'Move %s to trash', 'quoteform' ),
											form.title
										) }
									>
										{ __( 'Trash', 'quoteform' ) }
									</button>
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
			) }

			{ confirming && (
				<div className="qform-confirm" role="dialog" aria-modal="true" aria-label={ __( 'Confirm', 'quoteform' ) }>
					<p>
						{ sprintf(
							/* translators: %s: form title. */
							__( 'Move “%s” to the trash?', 'quoteform' ),
							confirming.title
						) }
					</p>
					<button type="button" onClick={ () => handleDelete( confirming ) }>
						{ __( 'Move to trash', 'quoteform' ) }
					</button>
					<button type="button" onClick={ () => setConfirming( null ) }>
						{ __( 'Cancel', 'quoteform' ) }
					</button>
				</div>
			) }
		</div>
	);
}
```

The new form is created with the title "Untitled form" and opened straight away, rather than asking for a title first. The title is editable in the editor, and one fewer dialogue between "I want a form" and "I have a form" is worth more than a tidy name.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern FormListScreen`
Expected: PASS — 10 tests.

- [ ] **Step 5: Prepare a commit message**

```
feat(admin): add the form list, with honest handling of the trash and capability errors
```

Do not run `git commit`.

---

### Task 7: The settings panel

Nine keys, exactly the nine `SettingsValidator` accepts. Anything else the panel sends comes back as `unknown_key`, and anything it omits comes back as `missing_field` — so this panel's job is to cover them all and nothing more.

**Files:**
- Create: `admin-src/panels/SettingsPanel.js`
- Test: `tests/js/admin/SettingsPanel.test.js`

**Interfaces:**
- Consumes: `useStore`, `useDispatch` (Task 3); `setSetting` (Task 3); `errorsFor` (Task 4); `TextControl`, `NumberControl`, `SelectControl`, `ToggleControl` (Task 5)
- Produces: `<SettingsPanel errorIndex />`

**The nine keys, their controls and their server paths:**

| Key | Control | Path the server reports on |
|---|---|---|
| `currency` | text, 3 uppercase letters | `settings.currency` |
| `currency_position` | select: `before`, `after` | `settings.currency_position` |
| `decimals` | number, 0–6 | `settings.decimals` |
| `submit_label` | text | `settings.submit_label` |
| `success_action` | select: `message`, `redirect` | `settings.success_action` |
| `success_message` | multiline text | `settings.success_message` |
| `redirect_url` | text, must start `http://` or `https://` | `settings.redirect_url` |
| `save_resume` | toggle | `settings.save_resume` |
| `store_ip` | toggle | `settings.store_ip` |

**One behaviour worth getting right:** `success_message` and `redirect_url` are both always sent, but only one of them matters at a time. Show the one that applies to the chosen `success_action` and hide the other — while still keeping both in the schema, because the validator requires both keys to be present. Hiding a control must never remove its key.

- [ ] **Step 1: Write the failing tests**

`tests/js/admin/SettingsPanel.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SettingsPanel from '../../../admin-src/panels/SettingsPanel';
import { StoreProvider, useDispatch } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { indexErrors } from '../../../admin-src/state/errors';

const settings = {
	currency: 'USD',
	currency_position: 'before',
	decimals: 2,
	submit_label: 'Get my quote',
	success_action: 'message',
	success_message: 'Thanks.',
	redirect_url: '',
	save_resume: false,
	store_ip: false,
};

function Harness( { errorIndex = indexErrors( [] ) } ) {
	const dispatch = useDispatch();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( {
							id: 1,
							title: 'Form',
							schema: {
								version: 1,
								settings,
								fields: {},
								steps: [],
								calculations: [],
								rules: [],
								notifications: [],
							},
						} )
					)
				}
			>
				load
			</button>
			<SettingsPanel errorIndex={ errorIndex } />
		</>
	);
}

async function renderLoaded( props = {} ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness { ...props } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

describe( 'SettingsPanel', () => {
	it( 'shows the stored values', async () => {
		await renderLoaded();

		expect( screen.getByLabelText( 'Currency' ) ).toHaveValue( 'USD' );
		expect( screen.getByLabelText( 'Decimal places' ) ).toHaveValue( 2 );
		expect( screen.getByLabelText( 'Submit button label' ) ).toHaveValue( 'Get my quote' );
	} );

	it( 'shows the success message when the action is message, and not the redirect', async () => {
		await renderLoaded();

		expect( screen.getByLabelText( 'Success message' ) ).toBeInTheDocument();
		expect( screen.queryByLabelText( 'Redirect URL' ) ).not.toBeInTheDocument();
	} );

	it( 'swaps to the redirect URL when the action changes', async () => {
		const user = await renderLoaded();

		await user.selectOptions( screen.getByLabelText( 'After a successful submission' ), 'redirect' );

		expect( screen.getByLabelText( 'Redirect URL' ) ).toBeInTheDocument();
		expect( screen.queryByLabelText( 'Success message' ) ).not.toBeInTheDocument();
	} );

	it( 'renders the server error next to the control it belongs to', async () => {
		await renderLoaded( {
			errorIndex: indexErrors( [
				{
					path: 'settings.redirect_url',
					code: 'invalid_option',
					message: 'The redirect URL must start with http:// or https://.',
					context: {},
				},
				{
					path: 'settings.decimals',
					code: 'out_of_range',
					message: 'Between 0 and 6.',
					context: { min: 0, max: 6 },
				},
			] ),
		} );

		expect( screen.getByLabelText( 'Decimal places' ) ).toHaveAccessibleDescription(
			'Between 0 and 6.'
		);
	} );

	it( 'edits a setting through the store', async () => {
		const user = await renderLoaded();

		await user.clear( screen.getByLabelText( 'Currency' ) );
		await user.type( screen.getByLabelText( 'Currency' ), 'EUR' );

		expect( screen.getByLabelText( 'Currency' ) ).toHaveValue( 'EUR' );
	} );

	it( 'renders nothing at all before a form is loaded', () => {
		render(
			<StoreProvider>
				<SettingsPanel errorIndex={ indexErrors( [] ) } />
			</StoreProvider>
		);

		expect( screen.queryByLabelText( 'Currency' ) ).not.toBeInTheDocument();
	} );
} );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern SettingsPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the panel**

`admin-src/panels/SettingsPanel.js`:

```js
import { __ } from '@wordpress/i18n';

import NumberControl from '../components/NumberControl';
import SelectControl from '../components/SelectControl';
import TextControl from '../components/TextControl';
import ToggleControl from '../components/ToggleControl';
import { setSetting } from '../state/actions';
import { errorsFor } from '../state/errors';
import { useDispatch, useStore } from '../state/StoreContext';

export default function SettingsPanel( { errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();

	if ( schema === null ) {
		return null;
	}

	const settings = schema.settings;
	const change = ( key ) => ( value ) => dispatch( setSetting( key, value ) );
	const errors = ( key ) => errorsFor( errorIndex, `settings.${ key }` );

	return (
		<section className="qform-panel" aria-labelledby="qform-settings-heading">
			<h2 id="qform-settings-heading">{ __( 'Settings', 'quoteform' ) }</h2>

			<TextControl
				id="qform-currency"
				label={ __( 'Currency', 'quoteform' ) }
				value={ settings.currency }
				onChange={ change( 'currency' ) }
				errors={ errors( 'currency' ) }
				help={ __( 'A three-letter code such as USD or EUR.', 'quoteform' ) }
			/>

			<SelectControl
				id="qform-currency-position"
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
				id="qform-decimals"
				label={ __( 'Decimal places', 'quoteform' ) }
				value={ settings.decimals }
				onChange={ change( 'decimals' ) }
				errors={ errors( 'decimals' ) }
				min={ 0 }
				max={ 6 }
				step={ 1 }
			/>

			<TextControl
				id="qform-submit-label"
				label={ __( 'Submit button label', 'quoteform' ) }
				value={ settings.submit_label }
				onChange={ change( 'submit_label' ) }
				errors={ errors( 'submit_label' ) }
			/>

			<SelectControl
				id="qform-success-action"
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
					id="qform-redirect-url"
					label={ __( 'Redirect URL', 'quoteform' ) }
					value={ settings.redirect_url }
					onChange={ change( 'redirect_url' ) }
					errors={ errors( 'redirect_url' ) }
					help={ __( 'Must start with http:// or https://.', 'quoteform' ) }
				/>
			) : (
				<TextControl
					id="qform-success-message"
					label={ __( 'Success message', 'quoteform' ) }
					value={ settings.success_message }
					onChange={ change( 'success_message' ) }
					errors={ errors( 'success_message' ) }
					multiline
				/>
			) }

			<ToggleControl
				id="qform-save-resume"
				label={ __( 'Let visitors save and resume', 'quoteform' ) }
				checked={ settings.save_resume }
				onChange={ change( 'save_resume' ) }
				errors={ errors( 'save_resume' ) }
			/>

			<ToggleControl
				id="qform-store-ip"
				label={ __( 'Store the visitor’s IP address with each entry', 'quoteform' ) }
				checked={ settings.store_ip }
				onChange={ change( 'store_ip' ) }
				errors={ errors( 'store_ip' ) }
			/>
		</section>
	);
}
```

Note what the hidden control does **not** do: it does not clear `redirect_url` or `success_message` from the schema. Both keys stay, because `SettingsValidator` requires all nine. Hiding is presentation; the document is unchanged.

There is one consequence worth knowing, and it is deliberate: if the server reports an error on the hidden one — say an invalid `redirect_url` while the action is `message` — the user cannot see it without switching the action. The save banner from Task 13 lists every error with its path, which is how that case stays discoverable.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern SettingsPanel`
Expected: PASS — 6 tests.

- [ ] **Step 5: Prepare a commit message**

```
feat(admin): add the settings panel covering all nine schema settings
```

Do not run `git commit`.

---

### Task 8: Key generation and reordering helpers

Two pure modules with no React in them. They are separated out because both are easy to get subtly wrong and trivially testable in isolation — and because the key rules must mirror the server's exactly, or the builder will confidently offer a key the server then rejects.

**Files:**
- Create: `admin-src/lib/keys.js`
- Create: `admin-src/lib/reorder.js`
- Test: `tests/js/admin/keys.test.js`
- Test: `tests/js/admin/reorder.test.js`

**Interfaces:**
- Produces from `keys.js`: `KEY_PATTERN`, `RESERVED_KEYS`, `slugify( label ) → string`, `isValidKey( key ) → boolean`, `isReservedKey( key ) → boolean`, `uniqueKey( base, taken ) → string`
- Produces from `reorder.js`: `moveUp( list, index ) → list`, `moveDown( list, index ) → list` — both pure, both return the original array unchanged when the move is impossible

**Mirroring the server exactly.** `includes/Forms/KeyRules.php` is the authority:

```php
private const PATTERN = '/^[a-z][a-z0-9_]{0,63}$/D';

private const RESERVED = [
    'constructor',
    'prototype',
];
```

Two details that look like details and are not:

- The `D` modifier. Without it PCRE's `$` also matches immediately before a trailing newline, so `"room_count\n"` would pass. JavaScript's `$` does not behave that way, so the JS pattern needs no equivalent — but if you ever port a pattern in the other direction, that asymmetry is where the bug lives. Plan 02 shipped it twice.
- The reserved list is **two** entries, not five. It was narrowed deliberately: key format only allows lowercase, and JavaScript property access is case-sensitive, so `hasownproperty` can never shadow `hasOwnProperty`. Only `constructor` and `prototype` are genuinely lowercase built-ins. Do not "helpfully" add more — a key the server accepts and the builder rejects is just as broken as the reverse.

- [ ] **Step 1: Write the failing key tests**

`tests/js/admin/keys.test.js`:

```js
import {
	isReservedKey,
	isValidKey,
	RESERVED_KEYS,
	slugify,
	uniqueKey,
} from '../../../admin-src/lib/keys';

describe( 'slugify', () => {
	it( 'lowercases and underscores a plain label', () => {
		expect( slugify( 'How many rooms?' ) ).toBe( 'how_many_rooms' );
	} );

	it( 'collapses runs of separators', () => {
		expect( slugify( '  Total   --  price  ' ) ).toBe( 'total_price' );
	} );

	it( 'drops a leading digit, because a key must start with a letter', () => {
		expect( slugify( '2nd bathroom' ) ).toBe( 'nd_bathroom' );
	} );

	it( 'truncates to the 64-character limit', () => {
		expect( slugify( 'a'.repeat( 200 ) ) ).toHaveLength( 64 );
	} );

	it( 'falls back to "field" when nothing usable survives', () => {
		expect( slugify( '???' ) ).toBe( 'field' );
		expect( slugify( '' ) ).toBe( 'field' );
		expect( slugify( '123' ) ).toBe( 'field' );
	} );

	it( 'always produces something the server would accept', () => {
		[ 'How many rooms?', '???', '2nd', 'ÜST QAT', 'a'.repeat( 200 ) ].forEach( ( label ) => {
			expect( isValidKey( slugify( label ) ) ).toBe( true );
		} );
	} );
} );

describe( 'isValidKey', () => {
	it( 'accepts the shapes the server accepts', () => {
		expect( isValidKey( 'a' ) ).toBe( true );
		expect( isValidKey( 'room_count' ) ).toBe( true );
		expect( isValidKey( 'a1_2' ) ).toBe( true );
		expect( isValidKey( `a${ 'b'.repeat( 63 ) }` ) ).toBe( true );
	} );

	it( 'rejects the shapes the server rejects', () => {
		expect( isValidKey( '' ) ).toBe( false );
		expect( isValidKey( '1st' ) ).toBe( false );
		expect( isValidKey( '_leading' ) ).toBe( false );
		expect( isValidKey( 'Room' ) ).toBe( false );
		expect( isValidKey( 'room count' ) ).toBe( false );
		expect( isValidKey( 'room-count' ) ).toBe( false );
		expect( isValidKey( `a${ 'b'.repeat( 64 ) }` ) ).toBe( false );
	} );

	it( 'rejects a trailing newline', () => {
		expect( isValidKey( 'room_count\n' ) ).toBe( false );
	} );
} );

describe( 'isReservedKey', () => {
	it( 'reserves exactly the two lowercase JavaScript built-ins', () => {
		expect( RESERVED_KEYS ).toEqual( [ 'constructor', 'prototype' ] );
		expect( isReservedKey( 'constructor' ) ).toBe( true );
		expect( isReservedKey( 'prototype' ) ).toBe( true );
	} );

	it( 'does not reserve the camelCase lookalikes, which a key can never be', () => {
		expect( isReservedKey( 'hasownproperty' ) ).toBe( false );
		expect( isReservedKey( 'tostring' ) ).toBe( false );
		expect( isReservedKey( 'valueof' ) ).toBe( false );
	} );
} );

describe( 'uniqueKey', () => {
	it( 'returns the base when it is free', () => {
		expect( uniqueKey( 'rooms', [ 'price' ] ) ).toBe( 'rooms' );
	} );

	it( 'suffixes until it finds a gap', () => {
		expect( uniqueKey( 'rooms', [ 'rooms' ] ) ).toBe( 'rooms_2' );
		expect( uniqueKey( 'rooms', [ 'rooms', 'rooms_2' ] ) ).toBe( 'rooms_3' );
	} );

	it( 'never exceeds the length limit while suffixing', () => {
		const base = 'a'.repeat( 64 );
		const key = uniqueKey( base, [ base ] );

		expect( key ).not.toBe( base );
		expect( isValidKey( key ) ).toBe( true );
	} );

	it( 'steps past a reserved base', () => {
		expect( uniqueKey( 'constructor', [] ) ).toBe( 'constructor_2' );
	} );
} );
```

That length-limit case is the one that bites: `uniqueKey` appending `_2` to an already-64-character key produces a 66-character key, which the server rejects with `invalid_key_format` — and the user has no idea why, because they never typed a key at all.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern keys`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the key helpers**

`admin-src/lib/keys.js`:

```js
export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const MAX_KEY_LENGTH = 64;

/**
 * `includes/Forms/KeyRules.php`-dəki siyahının EYNİSİ — iki ad, beş yox.
 * Açar formatı yalnız kiçik hərfə icazə verir, JavaScript-də üzv müraciəti
 * isə böyük-kiçik hərfə həssasdır, ona görə `hasownproperty` heç vaxt
 * `hasOwnProperty`-ni kölgələyə bilməz.
 */
export const RESERVED_KEYS = [ 'constructor', 'prototype' ];

export function isValidKey( key ) {
	return typeof key === 'string' && KEY_PATTERN.test( key );
}

export function isReservedKey( key ) {
	return RESERVED_KEYS.includes( key );
}

export function slugify( label ) {
	const slug = String( label === null || label === undefined ? '' : label )
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, '_' )
		.replace( /^[^a-z]+/, '' )
		.replace( /_+$/, '' )
		.slice( 0, MAX_KEY_LENGTH );

	return isValidKey( slug ) ? slug : 'field';
}

export function uniqueKey( base, taken ) {
	const used = new Set( taken );
	const isFree = ( candidate ) => ! used.has( candidate ) && ! isReservedKey( candidate );

	if ( isFree( base ) ) {
		return base;
	}

	for ( let suffix = 2; suffix < 1000; suffix += 1 ) {
		const tail = `_${ suffix }`;
		const trimmed = base.slice( 0, MAX_KEY_LENGTH - tail.length );
		const candidate = `${ trimmed }${ tail }`;

		if ( isFree( candidate ) ) {
			return candidate;
		}
	}

	return `field_${ Date.now() }`.slice( 0, MAX_KEY_LENGTH );
}
```

`.replace( /^[^a-z]+/, '' )` runs after the separator pass on purpose: `'2nd bathroom'` becomes `'2nd_bathroom'` and then `'nd_bathroom'`. Stripping first would give `'nd bathroom'` and then the same answer, but the order matters for inputs like `'--2--x'`, where stripping first would leave nothing to work with.

- [ ] **Step 4: Write the failing reorder tests**

`tests/js/admin/reorder.test.js`:

```js
import { moveDown, moveUp } from '../../../admin-src/lib/reorder';

describe( 'moveUp', () => {
	it( 'swaps with the item above', () => {
		expect( moveUp( [ 'a', 'b', 'c' ], 1 ) ).toEqual( [ 'b', 'a', 'c' ] );
	} );

	it( 'does nothing at the top', () => {
		const list = [ 'a', 'b' ];

		expect( moveUp( list, 0 ) ).toBe( list );
	} );

	it( 'does nothing for an index that is not there', () => {
		const list = [ 'a', 'b' ];

		expect( moveUp( list, 9 ) ).toBe( list );
		expect( moveUp( list, -1 ) ).toBe( list );
	} );

	it( 'does not mutate the original', () => {
		const list = [ 'a', 'b' ];

		moveUp( list, 1 );

		expect( list ).toEqual( [ 'a', 'b' ] );
	} );
} );

describe( 'moveDown', () => {
	it( 'swaps with the item below', () => {
		expect( moveDown( [ 'a', 'b', 'c' ], 1 ) ).toEqual( [ 'a', 'c', 'b' ] );
	} );

	it( 'does nothing at the bottom', () => {
		const list = [ 'a', 'b' ];

		expect( moveDown( list, 1 ) ).toBe( list );
	} );
} );
```

Returning the *same array reference* when a move is impossible is deliberate, not an accident of implementation: it means a reducer using these can compare by identity and skip a re-render, and the test pins it with `toBe`.

- [ ] **Step 5: Write the reorder helpers**

`admin-src/lib/reorder.js`:

```js
function swap( list, a, b ) {
	const next = list.slice();

	next[ a ] = list[ b ];
	next[ b ] = list[ a ];

	return next;
}

export function moveUp( list, index ) {
	if ( index <= 0 || index >= list.length ) {
		return list;
	}

	return swap( list, index, index - 1 );
}

export function moveDown( list, index ) {
	if ( index < 0 || index >= list.length - 1 ) {
		return list;
	}

	return swap( list, index, index + 1 );
}
```

- [ ] **Step 6: Run them all and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "keys|reorder"`
Expected: PASS — 21 tests.

- [ ] **Step 7: Prepare a commit message**

```
feat(admin): add key generation and reordering helpers mirroring the server's rules
```

Do not run `git commit`.

---

### Task 9: The fields slice and the fields panel

Fields are stored as a **map** keyed by the field key, not a list — so "order" here means the order the map's keys appear in, and the visible ordering a visitor sees comes from the steps, not from this map. The panel lists fields, adds one of any of the thirteen types, removes one, and selects one for editing.

**Files:**
- Create: `admin-src/state/fields.js`
- Modify: `admin-src/state/actions.js`
- Modify: `admin-src/state/reducer.js`
- Create: `admin-src/panels/FieldsPanel.js`
- Test: `tests/js/admin/fields.test.js`
- Test: `tests/js/admin/FieldsPanel.test.js`

**Interfaces:**
- Consumes: `slugify`, `uniqueKey` (Task 8); `errorsFor`, `hasErrorsUnder` (Task 4); `MoveButtons`, `Notice` (Task 5)
- Produces from `fields.js`: `FIELD_TYPES`, `TYPE_EXTRA_KEYS`, `LABEL_OPTIONAL_TYPES`, `defaultField( type, key, label ) → object`, `fieldsReducer( fields, action ) → fields`
- Produces new action creators: `addField( type )`, `updateField( key, patch )`, `removeField( key )`
- Produces: `<FieldsPanel errorIndex selectedKey onSelect />`

**The exact type table, mirroring `FieldValidator`:**

| Type | Extra keys beyond the common seven | Label required |
|---|---|---|
| `number` | `min`, `max`, `step` | yes |
| `text`, `email`, `tel`, `textarea`, `toggle`, `date` | none | yes |
| `select`, `radio`, `checkbox` | `options` | yes |
| `slider` | `min`, `max`, `step` | yes |
| `hidden` | none | **no** |
| `html` | `content` | **no** |

The common seven are `key`, `type`, `label`, `help`, `placeholder`, `required`, `default` — and **every one of them must be present on every field**, whatever the type. `FieldValidator` reports a missing one as `missing_field` and an extra one as `unknown_key`, so `defaultField` has to produce exactly the right key set or a brand-new field fails validation the moment it is saved.

- [ ] **Step 1: Write the failing slice tests**

`tests/js/admin/fields.test.js`:

```js
import {
	defaultField,
	FIELD_TYPES,
	fieldsReducer,
	LABEL_OPTIONAL_TYPES,
	TYPE_EXTRA_KEYS,
} from '../../../admin-src/state/fields';
import { addField, removeField, updateField } from '../../../admin-src/state/actions';

const COMMON = [ 'key', 'type', 'label', 'help', 'placeholder', 'required', 'default' ];

describe( 'the type table', () => {
	it( 'lists exactly the thirteen types the server supports', () => {
		expect( FIELD_TYPES ).toEqual( [
			'number',
			'text',
			'email',
			'tel',
			'textarea',
			'select',
			'radio',
			'checkbox',
			'toggle',
			'date',
			'slider',
			'hidden',
			'html',
		] );
	} );

	it( 'gives each type exactly the extra keys the server expects', () => {
		expect( TYPE_EXTRA_KEYS.number ).toEqual( [ 'min', 'max', 'step' ] );
		expect( TYPE_EXTRA_KEYS.slider ).toEqual( [ 'min', 'max', 'step' ] );
		expect( TYPE_EXTRA_KEYS.select ).toEqual( [ 'options' ] );
		expect( TYPE_EXTRA_KEYS.radio ).toEqual( [ 'options' ] );
		expect( TYPE_EXTRA_KEYS.checkbox ).toEqual( [ 'options' ] );
		expect( TYPE_EXTRA_KEYS.html ).toEqual( [ 'content' ] );
		expect( TYPE_EXTRA_KEYS.text ).toEqual( [] );
		expect( TYPE_EXTRA_KEYS.toggle ).toEqual( [] );
	} );

	it( 'makes the label optional only for hidden and html', () => {
		expect( LABEL_OPTIONAL_TYPES ).toEqual( [ 'hidden', 'html' ] );
	} );
} );

describe( 'defaultField', () => {
	it( 'produces exactly the common keys for a plain type', () => {
		const field = defaultField( 'text', 'notes', 'Notes' );

		expect( Object.keys( field ).sort() ).toEqual( [ ...COMMON ].sort() );
		expect( field.key ).toBe( 'notes' );
		expect( field.type ).toBe( 'text' );
		expect( field.label ).toBe( 'Notes' );
		expect( field.required ).toBe( false );
	} );

	it( 'adds the range keys for number and slider, with usable values', () => {
		const field = defaultField( 'number', 'rooms', 'Rooms' );

		expect( Object.keys( field ).sort() ).toEqual( [ ...COMMON, 'min', 'max', 'step' ].sort() );
		expect( field.min ).toBe( 0 );
		expect( field.max ).toBe( 100 );
		expect( field.step ).toBe( 1 );
		expect( field.default ).toBe( 0 );
	} );

	it( 'gives an option type one starter option, because an empty list is invalid', () => {
		const field = defaultField( 'select', 'plan', 'Plan' );

		expect( field.options ).toHaveLength( 1 );
		expect( Object.keys( field.options[ 0 ] ).sort() ).toEqual( [ 'label', 'price', 'value' ] );
		expect( typeof field.options[ 0 ].price ).toBe( 'number' );
	} );

	it( 'gives html a content key that the server would accept', () => {
		expect( defaultField( 'html', 'intro', '' ).content.trim() ).not.toBe( '' );
	} );

	it( 'produces every type without throwing, and always with a string key', () => {
		FIELD_TYPES.forEach( ( type ) => {
			const field = defaultField( type, 'k', 'Label' );

			expect( typeof field.key ).toBe( 'string' );
			expect( field.type ).toBe( type );
		} );
	} );
} );

describe( 'fieldsReducer', () => {
	const fields = {
		rooms: defaultField( 'number', 'rooms', 'Rooms' ),
	};

	it( 'adds a field under a key derived from the type', () => {
		const next = fieldsReducer( fields, addField( 'text' ) );
		const added = Object.keys( next ).find( ( key ) => key !== 'rooms' );

		expect( next[ added ].type ).toBe( 'text' );
		expect( next[ added ].key ).toBe( added );
	} );

	it( 'never collides with an existing key', () => {
		const once = fieldsReducer( fields, addField( 'text' ) );
		const twice = fieldsReducer( once, addField( 'text' ) );

		expect( Object.keys( twice ) ).toHaveLength( 3 );
		expect( new Set( Object.keys( twice ) ).size ).toBe( 3 );
	} );

	it( 'patches one field and leaves the rest alone', () => {
		const next = fieldsReducer( fields, updateField( 'rooms', { label: 'How many rooms?' } ) );

		expect( next.rooms.label ).toBe( 'How many rooms?' );
		expect( next.rooms.min ).toBe( 0 );
	} );

	it( 'ignores a patch for a field that is not there', () => {
		expect( fieldsReducer( fields, updateField( 'ghost', { label: 'x' } ) ) ).toBe( fields );
	} );

	it( 'removes a field', () => {
		expect( fieldsReducer( fields, removeField( 'rooms' ) ) ).toEqual( {} );
	} );

	it( 'ignores a removal for a field that is not there', () => {
		expect( fieldsReducer( fields, removeField( 'ghost' ) ) ).toBe( fields );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( fields );

		fieldsReducer( fields, updateField( 'rooms', { label: 'Changed' } ) );

		expect( JSON.stringify( fields ) ).toBe( before );
	} );

	it( 'returns the same object for an action it does not handle', () => {
		expect( fieldsReducer( fields, { type: 'nothing' } ) ).toBe( fields );
	} );
} );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern "fields.test"`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the action creators**

Append to `admin-src/state/actions.js`:

```js
export const ADD_FIELD = 'fields/add';
export const UPDATE_FIELD = 'fields/update';
export const REMOVE_FIELD = 'fields/remove';

export const addField = ( fieldType ) => ( { type: ADD_FIELD, fieldType } );
export const updateField = ( key, patch ) => ( { type: UPDATE_FIELD, key, patch } );
export const removeField = ( key ) => ( { type: REMOVE_FIELD, key } );
```

Note the action carries `fieldType`, not `type` — `type` is already taken by the action's own discriminator. Getting this wrong produces an action that dispatches itself into the default branch and silently does nothing.

- [ ] **Step 4: Write the slice**

`admin-src/state/fields.js`:

```js
import { __ } from '@wordpress/i18n';

import { slugify, uniqueKey } from '../lib/keys';
import { ADD_FIELD, REMOVE_FIELD, UPDATE_FIELD } from './actions';

export const FIELD_TYPES = [
	'number',
	'text',
	'email',
	'tel',
	'textarea',
	'select',
	'radio',
	'checkbox',
	'toggle',
	'date',
	'slider',
	'hidden',
	'html',
];

/** `FieldValidator::TYPE_KEYS`-in eynisi. */
export const TYPE_EXTRA_KEYS = {
	number: [ 'min', 'max', 'step' ],
	text: [],
	email: [],
	tel: [],
	textarea: [],
	select: [ 'options' ],
	radio: [ 'options' ],
	checkbox: [ 'options' ],
	toggle: [],
	date: [],
	slider: [ 'min', 'max', 'step' ],
	hidden: [],
	html: [ 'content' ],
};

export const LABEL_OPTIONAL_TYPES = [ 'hidden', 'html' ];

function defaultValueFor( type ) {
	if ( type === 'number' || type === 'slider' ) {
		return 0;
	}

	if ( type === 'toggle' ) {
		return false;
	}

	if ( type === 'checkbox' ) {
		return [];
	}

	return '';
}

export function defaultField( type, key, label ) {
	const field = {
		key,
		type,
		label,
		help: '',
		placeholder: '',
		required: false,
		default: defaultValueFor( type ),
	};

	TYPE_EXTRA_KEYS[ type ].forEach( ( extra ) => {
		if ( extra === 'min' ) {
			field.min = 0;
		} else if ( extra === 'max' ) {
			field.max = 100;
		} else if ( extra === 'step' ) {
			field.step = 1;
		} else if ( extra === 'options' ) {
			field.options = [
				{ label: __( 'First option', 'quoteform' ), value: 'option_1', price: 0 },
			];
		} else if ( extra === 'content' ) {
			// Boş `content` serverdə `missing_field` verir, yəni yeni `html`
			// sahəsi toxunulmadan ETİBARSIZ olardı — başlanğıc mətni qoyulur.
			field.content = __( 'Write something here.', 'quoteform' );
		}
	} );

	return field;
}

export function fieldsReducer( fields, action ) {
	switch ( action.type ) {
		case ADD_FIELD: {
			const label = __( 'New field', 'quoteform' );
			const key = uniqueKey( slugify( action.fieldType ), Object.keys( fields ) );

			return { ...fields, [ key ]: defaultField( action.fieldType, key, label ) };
		}

		case UPDATE_FIELD: {
			const existing = fields[ action.key ];

			if ( ! existing ) {
				return fields;
			}

			return { ...fields, [ action.key ]: { ...existing, ...action.patch } };
		}

		case REMOVE_FIELD: {
			if ( ! ( action.key in fields ) ) {
				return fields;
			}

			const next = { ...fields };

			delete next[ action.key ];

			return next;
		}

		default:
			return fields;
	}
}
```

A starter option rather than an empty list is deliberate: `FieldValidator` reports an empty `options` array as `empty_collection`, so a freshly added select would be invalid before the user touched it.

- [ ] **Step 5: Delegate from the top-level reducer**

In `admin-src/state/reducer.js`, import the slice and its action types and add one case:

```js
import { ADD_FIELD, REMOVE_FIELD, UPDATE_FIELD } from './actions';
import { fieldsReducer } from './fields';
```

```js
		case ADD_FIELD:
		case UPDATE_FIELD:
		case REMOVE_FIELD:
			return editSchema( state, ( schema ) => {
				const fields = fieldsReducer( schema.fields, action );

				return fields === schema.fields ? schema : { ...schema, fields };
			} );

**The wrapper must preserve identity too.** `editSchema` compares the producer's
result against the schema it handed in, so returning `{ ...schema, fields: … }`
unconditionally defeats the check even when the slice reported no change — and a
no-op edit then marks the form dirty. Rewrap only when the slice actually
returned something new.
```

`editSchema` handles the `null`-schema guard and the dirty flag, so this case does neither.

- [ ] **Step 6: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "fields.test"`
Expected: PASS — 17 tests.

- [ ] **Step 7: Write the failing panel tests**

`tests/js/admin/FieldsPanel.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FieldsPanel from '../../../admin-src/panels/FieldsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function schemaWith( fields ) {
	return {
		version: 1,
		settings: {},
		fields,
		steps: [],
		calculations: [],
		rules: [],
		notifications: [],
	};
}

function Harness( { errorIndex = indexErrors( [] ), fields } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();
	const [ selected, setSelected ] = [ null, () => {} ];

	return (
		<>
			<button
				onClick={ () =>
					dispatch( loadSucceeded( { id: 1, title: 'F', schema: schemaWith( fields ) } ) )
				}
			>
				load
			</button>
			{ schema && (
				<FieldsPanel errorIndex={ errorIndex } selectedKey={ selected } onSelect={ setSelected } />
			) }
		</>
	);
}

async function renderLoaded( fields, errorIndex ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness fields={ fields } errorIndex={ errorIndex } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

describe( 'FieldsPanel', () => {
	it( 'says so when there are no fields', async () => {
		await renderLoaded( {} );

		expect( screen.getByText( 'No fields yet. Add one to get started.' ) ).toBeInTheDocument();
	} );

	it( 'lists each field by label and type', async () => {
		await renderLoaded( {
			rooms: defaultField( 'number', 'rooms', 'Rooms' ),
			notes: defaultField( 'textarea', 'notes', 'Notes' ),
		} );

		expect( screen.getByText( 'Rooms' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Notes' ) ).toBeInTheDocument();
	} );

	it( 'falls back to the key when a field has no label', async () => {
		await renderLoaded( { intro: defaultField( 'html', 'intro', '' ) } );

		expect( screen.getByText( 'intro' ) ).toBeInTheDocument();
	} );

	it( 'adds a field of the chosen type', async () => {
		const user = await renderLoaded( {} );

		await user.selectOptions( screen.getByLabelText( 'Field type' ), 'email' );
		await user.click( screen.getByRole( 'button', { name: 'Add field' } ) );

		expect( screen.getByText( 'New field' ) ).toBeInTheDocument();
		expect( screen.queryByText( 'No fields yet. Add one to get started.' ) ).not.toBeInTheDocument();
	} );

	it( 'offers all thirteen types', async () => {
		await renderLoaded( {} );

		expect( screen.getByLabelText( 'Field type' ).querySelectorAll( 'option' ) ).toHaveLength( 13 );
	} );

	it( 'removes a field after confirmation', async () => {
		const user = await renderLoaded( { rooms: defaultField( 'number', 'rooms', 'Rooms' ) } );

		await user.click( screen.getByRole( 'button', { name: 'Remove Rooms' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove field' } ) );

		expect( screen.queryByText( 'Rooms' ) ).not.toBeInTheDocument();
	} );

	it( 'marks a field that has a server error', async () => {
		await renderLoaded(
			{ rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			indexErrors( [
				{ path: 'fields.rooms.label', code: 'missing_field', message: 'Needs a label.', context: {} },
			] )
		);

		expect( screen.getByText( 'Rooms' ).closest( 'li' ) ).toHaveTextContent( 'Has a problem' );
	} );

	it( 'does not mark a field whose key merely shares a prefix', async () => {
		await renderLoaded(
			{
				room: defaultField( 'number', 'room', 'Room' ),
				room_count: defaultField( 'number', 'room_count', 'Room count' ),
			},
			indexErrors( [
				{ path: 'fields.room_count.label', code: 'missing_field', message: 'x', context: {} },
			] )
		);

		expect( screen.getByText( 'Room' ).closest( 'li' ) ).not.toHaveTextContent( 'Has a problem' );
		expect( screen.getByText( 'Room count' ).closest( 'li' ) ).toHaveTextContent( 'Has a problem' );
	} );
} );
```

That last test is the reason `hasErrorsUnder` matches on segment boundaries. It is cheap to write and it catches a badge on the wrong row, which is the kind of bug a user reports as "it says there's an error but there isn't".

- [ ] **Step 8: Write the panel**

`admin-src/panels/FieldsPanel.js`:

```js
import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { addField, removeField } from '../state/actions';
import { hasErrorsUnder } from '../state/errors';
import { FIELD_TYPES } from '../state/fields';
import { useDispatch, useStore } from '../state/StoreContext';

export default function FieldsPanel( { errorIndex, selectedKey, onSelect } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();
	const [ pendingType, setPendingType ] = useState( FIELD_TYPES[ 0 ] );
	const [ confirming, setConfirming ] = useState( null );

	if ( schema === null ) {
		return null;
	}

	const keys = Object.keys( schema.fields );

	function handleRemove( key ) {
		setConfirming( null );

		if ( selectedKey === key ) {
			onSelect( null );
		}

		dispatch( removeField( key ) );
	}

	return (
		<section className="qform-panel" aria-labelledby="qform-fields-heading">
			<h2 id="qform-fields-heading">{ __( 'Fields', 'quoteform' ) }</h2>

			<div className="qform-fields__add">
				<label htmlFor="qform-new-field-type">{ __( 'Field type', 'quoteform' ) }</label>
				<select
					id="qform-new-field-type"
					value={ pendingType }
					onChange={ ( event ) => setPendingType( event.target.value ) }
				>
					{ FIELD_TYPES.map( ( type ) => (
						<option key={ type } value={ type }>
							{ type }
						</option>
					) ) }
				</select>
				<button type="button" onClick={ () => dispatch( addField( pendingType ) ) }>
					{ __( 'Add field', 'quoteform' ) }
				</button>
			</div>

			{ keys.length === 0 && (
				<p>{ __( 'No fields yet. Add one to get started.', 'quoteform' ) }</p>
			) }

			{ keys.length > 0 && (
				<ul className="qform-fields__list">
					{ keys.map( ( key ) => {
						const field = schema.fields[ key ];
						const name = field.label || key;
						const broken = hasErrorsUnder( errorIndex, `fields.${ key }` );

						return (
							<li key={ key } className={ selectedKey === key ? 'is-selected' : undefined }>
								<button type="button" onClick={ () => onSelect( key ) }>
									{ name }
								</button>
								<span className="qform-fields__type">{ field.type }</span>
								{ broken && (
									<span className="qform-fields__badge">
										{ __( 'Has a problem', 'quoteform' ) }
									</span>
								) }
								<button
									type="button"
									onClick={ () => setConfirming( key ) }
									aria-label={ sprintf(
										/* translators: %s: field label or key. */
										__( 'Remove %s', 'quoteform' ),
										name
									) }
								>
									{ __( 'Remove', 'quoteform' ) }
								</button>
							</li>
						);
					} ) }
				</ul>
			) }

			{ confirming && (
				<div className="qform-confirm" role="dialog" aria-modal="true" aria-label={ __( 'Confirm', 'quoteform' ) }>
					<p>
						{ __(
							'Removing a field does not remove references to it. Any step, calculation or rule that uses it will report an error until you fix it.',
							'quoteform'
						) }
					</p>
					<button type="button" onClick={ () => handleRemove( confirming ) }>
						{ __( 'Remove field', 'quoteform' ) }
					</button>
					<button type="button" onClick={ () => setConfirming( null ) }>
						{ __( 'Cancel', 'quoteform' ) }
					</button>
				</div>
			) }
		</section>
	);
}
```

The confirmation text says what actually happens rather than "Are you sure?". Removing a field that a calculation references leaves `{rooms}` in a formula, and the server will answer `unknown_reference` on the next save — telling the user that up front is the difference between an informed choice and a surprise.

- [ ] **Step 9: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "FieldsPanel"`
Expected: PASS — 8 tests.

Then `npm test`
Expected: both projects green.

- [ ] **Step 10: Prepare a commit message**

```
feat(admin): add the fields slice and the field list panel
```

Do not run `git commit`.

---

### Task 10: The field editor

One field's properties. Common ones for every type, extra ones dispatched on the type, and the options editor that three types share. This is also where D5's key rule lives: a key is editable until something references it, and read-only afterwards.

**Files:**
- Create: `admin-src/lib/references.js`
- Create: `admin-src/panels/FieldEditor.js`
- Create: `admin-src/panels/OptionsEditor.js`
- Test: `tests/js/admin/references.test.js`
- Test: `tests/js/admin/FieldEditor.test.js`

**Interfaces:**
- Consumes: `updateField` (Task 9); `errorsFor` (Task 4); every control from Task 5; `moveUp`/`moveDown` (Task 8); `isValidKey`, `isReservedKey` (Task 8); `TYPE_EXTRA_KEYS`, `LABEL_OPTIONAL_TYPES` (Task 9)
- Produces from `references.js`: `fieldReferences( schema, key ) → string[]` — human-readable places the key is used, empty when it is used nowhere
- Produces: `<FieldEditor fieldKey errorIndex />` and `<OptionsEditor options onChange errorIndex pathPrefix />`

**Where a field key can be referenced**, and therefore what `fieldReferences` must look at:
- `schema.steps[i].fields` — the step that shows it
- `schema.calculations[i].expression` — as `{key}` or `{key.price}`
- `schema.rules[i].target.key` when `target.kind` is `field`
- `schema.rules[i].conditions[j].field`

**A trap in the expression case:** searching an expression for the substring `{rooms}` misses `{rooms.price}`, and searching for `rooms` matches `{bedrooms}`. Use the engine's own `expressionVariables()` to get the real list, then compare each variable's base segment — the part before any `.` — against the key. The engine is already a dependency of this build; do not write a second parser.

- [ ] **Step 1: Write the failing reference tests**

`tests/js/admin/references.test.js`:

```js
import { fieldReferences } from '../../../admin-src/lib/references';

function schema( overrides ) {
	return {
		version: 1,
		settings: {},
		fields: {},
		steps: [],
		calculations: [],
		rules: [],
		notifications: [],
		...overrides,
	};
}

describe( 'fieldReferences', () => {
	it( 'finds nothing for an unused key', () => {
		expect( fieldReferences( schema( {} ), 'rooms' ) ).toEqual( [] );
	} );

	it( 'finds a step that shows the field', () => {
		const found = fieldReferences(
			schema( { steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ] } ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
		expect( found[ 0 ] ).toContain( 'One' );
	} );

	it( 'finds a calculation that uses the field', () => {
		const found = fieldReferences(
			schema( {
				calculations: [
					{ key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true },
				],
			} ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
		expect( found[ 0 ] ).toContain( 'total' );
	} );

	it( 'finds the price suffix too', () => {
		const found = fieldReferences(
			schema( {
				calculations: [
					{ key: 'total', expression: '{urgency.price}', label: 'Total', visible: true },
				],
			} ),
			'urgency'
		);

		expect( found ).toHaveLength( 1 );
	} );

	it( 'does NOT match a key that merely shares a prefix', () => {
		const found = fieldReferences(
			schema( {
				calculations: [
					{ key: 'total', expression: '{bedrooms} * 50', label: 'Total', visible: true },
				],
			} ),
			'rooms'
		);

		expect( found ).toEqual( [] );
	} );

	it( 'ignores a broken expression instead of throwing', () => {
		expect( () =>
			fieldReferences(
				schema( {
					calculations: [ { key: 'total', expression: '{rooms} * ', label: 'T', visible: true } ],
				} ),
				'rooms'
			)
		).not.toThrow();
	} );

	it( 'finds a rule that targets the field', () => {
		const found = fieldReferences(
			schema( {
				rules: [
					{
						target: { kind: 'field', key: 'rooms' },
						action: 'show',
						match: 'all',
						conditions: [],
					},
				],
			} ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
	} );

	it( 'finds a rule whose condition tests the field', () => {
		const found = fieldReferences(
			schema( {
				rules: [
					{
						target: { kind: 'step', key: 'step_two' },
						action: 'hide',
						match: 'all',
						conditions: [ { field: 'rooms', operator: 'is_empty', value: '' } ],
					},
				],
			} ),
			'rooms'
		);

		expect( found ).toHaveLength( 1 );
	} );

	it( 'survives a schema full of malformed parts', () => {
		expect( () =>
			fieldReferences(
				schema( {
					steps: [ null, 'nope', { fields: 'not-a-list' } ],
					calculations: [ null, { expression: 42 } ],
					rules: [ null, { target: 'nope', conditions: 'nope' } ],
				} ),
				'rooms'
			)
		).not.toThrow();
	} );
} );
```

That last one matters because this runs on a document the user is halfway through editing, not on one the server has blessed.

- [ ] **Step 2: Write the reference finder**

`admin-src/lib/references.js`:

```js
import { sprintf, __ } from '@wordpress/i18n';

import { expressionVariables } from '../../frontend-src/engine';

/**
 * İfadədə `{rooms}` alt-sətrini axtarmaq `{rooms.price}`-ı buraxar,
 * sadəcə `rooms` axtarmaq isə `{bedrooms}`-u tutar. Ona görə mühərrikin
 * ÖZ `expressionVariables()` funksiyası işlədilir və hər dəyişənin
 * nöqtədən əvvəlki hissəsi müqayisə edilir.
 */
function expressionUsesKey( expression, key ) {
	if ( typeof expression !== 'string' ) {
		return false;
	}

	try {
		return expressionVariables( expression ).some(
			( name ) => String( name ).split( '.' )[ 0 ] === key
		);
	} catch ( error ) {
		return false;
	}
}

export function fieldReferences( schema, key ) {
	const found = [];

	( Array.isArray( schema.steps ) ? schema.steps : [] ).forEach( ( step ) => {
		if ( ! step || typeof step !== 'object' || ! Array.isArray( step.fields ) ) {
			return;
		}

		if ( step.fields.includes( key ) ) {
			found.push(
				sprintf(
					/* translators: %s: step title or key. */
					__( 'the step “%s”', 'quoteform' ),
					step.title || step.key || ''
				)
			);
		}
	} );

	( Array.isArray( schema.calculations ) ? schema.calculations : [] ).forEach( ( calculation ) => {
		if ( ! calculation || typeof calculation !== 'object' ) {
			return;
		}

		if ( expressionUsesKey( calculation.expression, key ) ) {
			found.push(
				sprintf(
					/* translators: %s: calculation key. */
					__( 'the calculation “%s”', 'quoteform' ),
					calculation.key || ''
				)
			);
		}
	} );

	( Array.isArray( schema.rules ) ? schema.rules : [] ).forEach( ( rule, index ) => {
		if ( ! rule || typeof rule !== 'object' ) {
			return;
		}

		const target = rule.target;
		const targetsIt =
			target && typeof target === 'object' && target.kind === 'field' && target.key === key;

		const conditions = Array.isArray( rule.conditions ) ? rule.conditions : [];
		const testsIt = conditions.some(
			( condition ) => condition && typeof condition === 'object' && condition.field === key
		);

		if ( targetsIt || testsIt ) {
			found.push(
				sprintf(
					/* translators: %d: rule number, starting at one. */
					__( 'rule %d', 'quoteform' ),
					index + 1
				)
			);
		}
	} );

	return found;
}
```

The import reaches across into `frontend-src/engine` deliberately. There is one expression engine in this plugin and the builder uses it rather than approximating it — that is the same reasoning that keeps the formula editor honest in Task 12.

- [ ] **Step 3: Run the reference tests and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern references`
Expected: PASS — 9 tests.

- [ ] **Step 4: Write the failing editor tests**

`tests/js/admin/FieldEditor.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FieldEditor from '../../../admin-src/panels/FieldEditor';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function Harness( { fields, steps = [], calculations = [], rules = [], errorIndex, fieldKey } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( {
							id: 1,
							title: 'F',
							schema: {
								version: 1,
								settings: {},
								fields,
								steps,
								calculations,
								rules,
								notifications: [],
							},
						} )
					)
				}
			>
				load
			</button>
			{ schema && <FieldEditor fieldKey={ fieldKey } errorIndex={ errorIndex } /> }
		</>
	);
}

async function renderEditor( props ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness errorIndex={ indexErrors( [] ) } { ...props } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

describe( 'common properties', () => {
	it( 'edits the label', async () => {
		const user = await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		await user.clear( screen.getByLabelText( 'Label' ) );
		await user.type( screen.getByLabelText( 'Label' ), 'How many?' );

		expect( screen.getByLabelText( 'Label' ) ).toHaveValue( 'How many?' );
	} );

	it( 'shows the required toggle', async () => {
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		expect( screen.getByRole( 'checkbox', { name: 'Required' } ) ).toBeInTheDocument();
	} );

	it( 'renders nothing when the selected field is gone', async () => {
		await renderEditor( { fields: {}, fieldKey: 'ghost' } );

		expect( screen.queryByLabelText( 'Label' ) ).not.toBeInTheDocument();
	} );
} );

describe( 'the key rule', () => {
	it( 'lets an unreferenced key be edited', async () => {
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		expect( screen.getByLabelText( 'Key' ) ).toBeEnabled();
	} );

	it( 'locks a referenced key and says where it is used', async () => {
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
			fieldKey: 'rooms',
		} );

		expect( screen.getByLabelText( 'Key' ) ).toBeDisabled();
		expect( screen.getByText( /the calculation “total”/ ) ).toBeInTheDocument();
	} );

	it( 'warns about a key the server would reject, without blocking the edit', async () => {
		const user = await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		await user.clear( screen.getByLabelText( 'Key' ) );
		await user.type( screen.getByLabelText( 'Key' ), 'Bad Key' );

		expect( screen.getByText( 'A key must start with a lowercase letter and use only lowercase letters, numbers and underscores.' ) ).toBeInTheDocument();
	} );
} );

describe( 'type-specific properties', () => {
	it( 'shows the range controls for a number', async () => {
		await renderEditor( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			fieldKey: 'rooms',
		} );

		expect( screen.getByLabelText( 'Minimum' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Maximum' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Step' ) ).toBeInTheDocument();
	} );

	it( 'does not show the range controls for a text field', async () => {
		await renderEditor( {
			fields: { notes: defaultField( 'text', 'notes', 'Notes' ) },
			fieldKey: 'notes',
		} );

		expect( screen.queryByLabelText( 'Minimum' ) ).not.toBeInTheDocument();
	} );

	it( 'shows the content box for html, and no label box', async () => {
		await renderEditor( {
			fields: { intro: defaultField( 'html', 'intro', '' ) },
			fieldKey: 'intro',
		} );

		expect( screen.getByLabelText( 'Content' ) ).toBeInTheDocument();
	} );

	it( 'shows the options editor for a select', async () => {
		await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		expect( screen.getByLabelText( 'Option 1 label' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Option 1 value' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Option 1 price' ) ).toBeInTheDocument();
	} );
} );

describe( 'the options editor', () => {
	it( 'adds an option', async () => {
		const user = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );

		expect( screen.getByLabelText( 'Option 2 label' ) ).toBeInTheDocument();
	} );

	it( 'removes an option', async () => {
		const user = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Remove option 2' } ) );

		expect( screen.queryByLabelText( 'Option 2 label' ) ).not.toBeInTheDocument();
	} );

	it( 'reorders options', async () => {
		const user = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.click( screen.getByRole( 'button', { name: 'Add option' } ) );
		await user.clear( screen.getByLabelText( 'Option 2 label' ) );
		await user.type( screen.getByLabelText( 'Option 2 label' ), 'Second' );
		await user.click( screen.getByRole( 'button', { name: 'Move option 2 up' } ) );

		expect( screen.getByLabelText( 'Option 1 label' ) ).toHaveValue( 'Second' );
	} );

	it( 'keeps a price numeric', async () => {
		const user = await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
		} );

		await user.clear( screen.getByLabelText( 'Option 1 price' ) );
		await user.type( screen.getByLabelText( 'Option 1 price' ), '60' );

		expect( screen.getByLabelText( 'Option 1 price' ) ).toHaveValue( 60 );
	} );

	it( 'puts a server error on the option it belongs to', async () => {
		await renderEditor( {
			fields: { plan: defaultField( 'select', 'plan', 'Plan' ) },
			fieldKey: 'plan',
			errorIndex: indexErrors( [
				{
					path: 'fields.plan.options.0.price',
					code: 'invalid_type',
					message: 'A price must be a number.',
					context: {},
				},
			] ),
		} );

		expect( screen.getByLabelText( 'Option 1 price' ) ).toHaveAccessibleDescription(
			'A price must be a number.'
		);
	} );
} );
```

- [ ] **Step 5: Write the options editor**

`admin-src/panels/OptionsEditor.js`:

```js
import { __, sprintf } from '@wordpress/i18n';

import MoveButtons from '../components/MoveButtons';
import NumberControl from '../components/NumberControl';
import TextControl from '../components/TextControl';
import { moveDown, moveUp } from '../lib/reorder';
import { errorsFor } from '../state/errors';

export default function OptionsEditor( { options, onChange, errorIndex, pathPrefix } ) {
	const patch = ( index, key, value ) =>
		onChange( options.map( ( option, i ) => ( i === index ? { ...option, [ key ]: value } : option ) ) );

	return (
		<div className="qform-options">
			<h4>{ __( 'Options', 'quoteform' ) }</h4>

			{ options.map( ( option, index ) => {
				const number = index + 1;
				const at = ( key ) => errorsFor( errorIndex, `${ pathPrefix }.${ index }.${ key }` );

				return (
					<div className="qform-options__row" key={ index }>
						<TextControl
							id={ `qform-option-${ index }-label` }
							label={ sprintf(
								/* translators: %d: option number. */
								__( 'Option %d label', 'quoteform' ),
								number
							) }
							value={ option.label }
							onChange={ ( value ) => patch( index, 'label', value ) }
							errors={ at( 'label' ) }
						/>
						<TextControl
							id={ `qform-option-${ index }-value` }
							label={ sprintf(
								/* translators: %d: option number. */
								__( 'Option %d value', 'quoteform' ),
								number
							) }
							value={ option.value }
							onChange={ ( value ) => patch( index, 'value', value ) }
							errors={ at( 'value' ) }
						/>
						<NumberControl
							id={ `qform-option-${ index }-price` }
							label={ sprintf(
								/* translators: %d: option number. */
								__( 'Option %d price', 'quoteform' ),
								number
							) }
							value={ option.price }
							onChange={ ( value ) => patch( index, 'price', value === null ? 0 : value ) }
							errors={ at( 'price' ) }
						/>
						<MoveButtons
							label={ sprintf(
								/* translators: %d: option number. */
								__( 'option %d', 'quoteform' ),
								number
							) }
							onMoveUp={ () => onChange( moveUp( options, index ) ) }
							onMoveDown={ () => onChange( moveDown( options, index ) ) }
							canMoveUp={ index > 0 }
							canMoveDown={ index < options.length - 1 }
						/>
						<button
							type="button"
							onClick={ () => onChange( options.filter( ( _, i ) => i !== index ) ) }
							disabled={ options.length === 1 }
							aria-label={ sprintf(
								/* translators: %d: option number. */
								__( 'Remove option %d', 'quoteform' ),
								number
							) }
						>
							{ __( 'Remove', 'quoteform' ) }
						</button>
					</div>
				);
			} ) }

			<button
				type="button"
				onClick={ () =>
					onChange( [
						...options,
						{ label: '', value: `option_${ options.length + 1 }`, price: 0 },
					] )
				}
			>
				{ __( 'Add option', 'quoteform' ) }
			</button>
		</div>
	);
}
```

The remove button is disabled at one option rather than allowing zero: `FieldValidator` reports an empty list as `empty_collection`, so letting the user reach zero only to be told off on save is worse than not letting them. A price that goes empty becomes `0` rather than `null`, because `null` is `invalid_type` to the server while `0` is a real price.

- [ ] **Step 6: Write the field editor**

`admin-src/panels/FieldEditor.js`:

```js
import { __ } from '@wordpress/i18n';

import NumberControl from '../components/NumberControl';
import TextControl from '../components/TextControl';
import ToggleControl from '../components/ToggleControl';
import { fieldReferences } from '../lib/references';
import { isReservedKey, isValidKey } from '../lib/keys';
import { updateField } from '../state/actions';
import { errorsFor } from '../state/errors';
import { LABEL_OPTIONAL_TYPES, TYPE_EXTRA_KEYS } from '../state/fields';
import { useDispatch, useStore } from '../state/StoreContext';
import OptionsEditor from './OptionsEditor';

export default function FieldEditor( { fieldKey, errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();

	if ( schema === null ) {
		return null;
	}

	const field = schema.fields[ fieldKey ];

	if ( ! field ) {
		return null;
	}

	const base = `fields.${ fieldKey }`;
	const at = ( key ) => errorsFor( errorIndex, `${ base }.${ key }` );
	const set = ( key ) => ( value ) => dispatch( updateField( fieldKey, { [ key ]: value } ) );
	const extras = TYPE_EXTRA_KEYS[ field.type ] || [];
	const usedIn = fieldReferences( schema, fieldKey );
	const keyLocked = usedIn.length > 0;
	const keyShapeProblem = field.key !== '' && ! isValidKey( field.key );
	const keyReserved = isReservedKey( field.key );

	return (
		<section className="qform-panel" aria-labelledby="qform-field-heading">
			<h3 id="qform-field-heading">
				{ field.label || fieldKey } — { field.type }
			</h3>

			<TextControl
				id="qform-field-key"
				label={ __( 'Key', 'quoteform' ) }
				value={ field.key }
				onChange={ ( value ) => dispatch( updateField( fieldKey, { key: value } ) ) }
				errors={ at( 'key' ) }
				disabled={ keyLocked }
				help={
					keyLocked
						? __( 'This key is in use, so it cannot be renamed here.', 'quoteform' )
						: __( 'Used in formulas, like {room_count}.', 'quoteform' )
				}
			/>

			{ keyLocked && (
				<p className="qform-help">
					{ __( 'Used in:', 'quoteform' ) } { usedIn.join( ', ' ) }
				</p>
			) }

			{ keyShapeProblem && (
				<p className="qform-warning">
					{ __(
						'A key must start with a lowercase letter and use only lowercase letters, numbers and underscores.',
						'quoteform'
					) }
				</p>
			) }

			{ keyReserved && (
				<p className="qform-warning">
					{ __( 'That key is reserved. Choose another one.', 'quoteform' ) }
				</p>
			) }

			{ ! LABEL_OPTIONAL_TYPES.includes( field.type ) && (
				<TextControl
					id="qform-field-label"
					label={ __( 'Label', 'quoteform' ) }
					value={ field.label }
					onChange={ set( 'label' ) }
					errors={ at( 'label' ) }
				/>
			) }

			<TextControl
				id="qform-field-help"
				label={ __( 'Help text', 'quoteform' ) }
				value={ field.help }
				onChange={ set( 'help' ) }
				errors={ at( 'help' ) }
			/>

			<TextControl
				id="qform-field-placeholder"
				label={ __( 'Placeholder', 'quoteform' ) }
				value={ field.placeholder }
				onChange={ set( 'placeholder' ) }
				errors={ at( 'placeholder' ) }
			/>

			<ToggleControl
				id="qform-field-required"
				label={ __( 'Required', 'quoteform' ) }
				checked={ field.required }
				onChange={ set( 'required' ) }
				errors={ at( 'required' ) }
			/>

			{ extras.includes( 'min' ) && (
				<>
					<NumberControl
						id="qform-field-min"
						label={ __( 'Minimum', 'quoteform' ) }
						value={ field.min }
						onChange={ set( 'min' ) }
						errors={ at( 'min' ) }
					/>
					<NumberControl
						id="qform-field-max"
						label={ __( 'Maximum', 'quoteform' ) }
						value={ field.max }
						onChange={ set( 'max' ) }
						errors={ at( 'max' ) }
					/>
					<NumberControl
						id="qform-field-step"
						label={ __( 'Step', 'quoteform' ) }
						value={ field.step }
						onChange={ set( 'step' ) }
						errors={ at( 'step' ) }
					/>
				</>
			) }

			{ extras.includes( 'content' ) && (
				<TextControl
					id="qform-field-content"
					label={ __( 'Content', 'quoteform' ) }
					value={ field.content }
					onChange={ set( 'content' ) }
					errors={ at( 'content' ) }
					multiline
				/>
			) }

			{ extras.includes( 'options' ) && (
				<OptionsEditor
					options={ field.options }
					onChange={ set( 'options' ) }
					errorIndex={ errorIndex }
					pathPrefix={ `${ base }.options` }
				/>
			) }
		</section>
	);
}
```

Note what the key warnings do **not** do: they do not stop the user typing, and they do not block a save. That is D4 — the client warns, the server decides. A builder that refuses to let you type a key it thinks is wrong is infuriating when it is the one that is wrong.

- [ ] **Step 7: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "FieldEditor|references"`
Expected: PASS — 24 tests.

- [ ] **Step 8: Prepare a commit message**

```
feat(admin): add the field editor, the options editor and reference detection
```

Do not run `git commit`.

---

### Task 11: The steps slice and the steps panel

Steps are an ordered list, and each one names the field keys it shows. Two invariants the server enforces and the builder should make easy to satisfy: **every field belongs to exactly one step**, and a step needs at least one field.

**Files:**
- Create: `admin-src/state/steps.js`
- Modify: `admin-src/state/actions.js`
- Modify: `admin-src/state/reducer.js`
- Create: `admin-src/panels/StepsPanel.js`
- Test: `tests/js/admin/steps.test.js`
- Test: `tests/js/admin/StepsPanel.test.js`

**Interfaces:**
- Consumes: `moveUp`/`moveDown` (Task 8); `slugify`/`uniqueKey` (Task 8); `errorsFor`/`hasErrorsUnder` (Task 4); controls (Task 5)
- Produces from `steps.js`: `defaultStep( key, title ) → object`, `stepsReducer( steps, action ) → steps`
- Produces action creators: `addStep()`, `updateStep( index, patch )`, `removeStep( index )`, `moveStep( index, direction )`, `assignField( fieldKey, stepIndex )`, `unassignField( fieldKey )`
- Produces: `<StepsPanel errorIndex />`

**The assignment rule, and why it is one action rather than two.** `assignField( fieldKey, stepIndex )` removes the key from every step first and then adds it to the target. Doing it as "remove from A" then "add to B" through two dispatches leaves a window where the field is on no step, and if anything re-renders in between the user sees it flicker into the unassigned list. One action, one consistent document.

`unassignField` removes it everywhere and adds it nowhere. That is the state the server reports as `unknown_reference` at `fields.<key>` — a field nobody can fill in — so the panel shows those separately under a heading that says exactly that.

- [ ] **Step 1: Write the failing slice tests**

`tests/js/admin/steps.test.js`:

```js
import { defaultStep, stepsReducer } from '../../../admin-src/state/steps';
import {
	addStep,
	assignField,
	moveStep,
	removeStep,
	unassignField,
	updateStep,
} from '../../../admin-src/state/actions';

const steps = [
	{ key: 'step_one', title: 'One', description: '', fields: [ 'a', 'b' ] },
	{ key: 'step_two', title: 'Two', description: '', fields: [ 'c' ] },
];

describe( 'defaultStep', () => {
	it( 'has exactly the four keys the server requires', () => {
		expect( Object.keys( defaultStep( 'step_one', 'One' ) ).sort() ).toEqual( [
			'description',
			'fields',
			'key',
			'title',
		] );
	} );

	it( 'starts with an empty field list', () => {
		expect( defaultStep( 'step_one', 'One' ).fields ).toEqual( [] );
	} );
} );

describe( 'stepsReducer', () => {
	it( 'appends a step with a unique key', () => {
		const next = stepsReducer( steps, addStep() );

		expect( next ).toHaveLength( 3 );
		expect( new Set( next.map( ( step ) => step.key ) ).size ).toBe( 3 );
	} );

	it( 'patches one step', () => {
		const next = stepsReducer( steps, updateStep( 1, { title: 'Renamed' } ) );

		expect( next[ 1 ].title ).toBe( 'Renamed' );
		expect( next[ 0 ].title ).toBe( 'One' );
	} );

	it( 'removes a step', () => {
		expect( stepsReducer( steps, removeStep( 0 ) ) ).toHaveLength( 1 );
	} );

	it( 'ignores an index that is not there', () => {
		expect( stepsReducer( steps, removeStep( 9 ) ) ).toBe( steps );
		expect( stepsReducer( steps, updateStep( 9, { title: 'x' } ) ) ).toBe( steps );
	} );

	it( 'moves a step', () => {
		expect( stepsReducer( steps, moveStep( 1, 'up' ) )[ 0 ].key ).toBe( 'step_two' );
		expect( stepsReducer( steps, moveStep( 0, 'down' ) )[ 0 ].key ).toBe( 'step_two' );
	} );

	it( 'assigns a field to a step and removes it from wherever it was', () => {
		const next = stepsReducer( steps, assignField( 'a', 1 ) );

		expect( next[ 0 ].fields ).toEqual( [ 'b' ] );
		expect( next[ 1 ].fields ).toEqual( [ 'c', 'a' ] );
	} );

	it( 'never leaves a field on two steps, even when assigned to the one it is already on', () => {
		const next = stepsReducer( steps, assignField( 'a', 0 ) );
		const appearances = next.reduce(
			( count, step ) => count + step.fields.filter( ( key ) => key === 'a' ).length,
			0
		);

		expect( appearances ).toBe( 1 );
	} );

	it( 'unassigns a field from every step', () => {
		const next = stepsReducer( steps, unassignField( 'a' ) );

		expect( next[ 0 ].fields ).toEqual( [ 'b' ] );
		expect( next[ 1 ].fields ).toEqual( [ 'c' ] );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( steps );

		stepsReducer( steps, assignField( 'a', 1 ) );

		expect( JSON.stringify( steps ) ).toBe( before );
	} );
} );
```

- [ ] **Step 2: Add the action creators**

Append to `admin-src/state/actions.js`:

```js
export const ADD_STEP = 'steps/add';
export const UPDATE_STEP = 'steps/update';
export const REMOVE_STEP = 'steps/remove';
export const MOVE_STEP = 'steps/move';
export const ASSIGN_FIELD = 'steps/assignField';
export const UNASSIGN_FIELD = 'steps/unassignField';

export const addStep = () => ( { type: ADD_STEP } );
export const updateStep = ( index, patch ) => ( { type: UPDATE_STEP, index, patch } );
export const removeStep = ( index ) => ( { type: REMOVE_STEP, index } );
export const moveStep = ( index, direction ) => ( { type: MOVE_STEP, index, direction } );
export const assignField = ( fieldKey, stepIndex ) => ( { type: ASSIGN_FIELD, fieldKey, stepIndex } );
export const unassignField = ( fieldKey ) => ( { type: UNASSIGN_FIELD, fieldKey } );
```

- [ ] **Step 3: Write the slice**

`admin-src/state/steps.js`:

```js
import { __ } from '@wordpress/i18n';

import { uniqueKey } from '../lib/keys';
import { moveDown, moveUp } from '../lib/reorder';
import {
	ADD_STEP,
	ASSIGN_FIELD,
	MOVE_STEP,
	REMOVE_STEP,
	UNASSIGN_FIELD,
	UPDATE_STEP,
} from './actions';

export function defaultStep( key, title ) {
	return { key, title, description: '', fields: [] };
}

function withoutField( steps, fieldKey ) {
	return steps.map( ( step ) => ( {
		...step,
		fields: step.fields.filter( ( key ) => key !== fieldKey ),
	} ) );
}

export function stepsReducer( steps, action ) {
	switch ( action.type ) {
		case ADD_STEP: {
			const key = uniqueKey( 'step', steps.map( ( step ) => step.key ) );

			return [ ...steps, defaultStep( key, __( 'New step', 'quoteform' ) ) ];
		}

		case UPDATE_STEP: {
			if ( ! steps[ action.index ] ) {
				return steps;
			}

			return steps.map( ( step, index ) =>
				index === action.index ? { ...step, ...action.patch } : step
			);
		}

		case REMOVE_STEP: {
			if ( ! steps[ action.index ] ) {
				return steps;
			}

			return steps.filter( ( _, index ) => index !== action.index );
		}

		case MOVE_STEP:
			return action.direction === 'up'
				? moveUp( steps, action.index )
				: moveDown( steps, action.index );

		case ASSIGN_FIELD: {
			if ( ! steps[ action.stepIndex ] ) {
				return steps;
			}

			const cleared = withoutField( steps, action.fieldKey );

			return cleared.map( ( step, index ) =>
				index === action.stepIndex
					? { ...step, fields: [ ...step.fields, action.fieldKey ] }
					: step
			);
		}

		case UNASSIGN_FIELD:
			return withoutField( steps, action.fieldKey );

		default:
			return steps;
	}
}
```

- [ ] **Step 4: Delegate from the top-level reducer**

Add to `admin-src/state/reducer.js`, importing `stepsReducer` and the six action types:

```js
		case ADD_STEP:
		case UPDATE_STEP:
		case REMOVE_STEP:
		case MOVE_STEP:
		case ASSIGN_FIELD:
		case UNASSIGN_FIELD:
			return editSchema( state, ( schema ) => {
				const steps = stepsReducer( schema.steps, action );

				return steps === schema.steps ? schema : { ...schema, steps };
			} );

**The wrapper must preserve identity too.** `editSchema` compares the producer's
result against the schema it handed in, so returning `{ ...schema, steps: … }`
unconditionally defeats the check even when the slice reported no change — and a
no-op edit then marks the form dirty. Rewrap only when the slice actually
returned something new.
```

- [ ] **Step 5: Run the slice tests and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "steps.test"`
Expected: PASS — 11 tests.

- [ ] **Step 6: Write the failing panel tests**

`tests/js/admin/StepsPanel.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import StepsPanel from '../../../admin-src/panels/StepsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function Harness( { fields, steps, errorIndex } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( {
							id: 1,
							title: 'F',
							schema: {
								version: 1,
								settings: {},
								fields,
								steps,
								calculations: [],
								rules: [],
								notifications: [],
							},
						} )
					)
				}
			>
				load
			</button>
			{ schema && <StepsPanel errorIndex={ errorIndex } /> }
		</>
	);
}

async function renderPanel( { fields = {}, steps = [], errorIndex = indexErrors( [] ) } = {} ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness fields={ fields } steps={ steps } errorIndex={ errorIndex } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

const rooms = defaultField( 'number', 'rooms', 'Rooms' );
const notes = defaultField( 'text', 'notes', 'Notes' );

describe( 'StepsPanel', () => {
	it( 'says so when there are no steps', async () => {
		await renderPanel();

		expect( screen.getByText( 'No steps yet. Add one to hold your fields.' ) ).toBeInTheDocument();
	} );

	it( 'adds a step', async () => {
		const user = await renderPanel();

		await user.click( screen.getByRole( 'button', { name: 'Add step' } ) );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveValue( 'New step' );
	} );

	it( 'lists the fields on a step by label', async () => {
		await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		expect( screen.getByText( 'Rooms' ) ).toBeInTheDocument();
	} );

	it( 'lists unassigned fields under a heading that explains the consequence', async () => {
		await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		expect(
			screen.getByText( 'Not on any step — nobody can fill these in' )
		).toBeInTheDocument();
		expect( screen.getByText( 'Notes' ) ).toBeInTheDocument();
	} );

	it( 'assigns an unassigned field to a step', async () => {
		const user = await renderPanel( {
			fields: { rooms, notes },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		await user.selectOptions( screen.getByLabelText( 'Put Notes on' ), '0' );

		expect(
			screen.queryByText( 'Not on any step — nobody can fill these in' )
		).not.toBeInTheDocument();
	} );

	it( 'takes a field off a step', async () => {
		const user = await renderPanel( {
			fields: { rooms },
			steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Take Rooms off this step' } ) );

		expect(
			screen.getByText( 'Not on any step — nobody can fill these in' )
		).toBeInTheDocument();
	} );

	it( 'reorders steps', async () => {
		const user = await renderPanel( {
			steps: [
				{ key: 'a', title: 'First', description: '', fields: [] },
				{ key: 'b', title: 'Second', description: '', fields: [] },
			],
		} );

		await user.click( screen.getByRole( 'button', { name: 'Move Second up' } ) );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveValue( 'Second' );
	} );

	it( 'shows a server error against the step it belongs to', async () => {
		await renderPanel( {
			steps: [ { key: 'a', title: '', description: '', fields: [] } ],
			errorIndex: indexErrors( [
				{ path: 'steps.0.title', code: 'missing_field', message: 'A step needs a title.', context: {} },
			] ),
		} );

		expect( screen.getByLabelText( 'Step 1 title' ) ).toHaveAccessibleDescription(
			'A step needs a title.'
		);
	} );
} );
```

- [ ] **Step 7: Write the panel**

`admin-src/panels/StepsPanel.js`:

```js
import { __, sprintf } from '@wordpress/i18n';

import MoveButtons from '../components/MoveButtons';
import TextControl from '../components/TextControl';
import {
	addStep,
	assignField,
	moveStep,
	removeStep,
	unassignField,
	updateStep,
} from '../state/actions';
import { errorsFor } from '../state/errors';
import { useDispatch, useStore } from '../state/StoreContext';

export default function StepsPanel( { errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();

	if ( schema === null ) {
		return null;
	}

	const { steps, fields } = schema;
	const placed = new Set( steps.flatMap( ( step ) => step.fields ) );
	const unplaced = Object.keys( fields ).filter( ( key ) => ! placed.has( key ) );
	const nameOf = ( key ) => ( fields[ key ] ? fields[ key ].label || key : key );

	return (
		<section className="qform-panel" aria-labelledby="qform-steps-heading">
			<h2 id="qform-steps-heading">{ __( 'Steps', 'quoteform' ) }</h2>

			<button type="button" onClick={ () => dispatch( addStep() ) }>
				{ __( 'Add step', 'quoteform' ) }
			</button>

			{ steps.length === 0 && (
				<p>{ __( 'No steps yet. Add one to hold your fields.', 'quoteform' ) }</p>
			) }

			{ steps.map( ( step, index ) => {
				const number = index + 1;
				const at = ( key ) => errorsFor( errorIndex, `steps.${ index }.${ key }` );

				return (
					<div className="qform-step" key={ step.key || index }>
						<TextControl
							id={ `qform-step-${ index }-title` }
							label={ sprintf(
								/* translators: %d: step number. */
								__( 'Step %d title', 'quoteform' ),
								number
							) }
							value={ step.title }
							onChange={ ( value ) => dispatch( updateStep( index, { title: value } ) ) }
							errors={ at( 'title' ) }
						/>

						<TextControl
							id={ `qform-step-${ index }-description` }
							label={ sprintf(
								/* translators: %d: step number. */
								__( 'Step %d description', 'quoteform' ),
								number
							) }
							value={ step.description }
							onChange={ ( value ) => dispatch( updateStep( index, { description: value } ) ) }
							errors={ at( 'description' ) }
							multiline
						/>

						<MoveButtons
							label={ step.title || step.key }
							onMoveUp={ () => dispatch( moveStep( index, 'up' ) ) }
							onMoveDown={ () => dispatch( moveStep( index, 'down' ) ) }
							canMoveUp={ index > 0 }
							canMoveDown={ index < steps.length - 1 }
						/>

						<button
							type="button"
							onClick={ () => dispatch( removeStep( index ) ) }
							aria-label={ sprintf(
								/* translators: %s: step title. */
								__( 'Remove step %s', 'quoteform' ),
								step.title || step.key
							) }
						>
							{ __( 'Remove step', 'quoteform' ) }
						</button>

						<ul className="qform-step__fields">
							{ step.fields.map( ( key ) => (
								<li key={ key }>
									<span>{ nameOf( key ) }</span>
									<button
										type="button"
										onClick={ () => dispatch( unassignField( key ) ) }
										aria-label={ sprintf(
											/* translators: %s: field label. */
											__( 'Take %s off this step', 'quoteform' ),
											nameOf( key )
										) }
									>
										{ __( 'Take off', 'quoteform' ) }
									</button>
								</li>
							) ) }
						</ul>

						{ step.fields.length === 0 && (
							<p className="qform-warning">
								{ __( 'This step has no fields, so it cannot be saved.', 'quoteform' ) }
							</p>
						) }
					</div>
				);
			} ) }

			{ unplaced.length > 0 && (
				<div className="qform-unplaced">
					<h3>{ __( 'Not on any step — nobody can fill these in', 'quoteform' ) }</h3>
					<ul>
						{ unplaced.map( ( key ) => (
							<li key={ key }>
								<span>{ nameOf( key ) }</span>
								<label htmlFor={ `qform-place-${ key }` }>
									{ sprintf(
										/* translators: %s: field label. */
										__( 'Put %s on', 'quoteform' ),
										nameOf( key )
									) }
								</label>
								<select
									id={ `qform-place-${ key }` }
									value=""
									onChange={ ( event ) =>
										dispatch( assignField( key, Number( event.target.value ) ) )
									}
								>
									<option value="" disabled>
										{ __( 'Choose a step…', 'quoteform' ) }
									</option>
									{ steps.map( ( step, index ) => (
										<option key={ step.key || index } value={ index }>
											{ step.title || step.key }
										</option>
									) ) }
								</select>
							</li>
						) ) }
					</ul>
				</div>
			) }
		</section>
	);
}
```

The unassigned heading says *"nobody can fill these in"* rather than *"unassigned fields"*, because the consequence is the thing the user needs to know. The server will report it as `unknown_reference`, and a builder that only says "unassigned" leaves the user wondering whether that matters.

- [ ] **Step 8: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "StepsPanel"`
Expected: PASS — 8 tests.

- [ ] **Step 9: Prepare a commit message**

```
feat(admin): add the steps slice and the steps panel with field placement
```

Do not run `git commit`.

---

### Task 12: The calculations slice and the formula editor

The part of the builder that earns the plugin its niche. Each calculation has a key, a formula, a label and a visibility flag; the formula is checked against the real expression engine as the user types.

**Files:**
- Create: `admin-src/state/calculations.js`
- Modify: `admin-src/state/actions.js`
- Modify: `admin-src/state/reducer.js`
- Create: `admin-src/panels/FormulaEditor.js`
- Create: `admin-src/panels/CalculationsPanel.js`
- Test: `tests/js/admin/calculations.test.js`
- Test: `tests/js/admin/FormulaEditor.test.js`
- Test: `tests/js/admin/CalculationsPanel.test.js`

**Interfaces:**
- Consumes: `compileExpression`, `expressionVariables`, `orderCalculations`, `ExpressionError` from `frontend-src/engine`; `uniqueKey` (Task 8); `moveUp`/`moveDown` (Task 8); controls (Task 5); `errorsFor` (Task 4)
- Produces from `calculations.js`: `defaultCalculation( key ) → object`, `calculationsReducer( calculations, action ) → calculations`
- Produces action creators: `addCalculation()`, `updateCalculation( index, patch )`, `removeCalculation( index )`, `moveCalculation( index, direction )`
- Produces: `<FormulaEditor id value onChange knownVariables errors />` and `<CalculationsPanel errorIndex />`

**Four rules the server enforces, which the builder should make visible early:**
- A calculation keyed `total` is **required**. Its absence is `missing_total` at the document root, so the panel says so before a save rather than after.
- Keys must be unique and must not collide with a **field** key (`key_collision`).
- The expression is capped at **1000 UTF-16 code units** (`expression_too_long`). Count with `String.length`, which is exactly that unit.
- Calculations must not reference each other in a loop (`circular_reference`).

**On `position`, and why there is no conversion here.** When the *server* reports `invalid_expression`, `context.position` is a UTF-16 offset that PHP converted from its own byte offset specifically so a JavaScript caret lands correctly. When the *browser* engine throws, `error.position` is already a UTF-16 offset because that is what JavaScript string indices are. Both are directly usable as a string index. Do not convert either.

- [ ] **Step 1: Write the failing slice tests**

`tests/js/admin/calculations.test.js`:

```js
import { defaultCalculation, calculationsReducer } from '../../../admin-src/state/calculations';
import { KEY_PATTERN } from '../../../admin-src/lib/keys';
import {
	addCalculation,
	moveCalculation,
	removeCalculation,
	updateCalculation,
} from '../../../admin-src/state/actions';

const calculations = [
	{ key: 'subtotal', expression: '{rooms} * 50', label: 'Subtotal', visible: false },
	{ key: 'total', expression: '{subtotal}', label: 'Total', visible: true },
];

describe( 'defaultCalculation', () => {
	it( 'has exactly the four keys the server requires', () => {
		expect( Object.keys( defaultCalculation( 'x' ) ).sort() ).toEqual( [
			'expression',
			'key',
			'label',
			'visible',
		] );
	} );

	it( 'starts with a formula that compiles, not an empty one', () => {
		expect( defaultCalculation( 'x' ).expression ).toBe( '0' );
	} );
} );

describe( 'calculationsReducer', () => {
	it( 'appends with a unique key, at the end, leaving the rest untouched', () => {
		const next = calculationsReducer( calculations, addCalculation() );

		expect( next ).toHaveLength( 3 );
		expect( new Set( next.map( ( c ) => c.key ) ).size ).toBe( 3 );
		expect( next[ 0 ] ).toBe( calculations[ 0 ] );
		expect( next[ 1 ] ).toBe( calculations[ 1 ] );
		expect( next[ 2 ].key ).toMatch( KEY_PATTERN );
	} );

	it( 'patches one calculation', () => {
		const next = calculationsReducer( calculations, updateCalculation( 0, { label: 'Sub' } ) );

		expect( next[ 0 ].label ).toBe( 'Sub' );
		expect( next[ 1 ].label ).toBe( 'Total' );
	} );

	it( 'removes one', () => {
		expect( calculationsReducer( calculations, removeCalculation( 0 ) ) ).toHaveLength( 1 );
	} );

	it( 'ignores an index that is not there', () => {
		expect( calculationsReducer( calculations, removeCalculation( 9 ) ) ).toBe( calculations );
		expect( calculationsReducer( calculations, updateCalculation( 9, { label: 'x' } ) ) ).toBe(
			calculations
		);
	} );

	it( 'moves one', () => {
		expect( calculationsReducer( calculations, moveCalculation( 1, 'up' ) )[ 0 ].key ).toBe( 'total' );
	} );

	it( 'does nothing for a direction it does not recognise', () => {
		expect( calculationsReducer( calculations, moveCalculation( 1, 'sideways' ) ) ).toBe(
			calculations
		);
	} );

	it( 'returns the array it was given when a move hits the boundary', () => {
		expect( calculationsReducer( calculations, moveCalculation( 0, 'up' ) ) ).toBe( calculations );
		expect( calculationsReducer( calculations, moveCalculation( 1, 'down' ) ) ).toBe( calculations );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( calculations );

		calculationsReducer( calculations, updateCalculation( 0, { label: 'Changed' } ) );

		expect( JSON.stringify( calculations ) ).toBe( before );
	} );
} );
```

A new calculation starts at `0` rather than an empty string because an empty expression is `missing_field` to the server — a freshly added row would be invalid before it was touched.

- [ ] **Step 2: Add the action creators and the slice**

Append to `admin-src/state/actions.js`:

```js
export const ADD_CALCULATION = 'calculations/add';
export const UPDATE_CALCULATION = 'calculations/update';
export const REMOVE_CALCULATION = 'calculations/remove';
export const MOVE_CALCULATION = 'calculations/move';

export const addCalculation = () => ( { type: ADD_CALCULATION } );
export const updateCalculation = ( index, patch ) => ( { type: UPDATE_CALCULATION, index, patch } );
export const removeCalculation = ( index ) => ( { type: REMOVE_CALCULATION, index } );
export const moveCalculation = ( index, direction ) => ( { type: MOVE_CALCULATION, index, direction } );
```

`admin-src/state/calculations.js`:

```js
import { __ } from '@wordpress/i18n';

import { uniqueKey } from '../lib/keys';
import { moveDown, moveUp } from '../lib/reorder';
import {
	ADD_CALCULATION,
	MOVE_CALCULATION,
	REMOVE_CALCULATION,
	UPDATE_CALCULATION,
} from './actions';

export function defaultCalculation( key ) {
	return { key, expression: '0', label: __( 'New calculation', 'quoteform' ), visible: false };
}

export function calculationsReducer( calculations, action ) {
	switch ( action.type ) {
		case ADD_CALCULATION: {
			const key = uniqueKey( 'calculation', calculations.map( ( c ) => c.key ) );

			return [ ...calculations, defaultCalculation( key ) ];
		}

		case UPDATE_CALCULATION: {
			if ( ! calculations[ action.index ] ) {
				return calculations;
			}

			return calculations.map( ( calculation, index ) =>
				index === action.index ? { ...calculation, ...action.patch } : calculation
			);
		}

		case REMOVE_CALCULATION: {
			if ( ! calculations[ action.index ] ) {
				return calculations;
			}

			return calculations.filter( ( _, index ) => index !== action.index );
		}

		case MOVE_CALCULATION: {
			if ( action.direction === 'up' ) {
				return moveUp( calculations, action.index );
			}

			if ( action.direction === 'down' ) {
				return moveDown( calculations, action.index );
			}

			return calculations;
		}

		default:
			return calculations;
	}
}
```

Then delegate from `admin-src/state/reducer.js` exactly as the other slices do, with the four action types. **Preserve identity in the wrapper**: compute `const calculations = calculationsReducer( schema.calculations, action )` and return `calculations === schema.calculations ? schema : { ...schema, calculations }`. Rewrapping unconditionally defeats `editSchema`'s no-op check and marks the form dirty for an edit that did not happen.

- [ ] **Step 3: Run the slice tests and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "calculations.test"`
Expected: PASS — 10 tests.

The boundary and unknown-direction cases assert `toBe`, not equality of
contents. That is the point: `admin-src/state/reducer.js` marks the form dirty
whenever the slice hands back a different object, so a move that does nothing
must hand back *the same array*. `admin-src/lib/reorder.js` already returns its
input at the boundaries — these tests keep it that way, and they are what fails
if someone later "tidies" `MOVE_CALCULATION` into an unconditional rebuild.

- [ ] **Step 4: Write the failing formula editor tests**

`tests/js/admin/FormulaEditor.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FormulaEditor from '../../../admin-src/panels/FormulaEditor';

function setup( props = {} ) {
	const user = userEvent.setup();
	const onChange = jest.fn();

	render(
		<FormulaEditor
			id="formula"
			label="Formula"
			value=""
			onChange={ onChange }
			knownVariables={ [ 'rooms', 'urgency' ] }
			errors={ [] }
			{ ...props }
		/>
	);

	return { user, onChange };
}

describe( 'FormulaEditor', () => {
	it( 'reports what the user types', async () => {
		const { user, onChange } = setup();

		await user.type( screen.getByLabelText( 'Formula' ), '1' );

		expect( onChange ).toHaveBeenCalledWith( '1' );
	} );

	it( 'says a valid formula is fine', async () => {
		setup( { value: '{rooms} * 50' } );

		expect( await screen.findByText( 'This formula is valid.' ) ).toBeInTheDocument();
	} );

	it( 'reports the engine’s own code for a broken formula', async () => {
		setup( { value: '{rooms} * ' } );

		expect( await screen.findByText( /unexpected_token/ ) ).toBeInTheDocument();
	} );

	it( 'names a variable the form does not have', async () => {
		setup( { value: '{ghost} + 1' } );

		expect( await screen.findByText( /ghost/ ) ).toBeInTheDocument();
	} );

	it( 'accepts the .price suffix against a known field', async () => {
		setup( { value: '{urgency.price}' } );

		expect( await screen.findByText( 'This formula is valid.' ) ).toBeInTheDocument();
	} );

	it( 'warns when the formula is over the 1000-character cap', async () => {
		setup( { value: `1 + ${ '1 + '.repeat( 300 ) }1` } );

		expect( await screen.findByText( /too long/ ) ).toBeInTheDocument();
	} );

	it( 'shows a server error rather than its own verdict', async () => {
		setup( {
			value: '{rooms}',
			errors: [
				{
					path: 'calculations.0.expression',
					code: 'invalid_expression',
					message: 'The server rejected this formula.',
					context: { engine_code: 'unexpected_token', position: 3 },
				},
			],
		} );

		expect( screen.getByText( 'The server rejected this formula.' ) ).toBeInTheDocument();
	} );

	it( 'lists the variables the form offers', () => {
		setup();

		expect( screen.getByText( '{rooms}' ) ).toBeInTheDocument();
		expect( screen.getByText( '{urgency}' ) ).toBeInTheDocument();
	} );
} );
```

- [ ] **Step 5: Write the formula editor**

`admin-src/panels/FormulaEditor.js`:

```js
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { compileExpression, expressionVariables } from '../../frontend-src/engine';
import FieldError from '../components/FieldError';

const MAX_LENGTH = 1000;
const DEBOUNCE_MS = 150;

function inspect( source, knownVariables ) {
	if ( source.trim() === '' ) {
		return { status: 'empty', message: __( 'A calculation needs a formula.', 'quoteform' ) };
	}

	if ( source.length > MAX_LENGTH ) {
		return {
			status: 'error',
			message: sprintf(
				/* translators: 1: current length, 2: maximum length. */
				__( 'This formula is too long: %1$d characters, and the limit is %2$d.', 'quoteform' ),
				source.length,
				MAX_LENGTH
			),
		};
	}

	try {
		compileExpression( source );
	} catch ( error ) {
		return {
			status: 'error',
			message: sprintf(
				/* translators: 1: engine error code, 2: character position. */
				__( 'This formula is not valid (%1$s) at character %2$d.', 'quoteform' ),
				error.codeSlug,
				error.position
			),
		};
	}

	const unknown = expressionVariables( source ).filter(
		( name ) => ! knownVariables.includes( String( name ).split( '.' )[ 0 ] )
	);

	if ( unknown.length > 0 ) {
		return {
			status: 'error',
			message: sprintf(
				/* translators: %s: comma-separated variable names. */
				__( 'This formula uses something the form does not have: %s.', 'quoteform' ),
				unknown.join( ', ' )
			),
		};
	}

	return { status: 'ok', message: __( 'This formula is valid.', 'quoteform' ) };
}

export default function FormulaEditor( { id, label, value, onChange, knownVariables, errors = [] } ) {
	const [ verdict, setVerdict ] = useState( null );

	/**
	 * `knownVariables` valideyndə `.filter()` ilə qurulur, yəni HƏR render-də
	 * təzə massivdir. Onu birbaşa asılılıq kimi yazsaq, panelin istənilən
	 * yenidən render-i bütün sətirlərin debounce taymerini sıfırlayar. Massivin
	 * MƏZMUNU isə sabitdir — ona görə asılılıq məzmundan düzəlir.
	 */
	const variablesKey = knownVariables.join( '\u0000' );

	useEffect( () => {
		const timer = setTimeout( () => setVerdict( inspect( value, knownVariables ) ), DEBOUNCE_MS );

		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ value, variablesKey ] );

	const hasServerErrors = errors.length > 0;
	const errorId = `${ id }-error`;
	const verdictId = `${ id }-verdict`;

	return (
		<div className="qform-formula">
			<label htmlFor={ id }>{ label }</label>
			<textarea
				id={ id }
				className="qform-formula__input"
				value={ value }
				spellCheck="false"
				aria-invalid={ hasServerErrors ? 'true' : undefined }
				aria-describedby={ hasServerErrors ? errorId : verdictId }
				onChange={ ( event ) => onChange( event.target.value ) }
			/>

			<FieldError id={ errorId } errors={ errors } />

			{ ! hasServerErrors && verdict && (
				<p
					className={ `qform-formula__verdict is-${ verdict.status }` }
					id={ verdictId }
					role="status"
				>
					{ verdict.message }
				</p>
			) }

			<details className="qform-formula__help">
				<summary>{ __( 'What can I use here?', 'quoteform' ) }</summary>
				<p>
					{ __(
						'Numbers, + - * / and ( ), comparisons, and functions like round(), min(), max() and if().',
						'quoteform'
					) }
				</p>
				<ul>
					{ knownVariables.map( ( name ) => (
						<li key={ name }>{ `{${ name }}` }</li>
					) ) }
				</ul>
			</details>
		</div>
	);
}
```

Two deliberate choices. The server's verdict **replaces** the local one rather than sitting beside it: two opinions about the same formula, one stale, is worse than one. And `role="status"` rather than `role="alert"` — the verdict changes on every pause in typing, and an assertive announcement each time would make the editor unusable with a screen reader.

- [ ] **Step 6: Write the failing panel tests and the panel**

`tests/js/admin/CalculationsPanel.test.js`. The harness matches
`tests/js/admin/FieldsPanel.test.js`: render inside a `StoreProvider`, click a
button that dispatches `loadSucceeded`, then assert.

**Every row in this panel must be distinguishable from every other row**, and
these tests are what enforce it. Three of them use three calculations and act on
the **middle** one. That is deliberate: the recurring defect on this plan is a
suite that exercises one representative case, so a handler that ignores its index
and always acts on the first row passes. `moveCalculation( index, … )` mutated to
`moveCalculation( 0, … )` must turn one of these red.

```js
/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CalculationsPanel from '../../../admin-src/panels/CalculationsPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function schemaWith( { calculations, fields = {} } ) {
	return {
		version: 1,
		settings: {},
		fields,
		steps: [],
		calculations,
		rules: [],
		notifications: [],
	};
}

function Harness( { errorIndex = indexErrors( [] ), calculations, fields } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( { id: 1, title: 'F', schema: schemaWith( { calculations, fields } ) } )
					)
				}
			>
				load
			</button>
			{ schema && <CalculationsPanel errorIndex={ errorIndex } /> }
		</>
	);
}

async function setup( props ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness { ...props } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

const calc = ( key, expression, label ) => ( { key, expression, label, visible: false } );

const three = [
	calc( 'first', '1', 'First' ),
	calc( 'middle', '2', 'Middle' ),
	calc( 'total', '{first} + {middle}', 'Total' ),
];

describe( 'CalculationsPanel', () => {
	it( 'warns when there is no total, because the server will reject the save', async () => {
		await setup( { calculations: [] } );

		expect(
			screen.getByText( 'Every form needs a calculation named “total”.' )
		).toBeInTheDocument();
	} );

	it( 'stops warning once a total exists', async () => {
		await setup( { calculations: [ calc( 'total', '0', 'Total' ) ] } );

		expect(
			screen.queryByText( 'Every form needs a calculation named “total”.' )
		).not.toBeInTheDocument();
	} );

	it( 'adds a calculation at the end, leaving the others alone', async () => {
		const user = await setup( { calculations: [ calc( 'total', '0', 'Total' ) ] } );

		await user.click( screen.getByRole( 'button', { name: 'Add calculation' } ) );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'total' );
		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'calculation' );
	} );

	it( 'edits the calculation named in the control, not the first one', async () => {
		const user = await setup( { calculations: three } );

		await user.clear( screen.getByLabelText( 'Calculation 2 label' ) );
		await user.type( screen.getByLabelText( 'Calculation 2 label' ), 'Renamed' );

		expect( screen.getByLabelText( 'Calculation 1 label' ) ).toHaveValue( 'First' );
		expect( screen.getByLabelText( 'Calculation 2 label' ) ).toHaveValue( 'Renamed' );
		expect( screen.getByLabelText( 'Calculation 3 label' ) ).toHaveValue( 'Total' );
	} );

	it( 'moves the calculation named in the button, not the first one', async () => {
		const user = await setup( { calculations: three } );

		await user.click( screen.getByRole( 'button', { name: 'Move middle up' } ) );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'middle' );
		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'first' );
		expect( screen.getByLabelText( 'Calculation 3 key' ) ).toHaveValue( 'total' );
	} );

	it( 'removes the calculation named in the button, after confirming', async () => {
		const user = await setup( { calculations: three } );

		await user.click( screen.getByRole( 'button', { name: 'Remove calculation middle' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Yes, remove middle' } ) );

		expect( screen.getByLabelText( 'Calculation 1 key' ) ).toHaveValue( 'first' );
		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'total' );
		expect( screen.queryByLabelText( 'Calculation 3 key' ) ).not.toBeInTheDocument();
	} );

	it( 'keeps the calculation and restores focus when the removal is cancelled', async () => {
		const user = await setup( { calculations: three } );

		const remove = screen.getByRole( 'button', { name: 'Remove calculation middle' } );
		await user.click( remove );
		await user.click( screen.getByRole( 'button', { name: 'Keep middle' } ) );

		expect( screen.getByLabelText( 'Calculation 2 key' ) ).toHaveValue( 'middle' );
		expect( remove ).toHaveFocus();
	} );

	it( 'warns about a key that collides with a field key', async () => {
		await setup( {
			fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
			calculations: [ calc( 'rooms', '0', 'Rooms' ), calc( 'total', '0', 'Total' ) ],
		} );

		expect( screen.getByText( 'That key is already used by a field.' ) ).toBeInTheDocument();
	} );

	it( 'warns about a circular reference before the save', async () => {
		await setup( {
			calculations: [ calc( 'a', '{b}', 'A' ), calc( 'b', '{a}', 'B' ), calc( 'total', '0', 'T' ) ],
		} );

		expect(
			screen.getByText( 'These calculations reference each other in a loop.' )
		).toBeInTheDocument();
	} );

	it( 'puts a server error on the calculation it belongs to', async () => {
		await setup( {
			calculations: three,
			errorIndex: indexErrors( [
				{ path: 'calculations.1.expression', code: 'invalid_expression', message: 'Bad formula.' },
			] ),
		} );

		const second = screen.getByLabelText( 'Calculation 2 formula' );

		expect( second ).toHaveAttribute( 'aria-invalid', 'true' );
		expect( screen.getByText( 'Bad formula.' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Calculation 1 formula' ) ).not.toHaveAttribute( 'aria-invalid' );
	} );
} );
```

The last test is the one that proves errors are routed by path rather than
sprayed at every row — assert the **untouched sibling** too, not just the one
that should light up. A previous task on this plan reported a killed mutant on
the strength of a test that only checked the surviving sibling; this is the same
trap from the other side.

`admin-src/panels/CalculationsPanel.js`:

```js
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { orderCalculations } from '../../frontend-src/engine';
import MoveButtons from '../components/MoveButtons';
import Notice from '../components/Notice';
import TextControl from '../components/TextControl';
import ToggleControl from '../components/ToggleControl';
import {
	addCalculation,
	moveCalculation,
	removeCalculation,
	updateCalculation,
} from '../state/actions';
import { errorsFor } from '../state/errors';
import { useDispatch, useStore } from '../state/StoreContext';
import FormulaEditor from './FormulaEditor';

const REQUIRED_KEY = 'total';

function loopWarning( calculations ) {
	try {
		orderCalculations( calculations );

		return null;
	} catch ( error ) {
		if ( error.codeSlug === 'circular_reference' ) {
			return __( 'These calculations reference each other in a loop.', 'quoteform' );
		}

		return null;
	}
}

export default function CalculationsPanel( { errorIndex } ) {
	const { schema } = useStore();
	const dispatch = useDispatch();
	const [ confirming, setConfirming ] = useState( null );
	const addButtonRef = useRef( null );
	const confirmButtonRef = useRef( null );
	const removeButtonRefs = useRef( {} );

	useEffect( () => {
		if ( confirming !== null ) {
			confirmButtonRef.current?.focus();
		}
	}, [ confirming ] );

	if ( schema === null ) {
		return null;
	}

	const { calculations, fields } = schema;
	const fieldKeys = Object.keys( fields );
	const known = [ ...fieldKeys, ...calculations.map( ( c ) => c.key ) ];
	const hasTotal = calculations.some( ( c ) => c.key === REQUIRED_KEY );
	const loop = loopWarning( calculations );

	return (
		<section className="qform-panel" aria-labelledby="qform-calculations-heading">
			<h2 id="qform-calculations-heading">{ __( 'Calculations', 'quoteform' ) }</h2>

			{ ! hasTotal && (
				<Notice status="warning">
					{ __( 'Every form needs a calculation named “total”.', 'quoteform' ) }
				</Notice>
			) }

			{ loop && <Notice status="warning">{ loop }</Notice> }

			<button
				type="button"
				ref={ addButtonRef }
				onClick={ () => dispatch( addCalculation() ) }
			>
				{ __( 'Add calculation', 'quoteform' ) }
			</button>

			{ calculations.map( ( calculation, index ) => {
				const number = index + 1;
				const at = ( key ) => errorsFor( errorIndex, `calculations.${ index }.${ key }` );
				const collides = fieldKeys.includes( calculation.key );

				return (
					<div className="qform-calculation" key={ index }>
						<TextControl
							id={ `qform-calc-${ index }-key` }
							label={ sprintf(
								/* translators: %d: calculation number. */
								__( 'Calculation %d key', 'quoteform' ),
								number
							) }
							value={ calculation.key }
							onChange={ ( value ) => dispatch( updateCalculation( index, { key: value } ) ) }
							errors={ at( 'key' ) }
						/>

						{ collides && (
							<p className="qform-warning">
								{ __( 'That key is already used by a field.', 'quoteform' ) }
							</p>
						) }

						<TextControl
							id={ `qform-calc-${ index }-label` }
							label={ sprintf(
								/* translators: %d: calculation number. */
								__( 'Calculation %d label', 'quoteform' ),
								number
							) }
							value={ calculation.label }
							onChange={ ( value ) => dispatch( updateCalculation( index, { label: value } ) ) }
							errors={ at( 'label' ) }
						/>

						<FormulaEditor
							id={ `qform-calc-${ index }-expression` }
							label={ sprintf(
								/* translators: %d: calculation number. */
								__( 'Calculation %d formula', 'quoteform' ),
								number
							) }
							value={ calculation.expression }
							onChange={ ( value ) =>
								dispatch( updateCalculation( index, { expression: value } ) )
							}
							knownVariables={ known.filter( ( name ) => name !== calculation.key ) }
							errors={ at( 'expression' ) }
						/>

						<ToggleControl
							id={ `qform-calc-${ index }-visible` }
							label={ sprintf(
								/* translators: %d: calculation number. */
								__( 'Show calculation %d to the visitor', 'quoteform' ),
								number
							) }
							checked={ calculation.visible }
							onChange={ ( value ) => dispatch( updateCalculation( index, { visible: value } ) ) }
							errors={ at( 'visible' ) }
						/>

						<MoveButtons
							label={ calculation.key }
							onMoveUp={ () => dispatch( moveCalculation( index, 'up' ) ) }
							onMoveDown={ () => dispatch( moveCalculation( index, 'down' ) ) }
							canMoveUp={ index > 0 }
							canMoveDown={ index < calculations.length - 1 }
						/>

						<button
							type="button"
							ref={ ( node ) => {
								removeButtonRefs.current[ calculation.key ] = node;
							} }
							onClick={ () => setConfirming( calculation.key ) }
							aria-label={ sprintf(
								/* translators: %s: calculation key. */
								__( 'Remove calculation %s', 'quoteform' ),
								calculation.key
							) }
						>
							{ __( 'Remove', 'quoteform' ) }
						</button>

						{ confirming === calculation.key && (
							<span className="qform-confirm">
								<span>
									{ sprintf(
										/* translators: %s: calculation key. */
										__( 'Remove “%s”? Anything using it will stop working.', 'quoteform' ),
										calculation.key
									) }
								</span>
								<button
									type="button"
									ref={ confirmButtonRef }
									onClick={ () => {
										setConfirming( null );
										dispatch( removeCalculation( index ) );
										addButtonRef.current?.focus();
									} }
								>
									{ sprintf(
										/* translators: %s: calculation key. */
										__( 'Yes, remove %s', 'quoteform' ),
										calculation.key
									) }
								</button>
								<button
									type="button"
									onClick={ () => {
										setConfirming( null );
										removeButtonRefs.current[ calculation.key ]?.focus();
									} }
								>
									{ sprintf(
										/* translators: %s: calculation key. */
										__( 'Keep %s', 'quoteform' ),
										calculation.key
									) }
								</button>
							</span>
						) }
					</div>
				);
			} ) }
		</section>
	);
}
```

`knownVariables` excludes the calculation's own key, so the editor flags `{total}` inside `total` as unknown rather than waiting for the server to call it a circular reference. Same defect, caught a second earlier and explained in plainer words.

**Why every control in a row is numbered.** `Key`, `Label`, `Formula` and `Show
this to the visitor` would otherwise be the accessible name of four controls in
*every* row, so `getByLabelText( 'Key' )` throws the moment a form has two
calculations — and a screen-reader user hears four identical names with no way
to tell which calculation they belong to. The `id` being unique is not enough;
the *name* is what a user and a query both go by. `Calculation %d key` fixes
both at once. The Move and Remove buttons already avoid this because they carry
the calculation's key, which the validator guarantees is unique — unlike a step
title, which two steps may freely share.

**Why the row is keyed on the index, not on the calculation's key.** A step's
row may safely be keyed on `step.key` (`StepsPanel.js`) because that row edits
`title` and `description` and never the key. This row *does* edit the key, on
every keystroke — and changing a keyed child's key makes React unmount the old
subtree and mount a new one, destroying the focused `<input>` and dropping
`document.activeElement` to `<body>`. Renaming the default `calculation` key to
`total` would take one character per click. Calculations are an ordered array
with no stable identity in the document, so the index is the only thing that
does not change while the user is typing. Key on the value the row edits only
when the row does not edit it.

**Why removal confirms.** Deleting a calculation silently breaks every formula
and rule that references it, and a bare `onClick` that dispatches from a button
it then unmounts drops keyboard focus to `<body>`. This copies the flow already
in `admin-src/panels/FieldsPanel.js`: an inline confirmation naming what is at
stake, focus into the confirm button, focus back to the Remove button on cancel,
focus to Add on completion. It is not a `role="dialog"` and it never claims
`aria-modal` — modality this component does not enforce would be a lie to a
screen reader. **Ordering trap:** focusing an element that is still `disabled`
silently does nothing, so never focus a button in the same commit that enables
it.

**The `total` calculation can still be removed.** That is deliberate — blocking
it would strand anyone who wants to rename or rebuild it — but the panel's
warning banner reappears the moment it is gone, so the user learns before the
save rather than from a rejected one.

- [ ] **Step 7: Run everything for this task and watch it pass**

Run: `npx jest --selectProjects admin --testPathPattern "calculations|Calculations|Formula"`
Expected: PASS — 10 slice tests, 8 formula-editor tests, 10 panel tests.

- [ ] **Step 8: Prepare a commit message**

```
feat(admin): add calculations and the live-validating formula editor
```

Do not run `git commit`.

---

### Task 13: The rules slice and the rules panel

Conditional logic — the feature the paid competitors put behind a paywall. A rule targets a field or a step, applies one of four actions, and fires when all or any of its conditions hold.

**Files:**
- Create: `admin-src/state/rules.js`
- Modify: `admin-src/state/actions.js`
- Modify: `admin-src/state/reducer.js`
- Create: `admin-src/panels/RulesPanel.js`
- Modify: `admin-src/components/SelectControl.js` (one new optional prop — see Step 4)
- Test: `tests/js/admin/rules.test.js`
- Test: `tests/js/admin/RulesPanel.test.js`
- Test: `tests/js/admin/controls.test.js` (two cases for the new prop)

**Interfaces:**
- Consumes: controls (Task 5); `errorsFor` (Task 4); `moveUp`/`moveDown` (Task 8)
- Produces from `rules.js`: `ACTIONS`, `FIELD_ONLY_ACTIONS`, `OPERATORS`, `VALUELESS_OPERATORS`, `defaultRule() → object`, `defaultCondition() → object`, `rulesReducer( rules, action ) → rules`
- Produces action creators: `addRule()`, `updateRule( index, patch )`, `removeRule( index )`, `addCondition( ruleIndex )`, `updateCondition( ruleIndex, conditionIndex, patch )`, `removeCondition( ruleIndex, conditionIndex )`
- Produces: `<RulesPanel errorIndex />`

**The exact vocabulary, mirroring `RuleValidator`:**

```js
export const ACTIONS = [ 'show', 'hide', 'require', 'optional' ];
export const FIELD_ONLY_ACTIONS = [ 'require', 'optional' ];
export const OPERATORS = [
	'equals', 'not_equals', 'greater', 'greater_or_equal', 'less', 'less_or_equal',
	'contains', 'not_contains', 'is_empty', 'is_not_empty',
];
export const VALUELESS_OPERATORS = [ 'is_empty', 'is_not_empty' ];
```

**Three rules the server enforces that shape this UI:**
- `require` and `optional` make no sense on a **step** target — making a step "required" means nothing. Choosing a step target must therefore narrow the action list to `show` and `hide`, and a rule that already had `require` needs correcting rather than silently sending `invalid_option`.
- A condition needs a `value` **unless** its operator is `is_empty` or `is_not_empty`. So the value control disappears for those two — and, importantly, the key must be dropped from the condition object too, not merely hidden.
- A condition must not test the **same field the rule targets** — that is an obvious loop, reported as `circular_reference`. The server also catches the step-level version of this (a rule hiding a step whose own field the condition tests), which the builder cannot easily predict, so that one is left to the save.

- [ ] **Step 1: Write the failing slice tests**

`tests/js/admin/rules.test.js`:

```js
import {
	ACTION_LABELS,
	ACTIONS,
	defaultCondition,
	defaultRule,
	FIELD_ONLY_ACTIONS,
	OPERATOR_LABELS,
	OPERATORS,
	rulesReducer,
	VALUELESS_OPERATORS,
} from '../../../admin-src/state/rules';
import {
	addCondition,
	addRule,
	removeCondition,
	removeRule,
	updateCondition,
	updateRule,
} from '../../../admin-src/state/actions';

const rules = [
	{
		target: { kind: 'field', key: 'note' },
		action: 'show',
		match: 'all',
		conditions: [ { field: 'urgency', operator: 'equals', value: 'express' } ],
	},
];

describe( 'the vocabulary', () => {
	it( 'matches the server exactly', () => {
		expect( ACTIONS ).toEqual( [ 'show', 'hide', 'require', 'optional' ] );
		expect( FIELD_ONLY_ACTIONS ).toEqual( [ 'require', 'optional' ] );
		expect( OPERATORS ).toHaveLength( 10 );
		expect( OPERATORS[ 0 ] ).toBe( 'equals' );
		expect( VALUELESS_OPERATORS ).toEqual( [ 'is_empty', 'is_not_empty' ] );
	} );
} );

describe( 'defaults', () => {
	it( 'has a name for every operator and every action', () => {
		expect( Object.keys( OPERATOR_LABELS ) ).toEqual( OPERATORS );
		expect( Object.keys( ACTION_LABELS ) ).toEqual( ACTIONS );
	} );

	it( 'gives a rule exactly the four keys the server requires', () => {
		expect( Object.keys( defaultRule() ).sort() ).toEqual( [
			'action',
			'conditions',
			'match',
			'target',
		] );
	} );

	it( 'gives a rule one starter condition, because an empty list is invalid', () => {
		expect( defaultRule().conditions ).toHaveLength( 1 );
	} );

	it( 'gives a condition a value, because the default operator needs one', () => {
		expect( defaultCondition() ).toEqual( { field: '', operator: 'equals', value: '' } );
	} );
} );

describe( 'rulesReducer', () => {
	it( 'adds and removes rules', () => {
		expect( rulesReducer( rules, addRule() ) ).toHaveLength( 2 );
		expect( rulesReducer( rules, removeRule( 0 ) ) ).toHaveLength( 0 );
	} );

	it( 'patches a rule', () => {
		const next = rulesReducer( rules, updateRule( 0, { action: 'hide' } ) );

		expect( next[ 0 ].action ).toBe( 'hide' );
		expect( next[ 0 ].match ).toBe( 'all' );
	} );

	it( 'corrects a field-only action when the target becomes a step', () => {
		const withRequire = rulesReducer( rules, updateRule( 0, { action: 'require' } ) );
		const next = rulesReducer(
			withRequire,
			updateRule( 0, { target: { kind: 'step', key: 'step_two' } } )
		);

		expect( next[ 0 ].action ).toBe( 'show' );
	} );

	it( 'leaves a step-safe action alone when the target becomes a step', () => {
		const withHide = rulesReducer( rules, updateRule( 0, { action: 'hide' } ) );
		const next = rulesReducer(
			withHide,
			updateRule( 0, { target: { kind: 'step', key: 'step_two' } } )
		);

		expect( next[ 0 ].action ).toBe( 'hide' );
	} );

	it( 'adds and removes conditions', () => {
		expect( rulesReducer( rules, addCondition( 0 ) )[ 0 ].conditions ).toHaveLength( 2 );

		const two = rulesReducer( rules, addCondition( 0 ) );

		expect( rulesReducer( two, removeCondition( 0, 1 ) )[ 0 ].conditions ).toHaveLength( 1 );
	} );

	it( 'refuses to remove the last condition', () => {
		expect( rulesReducer( rules, removeCondition( 0, 0 ) ) ).toBe( rules );
	} );

	it( 'drops the value key when the operator stops needing one', () => {
		const next = rulesReducer( rules, updateCondition( 0, 0, { operator: 'is_empty' } ) );

		expect( 'value' in next[ 0 ].conditions[ 0 ] ).toBe( false );
	} );

	it( 'puts the value key back when the operator needs one again', () => {
		const empty = rulesReducer( rules, updateCondition( 0, 0, { operator: 'is_empty' } ) );
		const back = rulesReducer( empty, updateCondition( 0, 0, { operator: 'equals' } ) );

		expect( back[ 0 ].conditions[ 0 ].value ).toBe( '' );
	} );

	it( 'ignores indexes that are not there', () => {
		expect( rulesReducer( rules, updateRule( 9, { action: 'hide' } ) ) ).toBe( rules );
		expect( rulesReducer( rules, updateCondition( 9, 0, {} ) ) ).toBe( rules );
		expect( rulesReducer( rules, updateCondition( 0, 9, {} ) ) ).toBe( rules );
	} );

	it( 'does not mutate what it was given', () => {
		const before = JSON.stringify( rules );

		rulesReducer( rules, updateRule( 0, { action: 'hide' } ) );

		expect( JSON.stringify( rules ) ).toBe( before );
	} );
} );
```

The pair about the `value` key is the subtle one. Hiding the control while leaving `"value": ""` in the object is not the same thing as removing the key: `RuleValidator` accepts a valueless operator that carries a value today, but a schema that carries meaningless data is a schema whose meaning drifts. Dropping the key keeps the document saying exactly what it means.

- [ ] **Step 2: Add the action creators and the slice**

Append to `admin-src/state/actions.js`:

```js
export const ADD_RULE = 'rules/add';
export const UPDATE_RULE = 'rules/update';
export const REMOVE_RULE = 'rules/remove';
export const ADD_CONDITION = 'rules/addCondition';
export const UPDATE_CONDITION = 'rules/updateCondition';
export const REMOVE_CONDITION = 'rules/removeCondition';

export const addRule = () => ( { type: ADD_RULE } );
export const updateRule = ( index, patch ) => ( { type: UPDATE_RULE, index, patch } );
export const removeRule = ( index ) => ( { type: REMOVE_RULE, index } );
export const addCondition = ( ruleIndex ) => ( { type: ADD_CONDITION, ruleIndex } );
export const updateCondition = ( ruleIndex, conditionIndex, patch ) => ( {
	type: UPDATE_CONDITION,
	ruleIndex,
	conditionIndex,
	patch,
} );
export const removeCondition = ( ruleIndex, conditionIndex ) => ( {
	type: REMOVE_CONDITION,
	ruleIndex,
	conditionIndex,
} );
```

`admin-src/state/rules.js`:

```js
import {
	ADD_CONDITION,
	ADD_RULE,
	REMOVE_CONDITION,
	REMOVE_RULE,
	UPDATE_CONDITION,
	UPDATE_RULE,
} from './actions';

export const ACTIONS = [ 'show', 'hide', 'require', 'optional' ];
export const FIELD_ONLY_ACTIONS = [ 'require', 'optional' ];
export const OPERATORS = [
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
export const VALUELESS_OPERATORS = [ 'is_empty', 'is_not_empty' ];

export function defaultCondition() {
	return { field: '', operator: 'equals', value: '' };
}

export function defaultRule() {
	return {
		target: { kind: 'field', key: '' },
		action: 'show',
		match: 'all',
		conditions: [ defaultCondition() ],
	};
}

function applyRulePatch( rule, patch ) {
	const next = { ...rule, ...patch };

	// Addımı "məcburi" etmək mənasızdır — hədəf addıma çevriləndə
	// yalnız sahəyə aid əməl düzəldilir, sükutla `invalid_option`
	// gözləmək əvəzinə.
	if ( next.target.kind === 'step' && FIELD_ONLY_ACTIONS.includes( next.action ) ) {
		next.action = 'show';
	}

	return next;
}

function applyConditionPatch( condition, patch ) {
	const next = { ...condition, ...patch };

	if ( VALUELESS_OPERATORS.includes( next.operator ) ) {
		delete next.value;
	} else if ( ! ( 'value' in next ) ) {
		next.value = '';
	}

	return next;
}

export function rulesReducer( rules, action ) {
	switch ( action.type ) {
		case ADD_RULE:
			return [ ...rules, defaultRule() ];

		case REMOVE_RULE:
			return rules[ action.index ] ? rules.filter( ( _, i ) => i !== action.index ) : rules;

		case UPDATE_RULE:
			return rules[ action.index ]
				? rules.map( ( rule, i ) => ( i === action.index ? applyRulePatch( rule, action.patch ) : rule ) )
				: rules;

		case ADD_CONDITION:
			return rules[ action.ruleIndex ]
				? rules.map( ( rule, i ) =>
						i === action.ruleIndex
							? { ...rule, conditions: [ ...rule.conditions, defaultCondition() ] }
							: rule
				  )
				: rules;

		case REMOVE_CONDITION: {
			const rule = rules[ action.ruleIndex ];

			if ( ! rule || ! rule.conditions[ action.conditionIndex ] || rule.conditions.length === 1 ) {
				return rules;
			}

			return rules.map( ( item, i ) =>
				i === action.ruleIndex
					? { ...item, conditions: item.conditions.filter( ( _, j ) => j !== action.conditionIndex ) }
					: item
			);
		}

		case UPDATE_CONDITION: {
			const rule = rules[ action.ruleIndex ];

			if ( ! rule || ! rule.conditions[ action.conditionIndex ] ) {
				return rules;
			}

			return rules.map( ( item, i ) =>
				i === action.ruleIndex
					? {
							...item,
							conditions: item.conditions.map( ( condition, j ) =>
								j === action.conditionIndex
									? applyConditionPatch( condition, action.patch )
									: condition
							),
					  }
					: item
			);
		}

		default:
			return rules;
	}
}
```

Then delegate from `admin-src/state/reducer.js` with the six action types, **preserving identity in the wrapper**: compute `const rules = rulesReducer( schema.rules, action )` and return `rules === schema.rules ? schema : { ...schema, rules }`. Rewrapping unconditionally defeats `editSchema`'s no-op check and marks the form dirty for an edit that did not happen.

- [ ] **Step 3: Run the slice tests and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "rules.test"`
Expected: PASS — 15 tests.

- [ ] **Step 4: Write the failing panel tests and the panel**

**First, one change to a shared control.** `defaultRule()` starts with
`target.key: ''` and `defaultCondition()` with `field: ''` — nothing is chosen
yet, which is correct. But `admin-src/components/SelectControl.js` renders an
`Unrecognised value: %s` option for any value not among the options, so every
rule the builder itself just created greets the user with *"Unrecognised
value: "*. That message exists for a real case — a stored key whose field was
deleted — and "not chosen yet" is not that case.

Add one optional prop:

```js
export default function SelectControl( {
	id,
	label,
	value,
	onChange,
	options = [],
	errors,
	help = '',
	placeholder = '',
} ) {
```

and split the fallback option in two:

```js
				{ ! options.some( ( option ) => option.value === value ) &&
					( value === '' && placeholder ? (
						<option value="" disabled>
							{ placeholder }
						</option>
					) : (
						<option value={ value } disabled>
							{ sprintf(
								/* translators: %s: the stored value, which is not one of the options. */
								__( 'Unrecognised value: %s', 'quoteform' ),
								String( value )
							) }
						</option>
					) ) }
```

Two cases in `tests/js/admin/controls.test.js`: an empty value with a
`placeholder` shows the placeholder and not the unrecognised message; a
**non-empty** value that is not among the options still shows the unrecognised
message even when a `placeholder` is given. The second is what stops the fix
swallowing the corrupt-data warning it was never meant to touch.

`tests/js/admin/RulesPanel.test.js`. The harness matches
`tests/js/admin/FieldsPanel.test.js`.

**Every control is named by its rule number and, inside a rule, by its condition
number.** Without that, a form with two rules has two controls named `Action`
and `getByLabelText` throws — and a screen-reader user hears the same name
repeatedly with nothing to distinguish them. The tests below are written against
those names, so they are also what enforces them.

```js
/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RulesPanel from '../../../admin-src/panels/RulesPanel';
import { StoreProvider, useDispatch, useStore } from '../../../admin-src/state/StoreContext';
import { loadSucceeded } from '../../../admin-src/state/actions';
import { defaultField } from '../../../admin-src/state/fields';
import { indexErrors } from '../../../admin-src/state/errors';

function schemaWith( { rules, fields, steps } ) {
	return {
		version: 1,
		settings: {},
		fields,
		steps,
		calculations: [ { key: 'total', expression: '0', label: 'Total', visible: true } ],
		rules,
		notifications: [],
	};
}

const FIELDS = {
	rooms: defaultField( 'number', 'rooms', 'Rooms' ),
	urgency: defaultField( 'select', 'urgency', 'Urgency' ),
	note: defaultField( 'text', 'note', 'Note' ),
};

const STEPS = [
	{ key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] },
	{ key: 'step_two', title: 'Two', description: '', fields: [ 'urgency', 'note' ] },
];

const rule = ( key, action, conditions ) => ( {
	target: { kind: 'field', key },
	action,
	match: 'all',
	conditions,
} );

const condition = ( field, operator, value ) =>
	value === undefined ? { field, operator } : { field, operator, value };

function Harness( { errorIndex = indexErrors( [] ), rules, fields = FIELDS, steps = STEPS } ) {
	const dispatch = useDispatch();
	const { schema } = useStore();

	return (
		<>
			<button
				onClick={ () =>
					dispatch(
						loadSucceeded( { id: 1, title: 'F', schema: schemaWith( { rules, fields, steps } ) } )
					)
				}
			>
				load
			</button>
			{ schema && <RulesPanel errorIndex={ errorIndex } /> }
		</>
	);
}

async function setup( props ) {
	const user = userEvent.setup();

	render(
		<StoreProvider>
			<Harness { ...props } />
		</StoreProvider>
	);

	await user.click( screen.getByRole( 'button', { name: 'load' } ) );

	return user;
}

const three = [
	rule( 'note', 'show', [ condition( 'urgency', 'equals', 'express' ) ] ),
	rule( 'rooms', 'hide', [ condition( 'note', 'contains', 'urgent' ) ] ),
	rule( 'urgency', 'require', [ condition( 'rooms', 'greater', '3' ) ] ),
];

describe( 'RulesPanel', () => {
	it( 'says so when there are no rules', async () => {
		await setup( { rules: [] } );

		expect(
			screen.getByText( 'No rules yet. Add one to show or hide things conditionally.' )
		).toBeInTheDocument();
	} );

	it( 'adds a rule with one condition', async () => {
		const user = await setup( { rules: [] } );

		await user.click( screen.getByRole( 'button', { name: 'Add rule' } ) );

		expect( screen.getByLabelText( 'Rule 1 target' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Rule 1 condition 1 field' ) ).toBeInTheDocument();
		expect( screen.queryByLabelText( 'Rule 1 condition 2 field' ) ).not.toBeInTheDocument();
	} );

	it( 'shows a placeholder rather than “Unrecognised value” for a fresh rule', async () => {
		const user = await setup( { rules: [] } );

		await user.click( screen.getByRole( 'button', { name: 'Add rule' } ) );

		expect( screen.queryByText( /Unrecognised value/ ) ).not.toBeInTheDocument();
		expect( screen.getByText( 'Choose a field…' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Choose a field to test…' ) ).toBeInTheDocument();
	} );

	it( 'offers field keys when the target kind is field', async () => {
		await setup( { rules: [ three[ 0 ] ] } );

		const options = within( screen.getByLabelText( 'Rule 1 target' ) ).getAllByRole( 'option' );

		expect( options.map( ( option ) => option.value ) ).toEqual( [ 'rooms', 'urgency', 'note' ] );
	} );

	it( 'offers step keys when the target kind is step', async () => {
		const user = await setup( { rules: [ three[ 0 ] ] } );

		await user.selectOptions( screen.getByLabelText( 'Rule 1 target kind' ), 'step' );

		const options = within( screen.getByLabelText( 'Rule 1 target' ) ).getAllByRole( 'option' );

		expect( options.map( ( option ) => option.value ) ).toEqual(
			expect.arrayContaining( [ 'step_one', 'step_two' ] )
		);
		expect( options.map( ( option ) => option.value ) ).not.toContain( 'rooms' );
	} );

	it( 'narrows the action list for a step target', async () => {
		const user = await setup( { rules: [ three[ 0 ] ] } );

		await user.selectOptions( screen.getByLabelText( 'Rule 1 target kind' ), 'step' );

		const options = within( screen.getByLabelText( 'Rule 1 action' ) ).getAllByRole( 'option' );

		expect( options.map( ( option ) => option.value ) ).toEqual( [ 'show', 'hide' ] );
	} );

	it( 'corrects a field-only action when the target becomes a step', async () => {
		const user = await setup( { rules: [ three[ 2 ] ] } );

		expect( screen.getByLabelText( 'Rule 1 action' ) ).toHaveValue( 'require' );

		await user.selectOptions( screen.getByLabelText( 'Rule 1 target kind' ), 'step' );

		expect( screen.getByLabelText( 'Rule 1 action' ) ).toHaveValue( 'show' );
	} );

	it( 'reads its operators as English, not snake_case', async () => {
		await setup( { rules: [ three[ 1 ] ] } );

		const options = within(
			screen.getByLabelText( 'Rule 1 condition 1 operator' )
		).getAllByRole( 'option' );

		expect( options.map( ( option ) => option.textContent ) ).toEqual( [
			'is equal to',
			'is not equal to',
			'is greater than',
			'is greater than or equal to',
			'is less than',
			'is less than or equal to',
			'contains',
			'does not contain',
			'is empty',
			'is not empty',
		] );
	} );

	it( 'hides the value control for a valueless operator', async () => {
		const user = await setup( { rules: [ three[ 0 ] ] } );

		expect( screen.getByLabelText( 'Rule 1 condition 1 value' ) ).toBeInTheDocument();

		await user.selectOptions(
			screen.getByLabelText( 'Rule 1 condition 1 operator' ),
			'is_empty'
		);

		expect( screen.queryByLabelText( 'Rule 1 condition 1 value' ) ).not.toBeInTheDocument();
	} );

	it( 'edits the rule named in the control, not the first one', async () => {
		const user = await setup( { rules: three } );

		await user.selectOptions( screen.getByLabelText( 'Rule 2 action' ), 'show' );

		expect( screen.getByLabelText( 'Rule 1 action' ) ).toHaveValue( 'show' );
		expect( screen.getByLabelText( 'Rule 2 action' ) ).toHaveValue( 'show' );
		expect( screen.getByLabelText( 'Rule 3 action' ) ).toHaveValue( 'require' );
	} );

	it( 'edits the condition named in the control, not the first one', async () => {
		const user = await setup( {
			rules: [
				rule( 'note', 'show', [
					condition( 'urgency', 'equals', 'express' ),
					condition( 'rooms', 'greater', '3' ),
					condition( 'note', 'contains', 'x' ),
				] ),
			],
		} );

		await user.selectOptions(
			screen.getByLabelText( 'Rule 1 condition 2 operator' ),
			'less'
		);

		expect( screen.getByLabelText( 'Rule 1 condition 1 operator' ) ).toHaveValue( 'equals' );
		expect( screen.getByLabelText( 'Rule 1 condition 2 operator' ) ).toHaveValue( 'less' );
		expect( screen.getByLabelText( 'Rule 1 condition 3 operator' ) ).toHaveValue( 'contains' );
	} );

	it( 'removes the rule named in the button, after confirming', async () => {
		const user = await setup( { rules: three } );

		await user.click( screen.getByRole( 'button', { name: 'Remove rule 2' } ) );
		await user.click( screen.getByRole( 'button', { name: 'Yes, remove rule 2' } ) );

		expect( screen.getByLabelText( 'Rule 1 target' ) ).toHaveValue( 'note' );
		expect( screen.getByLabelText( 'Rule 2 target' ) ).toHaveValue( 'urgency' );
		expect( screen.queryByLabelText( 'Rule 3 target' ) ).not.toBeInTheDocument();
	} );

	it( 'warns when a condition tests the very field the rule targets', async () => {
		await setup( {
			rules: [ rule( 'rooms', 'show', [ condition( 'rooms', 'greater', '3' ) ] ) ],
		} );

		expect(
			screen.getByText( 'A rule cannot test the same field it changes.' )
		).toBeInTheDocument();
	} );

	it( 'does not warn when the tested field is a different one', async () => {
		await setup( { rules: [ three[ 0 ] ] } );

		expect(
			screen.queryByText( 'A rule cannot test the same field it changes.' )
		).not.toBeInTheDocument();
	} );

	it( 'puts a server error on the condition it belongs to', async () => {
		await setup( {
			rules: three,
			errorIndex: indexErrors( [
				{ path: 'rules.1.conditions.0.field', code: 'unknown_reference', message: 'No such field.' },
			] ),
		} );

		expect( screen.getByLabelText( 'Rule 2 condition 1 field' ) ).toHaveAttribute(
			'aria-invalid',
			'true'
		);
		expect( screen.getByText( 'No such field.' ) ).toBeInTheDocument();
		expect( screen.getByLabelText( 'Rule 1 condition 1 field' ) ).not.toHaveAttribute(
			'aria-invalid'
		);
	} );
} );
```

Those last two pairs are the ones that matter most. `edits the rule named in the
control` deliberately sets Rule 2's action to the value Rule 1 already has, so
the assertion cannot pass by accident if the handler writes to index 0 — Rule 3
is what proves the write landed where it was aimed. And the server-error test
asserts the **untouched** sibling as well as the one that should light up; a
previous task on this plan reported a killed mutant on the strength of a test
that only checked the survivor.

**The two label maps.** A select full of snake_case is a developer's UI, not a
site owner's. Put these in `admin-src/state/rules.js` beside the vocabularies
they describe, so the list of operators and the list of their names cannot drift
apart:

```js
export const ACTION_LABELS = {
	show: __( 'Show', 'quoteform' ),
	hide: __( 'Hide', 'quoteform' ),
	require: __( 'Make required', 'quoteform' ),
	optional: __( 'Make optional', 'quoteform' ),
};

export const OPERATOR_LABELS = {
	equals: __( 'is equal to', 'quoteform' ),
	not_equals: __( 'is not equal to', 'quoteform' ),
	greater: __( 'is greater than', 'quoteform' ),
	greater_or_equal: __( 'is greater than or equal to', 'quoteform' ),
	less: __( 'is less than', 'quoteform' ),
	less_or_equal: __( 'is less than or equal to', 'quoteform' ),
	contains: __( 'contains', 'quoteform' ),
	not_contains: __( 'does not contain', 'quoteform' ),
	is_empty: __( 'is empty', 'quoteform' ),
	is_not_empty: __( 'is not empty', 'quoteform' ),
};
```

Add a slice test asserting `Object.keys( OPERATOR_LABELS )` equals `OPERATORS`
and `Object.keys( ACTION_LABELS )` equals `ACTIONS`. That is the test that fails
the day someone adds an eleventh operator and forgets its name.

**The panel.** `admin-src/panels/RulesPanel.js` renders, for each rule: a
target-kind select (`field` / `step`), a target-key select populated from the
schema's field or step keys accordingly, an action select filtered by
`FIELD_ONLY_ACTIONS` when the kind is `step`, a match select (`all` / `any`),
and then each condition as a field select, an operator select, and a value text
box shown only when the operator is not valueless.

Build it to satisfy the tests above, and follow the conventions the sibling
panels have already set — read `admin-src/panels/FieldsPanel.js` before you
start:
- every control's label carries its rule number, and its condition number where
  it has one, exactly as the tests name them
- selects for a not-yet-chosen value pass `placeholder`. Give each one its own
  wording — `'Choose a field…'` for a field target, `'Choose a step…'` for a step
  target, `'Choose a field to test…'` for a condition's field. A rule renders a
  target select and a condition select at once, so sharing a string would make
  `getByText` ambiguous and would tell a screen-reader user the same thing twice
  about two different controls
- removing a rule or a condition goes through an inline confirmation with focus
  management — focus into the confirm button, back to the Remove button on
  cancel, to the Add button on completion. Not a `role="dialog"`, never
  `aria-modal`. **Ordering trap:** focusing a still-`disabled` element silently
  does nothing, so never focus a button in the same commit that enables it.
- **key rule rows and condition rows on their array index.** Keying a row on a
  value the row's own inputs edit makes React unmount and remount the subtree on
  every keystroke, destroying the focused element and dropping focus to `<body>`
  — that shipped as a Critical in Task 12 and was reverted there. Rules carry no
  stable identity in the document, so the index is the only thing that does not
  change while the user types. Key on a value only when the row does not edit it
- **Remove condition is hidden or disabled when a rule has only one condition** —
  the slice refuses that removal, and a control that silently does nothing is
  worse than no control

Each control takes its errors from `errorsFor( errorIndex, 'rules.<i>.…' )`, using the exact paths the server produces:

| What | Path |
|---|---|
| the rule as a whole | `rules.<i>` |
| the target object | `rules.<i>.target` |
| the target's kind or key | `rules.<i>.target.kind`, `rules.<i>.target.key` |
| the action | `rules.<i>.action` |
| the match mode | `rules.<i>.match` |
| the conditions list | `rules.<i>.conditions` |
| one condition | `rules.<i>.conditions.<j>` |
| its parts | `rules.<i>.conditions.<j>.field`, `.operator`, `.value` |

The self-reference warning is local only — comparing `rule.target.key` against each `condition.field` when `rule.target.kind === 'field'`. Keep it a warning, not a block (D4).

Operator and action labels must be translated rather than shown raw: `equals` reads as "is equal to", `is_not_empty` as "is not empty", `show` as "Show", and so on. A select full of snake_case is a developer's UI, not a site owner's.

- [ ] **Step 5: Run them and watch them pass**

Run: `npx jest --selectProjects admin --testPathPattern "rules|Rules|controls"`
Expected: PASS — 15 slice tests, 15 panel tests, and the two new `SelectControl`
cases inside the existing `controls.test.js` run.

- [ ] **Step 6: Prepare a commit message**

```
feat(admin): add conditional rules editing
```

Do not run `git commit`.

---

### Task 14: The editor screen — loading, saving and surfacing errors

Everything built so far becomes usable here. The screen loads a form, arranges the panels, saves the whole document, and turns whatever the server says into something the user can act on.

**Files:**
- Create: `admin-src/screens/EditorScreen.js`
- Modify: `admin-src/App.js`
- Test: `tests/js/admin/EditorScreen.test.js`
- Test: `tests/js/admin/App.test.js` (extend)

**Interfaces:**
- Consumes: everything from Tasks 2-13
- Produces: `<EditorScreen formId onClose />` and the updated `App`, which switches between the list and the editor

**The five outcomes of a save, and what the user should see for each:**

| Outcome | What the screen does |
|---|---|
| 200 | A "Saved" status message. Dirty clears. The server's copy replaces what was on screen — it is authoritative, and it may have normalised something. |
| 400 `qform_invalid_schema` | An error banner listing every error with its path, **and** each error routed to its own control through the error index. Nothing is lost and nothing is reset. |
| 500 `qform_update_failed` | An error banner saying the save did not land and the work is still here. Dirty **stays set** — because nothing was written. |
| 404 `qform_form_not_found` | The form has gone, probably trashed in another tab. Offer a way back to the list rather than a retry that cannot work. |
| 401/403 `rest_forbidden` | Say the session lost its permissions and offer a reload. A retry will not help. |

**Loading has one outcome that is not an error to recover from.** `qform_schema_corrupt` (500) means the stored meta is not an array. Per D8, the screen shows a plain explanation and a link back to the list, and **renders no editor at all** — because pressing Save on a default schema would overwrite a value that is still recoverable from the database.

**The unsaved-changes guard** uses `beforeunload` while `dirty` is set, and an in-app confirmation when the user clicks back to the list. Register it in an effect and remove it when `dirty` clears, so a saved form does not nag.

- [ ] **Step 1: Write the failing tests**

`tests/js/admin/EditorScreen.test.js`:

```js
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import EditorScreen from '../../../admin-src/screens/EditorScreen';
import { StoreProvider } from '../../../admin-src/state/StoreContext';
import { ApiError, getForm, updateForm } from '../../../admin-src/api/client';
import { defaultField } from '../../../admin-src/state/fields';

// `jest.mock()` tək başına MODULU BÜTÖV avtomock edir — `ApiError` də daxil
// olmaqla. Avtomock edilmiş sinif konstruktorda verilən vəziyyəti SÜKUTLA atır,
// ona görə `error.code` və `error.errors` `undefined` olur və koda görə
// budaqlanan hər test yalan nəticə verir. Fabrika ilə real sinfi saxlayıb
// yalnız funksiyaları stub edirik.
jest.mock( '../../../admin-src/api/client', () => {
	const actual = jest.requireActual( '../../../admin-src/api/client' );

	return {
		...actual,
		listForms: jest.fn(),
		getForm: jest.fn(),
		createForm: jest.fn(),
		updateForm: jest.fn(),
		deleteForm: jest.fn(),
	};
} );

const form = {
	id: 7,
	title: 'Cleaning quote',
	schema: {
		version: 1,
		settings: {
			currency: 'USD',
			currency_position: 'before',
			decimals: 2,
			submit_label: 'Get my quote',
			success_action: 'message',
			success_message: 'Thanks.',
			redirect_url: '',
			save_resume: false,
			store_ip: false,
		},
		fields: { rooms: defaultField( 'number', 'rooms', 'Rooms' ) },
		steps: [ { key: 'step_one', title: 'One', description: '', fields: [ 'rooms' ] } ],
		calculations: [ { key: 'total', expression: '{rooms} * 50', label: 'Total', visible: true } ],
		rules: [],
		notifications: [],
	},
};

function renderEditor( onClose = () => {} ) {
	render(
		<StoreProvider>
			<EditorScreen formId={ 7 } onClose={ onClose } />
		</StoreProvider>
	);

	return userEvent.setup();
}

beforeEach( () => {
	jest.clearAllMocks();
	getForm.mockResolvedValue( form );
} );

describe( 'loading', () => {
	it( 'shows the form once it arrives', async () => {
		renderEditor();

		expect( await screen.findByDisplayValue( 'Cleaning quote' ) ).toBeInTheDocument();
	} );

	it( 'refuses to open an editor for a corrupt schema', async () => {
		getForm.mockRejectedValue(
			new ApiError( {
				code: 'qform_schema_corrupt',
				status: 500,
				message: 'The stored schema could not be read.',
				errors: [],
			} )
		);

		renderEditor();

		expect(
			await screen.findByText(
				'This form’s saved data could not be read. Editing it here would overwrite what is still stored, so Quoteform will not open it.'
			)
		).toBeInTheDocument();
		expect( screen.queryByLabelText( 'Currency' ) ).not.toBeInTheDocument();
		expect( screen.queryByRole( 'button', { name: 'Save' } ) ).not.toBeInTheDocument();
	} );

	it( 'reports a form that is not there', async () => {
		getForm.mockRejectedValue(
			new ApiError( { code: 'qform_form_not_found', status: 404, message: 'Gone.', errors: [] } )
		);

		renderEditor();

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'That form no longer exists. It may have been moved to the trash.'
		);
	} );
} );

describe( 'saving', () => {
	it( 'sends the whole document and reports success', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );
		updateForm.mockResolvedValue( form );

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		await waitFor( () => expect( updateForm ).toHaveBeenCalledWith( 7, {
			title: 'Cleaning quote',
			schema: form.schema,
		} ) );

		expect( await screen.findByText( 'Saved.' ) ).toBeInTheDocument();
	} );

	it( 'routes each validation error to its own control and lists them all', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		updateForm.mockRejectedValue(
			new ApiError( {
				code: 'qform_invalid_schema',
				status: 400,
				message: 'The form could not be saved.',
				errors: [
					{
						path: 'settings.decimals',
						code: 'out_of_range',
						message: 'Between 0 and 6.',
						context: { min: 0, max: 6 },
					},
					{
						path: 'calculations.0.expression',
						code: 'invalid_expression',
						message: 'Broken formula.',
						context: { engine_code: 'unexpected_token', position: 3 },
					},
				],
			} )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'settings.decimals' );
		expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'calculations.0.expression' );

		// The banner lists every error; the control only shows its own, and
		// only on the tab it lives on — which is exactly why the banner exists.
		await user.click( screen.getByRole( 'button', { name: 'Settings' } ) );

		expect( screen.getByLabelText( 'Decimal places' ) ).toHaveAccessibleDescription(
			'Between 0 and 6.'
		);
	} );

	it( 'stays dirty when the write did not land', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );

		updateForm.mockRejectedValue(
			new ApiError( {
				code: 'qform_update_failed',
				status: 500,
				message: 'Could not save.',
				errors: [],
			} )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'The form was not saved. Your changes are still here — try again.'
		);
		expect( screen.getByText( 'Unsaved changes' ) ).toBeInTheDocument();
	} );

	it( 'offers a reload when the session lost its permissions', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		updateForm.mockRejectedValue(
			new ApiError( { code: 'rest_forbidden', status: 403, message: 'Sorry.', errors: [] } )
		);

		await user.click( screen.getByRole( 'button', { name: 'Save' } ) );

		expect( await screen.findByRole( 'alert' ) ).toHaveTextContent(
			'You are no longer allowed to manage forms. Reload the page and sign in again.'
		);
	} );
} );

describe( 'the unsaved-changes guard', () => {
	it( 'says nothing while the form is clean', async () => {
		const user = renderEditor();

		await screen.findByDisplayValue( 'Cleaning quote' );

		expect( screen.queryByText( 'Unsaved changes' ) ).not.toBeInTheDocument();

		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );

		expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument();
	} );

	it( 'asks before leaving with unsaved work', async () => {
		const onClose = jest.fn();
		const user = renderEditor( onClose );

		await screen.findByDisplayValue( 'Cleaning quote' );

		await user.clear( screen.getByLabelText( 'Form title' ) );
		await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );
		await user.click( screen.getByRole( 'button', { name: 'Back to all forms' } ) );

		expect( screen.getByRole( 'dialog' ) ).toBeInTheDocument();
		expect( onClose ).not.toHaveBeenCalled();

		await user.click( screen.getByRole( 'button', { name: 'Leave without saving' } ) );

		expect( onClose ).toHaveBeenCalled();
	} );
} );
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --selectProjects admin --testPathPattern EditorScreen`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the screen**

`admin-src/screens/EditorScreen.js`:

```js
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { getForm, updateForm } from '../api/client';
import Notice from '../components/Notice';
import TextControl from '../components/TextControl';
import CalculationsPanel from '../panels/CalculationsPanel';
import FieldEditor from '../panels/FieldEditor';
import FieldsPanel from '../panels/FieldsPanel';
import RulesPanel from '../panels/RulesPanel';
import SettingsPanel from '../panels/SettingsPanel';
import StepsPanel from '../panels/StepsPanel';
import {
	loadFailed,
	loadStarted,
	loadSucceeded,
	saveFailed,
	saveStarted,
	saveSucceeded,
	setTitle,
} from '../state/actions';
import { EMPTY_INDEX, indexErrors } from '../state/errors';
import { useDispatch, useStore } from '../state/StoreContext';

const TABS = [ 'fields', 'steps', 'calculations', 'rules', 'settings' ];

const TAB_LABELS = {
	fields: __( 'Fields', 'quoteform' ),
	steps: __( 'Steps', 'quoteform' ),
	calculations: __( 'Calculations', 'quoteform' ),
	rules: __( 'Rules', 'quoteform' ),
	settings: __( 'Settings', 'quoteform' ),
};

function saveMessage( error ) {
	if ( error.code === 'qform_update_failed' || error.code === 'qform_create_failed' ) {
		return __( 'The form was not saved. Your changes are still here — try again.', 'quoteform' );
	}

	if ( error.code === 'rest_forbidden' ) {
		return __(
			'You are no longer allowed to manage forms. Reload the page and sign in again.',
			'quoteform'
		);
	}

	if ( error.code === 'qform_form_not_found' ) {
		return __( 'That form no longer exists. It may have been moved to the trash.', 'quoteform' );
	}

	return error.message;
}

export default function EditorScreen( { formId, onClose } ) {
	const state = useStore();
	const dispatch = useDispatch();
	const [ tab, setTab ] = useState( TABS[ 0 ] );
	const [ selectedField, setSelectedField ] = useState( null );
	const [ saved, setSaved ] = useState( false );
	const [ leaving, setLeaving ] = useState( false );

	useEffect( () => {
		let cancelled = false;

		dispatch( loadStarted() );

		getForm( formId )
			.then( ( form ) => {
				if ( ! cancelled ) {
					dispatch( loadSucceeded( form ) );
				}
			} )
			.catch( ( error ) => {
				if ( ! cancelled ) {
					dispatch( loadFailed( error ) );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ formId, dispatch ] );

	useEffect( () => {
		if ( ! state.dirty ) {
			return undefined;
		}

		const warn = ( event ) => {
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener( 'beforeunload', warn );

		return () => window.removeEventListener( 'beforeunload', warn );
	}, [ state.dirty ] );

	const errorIndex = useMemo(
		() => ( state.saveError ? indexErrors( state.saveError.errors ) : EMPTY_INDEX ),
		[ state.saveError ]
	);

	async function handleSave() {
		setSaved( false );
		dispatch( saveStarted() );

		try {
			const form = await updateForm( formId, { title: state.title, schema: state.schema } );

			dispatch( saveSucceeded( form ) );
			setSaved( true );
		} catch ( error ) {
			dispatch( saveFailed( error ) );
		}
	}

	if ( state.loadError ) {
		const corrupt = state.loadError.code === 'qform_schema_corrupt';

		return (
			<div className="qform-editor">
				<Notice status="error">
					{ corrupt
						? __(
								'This form’s saved data could not be read. Editing it here would overwrite what is still stored, so Quoteform will not open it.',
								'quoteform'
						  )
						: saveMessage( state.loadError ) }
				</Notice>
				<button type="button" onClick={ onClose }>
					{ __( 'Back to all forms', 'quoteform' ) }
				</button>
			</div>
		);
	}

	if ( state.schema === null ) {
		return <p>{ __( 'Loading…', 'quoteform' ) }</p>;
	}

	return (
		<div className="qform-editor">
			<div className="qform-editor__header">
				<button
					type="button"
					onClick={ () => ( state.dirty ? setLeaving( true ) : onClose() ) }
				>
					{ __( 'Back to all forms', 'quoteform' ) }
				</button>

				<TextControl
					id="qform-form-title"
					label={ __( 'Form title', 'quoteform' ) }
					value={ state.title }
					onChange={ ( value ) => dispatch( setTitle( value ) ) }
				/>

				{ state.dirty && (
					<span className="qform-editor__dirty">{ __( 'Unsaved changes', 'quoteform' ) }</span>
				) }

				<button type="button" onClick={ handleSave } disabled={ state.saving }>
					{ __( 'Save', 'quoteform' ) }
				</button>
			</div>

			{ saved && ! state.dirty && (
				<Notice status="success" onDismiss={ () => setSaved( false ) }>
					{ __( 'Saved.', 'quoteform' ) }
				</Notice>
			) }

			{ state.saveError && (
				<Notice status="error" onDismiss={ () => setSaved( false ) }>
					<p>{ saveMessage( state.saveError ) }</p>
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

			<nav className="qform-editor__tabs" aria-label={ __( 'Builder sections', 'quoteform' ) }>
				{ TABS.map( ( name ) => (
					<button
						key={ name }
						type="button"
						onClick={ () => setTab( name ) }
						aria-current={ tab === name ? 'page' : undefined }
					>
						{ TAB_LABELS[ name ] }
					</button>
				) ) }
			</nav>

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

			{ leaving && (
				<div
					className="qform-confirm"
					role="dialog"
					aria-label={ __( 'Confirm', 'quoteform' ) }
					onKeyDown={ ( event ) => {
						if ( event.key === 'Escape' ) {
							cancelLeaving();
						}
					} }
				>
					<p>{ __( 'You have unsaved changes. Leave anyway?', 'quoteform' ) }</p>
					<button type="button" onClick={ onClose }>
						{ __( 'Leave without saving', 'quoteform' ) }
					</button>
					<button type="button" ref={ stayButtonRef } onClick={ cancelLeaving }>
						{ __( 'Stay here', 'quoteform' ) }
					</button>
				</div>
			) }
		</div>
	);
}
```

**No `aria-modal` here, and that is deliberate.** `aria-modal="true"` tells a
screen reader that everything outside the dialog is inert, and nothing in this
component makes it so — there is no focus trap and no `inert` on the rest of the
tree. Claiming modality you do not enforce leaves a screen-reader user tabbing
into content their software has told them is not there. Tasks 6 and 9 both
landed the same inline confirmation without `aria-modal`; this matches them.

What the confirmation does need is focus. When it opens, focus moves to **Stay
here** — the non-destructive choice, so a stray Enter does not discard the
user's work. Escape cancels. On cancel, focus returns to the button that opened
it. That is three refs' worth of wiring, identical in shape to
`admin-src/panels/FieldsPanel.js`:

```js
const backButtonRef = useRef( null );
const stayButtonRef = useRef( null );

useEffect( () => {
	if ( leaving ) {
		stayButtonRef.current?.focus();
	}
}, [ leaving ] );

const cancelLeaving = () => {
	setLeaving( false );
	backButtonRef.current?.focus();
};
```

Give the Back button `ref={ backButtonRef }`. Note the ordering trap Task 6 hit
for real: focusing an element that is still `disabled` silently does nothing, so
never focus a button in the same commit that enables it.

**The tabs are named, not keyed.** `TABS` holds the identifiers the component
switches on; `TAB_LABELS` holds what a person reads. Rendering the identifier
directly would put five untranslated lowercase words — `fields`, `steps`,
`calculations` — across the builder's main navigation, which breaks the
text-domain rule that binds every user-facing string in this plan and reads like
a developer's UI rather than a site owner's. The same reasoning applies to the
operator and action names in Task 13.

The error banner lists every error **with its path** as well as routing each to its control. That looks like duplication and is not: a validation error can land on a hidden tab, or on the `redirect_url` control the settings panel hides while the action is `message`. Without the list, those are invisible and the user is told the form will not save with no way to find out why.

`cancelled` in the load effect guards the case where the user opens one form, goes back, and opens another before the first request resolves. Without it the first response arrives late and replaces the second form.

**`onKeyChange`, and the rename that goes stale without it.** `selectedField`
is this screen's idea of which field the editor is open on, and it is a key — so
renaming that field invalidates it. `FieldEditor` survives on its own (Task 10
gave it an internal `activeKey` for exactly this reason), but nothing tells the
parent, so `selectedField` keeps pointing at a key that no longer exists.
`FieldsPanel` then highlights nothing while the editor below it plainly shows
the renamed field, and any later code that reads `schema.fields[ selectedField ]`
reads `undefined`.

The fix is one prop. Add an optional `onKeyChange` to `FieldEditor` and call it
at the single site where a rename is committed, with the new key, right after
the `renameField` dispatch:

```js
export default function FieldEditor( { fieldKey, errorIndex, onKeyChange } ) {
	// … at the commit site, after dispatch( renameField( activeKey, nextKey ) ):
	setActiveKey( nextKey );
	onKeyChange?.( nextKey );
```

The prop is optional so every existing `FieldEditor` test keeps rendering
without it. Do not remove `activeKey` now that the parent is kept in sync: it is
what makes the editor correct under a parent that forgets to pass the callback,
and deleting it would be Task 10 rework rather than Task 14 wiring.

Two tests are required for this, both in `tests/js/admin/EditorScreen.test.js`:

```js
it( 'follows a field through a rename instead of losing the selection', async () => {
	const user = renderEditor();

	await screen.findByDisplayValue( 'Cleaning quote' );
	await user.click( screen.getByRole( 'button', { name: 'Fields' } ) );

	await user.click( screen.getByRole( 'button', { name: 'Add field' } ) );
	await user.click( screen.getByRole( 'button', { name: 'New field' } ) );

	const keyInput = screen.getByLabelText( 'Key' );
	await user.clear( keyInput );
	await user.type( keyInput, 'remarks' );
	await user.tab();

	expect( screen.getByLabelText( 'Key' ) ).toHaveValue( 'remarks' );

	const current = screen
		.getAllByRole( 'button' )
		.filter( ( button ) => button.getAttribute( 'aria-current' ) === 'true' );

	expect( current ).toHaveLength( 1 );
	expect( current[ 0 ] ).toHaveTextContent( 'New field' );
} );

it( 'returns focus to Back when the leave confirmation is dismissed', async () => {
	const user = renderEditor();

	await screen.findByDisplayValue( 'Cleaning quote' );
	await user.clear( screen.getByLabelText( 'Form title' ) );
	await user.type( screen.getByLabelText( 'Form title' ), 'Renamed' );

	const back = screen.getByRole( 'button', { name: 'Back to all forms' } );
	await user.click( back );

	expect( screen.getByRole( 'button', { name: 'Stay here' } ) ).toHaveFocus();

	await user.keyboard( '{Escape}' );

	expect( screen.queryByRole( 'dialog' ) ).not.toBeInTheDocument();
	expect( back ).toHaveFocus();
} );
```

Note carefully what that first test asserts and what it does **not**. The row
button's accessible name is the field's **label**
(`admin-src/panels/FieldsPanel.js:80` — `const name = field.label || key;`), and
renaming a key never touches the label, so the button's name is identical before
and after. There is no `Edit remarks` button to find. What changes is
`aria-current`: `FieldsPanel` sets it from `selectedKey === key`
(`FieldsPanel.js:90`), so a `selectedField` gone stale makes the comparison
false for **every** row and the count of `aria-current="true"` buttons drops to
zero. Counting that is the assertion, and it is what fails without
`onKeyChange`.

The test renames a **freshly added** field rather than `rooms`, and that detail
is load-bearing. Task 10 locks the key input whenever the field is referenced by
a step, a calculation or a rule (`keyLocked` in `admin-src/panels/FieldEditor.js`,
computed from `fieldReferences`), and the fixture's `rooms` is named by both a
step and the `total` calculation — its key input is `disabled`, so there is
nothing to type into. A just-added field is referenced by nothing, which is both
the only renameable state and the realistic one: you fix the key right after
creating the field, before wiring it anywhere.

Before you write it, confirm the mutation: comment out the `onKeyChange` call in
`FieldEditor` and watch this test go red. If it stays green the test is checking
nothing — fix the test, not the mutation, and report both runs.

- [ ] **Step 4: Wire the App**

`admin-src/App.js` becomes:

```js
import { useState } from '@wordpress/element';

import EditorScreen from './screens/EditorScreen';
import FormListScreen from './screens/FormListScreen';
import { StoreProvider } from './state/StoreContext';

export default function App() {
	const [ editingId, setEditingId ] = useState( null );

	return (
		<div className="qform-builder">
			<StoreProvider>
				{ editingId === null ? (
					<FormListScreen onOpen={ setEditingId } />
				) : (
					<EditorScreen formId={ editingId } onClose={ () => setEditingId( null ) } />
				) }
			</StoreProvider>
		</div>
	);
}
```

Update `tests/js/admin/App.test.js`: the heading assertion from Task 1 now belongs to the list screen, so mock the client to resolve an empty list and assert the app shows the list, then that choosing a form shows the editor.

- [ ] **Step 5: Run everything and watch it pass**

Run: `npx jest --selectProjects admin`
Expected: PASS — every admin test.

Then: `make check`
Expected: all five suites green.

Then rebuild and look: `npm run build`, open `http://localhost:8083/wp-admin/admin.php?page=quoteform`, create a form, edit every panel, save, reload, and confirm what you saved came back.

- [ ] **Step 6: Prepare a commit message**

```
feat(admin): add the editor screen, save flow and error surfacing
```

Do not run `git commit`.

---

### Task 15: One end-to-end pass through a real browser

Every test so far runs against jsdom with a mocked REST client. This one drives a real Chromium against the real WordPress at `localhost:8083`, through the real REST API, into the real database — the only test in this plan that would catch a broken build, a missing script dependency, a capability that is not granted, or a nonce that never arrives.

Spec §19 names Playwright as the end-to-end tool and describes a scenario for the *rendered form*. That form does not exist until Plan 04, so this task covers the builder's own lifecycle instead. The renderer scenario stays where the spec puts it.

**Files:**
- Modify: `package.json`
- Create: `playwright.config.js`
- Create: `tests/e2e/builder.spec.js`
- Modify: `Makefile`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the built bundle from `npm run build`, and a running WordPress at `http://localhost:8083` with the plugin active

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test@^1.45
npx playwright install chromium
```

Add to `.gitignore`:

```
/test-results/
/playwright-report/
```

- [ ] **Step 2: Configure it**

`playwright.config.js`:

```js
module.exports = {
	testDir: './tests/e2e',
	timeout: 30000,
	retries: 0,
	use: {
		baseURL: 'http://localhost:8083',
		headless: true,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
};
```

No `webServer` block: the WordPress stack is long-running and managed by `make up`, not by the test runner. Starting it per run would be slower and would fight with a stack that is already up.

- [ ] **Step 3: Add the scripts and the make target**

In `package.json`:

```json
    "e2e": "playwright test",
```

In the `Makefile`:

```make
# Uçdan-uca testlər — WordPress stack-i qalxmış olmalıdır (`make up`) və
# bundle qurulmuş olmalıdır. Ona görə `check`-ə DAXİL EDİLMİR: brauzer
# yükləməsi tələb edir və digər dörd dəstdən xeyli yavaşdır.
e2e:
	npm run build
	npx playwright test
```

Leave `check` as it is. This target is run deliberately, not on every change.

- [ ] **Step 4: Write the failing end-to-end test**

`tests/e2e/builder.spec.js`:

```js
const { test, expect } = require( '@playwright/test' );

async function signIn( page ) {
	await page.goto( '/wp-login.php' );
	await page.fill( '#user_login', 'admin' );
	await page.fill( '#user_pass', 'admin' );
	await page.click( '#wp-submit' );
	await expect( page ).toHaveURL( /wp-admin/ );
}

test.describe( 'the builder', () => {
	test.beforeEach( async ( { page } ) => {
		await signIn( page );
		await page.goto( '/wp-admin/admin.php?page=quoteform' );
	} );

	test( 'creates, edits, saves and reloads a form', async ( { page } ) => {
		await page.getByRole( 'button', { name: 'Create a form' } ).click();

		const title = page.getByLabel( 'Form title' );

		await expect( title ).toBeVisible();
		await title.fill( 'End-to-end quote' );

		// A field.
		await page.getByRole( 'button', { name: 'Add field' } ).click();
		await page.getByRole( 'button', { name: 'New field' } ).click();
		await page.getByLabel( 'Label' ).fill( 'How many rooms?' );

		// Put it on a step.
		await page.getByRole( 'button', { name: 'Steps' } ).click();
		await page.getByRole( 'button', { name: 'Add step' } ).click();
		await page.getByLabel( 'Step 1 title' ).fill( 'Your property' );
		await page.getByLabel( /^Put How many rooms\? on$/ ).selectOption( '0' );

		// A total that uses it.
		await page.getByRole( 'button', { name: 'Calculations' } ).click();
		await page.getByRole( 'button', { name: 'Add calculation' } ).click();
		await page.getByLabel( 'Calculation 1 key' ).fill( 'total' );
		await page.getByLabel( 'Calculation 1 formula' ).fill( '{number} * 50' );
		await expect( page.getByText( 'This formula is valid.' ) ).toBeVisible();

		await page.getByRole( 'button', { name: 'Save' } ).click();
		await expect( page.getByText( 'Saved.' ) ).toBeVisible();

		// The real test: does it come back?
		await page.reload();
		await page.getByRole( 'button', { name: /^Edit “End-to-end quote”/ } ).click();

		await expect( page.getByLabel( 'Form title' ) ).toHaveValue( 'End-to-end quote' );
		await page.getByRole( 'button', { name: 'Calculations' } ).click();
		await expect( page.getByLabel( 'Calculation 1 formula' ) ).toHaveValue( '{number} * 50' );
	} );

	test( 'shows a server validation error against the control that caused it', async ( { page } ) => {
		await page.getByRole( 'button', { name: 'Create a form' } ).click();
		await expect( page.getByLabel( 'Form title' ) ).toBeVisible();

		await page.getByRole( 'button', { name: 'Settings' } ).click();
		await page.getByLabel( 'Decimal places' ).fill( '9' );
		await page.getByRole( 'button', { name: 'Save' } ).click();

		const decimals = page.getByLabel( 'Decimal places' );

		await expect( decimals ).toHaveAttribute( 'aria-invalid', 'true' );
		await expect( page.getByRole( 'alert' ) ).toContainText( 'settings.decimals' );
	} );

	test( 'refuses to save a broken formula, and says which one', async ( { page } ) => {
		await page.getByRole( 'button', { name: 'Create a form' } ).click();
		await expect( page.getByLabel( 'Form title' ) ).toBeVisible();

		await page.getByRole( 'button', { name: 'Calculations' } ).click();
		await page.getByLabel( 'Calculation 1 formula' ).fill( '{rooms} * ' );
		await page.getByRole( 'button', { name: 'Save' } ).click();

		await expect( page.getByRole( 'alert' ) ).toContainText( 'calculations.0.expression' );
	} );

	test( 'the whole builder is reachable with the keyboard alone', async ( { page } ) => {
		await page.keyboard.press( 'Tab' );

		const reached = [];

		for ( let i = 0; i < 40; i += 1 ) {
			const label = await page.evaluate( () => {
				const el = document.activeElement;

				if ( ! el || el === document.body ) {
					return null;
				}

				return el.getAttribute( 'aria-label' ) || el.textContent.trim().slice( 0, 40 );
			} );

			if ( label ) {
				reached.push( label );
			}

			await page.keyboard.press( 'Tab' );
		}

		expect( reached.some( ( label ) => label.includes( 'Create a form' ) ) ).toBe( true );
	} );
} );
```

That last test is thin, and deliberately so — it proves the builder's primary action is reachable without a mouse, which is the floor spec §16 sets. A full keyboard audit belongs with the rendered form in Plan 04, where the Lighthouse target of 100 applies.

- [ ] **Step 5: Run it**

Run: `make e2e`
Expected: 4 tests pass in Chromium.

If a selector does not match, **fix the selector, not the assertion** — the test is written against the accessible names the components were built with, and a mismatch means either the name changed or the component is not exposing one, which is itself worth knowing.

Some of these selectors were written before Tasks 10-13 existed and have already
been corrected once against the components as built: the calculations controls
are numbered (`Calculation 1 key`, `Calculation 1 formula`), and the form list's
edit button reads `Edit “<title>” (form <id>)`, which is why that one matches on
a prefix rather than the whole string. **Treat every remaining selector as
unverified.** Open the component, read the accessible name it actually renders,
and fix the selector to match before you conclude anything is broken. In
particular `Put %s on`, `Step 1 title`, `Decimal places`, `Save`, `Saved.` and
`Form title` come from five different tasks and none of them has been run
against a real browser yet.

- [ ] **Step 6: Prepare a commit message**

```
test(admin): add an end-to-end pass over the builder lifecycle
```

Do not run `git commit`.

---

## Self-review

Run against the spec with fresh eyes, after writing the plan.

**Spec coverage.** Every section of the spec that concerns the admin builder has a task:

| Spec section | Where it lands |
|---|---|
| §5.1 React 18 via `@wordpress/scripts` | Task 1 (D1: React is external, never bundled) |
| §5.3 `admin-src/` source layout | File structure; Task 1 creates it |
| §6.2 the schema's five blocks | Tasks 7 (settings), 9-10 (fields), 11 (steps), 12 (calculations), 13 (rules) |
| §6.2 the thirteen field types | Task 9's type table, Task 10's editor |
| §6.2 `total` is required | Task 12 warns before the save; the server enforces it |
| §7 the expression language | Task 12's formula editor, through the real engine |
| §8 rules, ten operators, four actions | Task 13 |
| §8 `require`/`optional` are field-only | Task 13's action narrowing |
| §10.1 the REST endpoints | Task 2 |
| §10.2 capabilities | Task 1's menu page; the API enforces it on every route |
| §14 error handling | Task 4 (index), Task 14 (the five save outcomes) |
| §16 keyboard and screen-reader access | Task 5's controls, D3's move buttons, Task 15's keyboard pass |
| §17 i18n through `wp.i18n` | every task; `wp_set_script_translations` in Task 1 |
| §18 admin assets only on plugin pages | Task 1, with a test that asserts they are absent elsewhere |
| §19 Playwright | Task 15 |

**Gaps I am recording rather than papering over:**

- **§16's "focus moves to the step heading"** and the `aria-live` total announcement describe the *rendered form*, not the builder. They belong to Plan 04.
- **§18's bundle-size targets** (< 25KB JS, < 10KB CSS gzipped) are frontend targets. The admin bundle has no stated budget, and this plan does not invent one. Worth measuring once Task 1 builds, so the number is at least known.
- **§17's `.pot` generation** is a build-pipeline concern that belongs with packaging, which is still unbuilt (see Plan 02's release notes). Task 1 calls `wp_set_script_translations`, which is the part that belongs here.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N".

This paragraph originally said something else. It argued that two tasks — Task
12's panel tests and Task 13's whole panel — could give their test *cases* as a
named list instead of source, because four earlier panels had established the
shape. That reasoning was wrong, and it was wrong in the specific way the
"No Placeholders" rule exists to prevent: **a placeholder hides whatever the
plan has not actually thought through.**

Both were filled in during execution, and both concealed a real defect:

- Task 12's panel gave all four controls in a row the same label (`Key`,
  `Label`, `Formula`, `Show this to the visitor`). With two calculations,
  `getByLabelText( 'Key' )` throws — the plan's own tests could not have been
  written as specified. Writing them is what surfaced it.
- Task 13 had no panel source at all, only prose. Writing its tests surfaced
  that every fresh rule would greet the user with *"Unrecognised value: "*,
  because `defaultRule()` starts with an empty target key and `SelectControl`
  treats "not chosen yet" as corrupt data.

Neither would have been caught by an implementer following the list, because
the list was the part that had not been thought through. Every test and every
production file in this plan is now complete source.

**Type and name consistency, checked against the real code:**

- Engine exports are `compileExpression`, `expressionVariables`, `evaluateExpression`, `orderCalculations`, `evaluateAllCalculations`, `ExpressionError` — **not** `compile`/`variables`. Verified against `frontend-src/engine/index.js`. An early draft of this plan had the short names; they are corrected throughout.
- `ExpressionError` carries `codeSlug`, `position`, `context` — verified against `frontend-src/engine/errors.js`.
- Field type table verified against `FieldValidator::TYPE_KEYS`; the common seven against `FieldValidator::COMMON_KEYS`; `LABEL_OPTIONAL` against the same file.
- Rule vocabulary verified against `RuleValidator`: `RULE_KEYS`, `ACTIONS`, `FIELD_ONLY_ACTIONS`, `OPERATORS` (ten), `VALUELESS_OPERATORS` (`is_empty`, `is_not_empty`).
- Key rules verified against `KeyRules`: pattern `^[a-z][a-z0-9_]{0,63}$`, reserved list of exactly `constructor` and `prototype`.
- Settings keys verified against `SettingsValidator::ALLOWED_KEYS` — all nine, no more.
- `QFORM_PATH` and `QFORM_URL` exist in `quoteform.php`; `Capabilities::MANAGE_FORMS` and `FormPostType::POST_TYPE` exist as used.
- The action type `ADD_FIELD` carries the field type as `fieldType`, never `type`, because `type` is the action discriminator. Consistent across Task 9's creator, slice and tests.

**One correction to the dependency map** given earlier in this document: it was drawn for fourteen tasks and the plan has fifteen. The real order is 1 → 2 → 3 → 4 → 5, then 6 and 8 in either order, then 7, 9, 11, 12, 13 in any order (each owns its own slice), with 10 after 9, 14 after all panels, and 15 last.

---

## Execution note

Plans 01 and 02 were executed with `superpowers:subagent-driven-development`, and several conventions from those runs apply here:

- **Zero commits.** Every task ends with a prepared commit message and no `git commit`. The author commits when they choose.
- **Tests are the specification.** Where a task's sample code and its own tests disagree, the tests win; fix the code, never the assertion, and record the divergence.
- **The client never overrules the server.** Every local warning in this plan is advisory. If a reviewer finds a place where the builder blocks a save the server would accept, that is a defect.
- **A green suite is weak evidence.** On Plan 02, four real defects including two Critical sat underneath a green 22-of-22, and wiring that could be deleted entirely kept the suite green until mutation testing caught it. Where a task adds a guard, check that deleting the guard makes a test fail.
