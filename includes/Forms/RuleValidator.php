<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Şərti məntiq qaydaları (spec §8).
 *
 * `require` və `optional` yalnız sahəyə tətbiq olunur — addımı məcburi etmək mənasızdır.
 *
 * Qayda öz şərtinin yoxladığı sahəni hədəf ala bilməz: sahə gizlənən kimi şərt
 * yalan olar, sahə yenidən görünər və sonsuz dövrə yaranar.
 */
final class RuleValidator
{
    private const RULE_KEYS = [ 'target', 'action', 'match', 'conditions' ];

    private const ACTIONS = [ 'show', 'hide', 'require', 'optional' ];

    /** @var string[] Yalnız sahəyə tətbiq olunan əməllər. */
    private const FIELD_ONLY_ACTIONS = [ 'require', 'optional' ];

    private const OPERATORS = [
        'equals',
        'not_equals',
        'greater',
        'greater_or_equal',
        'less',
        'less_or_equal',
        'contains',
        'not_contains',
        'is_empty',
        'is_not_empty',
    ];

    /** @var string[] Dəyər tələb etməyən operatorlar. */
    private const VALUELESS_OPERATORS = [ 'is_empty', 'is_not_empty' ];

    /**
     * @return string[]
     */
    public static function operators(): array
    {
        return self::OPERATORS;
    }

