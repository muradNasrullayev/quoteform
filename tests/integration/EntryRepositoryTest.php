<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryRepository;
use WP_UnitTestCase;

final class EntryRepositoryTest extends WP_UnitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
        EntriesTable::install();
    }

    private function entry( array $overrides = [] ): array
    {
        return array_merge(
            [
                'form_id'    => 12,
                'status'     => 'completed',
                'total'      => 240.0,
                'currency'   => 'USD',
                'data'       => [ 'rooms' => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3.0 ] ],
                'breakdown'  => [ 'currency' => 'USD', 'position' => 'before', 'decimals' => 2, 'lines' => [ [ 'key' => 'base', 'label' => 'Rooms', 'amount' => 120.0 ] ], 'error' => null ],
                'user_id'    => null,
                'ip'         => null,
                'user_agent' => 'Test agent',
            ],
            $overrides
        );
    }

    public function testAnInsertedEntryComesBackTheSame(): void
    {
        $repository = new EntryRepository();
        $id         = $repository->insert( $this->entry() );
        $found      = $repository->find( $id );

        $this->assertGreaterThan( 0, $id );
        $this->assertSame( 12, $found['form_id'] );
        $this->assertSame( 'completed', $found['status'] );
        $this->assertSame( 240.0, $found['total'] );
        $this->assertSame( 'USD', $found['currency'] );
        $this->assertSame( 'Rooms', $found['data']['rooms']['label'] );
        $this->assertSame( 120.0, (float) $found['breakdown']['lines'][0]['amount'] );
        $this->assertNull( $found['user_id'] );
        $this->assertNull( $found['read_at'] );
        $this->assertMatchesRegularExpression( '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $found['created_at'] );
    }

    public function testAMissingTotalIsStoredAsNull(): void
    {
        $repository = new EntryRepository();
        $found      = $repository->find( $repository->insert( $this->entry( [ 'total' => null ] ) ) );

        $this->assertNull( $found['total'] );
    }

    public function testTheIpIsStoredAsBinary(): void
    {
        $repository = new EntryRepository();
        $found      = $repository->find( $repository->insert( $this->entry( [ 'ip' => inet_pton( '203.0.113.9' ) ] ) ) );

        $this->assertSame( '203.0.113.9', inet_ntop( $found['ip'] ) );
    }

    public function testFindReturnsNullForAnUnknownId(): void
    {
        $this->assertNull( ( new EntryRepository() )->find( 999999 ) );
    }

    public function testInsertReportsFailureAsZero(): void
    {
        global $wpdb;

        EntriesTable::drop();
        $wpdb->suppress_errors( true );
        $id = ( new EntryRepository() )->insert( $this->entry() );
        $wpdb->suppress_errors( false );

        $this->assertSame( 0, $id );
    }

    public function testATotalKeepsItsFourDecimals(): void
    {
        $repository = new EntryRepository();
        $found      = $repository->find( $repository->insert( $this->entry( [ 'total' => 123456789012.3456 ] ) ) );

        $this->assertSame( 123456789012.3456, $found['total'] );
    }

    public function testATotalAtTheColumnLimitIsStoredAsNullButTheEntryIsSaved(): void
    {
        // 99999999999999.9999 double kimi 1e14 olur — sütuna 15 tam rəqəm sığmır.
        $repository = new EntryRepository();
        $id         = $repository->insert( $this->entry( [ 'total' => 99999999999999.9999 ] ) );

        $this->assertGreaterThan( 0, $id );
        $this->assertNull( $repository->find( $id )['total'] );
    }

    public function testATotalTooLargeForTheColumnIsStoredAsNullButTheEntryIsSaved(): void
    {
        $repository = new EntryRepository();
        $id         = $repository->insert( $this->entry( [ 'total' => 1e15 ] ) );
        $found      = $repository->find( $id );

        $this->assertGreaterThan( 0, $id );
        $this->assertNull( $found['total'] );
    }
}
