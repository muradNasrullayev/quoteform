<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\Expression;
use Quoteform\Runtime\Evaluation;

/**
 * tests/fixtures/submissions.json — eyni faylı Jest də oxuyur
 * (tests/js/frontend/submissions-parity.test.js).
 */
final class SubmissionParityTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>}>
     */
    public function caseProvider(): array
    {
        $path    = __DIR__ . '/../../fixtures/submissions.json';
        $decoded = json_decode( (string) file_get_contents( $path ), true );

        if ( ! is_array( $decoded ) || ! isset( $decoded['cases'], $decoded['schemas'] ) ) {
            throw new \RuntimeException( 'Fixture file is malformed: ' . $path );
        }

        $provided = [];

        foreach ( $decoded['cases'] as $case ) {
            $provided[ $case['id'] ] = [ $case, $decoded['schemas'][ $case['schema'] ] ];
        }

        return $provided;
    }

    /**
     * @dataProvider caseProvider
     * @param array<string, mixed> $case
     * @param array<string, mixed> $schema
     */
    public function testFixtureCase( array $case, array $schema ): void
    {
        Expression::clearCache();

        $actual   = Evaluation::run( $schema, $case['values'] );
        $expected = $case['expect'];

        $this->assertSame( $expected['visible_fields'], $actual['visible_fields'], 'visible_fields' );
        $this->assertSame( $expected['visible_steps'], $actual['visible_steps'], 'visible_steps' );
        $this->assertSame( $expected['required'], $actual['required'], 'required' );
        $this->assertEquals( $expected['errors'], $actual['errors'], 'errors' );
        $this->assertSame( $expected['calc_error'], $actual['calc_error'], 'calc_error' );
        $this->assertCloseOrNull( $expected['total'], $actual['total'], 'total' );
        $this->assertSame(
            array_column( $expected['breakdown'], 'key' ),
            array_column( $actual['breakdown'], 'key' ),
            'breakdown keys'
        );

        foreach ( $expected['breakdown'] as $index => $row ) {
            $this->assertCloseOrNull( $row['amount'], $actual['breakdown'][ $index ]['amount'], 'breakdown ' . $row['key'] );
        }
    }

    /**
     * @param mixed $expected
     * @param mixed $actual
     */
    private function assertCloseOrNull( $expected, $actual, string $what ): void
    {
        if ( null === $expected ) {
            $this->assertNull( $actual, $what );

            return;
        }

        $this->assertEqualsWithDelta( (float) $expected, $actual, 1e-9, $what );
    }
}
