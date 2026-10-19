<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryPresenter;
use Quoteform\Entries\EntryRepository;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

final class EntryPresenterTest extends WP_UnitTestCase
{
    use SeedsEntries;

    /** @var array<string, string> */
    private $savedNumberFormat = [];

    protected function setUp(): void
    {
        parent::setUp();
        EntriesTable::drop();
        EntriesTable::install();
        update_option( 'timezone_string', 'Asia/Baku' );
        update_option( 'date_format', 'F j, Y' );
        update_option( 'time_format', 'g:i a' );

        global $wp_locale;
        $this->savedNumberFormat = $wp_locale->number_format;
    }

    protected function tearDown(): void
    {
        global $wp_locale;
        $wp_locale->number_format = $this->savedNumberFormat;
        parent::tearDown();
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function stored( array $overrides = [] ): array
    {
        return ( new EntryRepository() )->find( $this->seedEntry( $overrides ) );
    }

    public function testAListItemCarriesWhatTheTableShows(): void
    {
        $entry = $this->stored( [ 'form_id' => 7, 'total' => 180.0, 'created_at' => '2026-09-24 21:30:00' ] );
        $item  = ( new EntryPresenter() )->listItem( $entry, [ 7 => 'Cleaning quote' ] );

        $this->assertSame( $entry['id'], $item['id'] );
        $this->assertSame( 7, $item['form_id'] );
        $this->assertSame( 'Cleaning quote', $item['form_title'] );
        $this->assertFalse( $item['is_read'] );
        $this->assertSame( 'Jane Doe', $item['name'] );
        $this->assertSame( 'jane@example.com', $item['email'] );
        $this->assertSame( '180.0000', $item['total'] );
        $this->assertSame( '$180.00', $item['total_display'] );
        $this->assertSame( 'September 25, 2026 1:30 am', $item['date']['display'] );
        $this->assertStringStartsWith( '2026-09-25 01:30:00', $item['date']['full'] );
        $this->assertSame( '2026-09-24T21:30:00Z', $item['date']['iso'] );
    }

    public function testAMissingOrUntitledFormIsNamedHonestly(): void
    {
        $presenter = new EntryPresenter();

        $this->assertNull( $presenter->formTitle( 7, [] ) );
        $this->assertSame( 'Form #7', $presenter->formTitle( 7, [ 7 => '' ] ) );
    }

    public function testAFailedCalculationHasNoTotal(): void
    {
        $item = ( new EntryPresenter() )->listItem( $this->stored( [ 'total' => null ] ), [] );

        $this->assertNull( $item['total'] );
        $this->assertSame( '', $item['total_display'] );
    }

    public function testMoneyUsesTheEntrysOwnFormatAndTheSitesSeparators(): void
    {
        global $wp_locale;
        $wp_locale->number_format = [ 'thousands_sep' => '.', 'decimal_point' => ',' ];

        $entry = $this->stored( [
            'total'     => 1234.5,
            'currency'  => 'EUR',
            'breakdown' => [ 'currency' => 'EUR', 'position' => 'after', 'decimals' => 2, 'lines' => [ [ 'key' => 'base', 'label' => 'Base', 'amount' => 1234.5 ] ], 'error' => null ],
        ] );
        $detail = ( new EntryPresenter() )->detail( $entry, [] );

        $this->assertSame( '1.234,50 €', $detail['total_display'] );
        $this->assertSame( [ [ 'key' => 'base', 'label' => 'Base', 'amount_display' => '1.234,50 €' ] ], $detail['breakdown']['lines'] );
    }

    public function testNameAndEmailSkipEmptyAnswers(): void
    {
        $entry = $this->stored( [
            'data' => [
                'company' => [ 'label' => 'Company', 'type' => 'text', 'value' => '' ],
                'name'    => [ 'label' => 'Name', 'type' => 'text', 'value' => 'Leyla' ],
                'work'    => [ 'label' => 'Work email', 'type' => 'email', 'value' => '' ],
                'home'    => [ 'label' => 'Home email', 'type' => 'email', 'value' => 'leyla@example.com' ],
            ],
        ] );
        $item = ( new EntryPresenter() )->listItem( $entry, [] );

        $this->assertSame( 'Leyla', $item['name'] );
        $this->assertSame( 'leyla@example.com', $item['email'] );
    }

    public function testNoTextOrEmailFieldMeansEmptyStrings(): void
    {
        $item = ( new EntryPresenter() )->listItem( $this->stored( [ 'data' => [ 'rooms' => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3.0 ] ] ] ), [] );

        $this->assertSame( '', $item['name'] );
        $this->assertSame( '', $item['email'] );
    }

