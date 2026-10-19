<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Admin\BuilderPage;
use Quoteform\Admin\EntriesPage;
use Quoteform\Entries\EntriesTable;
use Quoteform\Forms\FormPostType;
use Quoteform\Support\Capabilities;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;
use WP_User;

final class EntriesPageTest extends WP_UnitTestCase
{
    use SeedsEntries;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
        Capabilities::grantToAdministrator();
        $this->freshMenus();
    }

    protected function tearDown(): void
    {
        foreach ( [ EntriesPage::HANDLE, 'quoteform-builder' ] as $handle ) {
            wp_dequeue_script( $handle );
            wp_deregister_script( $handle );
            wp_dequeue_style( $handle );
            wp_deregister_style( $handle );
        }

        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function freshMenus(): void
    {
        global $admin_page_hooks, $submenu, $menu, $_wp_submenu_nopriv;

        $admin_page_hooks   = [];
        $submenu            = [];
        $menu               = [];
        $_wp_submenu_nopriv = [];
    }

    private function buildMenus(): void
    {
        BuilderPage::addMenuPage();
        EntriesPage::addMenuPages();
    }

    /**
     * @param string[] $caps
     */
    private function signInWith( string $role, array $caps = [] ): int
    {
        $id   = self::factory()->user->create( [ 'role' => $role ] );
        $user = new WP_User( $id );

        foreach ( $caps as $cap ) {
            $user->add_cap( $cap );
        }

        wp_set_current_user( $id );

        return $id;
    }

    /**
     * @return string[] SQL that touched the entries table while $work ran
     */
    private function entryQueriesDuring( callable $work ): array
    {
        $seen = [];
        $spy  = static function ( $sql ) use ( &$seen ) {
            if ( is_string( $sql ) && false !== strpos( $sql, EntriesTable::name() ) ) {
                $seen[] = $sql;
            }

            return $sql;
        };

        add_filter( 'query', $spy );

        try {
            $work();
        } finally {
            remove_filter( 'query', $spy );
        }

        return $seen;
    }

    /**
     * @return string[]
     */
    private function menuSlugs(): array
    {
        global $menu;

        return array_column( (array) $menu, 2 );
    }

    public function testBootHooksTheEntriesMenuAfterTheBuilderMenu(): void
    {
        $this->assertSame( 11, has_action( 'admin_menu', [ EntriesPage::class, 'addMenuPages' ] ) );
        $this->assertSame( 10, has_action( 'admin_enqueue_scripts', [ EntriesPage::class, 'enqueueAssets' ] ) );
    }

    public function testAnAdministratorSeesFormsThenEntriesWithTheUnreadCount(): void
    {
        global $submenu;

        $this->seedEntry();
        $this->seedEntry();
        $this->seedEntry( [ 'read_at' => '2026-09-25 09:00:00' ] );
        $this->seedEntry( [ 'status' => 'draft' ] );
        $this->signInWith( 'administrator' );

        $this->buildMenus();

        $items = $submenu[ BuilderPage::MENU_SLUG ];

        $this->assertSame( [ BuilderPage::MENU_SLUG, EntriesPage::MENU_SLUG ], array_column( $items, 2 ) );
        $this->assertSame( 'Forms', $items[0][0] );
        $this->assertSame( Capabilities::MANAGE_FORMS, $items[0][1] );
        $this->assertSame( Capabilities::VIEW_ENTRIES, $items[1][1] );
        $this->assertStringContainsString( 'quoteform_unread-badge count-2', $items[1][0] );
        $this->assertStringContainsString( '<span class="pending-count" aria-hidden="true">2</span>', $items[1][0] );
        $this->assertStringContainsString( '2 unread entries', $items[1][0] );
    }

    public function testTheBadgeCostsOneQueryForViewersAndNoneForOthers(): void
    {
        $this->signInWith( 'administrator' );
        $this->assertCount( 1, $this->entryQueriesDuring( [ $this, 'buildMenus' ] ) );

        $this->freshMenus();
        $this->signInWith( 'editor', [ Capabilities::MANAGE_FORMS ] );
        $this->assertSame( [], $this->entryQueriesDuring( [ $this, 'buildMenus' ] ) );
        $this->assertNotContains( EntriesPage::MENU_SLUG, array_column( $GLOBALS['submenu'][ BuilderPage::MENU_SLUG ] ?? [], 2 ) );

        $this->freshMenus();
        $this->signInWith( 'subscriber' );
        $this->assertSame( [], $this->entryQueriesDuring( [ $this, 'buildMenus' ] ) );
        $this->assertSame( [], $this->menuSlugs() );
    }

    public function testSomeoneWhoOnlyReadsEntriesLandsOnEntries(): void
    {
        global $menu, $submenu;

        $this->signInWith( 'editor', [ Capabilities::VIEW_ENTRIES ] );
        $this->buildMenus();

        $this->assertSame( [ EntriesPage::MENU_SLUG ], $this->menuSlugs() );
        $this->assertSame( Capabilities::VIEW_ENTRIES, $menu[ array_key_first( $menu ) ][1] );
        $this->assertArrayNotHasKey( BuilderPage::MENU_SLUG, $submenu );
        $this->assertSame( [ EntriesPage::MENU_SLUG ], array_column( $submenu[ EntriesPage::MENU_SLUG ], 2 ) );
    }

    public function testTheBuilderStillRendersOnceOnItsPage(): void
    {
        $this->signInWith( 'administrator' );
        $this->buildMenus();

        ob_start();
        do_action( (string) get_plugin_page_hookname( BuilderPage::MENU_SLUG, '' ) );
        $html = (string) ob_get_clean();

        $this->assertSame( 1, substr_count( $html, 'id="quoteform-root"' ) );
    }

    public function testAssetsLoadOnlyOnTheEntriesPage(): void
    {
        $this->signInWith( 'administrator' );
        $this->buildMenus();

        $entriesHook = (string) get_plugin_page_hookname( EntriesPage::MENU_SLUG, BuilderPage::MENU_SLUG );

        EntriesPage::enqueueAssets( (string) get_plugin_page_hookname( BuilderPage::MENU_SLUG, '' ) );
        $this->assertFalse( wp_script_is( EntriesPage::HANDLE, 'enqueued' ) );

        EntriesPage::enqueueAssets( $entriesHook );
        BuilderPage::enqueueAssets( $entriesHook );

        $this->assertTrue( wp_script_is( EntriesPage::HANDLE, 'enqueued' ) );
        $this->assertTrue( wp_style_is( EntriesPage::HANDLE, 'enqueued' ) );
        $this->assertFalse( wp_script_is( 'quoteform-builder', 'enqueued' ), 'the builder bundle is not loaded on Entries' );

        /** @var array{dependencies: string[], version: string} $asset */
        $asset  = require QFORM_PATH . 'build/entries.asset.php';
        $script = wp_scripts()->registered[ EntriesPage::HANDLE ];

        $this->assertSame( $asset['dependencies'], $script->deps );
        $this->assertSame( 'quoteform', $script->textdomain );
        $this->assertSame( 'replace', wp_styles()->get_data( EntriesPage::HANDLE, 'rtl' ) );
        $this->assertStringEndsWith( 'build/style-entries.css', wp_styles()->registered[ EntriesPage::HANDLE ]->src );
    }

    public function testTheConfigCannotBreakOutOfItsScriptTag(): void
    {
        $this->signInWith( 'administrator' );
        $title = '</script><script>alert(1)</script> & "Co"';
        $form  = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish', 'post_title' => $title ] );
        $this->assertStringContainsString( '</script>', get_post( $form )->post_title, 'precondition: an administrator may save raw HTML in a title' );
        $this->buildMenus();

        EntriesPage::enqueueAssets( (string) get_plugin_page_hookname( EntriesPage::MENU_SLUG, BuilderPage::MENU_SLUG ) );

        // WP_Scripts::add_inline_script() daxili olaraq `(array) $this->get_data(...)` edir;
        // handle üçün ilk çağırışda get_data() `false` qaytarır və `(array) false === [ false ]`,
        // yəni saxlanan massivin başında sətirə çevrilmə zamanı boş sətirə düşən bir `false` olur.
        // WordPress-in öz oxuyucusu (`WP_Scripts::get_inline_script_data()`) məhz buna görə
        // nəticəni `trim( …, "\n" )` edir — test də eyni oxunuşu təkrarlayır (real WP nüvə davranışı).
        $inline = trim( implode( "\n", (array) wp_scripts()->get_data( EntriesPage::HANDLE, 'before' ) ), "\n" );

        $this->assertStringNotContainsString( '</script', $inline );
        $this->assertStringStartsWith( 'window.quoteformEntries = ', $inline );

        $config = json_decode( substr( $inline, strlen( 'window.quoteformEntries = ' ), -1 ), true );

        $this->assertSame( [ [ 'id' => $form, 'title' => get_post( $form )->post_title ] ], $config['forms'] );
        $this->assertStringContainsString( '&_wpnonce=', $config['exportUrl'] );
        $this->assertStringNotContainsString( '&amp;', $config['exportUrl'] );
        $this->assertTrue( $config['canDelete'] );
        $this->assertTrue( $config['canExport'] );
        $this->assertSame( 20, $config['perPage'] );
        $this->assertFalse( $config['hasDeletedForms'] );
    }

    public function testDeletedFormsAreOfferedOnlyWhenTheirEntriesExist(): void
    {
        $this->signInWith( 'editor', [ Capabilities::VIEW_ENTRIES ] );
        $this->assertFalse( EntriesPage::config()['hasDeletedForms'] );

        $this->seedEntry( [ 'form_id' => 999999 ] );
        $config = EntriesPage::config();

        $this->assertTrue( $config['hasDeletedForms'] );
        $this->assertFalse( $config['canDelete'] );
        $this->assertFalse( $config['canExport'] );
    }

    public function testTheBadgeTextIsTranslatableAndEscaped(): void
    {
        $this->assertStringContainsString( 'count-0', EntriesPage::badge( 0 ) );
        $this->assertStringContainsString( '1 unread entry<', EntriesPage::badge( 1 ) );
        $this->assertStringContainsString( 'count-0', EntriesPage::badge( -3 ) );
    }

    public function testTheRootNodeSharesTheBuilderStyleScope(): void
    {
        ob_start();
        EntriesPage::renderRoot();

        $this->assertStringContainsString( '<div id="quoteform-entries-root" class="quoteform_builder"></div>', (string) ob_get_clean() );
    }
}
