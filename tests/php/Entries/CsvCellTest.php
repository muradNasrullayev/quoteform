<?php

declare(strict_types=1);

namespace Quoteform\Tests\Entries;

use PHPUnit\Framework\TestCase;
use Quoteform\Entries\CsvCell;

final class CsvCellTest extends TestCase
{
    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public function formulaStarts(): array
    {
        return [
            'equals'          => [ '=1+2', "'=1+2" ],
            'plus'            => [ '+1+2', "'+1+2" ],
            'minus sum'       => [ '-2+3', "'-2+3" ],
            'at'              => [ '@SUM(A1)', "'@SUM(A1)" ],
            'tab'             => [ "\t=1", "'\t=1" ],
            'carriage return' => [ "\r=1", "'\r=1" ],
            'hyperlink'       => [ '=HYPERLINK("http://x")', "'=HYPERLINK(\"http://x\")" ],
        ];
    }

    /**
     * @dataProvider formulaStarts
     */
    public function testCellsThatSpreadsheetsWouldRunGetAQuote( string $raw, string $expected ): void
    {
        $this->assertSame( $expected, CsvCell::clean( $raw ) );
    }

    public function testPlainNumbersStayNumbersEvenWhenNegative(): void
    {
        $this->assertSame( '-25.5000', CsvCell::clean( '-25.5000' ) );
        $this->assertSame( '-5', CsvCell::clean( '-5' ) );
        $this->assertSame( '180.0000', CsvCell::clean( '180.0000' ) );
        $this->assertSame( "'-5\n", CsvCell::clean( "-5\n" ), 'a number with a line break is text' );
    }

    public function testControlCharactersAreRemovedBeforeTheFormulaCheck(): void
    {
        $this->assertSame( 'ab', CsvCell::clean( "a\x00b" ) );
        $this->assertSame( "'=1+2", CsvCell::clean( "\x07=1+2" ), 'a hidden byte must not smuggle a formula past the check' );
        $this->assertSame( "one\ntwo", CsvCell::clean( "one\x0B\ntwo\x7F" ) );
    }

    public function testMultibyteTextIsUntouched(): void
    {
        $this->assertSame( 'Zəhra ✓ 東京', CsvCell::clean( 'Zəhra ✓ 東京' ) );
    }

    public function testALineFollowsRfc4180(): void
    {
        $this->assertSame( "41,\"a,b\",\"say \"\"hi\"\"\",\"one\ntwo\"\n", CsvCell::line( [ '41', 'a,b', 'say "hi"', "one\ntwo" ] ) );
    }

    public function testABackslashBeforeAQuoteIsNotAnEscape(): void
    {
        $line = CsvCell::line( [ 'C:\\"x"' ] );

        $this->assertSame( "\"C:\\\"\"x\"\"\"\n", $line );
        $this->assertSame( [ 'C:\\"x"' ], str_getcsv( rtrim( $line, "\n" ), ',', '"', '' ) );
    }

    public function testEveryCellOfALineIsCleaned(): void
    {
        $this->assertSame( "'=1,ok\n", CsvCell::line( [ '=1', 'ok' ] ) );
    }
}
