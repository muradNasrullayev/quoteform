<?php

declare(strict_types=1);

namespace Quoteform\Engine;

// phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- engine exception messages are never printed: callers read getCodeSlug() and show their own translated text.
final class Functions
{
    /**
     * Funksiya adı => [minimum arqument sayı, maksimum arqument sayı və ya null (limitsiz)].
     *
     * @var array<string, array{0: int, 1: int|null}>
     */
    private const SIGNATURES = [
        'min'      => [ 1, null ],
        'max'      => [ 1, null ],
        'sum'      => [ 0, null ],
        'round'    => [ 1, 2 ],
        'ceil'     => [ 1, 1 ],
        'floor'    => [ 1, 1 ],
        'abs'      => [ 1, 1 ],
        'contains' => [ 2, 2 ],
        'is_empty' => [ 1, 1 ],
    ];

    public function has( string $name ): bool
    {
        return isset( self::SIGNATURES[ $name ] );
    }

    /**
     * @param array<int, mixed> $arguments
     * @return float|bool
     */
    public function call( string $name, array $arguments, int $position = 0 )
    {
        if ( ! $this->has( $name ) ) {
            throw new ExpressionException(
                'unknown_function',
                sprintf( 'There is no function called "%s".', $name ),
                $position,
                [ 'name' => $name ]
            );
        }

        [ $minimum, $maximum ] = self::SIGNATURES[ $name ];
        $count                 = count( $arguments );

        if ( $count < $minimum || ( $maximum !== null && $count > $maximum ) ) {
            throw new ExpressionException(
                'wrong_argument_count',
                sprintf( '"%s" was given %d argument(s).', $name, $count ),
                $position,
                [ 'name' => $name, 'given' => $count, 'min' => $minimum, 'max' => $maximum ]
            );
        }

        switch ( $name ) {
            case 'contains':
                return self::containsValue( $arguments[0], $arguments[1] );

            case 'is_empty':
                return self::isEmptyValue( $arguments[0] );
        }

        $numbers = [];

        foreach ( $arguments as $argument ) {
            $numbers[] = Values::toNumber( $argument, $position );
        }

        switch ( $name ) {
            case 'min':
                return (float) min( $numbers );

            case 'max':
                return (float) max( $numbers );

            case 'sum':
                return array_sum( $numbers ) + 0.0;

            case 'round':
                $precision = isset( $numbers[1] ) ? self::toPrecision( $numbers[1], $position ) : 0;
                return self::roundHalfAwayFromZero( $numbers[0], $precision );

            case 'ceil':
                return ceil( $numbers[0] );

            case 'floor':
                return floor( $numbers[0] );

            case 'abs':
                return abs( $numbers[0] );
        }

        throw new ExpressionException( 'unknown_function', sprintf( 'There is no function called "%s".', $name ), $position );
    }

    /**
     * @param mixed $value
     */
    private static function isEmptyValue( $value ): bool
    {
        if ( $value === null ) {
            return true;
        }

        if ( is_array( $value ) ) {
            return count( $value ) === 0;
        }

        return $value === '';
    }

    /**
     * @param mixed $haystack
     * @param mixed $needle
     */
    private static function containsValue( $haystack, $needle ): bool
    {
        if ( $haystack === null ) {
            return false;
        }

        if ( is_array( $haystack ) ) {
            foreach ( $haystack as $item ) {
                if ( Values::equals( $item, $needle ) ) {
                    return true;
                }
            }

            return false;
        }

        if ( ! is_string( $haystack ) || ! is_string( $needle ) ) {
            return false;
        }

        return $needle === '' || strpos( $haystack, $needle ) !== false;
    }

    /**
     * Yuvarlaqlaşdırma dəqiqliyini təhlükəsiz tam ədədə çevirir.
     *
     * Ardıcıllıq PARİTET ÜÇÜN YÜK DAŞIYIR: əvvəlcə sıfıra doğru kəsir, sonra həddi yoxlayır,
     * ən sonda tam ədədə çevirir. Yoxlamanı (int) çevrilməsindən SONRA aparmaq olmaz —
     * PHP-nin float→int çevrilməsi həddi aşan dəyərlər üçün 0 qaytarır, yəni
     * round( 1.5, 18446744073709551616 ) səssizcə precision=0 kimi qəbul olunardı,
     * JS isə invalid_precision atardı. Kəsmə (int) olmadan aparılır ki, böyük dəyər itməsin.
     *
     * JS qarşılığı: frontend-src/engine/functions.js toPrecision().
     */
    private static function toPrecision( float $value, int $position = 0 ): int
    {
        $truncated = $value < 0 ? ceil( $value ) : floor( $value );

        if ( $truncated < -self::MAX_PRECISION || $truncated > self::MAX_PRECISION ) {
            throw new ExpressionException(
                'invalid_precision',
                sprintf( 'Rounding precision must be between -%d and %d.', self::MAX_PRECISION, self::MAX_PRECISION ),
                $position,
                [ 'precision' => $truncated, 'max' => self::MAX_PRECISION ]
            );
        }

        return (int) $truncated;
    }

    /**
     * Yuvarlaqlaşdırma dəqiqliyinin icazə verilən həddi.
     *
     * Pul hesablamaları üçün 6 onluq onsuz da hədsizdir, və bu hədd epsilon-un
     * böyük miqyaslarda nəticəni korlamasının qarşısını alır.
     */
    private const MAX_PRECISION = 6;

    /**
     * Yarını sıfırdan uzağa yuvarlaqlaşdırır.
     *
     * Bu alqoritm JS tərəfində sətir-sətir təkrarlanır (frontend-src/engine/functions.js).
     * PHP-nin round() və JS-in Math.round() funksiyaları fərqli nəticələr verdiyi üçün
     * heç biri istifadə edilmir — bax tests/fixtures/expressions.json paritet halları.
     *
     * Epsilon QƏSDƏN 1e-15-dir (təxminən dörd ULP). Daha böyük qiymət — məsələn 1e-12 —
     * böyük miqyaslarda 0.5-i keçir və round( 999999.99, 6 ) kimi adi halları korlayır.
     */
    public static function roundHalfAwayFromZero( float $value, int $precision = 0 ): float
    {
        if ( ! is_finite( $value ) ) {
            throw new ExpressionException( 'not_finite', 'Cannot round a value that is not a finite number.' );
        }

        if ( $precision < -self::MAX_PRECISION || $precision > self::MAX_PRECISION ) {
            throw new ExpressionException(
                'invalid_precision',
                sprintf( 'Rounding precision must be between -%d and %d.', self::MAX_PRECISION, self::MAX_PRECISION ),
                0,
                [ 'precision' => $precision, 'max' => self::MAX_PRECISION ]
            );
        }

        $factor   = pow( 10, $precision );
        $scaled   = $value * $factor;
        $absolute = abs( $scaled );
        $epsilon  = $absolute * 1e-15;
        $rounded  = floor( $absolute + 0.5 + $epsilon );
        $sign     = $value < 0 ? -1.0 : 1.0;

        return ( $sign * $rounded ) / $factor;
    }
}
