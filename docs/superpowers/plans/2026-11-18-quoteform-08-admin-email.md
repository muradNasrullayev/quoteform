# Admin Email Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the site owner an email with the answers, the price breakdown and the total each time a quote form saves an entry.

**Architecture:** The schema's existing `notifications` list gets one `admin` element. A new `NotificationValidator` gates it at save time. `SubmissionService` calls a new `AdminNotifier` after the entry is stored; the notifier builds an HTML email and calls `wp_mail()`, and records a failure in an option that the Entries screen shows. The builder gets a "Notifications" card in the Settings panel.

**Tech Stack:** PHP 7.4+ (WordPress 6.2+), PHPUnit 9.6, `wordpress-tests-lib` integration tests, React admin (`@wordpress/element`), Jest 29.

**Spec:** `docs/superpowers/specs/2026-11-18-quoteform-admin-email-design.md`

## Global Constraints

- PHP 7.4 is the hard minimum. Run unit tests on 8.2 AND 7.4 (`make test`, `make test74`).
- Integration tests: `make itest` (needs `make up` + `make isetup` once).
- Prefix `qform_` for options; CSS `.quoteform_`; text domain `quoteform`; namespace `Quoteform\`.
- New PHP files: one class per file, `declare(strict_types=1);`, PSR-4 under `includes/`.
- The expression engine (`includes/Engine/`, `frontend-src/engine/`) does not change. Parity fixtures do not change.
- Every visitor value in the email body goes through `esc_html()`; the entry link through `esc_url()`.
- No `\r` or `\n` reaches a mail header (subject, Reply-To, To).
- `SchemaFilter::forDisplay()` stays an allowlist; `notifications` never reaches the public page.
- **Commits:** the user's global rule forbids `git commit` without explicit permission. Every "Commit" step means: run `make check` (or the task's tests), show the staged diff summary and the proposed message, then STOP and ask. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A form saved before this release (`notifications: []`) — it must keep working, send no email and show the card switched off. Pinned in Task 3 (`testAFormWithNoNotificationsSendsNothing`) and Task 4 (Jest: empty list renders an unchecked toggle).
2. A schema written straight to post meta (WP-CLI, duplicate plugins) with a bad `to` or a subject containing `\n` — the notifier must not trust the validator. Pinned in Task 2 (`testInvalidStoredRecipientsFallBackToTheSiteEmail`, `testALineBreakInAStoredSubjectNeverReachesTheHeader`).
3. An answer such as `<script>` or `Smith & Sons` — escaped once, not twice. Pinned in Task 2 (`testAnswersAreEscapedInTheBody`).
4. A calculation error (`total` is `null`) — the email still goes, `{total}` becomes `—`. Pinned in Task 2 (`testANullTotalIsShownAsADash`).
5. `wp_mail()` returns false, or a `wp_mail` filter throws — visitor still gets 201, entry is stored, the option is written. Pinned in Task 3 (`testAMailFailureKeepsTheEntryAndRecordsIt`, `testAThrowingMailFilterDoesNotBreakTheSubmission`).

---

### Task 1: Validate the admin notification

**Files:**
- Create: `includes/Forms/NotificationValidator.php`
- Modify: `includes/Forms/SchemaValidator.php:88-90` (replace the list check with a call to the new validator)
- Modify: `includes/Forms/SchemaRepository.php:77` (default element)
- Modify: `tests/php/bootstrap.php` (stub `is_email`)
- Test: `tests/php/Forms/NotificationValidatorTest.php`, `tests/php/Forms/SchemaValidatorTest.php`

**Interfaces:**
- Produces: `NotificationValidator::validate( mixed $notifications ): ValidationResult` — paths are relative (`0.to`, `0.subject`); `SchemaValidator` merges them under `notifications`, so the builder sees `notifications.0.to`.
- Produces: `NotificationValidator::MAX_RECIPIENTS = 10`, `NotificationValidator::MAX_SUBJECT = 200`, `NotificationValidator::KEYS = [ 'type', 'enabled', 'to', 'subject' ]`.
- Produces: `NotificationValidator::recipients( string $to ): string[]` — public static; splits on `,`, trims, drops empty parts. Task 2 reuses it.
- Produces: default element in `SchemaRepository::defaults()`:
  `[ 'type' => 'admin', 'enabled' => true, 'to' => '', 'subject' => __( 'New quote: {form_name} — {total}', 'quoteform' ) ]`
  with a `/* translators: keep {form_name} and {total} exactly as written. */` comment.

- [ ] **Step 1: Stub `is_email` in `tests/php/bootstrap.php`**

Same `function_exists` guard style as `wp_parse_url`. Body: `return false !== filter_var( $email, FILTER_VALIDATE_EMAIL ) ? $email : false;`

- [ ] **Step 2: Write the failing tests** — `NotificationValidatorTest`, helper `codesAt( array $list ): array<string,string[]>` (path ⇒ codes). Valid base: `[ [ 'type' => 'admin', 'enabled' => true, 'to' => '', 'subject' => 'New quote' ] ]`.

| Test | Input change | Expected |
|---|---|---|
| `testAnEmptyListIsValid` | `[]` | no errors |
| `testTheDefaultElementIsValid` | base | no errors |
| `testANonListIsInvalid` | `[ 'a' => [] ]` and `'x'` | `'' => ['invalid_type']` |
| `testOnlyOneNotificationIsAllowed` | two copies of base | `'' => ['out_of_range']` |
| `testOnlyTheAdminTypeIsKnown` | `type => 'customer'` | `'0.type' => ['invalid_option']` |
| `testUnknownAndMissingKeysAreReported` | add `cc`, drop `subject` | `'0.cc' => ['unknown_key']`, `'0.subject' => ['missing_field']` |
| `testEnabledMustBeABoolean` | `enabled => 1` | `'0.enabled' => ['invalid_type']` |
| `testRecipientsAreCheckedOneByOne` | `to => 'a@b.co, nope'` | `'0.to' => ['invalid_option']` |
| `testElevenRecipientsAreTooMany` | 11 valid addresses joined by `,` | `'0.to' => ['out_of_range']` |
| `testSpacesAndTrailingCommasAreAllowed` | `to => ' a@b.co ,c@d.co,'` | no errors |
| `testTheSubjectIsRequired` | `subject => '  '` | `'0.subject' => ['missing_field']` |
| `testTheSubjectHasALimit` | 201 × `x` | `'0.subject' => ['out_of_range']` |
| `testTheSubjectCannotBreakALine` | `"Hi\r\nBcc: x@y.z"` and `"Hi\nThere"` | `'0.subject' => ['invalid_option']` |

In `SchemaValidatorTest` add `testANotificationErrorIsReportedUnderNotifications` — a valid schema with `to => 'nope'` reports path `notifications.0.to`. Also add `testTheDefaultSchemaIsValid` only if it does not exist yet (it is referenced by the `defaults()` docblock — check first).

- [ ] **Step 3: Run and see them fail** — `./bin/phpunit --filter 'NotificationValidatorTest|SchemaValidatorTest'` → errors "Class NotificationValidator not found".

- [ ] **Step 4: Implement `NotificationValidator`** — follow `SettingsValidator`'s order (structure checks first; early return only on a missing key). Subject length uses `mb_strlen`. Messages, all `__( …, 'quoteform' )`:
  - `Notifications must be a list.` · `Only one notification is supported.` · `Unknown notification type.` · `Unknown setting.` · `This setting is required.` · `This setting must be true or false.` · `Enter valid email addresses, separated by commas.` · `Enter at most 10 email addresses.` · `Enter a subject.` · `The subject can have at most 200 characters.` · `The subject must be on one line.`

  Then wire it in `SchemaValidator` with `$result->merge( ( new NotificationValidator() )->validate( $schema['notifications'] ), 'notifications' );` and update the `defaults()` element.

- [ ] **Step 5: Run the tests** — `./bin/phpunit` and `QF_PHP=php:7.4-cli ./bin/phpunit` → all green. Remember the PHPUnit message bug (CLAUDE.md): on a failure, find the cause with `docker run … php -r`.

- [ ] **Step 6: Commit (ask first)** — `Validate the admin notification in the form schema`

---

### Task 2: Build and send the admin email

**Files:**
- Create: `includes/Notifications/AdminNotifier.php`
- Test: `tests/integration/AdminNotifierTest.php`

**Interfaces:**
- Consumes: `NotificationValidator::recipients()`, `NotificationValidator::MAX_RECIPIENTS` (Task 1); `MoneyFormatter::format( $amount, array $settings, string $thousands, string $point ): string`.
- Produces:
  ```php
  final class AdminNotifier {
      public const FAILURE_OPTION = 'qform_mail_failure';
      /**
       * @param array<string,mixed>                                         $schema   the form's stored schema
       * @param array<string,array<string,mixed>>                           $snapshot SubmissionService::snapshot() output
       * @param array<int,array{key:string,label:string,amount:?float}>     $lines    Evaluation breakdown
       */
      public function notify( int $entryId, string $formName, array $schema, array $snapshot, ?float $total, array $lines ): void;
  }
  ```
  `FAILURE_OPTION` value: `[ 'entry_id' => int, 'time' => int ]` (GMT timestamp), saved with `update_option( …, …, false )`.

Behaviour, in order:
1. First element of `$schema['notifications']` (if any) that is an array with `type === 'admin'`. None, or `enabled !== true` → return.
2. Recipients: `recipients( (string) to )`, keep only those `is_email()` accepts, cap at `MAX_RECIPIENTS`. Empty → `[ get_option( 'admin_email' ) ]`.
3. Subject: replace `{form_name}`, `{total}` (money string, or `—` when `$total` is null), `{entry_id}`; then `str_replace( [ "\r", "\n" ], ' ', … )`. Empty after trim → `New quote: {form_name}` with the same replacements.
4. Body: HTML, inline styles only. Heading = form name; a two-column table of answers (`label` ⇒ `display` when present, else `value`; arrays joined with `, `; booleans as `Yes`/`No`; `hidden` fields included); breakdown lines (only lines with a non-null amount); bold total row; a link `admin_url( 'admin.php?page=quoteform-entries&entry=' . $entryId )` labelled `View this entry`.
5. Headers: `Content-Type: text/html; charset=UTF-8`, plus `Reply-To: <addr>` for the first snapshot field with `type === 'email'` whose value passes `is_email()`.
6. `wp_mail()` inside `try { } catch ( \Throwable $e )`. False or throw → write `FAILURE_OPTION`. True → `delete_option( FAILURE_OPTION )`.

Money format uses `$wp_locale->number_format` exactly like `SubmissionService::money()` — extract nothing; duplicate the four lines (two call sites do not justify a shared helper yet).

- [ ] **Step 1: Write the failing tests** — capture mail with `add_filter( 'pre_wp_mail', fn( $null, $atts ) => ( $this->sent[] = $atts ) && true, 10, 2 )`. Helper `notify( array $notification, array $snapshot = DEFAULT, ?float $total = 120.0 )`.

| Test | Assert |
|---|---|
| `testADisabledNotificationSendsNothing` | `$this->sent === []` |
| `testAFormWithoutAnAdminNotificationSendsNothing` | `notifications => []` → nothing sent |
| `testAnEmptyRecipientGoesToTheSiteEmail` | `to === [ get_option('admin_email') ]` (as array or string — normalise) |
| `testSeveralRecipientsAreSplit` | `'a@b.co, c@d.co'` → both |
| `testInvalidStoredRecipientsFallBackToTheSiteEmail` | `'nope, also-nope'` → site email |
| `testTheSubjectPlaceholdersAreReplaced` | `'{form_name} #{entry_id}: {total}'` → `'Quote #41: $120.00'` |
| `testALineBreakInAStoredSubjectNeverReachesTheHeader` | subject and `formName` with `"\r\n"` → no `\r`/`\n` in `subject` |
| `testANullTotalIsShownAsADash` | total null → subject contains `—`, mail still sent |
| `testAnswersAreEscapedInTheBody` | value `<script>x</script>` → body has `&lt;script&gt;`, not `<script>`; `Smith & Sons` → `Smith &amp; Sons` (not `&amp;amp;`) |
| `testChoiceLabelsAreShownNotValues` | radio `display => 'Deep'`, `value => 'deep'` → body has `Deep` |
| `testTheBodyLinksToTheEntry` | body contains `page=quoteform-entries&#038;entry=41` or `&amp;entry=41` |
| `testReplyToIsTheVisitorEmail` | snapshot email `v@x.co` → headers contain `Reply-To: v@x.co` |
| `testAnInvalidVisitorEmailIsNotAReplyTo` | `"v@x.co\r\nBcc: z@z.z"` → no `Reply-To` header |
| `testAFailedSendIsRecorded` | `pre_wp_mail` returns false → option `[ 'entry_id' => 41, 'time' => int ]` |
| `testASuccessfulSendClearsAnOldFailure` | option set before; send ok → option gone |

