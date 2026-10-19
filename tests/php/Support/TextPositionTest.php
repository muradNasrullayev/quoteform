<?php

declare(strict_types=1);

namespace Quoteform\Tests\Support;

use PHPUnit\Framework\TestCase;
use Quoteform\Support\TextPosition;

final class TextPositionTest extends TestCase
{
    public function testAsciiOffsetsAreUnchanged(): void
    {
        $this->assertSame( 0, TextPosition::byteToUtf16( '{a} + 1', 0 ) );
        $this->assertSame( 4, TextPosition::byteToUtf16( '{a} + 1', 4 ) );
        $this->assertSame( 7, TextPosition::byteToUtf16( '{a} + 1', 7 ) );
    }

    public function testNegativeAndZeroOffsetsReturnZero(): void
    {
        $this->assertSame( 0, TextPosition::byteToUtf16( 'abc', -5 ) );
        $this->assertSame( 0, TextPosition::byteToUtf16( 'abc', 0 ) );
    }

    public function testTwoByteCharacterCountsAsOneUnit(): void
    {
        // "é" UTF-8-də 2 baytdır, UTF-16-da 1 kod vahididir.
        $source = "\u{00E9}x";

        $this->assertSame( 1, TextPosition::byteToUtf16( $source, 2 ) );
        $this->assertSame( 2, TextPosition::byteToUtf16( $source, 3 ) );
    }

    public function testThreeByteCharacterCountsAsOneUnit(): void
    {
        // "日" UTF-8-də 3 baytdır, UTF-16-da 1 kod vahididir.
        $source = "\u{65E5}x";

        $this->assertSame( 1, TextPosition::byteToUtf16( $source, 3 ) );
        $this->assertSame( 2, TextPosition::byteToUtf16( $source, 4 ) );
    }

    public function testFourByteCharacterCountsAsTwoUnits(): void
    {
        // "😀" UTF-8-də 4 baytdır, UTF-16-da SURROQAT CÜTdür — 2 kod vahidi.
        $source = "\u{1F600}x";

        $this->assertSame( 2, TextPosition::byteToUtf16( $source, 4 ) );
        $this->assertSame( 3, TextPosition::byteToUtf16( $source, 5 ) );
    }

    public function testMixedScriptExpression(): void
    {
        // Yekun review-un #7 tapıntısı: `1 + "日本" # 2` ifadəsində
        // PHP bayt 13 deyir, JS isə 9-cu kod vahidini gözləyir.
        $source = '1 + "' . "\u{65E5}\u{672C}" . '" # 2';

        $this->assertSame( 9, TextPosition::byteToUtf16( $source, 13 ) );
    }

    public function testOffsetBeyondTheStringIsClamped(): void
    {
        $this->assertSame( 3, TextPosition::byteToUtf16( 'abc', 99 ) );
    }
}
