<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

use Quoteform\Engine\Values as EngineValues;

/**
 * frontend-src/runtime/values.js-in PHP əkizi. WordPress-dən asılı DEYİL.
 *
 * Hər qərar JS tərəfi ilə eyni olmalıdır — fərq tests/fixtures/submissions.json
 * tərəfindən tutulur. JS-in `String()` və `Number()` davranışları burada açıq
 * şəkildə təkrarlanır (`stringify()`), çünki PHP-nin öz çevrilmələri fərqlidir
 * (`(string) true === '1'`, JS-də isə `'true'`).
 */
final class Values
{
    private const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox' ];
    private const NUMERIC_TYPES       = [ 'number', 'slider' ];
    private const MULTI_TYPES         = [ 'checkbox' ];

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return mixed
     */
    public static function normalise( array $field, $raw )
    {
        $type = $field['type'] ?? '';

        if ( in_array( $type, self::MULTI_TYPES, true ) ) {
            return is_array( $raw ) ? array_values( $raw ) : [];
        }

        if ( 'toggle' === $type ) {
            return ( true === $raw || 1 === $raw || 1.0 === $raw || '1' === $raw ) ? 1 : 0;
        }

        if ( null === $raw || '' === $raw ) {
            return '';
        }

        if ( in_array( $type, self::NUMERIC_TYPES, true ) ) {
            if ( is_int( $raw ) || is_float( $raw ) ) {
                // JS: String(Infinity) === 'Infinity' rəqəm qaydasına uyğun gəlmir → ''.
                return is_finite( (float) $raw ) ? (float) $raw : '';
            }

            $text = self::stringify( $raw );

            return EngineValues::isNumericString( $text ) ? (float) $text : '';
        }

        return self::stringify( $raw );
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $raw
     * @return mixed
     */
    public static function normaliseConditionValue( array $field, $raw )
    {
        if ( in_array( $field['type'] ?? '', self::MULTI_TYPES, true ) ) {
            return self::stringify( $raw );
        }

        return self::normalise( $field, $raw );
    }

    /**
     * @param array<string, mixed> $field
     * @return array<int, mixed>|string
     */
    public static function emptyFor( array $field )
    {
        return in_array( $field['type'] ?? '', self::MULTI_TYPES, true ) ? [] : '';
    }

    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $state
     * @param array<string, true>  $visibleFields
     * @return array<string, mixed>
     */
    public static function variablesFor( array $schema, array $state, array $visibleFields ): array
    {
        $fields    = is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
        $variables = [];

        foreach ( $fields as $key => $field ) {
            $key      = (string) $key;
            $stateKey = is_string( $field['key'] ?? null ) ? $field['key'] : $key;
            $value    = isset( $visibleFields[ $key ] )
                ? self::normalise( $field, $state[ $stateKey ] ?? null )
                : self::emptyFor( $field );

            $variables[ $key ] = $value;

            if ( ! in_array( $field['type'] ?? '', self::PRICE_BEARING_TYPES, true ) ) {
                continue;
            }

            if ( in_array( $field['type'], self::MULTI_TYPES, true ) ) {
                $sum = 0;

                foreach ( $value as $selected ) {
                    $sum += self::optionPrice( $field, $selected );
                }

                $variables[ $key . '.price' ] = $sum;

                continue;
            }

            $variables[ $key . '.price' ] = '' === $value ? 0 : self::optionPrice( $field, $value );
        }

        return $variables;
    }

    /**
     * JS `String( value )`. Yalnız normallaşdırmanın və şərt dəyərlərinin
     * ehtiyac duyduğu tiplər üçün dəqiqdir; float-ların eksponent yazılışı
     * ən yaxın JS formasına gətirilir.
     *
     * @param mixed $raw
     */
    public static function stringify( $raw ): string
    {
        if ( is_string( $raw ) ) {
            return $raw;
        }

        if ( null === $raw ) {
            return 'null';
        }

        if ( is_bool( $raw ) ) {
            return $raw ? 'true' : 'false';
        }

        if ( is_int( $raw ) ) {
            return (string) $raw;
        }

        if ( is_float( $raw ) ) {
            return self::numberToString( $raw );
        }

        if ( is_array( $raw ) ) {
            $parts = [];

            foreach ( $raw as $item ) {
                $parts[] = null === $item ? '' : self::stringify( $item );
            }

            return implode( ',', $parts );
        }

        return '';
    }

    /**
     * ECMA-262 Number::toString ( https://tc39.es/ecma262/#sec-numeric-types-number-tostring ).
     * PHP-nin öz float→string çevrilmələri (`(string)`, `sprintf('%.0f')`, sadə `json_encode()`)
     * bunu düzgün əks etdirmir: `json_encode` default `serialize_precision`-da yuvarlaqlaşdırma
     * artefaktları verir, `%.0f` isə böyük tam ədədlər üçün float-ın DƏQIQ (nə JS-in göstərdiyi
     * "qısa round-trip" formasını deyil) onluq genişlənməsini çap edir — bax Fix round 1,
     * `123456789012345680000` halı.
     */
    private static function numberToString( float $number ): string
    {
        if ( is_nan( $number ) ) {
            return 'NaN';
        }

        if ( is_infinite( $number ) ) {
            return $number > 0 ? 'Infinity' : '-Infinity';
        }

        if ( 0.0 === $number ) {
            return '0';
        }

        $negative = $number < 0;

        list( $digits, $exponent ) = JsNumber::digits( abs( $number ) );
        $formatted                 = self::formatShortestDigits( $digits, $exponent );

        return $negative ? '-' . $formatted : $formatted;
    }

    /**
     * ECMA-262 Number::toString-un formatlaşdırma addımları: `$digits` = `s` (rəqəm sətri),
     * `$exponent` = `n` (`value = 0.s * 10^n`), `$k` = `strlen(s)`.
     */
    private static function formatShortestDigits( string $digits, int $exponent ): string
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

        $mantissaPart = $k > 1 ? $digits[0] . '.' . substr( $digits, 1 ) : $digits;
        $exponentPart = ( $n - 1 >= 0 ? '+' : '-' ) . abs( $n - 1 );

        return $mantissaPart . 'e' . $exponentPart;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $value
     * @return int|float
     */
    private static function optionPrice( array $field, $value )
    {
        $options = is_array( $field['options'] ?? null ) ? $field['options'] : [];

        foreach ( $options as $option ) {
            if ( is_array( $option ) && array_key_exists( 'value', $option ) && $option['value'] === $value ) {
                $price = $option['price'] ?? null;

                return ( is_int( $price ) || is_float( $price ) ) ? $price : 0;
            }
        }

        return 0;
    }
}
