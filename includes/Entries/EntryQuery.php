<?php

declare(strict_types=1);

namespace Quoteform\Entries;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Müraciət siyahısının SQL-i. REST siyahısı, qonşu müraciətlər və CSV eksportu
 * EYNİ obyektdən keçir — filtrlər bir-birindən ayrıla bilməz (spec §5).
 *
 * Qaydalar:
 * - hər dəyər `$wpdb->prepare()` ilə; hazırlanmış fraqment bir daha prepare()-ə verilmir;
 * - sütun/istiqamət yalnız aşağıdakı literallardır (ağ siyahı);
 * - total müqayisəsi `CAST(%s AS DECIMAL(18,4))` ilədir: MySQL sətri DECIMAL ilə
 *   double kimi müqayisə edir və 18 rəqəmli total-lar bərabər görünür;
 * - `created_at` UTC-dir, gün sərhədləri saytın saat qurşağında hesablanır.
 */
final class EntryQuery
{
    /** @var array<string, mixed> */
    private $filters;

    /** @var DateTimeZone */
    private $zone;

    /** @var int[] */
    private $liveFormIds;

    /**
     * @param array<string, mixed> $filters     EntryFilters::normalise() nəticəsi
     * @param int[]                $liveFormIds yalnız `form = 'deleted'` üçün lazımdır
     */
    public function __construct( array $filters, DateTimeZone $zone, array $liveFormIds = [] )
    {
        $this->filters     = array_merge( EntryFilters::defaults(), $filters );
        $this->zone        = $zone;
        $this->liveFormIds = array_values( array_map( 'intval', $liveFormIds ) );
    }

    /**
     * @param array<string, mixed> $params xam sorğu parametrləri (`$_GET`, REST query)
     */
    public static function forSite( array $params ): self
    {
        $filters = EntryFilters::normalise( $params );

        return new self( $filters, wp_timezone(), 'deleted' === $filters['form'] ? FormDirectory::liveIds() : [] );
    }

    /**
     * @return array<string, mixed>
     */
    public function filters(): array
    {
        return $this->filters;
    }

    public function formId(): ?int
    {
        return is_int( $this->filters['form'] ) ? $this->filters['form'] : null;
    }

    public function where(): string
    {
        global $wpdb;

        $filters = $this->filters;
        $parts   = [ "status = 'completed'" ];

        if ( is_int( $filters['form'] ) ) {
            $parts[] = $wpdb->prepare( 'form_id = %d', $filters['form'] );
        } elseif ( 'deleted' === $filters['form'] && [] !== $this->liveFormIds ) {
            $parts[] = 'form_id NOT IN (' . implode( ',', $this->liveFormIds ) . ')';
        }

        if ( 'new' === $filters['status'] ) {
            $parts[] = 'read_at IS NULL';
        } elseif ( 'read' === $filters['status'] ) {
            $parts[] = 'read_at IS NOT NULL';
        }

        if ( null !== $filters['from'] ) {
            $parts[] = $wpdb->prepare( 'created_at >= %s', $this->utc( $filters['from'], '00:00:00' ) );
        }

        if ( null !== $filters['to'] ) {
            // Üst sərhəd XARİC edilir: `to` günündən sonrakı yerli gecə yarısı UTC-yə çevrilir.
            // `23:59:59` sabit saat kimi seçilsəydi, saat qurşağının geriyə (DST fall-back)
            // keçdiyi günlərdə son saat "boşluğa" düşərdi (spec-in R1 düzəlişi).
            $parts[] = $wpdb->prepare( 'created_at < %s', $this->utc( $filters['to'], '00:00:00', 1 ) );
        }

        if ( null !== $filters['min'] ) {
            $parts[] = $wpdb->prepare( 'total >= CAST(%s AS DECIMAL(18,4))', $filters['min'] );
        }

        if ( null !== $filters['max'] ) {
            $parts[] = $wpdb->prepare( 'total <= CAST(%s AS DECIMAL(18,4))', $filters['max'] );
        }

        return 'WHERE ' . implode( ' AND ', $parts );
    }

    /**
     * Siyahı sırası; `$reversed` — əks istiqamət (keyset ilə "əvvəlki" sətri tapmaq üçün).
     * Total üzrə sıralamada hesablaması uğursuz (NULL) sətirlər siyahıda həmişə SONDADIR.
     */
    public function orderBy( bool $reversed = false ): string
    {
        $ascending = 'asc' === $this->filters['order'];

        if ( $reversed ) {
            $ascending = ! $ascending;
        }

        $direction = $ascending ? 'ASC' : 'DESC';

        if ( 'total' === $this->filters['orderby'] ) {
            $nulls = $reversed ? 'DESC' : 'ASC';

            return "ORDER BY (total IS NULL) {$nulls}, total {$direction}, id {$direction}";
        }

        return "ORDER BY created_at {$direction}, id {$direction}";
    }

    /**
     * Siyahı sırasında `$entry`-dən SONRA (`$forward`) və ya ƏVVƏL gələn sətirlərin şərti.
     * Şərt sətirin sıralama açarına baxır, filtrə üzvlüyünə yox: "New" filtrində açılıb
     * oxunan müraciətin də qonşuları tapılır.
     *
     * @param array<string, mixed> $entry EntryRepository::hydrate() nəticəsi (id, created_at, total_decimal)
     */
    public function beyond( array $entry, bool $forward ): string
    {
        global $wpdb;

        $ascending = 'asc' === $this->filters['order'];
        $operator  = ( $ascending === $forward ) ? '>' : '<';
        $id        = (int) $entry['id'];

        if ( 'total' !== $this->filters['orderby'] ) {
            return $wpdb->prepare(
                "(created_at {$operator} %s OR (created_at = %s AND id {$operator} %d))", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $operator is a literal ">" or "<".
                (string) $entry['created_at'],
                (string) $entry['created_at'],
                $id
            );
        }

        $total = $entry['total_decimal'];

        if ( null === $total ) {
            // NULL blok siyahının sonundadır: irəli yalnız blok içində, geri isə bütün dolu total-lar + blokda əvvəlkilər.
            return $forward
                ? $wpdb->prepare( "(total IS NULL AND id {$operator} %d)", $id ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $operator is a literal ">" or "<".
                : $wpdb->prepare( "(total IS NOT NULL OR id {$operator} %d)", $id ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $operator is a literal ">" or "<".
        }

        $compare = $wpdb->prepare(
            "(total {$operator} CAST(%s AS DECIMAL(18,4)) OR (total = CAST(%s AS DECIMAL(18,4)) AND id {$operator} %d))", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $operator is a literal ">" or "<".
            (string) $total,
            (string) $total,
            $id
        );

        return $forward ? "(total IS NULL OR {$compare})" : "(total IS NOT NULL AND {$compare})";
    }

    /**
     * `$date $time` yerli anını UTC-yə çevirir. `$dayOffset` təqvim günü əlavə edir
     * (saat, DST keçidində belə, eyni "divar vaxtı" olaraq qalır — `to` üçün
     * ekvivalent üst sərhəd budur, sabit `23:59:59` deyil).
     */
    private function utc( string $date, string $time, int $dayOffset = 0 ): string
    {
        $moment = new DateTimeImmutable( $date . ' ' . $time, $this->zone );

        if ( 0 !== $dayOffset ) {
            $moment = $moment->modify( sprintf( '%+d day', $dayOffset ) );
        }

        return $moment->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
    }
}