    /**
     * @param mixed    $rules
     * @param string[] $fieldKeys
     * @param string[] $stepKeys
     */
    public function validate( $rules, array $fieldKeys, array $stepKeys ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $rules ) || ( $rules !== [] && array_keys( $rules ) !== range( 0, count( $rules ) - 1 ) ) ) {
            $result->addError( '', 'invalid_type', __( 'Rules must be a list.', 'quoteform' ) );

            return $result;
        }

        foreach ( $rules as $index => $rule ) {
            $this->validateRule( (string) $index, $rule, $fieldKeys, $stepKeys, $result );
        }

        return $result;
    }

    /**
     * @param mixed    $rule
     * @param string[] $fieldKeys
     * @param string[] $stepKeys
     */
    private function validateRule( string $path, $rule, array $fieldKeys, array $stepKeys, ValidationResult $result ): void
    {
        if ( ! is_array( $rule ) ) {
            $result->addError( $path, 'invalid_type', __( 'A rule must be an object.', 'quoteform' ) );

            return;
        }

        foreach ( array_keys( $rule ) as $present ) {
            if ( ! in_array( $present, self::RULE_KEYS, true ) ) {
                $result->addError( $path . '.' . (string) $present, 'unknown_key', __( 'Unknown key in rule.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( self::RULE_KEYS as $expected ) {
            if ( ! array_key_exists( $expected, $rule ) ) {
                $result->addError( $path . '.' . $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                $hasMissingKey = true;
            }
        }

        if ( $hasMissingKey ) {
            return;
        }

        $kind = $this->validateTarget( $path, $rule['target'], $fieldKeys, $stepKeys, $result );

        if ( ! in_array( $rule['action'], self::ACTIONS, true ) ) {
            $result->addError( $path . '.action', 'invalid_option', __( 'Unknown rule action.', 'quoteform' ) );
        } elseif ( $kind === 'step' && in_array( $rule['action'], self::FIELD_ONLY_ACTIONS, true ) ) {
            $result->addError(
                $path . '.action',
                'invalid_option',
                __( 'This action can only be applied to a field.', 'quoteform' ),
                [ 'action' => $rule['action'] ]
            );
        }

        if ( ! in_array( $rule['match'], [ 'all', 'any' ], true ) ) {
            $result->addError( $path . '.match', 'invalid_option', __( 'Match must be "all" or "any".', 'quoteform' ) );
        }

        $targetKey = is_array( $rule['target'] ) && isset( $rule['target']['key'] ) && is_string( $rule['target']['key'] )
            ? $rule['target']['key']
            : null;

        $this->validateConditions( $path, $rule['conditions'], $fieldKeys, $kind === 'field' ? $targetKey : null, $result );
    }

    /**
     * @param mixed    $target
     * @param string[] $fieldKeys
     * @param string[] $stepKeys
     */
    private function validateTarget( string $path, $target, array $fieldKeys, array $stepKeys, ValidationResult $result ): ?string
    {
        if ( ! is_array( $target ) ) {
            $result->addError( $path . '.target', 'invalid_type', __( 'A rule target needs a kind and a key.', 'quoteform' ) );

            return null;
        }

        $hasMissingKey = false;

        foreach ( [ 'kind', 'key' ] as $expected ) {
            if ( ! array_key_exists( $expected, $target ) ) {
                $result->addError( $path . '.target.' . $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                $hasMissingKey = true;
            }
        }

        if ( $hasMissingKey ) {
            return null;
        }

        if ( ! in_array( $target['kind'], [ 'field', 'step' ], true ) ) {
            $result->addError( $path . '.target.kind', 'invalid_option', __( 'Target kind must be "field" or "step".', 'quoteform' ) );

            return null;
        }

        $known = $target['kind'] === 'field' ? $fieldKeys : $stepKeys;

        if ( ! is_string( $target['key'] ) || ! in_array( $target['key'], $known, true ) ) {
            $result->addError(
                $path . '.target.key',
                'unknown_reference',
                __( 'This rule targets something that does not exist.', 'quoteform' ),
                [ 'key' => is_string( $target['key'] ) ? $target['key'] : null ]
            );
        }

        return $target['kind'];
    }

    /**
     * @param mixed    $conditions
     * @param string[] $fieldKeys
     */
    private function validateConditions( string $path, $conditions, array $fieldKeys, ?string $targetKey, ValidationResult $result ): void
    {
        $path .= '.conditions';

        if ( ! is_array( $conditions ) || ( $conditions !== [] && array_keys( $conditions ) !== range( 0, count( $conditions ) - 1 ) ) ) {
            $result->addError( $path, 'invalid_type', __( 'Conditions must be a list.', 'quoteform' ) );

            return;
        }

        if ( $conditions === [] ) {
            $result->addError( $path, 'empty_collection', __( 'A rule needs at least one condition.', 'quoteform' ) );

            return;
        }

        foreach ( $conditions as $index => $condition ) {
            $conditionPath = $path . '.' . $index;

            if ( ! is_array( $condition ) ) {
                $result->addError( $conditionPath, 'invalid_type', __( 'A condition needs a field and an operator.', 'quoteform' ) );

                continue;
            }

            $hasMissingKey = false;

            foreach ( [ 'field', 'operator' ] as $expected ) {
                if ( ! array_key_exists( $expected, $condition ) ) {
                    $result->addError( $conditionPath . '.' . $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                    $hasMissingKey = true;
                }
            }

            if ( $hasMissingKey ) {
                continue;
            }

            $fieldIsUsable = is_string( $condition['field'] );

            if ( ! $fieldIsUsable || ! in_array( $condition['field'], $fieldKeys, true ) ) {
                $result->addError(
                    $conditionPath . '.field',
                    'unknown_reference',
                    __( 'This condition tests a field that does not exist.', 'quoteform' ),
                    [ 'field' => $fieldIsUsable ? $condition['field'] : null ]
                );
            } elseif ( $targetKey !== null && $condition['field'] === $targetKey ) {
                $result->addError(
                    $conditionPath . '.field',
                    'circular_reference',
                    __( 'A rule cannot test the same field it targets — that would loop forever.', 'quoteform' ),
                    [ 'field' => $condition['field'] ]
                );
            }

            if ( ! in_array( $condition['operator'], self::OPERATORS, true ) ) {
                $result->addError( $conditionPath . '.operator', 'invalid_option', __( 'Unknown condition operator.', 'quoteform' ) );

                continue;
            }

            if ( ! in_array( $condition['operator'], self::VALUELESS_OPERATORS, true ) && ! array_key_exists( 'value', $condition ) ) {
                $result->addError( $conditionPath . '.value', 'missing_field', __( 'This operator needs a value.', 'quoteform' ) );
            }
        }
    }
}
