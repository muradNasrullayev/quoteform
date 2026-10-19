<?php

declare(strict_types=1);

namespace Quoteform\Entries;

// phpcs:disable WordPress.DB.DirectDatabaseQuery -- `qform_entries` is the plugin's own table: no WordPress API reads it, and entry lists must not come from a stale object cache.
// phpcs:disable PluginCheck.Security.DirectDB.UnescapedDBParameter -- every value reaches SQL through `$wpdb->prepare()` (here or in EntryQuery) or as a cast int.
/**
 * `qform_entries` üzərində yazma/oxuma. Bütün sorğular `$wpdb->insert()` və
 * `$wpdb->prepare()` iləndir (əsas spec §15). Vaxtlar GMT-də saxlanılır.
 */
final class EntryRepository
{
    /** "Filtrə uyğun hamısı" əməliyyatında bir UPDATE/DELETE-in ən çox sətri. */
    public const MATCH_CHUNK = 500;

    /**
     * @param array<string, mixed> $entry
     */
    public function insert( array $entry ): int
    {
        global $wpdb;

        $now = gmdate( 'Y-m-d H:i:s' );

        // `null` dəyərləri `$wpdb->insert()` NULL kimi yazır (WP 4.4+).
        $inserted = $wpdb->insert(
            EntriesTable::name(),
            [
                'form_id'    => (int) $entry['form_id'],
                'status'     => (string) $entry['status'],
                'total'      => self::formatTotal( $entry['total'] ),
                'currency'   => (string) $entry['currency'],
                'data'       => (string) wp_json_encode( $entry['data'] ),
                'breakdown'  => (string) wp_json_encode( $entry['breakdown'] ),
                'user_id'    => $entry['user_id'],
                'ip'         => $entry['ip'],
                'user_agent' => $entry['user_agent'],
                'created_at' => $now,
                'updated_at' => $now,
            ]
        );

        return $inserted ? (int) $wpdb->insert_id : 0;
    }

    /**
     * Total-ı DECIMAL(18,4) sütununa uyğun formatlaşdırır; dəyər sütun hədlərində deyilsə NULL qaytar (səhifə salınmasını qoruyan).
     *
     * @param mixed $total
     * @return string|null
     */
    private static function formatTotal( $total ): ?string
    {
        // DECIMAL(18,4) ən çox 14 tam rəqəm saxlayır; 99999999999999.9999 literalı double-da 1e14-ə yuvarlanır, ona görə sərhəd 1e14-dür.
        if ( null === $total || ! is_finite( $total ) || abs( $total ) >= 1e14 ) {
            return null;
        }

        return sprintf( '%.4F', $total );
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find( int $id ): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row(
            $wpdb->prepare( 'SELECT * FROM %i WHERE id = %d', EntriesTable::name(), $id ),
            ARRAY_A
        );

        return is_array( $row ) ? self::hydrate( $row ) : null;
    }

    /**
     * @return array<string, mixed>|null yalnız `completed` müraciət
     */
    public function findCompleted( int $id ): ?array
    {
        global $wpdb;

        $row = $wpdb->get_row(
            $wpdb->prepare( "SELECT * FROM %i WHERE id = %d AND status = 'completed'", EntriesTable::name(), $id ),
            ARRAY_A
        );

        return is_array( $row ) ? self::hydrate( $row ) : null;
    }

    /**
     * Siyahının bir səhifəsi. İstənən səhifə sondan böyükdürsə son səhifə qaytarılır:
     * son səhifədəki hər şey silinəndə istifadəçi boş "No entries match" yox, yeni son səhifəni görür.
     *
     * @return array{items: array<int, array<string, mixed>>, total: int, page: int, pages: int}
     */
    public function page( EntryQuery $query, int $page, int $perPage ): array
    {
        $result = $this->listing( $query, $page, $perPage );

        unset( $result['max_id'] );

        return $result;
    }

