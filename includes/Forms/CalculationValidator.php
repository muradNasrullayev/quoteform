<?php

declare(strict_types=1);

namespace Quoteform\Forms;

use Quoteform\Engine\CalculationGraph;
use Quoteform\Engine\Expression;
use Quoteform\Engine\ExpressionException;
use Quoteform\Support\TextPosition;

/**
 * Hesablamaları yoxlayır — sxem validasiyasının ən dəyərli qapısı.
 *
 * İfadələr burada HƏQİQƏTƏN kompilyasiya olunur, yəni sınıq formul bazaya düşmür.
 * Dövri istinad da burada tutulur, müştəri formanı açanda yox (spec §14.1).
 *
 * Mövqelər UTF-16 kod vahidinə çevrilir: mühərrik bayt ofseti verir, builder isə
 * JavaScript-dir və sətirləri UTF-16 kod vahidi ilə indeksləyir.
 */
final class CalculationValidator
{
    private const MAX_EXPRESSION_LENGTH = 1000;

    private const CALCULATION_KEYS = [ 'key', 'expression', 'label', 'visible' ];

    private const REQUIRED_CALCULATION = 'total';

    /** @var string[] `.price` şəkilçisi yalnız bu tiplərdə mənalıdır (spec §7.3). */
    private const PRICE_BEARING_TYPES = [ 'select', 'radio', 'checkbox' ];

