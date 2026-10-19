<?php

declare(strict_types=1);

namespace Quoteform\Tests\Integration;

require_once __DIR__ . '/Support/SeedsEntries.php';

use Quoteform\Entries\EntriesTable;
use Quoteform\Entries\EntryQuery;
use Quoteform\Entries\EntryRepository;
use Quoteform\Forms\FormPostType;
use Quoteform\Tests\Integration\Support\SeedsEntries;
use WP_UnitTestCase;

/**
 * R1: `to` gününün yuxarı sərhədi indi XARİC edilir (əvvəl sabit `23:59:59 local`
 * idi). America/Santiago-da 2026-04-05 saat qurşağı geriyə (DST fall-back) düşür —
 * yerli 00:00:00-da -03:00-dan -04:00-ə. Köhnə sabit sərhəd bu axşam üçün saatlıq
 * boşluq yaradırdı: `to=2026-04-04` yalnız `<= 02:59:59 UTC`-ə, `from=2026-04-05`
 * yalnız `>= 04:00:00 UTC`-ə qədər/sonra tuturdu — 03:00-03:59 UTC arası heç bir
 * filtrə düşmürdü.
 *
 * QEYD (R1 brifinin dəqiqləşdirilməsi): brif "entry 2026-04-05 03:30:00 UTC
 * from=2026-04-05&to=2026-04-05-ə uyğun gəlməlidir, to=2026-04-04-ə yox" dedi.
 * Empirik yoxlama (və əl ilə DateTimeImmutable hesablaması) göstərir ki, bu, əksinədir:
 * `2026-04-05 03:30:00 UTC` Santiaqoda yerli `2026-04-04 23:30:00 -04:00`-dir —
 * geriyə düşən saatın İKİNCİ (son, sabit) keçidi, deməli təqvim tarixi APREL 4-dür,
 * Aprel 5 yox (PHP `DateTimeImmutable` bu anı `-04:00`, yəni son keçid kimi
 * qətiləşdirir — `wp_timezone()`-un qaytardığı `DateTimeZone` da eynidir).
 * Test real (düzgün) davranışı yoxlayır: düzəlişdən əvvəl bu an heç bir günə
 * düşmür (RED), düzəlişdən sonra düz BİR günə (Aprel 4-ün 25 saatlıq genişlənməsinə)
 * düşür, ikiqat sayılmır.
 */
final class EntryQueryDstTest extends WP_UnitTestCase
{
    use SeedsEntries;

    /** @var string|false */
    private $originalTimezone;

    protected function setUp(): void
    {
        parent::setUp();
        FormPostType::register();
        EntriesTable::drop();
        EntriesTable::install();

        $this->originalTimezone = get_option( 'timezone_string' );
        update_option( 'timezone_string', 'America/Santiago' );
        update_option( 'gmt_offset', 0 );
    }

    protected function tearDown(): void
    {
        update_option( 'timezone_string', $this->originalTimezone );
        parent::tearDown();
    }

    /**
     * @param array<string, mixed> $params
     * @return int[]
     */
    private function listed( array $params ): array
    {
        return array_column( ( new EntryRepository() )->page( EntryQuery::forSite( $params ), 1, 20 )['items'], 'id' );
    }

    public function testTheHourGainedByDstFallBackIsCountedOnceNotZeroTimes(): void
    {
        // Yerli `2026-04-04 23:30:00 -04:00` (geriyə düşən saatın ikinci keçidi).
        $entry = $this->seedEntry( [ 'created_at' => '2026-04-05 03:30:00' ] );

        // Köhnə kodda ("to" sərhədi `<= 23:59:59 local`) bu an İKİ günün də
        // filtrindən kənarda qalırdı (R1-in təsvir etdiyi boşluq).
        $this->assertSame( [ $entry ], $this->listed( [ 'from' => '2026-04-04', 'to' => '2026-04-04' ] ) );
        $this->assertSame( [], $this->listed( [ 'from' => '2026-04-05', 'to' => '2026-04-05' ] ) );
    }
}
