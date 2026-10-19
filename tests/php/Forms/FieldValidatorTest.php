<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\FieldValidator;

final class FieldValidatorTest extends TestCase
{
    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function numberField( array $overrides = [] ): array
    {
        return array_merge(
            [
                'key'         => 'room_count',
                'type'        => 'number',
                'label'       => 'How many rooms?',
                'help'        => '',
                'placeholder' => '',
                'required'    => true,
                'default'     => 1,
                'min'         => 0,
                'max'         => 20,
                'step'        => 1,
            ],
            $overrides
        );
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function radioField( array $overrides = [] ): array
    {
        return array_merge(
            [
                'key'         => 'urgency',
                'type'        => 'radio',
                'label'       => 'How soon?',
                'help'        => '',
                'placeholder' => '',
                'required'    => true,
                'default'     => 'standard',
                'options'     => [
                    [ 'label' => 'Standard', 'value' => 'standard', 'price' => 0 ],
                    [ 'label' => 'Express', 'value' => 'express', 'price' => 60 ],
                ],
            ],
            $overrides
        );
    }

    /**
     * @param array<string, mixed> $field
     * @return string[]
     */
    private function codesFor( array $field, string $key = null ): array
    {
        $key = $key ?? ( is_string( $field['key'] ?? null ) ? $field['key'] : 'x' );

        return array_column( ( new FieldValidator() )->validate( $key, $field )->getErrors(), 'code' );
    }

    public function testAllThirteenTypesAreSupported(): void
    {
        $this->assertSame(
            [ 'number', 'text', 'email', 'tel', 'textarea', 'select', 'radio', 'checkbox', 'toggle', 'date', 'slider', 'hidden', 'html' ],
            FieldValidator::types()
        );
    }

    public function testAValidNumberFieldPasses(): void
    {
        $this->assertSame( [], $this->codesFor( $this->numberField() ) );
    }

    public function testAValidRadioFieldPasses(): void
    {
        $this->assertSame( [], $this->codesFor( $this->radioField() ) );
    }

    public function testFieldMustBeAnArray(): void
    {
        $result = ( new FieldValidator() )->validate( 'a', 'not an array' );

        $this->assertSame( [ 'invalid_type' ], array_column( $result->getErrors(), 'code' ) );
    }

    public function testUnknownTypeIsRejected(): void
    {
        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $this->numberField( [ 'type' => 'signature' ] ) ) );
    }

    public function testKeyInsideTheFieldMustMatchTheMapKey(): void
    {
        $codes = $this->codesFor( $this->numberField( [ 'key' => 'other' ] ), 'room_count' );

        $this->assertContains( 'key_mismatch', $codes );
    }

    public function testKeyMustFollowTheKeyRules(): void
    {
        $this->assertContains( 'invalid_key_format', $this->codesFor( $this->numberField( [ 'key' => '2nd' ] ), '2nd' ) );
    }

    public function testKeyWithATrailingNewlineIsRejected(): void
    {
        $this->assertContains(
            'invalid_key_format',
            $this->codesFor( $this->numberField( [ 'key' => "quantity\n" ] ), "quantity\n" )
        );

        $this->assertContains(
            'invalid_key_format',
            $this->codesFor( $this->numberField( [ 'key' => "quantity\r\n" ] ), "quantity\r\n" )
        );
    }

    public function testLabelIsRequiredForVisibleTypes(): void
    {
        $this->assertSame( [ 'missing_field' ], $this->codesFor( $this->numberField( [ 'label' => '' ] ) ) );
    }

    public function testLabelIsNotRequiredForHiddenAndHtml(): void
    {
        $hidden = [
            'key' => 'source', 'type' => 'hidden', 'label' => '', 'help' => '',
            'placeholder' => '', 'required' => false, 'default' => 'web',
        ];

        $html = [
            'key' => 'intro', 'type' => 'html', 'label' => '', 'help' => '',
            'placeholder' => '', 'required' => false, 'default' => '',
            'content' => '<p>Welcome</p>',
        ];

        $this->assertSame( [], $this->codesFor( $hidden ) );
        $this->assertSame( [], $this->codesFor( $html ) );
    }

    public function testRequiredMustBeBoolean(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->numberField( [ 'required' => 'yes' ] ) ) );
    }

    public function testNumberRangeMustBeNumericAndOrdered(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->numberField( [ 'min' => 'zero' ] ) ) );
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( $this->numberField( [ 'min' => 30, 'max' => 20 ] ) ) );
        $this->assertSame( [], $this->codesFor( $this->numberField( [ 'min' => 5, 'max' => 5 ] ) ) );
    }

    public function testStepMustBePositive(): void
    {
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( $this->numberField( [ 'step' => 0 ] ) ) );
        $this->assertSame( [ 'out_of_range' ], $this->codesFor( $this->numberField( [ 'step' => -1 ] ) ) );
        $this->assertSame( [], $this->codesFor( $this->numberField( [ 'step' => 0.5 ] ) ) );
    }

    public function testOptionTypesRequireANonEmptyOptionList(): void
    {
        $this->assertSame( [ 'empty_collection' ], $this->codesFor( $this->radioField( [ 'options' => [] ] ) ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->radioField( [ 'options' => 'nope' ] ) ) );
    }

    /**
     * `options` is the only schema collection with no list-shape check: every
     * sibling (steps, step fields, rules, conditions, calculations, notifications,
     * schema fields) rejects a non-sequential array. An associative `options` map
     * validated clean and round-tripped through post meta, so a renderer doing
     * `field.options.map(...)` would fail with "options.map is not a function".
     */
    public function testOptionsMustBeASequentialListNotAnAssociativeMap(): void
    {
        $this->assertSame(
            [ 'invalid_type' ],
            $this->codesFor(
                $this->radioField(
                    [ 'options' => [ 'first' => [ 'label' => 'A', 'value' => 'a', 'price' => 0 ] ] ]
                )
            )
        );
    }

    public function testEachOptionNeedsLabelValueAndPrice(): void
    {
        $codes = $this->codesFor(
            $this->radioField( [ 'options' => [ [ 'label' => 'Only label' ] ] ] )
        );

        $this->assertSame( [ 'missing_field', 'missing_field' ], $codes );
    }

    public function testOptionPriceMustBeNumeric(): void
    {
        $codes = $this->codesFor(
            $this->radioField(
                [ 'options' => [ [ 'label' => 'A', 'value' => 'a', 'price' => 'free' ] ] ]
            )
        );

        $this->assertSame( [ 'invalid_type' ], $codes );
    }

    public function testOptionValuesMustBeUnique(): void
    {
        $codes = $this->codesFor(
            $this->radioField(
                [
                    'options' => [
                        [ 'label' => 'A', 'value' => 'same', 'price' => 0 ],
                        [ 'label' => 'B', 'value' => 'same', 'price' => 0 ],
                    ],
                ]
            )
        );

        $this->assertSame( [ 'duplicate_key' ], $codes );
    }

    public function testOptionErrorPathsPointAtTheOffendingOption(): void
    {
        $result = ( new FieldValidator() )->validate(
            'urgency',
            $this->radioField(
                [
                    'options' => [
                        [ 'label' => 'A', 'value' => 'a', 'price' => 0 ],
                        [ 'label' => 'B', 'value' => 'b', 'price' => 'free' ],
                    ],
                ]
            )
        );

        $this->assertSame( 'options.1.price', $result->getErrors()[0]['path'] );
    }

    public function testHtmlFieldRequiresContent(): void
    {
        $html = [
            'key' => 'intro', 'type' => 'html', 'label' => '', 'help' => '',
            'placeholder' => '', 'required' => false, 'default' => '', 'content' => '',
        ];

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $html ) );
    }

    public function testKeysThatDoNotBelongToTheTypeAreRejected(): void
    {
        $this->assertSame( [ 'unknown_key' ], $this->codesFor( $this->numberField( [ 'options' => [] ] ) ) );
    }

    public function testMissingCommonKeyIsReported(): void
    {
        $field = $this->numberField();
        unset( $field['help'] );

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $field ) );
    }

    public function testAnUnknownKeyDoesNotSuppressOtherValueErrors(): void
    {
        $field           = $this->numberField( [ 'min' => 'zero' ] );
        $field['colour'] = 'blue';

        $codes = $this->codesFor( $field );

        $this->assertSame( [ 'unknown_key', 'invalid_type' ], $codes );
    }

    public function testNonFiniteRangeValuesAreRejected(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->numberField( [ 'min' => NAN ] ) ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->numberField( [ 'max' => INF ] ) ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $this->numberField( [ 'step' => -INF ] ) ) );
    }

    public function testNonFiniteOptionPriceIsRejected(): void
    {
        $codes = $this->codesFor(
            $this->radioField(
                [ 'options' => [ [ 'label' => 'A', 'value' => 'a', 'price' => NAN ] ] ]
            )
        );

        $this->assertSame( [ 'invalid_type' ], $codes );
    }

    public function testAllMalformedRangeKeysAreReportedNotJustTheFirst(): void
    {
        $codes = $this->codesFor( $this->numberField( [ 'min' => 'zero', 'max' => -5, 'step' => 'one' ] ) );

        $this->assertSame( [ 'invalid_type', 'invalid_type' ], $codes );
    }
}
