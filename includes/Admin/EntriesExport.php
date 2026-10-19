<?php

declare(strict_types=1);

namespace Quoteform\Admin;

use Quoteform\Entries\CsvExporter;
use Quoteform\Entries\EntryQuery;
use Quoteform\Support\Capabilities;

/**
 * `admin-post.php?action=qform_export_entries&_wpnonce=…&<siyahının filtrləri>` →
 * CSV faylı (yeni spec §5). Filtrlər siyahı ilə eyni oxunur (EntryQuery::forSite).
 */
final class EntriesExport
{
    public const ACTION = 'qform_export_entries';

    public static function register(): void
    {
        add_action( 'admin_post_' . self::ACTION, [ self::class, 'handle' ] );
    }

    /**
     * `add_query_arg()` — `wp_nonce_url()` DEYİL: o, URL-i esc_html-dən keçirir və `&amp;`
     * qaytarır; JSON konfiqurasiyaya düşəndə brauzer `amp;_wpnonce` göndərir və eksport
     * həmişə 403 olur.
     */
    public static function url(): string
    {
        return add_query_arg(
            [
                'action'   => self::ACTION,
                '_wpnonce' => wp_create_nonce( self::ACTION ),
            ],
            admin_url( 'admin-post.php' )
        );
    }

    /**
     * @param array<string, mixed> $params
     */
    public static function authorize( array $params ): void
    {
        if ( ! current_user_can( Capabilities::EXPORT_ENTRIES ) ) {
            wp_die( esc_html__( 'Sorry, you are not allowed to export entries.', 'quoteform' ), '', [ 'response' => 403 ] );
        }

        $nonce = isset( $params['_wpnonce'] ) && is_string( $params['_wpnonce'] ) ? $params['_wpnonce'] : '';

        if ( ! wp_verify_nonce( $nonce, self::ACTION ) ) {
            wp_die( esc_html__( 'This export link has expired. Reload the Entries page and try again.', 'quoteform' ), '', [ 'response' => 403 ] );
        }
    }

    public static function filename(): string
    {
        return 'quoteform-entries-' . wp_date( 'Y-m-d' ) . '.csv';
    }

    public static function handle(): void
    {
        $params = wp_unslash( $_GET ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified in authorize().
        $params = is_array( $params ) ? $params : [];

        self::authorize( $params );

        // Axın: bufer qalsa böyük eksport yaddaşda yığılar və başlıqlar gec gedər.
        // `ob_end_clean()` bəzi buferləri (məs. `output_buffering` qoruyucu bufer) silə
        // bilmir və `false` qaytarır — silinməzsə dövrü dayandırırıq, əks halda sonsuz
        // dövr olardı (Fix round 1, controller ruling R2).
        while ( ob_get_level() > 0 ) {
            if ( ! ob_end_clean() ) {
                break;
            }
        }

        // Böyük eksport `max_execution_time`-ı aşa bilər; CLI-də funksiya deaktiv ola bilər.
        if ( function_exists( 'set_time_limit' ) ) {
            set_time_limit( 0 ); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- a large export can outlast max_execution_time.
        }

        nocache_headers();
        header( 'Content-Type: text/csv; charset=utf-8' );
        header( 'Content-Disposition: attachment; filename="' . self::filename() . '"' );
        header( 'X-Content-Type-Options: nosniff' );

        $out = fopen( 'php://output', 'w' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- response output stream, not a file.

        if ( false !== $out ) {
            ( new CsvExporter() )->write( EntryQuery::forSite( $params ), $out );
            fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- response output stream, not a file.
        }

        exit;
    }
}
