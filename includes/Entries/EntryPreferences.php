<?php

declare(strict_types=1);

namespace Quoteform\Entries;

/**
 * Müraciət siyahısının səhifə ölçüsü — istifadəçinin öz seçimi (spec §3.1).
 * URL-də saxlanmır: paylaşılan link başqasının seçimini dəyişməməlidir.
 */
final class EntryPreferences
{
    public const META             = 'qform_entries_per_page';
    public const DEFAULT_PER_PAGE = 20;
    public const MAX_PER_PAGE     = 100;

    public static function perPage( int $userId ): int
    {
        $stored = $userId > 0 ? (int) get_user_meta( $userId, self::META, true ) : 0;

        return $stored >= 1 && $stored <= self::MAX_PER_PAGE ? $stored : self::DEFAULT_PER_PAGE;
    }

    /**
     * @param mixed $raw
     */
    public static function save( int $userId, $raw ): int
    {
        if ( ! is_numeric( $raw ) ) {
            return self::perPage( $userId );
        }

        $value = max( 1, min( self::MAX_PER_PAGE, (int) $raw ) );

        if ( $userId > 0 && self::perPage( $userId ) !== $value ) {
            update_user_meta( $userId, self::META, $value );
        }

        return $value;
    }
}
