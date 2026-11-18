<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Notifications\AdminNotifier;
use WP_UnitTestCase;

final class AdminNotifierTest extends WP_UnitTestCase
{
    /** @var array<int,array<string,mixed>> */
    private array $sent = [];

    /** @var bool */
    private $mailResult = true;

    protected function setUp(): void
    {
        parent::setUp();
        $this->sent       = [];
        $this->mailResult = true;
        delete_option( AdminNotifier::FAILURE_OPTION );
        add_filter( 'pre_wp_mail', [ $this, 'captureMail' ], 10, 2 );
    }

    protected function tearDown(): void
    {
        remove_filter( 'pre_wp_mail', [ $this, 'captureMail' ], 10 );
        delete_option( AdminNotifier::FAILURE_OPTION );
        parent::tearDown();
    }

    /**
     * @param mixed                $null
     * @param array<string,mixed> $atts
     */
    public function captureMail( $null, $atts )
    {
        $this->sent[] = $atts;

        return $this->mailResult;
    }

    private function defaultSnapshot(): array
    {
        return [
            'rooms'   => [ 'label' => 'Rooms', 'type' => 'number', 'value' => 3 ],
            'service' => [ 'label' => 'Service', 'type' => 'radio', 'value' => 'deep', 'display' => 'Deep' ],
            'email'   => [ 'label' => 'Email', 'type' => 'email', 'value' => 'v@x.co' ],
        ];
    }

    private function notify( array $notification, ?array $snapshot = null, ?float $total = 120.0, string $formName = 'Quote' ): void
    {
        $schema = [
            'settings'      => [ 'currency' => 'USD', 'currency_position' => 'before', 'decimals' => 2 ],
            'notifications' => [ array_merge( [ 'type' => 'admin', 'enabled' => true, 'to' => '', 'subject' => '' ], $notification ) ],
        ];

        ( new AdminNotifier() )->notify( 41, $formName, $schema, $snapshot ?? $this->defaultSnapshot(), $total, [
            [ 'key' => 'base', 'label' => 'Base price', 'amount' => 100.0 ],
            [ 'key' => 'skip', 'label' => 'Hidden line', 'amount' => null ],
        ] );
    }

    private function recipients(): array
    {
        return (array) $this->sent[0]['to'];
    }

    public function testADisabledNotificationSendsNothing(): void
    {
        $this->notify( [ 'enabled' => false ] );
        $this->assertSame( [], $this->sent );
    }

    public function testAFormWithoutAnAdminNotificationSendsNothing(): void
    {
        ( new AdminNotifier() )->notify( 41, 'Quote', [ 'settings' => [], 'notifications' => [] ], $this->defaultSnapshot(), 1.0, [] );
        $this->assertSame( [], $this->sent );
    }

    public function testAnEmptyRecipientGoesToTheSiteEmail(): void
    {
        $this->notify( [ 'to' => '' ] );
        $this->assertSame( [ get_option( 'admin_email' ) ], $this->recipients() );
    }

    public function testSeveralRecipientsAreSplit(): void
    {
        $this->notify( [ 'to' => 'a@b.co, c@d.co' ] );
        $this->assertSame( [ 'a@b.co', 'c@d.co' ], $this->recipients() );
    }

    public function testInvalidStoredRecipientsFallBackToTheSiteEmail(): void
    {
        $this->notify( [ 'to' => 'nope, also-nope' ] );
        $this->assertSame( [ get_option( 'admin_email' ) ], $this->recipients() );
    }

    public function testTheSubjectPlaceholdersAreReplaced(): void
    {
        $this->notify( [ 'subject' => '{form_name} #{entry_id}: {total}' ] );
        $this->assertSame( 'Quote #41: $120.00', $this->sent[0]['subject'] );
    }

    public function testALineBreakInAStoredSubjectNeverReachesTheHeader(): void
    {
        $this->notify( [ 'subject' => "Hi\r\nBcc: z@z.z {form_name}" ], null, 120.0, "Na\r\nme" );
        $this->assertStringNotContainsString( "\r", $this->sent[0]['subject'] );
        $this->assertStringNotContainsString( "\n", $this->sent[0]['subject'] );
    }

