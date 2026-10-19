<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_Site;
use WP_UnitTestCase;

/**
 * Final fix F2/F3 — sayt silinməsi, yeni sayt, şəbəkə aktivasiyası.
 *
 * `@group ms-required` testləri adi `make itest`-də (tək sayt) WordPress test
 * kitabxanası tərəfindən ötürülür; onları işlətmək üçün:
 *   docker compose run --rm -e WP_MULTISITE=1 php vendor/bin/phpunit -c phpunit-integration.xml --filter MultisiteLifecycleTest
 */
final class MultisiteLifecycleTest extends WP_UnitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
        Capabilities::revokeFromAllRoles();
    }

    protected function tearDown(): void
    {
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function hasTable(): bool
    {
        global $wpdb;

        $wpdb->suppress_errors( true );
        $columns = $wpdb->get_col( 'SHOW COLUMNS FROM ' . EntriesTable::name() );
        $wpdb->suppress_errors( false );

        return is_array( $columns ) && [] !== $columns;
    }

    private function adminCanManageForms(): bool
    {
        $role = get_role( 'administrator' );

        return $role instanceof \WP_Role && $role->has_cap( Capabilities::MANAGE_FORMS );
    }

    private function networkActivate(): void
    {
        update_site_option( 'active_sitewide_plugins', [ plugin_basename( QFORM_FILE ) => time() ] );
    }

    /**
     * Yeni saytı yaradıb onun kontekstində yoxlamanı işlədir.
     *
     * @return array{0: bool, 1: bool} [cədvəl var, admin capability-si var]
     */
    private function newSiteState(): array
    {
        $blogId = (int) self::factory()->blog->create();

        switch_to_blog( $blogId );
        $state = [ $this->hasTable(), $this->adminCanManageForms() ];
        restore_current_blog();

        return $state;
    }

    // --- F2: wpmu_drop_tables -------------------------------------------------

    public function testTheDropTablesFilterIsHooked(): void
    {
        $this->assertNotFalse( has_filter( 'wpmu_drop_tables', [ EntriesTable::class, 'dropTablesForSite' ] ) );
    }

    public function testDeletingASiteAlsoDropsItsEntriesTable(): void
    {
        global $wpdb;

        $tables = apply_filters( 'wpmu_drop_tables', [ 'existing' ], 7 );

        $this->assertContains( 'existing', $tables );
        $this->assertContains( $wpdb->get_blog_prefix( 7 ) . 'qform_entries', $tables );
    }

    /**
     * @group ms-required
     */
    public function testTheDroppedTableBelongsToThatSite(): void
    {
        $this->skipWithoutMultisite();

        global $wpdb;

        $this->assertSame( [ $wpdb->base_prefix . '7_qform_entries' ], EntriesTable::dropTablesForSite( [], 7 ) );
    }

    // --- F3: yeni sayt ----------------------------------------------------------

    public function testANewSiteOnASingleSiteInstallIsLeftAlone(): void
    {
        // Tək saytda WordPress `WP_Site`-i yükləmir (hook da heç vaxt atəşlənmir).
        if ( ! class_exists( WP_Site::class ) ) {
            require_once ABSPATH . WPINC . '/class-wp-site.php';
        }

        Activation::onNewSite( new WP_Site( (object) [ 'blog_id' => 1 ] ) );

        $this->assertFalse( $this->hasTable() );
        $this->assertFalse( $this->adminCanManageForms() );
    }

    /**
     * @group ms-required
     */
    public function testANewSiteGetsTheTableAndCapabilitiesWhenNetworkActive(): void
    {
        $this->skipWithoutMultisite();

        $this->networkActivate();

        $this->assertSame( [ true, true ], $this->newSiteState() );
    }

    /**
     * @group ms-required
     */
    public function testANewSiteIsLeftAloneWhenThePluginIsNotNetworkActive(): void
    {
        $this->skipWithoutMultisite();

        update_site_option( 'active_sitewide_plugins', [] );

        $this->assertSame( [ false, false ], $this->newSiteState() );
    }

    // --- F3: şəbəkə aktivasiyası -----------------------------------------------

    public function testNetworkActivationOnASingleSiteStillGrantsCapabilities(): void
    {
        Activation::activate( true );

        $this->assertTrue( $this->hasTable() );
        $this->assertTrue( $this->adminCanManageForms() );
    }

    /**
     * @group ms-required
     */
    public function testNetworkActivationGrantsCapabilitiesOnEverySite(): void
    {
        $this->skipWithoutMultisite();

        update_site_option( 'active_sitewide_plugins', [] );

        $sites = [ (int) get_current_blog_id(), (int) self::factory()->blog->create(), (int) self::factory()->blog->create() ];

        Activation::activate( true );

        foreach ( $sites as $siteId ) {
            switch_to_blog( $siteId );
            $state = [ $this->hasTable(), $this->adminCanManageForms() ];
            Capabilities::revokeFromAllRoles();
            restore_current_blog();

            $this->assertSame( [ true, true ], $state, 'site ' . $siteId );
        }
    }
}
