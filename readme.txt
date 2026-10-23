=== Quoteform ===
Contributors: miratnasrullayev
Tags: calculator, price calculator, quote form, conditional logic, multi-step form
Requires at least: 6.2
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Build multi-step quote and price calculator forms with conditional logic. Free, with no paid upgrade.

== Description ==

Quoteform is a form builder for one job: working out a price. A visitor picks a
configuration — three rooms, two bathrooms, express turnaround — and a quote
comes out of it. That is a different problem from a contact form, and Quoteform
is built for it rather than around it.

Conditional logic and multi-step forms are the two features that calculator
plugins usually keep behind a paid upgrade. Here they are simply part of the
plugin.

= The builder =

* **Fields** — number, slider, text, email, telephone, textarea, dropdown,
  radio, checkboxes, toggle, date, hidden and static HTML content.
* **Steps** — split a long form into steps, and order both the steps and the
  fields inside them.
* **Calculations** — named formulas such as `subtotal` and `total`. A
  calculation may refer to another one, and Quoteform works out the order for
  you.
* **Rules** — conditional logic. Show or hide a field or a whole step, or make a
  field required or optional, based on what has been answered. Conditions use
  equals, does not equal, greater than, greater than or equal, less than, less
  than or equal, contains, does not contain, is empty and is not empty.
* **Settings** — currency, currency position and the number of decimal places.

= Showing a form to visitors =

A saved form can be placed on the site in three ways, and all three draw exactly
the same form:

* **Shortcode** — `[quoteform id="12"]`, where `12` is the id shown in the form
  list. It works in posts, pages and any widget or template that runs
  shortcodes.
* **Block** — search the block inserter for **Quote form**, then pick the form
  from the dropdown in the block itself.
* **Elementor** — the **Quote form** widget, under General. It appears only when
  Elementor is installed.

On the page, the visitor moves through the steps with Back and Next. The total
updates as they answer, fields and steps appear and disappear as the rules say
they should, and a required field they can see has to be filled in before Next
will move them on. On the last step the total is broken down into the
calculations that make it up.

= What this version does not do =

Quoteform works out and shows a price. **It does not yet send or store
anything:** there is no submit step, no entry storage, no email notification and
no payment. That is the next release. If a form that only quotes is not enough
for you, this version will not be either.

= Formulas, without writing code =

Formulas are written in a small, deliberately limited expression language:

`{room_count} * 50 + {bathrooms} * 120`

`if({urgency} == "express", {subtotal} * 1.3, {subtotal})`

`round(max({subtotal}, 99), 2)`

The available functions are `if`, `min`, `max`, `sum`, `round`, `ceil`, `floor`,
`abs`, `contains` and `is_empty`. The formula editor checks each formula as you
type: it tells you where a formula is malformed, and when a formula refers to
something the form does not have it says so — and if the name is close to one
that does exist, it asks whether that is what you meant.

= Nothing is ever executed =

The expression language is not JavaScript and it is not PHP. Formulas are read
by Quoteform's own parser into a syntax tree and evaluated one node at a time.
PHP's `eval()` and JavaScript's `eval()` and `Function()` are not used anywhere
in this plugin. The JavaScript that ships is checked before every release for
every spelling of both — `eval()`, `Function()` and `new Function()` — so the
promise is kept by a machine rather than by memory.

Every form is validated again on the server when it is saved, no matter what the
browser sent. Circular references between calculations are refused at save time
rather than discovered later.

= Light on the front end =

The front-end script is under 10 KB gzipped and loads no framework: no React,
no jQuery, no web fonts, no CDN. It is enqueued only on pages that actually
contain a form.

= Free, and that is the whole plan =

No pro version, no add-ons, no license key, no account and no hosted service.
Quoteform sends no data anywhere: it makes no request to any external server,
loads no fonts or scripts from a CDN, and collects no usage statistics.

== Installation ==

1. Install the plugin from the Plugins screen in WordPress, or upload the
   `quoteform` folder to `wp-content/plugins/`.
2. Activate it on the Plugins screen.
3. Open **Quoteform** in the admin menu and create your first form.
4. Put the form on a page with the **Quote form** block, the `[quoteform id="…"]`
   shortcode or the Elementor widget.

