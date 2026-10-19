<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

use Quoteform\Engine\Expression;

/**
 * frontend-src/runtime/conditions.js-in PHP əkizi. Şərt mühərrik ifadəsinə
 * çevrilir, yəni müqayisə qaydaları (sətir/rəqəm, boşluq) mühərrikin öz
 * paritetli qaydalarıdır — burada ikinci bir müqayisə dili YOXDUR.
 */
final class Conditions
{
    private const VALUE = '__value';

    private const SOURCES = [
        'equals'           => '{%s} == {__value}',
        'not_equals'       => '{%s} != {__value}',
        'greater'          => '{%s} > {__value}',
        'greater_or_equal' => '{%s} >= {__value}',
        'less'             => '{%s} < {__value}',
        'less_or_equal'    => '{%s} <= {__value}',
        'contains'         => 'contains({%s}, {__value})',
        'not_contains'     => '!contains({%s}, {__value})',
        'is_empty'         => 'is_empty({%s})',
        'is_not_empty'     => '!is_empty({%s})',
    ];

    /**
     * @param array<string, mixed> $condition
     * @param array<string, mixed> $variables
     * @param array<string, mixed> $schema
     */
    public static function holds( array $condition, array $variables, array $schema ): bool
    {
        // Ruling R3: `field` sətir deyilsə, heç bir qiymətləndirmə aparılmır — false.
        $field = $condition['field'] ?? null;

        if ( ! is_string( $field ) ) {
            return false;
        }

        $operator = $condition['operator'] ?? null;

        if ( ! is_string( $operator ) || ! isset( self::SOURCES[ $operator ] ) ) {
            return false;
        }

        $source = str_replace( '%s', $field, self::SOURCES[ $operator ] );

        $variables[ self::VALUE ] = self::resolveValue( $condition, $schema );

        try {
            return self::truthy( Expression::evaluate( $source, $variables ) );
        } catch ( \Throwable $error ) {
            return false;
        }
    }

    /**
     * @param array<string, mixed> $rule
     * @param array<string, mixed> $variables
     * @param array<string, mixed> $schema
     */
    public static function ruleFires( array $rule, array $variables, array $schema ): bool
    {
        $conditions = is_array( $rule['conditions'] ?? null ) ? $rule['conditions'] : [];

        if ( [] === $conditions ) {
            return false;
        }

        $any = 'any' === ( $rule['match'] ?? null );

        foreach ( $conditions as $condition ) {
            $holds = is_array( $condition ) && self::holds( $condition, $variables, $schema );

            if ( $any && $holds ) {
                return true;
            }

            if ( ! $any && ! $holds ) {
                return false;
            }
        }

        return ! $any;
    }

    /**
     * @param array<string, mixed> $condition
     * @param array<string, mixed> $schema
     * @return mixed
     */
    private static function resolveValue( array $condition, array $schema )
    {
        if ( ! array_key_exists( 'value', $condition ) ) {
            return '';
        }

        $key   = $condition['field'] ?? null;
        $field = is_string( $key ) && isset( $schema['fields'][ $key ] ) && is_array( $schema['fields'][ $key ] )
            ? $schema['fields'][ $key ]
            : null;

        return null === $field ? $condition['value'] : Values::normaliseConditionValue( $field, $condition['value'] );
    }

    /**
     * JS `Boolean( value )`.
     *
     * @param mixed $value
     */
    private static function truthy( $value ): bool
    {
        if ( null === $value || false === $value || '' === $value ) {
            return false;
        }

        if ( is_int( $value ) || is_float( $value ) ) {
            return ! is_nan( (float) $value ) && 0.0 !== (float) $value;
        }

        return true;
    }
}
