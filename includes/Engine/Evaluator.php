<?php

declare(strict_types=1);

namespace Quoteform\Engine;

// phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- engine exception messages are never printed: callers read getCodeSlug() and show their own translated text.
final class Evaluator
{
    /** @var array<string, mixed> */
    private $variables;

    /** @var Functions */
    private $functions;

    /**
     * @param array<string, mixed> $variables
     */
    public function __construct( array $variables, ?Functions $functions = null )
    {
        $this->variables = $variables;
        $this->functions = $functions ?? new Functions();
    }

    /**
     * @param array<string, mixed> $node
     * @return float|string|bool|array<int, mixed>
     */
    public function evaluate( array $node )
    {
        switch ( $node['type'] ) {
            case 'number':
            case 'string':
            case 'boolean':
                return $node['value'];

            case 'var':
                return $this->resolveVariable( $node['name'] );

            case 'unary':
                return $this->evaluateUnary( $node );

            case 'binary':
                return $this->evaluateBinary( $node );

            case 'call':
                return $this->evaluateCall( $node );
        }

        throw new ExpressionException(
            'unknown_node',
            sprintf( 'Unsupported expression node "%s".', (string) $node['type'] )
        );
    }

    /**
     * @return mixed
     */
    private function resolveVariable( string $name )
    {
        if ( array_key_exists( $name, $this->variables ) ) {
            return $this->variables[ $name ];
        }

        throw new ExpressionException(
            'unknown_variable',
            sprintf( 'There is no field or calculation called "%s".', $name ),
            0,
            [ 'name' => $name ]
        );
    }

    /**
     * @param array<string, mixed> $node
     * @return float|bool
     */
    private function evaluateUnary( array $node )
    {
        $operand = $this->evaluate( $node['operand'] );

        if ( $node['op'] === '-' ) {
            return -Values::toNumber( $operand );
        }

        return ! Values::toBool( $operand );
    }

    /**
     * @param array<string, mixed> $node
     * @return float|bool
     */
    private function evaluateBinary( array $node )
    {
        $operator = $node['op'];

        if ( $operator === '&&' ) {
            return Values::toBool( $this->evaluate( $node['left'] ) )
                && Values::toBool( $this->evaluate( $node['right'] ) );
        }

        if ( $operator === '||' ) {
            return Values::toBool( $this->evaluate( $node['left'] ) )
                || Values::toBool( $this->evaluate( $node['right'] ) );
        }

        $left  = $this->evaluate( $node['left'] );
        $right = $this->evaluate( $node['right'] );

        switch ( $operator ) {
            case '==':
                return Values::equals( $left, $right );

            case '!=':
                return ! Values::equals( $left, $right );

            case '>':
                return Values::compare( $left, $right ) > 0;

            case '<':
                return Values::compare( $left, $right ) < 0;

            case '>=':
                return Values::compare( $left, $right ) >= 0;

            case '<=':
                return Values::compare( $left, $right ) <= 0;
        }

        $leftNumber  = Values::toNumber( $left );
        $rightNumber = Values::toNumber( $right );

        switch ( $operator ) {
            case '+':
                return self::assertFiniteResult( $leftNumber + $rightNumber );

            case '-':
                return self::assertFiniteResult( $leftNumber - $rightNumber );

            case '*':
                return self::assertFiniteResult( $leftNumber * $rightNumber );

            case '/':
                if ( $rightNumber === 0.0 ) {
                    throw new ExpressionException( 'division_by_zero', 'Cannot divide by zero.' );
                }

                return self::assertFiniteResult( $leftNumber / $rightNumber );

            case '%':
                if ( $rightNumber === 0.0 ) {
                    throw new ExpressionException( 'division_by_zero', 'Cannot take a remainder with zero.' );
                }

                return self::assertFiniteResult( fmod( $leftNumber, $rightNumber ) );
        }

        throw new ExpressionException( 'unknown_operator', sprintf( 'Unsupported operator "%s".', (string) $operator ) );
    }

    /**
     * Overflow finite əməliyyandlardan da yarana bilər (məsələn ən böyük double-un öz-özünə
     * vurulması). division_by_zero yoxlaması HƏMİŞƏ bundan ƏVVƏL işləməlidir ki, `1 / 0`
     * `not_finite` yox, `division_by_zero` olaraq bildirilsin.
     */
    private static function assertFiniteResult( float $result ): float
    {
        if ( ! is_finite( $result ) ) {
            throw new ExpressionException( 'not_finite', 'This number is too large to use in a calculation.' );
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $node
     * @return mixed
     */
    private function evaluateCall( array $node )
    {
        if ( $node['name'] === 'if' ) {
            if ( count( $node['args'] ) !== 3 ) {
                throw new ExpressionException(
                    'wrong_argument_count',
                    sprintf( '"if" needs exactly 3 arguments, %d given.', count( $node['args'] ) ),
                    0,
                    [ 'name' => 'if', 'given' => count( $node['args'] ), 'min' => 3, 'max' => 3 ]
                );
            }

            $condition = Values::toBool( $this->evaluate( $node['args'][0] ) );

            return $this->evaluate( $node['args'][ $condition ? 1 : 2 ] );
        }

        $arguments = [];

        foreach ( $node['args'] as $argument ) {
            $arguments[] = $this->evaluate( $argument );
        }

        return $this->functions->call( $node['name'], $arguments );
    }
}
