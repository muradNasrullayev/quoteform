<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\CalculationGraph;
use Quoteform\Engine\ExpressionException;

final class CalculationGraphTest extends TestCase
{
    public function testOrdersDependenciesBeforeDependents(): void
    {
        $calculations = [
            [ 'key' => 'total', 'expression' => '{subtotal} + 10' ],
            [ 'key' => 'subtotal', 'expression' => '{a} * 2' ],
        ];

        $this->assertSame( [ 'subtotal', 'total' ], CalculationGraph::order( $calculations ) );
    }

    public function testKeepsDeclarationOrderWhenIndependent(): void
    {
        $calculations = [
            [ 'key' => 'b', 'expression' => '2' ],
            [ 'key' => 'a', 'expression' => '1' ],
        ];

        $this->assertSame( [ 'b', 'a' ], CalculationGraph::order( $calculations ) );
    }

    public function testOrdersThreeLevelChain(): void
    {
        $calculations = [
            [ 'key' => 'total', 'expression' => '{withTax} + {fee}' ],
            [ 'key' => 'withTax', 'expression' => '{subtotal} * 1.2' ],
            [ 'key' => 'fee', 'expression' => '5' ],
            [ 'key' => 'subtotal', 'expression' => '{a} * 2' ],
        ];

        $order = CalculationGraph::order( $calculations );

        $this->assertLessThan( array_search( 'withTax', $order, true ), array_search( 'subtotal', $order, true ) );
        $this->assertLessThan( array_search( 'total', $order, true ), array_search( 'withTax', $order, true ) );
        $this->assertLessThan( array_search( 'total', $order, true ), array_search( 'fee', $order, true ) );
    }

    public function testEvaluatesChainedCalculations(): void
    {
        $calculations = [
            [ 'key' => 'subtotal', 'expression' => '{a} * 2' ],
            [ 'key' => 'total', 'expression' => '{subtotal} + 10' ],
        ];

        $this->assertSame(
            [ 'subtotal' => 10.0, 'total' => 20.0 ],
            CalculationGraph::evaluateAll( $calculations, [ 'a' => 5.0 ] )
        );
    }

    public function testEvaluatesOutOfOrderDeclarations(): void
    {
        $calculations = [
            [ 'key' => 'total', 'expression' => '{subtotal} + 10' ],
            [ 'key' => 'subtotal', 'expression' => '{a} * 2' ],
        ];

        $result = CalculationGraph::evaluateAll( $calculations, [ 'a' => 5.0 ] );

        $this->assertSame( 20.0, $result['total'] );
    }

    public function testCalculationOverridesFieldOfTheSameName(): void
    {
        $calculations = [
            [ 'key' => 'total', 'expression' => '99' ],
            [ 'key' => 'doubled', 'expression' => '{total} * 2' ],
        ];

        $result = CalculationGraph::evaluateAll( $calculations, [ 'total' => 5.0 ] );

        $this->assertSame( 99.0, $result['total'] );
        $this->assertSame( 198.0, $result['doubled'] );
    }

    public function testDetectsDirectCycle(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b}' ],
            [ 'key' => 'b', 'expression' => '{a}' ],
        ];

        try {
            CalculationGraph::order( $calculations );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'circular_reference', $exception->getCodeSlug() );
            $this->assertNotEmpty( $exception->getContext()['cycle'] );
        }
    }

    public function testDetectsSelfReference(): void
    {
        $calculations = [ [ 'key' => 'a', 'expression' => '{a} + 1' ] ];

        try {
            CalculationGraph::order( $calculations );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'circular_reference', $exception->getCodeSlug() );
        }
    }

    public function testDetectsIndirectCycle(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '{b}' ],
            [ 'key' => 'b', 'expression' => '{c}' ],
            [ 'key' => 'c', 'expression' => '{a}' ],
        ];

        try {
            CalculationGraph::order( $calculations );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'circular_reference', $exception->getCodeSlug() );
        }
    }

    public function testRejectsDuplicateKeys(): void
    {
        $calculations = [
            [ 'key' => 'a', 'expression' => '1' ],
            [ 'key' => 'a', 'expression' => '2' ],
        ];

        try {
            CalculationGraph::order( $calculations );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'duplicate_calculation_key', $exception->getCodeSlug() );
        }
    }

    public function testEvaluatesEmptyCalculationList(): void
    {
        $this->assertSame( [], CalculationGraph::evaluateAll( [], [ 'a' => 1.0 ] ) );
    }

    public function testKeepsDeclarationOrderForNumericLikeKeys(): void
    {
        $calculations = [
            [ 'key' => '2', 'expression' => '20' ],
            [ 'key' => '1', 'expression' => '10' ],
        ];

        $this->assertSame( [ '2', '1' ], CalculationGraph::order( $calculations ) );
    }
}
