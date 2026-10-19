<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\RuleValidator;

final class RuleValidatorTest extends TestCase
{
    /**
     * @return array<int, array<string, mixed>>
     */
    private function rules(): array
    {
        return [
            [
                'target'     => [ 'kind' => 'field', 'key' => 'express_note' ],
                'action'     => 'show',
                'match'      => 'all',
                'conditions' => [
                    [ 'field' => 'urgency', 'operator' => 'equals', 'value' => 'express' ],
                ],
            ],
        ];
    }

    /**
     * @param mixed $rules
     * @return string[]
     */
    private function codesFor( $rules ): array
    {
        return array_column( $this->errorsFor( $rules ), 'code' );
    }

    /**
     * @param mixed $rules
     * @return array<int, array{path: string, code: string, message: string, context: array<string, mixed>}>
     */
    private function errorsFor( $rules ): array
    {
        $result = ( new RuleValidator() )->validate(
            $rules,
            [ 'urgency', 'express_note', 'room_count' ],
            [ 'step_property', 'step_timing' ]
        );

        return $result->getErrors();
    }

    public function testTheTenOperatorsAreSupported(): void
    {
        $this->assertSame(
            [
                'equals', 'not_equals', 'greater', 'greater_or_equal', 'less',
                'less_or_equal', 'contains', 'not_contains', 'is_empty', 'is_not_empty',
            ],
            RuleValidator::operators()
        );
    }

    public function testValidRulesPass(): void
    {
        $this->assertSame( [], $this->codesFor( $this->rules() ) );
    }

    public function testAnEmptyRuleListIsFine(): void
    {
        $this->assertSame( [], $this->codesFor( [] ) );
    }

