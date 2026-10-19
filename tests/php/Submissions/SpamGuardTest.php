<?php

declare(strict_types=1);

namespace Quoteform\Tests\Submissions;

use PHPUnit\Framework\TestCase;
use Quoteform\Submissions\SpamGuard;

final class SpamGuardTest extends TestCase
{
    private function guardAt( int $now ): SpamGuard
    {
        return new SpamGuard( 'secret', static function () use ( $now ): int {
            return $now;
        } );
    }

    private function ticketAt( int $issuedAt, int $formId = 7 ): string
    {
        return $this->guardAt( $issuedAt )->issueTicket( $formId );
    }

    public function testATicketMustBeAtLeastThreeSecondsOld(): void
    {
        $ticket = $this->ticketAt( 1000 );

        $this->assertTrue( $this->guardAt( 1002 )->isSpam( 7, '', $ticket ) );
        $this->assertFalse( $this->guardAt( 1003 )->isSpam( 7, '', $ticket ) );
    }

    public function testATicketExpiresAfterADay(): void
    {
        $ticket = $this->ticketAt( 1000 );

        $this->assertFalse( $this->guardAt( 1000 + 86400 )->isSpam( 7, '', $ticket ) );
        $this->assertTrue( $this->guardAt( 1000 + 86401 )->isSpam( 7, '', $ticket ) );
    }

    public function testATicketBelongsToOneForm(): void
    {
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 8, '', $this->ticketAt( 1000, 7 ) ) );
    }

    public function testATamperedTicketIsSpam(): void
    {
        $ticket = $this->ticketAt( 1000 );
        [ $form, , $mac ] = explode( '.', $ticket );

        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', "{$form}.999.{$mac}" ) );
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', 'garbage' ) );
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', '' ) );
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', null ) );
    }

    public function testATicketFromAnotherSecretIsSpam(): void
    {
        $foreign = ( new SpamGuard( 'other', static function (): int {
            return 1000;
        } ) )->issueTicket( 7 );

        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, '', $foreign ) );
    }

    public function testAFilledHoneypotIsSpam(): void
    {
        $ticket = $this->ticketAt( 1000 );

        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, 'http://spam.example', $ticket ) );
        $this->assertTrue( $this->guardAt( 2000 )->isSpam( 7, [ 'x' ], $ticket ) );
        $this->assertFalse( $this->guardAt( 2000 )->isSpam( 7, '', $ticket ) );
    }
}
