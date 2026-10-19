<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Forms\CorruptSchemaException;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Forms\SchemaValidator;
use WP_UnitTestCase;

final class SchemaRepositoryTest extends WP_UnitTestCase
{
    /** @var SchemaRepository */
    private $repository;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        $this->repository = new SchemaRepository();
    }

    private function createForm(): int
    {
        return (int) wp_insert_post(
            [
                'post_type'   => FormPostType::POST_TYPE,
                'post_title'  => 'Test form',
                'post_status' => 'publish',
            ]
        );
    }

    public function testDefaultsPassValidation(): void
    {
        $result = ( new SchemaValidator() )->validate( SchemaRepository::defaults() );

        $this->assertTrue(
            $result->isValid(),
            'Yeni formanın default sxemi validasiyadan keçməlidir: '
                . wp_json_encode( $result->getErrors() )
        );
    }

    public function testDefaultsUseTheCurrentSchemaVersion(): void
    {
        $this->assertSame( SchemaValidator::CURRENT_VERSION, SchemaRepository::defaults()['version'] );
    }

    public function testFindReturnsNullForAFormWithoutASchema(): void
    {
        $this->assertNull( $this->repository->find( $this->createForm() ) );
    }

    public function testFindReturnsNullForAMissingPost(): void
    {
        $this->assertNull( $this->repository->find( 999999 ) );
    }

    public function testSaveThenFindRoundTripsTheSchema(): void
    {
        $formId = $this->createForm();
        $schema = SchemaRepository::defaults();

        $this->assertTrue( $this->repository->save( $formId, $schema ) );
        $this->assertSame( $schema, $this->repository->find( $formId ) );
    }

    public function testSaveOverwritesAPreviousSchema(): void
    {
        $formId = $this->createForm();

        $first = SchemaRepository::defaults();
        $this->repository->save( $formId, $first );

        $second = SchemaRepository::defaults();
        $second['settings']['currency'] = 'AZN';
        $this->repository->save( $formId, $second );

        $this->assertSame( 'AZN', $this->repository->find( $formId )['settings']['currency'] );
    }

    public function testSaveRejectsAPostOfTheWrongType(): void
    {
        $postId = (int) wp_insert_post( [ 'post_type' => 'post', 'post_title' => 'Blog post' ] );

        $this->assertFalse( $this->repository->save( $postId, SchemaRepository::defaults() ) );
    }

    public function testExistsReflectsWhetherAFormIsThere(): void
    {
        $formId = $this->createForm();

        $this->assertTrue( $this->repository->exists( $formId ) );
        $this->assertFalse( $this->repository->exists( 999999 ) );
    }

    public function testExistsIsFalseForAPostOfTheWrongType(): void
    {
        $postId = (int) wp_insert_post( [ 'post_type' => 'post', 'post_title' => 'Blog post' ] );

        $this->assertFalse( $this->repository->exists( $postId ) );
    }

    public function testNestedStructuresSurviveTheRoundTrip(): void
    {
        $formId = $this->createForm();
        $schema = SchemaRepository::defaults();

        $schema['rules'] = [
            [
                'target'     => [ 'kind' => 'field', 'key' => 'quantity' ],
                'action'     => 'show',
                'match'      => 'all',
                'conditions' => [ [ 'field' => 'quantity', 'operator' => 'greater', 'value' => 5 ] ],
            ],
        ];

        $this->repository->save( $formId, $schema );

        $this->assertSame( $schema['rules'], $this->repository->find( $formId )['rules'] );
    }

    public function testBooleanAndNumericTypesSurviveTheRoundTrip(): void
    {
        $formId = $this->createForm();
        $schema = SchemaRepository::defaults();

        $this->repository->save( $formId, $schema );
        $loaded = $this->repository->find( $formId );

        $this->assertIsBool( $loaded['settings']['save_resume'] );
        $this->assertIsInt( $loaded['settings']['decimals'] );
        $this->assertIsBool( $loaded['calculations'][0]['visible'] );
    }

    public function testSchemaWithBackslashesRoundTripsByteIdentically(): void
    {
        $formId = $this->createForm();
        $schema = SchemaRepository::defaults();

        $schema['settings']['success_message']     = 'Save 50\\% now — path C:\\Users\\bookings';
        $schema['fields']['quantity']['help']       = 'Pattern: ^\\d+\\.\\d{2}$';
        $schema['fields']['quantity']['placeholder'] = 'a\\b';

        $this->repository->save( $formId, $schema );

        $this->assertSame( $schema, $this->repository->find( $formId ) );
    }

    public function testSavingTheSameSchemaTwiceStillReportsSuccess(): void
    {
        $formId = $this->createForm();
        $schema = SchemaRepository::defaults();

        $this->assertTrue( $this->repository->save( $formId, $schema ) );
        $this->assertTrue( $this->repository->save( $formId, $schema ) );
    }

    public function testFindReturnsAnEmptyArrayWhenTheStoredSchemaIsEmpty(): void
    {
        $formId = $this->createForm();
        update_post_meta( $formId, FormPostType::META_SCHEMA, [] );

        $this->assertSame( [], $this->repository->find( $formId ) );
    }

    /**
     * A non-array meta value (truncated `maybe_unserialize()`, a bad migration,
     * a third-party meta write, a partially-failed update) is a distinct state
     * from "no schema stored": the absent case legitimately returns `null` and
     * defaults are correct there (`testFindReturnsNullForAFormWithoutASchema()`),
     * but a corrupt value must not be silently treated as absent — doing so
     * would let a caller serve `SchemaRepository::defaults()` over a still-
     * recoverable stored value.
     *
     * @dataProvider corruptSchemaValues
     * @param mixed $corrupt
     */
    public function testFindThrowsForACorruptNonArraySchema( $corrupt ): void
    {
        $formId = $this->createForm();
        update_post_meta( $formId, FormPostType::META_SCHEMA, $corrupt );

        $this->expectException( CorruptSchemaException::class );

        $this->repository->find( $formId );
    }

    /**
     * @return array<string, array{0: mixed}>
     */
    public function corruptSchemaValues(): array
    {
        return [
            'sətir'   => [ 'not-an-array' ],
            'tam ədəd' => [ 42 ],
            'boolean' => [ true ],
        ];
    }

    public function testFindThrowingForACorruptSchemaDoesNotAffectTheAbsentCase(): void
    {
        // A form that has never had a schema written still yields `null`, not
        // an exception — corruption is only signalled for a meta row that
        // actually exists and holds a non-array value.
        $this->assertNull( $this->repository->find( $this->createForm() ) );
    }

    public function testLoadedSchemaStillPassesValidationAfterRoundTrip(): void
    {
        $formId = $this->createForm();
        $this->repository->save( $formId, SchemaRepository::defaults() );

        $result = ( new SchemaValidator() )->validate( $this->repository->find( $formId ) );

        $this->assertTrue(
            $result->isValid(),
            'Bazadan yenidən oxunan sxem validasiyadan keçməlidir: '
                . wp_json_encode( $result->getErrors() )
        );
    }

    public function testSaveReturnsFalseForANonExistentFormId(): void
    {
        $this->assertFalse( $this->repository->save( 999999, SchemaRepository::defaults() ) );
    }

    public function testSaveReturnsFalseForFormIdZero(): void
    {
        $this->assertFalse( $this->repository->save( 0, SchemaRepository::defaults() ) );
    }

    public function testSaveReturnsFalseForANegativeFormId(): void
    {
        $this->assertFalse( $this->repository->save( -5, SchemaRepository::defaults() ) );
    }

    public function testSaveReturnsFalseForFormIdZeroEvenWithAGlobalQuoteformPost(): void
    {
        $formId          = $this->createForm();
        $GLOBALS['post'] = get_post( $formId );

        $result = $this->repository->save( 0, SchemaRepository::defaults() );

        unset( $GLOBALS['post'] );

        $this->assertFalse( $result );
    }

    public function testExistsIsFalseForFormIdZeroWithAGlobalQuoteformPost(): void
    {
        $formId           = $this->createForm();
        $GLOBALS['post']  = get_post( $formId );

        $result = $this->repository->exists( 0 );

        unset( $GLOBALS['post'] );

        $this->assertFalse( $result );
    }

    public function testExistsIsFalseForFormIdZeroWithNoGlobalPost(): void
    {
        unset( $GLOBALS['post'] );

        $this->assertFalse( $this->repository->exists( 0 ) );
    }

    public function testFindReturnsNullForFormIdZeroEvenWithAGlobalQuoteformPost(): void
    {
        $formId          = $this->createForm();
        $GLOBALS['post'] = get_post( $formId );

        $result = $this->repository->find( 0 );

        unset( $GLOBALS['post'] );

        $this->assertNull( $result );
    }

    public function testSaveReturnsFalseWhenTheUnderlyingWriteGenuinelyFails(): void
    {
        $formId = $this->createForm();

        add_filter( 'update_post_metadata', '__return_false' );
        $result = $this->repository->save( $formId, SchemaRepository::defaults() );
        remove_filter( 'update_post_metadata', '__return_false' );

        $this->assertFalse( $result );
        $this->assertNull( $this->repository->find( $formId ) );
    }
}
