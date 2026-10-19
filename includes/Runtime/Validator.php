<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

/**
 * frontend-src/runtime/validate.js-in PHP əkizi. Mesaj yox, KOD qaytarır
 * (`required`, `email`, `min`, `max`) — mesajları WordPress qatı
 * (Submissions\SubmissionService) tərcümə edir, runtime WP-dən asılı qalmır.
 */
final class Validator
{
    private const SILENT_TYPES  = [ 'hidden', 'html' ];
    private const NUMERIC_TYPES = [ 'number', 'slider' ];

    // JS `\s`-in açıq yazılışı (validate.js-dəki WHITESPACE ilə EYNİ dəst).
    private const WHITESPACE = '\x{9}\x{A}\x{B}\x{C}\x{D}\x{20}\x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

    public const EMAIL_PATTERN = '/^[^@' . self::WHITESPACE . ']+@[^@' . self::WHITESPACE . ']+$/uD';

    /**
     * @param array<string, mixed> $field
     * @param mixed                $value
     */
    public static function fieldErrorCode( array $field, $value, bool $required ): ?string
    {
        if ( self::isBlank( $field, $value ) ) {
            return $required ? 'required' : null;
        }

        $type = $field['type'] ?? '';

        // preg_match() yanlış UTF-8-də `false` qaytarır — bu da ünvan deyil.
        if ( 'email' === $type && 1 !== preg_match( self::EMAIL_PATTERN, Values::stringify( $value ) ) ) {
            return 'email';
        }

        if ( in_array( $type, self::NUMERIC_TYPES, true ) ) {
            $numeric = Values::normalise( $field, $value );
            $min     = $field['min'] ?? null;
            $max     = $field['max'] ?? null;

            if ( ( is_int( $min ) || is_float( $min ) ) && $numeric < $min ) {
                return 'min';
            }

            if ( ( is_int( $max ) || is_float( $max ) ) && $numeric > $max ) {
                return 'max';
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array<string, mixed>                                                                          $state
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $visibility
     * @return array<string, string>
     */
    public static function validateVisible( array $schema, array $state, array $visibility ): array
    {
        $fields = is_array( $schema['fields'] ?? null ) ? $schema['fields'] : [];
        $errors = [];

        foreach ( self::visibleSteps( $schema, $visibility ) as $step ) {
            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $key ) {
                $key   = (string) $key;
                $field = $fields[ $key ] ?? null;

                if ( ! is_array( $field ) || ! isset( $visibility['fields'][ $key ] ) || in_array( $field['type'] ?? '', self::SILENT_TYPES, true ) ) {
                    continue;
                }

                $code = self::fieldErrorCode( $field, $state[ $key ] ?? null, isset( $visibility['required'][ $key ] ) );

                if ( null !== $code ) {
                    $errors[ $key ] = $code;
                }
            }
        }

        return $errors;
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $visibility
     * @param array<string, string>                                                                         $errors
     */
    public static function firstErrorStep( array $schema, array $visibility, array $errors ): ?string
    {
        foreach ( self::visibleSteps( $schema, $visibility ) as $step ) {
            foreach ( is_array( $step['fields'] ?? null ) ? $step['fields'] : [] as $key ) {
                if ( isset( $errors[ (string) $key ] ) ) {
                    return (string) $step['key'];
                }
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed>                                                                          $schema
     * @param array{fields: array<string, true>, steps: array<string, true>, required: array<string, true>} $visibility
     * @return array<int, array<string, mixed>>
     */
    public static function visibleSteps( array $schema, array $visibility ): array
    {
        $steps   = is_array( $schema['steps'] ?? null ) ? $schema['steps'] : [];
        $visible = [];

        foreach ( $steps as $step ) {
            if ( is_array( $step ) && is_string( $step['key'] ?? null ) && isset( $visibility['steps'][ $step['key'] ] ) ) {
                $visible[] = $step;
            }
        }

        return $visible;
    }

    /**
     * @param array<string, mixed> $field
     * @param mixed                $value
     */
    private static function isBlank( array $field, $value ): bool
    {
        $type = $field['type'] ?? '';

        if ( 'toggle' === $type ) {
            return ! ( true === $value || 1 === $value || 1.0 === $value || '1' === $value );
        }

        if ( is_array( $value ) ) {
            return [] === $value;
        }

        if ( in_array( $type, self::NUMERIC_TYPES, true ) ) {
            return '' === Values::normalise( $field, $value );
        }

        return null === $value || '' === $value;
    }
}