- [ ] **Step 2: Run and see them fail** — `make itest ARGS="--filter AdminNotifierTest"` → class not found.
- [ ] **Step 3: Implement `AdminNotifier`** as described above. Strings: `Yes`, `No`, `Total`, `View this entry`, `New quote: {form_name}` — all translatable.
- [ ] **Step 4: Run** — `make itest ARGS="--filter AdminNotifierTest"` → green; `make test test74` → green.
- [ ] **Step 5: Commit (ask first)** — `Build and send the admin notification email`

---

### Task 3: Send the email after a submission

**Files:**
- Modify: `includes/Submissions/SubmissionService.php` (constructor + after `$saved` check)
- Test: `tests/integration/SubmissionServiceTest.php`, `tests/php/Rendering/SchemaFilterTest.php`

**Interfaces:**
- Consumes: `AdminNotifier::notify()` (Task 2).
- Produces: `SubmissionService::__construct( ?SchemaRepository, ?EntryRepository, ?SpamGuard, ?InputSanitizer, ?AdminNotifier $notifier = null )` — new LAST parameter, so existing call sites keep working.

`submit()` calls `notify( $saved, $formName, $schema, $snapshot, $total, $evaluation['breakdown'] )` after the `0 === $saved` check and before the success return. Build the snapshot once and pass the same array to `insert()` and `notify()`. `$formName` = `get_post_field( 'post_title', $formId, 'raw' )`.

