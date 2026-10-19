<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

use Quoteform\Engine\Functions;

/**
 * frontend-src/runtime/format.js-in PHP əkizi. JS ayırıcıları brauzerin
 * dilindən (`toLocaleString`) alır; PHP onları çağırandan alır (WordPress
 * qatı `$wp_locale`-dən ötürür) — runtime WP-dən asılı qalmır.
 *
 * JS toLocaleString böyük rəqəmlər üçün "ən qısa round-trip" rəqəmlərini işlədir,
 * yəni double-in dəqiq ikili genişlənməsini deyil. Bunu PHP-də təkrarlamaq üçün
 * JsNumber::digits() istifadə olunur.
 */
final class MoneyFormatter
{
    private const SYMBOLS = [
        'USD' => '$',
        'EUR' => '€',
        'GBP' => '£',
        'JPY' => '¥',
        'AUD' => 'A$',
        'CAD' => 'C$',
        'CHF' => 'CHF',
        'SEK' => 'kr',
        'NOK' => 'kr',
        'DKK' => 'kr',
        'PLN' => 'zł',
        'TRY' => '₺',
        'AZN' => '₼',
        'RUB' => '₽',
        'INR' => '₹',
        'BRL' => 'R$',
        'ZAR' => 'R',
        'NZD' => 'NZ$',
    ];

    /**
     * @param mixed                $amount
     * @param array<string, mixed> $settings
     */
    public static function format( $amount, array $settings, string $thousands = ',', string $decimalPoint = '.' ): string
    {
        if ( ! ( is_int( $amount ) || is_float( $amount ) ) || ! is_finite( (float) $amount ) ) {
            return '—';
        }

        $decimals = is_int( $settings['decimals'] ?? null ) ? $settings['decimals'] : 2;
        $rounded  = Functions::roundHalfAwayFromZero( (float) $amount, $decimals );
        $currency = is_string( $settings['currency'] ?? null ) ? $settings['currency'] : '';
        $symbol   = self::SYMBOLS[ $currency ] ?? $currency;

        // Build decimal string from shortest-round-trip digits (like JS toLocaleString).
        list( $jsDigits, $jsExponent ) = JsNumber::digits( abs( $rounded ) );
        $decimalString = self::buildDecimalString( $jsDigits, $jsExponent, $decimals, $thousands, $decimalPoint );

        $body = 'after' === ( $settings['currency_position'] ?? null ) ? $decimalString . ' ' . $symbol : $symbol . $decimalString;

        return $rounded < 0 ? '-' . $body : $body;
    }

    /**
     * JS-style shortest-round-trip rəqəmlərindən formatlaşdırılmış pul sətiri qurur.
     * Rəqəm artıq Functions::roundHalfAwayFromZero() tərəfindən yuvarlaqlaşdırılıb.
     *
     * @param string $jsDigits      Sıfırsız rəqəmlərin sətri ('123', '456', '1', etc.)
     * @param int    $jsExponent    Onluq mövqeyi (value = 0.$jsDigits × 10^$jsExponent)
     * @param int    $decimals      Kəsirin rəqəmlərinin sayı
     * @param string $thousands     Minlik ayırıcısı
     * @param string $decimalPoint  Onluq nöqtəsi
     */
    private static function buildDecimalString( string $jsDigits, int $jsExponent, int $decimals, string $thousands, string $decimalPoint ): string
    {
        // Sıradan sonra onluq nöqtənin mövqeyini hesabla (ECMA-262).
        // eksponent = integer_digit_count.
        // Əgər eksponent > 0 və <= strlen(digits), nöqtə digits içində olur.
        // Əgər eksponent > strlen(digits), trailing sıfırlar əlavə olunur.
        // Əgər eksponent <= 0, leading sıfırlar əlavə olunur (0.00...0digits).

        $len = strlen( $jsDigits );

        if ( $jsExponent > $len ) {
            // Trailing sıfırlar: '123' with exponent 5 → '12300'
            $integer = $jsDigits . str_repeat( '0', $jsExponent - $len );
            $fraction = '';
        } elseif ( $jsExponent > 0 ) {
            // Nöqtə digits içində
            $integer = substr( $jsDigits, 0, $jsExponent );
            $fraction = substr( $jsDigits, $jsExponent );
        } else {
            // Leading sıfırlar: exponent -1 → '0.0...'
            $integer = '0';
            $fraction = str_repeat( '0', -$jsExponent ) . $jsDigits;
        }

        // Kəsiri $decimals rəqəminə tunc etmək (artıq yuvarlaqlaşdırılmış).
        if ( $decimals > 0 ) {
            $fraction = substr( $fraction, 0, $decimals );
            $fraction = str_pad( $fraction, $decimals, '0', STR_PAD_RIGHT );
        } else {
            $fraction = '';
        }

        // Tam rəqəmi minliklərlə qrup et.
        $integer = self::groupInteger( $integer, $thousands );

        // Birləşdir.
        return '' === $fraction ? $integer : $integer . $decimalPoint . $fraction;
    }

    /**
     * Tam rəqəmi minliklərlə qrup et: '123456789' → '123,456,789' (US).
     */
    private static function groupInteger( string $integer, string $thousands ): string
    {
        $reversed = strrev( $integer );
        $grouped = implode( $thousands, str_split( $reversed, 3 ) );

        return strrev( $grouped );
    }
}
