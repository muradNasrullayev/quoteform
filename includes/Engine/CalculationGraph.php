<?php

declare(strict_types=1);

namespace Quoteform\Engine;

// phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- engine exception messages are never printed: callers read getCodeSlug() and show their own translated text.
final class CalculationGraph
{
    /**
     * @param array<int, array{key: string, expression: string}> $calculations
     * @return string[]
     */
    public static function order( array $calculations ): array
    {
        $expressions = [];

        foreach ( $calculations as $calculation ) {
            $key = $calculation['key'];

            if ( isset( $expressions[ $key ] ) ) {
                throw new ExpressionException(
                    'duplicate_calculation_key',
                    sprintf( 'There is more than one calculation called "%s".', $key ),
                    0,
                    [ 'key' => $key ]
                );
            }

            $expressions[ $key ] = $calculation['expression'];
        }

        $dependencies = [];

        foreach ( $expressions as $key => $expression ) {
            $dependencies[ $key ] = array_values(
                array_intersect( Expression::variables( $expression ), array_keys( $expressions ) )
            );
        }

        $ordered = [];
        $state   = [];

        foreach ( array_keys( $expressions ) as $key ) {
            self::visit( (string) $key, $dependencies, $state, $ordered, [] );
        }

        return $ordered;
    }

    /**
     * QEYD: qaytarılan massivdəki açarların SIRASI bu mühərrikin kontraktının bir hissəsi
     * DEYİL. JavaScript obyektləri tam ədədə bənzəyən açarları ("1", "2" kimi) öz aralarında
     * yenidən sıralayır, PHP massivləri isə etmir — buna görə iki dilin nəticə-açar sırası
     * ümumiyyətlə üst-üstə düşməyə bilər. Sıra lazım olduqda `order()`-dan (JS tərəfi:
     * `orderCalculations()`) istifadə et — bu ikisi hər iki dildə eynidir.
     *
     * @param array<int, array{key: string, expression: string}> $calculations
     * @param array<string, mixed>                               $variables
     * @return array<string, mixed>
     */
    public static function evaluateAll( array $calculations, array $variables ): array
    {
        $expressions = [];

        foreach ( $calculations as $calculation ) {
            $expressions[ $calculation['key'] ] = $calculation['expression'];
        }

        $results = [];

        foreach ( self::order( $calculations ) as $key ) {
            $value = Expression::evaluate( $expressions[ $key ], $results + $variables );

            $results[ $key ] = $value;
        }

        return $results;
    }

    /**
     * @param array<string, string[]> $dependencies
     * @param array<string, string>   $state
     * @param string[]                $ordered
     * @param string[]                $path
     */
    private static function visit( string $key, array $dependencies, array &$state, array &$ordered, array $path ): void
    {
        $current = $state[ $key ] ?? 'new';

        if ( $current === 'done' ) {
            return;
        }

        if ( $current === 'visiting' ) {
            $path[] = $key;

            throw new ExpressionException(
                'circular_reference',
                sprintf( 'The calculations reference each other in a loop: %s.', implode( ' → ', $path ) ),
                0,
                [ 'cycle' => $path ]
            );
        }

        $state[ $key ] = 'visiting';
        $path[]        = $key;

        foreach ( $dependencies[ $key ] as $dependency ) {
            self::visit( $dependency, $dependencies, $state, $ordered, $path );
        }

        $state[ $key ] = 'done';
        $ordered[]     = $key;
    }
}
