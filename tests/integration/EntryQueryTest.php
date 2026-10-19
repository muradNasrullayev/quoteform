<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Entries\FormDirectory;
use Quoteform\Forms\FormPostType;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

final class EntryQueryTest extends WP_UnitTestCase
{
    use SeedsEntries;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
        update_option( 'timezone_string', 'UTC' );
        update_option( 'gmt_offset', 0 );
    }

    /**
     * @param array<string, mixed> $params
     * @return int[]
     */
    private function listed( array $params, int $page = 1, int $perPage = 20 ): array
    {
        return array_column( ( new EntryRepository() )->page( EntryQuery::forSite( $params ), $page, $perPage )['items'], 'id' );
    }

    private function form( string $status = 'publish', string $title = 'Quote' ): int
    {
        return self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => $status, 'post_title' => $title ] );
    }

    public function testOnlyCompletedEntriesAreListedNewestFirst(): void
    {
        $old = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $new = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00' ] );
        $this->seedEntry( [ 'status' => 'draft', 'created_at' => '2026-09-22 10:00:00' ] );

        $this->assertSame( [ $new, $old ], $this->listed( [] ) );
    }

    public function testEntriesFromTheSameSecondAreOrderedById(): void
    {
        $first  = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );
        $second = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00' ] );

        $this->assertSame( [ $second, $first ], $this->listed( [] ) );
        $this->assertSame( [ $first, $second ], $this->listed( [ 'order' => 'asc' ] ) );
    }

    public function testTheFormFilterKeepsOneForm(): void
    {
        $mine = $this->seedEntry( [ 'form_id' => 7 ] );
        $this->seedEntry( [ 'form_id' => 8 ] );

        $this->assertSame( [ $mine ], $this->listed( [ 'form' => '7' ] ) );
    }

    public function testDeletedFormsMeansMissingOrTrashedForms(): void
    {
        $live    = $this->form();
        $trashed = $this->form( 'trash' );

        $this->seedEntry( [ 'form_id' => $live ] );
        $inTrash = $this->seedEntry( [ 'form_id' => $trashed ] );
        $missing = $this->seedEntry( [ 'form_id' => 999999 ] );

        $this->assertEqualsCanonicalizing( [ $inTrash, $missing ], $this->listed( [ 'form' => 'deleted' ] ) );
        $this->assertSame( [ $live => 'Quote' ], FormDirectory::titles( [ $live, $trashed, 999999 ] ) );
    }

    public function testDeletedFormsWithNoFormsLeftListsEverything(): void
    {
        $a = $this->seedEntry( [ 'form_id' => 5 ] );
        $b = $this->seedEntry( [ 'form_id' => 6 ] );

        $this->assertEqualsCanonicalizing( [ $a, $b ], $this->listed( [ 'form' => 'deleted' ] ) );
    }

    public function testTheStatusFilterSplitsNewFromRead(): void
    {
        $unread = $this->seedEntry();
        $read   = $this->seedEntry( [ 'read_at' => '2026-09-25 09:00:00' ] );

        $this->assertSame( [ $unread ], $this->listed( [ 'status' => 'new' ] ) );
        $this->assertSame( [ $read ], $this->listed( [ 'status' => 'read' ] ) );
    }

    public function testDayBoundariesFollowTheSiteTimezone(): void
    {
        update_option( 'timezone_string', 'Asia/Baku' ); // UTC+4, yay vaxtı yoxdur.

        $justAfterMidnight = $this->seedEntry( [ 'created_at' => '2026-09-24 20:30:00' ] ); // Bakıda 25-i 00:30
        $lastSecondBefore  = $this->seedEntry( [ 'created_at' => '2026-09-24 19:59:59' ] ); // Bakıda 24-ü 23:59:59

        $this->assertSame( [ $justAfterMidnight ], $this->listed( [ 'from' => '2026-09-25', 'to' => '2026-09-25' ] ) );
        $this->assertSame( [ $lastSecondBefore ], $this->listed( [ 'from' => '2026-09-24', 'to' => '2026-09-24' ] ) );
    }

    public function testTheWholeToDayIsIncludedWithAManualOffset(): void
    {
        update_option( 'timezone_string', '' );
        update_option( 'gmt_offset', -5 );

        $lastSecond = $this->seedEntry( [ 'created_at' => '2026-09-26 04:59:59' ] ); // yerli 25-i 23:59:59
        $this->seedEntry( [ 'created_at' => '2026-09-26 05:00:00' ] );               // yerli 26-sı 00:00:00

        $this->assertSame( [ $lastSecond ], $this->listed( [ 'from' => '2026-09-25', 'to' => '2026-09-25' ] ) );
    }

    public function testTheTotalRangeIsInclusiveAndLeavesOutFailedCalculations(): void
    {
        $ten    = $this->seedEntry( [ 'total_decimal' => '10.0000' ] );
        $twenty = $this->seedEntry( [ 'total_decimal' => '20.0000' ] );
        $this->seedEntry( [ 'total_decimal' => '30.0000' ] );
        $failed = $this->seedEntry( [ 'total_decimal' => null ] );

        $this->assertEqualsCanonicalizing( [ $ten, $twenty ], $this->listed( [ 'min' => '10', 'max' => '20' ] ) );
        $this->assertNotContains( $failed, $this->listed( [ 'min' => '-1' ] ) );
        $this->assertContains( $failed, $this->listed( [] ) );
    }

    public function testTotalsAreComparedAsExactDecimals(): void
    {
        $low  = $this->seedEntry( [ 'total_decimal' => '12345678901234.5678' ] );
        $high = $this->seedEntry( [ 'total_decimal' => '12345678901234.5679' ] );

        $this->assertSame( [ $high ], $this->listed( [ 'min' => '12345678901234.5679' ] ) );
        $this->assertSame( [ $low ], $this->listed( [ 'max' => '12345678901234.5678' ] ) );
    }

    public function testSortingByTotalKeepsFailedCalculationsLastBothWays(): void
    {
        $cheap  = $this->seedEntry( [ 'total_decimal' => '5.0000' ] );
        $failed = $this->seedEntry( [ 'total_decimal' => null ] );
        $dear   = $this->seedEntry( [ 'total_decimal' => '50.0000' ] );

        $this->assertSame( [ $dear, $cheap, $failed ], $this->listed( [ 'orderby' => 'total' ] ) );
        $this->assertSame( [ $cheap, $dear, $failed ], $this->listed( [ 'orderby' => 'total', 'order' => 'asc' ] ) );
    }

    public function testAnInjectedSortFallsBackToNewestFirst(): void
    {
        $old = $this->seedEntry( [ 'created_at' => '2026-09-20 10:00:00', 'total_decimal' => '99.0000' ] );
        $new = $this->seedEntry( [ 'created_at' => '2026-09-21 10:00:00', 'total_decimal' => '1.0000' ] );

        $this->assertSame( [ $new, $old ], $this->listed( [ 'orderby' => 'total; DROP TABLE wp_users', 'order' => 'asc --' ] ) );
    }

    public function testAPageBeyondTheEndShowsTheLastPage(): void
    {
        for ( $i = 0; $i < 5; $i++ ) {
            $this->seedEntry( [ 'created_at' => sprintf( '2026-09-2%d 10:00:00', $i ) ] );
        }

        $result = ( new EntryRepository() )->page( EntryQuery::forSite( [] ), 9, 2 );

        $this->assertSame( 3, $result['page'] );
        $this->assertSame( 3, $result['pages'] );
        $this->assertSame( 5, $result['total'] );
        $this->assertCount( 1, $result['items'] );
    }

    public function testAnEmptyListIsPageOneOfNone(): void
    {
        $result = ( new EntryRepository() )->page( EntryQuery::forSite( [] ), 4, 20 );

        $this->assertSame( [ 'items' => [], 'total' => 0, 'page' => 1, 'pages' => 0 ], $result );
    }

    public function testTheRawTotalIsTheStoredDecimal(): void
    {
        $this->seedEntry( [ 'total_decimal' => '12345678901234.5678' ] );

        $items = ( new EntryRepository() )->page( EntryQuery::forSite( [] ), 1, 20 )['items'];

        $this->assertSame( '12345678901234.5678', $items[0]['total_decimal'] );
    }

    public function testTheUnreadCountSkipsReadEntriesAndDrafts(): void
    {
        $this->seedEntry();
        $this->seedEntry();
        $this->seedEntry( [ 'read_at' => '2026-09-25 09:00:00' ] );
        $this->seedEntry( [ 'status' => 'draft' ] );

        $this->assertSame( 2, ( new EntryRepository() )->countUnread() );
    }

    public function testFindCompletedIgnoresDrafts(): void
    {
        $draft = $this->seedEntry( [ 'status' => 'draft' ] );
        $done  = $this->seedEntry();

        $this->assertNull( ( new EntryRepository() )->findCompleted( $draft ) );
        $this->assertSame( $done, ( new EntryRepository() )->findCompleted( $done )['id'] );
    }

    public function testFormIdsWithEntriesListsEachFormOnce(): void
    {
        $this->seedEntry( [ 'form_id' => 3 ] );
        $this->seedEntry( [ 'form_id' => 3 ] );
        $this->seedEntry( [ 'form_id' => 9 ] );
        $this->seedEntry( [ 'form_id' => 11, 'status' => 'draft' ] );

        $this->assertEqualsCanonicalizing( [ 3, 9 ], ( new EntryRepository() )->formIdsWithEntries() );
    }

    public function testTheFormDirectoryListsLiveFormsByTitle(): void
    {
        $b = $this->form( 'publish', 'Bravo' );
        $a = $this->form( 'draft', 'Alpha' );
        $this->form( 'trash', 'Charlie' );

        $this->assertSame( [ $a => 'Alpha', $b => 'Bravo' ], FormDirectory::all() );
        $this->assertEqualsCanonicalizing( [ $a, $b ], FormDirectory::liveIds() );
    }
}
