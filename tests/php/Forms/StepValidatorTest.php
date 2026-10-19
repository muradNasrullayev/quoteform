<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\StepValidator;

final class StepValidatorTest extends TestCase
{
    /**
     * @return array<int, array<string, mixed>>
     */
    private function steps(): array
    {
        return [
            [
                'key'         => 'step_property',
                'title'       => 'Your property',
                'description' => '',
                'fields'      => [ 'room_count', 'bathrooms' ],
            ],
            [
                'key'         => 'step_timing',
                'title'       => 'Timing',
                'description' => '',
                'fields'      => [ 'urgency' ],
            ],
        ];
    }

    /**
     * @return string[]
     */
    private function fieldKeys(): array
    {
        return [ 'room_count', 'bathrooms', 'urgency' ];
    }

    /**
     * @param array<int, mixed> $steps
     * @return string[]
     */
    private function codesFor( $steps, array $fieldKeys = null ): array
    {
        $result = ( new StepValidator() )->validate( $steps, $fieldKeys ?? $this->fieldKeys() );

        return array_column( $result->getErrors(), 'code' );
    }

    public function testValidStepsPass(): void
    {
        $this->assertSame( [], $this->codesFor( $this->steps() ) );
    }

    public function testStepsMustBeAList(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( 'nope' ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'a' => [] ] ) );
    }

    public function testStepsCannotBeEmpty(): void
    {
        $this->assertSame( [ 'empty_collection' ], $this->codesFor( [] ) );
    }

    public function testEachStepNeedsAllFourKeys(): void
    {
        $steps = $this->steps();
        unset( $steps[0]['description'] );

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $steps ) );
    }

    public function testUnknownKeyInAStepIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['colour'] = 'blue';

        $this->assertSame( [ 'unknown_key' ], $this->codesFor( $steps ) );
    }

    public function testStepKeyMustFollowTheKeyRules(): void
    {
        $steps = $this->steps();
        $steps[0]['key'] = '2nd';

        $this->assertSame( [ 'invalid_key_format' ], $this->codesFor( $steps ) );
    }

    public function testStepKeyWithATrailingNewlineIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['key'] = "step_property\n";

        $this->assertSame( [ 'invalid_key_format' ], $this->codesFor( $steps ) );

        $steps = $this->steps();
        $steps[0]['key'] = "step_property\r\n";

        $this->assertSame( [ 'invalid_key_format' ], $this->codesFor( $steps ) );
    }

    public function testStepKeysMustBeUnique(): void
    {
        $steps = $this->steps();
        $steps[1]['key'] = $steps[0]['key'];

        $this->assertSame( [ 'duplicate_key' ], $this->codesFor( $steps ) );
    }

    public function testStepTitleCannotBeEmpty(): void
    {
        $steps = $this->steps();
        $steps[0]['title'] = '   ';

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $steps ) );
    }

    public function testAStepNeedsAtLeastOneField(): void
    {
        $steps = $this->steps();
        $steps[1]['fields'] = [];

        $codes = $this->codesFor( $steps );

        $this->assertContains( 'empty_collection', $codes );
    }

    public function testReferencingAnUnknownFieldIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['fields'][] = 'ghost';

        $codes = $this->codesFor( $steps );

        $this->assertContains( 'unknown_reference', $codes );
    }

    public function testAFieldCannotAppearInTwoSteps(): void
    {
        $steps = $this->steps();
        $steps[1]['fields'][] = 'room_count';

        $this->assertSame( [ 'duplicate_key' ], $this->codesFor( $steps ) );
    }

    public function testAFieldCannotAppearTwiceInOneStep(): void
    {
        $steps = $this->steps();
        $steps[0]['fields'][] = 'room_count';

        $this->assertSame( [ 'duplicate_key' ], $this->codesFor( $steps ) );
    }

    public function testErrorPathsPointAtTheOffendingStep(): void
    {
        $steps = $this->steps();
        $steps[1]['title'] = '';

        $result = ( new StepValidator() )->validate( $steps, $this->fieldKeys() );

        $this->assertSame( '1.title', $result->getErrors()[0]['path'] );
    }

    public function testStepKeyMustBeAString(): void
    {
        $steps = $this->steps();
        $steps[0]['key'] = 123;

        $result = ( new StepValidator() )->validate( $steps, $this->fieldKeys() );

        $this->assertSame( [ 'invalid_type' ], array_column( $result->getErrors(), 'code' ) );
        $this->assertSame( '0.key', $result->getErrors()[0]['path'] );
    }

    public function testStepKeyNullIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['key'] = null;

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $steps ) );
    }

    public function testStepTitleNullIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['title'] = null;

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $steps ) );
    }

    public function testStepFieldsNullIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['fields'] = null;

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $steps ) );
    }

    public function testMissingTitleDoesNotSuppressCrossStepDuplicate(): void
    {
        $steps = $this->steps();
        unset( $steps[0]['title'] );
        $steps[1]['fields'][] = 'room_count';

        $codes = $this->codesFor( $steps );

        $this->assertContains( 'duplicate_key', $codes );
    }

    public function testStepFieldsMustBeASequentialList(): void
    {
        $steps = $this->steps();
        $steps[0]['fields'] = [ 'foo' => 'room_count' ];

        $result = ( new StepValidator() )->validate( $steps, $this->fieldKeys() );

        $this->assertSame( [ 'invalid_type' ], array_column( $result->getErrors(), 'code' ) );
        $this->assertSame( '0.fields', $result->getErrors()[0]['path'] );
    }

    public function testANonArrayStepEntryIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0] = 'not-a-step';

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $steps ) );
    }

    public function testStepFieldsThatIsNotAnArrayIsRejected(): void
    {
        $steps = $this->steps();
        $steps[0]['fields'] = 'not-an-array';

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $steps ) );
    }
}
