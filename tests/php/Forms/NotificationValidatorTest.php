<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\NotificationValidator;

final class NotificationValidatorTest extends TestCase
{
    /**
     * @return array<string, mixed>
     */
    private function base(): array
    {
        return [ 'type' => 'admin', 'enabled' => true, 'to' => '', 'subject' => 'New quote' ];
    }

    /**
     * @param mixed $list
     * @return array<string, string[]> path => codes
     */
    private function codesAt( $list ): array
    {
        $out = [];

        foreach ( ( new NotificationValidator() )->validate( $list )->getErrors() as $error ) {
            $out[ $error['path'] ][] = $error['code'];
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $override
     * @return array<string, string[]>
     */
    private function codesWith( array $override ): array
    {
        return $this->codesAt( [ array_merge( $this->base(), $override ) ] );
    }

    public function testAnEmptyListIsValid(): void
    {
        $this->assertSame( [], $this->codesAt( [] ) );
    }

    public function testTheDefaultElementIsValid(): void
    {
        $this->assertSame( [], $this->codesAt( [ $this->base() ] ) );
    }

    public function testANonListIsInvalid(): void
    {
        $this->assertSame( [ '' => [ 'invalid_type' ] ], $this->codesAt( [ 'a' => [] ] ) );
        $this->assertSame( [ '' => [ 'invalid_type' ] ], $this->codesAt( 'x' ) );
    }

    public function testOnlyOneNotificationIsAllowed(): void
    {
        $this->assertSame( [ '' => [ 'out_of_range' ] ], $this->codesAt( [ $this->base(), $this->base() ] ) );
    }

    public function testOnlyTheAdminTypeIsKnown(): void
    {
        $this->assertSame( [ '0.type' => [ 'invalid_option' ] ], $this->codesWith( [ 'type' => 'customer' ] ) );
    }

    public function testUnknownAndMissingKeysAreReported(): void
    {
        $item = $this->base();
        $item['cc'] = 'x';
        unset( $item['subject'] );

        $this->assertSame(
            [ '0.cc' => [ 'unknown_key' ], '0.subject' => [ 'missing_field' ] ],
            $this->codesAt( [ $item ] )
        );
    }

    public function testEnabledMustBeABoolean(): void
    {
        $this->assertSame( [ '0.enabled' => [ 'invalid_type' ] ], $this->codesWith( [ 'enabled' => 1 ] ) );
    }

    public function testRecipientsAreCheckedOneByOne(): void
    {
        $this->assertSame( [ '0.to' => [ 'invalid_option' ] ], $this->codesWith( [ 'to' => 'a@b.co, nope' ] ) );
    }

    public function testElevenRecipientsAreTooMany(): void
    {
        $to = implode( ',', array_map( static fn( $i ) => 'u' . $i . '@b.co', range( 1, 11 ) ) );

        $this->assertSame( [ '0.to' => [ 'out_of_range' ] ], $this->codesWith( [ 'to' => $to ] ) );
    }

    public function testSpacesAndTrailingCommasAreAllowed(): void
    {
        $this->assertSame( [], $this->codesWith( [ 'to' => ' a@b.co ,c@d.co,' ] ) );
    }

    public function testTheSubjectIsRequired(): void
    {
        $this->assertSame( [ '0.subject' => [ 'missing_field' ] ], $this->codesWith( [ 'subject' => '  ' ] ) );
    }

    public function testTheSubjectHasALimit(): void
    {
        $this->assertSame( [ '0.subject' => [ 'out_of_range' ] ], $this->codesWith( [ 'subject' => str_repeat( 'x', 201 ) ] ) );
    }

    public function testTheSubjectCannotBreakALine(): void
    {
        $this->assertSame( [ '0.subject' => [ 'invalid_option' ] ], $this->codesWith( [ 'subject' => "Hi\r\nBcc: x@y.z" ] ) );
        $this->assertSame( [ '0.subject' => [ 'invalid_option' ] ], $this->codesWith( [ 'subject' => "Hi\nThere" ] ) );
    }
}
