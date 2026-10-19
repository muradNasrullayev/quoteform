<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryPreferences;
use Quoteform\Forms\FormPostType;
use Quoteform\Support\Capabilities;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_UnitTestCase;
use WP_User;

final class EntriesAdminRestTest extends WP_UnitTestCase
{
    use SeedsEntries;

    /** @var WP_REST_Server */
    private $server;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
        Capabilities::grantToAdministrator();
        update_option( 'timezone_string', 'UTC' );

        global $wp_rest_server;
        $wp_rest_server = new WP_REST_Server();
        $this->server   = $wp_rest_server;
        do_action( 'rest_api_init' );
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function asAdmin(): int
    {
        $id = self::factory()->user->create( [ 'role' => 'administrator' ] );
        wp_set_current_user( $id );

        return $id;
    }

    /** Redaktor + yalnız müraciət görmə icazəsi. */
    private function asViewer(): int
    {
        $id = self::factory()->user->create( [ 'role' => 'editor' ] );
        ( new WP_User( $id ) )->add_cap( Capabilities::VIEW_ENTRIES );
        wp_set_current_user( $id );

        return $id;
    }

    private function asEditor(): int
    {
        $id = self::factory()->user->create( [ 'role' => 'editor' ] );
        wp_set_current_user( $id );

        return $id;
    }

    /**
     * @param array<string, mixed>      $query
     * @param array<string, mixed>|null $body
     */
    private function call( string $method, string $route, array $query = [], ?array $body = null ): WP_REST_Response
    {
        $request = new WP_REST_Request( $method, $route );
        $request->set_query_params( $query );

        if ( null !== $body ) {
            $request->set_header( 'content-type', 'application/json' );
            $request->set_body( (string) wp_json_encode( $body ) );
        }

        return rest_ensure_response( $this->server->dispatch( $request ) );
    }

    public function testTheAdminMethodsJoinThePublicRoute(): void
    {
        $routes  = $this->server->get_routes();
        $methods = static function ( array $handlers ): array {
            $all = [];

            foreach ( $handlers as $handler ) {
                $all = array_merge( $all, array_keys( $handler['methods'] ) );
            }

            sort( $all );

            return $all;
        };

        $this->assertSame( [ 'GET', 'POST' ], $methods( $routes['/quoteform/v1/entries'] ) );
        $this->assertSame( [ 'DELETE', 'GET' ], $methods( $routes['/quoteform/v1/entries/(?P<id>[\d]+)'] ) );
        $this->assertSame( [ 'POST' ], $methods( $routes['/quoteform/v1/entries/batch'] ) );
    }

