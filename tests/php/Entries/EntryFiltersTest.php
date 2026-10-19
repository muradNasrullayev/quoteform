<?php

declare(strict_types=1);

namespace Quoteform\Tests\Entries;

use PHPUnit\Framework\TestCase;
use Quoteform\Entries\EntryFilters;

final class EntryFiltersTest extends TestCase
{
    /**
     * @return array<string, array{0: array<string, mixed>, 1: array<string, mixed>}>
     */
    public function sharedCases(): array
    {
        $fixture = json_decode( (string) file_get_contents( dirname( __DIR__, 2 ) . '/fixtures/entry-filters.json' ), true );
        $cases   = [];

        foreach ( $fixture['cases'] as $case ) {
            $cases[ $case['name'] ] = [ $case['params'], $case['expected'] ];
        }

        return $cases;
    }

    /**
     * @dataProvider sharedCases
     * @param array<string, mixed> $params
     * @param array<string, mixed> $expected
     */
    public function testMatchesTheSharedFixture( array $params, array $expected ): void
    {
        $this->assertSame( array_merge( EntryFilters::defaults(), $expected ), EntryFilters::normalise( $params ) );
    }

    public function testTheDefaultsListEveryFilterInOneOrder(): void
    {
        $this->assertSame(
            [ 'form' => null, 'status' => null, 'from' => null, 'to' => null, 'min' => null, 'max' => null, 'orderby' => 'date', 'order' => 'desc' ],
            EntryFilters::defaults()
        );
    }

    public function testCalendarDatesAreCheckedAgainstTheCalendar(): void
    {
        $this->assertTrue( EntryFilters::isCalendarDate( '2024-02-29' ) );
        $this->assertFalse( EntryFilters::isCalendarDate( '2023-02-29' ) );
        $this->assertFalse( EntryFilters::isCalendarDate( '2023-04-31' ) );
        $this->assertFalse( EntryFilters::isCalendarDate( "2023-04-30\n" ) );
    }
}
