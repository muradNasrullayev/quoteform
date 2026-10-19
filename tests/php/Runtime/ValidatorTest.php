<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Runtime\Validator;

final class ValidatorTest extends TestCase
{
    public function testTheEmailPatternUsesJavaScriptsWhitespaceSet(): void
    {
        $spaces = [ "\t", "\n", "\x0B", "\f", "\r", ' ', "\u{00A0}", "\u{1680}", "\u{2000}", "\u{200A}", "\u{2028}", "\u{2029}", "\u{202F}", "\u{205F}", "\u{3000}", "\u{FEFF}" ];

        foreach ( $spaces as $space ) {
            $this->assertSame( 'email', Validator::fieldErrorCode( [ 'type' => 'email' ], "a{$space}b@c", false ), bin2hex( $space ) );
        }

        $this->assertNull( Validator::fieldErrorCode( [ 'type' => 'email' ], "a\u{0085}b@c", false ), 'U+0085 is not JavaScript whitespace' );
    }

    public function testInvalidUtf8IsNotAnEmailAddress(): void
    {
        $this->assertSame( 'email', Validator::fieldErrorCode( [ 'type' => 'email' ], "a\xC3@b", false ) );
    }

    public function testTheFirstErrorStepFollowsSchemaOrder(): void
    {
        $schema     = [ 'steps' => [ [ 'key' => 'one', 'fields' => [ 'a' ] ], [ 'key' => 'two', 'fields' => [ 'b' ] ] ] ];
        $visibility = [ 'fields' => [ 'a' => true, 'b' => true ], 'steps' => [ 'one' => true, 'two' => true ], 'required' => [] ];

        $this->assertSame( 'two', Validator::firstErrorStep( $schema, $visibility, [ 'b' => 'required' ] ) );
        $this->assertSame( 'one', Validator::firstErrorStep( $schema, $visibility, [ 'b' => 'required', 'a' => 'min' ] ) );
        $this->assertNull( Validator::firstErrorStep( $schema, $visibility, [] ) );
    }
}
