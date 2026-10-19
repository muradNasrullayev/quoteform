<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Expression;

final class ExpressionTest extends TestCase
{
    protected function setUp(): void
    {
        Expression::clearCache();
    }

    public function testEvaluatesFromSource(): void
    {
        $this->assertSame( 390.0, Expression::evaluate( '{a} * 50 + {b} * 120', [ 'a' => 3.0, 'b' => 2.0 ] ) );
    }

    public function testCompilesOncePerSource(): void
    {
        $this->assertSame( 0, Expression::cacheSize() );

        Expression::evaluate( '1 + 1', [] );
        Expression::evaluate( '1 + 1', [] );

        $this->assertSame( 1, Expression::cacheSize() );

        Expression::evaluate( '2 + 2', [] );

        $this->assertSame( 2, Expression::cacheSize() );
    }

    public function testClearCacheEmptiesTheCache(): void
    {
        Expression::evaluate( '1 + 1', [] );
        Expression::clearCache();

        $this->assertSame( 0, Expression::cacheSize() );
    }

    public function testCollectsVariableNamesInOrder(): void
    {
        $this->assertSame(
            [ 'urgency', 'subtotal' ],
            Expression::variables( 'if({urgency} == "express", {subtotal} * 1.3, {subtotal})' )
        );
    }

    public function testCollectsVariablesFromNestedNodes(): void
    {
        $this->assertSame(
            [ 'a', 'b', 'c' ],
            Expression::variables( 'round(max({a}, {b}) + -{c}, 2)' )
        );
    }

    public function testReturnsEmptyListWhenNoVariables(): void
    {
        $this->assertSame( [], Expression::variables( '2 + 3 * 4' ) );
    }
}
