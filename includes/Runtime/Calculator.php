<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

use Quoteform\Engine\CalculationGraph;
use Quoteform\Engine\ExpressionException;

/**
 * frontend-src/runtime/calculate.js-in PHP əkizi (formatlama xaric — o
 * MoneyFormatter-dədir). Hesablama xətası atılmır, `error` kodu kimi qayıdır:
 * müraciət yenə saxlanılmalıdır (əsas spec §14.3).
 */
final class Calculator
{
    private const TOTAL_KEY = 'total';

    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $variables
     * @return array{total: ?float, breakdown: array<int, array{key: string, label: string, amount: ?float}>, error: ?string}
     */
    public static function calculate( array $schema, array $variables ): array
    {
        $calculations = is_array( $schema['calculations'] ?? null ) ? array_values( array_filter( $schema['calculations'], 'is_array' ) ) : [];

        try {
            $values = CalculationGraph::evaluateAll( $calculations, $variables );
        } catch ( ExpressionException $error ) {
            return [ 'total' => null, 'breakdown' => [], 'error' => $error->getCodeSlug() ];
        } catch ( \Throwable $error ) {
            return [ 'total' => null, 'breakdown' => [], 'error' => 'calculation_failed' ];
        }

        $breakdown = [];

        foreach ( $calculations as $calculation ) {
            if ( true !== ( $calculation['visible'] ?? null ) ) {
                continue;
            }

            $key = (string) ( $calculation['key'] ?? '' );

            $breakdown[] = [
                'key'    => $key,
                'label'  => is_string( $calculation['label'] ?? null ) ? $calculation['label'] : '',
                'amount' => self::number( $values[ $key ] ?? null ),
            ];
        }

        return [
            'total'     => self::number( $values[ self::TOTAL_KEY ] ?? null ),
            'breakdown' => $breakdown,
            'error'     => null,
        ];
    }

    /**
     * @param mixed $value
     */
    private static function number( $value ): ?float
    {
        return ( is_int( $value ) || is_float( $value ) ) ? (float) $value : null;
    }
}
