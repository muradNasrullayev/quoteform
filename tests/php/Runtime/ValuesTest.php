<?php

declare(strict_types=1);

namespace Quoteform\Tests\Runtime;

use PHPUnit\Framework\TestCase;
use Quoteform\Runtime\Values;

final class ValuesTest extends TestCase
{
    private const NUMBER   = [ 'key' => 'n', 'type' => 'number' ];
    private const TOGGLE   = [ 'key' => 't', 'type' => 'toggle' ];
    private const CHECKBOX = [ 'key' => 'c', 'type' => 'checkbox', 'options' => [ [ 'value' => 'a', 'price' => 5 ], [ 'value' => 'b', 'price' => 7 ] ] ];
    private const RADIO    = [ 'key' => 'r', 'type' => 'radio', 'options' => [ [ 'value' => 'x', 'price' => 10 ], [ 'value' => 'y', 'price' => 'free' ] ] ];
    private const TEXT     = [ 'key' => 's', 'type' => 'text' ];

    public function testNumbersFollowTheEnginesNumericRule(): void
    {
        $this->assertSame( 3.0, Values::normalise( self::NUMBER, '3' ) );
        $this->assertSame( 3.0, Values::normalise( self::NUMBER, 3 ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, ' 5' ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, "5\n" ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, 'abc' ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, null ) );
        $this->assertTrue( is_infinite( Values::normalise( self::NUMBER, '1e400' ) ) );
        $this->assertSame( '', Values::normalise( self::NUMBER, INF ) );
    }

    public function testTogglesBecomeZeroOrOne(): void
    {
        $this->assertSame( 1, Values::normalise( self::TOGGLE, true ) );
        $this->assertSame( 1, Values::normalise( self::TOGGLE, 1 ) );
        $this->assertSame( 1, Values::normalise( self::TOGGLE, '1' ) );
        $this->assertSame( 0, Values::normalise( self::TOGGLE, false ) );
        $this->assertSame( 0, Values::normalise( self::TOGGLE, 'yes' ) );
        $this->assertSame( 0, Values::normalise( self::TOGGLE, null ) );
    }

    public function testCheckboxesAreLists(): void
    {
        $this->assertSame( [ 'a' ], Values::normalise( self::CHECKBOX, [ 'a' ] ) );
        $this->assertSame( [], Values::normalise( self::CHECKBOX, 'a' ) );
    }

    public function testOtherTypesBecomeStringsTheWayJavaScriptWouldPrintThem(): void
    {
        $this->assertSame( 'hi', Values::normalise( self::TEXT, 'hi' ) );
        $this->assertSame( '', Values::normalise( self::TEXT, '' ) );
        $this->assertSame( '5', Values::normalise( self::TEXT, 5 ) );
        $this->assertSame( '1.5', Values::normalise( self::TEXT, 1.5 ) );
        $this->assertSame( 'true', Values::normalise( self::TEXT, true ) );
        $this->assertSame( 'a,b', Values::normalise( self::TEXT, [ 'a', 'b' ] ) );
    }

    public function testConditionValuesForListsAreStrings(): void
    {
        $this->assertSame( 'a', Values::normaliseConditionValue( self::CHECKBOX, 'a' ) );
        $this->assertSame( 0, Values::normaliseConditionValue( self::TOGGLE, false ) );
    }

    public function testVariablesCarryPricesAndBlankHiddenFields(): void
    {
        $schema = [ 'fields' => [ 'c' => self::CHECKBOX, 'r' => self::RADIO, 'n' => self::NUMBER ] ];
        $state  = [ 'c' => [ 'a', 'b', 'zzz' ], 'r' => 'y', 'n' => '4' ];

        $variables = Values::variablesFor( $schema, $state, [ 'c' => true, 'r' => true ] );

        $this->assertSame( [ 'a', 'b', 'zzz' ], $variables['c'] );
        $this->assertSame( 12, $variables['c.price'] );
        $this->assertSame( 'y', $variables['r'] );
        $this->assertSame( 0, $variables['r.price'], 'a non-numeric price counts as 0' );
        $this->assertSame( '', $variables['n'], 'a hidden field is blank' );
        $this->assertArrayNotHasKey( 'n.price', $variables );
    }

    public function testAnUnchosenSingleChoiceCostsNothing(): void
    {
        $variables = Values::variablesFor( [ 'fields' => [ 'r' => self::RADIO ] ], [ 'r' => '' ], [ 'r' => true ] );

        $this->assertSame( 0, $variables['r.price'] );
    }

    /**
     * Expected strings verified against Node.js `String( number )`:
     * node -e "console.log(String(0.1+0.2))" etc. — see task-3-report.md Fix round 1.
     */
    public function testFloatsPrintTheWayJavaScriptPrintsThem(): void
    {
        $this->assertSame( '0.00001', Values::stringify( 0.00001 ) );
        $this->assertSame( '0.00005', Values::stringify( 0.00005 ) );
        $this->assertSame( '0.000001', Values::stringify( 0.000001 ) );
        $this->assertSame( '9e-7', Values::stringify( 9e-7 ) );
        $this->assertSame( '1.5e-7', Values::stringify( 1.5e-7 ) );
        $this->assertSame( '0.1', Values::stringify( 0.1 ) );
        $this->assertSame( '0.30000000000000004', Values::stringify( 0.1 + 0.2 ) );
        $this->assertSame( '123.456', Values::stringify( 123.456 ) );
        $this->assertSame( '100', Values::stringify( 100.0 ) );
        $this->assertSame( '1e+21', Values::stringify( 1e21 ) );
        $this->assertSame( '123456789012345680000', Values::stringify( 1.2345678901234568e20 ) );
        $this->assertSame( '-0.00005', Values::stringify( -0.00005 ) );
        $this->assertSame( '1.7976931348623157e+308', Values::stringify( 1.7976931348623157e308 ) );
        $this->assertSame( '0', Values::stringify( -0.0 ) );
    }

    public function testVariablesReadStateByTheFieldsOwnKeyNotTheSchemaArrayKey(): void
    {
        $field = [ 'key' => 'actual_key', 'type' => 'text' ];
        $schema = [ 'fields' => [ 'different_array_key' => $field ] ];
        $state = [ 'actual_key' => 'hello' ];

        $variables = Values::variablesFor( $schema, $state, [ 'different_array_key' => true ] );

        $this->assertSame( 'hello', $variables['different_array_key'] );
    }
}
