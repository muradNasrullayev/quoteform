<?php

declare(strict_types=1);

namespace Quoteform\Tests\Engine;

use PHPUnit\Framework\TestCase;
use Quoteform\Engine\ExpressionException;
use Quoteform\Engine\Values;

final class ValuesTest extends TestCase
{
    public function testEmptyValuesBecomeZero(): void
    {
        $this->assertSame( 0.0, Values::toNumber( null ) );
        $this->assertSame( 0.0, Values::toNumber( '' ) );
    }

    public function testBooleansBecomeOneAndZero(): void
    {
        $this->assertSame( 1.0, Values::toNumber( true ) );
        $this->assertSame( 0.0, Values::toNumber( false ) );
    }

    public function testNumericStringsConvert(): void
    {
        $this->assertSame( 12.5, Values::toNumber( '12.5' ) );
        $this->assertSame( -3.0, Values::toNumber( '-3' ) );
    }

    public function testWhitespacePaddedNumberIsNotNumeric(): void
    {
        try {
            Values::toNumber( ' 12' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'type_error', $exception->getCodeSlug() );
        }
    }

    public function testNonNumericStringThrowsTypeError(): void
    {
        try {
            Values::toNumber( 'express' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'type_error', $exception->getCodeSlug() );
        }
    }

    public function testArrayThrowsTypeError(): void
    {
        try {
            Values::toNumber( [ 'a', 'b' ] );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'type_error', $exception->getCodeSlug() );
        }
    }

    public function testTruthiness(): void
    {
        $this->assertFalse( Values::toBool( null ) );
        $this->assertFalse( Values::toBool( '' ) );
        $this->assertFalse( Values::toBool( 0.0 ) );
        $this->assertFalse( Values::toBool( false ) );
        $this->assertFalse( Values::toBool( [] ) );
        $this->assertTrue( Values::toBool( '0' ) );
        $this->assertTrue( Values::toBool( 1.0 ) );
        $this->assertTrue( Values::toBool( [ 'a' ] ) );
    }

    public function testEqualityIsTypeStrict(): void
    {
        $this->assertFalse( Values::equals( '5', 5.0 ) );
        $this->assertTrue( Values::equals( 5.0, 5.0 ) );
        $this->assertTrue( Values::equals( 'express', 'express' ) );
        $this->assertFalse( Values::equals( true, 1.0 ) );
    }

    public function testEmptyEqualsEmptyString(): void
    {
        $this->assertTrue( Values::equals( null, '' ) );
    }

    public function testNumericComparison(): void
    {
        $this->assertSame( 1, Values::compare( 5.0, 2.0 ) );
        $this->assertSame( -1, Values::compare( 2.0, 5.0 ) );
        $this->assertSame( 0, Values::compare( 5.0, 5.0 ) );
    }

    public function testNumericStringComparesNumerically(): void
    {
        $this->assertSame( 1, Values::compare( 10.0, '9' ) );
    }

    public function testStringComparisonIsLexicographic(): void
    {
        $this->assertSame( 1, Values::compare( '2026-03-01', '2026-01-01' ) );
    }

    public function testMixedTypeComparisonThrows(): void
    {
        try {
            Values::compare( 5.0, 'express' );
            $this->fail( 'Expected ExpressionException.' );
        } catch ( ExpressionException $exception ) {
            $this->assertSame( 'type_error', $exception->getCodeSlug() );
        }
    }
}
