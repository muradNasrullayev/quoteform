<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

/**
 * JS Number.prototype.toString() və toLocaleString() üçün ən qısa round-trip
 * rəqəmləri extract edir. WordPress-dən asılı deyil.
 */
final class JsNumber
{
    /**
     * `$absValue`-in ən qısa round-trip onluq rəqəm sətrini (`$digits`, aparıcı/sonrakı sıfırsız)
     * və onluq eksponentini (`$exponent`, `value = 0.$digits * 10^$exponent`) qaytarır.
     *
     * JS mühərrikləri bunu öz daxili dtoa alqoritmi ilə hesablayır; PHP-də ekvivalent birbaşa
     * yoxdur, lakin `serialize_precision = -1` ilə `json_encode()` eyni "ən qısa round-trip"
     * rəqəmlərini verir (PHP-nin daxili `zend_gcvt` yolu).
     *
     * @return array{0: string, 1: int}
     */
    public static function digits( float $absValue ): array
    {
        $previousPrecision = ini_get( 'serialize_precision' );
        ini_set( 'serialize_precision', '-1' ); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- restored on the next line; json_encode() needs the shortest round-trip digits.
        $encoded = (string) json_encode( $absValue );
        ini_set( 'serialize_precision', false === $previousPrecision ? '-1' : $previousPrecision ); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- restores the value saved above.

        $mantissa      = $encoded;
        $pointExponent = 0;

        $ePosition = stripos( $encoded, 'e' );
        if ( false !== $ePosition ) {
            $mantissa      = substr( $encoded, 0, $ePosition );
            $pointExponent = (int) substr( $encoded, $ePosition + 1 );
        }

        $dotPosition = strpos( $mantissa, '.' );
        if ( false === $dotPosition ) {
            $integerDigits  = $mantissa;
            $fractionDigits = '';
        } else {
            $integerDigits  = substr( $mantissa, 0, $dotPosition );
            $fractionDigits = substr( $mantissa, $dotPosition + 1 );
        }

        $digits   = $integerDigits . $fractionDigits;
        $exponent = strlen( $integerDigits ) + $pointExponent;

        $withoutLeadingZeros = ltrim( $digits, '0' );
        $exponent           -= strlen( $digits ) - strlen( $withoutLeadingZeros );
        $digits              = rtrim( $withoutLeadingZeros, '0' );

        if ( '' === $digits ) {
            $digits   = '0';
            $exponent = 1;
        }

        return [ $digits, $exponent ];
    }

    /**
     * ECMA-262 Number::toString-un formatlaşdırma addımları: `$digits` = `s` (rəqəm sətri),
     * `$exponent` = `n` (`value = 0.s * 10^n`), `$k` = `strlen(s)`.
     * Onluq sətir qaytarır (eksponent yazılışı yoxdur).
     */
    public static function toDecimalString( string $digits, int $exponent ): string
    {
        $k = strlen( $digits );
        $n = $exponent;

        if ( $k <= $n && $n <= 21 ) {
            return $digits . str_repeat( '0', $n - $k );
        }

        if ( 0 < $n && $n <= 21 ) {
            return substr( $digits, 0, $n ) . '.' . substr( $digits, $n );
        }

        if ( -6 < $n && $n <= 0 ) {
            return '0.' . str_repeat( '0', -$n ) . $digits;
        }

        // Əgər hələ ki eksponent forması lazımdırsa (burada biz bunu gözləmirik).
        $mantissaPart = $k > 1 ? $digits[0] . '.' . substr( $digits, 1 ) : $digits;
        $exponentPart = ( $n - 1 >= 0 ? '+' : '-' ) . abs( $n - 1 );

        return $mantissaPart . 'e' . $exponentPart;
    }
}
