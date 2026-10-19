<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

final class FormsControllerReadTest extends WP_UnitTestCase
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

    private function createForm( string $title = 'Cleaning quote' ): int
    {
        $formId = (int) wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => $title,
                'post_status' => 'publish',
            ]
        );

        ( new SchemaRepository() )->save( $formId, SchemaRepository::defaults() );

        return $formId;
    }

    /**
     * A brand-new (non-update) `wp_insert_post()` sets `post_modified` to the
     * given `post_date` verbatim, which lets tests control ordering by
     * `modified` deterministically without sleeping between inserts.
     */
    private function createFormWithDate( string $title, string $mysqlDate ): int
    {
        return (int) wp_insert_post(
            [
                'post_type'     => FormPostType::POST_TYPE,
                'post_title'    => $title,
                'post_status'   => 'publish',
                'post_date'     => $mysqlDate,
                'post_date_gmt' => $mysqlDate,
            ]
        );
    }

    public function testRoutesAreRegistered(): void
    {
        $routes = $this->server->get_routes();

        $this->assertArrayHasKey( '/quoteform/v1/forms', $routes );
        $this->assertArrayHasKey( '/quoteform/v1/forms/(?P<id>[\d]+)', $routes );
    }

    /**
     * This is the guard Task 14 needs before it adds write routes: it fails
     * for ANY route under quoteform/v1 (present or future) that omits
     * `permission_callback`, not just the two routes known today.
     */
    public function testEveryQuoteformRouteHasANonEmptyPermissionCallback(): void
    {
        $routes = $this->server->get_routes();

        // `/quoteform/v1` itself is WordPress core's own auto-registered
        // namespace index (`WP_REST_Server::register_route()`), a public
        // discovery endpoint with no `permission_callback` by design — that
        // is not this plugin's route and is not what this guard is for.
        $quoteformRoutes = array_filter(
            $routes,
            static function ( string $path ): bool {
                return 0 === strpos( $path, '/quoteform/v1/' );
            },
            ARRAY_FILTER_USE_KEY
        );

        $this->assertNotEmpty(
            $quoteformRoutes,
            'Expected at least one route under quoteform/v1/ to be registered.'
        );

        foreach ( $quoteformRoutes as $path => $handlers ) {
            foreach ( $handlers as $handler ) {
                $this->assertArrayHasKey(
                    'permission_callback',
                    $handler,
                    "Route {$path} has a handler with no permission_callback key at all."
                );
                $this->assertNotEmpty(
                    $handler['permission_callback'],
                    "Route {$path} has an empty permission_callback — it would be publicly readable."
                );
            }
        }
    }

    public function testListRequiresTheManageCapability(): void
    {
        $this->loginAsSubscriber();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) );

        $this->assertSame( 403, $response->get_status() );
    }

    public function testListRejectsLoggedOutVisitors(): void
    {
        wp_set_current_user( 0 );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) );

        $this->assertSame( 401, $response->get_status() );
    }

    public function testListReturnsForms(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) );
        $data     = $response->get_data();

        $this->assertSame( 200, $response->get_status() );
        $this->assertCount( 1, $data );
        $this->assertSame( $formId, $data[0]['id'] );
        $this->assertSame( 'Cleaning quote', $data[0]['title'] );
        $this->assertArrayHasKey( 'modified', $data[0] );
    }

    public function testListDoesNotIncludeTheSchema(): void
    {
        $this->loginAsManager();
        $this->createForm();

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $this->assertArrayNotHasKey( 'schema', $data[0] );
    }

    public function testListItemsExposeExactlyIdTitleAndModified(): void
    {
        $this->loginAsManager();
        $this->createForm();

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $this->assertSame( [ 'id', 'title', 'modified' ], array_keys( $data[0] ) );
    }

    public function testListExcludesTrashedForms(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();
        wp_trash_post( $formId );

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $this->assertSame( [], $data );
    }

    public function testListExcludesOtherPostTypes(): void
    {
        $this->loginAsManager();
        wp_insert_post( [ 'post_type' => 'post', 'post_title' => 'Blog post', 'post_status' => 'publish' ] );

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $this->assertSame( [], $data );
    }

    /**
     * Pins item 2: WordPress leaves `post_modified_gmt` as the zero-date on
     * drafts, and feeding that into `mysql_to_rfc3339()` used to produce the
     * garbage `-0001-11-30T00:00:00`.
     */
    public function testDraftFormReportsAValidModifiedDateNotTheZeroDateArtifact(): void
    {
        $this->loginAsManager();

        wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => 'Draft form',
                'post_status' => 'draft',
            ]
        );

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $modified = $data[0]['modified'];

        $this->assertStringNotContainsString( '-0001', $modified );

        $parsed = \DateTime::createFromFormat( 'Y-m-d\TH:i:s', $modified );

        $this->assertNotFalse( $parsed, "'{$modified}' did not parse as a Y-m-d\\TH:i:s date." );
        $this->assertGreaterThan( 2000, (int) $parsed->format( 'Y' ) );
    }

    public function testListIsOrderedByModifiedDescending(): void
    {
        $this->loginAsManager();

        $oldId = $this->createFormWithDate( 'Old', '2020-01-01 00:00:00' );
        $midId = $this->createFormWithDate( 'Mid', '2021-06-01 00:00:00' );
        $newId = $this->createFormWithDate( 'New', '2022-12-01 00:00:00' );

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms' ) )->get_data();

        $this->assertSame( [ $newId, $midId, $oldId ], array_column( $data, 'id' ) );
    }

    /**
     * Pins item 3: `get_posts()` forces `no_found_rows = true`, so a caller
     * had no way to learn there were more forms than the (hardcoded) cap.
     */
    public function testListPaginatesAndReportsTheTrueTotalInHeaders(): void
    {
        $this->loginAsManager();

        $this->createFormWithDate( 'One', '2020-01-01 00:00:00' );
        $this->createFormWithDate( 'Two', '2020-01-02 00:00:00' );
        $this->createFormWithDate( 'Three', '2020-01-03 00:00:00' );

        $firstPage = new WP_REST_Request( 'GET', '/quoteform/v1/forms' );
        $firstPage->set_param( 'per_page', 2 );
        $firstPage->set_param( 'page', 1 );

        $response = $this->server->dispatch( $firstPage );
        $headers  = $response->get_headers();

        $this->assertCount( 2, $response->get_data() );
        $this->assertSame( '3', $headers['X-WP-Total'] );
        $this->assertSame( '2', $headers['X-WP-TotalPages'] );

        $secondPage = new WP_REST_Request( 'GET', '/quoteform/v1/forms' );
        $secondPage->set_param( 'per_page', 2 );
        $secondPage->set_param( 'page', 2 );

        $secondResponse = $this->server->dispatch( $secondPage );

        $this->assertCount( 1, $secondResponse->get_data() );
    }

    public function testSingleFormReturnsTheSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );
        $data     = $response->get_data();

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( $formId, $data['id'] );
        $this->assertSame( SchemaRepository::defaults(), $data['schema'] );
    }

    public function testSingleFormExposesExactlyIdTitleAndSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) )->get_data();

        $this->assertSame( [ 'id', 'title', 'schema' ], array_keys( $data ) );
    }

    public function testSingleFormFallsBackToDefaultsWhenNoSchemaIsStored(): void
    {
        $this->loginAsManager();

        $formId = (int) wp_insert_post(
            [ 'post_type' => FormPostType::POST_TYPE, 'post_title' => 'Bare', 'post_status' => 'publish' ]
        );

        $data = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) )->get_data();

        $this->assertSame( SchemaRepository::defaults(), $data['schema'] );
    }

    /**
     * `_qform_schema` can hold something that is not an array — a truncated
     * `maybe_unserialize()`, a bad migration, a third-party meta write, a
     * partially-failed update. Before this fix, `getItem()` did `$schema ??
     * SchemaRepository::defaults()`, so a corrupt (non-null, non-array) value
     * fell through to a pristine default with nothing telling the caller the
     * stored value was unreadable — the user would then press Save and
     * overwrite the still-recoverable value in `wp_postmeta`. This must be
     * refused instead, distinctly from the legitimate "no schema stored" case
     * covered by `testSingleFormFallsBackToDefaultsWhenNoSchemaIsStored()`.
     */
    public function testSingleFormRefusesToServeDefaultsForACorruptSchema(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();

        update_post_meta( $formId, FormPostType::META_SCHEMA, 'not-an-array' );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 500, $response->get_status() );
        $this->assertSame( 'qform_schema_corrupt', $response->get_data()['code'] );
    }

    public function testSingleFormReturns404ForAMissingForm(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/999999' ) );

        $this->assertSame( 404, $response->get_status() );
        $this->assertSame( 'qform_form_not_found', $response->get_data()['code'] );
    }

    public function testSingleFormReturns404ForAPostOfTheWrongType(): void
    {
        $this->loginAsManager();
        $postId = (int) wp_insert_post( [ 'post_type' => 'post', 'post_title' => 'Blog post' ] );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $postId ) );

        $this->assertSame( 404, $response->get_status() );
    }

    public function testSingleFormReturns404ForAnAttachment(): void
    {
        $this->loginAsManager();
        $attachmentId = (int) wp_insert_post(
            [ 'post_type' => 'attachment', 'post_title' => 'Image', 'post_status' => 'inherit' ]
        );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $attachmentId ) );

        $this->assertSame( 404, $response->get_status() );
        $this->assertSame( 'qform_form_not_found', $response->get_data()['code'] );
    }

    public function testSingleFormReturns404ForARevision(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();

        wp_update_post( [ 'ID' => $formId, 'post_title' => 'Cleaning quote v2' ] );
        $revisions  = wp_get_post_revisions( $formId );
        $revisionId = (int) array_key_first( $revisions );

        $this->assertGreaterThan( 0, $revisionId, 'Expected a revision to have been created.' );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $revisionId ) );

        $this->assertSame( 404, $response->get_status() );
    }

    /**
     * Pins item 4: `SchemaRepository::exists()` deliberately keeps returning
     * `true` for a trashed form (Task 12's decision, needed for restore), so
     * this gate has to live in the controller, not the repository.
     */
    public function testGetItemOnATrashedFormReturns404(): void
    {
        $this->loginAsManager();
        $formId = $this->createForm();
        wp_trash_post( $formId );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 404, $response->get_status() );
        $this->assertSame( 'qform_form_not_found', $response->get_data()['code'] );
    }

    public function testSingleFormRequiresTheManageCapability(): void
    {
        $formId = $this->createForm();
        $this->loginAsSubscriber();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 403, $response->get_status() );
    }

    public function testSingleFormRejectsLoggedOutVisitors(): void
    {
        $formId = $this->createForm();
        wp_set_current_user( 0 );

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );

        $this->assertSame( 401, $response->get_status() );
    }

    public function testSingleFormRejectsAnIdOfZero(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/0' ) );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_invalid_param', $response->get_data()['code'] );
    }

    public function testSingleFormRejectsANegativeId(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/-1' ) );

        $this->assertSame( 404, $response->get_status() );
    }

    public function testSingleFormRejectsANonNumericId(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/abc' ) );

        $this->assertSame( 404, $response->get_status() );
    }

    public function testSingleFormRejectsAnOversizedId(): void
    {
        $this->loginAsManager();

        $response = $this->server->dispatch(
            new WP_REST_Request( 'GET', '/quoteform/v1/forms/99999999999999999999' )
        );

        $this->assertSame( 404, $response->get_status() );
        $this->assertSame( 'qform_form_not_found', $response->get_data()['code'] );
    }

    /**
     * No-existence-leak: an unauthorised caller must not be able to tell an
     * existing id from a nonexistent one from the response alone.
     */
    public function testUnauthorisedResponseIsIdenticalForExistingAndNonexistentIds(): void
    {
        $formId = $this->createForm();
        $this->loginAsSubscriber();

        $existing = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/' . $formId ) );
        $missing  = $this->server->dispatch( new WP_REST_Request( 'GET', '/quoteform/v1/forms/999999' ) );

        $this->assertSame( $existing->get_status(), $missing->get_status() );
        $this->assertSame( $existing->get_data()['code'], $missing->get_data()['code'] );
    }
}
