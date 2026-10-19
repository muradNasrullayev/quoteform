<?php

declare(strict_types=1);

namespace Quoteform\Rendering;

/**
 * Gutenberg bloku.
 *
 * Blokun adı, başlığı və atributları YANINDAKI `block.json`-dadır: həmin
 * faylı həm bu qeydiyyat, həm də redaktor skripti (`admin-src/block/`)
 * oxuyur, ona görə atribut müqaviləsi bir yerdə yaşayır.
 *
 * Skript isə `block.json`-dan YOX, pluginin öz qaydası ilə — `build/`
 * içindəki `*.asset.php` manifestindən — qeyd olunur (`BuilderPage` və
 * `FormRenderer` də eynilə belə edir). `editorScript: "file:…"` yazmaq
 * ikinci bir asset yolu gətirərdi.
 */
final class Block
{
    public const NAME = 'quoteform/form';

    public const EDITOR_HANDLE = 'quoteform-block-editor';

    public const EDITOR_STYLE_HANDLE = 'quoteform-block-editor-style';

    public static function register(): void
    {
        if ( \WP_Block_Type_Registry::get_instance()->is_registered( self::NAME ) ) {
            return;
        }

        $arguments = [ 'render_callback' => [ self::class, 'render' ] ];

        if ( self::registerEditorScript() ) {
            $arguments['editor_script'] = self::EDITOR_HANDLE;
        }

        if ( self::registerEditorStyle() ) {
            $arguments['editor_style'] = self::EDITOR_STYLE_HANDLE;
        }

        register_block_type( QFORM_PATH . 'includes/Rendering/block.json', $arguments );
    }

    /**
     * @param array<string, mixed> $attributes
     */
    public static function render( array $attributes ): string
    {
        $formId = isset( $attributes['formId'] ) ? (int) $attributes['formId'] : 0;

        if ( $formId < 1 ) {
            return '';
        }

        $renderer = new FormRenderer();

        return $renderer->render( $formId );
    }

    /**
     * Manifest yoxdursa `false` qaytarır və blok YENƏ DƏ qeyd olunur:
     * qurulmamış `build/` səhifədəki mövcud blokları sındırmamalıdır,
     * sadəcə redaktor tərəfi olmur.
     */
    private static function registerEditorScript(): bool
    {
        if ( wp_script_is( self::EDITOR_HANDLE, 'registered' ) ) {
            return true;
        }

        $assetFile = QFORM_PATH . 'build/block.asset.php';

        if ( ! file_exists( $assetFile ) ) {
            return false;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_register_script(
            self::EDITOR_HANDLE,
            QFORM_URL . 'build/block.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        wp_set_script_translations( self::EDITOR_HANDLE, 'quoteform', QFORM_PATH . 'languages' );

        return true;
    }

    /**
     * Skriptlə eyni qayda: fayl yoxdursa stil sadəcə qeyd olunmur, blok YENƏ
     * DƏ qeyd olunur. Versiya skriptin manifestindən gəlir — ikisi eyni
     * build-dən çıxır.
     */
    private static function registerEditorStyle(): bool
    {
        if ( wp_style_is( self::EDITOR_STYLE_HANDLE, 'registered' ) ) {
            return true;
        }

        $styleFile = QFORM_PATH . 'build/style-block.css';
        $assetFile = QFORM_PATH . 'build/block.asset.php';

        if ( ! file_exists( $styleFile ) || ! file_exists( $assetFile ) ) {
            return false;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_register_style(
            self::EDITOR_STYLE_HANDLE,
            QFORM_URL . 'build/style-block.css',
            [ 'dashicons' ],
            $asset['version']
        );

        wp_style_add_data( self::EDITOR_STYLE_HANDLE, 'rtl', 'replace' );

        return true;
    }
}