    public function testAnswersAreReadyToShowAndStayRaw(): void
    {
        $entry = $this->stored( [
            'data' => [
                'name'   => [ 'label' => 'Name', 'type' => 'text', 'value' => '<b>Jane</b> & "Co"' ],
                'notes'  => [ 'label' => 'Notes', 'type' => 'textarea', 'value' => "Line one\nLine two" ],
                'rooms'  => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3.0 ],
                'area'   => [ 'label' => 'Area', 'type' => 'slider', 'value' => 2.5 ],
                'empty'  => [ 'label' => 'Phone', 'type' => 'tel', 'value' => '' ],
                'plan'   => [ 'label' => 'Plan', 'type' => 'radio', 'value' => 'deep', 'display' => 'Deep clean' ],
                'extras' => [ 'label' => 'Extras', 'type' => 'checkbox', 'value' => [ 'oven', 'fridge' ], 'display' => [ 'Oven', '' ] ],
                'agree'  => [ 'label' => 'Agree', 'type' => 'toggle', 'value' => 1 ],
                'news'   => [ 'label' => 'News', 'type' => 'toggle', 'value' => 0 ],
                'source' => [ 'label' => '', 'type' => 'hidden', 'value' => 'google' ],
            ],
        ] );

        $this->assertSame(
            [
                [ 'key' => 'name', 'label' => 'Name', 'type' => 'text', 'display' => '<b>Jane</b> & "Co"' ],
                [ 'key' => 'notes', 'label' => 'Notes', 'type' => 'textarea', 'display' => "Line one\nLine two" ],
                [ 'key' => 'rooms', 'label' => 'Rooms', 'type' => 'number', 'display' => '3' ],
                [ 'key' => 'area', 'label' => 'Area', 'type' => 'slider', 'display' => '2.5' ],
                [ 'key' => 'empty', 'label' => 'Phone', 'type' => 'tel', 'display' => '' ],
                [ 'key' => 'plan', 'label' => 'Plan', 'type' => 'radio', 'display' => 'Deep clean' ],
                [ 'key' => 'extras', 'label' => 'Extras', 'type' => 'checkbox', 'display' => 'Oven, fridge' ],
                [ 'key' => 'agree', 'label' => 'Agree', 'type' => 'toggle', 'display' => 'Yes' ],
                [ 'key' => 'news', 'label' => 'News', 'type' => 'toggle', 'display' => 'No' ],
                [ 'key' => 'source', 'label' => '', 'type' => 'hidden', 'display' => 'google' ],
            ],
            ( new EntryPresenter() )->answers( $entry )
        );
    }

    public function testTheBreakdownErrorAndMissingAmountsComeThrough(): void
    {
        $entry = $this->stored( [
            'total'     => null,
            'breakdown' => [ 'currency' => 'USD', 'position' => 'before', 'decimals' => 2, 'lines' => [ [ 'key' => 'base', 'label' => 'Base', 'amount' => null ] ], 'error' => 'division_by_zero' ],
        ] );
        $detail = ( new EntryPresenter() )->detail( $entry, [] );

        $this->assertSame( 'division_by_zero', $detail['breakdown']['error'] );
        $this->assertSame( '', $detail['breakdown']['lines'][0]['amount_display'] );
    }

    public function testDetailsNameTheIpBrowserAndUser(): void
    {
        $admin  = self::factory()->user->create( [ 'role' => 'administrator' ] );
        $sender = self::factory()->user->create( [ 'display_name' => 'Sam Sender' ] );
        wp_set_current_user( $admin );

        $entry   = $this->stored( [ 'ip' => inet_pton( '2001:db8::1' ), 'user_id' => $sender, 'user_agent' => 'Firefox/130' ] );
        $details = ( new EntryPresenter() )->detail( $entry, [] )['details'];

        $this->assertSame( '2001:db8::1', $details['ip'] );
        $this->assertSame( 'Firefox/130', $details['user_agent'] );
        $this->assertSame( 'Sam Sender', $details['user']['name'] );
        $this->assertStringContainsString( 'user_id=' . $sender, (string) $details['user']['url'] );
        $this->assertSame( $entry['created_at'], gmdate( 'Y-m-d H:i:s', strtotime( $details['submitted']['iso'] ) ) );
    }

    public function testADeletedUserAndAMissingIpAreSaidPlainly(): void
    {
        $editor = self::factory()->user->create( [ 'role' => 'editor' ] );
        wp_set_current_user( $editor );

        $details = ( new EntryPresenter() )->detail( $this->stored( [ 'user_id' => 987654 ] ), [] )['details'];

        $this->assertNull( $details['ip'] );
        $this->assertSame( [ 'id' => 987654, 'name' => 'Deleted user #987654', 'url' => null ], $details['user'] );
    }

    public function testNoUserMeansNoUserRow(): void
    {
        $this->assertNull( ( new EntryPresenter() )->detail( $this->stored(), [] )['details']['user'] );
    }

    public function testCsvDatesUseTheSiteTimezone(): void
    {
        $this->assertSame( '2026-09-25 01:30:00', ( new EntryPresenter() )->csvDate( '2026-09-24 21:30:00' ) );
    }
}
