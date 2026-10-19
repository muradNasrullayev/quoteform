<?php

declare(strict_types=1);

namespace Quoteform\Tests\Forms;

use PHPUnit\Framework\TestCase;
use Quoteform\Forms\CalculationValidator;
use Quoteform\Forms\FieldValidator;
use ReflectionClass;
use RuntimeException;

/**
 * Bu testlər tests/fixtures/field-types.json faylını oxuyur.
 *
 * Eyni faylı Jest də oxuyur (tests/js/admin/fields.test.js və
 * tests/js/frontend/field-types-contract.test.js). Sahə tipi cədvəli DÖRD
 * yerdə təkrarlanır — server, builder və renderer-in iki modulu — və bir
 * nüsxəyə əlavə olunan tip digərində unudulanda sahə səssizcə səhifədən
 * yoxa çıxır: `buildControl()` `null` qaytarır, `createForm()` sahəni atlayır,
 * `mayLeave()` isə nəzarəti olmayan sahənin Next-i bloklamasına QƏSDƏN
 * imkan vermir. Yəni `required` olsa belə heç nə olmur və bütün dəstlər
 * yaşıl qalır. Bu fayl həmin boşluğu bağlayır — ifadə mühərriki üçün
 * tests/fixtures/expressions.json nə edirsə, bu da onu edir (spec §7.5).
 *
 * Sabitlər `private const`-dur, ona görə refleksiya ilə oxunur: cədvəli
 * sırf test üçün ictimai etmək məhz gizlətmək istədiyimiz şeyi API-yə
 * çevirərdi.
 */
final class FieldTypeContractTest extends TestCase
{
    /**
     * @return array<int, array<string, mixed>>
     */
    private function fixture(): array
    {
        $path = __DIR__ . '/../../fixtures/field-types.json';

        if ( ! file_exists( $path ) ) {
            throw new RuntimeException( 'Fixture file is missing: ' . $path );
        }

        $decoded = json_decode( (string) file_get_contents( $path ), true );

        if ( ! is_array( $decoded ) || ! isset( $decoded['types'] ) || ! is_array( $decoded['types'] ) ) {
            throw new RuntimeException( 'Fixture file is malformed: ' . $path );
        }

        return $decoded['types'];
    }

    /**
     * @return mixed
     */
    private function constantOf( string $class, string $name )
    {
        $constant = ( new ReflectionClass( $class ) )->getReflectionConstant( $name );

        if ( false === $constant ) {
            throw new RuntimeException( sprintf( '%s::%s no longer exists.', $class, $name ) );
        }

        return $constant->getValue();
    }

    public function testTheServerSupportsExactlyTheTypesInTheFixture(): void
    {
        $expected = array_column( $this->fixture(), 'type' );

        $this->assertSame( $expected, FieldValidator::types() );
    }

    public function testEveryTypeCarriesExactlyTheExtraKeysTheFixtureDeclares(): void
    {
        /** @var array<string, string[]> $typeKeys */
        $typeKeys = $this->constantOf( FieldValidator::class, 'TYPE_KEYS' );

        foreach ( $this->fixture() as $type ) {
            $this->assertArrayHasKey( $type['type'], $typeKeys );
            $this->assertSame(
                $type['extra_keys'],
                $typeKeys[ $type['type'] ],
                sprintf( 'the extra keys of "%s"', $type['type'] )
            );
        }
    }

    public function testTheLabelOptionalListMatchesTheFixture(): void
    {
        $expected = array_values(
            array_column(
                array_filter(
                    $this->fixture(),
                    static function ( array $type ): bool {
                        return true === $type['label_optional'];
                    }
                ),
                'type'
            )
        );

        $this->assertSame( $expected, $this->constantOf( FieldValidator::class, 'LABEL_OPTIONAL' ) );
    }

    public function testThePriceBearingListMatchesTheFixture(): void
    {
        $expected = array_values(
            array_column(
                array_filter(
                    $this->fixture(),
                    static function ( array $type ): bool {
                        return true === $type['price_bearing'];
                    }
                ),
                'type'
            )
        );

        $this->assertSame( $expected, $this->constantOf( CalculationValidator::class, 'PRICE_BEARING_TYPES' ) );
    }
}
