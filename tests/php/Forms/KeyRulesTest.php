<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\KeyRules;
use Quoteform\Forms\ValidationResult;

final class KeyRulesTest extends TestCase
{
    /**
     * @dataProvider validKeys
     */
    public function testAcceptsValidKeys( string $key ): void
    {
        $this->assertTrue( KeyRules::isValidFormat( $key ), $key );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public function validKeys(): array
    {
        return [
            'sadə'            => [ 'total' ],
            'alt xətt ilə'    => [ 'room_count' ],
            'rəqəm daxil'     => [ 'step2' ],
            'tək hərf'        => [ 'a' ],
            'maksimum uzunluq'=> [ 'a' . str_repeat( 'b', 63 ) ],
        ];
    }

    /**
     * @dataProvider invalidKeys
     */
    public function testRejectsInvalidKeys( string $key ): void
    {
        $this->assertFalse( KeyRules::isValidFormat( $key ), $key );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public function invalidKeys(): array
    {
        return [
            'boş'                  => [ '' ],
            'rəqəmlə başlayır'     => [ '2' ],
            'rəqəmlə başlayır uzun'=> [ '2nd_step' ],
            'alt xətt ilə başlayır'=> [ '_private' ],
            'proto'                => [ '__proto__' ],
            'böyük hərf'           => [ 'Total' ],
            'defis'                => [ 'room-count' ],
            'boşluq'               => [ 'room count' ],
            'nöqtə'                => [ 'room.count' ],
            'qeyri-ASCII'          => [ 'otaq' . "\u{0259}" ],
            'çox uzun'             => [ 'a' . str_repeat( 'b', 64 ) ],
            'sonda \n'             => [ "room_count\n" ],
            'sonda \r\n'           => [ "room_count\r\n" ],
        ];
    }

    /**
     * PCRE's `$` matches before a trailing newline; JavaScript's does not. Without
     * the `D` modifier, `"room_count\n"` passes PHP's check but would fail the
     * lexer/JS side, silently producing a key no expression can ever reference
     * (see `Values::isNumericString()`'s docblock for the same class of bug).
     */
    public function testTrailingNewlineIsRejected(): void
    {
        $this->assertFalse( KeyRules::isValidFormat( "room_count\n" ) );
        $this->assertFalse( KeyRules::isValidFormat( "room_count\r\n" ) );
    }

    public function testNumericLikeKeysAreImpossible(): void
    {
        foreach ( [ '1', '2', '10', '0' ] as $key ) {
            $this->assertFalse(
                KeyRules::isValidFormat( $key ),
                'Rəqəmə oxşayan açar PHP-də int-ə çevrilir və JS-də yenidən sıralanır.'
            );
        }
    }

    /**
     * @dataProvider reservedKeys
     */
    public function testRejectsReservedKeys( string $key ): void
    {
        $this->assertTrue( KeyRules::isReserved( $key ), $key );
    }

    /**
     * @return array<string, array{0: string}>
     */
    public function reservedKeys(): array
    {
        return [
            'constructor'     => [ 'constructor' ],
            'prototype'       => [ 'prototype' ],
        ];
    }

    public function testOrdinaryKeysAreNotReserved(): void
    {
        $this->assertFalse( KeyRules::isReserved( 'total' ) );
        $this->assertFalse( KeyRules::isReserved( 'room_count' ) );
    }

    public function testFormerlyReservedCamelCaseLookalikesAreNowAccepted(): void
    {
        // JavaScript-də obyekt üzvünə müraciət böyük-kiçik hərfə həssasdır: əsl
        // built-in-lər `hasOwnProperty`, `toString`, `valueOf` adlanır. Bu üç
        // sətir isə tamamilə kiçik hərflidir, deməli həmin built-in-lərlə heç vaxt
        // üst-üstə düşmür və onları "kölgələmir" — buna görə də bloklanmamalıdır.
        foreach ( [ 'hasownproperty', 'tostring', 'valueof' ] as $key ) {
            $this->assertTrue( KeyRules::isValidFormat( $key ), $key );
            $this->assertFalse( KeyRules::isReserved( $key ), $key );
        }
    }

    public function testValidateRecordsAFormatError(): void
    {
        $result = new ValidationResult();

        $this->assertFalse( KeyRules::validate( '2nd', 'fields.2nd', $result ) );
        $this->assertSame( 'invalid_key_format', $result->getErrors()[0]['code'] );
        $this->assertSame( 'fields.2nd', $result->getErrors()[0]['path'] );
    }

    public function testValidateRecordsAReservedError(): void
    {
        $result = new ValidationResult();

        $this->assertFalse( KeyRules::validate( 'constructor', 'fields.constructor', $result ) );
        $this->assertSame( 'reserved_key', $result->getErrors()[0]['code'] );
    }

    public function testValidateAddsNothingForAGoodKey(): void
    {
        $result = new ValidationResult();

        $this->assertTrue( KeyRules::validate( 'room_count', 'fields.room_count', $result ) );
        $this->assertTrue( $result->isValid() );
    }
}
