<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use Quoteform\Support\Uninstaller;
use WP_UnitTestCase;

final class EntriesTableTest extends WP_UnitTestCase
{
    private const COLUMNS = [ 'id', 'form_id', 'status', 'total', 'currency', 'data', 'breakdown', 'resume_token', 'current_step', 'user_id', 'ip', 'user_agent', 'read_at', 'created_at', 'updated_at' ];

    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    /** @return string[] */
    private function columns(): array
    {
        global $wpdb;

        $wpdb->suppress_errors( true );
        $columns = $wpdb->get_col( 'SHOW COLUMNS FROM ' . EntriesTable::name() );
        $wpdb->suppress_errors( false );

        return is_array( $columns ) ? $columns : [];
    }

    public function testInstallCreatesEveryColumnAndRecordsTheVersion(): void
    {
        EntriesTable::install();

        foreach ( self::COLUMNS as $column ) {
            $this->assertContains( $column, $this->columns() );
        }

        $this->assertSame( EntriesTable::VERSION, get_option( EntriesTable::OPTION ) );
    }

    public function testAFailedCreateDoesNotRecordTheVersion(): void
    {
        EntriesTable::drop();

        $blockCreate = static function ( string $query ): string {
            return false !== stripos( $query, 'CREATE' ) ? '' : $query;
        };

        add_filter( 'query', $blockCreate );
        EntriesTable::install();
        remove_filter( 'query', $blockCreate );

        $this->assertFalse( EntriesTable::exists() );
        $this->assertFalse( get_option( EntriesTable::OPTION ), 'A missing table must leave the version unset so maybeUpgrade() retries.' );
    }

    public function testTheTableIsPrefixed(): void
    {
        global $wpdb;

        $this->assertSame( $wpdb->prefix . 'qform_entries', EntriesTable::name() );
    }

    public function testMaybeUpgradeInstallsWhenTheVersionIsMissing(): void
    {
        EntriesTable::maybeUpgrade();

        $this->assertNotEmpty( $this->columns() );
        $this->assertSame( EntriesTable::VERSION, get_option( EntriesTable::OPTION ) );
    }

    public function testMaybeUpgradeLeavesACurrentTableAlone(): void
    {
        EntriesTable::install();

        $creates = 0;
        $counter = static function ( string $query ) use ( &$creates ): string {
            if ( false !== stripos( $query, 'CREATE' ) ) {
                $creates++;
            }

            return $query;
        };

        add_filter( 'query', $counter );
        EntriesTable::maybeUpgrade();
        remove_filter( 'query', $counter );

        $this->assertSame( 0, $creates );
    }

    public function testDropRemovesTheTableAndTheVersion(): void
    {
        EntriesTable::install();
        EntriesTable::drop();

        $this->assertSame( [], $this->columns() );
        $this->assertFalse( get_option( EntriesTable::OPTION ) );
    }

    public function testActivationInstallsTheTable(): void
    {
        Activation::activate();

        $this->assertNotEmpty( $this->columns() );
    }

    public function testUninstallDropsTheTable(): void
    {
        EntriesTable::install();

        Uninstaller::run();

        $this->assertSame( [], $this->columns() );
    }
}