    /**
     * `page()` + `max_id`: bütün FİLTRDƏKİ (yalnız səhifədəki yox) ən böyük id. "Filtrə uyğun
     * hamısı" əməliyyatı onu `up_to_id` kimi geri göndərir ki, siyahı yükləndikdən sonra gələn
     * müraciətə toxunulmasın. Eyni COUNT sorğusunda hesablanır — əlavə sorğu yoxdur.
     *
     * @return array{items: array<int, array<string, mixed>>, total: int, page: int, pages: int, max_id: ?int}
     */
    public function listing( EntryQuery $query, int $page, int $perPage ): array
    {
        global $wpdb;

        $table   = EntriesTable::name();
        $where   = $query->where();
        $perPage = max( 1, min( 100, $perPage ) );
        $summary = $wpdb->get_row( "SELECT COUNT(*) AS total, MAX(id) AS max_id FROM {$table} {$where}", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery.
        $total   = is_array( $summary ) ? (int) $summary['total'] : 0;
        $maxId   = is_array( $summary ) && null !== $summary['max_id'] ? (int) $summary['max_id'] : null;
        $pages   = (int) ceil( $total / $perPage );
        $page    = max( 1, min( $page, max( 1, $pages ) ) );

        if ( 0 === $total ) {
            return [ 'items' => [], 'total' => 0, 'page' => 1, 'pages' => 0, 'max_id' => null ];
        }

        $rows = $wpdb->get_results(
            "SELECT * FROM {$table} {$where} " . $query->orderBy() . ' LIMIT ' . $perPage . ' OFFSET ' . ( ( $page - 1 ) * $perPage ), // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery; ints cast above.
            ARRAY_A
        );

        return [
            'items' => array_map( [ self::class, 'hydrate' ], is_array( $rows ) ? $rows : [] ),
            'total'  => $total,
            'page'   => $page,
            'pages'  => $pages,
            'max_id' => $maxId,
        ];
    }

    /**
     * Menyu nişanı və REST `unread` üçün YEGANƏ mənbə: `status_read` indeksi ilə bir COUNT.
     */
    public function countUnread(): int
    {
        global $wpdb;

        return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM %i WHERE status = 'completed' AND read_at IS NULL", EntriesTable::name() ) );
    }

    /**
     * @return int[]
     */
    public function formIdsWithEntries(): array
    {
        global $wpdb;

        return array_map( 'intval', $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT form_id FROM %i WHERE status = 'completed'", EntriesTable::name() ) ) );
    }

    /**
     * Keyset səhifələmə: `$after`-dən sonra (və ya əvvəl) gələn `$limit` müraciət, yaxından uzağa.
     *
     * @param array<string, mixed>|null $after hidratlanmış müraciət və ya siyahının başı üçün null
     * @return array<int, array<string, mixed>>
     */
    public function slice( EntryQuery $query, ?array $after, int $limit, bool $forward = true ): array
    {
        global $wpdb;

        $where = $query->where();

        if ( null !== $after ) {
            $where .= ' AND ' . $query->beyond( $after, $forward );
        }

        $rows = $wpdb->get_results(
            'SELECT * FROM ' . EntriesTable::name() . " {$where} " . $query->orderBy( ! $forward ) . ' LIMIT ' . max( 1, $limit ), // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery; limit is an int.
            ARRAY_A
        );

        return array_map( [ self::class, 'hydrate' ], is_array( $rows ) ? $rows : [] );
    }

    /**
     * @param array<string, mixed> $entry
     * @return array{previous: ?int, next: ?int}
     */
    public function neighbours( EntryQuery $query, array $entry ): array
    {
        $previous = $this->slice( $query, $entry, 1, false );
        $next     = $this->slice( $query, $entry, 1, true );

        return [
            'previous' => [] === $previous ? null : $previous[0]['id'],
            'next'     => [] === $next ? null : $next[0]['id'],
        ];
    }

    /**
     * Müraciət açılanda: `read_at` yalnız bir dəfə yazılır (spec §3.2).
     */
    public function markRead( int $id ): bool
    {
        global $wpdb;

        $changed = $wpdb->query(
            $wpdb->prepare(
                "UPDATE %i SET read_at = %s WHERE id = %d AND status = 'completed' AND read_at IS NULL",
                EntriesTable::name(),
                gmdate( 'Y-m-d H:i:s' ),
                $id
            )
        );

        return 1 === $changed;
    }

    /**
     * @param int[] $ids
     * @return int mövcud `completed` müraciətlərdən neçəsi indi istənən vəziyyətdədir
     */
    public function setRead( array $ids, bool $read ): int
    {
        global $wpdb;

        $in = self::idList( $ids );

        if ( '' === $in ) {
            return 0;
        }

        $table = EntriesTable::name();

        if ( $read ) {
            $wpdb->query( $wpdb->prepare( "UPDATE {$table} SET read_at = %s WHERE status = 'completed' AND read_at IS NULL AND id IN ({$in})", gmdate( 'Y-m-d H:i:s' ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- ids are ints.
        } else {
            $wpdb->query( "UPDATE {$table} SET read_at = NULL WHERE status = 'completed' AND read_at IS NOT NULL AND id IN ({$in})" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- ids are ints.
        }

        return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'completed' AND id IN ({$in})" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- ids are ints.
    }

    /**
     * @param int[] $ids
     * @return int həqiqətən silinən sətir sayı
     */
    public function delete( array $ids ): int
    {
        global $wpdb;

        $in = self::idList( $ids );

        if ( '' === $in ) {
            return 0;
        }

        return (int) $wpdb->query( 'DELETE FROM ' . EntriesTable::name() . " WHERE status = 'completed' AND id IN ({$in})" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- ids are ints.
    }

    /**
     * Filtrə uyğun və `id <= $upToId` olan `completed` müraciətlərin sayı. "Filtrə uyğun hamısı"
     * əməliyyatı bunu istifadəçinin gördüyü `total` ilə tutuşdurur: fərq varsa siyahı dəyişib.
     */
    public function countMatching( EntryQuery $query, int $upToId ): int
    {
        global $wpdb;

        return (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . EntriesTable::name() . ' ' . self::matchingWhere( $query, $upToId ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery; int cast.
    }

    /**
     * Filtrə uyğun və `id <= $upToId` olan bütün müraciətləri hissə-hissə oxunmuş/oxunmamış edir.
     *
     * @return int filtrə uyğun `completed` müraciətlərdən neçəsi indi istənən vəziyyətdədir
     *             (artıq həmin vəziyyətdə olanlar da — D7). Hissələr id üzrə keyset ilə seçilir,
     *             ona görə "New" filtrində oxunub filtrdən çıxan sətirlər sayı pozmur.
     */
    public function setReadMatching( EntryQuery $query, int $upToId, bool $read ): int
    {
        global $wpdb;

        $table = EntriesTable::name();
        $where = self::matchingWhere( $query, $upToId );
        $set   = $read ? $wpdb->prepare( 'read_at = %s', gmdate( 'Y-m-d H:i:s' ) ) . ' ' : 'read_at = NULL ';
        $state = $read ? 'read_at IS NULL' : 'read_at IS NOT NULL';

        return $this->eachMatchingChunk( $query, $upToId, static function ( string $in ) use ( $wpdb, $table, $where, $set, $state ): void {
            $wpdb->query( "UPDATE {$table} SET {$set}{$where} AND {$state} AND id IN ({$in})" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- fragments prepared separately; ids are ints.
        } );
    }

    /**
     * Filtrə uyğun və `id <= $upToId` olan bütün müraciətləri hissə-hissə silir.
     *
     * @return int həqiqətən silinən sətir sayı
     */
    public function deleteMatching( EntryQuery $query, int $upToId ): int
    {
        global $wpdb;

        $table    = EntriesTable::name();
        $where    = self::matchingWhere( $query, $upToId );
        $affected = 0;

        $this->eachMatchingChunk( $query, $upToId, static function ( string $in ) use ( $wpdb, $table, $where, &$affected ): void {
            // Filtr DELETE-də də təkrarlanır: seçimlə silmə arasında dəyişən sətir (məs. oxunan) toxunulmaz qalır.
            $affected += (int) $wpdb->query( "DELETE FROM {$table} {$where} AND id IN ({$in})" ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery; ids are ints.
        } );

        return $affected;
    }

    /**
     * Filtrə uyğun id-ləri id üzrə keyset ilə MATCH_CHUNK-luq hissələrə bölüb `$apply`-a verir:
     * ~100k sətirlik filtr bir nəhəng UPDATE/DELETE ilə cədvəli uzun müddət kilidləmir.
     *
     * @param callable(string): void $apply vergüllə ayrılmış int id siyahısı alır
     * @return int seçilən id-lərin cəmi
     */
    private function eachMatchingChunk( EntryQuery $query, int $upToId, callable $apply ): int
    {
        global $wpdb;

        $table = EntriesTable::name();
        $where = self::matchingWhere( $query, $upToId );
        $after = 0;
        $seen  = 0;

        while ( true ) {
            $ids = array_map(
                'intval',
                $wpdb->get_col( "SELECT id FROM {$table} {$where} AND id > " . (int) $after . ' ORDER BY id ASC LIMIT ' . self::MATCH_CHUNK ) // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- prepared by EntryQuery; ints cast.
            );

            if ( [] === $ids ) {
                break;
            }

            $apply( self::idList( $ids ) );
            $seen += count( $ids );
            $after = max( $ids );
        }

        return $seen;
    }

    private static function matchingWhere( EntryQuery $query, int $upToId ): string
    {
        // `where()` artıq `status = 'completed'` daxil edir; üst sərhəd int-ə çevrilib əlavə olunur.
        return $query->where() . ' AND id <= ' . max( 0, $upToId );
    }

    /**
     * @param int[] $ids
     */
    private static function idList( array $ids ): string
    {
        $clean = array_values( array_unique( array_filter( array_map( 'intval', $ids ), static function ( int $id ): bool {
            return $id > 0;
        } ) ) );

        return implode( ',', $clean );
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function hydrate( array $row ): array
    {
        $data      = json_decode( (string) $row['data'], true );
        $breakdown = json_decode( (string) ( $row['breakdown'] ?? '' ), true );

        return [
            'id'         => (int) $row['id'],
            'form_id'    => (int) $row['form_id'],
            'status'     => (string) $row['status'],
            'total'         => null === $row['total'] ? null : (float) $row['total'],
            // DB-nin öz onluq sətri — float-dan keçmir (18 rəqəm double-a sığmır).
            'total_decimal' => null === $row['total'] ? null : (string) $row['total'],
            'currency'   => (string) $row['currency'],
            'data'       => is_array( $data ) ? $data : [],
            'breakdown'  => is_array( $breakdown ) ? $breakdown : [],
            'user_id'    => null === $row['user_id'] ? null : (int) $row['user_id'],
            'ip'         => $row['ip'],
            'user_agent' => $row['user_agent'],
            'read_at'    => $row['read_at'],
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }
}
