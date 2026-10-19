<?php

declare(strict_types=1);

namespace Quoteform\Engine;

// phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- engine exception messages are never printed: callers read getCodeSlug() and show their own translated text.
final class Parser
{
    /** @var array<string, int> */
    private const PRECEDENCE = [
        '||' => 1,
        '&&' => 2,
        '==' => 3,
        '!=' => 3,
        '>'  => 3,
        '<'  => 3,
        '>=' => 3,
        '<=' => 3,
        '+'  => 4,
        '-'  => 4,
        '*'  => 5,
        '/'  => 5,
        '%'  => 5,
    ];

    /** @var Token[] */
    private $tokens;

    /** @var int */
    private $index = 0;

    /**
     * @param Token[] $tokens
     */
    public function __construct( array $tokens )
    {
        $this->tokens = $tokens;
    }

    /**
     * @return array<string, mixed>
     */
    public static function parse( string $source ): array
    {
        return ( new self( ( new Lexer( $source ) )->tokenize() ) )->parseProgram();
    }

    /**
     * @return array<string, mixed>
     */
    public function parseProgram(): array
    {
        if ( $this->current()->type === Token::EOF ) {
            throw new ExpressionException( 'empty_expression', 'The expression is empty.', 0 );
        }

        $node = $this->parseExpression( 1 );

        if ( $this->current()->type !== Token::EOF ) {
            throw new ExpressionException(
                'unexpected_token',
                'Unexpected input after the end of the expression.',
                $this->current()->position
            );
        }

        return $node;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseExpression( int $minimumPrecedence ): array
    {
        $left = $this->parseUnary();

        while ( true ) {
            $token = $this->current();

            if ( $token->type !== Token::OPERATOR || ! isset( self::PRECEDENCE[ $token->value ] ) ) {
                break;
            }

            $precedence = self::PRECEDENCE[ $token->value ];

            if ( $precedence < $minimumPrecedence ) {
                break;
            }

            $this->index++;

            $left = [
                'type'  => 'binary',
                'op'    => $token->value,
                'left'  => $left,
                'right' => $this->parseExpression( $precedence + 1 ),
            ];
        }

        return $left;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseUnary(): array
    {
        $token = $this->current();

        if ( $token->type === Token::OPERATOR && ( $token->value === '-' || $token->value === '!' ) ) {
            $this->index++;

            return [
                'type'    => 'unary',
                'op'      => $token->value,
                'operand' => $this->parseUnary(),
            ];
        }

        return $this->parsePrimary();
    }

    /**
     * @return array<string, mixed>
     */
    private function parsePrimary(): array
    {
        $token = $this->current();

        switch ( $token->type ) {
            case Token::NUMBER:
                $this->index++;
                return [ 'type' => 'number', 'value' => $token->value ];

            case Token::STRING:
                $this->index++;
                return [ 'type' => 'string', 'value' => $token->value ];

            case Token::BOOLEAN:
                $this->index++;
                return [ 'type' => 'boolean', 'value' => $token->value ];

            case Token::VARIABLE:
                $this->index++;
                return [ 'type' => 'var', 'name' => $token->value ];

            case Token::IDENT:
                return $this->parseCall();

            case Token::LPAREN:
                $this->index++;
                $node = $this->parseExpression( 1 );
                $this->expect( Token::RPAREN );
                return $node;
        }

        throw new ExpressionException(
            'unexpected_token',
            'Unexpected token in the expression.',
            $token->position,
            [ 'token' => $token->type ]
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function parseCall(): array
    {
        $identifier = $this->current();
        $this->index++;

        if ( $this->current()->type !== Token::LPAREN ) {
            throw new ExpressionException(
                'unexpected_token',
                sprintf( '"%s" must be followed by "(".', $identifier->value ),
                $identifier->position,
                [ 'name' => $identifier->value ]
            );
        }

        $this->index++;
        $arguments = [];

        if ( $this->current()->type !== Token::RPAREN ) {
            while ( true ) {
                $arguments[] = $this->parseExpression( 1 );

                if ( $this->current()->type === Token::COMMA ) {
                    $this->index++;
                    continue;
                }

                break;
            }
        }

        $this->expect( Token::RPAREN );

        return [
            'type' => 'call',
            'name' => $identifier->value,
            'args' => $arguments,
        ];
    }

    private function expect( string $type ): Token
    {
        $token = $this->current();

        if ( $token->type !== $type ) {
            throw new ExpressionException(
                'unexpected_token',
                sprintf( 'Expected %s but found %s.', $type, $token->type ),
                $token->position,
                [ 'expected' => $type, 'found' => $token->type ]
            );
        }

        $this->index++;

        return $token;
    }

    private function current(): Token
    {
        return $this->tokens[ $this->index ];
    }
}
