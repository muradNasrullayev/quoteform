<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use WP_UnitTestCase;

final class RenderingTest extends WP_UnitTestCase
{
    private int $formId;

    public function set_up(): void
    {
        parent::set_up();

        $this->formId = (int) self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE ] );

        ( new SchemaRepository() )->save( $this->formId, SchemaRepository::defaults() );
    }

    protected function tearDown(): void
    {
        wp_dequeue_script( 'quoteform-renderer' );
        wp_deregister_script( 'quoteform-renderer' );
        wp_dequeue_style( 'quoteform-renderer' );
        wp_deregister_style( 'quoteform-renderer' );
        parent::tearDown();
    }

    public function testTheShortcodeIsRegistered(): void
    {
        $this->assertTrue( shortcode_exists( 'quoteform' ) );
    }

    public function testTheShortcodeRendersAContainer(): void
    {
        $html = do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $this->assertStringContainsString( 'data-quoteform="' . $this->formId . '"', $html );
    }

    public function testAnUnknownIdRendersNothingRatherThanAnError(): void
    {
        $html = do_shortcode( '[quoteform id="999999"]' );

        $this->assertSame( '', trim( $html ) );
    }

    public function testAnIdOfADifferentPostTypeRendersNothing(): void
    {
        $postId = (int) self::factory()->post->create( [ 'post_type' => 'post' ] );

        $this->assertSame( '', trim( do_shortcode( '[quoteform id="' . $postId . '"]' ) ) );
    }

    public function testTheRendererAssetsAreNotEnqueuedOnAPageWithoutAForm(): void
    {
        do_action( 'wp_enqueue_scripts' );

        $this->assertFalse( wp_script_is( 'quoteform-renderer', 'enqueued' ) );
    }

    public function testTheRendererAssetsAreEnqueuedOnceTheShortcodeRuns(): void
    {
        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $this->assertTrue( wp_script_is( 'quoteform-renderer', 'enqueued' ) );
        $this->assertTrue( wp_style_is( 'quoteform-renderer', 'enqueued' ) );
    }

    public function testTheSchemaReachesThePageWithItsTypesIntact(): void
    {
        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertStringContainsString( '"decimals":2', $joined );
        $this->assertStringNotContainsString( '"decimals":"2"', $joined );
    }

    public function testTheSchemaOnThePageCarriesNoNotifications(): void
    {
        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertStringNotContainsString( 'notifications', $joined );
    }

    /**
     * `SchemaFilter::DISPLAY_SETTINGS` (Plan 04) düymə mətnini heç vaxt
     * daşımayıb — göndəriş funksiyası (Plan 06) gələndə heç bir task onu
     * ora əlavə etmədi. Bu, yalnız burada üzə çıxır: `tests/js/frontend/`
     * vahid testləri `schema`-nı birbaşa JS obyekti kimi verir, PHP
     * filtrindən heç vaxt keçmir. `FormRenderer::render()` düymə mətnini
     * `SchemaFilter`-i BAYPAS edib xam sxemdən oxuyur ki,
     * `SchemaFilterTest::testKeepsOnlyDisplaySettings` pozulmasın (o test
     * dəyişdirilmir — yalnız görünən 3 ayarı daşımalıdır).
     */
    public function testTheSubmitLabelReachesThePageDespiteNotBeingADisplaySetting(): void
    {
        $schema                             = SchemaRepository::defaults();
        $schema['settings']['submit_label'] = 'Get my quote now';

        ( new SchemaRepository() )->save( $this->formId, $schema );

        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertStringContainsString( '"submit_label":"Get my quote now"', $joined );
    }

    public function testABlankSubmitLabelFallsBackRatherThanShippingAnEmptyButton(): void
    {
        $schema                             = SchemaRepository::defaults();
        $schema['settings']['submit_label'] = '   ';

        ( new SchemaRepository() )->save( $this->formId, $schema );

        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertStringContainsString( '"submit_label":"Get my quote"', $joined );
    }

    public function testTwoShortcodesOnOnePageBothReachTheRuntime(): void
    {
        $second = (int) self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE ] );
        ( new SchemaRepository() )->save( $second, SchemaRepository::defaults() );

        do_shortcode( '[quoteform id="' . $this->formId . '"]' );
        do_shortcode( '[quoteform id="' . $second . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertStringContainsString( '"' . $this->formId . '":', $joined );
        $this->assertStringContainsString( '"' . $second . '":', $joined );
    }

    /**
     * Girişdə təmizləmə (`FormsController`) YEGANƏ müdafiə deyil: meta-ya REST-dən
     * KƏNAR yollarla da yazılır — WP-CLI, miqrasiya skripti, dublikat/import
     * plugin-i, staging sinxronu. Spec §6.1 məhz üçüncü tərəf dublikat
     * plugin-ləri işləsin deyə CPT seçib. Belə məzmun `window.quoteformData`-ya
     * düşür və renderer onu `innerHTML` ilə yerləşdirir.
     */
    public function testHtmlContentWrittenStraightToTheMetaIsSanitisedOnTheWayOut(): void
    {
        $schema                             = SchemaRepository::defaults();
        $schema['fields']['intro']          = [
            'key'         => 'intro',
            'type'        => 'html',
            'label'       => '',
            'help'        => '',
            'placeholder' => '',
            'required'    => false,
            'default'     => '',
            'content'     => '<img src=x onerror=alert(1)><script>alert(2)</script><p>Read this.</p>',
        ];
        $schema['steps'][0]['fields'][]     = 'intro';

        update_post_meta( $this->formId, FormPostType::META_SCHEMA, wp_slash( $schema ) );

        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $inline = wp_scripts()->get_data( 'quoteform-renderer', 'after' );
        $joined = is_array( $inline ) ? implode( "\n", $inline ) : (string) $inline;

        $this->assertNotSame( '', $joined, 'the form did not reach the page at all' );
        $this->assertStringNotContainsString( 'onerror', $joined );
        $this->assertStringNotContainsString( '<script', $joined );
        $this->assertStringContainsString( 'Read this.', $joined );
    }

    public function testATrashedFormRendersNothing(): void
    {
        wp_trash_post( $this->formId );

        $html = do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $this->assertSame( '', trim( $html ) );
    }

    public function testATrashedFormEnqueuesNoAssets(): void
    {
        wp_trash_post( $this->formId );

        do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $this->assertFalse( wp_script_is( 'quoteform-renderer', 'enqueued' ) );
    }

    public function testAFormRestoredFromTheTrashRendersAgain(): void
    {
        wp_trash_post( $this->formId );
        wp_untrash_post( $this->formId );

        $html = do_shortcode( '[quoteform id="' . $this->formId . '"]' );

        $this->assertStringContainsString( 'data-quoteform="' . $this->formId . '"', $html );
    }
}
