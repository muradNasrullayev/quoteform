<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\CalculationGraph;
use Quoteform\Engine\Expression;
use Quoteform\Engine\ExpressionException;

/**
 * tests/fixtures/calculations.json faylını oxuyur.
 * Eyni fayl Jest tərəfindən də oxunur (tests/js/engine/calculations-parity.test.js).
 */
final class CalculationParityTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public function caseProvider(): array
    {
        $path    = __DIR__ . '/../../fixtures/calculations.json';
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
        Expression::clearCache();

        if ( array_key_exists( 'error', $case ) ) {
            try {
                CalculationGraph::evaluateAll( $case['calculations'], $case['vars'] );
                $this->fail( sprintf( 'Case "%s" should have raised "%s".', $case['id'], $case['error'] ) );
            } catch ( ExpressionException $exception ) {
                $this->assertSame( $case['error'], $exception->getCodeSlug(), $case['id'] );
            }

            return;
        }

        $actual = CalculationGraph::evaluateAll( $case['calculations'], $case['vars'] );

        foreach ( $case['expect'] as $key => $expected ) {
            $this->assertArrayHasKey( $key, $actual, $case['id'] );

            if ( is_bool( $expected ) || is_string( $expected ) ) {
                $this->assertSame( $expected, $actual[ $key ], $case['id'] . '.' . $key );
                continue;
            }

            $this->assertTrue(
                is_int( $actual[ $key ] ) || is_float( $actual[ $key ] ),
                sprintf( 'Case "%s" key "%s" expected a number but the engine returned %s.', $case['id'], $key, gettype( $actual[ $key ] ) )
            );

            $this->assertEqualsWithDelta( (float) $expected, (float) $actual[ $key ], 1e-9, $case['id'] . '.' . $key );
        }

        $this->assertCount( count( $case['expect'] ), $actual, $case['id'] . ' produced extra keys' );
    }
}
