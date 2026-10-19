<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\ValidationResult;

final class ValidationResultTest extends TestCase
{
    public function testAFreshResultIsValid(): void
    {
        $result = new ValidationResult();

        $this->assertTrue( $result->isValid() );
        $this->assertSame( 0, $result->errorCount() );
        $this->assertSame( [], $result->getErrors() );
    }

    public function testAddingAnErrorMakesItInvalid(): void
    {
        $result = new ValidationResult();
        $result->addError( 'fields.a.label', 'missing_field', 'Label is required.' );

        $this->assertFalse( $result->isValid() );
        $this->assertSame( 1, $result->errorCount() );
    }

    public function testErrorCarriesPathCodeMessageAndContext(): void
    {
        $result = new ValidationResult();
        $result->addError( 'settings.decimals', 'out_of_range', 'Too many decimals.', [ 'max' => 6 ] );

        $this->assertSame(
            [
                [
                    'path'    => 'settings.decimals',
                    'code'    => 'out_of_range',
                    'message' => 'Too many decimals.',
                    'context' => [ 'max' => 6 ],
                ],
            ],
            $result->getErrors()
        );
    }

    public function testContextDefaultsToAnEmptyArray(): void
    {
        $result = new ValidationResult();
        $result->addError( 'a', 'invalid_type', 'Bad.' );

        $this->assertSame( [], $result->getErrors()[0]['context'] );
    }

    public function testErrorsKeepInsertionOrder(): void
    {
        $result = new ValidationResult();
        $result->addError( 'b', 'invalid_type', 'Second.' );
        $result->addError( 'a', 'invalid_type', 'First.' );

        $this->assertSame( [ 'b', 'a' ], array_column( $result->getErrors(), 'path' ) );
    }

    public function testMergeAppendsTheOtherResultsErrors(): void
    {
        $first = new ValidationResult();
        $first->addError( 'a', 'invalid_type', 'A.' );

        $second = new ValidationResult();
        $second->addError( 'b', 'invalid_type', 'B.' );

        $first->merge( $second );

        $this->assertSame( [ 'a', 'b' ], array_column( $first->getErrors(), 'path' ) );
    }

    public function testMergeAppliesThePathPrefix(): void
    {
        $outer = new ValidationResult();

        $inner = new ValidationResult();
        $inner->addError( 'min', 'out_of_range', 'Too small.' );

        $outer->merge( $inner, 'fields.room_count' );

        $this->assertSame( 'fields.room_count.min', $outer->getErrors()[0]['path'] );
    }

    public function testMergeWithAnEmptyPrefixLeavesThePathAlone(): void
    {
        $outer = new ValidationResult();

        $inner = new ValidationResult();
        $inner->addError( 'min', 'out_of_range', 'Too small.' );

        $outer->merge( $inner, '' );

        $this->assertSame( 'min', $outer->getErrors()[0]['path'] );
    }

    public function testMergeWithAnEmptyChildPathUsesThePrefixAlone(): void
    {
        $outer = new ValidationResult();

        $inner = new ValidationResult();
        $inner->addError( '', 'empty_collection', 'No calculations.' );

        $outer->merge( $inner, 'calculations' );

        $this->assertSame( 'calculations', $outer->getErrors()[0]['path'] );
    }

    public function testMergingAValidResultChangesNothing(): void
    {
        $outer = new ValidationResult();
        $outer->merge( new ValidationResult(), 'fields' );

        $this->assertTrue( $outer->isValid() );
    }

    public function testHasErrorAtFindsAnExactPath(): void
    {
        $result = new ValidationResult();
        $result->addError( 'fields.a.label', 'missing_field', 'Label is required.' );

        $this->assertTrue( $result->hasErrorAt( 'fields.a.label' ) );
        $this->assertFalse( $result->hasErrorAt( 'fields.a' ) );
    }
}
