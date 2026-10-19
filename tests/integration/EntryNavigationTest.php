<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

final class EntryNavigationTest extends WP_UnitTestCase
{
    use SeedsEntries;

    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
        EntriesTable::install();
        update_option( 'timezone_string', 'UTC' );
    }

    /**
     * @param array<string, mixed> $params
     * @return array{previous: ?int, next: ?int}
     */
    private function around( int $id, array $params = [] ): array
    {
        $repository = new EntryRepository();

        return $repository->neighbours( EntryQuery::forSite( $params ), $repository->findCompleted( $id ) );
    }

    private function readAt( int $id ): ?string
    {
        global $wpdb;

        $value = $wpdb->get_var( $wpdb->prepare( 'SELECT read_at FROM ' . EntriesTable::name() . ' WHERE id = %d', $id ) );

        return null === $value ? null : (string) $value;
    }

    public function testNewestFirstNeighbours(): void
    {
        $a = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'created_at' => '2026-09-22 10:00:00' ] );

        $this->assertSame( [ 'previous' => $c, 'next' => $a ], $this->around( $b ) );
        $this->assertSame( [ 'previous' => null, 'next' => $b ], $this->around( $c ) );
        $this->assertSame( [ 'previous' => $b, 'next' => null ], $this->around( $a ) );
        $this->assertSame( [ 'previous' => $a, 'next' => $c ], $this->around( $b, [ 'order' => 'asc' ] ) );
    }

    public function testEntriesFromTheSameSecondAreSteppedThroughById(): void
    {
        $first  = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $second = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $third  = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );

        $this->assertSame( [ 'previous' => $third, 'next' => $first ], $this->around( $second ) );
    }

    public function testNeighboursStayInsideTheFilter(): void
    {
        $a = $this->seedEntry( [ 'form_id' => 1, 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'form_id' => 2, 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'form_id' => 1, 'created_at' => '2026-09-22 10:00:00' ] );

        $this->assertSame( [ 'previous' => $b, 'next' => null ], $this->around( $a ) );
        $this->assertSame( [ 'previous' => $c, 'next' => null ], $this->around( $a, [ 'form' => '1' ] ) );
    }

    public function testAnEntryReadOnTheWayStillFindsTheNextNewOne(): void
    {
        $a = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $b = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $c = $this->seedEntry( [ 'created_at' => '2026-09-22 10:00:00' ] );

        ( new EntryRepository() )->markRead( $b );

        $this->assertSame( [ 'previous' => $c, 'next' => $a ], $this->around( $b, [ 'status' => 'new' ] ) );
    }

    public function testFailedCalculationsAreReachedFromBothSides(): void
    {
        $dear  = $this->seedEntry( [ 'total_decimal' => '50.0000' ] );
        $cheap = $this->seedEntry( [ 'total_decimal' => '5.0000' ] );
        $nullA = $this->seedEntry( [ 'total_decimal' => null ] );
        $nullB = $this->seedEntry( [ 'total_decimal' => null ] );

        // Ən bahalı əvvəl: dear, cheap, nullB, nullA (NULL blok id DESC).
        $byTotal = [ 'orderby' => 'total' ];
        $this->assertSame( [ 'previous' => $dear, 'next' => $nullB ], $this->around( $cheap, $byTotal ) );
        $this->assertSame( [ 'previous' => $cheap, 'next' => $nullA ], $this->around( $nullB, $byTotal ) );
        $this->assertSame( [ 'previous' => $nullB, 'next' => null ], $this->around( $nullA, $byTotal ) );

        // Ən ucuz əvvəl: cheap, dear, nullA, nullB.
        $cheapFirst = [ 'orderby' => 'total', 'order' => 'asc' ];
        $this->assertSame( [ 'previous' => $cheap, 'next' => $nullA ], $this->around( $dear, $cheapFirst ) );
        $this->assertSame( [ 'previous' => $dear, 'next' => $nullB ], $this->around( $nullA, $cheapFirst ) );
    }

    public function testTotalsThatDifferOnlyInTheLastDecimalAreNotEqual(): void
    {
        // Böyüyü KİÇİK id ilə: double müqayisəsində ikisi bərabər görünsəydi, id tie-breaker onu səhv tərəfə atardı.
        $high = $this->seedEntry( [ 'total_decimal' => '12345678901234.5679' ] );
        $low  = $this->seedEntry( [ 'total_decimal' => '12345678901234.5678' ] );

        $byTotal = [ 'orderby' => 'total' ];
        $this->assertSame( [ 'previous' => $high, 'next' => null ], $this->around( $low, $byTotal ) );
        $this->assertSame( [ 'previous' => null, 'next' => $low ], $this->around( $high, $byTotal ) );
    }

    public function testSlicesWalkTheWholeListOnceInOrder(): void
    {
        foreach ( [ '2026-09-23', '2026-09-20', '2026-09-22', '2026-09-22', '2026-09-21', '2026-09-24', '2026-09-20' ] as $day ) {
            $this->seedEntry( [ 'created_at' => $day . ' 08:00:00' ] );
        }

        $repository = new EntryRepository();
        $query      = EntryQuery::forSite( [] );
        $walked     = [];
        $after      = null;

        do {
            $batch  = $repository->slice( $query, $after, 3 );
            $walked = array_merge( $walked, array_column( $batch, 'id' ) );
            $after  = [] === $batch ? null : end( $batch );
        } while ( 3 === count( $batch ) );

        $this->assertSame( array_column( $repository->page( $query, 1, 20 )['items'], 'id' ), $walked );
    }

    public function testAnEntryIsMarkedReadOnlyOnce(): void
    {
        global $wpdb;

        $id         = $this->seedEntry();
        $repository = new EntryRepository();

        $this->assertTrue( $repository->markRead( $id ) );
        $this->assertNotNull( $this->readAt( $id ) );

        $wpdb->update( EntriesTable::name(), [ 'read_at' => '2026-01-01 00:00:00' ], [ 'id' => $id ] );

        $this->assertFalse( $repository->markRead( $id ) );
        $this->assertSame( '2026-01-01 00:00:00', $this->readAt( $id ) );
    }

    public function testSetReadCountsTheEntriesItCovers(): void
    {
        $fresh = $this->seedEntry();
        $old   = $this->seedEntry( [ 'read_at' => '2026-01-01 00:00:00' ] );
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );

        $repository = new EntryRepository();

        $this->assertSame( 2, $repository->setRead( [ $fresh, $old, $draft, 999999 ], true ) );
        $this->assertNotNull( $this->readAt( $fresh ) );
        $this->assertSame( '2026-01-01 00:00:00', $this->readAt( $old ), 'an earlier read time is kept' );
        $this->assertNull( $this->readAt( $draft ) );

        $this->assertSame( 2, $repository->setRead( [ $fresh, $old ], false ) );
        $this->assertNull( $this->readAt( $fresh ) );
        $this->assertNull( $this->readAt( $old ) );
        $this->assertSame( 0, $repository->setRead( [], true ) );
    }

    public function testDeleteCountsOnlyWhatItRemoved(): void
    {
        $gone  = $this->seedEntry();
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );

        $repository = new EntryRepository();

        $this->assertSame( 1, $repository->delete( [ $gone, $draft, 999999 ] ) );
        $this->assertSame( 0, $repository->delete( [ $gone ] ), 'deleting twice is not an error and removes nothing' );
        $this->assertNotNull( $repository->find( $draft ) );
        $this->assertSame( 0, $repository->delete( [] ) );
    }
}
