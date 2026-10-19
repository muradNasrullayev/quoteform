<?php

declare(strict_types=1);

namespace Quoteform\Engine;

// phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- engine exception messages are never printed: callers read getCodeSlug() and show their own translated text.
final class Values
{
    /**
     * @param mixed $value
     */
    public static function toNumber( $value, int $position = 0 ): float
    {
        if ( $value === null || $value === '' ) {
            return 0.0;
        }

        if ( is_bool( $value ) ) {
            return $value ? 1.0 : 0.0;
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            $number = (float) $value;

            self::assertFinite( $number, $position );

            return $number;
        }

        if ( is_string( $value ) && self::isNumericString( $value ) ) {
            $number = (float) $value;

            self::assertFinite( $number, $position );

            return $number;
        }

        throw new ExpressionException(
            'type_error',
            'This value cannot be used in a calculation.',
            $position,
            [ 'value' => is_array( $value ) ? 'list' : (string) $value ]
        );
    }

    /**
     * `Infinity`/`NaN` iki mühərrikdə (PHP/JS) fərqli davranır — məsələn PHP-nin min()/max()
     * `<` ilə müqayisə edir (NAN-a qarşı false), JS-in Math.min()/Math.max() isə NaN-poisoning-dir.
     * Buna görə qeyri-sonlu ədədlər mənbədə, bu iki nöqtədə (toNumber və evaluateBinary) rədd edilir.
     */
    private static function assertFinite( float $number, int $position ): void
    {
        if ( ! is_finite( $number ) ) {
            throw new ExpressionException(
                'not_finite',
                'This number is too large to use in a calculation.',
                $position
            );
        }
    }

    /**
     * @param mixed $value
     */
    public static function toBool( $value ): bool
    {
        if ( $value === null || $value === '' || $value === false ) {
            return false;
        }

        if ( is_array( $value ) ) {
            return $value !== [];
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return ( (float) $value ) !== 0.0;
        }

        return true;
    }

    /**
     * @param mixed $value
     */
    public static function isNumericLike( $value ): bool
    {
        if ( $value === null || $value === '' || is_bool( $value ) ) {
            return true;
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return true;
        }

        return is_string( $value ) && self::isNumericString( $value );
    }

    /**
     * Rəqəmsal sətir qaydası JS tərəfi ilə EYNİ regex-dir (frontend-src/engine/values.js).
     * PHP-nin is_numeric() funksiyası boşluqlu və hex sətirləri fərqli qəbul etdiyi üçün istifadə edilmir.
     *
     * `D` modifikatoru YÜKDAŞIYICIDIR və "səliqəyə salınmamalıdır": PCRE-də `$` sətrin sonundan
     * əvvəl gələn son sətirsonu simvolunun da qarşısında uyğunlaşır, JavaScript-in `$`-ı isə yox.
     * `D` olmadan "5\n" PHP tərəfində rəqəm sayılır, JS tərəfində isə yox — bu, iki mühərrikin
     * fərqli nəticə verməsinə səbəb olur (bax tests/fixtures/expressions.json trailing-newline halları).
     *
     * Runtime\Values da istifadə edir.
     */
    public static function isNumericString( string $candidate ): bool
    {
        return preg_match( '/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/D', $candidate ) === 1;
    }

    /**
     * @param mixed $left
     * @param mixed $right
     */
    public static function equals( $left, $right ): bool
    {
        $left  = $left === null ? '' : $left;
        $right = $right === null ? '' : $right;

        $leftType  = self::typeOf( $left );
        $rightType = self::typeOf( $right );

        if ( $leftType !== $rightType ) {
            return false;
        }

        if ( $leftType === 'list' ) {
            if ( count( $left ) !== count( $right ) ) {
                return false;
            }

            foreach ( $left as $index => $item ) {
                if ( ! array_key_exists( $index, $right ) || $item !== $right[ $index ] ) {
                    return false;
                }
            }

            return true;
        }

        if ( $leftType === 'number' ) {
            return ( (float) $left ) === ( (float) $right );
        }

        return $left === $right;
    }

    /**
     * @param mixed $left
     * @param mixed $right
     * @return int -1, 0 or 1
     */
    public static function compare( $left, $right, int $position = 0 ): int
    {
        $left  = $left === null ? '' : $left;
        $right = $right === null ? '' : $right;

        if ( self::isNumericLike( $left ) && self::isNumericLike( $right ) ) {
            $leftNumber  = self::toNumber( $left, $position );
            $rightNumber = self::toNumber( $right, $position );

            if ( $leftNumber === $rightNumber ) {
                return 0;
            }

            return $leftNumber < $rightNumber ? -1 : 1;
        }

        if ( is_string( $left ) && is_string( $right ) ) {
            $result = strcmp( $left, $right );

            if ( $result === 0 ) {
                return 0;
            }

            return $result < 0 ? -1 : 1;
        }

        throw new ExpressionException(
            'type_error',
            'These two values cannot be compared with each other.',
            $position
        );
    }

    /**
     * @param mixed $value
     */
    private static function typeOf( $value ): string
    {
        if ( is_bool( $value ) ) {
            return 'boolean';
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return 'number';
        }

        if ( is_array( $value ) ) {
            return 'list';
        }

        return 'string';
    }
}
