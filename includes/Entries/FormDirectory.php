<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use Quoteform\Forms\FormPostType;
use WP_Post;

/**
 * Müraciətlərin aid olduğu formalar. `post_status => 'any'` zibil qutusunu
 * (və auto-draft-ı) çıxarır — zibildəki forma müraciətlər üçün "silinmiş"dir,
 * "Deleted forms" filtri də məhz bu dəstin əksidir.
 */
final class FormDirectory
{
    /**
     * @return array<int, string> id → başlıq, başlığa görə
     */
    public static function all(): array
    {
        $forms = [];

        foreach ( get_posts( self::args( [ 'orderby' => 'title', 'order' => 'ASC' ] ) ) as $post ) {
            if ( $post instanceof WP_Post ) {
                $forms[ (int) $post->ID ] = (string) $post->post_title;
            }
        }

        return $forms;
    }

    /**
     * @return int[]
     */
    public static function liveIds(): array
    {
        return array_map( 'intval', get_posts( self::args( [ 'fields' => 'ids' ] ) ) );
    }

    /**
     * Bir sorğu ilə: siyahının cari səhifəsindəki formaların başlıqları.
     *
     * @param int[] $ids
     * @return array<int, string>
     */
    public static function titles( array $ids ): array
    {
        $ids = array_values( array_unique( array_filter( array_map( 'intval', $ids ), static function ( int $id ): bool {
            return $id > 0;
        } ) ) );

        if ( [] === $ids ) {
            return [];
        }

        $titles = [];

        foreach ( get_posts( self::args( [ 'post__in' => $ids, 'orderby' => 'post__in' ] ) ) as $post ) {
            if ( $post instanceof WP_Post ) {
                $titles[ (int) $post->ID ] = (string) $post->post_title;
            }
        }

        return $titles;
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    private static function args( array $extra ): array
    {
        return array_merge(
            [
                'post_type'               => FormPostType::POST_TYPE,
                'post_status'             => 'any',
                'numberposts'             => -1,
                'no_found_rows'           => true,
                'update_post_meta_cache'  => false,
                'update_post_term_cache'  => false,
            ],
            $extra
        );
    }
}