- [ ] **Step 1: Write the failing tests** (in `SubmissionServiceTest`, reuse the `pre_wp_mail` capture; `schema()` gets an optional `$notifications` argument)
  - `testAGoodSubmissionEmailsTheSiteOwner` — enabled notification → one mail; subject contains `$80.00` for `rooms=2, service=standard`.
  - `testAFormWithNoNotificationsSendsNothing` — `notifications => []` → none.
  - `testSpamSendsNothing` — honeypot filled → none.
  - `testInvalidAnswersSendNothing` — 422 path → none.
  - `testAMailFailureKeepsTheEntryAndRecordsIt` — `pre_wp_mail` returns false → status 201, one row in the table, option set.
  - `testAThrowingMailFilterDoesNotBreakTheSubmission` — `pre_wp_mail` throws `RuntimeException` → status 201, row stored, option set.

  In `SchemaFilterTest`: `testNotificationsNeverReachThePage` — input with a notification whose `to` is `secret@x.co` → output has no `notifications` key and `json_encode` of the output does not contain `secret@x.co`.
- [ ] **Step 2: Run and see them fail** — `make itest ARGS="--filter SubmissionServiceTest"` → mails missing.
- [ ] **Step 3: Wire `AdminNotifier` into `SubmissionService`.**
- [ ] **Step 4: Run** — `make itest`, `make test`, `make test74` → green.
- [ ] **Step 5: Commit (ask first)** — `Email the site owner when a quote is submitted`

