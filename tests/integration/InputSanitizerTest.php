<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

use Quoteform\Submissions\BadSubmission;
use Quoteform\Submissions\InputSanitizer;
use WP_UnitTestCase;

final class InputSanitizerTest extends WP_UnitTestCase
{
    private function schema(): array
    {
        return [
            'fields' => [
                'name'    => [ 'key' => 'name', 'type' => 'text', 'default' => '' ],
                'notes'   => [ 'key' => 'notes', 'type' => 'textarea', 'default' => '' ],
                'email'   => [ 'key' => 'email', 'type' => 'email', 'default' => '' ],
                'rooms'   => [ 'key' => 'rooms', 'type' => 'number', 'default' => 1 ],
                'day'     => [ 'key' => 'day', 'type' => 'date', 'default' => '' ],
                'service' => [ 'key' => 'service', 'type' => 'radio', 'default' => 'a', 'options' => [ [ 'value' => 'a' ], [ 'value' => 'b' ] ] ],
                'extras'  => [ 'key' => 'extras', 'type' => 'checkbox', 'default' => [], 'options' => [ [ 'value' => 'x' ], [ 'value' => 'y' ] ] ],
                'agree'   => [ 'key' => 'agree', 'type' => 'toggle', 'default' => false ],
                'source'  => [ 'key' => 'source', 'type' => 'hidden', 'default' => 'google' ],
                'intro'   => [ 'key' => 'intro', 'type' => 'html', 'default' => '' ],
                'secret'  => [ 'key' => 'secret', 'type' => 'number', 'default' => 7 ],
            ],
            'steps'  => [
                [ 'key' => 'one', 'fields' => [ 'name', 'notes', 'email', 'rooms', 'day', 'service', 'extras', 'agree', 'source', 'intro' ] ],
            ],
        ];
    }

    private function clean( array $values ): array
    {
        return ( new InputSanitizer() )->sanitize( $this->schema(), $values );
    }

    private function assertBad( array $values ): void
    {
        try {
            $this->clean( $values );
            $this->fail( 'Expected BadSubmission for ' . wp_json_encode( $values ) );
        } catch ( BadSubmission $expected ) {
            $this->addToAssertionCount( 1 );
        }
    }

    public function testTextIsSanitisedAndCapped(): void
    {
        $this->assertSame( " <b>Jane</b> ", $this->clean( [ 'name' => " <b>Jane</b> " ] )['name'] );
        $this->assertSame( str_repeat( 'a', 500 ), $this->clean( [ 'name' => str_repeat( 'a', 500 ) ] )['name'] );
        $this->assertBad( [ 'name' => str_repeat( 'a', 501 ) ] );
        $this->assertBad( [ 'notes' => str_repeat( 'a', 5001 ) ] );
        $this->assertBad( [ 'name' => [ 'array' ] ] );
    }

    public function testTextKeepsTheExactStringTheBrowserEvaluated(): void
    {
        $this->assertSame( 'MEMBER ', $this->clean( [ 'name' => 'MEMBER ' ] )['name'] );
        $this->assertSame( '5 < 10', $this->clean( [ 'name' => '5 < 10' ] )['name'] );
        $this->assertSame( "  line one\n\tline two  ", $this->clean( [ 'notes' => "  line one\n\tline two  " ] )['notes'] );
        $this->assertSame( '100%20off', $this->clean( [ 'email' => '100%20off' ] )['email'] );
    }

    public function testInvalidUtf8TextIsABadSubmission(): void
    {
        $this->assertBad( [ 'name' => "\xC3\x28" ] );
        $this->assertBad( [ 'notes' => "ok\xC3\x28" ] );
    }

    public function testTheTextLimitCountsCharactersNotBytes(): void
    {
        $this->assertSame( str_repeat( 'ə', 500 ), $this->clean( [ 'name' => str_repeat( 'ə', 500 ) ] )['name'] );
    }

    public function testNumbersFollowTheNumericRule(): void
    {
        $this->assertSame( 3.0, $this->clean( [ 'rooms' => '3' ] )['rooms'] );
        $this->assertSame( 3.0, $this->clean( [ 'rooms' => 3 ] )['rooms'] );
        $this->assertSame( '', $this->clean( [ 'rooms' => ' 3' ] )['rooms'] );
    }

    public function testNumericStringsBeyondTheFloatRangeAreEmpty(): void
    {
        $this->assertSame( '', $this->clean( [ 'rooms' => '1e400' ] )['rooms'] );
        $this->assertSame( '', $this->clean( [ 'rooms' => '-1e400' ] )['rooms'] );
    }

    public function testDatesMustBeRealCalendarDates(): void
    {
        $this->assertSame( '2026-09-24', $this->clean( [ 'day' => '2026-09-24' ] )['day'] );
        $this->assertSame( '', $this->clean( [ 'day' => '' ] )['day'] );
        $this->assertBad( [ 'day' => '2026-13-40' ] );
        $this->assertBad( [ 'day' => '24.09.2026' ] );
    }

    public function testChoicesMustBeOptions(): void
    {
        $this->assertSame( 'b', $this->clean( [ 'service' => 'b' ] )['service'] );
        $this->assertSame( '', $this->clean( [ 'service' => '' ] )['service'] );
        $this->assertBad( [ 'service' => 'z' ] );
        $this->assertSame( [ 'y', 'x' ], $this->clean( [ 'extras' => [ 'y', 'x', 'y' ] ] )['extras'] );
        $this->assertBad( [ 'extras' => [ 'x', 'sauna' ] ] );
        $this->assertBad( [ 'extras' => 'x' ] );
    }

    public function testTogglesAreZeroOrOne(): void
    {
        $this->assertSame( 1, $this->clean( [ 'agree' => true ] )['agree'] );
        $this->assertSame( 0, $this->clean( [ 'agree' => false ] )['agree'] );
        $this->assertBad( [ 'agree' => 'maybe' ] );
    }

    public function testTheBrowserCannotChooseHiddenOrUnplacedValues(): void
    {
        $clean = $this->clean( [ 'source' => 'tampered', 'secret' => 999, 'intro' => '<script>' ] );

        $this->assertSame( 'google', $clean['source'] );
        $this->assertSame( 7, $clean['secret'] );
        $this->assertSame( '', $clean['intro'] );
    }

    public function testUnknownKeysAreDroppedAndMissingOnesAreEmpty(): void
    {
        $clean = $this->clean( [ 'ghost' => 'boo' ] );

        $this->assertArrayNotHasKey( 'ghost', $clean );
        $this->assertSame( '', $clean['name'] );
        $this->assertSame( [], $clean['extras'] );
        $this->assertSame( 0, $clean['agree'] );
    }

    public function testValuesMustBeAnObject(): void
    {
        $this->expectException( BadSubmission::class );

        ( new InputSanitizer() )->sanitize( $this->schema(), 'nope' );
    }
}
