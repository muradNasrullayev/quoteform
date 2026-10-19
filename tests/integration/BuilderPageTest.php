<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Admin\BuilderPage;
use Quoteform\Support\Activation;
use Quoteform\Support\Capabilities;
use WP_UnitTestCase;

final class BuilderPageTest extends WP_UnitTestCase
{
    protected function tearDown(): void
    {
        wp_dequeue_script( 'quoteform-builder' );
        wp_deregister_script( 'quoteform-builder' );
        wp_dequeue_style( 'quoteform-builder' );
        wp_deregister_style( 'quoteform-builder' );
        Capabilities::revokeFromAllRoles();
        parent::tearDown();
    }

    private function registerMenuPageAsAdministrator(): string
    {
        global $admin_page_hooks, $submenu, $menu;

        $admin_page_hooks = [];
        $submenu          = [];
        $menu             = [];

        Activation::activate();
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );

        BuilderPage::addMenuPage();

        return (string) get_plugin_page_hookname( BuilderPage::MENU_SLUG, '' );
    }

    public function testBootHooksTheMenuPageOntoAdminMenu(): void
    {
        $this->assertSame(
            10,
            has_action( 'admin_menu', [ BuilderPage::class, 'addMenuPage' ] )
        );
    }

    public function testBootHooksTheAssetEnqueueOntoAdminEnqueueScripts(): void
    {
        $this->assertSame(
            10,
            has_action( 'admin_enqueue_scripts', [ BuilderPage::class, 'enqueueAssets' ] )
        );
    }

    public function testTheMenuPageRequiresOurCapability(): void
    {
        global $admin_page_hooks, $submenu, $menu;

        $admin_page_hooks = [];
        $submenu          = [];
        $menu             = [];

        Activation::activate();
        wp_set_current_user( $this->factory->user->create( [ 'role' => 'administrator' ] ) );

        BuilderPage::addMenuPage();

        $slugs = array_column( $menu, 2 );

        $this->assertContains( BuilderPage::MENU_SLUG, $slugs );

        foreach ( $menu as $entry ) {
            if ( $entry[2] === BuilderPage::MENU_SLUG ) {
                $this->assertSame( Capabilities::MANAGE_FORMS, $entry[1] );
            }
        }
    }

    public function testAssetsAreNotEnqueuedOnAnUnrelatedAdminScreen(): void
    {
        global $admin_page_hooks, $submenu, $menu;

        $admin_page_hooks = [];
        $submenu          = [];
        $menu             = [];

        // `$hookSuffix` statik olduğu üçün testlər arasında sıfırlanmır — bu
        // testi ayrıca (--filter) qaçırdıqda belə real mexanizmi (`!==`
        // müqayisəsini) yoxlasın deyə, əvvəlcə onu özümüz məlum bir dəyərə
        // qururuq, sonra FƏRQLİ bir hook suffix ötürürük.
        BuilderPage::addMenuPage();

        BuilderPage::enqueueAssets( 'edit.php' );

        $this->assertFalse( wp_script_is( 'quoteform-builder', 'enqueued' ) );
        $this->assertFalse( wp_style_is( 'quoteform-builder', 'enqueued' ) );
    }

    public function testAssetsAreEnqueuedOnTheBuilderPagesOwnHookSuffix(): void
    {
        $hookSuffix = $this->registerMenuPageAsAdministrator();

        BuilderPage::enqueueAssets( $hookSuffix );

        $this->assertTrue( wp_script_is( 'quoteform-builder', 'enqueued' ) );
        $this->assertTrue( wp_style_is( 'quoteform-builder', 'enqueued' ) );
    }

    public function testTheEnqueuedScriptDeclaresTheDependenciesTheBuildEmitted(): void
    {
        $hookSuffix = $this->registerMenuPageAsAdministrator();

        BuilderPage::enqueueAssets( $hookSuffix );

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require QFORM_PATH . 'build/index.asset.php';

        $this->assertNotEmpty( $asset['dependencies'] );
        $this->assertTrue( wp_script_is( 'quoteform-builder', 'registered' ) );

        $registered = wp_scripts()->registered['quoteform-builder'];

        foreach ( $asset['dependencies'] as $handle ) {
            $this->assertContains( $handle, $registered->deps, $handle );
            $this->assertTrue( wp_script_is( $handle, 'registered' ), $handle );
        }

        $this->assertSame( $asset['version'], $registered->ver );
    }

    public function testTheBuilderScriptIsWiredForTranslationAndTheStylesheetForRtl(): void
    {
        $hookSuffix = $this->registerMenuPageAsAdministrator();

        BuilderPage::enqueueAssets( $hookSuffix );

        $this->assertTrue( wp_script_is( 'quoteform-builder', 'registered' ) );

        $script = wp_scripts()->registered['quoteform-builder'];

        $this->assertSame( 'quoteform', $script->textdomain );
        $this->assertSame( QFORM_PATH . 'languages', $script->translations_path );
        $this->assertContains( 'wp-i18n', $script->deps );

        $this->assertSame( 'replace', wp_styles()->get_data( 'quoteform-builder', 'rtl' ) );
    }

    public function testTheRootNodeIsRendered(): void
    {
        ob_start();
        BuilderPage::renderRoot();
        $html = (string) ob_get_clean();

        $this->assertStringContainsString( 'id="quoteform-root"', $html );
    }
}