Activating the plugin gives administrators the `qform_manage_forms` capability,
which is what the builder and its REST endpoints require. It is deliberately
separate from `manage_options`, so you can grant it to another role without
handing over the rest of the site settings.

== Frequently Asked Questions ==

= Is it really free? =

Yes. There is no paid version to upgrade to, no add-ons to buy, no license key
to enter and no account to create. Nothing in the plugin is locked.

= Can visitors submit the form? =

Not in this version. A form calculates and shows a price; nothing is sent or
stored. Submissions, entry storage and notifications are the next release.

= Do I need Elementor, Divi or a page builder? =

No. The builder is an ordinary WordPress admin screen, and the shortcode and the
block need nothing beyond WordPress itself. The Elementor widget is there for
sites that already use Elementor.

= My form is loaded by a popup or by AJAX and stays empty. What now? =

A form that arrives after the page has finished loading has to be started. Call
`window.quoteform.boot()` once the markup is in the page:

`window.quoteform.boot();`

Pass an element to limit it to that part of the page — `window.quoteform.boot(
document.querySelector( '#my-popup' ) )`. Calling it again is safe: a form that
is already running is left alone.

= Can a formula run arbitrary code? =

No. Formulas are written in Quoteform's own small expression language, which has
numbers, text, comparisons, arithmetic and ten named functions — and nothing
else. They are parsed into a syntax tree and evaluated by the plugin. `eval()` is
not used, in PHP or in JavaScript, anywhere in the plugin.

= What happens to my forms if I deactivate the plugin? =

Nothing is deleted. Forms are stored as WordPress posts, so they are still there
when you activate the plugin again. Deactivating does not remove the
capabilities it granted either, so a site that is temporarily switched off comes
back exactly as it was.

= And if I delete the plugin? =

Deleting is not the same as deactivating. **Deleting Quoteform permanently
deletes every form you have made**, including forms in the trash, and removes
`qform_manage_forms`, `qform_view_entries` and `qform_export_entries` from every
role on the site. On a multisite network it does this on every site of the
network, because the forms and the roles live on each site separately. Nothing
is recoverable afterwards, so export or copy anything you want to keep before
you click Delete.

= Who can create and edit forms? =

Anyone with the `qform_manage_forms` capability, which administrators get when
the plugin is activated. The same capability is required by the REST endpoints
under `quoteform/v1` that the builder uses, so there is no way around it.

= Which languages does it speak? =

The interface is written in English and is fully translatable — every string in
both the PHP and the JavaScript goes through WordPress's translation functions,
and a `.pot` file ships in `languages/`.

== Source code ==

The JavaScript and CSS in `build/` are compiled. Their human-readable source
lives in `admin-src/` and `frontend-src/` of the public repository:

https://github.com/muradNasrullayev/quoteform

To rebuild the assets from source:

1. `npm install`
2. `npm run build`

PHP dependencies are installed with `composer install --no-dev`.

== Changelog ==

= 0.1.1 =
* Fix: the entries table install no longer records its version when the table
  could not be created, so it is retried on the next load.
* Fix: the entries table definition is compatible with MySQL versions before
  8.0.13.
* Security: the CSV export reads only the parameters it needs and sanitizes
  each one.
* The uninstall routine runs only when WordPress itself uninstalls the plugin.

= 0.1.0 =
* First release.
* Form builder: fields, steps, calculations, conditional rules and form
  settings.
* Expression language for pricing formulas, validated as you type in the editor
  and again on the server when the form is saved. The formula editor suggests
  the name you probably meant when a reference is a near miss.
* Front-end renderer: multi-step navigation, conditional show and hide, a live
  total, a breakdown on the last step, and per-step validation of the fields the
  visitor can actually see. No React and no jQuery.
* Three ways to place a form: the `[quoteform id="…"]` shortcode, the **Quote
  form** block and an Elementor widget. All three render the same form.
* `window.quoteform.boot()` for forms that arrive after the page has loaded.
* REST API under `quoteform/v1` for the builder, gated by the
  `qform_manage_forms` capability.
