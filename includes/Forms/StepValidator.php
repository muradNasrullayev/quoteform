<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Addımlar və onların sahə istinadları.
 *
 * Bir sahə iki addımda göstərilə bilməz. YETİM sahə (heç bir addımda olmayan)
 * isə burada YOX, `SchemaValidator`-da yoxlanılır: onun xəta yolu sxem kökünə
 * nisbi olmalıdır (`fields.<key>`), burada verilsəydi `steps` prefiksi ilə
 * birləşib mənasız `steps.fields.<key>` yoluna çevrilərdi.
 */
final class StepValidator
{
    private const STEP_KEYS = [ 'key', 'title', 'description', 'fields' ];

    /**
     * @param mixed    $steps
     * @param string[] $fieldKeys
     */
    public function validate( $steps, array $fieldKeys ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $steps ) || ( $steps !== [] && array_keys( $steps ) !== range( 0, count( $steps ) - 1 ) ) ) {
            $result->addError( '', 'invalid_type', __( 'Steps must be a list.', 'quoteform' ) );

            return $result;
        }

        if ( $steps === [] ) {
            $result->addError( '', 'empty_collection', __( 'A form needs at least one step.', 'quoteform' ) );

            return $result;
        }

        $seenStepKeys = [];
        $placedFields = [];

        foreach ( $steps as $index => $step ) {
            $path = (string) $index;

            if ( ! is_array( $step ) ) {
                $result->addError( $path, 'invalid_type', __( 'A step must be an object.', 'quoteform' ) );

                continue;
            }

            foreach ( array_keys( $step ) as $present ) {
                if ( ! in_array( $present, self::STEP_KEYS, true ) ) {
                    $result->addError( $path . '.' . $present, 'unknown_key', __( 'Unknown key in step.', 'quoteform' ) );
                }
            }

            foreach ( self::STEP_KEYS as $expected ) {
                if ( ! array_key_exists( $expected, $step ) ) {
                    $result->addError( $path . '.' . $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                }
            }

            if ( array_key_exists( 'key', $step ) ) {
                if ( is_string( $step['key'] ) ) {
                    if ( KeyRules::validate( $step['key'], $path . '.key', $result ) ) {
                        if ( isset( $seenStepKeys[ $step['key'] ] ) ) {
                            $result->addError( $path . '.key', 'duplicate_key', __( 'Step keys must be unique.', 'quoteform' ) );
                        }

                        $seenStepKeys[ $step['key'] ] = true;
                    }
                } else {
                    $result->addError( $path . '.key', 'invalid_type', __( 'A step key must be text.', 'quoteform' ) );
                }
            }

            if ( array_key_exists( 'title', $step ) ) {
                if ( ! is_string( $step['title'] ) || trim( $step['title'] ) === '' ) {
                    $result->addError( $path . '.title', 'missing_field', __( 'A step needs a title.', 'quoteform' ) );
                }
            }

            if ( ! is_string( $step['description'] ?? '' ) ) {
                $result->addError( $path . '.description', 'invalid_type', __( 'The description must be text.', 'quoteform' ) );
            }

            if ( array_key_exists( 'fields', $step ) ) {
                $this->validateStepFields( $step['fields'], $path, $fieldKeys, $placedFields, $result );
            }
        }

        return $result;
    }

    /**
     * @param mixed                 $fields
     * @param string[]              $fieldKeys
     * @param array<string, string> $placedFields
     */
    private function validateStepFields( $fields, string $path, array $fieldKeys, array &$placedFields, ValidationResult $result ): void
    {
        if ( ! is_array( $fields ) || ( $fields !== [] && array_keys( $fields ) !== range( 0, count( $fields ) - 1 ) ) ) {
            $result->addError( $path . '.fields', 'invalid_type', __( 'Step fields must be a list.', 'quoteform' ) );

            return;
        }

        if ( $fields === [] ) {
            $result->addError( $path . '.fields', 'empty_collection', __( 'A step needs at least one field.', 'quoteform' ) );

            return;
        }

        foreach ( $fields as $position => $fieldKey ) {
            $fieldPath = $path . '.fields.' . $position;

            if ( ! is_string( $fieldKey ) ) {
                $result->addError( $fieldPath, 'invalid_type', __( 'A field reference must be text.', 'quoteform' ) );

                continue;
            }

            if ( ! in_array( $fieldKey, $fieldKeys, true ) ) {
                $result->addError(
                    $fieldPath,
                    'unknown_reference',
                    __( 'This step refers to a field that does not exist.', 'quoteform' ),
                    [ 'field' => $fieldKey ]
                );

                continue;
            }

            if ( isset( $placedFields[ $fieldKey ] ) ) {
                $result->addError(
                    $fieldPath,
                    'duplicate_key',
                    __( 'A field can appear on only one step.', 'quoteform' ),
                    [ 'field' => $fieldKey, 'first_seen' => $placedFields[ $fieldKey ] ]
                );

                continue;
            }

            $placedFields[ $fieldKey ] = $fieldPath;
        }
    }
}
