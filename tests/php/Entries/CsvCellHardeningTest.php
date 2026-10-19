<?php

declare(strict_types=1);

namespace Quoteform\Tests\Entries;

use PHPUnit\Framework\TestCase;
use Quoteform\Entries\CsvCell;

/**
 * Fix round 1 (controller ruling R2): LibreOffice trims leading whitespace before
 * evaluating a cell, so a formula preceded by whitespace (including NBSP and other
 * Unicode space) or written with fullwidth trigger characters must still be caught.
 */
final class CsvCellHardeningTest extends TestCase
{
    public function testLeadingSpaceBeforeATriggerIsCaught(): void
    {
        $this->assertSame( "' =1+1", CsvCell::clean( ' =1+1' ) );
    }

    public function testLeadingNonBreakingSpaceBeforeATriggerIsCaught(): void
    {
        $cleaned = CsvCell::clean( "\u{00A0}=1" );

        $this->assertSame( "'", $cleaned[0] );
    }

    public function testAFullwidthEqualsSignIsCaught(): void
    {
        $cleaned = CsvCell::clean( '＝1+1' );

        $this->assertSame( "'", $cleaned[0] );
    }

    public function testLeadingWhitespaceBeforeAMinusIsNotAPlainNumber(): void
    {
        $cleaned = CsvCell::clean( '  -5' );

        $this->assertSame( "'", $cleaned[0] );
    }

    public function testOrdinaryTextWithAnEqualsSignInTheMiddleIsUntouched(): void
    {
        $this->assertSame( 'hello = world', CsvCell::clean( 'hello = world' ) );
    }

    public function testControlCharactersAreStrippedBeforeTheWhitespaceCheck(): void
    {
        $this->assertSame( "'=1+2", CsvCell::clean( "\x07=1+2" ) );
    }

    public function testAPlainNegativeDecimalStillGetsNoPrefix(): void
    {
        $this->assertSame( '-25.5000', CsvCell::clean( '-25.5000' ) );
    }

    public function testAllFourFullwidthTriggersAreCaught(): void
    {
        foreach ( [ '＝', '＋', '－', '＠' ] as $trigger ) {
            $cleaned = CsvCell::clean( $trigger . 'x' );

            $this->assertSame( "'", $cleaned[0], "fullwidth trigger {$trigger} was not caught" );
        }
    }

    public function testAFullwidthTriggerAfterWhitespaceIsCaught(): void
    {
        $cleaned = CsvCell::clean( '  ＋1' );

        $this->assertSame( "'", $cleaned[0] );
    }

    /**
     * Fix round 2: `preg_replace( …, '/u' )` returns NULL when the subject contains invalid
     * UTF-8 ANYWHERE, not only at the start. The old code cast that NULL to '' via `(string)`,
     * which hit the `'' === $trimmed` branch and returned `false` — an unguarded formula.
     *
     * Fix round 3 (controller ruling R3) replaced the round-2 byte-level fallback with a
     * structural fix: `mb_scrub()` turns the invalid byte into U+FFFD BEFORE any `/u` regex
     * runs, so these assertions now expect U+FFFD in the output instead of the raw invalid byte.
     */
    public function testATrailingInvalidUtf8ByteDoesNotHideALeadingFormula(): void
    {
        $this->assertSame( "'=1\u{FFFD}", CsvCell::clean( "=1\xC3" ) );
    }

    public function testATrailingInvalidUtf8ByteAfterWhitespaceDoesNotHideAFormula(): void
    {
        $this->assertSame( "' =1\u{FFFD}", CsvCell::clean( " =1\xC3" ) );
    }

    public function testAValidMultibyteCharacterBeforeAnEqualsSignIsStillUntouched(): void
    {
        $this->assertSame( "\xC3\xA9=1", CsvCell::clean( "\xC3\xA9=1" ) );
    }

    public function testOrdinaryTextWithATrailingInvalidUtf8ByteIsUnchanged(): void
    {
        $this->assertSame( "abc\u{FFFD}", CsvCell::clean( "abc\xC3" ) );
    }

    /**
     * Fix round 3 (controller ruling R3): the round-2 fallback only `ltrim()`-ed ASCII
     * whitespace, so a leading NBSP (a 2-byte UTF-8 sequence, not ASCII) plus a trailing
     * invalid byte still hid the formula: `preg_replace()` failed on the invalid tail byte,
     * the byte-level fallback didn't recognise NBSP as whitespace, and the cell came back
     * unprefixed with a live `=1` in it.
     */
    public function testANonBreakingSpaceBeforeATriggerWithATrailingInvalidByteIsCaught(): void
    {
        $this->assertSame( "'\xC2\xA0=1\u{FFFD}", CsvCell::clean( "\xC2\xA0=1\xC3" ) );
    }

    /**
     * Fix round 4 (controller ruling R5, item 1): Unicode format characters (category Cf —
     * zero-width space, BOM, word joiner, soft hyphen, LRM, …) are invisible and must be
     * skipped like whitespace before looking for a trigger.
     */
    public function testAZeroWidthSpaceBeforeATriggerIsCaught(): void
    {
        $this->assertSame( "'\u{200B}=1", CsvCell::clean( "\u{200B}=1" ) );
    }

    public function testAByteOrderMarkBeforeATriggerIsCaught(): void
    {
        $this->assertSame( "'\u{FEFF}=1", CsvCell::clean( "\u{FEFF}=1" ) );
    }

    public function testASoftHyphenBeforeATriggerIsCaught(): void
    {
        $this->assertSame( "'\u{00AD}+1", CsvCell::clean( "\u{00AD}+1" ) );
    }

    public function testAZeroWidthSpaceBeforeADigitIsNotPrefixed(): void
    {
        $this->assertSame( "\u{200B}5", CsvCell::clean( "\u{200B}5" ) );
    }

    /**
     * Fix round 4 (controller ruling R5, item 2): the scrub step is a
     * `htmlspecialchars( ENT_SUBSTITUTE )` + `htmlspecialchars_decode()` round trip, which is
     * core PHP (no mbstring). It must be an identity on valid UTF-8, including text that
     * already contains entity-like sequences such as a literal `&amp;`.
     */
    public function testValidTextWithEntitiesAndQuotesIsUnchangedByTheScrub(): void
    {
        $value = "a &amp; b <c> \"d\" 'e'";

        $this->assertSame( $value, CsvCell::clean( $value ) );
    }

    /**
     * Fix round 4: the only scrub path is the core-PHP one (there is no mbstring branch), so
     * `clean()` itself is the seam that exercises it. This input pins that path: for a lone
     * UTF-16 surrogate encoded as UTF-8 (`ED A0 80`), `htmlspecialchars( ENT_SUBSTITUTE )`
     * emits ONE U+FFFD, whereas `mb_scrub()` would emit three.
     */
    public function testTheCorePhpScrubReplacesAnEncodedSurrogateWithOneReplacementCharacter(): void
    {
        $this->assertSame( "'=1\u{FFFD}", CsvCell::clean( "=1\xED\xA0\x80" ) );
    }
}
