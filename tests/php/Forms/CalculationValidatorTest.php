<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\CalculationValidator;

final class CalculationValidatorTest extends TestCase
{
    /**
     * @return array<string, string>
     */
    private function fieldTypes(): array
    {
        return [
            'room_count' => 'number',
            'bathrooms'  => 'number',
            'urgency'    => 'radio',
            'notes'      => 'textarea',
            'gift'       => 'toggle',
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function calculations(): array
    {
        return [
            [
                'key'        => 'subtotal',
                'expression' => '{room_count} * 50 + {bathrooms} * 120',
                'label'      => 'Subtotal',
                'visible'    => false,
            ],
            [
                'key'        => 'total',
                'expression' => 'round({subtotal} + {urgency.price}, 2)',
                'label'      => 'Total',
                'visible'    => true,
            ],
        ];
    }

    /**
     * @param mixed $calculations
     * @return string[]
     */
    private function codesFor( $calculations ): array
    {
        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );

        return array_column( $result->getErrors(), 'code' );
    }

    public function testValidCalculationsPass(): void
    {
        $this->assertSame( [], $this->codesFor( $this->calculations() ) );
    }

    public function testCalculationsMustBeANonEmptyList(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( 'nope' ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'a' => [] ] ) );
        $this->assertSame( [ 'empty_collection' ], $this->codesFor( [] ) );
    }

    public function testEachCalculationNeedsAllFourKeys(): void
    {
        $calculations = $this->calculations();
        unset( $calculations[0]['label'] );

        $this->assertContains( 'missing_field', $this->codesFor( $calculations ) );
    }

    public function testUnknownKeyIsRejected(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['colour'] = 'blue';

        $this->assertContains( 'unknown_key', $this->codesFor( $calculations ) );
    }

    public function testKeyMustFollowTheKeyRules(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['key'] = '2nd';

        $this->assertContains( 'invalid_key_format', $this->codesFor( $calculations ) );
    }

    public function testKeysMustBeUnique(): void
    {
        $calculations   = $this->calculations();
        $calculations[] = [ 'key' => 'subtotal', 'expression' => '1', 'label' => 'Dup', 'visible' => false ];

        $this->assertContains( 'duplicate_key', $this->codesFor( $calculations ) );
    }

    public function testVisibleMustBeBoolean(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['visible'] = 'yes';

        $this->assertContains( 'invalid_type', $this->codesFor( $calculations ) );
    }

    public function testTotalIsRequired(): void
    {
        $calculations = [ $this->calculations()[0] ];

        $this->assertSame( [ 'missing_total' ], $this->codesFor( $calculations ) );
    }

    public function testExpressionCannotBeEmpty(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = '   ';

        $this->assertContains( 'missing_field', $this->codesFor( $calculations ) );
    }

    public function testExpressionLengthIsCapped(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = '1 + ' . str_repeat( '1 + ', 300 ) . '1';

        $this->assertContains( 'expression_too_long', $this->codesFor( $calculations ) );
    }

    public function testBrokenExpressionIsRejectedWithTheEngineCode(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = '{room_count} * ';

        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );
        $error  = $result->getErrors()[0];

        $this->assertSame( 'invalid_expression', $error['code'] );
        $this->assertSame( 'unexpected_token', $error['context']['engine_code'] );
        $this->assertArrayHasKey( 'position', $error['context'] );
    }

    public function testExpressionErrorPositionIsInUtf16CodeUnits(): void
    {
        $calculations = $this->calculations();
        // "日本" ASCII-də 6 bayt, UTF-16-da 2 kod vahididir.
        $calculations[0]['expression'] = '1 + "' . "\u{65E5}\u{672C}" . '" # 2';

        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );

        $this->assertSame( 9, $result->getErrors()[0]['context']['position'] );
    }

    public function testUnknownVariableIsRejected(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = '{ghost} * 2';

        $codes = $this->codesFor( $calculations );

        $this->assertContains( 'unknown_reference', $codes );
    }

    public function testACalculationMayReferenceAnotherCalculation(): void
    {
        // Üç mərhələli zəncir: "total" birbaşa "subtotal"-a deyil, aralarında duran
        // "markup"-a istinad edir — bu, `testValidCalculationsPass()`-dan fərqli olaraq,
        // hesablamalar arası çoxpilləli istinadın özünü yoxlayır.
        $calculations = [
            [ 'key' => 'base', 'expression' => '{room_count} * 10', 'label' => 'Base', 'visible' => false ],
            [ 'key' => 'markup', 'expression' => '{base} * 1.2', 'label' => 'Markup', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '{markup} + {bathrooms}', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertSame( [], $this->codesFor( $calculations ) );
    }

    public function testPriceSuffixIsAllowedOnOptionFields(): void
    {
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{subtotal} + {urgency.price}';

        $this->assertSame( [], $this->codesFor( $calculations ) );
    }

    public function testPriceSuffixIsRejectedOnNonOptionFields(): void
    {
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{subtotal} + {notes.price}';

        $this->assertContains( 'unknown_reference', $this->codesFor( $calculations ) );
    }

    public function testPriceSuffixIsRejectedOnToggleFields(): void
    {
        // `toggle`-ın option-u yoxdur, ona görə `.price` mənasızdır (spec §7.3) —
        // bu, JS tərəfindəki `PRICE_BEARING_TYPES`-dan `toggle`-ın çıxarılmasının PHP əkizidir.
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{subtotal} + {gift.price}';

        $this->assertContains( 'unknown_reference', $this->codesFor( $calculations ) );
    }

    public function testUnknownSuffixIsRejected(): void
    {
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{subtotal} + {urgency.colour}';

        $this->assertContains( 'unknown_reference', $this->codesFor( $calculations ) );
    }

    public function testDirectCycleIsRejected(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b}', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'b', 'expression' => '{a}', 'label' => 'B', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertContains( 'circular_reference', $this->codesFor( $calculations ) );
    }

    public function testSelfReferenceIsRejected(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{a} + 1', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertContains( 'circular_reference', $this->codesFor( $calculations ) );
    }

    public function testACycleIsStillReportedAlongsideAnUnrelatedError(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b} + 1', 'label' => 'A', 'visible' => false, 'colour' => 'blue' ],
            [ 'key' => 'b', 'expression' => '{a} + 1', 'label' => 'B', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '{a}', 'label' => 'Total', 'visible' => true ],
        ];

        $codes = $this->codesFor( $calculations );

        $this->assertContains( 'unknown_key', $codes );
        $this->assertContains( 'circular_reference', $codes );
    }

    public function testCycleIsNotCheckedWhenAnExpressionFailedToCompile(): void
    {
        // Sınıq ifadə varsa, qraf qurula bilməz — iki xəta əvəzinə bir aydın xəta göstəririk.
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b} * ', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '{a}', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertSame( [ 'invalid_expression' ], $this->codesFor( $calculations ) );
    }

    public function testErrorPathPointsAtTheOffendingCalculation(): void
    {
        $calculations = $this->calculations();
        $calculations[1]['expression'] = '{ghost}';

        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );

        $this->assertSame( '1.expression', $result->getErrors()[0]['path'] );
    }

    public function testNullKeyIsReportedInsteadOfSwallowed(): void
    {
        $calculations = [
            [ 'key' => null, 'expression' => '{ghost}', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $codes = $this->codesFor( $calculations );

        $this->assertNotSame( [], $codes );
        $this->assertContains( 'invalid_type', $codes );
        $this->assertContains( 'unknown_reference', $codes );
    }

    public function testArrayKeyDoesNotCrashValidation(): void
    {
        $calculations = [
            [ 'key' => [], 'expression' => '1', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        // Əsas iddia bu çağırışın normal qayıtmasıdır — qaçan bir TypeError
        // özü testi PHPUnit səviyyəsində uğursuz edərdi.
        $codes = $this->codesFor( $calculations );

        $this->assertContains( 'invalid_type', $codes );
    }

    public function testNumericKeyReportsInvalidTypeAtItsPath(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['key'] = 123;

        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );

        $found = null;

        foreach ( $result->getErrors() as $error ) {
            if ( $error['path'] === '0.key' ) {
                $found = $error;
            }
        }

        $this->assertNotNull( $found );
        $this->assertSame( 'invalid_type', $found['code'] );
    }

    public function testNullExpressionIsReportedInsteadOfSwallowed(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = null;

        $codes = $this->codesFor( $calculations );

        $this->assertNotSame( [], $codes );
        $this->assertContains( 'invalid_type', $codes );
    }

    public function testNonStringExpressionIsInvalidTypeNotMissingField(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['expression'] = 123;

        $codes = $this->codesFor( $calculations );

        $this->assertContains( 'invalid_type', $codes );
        $this->assertNotContains( 'missing_field', $codes );
    }

    public function testDuplicateKeyDoesNotAlsoRaiseACycleError(): void
    {
        $calculations   = $this->calculations();
        $calculations[] = [ 'key' => 'subtotal', 'expression' => '1', 'label' => 'Dup', 'visible' => false ];

        $codes = $this->codesFor( $calculations );

        $duplicateCount = 0;

        foreach ( $codes as $code ) {
            if ( $code === 'duplicate_key' ) {
                $duplicateCount++;
            }
        }

        $this->assertSame( 1, $duplicateCount );
        $this->assertNotContains( 'circular_reference', $codes );
        $this->assertNotContains( 'duplicate_calculation_key', $codes );
    }

    public function testNullLabelIsReportedInsteadOfSwallowed(): void
    {
        $calculations = $this->calculations();
        $calculations[0]['label'] = null;

        $this->assertContains( 'missing_field', $this->codesFor( $calculations ) );
    }

    public function testMultiByteExpressionLengthIsCountedInUtf16CodeUnits(): void
    {
        $calculations = $this->calculations();

        // Hər "日" 3 bayt (UTF-8) / 1 UTF-16 kod vahididir. 2 dırnaq + 997 simvol = 999 vahid.
        $calculations[0]['expression'] = '"' . str_repeat( "\u{65E5}", 997 ) . '"';

        $this->assertSame( [], $this->codesFor( $calculations ) );

        // 2 dırnaq + 999 simvol = 1001 vahid — hədddən yuxarı.
        $calculations[0]['expression'] = '"' . str_repeat( "\u{65E5}", 999 ) . '"';

        $result = ( new CalculationValidator() )->validate( $calculations, $this->fieldTypes() );
        $error  = $result->getErrors()[0];

        $this->assertSame( 'expression_too_long', $error['code'] );
        $this->assertSame( 1001, $error['context']['length'] );
    }

    public function testReservedKeyIsRejected(): void
    {
        $calculations = [
            [ 'key' => 'constructor', 'expression' => '1', 'label' => 'C', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertContains( 'reserved_key', $this->codesFor( $calculations ) );
    }
}
