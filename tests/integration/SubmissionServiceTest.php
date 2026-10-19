<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryRepository;
use Quoteform\Forms\FormPostType;
use Quoteform\Forms\SchemaRepository;
use Quoteform\Submissions\SpamGuard;
use Quoteform\Submissions\SubmissionService;
use WP_UnitTestCase;

final class SubmissionServiceTest extends WP_UnitTestCase
{
    private const NOW = 1790000000;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();
    }

    private function schema( array $settings = [] ): array
    {
        return [
            'version'       => 1,
            'settings'      => array_merge(
                [ 'currency' => 'USD', 'currency_position' => 'before', 'decimals' => 2, 'submit_label' => 'Go', 'success_action' => 'message', 'success_message' => 'Thanks!', 'redirect_url' => '', 'save_resume' => false, 'store_ip' => false ],
                $settings
            ),
            'fields'        => [
                'rooms'   => [ 'key' => 'rooms', 'type' => 'number', 'label' => 'Rooms', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => 1, 'min' => 1, 'max' => 10, 'step' => 1 ],
                'service' => [ 'key' => 'service', 'type' => 'radio', 'label' => 'Service', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => 'standard', 'options' => [ [ 'label' => 'Standard', 'value' => 'standard', 'price' => 0 ], [ 'label' => 'Deep', 'value' => 'deep', 'price' => 60 ] ] ],
                'source'  => [ 'key' => 'source', 'type' => 'hidden', 'label' => '', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => 'google' ],
                'email'   => [ 'key' => 'email', 'type' => 'email', 'label' => 'Email', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => '' ],
            ],
            'steps'         => [
                [ 'key' => 'one', 'title' => 'One', 'description' => '', 'fields' => [ 'rooms', 'service', 'source' ] ],
                [ 'key' => 'two', 'title' => 'Two', 'description' => '', 'fields' => [ 'email' ] ],
            ],
            'calculations'  => [
                [ 'key' => 'base', 'label' => 'Rooms', 'expression' => '{rooms} * 40 + {service.price}', 'visible' => true ],
                [ 'key' => 'total', 'label' => 'Total', 'expression' => '{base}', 'visible' => false ],
            ],
            'rules'         => [],
            'notifications' => [],
        ];
    }

    private function form( array $schema, string $status = 'publish' ): int
    {
        $id = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => $status, 'post_title' => 'Quote' ] );
        ( new SchemaRepository() )->save( $id, $schema );

        return $id;
    }

    private function service(): SubmissionService
    {
        $guard = new SpamGuard( 'secret', static function (): int {
            return self::NOW;
        } );

        return new SubmissionService( null, null, $guard, null );
    }

    private function ticket( int $formId, int $age = 10 ): string
    {
        return ( new SpamGuard( 'secret', static function () use ( $age ): int {
            return self::NOW - $age;
        } ) )->issueTicket( $formId );
    }

    private function submit( int $formId, array $values, array $extra = [], array $context = [] ): array
    {
        return $this->service()->submit(
            array_merge( [ 'form_id' => $formId, 'values' => $values, 'hp' => '', 'ticket' => $this->ticket( $formId ) ], $extra ),
            array_merge( [ 'user_id' => 0, 'ip' => '203.0.113.9', 'user_agent' => 'Agent' ], $context )
        );
    }

    private function rows(): array
    {
        global $wpdb;

        return $wpdb->get_results( 'SELECT * FROM ' . EntriesTable::name(), ARRAY_A );
    }

    public function testAGoodSubmissionIsSavedAndPricedByTheServer(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 3, 'service' => 'deep', 'email' => 'a@b', 'source' => 'tampered' ] );

        $this->assertSame( 201, $result['status'] );
        $this->assertSame( 'message', $result['body']['success_action'] );
        $this->assertSame( 'Thanks!', $result['body']['message'] );
        $this->assertSame( '$180.00', $result['body']['total'] );
        $this->assertSame( [ [ 'label' => 'Rooms', 'formatted' => '$180.00' ] ], $result['body']['breakdown'] );

        $rows  = $this->rows();
        $entry = EntryRepository::hydrate( $rows[0] );

        $this->assertCount( 1, $rows );
        $this->assertSame( 'completed', $entry['status'] );
        $this->assertSame( 180.0, $entry['total'] );
        $this->assertSame( [ 'label' => 'Service', 'type' => 'radio', 'value' => 'deep', 'display' => 'Deep' ], $entry['data']['service'] );
        $this->assertSame( 'google', $entry['data']['source']['value'], 'hidden values come from the schema' );
        $this->assertSame( 'USD', $entry['breakdown']['currency'] );
        $this->assertSame( 'Rooms', $entry['breakdown']['lines'][0]['label'] );
        $this->assertNull( $entry['ip'], 'store_ip is off' );
        $this->assertSame( 'Agent', $entry['user_agent'] );
    }

    public function testTheIpIsKeptOnlyWhenTheFormAsksForIt(): void
    {
        $formId = $this->form( $this->schema( [ 'store_ip' => true ] ) );
        $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ] );

        $this->assertSame( '203.0.113.9', inet_ntop( $this->rows()[0]['ip'] ) );
    }

    public function testInvalidAnswersComeBackWithMessagesAndTheirStep(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 11, 'service' => 'standard', 'email' => '' ] );

        $this->assertSame( 422, $result['status'] );
        $this->assertSame( 'qform_invalid_submission', $result['body']['code'] );
        $this->assertSame( 'Enter 10 or less.', $result['body']['errors']['rooms'] );
        $this->assertSame( 'This field is required.', $result['body']['errors']['email'] );
        $this->assertSame( 'one', $result['body']['step'] );
        $this->assertSame( [], $this->rows() );
    }

    public function testTheServerEvaluatesTheSameTextTheBrowserDid(): void
    {
        $schema                     = $this->schema();
        $schema['fields']['coupon'] = [ 'key' => 'coupon', 'type' => 'text', 'label' => 'Coupon', 'help' => '', 'placeholder' => '', 'required' => false, 'default' => '' ];
        $schema['fields']['code']   = [ 'key' => 'code', 'type' => 'text', 'label' => 'Member code', 'help' => '', 'placeholder' => '', 'required' => true, 'default' => '' ];
        $schema['steps'][1]['fields'] = [ 'email', 'coupon', 'code' ];
        $schema['rules']            = [
            [ 'target' => [ 'kind' => 'field', 'key' => 'code' ], 'action' => 'hide', 'match' => 'all', 'conditions' => [ [ 'field' => 'coupon', 'operator' => 'not_equals', 'value' => 'MEMBER' ] ] ],
        ];
        $formId = $this->form( $schema );

        // Brauzer "MEMBER " != "MEMBER" görür və `code`-u gizlədir — server də eyni dəyəri qiymətləndirməlidir.
        $result = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b', 'coupon' => 'MEMBER ' ] );

        $this->assertSame( 201, $result['status'], (string) wp_json_encode( $result['body'] ) );
        $this->assertSame( 'MEMBER ', EntryRepository::hydrate( $this->rows()[0] )['data']['coupon']['value'], 'the snapshot keeps the raw value' );
    }

    public function testATamperedChoiceIsABadRequest(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'free', 'email' => 'a@b' ] );

        $this->assertSame( 400, $result['status'] );
        $this->assertSame( 'qform_bad_request', $result['body']['code'] );
        $this->assertSame( [], $this->rows() );
    }

    public function testSpamLooksLikeSuccessButIsNotSaved(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ], [ 'hp' => 'filled' ] );

        $this->assertSame( 201, $result['status'] );
        $this->assertSame( 'Thanks!', $result['body']['message'] );
        $this->assertNull( $result['body']['total'] );
        $this->assertSame( [], $result['body']['breakdown'] );
        $this->assertSame( [], $this->rows() );
    }

    public function testATooFreshTicketIsSpam(): void
    {
        $formId = $this->form( $this->schema() );
        $result = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ], [ 'ticket' => $this->ticket( $formId, 1 ) ] );

        $this->assertSame( 201, $result['status'] );
        $this->assertSame( [], $this->rows() );
    }

    public function testALongMultibyteUserAgentIsTruncatedByCharacterNotByte(): void
    {
        $formId    = $this->form( $this->schema() );
        $userAgent = str_repeat( 'A', 254 ) . 'ə' . str_repeat( 'B', 20 );
        $result    = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ], [], [ 'user_agent' => $userAgent ] );

        $stored = $this->rows()[0]['user_agent'];

        $this->assertSame( 201, $result['status'] );
        $this->assertTrue( mb_check_encoding( $stored, 'UTF-8' ), 'stored user_agent must be valid UTF-8' );
        $this->assertLessThanOrEqual( 255, mb_strlen( $stored ) );
        $this->assertStringEndsWith( 'ə', $stored );
    }

    public function testAPublishedFormWithNoSavedSchemaUsesTheDefaultSchema(): void
    {
        $formId = self::factory()->post->create( [ 'post_type' => FormPostType::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Quote' ] );
        $result = $this->submit( $formId, [ 'quantity' => 2 ] );

        $this->assertSame( 201, $result['status'] );
    }

    public function testARedirectFormAnswersWithItsUrl(): void
    {
        $formId = $this->form( $this->schema( [ 'success_action' => 'redirect', 'redirect_url' => 'https://example.com/thanks' ] ) );
        $result = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ] );

        $this->assertSame( 201, $result['status'] );
        $this->assertSame( [ 'success_action' => 'redirect', 'redirect_url' => 'https://example.com/thanks' ], $result['body'] );
    }

    public function testACalculationErrorStillSavesTheEntry(): void
    {
        $schema                                   = $this->schema();
        $schema['calculations'][0]['expression'] = '{rooms} / 0';
        $formId                                   = $this->form( $schema );
        $result                                   = $this->submit( $formId, [ 'rooms' => 1, 'service' => 'standard', 'email' => 'a@b' ] );
        $entry                                    = EntryRepository::hydrate( $this->rows()[0] );

        $this->assertSame( 201, $result['status'] );
        $this->assertNull( $result['body']['total'] );
        $this->assertNull( $entry['total'] );
        $this->assertSame( 'division_by_zero', $entry['breakdown']['error'] );
    }

    /**
     * @dataProvider unavailableStatuses
     */
    public function testOnlyPublishedFormsAcceptSubmissions( string $status ): void
    {
        $formId = $this->form( $this->schema(), $status );

        $this->assertSame( 404, $this->submit( $formId, [] )['status'] );
    }

    /** @return array<string, array{0: string}> */
    public function unavailableStatuses(): array
    {
        return [ 'draft' => [ 'draft' ], 'trash' => [ 'trash' ], 'private' => [ 'private' ] ];
    }

    public function testAnUnknownFormIsNotFound(): void
    {
        $this->assertSame( 404, $this->submit( 999999, [] )['status'] );
    }

    public function testAnOtherPostTypeIsNotAForm(): void
    {
        $postId = self::factory()->post->create( [ 'post_status' => 'publish' ] );

        $this->assertFalse( SubmissionService::isPublishedForm( $postId ) );
    }
}
