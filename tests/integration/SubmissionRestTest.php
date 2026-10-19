<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryRepository;
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

    protected function tearDown(): void
    {
        unset( $_COOKIE[ LOGGED_IN_COOKIE ] );
        parent::tearDown();
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

    private function rows(): array
    {
        global $wpdb;

        return $wpdb->get_results( 'SELECT * FROM ' . EntriesTable::name(), ARRAY_A );
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

    /**
     * The 404 response is what stops a stale form page from being cached and
     * replayed for a form that has since been unpublished — it must carry the
     * same no-store header as the 200 (Fix round 1, controller ruling R10).
     */
    public function testTheSessionsNotFoundResponseAlsoForbidsCaching(): void
    {
        $request = new WP_REST_Request( 'GET', '/quoteform/v1/session' );
        $request->set_param( 'form_id', $this->form( 'draft' ) );

        $response = $this->server->dispatch( $request );

        $this->assertSame( 404, $response->get_status() );
        $this->assertSame( 'qform_not_found', $response->get_data()['code'] );
        $this->assertStringContainsString( 'no-store', $response->get_headers()['Cache-Control'] );
    }

    /**
     * A string `values` payload never reaches `SubmissionService` at all here —
     * the `values` route arg is declared `'type' => 'object'`, so WP's own
     * schema-based arg validation rejects it (`rest_invalid_param`) before the
     * nonce is even checked. `SubmissionServiceTest` separately covers the
     * `InputSanitizer`/`BadSubmission` → `qform_bad_request` path at the
     * service layer for a non-array `values`; this test only proves the REST
     * boundary itself refuses the malformed payload with 400 and saves nothing.
     */
    public function testAStringValuesPayloadIsABadRequest(): void
    {
        $formId   = $this->form();
        $response = $this->post( [ 'form_id' => $formId, 'values' => 'not-an-object', 'hp' => '', 'ticket' => $this->oldTicket( $formId ), 'nonce' => wp_create_nonce( SubmissionService::NONCE_ACTION ) ] );

        $this->assertSame( 400, $response->get_status() );
        $this->assertSame( 'rest_invalid_param', $response->get_data()['code'] );
        $this->assertSame( [], $this->rows() );
    }

    public function testADraftFormRejectsASubmissionEvenWithAValidNonce(): void
    {
        $formId   = $this->form( 'draft' );
        $response = $this->post( [ 'form_id' => $formId, 'values' => [ 'rooms' => 2 ], 'hp' => '', 'ticket' => $this->oldTicket( $formId ), 'nonce' => wp_create_nonce( SubmissionService::NONCE_ACTION ) ] );

        $this->assertSame( 404, $response->get_status() );
        $this->assertSame( [], $this->rows() );
    }

    public function testAFilledHoneypotLooksLikeSuccessButSavesNothing(): void
    {
        $formId   = $this->form();
        $response = $this->post( [ 'form_id' => $formId, 'values' => [ 'rooms' => 2 ], 'hp' => 'filled', 'ticket' => $this->oldTicket( $formId ), 'nonce' => wp_create_nonce( SubmissionService::NONCE_ACTION ) ] );

        $this->assertSame( 201, $response->get_status() );
        $this->assertSame( [], $this->rows() );
    }

    /**
     * REST cookie auth (`rest_cookie_check_errors()`) forces `get_current_user_id()`
     * to 0 whenever the request carries no `X-WP-Nonce` header — which is exactly
     * how the frontend submits, since the CSRF guard here is the `qform_submit`
     * nonce, not `wp_rest`. `EntriesController` must still recover the real
     * logged-in user id from the `logged_in` auth cookie itself so spec §4.6's
     * "store the user id when the visitor is logged in" holds (Fix round 1,
     * controller ruling R10).
     */
    public function testTheLoggedInUserIdIsStoredEvenWithoutAnXWpNonceHeader(): void
    {
        $formId = $this->form();
        $userId = self::factory()->user->create();

        wp_set_current_user( 0 );
        $_COOKIE[ LOGGED_IN_COOKIE ] = wp_generate_auth_cookie( $userId, time() + 3600, 'logged_in' );

        $response = $this->post( [ 'form_id' => $formId, 'values' => [ 'rooms' => 2 ], 'hp' => '', 'ticket' => $this->oldTicket( $formId ), 'nonce' => wp_create_nonce( SubmissionService::NONCE_ACTION ) ] );

        $this->assertSame( 201, $response->get_status() );

        $entry = EntryRepository::hydrate( $this->rows()[0] );

        $this->assertSame( $userId, $entry['user_id'] );
    }
}