    public function testANullTotalIsShownAsADash(): void
    {
        $this->notify( [ 'subject' => 'Total {total}' ], null, null );
        $this->assertCount( 1, $this->sent );
        $this->assertStringContainsString( '—', $this->sent[0]['subject'] );
    }

    public function testAnEmptySubjectUsesTheDefault(): void
    {
        $this->notify( [ 'subject' => '  ' ] );
        $this->assertSame( 'New quote: Quote', $this->sent[0]['subject'] );
    }

    public function testAnswersAreEscapedInTheBody(): void
    {
        $snapshot = [
            'a' => [ 'label' => 'Note', 'type' => 'text', 'value' => '<script>x</script>' ],
            'b' => [ 'label' => 'Company', 'type' => 'text', 'value' => 'Smith & Sons' ],
        ];
        $this->notify( [], $snapshot );
        $body = $this->sent[0]['message'];
        $this->assertStringContainsString( '&lt;script&gt;', $body );
        $this->assertStringNotContainsString( '<script>', $body );
        $this->assertStringContainsString( 'Smith &amp; Sons', $body );
        $this->assertStringNotContainsString( '&amp;amp;', $body );
    }

    public function testChoiceLabelsAreShownNotValues(): void
    {
        $this->notify( [] );
        $this->assertStringContainsString( 'Deep', $this->sent[0]['message'] );
        $this->assertStringNotContainsString( '>deep<', $this->sent[0]['message'] );
    }

    public function testArraysAndBooleansAreReadable(): void
    {
        $snapshot = [
            'a' => [ 'label' => 'Extras', 'type' => 'checkbox', 'value' => [ 'x', 'y' ], 'display' => [ 'Ex', 'Why' ] ],
            'b' => [ 'label' => 'Agree', 'type' => 'checkbox', 'value' => true ],
        ];
        $this->notify( [], $snapshot );
        $this->assertStringContainsString( 'Ex, Why', $this->sent[0]['message'] );
        $this->assertStringContainsString( 'Yes', $this->sent[0]['message'] );
    }

    public function testTheBodyListsBreakdownAndTotal(): void
    {
        $this->notify( [] );
        $body = $this->sent[0]['message'];
        $this->assertStringContainsString( 'Base price', $body );
        $this->assertStringContainsString( '$100.00', $body );
        $this->assertStringNotContainsString( 'Hidden line', $body );
        $this->assertStringContainsString( '$120.00', $body );
    }

    public function testTheBodyLinksToTheEntry(): void
    {
        $this->notify( [] );
        $body = $this->sent[0]['message'];
        $this->assertTrue(
            false !== strpos( $body, 'page=quoteform-entries&#038;entry=41' ) || false !== strpos( $body, 'page=quoteform-entries&amp;entry=41' )
        );
        $this->assertStringContainsString( 'View this entry', $body );
    }

    public function testReplyToIsTheVisitorEmail(): void
    {
        $this->notify( [] );
        $this->assertContains( 'Reply-To: v@x.co', (array) $this->sent[0]['headers'] );
        $this->assertContains( 'Content-Type: text/html; charset=UTF-8', (array) $this->sent[0]['headers'] );
    }

    public function testAnInvalidVisitorEmailIsNotAReplyTo(): void
    {
        $snapshot = [ 'email' => [ 'label' => 'Email', 'type' => 'email', 'value' => "v@x.co\r\nBcc: z@z.z" ] ];
        $this->notify( [], $snapshot );
        $this->assertCount( 1, $this->sent );
        $this->assertStringNotContainsString( 'Reply-To', implode( "\n", (array) $this->sent[0]['headers'] ) );
    }

    public function testAFailedSendIsRecorded(): void
    {
        $this->mailResult = false;
        $this->notify( [] );
        $failure = get_option( AdminNotifier::FAILURE_OPTION );
        $this->assertSame( 41, $failure['entry_id'] );
        $this->assertIsInt( $failure['time'] );
    }

    public function testASuccessfulSendClearsAnOldFailure(): void
    {
        update_option( AdminNotifier::FAILURE_OPTION, [ 'entry_id' => 9, 'time' => 1 ], false );
        $this->notify( [] );
        $this->assertFalse( get_option( AdminNotifier::FAILURE_OPTION ) );
    }
}
