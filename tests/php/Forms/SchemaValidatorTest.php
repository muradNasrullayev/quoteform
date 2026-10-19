<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\SchemaValidator;

final class SchemaValidatorTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private function schema(): array
    {
        return [
            'version'  => 1,
            'settings' => [
                'currency'          => 'USD',
                'currency_position' => 'before',
                'decimals'          => 2,
                'submit_label'      => 'Get my quote',
                'success_action'    => 'message',
                'success_message'   => 'Thanks.',
                'redirect_url'      => '',
                'save_resume'       => true,
                'store_ip'          => false,
            ],
            'steps'    => [
                [
                    'key'         => 'step_property',
                    'title'       => 'Your property',
                    'description' => '',
                    'fields'      => [ 'room_count', 'urgency' ],
                ],
            ],
            'fields'   => [
                'room_count' => [
                    'key' => 'room_count', 'type' => 'number', 'label' => 'Rooms',
                    'help' => '', 'placeholder' => '', 'required' => true,
                    'default' => 1, 'min' => 0, 'max' => 20, 'step' => 1,
                ],
                'urgency'    => [
                    'key' => 'urgency', 'type' => 'radio', 'label' => 'How soon?',
                    'help' => '', 'placeholder' => '', 'required' => true, 'default' => 'standard',
                    'options' => [
                        [ 'label' => 'Standard', 'value' => 'standard', 'price' => 0 ],
                        [ 'label' => 'Express', 'value' => 'express', 'price' => 60 ],
                    ],
                ],
            ],
            'calculations' => [
                [
                    'key' => 'total', 'label' => 'Total', 'visible' => true,
                    'expression' => 'round({room_count} * 50 + {urgency.price}, 2)',
                ],
            ],
            'rules'         => [],
            'notifications' => [],
        ];
    }

    /**
     * @param mixed $schema
     * @return string[]
     */
    private function codesFor( $schema ): array
    {
        return array_column( ( new SchemaValidator() )->validate( $schema )->getErrors(), 'code' );
    }

    public function testAValidSchemaPasses(): void
    {
        $this->assertSame( [], $this->codesFor( $this->schema() ) );
    }

    public function testSchemaMustBeAnArray(): void
    {
        $this->assertSame( [ 'invalid_type' ], $this->codesFor( 'nope' ) );
    }

    public function testVersionMustMatchTheCurrentVersion(): void
    {
        $this->assertSame( 1, SchemaValidator::CURRENT_VERSION );

        $schema = $this->schema();
        $schema['version'] = 2;

        $this->assertSame( [ 'invalid_option' ], $this->codesFor( $schema ) );
    }

    public function testVersionMustBeAnInteger(): void
    {
        $schema = $this->schema();
        $schema['version'] = '1';

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $schema ) );
    }

    public function testTopLevelKeysAreRequired(): void
    {
        $schema = $this->schema();
        unset( $schema['rules'] );

        $this->assertSame( [ 'missing_field' ], $this->codesFor( $schema ) );
    }

    public function testUnknownTopLevelKeyIsRejected(): void
    {
        $schema = $this->schema();
        $schema['colour'] = 'blue';

        $this->assertSame( [ 'unknown_key' ], $this->codesFor( $schema ) );
    }

    public function testFieldsMustBeANonEmptyMap(): void
    {
        $schema = $this->schema();
        $schema['fields'] = [];

        $this->assertContains( 'empty_collection', $this->codesFor( $schema ) );
    }

    public function testFieldsMustNotBeAList(): void
    {
        $schema = $this->schema();
        $schema['fields'] = [ $this->schema()['fields']['room_count'] ];

        $this->assertContains( 'invalid_type', $this->codesFor( $schema ) );
    }

    public function testFieldMapKeyMustFollowTheKeyRules(): void
    {
        $schema = $this->schema();
        $field  = $schema['fields']['room_count'];
        unset( $schema['fields']['room_count'] );
        $field['key'] = '2nd';
        $schema['fields']['2nd'] = $field;
        $schema['steps'][0]['fields'] = [ '2nd', 'urgency' ];
        $schema['calculations'][0]['expression'] = 'round({urgency.price}, 2)';

        $this->assertContains( 'invalid_key_format', $this->codesFor( $schema ) );
    }

    public function testFieldAndCalculationKeysCannotCollide(): void
    {
        $schema = $this->schema();
        $schema['calculations'][] = [
            'key' => 'room_count', 'expression' => '1', 'label' => 'Clash', 'visible' => false,
        ];

        $this->assertContains( 'key_collision', $this->codesFor( $schema ) );
    }

    public function testSettingsErrorsArePrefixed(): void
    {
        $schema = $this->schema();
        $schema['settings']['decimals'] = 9;

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertCount( 1, $result->getErrors() );
        $this->assertSame( 'settings.decimals', $result->getErrors()[0]['path'] );
    }

    public function testFieldErrorsArePrefixedWithTheFieldKey(): void
    {
        $schema = $this->schema();
        $schema['fields']['room_count']['label'] = '';

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertCount( 1, $result->getErrors() );
        $this->assertSame( 'fields.room_count.label', $result->getErrors()[0]['path'] );
    }

    public function testStepErrorsArePrefixed(): void
    {
        $schema = $this->schema();
        $schema['steps'][0]['title'] = '';

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertCount( 1, $result->getErrors() );
        $this->assertSame( 'steps.0.title', $result->getErrors()[0]['path'] );
    }

    public function testCalculationErrorsArePrefixed(): void
    {
        $schema = $this->schema();
        $schema['calculations'][0]['expression'] = '{ghost}';

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertCount( 1, $result->getErrors() );
        $this->assertSame( 'calculations.0.expression', $result->getErrors()[0]['path'] );
    }

    public function testRuleErrorsArePrefixed(): void
    {
        $schema = $this->schema();
        $schema['rules'] = [
            [
                'target' => [ 'kind' => 'field', 'key' => 'ghost' ],
                'action' => 'show', 'match' => 'all',
                'conditions' => [ [ 'field' => 'urgency', 'operator' => 'equals', 'value' => 'express' ] ],
            ],
        ];

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertCount( 1, $result->getErrors() );
        $this->assertSame( 'rules.0.target.key', $result->getErrors()[0]['path'] );
    }

    public function testAFieldNotPlacedOnAnyStepIsReported(): void
    {
        $schema = $this->schema();
        $schema['fields']['forgotten'] = [
            'key' => 'forgotten', 'type' => 'text', 'label' => 'Forgotten',
            'help' => '', 'placeholder' => '', 'required' => false, 'default' => '',
        ];

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertCount( 1, $result->getErrors() );
        $this->assertSame( 'unknown_reference', $result->getErrors()[0]['code'] );
        $this->assertSame( 'fields.forgotten', $result->getErrors()[0]['path'] );
    }

    public function testNotificationsMustBeAList(): void
    {
        $schema = $this->schema();
        $schema['notifications'] = 'nope';

        $this->assertContains( 'invalid_type', $this->codesFor( $schema ) );
    }

    public function testABrokenExpressionIsCaughtAtSaveTime(): void
    {
        $schema = $this->schema();
        $schema['calculations'][0]['expression'] = 'round({room_count} * ';

        $this->assertContains( 'invalid_expression', $this->codesFor( $schema ) );
    }

    public function testACircularReferenceIsCaughtAtSaveTime(): void
    {
        $schema = $this->schema();
        $schema['calculations'] = [
            [ 'key' => 'a', 'expression' => '{b}', 'label' => 'A', 'visible' => false ],
            [ 'key' => 'b', 'expression' => '{a}', 'label' => 'B', 'visible' => false ],
            [ 'key' => 'total', 'expression' => '1', 'label' => 'Total', 'visible' => true ],
        ];

        $this->assertContains( 'circular_reference', $this->codesFor( $schema ) );
    }

    public function testARuleTargetingAStepThatTestsAFieldOnThatStepIsCircular(): void
    {
        $schema = $this->schema();
        $schema['steps'][0]['key'] = 'step_timing';
        $schema['steps'][0]['fields'] = [ 'room_count', 'urgency' ];
        $schema['rules'] = [
            [
                'target'     => [ 'kind' => 'step', 'key' => 'step_timing' ],
                'action'     => 'hide',
                'match'      => 'all',
                'conditions' => [ [ 'field' => 'urgency', 'operator' => 'is_empty' ] ],
            ],
        ];

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertSame(
            [
                [
                    'path' => 'rules.0.conditions.0.field',
                    'code' => 'circular_reference',
                ],
            ],
            array_map(
                static function ( array $error ): array {
                    return [ 'path' => $error['path'], 'code' => $error['code'] ];
                },
                $result->getErrors()
            )
        );
        $this->assertSame( 'urgency', $result->getErrors()[0]['context']['field'] );
        $this->assertSame( 'step_timing', $result->getErrors()[0]['context']['step'] );
    }

    public function testABadlyTypedFieldPlacedOnAStepDoesNotReportUnknownReference(): void
    {
        $schema = $this->schema();
        $schema['fields']['room_count']['type'] = null;
        $schema['calculations'][0]['expression'] = 'round({urgency.price}, 2)';

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertFalse( $result->hasErrorAt( 'steps.0.fields.0' ) );

        foreach ( $result->getErrors() as $error ) {
            if ( $error['code'] === 'unknown_reference' ) {
                $this->assertNotSame( 'room_count', $error['context']['field'] ?? null );
            }
        }
    }

    public function testABadlyTypedFieldCollidingWithACalculationKeyIsStillReported(): void
    {
        $schema = $this->schema();
        $schema['fields']['room_count']['type'] = null;
        $schema['calculations'][] = [
            'key' => 'room_count', 'expression' => '1', 'label' => 'Clash', 'visible' => false,
        ];

        $this->assertContains( 'key_collision', $this->codesFor( $schema ) );
    }

    public function testABadlyTypedFieldOnNoStepIsStillReportedAsAnOrphan(): void
    {
        $schema = $this->schema();
        $schema['fields']['forgotten'] = [
            'key' => 'forgotten', 'type' => null, 'label' => 'Forgotten',
            'help' => '', 'placeholder' => '', 'required' => false, 'default' => '',
        ];

        $codes = $this->codesFor( $schema );

        $this->assertContains( 'unknown_reference', $codes );
    }

    public function testNotificationsRejectsAnAssociativeMap(): void
    {
        $schema = $this->schema();
        $schema['notifications'] = [ 'x' => 'junk', 'y' => null ];

        $this->assertSame( [ 'invalid_type' ], $this->codesFor( $schema ) );
    }

    public function testNotificationsAcceptsAProperlyShapedListEvenWithJunkContent(): void
    {
        // Container shape only: a genuine list is accepted even though its
        // elements are junk. Validating notification content is out of scope
        // for this task (no NotificationValidator exists yet).
        $schema = $this->schema();
        $schema['notifications'] = [ 'junk', 123, null ];

        $this->assertSame( [], $this->codesFor( $schema ) );
    }

    public function testStepLoopCheckFiresAtANonZeroRuleIndex(): void
    {
        $schema = $this->schema();
        $schema['steps'][0]['key'] = 'step_timing';
        $schema['steps'][0]['fields'] = [ 'room_count', 'urgency' ];
        $schema['rules'] = [
            [
                'target'     => [ 'kind' => 'field', 'key' => 'room_count' ],
                'action'     => 'show',
                'match'      => 'all',
                'conditions' => [ [ 'field' => 'urgency', 'operator' => 'equals', 'value' => 'express' ] ],
            ],
            [
                'target'     => [ 'kind' => 'step', 'key' => 'step_timing' ],
                'action'     => 'hide',
                'match'      => 'all',
                'conditions' => [ [ 'field' => 'urgency', 'operator' => 'is_empty' ] ],
            ],
        ];

        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertSame(
            [
                [
                    'path' => 'rules.1.conditions.0.field',
                    'code' => 'circular_reference',
                ],
            ],
            array_map(
                static function ( array $error ): array {
                    return [ 'path' => $error['path'], 'code' => $error['code'] ];
                },
                $result->getErrors()
            )
        );
    }

    public function testStepLoopCheckSkipsWhenRulesIsAnAssociativeMap(): void
    {
        $schema = $this->schema();
        $schema['rules'] = [ 'a' => [
            'target'     => [ 'kind' => 'step', 'key' => 'step_property' ],
            'action'     => 'hide',
            'match'      => 'all',
            'conditions' => [ [ 'field' => 'urgency', 'operator' => 'is_empty' ] ],
        ] ];

        $codes = $this->codesFor( $schema );

        $this->assertNotContains( 'circular_reference', $codes );
        $this->assertContains( 'invalid_type', $codes );
    }

    public function testStepLoopCheckSkipsWhenConditionsIsAnAssociativeMap(): void
    {
        $schema = $this->schema();
        $schema['rules'] = [
            [
                'target'     => [ 'kind' => 'step', 'key' => 'step_property' ],
                'action'     => 'hide',
                'match'      => 'all',
                'conditions' => [ 'a' => [ 'field' => 'urgency', 'operator' => 'is_empty' ] ],
            ],
        ];

        $codes = $this->codesFor( $schema );

        $this->assertNotContains( 'circular_reference', $codes );
        $this->assertContains( 'invalid_type', $codes );
    }

    public function testDuplicateStepKeysDoNotSuppressTheLoopCheck(): void
    {
        $schema = $this->schema();
        $schema['steps'] = [
            [
                'key'         => 'dup',
                'title'       => 'First',
                'description' => '',
                'fields'      => [ 'room_count' ],
            ],
            [
                'key'         => 'dup',
                'title'       => 'Second',
                'description' => '',
                'fields'      => [ 'urgency' ],
            ],
        ];
        $schema['rules'] = [
            [
                'target'     => [ 'kind' => 'step', 'key' => 'dup' ],
                'action'     => 'hide',
                'match'      => 'all',
                'conditions' => [ [ 'field' => 'room_count', 'operator' => 'is_empty' ] ],
            ],
        ];

        $this->assertContains( 'circular_reference', $this->codesFor( $schema ) );
    }

    /**
     * @return array<string, array{0: mixed}>
     */
    public function malformedSchemaProvider(): array
    {
        $base = $this->schema();

        $listOfScalars = [ 'a', 1, true, null ];

        return [
            'null schema'                     => [ null ],
            'string schema'                   => [ 'nope' ],
            'int schema'                      => [ 42 ],
            'object schema'                   => [ new \stdClass() ],
            'null version'                    => [ array_merge( $base, [ 'version' => null ] ) ],
            'null settings'                   => [ array_merge( $base, [ 'settings' => null ] ) ],
            'null steps'                      => [ array_merge( $base, [ 'steps' => null ] ) ],
            'null fields'                     => [ array_merge( $base, [ 'fields' => null ] ) ],
            'null calculations'               => [ array_merge( $base, [ 'calculations' => null ] ) ],
            'null rules'                      => [ array_merge( $base, [ 'rules' => null ] ) ],
            'null notifications'              => [ array_merge( $base, [ 'notifications' => null ] ) ],
            'steps as list of scalars'        => [ array_merge( $base, [ 'steps' => $listOfScalars ] ) ],
            'rules as list of scalars'        => [ array_merge( $base, [ 'rules' => $listOfScalars ] ) ],
            'conditions as list of scalars'   => [
                array_merge(
                    $base,
                    [
                        'rules' => [
                            [
                                'target'     => [ 'kind' => 'field', 'key' => 'room_count' ],
                                'action'     => 'show',
                                'match'      => 'all',
                                'conditions' => $listOfScalars,
                            ],
                        ],
                    ]
                ),
            ],
            'field body as object'            => [
                array_merge(
                    $base,
                    [ 'fields' => array_merge( $base['fields'], [ 'room_count' => new \stdClass() ] ) ]
                ),
            ],
            'fields as an associative map where a list is expected (steps.fields)' => [
                (static function () use ( $base ) {
                    $base['steps'][0]['fields'] = [ 'x' => 'room_count' ];

                    return $base;
                } )(),
            ],
            'numeric field map key'           => [
                array_merge( $base, [ 'fields' => [ 0 => $base['fields']['room_count'] ] ] ),
            ],
            'very long field map key'         => [
                array_merge( $base, [ 'fields' => [ str_repeat( 'a', 5000 ) => $base['fields']['room_count'] ] ] ),
            ],
        ];
    }

    /**
     * @dataProvider malformedSchemaProvider
     * @param mixed $schema
     */
    public function testNothingEscapesValidateAsAnUncaughtThrowable( $schema ): void
    {
        $result = ( new SchemaValidator() )->validate( $schema );

        $this->assertInstanceOf( \Quoteform\Forms\ValidationResult::class, $result );
    }

    public function testARuleTargetingAStepNotContainingItsConditionFieldPassesCleanly(): void
    {
        $schema = $this->schema();
        $schema['steps'][0]['key'] = 'step_property';
        $schema['steps'][0]['fields'] = [ 'room_count', 'urgency' ];
        $schema['steps'][] = [
            'key'         => 'step_timing',
            'title'       => 'Timing',
            'description' => '',
            'fields'      => [],
        ];
        $schema['fields']['forgotten'] = [
            'key' => 'forgotten', 'type' => 'text', 'label' => 'Forgotten',
            'help' => '', 'placeholder' => '', 'required' => false, 'default' => '',
        ];
        $schema['steps'][1]['fields'] = [ 'forgotten' ];
        $schema['rules'] = [
            [
                'target'     => [ 'kind' => 'step', 'key' => 'step_timing' ],
                'action'     => 'hide',
                'match'      => 'all',
                'conditions' => [ [ 'field' => 'urgency', 'operator' => 'is_empty' ] ],
            ],
        ];

        $this->assertSame( [], $this->codesFor( $schema ) );
    }
}