    public function testEveryAdminEndpointRefusesAUserWithoutTheCapability(): void
    {
        $id = $this->seedEntry();
        $this->asEditor();

        $this->assertSame( 403, $this->call( 'GET', '/quoteform/v1/entries' )->get_status() );
        $this->assertSame( 403, $this->call( 'GET', '/quoteform/v1/entries/' . $id )->get_status() );
        $this->assertSame( 403, $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'read', 'ids' => [ $id ] ] )->get_status() );
        $this->assertSame( 403, $this->call( 'DELETE', '/quoteform/v1/entries/' . $id )->get_status() );
        $this->assertNull( get_user_meta( get_current_user_id(), EntryPreferences::META, true ) ?: null );
    }

    public function testAViewerCanReadButNotDelete(): void
    {
        $id = $this->seedEntry();
        $this->asViewer();

        $this->assertSame( 200, $this->call( 'GET', '/quoteform/v1/entries' )->get_status() );
        $this->assertSame( 200, $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'read', 'ids' => [ $id ] ] )->get_status() );
        $this->assertSame( 403, $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'delete', 'ids' => [ $id ] ] )->get_status() );
        $this->assertSame( 403, $this->call( 'DELETE', '/quoteform/v1/entries/' . $id )->get_status() );
    }

    public function testTheListIsFilteredAndCountsUnread(): void
    {
        $this->asAdmin();
        $new  = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00', 'read_at' => '2026-09-22 10:00:00' ] );
        $newer = $this->seedEntry( [ 'created_at' => '2026-09-23 10:00:00' ] );

        $data = $this->call( 'GET', '/quoteform/v1/entries', [ 'status' => 'new', 'orderby' => 'nope' ] )->get_data();

        $this->assertSame( [ $newer, $new ], array_column( $data['items'], 'id' ) );
        $this->assertSame( 2, $data['total'] );
        $this->assertSame( 1, $data['pages'] );
        $this->assertSame( 1, $data['page'] );
        $this->assertSame( 20, $data['per_page'] );
        $this->assertSame( 2, $data['unread'] );
        $this->assertSame( [ 'id', 'form_id', 'form_title', 'is_read', 'name', 'email', 'total', 'total_display', 'date' ], array_keys( $data['items'][0] ) );
    }

    public function testAPageBeyondTheEndComesBackAsTheLastPage(): void
    {
        $this->asAdmin();

        for ( $i = 0; $i < 3; $i++ ) {
            $this->seedEntry();
        }

        $data = $this->call( 'GET', '/quoteform/v1/entries', [ 'page' => '7', 'per_page' => '2' ] )->get_data();

        $this->assertSame( 2, $data['page'] );
        $this->assertCount( 1, $data['items'] );
    }

    public function testThePerPageChoiceIsRememberedPerUser(): void
    {
        $admin = $this->asAdmin();

        $this->assertSame( 50, $this->call( 'GET', '/quoteform/v1/entries', [ 'per_page' => '50' ] )->get_data()['per_page'] );
        $this->assertSame( '50', get_user_meta( $admin, EntryPreferences::META, true ) );
        $this->assertSame( 50, $this->call( 'GET', '/quoteform/v1/entries' )->get_data()['per_page'] );
        $this->assertSame( 100, $this->call( 'GET', '/quoteform/v1/entries', [ 'per_page' => '500' ] )->get_data()['per_page'] );
        $this->assertSame( 100, $this->call( 'GET', '/quoteform/v1/entries', [ 'per_page' => 'lots' ] )->get_data()['per_page'] );

        $this->asViewer();
        $this->assertSame( 20, $this->call( 'GET', '/quoteform/v1/entries' )->get_data()['per_page'], 'another user keeps the default' );
    }

    public function testOpeningAnEntryMarksItReadOnce(): void
    {
        global $wpdb;

        $this->asAdmin();
        $id = $this->seedEntry();
        $this->seedEntry();

        $data = $this->call( 'GET', '/quoteform/v1/entries/' . $id )->get_data();

        $this->assertTrue( $data['is_read'] );
        $this->assertSame( 1, $data['unread'] );

        $wpdb->update( EntriesTable::name(), [ 'read_at' => '2026-01-01 00:00:00' ], [ 'id' => $id ] );
        $this->call( 'GET', '/quoteform/v1/entries/' . $id );

        $this->assertSame( '2026-01-01 00:00:00', $wpdb->get_var( $wpdb->prepare( 'SELECT read_at FROM ' . EntriesTable::name() . ' WHERE id = %d', $id ) ) );
    }

    public function testTheDetailCarriesNeighboursForTheCurrentFilters(): void
    {
        $this->asAdmin();
        $a = $this->seedEntry( [ 'form_id' => 1, 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'form_id' => 2, 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'form_id' => 1, 'created_at' => '2026-09-22 10:00:00' ] );

        $this->assertSame( [ 'previous' => $b, 'next' => null ], $this->call( 'GET', '/quoteform/v1/entries/' . $a )->get_data()['neighbours'] );
        $this->assertSame( [ 'previous' => $c, 'next' => null ], $this->call( 'GET', '/quoteform/v1/entries/' . $a, [ 'form' => '1' ] )->get_data()['neighbours'] );
    }

    public function testReadingNewEntriesOneByOneKeepsFindingTheNextNewOne(): void
    {
        $this->asAdmin();
        $a = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'created_at' => '2026-09-22 10:00:00' ] );

        $first = $this->call( 'GET', '/quoteform/v1/entries/' . $c, [ 'status' => 'new' ] )->get_data();
        $this->assertSame( $b, $first['neighbours']['next'] );

        $second = $this->call( 'GET', '/quoteform/v1/entries/' . $b, [ 'status' => 'new' ] )->get_data();
        $this->assertSame( [ 'previous' => null, 'next' => $a ], $second['neighbours'], 'c is read now, so it is no longer a New neighbour' );
    }

    public function testDraftsAndUnknownIdsAreNotFound(): void
    {
        $this->asAdmin();
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );

        foreach ( [ $draft, 999999 ] as $id ) {
            $response = $this->call( 'GET', '/quoteform/v1/entries/' . $id );

            $this->assertSame( 404, $response->get_status() );
            $this->assertSame( 'qform_entry_not_found', $response->get_data()['code'] );
        }
    }

    /**
     * @dataProvider badBatches
     * @param array<string, mixed> $body
     */
    public function testMalformedBatchesAreRejected( array $body ): void
    {
        $this->asAdmin();

        $this->assertSame( 400, $this->call( 'POST', '/quoteform/v1/entries/batch', [], $body )->get_status() );
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function badBatches(): array
    {
        return [
            'no ids'          => [ [ 'action' => 'read', 'ids' => [] ] ],
            '101 ids'         => [ [ 'action' => 'read', 'ids' => range( 1, 101 ) ] ],
            'a word'          => [ [ 'action' => 'read', 'ids' => [ 'abc' ] ] ],
            'zero'            => [ [ 'action' => 'read', 'ids' => [ 0 ] ] ],
            'negative'        => [ [ 'action' => 'delete', 'ids' => [ -4 ] ] ],
            'unknown action'  => [ [ 'action' => 'archive', 'ids' => [ 1 ] ] ],
        ];
    }

    public function testBatchActionsReportWhatTheyTouched(): void
    {
        $this->asAdmin();
        $a = $this->seedEntry();
        $b = $this->seedEntry();

        $this->assertSame( [ 'affected' => 2, 'unread' => 0 ], $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'read', 'ids' => [ $a, $b, $b ] ] )->get_data() );
        $this->assertSame( [ 'affected' => 1, 'unread' => 1 ], $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'unread', 'ids' => [ $a ] ] )->get_data() );
        $this->assertSame( [ 'affected' => 2, 'unread' => 0 ], $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'delete', 'ids' => [ $a, $b, 999999 ] ] )->get_data() );
        $this->assertSame( [ 'affected' => 0, 'unread' => 0 ], $this->call( 'POST', '/quoteform/v1/entries/batch', [], [ 'action' => 'delete', 'ids' => [ $a ] ] )->get_data() );
    }

    public function testDeletingOneEntry(): void
    {
        $this->asAdmin();
        $id = $this->seedEntry();

        $this->assertSame( [ 'id' => $id, 'deleted' => true, 'unread' => 0 ], $this->call( 'DELETE', '/quoteform/v1/entries/' . $id )->get_data() );
        $this->assertSame( 404, $this->call( 'DELETE', '/quoteform/v1/entries/' . $id )->get_status() );
    }
}
