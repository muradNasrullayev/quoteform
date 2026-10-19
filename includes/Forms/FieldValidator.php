<?php

declare(strict_types=1);

namespace Quoteform\Forms;

/**
 * Bir sahəni tipinə görə yoxlayır.
 *
 * Qaytarılan yollar sahəyə NİSBİDİR (`label`, `options.1.price`) — orkestrator
 * onları `fields.<key>` prefiksi ilə birləşdirir.
 */
final class FieldValidator
{
    private const COMMON_KEYS = [ 'key', 'type', 'label', 'help', 'placeholder', 'required', 'default' ];

    /** @var array<string, string[]> */
    private const TYPE_KEYS = [
        'number'   => [ 'min', 'max', 'step' ],
        'text'     => [],
        'email'    => [],
        'tel'      => [],
        'textarea' => [],
        'select'   => [ 'options' ],
        'radio'    => [ 'options' ],
        'checkbox' => [ 'options' ],
        'toggle'   => [],
        'date'     => [],
        'slider'   => [ 'min', 'max', 'step' ],
        'hidden'   => [],
        'html'     => [ 'content' ],
    ];

    /** @var string[] Etiket tələb etməyən tiplər. */
    private const LABEL_OPTIONAL = [ 'hidden', 'html' ];

    /**
     * @return string[]
     */
    public static function types(): array
    {
        return array_keys( self::TYPE_KEYS );
    }

    /**
     * @param mixed $field
     */
    public function validate( string $key, $field ): ValidationResult
    {
        $result = new ValidationResult();

        if ( ! is_array( $field ) ) {
            $result->addError( '', 'invalid_type', __( 'A field must be an object.', 'quoteform' ) );

            return $result;
        }

        $type = $field['type'] ?? null;

        if ( ! is_string( $type ) || ! isset( self::TYPE_KEYS[ $type ] ) ) {
            $result->addError(
                'type',
                'invalid_option',
                __( 'Unknown field type.', 'quoteform' ),
                [ 'type' => is_string( $type ) ? $type : null ]
            );

            return $result;
        }

        $allowed = array_merge( self::COMMON_KEYS, self::TYPE_KEYS[ $type ] );

        foreach ( array_keys( $field ) as $present ) {
            if ( ! in_array( $present, $allowed, true ) ) {
                $result->addError( (string) $present, 'unknown_key', __( 'This key does not belong to this field type.', 'quoteform' ) );
            }
        }

        $hasMissingKey = false;

        foreach ( $allowed as $expected ) {
            if ( ! array_key_exists( $expected, $field ) ) {
                $result->addError( $expected, 'missing_field', __( 'This key is required.', 'quoteform' ) );
                $hasMissingKey = true;
            }
        }

        if ( $hasMissingKey ) {
            return $result;
        }

        if ( ! is_string( $field['key'] ) || $field['key'] !== $key ) {
            $result->addError(
                'key',
                'key_mismatch',
                __( 'The field key must match the key it is stored under.', 'quoteform' ),
                [ 'expected' => $key ]
            );
        } else {
            KeyRules::validate( $field['key'], 'key', $result );
        }

        if ( ! in_array( $type, self::LABEL_OPTIONAL, true ) ) {
            if ( ! is_string( $field['label'] ) || trim( $field['label'] ) === '' ) {
                $result->addError( 'label', 'missing_field', __( 'A field needs a label.', 'quoteform' ) );
            }
        }

        foreach ( [ 'help', 'placeholder' ] as $text ) {
            if ( ! is_string( $field[ $text ] ) ) {
                $result->addError( $text, 'invalid_type', __( 'This value must be text.', 'quoteform' ) );
            }
        }

        if ( ! is_bool( $field['required'] ) ) {
            $result->addError( 'required', 'invalid_type', __( 'Required must be true or false.', 'quoteform' ) );
        }

        if ( in_array( $type, [ 'number', 'slider' ], true ) ) {
            $this->validateRange( $field, $result );
        }

        if ( in_array( $type, [ 'select', 'radio', 'checkbox' ], true ) ) {
            $this->validateOptions( $field['options'], $result );
        }

        if ( $type === 'html' && ( ! is_string( $field['content'] ) || trim( $field['content'] ) === '' ) ) {
            $result->addError( 'content', 'missing_field', __( 'An HTML block needs content.', 'quoteform' ) );
        }

        return $result;
    }

    /**
     * @param mixed $value
     */
    private function isNumber( $value ): bool
    {
        return ( is_int( $value ) || is_float( $value ) ) && is_finite( $value );
    }

    /**
     * @param array<string, mixed> $field
     */
    private function validateRange( array $field, ValidationResult $result ): void
    {
        $invalid = [];

        foreach ( [ 'min', 'max', 'step' ] as $key ) {
            if ( ! $this->isNumber( $field[ $key ] ) ) {
                $result->addError( $key, 'invalid_type', __( 'This value must be a number.', 'quoteform' ) );
                $invalid[ $key ] = true;
            }
        }

        if ( ! isset( $invalid['min'] ) && ! isset( $invalid['max'] ) && $field['min'] > $field['max'] ) {
            $result->addError(
                'min',
                'out_of_range',
                __( 'The minimum cannot be greater than the maximum.', 'quoteform' ),
                [ 'min' => $field['min'], 'max' => $field['max'] ]
            );
        }

        if ( ! isset( $invalid['step'] ) && $field['step'] <= 0 ) {
            $result->addError( 'step', 'out_of_range', __( 'The step must be greater than zero.', 'quoteform' ) );
        }
    }

    /**
     * @param mixed $options
     */
    private function validateOptions( $options, ValidationResult $result ): void
    {
        if ( ! is_array( $options ) || ( $options !== [] && array_keys( $options ) !== range( 0, count( $options ) - 1 ) ) ) {
            $result->addError( 'options', 'invalid_type', __( 'Options must be a list.', 'quoteform' ) );

            return;
        }

        if ( $options === [] ) {
            $result->addError( 'options', 'empty_collection', __( 'This field needs at least one option.', 'quoteform' ) );

            return;
        }

        $seen = [];

        foreach ( $options as $index => $option ) {
            $path = 'options.' . $index;

            if ( ! is_array( $option ) ) {
                $result->addError( $path, 'invalid_type', __( 'An option must be an object.', 'quoteform' ) );

                continue;
            }

            if ( ! isset( $option['label'] ) || ! is_string( $option['label'] ) || trim( $option['label'] ) === '' ) {
                $result->addError( $path . '.label', 'missing_field', __( 'An option needs a label.', 'quoteform' ) );
            }

            $valueIsValid = isset( $option['value'] ) && is_string( $option['value'] ) && trim( $option['value'] ) !== '';

            if ( ! $valueIsValid ) {
                $result->addError( $path . '.value', 'missing_field', __( 'An option needs a value.', 'quoteform' ) );
            }

            if ( ! array_key_exists( 'price', $option ) ) {
                $result->addError( $path . '.price', 'missing_field', __( 'An option needs a price.', 'quoteform' ) );
            } elseif ( ! $this->isNumber( $option['price'] ) ) {
                $result->addError( $path . '.price', 'invalid_type', __( 'An option price must be a number.', 'quoteform' ) );
            }

            if ( ! $valueIsValid ) {
                continue;
            }

            if ( isset( $seen[ $option['value'] ] ) ) {
                $result->addError(
                    $path . '.value',
                    'duplicate_key',
                    __( 'Option values must be unique within a field.', 'quoteform' ),
                    [ 'value' => $option['value'] ]
                );
            }

            $seen[ $option['value'] ] = true;
        }
    }
}
