<?php

declare(strict_types=1);

namespace Quoteform\Admin;

use Quoteform\Support\Capabilities;

/**
 * Builder-in wp-admin səhifəsi.
 *
 * Asset-lər YALNIZ bu səhifədə yüklənir (spec §18). `add_menu_page()`
 * qaytardığı hook suffix-i saxlanılır, çünki `admin_enqueue_scripts`
 * ona görə filtrlənir — səhifə sluq-u ilə müqayisə etmək kifayət deyil.
 */
final class BuilderPage
{
    public const MENU_SLUG = 'quoteform';

    /** @var string */
    private static $hookSuffix = '';

    public static function register(): void
    {
        add_action( 'admin_menu', [ self::class, 'addMenuPage' ] );
        add_action( 'admin_enqueue_scripts', [ self::class, 'enqueueAssets' ] );
    }

    public static function addMenuPage(): void
    {
        self::$hookSuffix = '';

        // Forma redaktə edə bilməyən istifadəçi üçün builder səhifəsi qeydə alınmır;
        // müraciət görə bilirsə, yuxarı menyunu EntriesPage özü qurur (spec §2.1).
        if ( ! current_user_can( Capabilities::MANAGE_FORMS ) ) {
            return;
        }

        $hookSuffix = add_menu_page(
            __( 'Quoteform', 'quoteform' ),
            __( 'Quoteform', 'quoteform' ),
            Capabilities::MANAGE_FORMS,
            self::MENU_SLUG,
            [ self::class, 'renderRoot' ],
            'dashicons-calculator',
            26
        );

        // İlk alt bənd "Forms" adlanır (əks halda WordPress yuxarı menyunun adını təkrarlayardı).
        // Callback add_menu_page ilə EYNİ massivdir: eyni hook-a eyni callback ikinci dəfə
        // qoşulmur, səhifə bir dəfə çəkilir (EntriesPageTest bunu yoxlayır).
        add_submenu_page(
            self::MENU_SLUG,
            __( 'Forms', 'quoteform' ),
            __( 'Forms', 'quoteform' ),
            Capabilities::MANAGE_FORMS,
            self::MENU_SLUG,
            [ self::class, 'renderRoot' ]
        );

        self::$hookSuffix = is_string( $hookSuffix ) ? $hookSuffix : '';
    }

    public static function renderRoot(): void
    {
        echo '<div class="wrap"><div id="quoteform-root"></div></div>';
    }

    public static function enqueueAssets( string $hookSuffix ): void
    {
        if ( self::$hookSuffix === '' || $hookSuffix !== self::$hookSuffix ) {
            return;
        }

        $assetFile = QFORM_PATH . 'build/index.asset.php';

        if ( ! file_exists( $assetFile ) ) {
            return;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_enqueue_script(
            'quoteform-builder',
            QFORM_URL . 'build/index.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        wp_enqueue_style(
            'quoteform-builder',
            QFORM_URL . 'build/style-index.css',
            [ 'wp-components' ],
            $asset['version']
        );

        wp_style_add_data( 'quoteform-builder', 'rtl', 'replace' );

        wp_set_script_translations( 'quoteform-builder', 'quoteform', QFORM_PATH . 'languages' );
    }
}
