<?php

declare(strict_types=1);

namespace Quoteform\Support;

use Quoteform\Entries\EntriesTable;
use WP_Site;

/**
 * Aktivasiya və deaktivasiya hook-ları.
 *
 * Deaktivasiya capability-ləri QƏSDƏN silmir: plugin müvəqqəti söndürülüb
 * yenidən açıla bilər və hər dəfə icazələrin itməsi gözlənilməzdir.
 * Tam təmizlik uninstall-da aparılır.
 */
final class Activation
{
    /**
     * @param mixed $networkWide Core `null` də ötürə bilər (məs. wp-cli) — tip qəsdən yazılmayıb.
     */
    public static function activate( $networkWide = false ): void
    {
        $networkWide = (bool) $networkWide;

        if ( ! is_multisite() || ! $networkWide ) {
            self::installSite();
        } else {
            foreach ( get_sites( [ 'fields' => 'ids', 'number' => 0 ] ) as $siteId ) {
                switch_to_blog( (int) $siteId );
                self::installSite();
                restore_current_blog();
            }
        }

        flush_rewrite_rules();
    }

    /**
     * `wp_initialize_site`: yalnız plugin ŞƏBƏKƏ üzrə aktivdirsə. Sonradan
     * pluginini özü aktivləşdirən sayt cədvəli aktivasiya hook-u (və `init`
     * versiya yoxlaması) ilə alır.
     */
    public static function onNewSite( WP_Site $site ): void
    {
        if ( ! is_multisite() ) {
            return;
        }

        if ( ! function_exists( 'is_plugin_active_for_network' ) ) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        if ( ! defined( 'QFORM_FILE' ) || ! is_plugin_active_for_network( plugin_basename( QFORM_FILE ) ) ) {
            return;
        }

        switch_to_blog( (int) $site->blog_id );
        self::installSite();
        restore_current_blog();
    }

    /**
     * Cari sayt üçün: capability-lər + müraciət cədvəli.
     */
    private static function installSite(): void
    {
        Capabilities::grantToAdministrator();
        EntriesTable::install();
    }

    public static function deactivate(): void
    {
        flush_rewrite_rules();
    }
}