    /**
     * @param mixed                 $calculations
     * @param array<string, string> $fieldTypes açar => tip
     */
    public function validate( $calculations, array $fieldTypes ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $calculations ) || ( $calculations !== [] && array_keys( $calculations ) !== range( 0, count( $calculations ) - 1 ) ) ) {
            $result->addError( '', 'invalid_type', __( 'Calculations must be a list.', 'quoteform' ) );

            return $result;
        }

        if ( $calculations === [] ) {
            $result->addError( '', 'empty_collection', __( 'A form needs at least one calculation.', 'quoteform' ) );

            return $result;
        }

        $hasDuplicateKey = false;
        $keys            = $this->collectKeys( $calculations, $result, $hasDuplicateKey );

        if ( ! in_array( self::REQUIRED_CALCULATION, $keys, true ) ) {
            $result->addError(
                '',
                'missing_total',
                __( 'A form must have a calculation called "total".', 'quoteform' ),
                [ 'required' => self::REQUIRED_CALCULATION ]
            );
        }

        $compiled   = true;
        $structural = ! $hasDuplicateKey;

        foreach ( $calculations as $index => $calculation ) {
            if ( ! is_array( $calculation ) ) {
                $structural = false;

                continue;
            }

            if ( ! array_key_exists( 'key', $calculation ) || ! is_string( $calculation['key'] ) ) {
                $structural = false;
            }

            if ( ! array_key_exists( 'expression', $calculation ) ) {
                $structural = false;

                continue;
            }

            if ( ! $this->validateExpression( (string) $index, $calculation['expression'], $keys, $fieldTypes, $result ) ) {
                $compiled = false;
            }
        }

        if ( $compiled && $structural ) {
            $this->validateGraph( $calculations, $result );
        }

        return $result;
    }

    /**
     * @param array<int, mixed> $calculations
     * @return string[]
     */
    private function collectKeys( array $calculations, ValidationResult $result, bool &$hasDuplicateKey ): array
    {
        $keys = [];

        foreach ( $calculations as $index => $calculation ) {
            $path = (string) $index;

            if ( ! is_array( $calculation ) ) {
                $result->addError( $path, 'invalid_type', __( 'A calculation must be an object.', 'quoteform' ) );

                continue;
            }

            foreach ( array_keys( $calculation ) as $present ) {
                if ( ! in_array( $present, self::CALCULATION_KEYS, true ) ) {
                    $result->addError( $path . '.' . $present, 'unknown_key', __( 'Unknown key in calculation.', 'quoteform' ) );
                }
            }

            foreach ( self::CALCULATION_KEYS as $expected ) {
                if ( ! array_key_exists( $expected, $calculation ) ) {
                    $result->addError( $path . '.' . $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                }
            }

            if ( array_key_exists( 'label', $calculation ) && ( ! is_string( $calculation['label'] ) || trim( $calculation['label'] ) === '' ) ) {
                $result->addError( $path . '.label', 'missing_field', __( 'A calculation needs a label.', 'quoteform' ) );
            }

            if ( array_key_exists( 'visible', $calculation ) && ! is_bool( $calculation['visible'] ) ) {
                $result->addError( $path . '.visible', 'invalid_type', __( 'Visible must be true or false.', 'quoteform' ) );
            }

            if ( ! array_key_exists( 'key', $calculation ) ) {
                continue;
            }

            if ( ! is_string( $calculation['key'] ) ) {
                $result->addError( $path . '.key', 'invalid_type', __( 'A calculation key must be text.', 'quoteform' ) );

                continue;
            }

            if ( ! KeyRules::validate( $calculation['key'], $path . '.key', $result ) ) {
                continue;
            }

            if ( in_array( $calculation['key'], $keys, true ) ) {
                $result->addError( $path . '.key', 'duplicate_key', __( 'Calculation keys must be unique.', 'quoteform' ) );

                $hasDuplicateKey = true;

                continue;
            }

            $keys[] = $calculation['key'];
        }

        return $keys;
    }

    /**
     * @param mixed                 $expression
     * @param string[]              $calculationKeys
     * @param array<string, string> $fieldTypes
     */
    private function validateExpression( string $path, $expression, array $calculationKeys, array $fieldTypes, ValidationResult $result ): bool
    {
        $path .= '.expression';

        if ( ! is_string( $expression ) ) {
            $result->addError( $path, 'invalid_type', __( 'An expression must be text.', 'quoteform' ) );

            return false;
        }

        if ( trim( $expression ) === '' ) {
            $result->addError( $path, 'missing_field', __( 'A calculation needs an expression.', 'quoteform' ) );

            return false;
        }

        $length = TextPosition::byteToUtf16( $expression, strlen( $expression ) );

        if ( $length > self::MAX_EXPRESSION_LENGTH ) {
            $result->addError(
                $path,
                'expression_too_long',
                __( 'This expression is too long.', 'quoteform' ),
                [ 'length' => $length, 'max' => self::MAX_EXPRESSION_LENGTH ]
            );

            return false;
        }

        try {
            Expression::compile( $expression );
            $variables = Expression::variables( $expression );
        } catch ( ExpressionException $exception ) {
            $result->addError(
                $path,
                'invalid_expression',
                __( 'This expression could not be understood.', 'quoteform' ),
                [
                    'engine_code' => $exception->getCodeSlug(),
                    'position'    => TextPosition::byteToUtf16( $expression, $exception->getPosition() ),
                ]
            );

            return false;
        }

        foreach ( $variables as $variable ) {
            if ( ! $this->variableResolves( $variable, $calculationKeys, $fieldTypes ) ) {
                $result->addError(
                    $path,
                    'unknown_reference',
                    __( 'This expression refers to something that does not exist.', 'quoteform' ),
                    [ 'variable' => $variable ]
                );
            }
        }

        return true;
    }

    /**
     * @param string[]              $calculationKeys
     * @param array<string, string> $fieldTypes
     */
    private function variableResolves( string $variable, array $calculationKeys, array $fieldTypes ): bool
    {
        if ( strpos( $variable, '.' ) === false ) {
            return in_array( $variable, $calculationKeys, true ) || isset( $fieldTypes[ $variable ] );
        }

        [ $base, $suffix ] = explode( '.', $variable, 2 );

        if ( $suffix !== 'price' ) {
            return false;
        }

        return isset( $fieldTypes[ $base ] ) && in_array( $fieldTypes[ $base ], self::PRICE_BEARING_TYPES, true );
    }

    /**
     * @param array<int, mixed> $calculations
     */
    private function validateGraph( array $calculations, ValidationResult $result ): void
    {
        $graphInput = [];

        foreach ( $calculations as $calculation ) {
            $graphInput[] = [
                'key'        => $calculation['key'],
                'expression' => $calculation['expression'],
            ];
        }

        try {
            CalculationGraph::order( $graphInput );
        } catch ( ExpressionException $exception ) {
            $message = $exception->getCodeSlug() === 'circular_reference'
                ? __( 'The calculations reference each other in a loop.', 'quoteform' )
                : __( 'The calculations could not be ordered.', 'quoteform' );

            $result->addError( '', $exception->getCodeSlug(), $message, $exception->getContext() );
        }
    }
}