---

### Task 4: Notifications card in the builder

**Files:**
- Modify: `admin-src/state/actions.js`, `admin-src/state/reducer.js`
- Create: `admin-src/panels/NotificationsCard.js`
- Modify: `admin-src/panels/SettingsPanel.js` (render the card after "After submitting")
- Test: `tests/js/admin/reducer.test.js`, `tests/js/admin/NotificationsCard.test.js`

**Interfaces:**
- Produces: `SET_NOTIFICATION = 'notifications/set'`, `setNotification( key, value )`.
- Reducer: edits `schema.notifications[0]` through `editSchema`. When the list is empty, it first creates `{ type: 'admin', enabled: false, to: '', subject: __( 'New quote: {form_name} — {total}', 'quoteform' ) }`, then applies the change. Same-value change returns the same schema (no dirty flag), like `SET_SETTING`.
- `NotificationsCard( { errorIndex } )` — reads `schema.notifications[0]`; treats a missing element as `enabled: false`.

UI (exact copy):
- Heading `Notifications`.
- `ToggleControl` id `quoteform_notify-enabled`, label `Email me when someone submits this form`.
- When enabled: `TextControl` id `quoteform_notify-to`, label `Send to`, help `Separate addresses with commas. Leave empty to use the site's admin email address.`; `TextControl` id `quoteform_notify-subject`, label `Subject`, help `You can use {form_name}, {total} and {entry_id}.`
- Errors: `errorsFor( errorIndex, 'notifications.0.to' )` and `…'.subject'`, plus `notifications` (shown under the heading).

Deviation from the spec sketch: the help text does not print the site email, because the builder has no server config channel today. Adding one for a hint is not worth it.