    public function testRulesMustBeAList(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( 'nope' ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'a' => [] ] ) );
    }

    public function testANonArrayRuleElementIsInvalidType(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ null ] ) );
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( [ 'x' ] ) );
    }

    public function testEachRuleNeedsAllFourKeys(): void
    {
        $rules = $this->rules();
        unset( $rules[0]['match'] );

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $rules ) );
    }

    public function testUnknownKeyIsRejected(): void
    {
        $rules = $this->rules();
        $rules[0]['colour'] = 'blue';

        $this->assertSame( [ 'unknown_key' ], $this->codesFor( $rules ) );
    }

    public function testTargetKindIsRestricted(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['kind'] = 'planet';

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testTargetFieldMustExist(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['key'] = 'ghost';

        $this->assertSame( [ 'unknown_reference' ], $this->codesFor( $rules ) );
    }

    public function testTargetStepMustExist(): void
    {
        $rules = $this->rules();
        $rules[0]['target'] = [ 'kind' => 'step', 'key' => 'ghost_step' ];

        $this->assertSame( [ 'unknown_reference' ], $this->codesFor( $rules ) );
    }

    public function testAStepTargetIsAcceptedWhenItExists(): void
    {
        $rules = $this->rules();
        $rules[0]['target'] = [ 'kind' => 'step', 'key' => 'step_timing' ];

        $this->assertSame( [], $this->codesFor( $rules ) );
    }

    public function testActionIsRestricted(): void
    {
        $rules = $this->rules();
        $rules[0]['action'] = 'explode';

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testRequireActionIsRejectedForAStepTarget(): void
    {
        $rules = $this->rules();
        $rules[0]['target'] = [ 'kind' => 'step', 'key' => 'step_timing' ];
        $rules[0]['action'] = 'require';

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testOptionalActionIsRejectedForAStepTarget(): void
    {
        $rules = $this->rules();
        $rules[0]['target'] = [ 'kind' => 'step', 'key' => 'step_timing' ];
        $rules[0]['action'] = 'optional';

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testMatchIsRestricted(): void
    {
        $rules = $this->rules();
        $rules[0]['match'] = 'some';

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testConditionsCannotBeEmpty(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = [];

        $this->assertSame( [ 'empty_collection' ], $this->codesFor( $rules ) );
    }

    public function testConditionsGivenAsAMapIsInvalidType(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = [ 'a' => [ 'field' => 'urgency', 'operator' => 'equals', 'value' => 'express' ] ];

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $rules ) );
    }

    public function testConditionsGivenAsAStringIsInvalidType(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = 'nope';

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $rules ) );
    }

    public function testConditionFieldMustExist(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][0]['field'] = 'ghost';

        $this->assertSame( [ 'unknown_reference' ], $this->codesFor( $rules ) );
    }

    public function testConditionOperatorIsRestricted(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][0]['operator'] = 'sorta_equals';

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testEmptinessOperatorsDoNotNeedAValue(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = [ [ 'field' => 'urgency', 'operator' => 'is_empty' ] ];

        $this->assertSame( [], $this->codesFor( $rules ) );
    }

    public function testOtherOperatorsRequireAValue(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = [ [ 'field' => 'urgency', 'operator' => 'equals' ] ];

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $rules ) );
    }

    public function testValueNullIsAcceptedAsPresent(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][0]['value'] = null;

        $this->assertSame( [], $this->codesFor( $rules ) );
    }

    public function testARuleCannotTargetAFieldItAlsoTestsOn(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['key']          = 'urgency';
        $rules[0]['conditions'][0]['field'] = 'urgency';

        $this->assertSame( [ 'circular_reference' ], $this->codesFor( $rules ) );
    }

    public function testErrorPathPointsAtTheOffendingCondition(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][] = [ 'field' => 'ghost', 'operator' => 'equals', 'value' => 'x' ];

        $result = ( new RuleValidator() )->validate(
            $rules,
            [ 'urgency', 'express_note', 'room_count' ],
            [ 'step_property', 'step_timing' ]
        );

        $this->assertSame( '0.conditions.1.field', $result->getErrors()[0]['path'] );
    }

    // --- Item 1: an absent nested key is missing_field, naming the key ---

    public function testAbsentTargetKindIsMissingFieldNamingTheKey(): void
    {
        $rules = $this->rules();
        unset( $rules[0]['target']['kind'] );

        $errors = $this->errorsFor( $rules );

        $this->assertSame( [ 'missing_field' ], array_column( $errors, 'code' ) );
        $this->assertSame( '0.target.kind', $errors[0]['path'] );
    }

    public function testAbsentTargetKeyIsMissingFieldNamingTheKey(): void
    {
        $rules = $this->rules();
        unset( $rules[0]['target']['key'] );

        $errors = $this->errorsFor( $rules );

        $this->assertSame( [ 'missing_field' ], array_column( $errors, 'code' ) );
        $this->assertSame( '0.target.key', $errors[0]['path'] );
    }

    public function testAbsentConditionFieldIsMissingFieldNamingTheKey(): void
    {
        $rules = $this->rules();
        unset( $rules[0]['conditions'][0]['field'] );

        $errors = $this->errorsFor( $rules );

        $this->assertSame( [ 'missing_field' ], array_column( $errors, 'code' ) );
        $this->assertSame( '0.conditions.0.field', $errors[0]['path'] );
    }

    public function testAbsentConditionOperatorIsMissingFieldNamingTheKey(): void
    {
        $rules = $this->rules();
        unset( $rules[0]['conditions'][0]['operator'] );

        $errors = $this->errorsFor( $rules );

        $this->assertSame( [ 'missing_field' ], array_column( $errors, 'code' ) );
        $this->assertSame( '0.conditions.0.operator', $errors[0]['path'] );
    }

    // A container that is not an array at all is still invalid_type, unchanged by item 1.

    public function testNonArrayTargetStaysInvalidType(): void
    {
        $rules = $this->rules();

        $rules[0]['target'] = null;
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $rules ) );

        $rules[0]['target'] = 'field:express_note';
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $rules ) );
    }

    public function testNonArrayConditionStaysInvalidType(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = [ 'not-a-condition' ];

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $rules ) );
    }

    // --- Item 2: the self-referencing-loop guard gets its own code ---

    public function testSelfLoopIsCircularReferenceDistinctFromAGenuineUnknownField(): void
    {
        $genuineUnknownField = $this->rules();
        $genuineUnknownField[0]['conditions'][0]['field'] = 'ghost';

        $selfLoop = $this->rules();
        $selfLoop[0]['target']['key']          = 'urgency';
        $selfLoop[0]['conditions'][0]['field'] = 'urgency';

        $unknownFieldErrors = $this->errorsFor( $genuineUnknownField );
        $selfLoopErrors     = $this->errorsFor( $selfLoop );

        $this->assertSame( [ 'unknown_reference' ], array_column( $unknownFieldErrors, 'code' ) );
        $this->assertSame( [ 'circular_reference' ], array_column( $selfLoopErrors, 'code' ) );

        $this->assertSame( '0.conditions.0.field', $unknownFieldErrors[0]['path'] );
        $this->assertSame( '0.conditions.0.field', $selfLoopErrors[0]['path'] );

        $this->assertSame( [ 'field' => 'ghost' ], $unknownFieldErrors[0]['context'] );
        $this->assertSame( [ 'field' => 'urgency' ], $selfLoopErrors[0]['context'] );
    }

    // --- Item 3: a bad field and a bad operator in the same condition are both reported ---

    public function testABadFieldAndABadOperatorInTheSameConditionAreBothReported(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][0]['field']    = 'ghost';
        $rules[0]['conditions'][0]['operator'] = 'sorta_equals';

        $this->assertSame( [ 'unknown_reference', 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testASelfLoopFieldAndABadOperatorInTheSameConditionAreBothReported(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['key']             = 'urgency';
        $rules[0]['conditions'][0]['field']     = 'urgency';
        $rules[0]['conditions'][0]['operator']  = 'sorta_equals';

        $this->assertSame( [ 'circular_reference', 'invalid_option' ], $this->codesFor( $rules ) );
    }

    // --- Coverage: already-correct behavior for null/wrong-typed values, confirmed by review ---

    public function testNullTargetKindIsInvalidOption(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['kind'] = null;

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testNullTargetKeyIsUnknownReference(): void
    {
        $rules = $this->rules();
        $rules[0]['target']['key'] = null;

        $errors = $this->errorsFor( $rules );

        $this->assertSame( [ 'unknown_reference' ], array_column( $errors, 'code' ) );
        $this->assertSame( [ 'key' => null ], $errors[0]['context'] );
    }

    public function testNullActionIsInvalidOption(): void
    {
        $rules = $this->rules();
        $rules[0]['action'] = null;

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testNullMatchIsInvalidOption(): void
    {
        $rules = $this->rules();
        $rules[0]['match'] = null;

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }

    public function testNullConditionsIsInvalidType(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'] = null;

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $rules ) );
    }

    public function testNullConditionFieldIsUnknownReferenceAtTheConditionPath(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][0]['field'] = null;

        $errors = $this->errorsFor( $rules );

        $this->assertSame( [ 'unknown_reference' ], array_column( $errors, 'code' ) );
        $this->assertSame( '0.conditions.0.field', $errors[0]['path'] );
        $this->assertSame( [ 'field' => null ], $errors[0]['context'] );
    }

    public function testNullConditionOperatorIsInvalidOption(): void
    {
        $rules = $this->rules();
        $rules[0]['conditions'][0]['operator'] = null;

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $rules ) );
    }
}
