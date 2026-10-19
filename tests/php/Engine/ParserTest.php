<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Parser;

final class ParserTest extends TestCase
{
    public function testMultiplicationBindsTighterThanAddition(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '+',
                'left'  => [ 'type' => 'number', 'value' => 2.0 ],
                'right' => [
                    'type'  => 'binary',
                    'op'    => '*',
                    'left'  => [ 'type' => 'number', 'value' => 3.0 ],
                    'right' => [ 'type' => 'number', 'value' => 4.0 ],
                ],
            ],
            Parser::parse( '2 + 3 * 4' )
        );
    }

    public function testParenthesesOverridePrecedence(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '*',
                'left'  => [
                    'type'  => 'binary',
                    'op'    => '+',
                    'left'  => [ 'type' => 'number', 'value' => 2.0 ],
                    'right' => [ 'type' => 'number', 'value' => 3.0 ],
                ],
                'right' => [ 'type' => 'number', 'value' => 4.0 ],
            ],
            Parser::parse( '(2 + 3) * 4' )
        );
    }

    public function testSubtractionIsLeftAssociative(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '-',
                'left'  => [
                    'type'  => 'binary',
                    'op'    => '-',
                    'left'  => [ 'type' => 'number', 'value' => 10.0 ],
                    'right' => [ 'type' => 'number', 'value' => 3.0 ],
                ],
                'right' => [ 'type' => 'number', 'value' => 2.0 ],
            ],
            Parser::parse( '10 - 3 - 2' )
        );
    }

    public function testComparisonBindsLooserThanArithmetic(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '>',
                'left'  => [
                    'type'  => 'binary',
                    'op'    => '+',
                    'left'  => [ 'type' => 'var', 'name' => 'a' ],
                    'right' => [ 'type' => 'number', 'value' => 1.0 ],
                ],
                'right' => [ 'type' => 'number', 'value' => 5.0 ],
            ],
            Parser::parse( '{a} + 1 > 5' )
        );
    }

    public function testLogicalOrBindsLoosestOfAll(): void
    {
        $this->assertSame(
            [
                'type'  => 'binary',
                'op'    => '||',
                'left'  => [
                    'type'  => 'binary',
                    'op'    => '&&',
                    'left'  => [ 'type' => 'var', 'name' => 'a' ],
                    'right' => [ 'type' => 'var', 'name' => 'b' ],
                ],
                'right' => [ 'type' => 'var', 'name' => 'c' ],
            ],
            Parser::parse( '{a} && {b} || {c}' )
        );
    }

    public function testParsesUnaryMinusAndNot(): void
    {
        $this->assertSame(
            [
                'type'    => 'unary',
                'op'      => '-',
                'operand' => [ 'type' => 'var', 'name' => 'a' ],
            ],
            Parser::parse( '-{a}' )
        );

        $this->assertSame(
            [
                'type'    => 'unary',
                'op'      => '!',
                'operand' => [ 'type' => 'var', 'name' => 'a' ],
            ],
            Parser::parse( '!{a}' )
        );
    }

    public function testParsesFunctionCallWithArguments(): void
    {
        $this->assertSame(
            [
                'type' => 'call',
                'name' => 'round',
                'args' => [
                    [ 'type' => 'var', 'name' => 'total' ],
                    [ 'type' => 'number', 'value' => 2.0 ],
                ],
            ],
            Parser::parse( 'round({total}, 2)' )
        );
    }

    public function testParsesFunctionCallWithNoArguments(): void
    {
        $this->assertSame(
            [ 'type' => 'call', 'name' => 'sum', 'args' => [] ],
            Parser::parse( 'sum()' )
        );
    }

    public function testRejectsMissingClosingParenthesis(): void
    {
        try {
            Parser::parse( '(2 + 3' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unexpected_token', $exception->getCodeSlug() );
        }
    }

    public function testRejectsTrailingTokens(): void
    {
        try {
            Parser::parse( '1 2' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unexpected_token', $exception->getCodeSlug() );
        }
    }

    public function testRejectsEmptyExpression(): void
    {
        try {
            Parser::parse( '   ' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'empty_expression', $exception->getCodeSlug() );
        }
    }

    public function testRejectsBareIdentifierWithoutCall(): void
    {
        try {
            Parser::parse( 'round' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unexpected_token', $exception->getCodeSlug() );
        }
    }
}
