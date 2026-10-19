<?php

declare(strict_types=1);

namespace Quoteform\Support;

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryPreferences;
use Quoteform\Forms\FormPostType;

/**
 * Plugin silinərkən aparılan tam təmizlik — bax `Activation` sinfinin
 * şərhinə: capability-lər deaktivasiyada yox, məhz burada silinir.
 *
 * Şəbəkə (multisite) quraşdırmasında WordPress uninstall-ı BİR DƏFƏ çağırır,
 * lakin həm formalar, həm də rollar hər saytda ayrıca saxlanılır. Ona görə
 * bütün saytlar gəzilir: yalnız cari saytı təmizləmək qalan saytlarda həm
 * məlumatı, həm də artıq heç nəyin oxumadığı icazələri qoyub gedərdi.
 *
 * Miqyas üçün nə sayt siyahısı, nə də post-lar bütöv yüklənmir: hər ikisi
 * hissə-hissə (yalnız ID-lər) oxunur.
 */
final class Uninstaller
{
    private const POST_BATCH_SIZE = 200;
    private const SITE_BATCH_SIZE = 100;

    public static function run(): void
    {
        if ( ! is_multisite() ) {
            self::cleanCurrentSite();
            self::deleteUserPreferences();

            return;
        }

        $offset = 0;

        while ( true ) {
            $siteIds = get_sites(
                [
                    'fields'  => 'ids',
                    'number'  => self::SITE_BATCH_SIZE,
                    'offset'  => $offset,
                    'orderby' => 'id',
                ]
            );

            if ( empty( $siteIds ) ) {
                self::deleteUserPreferences();

                return;
            }

            foreach ( $siteIds as $siteId ) {
                switch_to_blog( (int) $siteId );
                self::cleanCurrentSite();
                restore_current_blog();
            }

            $offset += self::SITE_BATCH_SIZE;
        }
    }

    private static function cleanCurrentSite(): void
    {
        Capabilities::revokeFromAllRoles();

        self::deleteAllForms();

        EntriesTable::drop();
    }

    private static function deleteAllForms(): void
    {
        global $wpdb;

        while ( true ) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- uninstall must see every status (trash, auto-draft included), which get_posts() does not return together.
            $ids = $wpdb->get_col(
                $wpdb->prepare(
                    "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s LIMIT %d",
                    FormPostType::POST_TYPE,
                    self::POST_BATCH_SIZE
                )
            );

            if ( empty( $ids ) ) {
                return;
            }

            $deleted = 0;

            foreach ( $ids as $id ) {
                if ( wp_delete_post( (int) $id, true ) ) {
                    $deleted++;
                }
            }

            // Silinməsi mümkün olmayan sətir qalarsa eyni dəstə sonsuz
            // təkrarlanardı: irəliləyiş dayandısa dövrəni burax.
            if ( 0 === $deleted ) {
                return;
            }
        }
    }

    /**
     * User meta şəbəkə üzrə bir cədvəldədir — hər sayt üçün yox, BİR dəfə silinir.
     * `is_multisite()`-dən sonra çağırılır: `UninstallTest` faylın ilk WordPress
     * çağırışının `is_multisite` olduğunu yoxlayır.
     */
    private static function deleteUserPreferences(): void
    {
        delete_metadata( 'user', 0, EntryPreferences::META, '', true );
    }
}
