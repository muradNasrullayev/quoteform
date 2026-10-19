<?php

declare(strict_types=1);

namespace Quoteform\Support;

/**
 * Bayt ofsetini UTF-16 kod vahidi ofsetinə çevirir.
 *
 * Mühərrikin lexer-i bayt ofseti verir, çünki PHP sətirləri bayt massividir.
 * Həmin ofsetin yeganə istehlakçısı builder-dir və o, JavaScript-dir —
 * JS sətir indeksləri isə UTF-16 kod vahididir. Bayt ofsetini birbaşa ötürsək,
 * qeyri-ASCII simvol daşıyan istənilən ifadədə kursor səhv yerə düşər.
 *
 * mbstring QƏSDƏN istifadə edilmir: rəsmi PHP Docker image-lərində o, default
 * olaraq qurulmur. Hesablama birbaşa UTF-8 baytları üzərində aparılır.
 *
 * ŞƏRT: `$byteOffset` UTF-8 simvol sərhədinə düşməlidir — lexer-in verdiyi
 * ofsetlər elədir. Ofset çoxbaytlı ardıcıllığın ortasına düşərsə, nəticə
 * müəyyən edilməmişdir (funksiya bunu aşkarlaya bilmir).
 */
final class TextPosition
{
    public static function byteToUtf16( string $source, int $byteOffset ): int
    {
        if ( $byteOffset <= 0 ) {
            return 0;
        }

        $prefix = substr( $source, 0, $byteOffset );
        $length = strlen( $prefix );
        $units  = 0;

        for ( $index = 0; $index < $length; $index++ ) {
            $byte = ord( $prefix[ $index ] );

            // Davam baytı (10xxxxxx) yeni simvol başlatmır.
            if ( ( $byte & 0xC0 ) === 0x80 ) {
                continue;
            }

            // Dörd baytlıq ardıcıllıq (11110xxx) UTF-16-da surroqat cütdür.
            $units += ( ( $byte & 0xF8 ) === 0xF0 ) ? 2 : 1;
        }

        return $units;
    }
}
