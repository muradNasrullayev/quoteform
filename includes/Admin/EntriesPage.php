<?php

declare(strict_types=1);

namespace Quoteform\Admin;

use Quoteform\Entries\EntryPreferences;
use Quoteform\Entries\EntryRepository;
use Quoteform\Entries\FormDirectory;
use Quoteform\Support\Capabilities;

/**
 * Quoteform → Entries (yeni spec §2.1–§2.2). Asset-lər yalnız bu səhifənin hook
 * suffix-ində yüklənir; builder paketi burada yüklənmir.
 *
 * Nişan: admin səhifəsi başına ən çox BİR indeksli COUNT və yalnız müraciət görə
 * bilən istifadəçi üçün (admin_menu hər admin yüklənişində bir dəfə işləyir).
 */
final class EntriesPage
{
    public const MENU_SLUG = 'quoteform-entries';
    public const HANDLE    = 'quoteform-entries';

    /** @var string */
    private static $hookSuffix = '';

    public static function register(): void
    {
        // BuilderPage yuxarı menyunu 10-da qurur; Entries ondan SONRA əlavə olunmalıdır.
        add_action( 'admin_menu', [ self::class, 'addMenuPages' ], 11 );
        add_action( 'admin_enqueue_scripts', [ self::class, 'enqueueAssets' ] );
    }

    public static function addMenuPages(): void
    {
        self::$hookSuffix = '';

        if ( ! current_user_can( Capabilities::VIEW_ENTRIES ) ) {
            return;
        }

        $parent = BuilderPage::MENU_SLUG;

        if ( ! current_user_can( Capabilities::MANAGE_FORMS ) ) {
            add_menu_page(
                __( 'Quoteform', 'quoteform' ),
                __( 'Quoteform', 'quoteform' ),
                Capabilities::VIEW_ENTRIES,
                self::MENU_SLUG,
                [ self::class, 'renderRoot' ],
                'dashicons-calculator',
                26
            );

            $parent = self::MENU_SLUG;
        }

        $hookSuffix = add_submenu_page(
            $parent,
            __( 'Entries', 'quoteform' ),
            __( 'Entries', 'quoteform' ) . ' ' . self::badge( ( new EntryRepository() )->countUnread() ),
            Capabilities::VIEW_ENTRIES,
            self::MENU_SLUG,
            [ self::class, 'renderRoot' ]
        );

        self::$hookSuffix = is_string( $hookSuffix ) ? $hookSuffix : '';
    }

    /**
     * WP Comments nişanı ilə eyni markup; `count-0` nüvə CSS-i ilə gizlənir.
     * JS (admin-src/entries/menuBadge.js) eyni sinifləri yeniləyir.
     */
    public static function badge( int $count ): string
    {
        $count = max( 0, $count );

        return sprintf(
            '<span class="awaiting-mod quoteform_unread-badge count-%1$d"><span class="pending-count" aria-hidden="true">%2$s</span><span class="screen-reader-text">%3$s</span></span>',
            $count,
            esc_html( number_format_i18n( $count ) ),
            esc_html(
                sprintf(
                    /* translators: %s: number of unread entries. */
                    _n( '%s unread entry', '%s unread entries', $count, 'quoteform' ),
                    number_format_i18n( $count )
                )
            )
        );
    }

    public static function renderRoot(): void
    {
        echo '<div class="wrap"><div id="quoteform-entries-root" class="quoteform_builder"></div></div>';
    }

    public static function enqueueAssets( string $hookSuffix ): void
    {
        if ( '' === self::$hookSuffix || $hookSuffix !== self::$hookSuffix ) {
            return;
        }

        $assetFile = QFORM_PATH . 'build/entries.asset.php';

        if ( ! file_exists( $assetFile ) ) {
            return;
        }

        /** @var array{dependencies: string[], version: string} $asset */
        $asset = require $assetFile;

        wp_enqueue_script( self::HANDLE, QFORM_URL . 'build/entries.js', $asset['dependencies'], $asset['version'], true );

        // Forma adı admin tərəfindən xam yazıla bilər (`</script>`): HEX bayraqları `<`, `>`, `&`,
        // `'`, `"` simvollarını \u-kodlayır ki, data `<script>` teqindən çıxmasın.
        wp_add_inline_script(
            self::HANDLE,
            'window.quoteformEntries = ' . wp_json_encode( self::config(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';',
            'before'
        );

        wp_enqueue_style( self::HANDLE, QFORM_URL . 'build/style-entries.css', [], $asset['version'] );
        wp_style_add_data( self::HANDLE, 'rtl', 'replace' );
        wp_set_script_translations( self::HANDLE, 'quoteform', QFORM_PATH . 'languages' );
    }

    /**
     * @return array<string, mixed>
     */
    public static function config(): array
    {
        $forms     = FormDirectory::all();
        $list      = [];
        $canManage = current_user_can( Capabilities::MANAGE_FORMS );

        foreach ( $forms as $id => $title ) {
            $list[] = [ 'id' => $id, 'title' => $title ];
        }

        return [
            'perPage'         => EntryPreferences::perPage( get_current_user_id() ),
            'canDelete'       => $canManage,
            'canManageForms'  => $canManage,
            'canExport'       => current_user_can( Capabilities::EXPORT_ENTRIES ),
            'exportUrl'       => EntriesExport::url(),
            'builderUrl'      => admin_url( 'admin.php?page=' . BuilderPage::MENU_SLUG ),
            'forms'           => $list,
            'hasDeletedForms' => [] !== array_diff( ( new EntryRepository() )->formIdsWithEntries(), array_keys( $forms ) ),
        ];
    }
}
