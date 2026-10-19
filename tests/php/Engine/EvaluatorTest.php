<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Evaluator;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Parser;

final class EvaluatorTest extends TestCase
{
    /**
     * @param array<string, mixed> $variables
     * @return mixed
     */
    private function evaluateSource( string $source, array $variables = [] )
    {
        return ( new Evaluator( $variables ) )->evaluate( Parser::parse( $source ) );
    }

    public function testArithmeticRespectsPrecedence(): void
    {
        $this->assertSame( 14.0, $this->evaluateSource( '2 + 3 * 4' ) );
        $this->assertSame( 20.0, $this->evaluateSource( '(2 + 3) * 4' ) );
    }

    public function testResolvesVariables(): void
    {
        $this->assertSame( 390.0, $this->evaluateSource( '{room_count} * 50 + {bathrooms} * 120', [ 'room_count' => 3.0, 'bathrooms' => 2.0 ] ) );
    }

    public function testEmptyVariableCountsAsZero(): void
    {
        $this->assertSame( 150.0, $this->evaluateSource( '{room_count} * 50 + {bathrooms} * 120', [ 'room_count' => 3.0, 'bathrooms' => '' ] ) );
    }

    public function testUnaryMinusAndNot(): void
    {
        $this->assertSame( -5.0, $this->evaluateSource( '-{a}', [ 'a' => 5.0 ] ) );
        $this->assertTrue( $this->evaluateSource( '!{a}', [ 'a' => 0.0 ] ) );
        $this->assertFalse( $this->evaluateSource( '!{a}', [ 'a' => 1.0 ] ) );
    }

    public function testModuloUsesFloatRemainder(): void
    {
        $this->assertSame( 1.0, $this->evaluateSource( '7 % 3' ) );
        $this->assertSame( 0.5, $this->evaluateSource( '7.5 % 3.5' ) );
    }

    public function testComparisonsReturnBooleans(): void
    {
        $this->assertTrue( $this->evaluateSource( '{a} > 2', [ 'a' => 5.0 ] ) );
        $this->assertFalse( $this->evaluateSource( '{a} >= 6', [ 'a' => 5.0 ] ) );
        $this->assertTrue( $this->evaluateSource( '{tier} == "express"', [ 'tier' => 'express' ] ) );
        $this->assertFalse( $this->evaluateSource( '{tier} == 5', [ 'tier' => '5' ] ) );
    }

    public function testLogicalOperatorsShortCircuit(): void
    {
        $this->assertFalse( $this->evaluateSource( '{a} && (1 / 0)', [ 'a' => 0.0 ] ) );
        $this->assertTrue( $this->evaluateSource( '{a} || (1 / 0)', [ 'a' => 1.0 ] ) );
    }

    public function testIfEvaluatesOnlyTheChosenBranch(): void
    {
        $this->assertSame( 0.0, $this->evaluateSource( 'if({x} == 0, 0, 100 / {x})', [ 'x' => 0.0 ] ) );
        $this->assertSame( 25.0, $this->evaluateSource( 'if({x} == 0, 0, 100 / {x})', [ 'x' => 4.0 ] ) );
    }

    public function testIfReturnsNonNumericBranches(): void
    {
        $this->assertSame( 'yes', $this->evaluateSource( 'if({a}, "yes", "no")', [ 'a' => 1.0 ] ) );
    }

    public function testIfWithWrongArgumentCountThrows(): void
    {
        try {
            $this->evaluateSource( 'if(1, 2)' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'wrong_argument_count', $exception->getCodeSlug() );
        }
    }

    public function testDivisionByZeroThrows(): void
    {
        try {
            $this->evaluateSource( '1 / 0' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'division_by_zero', $exception->getCodeSlug() );
        }
    }

    public function testModuloByZeroThrows(): void
    {
        try {
            $this->evaluateSource( '1 % 0' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'division_by_zero', $exception->getCodeSlug() );
        }
    }

    /**
     * Adın özü kontekstdə qalır — xətanı yerləşdirən odur. "Did you mean"
     * təklifi isə SİLİNDİ: onu heç bir istehsal kodu oxumurdu, halbuki iki
     * mühərrikdə əl ilə paritetdə saxlanılan Levenshtein tətbiqi kimi
     * yaşayırdı (və PHP 7.4-ün 255 baytlıq məhdudiyyəti üçün ayrıca hack
     * tələb edirdi).
     */
    public function testUnknownVariableNamesWhatCouldNotBeResolvedAndNothingMore(): void
    {
        try {
            $this->evaluateSource( '{bathroms}', [ 'bathrooms' => 2.0 ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unknown_variable', $exception->getCodeSlug() );
            $this->assertSame( [ 'name' => 'bathroms' ], $exception->getContext() );
        }
    }

    /**
     * Uzun ad heç bir xəbərdarlıq çıxarmır. Bu dəstin `phpunit.xml`-i
     * `failOnWarning="true"` qoyur, yəni PHP 7.4-ün `levenshtein()`
     * xəbərdarlığı bu testi məhz onunla düşürərdi — indi belə bir çağırış
     * qalmayıb və test bunu qoruyur.
     */
    public function testAnUnknownVariableWithAVeryLongNameIsReportedCleanly(): void
    {
        $longName = str_repeat( 'a', 300 );

        try {
            $this->evaluateSource( '{' . $longName . '}', [ 'bathrooms' => 2.0 ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unknown_variable', $exception->getCodeSlug() );
            $this->assertSame( [ 'name' => $longName ], $exception->getContext() );
        }
    }

    public function testCallsRegisteredFunctions(): void
    {
        $this->assertSame( 2.46, $this->evaluateSource( 'round({a}, 2)', [ 'a' => 2.4567 ] ) );
        $this->assertSame( 99.0, $this->evaluateSource( 'max({a}, 99)', [ 'a' => 50.0 ] ) );
    }

    public function testCombinedRealWorldExpression(): void
    {
        $variables = [ 'subtotal' => 390.0, 'urgency' => 'express' ];

        $this->assertSame( 507.0, $this->evaluateSource( 'round(if({urgency} == "express", {subtotal} * 1.3, {subtotal}), 2)', $variables ) );
    }
}
