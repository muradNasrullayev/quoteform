<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Sahə və hesablama açarlarının qaydaları.
 *
 * Açar KİÇİK HƏRFLƏ BAŞLAMALIDIR. Bu, səliqə məsələsi deyil: Plan 01-də iki real
 * qüsur məhz açar formatından doğmuşdu — PHP rəqəmə oxşayan massiv açarlarını
 * `int`-ə çevirir (fatal xəta verirdi), JavaScript obyekti isə onları qalan
 * açarlardan əvvələ sıralayır. Hərflə başlamağı tələb etmək bu sinfi
 * istifadəçi girişindən gələ bilməz edir.
 *
 * Hərflə başlama həm də `__proto__` açarını bloklayır.
 */
final class KeyRules
{
    private const PATTERN = '/^[a-z][a-z0-9_]{0,63}$/D';

    /**
     * JavaScript-də kiçik hərflərlə yazılan, açarın adı ilə üst-üstə düşə biləcək adlar.
     *
     * Açar formatı yalnız kiçik hərflərə icazə verdiyi üçün JavaScript-in əsl
     * camelCase built-in-ləri (`hasOwnProperty`, `toString`, `valueOf`) bu
     * açarla heç vaxt üst-üstə düşə bilməz — onlar böyük hərf daşıyır, açar isə
     * daşıya bilməz. `__proto__` isə alt xətt ilə başladığı üçün artıq
     * qadağandır (bax: PATTERN). Ona görə də yalnız JavaScript-də əslində
     * kiçik hərflə yazılan bu iki ad üçün ayrıca giriş lazımdır.
     *
     * @var string[]
     */
    private const RESERVED = [
        'constructor',
        'prototype',
    ];

    public static function isValidFormat( string $key ): bool
    {
        return preg_match( self::PATTERN, $key ) === 1;
    }

    public static function isReserved( string $key ): bool
    {
        return in_array( $key, self::RESERVED, true );
    }

    public static function validate( string $key, string $path, ValidationResult $result ): bool
    {
        if ( ! self::isValidFormat( $key ) ) {
            $result->addError(
                $path,
                'invalid_key_format',
                __( 'A key must start with a lowercase letter and may contain only lowercase letters, digits and underscores (max 64 characters).', 'quoteform' ),
                [ 'key' => $key ]
            );

            return false;
        }

        if ( self::isReserved( $key ) ) {
            $result->addError(
                $path,
                'reserved_key',
                __( 'This key is reserved and cannot be used.', 'quoteform' ),
                [ 'key' => $key ]
            );

            return false;
        }

        return true;
    }
}
