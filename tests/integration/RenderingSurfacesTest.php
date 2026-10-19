<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Rendering\Block;
use Quoteform\Rendering\ElementorWidget;
use WP_UnitTestCase;

final class RenderingSurfacesTest extends WP_UnitTestCase
{
    private int $formId;

    public function set_up(): void
    {
        parent::set_up();

        $this->formId = (int) self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE ] );

        ( new SchemaRepository() )->save( $this->formId, SchemaRepository::defaults() );
    }

    public function testTheBlockIsRegistered(): void
    {
        $this->assertTrue( \WP_Block_Type_Registry::get_instance()->is_registered( 'quoteform/form' ) );
    }

    public function testTheBlockProducesExactlyWhatTheShortcodeProduces(): void
    {
        $viaShortcode = do_shortcode( '[quoteform id="' . $this->formId . '"]' );
        $viaBlock     = Block::render( [ 'formId' => $this->formId ] );

        $this->assertSame( $viaShortcode, $viaBlock );
    }

    public function testTheBlockRendersNothingWithoutAFormId(): void
    {
        $this->assertSame( '', Block::render( [] ) );
        $this->assertSame( '', Block::render( [ 'formId' => 0 ] ) );
    }

    public function testTheBlockRendersNothingForAnUnknownForm(): void
    {
        $this->assertSame( '', Block::render( [ 'formId' => 999999 ] ) );
    }

    /**
     * Blok yalnız serverdə qeyd olunsa, redaktorun blok reyestrinə DÜŞMÜR:
     * inserter-də görünmür, əl ilə yapışdırılan blok isə "bu blok
     * dəstəklənmir" yazısına çevrilir. Redaktor tərəfini ayaqda saxlayan
     * yeganə şey bu skriptdir.
     */
    public function testTheBlockCarriesAnEditorScript(): void
    {
        $blockType = \WP_Block_Type_Registry::get_instance()->get_registered( Block::NAME );

        $this->assertNotNull( $blockType );
        $this->assertContains( Block::EDITOR_HANDLE, $blockType->editor_script_handles );
        $this->assertTrue( wp_script_is( Block::EDITOR_HANDLE, 'registered' ) );
        $this->assertFileExists( QFORM_PATH . 'build/block.js' );
    }

    public function testTheEditorScriptIsNeverEnqueuedByRenderingAForm(): void
    {
        Block::render( [ 'formId' => $this->formId ] );

        $this->assertFalse( wp_script_is( Block::EDITOR_HANDLE, 'enqueued' ) );
    }

    /**
     * Blokun kətanı WP 6.3+-da iframe-dir: admin səhifəsinin stilləri ora
     * düşmür. Blokun görünüşünü redaktora çatdıran yeganə yol budur.
     */
    public function testTheBlockCarriesAnEditorStyle(): void
    {
        $blockType = \WP_Block_Type_Registry::get_instance()->get_registered( Block::NAME );

        $this->assertNotNull( $blockType );
        $this->assertContains( Block::EDITOR_STYLE_HANDLE, $blockType->editor_style_handles );
        $this->assertTrue( wp_style_is( Block::EDITOR_STYLE_HANDLE, 'registered' ) );
        $this->assertFileExists( QFORM_PATH . 'build/style-block.css' );

        // Blok kətanı iframe-dir və orada `dashicons` stili avtomatik yüklənmir;
        // kalkulyator ikonasının görünməsi üçün redaktor stili ona bağlı olmalıdır.
        $this->assertContains(
            'dashicons',
            wp_styles()->registered[ Block::EDITOR_STYLE_HANDLE ]->deps
        );
    }

    public function testTheEditorStyleIsNeverEnqueuedByRenderingAForm(): void
    {
        Block::render( [ 'formId' => $this->formId ] );

        $this->assertFalse( wp_style_is( Block::EDITOR_STYLE_HANDLE, 'enqueued' ) );
    }

    /**
     * Blokun adı, başlığı və atributları `block.json`-dandır və oradan həm
     * PHP, həm redaktor skripti oxuyur. Bu yoxlama həmin faylın həqiqətən
     * oxunduğunu saxlayır — atribut müqaviləsi iki yerdə yazılsaydı,
     * onlardan biri səssizcə sürüşərdi.
     */
    public function testTheBlockTakesItsMetadataFromBlockJson(): void
    {
        $blockType = \WP_Block_Type_Registry::get_instance()->get_registered( Block::NAME );

        $this->assertNotNull( $blockType );
        $this->assertSame( 'Quote form', $blockType->title );
        $this->assertSame( 'calculator', $blockType->icon );
        $this->assertSame(
            [ 'type' => 'number', 'default' => 0 ],
            $blockType->attributes['formId']
        );
    }

    /**
     * Redaktorun blok siyahısı məhz bu massivdən qidalanır — blok burada
     * yoxdursa, inserter-də də yoxdur.
     */
    public function testTheBlockReachesTheEditorsOwnBlockSettings(): void
    {
        require_once ABSPATH . 'wp-includes/block-editor.php';

        $settings = get_block_editor_server_block_settings();

        $this->assertArrayHasKey( Block::NAME, $settings );
        $this->assertSame( 'Quote form', $settings[ Block::NAME ]['title'] );
    }

    public function testElementorRegistrationIsSilentWhenElementorIsAbsent(): void
    {
        $this->assertFalse( did_action( 'elementor/loaded' ) > 0 );

        ElementorWidget::register();

        $this->assertTrue( true );
    }
}