- [ ] **Step 1: Write the failing tests**
  - reducer: `setNotification('enabled', true)` on `notifications: []` → `[ { type:'admin', enabled:true, to:'', subject: <default> } ]`, `dirty: true`; on an existing element → only that key changes; same value → state unchanged.
  - card: empty list → toggle unchecked, no `Send to` field; checking the toggle dispatches and shows both fields; an `errorIndex` with `notifications.0.to` shows its message next to `Send to`.
- [ ] **Step 2: Run** — `npm test -- NotificationsCard reducer` → fail.
- [ ] **Step 3: Implement** the action, reducer case and card; render it in `SettingsPanel`.
- [ ] **Step 4: Run** — `npm test` → green; `npm run build` → no errors.
- [ ] **Step 5: Commit (ask first)** — `Add a Notifications card to the form settings`

---

### Task 5: Show a failed email on the Entries screen

**Files:**
- Modify: `includes/Admin/EntriesPage.php` (`config()`)
- Modify: `admin-src/entries/EntriesListScreen.js` (notice above the table)
- Modify: `includes/Support/Uninstaller.php` (`cleanCurrentSite()`)
- Test: `tests/integration/EntriesPageTest.php`, `tests/integration/UninstallTest.php`, `tests/js/admin/entries/` (the existing list-screen test file — find it with `ls tests/js/admin`)

**Interfaces:**
- Consumes: `AdminNotifier::FAILURE_OPTION` (Task 2).
- Produces: `config()['mailFailure']` = `null` or `[ 'entryId' => int ]` (only when the option holds a positive int `entry_id`).

- [ ] **Step 1: Write the failing tests**
  - PHP: option absent → `mailFailure === null`; option `[ 'entry_id' => 41, 'time' => 1 ]` → `[ 'entryId' => 41 ]`; option garbage (`'x'`) → `null`.
  - PHP: uninstall removes the option.
  - Jest: `config.mailFailure = { entryId: 41 }` → a `Notice` with status `warning` and text `The last notification email could not be sent (entry #41). Check your site's email setup.`; dismissing hides it for this page view; `null` → no notice.
- [ ] **Step 2: Run** — `make itest ARGS="--filter 'EntriesPageTest|UninstallTest'"` and `npm test` → fail.
- [ ] **Step 3: Implement.** Notice uses `sprintf( __( 'The last notification email could not be sent (entry #%d). Check your site\'s email setup.', 'quoteform' ), id )` with a translators comment, `live={ false }` (the screen has its own live region — see `Notice.js` docblock). Uninstaller: `delete_option( AdminNotifier::FAILURE_OPTION )`.
- [ ] **Step 4: Run** — `make itest`, `npm test` → green.
- [ ] **Step 5: Commit (ask first)** — `Warn on the Entries screen when a notification email fails`

---

### Task 6: Readme, translations and the release check

**Files:**
- Modify: `readme.txt`, `languages/quoteform.pot`
- Test: `tests/php/ReadmeTest.php`

- [ ] **Step 1: Write the failing test** — `testTheReadmeNoLongerDeniesEmailNotifications`: readme does not contain `does not send email notifications` or `Not in this version. Check the Entries screen`; it contains `Notifications`.
- [ ] **Step 2: Run** — `./bin/phpunit --filter ReadmeTest` → fail.
- [ ] **Step 3: Update `readme.txt`**
  - New bullet in "The builder": **Notifications** — email yourself every quote: answers, breakdown and total, to one or more addresses.
  - "What this version does not do": remove email; keep payments and save-and-resume; add "It does not email the visitor a copy of their quote yet."
  - FAQ "Will I get an email…": yes, turn it on under Settings → Notifications; mail goes through `wp_mail()`, so an SMTP plugin is recommended for reliable delivery; a failed send is shown on the Entries screen and the entry is kept.
  - Privacy: the notification email contains the visitor's answers.
  - Changelog: new unreleased section `= 0.2.0 =` with `* New: email notifications for the site owner. Forms created before this version have them off — turn them on under Settings → Notifications.` Do NOT change `Stable tag` or the plugin version; the release is a separate step (see memory `wporg-release-process`).
- [ ] **Step 4: Regenerate the POT** — `make makepot`; check the new strings are in `languages/quoteform.pot`.
- [ ] **Step 5: Full check** — `make check` → all suites green. Then `make up`, create a form, submit it on the front end and confirm the mail arrives (Mailpit/`wp_mail` log, whichever the dev stack has — if none, use a `pre_wp_mail` mu-plugin that writes to `debug.log`, and delete it after).
- [ ] **Step 6: Commit (ask first)** — `Document email notifications in the readme`
