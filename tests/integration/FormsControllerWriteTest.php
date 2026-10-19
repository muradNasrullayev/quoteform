<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use RuntimeException;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_UnitTestCase;

final class FormsControllerWriteTest extends WP_UnitTestCase
{
    /** @var WP_REST_Server */
    private $server;

    protected function setUp(): void
    {
        parent::setUp();

        FormPostType::register();
        Activation::activate();

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;

        // Routes come from Plugin::boot()'s own `rest_api_init` registration
        // (run once, at `muplugins_loaded`, by tests/integration/bootstrap.php
        // — that hook survives every WP_UnitTestCase::tearDown()'s
        // `_restore_hooks()`). Registering them again here would double the
        // handlers per route; see PluginTest::testEndToEndFormLifecycleOverRest()
        // for the test that proves the bootstrap mechanism itself works.
        do_action( 'rest_api_init' );
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function loginAsManager(): void
    {
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );
    }

    private function loginAsSubscriber(): void
    {
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'subscriber' ] ) );
    }

    /**
     * Guards against the fixture itself silently failing: an earlier version
     * of this helper read `->get_data()['id']` unguarded, so a create that
     * was rejected (wrong login, bad title, ...) surfaced as an opaque
     * "undefined array key" failure deep inside an unrelated test instead of
     * a clear message pointing at the fixture.
     */
    private function createFormViaRest( string $title = 'New quote form' ): int
    {
        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => $title ] );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        if ( ! isset( $data['id'] ) ) {
            throw new RuntimeException(
                sprintf(
                    'createFormViaRest() fixture failed: status=%d, body=%s',
                    $response->get_status(),
                    wp_json_encode( $data )
                )
            );
        }

        return (int) $data['id'];
    }

    public function testCreateReturns201AndTheDefaultSchema(): void
    {
        $this->loginAsManager();

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => 'Cleaning quote' ] );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 201, $response->get_status() );
        $this->assertGreaterThan( 0, $data['id'] );
        $this->assertSame( 'Cleaning quote', $data['title'] );
        $this->assertSame( SchemaRepository::defaults(), $data['schema'] );
    }

    public function testCreateStoresTheDefaultSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $this->assertSame( SchemaRepository::defaults(), ( new SchemaRepository() )->find( $formId ) );
    }

    public function testCreateRequiresATitle(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'POST', '/quoteform/v1/forms' ) );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_missing_callback_param', $response->get_data()['code'] );
    }

    public function testCreateRejectsAnEmptyTitle(): void
    {
        $this->loginAsManager();

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => '   ' ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_invalid_param', $response->get_data()['code'] );
    }

    /**
     * Pins item 1: `sanitize_text_field()` runs AFTER `titleArgSchema()`'s
     * `validate_callback`, and can turn a non-empty raw value into an empty
     * one — `<script>alert(1)</script>` strips to `''`. Before the fix this
     * slipped through as a 201 with an empty stored title; the fixture used
     * to be `<script>alert(1)</script>Quote`, which leaves `Quote` behind
     * and so passed even on the broken behaviour.
     */
    public function testCreateRejectsATitleThatSanitizesToEmpty(): void
    {
        $this->loginAsManager();

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => '<script>alert(1)</script>' ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_invalid_param', $response->get_data()['code'] );

        $forms = get_posts(
            [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1 ]
        );
        $this->assertSame( [], $forms, 'A form must not be created when the title sanitizes to empty.' );
    }

    /**
     * Update-side counterpart of the same pin: a rename to HTML that
     * sanitizes to nothing must be rejected, leaving the existing title
     * untouched.
     */
    public function testUpdateRejectsATitleThatSanitizesToEmpty(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest( 'Original title' );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => '<b></b>', 'schema' => SchemaRepository::defaults() ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_invalid_param', $response->get_data()['code'] );
        $this->assertSame( 'Original title', get_post( $formId )->post_title );
    }

    public function testCreateRequiresTheManageCapability(): void
    {
        $this->loginAsSubscriber();

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => 'Nope' ] );

        $this->assertSame( 403, $this->server->dispatch( $request )->get_status() );
    }

    public function testCreateRejectsLoggedOutVisitors(): void
    {
        wp_set_current_user( 0 );

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => 'Nope' ] );

        $this->assertSame( 401, $this->server->dispatch( $request )->get_status() );
    }

    /**
     * The create route has no id to compare "existing" against "missing"
     * with, so its no-oracle guard instead proves the unauthorised response
     * does not vary depending on whether other forms already exist.
     */
    public function testUnauthorisedCreateResponseDoesNotDependOnExistingForms(): void
    {
        $this->loginAsSubscriber();

        $beforeRequest = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $beforeRequest->set_body_params( [ 'title' => 'Nope' ] );
        $before = $this->server->dispatch( $beforeRequest );

        $this->loginAsManager();
        $this->createFormViaRest();
        $this->loginAsSubscriber();

        $afterRequest = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $afterRequest->set_body_params( [ 'title' => 'Nope' ] );
        $after = $this->server->dispatch( $afterRequest );

        $this->assertSame( $before->get_status(), $after->get_status() );
        $this->assertSame( $before->get_data()['code'], $after->get_data()['code'] );
    }

    /**
     * `wp_insert_post()`/`wp_update_post()` unslash their input — a REST JSON
     * body arrives unslashed already, so a title containing a real backslash
     * must survive the round trip only if the controller `wp_slash()`s it
     * first. Without that, `\backslash` would come back as `backslash`.
     */
    public function testCreateTitleWithABackslashRoundTripsIntact(): void
    {
        $this->loginAsManager();

        $title = 'Quote for C:\\Users\\bob & "special" chars';

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => $title ] );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 201, $response->get_status() );
        $this->assertSame( $title, $data['title'] );
        $this->assertSame( $title, get_post( $data['id'] )->post_title );
    }

    /**
     * The React builder will send a real JSON body (`Content-Type:
     * application/json` + `set_body()`), never `set_body_params()`. Every
     * other test in this file uses the latter, so this is the only test
     * that exercises the actual JSON-decode -> wp_slash -> wp_insert_post
     * path the browser uses.
     */
    public function testCreateAcceptsARealJsonRequestBody(): void
    {
        $this->loginAsManager();

        $title = 'Quote for C:\\Users\\bob & "special" chars';

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_header( 'Content-Type', 'application/json' );
        $request->set_body( wp_json_encode( [ 'title' => $title ] ) );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 201, $response->get_status() );
        $this->assertSame( $title, $data['title'] );
        $this->assertSame( $title, get_post( $data['id'] )->post_title );
        $this->assertSame( SchemaRepository::defaults(), ( new SchemaRepository() )->find( $data['id'] ) );
    }

    /**
     * Pins item 2 and the "no orphan" guarantee: when the post itself can be
     * inserted but its schema meta cannot be saved, `createItem()` must not
     * leave a schema-less form behind a 201 (or any status other than 500).
     */
    public function testCreateFailsWhenTheSchemaCannotBeSaved(): void
    {
        $this->loginAsManager();

        add_filter( 'update_post_metadata', '__return_false' );

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => 'Doomed' ] );

        $response = $this->server->dispatch( $request );

        remove_filter( 'update_post_metadata', '__return_false' );

        $this->assertSame( 500, $response->get_status() );
        $this->assertSame( 'qform_create_failed', $response->get_data()['code'] );

        $forms = get_posts(
            [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'any', 'numberposts' => -1 ]
        );
        $this->assertSame( [], $forms, 'A form whose schema failed to save must not remain in the database.' );
    }

    /**
     * The already-correct `wp_insert_post()` failure path (`qform_create_failed`),
     * exercised end to end. `wp_insert_post_data` lets us inject a column
     * `$wpdb->insert()` does not recognise, so the real INSERT statement
     * errors out and `wp_insert_post( ..., true )` returns the genuine
     * `WP_Error( 'db_insert_error', ... )` it is documented to return on a
     * failed write — no raw SQL and no file outside the two this task may
     * change.
     */
    public function testCreateFailsWhenThePostCannotBeInserted(): void
    {
        $this->loginAsManager();

        $breakTheInsert = static function ( array $data ): array {
            $data['qform_test_forced_failure_column'] = 'x';

            return $data;
        };

        global $wpdb;
        $previousSuppress = $wpdb->suppress_errors( true );

        add_filter( 'wp_insert_post_data', $breakTheInsert );

        $request = new WP_REST_Request( 'POST', '/quoteform/v1/forms' );
        $request->set_body_params( [ 'title' => 'Doomed' ] );

        $response = $this->server->dispatch( $request );

        remove_filter( 'wp_insert_post_data', $breakTheInsert );
        $wpdb->suppress_errors( $previousSuppress );

        $this->assertSame( 500, $response->get_status() );
        $this->assertSame( 'qform_create_failed', $response->get_data()['code'] );

        $forms = get_posts(
            [ 'post_type' => 'any', 'post_status' => 'any', 'numberposts' => -1, 's' => 'Doomed' ]
        );
        $this->assertSame( [], $forms, 'A failed insert must not leave any post behind.' );
    }

    public function testUpdateSavesAValidSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['settings']['currency'] = 'AZN';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Renamed', 'schema' => $schema ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( 'AZN', ( new SchemaRepository() )->find( $formId )['settings']['currency'] );
        $this->assertSame( 'Renamed', get_post( $formId )->post_title );
    }

    /**
     * Same `wp_slash()` trap as create, exercised on the update path's
     * `wp_update_post()` call.
     */
    public function testUpdateTitleWithABackslashRoundTripsIntact(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $title = 'Renamed \\backslash title';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => $title, 'schema' => SchemaRepository::defaults() ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( $title, get_post( $formId )->post_title );
    }

    /**
     * JSON-body counterpart of the update path: a backslash in the title
     * AND a backslash-bearing string inside the schema, plus the schema's
     * booleans/integers, must all survive JSON-decode -> wp_slash -> meta
     * storage unchanged.
     */
    public function testUpdateAcceptsARealJsonRequestBodyAndPreservesTypes(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['fields']['quantity']['help'] = 'Path: C:\\temp\\x';

        $title = 'Renamed \\backslash title';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_header( 'Content-Type', 'application/json' );
        $request->set_body( wp_json_encode( [ 'title' => $title, 'schema' => $schema ] ) );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( $title, get_post( $formId )->post_title );

        $stored = ( new SchemaRepository() )->find( $formId );

        $this->assertSame( 'Path: C:\\temp\\x', $stored['fields']['quantity']['help'] );
        $this->assertSame( 2, $stored['settings']['decimals'] );
        $this->assertTrue( $stored['settings']['save_resume'] );
        $this->assertFalse( $stored['settings']['store_ip'] );
    }

    /**
     * Builds a schema carrying one `html` field, placed on the first step so
     * `SchemaValidator`'s orphan-field check is satisfied and the only thing
     * under test is what happens to `content`.
     *
     * @return array<string, mixed>
     */
    private function schemaWithHtmlContent( string $content ): array
    {
        $schema = SchemaRepository::defaults();

        $schema['fields']['notice'] = [
            'key'         => 'notice',
            'type'        => 'html',
            'label'       => '',
            'help'        => '',
            'placeholder' => '',
            'required'    => false,
            'default'     => '',
            'content'     => $content,
        ];

        $schema['steps'][0]['fields'][] = 'notice';

        return $schema;
    }

    /**
     * @param array<string, mixed> $schema
     */
    private function putSchema( int $formId, array $schema, string $title = 'Renamed' ): WP_REST_Response
    {
        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => $title, 'schema' => $schema ] );

        return $this->server->dispatch( $request );
    }

    private function storedHtmlContent( int $formId ): string
    {
        return ( new SchemaRepository() )->find( $formId )['fields']['notice']['content'];
    }

    private function readHtmlContentViaRest( int $formId ): string
    {
        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        return $response->get_data()['schema']['fields']['notice']['content'];
    }

    /**
     * `qform_manage_forms` can be granted to non-administrators (spec §10.2),
     * so an unfiltered `html` field's `content` would turn "can build forms"
     * into "can run JavaScript on the front end". `wp_kses_post()` removes the
     * `<script>` markup; its inner text survives as inert text, which is
     * exactly what core does to post content and is harmless once the tag is
     * gone.
     */
    public function testUpdateStripsScriptTagsFromHtmlFieldContent(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $response = $this->putSchema(
            $formId,
            $this->schemaWithHtmlContent( '<p>Before</p><script>alert(1)</script><p>After</p>' )
        );

        $this->assertSame( 200, $response->get_status() );

        $stored = $this->storedHtmlContent( $formId );

        $this->assertStringNotContainsString( '<script', $stored );
        $this->assertStringNotContainsString( '</script', $stored );
        $this->assertStringContainsString( '<p>Before</p>', $stored );
        $this->assertStringContainsString( '<p>After</p>', $stored );
        $this->assertSame( $stored, $this->readHtmlContentViaRest( $formId ) );
    }

    /**
     * The builder replaces its in-memory schema with the one the PUT
     * response carries (`SAVE_SUCCEEDED` in `admin-src/state/reducer.js`),
     * so the response must be the sanitised document — otherwise the screen
     * keeps showing markup the server has already thrown away, and a reload
     * silently changes the form under the user.
     */
    public function testUpdateResponseCarriesTheSanitizedSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $response = $this->putSchema(
            $formId,
            $this->schemaWithHtmlContent( '<p>Hi</p><script src="https://evil.example/x.js"></script>' )
        );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame(
            $this->storedHtmlContent( $formId ),
            $response->get_data()['schema']['fields']['notice']['content']
        );
        $this->assertStringNotContainsString( '<script', $response->get_data()['schema']['fields']['notice']['content'] );
    }

    public function testUpdateKeepsOrdinaryMarkupInHtmlFieldContent(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $content = '<p>Hello <strong>world</strong>, see <a href="https://example.com">our prices</a>.</p>'
            . '<ul><li>First</li><li>Second</li></ul>';

        $response = $this->putSchema( $formId, $this->schemaWithHtmlContent( $content ) );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( $content, $this->storedHtmlContent( $formId ) );
        $this->assertSame( $content, $this->readHtmlContentViaRest( $formId ) );
    }

    public function testUpdateStripsEventHandlerAttributesButKeepsTheLink(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $response = $this->putSchema(
            $formId,
            $this->schemaWithHtmlContent( '<a href="#" onclick="alert(1)">Click me</a>' )
        );

        $this->assertSame( 200, $response->get_status() );

        $stored = $this->storedHtmlContent( $formId );

        $this->assertStringNotContainsString( 'onclick', $stored );
        $this->assertStringContainsString( 'href="#"', $stored );
        $this->assertStringContainsString( 'Click me', $stored );
    }

    /**
     * The test that pins the ORDERING. Sanitising happens before validating,
     * so content that is nothing but a `<script>` element is already empty by
     * the time `FieldValidator` sees it and comes back as the existing
     * `missing_field` at `fields.notice.content`. Were the two swapped, this
     * payload would validate (non-empty at that point), then be stripped to
     * `''` on the way to the database — storing a document validation would
     * have rejected.
     *
     * The payload has an empty body on purpose: `wp_kses_post()` removes tag
     * markup but keeps text between tags, so `<script>alert(1)</script>`
     * sanitises to the non-empty `alert(1)` and would NOT exercise this path.
     */
    public function testUpdateRejectsHtmlContentThatSanitizesToEmpty(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $before = ( new SchemaRepository() )->find( $formId );

        $response = $this->putSchema(
            $formId,
            $this->schemaWithHtmlContent( '<script src="https://evil.example/x.js"></script>' )
        );

        $data = $response->get_data();

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'qform_invalid_schema', $data['code'] );

        $paths = array_column( $data['data']['errors'], 'path' );
        $codes = array_column( $data['data']['errors'], 'code' );

        $this->assertContains( 'fields.notice.content', $paths );
        $this->assertSame( [ 'missing_field' ], array_unique( $codes ) );
        $this->assertSame( $before, ( new SchemaRepository() )->find( $formId ) );
    }

    /**
     * The policy is unconditional. A user who holds `unfiltered_html` gets
     * exactly the same treatment as one who does not — asserted explicitly so
     * a later "optimisation" cannot quietly make this capability-dependent
     * and hand the capability back its escalation path.
     */
    public function testHtmlFieldContentIsSanitizedEvenForUsersWithUnfilteredHtml(): void
    {
        $userId = $this->factory->user->create( [ 'role' => 'administrator' ] );
        $user   = get_userdata( $userId );
        $user->add_cap( 'unfiltered_html' );
        wp_set_current_user( $userId );

        $this->assertTrue(
            current_user_can( 'unfiltered_html' ),
            'Fixture precondition: this test is only meaningful for a user who holds unfiltered_html.'
        );

        $formId = $this->createFormViaRest();

        $response = $this->putSchema(
            $formId,
            $this->schemaWithHtmlContent( '<p>Before</p><script>alert(1)</script>' )
        );

        $this->assertSame( 200, $response->get_status() );
        $this->assertStringNotContainsString( '<script', $this->storedHtmlContent( $formId ) );
    }

    public function testUpdateRejectsABrokenExpression(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['calculations'][0]['expression'] = 'round({quantity} * ';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Broken', 'schema' => $schema ] );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();
        $errors   = $data['data']['errors'];

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'qform_invalid_schema', $data['code'] );
        $this->assertCount( 1, $errors, 'Only the broken expression should be reported.' );
        $this->assertSame( 'calculations.0.expression', $errors[0]['path'] );
        $this->assertSame( 'invalid_expression', $errors[0]['code'] );
        $this->assertSame( 'unexpected_token', $errors[0]['context']['engine_code'] );
    }

    public function testARejectedUpdateLeavesTheStoredSchemaUntouched(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['calculations'][0]['expression'] = '{ghost}';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Broken', 'schema' => $schema ] );
        $this->server->dispatch( $request );

        $this->assertSame(
            SchemaRepository::defaults(),
            ( new SchemaRepository() )->find( $formId ),
            'Sınıq sxem bazaya düşməməlidir.'
        );
    }

    /**
     * A rejected title-only change must not persist either: a partial write
     * (title renamed but schema untouched) would be a half-applied update.
     */
    public function testARejectedUpdateLeavesTheStoredTitleUntouched(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest( 'Original title' );

        $schema = SchemaRepository::defaults();
        $schema['calculations'][0]['expression'] = '{ghost}';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Should not stick', 'schema' => $schema ] );
        $this->server->dispatch( $request );

        $this->assertSame( 'Original title', get_post( $formId )->post_title );
    }

    public function testUpdateRejectsACircularReference(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['calculations'] = [
            [ 'key' => 'a', 'expression' => '{b}', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'b', 'expression' => '{a}', 'label' => 'B', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Loop', 'schema' => $schema ] );

        $data   = $this->server->dispatch( $request )->get_data();
        $errors = $data['data']['errors'];

        $this->assertCount( 1, $errors, 'Only the cycle should be reported.' );
        $this->assertSame( 'calculations', $errors[0]['path'] );
        $this->assertSame( 'circular_reference', $errors[0]['code'] );
    }

    public function testUpdateReturnsEveryErrorNotJustTheFirst(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $schema = SchemaRepository::defaults();
        $schema['settings']['decimals']        = 9;
        $schema['fields']['quantity']['label'] = '';

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Two problems', 'schema' => $schema ] );

        $errors = $this->server->dispatch( $request )->get_data()['data']['errors'];

        $this->assertSame(
            [
                [ 'path' => 'settings.decimals', 'code' => 'out_of_range' ],
                [ 'path' => 'fields.quantity.label', 'code' => 'missing_field' ],
            ],
            array_map(
                static function ( array $error ): array {
                    return [ 'path' => $error['path'], 'code' => $error['code'] ];
                },
                $errors
            )
        );
    }

    public function testUpdateRejectsASchemaThatIsAString(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Bad schema' ] );
        $request->set_param( 'schema', 'not-an-object' );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'qform_invalid_schema', $data['code'] );
        $this->assertCount( 1, $data['data']['errors'] );
        $this->assertSame( '', $data['data']['errors'][0]['path'] );
        $this->assertSame( 'invalid_type', $data['data']['errors'][0]['code'] );
    }

    /**
     * Pins item 4: WordPress's `rest_is_object()` special-cases `''` as a
     * valid "object" and, without a `type` declaration at all, the raw
     * string reaches the handler unchanged — where it must fall into
     * `SchemaValidator`'s own `invalid_type` branch, not into seven
     * `missing_field` errors (which is what happened when WordPress's
     * `'type' => 'object'` sanitizer silently coerced `''` into `[]` first).
     */
    public function testUpdateRejectsAnEmptyStringSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Bad schema' ] );
        $request->set_param( 'schema', '' );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'qform_invalid_schema', $data['code'] );
        $this->assertCount( 1, $data['data']['errors'] );
        $this->assertSame( '', $data['data']['errors'][0]['path'] );
        $this->assertSame( 'invalid_type', $data['data']['errors'][0]['code'] );
    }

    /**
     * Pins item 4's other half: a plain PHP list is still `is_array()`, so
     * `SchemaValidator::validate()` (which only rejects non-arrays) would
     * otherwise fall into its unknown_key/missing_field checks and report
     * three `unknown_key` errors (at paths "0", "1", "2") plus seven
     * `missing_field` errors — the wrong shape entirely for "you sent an
     * array, not an object".
     */
    public function testUpdateRejectsAListSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Bad schema' ] );
        $request->set_param( 'schema', [ 1, 2, 3 ] );

        $response = $this->server->dispatch( $request );
        $data     = $response->get_data();

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'qform_invalid_schema', $data['code'] );
        $this->assertCount( 1, $data['data']['errors'] );
        $this->assertSame( '', $data['data']['errors'][0]['path'] );
        $this->assertSame( 'invalid_type', $data['data']['errors'][0]['code'] );
    }

    public function testUpdateRejectsAMissingSchemaKey(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'No schema at all' ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_missing_callback_param', $response->get_data()['code'] );
    }

    public function testUpdateRejectsAMissingTitle(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'schema' => SchemaRepository::defaults() ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_missing_callback_param', $response->get_data()['code'] );
    }

    public function testUpdateRejectsAnEmptyTitle(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => '', 'schema' => SchemaRepository::defaults() ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_invalid_param', $response->get_data()['code'] );
    }

    /**
     * Item 6: PUT now declares the same `id` argument GET already had
     * (`testSingleFormRejectsAnIdOfZero` in `FormsControllerReadTest`), so
     * `id=0` is now rejected at the same, earlier stage — 400 before the
     * handler ever runs `exists()` — instead of falling through to a 404
     * from inside the handler.
     */
    public function testUpdateRejectsAnIdOfZero(): void
    {
        $this->loginAsManager();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/0' );
        $request->set_body_params( [ 'title' => 'X', 'schema' => SchemaRepository::defaults() ] );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_invalid_param', $response->get_data()['code'] );
    }

    public function testUpdateReturns404ForAMissingForm(): void
    {
        $this->loginAsManager();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/999999' );
        $request->set_body_params( [ 'title' => 'Ghost', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 404, $this->server->dispatch( $request )->get_status() );
    }

    public function testUpdateReturns404ForATrashedForm(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        wp_trash_post( $formId );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Resurrected', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 404, $this->server->dispatch( $request )->get_status() );
    }

    public function testUpdateReturns404ForAPage(): void
    {
        $this->loginAsManager();
        $pageId = (int) wp_insert_post( [ 'post_type' => 'page', 'post_title' => 'A page' ] );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $pageId );
        $request->set_body_params( [ 'title' => 'X', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 404, $this->server->dispatch( $request )->get_status() );
    }

    public function testUpdateReturns404ForAnAttachment(): void
    {
        $this->loginAsManager();
        $attachmentId = (int) wp_insert_post(
            [ 'post_type' => 'attachment', 'post_title' => 'Image', 'post_status' => 'inherit' ]
        );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $attachmentId );
        $request->set_body_params( [ 'title' => 'X', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 404, $this->server->dispatch( $request )->get_status() );
    }

    public function testUpdateReturns404ForARevision(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        wp_update_post( [ 'ID' => $formId, 'post_title' => 'v2' ] );

        $revisions  = wp_get_post_revisions( $formId );
        $revisionId = (int) array_key_first( $revisions );

        $this->assertGreaterThan( 0, $revisionId, 'Expected a revision to have been created.' );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $revisionId );
        $request->set_body_params( [ 'title' => 'X', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 404, $this->server->dispatch( $request )->get_status() );
    }

    public function testUpdateRequiresTheManageCapability(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $this->loginAsSubscriber();

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Nope', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 403, $this->server->dispatch( $request )->get_status() );
    }

    public function testUpdateRejectsLoggedOutVisitors(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        wp_set_current_user( 0 );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Nope', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 401, $this->server->dispatch( $request )->get_status() );
    }

    /**
     * Registering `PATCH` alongside `PUT` (item 5) implied a partial-update
     * semantic that never worked: both `title` and `schema` are required,
     * so a conventional partial `PATCH` always failed with 400 anyway. The
     * route no longer advertises it, so `PATCH` is simply unrouted.
     */
    public function testPatchIsNoLongerARegisteredMethod(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $request = new WP_REST_Request( 'PATCH', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Nope', 'schema' => SchemaRepository::defaults() ] );

        $this->assertSame( 404, $this->server->dispatch( $request )->get_status() );
    }

    /**
     * Pins item 3: a failed `wp_update_post()` must fail the whole request
     * before the schema is ever written — chosen over writing the schema
     * first because it leaves the smaller inconsistent window (nothing
     * changes at all, instead of "schema updated, title stale"). Same
     * `wp_insert_post_data` technique as `testCreateFailsWhenThePostCannotBeInserted()`:
     * injecting a column `$wpdb->update()` does not recognise makes the real
     * UPDATE statement fail, so `wp_update_post( ..., true )` returns the
     * genuine `WP_Error( 'db_update_error', ... )`.
     */
    public function testUpdateFailsWhenThePostCannotBeSaved(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest( 'Keep me' );

        $schema = SchemaRepository::defaults();
        $schema['settings']['currency'] = 'AZN';

        $breakTheUpdate = static function ( array $data ): array {
            $data['qform_test_forced_failure_column'] = 'x';

            return $data;
        };

        global $wpdb;
        $previousSuppress = $wpdb->suppress_errors( true );

        add_filter( 'wp_insert_post_data', $breakTheUpdate );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'New name', 'schema' => $schema ] );

        $response = $this->server->dispatch( $request );

        remove_filter( 'wp_insert_post_data', $breakTheUpdate );
        $wpdb->suppress_errors( $previousSuppress );

        $this->assertSame( 500, $response->get_status() );
        $this->assertSame( 'qform_update_failed', $response->get_data()['code'] );
        $this->assertSame( 'Keep me', get_post( $formId )->post_title );
        $this->assertSame(
            SchemaRepository::defaults(),
            ( new SchemaRepository() )->find( $formId ),
            'A failed title update must not let the schema write proceed.'
        );
    }

    /**
     * Pins item 2 on the update side: the title write can succeed while the
     * schema write independently fails (two non-transactional writes), so
     * `save()`'s return value must be checked and must fail the request —
     * a 200 here would describe a state ("currency=AZN") that was never
     * actually stored.
     *
     * The title having already committed in this scenario is a known,
     * accepted residual window (see the fix report): `save()` only reports
     * failure after the title write already happened, and there is no
     * request to revert it. What item 2 forbids is lying about it with a
     * 200 — which this test proves no longer happens.
     */
    public function testUpdateFailsWhenTheSchemaCannotBeSaved(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest( 'Keep me' );

        $schema = SchemaRepository::defaults();
        $schema['settings']['currency'] = 'AZN';

        add_filter( 'update_post_metadata', '__return_false' );

        $request = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $request->set_body_params( [ 'title' => 'Renamed', 'schema' => $schema ] );

        $response = $this->server->dispatch( $request );

        remove_filter( 'update_post_metadata', '__return_false' );

        $this->assertSame( 500, $response->get_status() );
        $this->assertSame( 'qform_update_failed', $response->get_data()['code'] );
        $this->assertSame(
            SchemaRepository::defaults(),
            ( new SchemaRepository() )->find( $formId ),
            'The schema must not appear saved when the write failed.'
        );
    }

    public function testDeleteTrashesTheForm(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId ) );
        $data     = $response->get_data();

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( 'trash', get_post_status( $formId ) );
        $this->assertSame( $formId, $data['id'] );
        $this->assertTrue( $data['deleted'] );
    }

    /**
     * Same item 6 consequence as `testUpdateRejectsAnIdOfZero()`: DELETE now
     * declares `id` too, so `id=0` is a 400 at the argument stage, not a 404
     * from `exists()`.
     */
    public function testDeleteRejectsAnIdOfZero(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/0' ) );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_invalid_param', $response->get_data()['code'] );
    }

    public function testDeleteReturns404ForAMissingForm(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/999999' ) );

        $this->assertSame( 404, $response->get_status() );
    }

    public function testDeleteReturns404ForAPage(): void
    {
        $this->loginAsManager();
        $pageId = (int) wp_insert_post( [ 'post_type' => 'page', 'post_title' => 'A page' ] );

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $pageId ) );

        $this->assertSame( 404, $response->get_status() );
    }

    public function testDeleteReturns404ForAnAttachment(): void
    {
        $this->loginAsManager();
        $attachmentId = (int) wp_insert_post(
            [ 'post_type' => 'attachment', 'post_title' => 'Image', 'post_status' => 'inherit' ]
        );

        $response = $this->server->dispatch(
            new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $attachmentId )
        );

        $this->assertSame( 404, $response->get_status() );
    }

    public function testDeleteReturns404ForARevision(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        wp_update_post( [ 'ID' => $formId, 'post_title' => 'v2' ] );

        $revisions  = wp_get_post_revisions( $formId );
        $revisionId = (int) array_key_first( $revisions );

        $this->assertGreaterThan( 0, $revisionId, 'Expected a revision to have been created.' );

        $response = $this->server->dispatch(
            new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $revisionId )
        );

        $this->assertSame( 404, $response->get_status() );
    }

    public function testDeleteRequiresTheManageCapability(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();

        $this->loginAsSubscriber();

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 403, $response->get_status() );
    }

    public function testDeleteRejectsLoggedOutVisitors(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        wp_set_current_user( 0 );

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 401, $response->get_status() );
    }

    /**
     * Deleting an already-trashed form is idempotent: `wp_trash_post()` on a
     * post already in the trash is a harmless no-op in WordPress core, and
     * there is no restore-safety reason (unlike `updateItem()`) to refuse it
     * — PROVIDED the Trash is enabled, which it is here (this suite's real,
     * unmodifiable environment defines `EMPTY_TRASH_DAYS` as 30).
     *
     * The other half of Item 3 — `deleteItem()` refusing with
     * `rest_trash_not_supported` when the Trash is disabled
     * (`EMPTY_TRASH_DAYS === 0`) — is NOT exercised end-to-end in this suite,
     * and that is deliberate rather than an oversight: `EMPTY_TRASH_DAYS` is
     * a PHP constant already defined (to 30) by the WordPress test bootstrap
     * before this suite runs, so it cannot be redefined mid-process, and
     * this project has no `uopz`/`runkit` extension to fake it.
     * `FormsController` is also `final` (project convention — every class in
     * `includes/` is), so it cannot be subclassed to override the seam
     * either. Rather than write a test that exercises a stand-in instead of
     * the real path, the constant-gated decision is pinned at the unit level
     * instead: see `FormsControllerTrashSupportTest` in `tests/php/Rest/`,
     * which tests the exact pure predicate `trashIsSupported()` delegates to.
     */
    public function testDeletingAnAlreadyTrashedFormStillReturns200(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        wp_trash_post( $formId );

        $response = $this->server->dispatch( new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( 'trash', get_post_status( $formId ) );
    }

    public function testUnauthorisedUpdateResponseIsIdenticalForExistingAndNonexistentIds(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        $this->loginAsSubscriber();

        $existingRequest = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $existingRequest->set_body_params( [ 'title' => 'X', 'schema' => SchemaRepository::defaults() ] );

        $missingRequest = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/999999' );
        $missingRequest->set_body_params( [ 'title' => 'X', 'schema' => SchemaRepository::defaults() ] );

        $existing = $this->server->dispatch( $existingRequest );
        $missing  = $this->server->dispatch( $missingRequest );

        $this->assertSame( $existing->get_status(), $missing->get_status() );
        $this->assertSame( $existing->get_data()['code'], $missing->get_data()['code'] );
    }

    public function testAnonymousUpdateResponseIsIdenticalForExistingAndNonexistentIds(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        wp_set_current_user( 0 );

        $existingRequest = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/' . $formId );
        $existingRequest->set_body_params( [ 'title' => 'X', 'schema' => SchemaRepository::defaults() ] );

        $missingRequest = new WP_REST_Request( 'PUT', '/quoteform/v1/forms/999999' );
        $missingRequest->set_body_params( [ 'title' => 'X', 'schema' => SchemaRepository::defaults() ] );

        $existing = $this->server->dispatch( $existingRequest );
        $missing  = $this->server->dispatch( $missingRequest );

        $this->assertSame( $existing->get_status(), $missing->get_status() );
        $this->assertSame( $existing->get_data()['code'], $missing->get_data()['code'] );
    }

    public function testUnauthorisedDeleteResponseIsIdenticalForExistingAndNonexistentIds(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        $this->loginAsSubscriber();

        $existing = $this->server->dispatch(
            new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId )
        );
        $missing = $this->server->dispatch(
            new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/999999' )
        );

        $this->assertSame( $existing->get_status(), $missing->get_status() );
        $this->assertSame( $existing->get_data()['code'], $missing->get_data()['code'] );
    }

    public function testAnonymousDeleteResponseIsIdenticalForExistingAndNonexistentIds(): void
    {
        $this->loginAsManager();
        $formId = $this->createFormViaRest();
        wp_set_current_user( 0 );

        $existing = $this->server->dispatch(
            new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/' . $formId )
        );
        $missing = $this->server->dispatch(
            new WP_REST_Request( 'DELETE', '/quoteform/v1/forms/999999' )
        );

        $this->assertSame( $existing->get_status(), $missing->get_status() );
        $this->assertSame( $existing->get_data()['code'], $missing->get_data()['code'] );
    }
}
