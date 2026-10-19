<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Lexer;
use Quoteform\Engine\Token;

final class LexerTest extends TestCase
{
    /**
     * @return array<int, array{0: string, 1: mixed}>
     */
    private function tokenPairs( string $source ): array
    {
        $pairs = [];
        foreach ( ( new Lexer( $source ) )->tokenize() as $token ) {
            $pairs[] = [ $token->type, $token->value ];
        }
        return $pairs;
    }

    public function testTokenizesArithmeticWithVariable(): void
    {
        $this->assertSame(
            [
                [ Token::VARIABLE, 'room_count' ],
                [ Token::OPERATOR, '*' ],
                [ Token::NUMBER, 50.0 ],
                [ Token::OPERATOR, '+' ],
                [ Token::NUMBER, 1.5 ],
                [ Token::EOF, null ],
            ],
            $this->tokenPairs( '{room_count} * 50 + 1.5' )
        );
    }

    public function testTokenizesDottedVariable(): void
    {
        $this->assertSame(
            [ [ Token::VARIABLE, 'urgency.price' ], [ Token::EOF, null ] ],
            $this->tokenPairs( '{urgency.price}' )
        );
    }

    public function testTokenizesTwoCharacterOperatorsBeforeSingle(): void
    {
        $this->assertSame(
            [
                [ Token::NUMBER, 1.0 ],
                [ Token::OPERATOR, '>=' ],
                [ Token::NUMBER, 2.0 ],
                [ Token::OPERATOR, '&&' ],
                [ Token::NUMBER, 3.0 ],
                [ Token::OPERATOR, '!=' ],
                [ Token::NUMBER, 4.0 ],
                [ Token::EOF, null ],
            ],
            $this->tokenPairs( '1 >= 2 && 3 != 4' )
        );
    }

    public function testTokenizesStringsWithEscapes(): void
    {
        $this->assertSame(
            [ [ Token::STRING, 'ex"press' ], [ Token::EOF, null ] ],
            $this->tokenPairs( '"ex\\"press"' )
        );
    }

    public function testTokenizesBooleansAndCalls(): void
    {
        $this->assertSame(
            [
                [ Token::IDENT, 'if' ],
                [ Token::LPAREN, '(' ],
                [ Token::BOOLEAN, true ],
                [ Token::COMMA, ',' ],
                [ Token::BOOLEAN, false ],
                [ Token::COMMA, ',' ],
                [ Token::NUMBER, 0.0 ],
                [ Token::RPAREN, ')' ],
                [ Token::EOF, null ],
            ],
            $this->tokenPairs( 'if(true, false, 0)' )
        );
    }

    public function testRejectsUnterminatedVariable(): void
    {
        $this->expectException( ExpressionException::class );
        ( new Lexer( '{room_count' ) )->tokenize();
    }

    public function testRejectsUnexpectedCharacter(): void
    {
        try {
            ( new Lexer( '1 # 2' ) )->tokenize();
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unexpected_character', $exception->getCodeSlug() );
            $this->assertSame( 2, $exception->getPosition() );
        }
    }

    public function testRejectsMalformedNumber(): void
    {
        try {
            ( new Lexer( '1.2.3' ) )->tokenize();
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'malformed_number', $exception->getCodeSlug() );
        }
    }
}
