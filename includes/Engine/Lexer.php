<?php

declare(strict_types=1);

namespace Quoteform\Engine;

// phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- engine exception messages are never printed: callers read getCodeSlug() and show their own translated text.
final class Lexer
{
    /** @var string[] İki simvollu operatorlar birsimvollulardan ƏVVƏL yoxlanılır. */
    private const OPERATORS = [ '==', '!=', '>=', '<=', '&&', '||', '>', '<', '+', '-', '*', '/', '%', '!' ];

    /** @var string */
    private $source;

    /** @var int */
    private $length;

    /** @var int */
    private $position = 0;

    public function __construct( string $source )
    {
        $this->source = $source;
        $this->length = strlen( $source );
    }

    /**
     * @return Token[]
     */
    public function tokenize(): array
    {
        $tokens = [];

        while ( $this->position < $this->length ) {
            $character = $this->source[ $this->position ];

            if ( $character === ' ' || $character === "\t" || $character === "\n" || $character === "\r" ) {
                $this->position++;
                continue;
            }

            if ( $character === '{' ) {
                $tokens[] = $this->readVariable();
                continue;
            }

            if ( $character === '"' || $character === "'" ) {
                $tokens[] = $this->readString( $character );
                continue;
            }

            if ( $this->isDigit( $character ) || ( $character === '.' && $this->isDigit( $this->peek( 1 ) ) ) ) {
                $tokens[] = $this->readNumber();
                continue;
            }

            if ( $this->isIdentifierStart( $character ) ) {
                $tokens[] = $this->readIdentifier();
                continue;
            }

            if ( $character === '(' ) {
                $tokens[] = new Token( Token::LPAREN, '(', $this->position++ );
                continue;
            }

            if ( $character === ')' ) {
                $tokens[] = new Token( Token::RPAREN, ')', $this->position++ );
                continue;
            }

            if ( $character === ',' ) {
                $tokens[] = new Token( Token::COMMA, ',', $this->position++ );
                continue;
            }

            $operator = $this->readOperator();

            if ( $operator !== null ) {
                $tokens[] = $operator;
                continue;
            }

            throw new ExpressionException(
                'unexpected_character',
                sprintf( 'Unexpected character "%s".', $character ),
                $this->position,
                [ 'character' => $character ]
            );
        }

        $tokens[] = new Token( Token::EOF, null, $this->position );

        return $tokens;
    }

    private function readVariable(): Token
    {
        $start = $this->position;
        $this->position++;
        $name = '';

        while ( $this->position < $this->length && $this->source[ $this->position ] !== '}' ) {
            $character = $this->source[ $this->position ];

            if ( ! $this->isIdentifierPart( $character ) && $character !== '.' ) {
                throw new ExpressionException(
                    'malformed_variable',
                    sprintf( 'Invalid character "%s" in a variable name.', $character ),
                    $this->position,
                    [ 'character' => $character ]
                );
            }

            $name .= $character;
            $this->position++;
        }

        if ( $this->position >= $this->length ) {
            throw new ExpressionException( 'unterminated_variable', 'A variable is missing its closing brace.', $start );
        }

        $this->position++;

        if ( $name === '' ) {
            throw new ExpressionException( 'empty_variable', 'A variable name cannot be empty.', $start );
        }

        return new Token( Token::VARIABLE, $name, $start );
    }

    private function readString( string $quote ): Token
    {
        $start = $this->position;
        $this->position++;
        $value = '';

        while ( $this->position < $this->length ) {
            $character = $this->source[ $this->position ];

            if ( $character === '\\' && $this->position + 1 < $this->length ) {
                $next = $this->source[ $this->position + 1 ];

                if ( $next === $quote || $next === '\\' ) {
                    $value .= $next;
                    $this->position += 2;
                    continue;
                }
            }

            if ( $character === $quote ) {
                $this->position++;
                return new Token( Token::STRING, $value, $start );
            }

            $value .= $character;
            $this->position++;
        }

        throw new ExpressionException( 'unterminated_string', 'A text value is missing its closing quote.', $start );
    }

    private function readNumber(): Token
    {
        $start    = $this->position;
        $raw      = '';
        $hasPoint = false;

        while ( $this->position < $this->length ) {
            $character = $this->source[ $this->position ];

            if ( $this->isDigit( $character ) ) {
                $raw .= $character;
                $this->position++;
                continue;
            }

            if ( $character === '.' ) {
                if ( $hasPoint ) {
                    throw new ExpressionException( 'malformed_number', 'A number cannot contain two decimal points.', $this->position );
                }

                $hasPoint = true;
                $raw     .= $character;
                $this->position++;
                continue;
            }

            break;
        }

        return new Token( Token::NUMBER, (float) $raw, $start );
    }

    private function readIdentifier(): Token
    {
        $start = $this->position;
        $name  = '';

        while ( $this->position < $this->length && $this->isIdentifierPart( $this->source[ $this->position ] ) ) {
            $name .= $this->source[ $this->position ];
            $this->position++;
        }

        $lowercase = strtolower( $name );

        if ( $lowercase === 'true' ) {
            return new Token( Token::BOOLEAN, true, $start );
        }

        if ( $lowercase === 'false' ) {
            return new Token( Token::BOOLEAN, false, $start );
        }

        return new Token( Token::IDENT, $lowercase, $start );
    }

    private function readOperator(): ?Token
    {
        foreach ( self::OPERATORS as $operator ) {
            $width = strlen( $operator );

            if ( substr( $this->source, $this->position, $width ) === $operator ) {
                $token = new Token( Token::OPERATOR, $operator, $this->position );
                $this->position += $width;
                return $token;
            }
        }

        return null;
    }

    private function peek( int $offset ): string
    {
        $index = $this->position + $offset;

        return $index < $this->length ? $this->source[ $index ] : '';
    }

    private function isDigit( string $character ): bool
    {
        return $character >= '0' && $character <= '9';
    }

    private function isIdentifierStart( string $character ): bool
    {
        return $character === '_'
            || ( $character >= 'a' && $character <= 'z' )
            || ( $character >= 'A' && $character <= 'Z' );
    }

    private function isIdentifierPart( string $character ): bool
    {
        return $this->isIdentifierStart( $character ) || $this->isDigit( $character );
    }
}
