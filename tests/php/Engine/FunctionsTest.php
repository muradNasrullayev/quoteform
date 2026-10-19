<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Functions;

final class FunctionsTest extends TestCase
{
    /** @var Functions */
    private $functions;

    protected function setUp(): void
    {
        $this->functions = new Functions();
    }

    public function testKnownFunctionsAreRegistered(): void
    {
        foreach ( [ 'min', 'max', 'round', 'ceil', 'floor', 'abs', 'sum' ] as $name ) {
            $this->assertTrue( $this->functions->has( $name ), $name . ' should be registered' );
        }

        $this->assertFalse( $this->functions->has( 'sqrt' ) );
        $this->assertFalse( $this->functions->has( 'if' ), 'if is handled lazily by the evaluator' );
    }

    public function testRoundsHalfAwayFromZero(): void
    {
        $this->assertSame( 3.0, Functions::roundHalfAwayFromZero( 2.5 ) );
        $this->assertSame( -3.0, Functions::roundHalfAwayFromZero( -2.5 ) );
        $this->assertSame( 1.0, Functions::roundHalfAwayFromZero( 0.5 ) );
        $this->assertSame( 2.0, Functions::roundHalfAwayFromZero( 1.5 ) );
        $this->assertSame( 0.0, Functions::roundHalfAwayFromZero( 0.0 ) );
    }

    public function testCompensatesForFloatRepresentationError(): void
    {
        $this->assertSame( 1.01, Functions::roundHalfAwayFromZero( 1.005, 2 ) );
        $this->assertSame( 2.68, Functions::roundHalfAwayFromZero( 2.675, 2 ) );
        $this->assertSame( 1.15, Functions::roundHalfAwayFromZero( 1.145, 2 ) );
    }

    public function testRoundsToNegativePrecision(): void
    {
        $this->assertSame( 130.0, Functions::roundHalfAwayFromZero( 125.0, -1 ) );
    }

    public function testMinAndMax(): void
    {
        $this->assertSame( 2.0, $this->functions->call( 'min', [ 5.0, 2.0, 9.0 ] ) );
        $this->assertSame( 9.0, $this->functions->call( 'max', [ 5.0, 2.0, 9.0 ] ) );
    }

    public function testCeilFloorAbs(): void
    {
        $this->assertSame( 3.0, $this->functions->call( 'ceil', [ 2.1 ] ) );
        $this->assertSame( 2.0, $this->functions->call( 'floor', [ 2.9 ] ) );
        $this->assertSame( 4.5, $this->functions->call( 'abs', [ -4.5 ] ) );
    }

    public function testSum(): void
    {
        $this->assertSame( 10.0, $this->functions->call( 'sum', [ 1.0, 2.0, 3.0, 4.0 ] ) );
        $this->assertSame( 0.0, $this->functions->call( 'sum', [] ) );
    }

    public function testRoundDefaultsToZeroPrecision(): void
    {
        $this->assertSame( 3.0, $this->functions->call( 'round', [ 2.5 ] ) );
        $this->assertSame( 2.46, $this->functions->call( 'round', [ 2.4567, 2.0 ] ) );
    }

    public function testEmptyArgumentIsTreatedAsZero(): void
    {
        $this->assertSame( 0.0, $this->functions->call( 'abs', [ null ] ) );
        $this->assertSame( 0.0, $this->functions->call( 'min', [ '', 5.0 ] ) );
    }

    public function testWrongArgumentCountThrows(): void
    {
        try {
            $this->functions->call( 'abs', [ 1.0, 2.0 ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'wrong_argument_count', $exception->getCodeSlug() );
        }
    }

    public function testMinWithNoArgumentsThrows(): void
    {
        try {
            $this->functions->call( 'min', [] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'wrong_argument_count', $exception->getCodeSlug() );
        }
    }

    public function testUnknownFunctionThrows(): void
    {
        try {
            $this->functions->call( 'sqrt', [ 4.0 ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'unknown_function', $exception->getCodeSlug() );
        }
    }
}
