<?php

declare(strict_types=1);

namespace Quoteform\Runtime;

/**
 * Göndərilən formanın tam qiymətləndirilməsi — frontend-src/runtime/evaluate.js
 * ilə EYNİ nəticə (paritet: tests/fixtures/submissions.json).
 */
final class Evaluation
{
    /**
     * @param array<string, mixed> $schema
     * @param array<string, mixed> $state
     * @return array{visibility: array, visible_fields: string[], visible_steps: string[], required: string[], errors: array<string, string>, total: ?float, breakdown: array, calc_error: ?string}
     */
    public static function run( array $schema, array $state ): array
    {
        $visibility = Visibility::resolve( $schema, $state );
        $variables  = Values::variablesFor( $schema, $state, $visibility['fields'] );
        $result     = Calculator::calculate( $schema, $variables );

        return [
            'visibility'     => $visibility,
            'visible_fields' => self::sortedKeys( $visibility['fields'] ),
            'visible_steps'  => array_map(
                static function ( array $step ): string {
                    return (string) $step['key'];
                },
                Validator::visibleSteps( $schema, $visibility )
            ),
            'required'       => self::sortedKeys( $visibility['required'] ),
            'errors'         => Validator::validateVisible( $schema, $state, $visibility ),
            'total'          => $result['total'],
            'breakdown'      => $result['breakdown'],
            'calc_error'     => $result['error'],
        ];
    }

    /**
     * @param array<string, true> $set
     * @return string[]
     */
    private static function sortedKeys( array $set ): array
    {
        $keys = array_map( 'strval', array_keys( $set ) );
        sort( $keys, SORT_STRING );

        return $keys;
    }
}
