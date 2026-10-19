<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Expression;
use Quoteform\Engine\ExpressionException;

/**
 * Bu testlər tests/fixtures/expressions.json faylını oxuyur.
 * Eyni fayl Jest tərəfindən də oxunur (tests/js/engine/parity.test.js).
 * İki tərəf fərqli nəticə verirsə, paritet pozulub.
 */
final class ExpressionParityTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function caseProvider(): array
    {
        $path = __DIR__ . '/../../fixtures/expressions.json';

        if ( ! file_exists( $path ) ) {
            throw new \RuntimeException( 'Fixture file is missing: ' . $path );
        }

        $decoded = json_decode( (string) file_get_contents( $path ), true );

        if ( ! is_array( $decoded ) || ! isset( $decoded['cases'] ) ) {
            throw new \RuntimeException( 'Fixture file is malformed: ' . $path );
        }

        $provided = [];

        foreach ( $decoded['cases'] as $case ) {
            $provided[ $case['id'] ] = [ $case ];
        }

        return $provided;
    }

    /**
     * @dataProvider caseProvider
     * @param array<string, mixed> $case
     */
    public function testFixtureCase( array $case ): void
    {
        $hasExpect = array_key_exists( 'expect', $case );
        $hasError  = array_key_exists( 'error', $case );

        $this->assertTrue(
            $hasExpect !== $hasError,
            sprintf( 'Case "%s" must declare exactly one of "expect" or "error".', $case['id'] )
        );

        Expression::clearCache();

        if ( $hasError ) {
            try {
                Expression::evaluate( $case['expr'], $case['vars'] );
                $this->fail( sprintf( 'Case "%s" should have raised "%s".', $case['id'], $case['error'] ) );
            } catch ( ExpressionException $exception ) {
                $this->assertSame( $case['error'], $exception->getCodeSlug(), $case['id'] );
            }

            return;
        }

        $actual   = Expression::evaluate( $case['expr'], $case['vars'] );
        $expected = $case['expect'];

        if ( is_bool( $expected ) || is_string( $expected ) ) {
            $this->assertSame( $expected, $actual, $case['id'] );
            return;
        }

        // Tip qoruyucusu: (float) çevirməsi olmadan yanlış TİP səssizcə keçərdi —
        // (float) false === 0.0, (float) "abc" === 0.0. Paritet qapısı yanlış tipi də tutmalıdır.
        $this->assertTrue(
            is_int( $actual ) || is_float( $actual ),
            sprintf( 'Case "%s" expected a number but the engine returned %s.', $case['id'], gettype( $actual ) )
        );

        $this->assertEqualsWithDelta( (float) $expected, (float) $actual, 1e-9, $case['id'] );
    }

    public function testFixtureIdsAreUnique(): void
    {
        $decoded = json_decode( (string) file_get_contents( __DIR__ . '/../../fixtures/expressions.json' ), true );
        $ids     = array_column( $decoded['cases'], 'id' );

        $this->assertSame( count( $ids ), count( array_unique( $ids ) ), 'Fixture ids must be unique.' );
    }
}
