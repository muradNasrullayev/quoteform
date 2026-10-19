<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

/**
 * frontend-src/runtime/visibility.js-in PHP əkizi: qaydalar sabit nöqtəyə
 * qədər (maks. 10 keçid) təkrar tətbiq olunur. Hər keçid SIFIRDAN başlayır,
 * amma dəyişənləri əvvəlki keçidin görünən sahələrindən hesablayır.
 */
final class Visibility
{
    private const MAX_PASSES = 10;

    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $state
     * @return array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>}
     */
    public static function resolve( array $schema, array $state ): array
    {
        $resolved = self::initial( $schema );
        $previous = '';

        for ( $pass = 0; $pass < self::MAX_PASSES; $pass++ ) {
            $variables = Values::variablesFor( $schema, $state, $resolved['fields'] );

            $resolved = self::initial( $schema );
            self::applyRules( $schema, $variables, $resolved );
            self::dropHiddenSteps( $schema, $resolved );
            self::dropRequiredForHiddenFields( $resolved );

            $current = self::signature( $resolved );

            if ( $current === $previous ) {
                return $resolved;
            }

            $previous = $current;
        }

        return $resolved;
    }

    /**
     * @param array<string, mixed> $schema
     * @return array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>}
     */
    private static function initial( array $schema ): array
    {
        $fields   = [];
        $required = [];
        $steps    = [];

        foreach ( self::fields( $schema ) as $key => $field ) {
            $fields[ (string) $key ] = true;

            if ( true === ( $field['required'] ?? null ) ) {
                $required[ (string) $key ] = true;
            }
        }

        foreach ( self::steps( $schema ) as $step ) {
            if ( isset( $step['key'] ) && is_string( $step['key'] ) ) {
                $steps[ $step['key'] ] = true;
            }
        }

        return [ 'fields' => $fields, 'steps' => $steps, 'required' => $required ];
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array<string, mixed>                                                                          $variables
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $resolved
     */
    private static function applyRules( array $schema, array $variables, array &$resolved ): void
    {
        $rules = is_array( $schema['rules'] ?? null ) ? $schema['rules'] : [];

        foreach ( $rules as $rule ) {
            if ( ! is_array( $rule ) ) {
                continue;
            }

            $target  = is_array( $rule['target'] ?? null ) ? $rule['target'] : [];
            $isField = 'field' === ( $target['kind'] ?? null );
            $key     = $target['key'] ?? null;

            if ( ! is_string( $key ) || ! self::targetExists( $schema, $isField, $key ) ) {
                continue;
            }

            if ( ! Conditions::ruleFires( $rule, $variables, $schema ) ) {
                continue;
            }

            $collection = $isField ? 'fields' : 'steps';
            $action     = $rule['action'] ?? null;

            if ( 'show' === $action ) {
                $resolved[ $collection ][ $key ] = true;
            } elseif ( 'hide' === $action ) {
                unset( $resolved[ $collection ][ $key ] );
            } elseif ( $isField && 'require' === $action ) {
                $resolved['required'][ $key ] = true;
            } elseif ( $isField && 'optional' === $action ) {
                unset( $resolved['required'][ $key ] );
            }
        }
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $resolved
     */
    private static function dropHiddenSteps( array $schema, array &$resolved ): void
    {
        foreach ( self::steps( $schema ) as $step ) {
            $key = $step['key'] ?? null;

            if ( ! is_string( $key ) || isset( $resolved['steps'][ $key ] ) ) {
                continue;
            }

            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $fieldKey ) {
                unset( $resolved['fields'][ (string) $fieldKey ] );
            }
        }
    }

    /**
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $resolved
     */
    private static function dropRequiredForHiddenFields( array &$resolved ): void
    {
        foreach ( array_keys( $resolved['required'] ) as $key ) {
            if ( ! isset( $resolved['fields'][ $key ] ) ) {
                unset( $resolved['required'][ $key ] );
            }
        }
    }

    /**
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $resolved
     */
    private static function signature( array $resolved ): string
    {
        $parts = [];

        foreach ( [ 'fields', 'steps', 'required' ] as $name ) {
            $keys = array_map( 'strval', array_keys( $resolved[ $name ] ) );
            sort( $keys, SORT_STRING );
            $parts[] = implode( ',', $keys );
        }

        return implode( '|', $parts );
    }

    /**
     * @param array<string, mixed> $schema
     */
    private static function targetExists( array $schema, bool $isField, string $key ): bool
    {
        if ( $isField ) {
            // Ruling R3: sahə tərifi mövcud sayılır, yalnız `null`-dan fərqli massivdirsə.
            $fields = self::fields( $schema );

            return isset( $fields[ $key ] ) && is_array( $fields[ $key ] );
        }

        foreach ( self::steps( $schema ) as $step ) {
            if ( ( $step['key'] ?? null ) === $key ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<string, array<string, mixed>>
     */
    private static function fields( array $schema ): array
    {
        return is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
    }

    /**
     * @param array<string, mixed> $schema
     * @return array<int, array<string, mixed>>
     */
    private static function steps( array $schema ): array
    {
        $steps = is_array( $schema['steps'] ?? null ) ? $schema['steps'] : [];

        return array_values( array_filter( $steps, 'is_array' ) );
    }
}
