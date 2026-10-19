<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Forms\FormPostType;
use Quoteform\Support\Capabilities;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_UnitTestCase;
use WP_User;

/**
 * "Bu filtrə uyğun bütün müraciətlər" (Gmail üslubu) toplu əməliyyatı:
 * `POST /entries/batch` `{ action, scope: 'filter', up_to_id, …filtrlər }` və
 * siyahı cavabındakı `max_id`.
 */
final class EntriesBatchFilterScopeTest extends WP_UnitTestCase
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

    /**
     * @return int[] qalan bütün sətirlərin id-ləri (qaralamalar daxil), artan sıra ilə
     */
    private function remaining(): array
    {
        global $wpdb;

        return array_map( 'intval', $wpdb->get_col( 'SELECT id FROM ' . EntriesTable::name() . ' ORDER BY id ASC' ) );
    }

    /**
     * @param array<string, mixed> $body
     */
    private function batchCall( array $body ): WP_REST_Response
    {
        return $this->call( 'POST', '/quoteform/v1/entries/batch', [], $body );
    }

    public function testDeletingByFilterRemovesOnlyTheMatchingEntries(): void
    {
        $this->asAdmin();
        $match   = $this->seedEntry( [ 'form_id' => 7, 'created_at' => '2026-09-21 10:00:00', 'total_decimal' => '150.0000' ] );
        $match2  = $this->seedEntry( [ 'form_id' => 7, 'created_at' => '2026-09-22 10:00:00', 'total_decimal' => '200.0000' ] );
        $form    = $this->seedEntry( [ 'form_id' => 8, 'created_at' => '2026-09-21 10:00:00', 'total_decimal' => '150.0000' ] );
        $read    = $this->seedEntry( [ 'form_id' => 7, 'created_at' => '2026-09-21 10:00:00', 'total_decimal' => '150.0000', 'read_at' => '2026-09-23 10:00:00' ] );
        $early   = $this->seedEntry( [ 'form_id' => 7, 'created_at' => '2026-09-10 10:00:00', 'total_decimal' => '150.0000' ] );
        $cheap   = $this->seedEntry( [ 'form_id' => 7, 'created_at' => '2026-09-21 10:00:00', 'total_decimal' => '10.0000' ] );

        $response = $this->batchCall( [
            'action'   => 'delete',
            'scope'    => 'filter',
            'up_to_id' => $cheap,
            'expected_total' => 2,
            'form'     => '7',
            'status'   => 'new',
            'from'     => '2026-09-20',
            'to'       => '2026-09-25',
            'min'      => '100',
        ] );

        $this->assertSame( 200, $response->get_status() );
        $this->assertSame( [ 'affected' => 2, 'unread' => 3 ], $response->get_data() );
        $this->assertSame( [ $form, $read, $early, $cheap ], $this->remaining() );
        $this->assertNotContains( $match, $this->remaining() );
        $this->assertNotContains( $match2, $this->remaining() );
    }

    public function testEntriesThatArrivedAfterTheListLoadedSurvive(): void
    {
        $this->asAdmin();
        $a = $this->seedEntry();
        $b = $this->seedEntry();

        $list  = $this->call( 'GET', '/quoteform/v1/entries' )->get_data();
        $maxId = $list['max_id'];
        $late  = $this->seedEntry(); // sayt açıq ikən gələn yeni müraciət

        $data = $this->batchCall( [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => $maxId, 'expected_total' => $list['total'] ] )->get_data();

        $this->assertSame( $b, $maxId );
        $this->assertSame( [ 'affected' => 2, 'unread' => 1 ], $data );
        $this->assertSame( [ $late ], $this->remaining() );
        $this->assertNotContains( $a, $this->remaining() );
    }

    public function testMarkingByFilterTouchesOnlyTheMatchingEntries(): void
    {
        global $wpdb;

        $this->asAdmin();
        $a     = $this->seedEntry( [ 'form_id' => 7 ] );
        $b     = $this->seedEntry( [ 'form_id' => 7 ] );
        $other = $this->seedEntry( [ 'form_id' => 8 ] );
        $late  = $this->seedEntry( [ 'form_id' => 7 ] );

        $read = $this->batchCall( [ 'action' => 'read', 'scope' => 'filter', 'up_to_id' => $other, 'expected_total' => 2, 'form' => '7', 'status' => 'new' ] )->get_data();

        $this->assertSame( [ 'affected' => 2, 'unread' => 2 ], $read, 'affected counts the matching entries even though they leave the New filter' );

        $unreadIds = array_map( 'intval', $wpdb->get_col( 'SELECT id FROM ' . EntriesTable::name() . ' WHERE read_at IS NULL ORDER BY id' ) );
        $this->assertSame( [ $other, $late ], $unreadIds );

        $unread = $this->batchCall( [ 'action' => 'unread', 'scope' => 'filter', 'up_to_id' => $late, 'expected_total' => 3, 'form' => '7' ] )->get_data();

        $this->assertSame( [ 'affected' => 3, 'unread' => 4 ], $unread, 'already-unread entries still count (D7)' );
        $this->assertSame( [ $a, $b, $other, $late ], $this->remaining() );
    }

    public function testAViewerMayMarkByFilterButNotDelete(): void
    {
        $id = $this->seedEntry();
        $this->asViewer();

        $this->assertSame( 403, $this->batchCall( [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => $id, 'expected_total' => 1 ] )->get_status() );
        $this->assertSame( [ $id ], $this->remaining() );
        $this->assertSame( 200, $this->batchCall( [ 'action' => 'read', 'scope' => 'filter', 'up_to_id' => $id, 'expected_total' => 1 ] )->get_status() );
    }

    /**
     * @dataProvider badShapes
     * @param array<string, mixed> $body
     */
    public function testAmbiguousOrIncompleteShapesAreRejected( array $body ): void
    {
        $this->asAdmin();
        $id = $this->seedEntry();

        $this->assertSame( 400, $this->batchCall( $body )->get_status() );
        $this->assertSame( [ $id ], $this->remaining(), 'nothing is touched' );
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function badShapes(): array
    {
        return [
            'ids and scope'          => [ [ 'action' => 'delete', 'ids' => [ 1 ], 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => 1 ] ],
            'neither'                => [ [ 'action' => 'delete' ] ],
            'scope without up_to_id' => [ [ 'action' => 'delete', 'scope' => 'filter', 'expected_total' => 1 ] ],
            'up_to_id zero'          => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 0, 'expected_total' => 1 ] ],
            'up_to_id negative'      => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => -3, 'expected_total' => 1 ] ],
            'up_to_id a word'        => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 'all', 'expected_total' => 1 ] ],
            'up_to_id without scope' => [ [ 'action' => 'delete', 'up_to_id' => 5 ] ],
            'ids with up_to_id'      => [ [ 'action' => 'delete', 'ids' => [ 1 ], 'up_to_id' => 5 ] ],
            'scope without expected_total' => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 5 ] ],
            'expected_total negative'      => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => -1 ] ],
            'expected_total a word'        => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => 'all' ] ],
            'ids with expected_total'      => [ [ 'action' => 'delete', 'ids' => [ 1 ], 'expected_total' => 1 ] ],
            'unknown scope'          => [ [ 'action' => 'delete', 'scope' => 'everything', 'up_to_id' => 5, 'expected_total' => 1 ] ],
            // Dağıdıcı yolda tanınmayan filtr səssizcə "filtrsiz" olmamalıdır (hər şeyi silərdi).
            'unreadable form'        => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => 1, 'form' => 'seven' ] ],
            'form as a number'       => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => 1, 'form' => 7 ] ],
            'unreadable status'      => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => 1, 'status' => 'old' ] ],
            'impossible date'        => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => 1, 'from' => '2026-02-30' ] ],
            'unreadable total'       => [ [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => 1, 'max' => '1e3' ] ],
        ];
    }

    public function testTheRejectionsSayWhatWasWrong(): void
    {
        $this->asAdmin();

        $this->assertSame( 'qform_invalid_batch', $this->batchCall( [ 'action' => 'read' ] )->get_data()['code'] );

        $badFilter = $this->batchCall( [ 'action' => 'read', 'scope' => 'filter', 'up_to_id' => 5, 'expected_total' => 1, 'status' => 'old' ] )->get_data();

        $this->assertSame( 'qform_invalid_filter', $badFilter['code'] );
        $this->assertSame( 'status', $badFilter['data']['param'] );
    }

    public function testAnEmptyFilterDeletesEveryCompletedEntryUpToTheLimitAndNoDrafts(): void
    {
        $this->asAdmin();
        $this->seedEntry();
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );
        $this->seedEntry( [ 'read_at' => '2026-09-22 10:00:00' ] );
        $last = $this->seedEntry( [ 'form_id' => 99 ] );

        $data = $this->batchCall( [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => $last, 'expected_total' => 3 ] )->get_data();

        $this->assertSame( [ 'affected' => 3, 'unread' => 0 ], $data );
        $this->assertSame( [ $draft ], $this->remaining() );
    }

    public function testMoreThanOneChunkIsDeleted(): void
    {
        global $wpdb;

        $this->asAdmin();
        $table = EntriesTable::name();

        // 501 sətir: 500-lük bir hissədən çox.
        for ( $i = 0; $i < 501; $i++ ) {
            $this->seedEntry();
        }

        $other = $this->seedEntry( [ 'form_id' => 2 ] );

        $this->assertSame( 502, (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" ) );

        $deletes = [];
        $spy     = static function ( string $sql ) use ( &$deletes, $table ): string {
            if ( 0 === strpos( ltrim( $sql ), 'DELETE FROM ' . $table ) ) {
                $deletes[] = substr_count( $sql, ',' ) + 1; // IN (...) siyahısındakı id sayı
            }

            return $sql;
        };

        add_filter( 'query', $spy );
        $data = $this->batchCall( [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => $other, 'expected_total' => 501, 'form' => '1' ] )->get_data();
        remove_filter( 'query', $spy );

        $this->assertSame( [ 500, 1 ], $deletes, 'two DELETEs of at most 500 ids each' );
        $this->assertSame( 501, $data['affected'] );
        $this->assertSame( [ $other ], $this->remaining() );
    }

    public function testAnOlderEntryThatJoinedTheFilterStopsTheBatchAndChangesNothing(): void
    {
        global $wpdb;

        $this->asAdmin();
        $a = $this->seedEntry();
        $b = $this->seedEntry( [ 'read_at' => '2026-09-22 10:00:00' ] );
        $c = $this->seedEntry();

        $list = $this->call( 'GET', '/quoteform/v1/entries', [ 'status' => 'new' ] )->get_data();
        $this->assertSame( [ 2, $c ], [ $list['total'], $list['max_id'] ] );

        // Başqa admin `b`-ni oxunmamış edir: id-si max_id-dən kiçikdir, amma indi "New" filtrindədir.
        $wpdb->update( EntriesTable::name(), [ 'read_at' => null ], [ 'id' => $b ] );

        foreach ( [ 'delete', 'read' ] as $action ) {
            $response = $this->batchCall( [ 'action' => $action, 'scope' => 'filter', 'up_to_id' => $list['max_id'], 'expected_total' => $list['total'], 'status' => 'new' ] );

            $this->assertSame( 409, $response->get_status(), $action );
            $this->assertSame( 'qform_list_changed', $response->get_data()['code'], $action );
        }

        $this->assertSame( [ $a, $b, $c ], $this->remaining() );
        $this->assertSame( 3, (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . EntriesTable::name() . ' WHERE read_at IS NULL' ), 'nothing was marked read' );
    }

    public function testAnEntryThatLeftTheFilterAlsoStopsTheBatch(): void
    {
        global $wpdb;

        $this->asAdmin();
        $a = $this->seedEntry();
        $b = $this->seedEntry();

        $wpdb->update( EntriesTable::name(), [ 'read_at' => '2026-09-22 10:00:00' ], [ 'id' => $a ] );

        $response = $this->batchCall( [ 'action' => 'delete', 'scope' => 'filter', 'up_to_id' => $b, 'expected_total' => 2, 'status' => 'new' ] );

        $this->assertSame( 409, $response->get_status() );
        $this->assertSame( [ $a, $b ], $this->remaining() );
    }

    public function testMarkingMoreThanOneChunk(): void
    {
        global $wpdb;

        $this->asAdmin();
        $table = EntriesTable::name();

        for ( $i = 0; $i < 501; $i++ ) {
            $last = $this->seedEntry();
        }

        $updates = [];
        $spy     = static function ( string $sql ) use ( &$updates, $table ): string {
            if ( 0 === strpos( ltrim( $sql ), 'UPDATE ' . $table ) && false !== strpos( $sql, 'id IN (' ) ) {
                $list      = substr( $sql, strpos( $sql, 'id IN (' ) );
                $updates[] = substr_count( substr( $list, 0, (int) strpos( $list, ')' ) ), ',' ) + 1;
            }

            return $sql;
        };

        add_filter( 'query', $spy );
        $data = $this->batchCall( [ 'action' => 'read', 'scope' => 'filter', 'up_to_id' => $last, 'expected_total' => 501 ] )->get_data();
        remove_filter( 'query', $spy );

        $this->assertSame( [ 500, 1 ], $updates, 'two UPDATEs of at most 500 ids each' );
        $this->assertSame( [ 'affected' => 501, 'unread' => 0 ], $data );
    }

    public function testTheListCarriesTheHighestIdInTheWholeFilter(): void
    {
        $this->asAdmin();
        $this->seedEntry( [ 'form_id' => 7, 'created_at' => '2026-09-25 10:00:00' ] );
        $top = $this->seedEntry( [ 'form_id' => 7, 'created_at' => '2026-09-01 10:00:00' ] ); // son səhifədə, amma ən böyük id
        $this->seedEntry( [ 'form_id' => 8, 'created_at' => '2026-09-26 10:00:00' ] );
        $this->seedEntry( [ 'form_id' => 7, 'status' => 'draft' ] );

        $data = $this->call( 'GET', '/quoteform/v1/entries', [ 'form' => '7', 'per_page' => '1' ] )->get_data();

        $this->assertSame( 2, $data['total'] );
        $this->assertCount( 1, $data['items'] );
        $this->assertNotSame( $top, $data['items'][0]['id'] );
        $this->assertSame( $top, $data['max_id'] );
        $this->assertNull( $this->call( 'GET', '/quoteform/v1/entries', [ 'form' => '55' ] )->get_data()['max_id'] );
    }
}
